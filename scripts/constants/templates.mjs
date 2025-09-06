/**
 * Complete template path configuration for the Spell Book module
 * @typedef {Object} TemplateConfig
 * @property {AnalyticsTemplates} ANALYTICS Template paths for analytics dashboard
 * @property {ComponentTemplates} COMPONENTS Reusable component template paths
 * @property {DialogTemplates} DIALOGS Dialog application template paths
 * @property {SpellListManagerTemplates} SPELL_LIST_MANAGER Spell List Manager application templates
 * @property {PlayerSpellBookTemplates} PLAYER_SPELL_BOOK Player Spell Book application templates
 * @property {TroubleshooterTemplates} TROUBLESHOOTER Troubleshooter application templates
 * @property {PartySpellManagerTemplates} PARTY_SPELL_MANAGER Party spell coordination templates
 */

/**
 * Analytics dashboard template paths
 * @typedef {Object} AnalyticsTemplates
 * @property {string} DASHBOARD Main analytics dashboard template
 */

/**
 * Reusable component template paths
 * @typedef {Object} ComponentTemplates
 * @property {string} CANTRIP_NOTIFICATION GM notification template for cantrip changes
 * @property {string} EMPTY Empty state component template
 * @property {string} ERROR Error message component template
 * @property {string} LOADING Loading spinner component template
 * @property {string} MIGRATION_ACTORS Migration results actor list template
 * @property {string} MIGRATION_FOLDER Migration results folder template
 * @property {string} MIGRATION_OWNERSHIP Migration results ownership template
 * @property {string} MIGRATION_REPORT Migration results summary template
 * @property {string} MIGRATION_USER_DATA Migration results user data template
 * @property {string} SPELL_LEVEL Spell level grouping component template
 * @property {string} USER_DATA_INTRO User data introduction template
 * @property {string} USER_SPELL_DATA_EMPTY Empty user spell data template
 * @property {string} USER_SPELL_DATA_TABLES User spell data tables template
 */

/**
 * Dialog application template paths
 * @typedef {Object} DialogTemplates
 * @property {string} ANALYTICS_IMPORT_SUMMARY Analytics data import summary dialog
 * @property {string} COMPENDIUM_SELECTION Compendium selection dialog template
 * @property {string} CREATE_SPELL_LIST Create new spell list dialog template
 * @property {string} FILTER_CONFIG Filter configuration dialog template
 * @property {string} FOCUS_SETTINGS Spellcasting focus settings dialog template
 * @property {string} LEARN_FROM_SCROLL Learn spell from scroll dialog template
 * @property {string} LONG_REST_SWAP Long rest spell swap dialog template
 * @property {string} MANAGER_DOCUMENTATION Spell List Manager documentation dialog
 * @property {string} MERGE_SPELL_LISTS Merge spell lists dialog template
 * @property {string} PARTY_SPELL_ANALYSIS Party spell analysis dialog template
 * @property {string} RENAME_SPELL_LIST Rename spell list dialog template
 * @property {string} SCROLL_SCANNER_RESULTS Scroll scanner results dialog template
 * @property {string} SPELL_COMPARISON Spell comparison dialog template
 * @property {string} SPELL_CUSTOMIZATION_BODY Spell details customization dialog body
 * @property {string} SPELL_CUSTOMIZATION_FOOTER Spell details customization dialog footer
 * @property {string} SPELL_LOADOUT Spell loadout management dialog template
 * @property {string} SPELL_NOTES Spell notes editing dialog template
 * @property {string} SPELLBOOK_SETTINGS Main spellbook settings dialog template
 * @property {string} WIZARD_LEARN_SPELL Wizard learn spell dialog template
 */

/**
 * Spell List Manager application template paths
 * @typedef {Object} SpellListManagerTemplates
 * @property {string} AVAILABLE_SPELLS Available spells panel template
 * @property {string} FOOTER Application footer template
 * @property {string} LIST_CONTENT Selected list content panel template
 * @property {string} MAIN Main application layout template
 * @property {string} SPELL_LISTS Spell lists sidebar template
 */

/**
 * Player Spell Book application template paths
 * @typedef {Object} PlayerSpellBookTemplates
 * @property {string} CONTAINER Main spell container template
 * @property {string} FOOTER Application footer template
 * @property {string} SIDEBAR Application sidebar template
 * @property {string} TAB_NAV Tab navigation template
 * @property {string} TAB_SPELLS Spell preparation tab template
 * @property {string} TAB_WIZARD_SPELLBOOK Wizard spellbook tab template
 */

/**
 * Troubleshooter application template paths
 * @typedef {Object} TroubleshooterTemplates
 * @property {string} MAIN Main troubleshooter interface template
 */

/**
 * Party spell coordination template paths
 * @typedef {Object} PartySpellManagerTemplates
 * @property {string} MAIN Main party spell manager template
 * @property {string} SYNERGY_ANALYSIS Spell synergy analysis template
 */

/**
 * Handlebars template paths used throughout the Spell Book module.
 * These paths are used with Foundry's renderTemplate() function to render
 * application interfaces, dialogs, and reusable components.
 *
 * All paths are relative to the Foundry VTT data directory and point to
 * .hbs (Handlebars) template files within the module's templates folder.
 * @type {TemplateConfig}
 */
export const TEMPLATES = {
  ANALYTICS: {
    DASHBOARD: 'modules/spell-book/templates/analytics/dashboard.hbs'
  },

  COMPONENTS: {
    CANTRIP_NOTIFICATION: 'modules/spell-book/templates/components/cantrip-notification.hbs',
    EMPTY: 'modules/spell-book/templates/components/empty-state.hbs',
    ERROR: 'modules/spell-book/templates/components/error-message.hbs',
    LOADING: 'modules/spell-book/templates/components/loading-spinner.hbs',
    MIGRATION_ACTORS: 'modules/spell-book/templates/components/migration-actor-list.hbs',
    MIGRATION_FOLDER: 'modules/spell-book/templates/components/migration-folder-results.hbs',
    MIGRATION_OWNERSHIP: 'modules/spell-book/templates/components/migration-ownership-results.hbs',
    MIGRATION_REPORT: 'modules/spell-book/templates/components/migration-report.hbs',
    MIGRATION_USER_DATA: 'modules/spell-book/templates/components/migration-user-data-results.hbs',
    SPELL_LEVEL: 'modules/spell-book/templates/components/spell-level.hbs',
    USER_DATA_INTRO: 'modules/spell-book/templates/components/user-data-intro.hbs',
    USER_SPELL_DATA_EMPTY: 'modules/spell-book/templates/components/user-spell-data-empty.hbs',
    USER_SPELL_DATA_TABLES: 'modules/spell-book/templates/components/user-spell-data-tables.hbs'
  },

  DIALOGS: {
    ANALYTICS_IMPORT_SUMMARY: 'modules/spell-book/templates/dialogs/analytics-import-summary.hbs',
    COMPENDIUM_SELECTION: 'modules/spell-book/templates/dialogs/compendium-selection.hbs',
    CREATE_SPELL_LIST: 'modules/spell-book/templates/dialogs/create-spell-list.hbs',
    FILTER_CONFIG: 'modules/spell-book/templates/dialogs/filter-configuration.hbs',
    FOCUS_SETTINGS: 'modules/spell-book/templates/dialogs/focus-settings.hbs',
    LEARN_FROM_SCROLL: 'modules/spell-book/templates/dialogs/learn-from-scroll.hbs',
    LONG_REST_SWAP: 'modules/spell-book/templates/dialogs/long-rest-swap.hbs',
    MANAGER_DOCUMENTATION: 'modules/spell-book/templates/dialogs/spell-list-manager-documentation.hbs',
    MERGE_SPELL_LISTS: 'modules/spell-book/templates/dialogs/merge-spell-lists.hbs',
    PARTY_SPELL_ANALYSIS: 'modules/spell-book/templates/dialogs/party-spell-analysis.hbs',
    RENAME_SPELL_LIST: 'modules/spell-book/templates/dialogs/rename-spell-list.hbs',
    SCROLL_SCANNER_RESULTS: 'modules/spell-book/templates/dialogs/scroll-scanner-results.hbs',
    SPELL_COMPARISON: 'modules/spell-book/templates/dialogs/spell-comparison.hbs',
    SPELL_CUSTOMIZATION_BODY: 'modules/spell-book/templates/dialogs/spell-details-customization.hbs',
    SPELL_CUSTOMIZATION_FOOTER: 'modules/spell-book/templates/dialogs/settings-footer.hbs',
    SPELL_LOADOUT: 'modules/spell-book/templates/dialogs/spell-loadout.hbs',
    SPELL_NOTES: 'modules/spell-book/templates/dialogs/spell-notes-dialog.hbs',
    SPELLBOOK_SETTINGS: 'modules/spell-book/templates/dialogs/spellbook-settings.hbs',
    WIZARD_LEARN_SPELL: 'modules/spell-book/templates/dialogs/wizard-learn-spell.hbs'
  },

  SPELL_LIST_MANAGER: {
    AVAILABLE_SPELLS: 'modules/spell-book/templates/apps/spell-list-manager/available-spells.hbs',
    FOOTER: 'modules/spell-book/templates/apps/spell-list-manager/footer.hbs',
    LIST_CONTENT: 'modules/spell-book/templates/apps/spell-list-manager/list-content.hbs',
    MAIN: 'modules/spell-book/templates/apps/spell-list-manager/main.hbs',
    SPELL_LISTS: 'modules/spell-book/templates/apps/spell-list-manager/spell-lists.hbs'
  },

  PLAYER_SPELL_BOOK: {
    CONTAINER: 'modules/spell-book/templates/apps/player/spell-container.hbs',
    FOOTER: 'modules/spell-book/templates/apps/player/footer.hbs',
    SIDEBAR: 'modules/spell-book/templates/apps/player/sidebar.hbs',
    TAB_NAV: 'modules/spell-book/templates/apps/player/tab-navigation.hbs',
    TAB_SPELLS: 'modules/spell-book/templates/apps/player/tab-spells.hbs',
    TAB_WIZARD_SPELLBOOK: 'modules/spell-book/templates/apps/player/tab-wizard-spellbook.hbs'
  },

  TROUBLESHOOTER: {
    MAIN: 'modules/spell-book/templates/apps/troubleshooter.hbs'
  },

  PARTY_SPELL_MANAGER: {
    MAIN: 'modules/spell-book/templates/apps/party-spell-manager/main.hbs',
    SYNERGY_ANALYSIS: 'modules/spell-book/templates/apps/party-spell-manager/synergy-analysis.hbs'
  }
};
