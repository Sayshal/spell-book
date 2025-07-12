import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as genericUtils from './generic-utils.mjs';

/**
 * Format spell details for display with notes icon at the beginning
 * @param {Object} spell - The spell object
 * @param {Boolean} includeNotes - Optional flag to disable including notes
 * @returns {string} - Formatted spell details string with notes icon
 */
export function formatSpellDetails(spell, includeNotes = true) {
  try {
    if (!spell) return '';
    const details = [];
    const componentsStr = formatSpellComponents(spell);
    if (componentsStr) details.push(componentsStr);
    const activationStr = formatSpellActivation(spell);
    if (activationStr) details.push(activationStr);
    const schoolStr = formatSpellSchool(spell);
    if (schoolStr) details.push(schoolStr);
    const materialsStr = formatMaterialComponents(spell);
    if (materialsStr) details.push(materialsStr);
    const baseDetails = details.filter(Boolean).join(' • ');
    if (!includeNotes) return baseDetails;
    const notesIcon = createNotesIcon(spell);
    if (notesIcon && baseDetails) return `${notesIcon} ${baseDetails}`;
    else if (notesIcon) return notesIcon;
    else return baseDetails;
  } catch (error) {
    log(1, 'Error formatting spell details:', error);
    return '';
  }
}

/**
 * Process spell list data for display
 * @param {Object} spellList - The spell list to process
 * @returns {Object} Processed spell list with display data
 */
export function processSpellListForDisplay(spellList) {
  if (!spellList) return null;
  const processed = foundry.utils.deepClone(spellList);
  processed.isCustomList = !!spellList.document.flags?.[MODULE.ID]?.isDuplicate;
  processed.canRestore = !!(processed.isCustomList && spellList.document.flags?.[MODULE.ID]?.originalUuid);
  processed.originalUuid = spellList.document.flags?.[MODULE.ID]?.originalUuid;
  processed.actorId = spellList.document.flags?.[MODULE.ID]?.actorId;
  processed.isPlayerSpellbook = !!processed.actorId;
  processed.identifier = spellList.document.system?.identifier;
  processed.isMerged = !!spellList.document?.flags?.[MODULE.ID]?.isMerged;
  processed.isClassSpellList = !processed.isCustomList && !processed.isPlayerSpellbook && !processed.isMerged && !!processed.identifier;
  if (spellList.spellsByLevel?.length) {
    processed.spellsByLevel = spellList.spellsByLevel.map((level) => ({
      ...level,
      spells: level.spells.map((spell) => processSpellItemForDisplay(spell))
    }));
  }
  return processed;
}

/**
 * Process spell item for display in the GM interface
 * @param {Object} spell - The spell to process
 * @returns {Object} Processed spell with display data
 */
export function processSpellItemForDisplay(spell) {
  if (!spell.compendiumUuid) spell.compendiumUuid = spell.uuid;
  const processed = foundry.utils.deepClone(spell);
  processed.cssClasses = 'spell-item';
  processed.dataAttributes = `data-uuid="${spell.compendiumUuid}"`;
  return processed;
}

/**
 * Format spell components for display
 * @param {Object} spell - The spell object
 * @returns {string} - Formatted components string
 */
export function formatSpellComponents(spell) {
  const components = [];
  if (spell.labels?.components?.all) for (const c of spell.labels.components.all) components.push(c.abbr);
  else if (spell.system?.properties?.length) {
    const componentMap = { vocal: 'V', somatic: 'S', material: 'M', concentration: 'C', ritual: 'R' };
    for (const prop of spell.system.properties) if (componentMap[prop]) components.push(componentMap[prop]);
  }
  return components.join(', ');
}

/**
 * Format spell activation for display
 * @param {Object} spell - The spell object
 * @returns {string} - Formatted activation string
 */
export function formatSpellActivation(spell) {
  let result = '';
  if (spell.labels?.activation) result = spell.labels.activation;
  else if (spell.system?.activation?.type) {
    const type = spell.system.activation.type;
    const value = spell.system.activation.value || 1;
    const typeLabel = CONFIG.DND5E.abilityActivationTypes[type];
    if (value === 1 || value === null) result = typeLabel;
    else result = `${value} ${typeLabel}s`;
  }
  return result;
}

/**
 * Format spell school for display
 * @param {Object} spell - The spell object
 * @returns {string} - Formatted school string
 */
export function formatSpellSchool(spell) {
  let result = '';
  if (spell.labels?.school) result = spell.labels.school;
  else if (spell.system?.school) result = genericUtils.getConfigLabel(CONFIG.DND5E.spellSchools, spell.system.school) || spell.system.school;
  return result;
}

/**
 * Format material components for display when consumed
 * @param {Object} spell - The spell object
 * @returns {string} - Formatted material components string
 */
export function formatMaterialComponents(spell) {
  const materials = spell.system?.materials;
  let result = '';
  if (materials && materials.consumed) {
    if (materials.cost && materials.cost > 0) result = game.i18n.format('SPELLBOOK.MaterialComponents.Cost', { cost: materials.cost });
    else if (materials.value) result = materials.value;
    else result = game.i18n.localize('SPELLBOOK.MaterialComponents.UnknownCost');
  }
  return result;
}

/**
 * Create notes icon for spell - always shows, empty or filled based on notes
 * @param {Object} spell - The spell object
 * @returns {string} - HTML for notes icon
 */
export function createNotesIcon(spell) {
  const spellUuid = spell.uuid || spell.compendiumUuid;
  if (!spellUuid) return '';
  const hasNotes = !!(spell.hasNotes || (spell.userData?.notes && spell.userData.notes.trim()));
  const iconClass = hasNotes ? 'fas fa-sticky-note' : 'far fa-sticky-note';
  const tooltip = hasNotes ? game.i18n.localize('SPELLBOOK.UI.HasNotes') : game.i18n.localize('SPELLBOOK.UI.AddNotes');
  return `<i class="${iconClass} spell-notes-icon" data-uuid="${spellUuid}" data-action="editNotes" data-tooltip="${tooltip}" aria-label="${tooltip}"></i>`;
}

/**
 * Get localized preparation mode text
 * @param {string} mode - The preparation mode
 * @returns {string} - Localized preparation mode text
 */
export function getLocalizedPreparationMode(mode) {
  if (!mode) return '';
  const label = genericUtils.getConfigLabel(CONFIG.DND5E.spellPreparationModes, mode);
  if (label) return label;
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

/**
 * Extracts additional spell data for filtering
 * @param {Object} spell - The spell document
 * @returns {Object} - Additional data for filtering
 */
export function extractSpellFilterData(spell) {
  if (!spell) return {};
  const castingTime = extractCastingTime(spell);
  const range = extractRange(spell);
  const damageTypes = extractDamageTypes(spell);
  const isRitual = checkIsRitual(spell);
  const concentration = checkIsConcentration(spell);
  const materialComponents = extractMaterialComponents(spell);
  const requiresSave = checkSpellRequiresSave(spell);
  const conditions = extractSpellConditions(spell);
  return { castingTime, range, damageTypes, isRitual, concentration, materialComponents, requiresSave, conditions, favorited: false };
}

/**
 * Extract casting time information from spell
 * @param {Object} spell - The spell document
 * @returns {Object} - Casting time data
 */
export function extractCastingTime(spell) {
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
export function extractRange(spell) {
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
export function extractDamageTypes(spell) {
  const damageTypes = [];
  if (spell.labels?.damages?.length) for (const damage of spell.labels.damages) if (damage.damageType && !damageTypes.includes(damage.damageType)) damageTypes.push(damage.damageType);
  if (spell.system?.activities) {
    for (const [_key, activity] of Object.entries(spell.system.activities)) {
      if (activity.damage?.parts?.length) {
        for (const part of activity.damage.parts) {
          if (part.types && Array.isArray(part.types) && part.types.length) {
            for (const type of part.types) {
              if (!damageTypes.includes(type)) damageTypes.push(type);
              else if (part[1] && !damageTypes.includes(part[1])) damageTypes.push(part[1]);
            }
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
export function checkIsRitual(spell) {
  if (spell.system?.properties && typeof spell.system.properties.has === 'function') return spell.system.properties.has('ritual');
  if (spell.system?.properties && Array.isArray(spell.system.properties)) {
    if (spell.system.properties.includes('ritual')) return true;
    return spell.system.properties.some((prop) => (typeof prop === 'object' && prop.value === 'ritual') || (typeof prop === 'string' && prop === 'ritual'));
  }
  if (spell.system?.components?.ritual) return true;
  if (spell.labels?.components?.tags?.includes(game.i18n.localize('DND5E.Item.Property.Ritual'))) return true;
  return false;
}

/**
 * Check if spell requires concentration
 * @param {Object} spell - The spell document
 * @returns {boolean} - Whether the spell requires concentration
 */
export function checkIsConcentration(spell) {
  if (spell.system.duration?.concentration) return true;
  return spell.system.properties && Array.isArray(spell.system.properties) && spell.system.properties.includes('concentration');
}

/**
 * Extract material component information from spell
 * @param {Object} spell - The spell document
 * @returns {Object} - Material component data
 */
export function extractMaterialComponents(spell) {
  const materials = spell.system?.materials || {};
  return { consumed: !!materials.consumed, cost: materials.cost || 0, value: materials.value || '', hasConsumedMaterials: !!materials.consumed };
}

/**
 * Check if a spell requires a saving throw
 * @param {Object} spell - The spell document
 * @returns {boolean} - Whether the spell requires a save
 */
export function checkSpellRequiresSave(spell) {
  let result = false;
  if (spell.system?.activities) {
    for (const [_key, activity] of Object.entries(spell.system.activities)) {
      if (activity.value?.type === 'save') {
        result = true;
        break;
      }
    }
  }
  if (!result && spell.system?.description?.value) {
    const saveText = game.i18n.localize('SPELLBOOK.Filters.SavingThrow').toLowerCase();
    if (spell.system.description.value.toLowerCase().includes(saveText)) result = true;
  }
  return result;
}

/**
 * Extract conditions that might be applied by a spell
 * @param {Object} spell - The spell document
 * @returns {string[]} - Array of condition keys
 */
export function extractSpellConditions(spell) {
  const conditions = [];
  const description = spell.system?.description?.value || '';
  if (description && CONFIG.DND5E.conditionTypes) {
    const lowerDesc = description.toLowerCase();
    for (const [key, condition] of Object.entries(CONFIG.DND5E.conditionTypes)) {
      if (condition.pseudo) continue;
      const conditionLabel = genericUtils.getConfigLabel(CONFIG.DND5E.conditionTypes, key);
      if (conditionLabel && lowerDesc.includes(conditionLabel.toLowerCase())) conditions.push(key);
    }
  }
  return conditions;
}

/**
 * Create a spell icon link
 * @param {Object} spell - The spell data object
 * @returns {string} - HTML string with icon link
 */
export function createSpellIconLink(spell) {
  if (!spell) return '';
  const uuid = spell.compendiumUuid || spell.uuid || spell?._stats?.compendiumSource || spell?.system?.parent?.uuid;
  const parsed = foundry.utils.parseUuid(uuid);
  const itemId = parsed.id || '';
  const entityType = parsed.type || 'Item';
  let packId = '';
  if (parsed.collection) packId = parsed.collection.collection || '';
  const result = `<a class="content-link"
  draggable="true"
  data-link=""
  data-uuid="${uuid}"
  data-id="${itemId}"
  data-type="${entityType}"
  data-pack="${packId}"
  data-tooltip="${spell.name}">
  <img src="${spell.img}"
  class="spell-icon"
  alt="${spell.name}
  icon"></a>`
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}
