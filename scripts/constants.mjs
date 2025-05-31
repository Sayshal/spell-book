/**
 * Core module identification and configuration constants
 * @type {Object}
 */
export const MODULE = {
  ID: 'spell-book',
  NAME: 'Spell Book',
  PACK: 'spell-book.custom-spell-lists',
  LOG_LEVEL: 0,

  /**
   * Default filter configuration
   * @type {Array}
   */
  DEFAULT_FILTER_CONFIG: [
    {
      id: 'name',
      type: 'search',
      enabled: true,
      order: 10,
      label: 'SPELLBOOK.Filters.SearchPlaceholder',
      sortable: false
    },
    {
      id: 'level',
      type: 'dropdown',
      enabled: true,
      order: 20,
      label: 'SPELLBOOK.Filters.Level',
      sortable: true
    },
    {
      id: 'school',
      type: 'dropdown',
      enabled: true,
      order: 30,
      label: 'SPELLBOOK.Filters.School',
      sortable: true
    },
    {
      id: 'castingTime',
      type: 'dropdown',
      enabled: true,
      order: 40,
      label: 'SPELLBOOK.Filters.CastingTime',
      sortable: true
    },
    {
      id: 'range',
      type: 'range',
      enabled: true,
      order: 50,
      label: 'SPELLBOOK.Filters.Range',
      sortable: true
    },
    {
      id: 'damageType',
      type: 'dropdown',
      enabled: true,
      order: 60,
      label: 'SPELLBOOK.Filters.DamageType',
      sortable: true
    },
    {
      id: 'condition',
      type: 'dropdown',
      enabled: true,
      order: 70,
      label: 'SPELLBOOK.Filters.Condition',
      sortable: true
    },
    {
      id: 'requiresSave',
      type: 'dropdown',
      enabled: true,
      order: 80,
      label: 'SPELLBOOK.Filters.RequiresSave',
      sortable: true
    },
    {
      id: 'concentration',
      type: 'dropdown',
      enabled: true,
      order: 90,
      label: 'SPELLBOOK.Filters.RequiresConcentration',
      sortable: true
    },
    {
      id: 'materialComponents',
      type: 'dropdown',
      enabled: true,
      order: 100,
      label: 'SPELLBOOK.Filters.MaterialComponents.Title',
      sortable: true
    },
    {
      id: 'sortBy',
      type: 'dropdown',
      enabled: true,
      order: 1000,
      label: 'SPELLBOOK.Filters.SortBy',
      sortable: false
    },
    {
      id: 'prepared',
      type: 'checkbox',
      enabled: true,
      order: 2000,
      label: 'SPELLBOOK.Filters.PreparedOnly',
      sortable: false
    },
    {
      id: 'ritual',
      type: 'checkbox',
      enabled: true,
      order: 3000,
      label: 'SPELLBOOK.Filters.RitualOnly',
      sortable: false
    }
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
  }
};

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
  FORCE_WIZARD_MODE: 'forceWizardMode',
  GM_COLLAPSED_LEVELS: 'gmCollapsedSpellLevels',
  PREPARED_SPELLS_BY_CLASS: 'preparedSpellsByClass',
  PREPARED_SPELLS: 'preparedSpells',
  PREVIOUS_CANTRIP_MAX: 'previousCantripMax',
  PREVIOUS_LEVEL: 'previousLevel',
  RULE_SET_OVERRIDE: 'ruleSetOverride',
  SIDEBAR_COLLAPSED: 'sidebarCollapsed',
  SWAP_TRACKING: 'swapTracking',
  WIZARD_COPIED_SPELLS: 'wizardCopiedSpells',
  WIZARD_RITUAL_CASTING: 'wizardRitualCasting'
};

/**
 * Handlebars template paths used by the module
 * @type {Object}
 */
export const TEMPLATES = {
  COMPONENTS: {
    EMPTY: 'modules/spell-book/templates/components/empty-state.hbs',
    ERROR: 'modules/spell-book/templates/components/error-message.hbs',
    LOADING: 'modules/spell-book/templates/components/loading-spinner.hbs',
    SPELL_ITEM: 'modules/spell-book/templates/components/spell-item.hbs',
    SPELL_LEVEL: 'modules/spell-book/templates/components/spell-level.hbs'
  },
  DIALOGS: {
    CREATE_SPELL_LIST: 'modules/spell-book/templates/dialogs/create-spell-list.hbs',
    FILTER_CONFIG: 'modules/spell-book/templates/dialogs/filter-configuration.hbs',
    MANAGER_DOCUMENTATION: 'modules/spell-book/templates/dialogs/spell-list-manager-documentation.hbs',
    SPELLBOOK_SETTINGS: 'modules/spell-book/templates/dialogs/spellbook-settings.hbs'
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
  CANTRIP_SCALE_VALUES: 'cantripScaleValues',
  CUSTOM_SPELL_MAPPINGS: 'customSpellListMappings',
  DEFAULT_ENFORCEMENT_BEHAVIOR: 'defaultEnforcementBehavior',
  DISABLE_LONG_REST_SWAP_PROMPT: 'disableLongRestSwapPrompt',
  DISTANCE_UNIT: 'distanceUnit',
  ENABLE_JOURNAL_BUTTON: 'enableJournalButton',
  FILTER_CONFIGURATION: 'filterConfiguration',
  LOGGING_LEVEL: 'loggingLevel',
  OPEN_SPELL_MANAGER: 'openSpellListManager',
  RUN_MIGRATIONS: 'runMigrations',
  SPELL_BOOK_POSITION: 'spellBookPositionn',
  SPELLCASTING_RULE_SET: 'spellcastingRuleSet'
};

/**
 * Sort options for spell display
 * @type {Object}
 */
export const SORT_BY = {
  LEVEL: 'level',
  NAME: 'name',
  PREPARED: 'prepared',
  SCHOOL: 'school'
};
