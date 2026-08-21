import { FLAGS, FOLDER_TYPES, LIST_KINDS, MODULE, PACK, SETTINGS } from '../constants.mjs';
import { getOrCreateSpellListFolder } from './custom-lists.mjs';

/** @type {string[]} Class rule keys that must always hold an array of spell list UUIDs */
const LIST_RULE_KEYS = ['customSpellList', 'customSubclassSpellList'];

/**
 * Rewrite stored class rules so the custom spell list fields are always arrays.
 * @returns {Promise<void>}
 */
export async function normalizeClassRuleLists() {
  if (!ATLAS.isPrimaryGM || game.settings.get(MODULE.ID, SETTINGS.CLASS_RULE_LISTS_MIGRATION_COMPLETE)) return;
  const updates = [];
  for (const actor of game.actors) {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES);
    if (!classRules) continue;
    const normalized = {};
    let changed = false;
    for (const [classIdentifier, rules] of Object.entries(classRules)) {
      const updated = { ...rules };
      for (const key of LIST_RULE_KEYS) {
        if (updated[key] === undefined || Array.isArray(updated[key])) continue;
        updated[key] = updated[key] ? [updated[key]] : [];
        changed = true;
      }
      normalized[classIdentifier] = updated;
    }
    if (changed) updates.push({ _id: actor.id, [`flags.${MODULE.ID}.${FLAGS.CLASS_RULES}`]: normalized });
  }
  if (updates.length) {
    try {
      await Actor.updateDocuments(updates);
    } catch (error) {
      ATLAS.log(1, 'Class rule list migration incomplete, will retry on next load', error);
      return;
    }
    ATLAS.log(3, `Normalized custom spell list class rules on ${updates.length} actor(s)`);
  }
  await game.settings.set(MODULE.ID, SETTINGS.CLASS_RULE_LISTS_MIGRATION_COMPLETE, true);
}

/**
 * Stamp a single kind flag on custom pack pages that still carry the legacy boolean flags.
 * @returns {Promise<void>}
 */
export async function migrateSpellListKinds() {
  if (!ATLAS.isPrimaryGM || game.settings.get(MODULE.ID, SETTINGS.SPELL_LIST_KINDS_MIGRATION_COMPLETE)) return;
  const pack = game.packs.get(PACK.SPELLS);
  if (!pack) return;
  let journals;
  try {
    journals = await pack.getDocuments();
  } catch (error) {
    ATLAS.log(2, 'Skipping spell list kind migration; custom pack unavailable', error);
    return;
  }
  let migrated = 0;
  let failed = 0;
  for (const journal of journals) {
    const updates = [];
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      const flags = page.flags?.[MODULE.ID] || {};
      if (flags[FLAGS.KIND]) continue;
      const kind = flags.isMerged ? LIST_KINDS.MERGED : flags.isDuplicate ? LIST_KINDS.DUPLICATE : flags.isCustom || flags.isNewList ? LIST_KINDS.CUSTOM : null;
      if (!kind) continue;
      updates.push({
        _id: page.id,
        [`flags.${MODULE.ID}.${FLAGS.KIND}`]: kind,
        [`flags.${MODULE.ID}.isCustom`]: _del,
        [`flags.${MODULE.ID}.isDuplicate`]: _del,
        [`flags.${MODULE.ID}.isMerged`]: _del,
        [`flags.${MODULE.ID}.isNewList`]: _del
      });
    }
    if (!updates.length) continue;
    try {
      await JournalEntryPage.updateDocuments(updates, { parent: journal });
      migrated += updates.length;
    } catch (error) {
      failed++;
      ATLAS.log(1, `Failed to migrate spell list kinds in journal ${journal.name}`, error);
    }
  }
  if (migrated > 0) ATLAS.log(3, `Migrated ${migrated} spell list(s) to a single kind flag`);
  if (failed > 0) {
    ATLAS.log(1, `Spell list kind migration incomplete, ${failed} journal(s) failed. Will retry on next load`);
    return;
  }
  await game.settings.set(MODULE.ID, SETTINGS.SPELL_LIST_KINDS_MIGRATION_COMPLETE, true);
}

/**
 * Re-file module-owned journals that were left at the root of the custom pack.
 * @returns {Promise<void>}
 */
export async function migrateSpellListFolders() {
  if (!ATLAS.isPrimaryGM) return;
  const pack = game.packs.get(PACK.SPELLS);
  if (!pack) return;
  let unfiled;
  try {
    const index = await pack.getIndex({ fields: ['folder'] });
    unfiled = index.filter((entry) => !entry.folder).map((entry) => entry._id);
  } catch (error) {
    ATLAS.log(2, 'Skipping spell list folder migration; custom pack unavailable', error);
    return;
  }
  if (!unfiled.length) return;
  const KIND_FOLDERS = { [LIST_KINDS.CUSTOM]: FOLDER_TYPES.CUSTOM, [LIST_KINDS.MERGED]: FOLDER_TYPES.MERGED, [LIST_KINDS.DUPLICATE]: FOLDER_TYPES.MODIFIED };
  const wanted = new Map();
  for (const id of unfiled) {
    const journal = await pack.getDocument(id);
    const page = journal?.pages.find((p) => p.type === 'spells');
    const flags = { ...(journal?.flags?.[MODULE.ID] ?? {}), ...(page?.flags?.[MODULE.ID] ?? {}) };
    const type = flags[FLAGS.IS_ACTOR_SPELLBOOK] ? FOLDER_TYPES.ACTOR_SPELLBOOK : KIND_FOLDERS[flags[FLAGS.KIND]];
    if (!type) continue;
    if (!wanted.has(type)) wanted.set(type, []);
    wanted.get(type).push(id);
  }
  if (!wanted.size) return;
  let moved = 0;
  let failed = 0;
  for (const [type, ids] of wanted) {
    try {
      const folder = await getOrCreateSpellListFolder(type);
      if (!folder) continue;
      await JournalEntry.updateDocuments(
        ids.map((id) => ({ _id: id, folder: folder.id })),
        { pack: pack.collection }
      );
      moved += ids.length;
    } catch (error) {
      failed++;
      ATLAS.log(1, `Failed to re-file ${type} spell list journals`, error);
    }
  }
  if (moved > 0) ATLAS.log(3, `Re-filed ${moved} spell list journal(s) into their folders`);
  if (failed > 0) ATLAS.log(1, `Spell list folder migration incomplete, ${failed} folder(s) failed. Will retry on next load`);
}
