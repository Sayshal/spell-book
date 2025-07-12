/**
 * Core module identification and configuration constants
 * @type {Object}
 */
export const MODULE = {
  ID: 'spell-book',
  NAME: 'Spell Book',
  PACK: { SPELLS: 'spell-book.custom-spell-lists', MACROS: 'spell-book.spell-book-macros', USERDATA: 'spell-book.user-spell-data' },
  LOG_LEVEL: 0,
  ISV13: foundry.utils.isNewerVersion(game.version, '12.999'),

  /**
   * Current version of the default filter configuration
   * Increment this when you make changes to DEFAULT_FILTER_CONFIG
   */
  DEFAULT_FILTER_CONFIG_VERSION: '0.9.0',

  /**
   * Default filter configuration
   * @type {Array}
   */
  DEFAULT_FILTER_CONFIG: [
    { id: 'name', type: 'search', enabled: true, order: 10, label: 'SPELLBOOK.Filters.SearchPlaceholder', sortable: false },
    { id: 'level', type: 'dropdown', enabled: true, order: 20, label: 'SPELLBOOK.Filters.Level', sortable: true, searchAliases: ['LEVEL', 'LVL'] },
    { id: 'school', type: 'dropdown', enabled: true, order: 30, label: 'SPELLBOOK.Filters.School', sortable: true, searchAliases: ['SCHOOL'] },
    { id: 'castingTime', type: 'dropdown', enabled: true, order: 40, label: 'SPELLBOOK.Filters.CastingTime', sortable: true, searchAliases: ['CASTTIME', 'CASTING'] },
    { id: 'range', type: 'range', enabled: true, order: 50, label: 'SPELLBOOK.Filters.Range', sortable: true, searchAliases: ['RANGE'] },
    { id: 'damageType', type: 'dropdown', enabled: true, order: 60, label: 'SPELLBOOK.Filters.DamageType', sortable: true, searchAliases: ['DAMAGE', 'DMG'] },
    { id: 'condition', type: 'dropdown', enabled: true, order: 70, label: 'SPELLBOOK.Filters.Condition', sortable: true, searchAliases: ['CONDITION'] },
    { id: 'requiresSave', type: 'dropdown', enabled: true, order: 80, label: 'SPELLBOOK.Filters.RequiresSave', sortable: true, searchAliases: ['SAVE', 'REQUIRESSAVE'] },
    { id: 'concentration', type: 'dropdown', enabled: true, order: 90, label: 'SPELLBOOK.Filters.RequiresConcentration', sortable: true, searchAliases: ['CON', 'CONCENTRATION'] },
    { id: 'materialComponents', type: 'dropdown', enabled: true, order: 100, label: 'SPELLBOOK.Filters.Materials.Title', sortable: true, searchAliases: ['MATERIALS', 'COMPONENTS'] },
    { id: 'prepared', type: 'checkbox', enabled: true, order: 2000, label: 'SPELLBOOK.Filters.PreparedOnly', sortable: false, searchAliases: ['PREPARED'] },
    { id: 'ritual', type: 'checkbox', enabled: true, order: 3000, label: 'SPELLBOOK.Filters.RitualOnly', sortable: false, searchAliases: ['RITUAL'] },
    { id: 'favorited', type: 'checkbox', enabled: true, order: 4000, label: 'SPELLBOOK.Filters.FavoritedOnly', sortable: false, searchAliases: ['FAVORITED', 'FAVE', 'FAV'] }
  ],

  /**
   * Spell change behavior options
   * @type {Object}
   */
  ENFORCEMENT_BEHAVIOR: {
    ENFORCED: 'enforced',
    NOTIFY_GM: 'notifyGM',
    UNENFORCED: 'unenforced'
  },

  /**
   * Default wizard configuration values
   * @type {Object}
   */
  WIZARD_DEFAULTS: {
    RITUAL_CASTING: true,
    SPELLS_PER_LEVEL: 2,
    STARTING_SPELLS: 6
  },

  /**
   * Wizard spell source types
   * @type {Object}
   */
  WIZARD_SPELL_SOURCE: {
    COPIED: 'copied',
    FREE: 'free',
    INITIAL: 'initial',
    LEVEL_UP: 'levelUp'
  },

  /**
   * Class identifiers for spellcasting classes
   * @type {Object}
   */
  CLASS_IDENTIFIERS: {
    ARTIFICER: 'artificer',
    BARD: 'bard',
    CLERIC: 'cleric',
    DRUID: 'druid',
    PALADIN: 'paladin',
    RANGER: 'ranger',
    SORCERER: 'sorcerer',
    WARLOCK: 'warlock',
    WIZARD: 'wizard'
  },

  /**
   * Spellcasting rule set options
   * @type {Object}
   */
  RULE_SETS: {
    LEGACY: 'legacy',
    MODERN: 'modern'
  },

  /**
   * Spell swap modes (cantrips & levelled spells)
   * @type {Object}
   */
  SWAP_MODES: {
    NONE: 'none',
    LEVEL_UP: 'levelUp',
    LONG_REST: 'longRest'
  },

  /**
   * Ritual casting modes
   * @type {Object}
   */
  RITUAL_CASTING_MODES: {
    NONE: 'none',
    PREPARED: 'prepared',
    ALWAYS: 'always'
  },

  /**
   * Batching configuration for lazy loading
   * @type {Object}
   */
  BATCHING: {
    SIZE: 30,
    MARGIN: 100
  }
};

/**
 * Deprecated flags that should be removed during migration
 * Each entry should include the flag name and reason for deprecation
 * @type {Array<{key: string, reason: string, removedInVersion?: string}>}
 */
export const DEPRECATED_FLAGS = [];

/**
 * Flags used for data storage and state tracking
 * @type {Object}
 */
export const FLAGS = {
  CANTRIP_SWAP_TRACKING: 'cantripSwapTracking',
  CLASS_RULES: 'classRules',
  COLLAPSED_FOLDERS: 'collapsedFolders',
  COLLAPSED_LEVELS: 'collapsedSpellLevels',
  ENFORCEMENT_BEHAVIOR: 'enforcementBehavior',
  LONG_REST_COMPLETED: 'longRestCompleted',
  GM_COLLAPSED_LEVELS: 'gmCollapsedSpellLevels',
  PREPARED_SPELLS_BY_CLASS: 'preparedSpellsByClass',
  PREPARED_SPELLS: 'preparedSpells',
  PREVIOUS_CANTRIP_MAX: 'previousCantripMax',
  PREVIOUS_LEVEL: 'previousLevel',
  RECENT_SEARCHES: 'recentSearches',
  RULE_SET_OVERRIDE: 'ruleSetOverride',
  SIDEBAR_COLLAPSED: 'sidebarCollapsed',
  SPELL_LOADOUTS: 'spellLoadouts',
  SWAP_TRACKING: 'swapTracking',
  WIZARD_COPIED_SPELLS: 'wizardCopiedSpells',
  WIZARD_RITUAL_CASTING: 'wizardRitualCasting'
};

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
    MIGRATION_REPORT: 'modules/spell-book/templates/components/migration-report.hbs',
    MIGRATION_USER_DATA: 'modules/spell-book/templates/components/migration-user-data-results.hbs',
    SPELL_LEVEL: 'modules/spell-book/templates/components/spell-level.hbs',
    USER_DATA_INTRO: 'modules/spell-book/templates/components/user-data-intro.hbs',
    USER_SPELL_DATA_EMPTY: 'modules/spell-book/templates/components/user-spell-data-empty.hbs',
    USER_SPELL_DATA_TABLES: 'modules/spell-book/templates/components/user-spell-data-tables.hbs'
  },
  DIALOGS: {
    ANALYTICS_IMPORT_SUMMARY: 'modules/spell-book/templates/dialogs/analytics-import-summary.hbs',
    CREATE_SPELL_LIST: 'modules/spell-book/templates/dialogs/create-spell-list.hbs',
    FILTER_CONFIG: 'modules/spell-book/templates/dialogs/filter-configuration.hbs',
    LEARN_FROM_SCROLL: 'modules/spell-book/templates/dialogs/learn-from-scroll.hbs',
    LONG_REST_SWAP: 'modules/spell-book/templates/dialogs/long-rest-swap.hbs',
    MANAGER_DOCUMENTATION: 'modules/spell-book/templates/dialogs/spell-list-manager-documentation.hbs',
    MERGE_SPELL_LISTS: 'modules/spell-book/templates/dialogs/merge-spell-lists.hbs',
    RENAME_SPELL_LIST: `modules/spell-book/templates/dialogs/rename-spell-list.hbs`,
    SCROLL_SCANNER_RESULTS: 'modules/spell-book/templates/dialogs/scroll-scanner-results.hbs',
    SPELL_COMPARISON: 'modules/spell-book/templates/dialogs/spell-comparison.hbs',
    SPELL_LOADOUT: 'modules/spell-book/templates/dialogs/spell-loadout.hbs',
    SPELL_NOTES: 'modules/spell-book/templates/dialogs/spell-notes-dialog.hbs',
    SPELLBOOK_SETTINGS: 'modules/spell-book/templates/dialogs/spellbook-settings.hbs',
    WIZARD_LEARN_SPELL: 'modules/spell-book/templates/dialogs/wizard-learn-spell.hbs'
  },
  GM: {
    AVAILABLE_SPELLS: 'modules/spell-book/templates/gm/available-spells.hbs',
    FOOTER: 'modules/spell-book/templates/gm/footer.hbs',
    LIST_CONTENT: 'modules/spell-book/templates/gm/list-content.hbs',
    MAIN: 'modules/spell-book/templates/gm/manager.hbs',
    SPELL_LISTS: 'modules/spell-book/templates/gm/spell-lists.hbs'
  },
  PLAYER: {
    CONTAINER: 'modules/spell-book/templates/player/spell-container.hbs',
    FOOTER: 'modules/spell-book/templates/player/footer.hbs',
    SIDEBAR: 'modules/spell-book/templates/player/sidebar.hbs',
    TAB_NAV: 'modules/spell-book/templates/player/tab-navigation.hbs',
    TAB_SPELLS: 'modules/spell-book/templates/player/tab-spells.hbs',
    TAB_WIZARD_SPELLBOOK: 'modules/spell-book/templates/player/tab-wizard-spellbook.hbs'
  }
};

/**
 * Settings keys used by the module
 * @type {Object}
 */
export const SETTINGS = {
  ADVANCED_SEARCH_PREFIX: 'advancedSearchPrefix',
  CANTRIP_SCALE_VALUES: 'cantripScaleValues',
  CONSUME_SCROLLS_WHEN_LEARNING: 'consumeScrollsWhenLearning',
  CUSTOM_SPELL_MAPPINGS: 'customSpellListMappings',
  DEFAULT_ENFORCEMENT_BEHAVIOR: 'defaultEnforcementBehavior',
  DISABLE_LONG_REST_SWAP_PROMPT: 'disableLongRestSwapPrompt',
  DISTANCE_UNIT: 'distanceUnit',
  ENABLE_JOURNAL_BUTTON: 'enableJournalButton',
  ENABLE_SPELL_USAGE_TRACKING: 'enableSpellUsageTracking',
  FILTER_CONFIGURATION: 'filterConfiguration',
  HIDDEN_SPELL_LISTS: 'hiddenSpellLists',
  LAZY_BATCH_SIZE: 'lazyBatchSize',
  LOGGING_LEVEL: 'loggingLevel',
  OPEN_SPELL_MANAGER: 'openSpellListManager',
  SPELL_BOOK_POSITION: 'spellBookPositionn',
  SPELL_COMPARISON_MAX: 'spellComparisonMax',
  SPELL_NOTES_DESC_INJECTION: 'injectNotesIntoDescriptions',
  SPELL_NOTES_LENGTH: 'spellNotesMaxLength',
  SPELLCASTING_RULE_SET: 'spellcastingRuleSet'
};
