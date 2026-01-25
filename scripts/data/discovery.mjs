/**
 * Spell Discovery and Retrieval System
 *
 * Provides spell discovery functionality for finding spells
 * across multiple sources including compendiums, spell lists, and actor
 * collections. This module handles the complex task of spell resolution
 * and availability determination.
 *
 * @module DataUtils/Discovery
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from '../managers/_module.mjs';
import * as DataUtils from './_module.mjs';

/**
 * Get spell list for a specific class.
 * @param {string} className - The name of the class to find spell list for
 * @param {string} [classUuid] - UUID of the class item for additional context
 * @param {Object} [actor] - The actor for custom spell list lookup
 * @returns {Promise<Set<string>>} Set of spell UUIDs from the class spell list
 */
export async function getClassSpellList(className, classUuid, actor) {
  log(3, 'Getting class spell lists.', { className, classUuid, actor });
  if (!classUuid) return new Set();
  let finalSpellSet = new Set();
  let classIdentifier, classItem;
  if (actor) {
    classItem = await fromUuid(classUuid);
    if (classItem) {
      classIdentifier = foundry.utils.getProperty(classItem, 'system.identifier');
      const classRules = RuleSet.getClassRules(actor, classIdentifier);
      if (classRules.customSpellList) {
        const customSpellListUuids = Array.isArray(classRules.customSpellList) ? classRules.customSpellList : [classRules.customSpellList];
        if (customSpellListUuids.length > 0) {
          log(3, `Using ${customSpellListUuids.length} custom spell list(s) for ${className}: ${customSpellListUuids.join(', ')}`);
          const spellSets = [];
          const sourceNames = [];
          for (const uuid of customSpellListUuids) {
            if (!uuid || typeof uuid !== 'string') continue;
            const customSpellList = await fromUuid(uuid);
            if (customSpellList && customSpellList.system?.spells && customSpellList.system.spells.size > 0) {
              spellSets.push(customSpellList.system.spells);
              sourceNames.push(customSpellList.name || 'Unknown List');
              log(3, `Loaded custom spell list: ${customSpellList.name} (${customSpellList.system.spells.size} spells)`);
            }
          }
          if (spellSets.length > 0) finalSpellSet = mergeSpellSets(spellSets, sourceNames);
        }
      }
    }
  }
  if (finalSpellSet.size === 0) {
    if (!classItem) classItem = await fromUuid(classUuid);
    if (!classItem) return new Set();
    classIdentifier = foundry.utils.getProperty(classItem, 'system.identifier');
    const topLevelFolderName = getFolderNameFromPack(foundry.utils.getProperty(classItem, '_stats.compendiumSource'));
    if (!classIdentifier) return new Set();
    const preloadedData = DataUtils.getPreloadedData();
    if (preloadedData && preloadedData.spellLists.length > 0) {
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
        const document = await fromUuid(preloadedMatch.uuid);
        if (document?.system?.spells && document.system.spells.size > 0) finalSpellSet = document.system.spells;
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
      const subclassIdentifier = foundry.utils.getProperty(subclassItem, 'system.identifier');
      if (subclassIdentifier) {
        const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
        const subclassSpellList = await findSpellListByIdentifier('subclass', subclassIdentifier, customMappings);
        if (subclassSpellList && subclassSpellList.size > 0) {
          subclassSpellList.forEach((spell) => finalSpellSet.add(spell));
        }
      }
    }
  }
  if (finalSpellSet.size === 0) log(2, `No spell list found for class ${className} (${classIdentifier})`);
  log(3, 'Spell List found:', { finalSpellSet });
  return finalSpellSet;
}

/**
 * Extract top-level folder name from compendium source string.
 * @param {string} source - Compendium source string to parse
 * @returns {string} Top-level folder name or 'Unknown' if not determinable
 * @private
 */
function getFolderNameFromPack(source) {
  log(3, 'Getting folder name from pack.', { source });
  if (!source) {
    log(3, 'No compendium source provided (item not from compendium)');
    return game.i18n.localize('Unknown');
  }
  let currentFolder = foundry.utils.parseUuid(source)?.collection?.folder;
  while (currentFolder && currentFolder.depth > 1) currentFolder = currentFolder.folder;
  if (currentFolder && currentFolder.depth === 1) return currentFolder.name;
  else log(1, `Could not find top level folder, final depth: ${currentFolder?.depth}`);
  return game.i18n.localize('Unknown');
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
  log(3, 'Finding spell list by identifier.', { type, identifier, customMappings });
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
 * @param {Collection<string, Object>} pack - Pack to search for spell lists
 * @param {string} type - Type of spell list ('class' or 'subclass')
 * @param {string} identifier - Class identifier to match against
 * @param {Object<string, string>} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null if not found
 * @private
 */
async function searchPackForSpellList(pack, type, identifier, customMappings) {
  log(3, 'Searching pack for spell lists.', { pack, type, identifier, customMappings });
  const index = await pack.getIndex({ fields: ['name', 'pages.type'] });
  for (const journalData of index) {
    const hasSpellPages = journalData.pages?.some((page) => page.type === 'spells');
    if (!hasSpellPages) continue;
    const journal = await pack.getDocument(journalData._id);
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      if (!page.system?.identifier || !page.system?.spells) continue;
      const pageType = page.system.type;
      const pageIdentifier = foundry.utils.getProperty(page, 'system.identifier');
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
  log(3, 'Finding custom spell list by identifier.', { identifier });
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
      const pageIdentifier = foundry.utils.getProperty(page, 'system.identifier') || '';
      if (pageIdentifier === identifier && page.system.spells.size > 0) return page.system.spells;
    }
  }
  return null;
}

/**
 * Calculate maximum spell level available to a specific class.
 * Supports standard spell progressions, pact magic, and custom progressions.
 * @param {Object} classItem - The class item with spellcasting configuration
 * @param {Object} [actor] - The actor for additional context and calculations
 * @returns {number} Maximum spell level (0 for cantrips only, -1 for no spellcasting)
 */
export function calculateMaxSpellLevel(classItem, actor) {
  log(3, 'Calculating max spell level.', { classItem, actor });
  if (!classItem || !actor) return 0;
  const classIdentifier = foundry.utils.getProperty(classItem, 'system.identifier') || classItem.name.toLowerCase();
  const spellcastingConfig = DataUtils.getSpellcastingConfigForClass(actor, classIdentifier);
  if (!spellcastingConfig) return 0;
  const spellcastingType = spellcastingConfig.type;
  const classKey = foundry.utils.getProperty(classItem, 'identifier') || classItem.name?.slugify() || 'class';
  const classLevels = DataUtils.getSpellcastingLevelsForClass(actor, classIdentifier);

  // Look up spellcasting model from config (supports custom progressions)
  const spellcastingModel = CONFIG.DND5E.spellcasting[spellcastingType];
  if (!spellcastingModel?.table) return 0;

  const spellSlotTable = spellcastingModel.table;
  const tableSize = Array.isArray(spellSlotTable) ? spellSlotTable.length : Object.keys(spellSlotTable).length;
  if (!tableSize) return 0;

  const progression = { [spellcastingType]: 0, [classKey]: classLevels };
  const spellcastingSource = DataUtils.getSpellcastingSourceItem(actor, classIdentifier);
  actor.constructor.computeClassProgression(progression, spellcastingSource, { spellcasting: spellcastingConfig });

  // Use dnd5e's isSingleLevel to detect pact-style vs standard progressions
  if (spellcastingModel.isSingleLevel) {
    // Pact-style: single slot level (e.g., warlock)
    const spells = { [spellcastingType]: {} };
    actor.constructor.prepareSpellcastingSlots(spells, spellcastingType, progression, { actor });
    return spells[spellcastingType]?.level || 0;
  } else {
    // Standard style: multiple spell levels (e.g., wizard, cleric)
    const maxPossibleSpellLevel = spellSlotTable[spellSlotTable.length - 1].length;
    const spellLevels = [];
    for (let i = 1; i <= maxPossibleSpellLevel; i++) spellLevels.push(i);
    const spells = Object.fromEntries(spellLevels.map((l) => [`${spellcastingType}${l}`, { level: l }]));
    actor.constructor.prepareSpellcastingSlots(spells, spellcastingType, progression, { actor });
    return Object.values(spells).reduce((maxLevel, spellData) => {
      if (!spellData.max) return maxLevel;
      return Math.max(maxLevel, spellData.level || -1);
    }, 0);
  }
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
  log(3, 'Getting spell list from folder.', { topLevelFolderName, identifier, customMappings });
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
  log(3, 'Merging spell sets.', { spellSets, sourceNames });
  if (spellSets.length === 0) return new Set();
  if (spellSets.length === 1) return new Set(spellSets[0]);
  const mergedSet = new Set();
  for (let i = 0; i < spellSets.length; i++) {
    const spellSet = spellSets[i];
    const sourceName = sourceNames[i] || `List ${i + 1}`;
    if (spellSet && spellSet.size > 0) {
      const beforeSize = mergedSet.size;
      for (const spell of spellSet) mergedSet.add(spell);
      const added = mergedSet.size - beforeSize;
      log(3, `Merged ${spellSet.size} spells from ${sourceName} (${added} new, ${spellSet.size - added} duplicates)`);
    }
  }
  return mergedSet;
}
