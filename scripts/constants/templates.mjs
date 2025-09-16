/**
 * Handlebars template path definitions for the Spell Book module.
 *
 * This module defines all template paths used with Foundry's renderTemplate() function
 * to render application interfaces, dialogs, and reusable components. All paths are
 * organized by functional area and include comprehensive type definitions.
 *
 * @module Constants/Templates
 * @author Tyler
 */

/**
 * Complete template path configuration for the Spell Book module.
 * Organized by functional area for easy navigation and maintenance.
 *
 * @typedef {Object} TemplateConfig
 * @property {AnalyticsTemplates} ANALYTICS - Template paths for analytics dashboard and reports
 * @property {ComponentTemplates} COMPONENTS - Reusable component template paths for UI elements
 * @property {DialogTemplates} DIALOGS - Dialog application template paths for user interactions
 * @property {SpellListManagerTemplates} SPELL_LIST_MANAGER - Spell List Manager application templates
 * @property {PlayerSpellBookTemplates} PLAYER_SPELL_BOOK - Player Spell Book application templates
 * @property {TroubleshooterTemplates} TROUBLESHOOTER - Troubleshooter application templates
 * @property {PartySpellManagerTemplates} PARTY_SPELL_MANAGER - Party spell coordination templates
 */

/**
 * Analytics dashboard template paths for spell usage tracking and reporting.
 *
 * @typedef {Object} AnalyticsTemplates
 * @property {string} DASHBOARD - Main analytics dashboard template for viewing spell usage statistics
 */

/**
 * Reusable component template paths for common UI elements.
 * These templates are used across multiple applications for consistency.
 *
 * @typedef {Object} ComponentTemplates
 * @property {string} CANTRIP_NOTIFICATION - GM notification template for cantrip changes
 * @property {string} EMPTY - Empty state component template for when no data is available
 * @property {string} ERROR - Error message component template for displaying errors
 * @property {string} LOADING - Loading spinner component template for async operations
 * @property {string} MIGRATION_ACTORS - Migration results actor list template
 * @property {string} MIGRATION_FOLDER - Migration results folder template
 * @property {string} MIGRATION_OWNERSHIP - Migration results ownership template
 * @property {string} MIGRATION_REPORT - Migration results summary template
 * @property {string} MIGRATION_CUSTOM_SPELL_LIST_RESULTS - Migration results custom spell list format template
 * @property {string} MIGRATION_USER_DATA - Migration results user data template
 * @property {string} SPELL_LEVEL - Spell level grouping component template
 * @property {string} USER_DATA_INTRO - User data introduction template for analytics
 * @property {string} USER_SPELL_DATA_EMPTY - Empty user spell data template
 * @property {string} USER_SPELL_DATA_TABLES - User spell data tables template for analytics
 */

/**
 * Dialog application template paths for user interaction dialogs.
 * Covers all modal dialogs and configuration interfaces.
 *
 * @typedef {Object} DialogTemplates
 * @property {string} ANALYTICS_IMPORT_SUMMARY - Analytics data import summary dialog
 * @property {string} COMPENDIUM_SELECTION - Compendium selection dialog template
 * @property {string} CREATE_SPELL_LIST - Create new spell list dialog template
 * @property {string} FILTER_CONFIG - Filter configuration dialog template
 * @property {string} FOCUS_SETTINGS - Spellcasting focus settings dialog template
 * @property {string} LEARN_FROM_SCROLL - Learn spell from scroll dialog template
 * @property {string} LONG_REST_SWAP - Long rest spell swap dialog template
 * @property {string} MANAGER_DOCUMENTATION - Spell List Manager documentation dialog
 * @property {string} MERGE_SPELL_LISTS - Merge spell lists dialog template
 * @property {string} PARTY_SPELL_ANALYSIS - Party spell analysis dialog template
 * @property {string} RENAME_SPELL_LIST - Rename spell list dialog template
 * @property {string} SCROLL_SCANNER_RESULTS - Scroll scanner results dialog template
 * @property {string} SPELL_COMPARISON - Spell comparison dialog template
 * @property {string} SPELL_CUSTOMIZATION_BODY - Spell details customization dialog body
 * @property {string} SPELL_CUSTOMIZATION_FOOTER - Spell details customization dialog footer
 * @property {string} SPELL_LOADOUT - Spell loadout management dialog template
 * @property {string} SPELL_NOTES - Spell notes editing dialog template
 * @property {string} SPELLBOOK_SETTINGS - Main spellbook settings dialog template
 * @property {string} WIZARD_LEARN_SPELL - Wizard learn spell dialog template
 */

/**
 * Spell List Manager application template paths for GM spell list management.
 *
 * @typedef {Object} SpellListManagerTemplates
 * @property {string} AVAILABLE_SPELLS - Available spells panel template showing spells to add
 * @property {string} FOOTER - Application footer template with action buttons
 * @property {string} LIST_CONTENT - Selected list content panel template showing current spells
 * @property {string} MAIN - Main application layout template providing overall structure
 * @property {string} SPELL_LISTS - Spell lists sidebar template for list navigation
 */

/**
 * Player Spell Book application template paths for the main player interface.
 *
 * @typedef {Object} PlayerSpellBookTemplates
 * @property {string} CONTAINER - Main spell container template for spell display
 * @property {string} FOOTER - Application footer template with preparation controls
 * @property {string} SIDEBAR - Application sidebar template with filters and navigation
 * @property {string} TAB_NAV - Tab navigation template for switching between views
 * @property {string} TAB_SPELLS - Spell preparation tab template for standard spellcasting
 * @property {string} TAB_WIZARD_SPELLBOOK - Wizard spellbook tab template for wizard-specific features
 */

/**
 * Troubleshooter application template paths for debugging and diagnostics.
 *
 * @typedef {Object} TroubleshooterTemplates
 * @property {string} MAIN - Main troubleshooter interface template for system diagnostics
 */

/**
 * Party spell coordination template paths for multi-character spell management.
 *
 * @typedef {Object} PartySpellManagerTemplates
 * @property {string} MAIN - Main party spell manager template for coordination interface
 * @property {string} SYNERGY_ANALYSIS - Spell synergy analysis template for party optimization
 */

/**
 * Handlebars template paths used throughout the Spell Book module.
 *
 * These paths are used with Foundry's renderTemplate() function to render
 * application interfaces, dialogs, and reusable components. All paths are
 * relative to the Foundry VTT data directory and point to .hbs (Handlebars)
 * template files within the module's templates folder.
 *
 * Organization:
 * - Templates are grouped by functional area for easy maintenance
 * - Each template has a descriptive comment explaining its purpose
 * - Path constants follow a consistent naming convention
 *
 * @type {TemplateConfig}
 */
export const TEMPLATES = {
  /**
   * Analytics dashboard and reporting templates.
   * @type {AnalyticsTemplates}
   */
  ANALYTICS: {
    /** Main analytics dashboard for viewing spell usage statistics and trends */
    DASHBOARD: 'modules/spell-book/templates/analytics/dashboard.hbs'
  },

  /**
   * Reusable component templates for common UI elements.
   * @type {ComponentTemplates}
   */
  COMPONENTS: {
    /** GM notification component for cantrip changes during level-up or long rest */
    CANTRIP_NOTIFICATION: 'modules/spell-book/templates/components/cantrip-notification.hbs',

    /** Empty state component displayed when no data is available */
    EMPTY: 'modules/spell-book/templates/components/empty-state.hbs',

    /** Error message component for displaying user-friendly error information */
    ERROR: 'modules/spell-book/templates/components/error-message.hbs',

    /** Loading spinner component for async operations and data fetching */
    LOADING: 'modules/spell-book/templates/components/loading-spinner.hbs',

    /** Migration results component showing affected actors */
    MIGRATION_ACTORS: 'modules/spell-book/templates/components/migration-actor-list.hbs',

    /** Migration results component showing folder organization changes */
    MIGRATION_FOLDER: 'modules/spell-book/templates/components/migration-folder-results.hbs',

    /** Migration results component showing ownership permission changes */
    MIGRATION_OWNERSHIP: 'modules/spell-book/templates/components/migration-ownership-results.hbs',

    /** Migration results summary component with overall statistics */
    MIGRATION_REPORT: 'modules/spell-book/templates/components/migration-report.hbs',

    /** Migration results component showing custom spell list format changes */
    MIGRATION_CUSTOM_SPELL_LIST_RESULTS: 'modules/spell-book/templates/components/migration-custom-spell-list-results.hbs',

    /** Migration results component showing user data changes */
    MIGRATION_USER_DATA: 'modules/spell-book/templates/components/migration-user-data-results.hbs',

    /** Spell level grouping component for organizing spells by level */
    SPELL_LEVEL: 'modules/spell-book/templates/components/spell-level.hbs',

    /** User data introduction component for analytics features */
    USER_DATA_INTRO: 'modules/spell-book/templates/components/user-data-intro.hbs',

    /** Empty state component for when no user spell data is available */
    USER_SPELL_DATA_EMPTY: 'modules/spell-book/templates/components/user-spell-data-empty.hbs',

    /** Data tables component for displaying user spell analytics */
    USER_SPELL_DATA_TABLES: 'modules/spell-book/templates/components/user-spell-data-tables.hbs'
  },

  /**
   * Dialog application templates for user interactions.
   * @type {DialogTemplates}
   */
  DIALOGS: {
    /** Analytics import summary dialog showing imported data statistics */
    ANALYTICS_IMPORT_SUMMARY: 'modules/spell-book/templates/dialogs/analytics-import-summary.hbs',

    /** Compendium selection dialog for choosing spell sources */
    COMPENDIUM_SELECTION: 'modules/spell-book/templates/dialogs/compendium-selection.hbs',

    /** Create new spell list dialog for GM spell list management */
    CREATE_SPELL_LIST: 'modules/spell-book/templates/dialogs/create-spell-list.hbs',

    /** Filter configuration dialog for customizing spell browser filters */
    FILTER_CONFIG: 'modules/spell-book/templates/dialogs/filter-configuration.hbs',

    /** Spellcasting focus settings dialog for party coordination */
    FOCUS_SETTINGS: 'modules/spell-book/templates/dialogs/focus-settings.hbs',

    /** Learn from scroll dialog for wizard spell copying */
    LEARN_FROM_SCROLL: 'modules/spell-book/templates/dialogs/learn-from-scroll.hbs',

    /** Long rest spell swap dialog for spell preparation changes */
    LONG_REST_SWAP: 'modules/spell-book/templates/dialogs/long-rest-swap.hbs',

    /** Spell List Manager documentation dialog with usage instructions */
    MANAGER_DOCUMENTATION: 'modules/spell-book/templates/dialogs/spell-list-manager-documentation.hbs',

    /** Merge spell lists dialog for combining multiple spell lists */
    MERGE_SPELL_LISTS: 'modules/spell-book/templates/dialogs/merge-spell-lists.hbs',

    /** Party spell analysis dialog for spell synergy recommendations */
    PARTY_SPELL_ANALYSIS: 'modules/spell-book/templates/dialogs/party-spell-analysis.hbs',

    /** Rename spell list dialog for editing spell list properties */
    RENAME_SPELL_LIST: 'modules/spell-book/templates/dialogs/rename-spell-list.hbs',

    /** Scroll scanner results dialog showing detected spell scrolls */
    SCROLL_SCANNER_RESULTS: 'modules/spell-book/templates/dialogs/scroll-scanner-results.hbs',

    /** Spell comparison dialog for side-by-side spell analysis */
    SPELL_COMPARISON: 'modules/spell-book/templates/dialogs/spell-comparison.hbs',

    /** Spell details customization dialog body content */
    SPELL_CUSTOMIZATION_BODY: 'modules/spell-book/templates/dialogs/spell-details-customization.hbs',

    /** Spell details customization dialog footer with action buttons */
    SPELL_CUSTOMIZATION_FOOTER: 'modules/spell-book/templates/dialogs/settings-footer.hbs',

    /** Spell loadout management dialog for saving/loading preparations */
    SPELL_LOADOUT: 'modules/spell-book/templates/dialogs/spell-loadout.hbs',

    /** Spell notes editing dialog for adding personal notes to spells */
    SPELL_NOTES: 'modules/spell-book/templates/dialogs/spell-notes-dialog.hbs',

    /** Main spellbook settings dialog for module configuration */
    SPELLBOOK_SETTINGS: 'modules/spell-book/templates/dialogs/spellbook-settings.hbs',

    /** Wizard learn spell dialog for adding spells to wizard spellbook */
    WIZARD_LEARN_SPELL: 'modules/spell-book/templates/dialogs/wizard-learn-spell.hbs'
  },

  /**
   * Spell List Manager application templates for GM spell management.
   * @type {SpellListManagerTemplates}
   */
  SPELL_LIST_MANAGER: {
    /** Available spells panel showing spells that can be added to lists */
    AVAILABLE_SPELLS: 'modules/spell-book/templates/apps/spell-list-manager/available-spells.hbs',

    /** Application footer with save, cancel, and action buttons */
    FOOTER: 'modules/spell-book/templates/apps/spell-list-manager/footer.hbs',

    /** Selected list content panel showing spells in the current list */
    LIST_CONTENT: 'modules/spell-book/templates/apps/spell-list-manager/list-content.hbs',

    /** Main application layout template providing overall structure */
    MAIN: 'modules/spell-book/templates/apps/spell-list-manager/main.hbs',

    /** Spell lists sidebar for navigating between different spell lists */
    SPELL_LISTS: 'modules/spell-book/templates/apps/spell-list-manager/spell-lists.hbs'
  },

  /**
   * Player Spell Book application templates for the main player interface.
   * @type {PlayerSpellBookTemplates}
   */
  PLAYER_SPELL_BOOK: {
    /** Main spell container for displaying and managing spells */
    CONTAINER: 'modules/spell-book/templates/apps/player/spell-container.hbs',

    /** Application footer with spell preparation and action controls */
    FOOTER: 'modules/spell-book/templates/apps/player/footer.hbs',

    /** Application sidebar with filters, search, and navigation options */
    SIDEBAR: 'modules/spell-book/templates/apps/player/sidebar.hbs',

    /** Tab navigation for switching between different spell views */
    TAB_NAV: 'modules/spell-book/templates/apps/player/tab-navigation.hbs',

    /** Spell preparation tab for standard spellcasting classes */
    TAB_SPELLS: 'modules/spell-book/templates/apps/player/tab-spells.hbs',

    /** Wizard spellbook tab with wizard-specific features and spell management */
    TAB_WIZARD_SPELLBOOK: 'modules/spell-book/templates/apps/player/tab-wizard-spellbook.hbs'
  },

  /**
   * Troubleshooter application templates for debugging and diagnostics.
   * @type {TroubleshooterTemplates}
   */
  TROUBLESHOOTER: {
    /** Main troubleshooter interface for system diagnostics and problem resolution */
    MAIN: 'modules/spell-book/templates/apps/troubleshooter.hbs'
  },

  /**
   * Party spell coordination templates for multi-character management.
   * @type {PartySpellManagerTemplates}
   */
  PARTY_SPELL_MANAGER: {
    /** Main party spell manager interface for coordinating party spellcasting */
    MAIN: 'modules/spell-book/templates/apps/party-spell-manager/main.hbs',

    /** Spell synergy analysis for optimizing party spell selection */
    SYNERGY_ANALYSIS: 'modules/spell-book/templates/apps/party-spell-manager/synergy-analysis.hbs'
  }
};
