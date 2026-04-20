import { createAPI } from './scripts/api.mjs';
import { MODULE, PACK, TEMPLATES } from './scripts/constants.mjs';
import { registerCustomSpellLists } from './scripts/data/_module.mjs';
import { registerAllHooks } from './scripts/hooks.mjs';
import { initializeMacros } from './scripts/managers/_module.mjs';
import { checkReleaseMessage } from './scripts/utils/release-message.mjs';
import { registerSettings } from './scripts/settings.mjs';
import { initializeLogger, log } from './scripts/utils/logger.mjs';
import { SocketHandler } from './scripts/utils/sockets.mjs';

Hooks.once('init', async () => {
  CONFIG.DND5E.spellListTypes['actor-spellbook'] = _loc('SPELLBOOK.Registry.ActorSpellBooksGroup');
  registerSettings();
  initializeLogger();
  registerAllHooks();
  createAPI();
  const module = game.modules.get(MODULE.ID);
  module.socketHandler = new SocketHandler();
  const flattenTemplates = (obj) => Object.values(obj).flatMap((v) => (typeof v === 'string' ? v : flattenTemplates(v)));
  await foundry.applications.handlebars.loadTemplates(flattenTemplates(TEMPLATES));
  log(3, 'Module initialized.');
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
  await checkReleaseMessage();
  log(3, 'Module ready.');
});
