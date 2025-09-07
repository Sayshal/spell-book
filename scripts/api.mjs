/**
 * Spell Book Module API
 *
 * Provides external access to module functionality through a unified API interface.
 * This module creates and registers the global SPELLBOOK API object that allows
 * other modules and macros to interact with Spell Book features programmatically.
 *
 * The API exposes applications, dialogs, utility functions, and convenience methods
 * for opening various UI components and accessing module state.
 *
 * @module API
 * @author Tyler
 */

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
 * Available applications exposed through the API.
 *
 * @typedef {Object} APIApplications
 * @property {PlayerFilterConfiguration} PlayerFilterConfiguration - Player filter configuration application
 * @property {SpellBook} SpellBook - Main spell book application
 * @property {SpellAnalyticsDashboard} SpellAnalyticsDashboard - Spell usage analytics dashboard
 * @property {SpellListManager} SpellListManager - Spell list management application
 */

/**
 * Available dialogs exposed through the API.
 *
 * @typedef {Object} APIDialogs
 * @property {CompendiumSelectionDialog} CompendiumSelectionDialog - Compendium selection dialog
 * @property {SpellComparisonDialog} SpellComparisonDialog - Spell comparison dialog
 * @property {SpellDetailsCustomization} SpellDetailsCustomization - Spell details customization dialog
 * @property {SpellLoadoutDialog} SpellLoadoutDialog - Spell loadout configuration dialog
 * @property {SpellNotesDialog} SpellNotesDialog - Spell notes editor dialog
 * @property {SpellbookSettingsDialog} SpellbookSettingsDialog - Spellbook settings dialog
 */

/**
 * Manager classes exposed through the API utilities.
 *
 * @typedef {Object} APIManagers
 * @property {CantripManager} CantripManager - Cantrip management functionality
 * @property {MacroManager} MacroManager - Macro management functionality
 * @property {RuleSetManager} RuleSetManager - Rule set management functionality
 * @property {SpellLoadoutManager} SpellLoadoutManager - Spell loadout management functionality
 * @property {SpellManager} SpellManager - Core spell management functionality
 * @property {SpellUsageTracker} SpellUsageTracker - Spell usage tracking functionality
 * @property {UserSpellDataManager} UserSpellDataManager - User spell data management functionality
 * @property {WizardSpellbookManager} WizardSpellbookManager - Wizard spellbook management functionality
 */

/**
 * Utility modules exposed through the API.
 *
 * @typedef {Object} APIUtils
 * @property {Object} data - Data helper functions for spell and compendium operations
 * @property {APIManagers} managers - Manager classes for various spell book functionalities
 * @property {SpellbookState} state - State management utilities
 * @property {Object} ui - UI helper functions and utilities
 * @property {Object} validation - Validation helper functions
 */

/**
 * Migration functions exposed through the API.
 *
 * @typedef {Object} APIMigrations
 * @property {Function} forceMigration - Force run all migrations for testing purposes
 */

/**
 * Analytics dashboard options for opening the dashboard with specific configuration.
 *
 * @typedef {Object} AnalyticsDashboardOptions
 * @property {'personal'|'gm'} [viewMode='personal'] - Dashboard view mode
 * @property {string} [userId] - User ID for personal view (defaults to current user)
 */

/**
 * Complete Spell Book module API interface.
 *
 * @typedef {Object} SpellBookAPI
 * @property {APIApplications} apps - Available applications
 * @property {APIDialogs} dialogs - Available dialogs
 * @property {APIUtils} utils - Utility modules and functions
 * @property {APIMigrations} migrations - Migration functions
 * @property {*} preloadedData - Cached spell data for performance optimization
 * @property {Function} openSpellBookForActor - Open spell book for specific actor
 * @property {Function} openSpellListManager - Open spell list manager
 * @property {Function} openAnalyticsDashboard - Open analytics dashboard
 * @property {Function} openSpellNotesDialog - Open spell notes dialog
 * @property {Function} openSpellLoadoutDialog - Open spell loadout dialog
 * @property {Function} openSpellbookSettingsDialog - Open spellbook settings dialog
 * @property {Function} log - Module logging function
 */

/**
 * Creates and registers the module's API on the global scope.
 *
 * This function constructs the complete API object with all available applications,
 * dialogs, utilities, and convenience methods. The API is registered globally as
 * `globalThis.SPELLBOOK` for access by other modules and macros.
 *
 * @returns {SpellBookAPI|null} The API object, or null if creation failed
 */
export function createAPI() {
  try {
    /** @type {SpellBookAPI} */
    const api = {
      /** @type {APIApplications} Available applications */
      apps: { PlayerFilterConfiguration, SpellBook, SpellAnalyticsDashboard, SpellListManager },

      /** @type {APIDialogs} Available dialogs */
      dialogs: { CompendiumSelectionDialog, SpellComparisonDialog, SpellDetailsCustomization, SpellLoadoutDialog, SpellNotesDialog, SpellbookSettingsDialog },

      /** @type {APIUtils} Utility modules */
      utils: {
        data: DataHelpers,
        managers: { CantripManager, MacroManager, RuleSetManager, SpellLoadoutManager, SpellManager, SpellUsageTracker, UserSpellDataManager, WizardSpellbookManager },
        state: SpellbookState,
        ui: UIHelpers,
        validation: ValidationHelpers
      },

      /** @type {APIMigrations} Migration functions */
      migrations: {
        forceMigration
      },

      /** @type {*} Preloaded spell data for performance optimization */
      preloadedData: null,

      /**
       * Open Spell Book application for a specific actor.
       *
       * Creates and renders a new Spell Book instance for the provided actor.
       * The spell book will display all spellcasting classes and capabilities
       * for the given actor.
       *
       * @param {Actor5e} actor - The actor to open the Spell Book for
       * @returns {SpellBook|null} The created Spell Book instance, or null if no actor provided
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
       * Open the Spell List Manager application.
       *
       * Creates and renders a new Spell List Manager instance for managing
       * custom spell lists, merging spell lists, and organizing spells.
       *
       * @returns {SpellListManager} The created manager instance
       */
      openSpellListManager: () => {
        const manager = new SpellListManager();
        manager.render(true);
        return manager;
      },

      /**
       * Open the spell analytics dashboard.
       *
       * Creates and renders a new analytics dashboard for viewing spell usage
       * statistics and trends. Supports both personal and GM view modes.
       *
       * @param {AnalyticsDashboardOptions} [options={}] - Dashboard configuration options
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
       * Open spell notes dialog for a specific spell.
       *
       * Creates and renders a spell notes dialog for editing personal notes
       * about a specific spell identified by its UUID.
       *
       * @param {string} spellUuid - The UUID of the spell to edit notes for
       * @returns {SpellNotesDialog|null} The created dialog instance, or null if no UUID provided
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
       * Open spell loadout dialog for an actor and class.
       *
       * Creates and renders a spell loadout configuration dialog for managing
       * spell selections, preparations, and loadouts for a specific class.
       *
       * @param {Actor} actor - The actor to configure loadouts for
       * @param {SpellBook} spellbook - The Spell Book application reference
       * @param {string} classIdentifier - The class identifier for the loadout
       * @returns {SpellLoadoutDialog|null} The created dialog instance, or null if parameters missing
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
       * Open Spell Book settings dialog for an actor.
       *
       * Creates and renders a spellbook settings dialog for configuring
       * actor-specific spell book behavior and preferences.
       *
       * @param {Actor} actor - The actor to configure settings for
       * @returns {SpellbookSettingsDialog|null} The created dialog instance, or null if no actor provided
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

      /** @type {Function} Module logging function with level-based filtering */
      log
    };

    // Register API globally for external access
    globalThis.SPELLBOOK = api;
    log(3, 'Module API registered with all components');
    return api;
  } catch (error) {
    log(1, 'Error creating API:', error);
    return null;
  }
}
