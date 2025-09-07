/**
 * Spell Filtering Utilities
 *
 * Provides filtering logic and dropdown option generation for the spell browser interface.
 * This module handles range conversions, filter option preparation, and casting time
 * option generation for the spell filtering system.
 *
 * Key Features:
 * - Range unit conversion with metric system support
 * - Dynamic filter option generation based on D&D 5e configuration
 * - Casting time option sorting and formatting
 * - Localized filter labels and descriptions
 *
 * @module ValidationHelpers/Filters
 * @author Tyler
 */

import * as DataHelpers from '../data/_module.mjs';

/**
 * Filter option for dropdown controls in the spell browser interface.
 *
 * @typedef {Object} FilterOption
 * @property {string} value - The option value used for filtering
 * @property {string} label - The localized display label for the option
 * @property {boolean} [selected] - Whether this option is currently selected
 */

/**
 * Casting time configuration for option generation and sorting.
 *
 * @typedef {Object} CastingTimeConfig
 * @property {string} type - The activation type (action, bonus, reaction, etc.)
 * @property {number} value - The numeric value for the casting time
 * @property {number} priority - Sort priority for ordering options
 */

/**
 * Convert a spell range to feet (or meters based on D&D 5e system settings).
 * Handles unit conversion for range comparisons and display formatting.
 *
 * @param {string} units - The range units (ft, mi, spec, etc.)
 * @param {number} value - The range value to convert
 * @returns {number} The converted range value in standard units
 */
export function convertRangeToStandardUnit(units, value) {
  if (!units || !value) return 0;
  let inFeet = units === 'ft' ? value : units === 'mi' ? value * 5280 : units === 'spec' ? 0 : value;
  return DataHelpers.shouldUseMetricUnits() ? Math.round(inFeet * 0.3048) : inFeet;
}

/**
 * Prepare filter options based on filter type and current state.
 * Generates dropdown options for various filter types with localized labels
 * and current selection states.
 *
 * @param {string} filterId - The filter identifier (level, school, etc.)
 * @param {Object} filterState - Current filter state with selected values
 * @returns {Array<FilterOption>} Options for the dropdown control
 */
export function getOptionsForFilter(filterId, filterState) {
  const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];
  switch (filterId) {
    case 'level':
      Object.entries(CONFIG.DND5E.spellLevels).forEach(([level, label]) => {
        options.push({ value: level, label: label, selected: filterState.level === level });
      });
      break;
    case 'school':
      Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, _school]) => {
        const label = DataHelpers.getConfigLabel(CONFIG.DND5E.spellSchools, key);
        options.push({ value: key, label, selected: filterState.school === key });
      });
      break;
    case 'castingTime':
      const uniqueTypes = getCastingTimeOptions(filterState);
      options.push(...uniqueTypes);
      break;
    case 'damageType':
      const damageTypes = {
        ...CONFIG.DND5E.damageTypes,
        healing: { label: game.i18n.localize('DND5E.Healing'), name: game.i18n.localize('DND5E.Healing') }
      };
      Object.entries(damageTypes)
        .sort((a, b) => {
          const labelA = a[0] === 'healing' ? damageTypes.healing.label : DataHelpers.getConfigLabel(CONFIG.DND5E.damageTypes, a[0]) || a[0];
          const labelB = b[0] === 'healing' ? damageTypes.healing.label : DataHelpers.getConfigLabel(CONFIG.DND5E.damageTypes, b[0]) || b[0];
          return labelA.localeCompare(labelB);
        })
        .forEach(([key, _type]) => {
          const label = key === 'healing' ? damageTypes.healing.label : DataHelpers.getConfigLabel(CONFIG.DND5E.damageTypes, key) || key;
          options.push({ value: key, label, selected: filterState.damageType === key });
        });
      break;
    case 'condition':
      Object.entries(CONFIG.DND5E.conditionTypes)
        .filter(([_key, condition]) => !condition.pseudo)
        .sort((a, b) => {
          const labelA = DataHelpers.getConfigLabel(CONFIG.DND5E.conditionTypes, a[0]);
          const labelB = DataHelpers.getConfigLabel(CONFIG.DND5E.conditionTypes, b[0]);
          return labelA.localeCompare(labelB);
        })
        .forEach(([key, _condition]) => {
          const label = DataHelpers.getConfigLabel(CONFIG.DND5E.conditionTypes, key);
          options.push({ value: key, label, selected: filterState.condition === key });
        });
      break;
    case 'requiresSave':
    case 'concentration':
      options.push(
        { value: 'true', label: game.i18n.localize('SPELLBOOK.Filters.True'), selected: filterState[filterId] === 'true' },
        { value: 'false', label: game.i18n.localize('SPELLBOOK.Filters.False'), selected: filterState[filterId] === 'false' }
      );
      break;
    case 'materialComponents':
      options.push(
        { value: 'consumed', label: game.i18n.localize('SPELLBOOK.Filters.Materials.Consumed'), selected: filterState.materialComponents === 'consumed' },
        { value: 'notConsumed', label: game.i18n.localize('SPELLBOOK.Filters.Materials.NotConsumed'), selected: filterState.materialComponents === 'notConsumed' }
      );
      break;
  }
  return options;
}

/**
 * Get casting time options with proper sorting and formatting.
 * Generates standardized casting time options sorted by priority and value.
 *
 * @private
 * @param {Object} filterState - Current filter state for selection tracking
 * @returns {Array<FilterOption>} Sorted casting time options
 */
function getCastingTimeOptions(filterState) {
  /** @type {Array<CastingTimeConfig>} */
  const castingTimes = [
    { type: 'action', value: 1, priority: 1 },
    { type: 'bonus', value: 1, priority: 2 },
    { type: 'reaction', value: 1, priority: 3 },
    { type: 'minute', value: 1, priority: 4 },
    { type: 'minute', value: 10, priority: 4 },
    { type: 'hour', value: 1, priority: 5 },
    { type: 'hour', value: 8, priority: 5 },
    { type: 'hour', value: 24, priority: 6 },
    { type: 'special', value: 1, priority: 7 }
  ];
  const options = [];
  castingTimes
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.value - b.value))
    .forEach(({ type, value }) => {
      const typeLabel = CONFIG.DND5E.abilityActivationTypes[type] || type;
      const label = value === 1 ? typeLabel : `${value} ${typeLabel}${value !== 1 ? 's' : ''}`;
      const combo = `${type}:${value}`;
      options.push({ value: combo, label, selected: filterState.castingTime === combo });
    });
  return options;
}
