import { createAPI } from './api.mjs';
import { SpellBook } from './apps/_module.mjs';
import { MODULE, SETTINGS, TEMPLATES } from './constants/_module.mjs';
import * as DataHelpers from './data/_module.mjs';
import { registerDnD5eIntegration, registerTidy5eIntegration, registerGroupActorIntegration } from './integrations/_module.mjs';
import { initializeLogger, log } from './logger.mjs';
import { MacroManager, SpellUsageTracker, UserSpellDataManager } from './managers/_module.mjs';
import { registerSettings } from './settings.mjs';
import * as UIHelpers from './ui/_module.mjs';
import { runAllMigrations } from './migrations.mjs';

/**
 * Foundry VTT configuration object for module optimization
 * @typedef {Object} FoundryConfig
 * @property {CompendiumIndexConfig} JournalEntry Journal entry configuration
 * @property {CompendiumIndexConfig} Item Item configuration
 */

/**
 * Compendium index field configuration
 * @typedef {Object} CompendiumIndexConfig
 * @property {string[]} compendiumIndexFields Fields to index for performance
 */

/**
 * Journal entry page data for cache invalidation
 * @typedef {Object} JournalPageData
 * @property {Object} [system] System data including spells and identifier
 * @property {Set<string>} [spells] Spell set changes
 * @property {string} [identifier] Page identifier changes
 * @property {Object} [flags] Flag changes
 */

/**
 * Compendium pack reference for module operations
 * @typedef {Object} CompendiumPack
 * @property {string} collection Pack collection identifier
 * @property {boolean} locked Whether the pack is locked
 * @property {Function} configure Method to configure pack settings
 * @property {Collection} folders Pack folders collection
 */

/**
 * Template object structure for recursive flattening
 * @typedef {Object} TemplateObject
 * @property {string|TemplateObject} [key] Template path or nested object
 */

/**
 * Window position data for spell book persistence
 * @typedef {Object} WindowPosition
 * @property {number} height Window height in pixels
 * @property {number} width Window width in pixels
 * @property {number} [left] Window left position
 * @property {number} [top] Window top position
 */

/**
 * Initialize the module during Foundry's 'init' phase
 * Sets up configuration, registers components, and prepares templates
 */
Hooks.once('init', async function () {
  log(3, `Initializing ${MODULE.NAME}!`);
  initializeFoundryConfiguration();
  await initializeModuleComponents();
  await preloadTemplates();
  createAPI();
  registerHandlebarsHelpers();
  log(3, `${MODULE.NAME} initialized!`);
});

/**
 * Configure spell book window position during 'setup' phase
 * Applies saved position settings or reasonable defaults
 */
Hooks.on('setup', () => {
  let position = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION);
  if (!position || (typeof position === 'object' && Object.keys(position).length === 0)) position = { height: 875, width: 600 };
  SpellBook.DEFAULT_OPTIONS.position = position;
});

/**
 * Complete module initialization during 'ready' phase
 * Initializes managers and background services
 */
Hooks.once('ready', async function () {
  UIHelpers.SpellDescriptionInjection.initialize();
  await unlockModuleCompendium();
  await MacroManager.initializeMacros();
  await UserSpellDataManager.initializeUserSpellData();
  await SpellUsageTracker.initialize();
  await DataHelpers.preloadSpellData();
  await runAllMigrations();
});

/**
 * Handle journal entry page creation for spell list cache invalidation
 * @param {JournalEntryPage} page The created journal page
 * @param {Object} _options Creation options (unused)
 * @param {string} _userId Creating user ID (unused)
 */
Hooks.on('createJournalEntryPage', (page, _options, _userId) => {
  if (DataHelpers.shouldInvalidateCacheForPage(page)) DataHelpers.invalidateSpellListCache();
});

/**
 * Handle journal entry page updates for spell list cache invalidation
 * @param {JournalEntryPage} page The updated journal page
 * @param {JournalPageData} changes Changes made to the page
 * @param {Object} _options Update options (unused)
 * @param {string} _userId Updating user ID (unused)
 */
Hooks.on('updateJournalEntryPage', (page, changes, _options, _userId) => {
  if (DataHelpers.shouldInvalidateCacheForPage(page)) if (changes.system?.spells || changes.system?.identifier || changes.flags) DataHelpers.invalidateSpellListCache();
});

/**
 * Handle journal entry page deletion for spell list cache invalidation
 * @param {JournalEntryPage} page The deleted journal page
 * @param {Object} _options Deletion options (unused)
 * @param {string} _userId Deleting user ID (unused)
 */
Hooks.on('deleteJournalEntryPage', (page, _options, _userId) => {
  if (DataHelpers.shouldInvalidateCacheForPage(page)) DataHelpers.invalidateSpellListCache();
});

/**
 * Initialize Foundry VTT configuration for optimal module performance
 * Configures compendium indexing for journals and items
 * @returns {void}
 */
function initializeFoundryConfiguration() {
  CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
  CONFIG.Item.compendiumIndexFields = ['system.spellcasting.progression', 'system.spellcasting.type'];
}

/**
 * Initialize all module components including settings and integrations
 * @returns {Promise<void>}
 */
async function initializeModuleComponents() {
  registerSettings();
  initializeLogger();
  registerDnD5eIntegration();
  registerGroupActorIntegration();
  if (game.modules.get('tidy5e-sheet')?.active) registerTidy5eIntegration();
}

/**
 * Unlock module compendiums and create necessary folder structure
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
 * Create Actor Spellbooks folder in the module compendium for organization
 * @param {CompendiumPack|null} pack The module's compendium pack
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
 * Preload all Handlebars templates used by the module for performance
 * @returns {Promise<void>} Promise that resolves when templates are loaded
 */
async function preloadTemplates() {
  /**
   * Recursively flatten a nested template object into an array of template paths
   * @param {TemplateObject} obj The template object to flatten
   * @param {string[]} [result=[]] The accumulator array for template paths
   * @returns {string[]} Array of flattened template paths
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
 * Register custom Handlebars helpers used by module templates
 * @returns {void}
 */
function registerHandlebarsHelpers() {
  /**
   * Check if a tab name corresponds to a wizard spellbook tab
   * @param {string} tabName The tab name to check
   * @returns {boolean} Whether this is a wizard tab
   */
  Handlebars.registerHelper('isWizardTab', function (tabName) {
    return tabName && (tabName === 'wizardbook' || tabName.startsWith('wizardbook-'));
  });
}
