import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as genericUtils from './generic-utils.mjs';
import { WizardSpellbookManager } from './wizard-spellbook.mjs';

/**
 * Get a class's spell list from compendium journals
 * @param {string} className - The name of the class
 * @param {string} [classUuid] - UUID of the class item
 * @param {Actor5e} [actor] - The actor (for wizard spellbook)
 * @param {WizardSpellbookManager} [wizardManager] - Existing wizard manager instance
 * @returns {Promise<Set<string>>} - Set of spell UUIDs
 */
export async function getClassSpellList(className, classUuid, actor, wizardManager) {
  if (!classUuid) return new Set();
  try {
    if (actor && genericUtils.isWizard(actor)) {
      const manager = wizardManager || new WizardSpellbookManager(actor);
      const spells = await manager.getSpellbookSpells();
      if (spells.length > 0) return new Set(spells);
    }

    const classItem = await fromUuid(classUuid);
    const classIdentifier = classItem?.system?.identifier?.toLowerCase();
    const packSource = getPackFromCompendiumSource(classItem?._stats?.compendiumSource);
    if (!classIdentifier && !packSource) return new Set();
    const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
    if (packSource) {
      const packMatch = await findSpellListByPack(packSource, classIdentifier, customMappings);
      if (packMatch && packMatch.size > 0) return packMatch;
    }

    const customMatch = await findCustomSpellListByIdentifier(classIdentifier);
    if (customMatch && customMatch.size > 0) return customMatch;
    const identifierMatch = await findSpellListByIdentifier(classIdentifier, customMappings);
    if (identifierMatch && identifierMatch.size > 0) return identifierMatch;
    return new Set();
  } catch (error) {
    log(1, `Error getting spell list for ${className}:`, error);
    return new Set();
  }
}

/**
 * Extract pack name from compendium source string
 * @param {string} source - Compendium source string
 * @returns {string|null} Pack name or null
 */
function getPackFromCompendiumSource(source) {
  if (!source) return null;
  const match = source.match(/Compendium\.([\w-]+)\./);
  return match ? match[1] : null;
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
    try {
      const spellList = await searchPackForSpellList(pack, identifier, customMappings);
      if (spellList) return spellList;
    } catch (error) {
      log(1, `Error processing pack ${pack.metadata.label}:`, error);
    }
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
    try {
      const spellList = await searchPackForSpellList(pack, identifier, customMappings);
      if (spellList) return spellList;
    } catch (error) {
      log(1, `Error processing pack ${pack.metadata.label}:`, error);
    }
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
    try {
      const journal = await pack.getDocument(journalData._id);
      for (const page of journal.pages) {
        if (page.type !== 'spells') continue;
        const pageIdentifier = page.system?.identifier?.toLowerCase() || '';
        if (identifier && pageIdentifier !== identifier) continue;
        if (customMappings[page.uuid]) {
          try {
            const customList = await fromUuid(customMappings[page.uuid]);
            if (customList?.system.spells.size > 0) return customList.system.spells;
          } catch (error) {
            log(1, `Error retrieving custom spell list:`, error);
          }
        }
        if (page.system.spells.size > 0) return page.system.spells;
      }
    } catch (error) {
      log(1, `Error processing journal ${journalData.name}:`, error);
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
  const customPack = game.packs.get(MODULE.PACK);
  try {
    const index = await customPack.getIndex();
    for (const journalData of index) {
      const journal = await customPack.getDocument(journalData._id);
      for (const page of journal.pages) {
        if (page.type !== 'spells') continue;
        const flags = page.flags?.[MODULE.ID] || {};
        if (!flags.isCustom && !flags.isNewList) continue;
        const pageIdentifier = page.system?.identifier?.toLowerCase() || '';
        if (pageIdentifier === identifier && page.system.spells.size > 0) {
          return page.system.spells;
        }
      }
    }
  } catch (error) {
    log(1, `Error searching custom spell lists:`, error);
  }
  return null;
}

/**
 * Calculate maximum spell level available to a character
 * @param {number} actorLevel - Actor's level
 * @param {object} spellcasting - Spellcasting configuration
 * @returns {number} Maximum spell level (0 for cantrips only)
 */
export function calculateMaxSpellLevel(actorLevel, spellcasting) {
  if (!spellcasting || spellcasting.progression === 'none') return 0;
  const levelIndex = Math.min(Math.max(actorLevel - 1, 0), CONFIG.DND5E.SPELL_SLOT_TABLE.length - 1);
  const spellSlots = CONFIG.DND5E.SPELL_SLOT_TABLE[levelIndex];
  return spellSlots.length;
}

/**
 * Check if an actor can cast spells
 * @param {Actor5e} actor - Actor to check
 * @returns {boolean} Whether the actor can cast spells
 */
export function canCastSpells(actor) {
  return actor?.system?.attributes?.spellcasting && (actor.items.some((i) => i.type === 'spell') || actor.items.some((i) => i.type === 'class' && i.system?.spellcasting?.progression !== 'none'));
}
