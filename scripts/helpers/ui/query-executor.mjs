import { log } from '../../logger.mjs';

/**
 * Executes parsed queries against spell data
 */
export class QueryExecutor {
  constructor() {}

  /**
   * Execute parsed query against spells
   * @param {Object} queryTree - Parsed query tree
   * @param {Array} spells - Array of spells to filter
   * @returns {Array} Filtered spells
   */
  executeQuery(queryTree, spells) {
    if (!queryTree || !spells) return spells;

    try {
      return spells.filter((spell) => this._evaluateExpression(queryTree, spell));
    } catch (error) {
      log(2, 'Query execution failed:', error);
      return [];
    }
  }

  /**
   * Evaluate expression against a spell
   * @param {Object} expression - Expression tree node
   * @param {Object} spell - Spell to evaluate against
   * @returns {boolean} Whether the spell matches the expression
   * @private
   */
  _evaluateExpression(expression, spell) {
    switch (expression.type) {
      case 'field':
        return this._evaluateField(expression, spell);
      case 'boolean':
        return this._evaluateBoolean(expression, spell);
      default:
        log(2, 'Unknown expression type:', expression.type);
        return false;
    }
  }

  /**
   * Evaluate field expression
   * @param {Object} fieldExpr - Field expression
   * @param {Object} spell - Spell to evaluate
   * @returns {boolean} Whether the spell matches the field criteria
   * @private
   */
  _evaluateField(fieldExpr, spell) {
    const { field, value } = fieldExpr;

    switch (field) {
      case 'name':
        return spell.name.toLowerCase().includes(value.toLowerCase());

      case 'level':
        return spell.level === parseInt(value);

      case 'school':
        return spell.school === value.toLowerCase();

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

      case 'materialComponents':
        return this._evaluateMaterialComponents(value, spell);

      case 'prepared':
        return this._evaluatePrepared(value, spell);

      case 'ritual':
        return this._evaluateRitual(value, spell);

      default:
        log(2, 'Unknown field:', field);
        return false;
    }
  }

  /**
   * Evaluate Boolean expression
   * @param {Object} boolExpr - Boolean expression
   * @param {Object} spell - Spell to evaluate
   * @returns {boolean} Result of Boolean evaluation
   * @private
   */
  _evaluateBoolean(boolExpr, spell) {
    const { operator } = boolExpr;

    switch (operator) {
      case 'AND':
        return this._evaluateExpression(boolExpr.left, spell) && this._evaluateExpression(boolExpr.right, spell);

      case 'OR':
        return this._evaluateExpression(boolExpr.left, spell) || this._evaluateExpression(boolExpr.right, spell);

      case 'NOT':
        return !this._evaluateExpression(boolExpr.operand, spell);

      default:
        log(2, 'Unknown Boolean operator:', operator);
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
    if (!isNaN(rangeValue)) {
      // For numeric ranges, we could implement distance comparison here
      // For now, just return true as placeholder
      return true;
    }

    // Check against spell's range units using CONFIG.DND5E.rangeTypes
    const spellRangeUnits = spell.filterData?.range?.units || spell.system?.range?.units || '';
    const normalizedSpellRange = spellRangeUnits.toLowerCase();
    const normalizedSearchRange = value.toLowerCase();

    // Direct match
    if (normalizedSpellRange === normalizedSearchRange) return true;

    // Check if the search range is a valid range type from CONFIG
    const validRangeTypes = Object.keys(CONFIG.DND5E.rangeTypes || {});
    if (validRangeTypes.includes(normalizedSearchRange)) {
      return normalizedSpellRange === normalizedSearchRange;
    }

    // Handle special cases like 'sight', 'unlimited'
    const specialRanges = ['sight', 'unlimited'];
    if (specialRanges.includes(normalizedSearchRange)) {
      return normalizedSpellRange.includes(normalizedSearchRange);
    }

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
    const requiresConcentration = !!spell.filterData?.concentration;
    return expectedConcentration === requiresConcentration;
  }

  /**
   * Evaluate material components criteria
   * @param {string} value - Expected material component type
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether material component requirement matches
   * @private
   */
  _evaluateMaterialComponents(value, spell) {
    const hasMaterialComponents = spell.filterData?.materialComponents?.hasConsumedMaterials || false;
    return (value === 'consumed' && hasMaterialComponents) || (value === 'notconsumed' && !hasMaterialComponents);
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
    const isPrepared = spell.preparation?.prepared || false;
    return expectedPrepared === isPrepared;
  }

  /**
   * Evaluate ritual criteria
   * @param {string} value - Expected ritual status (true/false)
   * @param {Object} spell - Spell to check
   * @returns {boolean} Whether ritual status matches
   * @private
   */
  _evaluateRitual(value, spell) {
    const expectedRitual = value === 'true';
    const isRitual = !!spell.filterData?.isRitual;
    return expectedRitual === isRitual;
  }
}
