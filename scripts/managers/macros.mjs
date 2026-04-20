import { MODULE, PACK } from '../constants.mjs';
import { log } from '../utils/logger.mjs';

/**
 * @type {Array<{flagKey: string, version: string, name: string, command: string, img: string}>}
 * Each macro's `command` is a thin wrapper around a public API call on `SPELLBOOK.api`.
 * Bumping the `version` string forces the manager to overwrite any existing pack entry on next ready.
 */
const MACROS = [
  {
    flagKey: 'spellBookQuickAccess',
    version: '2.0.0',
    name: 'Spell Book - Quick Access',
    img: 'icons/sundries/books/book-purple-gem.webp',
    command: 'SPELLBOOK.api.spellBookQuickAccess();'
  },
  {
    flagKey: 'spellSlotTracker',
    version: '2.0.0',
    name: 'Spell Book - Slot Tracker',
    img: 'icons/magic/symbols/runes-star-pentagon-magenta.webp',
    command: 'SPELLBOOK.api.spellSlotTracker();'
  },
  {
    flagKey: 'scrollScanner',
    version: '2.0.0',
    name: 'Spell Book - Scroll Scanner',
    img: 'icons/sundries/scrolls/scroll-bound-red.webp',
    command: 'SPELLBOOK.api.scrollScanner();'
  },
  {
    flagKey: 'spellsNotInLists',
    version: '2.0.0',
    name: 'Spell Book - Spells Not In Lists',
    img: 'icons/tools/scribal/magnifying-glass.webp',
    command: 'SPELLBOOK.api.spellsNotInLists();'
  },
  {
    flagKey: 'flagPurge',
    version: '2.0.0',
    name: 'Spell Book - Flag Purge',
    img: 'icons/sundries/flags/banner-standard-tattered-red.webp',
    command: 'SPELLBOOK.api.flagPurge();'
  }
];

const MANAGED_FLAG_KEYS = new Set(MACROS.map((m) => m.flagKey));

/** Reconcile the module's macro compendium with the defined MACROS list. */
export async function initializeMacros() {
  const pack = game.packs.get(PACK.MACROS);
  if (!pack) return;
  if (pack.locked) await pack.configure({ locked: false });
  const existing = await pack.getDocuments();
  for (const def of MACROS) await upsertMacro(pack, existing, def);
  for (const doc of existing) {
    const managed = doc.getFlag(MODULE.ID, 'managed');
    const keyFlag = Object.keys(doc.flags?.[MODULE.ID] ?? {}).find((k) => MANAGED_FLAG_KEYS.has(k) || k === 'managed');
    if (managed && keyFlag && !MANAGED_FLAG_KEYS.has(managed)) {
      await doc.delete();
      log(3, `Removed obsolete macro: ${doc.name}`);
    }
  }
}

/**
 * Create the macro if it's missing, or update its command/name/img/version if the stored version is stale.
 * @param {object} pack - The macro compendium
 * @param {object[]} existing - Documents currently in the pack (pre-fetched)
 * @param {object} def - The macro definition from MACROS
 */
async function upsertMacro(pack, existing, def) {
  const match = existing.find((d) => d.getFlag(MODULE.ID, 'managed') === def.flagKey);
  if (match) {
    if (match.getFlag(MODULE.ID, 'version') === def.version) return;
    await match.update({
      name: def.name,
      command: def.command,
      img: def.img,
      [`flags.${MODULE.ID}.version`]: def.version,
      [`flags.${MODULE.ID}.managed`]: def.flagKey
    });
    log(3, `Updated macro "${def.name}" to ${def.version}`);
    return;
  }
  await Macro.create(
    {
      name: def.name,
      type: 'script',
      scope: 'global',
      command: def.command,
      img: def.img,
      flags: { [MODULE.ID]: { managed: def.flagKey, version: def.version } }
    },
    { pack: pack.collection }
  );
  log(3, `Created macro "${def.name}" (v${def.version})`);
}
