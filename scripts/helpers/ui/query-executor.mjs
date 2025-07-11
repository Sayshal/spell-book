import { log } from '../../logger.mjs';

/**
 * Executes parsed queries against spell data
 * Supports only AND operations between field conditions
 */
export class QueryExecutor {
  /**
   * Execute parsed query against spells
   * @param {Object} queryObject - Parsed query object
   * @param {Array} spells - Array of spells to filter
   * @returns {Array} Filtered spells
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
   * Evaluate all conditions against a spell (AND logic)
   * @param {Array} conditions - Array of field conditions
   * @param {Object} spell - Spell to evaluate against
   * @returns {boolean} Whether the spell matches all conditions
   * @private
   */
  _evaluateSpell(conditions, spell) {
    return conditions.every((condition) => this._evaluateCondition(condition, spell));
  }

  /**
   * Evaluate single field condition
   * @param {Object} condition - Field condition
   * @param {Object} spell - Spell to evaluate
   * @returns {boolean} Whether the spell matches the condition
   * @private
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
        return this._evaluateCondition(value, spell);
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
   * Evaluate casting time criteria
   * @param {string} value - Expected casting time
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether casting time matches
   * @private
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
   * Evaluate range criteria
   * @param {string} value - Expected range
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether range matches
   * @private
   */
  _evaluateRange(value, spell) {
    const rangeValue = parseInt(value);
    if (!isNaN(rangeValue)) return true;
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
   * Evaluate damage type criteria
   * @param {string} value - Expected damage types (comma-separated)
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether any damage type matches
   * @private
   */
  _evaluateDamageType(value, spell) {
    const expectedTypes = value.split(',').map((t) => t.trim().toLowerCase());
    const spellDamageTypes = spell.filterData?.damageTypes || [];
    return expectedTypes.some((expectedType) => spellDamageTypes.some((spellType) => spellType.toLowerCase() === expectedType));
  }

  /**
   * Evaluate condition criteria
   * @param {string} value - Expected conditions (comma-separated)
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether any condition matches
   * @private
   */
  _evaluateCondition(value, spell) {
    const expectedConditions = value.split(',').map((c) => c.trim().toLowerCase());
    const spellConditions = spell.filterData?.conditions || [];
    return expectedConditions.some((expectedCondition) => spellConditions.some((spellCondition) => spellCondition.toLowerCase() === expectedCondition));
  }

  /**
   * Evaluate requires save criteria
   * @param {string} value - Expected save requirement (true/false)
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether save requirement matches
   * @private
   */
  _evaluateRequiresSave(value, spell) {
    const expectedSave = value === 'true';
    const spellRequiresSave = spell.filterData?.requiresSave || false;
    return expectedSave === spellRequiresSave;
  }

  /**
   * Evaluate concentration criteria
   * @param {string} value - Expected concentration requirement (true/false)
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether concentration requirement matches
   * @private
   */
  _evaluateConcentration(value, spell) {
    const expectedConcentration = value === 'true';
    const requiresConcentration = !!(spell.filterData?.concentration || spell.system?.properties?.concentration);
    return expectedConcentration === requiresConcentration;
  }

  /**
   * Evaluate prepared criteria
   * @param {string} value - Expected preparation status (true/false)
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether preparation status matches
   * @private
   */
  _evaluatePrepared(value, spell) {
    const expectedPrepared = value === 'true';
    const isPrepared = !!(spell.system?.preparation?.prepared || spell.prepared);
    return expectedPrepared === isPrepared;
  }

  /**
   * Evaluate ritual criteria
   * @param {string} value - Expected ritual capability (true/false)
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether ritual capability matches
   * @private
   */
  _evaluateRitual(value, spell) {
    const expectedRitual = value === 'true';
    const isRitual = !!(spell.filterData?.ritual || spell.system?.properties?.ritual);
    return expectedRitual === isRitual;
  }

  /**
   * Evaluate material components criteria
   * @param {string} value - Expected material component status
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether material component status matches
   * @private
   */
  _evaluateMaterialComponents(value, spell) {
    const expectedConsumed = value.toLowerCase() === 'consumed';
    const materialComponents = spell.filterData?.materialComponents || {};
    const isConsumed = !!materialComponents.consumed;
    return expectedConsumed === isConsumed;
  }
}
