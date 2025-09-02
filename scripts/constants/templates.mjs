/**
 * Handlebars template paths used by the module
 * @type {Object}
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
