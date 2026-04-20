import { MODULE, PACK, SETTINGS } from '../constants.mjs';
import { log } from '../utils/logger.mjs';

/**
 * Create a new spell list in the custom pack.
 * @param {string} name - Display name for the spell list
 * @param {string} identifier - Class/type identifier (lowercased)
 * @param {string} type - List type ('class', 'subclass', or 'other')
 * @returns {Promise<object|null>} The created spell list page or null
 */
export async function createNewSpellList(name, identifier, type) {
  const folder = await getOrCreateSpellListFolder('custom');
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
  const journal = await JournalEntry.create(
    {
      name,
      folder: folder?.id,
      ownership,
      pages: [
        {
          name,
          type: 'spells',
          ownership,
          flags: { [MODULE.ID]: { isCustom: true, isNewList: true, isDuplicate: false, creationDate: Date.now() } },
          system: { identifier: identifier.toLowerCase(), type, description: _loc('SPELLMANAGER.CreateList.CustomDescription', { identifier }), spells: [] }
        }
      ]
    },
    { pack: PACK.SPELLS }
  );
  const page = journal?.pages?.contents[0];
  if (page) await dnd5e.registry.spellLists.register(page.uuid);
  return page ?? null;
}

/**
 * Duplicate a spell list into the custom pack with tracking flags.
 * @param {object} originalSpellList - The original spell list document
 * @returns {Promise<object|null>} The duplicated page or null
 */
export async function duplicateSpellList(originalSpellList) {
  const existing = await findDuplicateSpellList(originalSpellList.uuid);
  if (existing) return existing;
  const pageData = foundry.utils.deepClone(originalSpellList.toObject());
  pageData.system = pageData.system || {};
  pageData.system.spells = Array.from(pageData.system.spells || []);
  pageData.flags = pageData.flags || {};
  pageData.flags[MODULE.ID] = {
    originalUuid: originalSpellList.uuid,
    originalName: originalSpellList.name,
    originalModTime: originalSpellList._stats?.modifiedTime || 0,
    originalVersion: originalSpellList._stats?.systemVersion || game.system.version,
    isDuplicate: true
  };
  const folder = await getOrCreateSpellListFolder('modified');
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
  const journal = await JournalEntry.create(
    {
      name: `${originalSpellList.parent.name} - ${originalSpellList.name}`,
      folder: folder?.id,
      ownership,
      pages: [{ name: originalSpellList.name, type: 'spells', ownership, flags: pageData.flags, system: pageData.system }]
    },
    { pack: game.packs.get(PACK.SPELLS).collection }
  );
  const page = journal?.pages?.contents[0];
  if (page) await updateSpellListMapping(originalSpellList.uuid, page.uuid);
  return page ?? null;
}

/**
 * Find a duplicate spell list in the custom pack by original UUID.
 * @param {string} originalUuid - UUID of the original spell list
 * @returns {Promise<object|null>} The duplicate page or null
 */
export async function findDuplicateSpellList(originalUuid) {
  const customPack = game.packs.get(PACK.SPELLS);
  if (!customPack) return null;
  let journals;
  try {
    journals = await customPack.getDocuments();
  } catch (err) {
    log(2, `Error loading custom pack documents: ${err.message}`);
    return null;
  }
  for (const journal of journals) for (const page of journal.pages) if (page.flags?.[MODULE.ID]?.originalUuid === originalUuid) return page;
  return null;
}

/**
 * Remove a custom spell list and clean up its mapping.
 * @param {string} duplicateUuid - UUID of the duplicate spell list to remove
 * @returns {Promise<boolean>} Whether removal succeeded
 */
export async function removeCustomSpellList(duplicateUuid) {
  const page = await fromUuid(duplicateUuid);
  if (!page?.parent) return false;
  const originalUuid = page.flags?.[MODULE.ID]?.originalUuid;
  if (originalUuid) {
    const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
    delete mappings[originalUuid];
    await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, mappings);
    const hidden = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    if (hidden.includes(originalUuid))
      await game.settings.set(
        MODULE.ID,
        SETTINGS.HIDDEN_SPELL_LISTS,
        hidden.filter((u) => u !== originalUuid)
      );
  }
  await page.parent.delete();
  return true;
}

/**
 * Get validated mappings between original and custom spell lists, pruning stale entries.
 * @returns {Promise<Object<string, string>>} Mapping of original UUIDs to custom UUIDs
 */
export async function getValidCustomListMappings() {
  const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS);
  const valid = {};
  for (const [originalUuid, customUuid] of Object.entries(mappings)) if (await fromUuid(customUuid)) valid[originalUuid] = customUuid;
  if (Object.keys(valid).length !== Object.keys(mappings).length) await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, valid);
  return valid;
}

/**
 * Compare an original spell list against its custom duplicate for drift detection.
 * @param {string} originalUuid - UUID of the original spell list
 * @param {string} customUuid - UUID of the custom duplicate
 * @returns {Promise<object>} Comparison result with change counts and version data
 */
export async function compareListVersions(originalUuid, customUuid) {
  const original = await fromUuid(originalUuid);
  const custom = await fromUuid(customUuid);
  if (!original || !custom) return { canCompare: false, reason: !original ? 'Original not found' : 'Custom not found' };
  const originalModTime = original._stats?.modifiedTime || 0;
  const customModTime = custom._stats?.modifiedTime || 0;
  const originalVersion = original._stats?.systemVersion || '';
  const customVersion = custom._stats?.systemVersion || '';
  const savedOriginalModTime = custom.flags?.[MODULE.ID]?.originalModTime || 0;
  const savedOriginalVersion = custom.flags?.[MODULE.ID]?.originalVersion || '';
  const originalSpells = original.system.spells || new Set();
  const customSpells = custom.system.spells || new Set();
  return {
    canCompare: true,
    hasOriginalChanged: originalModTime > savedOriginalModTime || originalVersion !== savedOriginalVersion,
    added: [...customSpells].filter((uuid) => !originalSpells.has(uuid)).length,
    removed: [...originalSpells].filter((uuid) => !customSpells.has(uuid)).length,
    originalSpellCount: originalSpells.size,
    customSpellCount: customSpells.size,
    originalModTime,
    customModTime,
    originalVersion,
    customVersion,
    savedOriginalModTime,
    savedOriginalVersion
  };
}

/**
 * Create a merged spell list from multiple existing lists.
 * @param {string[]} spellListUuids - UUIDs of spell lists to merge
 * @param {string} mergedListName - Name for the merged list
 * @returns {Promise<object|null>} The created merged list page or null
 */
export async function createMergedSpellList(spellListUuids, mergedListName) {
  if (!Array.isArray(spellListUuids) || spellListUuids.length < 2) throw new Error('At least two spell lists are required to merge');
  const lists = [];
  for (const uuid of spellListUuids) {
    const list = await fromUuid(uuid);
    if (!list) throw new Error(`Unable to load spell list: ${uuid}`);
    lists.push(list);
  }
  const collected = [];
  for (const list of lists) {
    const spells = list.system.spells || [];
    for (const uuid of spells) collected.push(uuid);
  }
  const mergedSpells = Array.from(new Set(collected));
  const identifier = lists[0].system?.identifier || 'merged';
  const listNames = lists.map((l) => l.name).join(', ');
  const folder = await getOrCreateSpellListFolder('merged');
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
  const journal = await JournalEntry.create(
    {
      name: mergedListName,
      folder: folder?.id,
      ownership,
      pages: [
        {
          name: mergedListName,
          type: 'spells',
          ownership,
          flags: { [MODULE.ID]: { isCustom: true, isMerged: true, isDuplicate: false, creationDate: Date.now(), sourceListUuids: spellListUuids } },
          system: {
            identifier: identifier.toLowerCase(),
            description: _loc('SPELLMANAGER.CreateList.MultiMergedDescription', { listNames, count: lists.length }),
            spells: mergedSpells
          }
        }
      ]
    },
    { pack: PACK.SPELLS }
  );
  return journal?.pages?.contents[0] ?? null;
}

/**
 * Get or create a folder in the custom spell lists pack.
 * @param {string} folderType - Folder type ('custom', 'merged', or 'modified')
 * @returns {Promise<object|null>} The folder document or null
 */
export async function getOrCreateSpellListFolder(folderType) {
  const locKeys = { custom: 'SPELLMANAGER.Folders.CustomSpellListsFolder', merged: 'SPELLMANAGER.Folders.MergedSpellListsFolder', modified: 'SPELLMANAGER.Folders.ModifiedSpellListsFolder' };
  const folderName = _loc(locKeys[folderType]);
  const customPack = game.packs.get(PACK.SPELLS);
  const existing = customPack.folders.find((f) => f.name === folderName);
  if (existing) return existing;
  return Folder.create({ name: folderName, type: 'JournalEntry', folder: null }, { pack: customPack.collection });
}

/**
 * Update the spell list mapping in world settings.
 * @param {string} originalUuid - UUID of the original spell list
 * @param {string} duplicateUuid - UUID of the duplicate spell list
 */
async function updateSpellListMapping(originalUuid, duplicateUuid) {
  const mappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS);
  mappings[originalUuid] = duplicateUuid;
  await game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, mappings);
}

/**
 * Discover all spell-list pages across every JournalEntry.
 * @returns {Promise<object[]>} Metadata for every discoverable spell list
 */
export async function findAllSpellLists() {
  const lists = [];
  const packs = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
  for (const pack of packs) {
    if (pack.metadata.id === PACK.SPELLS) continue;
    await harvestPackLists(pack, lists, false);
  }
  const customPack = game.packs.get(PACK.SPELLS);
  if (customPack) await harvestPackLists(customPack, lists, true);
  const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
  for (const list of lists) {
    const doc = list.document;
    if (doc?.system?.identifier && !list.identifier) list.identifier = doc.system.identifier;
    const duplicateUuid = customMappings[list.uuid];
    if (duplicateUuid) {
      const dup = await fromUuid(duplicateUuid);
      if (dup) list.name = dup.name;
    }
    const actorId = doc?.flags?.[MODULE.ID]?.actorId;
    if (actorId) {
      list.isActorOwned = true;
      list.actorId = actorId;
      const actor = game.actors.get(actorId);
      if (actor) list.actorName = actor.name;
    }
  }
  return lists;
}

/**
 * Harvest spell-list pages from a single journal pack into an accumulator.
 * @param {object} pack - The pack to harvest
 * @param {object[]} lists - Accumulator array to push into
 * @param {boolean} isCustomPack - Whether this is the module's custom pack
 */
async function harvestPackLists(pack, lists, isCustomPack) {
  let topLevelFolder = null;
  if (!isCustomPack && pack.folder) topLevelFolder = pack.folder.depth !== 1 ? pack.folder.getParentFolders().at(-1).name : pack.folder.name;
  const journals = isCustomPack ? await pack.getDocuments() : await getJournalDocumentsFromPack(pack);
  for (const journal of journals) {
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      const flags = page.flags?.[MODULE.ID] || {};
      if (!isCustomPack && page.system?.type === 'other') continue;
      const isModified = isCustomPack && !!flags.isDuplicate;
      lists.push({
        uuid: page.uuid,
        name: page.name,
        journal: journal.name,
        pack: isCustomPack ? pack.metadata.label : topLevelFolder || pack.metadata.label,
        packageName: pack.metadata.packageName,
        system: page.system,
        spellCount: page.system.spells?.size,
        identifier: page.system.identifier,
        isCustom: isCustomPack && !flags.isMerged && !flags.isDuplicate,
        isMerged: !!flags.isMerged,
        isModified,
        document: page
      });
    }
  }
}

/**
 * Load journal documents from a compendium pack with Babele compatibility.
 * @param {object} pack - The compendium pack to load from
 * @returns {Promise<object[]>} Array of journal documents
 */
export async function getJournalDocumentsFromPack(pack) {
  if (game.modules.get('babele')?.active) {
    try {
      return await pack.getDocuments();
    } catch (err) {
      log(2, `Error loading documents from pack "${pack.collection}": ${err.message}`);
      return [];
    }
  }
  try {
    const index = await pack.getIndex({ fields: ['name', 'pages.type'] });
    const journals = [];
    for (const journalData of index) {
      const pages = Array.isArray(journalData.pages) ? journalData.pages : [];
      const hasSpellPages = pages.some((page) => page.type === 'spells');
      if (!hasSpellPages) continue;
      try {
        const journal = await pack.getDocument(journalData._id);
        journals.push(journal);
      } catch (err) {
        log(2, `Error loading journal "${journalData.name}" from pack "${pack.collection}": ${err.message}`);
      }
    }
    return journals;
  } catch (err) {
    log(2, `Error indexing pack "${pack.collection}": ${err.message}`);
    return [];
  }
}
