import { MODULE, SETTINGS } from '../constants.mjs';

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
 * @param {Array} spellLevels - Spell level data
 * @returns {Array} Options for the dropdown
 */
export function getOptionsForFilter(filterId, filterState, spellLevels) {
  const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];

  switch (filterId) {
    case 'level':
      if (spellLevels) {
        spellLevels.forEach((level) => {
          options.push({
            value: level.level,
            label: CONFIG.DND5E.spellLevels[level.level],
            selected: filterState.level === level.level
          });
        });
      }
      break;

    case 'school':
      Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, school]) => {
        options.push({
          value: key,
          label: school.label,
          selected: filterState.school === key
        });
      });
      break;

    case 'castingTime':
      if (spellLevels) {
        const uniqueTypes = getCastingTimeOptions(spellLevels, filterState);
        options.push(...uniqueTypes);
      }
      break;

    case 'damageType':
      const damageTypes = {
        ...CONFIG.DND5E.damageTypes,
        healing: { label: game.i18n.localize('DND5E.Healing') }
      };

      Object.entries(damageTypes)
        .sort((a, b) => a[1].label.localeCompare(b[1].label))
        .forEach(([key, type]) => {
          options.push({
            value: key,
            label: type.label,
            selected: filterState.damageType === key
          });
        });
      break;

    case 'condition':
      Object.entries(CONFIG.DND5E.conditionTypes)
        .filter(([_key, condition]) => !condition.pseudo)
        .forEach(([key, condition]) => {
          options.push({
            value: key,
            label: condition.label,
            selected: filterState.condition === key
          });
        });
      break;

    case 'requiresSave':
    case 'concentration':
      options.push(
        {
          value: 'true',
          label: game.i18n.localize('SPELLBOOK.Filters.True'),
          selected: filterState[filterId] === 'true'
        },
        {
          value: 'false',
          label: game.i18n.localize('SPELLBOOK.Filters.False'),
          selected: filterState[filterId] === 'false'
        }
      );
      break;

    case 'sortBy':
      options.push(
        { value: 'level', label: game.i18n.localize('SPELLBOOK.Sort.ByLevel'), selected: filterState.sortBy === 'level' },
        { value: 'name', label: game.i18n.localize('SPELLBOOK.Sort.ByName'), selected: filterState.sortBy === 'name' },
        { value: 'school', label: game.i18n.localize('SPELLBOOK.Sort.BySchool'), selected: filterState.sortBy === 'school' },
        { value: 'prepared', label: game.i18n.localize('SPELLBOOK.Sort.ByPrepared'), selected: filterState.sortBy === 'prepared' }
      );
      break;
  }

  return options;
}

/**
 * Get casting time options from spell levels
 * @param {Array} spellLevels - Spell level data
 * @param {Object} filterState - Current filter state
 * @returns {Array} Casting time options
 */
function getCastingTimeOptions(spellLevels, filterState) {
  const uniqueActivationTypes = new Set();
  const options = [];

  spellLevels.forEach((level) => {
    level.spells.forEach((spell) => {
      const type = spell.system?.activation?.type;
      const value = spell.system?.activation?.value || 1;
      if (type) uniqueActivationTypes.add(`${type}:${value}`);
    });
  });

  const typeOrder = {
    action: 1,
    bonus: 2,
    reaction: 3,
    minute: 4,
    hour: 5,
    day: 6,
    legendary: 7,
    mythic: 8,
    lair: 9,
    crew: 10,
    special: 11,
    none: 12
  };

  Array.from(uniqueActivationTypes)
    .map((combo) => {
      const [type, value] = combo.split(':');
      return [combo, type, parseInt(value) || 1];
    })
    .sort((a, b) => {
      const [, typeA, valueA] = a;
      const [, typeB, valueB] = b;
      const priorityA = typeOrder[typeA] || 999;
      const priorityB = typeOrder[typeB] || 999;
      return priorityA !== priorityB ? priorityA - priorityB : valueA - valueB;
    })
    .forEach(([combo, type, value]) => {
      const typeLabel = CONFIG.DND5E.abilityActivationTypes[type] || type;
      const label = value === 1 ? typeLabel : `${value} ${typeLabel}${value !== 1 ? 's' : ''}`;

      options.push({
        value: combo,
        label,
        selected: filterState.castingTime === combo
      });
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
    sortBy: 'level'
  };
}
