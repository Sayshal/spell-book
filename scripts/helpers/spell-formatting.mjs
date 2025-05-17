import { log } from '../logger.mjs';

/**
 * Format spell details for display
 * @param {Object} spell - The spell object
 * @returns {string} - Formatted spell details string
 */
export function formatSpellDetails(spell) {
  try {
    if (!spell) return '';
    const details = [];
    const componentsStr = formatSpellComponents(spell);
    if (componentsStr) details.push(componentsStr);
    const activationStr = formatSpellActivation(spell);
    if (activationStr) details.push(activationStr);
    const schoolStr = formatSpellSchool(spell);
    if (schoolStr) details.push(schoolStr);
    return details.filter(Boolean).join(' • ');
  } catch (error) {
    log(1, `Error formatting spell details:`, error);
    return '';
  }
}

/**
 * Format spell components for display
 * @param {Object} spell - The spell object
 * @returns {string} - Formatted components string
 */
function formatSpellComponents(spell) {
  const components = [];

  if (spell.labels?.components?.all) {
    for (const c of spell.labels.components.all) {
      components.push(c.abbr);
    }
  } else if (spell.system?.properties?.length) {
    const componentMap = {
      vocal: 'V',
      somatic: 'S',
      material: 'M',
      concentration: 'C',
      ritual: 'R'
    };

    for (const prop of spell.system.properties) {
      if (componentMap[prop]) components.push(componentMap[prop]);
    }
  }

  return components.join(', ');
}

/**
 * Format spell activation for display
 * @param {Object} spell - The spell object
 * @returns {string} - Formatted activation string
 */
function formatSpellActivation(spell) {
  if (spell.labels?.activation) return spell.labels.activation;
  if (spell.system?.activation?.type) {
    const type = spell.system.activation.type;
    const value = spell.system.activation.value || 1;
    const typeLabel = CONFIG.DND5E.abilityActivationTypes[type];

    if (value === 1 || value === null) return typeLabel;
    return `${value} ${typeLabel}s`;
  }

  return '';
}

/**
 * Format spell school for display
 * @param {Object} spell - The spell object
 * @returns {string} - Formatted school string
 */
function formatSpellSchool(spell) {
  if (spell.labels?.school) return spell.labels.school;
  if (spell.system?.school) {
    return CONFIG.DND5E.spellSchools[spell.system.school]?.label || spell.system.school;
  }

  return '';
}

/**
 * Get localized preparation mode text
 * @param {string} mode - The preparation mode
 * @returns {string} - Localized preparation mode text
 */
export function getLocalizedPreparationMode(mode) {
  try {
    if (!mode) return '';
    if (CONFIG.DND5E.spellPreparationModes[mode]?.label) {
      return CONFIG.DND5E.spellPreparationModes[mode].label;
    }

    return mode.charAt(0).toUpperCase() + mode.slice(1);
  } catch (error) {
    log(1, `Error getting localized preparation mode:`, error);
    return mode || '';
  }
}

/**
 * Extracts additional spell data for filtering
 * @param {Object} spell - The spell document
 * @returns {Object} - Additional data for filtering
 */
export function extractSpellFilterData(spell) {
  try {
    if (!spell) return {};

    return {
      castingTime: extractCastingTime(spell),
      range: extractRange(spell),
      damageTypes: extractDamageTypes(spell),
      isRitual: checkIsRitual(spell),
      concentration: checkIsConcentration(spell),
      requiresSave: checkSpellRequiresSave(spell),
      conditions: extractSpellConditions(spell)
    };
  } catch (error) {
    log(1, `Error extracting spell filter data:`, error);
    return {
      castingTime: {},
      range: {},
      damageTypes: [],
      isRitual: false,
      concentration: false,
      requiresSave: false,
      conditions: []
    };
  }
}

/**
 * Extract casting time information from spell
 * @param {Object} spell - The spell document
 * @returns {Object} - Casting time data
 */
function extractCastingTime(spell) {
  return {
    value: spell.system?.activation?.value || '',
    type: spell.system?.activation?.type || '',
    label: spell.labels?.activation || ''
  };
}

/**
 * Extract range information from spell
 * @param {Object} spell - The spell document
 * @returns {Object} - Range data
 */
function extractRange(spell) {
  return {
    units: spell.system?.range?.units || '',
    label: spell.labels?.range || ''
  };
}

/**
 * Extract damage types from spell
 * @param {Object} spell - The spell document
 * @returns {string[]} - Array of damage types
 */
function extractDamageTypes(spell) {
  const damageTypes = [];
  if (spell.labels?.damages?.length) {
    for (const damage of spell.labels.damages) {
      if (damage.damageType && !damageTypes.includes(damage.damageType)) {
        damageTypes.push(damage.damageType);
      }
    }
  }
  if (spell.system?.activities) {
    for (const [_key, activity] of Object.entries(spell.system.activities)) {
      if (activity.damage?.parts?.length) {
        for (const part of activity.damage.parts) {
          if (part.types && Array.isArray(part.types) && part.types.length) {
            for (const type of part.types) {
              if (!damageTypes.includes(type)) damageTypes.push(type);
            }
          } else if (part[1] && !damageTypes.includes(part[1])) {
            damageTypes.push(part[1]);
          }
        }
      }
    }
  }

  return damageTypes;
}

/**
 * Check if spell is a ritual
 * @param {Object} spell - The spell document
 * @returns {boolean} - Whether the spell is a ritual
 */
function checkIsRitual(spell) {
  return Boolean(
    spell.labels?.components?.tags?.includes(game.i18n.localize('DND5E.Item.Property.Ritual')) ||
      (spell.system.properties && Array.isArray(spell.system.properties) && spell.system.properties.includes('ritual')) ||
      spell.system.components?.ritual
  );
}

/**
 * Check if spell requires concentration
 * @param {Object} spell - The spell document
 * @returns {boolean} - Whether the spell requires concentration
 */
function checkIsConcentration(spell) {
  if (spell.system.duration?.concentration) return true;
  return spell.system.properties && Array.isArray(spell.system.properties) && spell.system.properties.includes('concentration');
}

/**
 * Check if a spell requires a saving throw
 * @param {Object} spell - The spell document
 * @returns {boolean} - Whether the spell requires a save
 */
function checkSpellRequiresSave(spell) {
  try {
    if (spell.system?.activities) {
      for (const [_key, activity] of Object.entries(spell.system.activities)) {
        if (activity.value?.type === 'save') return true;
      }
    }

    if (spell.system?.description?.value) {
      const saveText = game.i18n.localize('SPELLBOOK.Filters.SavingThrow').toLowerCase();
      if (spell.system.description.value.toLowerCase().includes(saveText)) return true;
    }

    return false;
  } catch (error) {
    log(1, `Error checking if spell requires save:`, error);
    return false;
  }
}

/**
 * Extract conditions that might be applied by a spell
 * @param {Object} spell - The spell document
 * @returns {string[]} - Array of condition keys
 */
function extractSpellConditions(spell) {
  try {
    const conditions = [];
    const description = spell.system?.description?.value || '';
    if (description && CONFIG.DND5E.conditionTypes) {
      const lowerDesc = description.toLowerCase();
      for (const [key, condition] of Object.entries(CONFIG.DND5E.conditionTypes)) {
        if (condition?.label && lowerDesc.includes(condition.label.toLowerCase())) {
          conditions.push(key);
        }
      }
    }

    return conditions;
  } catch (error) {
    log(1, `Error extracting spell conditions:`, error);
    return [];
  }
}

/**
 * Create a spell icon link
 * @param {Object} spell - The spell data object
 * @returns {string} - HTML string with icon link
 */
export function createSpellIconLink(spell) {
  try {
    if (!spell) return '';
    const uuid = spell.compendiumUuid || spell.uuid || spell?._stats?.compendiumSource;
    const parsed = foundry.utils.parseUuid(uuid);
    const itemId = parsed.id || '';
    const entityType = parsed.type || 'Item';
    let packId = '';

    if (parsed.collection) {
      packId = parsed.collection.collection || '';
    }

    return `<a class="content-link" draggable="true" data-link="" data-uuid="${uuid}" data-id="${itemId}" data-type="${entityType}" data-pack="${packId}" data-tooltip="${spell.name}"><img src="${spell.img}" class="spell-icon" alt="${spell.name} icon"></a>`
      .replace(/\s+/g, ' ')
      .trim();
  } catch (error) {
    log(1, `Error creating spell icon link:`, error);
    if (spell?.img) {
      return `<img src="${spell.img}" class="spell-icon" alt="${spell?.name || ''} icon">`;
    }
    return '';
  }
}
