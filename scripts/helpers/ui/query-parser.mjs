import { log } from '../../logger.mjs';

/**
 * Parser for advanced search query syntax
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
      const tokens = this._tokenize(query.trim());
      if (!tokens || tokens.length === 0) return null;
      const parsed = this._parseExpression(tokens);
      log(3, 'Query parsed successfully:', parsed);
      return parsed;
    } catch (error) {
      log(2, 'Query parsing failed:', error);
      return null;
    }
  }

  /**
   * Tokenize the query string
   * @param {string} query - The query string
   * @returns {Array} Array of tokens
   * @private
   */
  _tokenize(query) {
    const tokens = [];
    const regex = /([A-Z]+:[^(\s)]*(?:\([^)]*\))?|\(|\)|AND|OR|NOT|\w+)/gi;
    let match;
    while ((match = regex.exec(query)) !== null) tokens.push(match[0].trim());
    return tokens;
  }

  /**
   * Parse expression with Boolean operators
   * @param {Array} tokens - Array of tokens
   * @returns {Object} Parsed expression tree
   * @private
   */
  _parseExpression(tokens) {
    return this._parseOrExpression(tokens);
  }

  /**
   * Parse OR expressions (lowest precedence)
   * @param {Array} tokens - Array of tokens
   * @returns {Object} Parsed expression
   * @private
   */
  _parseOrExpression(tokens) {
    let left = this._parseAndExpression(tokens);
    while (tokens.length > 0 && tokens[0].toUpperCase() === 'OR') {
      tokens.shift();
      const right = this._parseAndExpression(tokens);
      left = { type: 'boolean', operator: 'OR', left: left, right: right };
    }
    return left;
  }

  /**
   * Parse AND expressions (medium precedence)
   * @param {Array} tokens - Array of tokens
   * @returns {Object} Parsed expression
   * @private
   */
  _parseAndExpression(tokens) {
    let left = this._parseNotExpression(tokens);
    while (tokens.length > 0 && (tokens[0].toUpperCase() === 'AND' || this._isFieldOrParenthesis(tokens[0]))) {
      if (tokens[0].toUpperCase() === 'AND') tokens.shift();
      const right = this._parseNotExpression(tokens);
      left = { type: 'boolean', operator: 'AND', left: left, right: right };
    }
    return left;
  }

  /**
   * Parse NOT expressions (highest precedence)
   * @param {Array} tokens - Array of tokens
   * @returns {Object} Parsed expression
   * @private
   */
  _parseNotExpression(tokens) {
    if (tokens.length > 0 && tokens[0].toUpperCase() === 'NOT') {
      tokens.shift();
      const expression = this._parsePrimaryExpression(tokens);
      return { type: 'boolean', operator: 'NOT', operand: expression };
    }
    return this._parsePrimaryExpression(tokens);
  }

  /**
   * Parse primary expressions (fields and parentheses)
   * @param {Array} tokens - Array of tokens
   * @returns {Object} Parsed expression
   * @private
   */
  _parsePrimaryExpression(tokens) {
    if (tokens.length === 0) throw new Error('Unexpected end of query');
    const token = tokens.shift();
    if (token === '(') {
      const expression = this._parseExpression(tokens);
      if (tokens.length === 0 || tokens.shift() !== ')') throw new Error('Missing closing parenthesis');
      return expression;
    }
    if (token.includes(':')) return this._parseFieldExpression(token);
    const fieldId = this.fieldDefinitions.getFieldId(token.toUpperCase());
    if (fieldId) throw new Error(`Incomplete field expression: ${token.toUpperCase()} (missing value after colon)`);
    throw new Error(`Unexpected token: ${token}`);
  }

  /**
   * Parse field:value expression
   * @param {string} token - The field:value token
   * @returns {Object} Parsed field expression
   * @private
   */
  _parseFieldExpression(token) {
    const parts = token.split(':');
    if (parts.length < 2) throw new Error(`Invalid field expression: ${token}`);
    const fieldAlias = parts[0].toUpperCase();
    const fieldId = this.fieldDefinitions.getFieldId(fieldAlias);
    if (!fieldId) throw new Error(`Unknown field: ${fieldAlias}`);
    const value = parts.slice(1).join(':');
    if (!value || value.trim() === '') {
      log(3, `Missing value for field ${fieldAlias} (enter a value after the colon)`);
      return { type: 'field', field: fieldId, value: this._normalizeValue(fieldId, value) };
    }
    if (fieldId === 'range' && value.match(/^\d+$/)) log(3, `Partial range value detected: ${value}`);
    else if (!this.fieldDefinitions.validateValue(fieldId, value)) throw new Error(`Invalid value for field ${fieldAlias}: ${value}`);
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
        if (school.fullKey === normalizedValue || school.label?.toLowerCase() === normalizedValue) return key;
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

  /**
   * Check if token is a field expression or opening parenthesis
   * @param {string} token - The token to check
   * @returns {boolean} Whether it's a field or parenthesis
   * @private
   */
  _isFieldOrParenthesis(token) {
    return token.includes(':') || token === '(';
  }
}
