/**
 * Helper functions for spell formatting
 * Prepares spell data for display
 * @module spell-book/helpers/spell-formatting
 */

/**
 * Format spell details for display
 * @param {Object} spell - The spell object with labels
 * @returns {string} - Formatted spell details string
 */
export function formatSpellDetails(spell) {
  const components = [];
  const details = [];

  if (spell.labels?.components?.all) {
    for (const c of spell.labels.components.all) {
      components.push(c.abbr);
    }
  }

  // Format components with commas between them
  const componentsStr = components.length > 0 ? components.join(', ') : '';

  // Add components if there are any
  if (componentsStr) {
    details.push(componentsStr);
  }

  // Add activation
  if (spell.labels?.activation) {
    details.push(spell.labels.activation);
  }

  // Add school
  if (spell.labels?.school) {
    details.push(spell.labels.school);
  }

  // Join with bullet points
  return details.filter(Boolean).join(' • ');
}

/**
 * Get localized preparation mode text
 * @param {string} mode - The preparation mode
 * @returns {string} - Localized preparation mode text
 */
export function getLocalizedPreparationMode(mode) {
  if (!mode) return '';

  // Check if this mode exists in the system configuration
  if (CONFIG.DND5E.spellPreparationModes[mode]?.label) {
    return CONFIG.DND5E.spellPreparationModes[mode].label;
  }

  // Fallback: capitalize first letter if not found in config
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

/**
 * Extracts additional spell data for filtering
 * @param {Object} spell - The spell document
 * @returns {Object} - Additional data for filtering
 */
export function extractSpellFilterData(spell) {
  // Extract casting time
  const castingTime = {
    value: spell.system.activation?.value || '',
    type: spell.system.activation?.type || '',
    label: spell.labels?.activation || ''
  };

  // Extract range
  const range = {
    units: spell.system.range?.units || '',
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
  if (spell.system.activities) {
    for (const [_key, activity] of Object.entries(spell.system.activities)) {
      // Check if the activity has damage parts
      if (activity.damage?.parts?.length) {
        for (const part of activity.damage.parts) {
          // Check if there are types in this damage part
          if (part[1] && !damageTypes.includes(part[1])) {
            damageTypes.push(part[1]);
          }
        }
      }

      // Also check activity.damage.types if it exists (it's an object)
      if (activity.damage?.types && typeof activity.damage.types === 'object') {
        for (const type in activity.damage.types) {
          if (!damageTypes.includes(type)) {
            damageTypes.push(type);
          }
        }
      }
    }
  }

  // Check for ritual
  const isRitual = spell.labels?.components?.tags?.includes(game.i18n.localize('DND5E.Item.Property.Ritual')) || spell.system.components?.ritual || false;

  // Check for concentration
  const concentration = spell.system.duration?.concentration || false;

  // Check for saving throws
  let requiresSave = checkSpellRequiresSave(spell);

  // Extract conditions applied by scanning description
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
}

/**
 * Check if a spell requires a saving throw
 * @param {Object} spell - The spell document
 * @returns {boolean} - Whether the spell requires a save
 * @private
 */
function checkSpellRequiresSave(spell) {
  // First check activities
  if (spell.system.activities) {
    for (const [_key, activity] of Object.entries(spell.system.activities)) {
      if (activity.value?.type === 'save') {
        return true;
      }
    }
  }

  // If no saving throw detected in activities, check description
  if (spell.system.description?.value) {
    const saveText = game.i18n.localize('SPELLBOOK.Filters.SavingThrow').toLowerCase();
    if (spell.system.description.value.toLowerCase().includes(saveText)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract conditions that might be applied by a spell
 * @param {Object} spell - The spell document
 * @returns {string[]} - Array of condition keys
 * @private
 */
function extractSpellConditions(spell) {
  const conditions = [];
  const description = spell.system.description?.value || '';

  if (description) {
    // Convert to lowercase for case-insensitive matching
    const lowerDesc = description.toLowerCase();

    // Check for each condition
    for (const [key, condition] of Object.entries(CONFIG.DND5E.conditionTypes)) {
      if (lowerDesc.includes(condition.label.toLowerCase())) {
        conditions.push(key);
      }
    }
  }

  return conditions;
}

/**
 * Create an enriched icon with a clickable UUID link
 * @param {Object} spell - The spell data object
 * @returns {Promise<string>} - HTML string with enriched icon
 */
export async function createEnrichedSpellIcon(spell) {
  // Get the uuid, ensuring we have a valid reference
  const uuid = spell.compendiumUuid || spell.uuid || spell?._stats?.compendiumSource;
  if (!uuid) {
    // Fallback for spells without UUID
    return `<img src="${spell.img}" class="spell-icon" alt="${spell.name} icon">`;
  }

  // Create enriched HTML with the UUID link
  let enrichedHTML = await TextEditor.enrichHTML(`@UUID[${uuid}]{${spell.name}}`, { async: true });

  // Extract the icon image
  const iconImg = `<img src="${spell.img}" class="spell-icon" alt="${spell.name} icon">`;

  // Find and replace the link content with our icon
  const linkMatch = enrichedHTML.match(/<a[^>]*>(.*?)<\/a>/);
  let enrichedIcon = '';

  if (linkMatch) {
    const linkOpenTag = enrichedHTML.match(/<a[^>]*>/)[0];
    enrichedIcon = `${linkOpenTag}${iconImg}</a>`;
  } else {
    // Fallback if enrichHTML doesn't return a proper link
    enrichedIcon = `<a class="content-link" data-uuid="${uuid}">${iconImg}</a>`;
  }

  return enrichedIcon;
}
