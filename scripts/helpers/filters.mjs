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
 * @param {Array} spellData - Spell data
 * @returns {Array} Options for the dropdown
 */
export function getOptionsForFilter(filterId, filterState, spellData) {
  const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];

  switch (filterId) {
    case 'level':
      if (spellData && Array.isArray(spellData)) {
        const levels = new Set();

        // Handle both flattened and level structures
        if (spellData.length > 0 && spellData[0]._levelMetadata) {
          // Flattened structure
          spellData.forEach((spell) => {
            levels.add(spell._levelMetadata.level);
          });
        } else {
          // Level structure
          spellData.forEach((level) => {
            levels.add(level.level);
          });
        }

        Array.from(levels)
          .sort((a, b) => Number(a) - Number(b))
          .forEach((level) => {
            options.push({
              value: level,
              label: CONFIG.DND5E.spellLevels[level],
              selected: filterState.level === level
            });
          });
      }
      break;

    case 'school':
      Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, school]) => {
        options.push({ value: key, label: school.label, selected: filterState.school === key });
      });
      break;

    case 'castingTime':
      if (spellData) {
        const uniqueTypes = getCastingTimeOptions(spellData, filterState);
        options.push(...uniqueTypes);
      }
      break;

    case 'damageType':
      const damageTypes = { ...CONFIG.DND5E.damageTypes, healing: { label: game.i18n.localize('DND5E.Healing') } };
      Object.entries(damageTypes)
        .sort((a, b) => a[1].label.localeCompare(b[1].label))
        .forEach(([key, type]) => {
          options.push({ value: key, label: type.label, selected: filterState.damageType === key });
        });
      break;

    case 'condition':
      Object.entries(CONFIG.DND5E.conditionTypes)
        .filter(([_key, condition]) => !condition.pseudo)
        .forEach(([key, condition]) => {
          options.push({ value: key, label: condition.label, selected: filterState.condition === key });
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
        { value: 'consumed', label: game.i18n.localize('SPELLBOOK.Filters.MaterialComponents.Consumed'), selected: filterState.materialComponents === 'consumed' },
        { value: 'notConsumed', label: game.i18n.localize('SPELLBOOK.Filters.MaterialComponents.NotConsumed'), selected: filterState.materialComponents === 'notConsumed' }
      );
      break;
  }
  return options;
}

/**
 * Get casting time options from spell levels
 * @param {Array} spellData - Spell data
 * @param {Object} filterState - Current filter state
 * @returns {Array} Casting time options
 */
function getCastingTimeOptions(spellData, filterState) {
  const uniqueActivationTypes = new Set();
  const options = [];

  // Handle both flattened array and level structure
  let spells = [];
  if (Array.isArray(spellData)) {
    // Check if it's flattened (has _levelMetadata) or level structure
    if (spellData.length > 0 && spellData[0]._levelMetadata) {
      // Flattened structure - spellData is already the spells array
      spells = spellData;
    } else {
      // Level structure - extract spells from levels
      spellData.forEach((level) => {
        if (level.spells && Array.isArray(level.spells)) {
          spells.push(...level.spells);
        }
      });
    }
  }

  spells.forEach((spell) => {
    const type = spell.system?.activation?.type;
    const value = spell.system?.activation?.value || 1;
    if (type) uniqueActivationTypes.add(`${type}:${value}`);
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
