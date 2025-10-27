/**
 * Advanced Search Query Execution Engine
 *
 * Executes parsed search queries against spell data collections. This module leverages
 * the DND5e system's built-in filtering capabilities for robust, maintainable query
 * execution with minimal custom logic.
 *
 * The query executor supports:
 * - Conjunction (AND) operations between field conditions
 * - Field-specific evaluation using DND5e filter system
 * - Type-safe spell property access via foundry.utils.getProperty
 * - Complex operators (contains, hasany, OR, etc.)
 *
 * @module ValidationUtils/QueryExecutor
 * @author Tyler
 */

/**
 * Executes parsed queries against spell data using DND5e filter system.
 */
export class QueryExecutor {
  /**
   * Field mapping configuration - converts query field names to DND5e filter descriptions.
   * @type {Object<string, Function>}
   * @private
   */
  FIELD_MAPPERS = {
    /**
     * Name search using case-insensitive contains.
     * @param value - Query value
     */
    name: (value) => ({
      k: 'name',
      v: value,
      o: 'icontains'
    }),

    /**
     * Exact level match.
     * @param value - Query value
     */
    level: (value) => ({
      k: 'level',
      v: parseInt(value)
    }),

    /**
     * School comparison.
     * @param value - Query value
     */
    school: (value) => ({
      k: 'school',
      v: value.toLowerCase(),
      o: 'icontains'
    }),

    /**
     * Damage type checking - checks if spell has any of the specified damage types.
     * @param value - Query value
     */
    damageType: (value) => ({
      k: 'filterData.damageTypes',
      v: value.split(',').map((t) => t.trim().toLowerCase()),
      o: 'hasany'
    }),

    /**
     * Condition checking - checks if spell inflicts any of the specified conditions.
     * @param value - Query value
     */
    condition: (value) => ({
      k: 'filterData.conditions',
      v: value.split(',').map((c) => c.trim().toLowerCase()),
      o: 'hasany'
    }),

    /**
     * Casting time - splits "type:value" format into two separate checks.
     * @param value - Query value
     */
    castingTime: (value) => {
      const [type, val = '1'] = value.split(':');
      return [
        { k: 'system.activation.type', v: type },
        { k: 'system.activation.value', v: String(val) }
      ];
    },

    /**
     * Range - handles both numeric values and unit types.
     * Numeric: exact match on system.range.value
     * Text: contains match on system.range.units
     * @param value - Query value
     */
    range: (value) => {
      const numValue = parseInt(value);
      if (!isNaN(numValue)) return { k: 'system.range.value', v: numValue };
      return { k: 'system.range.units', v: value.toLowerCase(), o: 'icontains' };
    },

    /**
     * Concentration requirement - checks multiple possible property locations.
     * @param value - Query value
     */
    concentration: (value) => ({
      o: 'OR',
      v: [
        { k: 'filterData.concentration', v: value === 'true' },
        { k: 'system.properties.concentration', v: value === 'true' }
      ]
    }),

    /**
     * Ritual capability - checks multiple possible property locations.
     * @param value - Query value
     */
    ritual: (value) => ({
      o: 'OR',
      v: [
        { k: 'filterData.ritual', v: value === 'true' },
        { k: 'system.properties.ritual', v: value === 'true' }
      ]
    }),

    /**
     * Prepared status - checks both system.preparation.prepared and top-level prepared.
     * @param value - Query value
     */
    prepared: (value) => ({
      o: 'OR',
      v: [
        { k: 'system.preparation.prepared', v: value === 'true' },
        { k: 'prepared', v: value === 'true' }
      ]
    }),

    /**
     * Save requirement - checks filterData flag.
     * @param value - Query value
     */
    requiresSave: (value) => ({
      k: 'filterData.requiresSave',
      v: value === 'true'
    }),

    /**
     * Material components - checks if components are consumed.
     * @param value - Query value
     */
    materialComponents: (value) => ({
      k: 'filterData.materialComponents.consumed',
      v: value.toLowerCase() === 'consumed'
    })
  };

  /**
   * Execute parsed query against spells collection.
   * @param {ParsedQuery} queryObject - Parsed query object from QueryParser
   * @param {Array<SpellData>} spells - Array of spell data to filter
   * @returns {Array<SpellData>} Filtered spells that match all query conditions
   */
  executeQuery(queryObject, spells) {
    if (!queryObject || !spells || queryObject.type !== 'conjunction') return spells;
    const filters = this._convertConditions(queryObject.conditions);
    return spells.filter((spell) => dnd5e.Filter.performCheck(spell, filters));
  }

  /**
   * Convert query conditions to filter descriptions.
   * @private
   * @param {Array<FieldCondition>} conditions - Query conditions to convert
   * @returns {Array<Object>} Array of filter descriptions for dnd5e.Filter.performCheck
   */
  _convertConditions(conditions) {
    const filters = [];
    for (const condition of conditions) {
      if (condition.type !== 'field') continue;
      const mapper = this.FIELD_MAPPERS[condition.field];
      if (!mapper) continue;
      const filter = mapper(condition.value);
      if (Array.isArray(filter)) filters.push(...filter);
      else if (filter) filters.push(filter);
    }
    return filters;
  }
}
