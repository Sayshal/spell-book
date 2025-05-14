import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
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
  log(3, `Getting spell list for ${className}`);

  // Special handling for wizards with custom spellbooks
  if (actor) {
    try {
      const manager = wizardManager || (actor && new WizardSpellbookManager(actor));

      if (manager?.isWizard) {
        // Try to get the actor's custom spellbook
        const page = await manager.getSpellbookPage();
        if (page && page.system?.spells?.size > 0) {
          log(3, `Using actor's custom wizard spellbook with ${page.system.spells.size} spells`);
          return page.system.spells;
        }
      }
    } catch (error) {
      log(1, `Error checking actor's wizard spellbook: ${error.message}`);
    }
  }

  // Extract identifier and pack source
  let classIdentifier = null;
  let packSource = null;

  if (classUuid) {
    try {
      const classItem = await fromUuid(classUuid);
      classIdentifier = classItem?.system?.identifier?.toLowerCase();

      // Extract pack source from compendium source
      const compendiumSource = classItem?._stats?.compendiumSource;
      packSource = extractPackFromSource(compendiumSource);

      log(3, `Extracted class identifier: ${classIdentifier}, packSource: ${packSource}`);

      if (!classIdentifier && !packSource) {
        log(2, `No identifier or pack source found for class UUID: ${classUuid}`);
        return new Set();
      }
    } catch (error) {
      log(1, `Error extracting info from classUuid: ${error.message}`);
      return new Set();
    }
  } else {
    log(2, `No classUuid provided, cannot extract identifier`);
    return new Set();
  }

  // Get custom mappings
  const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};

  // PRIORITY 1: Check for spell list in same pack as class source
  if (packSource) {
    try {
      const packMatch = await findSpellListByPack(packSource, classIdentifier, customMappings);
      if (packMatch && packMatch.size > 0) {
        log(3, `Found spell list matching pack source ${packSource}`);
        return packMatch;
      }
    } catch (error) {
      log(1, `Error finding spell list by pack: ${error.message}`);
    }
  }

  // PRIORITY 2: Check for a spell list in the custom compendium with matching identifier
  const customMatch = await findCustomSpellListByIdentifier(classIdentifier);
  if (customMatch && customMatch.size > 0) {
    log(3, `Found custom spell list by identifier ${classIdentifier} in custom compendium`);
    return customMatch;
  }

  // PRIORITY 3: Fall back to standard spell lists in all compendiums
  const identifierMatch = await findSpellListByIdentifier(classIdentifier, customMappings);
  if (identifierMatch && identifierMatch.size > 0) {
    log(3, `Found spell list by identifier match for ${classIdentifier} in general compendiums`);
    return identifierMatch;
  }

  log(2, `No spell list found for identifier: ${classIdentifier}`);
  return new Set(); // Return empty set
}

/**
 * Extract compendium pack name from a compendium source string
 * @param {string} compendiumSource - The compendium source string
 * @returns {string|null} The pack name or null if not found
 */
function extractPackFromSource(compendiumSource) {
  if (!compendiumSource) return null;

  const match = compendiumSource.match(/Compendium\.([\w-]+)\./);
  return match ? match[1] : null;
}

/**
 * Find a spell list by pack and identifier match
 * @param {string} packName - The pack name to search
 * @param {string} identifier - The class identifier
 * @param {Object} customMappings - Custom spell list mappings
 * @returns {Promise<Set<string>|null>} - The matched spell list or null
 */
async function findSpellListByPack(packName, identifier, customMappings) {
  // Get all journal packs
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry' && p.collection.includes(packName));

  log(3, `Searching for spell list with pack: ${packName} and identifier: ${identifier}`);

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

            // Check for identifier match if provided
            if (identifier) {
              const pageIdentifier = page.system?.identifier?.toLowerCase() || '';
              if (pageIdentifier !== identifier) continue;
            }

            log(3, `Found matching spell list by pack and identifier: ${page.name}`);

            // Check for custom version
            if (customMappings[page.uuid]) {
              try {
                log(3, `Found custom mapping, checking custom version`);
                const customList = await fromUuid(customMappings[page.uuid]);
                if (customList && customList.system.spells.size > 0) {
                  return customList.system.spells;
                }
              } catch (error) {
                log(1, `Error retrieving custom spell list: ${error.message}`);
              }
            }

            // Use original list
            if (page.system.spells.size > 0) {
              return page.system.spells;
            }
          }
        } catch (innerError) {
          log(1, `Error processing journal ${journalData.name}:`, innerError);
        }
      }
    } catch (error) {
      log(1, `Error processing pack ${pack.metadata.label}:`, error);
    }
  }
  return null;
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
