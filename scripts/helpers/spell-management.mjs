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

    // Add flags to track the original
    pageData.flags = pageData.flags || {};
    pageData.flags[MODULE.ID] = {
      originalUuid: originalSpellList.uuid,
      originalName: originalSpellList.name,
      originalModTime: originalSpellList._stats?.modifiedTime || 0,
      originalVersion: originalSpellList._stats?.systemVersion || game.system.version,
      isDuplicate: true
    };

    // Create a new journal entry with the page already included
    const journalName = `${originalSpellList.parent.name} - ${originalSpellList.name}`;

    // Create journal with pages array that includes our spell list
    const journalData = {
      name: journalName,
      pages: [
        {
          name: originalSpellList.name,
          type: 'spells',
          flags: pageData.flags,
          system: pageData.system
        }
      ]
    };

    // Create the journal in the custom pack
    const journal = await JournalEntry.create(journalData, { pack: customPack.collection });

    // Get the first page which is our spell list
    const page = journal.pages.contents[0];

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

    // Import helper functions
    const { formatSpellDetails, extractSpellFilterData } = await import('./spell-formatting.mjs');

    // Get all item packs
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

    // Process each pack
    for (const pack of itemPacks) {
      try {
        // Request additional fields for filtering
        const index = await pack.getIndex({
          fields: [
            'type',
            'system.level',
            'system.school',
            'system.components',
            'system.activation',
            'system.range',
            'system.damage',
            'system.duration',
            'system.activities',
            'system.save',
            'system.description.value',
            'labels'
          ]
        });
        const spellEntries = index.filter((e) => e.type === 'spell' && (!maxLevel || e.system?.level <= maxLevel));

        for (const entry of spellEntries) {
          log(1, 'ENTRY:', entry);
          // Ensure we have a labels property (might be missing from index)
          if (!entry.labels) {
            entry.labels = {};

            // Potentially generate basic labels if needed
            if (entry.system?.level !== undefined) {
              entry.labels.level = CONFIG.DND5E.spellLevels[entry.system.level];
            }

            if (entry.system?.school) {
              entry.labels.school = CONFIG.DND5E.spellSchools[entry.system.school]?.label || entry.system.school;
            }
          }

          // Format details using the existing helper
          let formattedDetails;
          try {
            formattedDetails = formatSpellDetails(entry);
          } catch (err) {
            // Fallback for formatting errors
            formattedDetails = `Level ${entry.system?.level || 0} • ${entry.system?.school || ''}`;
            log(2, `Error formatting spell details for ${entry.name}: ${err.message}`);
          }

          // Create the spell object
          const spell = {
            uuid: `Compendium.${pack.collection}.${entry._id}`,
            name: entry.name,
            img: entry.img,
            level: entry.system?.level || 0,
            school: entry.system?.school || '',
            sourceId: pack.metadata.packageName,
            packName: pack.folder?.folder?.name || pack.folder?.name || pack.metadata.label,
            formattedDetails: formattedDetails,
            system: entry.system || {},
            labels: entry.labels
          };

          // Add filterData using the enhanced helper
          spell.filterData = extractSpellFilterData(spell);

          spells.push(spell);
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

/**
 * Extract conditions that might be applied by a spell
 * @param {string} description - The spell description
 * @returns {string[]} - Array of condition keys
 */
function extractConditionsFromDescription(description) {
  const conditions = [];

  if (!description) return conditions;

  // Convert to lowercase for case-insensitive matching
  const lowerDesc = description.toLowerCase();

  // Check for each condition
  for (const [key, condition] of Object.entries(CONFIG.DND5E.conditionTypes)) {
    if (lowerDesc.includes(condition.label.toLowerCase())) {
      conditions.push(key);
    }
  }

  return conditions;
}

export async function createNewSpellList(name, identifier, source = 'Custom') {
  // Create an empty journal entry with proper spell list structure
  const journalData = {
    name: `${source} - ${name}`,
    pages: [
      {
        name: name,
        type: 'spells',
        flags: {
          [MODULE.ID]: {
            isCustom: true,
            isNewList: true,
            creationDate: Date.now()
          }
        },
        system: {
          identifier: identifier.toLowerCase(),
          description: `Custom spell list for ${identifier}`,
          spells: []
        }
      }
    ]
  };

  // Create in custom pack and return the page
  const journal = await JournalEntry.create(journalData, {
    pack: `${MODULE.ID}.custom-spell-lists`
  });
  return journal.pages.contents[0];
}

/**
 * Prepare dropdown options for casting time filter
 * @param {Array} availableSpells - The available spells array
 * @param {Object} filterState - Current filter state
 * @returns {Array} Array of options for the dropdown
 */
export function prepareCastingTimeOptions(availableSpells, filterState) {
  const uniqueActivationTypes = new Map();

  // First, collect all unique combinations
  for (const spell of availableSpells) {
    const activationType = spell.system?.activation?.type;
    const activationValue = spell.system?.activation?.value || 1; // treat null as 1

    if (activationType) {
      const key = `${activationType}:${activationValue}`;
      uniqueActivationTypes.set(key, {
        type: activationType,
        value: activationValue
      });
    }
  }

  // Define a priority order for activation types
  const typeOrder = {
    action: 1,
    bonus: 2,
    reaction: 3,
    minute: 4,
    hour: 5,
    day: 6,
    legendary: 7,
    mythic: 8,
    lair: 9,
    crew: 10,
    special: 11,
    none: 12
  };

  // Convert to array for sorting
  const sortableTypes = Array.from(uniqueActivationTypes.entries()).map(([key, data]) => {
    return {
      key: key,
      type: data.type,
      value: data.value
    };
  });

  // Sort by type priority then by value
  sortableTypes.sort((a, b) => {
    const typePriorityA = typeOrder[a.type] || 999;
    const typePriorityB = typeOrder[b.type] || 999;
    if (typePriorityA !== typePriorityB) {
      return typePriorityA - typePriorityB;
    }
    return a.value - b.value;
  });

  // Create the options in the sorted order
  const options = [];
  for (const entry of sortableTypes) {
    const typeLabel = CONFIG.DND5E.abilityActivationTypes[entry.type] || entry.type;
    let label;
    if (entry.value === 1) {
      label = typeLabel;
    } else {
      label = `${entry.value} ${typeLabel}${entry.value !== 1 ? 's' : ''}`;
    }

    options.push({
      value: entry.key,
      label: label,
      selected: filterState.castingTime === entry.key
    });
  }

  return options;
}

/**
 * Prepare dropdown options for damage type filter
 * @returns {Array} Array of options for the dropdown
 */
export function prepareDamageTypeOptions(filterState) {
  const options = [];

  // Create a combined damage types object including healing
  const damageTypesWithHealing = {
    ...CONFIG.DND5E.damageTypes,
    healing: { label: game.i18n.localize('DND5E.Healing') }
  };

  // Add options for each damage type in alphabetical order by label
  Object.entries(damageTypesWithHealing)
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .forEach(([key, damageType]) => {
      options.push({
        value: key,
        label: damageType.label,
        selected: filterState.damageType === key
      });
    });

  return options;
}

/**
 * Prepare dropdown options for condition filter
 * @returns {Array} Array of options for the dropdown
 */
export function prepareConditionOptions(filterState) {
  const options = [];

  // Add options for each condition type
  Object.entries(CONFIG.DND5E.conditionTypes)
    .filter(([_key, condition]) => !condition.pseudo) // Skip pseudo conditions
    .forEach(([key, condition]) => {
      options.push({
        value: key,
        label: condition.label,
        selected: filterState.condition === key
      });
    });

  return options;
}
