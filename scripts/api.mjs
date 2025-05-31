import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { PlayerFilterConfiguration } from './apps/player-filter-configuration.mjs';
import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { SpellbookSettingsDialog } from './apps/spellbook-settings-dialog.mjs';
import * as actorSpellUtils from './helpers/actor-spells.mjs';
import * as managerHelpers from './helpers/compendium-management.mjs';
import * as filterUtils from './helpers/filters.mjs';
import * as discoveryUtils from './helpers/spell-discovery.mjs';
import * as formattingUtils from './helpers/spell-formatting.mjs';
import { log } from './logger.mjs';
import { SpellManager } from './managers/spell-manager.mjs';
import { forceMigration } from './migrations.mjs';

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
        SpellManager,
        forceMigration: forceMigration
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
