/**
 * Helper functions for spell class discovery
 * Handles identification of spellcasting classes and spell lists
 * @module spell-book/helpers/spell-discovery
 */

import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Get a class's spell list from compendium journals
 * @param {string} className - The name of the class (used only for logging)
 * @param {string} [classUuid] - UUID of the class item
 * @returns {Promise<Set<string>>} - Set of spell UUIDs
 */
export async function getClassSpellList(className, classUuid) {
  log(3, `Getting spell list for ${className}`);

  // Extract class identifier from the class item
  let classIdentifier = null;
  if (classUuid) {
    try {
      const classItem = await fromUuid(classUuid);
      classIdentifier = classItem?.system?.identifier?.toLowerCase();

      if (!classIdentifier) {
        log(2, `No identifier found in class item with UUID: ${classUuid}`);
        return new Set(); // Early return if no identifier is found
      }

      log(3, `Extracted class identifier: ${classIdentifier}`);
    } catch (error) {
      log(1, `Error extracting identifier from classUuid: ${error.message}`);
      return new Set(); // Early return on error
    }
  } else {
    log(2, `No classUuid provided, cannot extract identifier`);
    return new Set(); // Early return if no classUuid is provided
  }

  // Get custom mappings
  const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};

  // First, check for exact identifier match in journal spell lists
  const identifierMatch = await findSpellListByIdentifier(classIdentifier, customMappings);
  if (identifierMatch && identifierMatch.size > 0) {
    log(3, `Found spell list by identifier match for ${classIdentifier}`);
    return identifierMatch;
  }

  // Next, check custom spell lists with isCustom flag
  const customMatch = await findCustomSpellListByIdentifier(classIdentifier);
  if (customMatch && customMatch.size > 0) {
    log(3, `Found custom spell list for identifier: ${classIdentifier}`);
    return customMatch;
  }

  log(2, `No spell list found for identifier: ${classIdentifier}`);
  return new Set(); // Return empty set
}

/**
 * Find a spell list by exact identifier match
 * @param {string} identifier - The class identifier
 * @param {Object} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} - The matched spell list or null
 */
async function findSpellListByIdentifier(identifier, customMappings) {
  // Get all journal packs
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');

  log(3, `Searching ${journalPacks.length} journal packs for identifier: ${identifier}`);

  for (const pack of journalPacks) {
    try {
      const index = await pack.getIndex();
      const entries = Array.from(index.values());

      for (const journalData of entries) {
        try {
          const journal = await pack.getDocument(journalData._id);

          for (const page of journal.pages) {
            // Skip non-spell list pages
            if (page.type !== 'spells') continue;

            // Check for exact identifier match
            const pageIdentifier = page.system?.identifier?.toLowerCase() || '';

            if (pageIdentifier === identifier) {
              log(3, `Found matching spell list by identifier: ${page.name}`);

              // Check for custom version
              if (customMappings[page.uuid]) {
                try {
                  log(3, `Found custom mapping, checking custom version`);
                  const customList = await fromUuid(customMappings[page.uuid]);
                  if (customList && customList.system.spells.size > 0) {
                    log(3, `Using custom spell list with ${customList.system.spells.size} spells`);
                    return customList.system.spells;
                  } else {
                    log(2, `Custom spell list not found or empty, falling back to original`);
                  }
                } catch (error) {
                  log(1, `Error retrieving custom spell list: ${error.message}`);
                }
              }

              // Use original list
              if (page.system.spells.size > 0) {
                log(3, `Found ${page.system.spells.size} spells by identifier match`);
                return page.system.spells;
              }
            }
          }
        } catch (innerError) {
          log(1, `Error processing journal ${journalData.name}:`, innerError);
          continue;
        }
      }
    } catch (error) {
      log(1, `Error processing pack ${pack.metadata.label}:`, error);
    }
  }
  return null;
}

/**
 * Find a custom spell list with a specific identifier
 * @param {string} identifier - The identifier to search for
 * @returns {Promise<Set<string>|null>} - The matched spell list or null
 */
async function findCustomSpellListByIdentifier(identifier) {
  try {
    const customPack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);
    if (!customPack) return null;

    log(3, `Checking custom spell lists pack for identifier: ${identifier}`);

    const index = await customPack.getIndex();
    const entries = Array.from(index.values());

    for (const journalData of entries) {
      try {
        const journal = await customPack.getDocument(journalData._id);

        for (const page of journal.pages) {
          // Skip non-spell list pages
          if (page.type !== 'spells') continue;

          // Check for isCustom or isNewList flag
          const flags = page.flags?.[MODULE.ID] || {};
          if (!flags.isCustom && !flags.isNewList) continue;

          // Check if identifier matches
          const pageIdentifier = page.system?.identifier?.toLowerCase() || '';

          if (pageIdentifier === identifier) {
            log(3, `Found custom spell list with matching identifier: ${page.name}`);
            if (page.system.spells.size > 0) {
              return page.system.spells;
            }
          }
        }
      } catch (innerError) {
        log(1, `Error processing custom journal ${journalData.name}:`, innerError);
        continue;
      }
    }

    log(3, `No custom spell list found with identifier: ${identifier}`);
  } catch (error) {
    log(1, `Error searching custom spell lists: ${error.message}`);
  }
  return null;
}

/**
 * Find a spellcasting class for an actor
 * @param {Actor5e} actor - The actor to check
 * @returns {Item5e|null} - The first class item with spellcasting or null
 */
export function findSpellcastingClass(actor) {
  return actor.items.find((i) => i.type === 'class' && i.system?.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
}

/**
 * Calculate the maximum spell level available to a character
 * @param {number} actorLevel - The actor's level
 * @param {object} spellcasting - The spellcasting configuration
 * @returns {number} - The maximum spell level (0 for cantrips only)
 */
export function calculateMaxSpellLevel(actorLevel, spellcasting) {
  let maxSpellLevel = 0; // Default to cantrips

  if (spellcasting && spellcasting.progression !== 'none') {
    // Adjust index and get spell slots
    const levelIndex = Math.min(Math.max(actorLevel - 1, 0), CONFIG.DND5E.SPELL_SLOT_TABLE.length - 1);
    const spellSlots = CONFIG.DND5E.SPELL_SLOT_TABLE[levelIndex];

    // Find the highest level with spell slots
    maxSpellLevel = spellSlots.length;
  }

  return maxSpellLevel;
}

/**
 * Check if an actor can cast spells
 * @param {Actor5e} actor - The actor to check
 * @returns {boolean} - Whether the actor can cast spells
 */
export function canCastSpells(actor) {
  return actor?.system?.attributes?.spellcasting && (actor.items.some((i) => i.type === 'spell') || actor.items.some((i) => i.type === 'class' && i.system?.spellcasting?.progression !== 'none'));
}
