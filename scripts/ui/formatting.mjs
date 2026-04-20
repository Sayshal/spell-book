/**
 * Spell Display Formatting and Processing Utilities
 * Transforms raw spell data into display-ready formats, extracts filterable
 * metadata, and creates formatted presentation elements.
 */

import { MODULE } from '../constants.mjs';
import { getConfigLabel, getSpellSourceDocument, isGrantingItemActive } from '../data/_module.mjs';
import { ClassManager } from '../managers/class-manager.mjs';
import { log } from '../utils/logger.mjs';
import { buildGMMetadata, isGMElementEnabled } from './custom-ui.mjs';

/**
 * Process spell list data for display.
 * @param {object} spellList - The spell list to process
 * @param {Map<string, any>|null} [classFolderCache] - Cache of class folders keyed by pack:identifier
 * @param {Array<object>|null} [availableSpellLists] - Array of available spell list metadata objects
 * @param {Set<string>} [enabledElements] - Set of enabled element names
 * @returns {object} Processed spell list with display data
 */
export function processSpellListForDisplay(spellList, classFolderCache = null, availableSpellLists = null, enabledElements = null) {
  log(3, 'Processing spell list for display.', { spellListName: spellList.document?.name, isCustom: !!spellList.document?.flags?.[MODULE.ID]?.isCustom });
  const processed = { ...spellList };
  processed.isCustomList = !!spellList.document?.flags?.[MODULE.ID]?.isCustom || !!spellList.document?.flags?.[MODULE.ID]?.isDuplicate;
  processed.canRestore = !!(processed.isCustomList && spellList.document.flags?.[MODULE.ID]?.originalUuid);
  processed.originalUuid = spellList.document.flags?.[MODULE.ID]?.originalUuid;
  processed.actorId = spellList.document.flags?.[MODULE.ID]?.actorId;
  processed.isPlayerSpellbook = !!processed.actorId;
  processed.identifier = spellList.document.system?.identifier;
  const typeKey = spellList.document.system?.type === 'subclass' ? 'TYPES.Item.subclass' : 'TYPES.Item.class';
  processed.classType = _loc(typeKey);
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
 * @param {Set<string>} [enabledElements] - Set of enabled element names
 * @returns {object} Processed spell with display data
 */
export function processSpellItemForDisplay(spell, enabledElements = null) {
  const processed = { ...spell };
  processed.cssClasses = 'spell-item';
  processed.dataAttributes = `data-uuid="${spell.uuid}"`;
  processed.showCompare = enabledElements ? enabledElements.has('compare') : isGMElementEnabled('compare');
  processed.formattedDetails = buildGMMetadata(spell, enabledElements);
  return processed;
}

/**
 * Format spell components for display.
 * @param {object} spell - The spell object
 * @returns {string} Formatted components string (e.g., "V, S, M")
 */
export function formatSpellComponents(spell) {
  if (spell.labels?.components?.all) return spell.labels.components.all.map((c) => c.abbr).join(', ');
  return spell.labels?.components?.vsm || '';
}

/**
 * Format spell activation for display.
 * @param {object} spell - The spell object
 * @returns {string} Formatted activation string (e.g., "1 Action")
 */
export function formatSpellActivation(spell) {
  return spell.labels?.activation || '';
}

/**
 * Format spell school for display.
 * @param {object} spell - The spell object
 * @returns {string} Formatted school string (e.g., "Evocation")
 */
export function formatSpellSchool(spell) {
  return spell.labels?.school || '';
}

/**
 * Format spell level for display.
 * @param {object} spell - The spell object
 * @returns {string} Formatted spell level string (e.g., "Cantrip", "1st Level")
 */
export function formatSpellLevel(spell) {
  return spell.labels?.level || '';
}

/**
 * Format spell range for display.
 * @param {object} spell - The spell object
 * @param {object} actor - Current actor
 * @returns {string} Formatted range string (e.g., "Touch", "30 feet", "Self")
 */
export function formatSpellRange(spell, actor) {
  const range = spell.system.range;
  if (range.units === 'self') return _loc('DND5E.DistSelf');
  if (range.units === 'touch') return _loc('DND5E.DistTouch');
  if (range.units === 'spec') return _loc('DND5E.Special');
  if (range.units === 'any') return _loc('DND5E.DistAny');
  if (range.value && range.units) {
    const rangeValue = dnd5e.utils.simplifyBonus(range.value, actor);
    const unitLabel = CONFIG.DND5E?.movementUnits?.[range.units]?.label || range.units;
    return `${rangeValue} ${unitLabel}`;
  }
  if (spell.labels?.range) return spell.labels.range;
  return '';
}

/**
 * Format material components for display when consumed.
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
  const label = getConfigLabel(CONFIG.DND5E.spellcasting, mode);
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
  const target = extractTarget(spell);
  return {
    castingTime,
    range,
    damageTypes,
    isRitual,
    concentration,
    materialComponents,
    requiresSave,
    conditions,
    target,
    favorited: false,
    spellSource: source.label,
    spellSourceId: source.id
  };
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
  const value = Number(spell.system?.range?.value);
  return { units: spell.system?.range?.units || '', label: spell.labels?.range || '', value: Number.isFinite(value) ? value : 0 };
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
          const types = part.types;
          if (types && (types.size || types.length)) for (const type of types) if (!damageTypes.includes(type)) damageTypes.push(type);
        }
      }
      if (activity.healing?.types) {
        const types = activity.healing.types;
        if (types.size || types.length) for (const type of types) if (!damageTypes.includes(type)) damageTypes.push(type);
      }
    }
  }
  return damageTypes;
}

/**
 * Check if a spell has a specific property. Handles both Set (document) and Array (index data).
 * @param {object} spell - The spell document or index data
 * @param {string} property - The property to check (e.g., 'ritual', 'concentration')
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
  const value = materials.value || '';
  const cost = materials.cost || 0;
  return { consumed: materials.consumed, cost, value, hasConsumedMaterials: !!materials.consumed, hasCostlyMaterials: hasCostlyMaterials(spell, value, cost) };
}

/**
 * Heuristically determine whether a spell's material components have a cost,
 * either from `system.materials.cost`, from the spell's description, or from the materials
 * free-text description (matching localized "consumes" / "gp" phrasing).
 * @param {object} spell - The spell document
 * @param {string} materialsValue - Free-text from system.materials.value
 * @param {number} cost - Numeric cost from system.materials.cost
 * @returns {boolean} Whether the spell requires costly materials
 */
function hasCostlyMaterials(spell, materialsValue, cost) {
  if (cost > 0) return true;
  const haystacks = [materialsValue, spell.system?.description?.value].filter(Boolean).map((s) => String(s).toLowerCase());
  if (!haystacks.length) return false;
  const consumeKeyword = _loc('SPELLBOOK.Filters.Materials.ConsumeKeyword').toLowerCase();
  const gpKeyword = _loc('SPELLBOOK.Filters.Materials.GpKeyword').toLowerCase();
  const gpPattern = new RegExp(`\\d[\\d,]*\\+?\\s*${gpKeyword}\\b`);
  for (const text of haystacks) {
    if (text.includes(consumeKeyword)) return true;
    if (gpPattern.test(text)) return true;
  }
  return false;
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
    const saveText = _loc('SPELLBOOK.Filters.SavingThrow').toLowerCase();
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
      const conditionLabel = getConfigLabel(CONFIG.DND5E.conditionTypes, key);
      if (conditionLabel && lowerDesc.includes(conditionLabel.toLowerCase())) conditions.push(key);
    }
  }
  return conditions;
}

/**
 * Extract spell source information from spell data.
 * @param {object} spell - The spell object
 * @returns {object} Spell source data with label and normalized ID
 */
function extractSpellSource(spell) {
  let spellSource = spell.system?.source?.custom || spell.system?.source?.book;
  const noSourceLabel = _loc('SPELLMANAGER.Filters.NoSource');
  if (!spellSource || spellSource.trim() === '') spellSource = noSourceLabel;
  return { label: spellSource, id: spellSource === noSourceLabel ? 'no-source' : spellSource };
}

/**
 * Extract target information from spell.
 * @param {object} spell - The spell document
 * @returns {object} Target data with affectsType and templateType
 */
export function extractTarget(spell) {
  return { affectsType: spell.system?.target?.affects?.type || '', templateType: spell.system?.target?.template?.type || '' };
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
    `data-material-components="${spell.filterData?.materialComponents?.hasConsumedMaterials || false}"`,
    `data-target-affects-type="${spell.filterData?.target?.affectsType || ''}"`,
    `data-target-template-type="${spell.filterData?.target?.templateType || ''}"`
  ];
  if (spell.filterData?.spellListName) attributes.push(`data-spell-list="${spell.filterData.spellListName}"`);
  return attributes.join(' ');
}

/**
 * Get the preparation tags for a spell.
 * @param {object} spell - The spell object
 * @param {object} actor - The actor (needed for granted item lookups and class data)
 * @returns {Array<object>} Array of tag objects with cssClass, text, and tooltip properties
 */
export function getSpellPreparationTags(spell, actor) {
  const tags = [];
  const modes = spell.aggregatedModes;
  if (modes?.hasPrepared) tags.push({ cssClass: 'prepared', text: _loc('SPELLBOOK.Preparation.Prepared'), tooltip: _loc('SPELLBOOK.Preparation.PreparedTooltip') });
  if (modes?.hasPact) tags.push({ cssClass: 'pact', text: _loc('SPELLBOOK.Preparation.Pact'), tooltip: _loc('DND5E.PactMagic') });
  if (modes?.hasAlwaysPrepared) {
    let tooltip = _loc('SPELLBOOK.Preparation.AlwaysTooltip');
    const sourceDoc = getSpellSourceDocument(spell, actor);
    if (sourceDoc?.type === 'subclass') tooltip = sourceDoc.name;
    else if (sourceDoc?.type === 'class') {
      const classIdentifier = ClassManager.getSpellClassIdentifier(spell);
      const subclass = actor?.items.find((i) => i.type === 'subclass' && i.system?.classIdentifier === classIdentifier);
      tooltip = subclass?.name || sourceDoc.name;
    }
    tags.push({ cssClass: 'always-prepared', text: _loc('SPELLBOOK.Preparation.Always'), tooltip: tooltip });
  }
  if (modes?.hasGranted) {
    const cachedFor = spell.flags?.dnd5e?.cachedFor;
    const itemId = foundry.utils.parseUuid(cachedFor, { relative: actor }).embedded?.[1];
    const grantingItem = actor?.items.get(itemId);
    if (isGrantingItemActive(grantingItem)) tags.push({ cssClass: 'granted', text: _loc('SPELLBOOK.SpellSource.Granted'), tooltip: grantingItem?.name || '' });
  }
  if (modes?.hasInnate) tags.push({ cssClass: 'innate', text: _loc('SPELLBOOK.Preparation.Innate'), tooltip: _loc('SPELLBOOK.Preparation.InnateTooltip') });
  if (modes?.hasRitual) tags.push({ cssClass: 'ritual', text: _loc('SPELLBOOK.Preparation.Ritual'), tooltip: _loc('SPELLBOOK.Preparation.RitualTooltip') });
  if (modes?.hasAtWill) tags.push({ cssClass: 'atwill', text: _loc('SPELLBOOK.Preparation.AtWill'), tooltip: _loc('SPELLBOOK.Preparation.AtWillTooltip') });
  return tags;
}
