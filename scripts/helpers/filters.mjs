import { MODULE, SETTINGS } from '../constants.mjs';

/**
 * Convert a spell range to feet (or meters based on settings)
 * @param {string} units - The range units (feet, miles, etc)
 * @param {number} value - The range value
 * @returns {number} - The converted range value
 */
export function convertRangeToStandardUnit(units, value) {
  if (!units || !value) return 0;

  const targetUnit = game.settings.get(MODULE.ID, SETTINGS.DISTANCE_UNIT);
  let inFeet = 0;

  // Convert to feet first
  switch (units) {
    case 'ft':
      inFeet = value;
      break;
    case 'mi':
      inFeet = value * 5280;
      break;
    case 'spec':
      // Special range like "Self" or "Touch"
      inFeet = 0;
      break;
    default:
      inFeet = value;
  }

  // Convert from feet to meters if needed
  if (targetUnit === 'meters') {
    return Math.round(inFeet * 0.3048);
  }

  return inFeet;
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
        // Collect unique casting times
        const uniqueActivationTypes = new Set();
        spellLevels.forEach((level) => {
          level.spells.forEach((spell) => {
            const activationType = spell.system?.activation?.type;
            const activationValue = spell.system?.activation?.value || 1;
            if (activationType) {
              uniqueActivationTypes.add(`${activationType}:${activationValue}`);
            }
          });
        });

        // Define priority order
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

        // Convert and sort
        const sortableTypes = Array.from(uniqueActivationTypes)
          .map((combo) => {
            const [type, value] = combo.split(':');
            return [combo, type, parseInt(value) || 1];
          })
          .sort((a, b) => {
            const [, typeA, valueA] = a;
            const [, typeB, valueB] = b;
            const typePriorityA = typeOrder[typeA] || 999;
            const typePriorityB = typeOrder[typeB] || 999;
            return typePriorityA !== typePriorityB ? typePriorityA - typePriorityB : valueA - valueB;
          });

        // Create options
        sortableTypes.forEach(([combo, type, value]) => {
          const typeLabel = CONFIG.DND5E.abilityActivationTypes[type] || type;
          const label = value === 1 ? typeLabel : `${value} ${typeLabel}${value !== 1 ? 's' : ''}`;

          options.push({
            value: combo,
            label: label,
            selected: filterState.castingTime === combo
          });
        });
      }
      break;

    case 'damageType':
      // Create damage types including healing
      const damageTypesWithHealing = {
        ...CONFIG.DND5E.damageTypes,
        healing: { label: game.i18n.localize('DND5E.Healing') }
      };

      Object.entries(damageTypesWithHealing)
        .sort((a, b) => a[1].label.localeCompare(b[1].label))
        .forEach(([key, damageType]) => {
          options.push({
            value: key,
            label: damageType.label,
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
        { value: 'true', label: game.i18n.localize('SPELLBOOK.Filters.True'), selected: filterState[filterId] === 'true' },
        { value: 'false', label: game.i18n.localize('SPELLBOOK.Filters.False'), selected: filterState[filterId] === 'false' }
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
