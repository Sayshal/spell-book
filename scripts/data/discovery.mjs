/**
 * Spell Discovery and Retrieval System
 *
 * Provides spell discovery functionality for finding spells
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
 * @module DataUtils/Discovery
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from '../managers/_module.mjs';
import * as DataUtils from './_module.mjs';

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
 * Get spell list for a specific class.
 * @param {string} className - The name of the class to find spell list for
 * @param {string} [classUuid] - UUID of the class item for additional context
 * @param {Actor5e} [actor] - The actor for custom spell list lookup
 * @returns {Promise<Set<string>>} Set of spell UUIDs from the class spell list
 */
export async function getClassSpellList(className, classUuid, actor) {
  if (!classUuid) return new Set();
  let finalSpellSet = new Set();
  let classIdentifier;
  let classItem;
  if (actor) {
    classItem = await fromUuid(classUuid);
    if (classItem) {
      classIdentifier = classItem?.system?.identifier?.toLowerCase() || className.toLowerCase();
      const classRules = RuleSet.getClassRules(actor, classIdentifier);
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
            finalSpellSet = mergeSpellSets(spellSets, sourceNames);
            log(3, `Successfully merged ${spellSets.length} custom spell lists for ${className}: ${finalSpellSet.size} total spells`);
          } else {
            log(2, `No valid custom spell lists found for ${className}, falling back to default discovery`);
          }
        }
      }
    }
  }
  if (finalSpellSet.size === 0) {
    if (!classItem) classItem = await fromUuid(classUuid);
    if (!classItem) return new Set();
    classIdentifier = classItem?.system?.identifier?.toLowerCase();
    const topLevelFolderName = getFolderNameFromPack(classItem?._stats?.compendiumSource);
    if (!classIdentifier) return new Set();
    const preloadedData = DataUtils.getPreloadedData();
    if (preloadedData && preloadedData.spellLists.length > 0) {
      log(3, `Checking ${preloadedData.spellLists.length} preloaded spell lists for ${classIdentifier}`);
      const matchingLists = preloadedData.spellLists.filter((list) => list.identifier?.toLowerCase() === classIdentifier);
      let preloadedMatch = null;
      if (topLevelFolderName && matchingLists.length > 0) {
        preloadedMatch = matchingLists.find((list) => list.pack && list.pack.toLowerCase().includes(topLevelFolderName.toLowerCase()));
        if (preloadedMatch) log(3, `Found spell list from preferred source "${topLevelFolderName}": ${preloadedMatch.name}`);
      }
      if (!preloadedMatch && matchingLists.length > 0) {
        preloadedMatch = matchingLists[0];
        if (topLevelFolderName) log(2, `No spell list found from source "${topLevelFolderName}" for ${classIdentifier}, using fallback: ${preloadedMatch.name} from ${preloadedMatch.pack}`);
      }
      if (preloadedMatch && preloadedMatch.spellCount > 0) {
        log(3, `Found preloaded spell list for ${classIdentifier}: ${preloadedMatch.name} (${preloadedMatch.spellCount} spells)`);
        try {
          const document = await fromUuid(preloadedMatch.uuid);
          if (document?.system?.spells && document.system.spells.size > 0) finalSpellSet = document.system.spells;
        } catch (error) {
          log(2, `Error loading preloaded spell list ${preloadedMatch.uuid}:`, error);
        }
      }
    }
    if (finalSpellSet.size === 0) {
      const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
      if (topLevelFolderName) {
        const folderMatch = await getSpellListFromFolder(topLevelFolderName, classIdentifier, customMappings);
        if (folderMatch && folderMatch.size > 0) finalSpellSet = folderMatch;
      }
      if (finalSpellSet.size === 0) {
        const customMatch = await findCustomSpellListByIdentifier(classIdentifier);
        if (customMatch && customMatch.size > 0) finalSpellSet = customMatch;
      }
      if (finalSpellSet.size === 0) {
        const identifierMatch = await findSpellListByIdentifier('class', classIdentifier, customMappings);
        if (identifierMatch && identifierMatch.size > 0) finalSpellSet = identifierMatch;
      }
    }
  }
  if (actor && classIdentifier) {
    const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
    if (spellcastingData?._classLink) {
      const subclassItem = spellcastingData._classLink;
      const subclassIdentifier = subclassItem.system?.identifier?.toLowerCase();
      if (subclassIdentifier) {
        log(3, `Checking for subclass spell list: ${subclassIdentifier}`);
        const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
        const subclassSpellList = await findSpellListByIdentifier('subclass', subclassIdentifier, customMappings);
        if (subclassSpellList && subclassSpellList.size > 0) {
          log(3, `Found subclass spell list for ${subclassIdentifier}, adding ${subclassSpellList.size} spells`);
          subclassSpellList.forEach((spell) => finalSpellSet.add(spell));
          log(3, `Total spells after adding subclass: ${finalSpellSet.size}`);
        }
      }
    }
  }
  if (finalSpellSet.size === 0) log(2, `No spell list found for class ${className} (${classIdentifier})`);
  return finalSpellSet;
}

/**
 * Extract top-level folder name from compendium source string.
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
 * Searches all journal entry packs for spell list pages matching
 * the specified type and identifier for spell list discovery.
 * Only searches packs that are enabled in compendium settings.
 *
 * @param {string} type - Type of spell list ('class' or 'subclass')
 * @param {string} identifier - Identifier to search for in spell lists
 * @param {Object<string, string>} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null if not found
 * @private
 */
async function findSpellListByIdentifier(type, identifier, customMappings) {
  const journalPacks = Array.from(game.packs).filter((p) => {
    if (p.metadata.type !== 'JournalEntry') return false;
    return DataUtils.shouldIndexCompendium(p);
  });
  for (const pack of journalPacks) {
    const spellList = await searchPackForSpellList(pack, type, identifier, customMappings);
    if (spellList) return spellList;
  }
  return null;
}

/**
 * Search a specific pack for spell list matching type and identifier.
 * @param {CompendiumCollection} pack - Pack to search for spell lists
 * @param {string} type - Type of spell list ('class' or 'subclass')
 * @param {string} identifier - Class identifier to match against
 * @param {Object<string, string>} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null if not found
 * @private
 */
async function searchPackForSpellList(pack, type, identifier, customMappings) {
  const index = await pack.getIndex({ fields: ['name', 'pages.type'] });
  for (const journalData of index) {
    const hasSpellPages = journalData.pages?.some((page) => page.type === 'spells');
    if (!hasSpellPages) continue;
    const journal = await pack.getDocument(journalData._id);
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      if (!page.system?.identifier || !page.system?.spells) continue;
      const pageType = page.system.type;
      const pageIdentifier = page.system.identifier.toLowerCase();
      if (pageType === type && pageIdentifier === identifier) {
        if (customMappings[page.uuid]) {
          const customList = await fromUuid(customMappings[page.uuid]);
          if (customList && customList.system?.spells?.size > 0) return customList.system.spells;
        }
        if (page.system.spells?.size > 0) return page.system.spells;
      }
    }
  }
  return null;
}

/**
 * Find custom spell list with specific identifier (single result).
 * @param {string} identifier - Identifier to search for in custom lists
 * @returns {Promise<Set<string>|null>} Matched custom spell list or null if not found
 * @private
 */
async function findCustomSpellListByIdentifier(identifier) {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return null;
  const index = await customPack.getIndex({ fields: ['name', 'pages.type'] });
  for (const journalData of index) {
    const hasSpellPages = journalData.pages?.some((page) => page.type === 'spells');
    if (!hasSpellPages) continue;
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
 * @param {Item} classItem - The class item with spellcasting configuration
 * @param {Actor5e} [actor] - The actor for additional context and calculations
 * @returns {number} Maximum spell level (0 for cantrips only, -1 for no spellcasting)
 */
export function calculateMaxSpellLevel(classItem, actor) {
  if (!classItem || !actor) return 0;
  const classIdentifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
  const spellcastingConfig = DataUtils.getSpellcastingConfigForClass(actor, classIdentifier);
  if (!spellcastingConfig) {
    log(3, `No spellcasting configuration found for class ${classIdentifier}`);
    return 0;
  }
  const spellcastingType = spellcastingConfig.type;
  const classKey = classItem.identifier || classItem.name?.slugify() || 'class';
  const classLevels = DataUtils.getSpellcastingLevelsForClass(actor, classIdentifier);
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
      const spellcastingSource = DataUtils.getSpellcastingSourceItem(actor, classIdentifier);
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
      const spellcastingSource = DataUtils.getSpellcastingSourceItem(actor, classIdentifier);
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
 * Only searches packs that are enabled in compendium settings.
 *
 * @param {string} topLevelFolderName - Top-level folder name to match
 * @param {string} identifier - Class identifier to match
 * @param {Object<string, string>} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null if not found
 * @private
 */
async function getSpellListFromFolder(topLevelFolderName, identifier, customMappings) {
  const journalPacks = Array.from(game.packs).filter((p) => {
    if (p.metadata.type !== 'JournalEntry') return false;
    return DataUtils.shouldIndexCompendium(p);
  });
  for (const pack of journalPacks) {
    let packTopLevelFolder = null;
    if (pack.folder) packTopLevelFolder = pack.folder.name;
    if (packTopLevelFolder !== topLevelFolderName) continue;
    const spellList = await searchPackForSpellList(pack, 'class', identifier, customMappings);
    if (spellList) return spellList;
  }
  log(2, `No spell list found for folder "${topLevelFolderName}", identifier "${identifier}"`);
  return null;
}

/**
 * Merge multiple spell sets into a single combined set.
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
