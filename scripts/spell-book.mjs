import { createAPI } from './api.mjs';
import { SpellBook } from './apps/_module.mjs';
import { MODULE, SETTINGS, TEMPLATES } from './constants/_module.mjs';
import * as DataHelpers from './data/_module.mjs';
import { registerDnD5eIntegration, registerTidy5eIntegration } from './integrations/_module.mjs';
import { initializeLogger, log } from './logger.mjs';
import { MacroManager, SpellUsageTracker, UserSpellDataManager } from './managers/_module.mjs';
import { registerSettings } from './settings.mjs';
import * as UIHelpers from './ui/_module.mjs';

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
  SpellBook.DEFAULT_OPTIONS.position = position;
});

Hooks.once('ready', async function () {
  UIHelpers.SpellDescriptionInjection.initialize();
  await unlockModuleCompendium();
  await MacroManager.initializeMacros();
  await UserSpellDataManager.initializeUserSpellData();
  await SpellUsageTracker.initialize();
  await DataHelpers.preloadSpellData();
});

Hooks.on('createJournalEntryPage', (page, options, userId) => {
  if (DataHelpers.shouldInvalidateCacheForPage(page)) DataHelpers.invalidateSpellListCache();
});

Hooks.on('updateJournalEntryPage', (page, changes, options, userId) => {
  if (DataHelpers.shouldInvalidateCacheForPage(page)) if (changes.system?.spells || changes.system?.identifier || changes.flags) DataHelpers.invalidateSpellListCache();
});

Hooks.on('deleteJournalEntryPage', (page, options, userId) => {
  if (DataHelpers.shouldInvalidateCacheForPage(page)) DataHelpers.invalidateSpellListCache();
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
 * @param {CompendiumCollection} pack The module's compendium pack
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

/**
 * Preload all Handlebars templates used by the module
 * @returns {Promise<void>} Promise that resolves when templates are loaded
 */
async function preloadTemplates() {
  /**
   * Recursively flatten a nested template object into an array of template paths
   * @param {Object} obj The template object to flatten
   * @param {Array<string>} result The accumulator array for template paths
   * @returns {Array<string>} Array of flattened template paths
   */
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

/**
 * Register custom Handlebars helpers used by the module templates
 * @returns {void}
 */
function registerHandlebarsHelpers() {
  Handlebars.registerHelper('isWizardTab', function (tabName) {
    return tabName && (tabName === 'wizardbook' || tabName.startsWith('wizardbook-'));
  });
}
