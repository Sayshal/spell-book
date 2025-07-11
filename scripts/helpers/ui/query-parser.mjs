import { log } from '../../logger.mjs';
import * as genericUtils from '../generic-utils.mjs';

/**
 * Parser for advanced search query syntax
 * Supports only FIELD:VALUE syntax with AND operations
 */
export class QueryParser {
  constructor(fieldDefinitions) {
    this.fieldDefinitions = fieldDefinitions;
  }

  /**
   * Parse advanced search query
   * @param {string} query - The query string (without ^ trigger)
   * @returns {Object|null} Parsed query object or null if invalid
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
   * Parse query into field conditions
   * @param {string} query - The query string
   * @returns {Array} Array of field condition objects
   * @private
   */
  _parseConditions(query) {
    const conditions = [];
    const parts = query.split(/\s+AND\s+/i);
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;
      const fieldCondition = this._parseFieldExpression(trimmedPart);
      if (fieldCondition) conditions.push(fieldCondition);
    }
    return conditions;
  }

  /**
   * Parse field:value expression
   * @param {string} expression - The field:value expression
   * @returns {Object|null} Parsed field condition or null if invalid
   * @private
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
   * Normalize field values
   * @param {string} fieldId - The field ID
   * @param {string} value - The raw value
   * @returns {string} Normalized value
   * @private
   */
  _normalizeValue(fieldId, value) {
    if (['requiresSave', 'concentration', 'prepared', 'ritual'].includes(fieldId)) return this.fieldDefinitions.normalizeBooleanValue(value);
    if (fieldId === 'school') {
      const normalizedValue = value.toLowerCase();
      const schoolKeys = Object.keys(CONFIG.DND5E.spellSchools || {});
      if (schoolKeys.includes(normalizedValue)) return normalizedValue;
      for (const [key, school] of Object.entries(CONFIG.DND5E.spellSchools || {})) {
        const schoolLabel = genericUtils.getConfigLabel(CONFIG.DND5E.spellSchools, key);
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
