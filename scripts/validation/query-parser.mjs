/**
 * Advanced Search Query Parser
 *
 * Parses advanced search query syntax into executable query objects. This module provides
 * the parsing logic for field-based search queries, supporting field aliases, value
 * validation, and query normalization for the advanced search system.
 *
 * Supported Syntax:
 * - Field:Value expressions (e.g., "level:3", "school:evocation")
 * - AND operations between field conditions
 * - Field alias resolution and value normalization
 * - Boolean value standardization
 *
 * @module ValidationHelpers/QueryParser
 * @author Tyler
 */

import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Field definitions class instance for field validation and mapping.
 *
 * @typedef {Object} FieldDefinitionsType
 * @property {function(string): string|null} getFieldId - Get field ID from alias
 * @property {function(string, string): boolean} validateValue - Validate field value
 * @property {function(string): string} normalizeBooleanValue - Normalize boolean values
 */

/**
 * Parsed query structure ready for execution.
 *
 * @typedef {Object} ParsedQueryObject
 * @property {string} type - Query type ('conjunction' for AND operations)
 * @property {Array<ParsedFieldCondition>} conditions - Array of field conditions
 */

/**
 * Individual parsed field condition.
 *
 * @typedef {Object} ParsedFieldCondition
 * @property {string} type - Condition type ('field')
 * @property {string} field - Normalized field identifier
 * @property {string} value - Normalized field value
 */

/**
 * Parser for advanced search query syntax.
 * Supports only FIELD:VALUE syntax with AND operations for simplicity and performance.
 */
export class QueryParser {
  /**
   * Create a new QueryParser instance with field definitions for parsing search queries.
   * The field definitions provide alias resolution and value validation capabilities.
   *
   * @param {FieldDefinitionsType} fieldDefinitions - The field definitions to use for parsing
   */
  constructor(fieldDefinitions) {
    /** @type {FieldDefinitionsType} */
    this.fieldDefinitions = fieldDefinitions;
  }

  /**
   * Parse advanced search query into executable query object.
   * Converts search syntax into structured query conditions.
   *
   * @param {string} query - The query string (without ^ trigger character)
   * @returns {ParsedQueryObject|null} Parsed query object or null if invalid
   */
  parseQuery(query) {
    try {
      if (!query || !query.trim()) return null;
      const conditions = this._parseConditions(query.trim());
      if (!conditions || conditions.length === 0) return null;
      const parsed = { type: 'conjunction', conditions: conditions };
      log(3, 'Query parsed successfully:', parsed);
      return parsed;
    } catch (error) {
      log(2, 'Query parsing failed:', error);
      return null;
    }
  }

  /**
   * Parse query into field conditions using AND logic.
   * Splits query on 'and' keywords and processes each field expression.
   *
   * @private
   * @param {string} query - The query string to parse
   * @returns {Array<ParsedFieldCondition>} Array of parsed field condition objects
   */
  _parseConditions(query) {
    const conditions = [];
    const parts = query.split(/\s+and\s+/i);
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;
      const fieldCondition = this._parseFieldExpression(trimmedPart);
      if (fieldCondition) conditions.push(fieldCondition);
    }
    return conditions;
  }

  /**
   * Parse field:value expression into condition object.
   * Handles field alias resolution, value validation, and normalization.
   *
   * @private
   * @param {string} expression - The field:value expression to parse
   * @returns {ParsedFieldCondition|null} Parsed field condition or null if invalid
   */
  _parseFieldExpression(expression) {
    const colonIndex = expression.indexOf(':');
    if (colonIndex === -1) return null;
    const fieldAlias = expression.substring(0, colonIndex).trim().toUpperCase();
    const value = expression.substring(colonIndex + 1).trim();
    const fieldId = this.fieldDefinitions.getFieldId(fieldAlias);
    if (!fieldId) return null;
    if (!value || value === '') return null;
    if (fieldId === 'range' && value.match(/^\d+-?$/)) log(3, `Partial range value detected: ${value}`);
    else if (!this.fieldDefinitions.validateValue(fieldId, value)) return null;
    return { type: 'field', field: fieldId, value: this._normalizeValue(fieldId, value) };
  }

  /**
   * Normalize field values for consistent comparison.
   * Handles field-specific value normalization and standardization.
   *
   * @private
   * @param {string} fieldId - The field ID for normalization context
   * @param {string} value - The raw value to normalize
   * @returns {string} Normalized value ready for comparison
   */
  _normalizeValue(fieldId, value) {
    if (['requiresSave', 'concentration', 'prepared', 'ritual'].includes(fieldId)) return this.fieldDefinitions.normalizeBooleanValue(value);
    if (fieldId === 'school') {
      const normalizedValue = value.toLowerCase();
      const schoolKeys = Object.keys(CONFIG.DND5E.spellSchools || {});
      if (schoolKeys.includes(normalizedValue)) return normalizedValue;
      for (const [key, school] of Object.entries(CONFIG.DND5E.spellSchools || {})) {
        const schoolLabel = DataHelpers.getConfigLabel(CONFIG.DND5E.spellSchools, key);
        if (school.fullKey === normalizedValue || schoolLabel?.toLowerCase() === normalizedValue) return key;
      }
      return normalizedValue;
    }
    if (['damageType', 'condition'].includes(fieldId) && value.includes(',')) {
      return value
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .join(',');
    }
    if (fieldId === 'castingTime' && value.includes(':')) {
      const parts = value.split(':');
      return `${parts[0].toLowerCase()}:${parts[1] || '1'}`;
    }
    return value.toLowerCase();
  }
}
