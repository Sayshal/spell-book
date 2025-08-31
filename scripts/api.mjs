import { PlayerFilterConfiguration, SpellAnalyticsDashboard, SpellBook, SpellListManager } from './apps/_module.mjs';
import * as DataHelpers from './data/_module.mjs';
import { CompendiumSelectionDialog, SpellComparisonDialog, SpellDetailsCustomization, SpellLoadoutDialog, SpellNotesDialog, SpellbookSettingsDialog } from './dialogs/_module.mjs';
import { log } from './logger.mjs';
import { CantripManager, MacroManager, RuleSetManager, SpellLoadoutManager, SpellManager, SpellUsageTracker, UserSpellDataManager, WizardSpellbookManager } from './managers/_module.mjs';
import { forceMigration } from './migrations.mjs';
import { SpellbookState } from './state/_module.mjs';
import * as UIHelpers from './ui/_module.mjs';
import * as ValidationHelpers from './validation/_module.mjs';

/**
 * Creates and registers the module's API
 * @returns {Object} The API object
 */
export function createAPI() {
  try {
    const api = {
      apps: { PlayerFilterConfiguration, SpellBook, SpellAnalyticsDashboard, SpellListManager },
      dialogs: { CompendiumSelectionDialog, SpellComparisonDialog, SpellDetailsCustomization, SpellLoadoutDialog, SpellNotesDialog, SpellbookSettingsDialog },
      utils: {
        data: { DataHelpers },
        managers: { CantripManager, MacroManager, RuleSetManager, SpellLoadoutManager, SpellManager, SpellUsageTracker, UserSpellDataManager, WizardSpellbookManager },
        state: { SpellbookState },
        ui: { UIHelpers },
        validation: { ValidationHelpers }
      },
      migrations: {
        forceMigration
      },
      preloadedData: null,

      /**
       * Open spell book for a specific actor
       * @param {Actor5e} actor - The actor to open the spell book for
       * @returns {SpellBook} The created spell book instance
       */
      openSpellBookForActor: (actor) => {
        if (!actor) {
          log(1, 'No actor provided');
          return null;
        }
        const spellBook = new SpellBook(actor);
        spellBook.render(true);
        return spellBook;
      },

      /**
       * Open the Spell List Manager
       * @returns {SpellListManager} The created manager instance
       */
      openSpellListManager: () => {
        const manager = new SpellListManager();
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
       * @param {SpellBook} spellbook - The spellbook reference
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
