import { createAPI } from './api.mjs';
import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { MODULE, SETTINGS, TEMPLATES } from './constants/_module.mjs';
import * as preloaderUtils from './data/spell-data-preloader.mjs';
import { SpellDescriptionInjection } from './ui/spell-description-injection.mjs';
import { registerDnD5eIntegration } from './integrations/dnd5e.mjs';
import { registerTidy5eIntegration } from './integrations/tidy5e.mjs';
import { initializeLogger, log } from './logger.mjs';
import { MacroManager } from './managers/macro-manager.mjs';
import { SpellUsageTracker } from './managers/spell-usage-tracker.mjs';
import { UserSpellDataManager } from './managers/user-spell-data-manager.mjs';
import { registerSettings } from './settings.mjs';

Hooks.once('init', async function () {
  log(3, `Initializing ${MODULE.NAME}!`);
  initializeFoundryConfiguration();
  await initializeModuleComponents();
  await preloadTemplates();
  createAPI();
  registerHandlebarsHelpers();
  log(3, `${MODULE.NAME} initialized!`);
});

Hooks.on('setup', () => {
  let position = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION);
  if (!position || (typeof position === 'object' && Object.keys(position).length === 0)) position = { height: 875, width: 600 };
  PlayerSpellBook.DEFAULT_OPTIONS.position = position;
});

Hooks.once('ready', async function () {
  SpellDescriptionInjection.initialize();
  await unlockModuleCompendium();
  await MacroManager.initializeMacros();
  await UserSpellDataManager.initializeUserSpellData();
  await SpellUsageTracker.initialize();
  await preloaderUtils.preloadSpellData();
});

Hooks.on('createJournalEntryPage', (page, options, userId) => {
  if (preloaderUtils.shouldInvalidateCacheForPage(page)) preloaderUtils.invalidateSpellListCache();
});

Hooks.on('updateJournalEntryPage', (page, changes, options, userId) => {
  if (preloaderUtils.shouldInvalidateCacheForPage(page)) if (changes.system?.spells || changes.system?.identifier || changes.flags) preloaderUtils.invalidateSpellListCache();
});

Hooks.on('deleteJournalEntryPage', (page, options, userId) => {
  if (preloaderUtils.shouldInvalidateCacheForPage(page)) preloaderUtils.invalidateSpellListCache();
});

/**
 * Initialize Foundry configuration for the module
 */
function initializeFoundryConfiguration() {
  CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
  CONFIG.Item.compendiumIndexFields = ['system.spellcasting.progression', 'system.spellcasting.type'];
}

/**
 * Initialize all module components
 * @returns {Promise<void>}
 */
async function initializeModuleComponents() {
  registerSettings();
  initializeLogger();
  registerDnD5eIntegration();
  if (game.modules.get('tidy5e-sheet')?.active) registerTidy5eIntegration();
}

/**
 * Unlock module compendium and create necessary folders
 * @returns {Promise<void>}
 */
async function unlockModuleCompendium() {
  const spellsPack = game.packs.find((p) => p.collection === MODULE.PACK.SPELLS);
  if (spellsPack && spellsPack.locked) await spellsPack.configure({ locked: false });
  const macrosPack = game.packs.find((p) => p.collection === MODULE.PACK.MACROS);
  if (macrosPack && macrosPack.locked) await macrosPack.configure({ locked: false });
  const userdataPack = game.packs.find((p) => p.collection === MODULE.PACK.USERDATA);
  if (userdataPack && userdataPack.locked) await userdataPack.configure({ locked: false });
  await createActorSpellbooksFolder(spellsPack);
}

/**
 * Create Actor Spellbooks folder in the module compendium
 * @param {CompendiumCollection} pack - The module's compendium pack
 * @returns {Promise<void>}
 */
async function createActorSpellbooksFolder(pack) {
  if (!pack) return;
  const folder = pack.folders.find((f) => f.name === game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks'));
  if (!folder) {
    await Folder.create({ name: game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks'), type: 'JournalEntry' }, { pack: pack.collection });
    log(3, 'Created Actor Spellbooks folder');
  }
}

async function preloadTemplates() {
  function flattenTemplateObject(obj, result = []) {
    for (const key in obj) {
      if (typeof obj[key] === 'string') result.push(obj[key]);
      else if (typeof obj[key] === 'object') flattenTemplateObject(obj[key], result);
    }
    return result;
  }
  const templatePaths = flattenTemplateObject(TEMPLATES);
  return foundry?.applications?.handlebars?.loadTemplates(templatePaths);
}

function registerHandlebarsHelpers() {
  Handlebars.registerHelper('isWizardTab', function (tabName) {
    return tabName && (tabName === 'wizardbook' || tabName.startsWith('wizardbook-'));
  });
}
