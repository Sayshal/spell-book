/**
 * Main entry point for the Spell Book module
 * Initializes all module components and registers API
 * @module spell-book
 */

import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { MODULE } from './constants.mjs';
import { registerHandlebarsHelpers } from './helpers/handlebars-helpers.mjs';
import * as discoveryUtils from './helpers/spell-discovery.mjs';
import { registerHooks } from './hooks.mjs';
import { initializeLogger, log } from './logger.mjs';
import { registerSettings } from './settings.mjs';

// Main initialization hook
Hooks.once('init', async function () {
  try {
    log(3, `Initializing ${MODULE.NAME} module`);

    // Initialize module components
    initializeFoundryConfiguration();
    await initializeModuleComponents();
    registerHandlebarsHelpers();
    registerModuleAPI();

    log(3, 'Module initialization complete');
  } catch (error) {
    console.error(`${MODULE.ID} | Error initializing module:`, error);
  }
});

// Ready hook for post-initialization tasks
Hooks.once('ready', async function () {
  try {
    // Discover available spell data
    await loadSpellcastingData();
  } catch (error) {
    log(1, 'Error during module ready hook:', error);
  }
});

/**
 * Configure Foundry for module needs
 */
function initializeFoundryConfiguration() {
  try {
    // Extend compendium indexes with needed fields
    CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
    CONFIG.Item.compendiumIndexFields = ['system.spellcasting.progression', 'system.spellcasting.preparation.mode'];

    log(3, 'Foundry configuration extended');
  } catch (error) {
    log(1, 'Error configuring Foundry:', error);
    throw error; // Re-throw as this is critical
  }
}

/**
 * Initialize module components
 */
async function initializeModuleComponents() {
  try {
    // Register module settings
    registerSettings();

    // Initialize the logger with settings
    initializeLogger();

    // Register module hooks
    await registerHooks();

    log(3, 'Module components initialized');
  } catch (error) {
    log(1, 'Error initializing module components:', error);
    throw error; // Re-throw as this is critical
  }
}

/**
 * Load spellcasting data during ready hook
 */
async function loadSpellcastingData() {
  try {
    // Initialize spell data
    await discoveryUtils.discoverSpellcastingClasses();
    log(3, 'Spell classes discovery complete');
  } catch (error) {
    log(1, 'Error loading spellcasting data:', error);
  }
}

/**
 * Register the module API in the global scope
 */
function registerModuleAPI() {
  try {
    // Define API methods
    const api = {
      /**
       * Core applications
       */
      apps: {
        /**
         * PlayerSpellBook class constructor
         * @type {Class}
         */
        PlayerSpellBook,

        /**
         * GMSpellListManager class constructor
         * @type {Class}
         */
        GMSpellListManager
      },

      /**
       * Open a spell book for a specific actor
       * @param {Actor} actor - The actor to open a spell book for
       * @returns {PlayerSpellBook} The created spell book instance
       */
      openSpellBookForActor: (actor) => {
        if (!actor) {
          throw new Error('No actor provided');
        }
        const spellBook = new PlayerSpellBook(actor);
        spellBook.render(true);
        return spellBook;
      },

      /**
       * Open the GM spell list manager
       * @returns {GMSpellListManager} The created spell list manager instance
       */
      openSpellListManager: () => {
        const manager = new GMSpellListManager();
        manager.render(true);
        return manager;
      },

      /**
       * Get the module version
       * @returns {string} The module version
       */
      getVersion: () => {
        return game.modules.get(MODULE.ID)?.version || 'unknown';
      }
    };

    // Register API in global scope
    globalThis.SPELLBOOK = api;

    log(3, 'Module API registered');
  } catch (error) {
    log(1, 'Error registering module API:', error);
  }
}
