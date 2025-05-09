import { MODULE, SETTINGS } from '../constants.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
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

  // Process standard packs first
  for (const pack of journalPacks) {
    try {
      // Skip custom spell lists pack - we'll process it separately
      if (pack.metadata.id === `${MODULE.ID}.custom-spell-lists`) {
        continue;
      }

      const index = await pack.getIndex();
      const entries = Array.from(index.values());

      for (const journalData of entries) {
        try {
          const journal = await pack.getDocument(journalData._id);

          for (const page of journal.pages) {
            // Skip non-spell list pages and pages of type "other"
            if (page.type !== 'spells' || page.system?.type === 'other') continue;

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
          log(1, `Error processing journal ${journalData.name}:`, innerError);
          continue;
        }
      }
    } catch (error) {
      log(1, `Error processing pack ${pack.metadata.label}:`, error);
    }
  }

  // Now add only truly new custom spell lists from our module's pack
  try {
    const customPack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);
    if (customPack) {
      const index = await customPack.getIndex();
      const entries = Array.from(index.values());

      for (const journalData of entries) {
        try {
          const journal = await customPack.getDocument(journalData._id);

          for (const page of journal.pages) {
            // Skip non-spell list pages
            if (page.type !== 'spells') continue;

            // Check if this is a duplicate spell list
            const flags = page.flags?.[MODULE.ID] || {};
            const isDuplicate = flags.isDuplicate === true;
            const hasOriginalUuid = !!flags.originalUuid;

            // Skip duplicates of existing lists
            if (isDuplicate || hasOriginalUuid) {
              continue;
            }

            // Add truly new custom list
            spellLists.push({
              uuid: page.uuid,
              name: page.name,
              journal: journal.name,
              pack: customPack.metadata.label,
              packageName: customPack.metadata.packageName,
              system: page.system,
              spellCount: page.system.spells?.size || 0,
              identifier: page.system.identifier,
              isCustom: true // Flag to mark as custom list
            });
          }
        } catch (innerError) {
          log(1, `Error processing custom journal ${journalData.name}:`, innerError);
          continue;
        }
      }
    }
  } catch (error) {
    log(1, `Error processing custom spell lists pack:`, error);
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

    // Get modification times
    const originalModTime = original._stats?.modifiedTime || 0;
    const customModTime = custom._stats?.modifiedTime || 0;
    const originalVersion = original._stats?.systemVersion || '';
    const customVersion = custom._stats?.systemVersion || '';

    // Get saved stats
    const savedOriginalModTime = custom.flags?.[MODULE.ID]?.originalModTime || 0;
    const savedOriginalVersion = custom.flags?.[MODULE.ID]?.originalVersion || '';

    // Check if original has changed
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
export async function getValidCustomListMappings() {
  // Get the mappings
  const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
  const validMappings = {};

  // Check each mapping for validity
  for (const [originalUuid, customUuid] of Object.entries(mappings)) {
    try {
      // Check if custom list still exists
      const customDoc = await fromUuid(customUuid);
      if (customDoc) {
        validMappings[originalUuid] = customUuid;
      } else {
        log(2, `Custom list ${customUuid} no longer exists, removing mapping`);
      }
    } catch (error) {
      log(1, `Error checking custom list ${customUuid}: ${error.message}`);
    }
  }

  // Update settings if we found invalid mappings
  if (Object.keys(validMappings).length !== Object.keys(mappings).length) {
    await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, validMappings);
    log(2, 'Updated spell list mappings, removed invalid entries');
  }

  return validMappings;
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
      log(3, `Duplicate already exists: ${existingDuplicate.name}`);
      return existingDuplicate;
    }

    // Create a copy of the original data
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

    // Create journal name
    const journalName = `${originalSpellList.parent.name} - ${originalSpellList.name}`;

    // Create journal with pages
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

    // Create the journal
    const journal = await JournalEntry.create(journalData, { pack: customPack.collection });
    const page = journal.pages.contents[0];

    // Update mapping
    await updateSpellListMapping(originalSpellList.uuid, page.uuid);

    log(3, `Successfully duplicated spell list to ${page.uuid}`);
    return page;
  } catch (error) {
    log(1, `Error duplicating spell list: ${error.message}`);
    throw error;
  }
}

/**
 * Find a duplicate spell list in the custom pack
 * @param {string} originalUuid - UUID of the original spell list
 * @returns {Promise<JournalEntryPage|null>} The duplicate or null
 */
export async function findDuplicateSpellList(originalUuid) {
  try {
    const customPack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);
    if (!customPack) return null;

    // Get all journals
    const journals = await customPack.getDocuments();

    // Search through all pages
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
    const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};

    // Add or update mapping
    mappings[originalUuid] = duplicateUuid;

    // Save to settings
    await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, mappings);

    log(3, `Updated spell list mapping: ${originalUuid} -> ${duplicateUuid}`);
  } catch (error) {
    log(1, `Error updating spell list mappings: ${error.message}`);
  }
}

/**
 * Remove a custom spell list and its mapping
 * @param {string} duplicateUuid - UUID of the duplicate spell list
 * @returns {Promise<boolean>} Whether removal was successful
 */
export async function removeCustomSpellList(duplicateUuid) {
  try {
    // Get the duplicate page
    const duplicatePage = await fromUuid(duplicateUuid);
    if (!duplicatePage) return false;

    // Get the parent journal
    const journal = duplicatePage.parent;
    if (!journal) {
      log(2, `Could not find parent journal for page: ${duplicateUuid}`);
      return false;
    }

    // Get the original UUID from flags
    const originalUuid = duplicatePage.flags?.[MODULE.ID]?.originalUuid;

    // Remove the mapping if original UUID exists
    if (originalUuid) {
      const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
      delete mappings[originalUuid];
      await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, mappings);
    }

    // Delete the journal
    await journal.delete();

    log(3, `Successfully removed custom spell list journal: ${journal.name}`);
    return true;
  } catch (error) {
    log(1, `Error removing custom spell list: ${error.message}`);
    return false;
  }
}

/**
 * Normalize a UUID for comparison
 * @param {string} uuid - The UUID to normalize
 * @returns {string[]} Array of normalized forms
 */
export function normalizeUuid(uuid) {
  if (!uuid) return [];

  const normalized = [uuid];

  try {
    // Parse the UUID
    const parsed = foundry.utils.parseUuid(uuid);

    // Add ID-only form
    const idPart = uuid.split('.').pop();
    if (idPart) normalized.push(idPart);

    // Add normalized form
    if (parsed.collection) {
      const compendiumId = `Compendium.${parsed.collection.collection}.${parsed.id}`;
      if (!normalized.includes(compendiumId)) {
        normalized.push(compendiumId);
      }

      // Also add version without Compendium prefix
      const shortId = `${parsed.collection.collection}.${parsed.id}`;
      if (!normalized.includes(shortId)) {
        normalized.push(shortId);
      }
    }
  } catch (e) {
    // Return original if parsing fails
    log(1, `Error normalizing UUID ${uuid}: ${e.message}`);
  }

  return normalized;
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
        // Get index with additional fields
        const index = await pack.getIndex({
          fields: ['type', 'system', 'labels']
        });

        const spellEntries = index.filter((e) => e.type === 'spell' && (!maxLevel || e.system?.level <= maxLevel));

        for (const entry of spellEntries) {
          // Ensure we have a labels property
          if (!entry.labels) {
            entry.labels = {};

            if (entry.system?.level !== undefined) {
              entry.labels.level = CONFIG.DND5E.spellLevels[entry.system.level];
            }

            if (entry.system?.school) {
              entry.labels.school = CONFIG.DND5E.spellSchools[entry.system.school]?.label || entry.system.school;
            }
          }

          // Format details
          let formattedDetails;
          try {
            formattedDetails = formattingUtils.formatSpellDetails(entry);
          } catch (err) {
            log(1, `Error formatting spell details for ${entry.name}: ${err.message}`);
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

          // Add filter data
          spell.filterData = formattingUtils.extractSpellFilterData(spell);

          spells.push(spell);
        }
      } catch (error) {
        log(1, `Error processing pack ${pack.metadata.label}: ${error.message}`);
      }
    }

    // Sort spells
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
 * Create a new spell list
 * @param {string} name - The name of the spell list
 * @param {string} identifier - The identifier (typically class name)
 * @param {string} source - The source description
 * @returns {Promise<JournalEntryPage>} The created spell list
 */
export async function createNewSpellList(name, identifier, source) {
  if (!source) {
    source = game.i18n.localize('SPELLMANAGER.CreateList.Custom');
  }
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
            isDuplicate: false,
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

  // Create in custom pack
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

  // Collect unique combinations
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

  // Define priority order
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

  // Convert and sort
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

  // Create options
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

  // Create damage types including healing
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

/**
 * Find all class identifiers from class items in compendiums
 * @returns {Promise<Object>} Object mapping class identifiers to names
 */
export async function findClassIdentifiers() {
  try {
    const identifiers = {};

    // Get all item packs
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

    for (const pack of itemPacks) {
      try {
        // Get index with identifier field for class items
        const index = await pack.getIndex({
          fields: ['type', 'system.identifier', 'name']
        });

        // Filter for class items
        const classItems = index.filter((e) => e.type === 'class');

        // Get pack display name
        const packDisplayName = pack.metadata.label;

        for (const cls of classItems) {
          const identifier = cls.system?.identifier?.toLowerCase();
          if (identifier) {
            identifiers[identifier] = {
              name: cls.name,
              source: packDisplayName || 'Unknown',
              fullDisplay: `${cls.name} [${packDisplayName}]`,
              id: identifier
            };
          }
        }
      } catch (error) {
        log(1, `Error processing pack ${pack.metadata.label} for class identifiers: ${error.message}`);
      }
    }

    return identifiers;
  } catch (error) {
    log(1, `Error finding class identifiers: ${error.message}`);
    return {};
  }
}
