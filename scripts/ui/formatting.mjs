/**
 * Spell Display Formatting and Processing Utilities
 *
 * This module provides utilities for formatting and processing spell data
 * for display purposes within the Spell Book module. It handles transformation of raw
 * spell data into display-ready formats, extraction of filterable metadata, and creation
 * of formatted presentation elements.
 *
 * The module serves as the primary interface between raw spell data and the various
 * UI components that display spell information. It provides consistent formatting
 * across different contexts and ensures proper handling of D&D 5e spell properties.
 *
 * Key features include:
 * - Spell list processing with metadata enhancement
 * - Individual spell item formatting for GM and player interfaces
 * - Component, activation, and school formatting with localization
 * - Spell metadata extraction for filtering systems
 * - Material component processing with cost calculation
 * - Condition and damage type extraction from spell descriptions
 * - Icon link generation with proper UUID handling
 * - Integration with D&D 5e configuration data
 *
 * The utilities handle various spell data formats and provide fallback mechanisms
 * for incomplete or legacy spell data structures.
 *
 * @module UIHelpers/SpellFormatting
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import * as UIHelpers from './_module.mjs';

/**
 * Processed spell list structure with enhanced metadata for display.
 *
 * @typedef {Object} ProcessedSpellList
 * @property {boolean} isCustomList - Whether this is a custom/user-created spell list
 * @property {boolean} canRestore - Whether the list can be restored from original
 * @property {string} [originalUuid] - UUID of the original list if this is a duplicate
 * @property {string} [actorId] - Associated actor ID if this is a player spellbook
 * @property {boolean} isPlayerSpellbook - Whether this represents a player's spellbook
 * @property {string} [identifier] - System identifier for class spell lists
 * @property {boolean} isMerged - Whether this list was created by merging multiple lists
 * @property {boolean} isClassSpellList - Whether this is a standard class spell list
 * @property {Array<ProcessedSpellLevel>} [spellsByLevel] - Spells organized by level
 */

/**
 * Processed spell level grouping with enhanced spell data.
 *
 * @typedef {Object} ProcessedSpellLevel
 * @property {number} level - Spell level (0-9)
 * @property {Array<ProcessedSpellItem>} spells - Spells at this level
 */

/**
 * Processed spell item structure with display enhancements.
 *
 * @typedef {Object} ProcessedSpellItem
 * @property {string} compendiumUuid - Canonical compendium UUID for the spell
 * @property {string} cssClasses - CSS classes for styling the spell item
 * @property {string} dataAttributes - HTML data attributes for the spell element
 * @property {boolean} showCompare - Whether to show comparison functionality
 * @property {string} formattedDetails - Formatted metadata string for display
 */

/**
 * Spell casting time information structure.
 *
 * @typedef {Object} CastingTimeData
 * @property {string|number} value - Numeric value for casting time
 * @property {string} type - Type of action (action, bonus, reaction, etc.)
 * @property {string} label - Formatted display label for casting time
 */

/**
 * Spell range information structure.
 *
 * @typedef {Object} RangeData
 * @property {string} units - Range units (feet, miles, touch, etc.)
 * @property {string} label - Formatted display label for range
 */

/**
 * Material component information structure.
 *
 * @typedef {Object} MaterialComponentData
 * @property {boolean} consumed - Whether materials are consumed when cast
 * @property {number} cost - Gold piece cost of materials
 * @property {string} value - Description of material components
 * @property {boolean} hasConsumedMaterials - Whether spell has consumed materials
 */

/**
 * spell filter data structure.
 *
 * @typedef {Object} SpellFilterData
 * @property {CastingTimeData} castingTime - Casting time information
 * @property {RangeData} range - Range information
 * @property {Array<string>} damageTypes - Array of damage type identifiers
 * @property {boolean} isRitual - Whether the spell can be cast as a ritual
 * @property {boolean} concentration - Whether the spell requires concentration
 * @property {MaterialComponentData} materialComponents - Material component data
 * @property {boolean} requiresSave - Whether the spell requires a saving throw
 * @property {Array<string>} conditions - Array of condition identifiers the spell may inflict
 * @property {boolean} favorited - Whether the spell is marked as favorite
 */

/**
 * Process spell list data for display.
 * @param {Object} spellList - The spell list to process
 * @param {Map<string, any>|null} [classFolderCache=null] - Cache of class folders keyed by pack:identifier
 * @param {Array<Object>|null} [availableSpellLists=null] - Array of available spell list metadata objects
 * @returns {ProcessedSpellList} Processed spell list with display data
 */
export function processSpellListForDisplay(spellList, classFolderCache = null, availableSpellLists = null) {
  const processed = foundry.utils.deepClone(spellList);
  processed.isCustomList = !!spellList.document?.flags?.[MODULE.ID]?.isCustom || !!spellList.document?.flags?.[MODULE.ID]?.isDuplicate;
  processed.canRestore = !!(processed.isCustomList && spellList.document.flags?.[MODULE.ID]?.originalUuid);
  processed.originalUuid = spellList.document.flags?.[MODULE.ID]?.originalUuid;
  processed.actorId = spellList.document.flags?.[MODULE.ID]?.actorId;
  processed.isPlayerSpellbook = !!processed.actorId;
  processed.identifier = spellList.document.system?.identifier;
  const typeKey = spellList.document.system?.type === 'subclass' ? 'TYPES.Item.subclass' : 'TYPES.Item.class';
  processed.classType = game.i18n.localize(typeKey);
  processed.isMerged = !!spellList.document?.flags?.[MODULE.ID]?.isMerged;
  processed.isClassSpellList = false;
  if (processed.identifier && !processed.isPlayerSpellbook && !processed.isMerged && classFolderCache && availableSpellLists) {
    let spellListMeta = availableSpellLists.find((list) => list.uuid === spellList.uuid);
    if (!spellListMeta || (spellListMeta.isCustom && processed.originalUuid)) if (processed.originalUuid) spellListMeta = availableSpellLists.find((list) => list.uuid === processed.originalUuid);
    if (spellListMeta?.pack) {
      const key = `${spellListMeta.pack}:${processed.identifier.toLowerCase()}`;
      processed.isClassSpellList = classFolderCache.has(key);
    }
  }
  if (spellList.spellsByLevel?.length) processed.spellsByLevel = spellList.spellsByLevel.map((level) => ({ ...level, spells: level.spells.map((spell) => processSpellItemForDisplay(spell)) }));
  return processed;
}

/**
 * Process spell item for display in the GM interface.
 * @param {Object} spell - The spell to process
 * @returns {ProcessedSpellItem} Processed spell with display data
 */
export function processSpellItemForDisplay(spell) {
  const processed = foundry.utils.deepClone(spell);
  processed.cssClasses = 'spell-item';
  processed.dataAttributes = `data-uuid="${spell.uuid}"`;
  processed.showCompare = UIHelpers.CustomUI.isGMElementEnabled('compare');
  processed.formattedDetails = UIHelpers.CustomUI.buildGMMetadata(spell);
  return processed;
}

/**
 * Format spell components for display.
 * @param {Object} spell - The spell object
 * @returns {string} Formatted components string (e.g., "V, S, M")
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
 * Format spell activation for display.
 * @param {Object} spell - The spell object
 * @returns {string} Formatted activation string (e.g., "1 Action", "2 Bonus Actions")
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
 * Format spell school for display.
 * @param {Object} spell - The spell object
 * @returns {string} Formatted school string (e.g., "Evocation", "Divination")
 */
export function formatSpellSchool(spell) {
  let result = '';
  if (spell.labels?.school) result = spell.labels.school;
  else if (spell.system?.school) result = DataHelpers.getConfigLabel(CONFIG.DND5E.spellSchools, spell.system.school) || spell.system.school;
  return result;
}

/**
 * Format spell level for display.
 * @param {Object} spell - The spell object containing level information
 * @returns {string} Formatted spell level string (e.g., "Cantrip", "1st Level")
 */
export function formatSpellLevel(spell) {
  if (spell.system?.level === undefined) return '';
  const level = spell.system.level;
  if (level === 0) return game.i18n.localize('DND5E.SpellCantrip');
  return CONFIG.DND5E?.spellLevels?.[level] || `${level}`;
}

/**
 * Format spell range for display.
 * @param {Object} spell - The spell object containing range information
 * @returns {string} Formatted range string (e.g., "Touch", "30 feet", "Self")
 */
export function formatSpellRange(spell) {
  if (!spell.system?.range) return '';
  const range = spell.system.range;
  if (range.units === 'self') return game.i18n.localize('DND5E.DistSelf');
  if (range.units === 'touch') return game.i18n.localize('DND5E.DistTouch');
  if (range.units === 'spec') return game.i18n.localize('DND5E.Special');
  if (range.value && range.units) {
    const unitLabel = CONFIG.DND5E?.movementUnits?.[range.units]?.label || range.units;
    return `${range.value} ${unitLabel}`;
  }
  return '';
}

/**
 * Format material components for display when consumed.
 * @param {Object} spell - The spell object
 * @returns {string} Formatted material components string with cost information
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
 * Get localized preparation mode text.
 * @param {string} mode - The preparation mode identifier
 * @returns {string} Localized preparation mode text (e.g., "Prepared", "Known")
 */
export function getLocalizedPreparationMode(mode) {
  if (!mode) return '';
  const label = DataHelpers.getConfigLabel(CONFIG.DND5E.spellcasting, mode);
  if (label) return label;
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

/**
 * Extracts additional spell data for filtering.
 * @param {Object} spell - The spell document
 * @returns {SpellFilterData} Additional data for filtering
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
  const spellSource = extractSpellSource(spell);
  return { castingTime, range, damageTypes, isRitual, concentration, materialComponents, requiresSave, conditions, favorited: false, spellSource: spellSource.label, spellSourceId: spellSource.id };
}

/**
 * Extract casting time information from spell.
 * @param {Object} spell - The spell document
 * @returns {CastingTimeData} Casting time data structure
 */
export function extractCastingTime(spell) {
  return { value: spell.system?.activation?.value || '', type: spell.system?.activation?.type || '', label: spell.labels?.activation || '' };
}

/**
 * Extract range information from spell.
 * @param {Object} spell - The spell document
 * @returns {RangeData} Range data structure
 */
export function extractRange(spell) {
  return { units: spell.system?.range?.units || '', label: spell.labels?.range || '' };
}

/**
 * Extract damage types from spell.
 * @param {Object} spell - The spell document
 * @returns {Array<string>} Array of damage type identifiers
 */
export function extractDamageTypes(spell) {
  const damageTypes = [];
  if (spell.labels?.damages?.length) for (const damage of spell.labels.damages) if (damage.damageType && !damageTypes.includes(damage.damageType)) damageTypes.push(damage.damageType);
  if (spell.system?.activities) {
    for (const activity of Object.values(spell.system.activities)) {
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
 * Check if spell is a ritual.
 * @param {Object} spell - The spell document
 * @returns {boolean} Whether the spell is a ritual
 */
export function checkIsRitual(spell) {
  if (spell.system?.properties && typeof spell.system.properties.has === 'function') return spell.system.properties.has('ritual');
  if (spell.system?.properties && Array.isArray(spell.system.properties)) {
    if (spell.system.properties.includes('ritual')) return true;
    return spell.system.properties.some((prop) => (typeof prop === 'object' && prop.value === 'ritual') || (typeof prop === 'string' && prop === 'ritual'));
  }
  if (spell.system?.components?.ritual) return true;
  if (spell.labels?.components?.tags?.includes(game.i18n.localize('DND5E.ITEM.Property.Ritual'))) return true;
  return false;
}

/**
 * Check if spell requires concentration.
 * @param {Object} spell - The spell document
 * @returns {boolean} Whether the spell requires concentration
 */
export function checkIsConcentration(spell) {
  if (spell.system.duration?.concentration) return true;
  return spell.system.properties && Array.isArray(spell.system.properties) && spell.system.properties.includes('concentration');
}

/**
 * Extract material component information from spell.
 * @param {Object} spell - The spell document
 * @returns {MaterialComponentData} Material component data structure
 */
export function extractMaterialComponents(spell) {
  const materials = spell.system?.materials || {};
  const result = { consumed: materials.consumed, cost: materials.cost || 0, value: materials.value || '', hasConsumedMaterials: !!materials.consumed };
  return result;
}

/**
 * Check if a spell requires a saving throw.
 * @param {Object} spell - The spell document
 * @returns {boolean} Whether the spell requires a save
 */
export function checkSpellRequiresSave(spell) {
  let result = false;
  if (spell.system?.activities) {
    for (const activity of Object.values(spell.system.activities)) {
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
 * Extract conditions that might be applied by a spell.
 * @param {Object} spell - The spell document
 * @returns {Array<string>} Array of condition identifiers
 */
export function extractSpellConditions(spell) {
  const conditions = [];
  const description = spell.system?.description?.value || '';
  if (description && CONFIG.DND5E.conditionTypes) {
    const lowerDesc = description.toLowerCase();
    for (const [key, condition] of Object.entries(CONFIG.DND5E.conditionTypes)) {
      if (condition.pseudo) continue;
      const conditionLabel = DataHelpers.getConfigLabel(CONFIG.DND5E.conditionTypes, key);
      if (conditionLabel && lowerDesc.includes(conditionLabel.toLowerCase())) conditions.push(key);
    }
  }
  return conditions;
}

/**
 * Extract spell source information from spell data.
 * @param {Object} spell - The spell object to extract source from
 * @returns {Object} Spell source data with label and normalized ID
 */
function extractSpellSource(spell) {
  let spellSource = spell.system?.source?.custom || spell.system?.source?.book;
  const noSourceLabel = game.i18n.localize('SPELLMANAGER.Filters.NoSource');
  if (!spellSource || spellSource.trim() === '') spellSource = noSourceLabel;
  return { label: spellSource, id: spellSource === noSourceLabel ? 'no-source' : spellSource };
}

/**
 * Create a spell icon link.
 * @param {Object} spell - The spell data object
 * @returns {string} HTML string with icon link
 */
export function createSpellIconLink(spell) {
  if (!spell) return '';
  const uuid = spell.compendiumUuid || spell?._stats?.compendiumSource || spell.uuid;
  const parsed = foundry.utils.parseUuid(uuid);
  const itemId = parsed.id || '';
  const entityType = parsed.type || 'Item';
  let packId = '';
  if (parsed.collection) packId = parsed.collection.collection || '';
  const result = `<a class="content-link"  draggable="true" data-link="" data-uuid="${uuid}" data-id="${itemId}" data-type="${entityType}" data-pack="${packId}" data-tooltip="${spell.name}">
    <img src="${spell.img}" class="spell-icon" alt="${spell.name}icon">
  </a>`
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}
