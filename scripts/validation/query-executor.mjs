/**
 * Advanced Search Query Execution Engine
 *
 * Executes parsed search queries against spell data collections. This module provides
 * the runtime evaluation system for advanced search functionality, supporting field-based
 * filtering with complex criteria and validation logic.
 *
 * The query executor supports:
 * - Conjunction (AND) operations between field conditions
 * - Complex field-specific evaluation logic
 * - Type-safe spell property access and comparison
 * - Error handling and fallback behavior
 *
 * @module ValidationHelpers/QueryExecutor
 * @author Tyler
 */

import { log } from '../logger.mjs';

/**
 * Parsed query object structure for execution.
 *
 * @typedef {Object} ParsedQuery
 * @property {string} type - Query type (currently only 'conjunction' supported)
 * @property {Array<FieldCondition>} conditions - Array of field conditions to evaluate
 */

/**
 * Individual field condition within a query.
 *
 * @typedef {Object} FieldCondition
 * @property {string} type - Condition type (should be 'field')
 * @property {string} field - Field identifier to evaluate against
 * @property {string} value - Expected value for the field condition
 */

/**
 * Spell data structure for query evaluation.
 *
 * @typedef {Object} SpellData
 * @property {string} name - Spell name for text searching
 * @property {number} level - Spell level (0-9)
 * @property {string} school - Spell school identifier
 * @property {Object} [system] - D&D 5e system data for the spell
 * @property {Object} [filterData] - Pre-processed filter data for performance
 * @property {boolean} [prepared] - Whether the spell is prepared (for actors)
 */

/**
 * Executes parsed queries against spell data.
 */
export class QueryExecutor {
  /**
   * Execute parsed query against spells collection.
   * @param {ParsedQuery} queryObject - Parsed query object from QueryParser
   * @param {Array<SpellData>} spells - Array of spell data to filter
   * @returns {Array<SpellData>} Filtered spells that match all query conditions
   */
  executeQuery(queryObject, spells) {
    if (!queryObject || !spells || queryObject.type !== 'conjunction') return spells;
    try {
      return spells.filter((spell) => this._evaluateSpell(queryObject.conditions, spell));
    } catch (error) {
      log(2, 'Query execution failed:', error);
      return [];
    }
  }

  /**
   * Evaluate all conditions against a spell using AND logic.
   * @private
   * @param {Array<FieldCondition>} conditions - Array of field conditions to evaluate
   * @param {SpellData} spell - Spell data to evaluate against
   * @returns {boolean} Whether the spell matches all conditions
   */
  _evaluateSpell(conditions, spell) {
    return conditions.every((condition) => this._evaluateCondition(condition, spell));
  }

  /**
   * Evaluate single field condition against a spell.
   * @private
   * @param {FieldCondition} condition - Field condition to evaluate
   * @param {SpellData} spell - Spell data to evaluate
   * @returns {boolean} Whether the spell matches the condition
   */
  _evaluateCondition(condition, spell) {
    if (condition.type !== 'field') return false;
    const { field, value } = condition;
    switch (field) {
      case 'name':
        return spell.name.toLowerCase().includes(value.toLowerCase());
      case 'level':
        return spell.level === parseInt(value);
      case 'school':
        return spell.school?.toLowerCase() === value.toLowerCase();
      case 'castingTime':
        return this._evaluateCastingTime(value, spell);
      case 'range':
        return this._evaluateRange(value, spell);
      case 'damageType':
        return this._evaluateDamageType(value, spell);
      case 'condition':
        return this._evaluateConditionProperty(value, spell);
      case 'requiresSave':
        return this._evaluateRequiresSave(value, spell);
      case 'concentration':
        return this._evaluateConcentration(value, spell);
      case 'prepared':
        return this._evaluatePrepared(value, spell);
      case 'ritual':
        return this._evaluateRitual(value, spell);
      case 'materialComponents':
        return this._evaluateMaterialComponents(value, spell);
      default:
        log(1, 'Unknown field:', field);
        return false;
    }
  }

  /**
   * Evaluate casting time criteria against spell data.
   * @private
   * @param {string} value - Expected casting time in "type:value" format
   * @param {SpellData} spell - Spell data to check
   * @returns {boolean} Whether casting time matches the criteria
   */
  _evaluateCastingTime(value, spell) {
    const parts = value.split(':');
    const expectedType = parts[0];
    const expectedValue = parts[1] || '1';
    const spellType = spell.filterData?.castingTime?.type || spell.system?.activation?.type || '';
    const spellValue = String(spell.filterData?.castingTime?.value || spell.system?.activation?.value || '1');
    return spellType.toLowerCase() === expectedType && spellValue === expectedValue;
  }

  /**
   * Evaluate range criteria against spell data.
   * @private
   * @param {string} value - Expected range value or type
   * @param {SpellData} spell - Spell data to check
   * @returns {boolean} Whether range matches the criteria
   */
  _evaluateRange(value, spell) {
    const searchRangeValue = parseInt(value);
    if (!isNaN(searchRangeValue)) {
      const spellRange = spell.system?.range?.value;
      if (typeof spellRange === 'number') return spellRange === searchRangeValue;
      return false;
    }
    const spellRangeUnits = spell.filterData?.range?.units || spell.system?.range?.units || '';
    const normalizedSpellRange = spellRangeUnits.toLowerCase();
    const normalizedSearchRange = value.toLowerCase();
    if (normalizedSpellRange === normalizedSearchRange) return true;
    const validRangeTypes = Object.keys(CONFIG.DND5E.rangeTypes || {});
    if (validRangeTypes.includes(normalizedSearchRange)) return normalizedSpellRange === normalizedSearchRange;
    const specialRanges = ['sight', 'unlimited'];
    if (specialRanges.includes(normalizedSearchRange)) return normalizedSpellRange.includes(normalizedSearchRange);
    return false;
  }

  /**
   * Evaluate damage type criteria against spell data.
   * @private
   * @param {string} value - Expected damage types (comma-separated)
   * @param {SpellData} spell - Spell data to check
   * @returns {boolean} Whether any damage type matches
   */
  _evaluateDamageType(value, spell) {
    const expectedTypes = value.split(',').map((t) => t.trim().toLowerCase());
    const spellDamageTypes = spell.filterData?.damageTypes || [];
    return expectedTypes.some((expectedType) => spellDamageTypes.some((spellType) => spellType.toLowerCase() === expectedType));
  }

  /**
   * Evaluate condition criteria against spell data.
   * @private
   * @param {string} value - Expected conditions (comma-separated)
   * @param {SpellData} spell - Spell data to check
   * @returns {boolean} Whether any condition matches
   */
  _evaluateConditionProperty(value, spell) {
    const expectedConditions = value.split(',').map((c) => c.trim().toLowerCase());
    const spellConditions = spell.filterData?.conditions || [];
    return expectedConditions.some((expectedCondition) => spellConditions.some((spellCondition) => spellCondition.toLowerCase() === expectedCondition));
  }

  /**
   * Evaluate requires save criteria against spell data.
   * @private
   * @param {string} value - Expected save requirement ('true' or 'false')
   * @param {SpellData} spell - Spell data to check
   * @returns {boolean} Whether save requirement matches
   */
  _evaluateRequiresSave(value, spell) {
    const expectedSave = value === 'true';
    const spellRequiresSave = spell.filterData?.requiresSave || false;
    return expectedSave === spellRequiresSave;
  }

  /**
   * Evaluate concentration criteria against spell data.
   * @private
   * @param {string} value - Expected concentration requirement ('true' or 'false')
   * @param {SpellData} spell - Spell data to check
   * @returns {boolean} Whether concentration requirement matches
   */
  _evaluateConcentration(value, spell) {
    const expectedConcentration = value === 'true';
    const requiresConcentration = !!(spell.filterData?.concentration || spell.system?.properties?.concentration);
    return expectedConcentration === requiresConcentration;
  }

  /**
   * Evaluate prepared criteria against spell data.
   * @private
   * @param {string} value - Expected preparation status ('true' or 'false')
   * @param {SpellData} spell - Spell data to check
   * @returns {boolean} Whether preparation status matches
   */
  _evaluatePrepared(value, spell) {
    const expectedPrepared = value === 'true';
    const isPrepared = !!(spell.system?.preparation?.prepared || spell.prepared);
    return expectedPrepared === isPrepared;
  }

  /**
   * Evaluate ritual criteria against spell data.
   * @private
   * @param {string} value - Expected ritual capability ('true' or 'false')
   * @param {SpellData} spell - Spell data to check
   * @returns {boolean} Whether ritual capability matches
   */
  _evaluateRitual(value, spell) {
    const expectedRitual = value === 'true';
    const isRitual = !!(spell.filterData?.ritual || spell.system?.properties?.ritual);
    return expectedRitual === isRitual;
  }

  /**
   * Evaluate material components criteria against spell data.
   * @private
   * @param {string} value - Expected material component status ('consumed' or 'notconsumed')
   * @param {SpellData} spell - Spell data to check
   * @returns {boolean} Whether material component status matches
   */
  _evaluateMaterialComponents(value, spell) {
    const expectedConsumed = value.toLowerCase() === 'consumed';
    const materialComponents = spell.filterData?.materialComponents || {};
    const isConsumed = !!materialComponents.consumed;
    return expectedConsumed === isConsumed;
  }
}
