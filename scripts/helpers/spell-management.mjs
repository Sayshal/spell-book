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

/**
 * Duplicate a spell list to the custom pack
 * @param {Object} originalSpellList - The original spell list document
 * @returns {Promise<JournalEntryPage>} The duplicated spell list
 */
export async function duplicateSpellList(originalSpellList) {
  try {
    log(3, `Duplicating spell list: ${originalSpellList.name}`);

    // Get the custom spell list pack
    const customPack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);
    if (!customPack) {
      throw new Error('Custom spell lists pack not found');
    }

    // Check if a duplicate already exists
    const existingDuplicate = await findDuplicateSpellList(originalSpellList.uuid);
    if (existingDuplicate) {
      log(3, `Duplicate already exists, returning existing duplicate: ${existingDuplicate.name}`);
      return existingDuplicate;
    }

    // Create a copy of the original spell list data
    const pageData = originalSpellList.toObject();

    // Create a new journal entry in the custom pack
    const journalName = `${originalSpellList.parent.name} - ${originalSpellList.name}`;
    let journal = await JournalEntry.create(
      {
        name: journalName,
        pages: []
      },
      { pack: customPack.collection }
    );

    // Add flags to track the original
    pageData.flags = pageData.flags || {};
    pageData.flags[MODULE.ID] = {
      originalUuid: originalSpellList.uuid,
      originalName: originalSpellList.name,
      originalModTime: originalSpellList._stats?.modifiedTime || 0,
      originalVersion: originalSpellList._stats?.systemVersion || game.system.version,
      isDuplicate: true
    };

    // Create the page in the journal
    const page = await journal.createPage({
      ...pageData,
      name: originalSpellList.name
    });

    // Update mapping settings
    await updateSpellListMapping(originalSpellList.uuid, page.uuid);

    log(3, `Successfully duplicated spell list: ${originalSpellList.name} to ${page.uuid}`);
    return page;
  } catch (error) {
    log(1, `Error duplicating spell list: ${error.message}`);
    throw error;
  }
}

/**
 * Find a duplicate spell list in the custom pack
 * @param {string} originalUuid - UUID of the original spell list
 * @returns {Promise<JournalEntryPage|null>} The duplicate spell list or null
 */
export async function findDuplicateSpellList(originalUuid) {
  try {
    const customPack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);
    if (!customPack) return null;

    // Get all journal entries in the custom pack
    const journals = await customPack.getDocuments();

    // Search through all pages in all journals
    for (const journal of journals) {
      for (const page of journal.pages) {
        const flags = page.flags?.[MODULE.ID] || {};
        if (flags.originalUuid === originalUuid) {
          return page;
        }
      }
    }

    return null;
  } catch (error) {
    log(1, `Error finding duplicate spell list: ${error.message}`);
    return null;
  }
}

/**
 * Update the spell list mapping settings
 * @param {string} originalUuid - UUID of the original spell list
 * @param {string} duplicateUuid - UUID of the duplicate spell list
 * @returns {Promise<void>}
 */
export async function updateSpellListMapping(originalUuid, duplicateUuid) {
  try {
    const mappings = game.settings.get(MODULE.ID, 'customSpellListMappings') || {};

    // Add or update the mapping
    mappings[originalUuid] = duplicateUuid;

    // Save to settings
    await game.settings.set(MODULE.ID, 'customSpellListMappings', mappings);

    log(3, `Updated spell list mapping: ${originalUuid} -> ${duplicateUuid}`);
  } catch (error) {
    log(1, `Error updating spell list mappings: ${error.message}`);
  }
}

/**
 * Remove a custom spell list and its mapping
 * @param {string} duplicateUuid - UUID of the duplicate spell list
 * @returns {Promise<boolean>} Whether the removal was successful
 */
export async function removeCustomSpellList(duplicateUuid) {
  try {
    // Get the duplicate
    const duplicate = await fromUuid(duplicateUuid);
    if (!duplicate) return false;

    // Get the original UUID from flags
    const originalUuid = duplicate.flags?.[MODULE.ID]?.originalUuid;

    // Remove the mapping if original UUID exists
    if (originalUuid) {
      const mappings = game.settings.get(MODULE.ID, 'customSpellListMappings') || {};
      delete mappings[originalUuid];
      await game.settings.set(MODULE.ID, 'customSpellListMappings', mappings);
    }

    // Delete the page
    await duplicate.delete();

    log(3, `Successfully removed custom spell list: ${duplicateUuid}`);
    return true;
  } catch (error) {
    log(1, `Error removing custom spell list: ${error.message}`);
    return false;
  }
}

/**
 * Add a spell to a spell list
 * @param {JournalEntryPage} spellList - The spell list to add to
 * @param {string} spellUuid - UUID of the spell to add
 * @returns {Promise<JournalEntryPage>} The updated spell list
 */
export async function addSpellToList(spellList, spellUuid) {
  try {
    // Get current spells
    const spells = new Set(spellList.system.spells || []);

    // Check if spell already exists
    if (spells.has(spellUuid)) {
      log(3, `Spell ${spellUuid} already in list`);
      return spellList;
    }

    // Add the new spell
    spells.add(spellUuid);

    // Update the spell list
    const updated = await spellList.update({
      'system.spells': Array.from(spells)
    });

    log(3, `Added spell ${spellUuid} to list ${spellList.name}`);
    return updated;
  } catch (error) {
    log(1, `Error adding spell to list: ${error.message}`);
    throw error;
  }
}

/**
 * Remove a spell from a spell list
 * @param {JournalEntryPage} spellList - The spell list to remove from
 * @param {string} spellUuid - UUID of the spell to remove
 * @returns {Promise<JournalEntryPage>} The updated spell list
 */
export async function removeSpellFromList(spellList, spellUuid) {
  try {
    // Get current spells
    const spells = new Set(spellList.system.spells || []);

    // Check if spell exists in the list
    if (!spells.has(spellUuid)) {
      log(3, `Spell ${spellUuid} not found in list`);
      return spellList;
    }

    // Remove the spell
    spells.delete(spellUuid);

    // Update the spell list
    const updated = await spellList.update({
      'system.spells': Array.from(spells)
    });

    log(3, `Removed spell ${spellUuid} from list ${spellList.name}`);
    return updated;
  } catch (error) {
    log(1, `Error removing spell from list: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch all compendium spells
 * @param {number} [maxLevel=9] - Maximum spell level to include
 * @returns {Promise<Array>} Array of spell items
 */
export async function fetchAllCompendiumSpells(maxLevel = 9) {
  try {
    log(3, 'Fetching all compendium spells');
    const spells = [];

    // Get all item packs
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

    // Process each pack
    for (const pack of itemPacks) {
      try {
        const index = await pack.getIndex({ fields: ['type', 'system.level', 'system.school'] });
        const spellEntries = index.filter((e) => e.type === 'spell' && (!maxLevel || e.system?.level <= maxLevel));

        for (const entry of spellEntries) {
          spells.push({
            uuid: `Compendium.${pack.collection}.${entry._id}`,
            name: entry.name,
            img: entry.img,
            level: entry.system?.level || 0,
            school: entry.system?.school || ''
          });
        }
      } catch (error) {
        log(2, `Error processing pack ${pack.metadata.label}: ${error.message}`);
      }
    }

    // Sort spells by level and name
    spells.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name);
    });

    log(3, `Fetched ${spells.length} compendium spells`);
    return spells;
  } catch (error) {
    log(1, `Error fetching compendium spells: ${error.message}`);
    throw error;
  }
}
