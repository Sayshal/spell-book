import { MODULE, SETTINGS } from '../constants.mjs';
import * as genericUtils from './generic-utils.mjs';

/**
 * Convert a spell range to feet (or meters based on settings)
 * @param {string} units - The range units (feet, miles, etc)
 * @param {number} value - The range value
 * @returns {number} - The converted range value
 */
export function convertRangeToStandardUnit(units, value) {
  if (!units || !value) return 0;
  let inFeet =
    units === 'ft' ? value
    : units === 'mi' ? value * 5280
    : units === 'spec' ? 0
    : value;
  return game.settings.get(MODULE.ID, SETTINGS.DISTANCE_UNIT) === 'meters' ? Math.round(inFeet * 0.3048) : inFeet;
}

/**
 * Prepare filter options based on filter type
 * @param {string} filterId - The filter ID
 * @param {Object} filterState - Current filter state
 * @param {Array} spellData - Spell data
 * @returns {Array} Options for the dropdown
 */
export function getOptionsForFilter(filterId, filterState, spellData) {
  const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];
  switch (filterId) {
    case 'level':
      Object.entries(CONFIG.DND5E.spellLevels).forEach(([level, label]) => {
        options.push({ value: level, label: label, selected: filterState.level === level });
      });
      break;
    case 'school':
      Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, school]) => {
        const label = genericUtils.getConfigLabel(CONFIG.DND5E.spellSchools, key);
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
          const labelA = a[0] === 'healing' ? damageTypes.healing.label : genericUtils.getConfigLabel(CONFIG.DND5E.damageTypes, a[0]) || a[0];
          const labelB = b[0] === 'healing' ? damageTypes.healing.label : genericUtils.getConfigLabel(CONFIG.DND5E.damageTypes, b[0]) || b[0];
          return labelA.localeCompare(labelB);
        })
        .forEach(([key, type]) => {
          const label = key === 'healing' ? damageTypes.healing.label : genericUtils.getConfigLabel(CONFIG.DND5E.damageTypes, key) || key;
          options.push({ value: key, label, selected: filterState.damageType === key });
        });
      break;
    case 'condition':
      Object.entries(CONFIG.DND5E.conditionTypes)
        .filter(([_key, condition]) => !condition.pseudo)
        .sort((a, b) => {
          const labelA = genericUtils.getConfigLabel(CONFIG.DND5E.conditionTypes, a[0]);
          const labelB = genericUtils.getConfigLabel(CONFIG.DND5E.conditionTypes, b[0]);
          return labelA.localeCompare(labelB);
        })
        .forEach(([key, condition]) => {
          const label = genericUtils.getConfigLabel(CONFIG.DND5E.conditionTypes, key);
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
 * Get casting time options
 * @param {Object} filterState - Current filter state
 * @returns {Array} Casting time options
 */
function getCastingTimeOptions(filterState) {
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

/**
 * Create the default filter state object
 * @returns {Object} Default filter state
 */
export function getDefaultFilterState() {
  return {
    name: '',
    level: '',
    school: '',
    castingTime: '',
    minRange: '',
    maxRange: '',
    damageType: '',
    condition: '',
    requiresSave: '',
    prepared: false,
    ritual: false,
    concentration: '',
    materialComponents: ''
  };
}
