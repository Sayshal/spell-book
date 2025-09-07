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
 * spell lists, preloaded data, and compendium sources in order of priority.
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
 * @todo Consider if this search process can be simplified or optimized
 * @param {string} identifier - Class identifier to search for
 * @param {Object<string, string>} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null if not found
 * @private
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
 * Find custom spell list with specific identifier.
 * Searches the module's custom spell lists pack for user-created
 * spell lists matching the specified class identifier.
 *
 * @param {string} identifier - Identifier to search for in custom lists
 * @returns {Promise<Set<string>|null>} Matched custom spell list or null if not found
 * @private
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
