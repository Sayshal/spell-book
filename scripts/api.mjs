import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { PlayerFilterConfiguration } from './apps/player-filter-configuration.mjs';
import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { SpellbookSettingsDialog } from './apps/spellbook-settings-dialog.mjs';
import * as actorSpellUtils from './helpers/actor-spells.mjs';
import * as colorUtils from './helpers/color-utils.mjs';
import * as managerHelpers from './helpers/compendium-management.mjs';
import * as filterUtils from './helpers/filters.mjs';
import * as formElements from './helpers/form-elements.mjs';
import * as genericUtils from './helpers/generic-utils.mjs';
import * as discoveryUtils from './helpers/spell-discovery.mjs';
import * as formattingUtils from './helpers/spell-formatting.mjs';
import { SpellbookState } from './helpers/state/spellbook-state.mjs';
import { SpellbookFilterHelper } from './helpers/ui/spellbook-filters.mjs';
import { SpellbookUI } from './helpers/ui/spellbook-ui.mjs';
import { log } from './logger.mjs';
import { CantripManager } from './managers/cantrip-manager.mjs';
import { RitualManager } from './managers/ritual-manager.mjs';
import { RuleSetManager } from './managers/rule-set-manager.mjs';
import { SpellManager } from './managers/spell-manager.mjs';
import { WizardSpellbookManager } from './managers/wizard-spellbook-manager.mjs';
import { forceMigration } from './migrations.mjs';

/**
 * Creates and registers the module's API
 * @returns {Object} The API object
 */
export function createAPI() {
  try {
    const api = {
      apps: {
        PlayerSpellBook,
        GMSpellListManager,
        SpellbookSettingsDialog,
        PlayerFilterConfiguration
      },
      utils: {
        actor: { ...actorSpellUtils },
        colors: { ...colorUtils },
        filters: { ...filterUtils },
        discovery: { ...discoveryUtils },
        formatting: { ...formattingUtils },
        management: { ...managerHelpers },
        forms: { ...formElements },
        generic: { ...genericUtils }
      },
      helpers: {
        state: { SpellbookState },
        ui: {
          SpellbookFilterHelper,
          SpellbookUI
        }
      },
      managers: {
        SpellManager,
        CantripManager,
        RitualManager,
        RuleSetManager,
        WizardSpellbookManager
      },
      migrations: {
        forceMigration
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
