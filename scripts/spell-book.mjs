/**
 * Main entry point for the Spell Book module
 * Initializes all module components and registers API
 * @module spell-book
 */

import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { MODULE } from './constants.mjs';
import * as discoveryUtils from './helpers/spell-discovery.mjs';
import { registerHooks } from './hooks.mjs';
import { initializeLogger, log } from './logger.mjs';
import { registerSettings } from './settings.mjs';

/**
 * Initialize module during Foundry's init hook
 */
Hooks.once('init', async function () {
  try {
    log(3, `Initializing ${MODULE.NAME} module`);

    // Extend compendium indexes with needed fields
    CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
    CONFIG.Item.compendiumIndexFields = ['system.spellcasting.progression', 'system.spellcasting.preparation.mode'];

    // Register module hooks
    registerHooks();

    // Register module settings
    registerSettings();

    // Initialize the logger with settings
    initializeLogger();

    // Expose the PlayerSpellBook class for other modules
    MODULE.PlayerSpellBook = PlayerSpellBook;

    // Register module API
    game.modules.get(MODULE.ID).api = {
      PlayerSpellBook,
      GMSpellListManager,
      openSpellBookForActor: (actor) => new PlayerSpellBook(actor).render(true),
      openSpellListManager: () => new GMSpellListManager().render(true)
    };

    // Register Handlebars helpers for pagination
    Handlebars.registerHelper('add', function (a, b) {
      return Number(a) + Number(b);
    });

    Handlebars.registerHelper('subtract', function (a, b) {
      return Number(a) - Number(b);
    });

    Handlebars.registerHelper('multiply', function (a, b) {
      return Number(a) * Number(b);
    });

    Handlebars.registerHelper('min', function (a, b) {
      return Math.min(Number(a), Number(b));
    });

    Handlebars.registerHelper('max', function (a, b) {
      return Math.max(Number(a), Number(b));
    });

    Handlebars.registerHelper('eq', function (a, b) {
      return a === b;
    });

    Handlebars.registerHelper('gt', function (a, b) {
      return Number(a) > Number(b);
    });

    log(3, 'Module initialization complete');
  } catch (error) {
    console.error(`${MODULE.ID} | Error initializing module:`, error);
  }
});

/**
 * Finalize setup during Foundry's ready hook
 */
Hooks.once('ready', async function () {
  try {
    // Initialize spell data
    await discoveryUtils.discoverSpellcastingClasses();
    log(3, 'Spell classes discovery complete');
  } catch (error) {
    log(1, 'Error during module ready hook:', error);
  }
});
