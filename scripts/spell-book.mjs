import { createAPI } from './api.mjs';
import { MODULE, TEMPLATES } from './constants.mjs';
import { invalidateSpellCache } from './helpers/spell-cache.mjs';
import { SpellDescriptionInjection } from './helpers/spell-description-injection.mjs';
import { registerDnD5eIntegration } from './integrations/dnd5e.mjs';
import { registerTidy5eIntegration } from './integrations/tidy5e.mjs';
import { initializeLogger, log } from './logger.mjs';
import { MacroManager } from './managers/macro-manager.mjs';
import { SpellUsageTracker } from './managers/spell-usage-tracker.mjs';
import { UserSpellDataManager } from './managers/user-spell-data-manager.mjs';
import { registerMigration } from './migrations.mjs';
import { registerSettings } from './settings.mjs';

Hooks.once('init', async function () {
  log(3, `Initializing ${MODULE.NAME}!`);
  initializeFoundryConfiguration();
  await initializeModuleComponents();
  await preloadTemplates();
  createAPI();
  registerMigration();
  registerHandlebarsHelpers();
  log(3, `${MODULE.NAME} initialized!`);
});

Hooks.once('ready', async function () {
  SpellDescriptionInjection.initialize();
  await unlockModuleCompendium();
  await MacroManager.initializeMacros();
  await UserSpellDataManager.initializeUserSpellData();
  await SpellUsageTracker.initialize();
});

Hooks.on('createItem', (item) => {
  if (item.type === 'spell' && item.actor?.type === 'character') {
    invalidateSpellCache(item.actor.id);
  }
});

Hooks.on('deleteItem', (item) => {
  if (item.type === 'spell' && item.actor?.type === 'character') {
    invalidateSpellCache(item.actor.id);
  }
});

/**
 * Initialize Foundry configuration for the module
 */
function initializeFoundryConfiguration() {
  CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
  CONFIG.Item.compendiumIndexFields = ['system.spellcasting.progression', 'system.spellcasting.preparation.mode'];
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

  // Use the appropriate loadTemplates method based on version
  // TODO: Remove when V12 support is dropped
  if (MODULE.ISV13) return foundry?.applications?.handlebars?.loadTemplates(templatePaths);
  else return loadTemplates(templatePaths);
}

function registerHandlebarsHelpers() {
  Handlebars.registerHelper('isWizardTab', function (tabName) {
    return tabName && (tabName === 'wizardbook' || tabName.startsWith('wizardbook-'));
  });
}
