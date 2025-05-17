import { MODULE, SETTINGS } from '../constants.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import { log } from '../logger.mjs';

/**
 * Scan compendiums for spell lists
 * @returns {Promise<Array>} Array of spell list objects with metadata
 */
export async function findCompendiumSpellLists() {
  const spellLists = [];
  const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
  await processStandardPacks(journalPacks, spellLists);
  await processCustomPack(spellLists);
  for (const list of spellLists) {
    try {
      const document = await fromUuid(list.uuid);
      if (document.system?.identifier && !list.identifier) list.identifier = document.system.identifier;
      if (document?.flags?.[MODULE.ID]?.actorId) {
        list.isActorOwned = true;
        list.actorId = document.flags[MODULE.ID].actorId;
        const actor = game.actors.get(list.actorId);
        if (actor) list.actorName = actor.name;
      } else if (document?.folder) {
        const folderName = document.folder.name.toLowerCase();
        if (folderName.includes('actor') || folderName.includes('character')) {
          list.isActorOwned = true;
          const possibleActor = game.actors.find((a) => folderName.includes(a.name.toLowerCase()));

          if (possibleActor) {
            list.actorName = possibleActor.name;
            list.actorId = possibleActor.id;
          }
        }
      }
    } catch (error) {
      log(1, `Error checking actor ownership for spell list ${list.name}:`, error);
    }
  }

  log(3, `Found ${spellLists.length} total spell lists (${spellLists.filter((l) => l.isActorOwned).length} actor-owned)`);
  return spellLists;
}

/**
 * Process standard journal packs for spell lists
 * @param {Array} journalPacks - Array of journal packs
 * @param {Array} spellLists - Array to store results
 */
async function processStandardPacks(journalPacks, spellLists) {
  for (const pack of journalPacks) {
    try {
      if (pack.metadata.id === MODULE.PACK) continue;

      const index = await pack.getIndex();

      for (const journalData of index) {
        try {
          const journal = await pack.getDocument(journalData._id);

          for (const page of journal.pages) {
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
        } catch (error) {
          log(1, `Error processing journal ${journalData.name}:`, error);
        }
      }
    } catch (error) {
      log(1, `Error processing pack ${pack.metadata.label}:`, error);
    }
  }
}

/**
 * Process custom spell lists pack
 * @param {Array} spellLists - Array to store results
 */
async function processCustomPack(spellLists) {
  try {
    const customPack = game.packs.get(MODULE.PACK);
    if (!customPack) return;

    const index = await customPack.getIndex();

    for (const journalData of index) {
      try {
        const journal = await customPack.getDocument(journalData._id);

        for (const page of journal.pages) {
          if (page.type !== 'spells') continue;

          const flags = page.flags?.[MODULE.ID] || {};
          if (flags.isDuplicate || flags.originalUuid) continue;

          spellLists.push({
            uuid: page.uuid,
            name: page.name,
            journal: journal.name,
            pack: customPack.metadata.label,
            packageName: customPack.metadata.packageName,
            system: page.system,
            spellCount: page.system.spells?.size || 0,
            identifier: page.system.identifier,
            isCustom: true
          });
        }
      } catch (error) {
        log(1, `Error processing custom journal ${journalData.name}:`, error);
      }
    }
  } catch (error) {
    log(1, `Error processing custom spell lists pack:`, error);
  }
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

    const originalModTime = original._stats?.modifiedTime || 0;
    const customModTime = custom._stats?.modifiedTime || 0;
    const originalVersion = original._stats?.systemVersion || '';
    const customVersion = custom._stats?.systemVersion || '';

    const savedOriginalModTime = custom.flags?.[MODULE.ID]?.originalModTime || 0;
    const savedOriginalVersion = custom.flags?.[MODULE.ID]?.originalVersion || '';

    const hasOriginalChanged = originalModTime > savedOriginalModTime || originalVersion !== savedOriginalVersion;

    const originalSpells = original.system.spells || new Set();
    const customSpells = custom.system.spells || new Set();

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
    return { canCompare: false, reason: `Error: ${error.message}` };
  }
}

/**
 * Get mappings between original and custom spell lists
 * @returns {Object} Mapping data
 */
export async function getValidCustomListMappings() {
  const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
  const validMappings = {};

  for (const [originalUuid, customUuid] of Object.entries(mappings)) {
    try {
      const customDoc = await fromUuid(customUuid);
      if (customDoc) {
        validMappings[originalUuid] = customUuid;
      } else {
        log(2, `Custom list ${customUuid} no longer exists, removing mapping`);
      }
    } catch (error) {
      log(1, `Error checking custom list ${customUuid}:`, error);
    }
  }

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
    const customPack = game.packs.get(MODULE.PACK);
    if (!customPack) log(1, 'Custom spell lists pack not found');

    const existingDuplicate = await findDuplicateSpellList(originalSpellList.uuid);
    if (existingDuplicate) return existingDuplicate;

    const pageData = originalSpellList.toObject();

    pageData.flags = pageData.flags || {};
    pageData.flags[MODULE.ID] = {
      originalUuid: originalSpellList.uuid,
      originalName: originalSpellList.name,
      originalModTime: originalSpellList._stats?.modifiedTime || 0,
      originalVersion: originalSpellList._stats?.systemVersion || game.system.version,
      isDuplicate: true
    };

    const journalName = `${originalSpellList.parent.name} - ${originalSpellList.name}`;

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

    const journal = await JournalEntry.create(journalData, { pack: customPack.collection });
    const page = journal.pages.contents[0];

    await updateSpellListMapping(originalSpellList.uuid, page.uuid);

    return page;
  } catch (error) {
    log(1, `Error duplicating spell list:`, error);
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
    const customPack = game.packs.get(MODULE.PACK);
    if (!customPack) return null;

    const journals = await customPack.getDocuments();

    for (const journal of journals) {
      for (const page of journal.pages) {
        const flags = page.flags?.[MODULE.ID] || {};
        if (flags.originalUuid === originalUuid) return page;
      }
    }

    return null;
  } catch (error) {
    log(1, `Error finding duplicate spell list:`, error);
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
    mappings[originalUuid] = duplicateUuid;
    await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, mappings);
  } catch (error) {
    log(1, `Error updating spell list mappings:`, error);
  }
}

/**
 * Remove a custom spell list and its mapping
 * @param {string} duplicateUuid - UUID of the duplicate spell list
 * @returns {Promise<boolean>} Whether removal was successful
 */
export async function removeCustomSpellList(duplicateUuid) {
  try {
    const duplicatePage = await fromUuid(duplicateUuid);
    if (!duplicatePage) return false;

    const journal = duplicatePage.parent;
    if (!journal) return false;

    const originalUuid = duplicatePage.flags?.[MODULE.ID]?.originalUuid;

    if (originalUuid) {
      const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
      delete mappings[originalUuid];
      await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, mappings);
    }

    await journal.delete();
    return true;
  } catch (error) {
    log(1, `Error removing custom spell list:`, error);
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
    const parsed = foundry.utils.parseUuid(uuid);

    const idPart = uuid.split('.').pop();
    if (idPart) normalized.push(idPart);

    if (parsed.collection) {
      const compendiumId = `Compendium.${parsed.collection.collection}.${parsed.id}`;
      if (!normalized.includes(compendiumId)) normalized.push(compendiumId);

      const shortId = `${parsed.collection.collection}.${parsed.id}`;
      if (!normalized.includes(shortId)) normalized.push(shortId);
    }
  } catch (e) {
    log(1, `Error normalizing UUID ${uuid}:`, e);
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
    const spells = [];
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

    for (const pack of itemPacks) {
      try {
        const packSpells = await fetchSpellsFromPack(pack, maxLevel);
        spells.push(...packSpells);
      } catch (error) {
        log(1, `Error processing pack ${pack.metadata.label}:`, error);
      }
    }

    spells.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name);
    });

    log(3, `Fetched ${spells.length} compendium spells`);
    return spells;
  } catch (error) {
    log(1, `Error fetching compendium spells:`, error);
    throw error;
  }
}

/**
 * Fetch spells from a specific pack
 * @param {CompendiumCollection} pack - The pack to fetch from
 * @param {number} maxLevel - Maximum spell level
 * @returns {Promise<Array>} Array of spell items
 */
async function fetchSpellsFromPack(pack, maxLevel) {
  const packSpells = [];

  const index = await pack.getIndex({
    fields: ['type', 'system', 'labels']
  });

  const spellEntries = index.filter((e) => e.type === 'spell' && (!maxLevel || e.system?.level <= maxLevel));

  for (const entry of spellEntries) {
    if (!entry.labels) {
      entry.labels = {};

      if (entry.system?.level !== undefined) {
        entry.labels.level = CONFIG.DND5E.spellLevels[entry.system.level];
      }

      if (entry.system?.school) {
        entry.labels.school = CONFIG.DND5E.spellSchools[entry.system.school]?.label || entry.system.school;
      }
    }

    try {
      const spell = formatSpellEntry(entry, pack);
      packSpells.push(spell);
    } catch (error) {
      log(1, `Error formatting spell ${entry.name}:`, error);
    }
  }

  return packSpells;
}

/**
 * Format a spell index entry into a spell object
 * @param {Object} entry - The spell index entry
 * @param {CompendiumCollection} pack - The source pack
 * @returns {Object} Formatted spell object
 */
function formatSpellEntry(entry, pack) {
  const formattedDetails = formattingUtils.formatSpellDetails(entry);

  const spell = {
    uuid: `Compendium.${pack.collection}.${entry._id}`,
    name: entry.name,
    img: entry.img,
    level: entry.system?.level || 0,
    school: entry.system?.school || '',
    sourceId: pack.metadata.packageName,
    packName: pack.folder?.folder?.name || pack.folder?.name || pack.metadata.label,
    formattedDetails,
    system: entry.system || {},
    labels: entry.labels
  };

  spell.filterData = formattingUtils.extractSpellFilterData(spell);
  return spell;
}

/**
 * Create a new spell list
 * @param {string} name - The name of the spell list
 * @param {string} identifier - The identifier (typically class name)
 * @param {string} source - The source description
 * @returns {Promise<JournalEntryPage>} The created spell list
 */
export async function createNewSpellList(name, identifier, source) {
  if (!source) source = game.i18n.localize('SPELLMANAGER.CreateList.Custom');

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

  const journal = await JournalEntry.create(journalData, { pack: MODULE.PACK });
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

  for (const spell of availableSpells) {
    const type = spell.system?.activation?.type;
    const value = spell.system?.activation?.value || 1;

    if (type) {
      const key = `${type}:${value}`;
      uniqueActivationTypes.set(key, { type, value });
    }
  }

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

  const sortableTypes = Array.from(uniqueActivationTypes.entries())
    .map(([key, data]) => ({ key, type: data.type, value: data.value }))
    .sort((a, b) => {
      const typePriorityA = typeOrder[a.type] || 999;
      const typePriorityB = typeOrder[b.type] || 999;
      return typePriorityA !== typePriorityB ? typePriorityA - typePriorityB : a.value - b.value;
    });

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

  const damageTypesWithHealing = {
    ...CONFIG.DND5E.damageTypes,
    healing: { label: game.i18n.localize('DND5E.Healing') }
  };

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
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

    for (const pack of itemPacks) {
      try {
        const index = await pack.getIndex({
          fields: ['type', 'system.identifier', 'name']
        });

        const classItems = index.filter((e) => e.type === 'class');
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
        log(1, `Error processing pack ${pack.metadata.label} for class identifiers:`, error);
      }
    }

    return identifiers;
  } catch (error) {
    log(1, `Error finding class identifiers:`, error);
    return {};
  }
}
