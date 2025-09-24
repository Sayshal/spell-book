/**
 * Spell Discovery and Retrieval System
 *
 * Provides comprehensive spell discovery functionality for finding spells
 * across multiple sources including compendiums, spell lists, and actor
 * collections. This module handles the complex task of spell resolution
 * and availability determination.
 *
 * Key features:
 * - Multi-source spell discovery with support for multiple custom spell lists
 * - Spell availability analysis across merged spell sources
 * - Class-specific spell filtering with intelligent deduplication
 * - Dynamic spell list generation and merging
 * - Source prioritization with fallback discovery chains
 * - Cross-reference spell resolution and validation
 *
 * @module DataHelpers/SpellDiscovery
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from '../managers/_module.mjs';
import * as DataHelpers from './_module.mjs';

/**
 * @typedef {Object} ClassSpellListResult
 * @property {Set<string>} spells - Set of spell UUIDs in the class spell list
 * @property {string} source - Source identifier for the spell list
 * @property {string} [identifier] - Class identifier for the spell list
 * @property {boolean} isCustom - Whether this is a custom spell list
 */

/**
 * @typedef {Object} SpellcastingProgressionData
 * @property {string} type - Type of spellcasting ('spell', 'pact', 'leveled')
 * @property {string} progression - Progression type ('full', 'half', 'third', 'pact', 'artificer')
 * @property {string} [ability] - Primary spellcasting ability score
 * @property {number} [levels] - Number of class levels for calculations
 */

/**
 * @typedef {Object} ClassProgression
 * @property {number} spell - Spell progression level
 * @property {number} pact - Pact progression level
 * @property {number} [classKey] - Class-specific progression level
 */

/**
 * @typedef {Object} SpellSlotData
 * @property {number} level - Spell level (1-9)
 * @property {number} [max] - Maximum spell slots available
 * @property {number} [value] - Current spell slots available
 * @property {boolean} [override] - Whether slots are overridden
 */

/**
 * @typedef {Object} CompendiumSearchContext
 * @property {string} classIdentifier - Identifier of the class being searched
 * @property {string} [topLevelFolderName] - Top-level folder name for source matching
 * @property {Object<string, string>} customMappings - Custom spell list mappings
 * @property {string} [classUuid] - UUID of the class item
 */

/**
 * @typedef {Object} FolderHierarchy
 * @property {string} name - Folder name
 * @property {number} depth - Folder depth in hierarchy
 * @property {Folder} [folder] - Parent folder reference
 * @property {Array<Folder>} [children] - Child folders
 */

/**
 * Get a class's spell list from compendium journals.
 * Searches for spell lists associated with a specific class, checking custom
 * spell lists (now supporting multiple), preloaded data, and compendium sources
 * in order of priority. Merges multiple custom spell lists when provided.
 *
 * @param {string} className - The name of the class to find spell list for
 * @param {string} [classUuid] - UUID of the class item for additional context
 * @param {Actor5e} [actor] - The actor for custom spell list lookup
 * @returns {Promise<Set<string>>} Set of spell UUIDs from the class spell list
 */
export async function getClassSpellList(className, classUuid, actor) {
  if (!classUuid) return new Set();
  if (actor) {
    const classItem = await fromUuid(classUuid);
    if (classItem) {
      const classIdentifier = classItem?.system?.identifier?.toLowerCase() || className.toLowerCase();
      const classRules = RuleSetManager.getClassRules(actor, classIdentifier);
      if (classRules.customSpellList) {
        const customSpellListUuids = Array.isArray(classRules.customSpellList) ? classRules.customSpellList : [classRules.customSpellList];
        if (customSpellListUuids.length > 0) {
          log(3, `Using ${customSpellListUuids.length} custom spell list(s) for ${className}: ${customSpellListUuids.join(', ')}`);
          const spellSets = [];
          const sourceNames = [];
          for (const uuid of customSpellListUuids) {
            if (!uuid || typeof uuid !== 'string') {
              log(2, `Invalid custom spell list UUID: ${uuid}`);
              continue;
            }
            try {
              const customSpellList = await fromUuid(uuid);
              if (customSpellList && customSpellList.system?.spells && customSpellList.system.spells.size > 0) {
                spellSets.push(customSpellList.system.spells);
                sourceNames.push(customSpellList.name || 'Unknown List');
                log(3, `Loaded custom spell list: ${customSpellList.name} (${customSpellList.system.spells.size} spells)`);
              } else {
                log(2, `Custom spell list has no spells: ${uuid}`);
              }
            } catch (error) {
              log(1, `Error loading custom spell list ${uuid}:`, error);
            }
          }
          if (spellSets.length > 0) {
            const mergedSpells = mergeSpellSets(spellSets, sourceNames);
            log(3, `Successfully merged ${spellSets.length} custom spell lists for ${className}: ${mergedSpells.size} total spells`);
            return mergedSpells;
          } else {
            log(2, `No valid custom spell lists found for ${className}, falling back to default discovery`);
          }
        }
      }
    }
  }
  const classItem = await fromUuid(classUuid);
  if (!classItem) return new Set();
  const classIdentifier = classItem?.system?.identifier?.toLowerCase();
  const topLevelFolderName = getFolderNameFromPack(classItem?._stats?.compendiumSource);
  if (!classIdentifier) return new Set();
  const preloadedData = DataHelpers.getPreloadedData();
  if (preloadedData && preloadedData.spellLists.length > 0) {
    log(3, `Checking ${preloadedData.spellLists.length} preloaded spell lists for ${classIdentifier}`);
    const preloadedMatch = preloadedData.spellLists.find((list) => {
      if (list.identifier?.toLowerCase() === classIdentifier) {
        if (topLevelFolderName && list.pack) return list.pack.toLowerCase().includes(topLevelFolderName.toLowerCase());
        return true;
      }
      return false;
    });

    if (preloadedMatch && preloadedMatch.spellCount > 0) {
      log(3, `Found preloaded spell list for ${classIdentifier}: ${preloadedMatch.name} (${preloadedMatch.spellCount} spells)`);
      try {
        const document = await fromUuid(preloadedMatch.uuid);
        if (document?.system?.spells && document.system.spells.size > 0) return document.system.spells;
      } catch (error) {
        log(2, `Error loading preloaded spell list ${preloadedMatch.uuid}:`, error);
      }
    }
  }
  const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
  if (topLevelFolderName) {
    const folderMatch = await getSpellListFromFolder(topLevelFolderName, classIdentifier, customMappings);
    if (folderMatch && folderMatch.size > 0) return folderMatch;
  }
  const customMatch = await findCustomSpellListByIdentifier(classIdentifier);
  if (customMatch && customMatch.size > 0) return customMatch;
  const identifierMatch = await findSpellListByIdentifier(classIdentifier, customMappings);
  if (identifierMatch && identifierMatch.size > 0) return identifierMatch;
  log(2, `No spell list found for class ${className} (${classIdentifier}) from folder "${topLevelFolderName}"`);
  return new Set();
}

/**
 * Extract top-level folder name from compendium source string.
 * Parses a compendium source UUID to determine the top-level folder
 * name for source attribution and spell list matching.
 *
 * @param {string} source - Compendium source string to parse
 * @returns {string} Top-level folder name or 'Unknown' if not determinable
 * @private
 */
function getFolderNameFromPack(source) {
  if (!source) return 'Unknown';
  const packCollection = foundry.utils.parseUuid(source)?.collection?.metadata?.id;
  if (!packCollection) return 'Unknown';
  const pack = game.packs.get(packCollection);
  if (!pack) return 'Unknown';
  if (pack.folder) {
    let currentFolder = pack.folder;
    while (currentFolder && currentFolder.depth > 1) currentFolder = currentFolder.folder;
    if (currentFolder && currentFolder.depth === 1) return currentFolder.name;
    else log(1, `Could not find top level folder, final depth: ${currentFolder?.depth || 'undefined'}`);
  }
  log(1, `No folder structure found for pack: ${packCollection}`);
  return 'Unknown';
}

/**
 * Find spell list by identifier across all journal packs.
 * Performs a comprehensive search across all journal compendiums
 * for spell lists matching the specified class identifier.
 *
 * @param {string} identifier - Class identifier to search for
 * @param {Object<string, string>} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null if not found
 * @private
 */
async function findSpellListByIdentifier(identifier, customMappings) {
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
  const searchPromises = journalPacks.map((pack) => searchPackForSpellList(pack, identifier, customMappings));
  const results = await Promise.allSettled(searchPromises);
  return results.find((result) => result.status === 'fulfilled' && result.value)?.value || null;
}

/**
 * Search pack for spell list matching identifier.
 * Examines all journal entries in a pack for spell list pages
 * that match the specified class identifier.
 *
 * @param {CompendiumCollection} pack - Pack to search for spell lists
 * @param {string} identifier - Class identifier to match against
 * @param {Object<string, string>} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null if not found
 * @private
 */
async function searchPackForSpellList(pack, identifier, customMappings) {
  const index = await pack.getIndex({ fields: ['name', 'pages', 'flags'] });
  for (const journalData of index) {
    if (foundry.utils.hasProperty(journalData, 'pages')) {
      const hasSpellPages = journalData.pages.some((page) => foundry.utils.hasProperty(page, 'type') && page.type === 'spells');
      if (!hasSpellPages) continue;
    }
    const journal = await pack.getDocument(journalData._id);
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      if (!foundry.utils.hasProperty(page, 'system.identifier')) continue;
      if (!foundry.utils.hasProperty(page, 'system.spells')) continue;
      const pageIdentifier = page.system.identifier.toLowerCase();
      if (identifier && pageIdentifier !== identifier) continue;
      if (customMappings[page.uuid]) {
        const customList = await fromUuid(customMappings[page.uuid]);
        if (customList && foundry.utils.hasProperty(customList, 'system.spells') && customList.system.spells.size > 0) return customList.system.spells;
      }
      if (page.system.spells.size > 0) return page.system.spells;
    }
  }
  return null;
}

/**
 * Find custom spell list with specific identifier (single result).
 * Searches the module's custom spell lists pack for user-created
 * spell lists matching the specified class identifier. This is the
 * original function maintained for backward compatibility.
 *
 * @param {string} identifier - Identifier to search for in custom lists
 * @returns {Promise<Set<string>|null>} Matched custom spell list or null if not found
 * @private
 */
async function findCustomSpellListByIdentifier(identifier) {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return null;
  const index = await customPack.getIndex();
  for (const journalData of index) {
    const journal = await customPack.getDocument(journalData._id);
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      const flags = page.flags?.[MODULE.ID] || {};
      if (!flags.isCustom && !flags.isNewList) continue;
      const pageIdentifier = page.system?.identifier?.toLowerCase() || '';
      if (pageIdentifier === identifier && page.system.spells.size > 0) return page.system.spells;
    }
  }
  return null;
}

/**
 * Calculate maximum spell level available to a specific class.
 * Determines the highest spell level a class can cast based on their
 * spellcasting configuration, progression, and current class levels.
 *
 * @param {Item} classItem - The class item with spellcasting configuration
 * @param {Actor5e} [actor] - The actor for additional context and calculations
 * @returns {number} Maximum spell level (0 for cantrips only, -1 for no spellcasting)
 */
export function calculateMaxSpellLevel(classItem, actor) {
  if (!classItem || !actor) return 0;
  const classIdentifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
  const spellcastingConfig = DataHelpers.getSpellcastingConfigForClass(actor, classIdentifier);
  if (!spellcastingConfig) {
    log(3, `No spellcasting configuration found for class ${classIdentifier}`);
    return 0;
  }
  const spellcastingType = spellcastingConfig.type;
  const classKey = classItem.identifier || classItem.name?.slugify() || 'class';
  const classLevels = DataHelpers.getSpellcastingLevelsForClass(actor, classIdentifier);
  if (spellcastingType === 'spell') {
    /** @type {ClassProgression} */
    const progression = { spell: 0, [classKey]: classLevels };
    const spellSlotTable = CONFIG.DND5E.spellcasting.spell.table;
    if (!spellSlotTable || !spellSlotTable.length) {
      log(1, 'No spell slot table found');
      return 0;
    }
    const maxPossibleSpellLevel = spellSlotTable[spellSlotTable.length - 1].length;
    const spellLevels = [];
    for (let i = 1; i <= maxPossibleSpellLevel; i++) spellLevels.push(i);

    /** @type {Object<string, SpellSlotData>} */
    const spells = Object.fromEntries(spellLevels.map((l) => [`spell${l}`, { level: l }]));
    try {
      const spellcastingSource = DataHelpers.getSpellcastingSourceItem(actor, classIdentifier);
      actor.constructor.computeClassProgression(progression, spellcastingSource, { spellcasting: spellcastingConfig });
      actor.constructor.prepareSpellcastingSlots(spells, 'spell', progression, { actor });
      return Object.values(spells).reduce((maxLevel, spellData) => {
        const max = spellData.max;
        const level = spellData.level;
        if (!max) return maxLevel;
        return Math.max(maxLevel, level || -1);
      }, 0);
    } catch (error) {
      log(1, 'Error calculating spell progression:', error);
      return 0;
    }
  } else if (spellcastingType === 'pact') {
    /** @type {Object<string, Object>} */
    const spells = { pact: {} };

    /** @type {ClassProgression} */
    const progression = { pact: 0, [classKey]: classLevels };
    try {
      const spellcastingSource = DataHelpers.getSpellcastingSourceItem(actor, classIdentifier);
      actor.constructor.computeClassProgression(progression, spellcastingSource, { spellcasting: spellcastingConfig });
      actor.constructor.prepareSpellcastingSlots(spells, 'pact', progression, { actor });
      const pactLevel = spells.pact?.level || 0;
      log(3, `Calculated pact spell level: ${pactLevel} for class ${classIdentifier}`);
      return pactLevel;
    } catch (error) {
      log(1, 'Error calculating pact progression:', error);
      return 0;
    }
  }
  log(3, `Unsupported spellcasting type: ${spellcastingType} for class ${classIdentifier}`);
  return 0;
}

/**
 * Find spell list by top-level folder name and identifier.
 * Searches for spell lists within packs that match the specified
 * top-level folder name and class identifier for source-specific matching.
 *
 * @param {string} topLevelFolderName - Top-level folder name to match
 * @param {string} identifier - Class identifier to match
 * @param {Object<string, string>} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null if not found
 * @private
 */
async function getSpellListFromFolder(topLevelFolderName, identifier, customMappings) {
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
  for (const pack of journalPacks) {
    let packTopLevelFolder = null;
    if (pack.folder) packTopLevelFolder = pack.folder.name;
    if (packTopLevelFolder !== topLevelFolderName) continue;
    const spellList = await searchPackForSpellList(pack, identifier, customMappings);
    if (spellList) return spellList;
  }
  log(2, `No spell list found for folder "${topLevelFolderName}", identifier "${identifier}"`);
  return null;
}

/**
 * Merge multiple spell sets into a single combined set.
 * Combines spell UUIDs from multiple spell lists, automatically handling
 * duplicates through Set operations. Provides logging for transparency.
 *
 * @param {Array<Set<string>>} spellSets - Array of spell sets to merge
 * @param {Array<string>} [sourceNames=[]] - Array of source names for logging
 * @returns {Set<string>} Combined set of spell UUIDs
 * @private
 */
function mergeSpellSets(spellSets, sourceNames = []) {
  if (spellSets.length === 0) return new Set();
  if (spellSets.length === 1) return new Set(spellSets[0]);
  const mergedSet = new Set();
  let totalSpells = 0;
  for (let i = 0; i < spellSets.length; i++) {
    const spellSet = spellSets[i];
    const sourceName = sourceNames[i] || `List ${i + 1}`;
    if (spellSet && spellSet.size > 0) {
      const beforeSize = mergedSet.size;
      for (const spell of spellSet) mergedSet.add(spell);
      const added = mergedSet.size - beforeSize;
      totalSpells += spellSet.size;
      log(3, `Merged ${spellSet.size} spells from ${sourceName} (${added} new, ${spellSet.size - added} duplicates)`);
    } else {
      log(3, `No spells found in ${sourceName}`);
    }
  }
  log(3, `Spell list merge complete: ${mergedSet.size} unique spells from ${totalSpells} total spells across ${spellSets.length} lists`);
  return mergedSet;
}
