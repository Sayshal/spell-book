import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from '../managers/_module.mjs';
import * as DataHelpers from './_module.mjs';

/**
 * Get a class's spell list from compendium journals
 * @param {string} className The name of the class
 * @param {string} [classUuid] UUID of the class item
 * @param {Actor5e} [actor] The actor (for custom spell list lookup)
 * @returns {Promise<Set<string>>} - Set of spell UUIDs
 */
export async function getClassSpellList(className, classUuid, actor) {
  if (!classUuid) return new Set();
  if (actor) {
    const classItem = await fromUuid(classUuid);
    if (classItem) {
      const classIdentifier = classItem?.system?.identifier?.toLowerCase() || className.toLowerCase();
      const classRules = RuleSetManager.getClassRules(actor, classIdentifier);
      if (classRules.customSpellList) {
        log(3, `Using custom spell list for ${className}: ${classRules.customSpellList}`);
        const customSpellList = await fromUuid(classRules.customSpellList);
        if (customSpellList && customSpellList.system?.spells) return customSpellList.system.spells;
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
        if (document?.system?.spells && document.system.spells.size > 0) {
          return document.system.spells;
        }
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
 * Extract top-level folder name from compendium source string
 * @param {string} source Compendium source string
 * @returns {string} Top-level folder name or 'Unknown'
 */
function getFolderNameFromPack(source) {
  if (!source) return 'Unknown';
  const packCollection = foundry.utils.parseUuid(source).collection.metadata.id;
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
 * Find spell list by identifier across all packs
 * @todo - Can this be simplified?
 * @param {string} identifier Class identifier
 * @param {Object} customMappings Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null
 */
async function findSpellListByIdentifier(identifier, customMappings) {
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
  for (const pack of journalPacks) {
    const spellList = await searchPackForSpellList(pack, identifier, customMappings);
    if (spellList) return spellList;
  }
  return null;
}

/**
 * Search pack for spell list matching identifier
 * @param {CompendiumCollection} pack Pack to search
 * @param {string} identifier Class identifier to match
 * @param {Object} customMappings Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null
 */
async function searchPackForSpellList(pack, identifier, customMappings) {
  const index = await pack.getIndex();
  for (const journalData of index) {
    const journal = await pack.getDocument(journalData._id);
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      const pageIdentifier = page.system?.identifier?.toLowerCase() || '';
      if (identifier && pageIdentifier !== identifier) continue;
      if (customMappings[page.uuid]) {
        const customList = await fromUuid(customMappings[page.uuid]);
        if (customList?.system.spells.size > 0) return customList.system.spells;
      }
      if (page.system.spells.size > 0) return page.system.spells;
    }
  }
  return null;
}

/**
 * Find custom spell list with specific identifier
 * @param {string} identifier Identifier to search for
 * @returns {Promise<Set<string>|null>} Matched spell list or null
 */
async function findCustomSpellListByIdentifier(identifier) {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
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
 * Calculate maximum spell level available to a specific class
 * @param {Item} classItem The class item with spellcasting configuration
 * @param {Actor5e} [actor] The actor (optional, for additional context)
 * @returns {number} Maximum spell level (0 for cantrips only)
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
    const progression = { spell: 0, [classKey]: classLevels };
    const spellSlotTable = CONFIG.DND5E.spellcasting.spell.table;
    if (!spellSlotTable || !spellSlotTable.length) {
      log(1, 'No spell slot table found');
      return 0;
    }
    const maxPossibleSpellLevel = spellSlotTable[spellSlotTable.length - 1].length;
    const spellLevels = [];
    for (let i = 1; i <= maxPossibleSpellLevel; i++) spellLevels.push(i);
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
    const spells = { pact: {} };
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
 * Find spell list by top-level folder name and identifier
 * @param {string} topLevelFolderName Top-level folder name to match
 * @param {string} identifier Class identifier
 * @param {Object} customMappings Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null
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
