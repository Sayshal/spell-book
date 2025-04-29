/**
 * Helper functions for GM Spell List Manager
 * @module spell-book/helpers/spell-manager-helpers
 */

import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Scan compendiums for spell lists
 * @returns {Promise<Array>} Array of spell list objects with metadata
 */
export async function findCompendiumSpellLists() {
  const spellLists = [];

  // Get all journal-type compendium packs
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');

  log(3, `Searching ${journalPacks.length} journal packs for spell lists`);

  for (const pack of journalPacks) {
    try {
      // Skip our own custom spell lists pack
      if (pack.metadata.id === `${MODULE.ID}.custom-spell-lists`) {
        log(3, 'Skipping custom spell lists pack');
        continue;
      }

      // Get the basic index
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

            // This is a spell list, add to our results
            spellLists.push({
              uuid: page.uuid,
              name: page.name,
              journal: journal.name,
              pack: pack.metadata.label,
              packageName: pack.metadata.packageName,
              system: page.system,
              spellCount: page.system.spells?.size || 0,
              identifier: page.system.identifier
            });

            log(3, `Found spell list: ${page.name} in ${journal.name} (${page.system.spells?.size || 0} spells)`);
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

  log(3, `Found ${spellLists.length} total spell lists`);
  return spellLists;
}

/**
 * Compare versions of original and custom spell lists
 * @param {string} originalUuid - UUID of the original spell list
 * @param {string} customUuid - UUID of the custom spell list
 * @returns {Promise<Object>} Comparison results
 */
export async function compareListVersions(originalUuid, customUuid) {
  try {
    const original = await fromUuid(originalUuid);
    const custom = await fromUuid(customUuid);

    if (!original || !custom) {
      return {
        canCompare: false,
        reason: !original ? 'Original not found' : 'Custom not found'
      };
    }

    // Get modification times for both
    const originalModTime = original._stats?.modifiedTime || 0;
    const customModTime = custom._stats?.modifiedTime || 0;
    const originalVersion = original._stats?.systemVersion || '';
    const customVersion = custom._stats?.systemVersion || '';

    // Get stats saved when custom version was created
    const savedOriginalModTime = custom.flags?.[MODULE.ID]?.originalModTime || 0;
    const savedOriginalVersion = custom.flags?.[MODULE.ID]?.originalVersion || '';

    // Check if original has been updated
    const hasOriginalChanged = originalModTime > savedOriginalModTime || originalVersion !== savedOriginalVersion;

    // Compare spell lists
    const originalSpells = original.system.spells || new Set();
    const customSpells = custom.system.spells || new Set();

    // Calculate differences
    const added = [...customSpells].filter((uuid) => !originalSpells.has(uuid));
    const removed = [...originalSpells].filter((uuid) => !customSpells.has(uuid));

    return {
      canCompare: true,
      hasOriginalChanged,
      added: added.length,
      removed: removed.length,
      originalSpellCount: originalSpells.size,
      customSpellCount: customSpells.size,
      originalModTime,
      customModTime,
      originalVersion,
      customVersion,
      savedOriginalModTime,
      savedOriginalVersion
    };
  } catch (error) {
    log(1, 'Error comparing spell list versions:', error);
    return {
      canCompare: false,
      reason: `Error: ${error.message}`
    };
  }
}

/**
 * Get mappings between original and custom spell lists
 * @returns {Object} Mapping data
 */
export function getCustomListMappings() {
  return game.settings.get(MODULE.ID, 'customSpellListMappings') || {};
}
