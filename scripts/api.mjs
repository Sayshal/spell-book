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
 * Public API interface for the Spell Book module
 * @typedef {Object} SpellBookAPI
 * @property {APIApps} apps Application classes for external use
 * @property {APIDialogs} dialogs Dialog classes for external integration
 * @property {APIUtils} utils Utility functions and helper classes
 * @property {APIMigrations} migrations Migration-related functionality
 * @property {*} preloadedData Cached spell data for performance
 * @property {Function} openSpellBookForActor Open spell book for specific actor
 * @property {Function} openSpellListManager Open the spell list manager
 * @property {Function} openAnalyticsDashboard Open analytics dashboard with options
 * @property {Function} openSpellNotesDialog Open spell notes dialog for a spell
 * @property {Function} openSpellLoadoutDialog Open spell loadout dialog
 * @property {Function} openSpellbookSettingsDialog Open spellbook settings dialog
 * @property {Function} log Logger function for external use
 */

/**
 * Application classes available through the API
 * @typedef {Object} APIApps
 * @property {typeof PlayerFilterConfiguration} PlayerFilterConfiguration Filter configuration dialog
 * @property {typeof SpellBook} SpellBook Main player spell book application
 * @property {typeof SpellAnalyticsDashboard} SpellAnalyticsDashboard Spell usage analytics
 * @property {typeof SpellListManager} SpellListManager GM spell list management
 */

/**
 * Dialog classes available through the API
 * @typedef {Object} APIDialogs
 * @property {typeof CompendiumSelectionDialog} CompendiumSelectionDialog Compendium selection interface
 * @property {typeof SpellComparisonDialog} SpellComparisonDialog Side-by-side spell comparison
 * @property {typeof SpellDetailsCustomization} SpellDetailsCustomization UI customization settings
 * @property {typeof SpellLoadoutDialog} SpellLoadoutDialog Spell loadout management
 * @property {typeof SpellNotesDialog} SpellNotesDialog Spell notes editing interface
 * @property {typeof SpellbookSettingsDialog} SpellbookSettingsDialog Main settings configuration
 */

/**
 * Utility functions and classes available through the API
 * @typedef {Object} APIUtils
 * @property {typeof DataHelpers} data Data manipulation and processing utilities
 * @property {APIManagers} managers Business logic manager classes
 * @property {typeof SpellbookState} state Application state management
 * @property {typeof UIHelpers} ui User interface utilities and helpers
 * @property {typeof ValidationHelpers} validation Data validation and filtering utilities
 */

/**
 * Manager classes available through the API
 * @typedef {Object} APIManagers
 * @property {typeof CantripManager} CantripManager Cantrip-specific functionality
 * @property {typeof MacroManager} MacroManager Foundry macro management
 * @property {typeof RuleSetManager} RuleSetManager Spellcasting rule management
 * @property {typeof SpellLoadoutManager} SpellLoadoutManager Spell loadout storage
 * @property {typeof SpellManager} SpellManager Core spell preparation logic
 * @property {typeof SpellUsageTracker} SpellUsageTracker Spell usage analytics
 * @property {typeof UserSpellDataManager} UserSpellDataManager User data synchronization
 * @property {typeof WizardSpellbookManager} WizardSpellbookManager Wizard-specific functionality
 */

/**
 * Migration-related functionality available through the API
 * @typedef {Object} APIMigrations
 * @property {Function} forceMigration Force run all migrations for testing
 */

/**
 * Analytics dashboard configuration options
 * @typedef {Object} AnalyticsDashboardOptions
 * @property {ViewMode} [viewMode] Dashboard view mode ('personal' | 'gm')
 * @property {string} [userId] User ID for personal view mode
 */

/**
 * Analytics dashboard view mode options
 * @typedef {"personal" | "gm"} ViewMode
 */

/**
 * Foundry VTT Actor5e reference for API methods
 * @typedef {Object} Actor5e
 * @property {string} id Unique actor identifier
 * @property {string} name Actor display name
 * @property {Object} spellcastingClasses Spellcasting class configuration
 */

/**
 * Creates and registers the module's API for external access
 * @returns {SpellBookAPI|null} The API object or null on error
 */
export function createAPI() {
  try {
    const api = {
      apps: { PlayerFilterConfiguration, SpellBook, SpellAnalyticsDashboard, SpellListManager },
      dialogs: { CompendiumSelectionDialog, SpellComparisonDialog, SpellDetailsCustomization, SpellLoadoutDialog, SpellNotesDialog, SpellbookSettingsDialog },
      utils: {
        data: DataHelpers,
        managers: { CantripManager, MacroManager, RuleSetManager, SpellLoadoutManager, SpellManager, SpellUsageTracker, UserSpellDataManager, WizardSpellbookManager },
        state: SpellbookState,
        ui: UIHelpers,
        validation: ValidationHelpers
      },
      migrations: {
        forceMigration
      },
      preloadedData: null,

      /**
       * Open Spell Book for a specific actor
       * @param {Actor5e} actor The actor to open the Spell Book for
       * @returns {SpellBook|null} The created Spell Book instance or null if invalid
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
       * @param {AnalyticsDashboardOptions} [options={}] Dashboard options
       * @param {ViewMode} [options.viewMode='personal'] 'personal' or 'gm'
       * @param {string} [options.userId] User ID for personal view
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
       * @param {string} spellUuid The spell UUID
       * @returns {SpellNotesDialog|null} The created dialog instance or null if invalid
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
       * @param {Actor5e} actor The actor
       * @param {SpellBook} spellbook The Spell Book reference
       * @param {string} classIdentifier The class identifier
       * @returns {SpellLoadoutDialog|null} The created dialog instance or null if invalid
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
       * Open Spell Book settings dialog for an actor
       * @param {Actor5e} actor The actor
       * @returns {SpellbookSettingsDialog|null} The created dialog instance or null if invalid
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
