/**
 * Spell Display Formatting and Processing Utilities
 *
 * This module provides utilities for formatting and processing spell data
 * for display purposes within the Spell Book module. It handles transformation of raw
 * spell data into display-ready formats, extraction of filterable metadata, and creation
 * of formatted presentation elements.
 * @module UIUtils/SpellFormatting
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from './_module.mjs';

/**
 * Process spell list data for display.
 * @param {object} spellList - The spell list to process
 * @param {Map<string, any>|null} [classFolderCache] - Cache of class folders keyed by pack:identifier
 * @param {Array<object> | null} [availableSpellLists] - Array of available spell list metadata objects
 * @param {Set<string>} [enabledElements] - Set of enabled element names. If not provided, will check settings for each element.
 * @returns {object} Processed spell list with display data
 */
export function processSpellListForDisplay(spellList, classFolderCache = null, availableSpellLists = null, enabledElements = null) {
  log(3, 'Processing spell list for display.', { spellListName: spellList.document?.name, isCustom: !!spellList.document?.flags?.[MODULE.ID]?.isCustom });
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
  if (spellList.spellsByLevel?.length) {
    processed.spellsByLevel = spellList.spellsByLevel.map((level) => ({ ...level, spells: level.spells.map((spell) => processSpellItemForDisplay(spell, enabledElements)) }));
  }
  log(3, 'Spell list processed for display.', { isPlayerSpellbook: processed.isPlayerSpellbook, spellLevels: processed.spellsByLevel?.length });
  return processed;
}

/**
 * Process spell item for display in the GM interface.
 * @param {object} spell - The spell to process
 * @param {Set<string>} [enabledElements] - Set of enabled element names. If not provided, will check settings for each element.
 * @returns {object} Processed spell with display data
 */
export function processSpellItemForDisplay(spell, enabledElements = null) {
  const processed = foundry.utils.deepClone(spell);
  processed.cssClasses = 'spell-item';
  processed.dataAttributes = `data-uuid="${spell.uuid}"`;
  processed.showCompare = enabledElements ? enabledElements.has('compare') : UIUtils.CustomUI.isGMElementEnabled('compare');
  processed.formattedDetails = UIUtils.CustomUI.buildGMMetadata(spell, enabledElements);
  return processed;
}

/**
 * Format spell components for display. Uses spell.labels computed by dnd5e (for documents)
 * or compendium-processor (for index data).
 * @param {object} spell - The spell object
 * @returns {string} Formatted components string (e.g., "V, S, M")
 */
export function formatSpellComponents(spell) {
  // dnd5e documents provide labels.components.all with { abbr } objects
  if (spell.labels?.components?.all) {
    return spell.labels.components.all.map((c) => c.abbr).join(', ');
  }
  // compendium-processor index data provides labels.components.vsm as string
  return spell.labels?.components?.vsm || '';
}

/**
 * Format spell activation for display. Uses spell.labels computed by dnd5e (for documents)
 * or compendium-processor (for index data).
 * @param {object} spell - The spell object
 * @returns {string} Formatted activation string (e.g., "1 Action", "2 Bonus Actions")
 */
export function formatSpellActivation(spell) {
  return spell.labels?.activation || '';
}

/**
 * Format spell school for display. Uses spell.labels computed by dnd5e (for documents)
 * or compendium-processor (for index data).
 * @param {object} spell - The spell object
 * @returns {string} Formatted school string (e.g., "Evocation", "Divination")
 */
export function formatSpellSchool(spell) {
  return spell.labels?.school || '';
}

/**
 * Format spell level for display. Uses spell.labels computed by dnd5e (for documents)
 * or compendium-processor (for index data).
 * @param {object} spell - The spell object containing level information
 * @returns {string} Formatted spell level string (e.g., "Cantrip", "1st Level")
 */
export function formatSpellLevel(spell) {
  return spell.labels?.level || '';
}

/**
 * Format spell range for display.
 * @param {object} spell - The spell object containing range information
 * @param {object} actor - Current actor
 * @returns {string} Formatted range string (e.g., "Touch", "30 feet", "Self")
 */
export function formatSpellRange(spell, actor) {
  const range = spell.system.range;
  if (range.units === 'self') return game.i18n.localize('DND5E.DistSelf');
  if (range.units === 'touch') return game.i18n.localize('DND5E.DistTouch');
  if (range.units === 'spec') return game.i18n.localize('DND5E.Special');
  if (range.units === 'any') return game.i18n.localize('DND5E.DistAny');
  if (range.value && range.units) {
    const rangeValue = dnd5e.utils.simplifyBonus(range.value, actor);
    const unitLabel = CONFIG.DND5E?.movementUnits?.[range.units]?.label || range.units;
    return `${rangeValue} ${unitLabel}`;
  }
  if (spell.labels?.range) return spell.labels.range;
  return '';
}

/**
 * Format material components for display when consumed. Uses spell.labels computed by dnd5e (for documents)
 * or compendium-processor (for index data).
 * @param {object} spell - The spell object
 * @returns {string} Formatted material components string with cost information
 */
export function formatMaterialComponents(spell) {
  return spell.labels?.materials || '';
}

/**
 * Get localized preparation mode text.
 * @param {string} mode - The preparation mode identifier
 * @returns {string} Localized preparation mode text (e.g., "Prepared", "Known")
 */
export function getLocalizedPreparationMode(mode) {
  if (!mode) return '';
  const label = DataUtils.getConfigLabel(CONFIG.DND5E.spellcasting, mode);
  if (label) return label;
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

/**
 * Extracts additional spell data for filtering.
 * @param {object} spell - The spell document
 * @returns {object} Additional data for filtering
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
  const source = extractSpellSource(spell);
  const result = { castingTime, range, damageTypes, isRitual, concentration, materialComponents, requiresSave, conditions, favorited: false, spellSource: source.label, spellSourceId: source.id };
  return result;
}

/**
 * Extract casting time information from spell.
 * @param {object} spell - The spell document
 * @returns {object} Casting time data structure
 */
export function extractCastingTime(spell) {
  return { value: spell.system?.activation?.value || '', type: spell.system?.activation?.type || '', label: spell.labels?.activation || '' };
}

/**
 * Extract range information from spell.
 * @param {object} spell - The spell document
 * @returns {object} Range data structure
 */
export function extractRange(spell) {
  return { units: spell.system?.range?.units || '', label: spell.labels?.range || '' };
}

/**
 * Extract damage types from spell.
 * @param {object} spell - The spell document
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
 * Check if a spell has a specific property. Handles both Set (document) and Array (index data).
 * @param {object} spell - The spell document or index data
 * @param {string} property - The property to check (e.g., 'ritual', 'concentration', 'vocal')
 * @returns {boolean} Whether the spell has the property
 */
export function hasSpellProperty(spell, property) {
  const props = spell?.system?.properties;
  if (!props) return false;
  return props.has?.(property) ?? props.includes?.(property) ?? false;
}

/**
 * Check if spell is a ritual.
 * @param {object} spell - The spell document or index data
 * @returns {boolean} Whether the spell is a ritual
 */
export function checkIsRitual(spell) {
  return hasSpellProperty(spell, 'ritual');
}

/**
 * Check if spell requires concentration.
 * @param {object} spell - The spell document or index data
 * @returns {boolean} Whether the spell requires concentration
 */
export function checkIsConcentration(spell) {
  return hasSpellProperty(spell, 'concentration');
}

/**
 * Extract material component information from spell.
 * @param {object} spell - The spell document
 * @returns {object} Material component data structure
 */
export function extractMaterialComponents(spell) {
  const materials = spell.system?.materials || {};
  return { consumed: materials.consumed, cost: materials.cost || 0, value: materials.value || '', hasConsumedMaterials: !!materials.consumed };
}

/**
 * Check if a spell requires a saving throw.
 * @param {object} spell - The spell document
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
 * @param {object} spell - The spell document
 * @returns {Array<string>} Array of condition identifiers
 */
export function extractSpellConditions(spell) {
  const conditions = [];
  const description = spell.system?.description?.value || '';
  if (description && CONFIG.DND5E.conditionTypes) {
    const lowerDesc = description.toLowerCase();
    for (const [key, condition] of Object.entries(CONFIG.DND5E.conditionTypes)) {
      if (condition.pseudo) continue;
      const conditionLabel = DataUtils.getConfigLabel(CONFIG.DND5E.conditionTypes, key);
      if (conditionLabel && lowerDesc.includes(conditionLabel.toLowerCase())) conditions.push(key);
    }
  }
  return conditions;
}

/**
 * Extract spell source information from spell data.
 * @param {object} spell - The spell object to extract source from
 * @returns {object} Spell source data with label and normalized ID
 */
function extractSpellSource(spell) {
  let spellSource = spell.system?.source?.custom || spell.system?.source?.book;
  const noSourceLabel = game.i18n.localize('SPELLMANAGER.Filters.NoSource');
  if (!spellSource || spellSource.trim() === '') spellSource = noSourceLabel;
  return { label: spellSource, id: spellSource === noSourceLabel ? 'no-source' : spellSource };
}

/**
 * Create a spell icon link.
 * @param {object} spell - The spell data object
 * @returns {string} HTML string with icon link
 */
export function createSpellIconLink(spell) {
  const uuid = spell.compendiumUuid || spell?._stats?.compendiumSource || spell.uuid;
  let doc = fromUuidSync(uuid);
  if (uuid.startsWith('Compendium.') && !(doc instanceof foundry.abstract.Document)) {
    const { collection } = foundry.utils.parseUuid(uuid);
    const cls = collection.documentClass;
    doc = new cls(foundry.utils.deepClone(doc), { pack: collection.metadata.id });
  }
  const parsed = foundry.utils.parseUuid(uuid);
  const itemId = parsed.id;
  const entityType = parsed.type;
  let packId;
  if (parsed.collection) packId = parsed.collection.collection;
  const result = `<a class="content-link" draggable="true" data-link="" data-uuid="${uuid}" data-id="${itemId}" data-type="${entityType}" data-pack="${packId}" data-tooltip="${spell.name}">
    <img src="${spell.img}" class="spell-icon" alt="${spell.name} icon">
  </a>`
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}

/**
 * Get data attributes for a spell item.
 * @param {object} spell - The spell object
 * @returns {string} HTML-ready data attributes
 */
export function getSpellDataAttributes(spell) {
  const attributes = [
    `data-spell-uuid="${spell.compendiumUuid}"`,
    `data-spell-level="${spell.system.level || 0}"`,
    `data-spell-school="${spell.system?.school || ''}"`,
    `data-casting-time-type="${spell.filterData?.castingTime?.type || ''}"`,
    `data-casting-time-value="${spell.filterData?.castingTime?.value || ''}"`,
    `data-range-units="${spell.filterData?.range?.units || ''}"`,
    `data-range-value="${spell.system?.range?.value || ''}"`,
    `data-damage-types="${spell.filterData?.damageTypes || ''}"`,
    `data-ritual="${spell.filterData?.isRitual || false}"`,
    `data-favorited="${spell.filterData?.favorited || false}"`,
    `data-concentration="${spell.filterData?.concentration || false}"`,
    `data-requires-save="${spell.filterData?.requiresSave || false}"`,
    `data-conditions="${spell.filterData?.conditions || ''}"`,
    `data-material-components="${spell.filterData?.materialComponents?.hasConsumedMaterials || false}"`
  ];
  if (spell.sourceClass) attributes.push(`data-source-class="${spell.sourceClass}"`);
  return attributes.join(' ');
}

/**
 * Get the preparation tags for a spell.
 * @param {object} spell - The spell object
 * @param {object} actor - The actor (needed for granted item lookups and class data)
 * @returns {Array} Array of tag objects with cssClass, text, and tooltip properties
 */
export function getSpellPreparationTags(spell, actor) {
  log(3, 'Getting spell tag(s)', { spellName: spell.name, flags: spell.flags, system: spell.system, preparation: spell.preparation, aggregatedModes: spell.aggregatedModes });
  const tags = [];
  const sourceClass = spell.system?.sourceClass || spell.sourceClass;
  const modes = spell.aggregatedModes;
  if (modes?.hasPrepared) tags.push({ cssClass: 'prepared', text: game.i18n.localize('SPELLBOOK.Preparation.Prepared'), tooltip: game.i18n.localize('SPELLBOOK.Preparation.PreparedTooltip') });
  if (modes?.hasPact) tags.push({ cssClass: 'pact', text: game.i18n.localize('SPELLBOOK.Preparation.Pact'), tooltip: game.i18n.localize('SPELLBOOK.SpellSource.PactMagic') });
  if (modes?.hasAlwaysPrepared) {
    let tooltip = game.i18n.localize('SPELLBOOK.Preparation.AlwaysTooltip');
    if (sourceClass && actor?.spellcastingClasses?.[sourceClass]) {
      const spellcastingData = actor.spellcastingClasses[sourceClass];
      const classItem = actor.items.get(spellcastingData.id);
      if (classItem?.type === 'subclass') tooltip = classItem.name;
      else if (classItem?.type === 'class') {
        const subclass = actor.items.find((i) => i.type === 'subclass' && i.system?.classIdentifier === sourceClass);
        tooltip = subclass?.name || classItem.name;
      }
    }
    tags.push({ cssClass: 'always-prepared', text: game.i18n.localize('SPELLBOOK.Preparation.Always'), tooltip: tooltip });
  }
  if (modes?.hasGranted) {
    const cachedFor = spell.flags?.dnd5e?.cachedFor;
    const itemId = foundry.utils.parseUuid(cachedFor, { relative: actor }).embedded?.[1];
    const grantingItem = actor?.items.get(itemId);
    if (DataUtils.isGrantingItemActive(grantingItem)) tags.push({ cssClass: 'granted', text: game.i18n.localize('SPELLBOOK.SpellSource.Granted'), tooltip: grantingItem?.name || '' });
  }
  if (modes?.hasInnate) tags.push({ cssClass: 'innate', text: game.i18n.localize('SPELLBOOK.Preparation.Innate'), tooltip: game.i18n.localize('SPELLBOOK.Preparation.InnateTooltip') });
  if (modes?.hasRitual) tags.push({ cssClass: 'ritual', text: game.i18n.localize('SPELLBOOK.Preparation.Ritual'), tooltip: game.i18n.localize('SPELLBOOK.Preparation.RitualTooltip') });
  if (modes?.hasAtWill) tags.push({ cssClass: 'atwill', text: game.i18n.localize('SPELLBOOK.Preparation.AtWill'), tooltip: game.i18n.localize('SPELLBOOK.Preparation.AtWillTooltip') });
  return tags;
}
