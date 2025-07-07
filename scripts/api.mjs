import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { PlayerFilterConfiguration } from './apps/player-filter-configuration.mjs';
import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { SpellAnalyticsDashboard } from './apps/spell-analytics-dashboard.mjs';
import { SpellLoadoutDialog } from './apps/spell-loadout-dialog.mjs';
import { SpellNotesDialog } from './apps/spell-notes-dialog.mjs';
import { SpellbookSettingsDialog } from './apps/spellbook-settings-dialog.mjs';
import * as actorSpellUtils from './helpers/actor-spells.mjs';
import * as colorUtils from './helpers/color-utils.mjs';
import * as managerHelpers from './helpers/compendium-management.mjs';
import * as filterUtils from './helpers/filters.mjs';
import * as formElements from './helpers/form-elements.mjs';
import * as genericUtils from './helpers/generic-utils.mjs';
import { ScrollScanner } from './helpers/scroll-scanner.mjs';
import * as spellCache from './helpers/spell-cache.mjs';
import { SpellDescriptionInjection } from './helpers/spell-description-injection.mjs';
import * as discoveryUtils from './helpers/spell-discovery.mjs';
import * as formattingUtils from './helpers/spell-formatting.mjs';
import { SpellUserDataJournal } from './helpers/spell-user-data.mjs';
import { SpellbookState } from './helpers/state/spellbook-state.mjs';
import { SpellbookFilterHelper } from './helpers/ui/spellbook-filters.mjs';
import { SpellbookUI } from './helpers/ui/spellbook-ui.mjs';
import { log } from './logger.mjs';
import { CantripManager } from './managers/cantrip-manager.mjs';
import { MacroManager } from './managers/macro-manager.mjs';
import { RitualManager } from './managers/ritual-manager.mjs';
import { RuleSetManager } from './managers/rule-set-manager.mjs';
import { SpellLoadoutManager } from './managers/spell-loadout-manager.mjs';
import { SpellManager } from './managers/spell-manager.mjs';
import { SpellUsageTracker } from './managers/spell-usage-tracker.mjs';
import { UserSpellDataManager } from './managers/user-spell-data-manager.mjs';
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
        PlayerFilterConfiguration,
        SpellAnalyticsDashboard,
        SpellLoadoutDialog,
        SpellNotesDialog
      },
      utils: {
        actor: { ...actorSpellUtils },
        colors: { ...colorUtils },
        filters: { ...filterUtils },
        discovery: { ...discoveryUtils },
        formatting: { ...formattingUtils },
        management: { ...managerHelpers },
        forms: { ...formElements },
        generic: { ...genericUtils },
        SpellUserDataJournal,
        spellCache: { ...spellCache }
      },
      helpers: {
        state: { SpellbookState },
        ui: {
          SpellbookFilterHelper,
          SpellbookUI
        },
        ScrollScanner,
        SpellDescriptionInjection
      },
      managers: {
        SpellManager,
        CantripManager,
        RitualManager,
        RuleSetManager,
        WizardSpellbookManager,
        SpellLoadoutManager,
        MacroManager,
        UserSpellDataManager,
        SpellUsageTracker
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
        if (!actor) {
          log(1, 'No actor provided');
          return null;
        }
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

      /**
       * Open the spell analytics dashboard
       * @param {Object} options - Dashboard options
       * @param {string} [options.viewMode='personal'] - 'personal' or 'gm'
       * @param {string} [options.userId] - User ID for personal view
       * @returns {SpellAnalyticsDashboard} The created dashboard instance
       */
      openAnalyticsDashboard: (options = {}) => {
        const viewMode = options.viewMode || (game.user.isGM ? 'gm' : 'personal');
        const userId = options.userId || game.user.id;

        const dashboard = new SpellAnalyticsDashboard({
          viewMode: viewMode,
          userId: userId
        });
        dashboard.render(true);
        return dashboard;
      },

      /**
       * Open spell notes dialog for a specific spell
       * @param {string} spellUuid - The spell UUID
       * @returns {SpellNotesDialog} The created dialog instance
       */
      openSpellNotesDialog: (spellUuid) => {
        if (!spellUuid) {
          log(1, 'No spell UUID provided');
          return null;
        }
        const dialog = new SpellNotesDialog({ spellUuid });
        dialog.render(true);
        return dialog;
      },

      /**
       * Open spell loadout dialog for an actor and class
       * @param {Actor} actor - The actor
       * @param {PlayerSpellBook} spellbook - The spellbook reference
       * @param {string} classIdentifier - The class identifier
       * @returns {SpellLoadoutDialog} The created dialog instance
       */
      openSpellLoadoutDialog: (actor, spellbook, classIdentifier) => {
        if (!actor || !spellbook || !classIdentifier) {
          log(1, 'Missing required parameters for loadout dialog');
          return null;
        }
        const dialog = new SpellLoadoutDialog(actor, spellbook, classIdentifier);
        dialog.render(true);
        return dialog;
      },

      /**
       * Open spellbook settings dialog for an actor
       * @param {Actor} actor - The actor
       * @returns {SpellbookSettingsDialog} The created dialog instance
       */
      openSpellbookSettingsDialog: (actor) => {
        if (!actor) {
          log(1, 'No actor provided');
          return null;
        }
        const dialog = new SpellbookSettingsDialog(actor);
        dialog.render(true);
        return dialog;
      },

      log
    };

    globalThis.SPELLBOOK = api;
    log(3, 'Module API registered with all components');
    return api;
  } catch (error) {
    log(1, 'Error creating API:', error);
    return null;
  }
}
