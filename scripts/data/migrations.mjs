/**
 * One-shot data migrations run at world startup.
 * @module Data/Migrations
 * @author Tyler
 */

import { FLAGS, LIST_KINDS, MODULE, PACK } from '../constants.mjs';

/** @type {string[]} Class rule keys that must always hold an array of spell list UUIDs */
const LIST_RULE_KEYS = ['customSpellList', 'customSubclassSpellList'];

/**
 * Rewrite stored class rules so the custom spell list fields are always arrays.
 * @returns {Promise<void>}
 */
export async function normalizeClassRuleLists() {
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
    if (changed) {
      await actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, normalized);
      ATLAS.log(3, 'Normalized custom spell list class rules.', { actorName: actor.name, actorId: actor.id });
    }
  }
}

/**
 * Stamp a single kind flag on custom pack pages that still carry the legacy boolean flags.
 * @returns {Promise<void>}
 */
export async function migrateSpellListKinds() {
  const pack = game.packs.get(PACK.SPELLS);
  if (!pack) return;
  let journals;
  try {
    journals = await pack.getDocuments();
  } catch (err) {
    ATLAS.log(2, `Skipping spell list kind migration; custom pack unavailable: ${err.message}`);
    return;
  }
  for (const journal of journals) {
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      const flags = page.flags?.[MODULE.ID] || {};
      if (flags.kind) continue;
      const kind = flags.isMerged ? LIST_KINDS.MERGED : flags.isDuplicate ? LIST_KINDS.DUPLICATE : flags.isCustom || flags.isNewList ? LIST_KINDS.CUSTOM : null;
      if (!kind) continue;
      await page.update({
        [`flags.${MODULE.ID}.kind`]: kind,
        [`flags.${MODULE.ID}.-=isCustom`]: null,
        [`flags.${MODULE.ID}.-=isDuplicate`]: null,
        [`flags.${MODULE.ID}.-=isMerged`]: null,
        [`flags.${MODULE.ID}.-=isNewList`]: null
      });
      ATLAS.log(3, `Migrated spell list "${page.name}" to kind "${kind}".`);
    }
  }
}
