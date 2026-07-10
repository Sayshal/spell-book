import { createAPI } from './scripts/api.mjs';
import { MODULE, PACK, TEMPLATES } from './scripts/constants.mjs';
import { registerCustomSpellLists } from './scripts/data/_module.mjs';
import { registerAllHooks } from './scripts/hooks.mjs';
import { initializeMacros } from './scripts/managers/_module.mjs';
import { registerSettings } from './scripts/settings.mjs';
import { SocketHandler } from './scripts/utils/sockets.mjs';

Hooks.once('init', async () => {
  ATLAS.register(MODULE.ID, { title: MODULE.NAME, github: 'Sayshal/spell-book', theme: { scope: '.spell-book', default: 'spellbook' } });
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
