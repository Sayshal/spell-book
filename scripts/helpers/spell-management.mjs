/**
 * Helper functions for GM Spell List Manager
 * @module spell-book/helpers/spell-manager-helpers
 */

import { MODULE } from '../constants.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import { log } from '../logger.mjs';

// Cache for compendium spell lists
const spellListCache = new Map();

/**
 * Scan compendiums for spell lists
 * @returns {Promise<Array>} Array of spell list objects with metadata
 */
export async function findCompendiumSpellLists() {
  // Check if we have a cached result
  if (spellListCache.has('allSpellLists')) {
    return spellListCache.get('allSpellLists');
  }

  const spellLists = [];

  // Get all journal-type compendium packs
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');

  log(3, `Searching ${journalPacks.length} journal packs for spell lists`);

  for (const pack of journalPacks) {
    try {
      // Skip our own custom spell lists pack
      if (pack.metadata.id === `${MODULE.ID}.custom-spell-lists`) {
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

  // Cache the result
  spellListCache.set('allSpellLists', spellLists);

  return spellLists;
}

/**
 * Clear the spell list cache
 * Call this when compendium content may have changed
 */
export function clearSpellListCache() {
  spellListCache.clear();
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

    // Clear the cache
    clearSpellListCache();

    log(3, `Successfully duplicated spell list: ${originalSpellList.name} to ${page.uuid}`);
    return page;
  } catch (error) {
    log(1, `Error duplicating spell list: ${error.message}`);
    throw error;
  }
}

// Cache for duplicate lookup
const duplicateCache = new Map();

/**
 * Find a duplicate spell list in the custom pack
 * @param {string} originalUuid - UUID of the original spell list
 * @returns {Promise<JournalEntryPage|null>} The duplicate spell list or null
 */
export async function findDuplicateSpellList(originalUuid) {
  // Check cache first
  if (duplicateCache.has(originalUuid)) {
    return duplicateCache.get(originalUuid);
  }

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
          // Cache the result
          duplicateCache.set(originalUuid, page);
          return page;
        }
      }
    }

    // Cache the null result too
    duplicateCache.set(originalUuid, null);
    return null;
  } catch (error) {
    log(1, `Error finding duplicate spell list: ${error.message}`);
    return null;
  }
}

/**
 * Clear the duplicate cache
 */
export function clearDuplicateCache() {
  duplicateCache.clear();
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

    // Clear caches
    clearDuplicateCache();

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

      // Clear caches
      clearDuplicateCache();
    }

    // Delete the page
    await duplicate.delete();

    // Clear spell list cache
    clearSpellListCache();

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
 * Normalize a UUID for comparison
 * @param {string} uuid - The UUID to normalize
 * @returns {string[]} Array of normalized forms
 * @private
 */
function _normalizeUuid(uuid) {
  const normalized = [uuid];

  try {
    // Parse the UUID
    const parsed = foundry.utils.parseUuid(uuid);

    // Add ID-only form
    const idPart = uuid.split('.').pop();
    if (idPart) normalized.push(idPart);

    // Add normalized form if applicable
    if (parsed.collection) {
      normalized.push(`Compendium.${parsed.collection.collection}.${parsed.id}`);
    }
  } catch (e) {
    // Just return the original if parsing fails
  }

  return normalized;
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
    log(3, `Removing spell ${spellUuid} from list with ${spells.size} spells`);

    // Get normalized forms of the UUID to remove
    const normalizedForms = _normalizeUuid(spellUuid);

    // Try each form against the list
    let found = false;

    for (const form of normalizedForms) {
      if (spells.has(form)) {
        spells.delete(form);
        found = true;
        log(3, `Removed spell with form: ${form}`);
        break;
      }
    }

    // If still not found, check each spell in the list against our normalized forms
    if (!found) {
      for (const existingUuid of spells) {
        const existingForms = _normalizeUuid(existingUuid);

        // Check if any of our forms match any of the existing forms
        const match = normalizedForms.some((form) => existingForms.includes(form));

        if (match) {
          spells.delete(existingUuid);
          found = true;
          log(3, `Removed spell with matching normalized form: ${existingUuid}`);
          break;
        }
      }
    }

    if (!found) {
      log(2, `Spell ${spellUuid} not found in list`);
      return spellList;
    }

    // Update the spell list
    log(3, `Updating spell list with ${spells.size} spells`);
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

// Cache for all compendium spells
let allSpellsCache = null;

/**
 * Fetch all compendium spells
 * @param {number} [maxLevel=9] - Maximum spell level to include
 * @returns {Promise<Array>} Array of spell items
 */
export async function fetchAllCompendiumSpells(maxLevel = 9) {
  // Check cache first
  if (allSpellsCache) {
    return allSpellsCache;
  }

  try {
    log(3, 'Fetching all compendium spells');
    const spells = [];

    // Get all item packs
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

    // Process each pack
    for (const pack of itemPacks) {
      try {
        // Request additional fields for filtering
        const index = await pack.getIndex({
          fields: ['type', 'system', 'labels']
        });
        const spellEntries = index.filter((e) => e.type === 'spell' && (!maxLevel || e.system?.level <= maxLevel));

        for (const entry of spellEntries) {
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
            formattedDetails = formattingUtils.formatSpellDetails(entry);
          } catch (err) {
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
          spell.filterData = formattingUtils.extractSpellFilterData(spell);

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

    // Cache the results
    allSpellsCache = spells;

    return spells;
  } catch (error) {
    log(1, `Error fetching compendium spells: ${error.message}`);
    throw error;
  }
}

/**
 * Clear the compendium spells cache
 */
export function clearCompendiumSpellsCache() {
  allSpellsCache = null;
  // Also clear icon cache in formatting module
  formattingUtils.clearIconCache();
}

/**
 * Create a new spell list
 * @param {string} name - The name of the spell list
 * @param {string} identifier - The identifier (typically class name)
 * @param {string} source - The source description
 * @returns {Promise<JournalEntryPage>} The created spell list
 */
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

  // Clear caches
  clearSpellListCache();

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

  // Collect unique combinations without excessive logging
  for (const spell of availableSpells) {
    const activationType = spell.system?.activation?.type;
    const activationValue = spell.system?.activation?.value || 1;

    if (activationType) {
      const key = `${activationType}:${activationValue}`;
      uniqueActivationTypes.set(key, {
        type: activationType,
        value: activationValue
      });
    }
  }

  // Define priority order for activation types
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

  // Convert to array and sort
  const sortableTypes = Array.from(uniqueActivationTypes.entries())
    .map(([key, data]) => ({
      key,
      type: data.type,
      value: data.value
    }))
    .sort((a, b) => {
      const typePriorityA = typeOrder[a.type] || 999;
      const typePriorityB = typeOrder[b.type] || 999;
      return typePriorityA !== typePriorityB ? typePriorityA - typePriorityB : a.value - b.value;
    });

  // Create options with "All" as first option
  const options = [
    {
      value: '',
      label: game.i18n.localize('SPELLBOOK.Filters.All'),
      selected: !filterState.castingTime
    }
  ];

  for (const entry of sortableTypes) {
    const typeLabel = CONFIG.DND5E.abilityActivationTypes[entry.type] || entry.type;
    const label = entry.value === 1 ? typeLabel : `${entry.value} ${typeLabel}${entry.value !== 1 ? 's' : ''}`;

    options.push({
      value: entry.key,
      label,
      selected: filterState.castingTime === entry.key
    });
  }

  return options;
}

/**
 * Prepare dropdown options for damage type filter
 * @param {Object} filterState - Current filter state
 * @returns {Array} Array of options for the dropdown
 */
export function prepareDamageTypeOptions(filterState) {
  const options = [
    {
      value: '',
      label: game.i18n.localize('SPELLBOOK.Filters.All'),
      selected: !filterState.damageType
    }
  ];

  // Create a combined damage types object including healing
  const damageTypesWithHealing = {
    ...CONFIG.DND5E.damageTypes,
    healing: { label: game.i18n.localize('DND5E.Healing') }
  };

  // Add options in alphabetical order
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
 * @param {Object} filterState - Current filter state
 * @returns {Array} Array of options for the dropdown
 */
export function prepareConditionOptions(filterState) {
  const options = [
    {
      value: '',
      label: game.i18n.localize('SPELLBOOK.Filters.All'),
      selected: !filterState.condition
    }
  ];

  // Add options in alphabetical order
  Object.entries(CONFIG.DND5E.conditionTypes)
    .filter(([_key, condition]) => !condition.pseudo)
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .forEach(([key, condition]) => {
      options.push({
        value: key,
        label: condition.label,
        selected: filterState.condition === key
      });
    });

  return options;
}
