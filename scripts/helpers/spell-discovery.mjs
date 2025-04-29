/**
 * Helper functions for spell class discovery
 * Handles identification of spellcasting classes and spell lists
 * @module spell-book/helpers/spell-discovery
 */

import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Discover all spellcasting classes by examining compendium content
 * Populates MODULE.SPELLCASTING_CLASSES with discovered classes
 * @returns {Promise<void>}
 */
export async function discoverSpellcastingClasses() {
  log(3, 'Discovering spellcasting classes...');

  // Reset the arrays
  MODULE.SPELLCASTING_CLASSES.KNOWN = [];
  MODULE.SPELLCASTING_CLASSES.PACT = [];

  // Get all item compendiums
  const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

  for (const pack of itemPacks) {
    try {
      // Get the index
      const index = await pack.getIndex();

      // Filter for class entries
      const classEntries = index.filter((entry) => entry.type === 'class');

      // Process each class
      for (const entry of classEntries) {
        try {
          // Get the actual document
          const classItem = await pack.getDocument(entry._id);

          // Skip if this doesn't have spellcasting
          if (!classItem.system?.spellcasting?.progression || classItem.system.spellcasting.progression === 'none') {
            continue;
          }

          const className = classItem.name.toLowerCase();
          const sourceId = classItem.system?.source?.value || pack.metadata.label;
          const classIdentifier = {
            name: className,
            source: sourceId,
            uuid: classItem.uuid
          };

          // Categorize by type first
          const spellcastingType = classItem.system?.spellcasting?.type;
          if (spellcastingType === 'pact') {
            if (!MODULE.SPELLCASTING_CLASSES.PACT.some((c) => c.name === className && c.source === sourceId)) {
              MODULE.SPELLCASTING_CLASSES.PACT.push(classIdentifier);
            }
          } else if (!MODULE.SPELLCASTING_CLASSES.KNOWN.some((c) => c.name === className && c.source === sourceId)) {
            MODULE.SPELLCASTING_CLASSES.KNOWN.push(classIdentifier);
          }
        } catch (error) {
          log(2, `Error processing class ${entry.name}:`, error);
        }
      }
    } catch (error) {
      log(2, `Error processing pack ${pack.metadata.label}:`, error);
    }
  }

  log(3, `Discovered ${MODULE.SPELLCASTING_CLASSES.KNOWN.length} standard and ${MODULE.SPELLCASTING_CLASSES.PACT.length} pact spellcasting classes`);
}

/**
 * Get a class's spell list from compendium journals
 * @param {string} className - The name of the class
 * @param {string} [classUuid] - Optional UUID of the class item
 * @returns {Promise<Set<string>>} - Set of spell UUIDs or empty set if none found
 */
export async function getClassSpellList(className, classUuid) {
  log(3, `Getting spell list for ${className}`);

  // Normalize the class name for comparison
  const normalizedClassName = className.toLowerCase();

  // If classUuid is provided, first extract its source
  let sourceCompendium = null;
  if (classUuid) {
    try {
      const classItem = await fromUuid(classUuid);
      sourceCompendium = classItem?._source?._stats?.compendiumSource;
      log(3, `Extracted source: ${sourceCompendium}`);
    } catch (error) {
      log(2, 'Error extracting source from classUuid');
    }
  }

  // Filter for journal-type compendium packs that match the source
  const journalPacks = Array.from(game.packs)
    .filter((p) => p.metadata.type === 'JournalEntry')
    .filter((p) => !sourceCompendium || p.metadata.packageName === sourceCompendium.split('.')[1]);

  log(3, `Searching ${journalPacks.length} journal packs`);

  // Get mappings for custom spell lists
  const customMappings = game.settings.get(MODULE.ID, 'customSpellListMappings') || {};

  for (const pack of journalPacks) {
    try {
      // Just get the basic index first
      const index = await pack.getIndex();

      // Convert to array for easier processing
      const entries = Array.from(index.values());

      // Process each journal in the pack
      for (const journalData of entries) {
        try {
          // Load the full document
          const journal = await pack.getDocument(journalData._id);

          // Check each page in the journal
          for (const page of journal.pages) {
            // Skip pages that aren't spell lists
            if (page.type !== 'spells') continue;

            const pageName = page.name?.toLowerCase() || '';
            const pageIdentifier = page.system?.identifier?.toLowerCase() || '';
            const isNameMatch = pageIdentifier === normalizedClassName || pageName.includes(`${normalizedClassName} spell`) || pageName.includes(`${normalizedClassName}'s spell`);

            const isUuidMatch = !sourceCompendium || sourceCompendium.split('.').slice(0, 2).join('.') === journal.uuid.split('.').slice(0, 2).join('.');

            if (isNameMatch && isUuidMatch) {
              log(3, `Found matching spell list: ${page.name}`);

              // Check for custom version
              if (customMappings[page.uuid]) {
                try {
                  log(3, `Found custom mapping for ${page.name}, checking custom version`);
                  const customList = await fromUuid(customMappings[page.uuid]);
                  if (customList && customList.system.spells.size > 0) {
                    log(3, `Using custom spell list with ${customList.system.spells.size} spells`);
                    return customList.system.spells;
                  } else {
                    log(2, `Custom spell list not found or empty, falling back to original`);
                  }
                } catch (error) {
                  log(2, `Error retrieving custom spell list: ${error.message}`);
                  // Fall back to original
                }
              }

              // Direct check for spells array (original list)
              if (page.system.spells.size > 0) {
                log(3, `Found ${page.system.spells.size} spells`);
                return page.system.spells;
              }
            }
          }
        } catch (innerError) {
          log(2, `Error processing journal ${journalData.name}:`, innerError);
          continue;
        }
      }
    } catch (error) {
      log(2, `Error processing pack ${pack.metadata.label}:`, error);
    }
  }

  log(2, `No spell list found for ${className}`);
  return new Set(); // Return empty set instead of null for consistency
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
 * Calculate the maximum spell level available to a character based on class and level
 * @param {number} actorLevel - The actor's level
 * @param {object} spellcasting - The spellcasting configuration from the class
 * @returns {number} - The maximum spell level (0 for cantrips only)
 */
export function calculateMaxSpellLevel(actorLevel, spellcasting) {
  let maxSpellLevel = 0; // Default to cantrips

  if (spellcasting && spellcasting.progression !== 'none') {
    // Adjust index to be 0-based and clamped
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
