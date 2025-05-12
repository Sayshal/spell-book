/**
 * Utility functions for formatting spell details
 */

/**
 * Format spell details for display
 * @param {Object} spell - The spell object
 * @returns {string} - Formatted spell details string
 */
export function formatSpellDetails(spell) {
  try {
    if (!spell) return '';

    const components = [];
    const details = [];

    // Handle components
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
        if (componentMap[prop]) {
          components.push(componentMap[prop]);
        }
      }
    }

    // Format components
    const componentsStr = components.length > 0 ? components.join(', ') : '';
    if (componentsStr) {
      details.push(componentsStr);
    }

    // Handle activation
    if (spell.labels?.activation) {
      details.push(spell.labels.activation);
    } else if (spell.system?.activation?.type) {
      const activationType = spell.system.activation.type;
      const activationValue = spell.system.activation.value || 1;
      const typeLabel = CONFIG.DND5E.abilityActivationTypes[activationType];

      // Format activation string
      let activationStr;
      if (activationValue === 1 || activationValue === null) {
        activationStr = typeLabel;
      } else {
        activationStr = `${activationValue} ${typeLabel}s`;
      }

      details.push(activationStr);
    }

    // Handle school
    if (spell.labels?.school) {
      details.push(spell.labels.school);
    } else if (spell.system?.school) {
      const schoolLabel = CONFIG.DND5E.spellSchools[spell.system.school]?.label || spell.system.school;
      details.push(schoolLabel);
    }

    // Join with bullet points
    return details.filter(Boolean).join(' • ');
  } catch (error) {
    log(1, `Error formatting spell details: ${error.message}`);
    return '';
  }
}

/**
 * Get localized preparation mode text
 * @param {string} mode - The preparation mode
 * @returns {string} - Localized preparation mode text
 */
export function getLocalizedPreparationMode(mode) {
  try {
    if (!mode) return '';

    // Use system configuration if available
    if (CONFIG.DND5E.spellPreparationModes[mode]?.label) {
      return CONFIG.DND5E.spellPreparationModes[mode].label;
    }

    // Fallback: capitalize first letter
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  } catch (error) {
    log(1, `Error getting localized preparation mode: ${error.message}`);
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

    // Extract casting time
    const castingTime = {
      value: spell.system?.activation?.value || '',
      type: spell.system?.activation?.type || '',
      label: spell.labels?.activation || ''
    };

    // Extract range
    const range = {
      units: spell.system?.range?.units || '',
      label: spell.labels?.range || ''
    };

    // Extract damage types
    const damageTypes = [];

    // Extract from labels if available
    if (spell.labels?.damages?.length) {
      for (const damage of spell.labels.damages) {
        if (damage.damageType && !damageTypes.includes(damage.damageType)) {
          damageTypes.push(damage.damageType);
        }
      }
    }

    // Extract from system.activities damage parts
    if (spell.system?.activities) {
      for (const [_key, activity] of Object.entries(spell.system.activities)) {
        if (activity.damage?.parts?.length) {
          for (const part of activity.damage.parts) {
            // Check for types array (new structure)
            if (part.types && Array.isArray(part.types) && part.types.length) {
              for (const type of part.types) {
                if (!damageTypes.includes(type)) {
                  damageTypes.push(type);
                }
              }
            }
            // Check for traditional damage type
            else if (part[1] && !damageTypes.includes(part[1])) {
              damageTypes.push(part[1]);
            }
          }
        }
      }
    }

    // Check for ritual
    const isRitual = Boolean(
      spell.labels?.components?.tags?.includes(game.i18n.localize('DND5E.Item.Property.Ritual')) ||
        (spell.system.properties && Array.isArray(spell.system.properties) && spell.system.properties.includes('ritual')) ||
        spell.system.components?.ritual ||
        false
    );

    // Check for concentration
    let concentration = spell.system.duration?.concentration || false;
    // Also check if it's in properties array
    if (!concentration && spell.system.properties && Array.isArray(spell.system.properties)) {
      concentration = spell.system.properties.includes('concentration');
    }

    // Check for saving throws
    const requiresSave = checkSpellRequiresSave(spell);

    // Extract conditions
    const conditions = extractSpellConditions(spell);

    return {
      castingTime,
      range,
      damageTypes,
      isRitual,
      concentration,
      requiresSave,
      conditions
    };
  } catch (error) {
    log(1, `Error extracting spell filter data: ${error.message}`);
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
 * Check if a spell requires a saving throw
 * @param {Object} spell - The spell document
 * @returns {boolean} - Whether the spell requires a save
 * @private
 */
function checkSpellRequiresSave(spell) {
  try {
    // Check activities
    if (spell.system?.activities) {
      for (const [_key, activity] of Object.entries(spell.system.activities)) {
        if (activity.value?.type === 'save') {
          return true;
        }
      }
    }

    // Check description for saving throw text
    if (spell.system?.description?.value) {
      const saveText = game.i18n.localize('SPELLBOOK.Filters.SavingThrow').toLowerCase();
      if (spell.system.description.value.toLowerCase().includes(saveText)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    log(1, `Error checking if spell requires save: ${error.message}`);
    return false;
  }
}

/**
 * Extract conditions that might be applied by a spell
 * @param {Object} spell - The spell document
 * @returns {string[]} - Array of condition keys
 * @private
 */
function extractSpellConditions(spell) {
  try {
    const conditions = [];
    const description = spell.system?.description?.value || '';

    if (description && CONFIG.DND5E.conditionTypes) {
      const lowerDesc = description.toLowerCase();

      // Check for each condition
      for (const [key, condition] of Object.entries(CONFIG.DND5E.conditionTypes)) {
        if (condition?.label && lowerDesc.includes(condition.label.toLowerCase())) {
          conditions.push(key);
        }
      }
    }

    return conditions;
  } catch (error) {
    log(1, `Error extracting spell conditions: ${error.message}`);
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

    // Get the uuid
    const uuid = spell.compendiumUuid || spell.uuid || spell?._stats?.compendiumSource;

    if (!uuid) {
      // Fallback for spells without UUID
      return `<img src="${spell.img}" class="spell-icon" alt="${spell.name} icon">`;
    }

    const parsed = foundry.utils.parseUuid(uuid);

    // Extract components
    const itemId = parsed.id || '';
    const entityType = parsed.type || 'Item';
    let packId = '';

    if (parsed.collection) {
      packId = parsed.collection.collection || '';
    }

    // Create HTML directly - using template literals for better readability
    return `<a class="content-link"
              draggable="true"
              data-link=""
              data-uuid="${uuid}"
              data-id="${itemId}"
              data-type="${entityType}"
              data-pack="${packId}"
              data-tooltip="${spell.name}">
              <img src="${spell.img}" class="spell-icon" alt="${spell.name} icon">
            </a>`
      .replace(/\s+/g, ' ')
      .trim();
  } catch (error) {
    log(1, `Error creating spell icon link for ${spell?.name || 'unknown spell'}:`, error);
    // Fallback
    if (spell?.img) {
      return `<img src="${spell.img}" class="spell-icon" alt="${spell?.name || ''} icon">`;
    }
    return '';
  }
}
