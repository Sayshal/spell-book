import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from '../managers/rule-set-manager.mjs';

/**
 * Get a class's spell list from compendium journals
 * @param {string} className - The name of the class
 * @param {string} [classUuid] - UUID of the class item
 * @param {Actor5e} [actor] - The actor (for custom spell list lookup)
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
  const topLevelFolderName = getTopLevelFolderFromCompendiumSource(classItem?._stats?.compendiumSource);
  if (!classIdentifier) return new Set();
  const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
  if (topLevelFolderName) {
    const folderMatch = await findSpellListByTopLevelFolder(topLevelFolderName, classIdentifier, customMappings);
    if (folderMatch && folderMatch.size > 0) return folderMatch;
  }
  const customMatch = await findCustomSpellListByIdentifier(classIdentifier);
  if (customMatch && customMatch.size > 0) return customMatch;
  const identifierMatch = await findSpellListByIdentifier(classIdentifier, customMappings);
  if (identifierMatch && identifierMatch.size > 0) return identifierMatch;
  log(1, `No spell list found for class ${className} (${classIdentifier}) from folder "${topLevelFolderName}"`);
  return new Set();
}

/**
 * Extract top-level folder name from compendium source string
 * @param {string} source - Compendium source string
 * @returns {string|null} Top-level folder name or null
 */
function getTopLevelFolderFromCompendiumSource(source) {
  if (!source) return null;
  const packCollection = foundry.utils.parseUuid(source).collection.metadata.id;
  const pack = game.packs.get(packCollection);
  if (!pack) return null;
  if (pack.folder) {
    let currentFolder = pack.folder;
    while (currentFolder && currentFolder.depth > 1) currentFolder = currentFolder.folder;
    if (currentFolder && currentFolder.depth === 1) return currentFolder.name;
    else log(1, `Could not find top level folder, final depth: ${currentFolder?.depth || 'undefined'}`);
  }
  log(1, `No folder structure found for pack: ${packCollection}`);
  return null;
}

/**
 * Find spell list by pack and identifier
 * @param {string} packName - Pack name to search
 * @param {string} identifier - Class identifier
 * @param {Object} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null
 */
async function findSpellListByPack(packName, identifier, customMappings) {
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry' && p.collection.includes(packName));
  for (const pack of journalPacks) {
    const spellList = await searchPackForSpellList(pack, identifier, customMappings);
    if (spellList) return spellList;
  }
  return null;
}

/**
 * Find spell list by identifier across all packs
 * @param {string} identifier - Class identifier
 * @param {Object} customMappings - Custom spell list mappings
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
 * @param {CompendiumCollection} pack - Pack to search
 * @param {string} identifier - Class identifier to match
 * @param {Object} customMappings - Custom spell list mappings
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
 * @param {string} identifier - Identifier to search for
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
 * @param {Item} classItem - The class item with spellcasting configuration
 * @param {Actor5e} [actor] - The actor (optional, for additional context)
 * @returns {number} Maximum spell level (0 for cantrips only)
 */
export function calculateMaxSpellLevel(classItem, actor) {
  const spellcasting = classItem?.system?.spellcasting;
  if (!spellcasting || spellcasting.progression === 'none') return 0;

  if (spellcasting?.type === 'leveled' || spellcasting?.progression !== 'pact') {
    const progression = {
      slot: 0,
      // Add class level information that might be needed in 3.X
      [classItem.identifier || classItem.name?.slugify() || 'class']: classItem.system?.levels || 0
    };

    const maxPossibleSpellLevel = CONFIG.DND5E.SPELL_SLOT_TABLE[CONFIG.DND5E.SPELL_SLOT_TABLE.length - 1].length;
    const spellLevels = [];
    for (let i = 1; i <= maxPossibleSpellLevel; i++) spellLevels.push(i);
    const spells = Object.fromEntries(spellLevels.map((l) => [`spell${l}`, { level: l }]));
    try {
      actor.constructor.computeClassProgression(progression, classItem, { spellcasting });
      if (!progression.slot && classItem.system?.levels) {
        const classLevel = classItem.system.levels;
        const spellcastingLevel = Math.floor(
          classLevel *
            (spellcasting.progression === 'full' ? 1
            : spellcasting.progression === 'half' ? 0.5
            : spellcasting.progression === 'third' ? 1 / 3
            : 0)
        );
        progression.slot = Math.max(1, spellcastingLevel);
      }
      actor.constructor.prepareSpellcastingSlots(spells, 'leveled', progression);
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
  } else if (spellcasting?.type === 'pact' || spellcasting?.progression === 'pact') {
    const spells = { pact: {} };
    const progression = {
      pact: 0,
      // Add class level for 3.X compatibility
      [classItem.identifier || classItem.name?.slugify() || 'class']: classItem.system?.levels || 0
    };
    try {
      actor.constructor.computeClassProgression(progression, classItem, { spellcasting });
      actor.constructor.prepareSpellcastingSlots(spells, 'pact', progression);
      return spells.pact.level || 0;
    } catch (error) {
      log(1, 'Error calculating pact spell progression:', error);
      return 0;
    }
  }
  return 0;
}

/**
 * Check if an actor can cast spells
 * @param {Actor5e} actor - Actor to check
 * @returns {boolean} Whether the actor can cast spells
 */
export function canCastSpells(actor) {
  return Object.keys(actor?.spellcastingClasses || {}).length > 0;
}

/**
 * Find spell list by top-level folder name and identifier
 * @param {string} topLevelFolderName - Top-level folder name to match
 * @param {string} identifier - Class identifier
 * @param {Object} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} Matched spell list or null
 */
async function findSpellListByTopLevelFolder(topLevelFolderName, identifier, customMappings) {
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
  for (const pack of journalPacks) {
    let packTopLevelFolder = null;
    if (pack.folder) packTopLevelFolder = pack.folder.name;
    if (packTopLevelFolder !== topLevelFolderName) continue;
    const spellList = await searchPackForSpellList(pack, identifier, customMappings);
    if (spellList) return spellList;
  }
  log(1, `No spell list found for folder "${topLevelFolderName}", identifier "${identifier}"`);
  return null;
}
