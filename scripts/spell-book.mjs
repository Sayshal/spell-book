import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { MODULE } from './constants.mjs';
import { registerHandlebarsHelpers } from './helpers/handlebars-helpers.mjs';
import { registerHooks } from './hooks.mjs';
import { initializeLogger, log } from './logger.mjs';
import { registerSettings } from './settings.mjs';

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

Hooks.once('ready', async function () {
  try {
    await unlockModuleCompendium();
  } catch (error) {
    log(1, 'Error in ready hook:', error);
  }
});

function initializeFoundryConfiguration() {
  try {
    // Extend compendium indexes with needed fields
    CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
    CONFIG.Item.compendiumIndexFields = ['system.spellcasting.progression', 'system.spellcasting.preparation.mode'];

    log(3, 'Foundry configuration extended');
  } catch (error) {
    log(1, 'Error configuring Foundry:', error);
  }
}

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
  }
}

function registerModuleAPI() {
  try {
    const api = {
      apps: {
        PlayerSpellBook,
        GMSpellListManager
      },
      openSpellBookForActor: (actor) => {
        if (!actor) {
          throw new Error('No actor provided');
        }
        const spellBook = new PlayerSpellBook(actor);
        spellBook.render(true);
        return spellBook;
      },
      openSpellListManager: () => {
        const manager = new GMSpellListManager();
        manager.render(true);
        return manager;
      }
    };

    globalThis.SPELLBOOK = api;

    log(3, 'Module API registered');
  } catch (error) {
    log(1, 'Error registering module API:', error);
  }
}

async function unlockModuleCompendium() {
  try {
    // Find the module's compendium pack
    const pack = game.packs.find((p) => p.collection === 'spell-book.custom-spell-lists');

    if (pack && pack.locked) {
      log(3, 'Unlocking custom spell lists compendium');
      await pack.configure({ locked: false });
    }
  } catch (error) {
    log(1, 'Error unlocking module compendium:', error);
  }
}
