import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { PlayerFilterConfiguration } from './apps/player-filter-configuration.mjs';
import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { SpellbookSettingsDialog } from './apps/spellbook-settings-dialog.mjs';

// Import all helper functions
import * as actorSpellUtils from './helpers/actor-spells.mjs';
import * as filterUtils from './helpers/filters.mjs';
import * as discoveryUtils from './helpers/spell-discovery.mjs';
import * as formattingUtils from './helpers/spell-formatting.mjs';
import * as managerHelpers from './helpers/spell-management.mjs';
import { SpellManager } from './helpers/spell-preparation.mjs';

import { log } from './logger.mjs';

/**
 * Creates and registers the module's API
 * @returns {Object} The API object
 */
export function createAPI() {
  try {
    //TODO: Update this with all helpers
    const api = {
      apps: {
        PlayerSpellBook,
        GMSpellListManager,
        SpellbookSettingsDialog,
        PlayerFilterConfiguration
      },
      utils: {
        actor: { ...actorSpellUtils },
        filters: { ...filterUtils },
        discovery: { ...discoveryUtils },
        formatting: { ...formattingUtils },
        management: { ...managerHelpers },
        SpellManager
      },

      /**
       * Open spell book for a specific actor
       * @param {Actor5e} actor - The actor to open the spell book for
       * @returns {PlayerSpellBook} The created spell book instance
       */
      openSpellBookForActor: (actor) => {
        if (!actor) log(1, 'No actor provided');
        const spellBook = new PlayerSpellBook(actor);
        spellBook.render(true);
        return spellBook;
      },

      /**
       * Open the GM spell list manager
       * @returns {GMSpellListManager} The created manager instance
       */
      openSpellListManager: () => {
        const manager = new GMSpellListManager();
        manager.render(true);
        return manager;
      },

      log
    };

    globalThis.SPELLBOOK = api;

    log(3, 'Module API registered');
    return api;
  } catch (error) {
    log(1, 'Error creating API:', error);
    return null;
  }
}
