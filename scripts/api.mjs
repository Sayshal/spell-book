import { CantripSettingsDialog } from './apps/cantrip-settings-dialog.mjs';
import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { PlayerFilterConfiguration } from './apps/player-filter-configuration.mjs';
import { PlayerSpellBook } from './apps/player-spell-book.mjs';

// Import all helper functions
import * as actorSpellUtils from './helpers/actor-spells.mjs';
import * as filterUtils from './helpers/filters.mjs';
import * as handlebarsHelpers from './helpers/handlebars-helpers.mjs';
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
    const api = {
      // Applications
      apps: {
        PlayerSpellBook,
        GMSpellListManager,
        CantripSettingsDialog,
        PlayerFilterConfiguration
      },

      // Helper utilities - organized by category
      utils: {
        actor: { ...actorSpellUtils },
        filters: { ...filterUtils },
        discovery: { ...discoveryUtils },
        formatting: { ...formattingUtils },
        management: { ...managerHelpers },
        SpellManager
      },

      // Handlebars helpers
      handlebars: { ...handlebarsHelpers },

      // Convenience methods
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
      },

      // Logging facility
      log
    };

    // Register API globally
    globalThis.SPELLBOOK = api;

    log(3, 'Module API registered');

    return api;
  } catch (error) {
    log(1, 'Error creating API:', error);
  }
}
