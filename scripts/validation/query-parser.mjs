/**
 * Advanced Search Query Parser
 *
 * Parses advanced search query syntax into executable query objects. This module provides
 * the parsing logic for field-based search queries, supporting field aliases, value
 * validation, and query normalization for the advanced search system.
 *
 * @module ValidationUtils/QueryParser
 * @author Tyler
 */

import * as DataUtils from '../data/_module.mjs';

/**
 * Parser for advanced search query syntax.
 */
export class QueryParser {
  /**
   * Create a new QueryParser instance with field definitions for parsing search queries.
   * @param {Object} fieldDefinitions - The field definitions to use for parsing
   */
  constructor(fieldDefinitions) {
    this.fieldDefinitions = fieldDefinitions;
  }

  /**
   * Parse advanced search query into executable query object.
   * @param {string} query - The query string (without ^ trigger character)
   * @returns {Object|null} Parsed query object or null if invalid
   */
  parseQuery(query) {
    if (!query || !query.trim()) return null;
    const conditions = this._parseConditions(query.trim());
    if (!conditions || conditions.length === 0) return null;
    const parsed = { type: 'conjunction', conditions: conditions };
    return parsed;
  }

  /**
   * Parse query into field conditions using AND logic.
   * @private
   * @param {string} query - The query string to parse
   * @returns {Array<Object>} Array of parsed field condition objects
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
   * @private
   * @param {string} expression - The field:value expression to parse
   * @todo [5.2.X] Use foundry.utils.formatIdentifier() when available in public API
   * @returns {Object|null} Parsed field condition or null if invalid
   */
  _parseFieldExpression(expression) {
    const colonIndex = expression.indexOf(':');
    if (colonIndex === -1) return null;
    const fieldAlias = expression.substring(0, colonIndex).trim().toUpperCase();
    const value = expression.substring(colonIndex + 1).trim();
    const fieldId = this.fieldDefinitions.getFieldId(fieldAlias);
    if (!fieldId) return null;
    if (!value || value === '') return null;
    else if (!this.fieldDefinitions.validateValue(fieldId, value)) return null;
    return { type: 'field', field: fieldId, value: this._normalizeValue(fieldId, value) };
  }

  /**
   * Normalize field values for consistent comparison.
   * @private
   * @param {string} fieldId - The field ID for normalization context
   * @param {string} value - The raw value to normalize
   * @returns {string} Normalized value ready for comparison
   */
  _normalizeValue(fieldId, value) {
    if (['requiresSave', 'concentration', 'prepared', 'ritual'].includes(fieldId)) return this.fieldDefinitions.normalizeBooleanValue(value);
    if (fieldId === 'school') {
      const normalizedValue = value.toLowerCase();
      const spellSchools = foundry.utils.getProperty(CONFIG, 'DND5E.spellSchools') ?? {};
      const schoolKeys = Object.keys(spellSchools);
      if (schoolKeys.includes(normalizedValue)) return normalizedValue;
      for (const [key, school] of Object.entries(spellSchools)) {
        const schoolLabel = DataUtils.getConfigLabel(spellSchools, key);
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
