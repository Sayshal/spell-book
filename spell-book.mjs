import { exposeApi } from './scripts/api.mjs';
import { FOLDER_TYPES, HOOKS, MODULE, PACK, SPELL_LIST_TYPES, TEMPLATES } from './scripts/constants.mjs';
import { findAllSpellLists, getOrCreateSpellListFolder, migrateSpellListFolders, migrateSpellListKinds, normalizeClassRuleLists, registerEnabledSpellLists } from './scripts/data/_module.mjs';
import { registerHooks } from './scripts/hooks.mjs';
import { initializeMacros } from './scripts/managers/_module.mjs';
import { registerSettings } from './scripts/settings.mjs';
import { sweepPendingRequests } from './scripts/utils/_module.mjs';
import './styles/spell-book.css';

/**
 * Extra troubleshooter lines: dnd5e enabled compendium sources, plus every spell list and its spells.
 * @returns {Promise<string[]>} Markdown lines for the ATLAS troubleshooter Debug section.
 */
async function troubleshooterDebug() {
  const L = ATLAS.diagnostics.dnd5eSourceLines();
  const lists = (await findAllSpellLists()).sort((a, b) => a.name.localeCompare(b.name));
  L.push('', `#### Spell Lists (${lists.length})`);
  for (const list of lists) {
    const uuids = Array.from(list.system?.spells ?? []);
    L.push('', `##### ${list.name} — ${list.uuid} (${uuids.length})`, '');
    for (const uuid of uuids) L.push(`- ${fromUuidSync(uuid, { strict: false })?.name ?? '?'} - ${uuid}`);
  }
  return L;
}

Hooks.once('init', async () => {
  const atlas = ATLAS.register(MODULE.ID, {
    title: MODULE.TITLE,
    github: 'Sayshal/spell-book',
    theme: { scope: '.spell-book', default: 'spellbook' },
    debug: troubleshooterDebug,
    events: [{ name: HOOKS.SPELL_COPIED, gmAuthoritative: true }]
  });
  CONFIG.DND5E.spellListTypes[SPELL_LIST_TYPES.ACTOR_SPELLBOOK] = 'SPELLBOOK.Registry.ActorSpellBooksGroup';
  registerSettings();
  registerHooks();
  exposeApi();
  const module = game.modules.get(MODULE.ID);
  module.atlas = atlas;
  const flattenTemplates = (obj) => Object.values(obj).flatMap((v) => (typeof v === 'string' ? v : flattenTemplates(v)));
  await foundry.applications.handlebars.loadTemplates(flattenTemplates(TEMPLATES));
  ATLAS.log(3, 'Module initialized');
});
Hooks.once('ready', async () => {
  if (game.user.isGM) {
    for (const packId of Object.values(PACK)) {
      const pack = game.packs.get(packId);
      if (pack?.locked) await pack.configure({ locked: false });
    }
    await getOrCreateSpellListFolder(FOLDER_TYPES.ACTOR_SPELLBOOK);
    await normalizeClassRuleLists();
    await migrateSpellListKinds();
    await migrateSpellListFolders();
    await registerEnabledSpellLists();
    await initializeMacros();
    sweepPendingRequests();
  }
  ATLAS.log(3, 'Module ready');
});
