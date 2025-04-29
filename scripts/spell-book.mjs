/**
 * Main entry point for the Spell Book module
 * Initializes all module components and registers API
 * @module spell-book
 */

import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { MODULE } from './constants.mjs';
import { discoverSpellcastingClasses } from './helpers.mjs';
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
      openSpellBookForActor: (actor) => new PlayerSpellBook(actor).render(true)
    };

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
    await discoverSpellcastingClasses();
    log(3, 'Spell classes discovery complete');
  } catch (error) {
    log(1, 'Error during module ready hook:', error);
  }
});
