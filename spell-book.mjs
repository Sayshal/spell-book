import { createAPI } from './scripts/api.mjs';
import { MODULE, PACK, TEMPLATES } from './scripts/constants.mjs';
import { findAllSpellLists, registerCustomSpellLists } from './scripts/data/_module.mjs';
import { registerAllHooks } from './scripts/hooks.mjs';
import { initializeMacros } from './scripts/managers/_module.mjs';
import { registerSettings } from './scripts/settings.mjs';
import { SocketHandler } from './scripts/utils/sockets.mjs';

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
  ATLAS.register(MODULE.ID, { title: MODULE.NAME, github: 'Sayshal/spell-book', theme: { scope: '.spell-book', default: 'spellbook' }, debug: troubleshooterDebug });
  CONFIG.DND5E.spellListTypes['actor-spellbook'] = _loc('SPELLBOOK.Registry.ActorSpellBooksGroup');
  registerSettings();
  registerAllHooks();
  createAPI();
  const module = game.modules.get(MODULE.ID);
  module.socketHandler = new SocketHandler();
  const flattenTemplates = (obj) => Object.values(obj).flatMap((v) => (typeof v === 'string' ? v : flattenTemplates(v)));
  await foundry.applications.handlebars.loadTemplates(flattenTemplates(TEMPLATES));
  ATLAS.log(3, 'Module initialized.');
});
Hooks.once('ready', async () => {
  for (const packId of Object.values(PACK)) {
    const pack = game.packs.get(packId);
    if (pack?.locked) await pack.configure({ locked: false });
  }
  if (game.user.isGM) {
    await registerCustomSpellLists();
    await initializeMacros();
  }
  ATLAS.log(3, 'Module ready.');
});
