/**
 * Compendium Management and Spell List Operations
 *
 * Handles compendium pack operations, spell list discovery, and spell source
 * management. This module provides utilities for working with spell data across
 * multiple compendium sources and managing spell list documents within packs.
 *
 * Key features:
 * - Compendium pack scanning and indexing
 * - Spell list discovery and metadata extraction
 * - Source filtering and organization
 * - Pack document management
 * - Spell source identification and cataloging
 * - Cross-pack spell data consolidation
 *
 * @module DataHelpers/CompendiumProcessor
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as UIHelpers from '../ui/_module.mjs';
import * as DataHelpers from './_module.mjs';

/**
 * @typedef {Object} SpellListMetadata
 * @property {string} uuid - Unique identifier for the spell list document
 * @property {string} name - Display name of the spell list
 * @property {string} journal - Name of the parent journal entry
 * @property {string} pack - Display name of the source pack or top-level folder
 * @property {string} packageName - Name of the package containing the spell list
 * @property {Object} system - System data from the spell list page
 * @property {number} spellCount - Number of spells in the list
 * @property {string} [identifier] - Class identifier for the spell list
 * @property {boolean} [isCustom] - Whether this is a custom user-created list
 * @property {boolean} [isMerged] - Whether this is a merged spell list
 * @property {boolean} [isActorOwned] - Whether this list belongs to a specific actor
 * @property {string} [actorId] - ID of the owning actor
 * @property {string} [actorName] - Name of the owning actor
 * @property {JournalEntryPage} document - The actual document reference
 */

/**
 * @typedef {Object} SpellSourceOption
 * @property {string} id - Unique identifier for the source
 * @property {string} label - Display label for the source
 */

/**
 * @typedef {Object} VersionComparisonResult
 * @property {boolean} canCompare - Whether comparison was possible
 * @property {string} [reason] - Reason if comparison failed
 * @property {boolean} [hasOriginalChanged] - Whether original has been modified
 * @property {number} [added] - Number of spells added to custom version
 * @property {number} [removed] - Number of spells removed from custom version
 * @property {number} [originalSpellCount] - Total spells in original list
 * @property {number} [customSpellCount] - Total spells in custom list
 * @property {number} [originalModTime] - Original modification timestamp
 * @property {number} [customModTime] - Custom modification timestamp
 * @property {string} [originalVersion] - Original system version
 * @property {string} [customVersion] - Custom system version
 * @property {number} [savedOriginalModTime] - Saved original modification time
 * @property {string} [savedOriginalVersion] - Saved original system version
 */

/**
 * @typedef {Object} FilterOption
 * @property {string} value - Option value for form submission
 * @property {string} label - Display label for the option
 * @property {boolean} selected - Whether this option is currently selected
 */

/**
 * @typedef {Object} CastingTimeData
 * @property {string} type - Type of activation (action, bonus, reaction, etc.)
 * @property {number} value - Numeric value for the casting time
 */

/**
 * @typedef {Object} ClassIdentifierData
 * @property {string} name - Display name of the class
 * @property {string} source - Source package or compendium name
 * @property {string} fullDisplay - Full display name including source
 * @property {string} id - Unique identifier for the class
 */

/**
 * @typedef {Object} FormattedSpellData
 * @property {string} uuid - Unique identifier for the spell
 * @property {string} name - Display name of the spell
 * @property {string} img - Image path for the spell icon
 * @property {number} level - Spell level (0-9)
 * @property {string} school - School of magic identifier
 * @property {string} sourceId - Source identifier for filtering
 * @property {string} packName - Display name of the source pack
 * @property {Object} system - System-specific spell data
 * @property {Object} labels - Computed labels for display
 * @property {Object} filterData - Extracted filter data for UI
 */

/**
 * Scan compendiums for spell lists with optional visibility filtering.
 * @param {boolean} [includeHidden=true] - Whether to include hidden spell lists in results
 * @returns {Promise<Array<SpellListMetadata>>} Array of spell list objects with metadata
 */
export async function findCompendiumSpellLists(includeHidden = true) {
  /** @type {Array<SpellListMetadata>} */
  const spellLists = [];
  const allJournalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
  const journalPacks = allJournalPacks.filter((p) => {
    return shouldIndexCompendium(p);
  });

  log(3, `Scanning ${journalPacks.length} enabled journal compendiums for spell lists`);
  await processStandardPacks(journalPacks, spellLists);
  await processCustomPack(spellLists);
  if (!includeHidden && !game.user.isGM) {
    const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const filteredLists = spellLists.filter((list) => !hiddenLists.includes(list.uuid));
    log(3, `Filtered out ${spellLists.length - filteredLists.length} hidden spell lists.`);
    spellLists.length = 0;
    spellLists.push(...filteredLists);
  }
  const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
  for (const list of spellLists) {
    const document = await fromUuid(list.uuid);
    if (document.system?.identifier && !list.identifier) list.identifier = document.system.identifier;
    const duplicateUuid = customMappings[list.uuid];
    if (duplicateUuid) {
      const duplicateDoc = await fromUuid(duplicateUuid);
      if (duplicateDoc) list.name = duplicateDoc.name;
    }
    if (document?.flags?.[MODULE.ID]?.actorId) {
      list.isActorOwned = true;
      list.actorId = document.flags[MODULE.ID].actorId;
      const actor = game.actors.get(list.actorId);
      if (actor) list.actorName = actor.name;
    } else if (document?.folder) {
      const folderName = document.folder.name.toLowerCase();
      if (folderName.includes('actor') || folderName.includes('character')) {
        list.isActorOwned = true;
        const possibleActor = game.actors.find((a) => folderName.includes(a.name.toLowerCase()));
        if (possibleActor) {
          list.actorName = possibleActor.name;
          list.actorId = possibleActor.id;
        }
      }
    }
  }
  log(3, `Found ${spellLists.length} total spell lists (${spellLists.filter((l) => l.isActorOwned).length} actor-owned)`);
  return spellLists;
}

/**
 * Prepare spell sources for filtering dropdown.
 * @param {Array<FormattedSpellData>} availableSpells - The available spells array
 * @returns {Array<SpellSourceOption>} Array of source options for dropdown
 */
export function prepareSpellSources(availableSpells) {
  /** @type {Map<string, SpellSourceOption>} */
  const sourceMap = new Map();
  sourceMap.set('all', { id: 'all', label: game.i18n.localize('SPELLMANAGER.Filters.AllSources') });
  availableSpells.forEach((spell) => {
    if (spell.sourceId) {
      const sourceId = spell.sourceId;
      if (!sourceMap.has(sourceId)) sourceMap.set(sourceId, { id: sourceId, label: sourceId });
    }
  });
  const sources = Array.from(sourceMap.values()).sort((a, b) => {
    if (a.id === 'all') return -1;
    if (b.id === 'all') return 1;
    return a.label.localeCompare(b.label);
  });
  return sources;
}

/**
 * Process standard journal packs for spell lists.
 * @param {Array<CompendiumCollection>} journalPacks - Array of journal packs to process
 * @param {Array<SpellListMetadata>} spellLists - Array to store results in
 * @private
 */
async function processStandardPacks(journalPacks, spellLists) {
  for (const pack of journalPacks) {
    if (pack.metadata.id === MODULE.PACK.SPELLS) continue;
    let topLevelFolderName;
    if (pack.folder) {
      if (pack.folder.depth !== 1) topLevelFolderName = pack.folder.getParentFolders().at(-1).name;
      else topLevelFolderName = pack.folder.name;
    }
    const index = await pack.getIndex({ fields: ['name', 'pages.type'] });
    for (const journalData of index) {
      const hasSpellPages = journalData.pages?.some((page) => page.type === 'spells');
      if (!hasSpellPages) continue;
      const journal = await pack.getDocument(journalData._id);
      for (const page of journal.pages) {
        if (page.type !== 'spells' || page.system?.type === 'other') continue;
        spellLists.push({
          uuid: page.uuid,
          name: page.name,
          journal: journal.name,
          pack: topLevelFolderName || pack.metadata.label,
          packageName: pack.metadata.packageName,
          system: page.system,
          spellCount: page.system.spells?.size || 0,
          identifier: page.system.identifier,
          document: page
        });
      }
    }
  }
}

/**
 * Process custom spell lists pack.
 * @param {Array<SpellListMetadata>} spellLists - Array to store results in
 * @private
 */
async function processCustomPack(spellLists) {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return;
  const index = await customPack.getIndex();
  for (const journalData of index) {
    const journal = await customPack.getDocument(journalData._id);
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      const flags = page.flags?.[MODULE.ID] || {};
      if (flags.isDuplicate || flags.originalUuid) continue;
      const isMerged = !!flags.isMerged;
      const isCustom = !isMerged;
      spellLists.push({
        uuid: page.uuid,
        name: page.name,
        journal: journal.name,
        pack: customPack.metadata.label,
        packageName: customPack.metadata.packageName,
        system: page.system,
        spellCount: page.system.spells?.size || 0,
        identifier: page.system.identifier,
        isCustom: isCustom,
        isMerged: isMerged,
        document: page
      });
    }
  }
}

/**
 * Compare versions of original and custom spell lists.
 * @param {string} originalUuid - UUID of the original spell list
 * @param {string} customUuid - UUID of the custom spell list
 * @returns {Promise<VersionComparisonResult>} Comparison results with change analysis
 */
export async function compareListVersions(originalUuid, customUuid) {
  const original = await fromUuid(originalUuid);
  const custom = await fromUuid(customUuid);
  if (!original || !custom) return { canCompare: false, reason: !original ? 'Original not found' : 'Custom not found' };
  const originalModTime = original._stats?.modifiedTime || 0;
  const customModTime = custom._stats?.modifiedTime || 0;
  const originalVersion = original._stats?.systemVersion || '';
  const customVersion = custom._stats?.systemVersion || '';
  const savedOriginalModTime = custom.flags?.[MODULE.ID]?.originalModTime || 0;
  const savedOriginalVersion = custom.flags?.[MODULE.ID]?.originalVersion || '';
  const hasOriginalChanged = originalModTime > savedOriginalModTime || originalVersion !== savedOriginalVersion;
  const originalSpells = original.system.spells || new Set();
  const customSpells = custom.system.spells || new Set();
  const added = [...customSpells].filter((uuid) => !originalSpells.has(uuid));
  const removed = [...originalSpells].filter((uuid) => !customSpells.has(uuid));
  return {
    canCompare: true,
    hasOriginalChanged,
    added: added.length,
    removed: removed.length,
    originalSpellCount: originalSpells.size,
    customSpellCount: customSpells.size,
    originalModTime,
    customModTime,
    originalVersion,
    customVersion,
    savedOriginalModTime,
    savedOriginalVersion
  };
}

/**
 * Get mappings between original and custom spell lists.
 * @returns {Promise<Object<string, string>>} Object mapping original UUIDs to custom UUIDs
 */
export async function getValidCustomListMappings() {
  const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
  const validMappings = {};
  for (const [originalUuid, customUuid] of Object.entries(mappings)) {
    const customDoc = await fromUuid(customUuid);
    if (customDoc) validMappings[originalUuid] = customUuid;
    else log(2, `Custom list ${customUuid} no longer exists, removing mapping`);
  }
  if (Object.keys(validMappings).length !== Object.keys(mappings).length) {
    await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, validMappings);
    log(2, 'Updated spell list mappings, removed invalid entries');
  }
  return validMappings;
}

/**
 * Duplicate a spell list to the custom pack.
 * @param {JournalEntryPage} originalSpellList - The original spell list document to duplicate
 * @returns {Promise<JournalEntryPage>} The duplicated spell list page
 */
export async function duplicateSpellList(originalSpellList) {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) log(1, 'Custom spell lists pack not found');
  const existingDuplicate = await findDuplicateSpellList(originalSpellList.uuid);
  if (existingDuplicate) return existingDuplicate;
  const pageData = originalSpellList.toObject();
  pageData.flags = pageData.flags || {};
  pageData.flags[MODULE.ID] = {
    originalUuid: originalSpellList.uuid,
    originalName: originalSpellList.name,
    originalModTime: originalSpellList._stats?.modifiedTime || 0,
    originalVersion: originalSpellList._stats?.systemVersion || game.system.version,
    isDuplicate: true
  };
  const modifiedFolder = await getOrCreateModifiedFolder();
  const journalName = `${originalSpellList.parent.name} - ${originalSpellList.name}`;
  const journalData = { name: journalName, folder: modifiedFolder?.id, pages: [{ name: originalSpellList.name, type: 'spells', flags: pageData.flags, system: pageData.system }] };
  const journal = await JournalEntry.create(journalData, { pack: customPack.collection });
  const page = journal.pages.contents[0];
  await updateSpellListMapping(originalSpellList.uuid, page.uuid);
  return page;
}

/**
 * Find a duplicate spell list in the custom pack.
 * @param {string} originalUuid - UUID of the original spell list to find duplicate for
 * @returns {Promise<JournalEntryPage|null>} The duplicate page or null if not found
 */
export async function findDuplicateSpellList(originalUuid) {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return null;
  const journals = await customPack.getDocuments();
  for (const journal of journals) {
    for (const page of journal.pages) {
      const flags = page.flags?.[MODULE.ID] || {};
      if (flags.originalUuid === originalUuid) return page;
    }
  }
  return null;
}

/**
 * Update the spell list mapping settings.
 * @param {string} originalUuid - UUID of the original spell list
 * @param {string} duplicateUuid - UUID of the duplicate spell list
 * @returns {Promise<void>}
 * @private
 */
async function updateSpellListMapping(originalUuid, duplicateUuid) {
  const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
  mappings[originalUuid] = duplicateUuid;
  await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, mappings);
}

/**
 * Remove a custom spell list and its mapping.
 * @param {string} duplicateUuid - UUID of the duplicate spell list to remove
 * @returns {Promise<boolean>} Whether removal was successful
 */
export async function removeCustomSpellList(duplicateUuid) {
  const duplicatePage = await fromUuid(duplicateUuid);
  if (!duplicatePage) return false;
  const journal = duplicatePage.parent;
  if (!journal) return false;
  const originalUuid = duplicatePage.flags?.[MODULE.ID]?.originalUuid;
  if (originalUuid) {
    const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
    delete mappings[originalUuid];
    await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, mappings);
  }
  await journal.delete();
  return true;
}

/**
 * Fetch all compendium spells with level filtering.
 * @param {number} [maxLevel=9] - Maximum spell level to include in results
 * @returns {Promise<Array<FormattedSpellData>>} Array of formatted spell items
 */
export async function fetchAllCompendiumSpells(maxLevel = 9) {
  /** @type {Array<FormattedSpellData>} */
  const spells = [];
  const allItemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');
  const itemPacks = allItemPacks.filter((p) => {
    return shouldIndexCompendium(p);
  });
  log(3, `Fetching spells from ${itemPacks.length} enabled item compendiums`);
  for (const pack of itemPacks) {
    const packSpells = await fetchSpellsFromPack(pack, maxLevel);
    spells.push(...packSpells);
  }
  spells.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.name.localeCompare(b.name);
  });
  log(3, `Fetched ${spells.length} compendium spells from ${itemPacks.length} enabled compendiums`);
  return spells;
}

/**
 * Fetch spells from a specific pack with level filtering.
 * @param {CompendiumCollection} pack - The pack to fetch spells from
 * @param {number} maxLevel - Maximum spell level to include
 * @returns {Promise<Array<FormattedSpellData>>} Array of formatted spell items
 * @private
 */
async function fetchSpellsFromPack(pack, maxLevel) {
  /** @type {Array<FormattedSpellData>} */
  const packSpells = [];
  const index = await pack.getIndex({
    fields: [
      'type',
      'labels.activation',
      'labels.components',
      'labels.damages',
      'labels.range',
      'labels.school',
      'system.activation.type',
      'system.activation.value',
      'system.activities',
      'system.components.ritual',
      'system.description.value',
      'system.duration.concentration',
      'system.level',
      'system.materials.consumed',
      'system.materials.cost',
      'system.materials.value',
      'system.properties',
      'system.range.units',
      'system.range.value',
      'system.school',
      'system.source.book',
      'system.source.custom'
    ]
  });
  const spellEntries = index.filter((e) => e.type === 'spell' && (!maxLevel || e.system?.level <= maxLevel));
  for (const entry of spellEntries) {
    if (!entry.labels) {
      entry.labels = {};
      if (entry.system?.level !== undefined) entry.labels.level = CONFIG.DND5E.spellLevels[entry.system.level];
      if (entry.system?.school) entry.labels.school = DataHelpers.getConfigLabel(CONFIG.DND5E.spellSchools, entry.system.school);
    }
    const spell = formatSpellEntry(entry, pack);
    packSpells.push(spell);
  }
  return packSpells;
}

/**
 * Format a spell index entry into a standardized spell object.
 * @param {Object} entry - The spell index entry from compendium
 * @param {CompendiumCollection} pack - The source pack for folder information
 * @returns {FormattedSpellData} Formatted spell object ready for UI use
 * @private
 */
function formatSpellEntry(entry, pack) {
  let topLevelFolderName = pack.metadata.label;
  if (pack.folder) {
    if (pack.folder.depth !== 1) topLevelFolderName = pack.folder.getParentFolders().at(-1).name;
    else topLevelFolderName = pack.folder.name;
  }
  const spell = {
    uuid: foundry.utils.parseUuid(entry.uuid).uuid,
    name: entry.name,
    img: entry.img,
    level: entry.system?.level || 0,
    school: entry.system?.school || '',
    sourceId: topLevelFolderName,
    packName: topLevelFolderName,
    system: entry.system || {},
    labels: entry.labels
  };
  spell.filterData = UIHelpers.extractSpellFilterData(spell);
  return spell;
}

/**
 * Create a new spell list in the custom pack.
 * @param {string} name - The name of the spell list
 * @param {string} identifier - The identifier (typically class name)
 * @param {string} type - The type of spell list ('class', 'subclass', or 'other')
 * @returns {Promise<JournalEntryPage>} The created spell list page
 */
export async function createNewSpellList(name, identifier, type = 'class') {
  const customFolder = await getOrCreateCustomFolder();
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
  const validTypes = ['class', 'subclass', 'other'];
  if (!validTypes.includes(type)) {
    log(2, `Invalid spell list type "${type}", defaulting to "class"`);
    type = 'class';
  }

  const journalData = {
    name: name,
    folder: customFolder?.id,
    ownership: ownership,
    pages: [
      {
        name: name,
        type: 'spells',
        ownership: ownership,
        flags: { [MODULE.ID]: { isCustom: true, isNewList: true, isDuplicate: false, creationDate: Date.now() } },
        system: { identifier: identifier.toLowerCase(), type: type, description: game.i18n.format('SPELLMANAGER.CreateList.CustomDescription', { identifier }), spells: [] }
      }
    ]
  };
  const journal = await JournalEntry.create(journalData, { pack: MODULE.PACK.SPELLS });
  const page = journal.pages.contents[0];
  log(3, `Created ${type} spell list: ${name} in folder`);
  await dnd5e.registry.spellLists.register(page.uuid);
  log(3, `Registered new spell list with system registry: ${name}`);
  return page;
}

/**
 * Prepare dropdown options for casting time filter.
 * @param {Array<FormattedSpellData>} availableSpells - The available spells array
 * @param {Object} filterState - Current filter state for selection
 * @returns {Array<FilterOption>} Array of options for the dropdown
 */
export function prepareCastingTimeOptions(availableSpells, filterState) {
  /** @type {Map<string, CastingTimeData>} */
  const uniqueActivationTypes = new Map();
  for (const spell of availableSpells) {
    const type = spell.system?.activation?.type;
    const value = spell.system?.activation?.value || 1;
    if (type) {
      const key = `${type}:${value}`;
      uniqueActivationTypes.set(key, { type, value });
    }
  }
  const typeOrder = { action: 1, bonus: 2, reaction: 3, minute: 4, hour: 5, day: 6, legendary: 7, mythic: 8, lair: 9, crew: 10, special: 11, none: 12 };
  const sortableTypes = Array.from(uniqueActivationTypes.entries())
    .map(([key, data]) => ({ key, type: data.type, value: data.value }))
    .sort((a, b) => {
      const typePriorityA = typeOrder[a.type] || 999;
      const typePriorityB = typeOrder[b.type] || 999;
      return typePriorityA !== typePriorityB ? typePriorityA - typePriorityB : a.value - b.value;
    });
  const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All'), selected: !filterState.castingTime }];
  for (const entry of sortableTypes) {
    const typeLabel = CONFIG.DND5E.abilityActivationTypes[entry.type] || entry.type;
    const label = entry.value === 1 ? typeLabel : `${entry.value} ${typeLabel}${entry.value !== 1 ? 's' : ''}`;
    options.push({ value: entry.key, label, selected: filterState.castingTime === entry.key });
  }
  return options;
}

/**
 * Prepare dropdown options for damage type filter.
 * @param {Object} filterState - Current filter state for selection
 * @returns {Array<FilterOption>} Array of options for the dropdown
 */
export function prepareDamageTypeOptions(filterState) {
  const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All'), selected: !filterState.damageType }];
  const damageTypesWithHealing = { ...CONFIG.DND5E.damageTypes, healing: { label: game.i18n.localize('DND5E.Healing') } };
  Object.entries(damageTypesWithHealing)
    .sort((a, b) => {
      const labelA = a[0] === 'healing' ? damageTypesWithHealing.healing.label : DataHelpers.getConfigLabel(CONFIG.DND5E.damageTypes, a[0]);
      const labelB = b[0] === 'healing' ? damageTypesWithHealing.healing.label : DataHelpers.getConfigLabel(CONFIG.DND5E.damageTypes, b[0]);
      return labelA.localeCompare(labelB);
    })
    .forEach(([key, _damageType]) => {
      const label = key === 'healing' ? damageTypesWithHealing.healing.label : DataHelpers.getConfigLabel(CONFIG.DND5E.damageTypes, key);
      options.push({ value: key, label, selected: filterState.damageType === key });
    });
  return options;
}

/**
 * Prepare dropdown options for condition filter.
 * @param {Object} filterState - Current filter state for selection
 * @returns {Array<FilterOption>} Array of options for the dropdown
 */
export function prepareConditionOptions(filterState) {
  const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All'), selected: !filterState.condition }];
  Object.entries(CONFIG.DND5E.conditionTypes)
    .filter(([_key, condition]) => !condition.pseudo)
    .sort((a, b) => {
      const labelA = DataHelpers.getConfigLabel(CONFIG.DND5E.conditionTypes, a[0]);
      const labelB = DataHelpers.getConfigLabel(CONFIG.DND5E.conditionTypes, b[0]);
      return labelA.localeCompare(labelB);
    })
    .forEach(([key, _condition]) => {
      const label = DataHelpers.getConfigLabel(CONFIG.DND5E.conditionTypes, key);
      options.push({ value: key, label, selected: filterState.condition === key });
    });
  return options;
}

/**
 * Find all class identifiers from class items in compendiums.
 * @returns {Promise<Object<string, ClassIdentifierData>>} Object mapping class identifiers to metadata
 */
export async function findClassIdentifiers() {
  /** @type {Object<string, ClassIdentifierData>} */
  const identifiers = {};
  const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');
  for (const pack of itemPacks) {
    const index = await pack.getIndex({ fields: ['type', 'system.identifier', 'name'] });
    const classItems = index.filter((e) => e.type === 'class');
    const packDisplayName = pack.metadata.label;
    for (const cls of classItems) {
      const identifier = cls.system?.identifier?.toLowerCase();
      if (identifier) identifiers[identifier] = { name: cls.name, source: packDisplayName || 'Unknown', fullDisplay: `${cls.name} [${packDisplayName}]`, id: identifier };
    }
  }
  return identifiers;
}

/**
 * Create a merged spell list from multiple existing spell lists.
 * @param {Array<string>} spellListUuids - Array of UUIDs of spell lists to merge
 * @param {string} mergedListName - Name for the merged list
 * @returns {Promise<JournalEntryPage>} The created merged spell list page
 */
export async function createMergedSpellList(spellListUuids, mergedListName) {
  if (!Array.isArray(spellListUuids) || spellListUuids.length < 2) throw new Error('At least two spell lists are required to merge');
  const spellLists = [];
  for (const uuid of spellListUuids) {
    const list = await fromUuid(uuid);
    if (!list) throw new Error(`Unable to load spell list: ${uuid}`);
    spellLists.push(list);
  }
  const mergedSpells = new Set();
  for (const list of spellLists) {
    const spells = list.system.spells || [];
    spells.forEach((spell) => mergedSpells.add(spell));
  }
  const identifier = spellLists[0].system?.identifier || 'merged';
  const listNames = spellLists.map((list) => list.name).join(', ');
  const description = game.i18n.format('SPELLMANAGER.CreateList.MultiMergedDescription', { listNames: listNames, count: spellLists.length });
  const mergedFolder = await getOrCreateMergedFolder();
  const journalData = {
    name: mergedListName,
    folder: mergedFolder?.id,
    pages: [
      {
        name: mergedListName,
        type: 'spells',
        flags: { [MODULE.ID]: { isCustom: true, isMerged: true, isDuplicate: false, creationDate: Date.now(), sourceListUuids: spellListUuids } },
        system: { identifier: identifier.toLowerCase(), description: description, spells: Array.from(mergedSpells) }
      }
    ]
  };
  const journal = await JournalEntry.create(journalData, { pack: MODULE.PACK.SPELLS });
  log(3, `Created merged spell list: ${mergedListName} with ${mergedSpells.size} spells from ${spellLists.length} source lists`);
  return journal.pages.contents[0];
}

/**
 * Get or create a folder in the custom spell lists pack.
 * @param {string} folderName - Name of the folder to create or find
 * @returns {Promise<Folder|null>} The folder document or null if creation failed
 * @private
 */
async function getOrCreateSpellListFolder(folderName) {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) {
    log(1, 'Custom spell lists pack not found');
    return null;
  }
  const existingFolder = customPack.folders.find((f) => f.name === folderName);
  if (existingFolder) return existingFolder;
  try {
    const folderData = { name: folderName, type: 'JournalEntry', folder: null };
    const folder = await Folder.create(folderData, { pack: customPack.collection });
    log(3, `Created spell list folder: ${folderName}`);
    return folder;
  } catch (error) {
    log(1, `Failed to create folder ${folderName}:`, error);
    return null;
  }
}

/**
 * Get or create the Custom Spell Lists folder.
 * @returns {Promise<Folder|null>} Promise that resolves to the custom spell lists folder or null if creation failed
 */
export async function getOrCreateCustomFolder() {
  const folderName = game.i18n.localize('SPELLMANAGER.Folders.CustomSpellListsFolder');
  return getOrCreateSpellListFolder(folderName);
}

/**
 * Get or create the Merged Spell Lists folder.
 * @returns {Promise<Folder|null>} Promise that resolves to the merged spell lists folder or null if creation failed
 */
export async function getOrCreateMergedFolder() {
  const folderName = game.i18n.localize('SPELLMANAGER.Folders.MergedSpellListsFolder');
  return getOrCreateSpellListFolder(folderName);
}

/**
 * Get or create the Modified Spell Lists folder.
 * @returns {Promise<Folder|null>} Promise that resolves to the modified spell lists folder or null if creation failed
 */
export async function getOrCreateModifiedFolder() {
  const folderName = game.i18n.localize('SPELLMANAGER.Folders.ModifiedSpellListsFolder');
  return getOrCreateSpellListFolder(folderName);
}

/**
 * Check if a compendium should be indexed for spell operations.
 * @param {CompendiumCollection} pack - The pack to check
 * @returns {boolean} Whether the pack should be indexed
 */
export function shouldIndexCompendium(pack) {
  const settings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
  if (!settings || typeof settings !== 'object' || Object.keys(settings).length === 0) return true;
  if (pack.collection in settings) return settings[pack.collection] === true;
  return false;
}

/**
 * Check if a compendium should be shown in settings for potential indexing.
 * @param {CompendiumCollection} pack - The pack to check
 * @returns {Promise<boolean>} Whether the pack should be available in settings
 */
export async function shouldShowInSettings(pack) {
  const settings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
  if (settings && pack.collection in settings) return true;
  if (pack.metadata.type === 'Item') {
    try {
      const index = await pack.getIndex({ fields: ['type'] });
      const hasSpells = index.some((entry) => entry.type === 'spell');
      return hasSpells;
    } catch (error) {
      log(1, error);
      return false;
    }
  } else if (pack.metadata.type === 'JournalEntry') {
    try {
      const index = await pack.getIndex({ fields: ['pages.type'] });
      const hasSpellPages = index.some((entry) => entry.pages?.some((page) => page.type === 'spells'));
      return hasSpellPages;
    } catch (error) {
      log(1, error);
      return false;
    }
  }
  return false;
}

/**
 * Prepare spell source options from spell.system.source.label.
 * @param {Array<FormattedSpellData>} availableSpells - The available spells array
 * @returns {Array<SpellSourceOption>} Array of spell source options for dropdown
 */
export function prepareSpellSourceOptions(availableSpells) {
  /** @type {Map<string, SpellSourceOption>} */
  const sourceMap = new Map();
  sourceMap.set('all', { id: 'all', label: game.i18n.localize('SPELLMANAGER.Filters.AllSpellSources') });
  const noSourceLabel = game.i18n.localize('SPELLMANAGER.Filters.NoSource');
  availableSpells.forEach((spell) => {
    const spellSourceData = spell.filterData?.spellSource || spell.system?.source?.custom || spell.system?.source?.book;
    const spellSourceId = spell.filterData?.spellSourceId;
    let sourceLabel = spellSourceData;
    let sourceId = spellSourceId;
    if (!sourceLabel || sourceLabel.trim() === '') {
      sourceLabel = noSourceLabel;
      sourceId = 'no-source';
    } else if (!sourceId) {
      sourceId = sourceLabel;
    }
    if (!sourceMap.has(sourceId)) sourceMap.set(sourceId, { id: sourceId, label: sourceLabel === noSourceLabel ? noSourceLabel : sourceLabel });
  });
  const sources = Array.from(sourceMap.values()).sort((a, b) => {
    if (a.id === 'all') return -1;
    if (b.id === 'all') return 1;
    return a.label.localeCompare(b.label);
  });
  return sources;
}
