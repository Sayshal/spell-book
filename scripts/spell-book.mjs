/**
 * Spell Book Module Main Entry Point
 *
 * Primary initialization file for the Spell Book module. This module orchestrates
 * the complete startup sequence including component initialization, template preloading,
 * API creation, integration registration, and hook management.
 *
 * Initialization sequence:
 * 1. Foundry configuration setup for compendium indexing
 * 2. Module component registration (settings, logger, integrations)
 * 3. Template preloading for performance optimization
 * 4. API creation and global registration
 * 5. Handlebars helper registration
 * 6. Integration with external modules and systems
 * 7. Data preloading and manager initialization
 *
 * @module SpellBook
 * @author Tyler
 */

import { createAPI } from './api.mjs';
import { SpellBook } from './apps/_module.mjs';
import { MODULE, SETTINGS, TEMPLATES } from './constants/_module.mjs';
import * as DataHelpers from './data/_module.mjs';
import { registerDnD5eIntegration, registerTidy5eIntegration } from './integrations/_module.mjs';
import { initializeLogger, log } from './logger.mjs';
import { MacroManager, SpellUsageTracker, UserSpellDataManager } from './managers/_module.mjs';
import { registerSettings } from './settings.mjs';
import * as UIHelpers from './ui/_module.mjs';
import { runAllMigrations } from './migrations.mjs';

/**
 * Initialize hook - Module setup and registration phase.
 *
 * This hook runs during Foundry's initialization phase before the game is ready.
 * Performs core module setup including configuration, component registration,
 * and template preloading for optimal performance.
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
 * Setup hook - Application configuration phase.
 *
 * Configures application defaults based on saved user preferences.
 * This runs after init but before the game is fully ready.
 */
Hooks.on('setup', () => {
  let position = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION);
  if (!position || (typeof position === 'object' && Object.keys(position).length === 0)) position = { height: 875, width: 600 };
  SpellBook.DEFAULT_OPTIONS.position = position;
});

/**
 * Ready hook - Post-initialization setup and data loading.
 *
 * Performs final initialization tasks that require the game to be fully loaded.
 * This includes UI initialization, compendium setup, manager initialization,
 * and data preloading for optimal performance.
 */
Hooks.once('ready', async function () {
  runAllMigrations();
  UIHelpers.SpellDescriptionInjection.initialize();
  await unlockModuleCompendium();
  await MacroManager.initializeMacros();
  await UserSpellDataManager.initializeUserSpellData();
  await SpellUsageTracker.initialize();
  await DataHelpers.preloadSpellData();
});

/**
 * Journal page creation hook - Cache invalidation for spell lists.
 *
 * Monitors journal page creation and invalidates spell list cache when
 * relevant spell list pages are created.
 */
Hooks.on('createJournalEntryPage', (page, _options, _userId) => {
  if (DataHelpers.shouldInvalidateCacheForPage(page)) DataHelpers.invalidateSpellListCache();
});

/**
 * Journal page update hook - Cache invalidation for spell list changes.
 *
 * Monitors journal page updates and invalidates spell list cache when
 * spell data, identifiers, or flags are modified.
 */
Hooks.on('updateJournalEntryPage', (page, changes, _options, _userId) => {
  if (DataHelpers.shouldInvalidateCacheForPage(page)) if (changes.system?.spells || changes.system?.identifier || changes.flags) DataHelpers.invalidateSpellListCache();
});

/**
 * Journal page deletion hook - Cache invalidation for removed spell lists.
 *
 * Monitors journal page deletion and invalidates spell list cache when
 * relevant spell list pages are deleted.
 */
Hooks.on('deleteJournalEntryPage', (page, _options, _userId) => {
  if (DataHelpers.shouldInvalidateCacheForPage(page)) DataHelpers.invalidateSpellListCache();
});

/**
 * Initialize Foundry VTT configuration for module requirements.
 *
 * Configures Foundry's core systems to support module functionality,
 * particularly compendium indexing fields for performance optimization.
 *
 * @returns {void}
 */
function initializeFoundryConfiguration() {
  const journalFields = ['_id', 'name', 'pages', 'type', 'uuid'];
  const itemFields = ['system.spellcasting.progression', 'system.spellcasting.type'];
  CONFIG.JournalEntry.compendiumIndexFields = [...new Set([...CONFIG.JournalEntry.compendiumIndexFields, ...journalFields])];
  CONFIG.Item.compendiumIndexFields = [...new Set([...CONFIG.Item.compendiumIndexFields, ...itemFields])];
}

/**
 * Initialize all module components in the correct order.
 *
 * Orchestrates the initialization of all module subsystems including
 * settings registration, logger setup, and system integrations.
 *
 * @returns {Promise<void>}
 */
async function initializeModuleComponents() {
  registerSettings();
  initializeLogger();
  registerDnD5eIntegration();
  if (game.modules.get('tidy5e-sheet')?.active) registerTidy5eIntegration();
}

/**
 * Unlock module compendium packs and create necessary folder structure.
 *
 * Ensures all module compendium packs are unlocked for writing and creates
 * required folder structures for organization. This is essential for proper
 * spell list management and actor spellbook storage.
 *
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
 * Create Actor Spellbooks folder in the module compendium pack.
 *
 * Ensures the Actor Spellbooks folder exists in the spells compendium for
 * organizing individual character spellbook data. This folder is essential
 * for storing actor-specific spell configurations and loadouts.
 *
 * @param {CompendiumCollection} pack - The module's spells compendium pack
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
 * Preload all Handlebars templates used by the module.
 *
 * Recursively processes the TEMPLATES constant to extract all template paths
 * and preloads them using Foundry's template loading system. This provides
 * significant performance benefits by avoiding template loading delays during
 * application rendering.
 *
 * The function handles nested template objects and flattens them into a single
 * array of template paths for efficient batch loading.
 *
 * @returns {Promise<void>} Promise that resolves when all templates are loaded
 */
async function preloadTemplates() {
  /**
   * Recursively flatten a nested template object into an array of template paths.
   *
   * Traverses the template configuration object and extracts all string paths,
   * ignoring nested object structure. This allows for organized template
   * configuration while still providing a flat array for preloading.
   *
   * @param {Object} obj - The template object to flatten
   * @param {Array<string>} [result=[]] - The accumulator array for template paths
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
 * Register custom Handlebars helpers used by the module templates.
 *
 * Defines and registers Handlebars helper functions that provide template-specific
 * logic for rendering module interfaces. These helpers extend Handlebars functionality
 * with module-specific capabilities for conditional rendering and data processing.
 *
 * Currently registered helpers:
 * - isWizardTab: Identifies wizard-related tabs for conditional template logic
 *
 * @returns {void}
 */
function registerHandlebarsHelpers() {
  /**
   * Handlebars helper to determine if a tab name represents a wizard tab.
   *
   * Used in templates to conditionally render wizard-specific content and
   * apply appropriate styling or functionality to wizard-related interface
   * elements.
   *
   * @param {string} tabName - The tab name to evaluate
   * @returns {boolean} True if the tab is wizard-related, false otherwise
   *
   * @example
   * {{#if (isWizardTab @root.activeTab)}}
   *   <!-- Wizard-specific content -->
   * {{/if}}
   */
  Handlebars.registerHelper('isWizardTab', function (tabName) {
    return tabName && (tabName === 'wizardbook' || tabName.startsWith('wizardbook-'));
  });
}
