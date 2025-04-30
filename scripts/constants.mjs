/**
 * Constants for the Spell Book module
 * @module spell-book/constants
 */

/**
 * Core module identification and configuration constants
 * @type {Object}
 */
export const MODULE = {
  /**
   * Unique identifier for the module
   * @type {string}
   * @example 'spell-book'
   */
  ID: 'spell-book',

  /**
   * Display name of the module
   * @type {string}
   * @example 'Spell Book'
   */
  NAME: 'Spell Book',

  /**
   * Flags used for data storage and state tracking
   * @type {Object}
   */
  FLAGS: {
    /**
     * Flag name for storing prepared spells on an actor
     * @type {string}
     */
    PREPARED_SPELLS: 'preparedSpells',

    /**
     * Flag name for storing collapsed spell levels in UI
     * @type {string}
     */
    COLLAPSED_LEVELS: 'collapsedSpellLevels',

    /**
     * Flag name for sidebar collapsed state
     * @type {string}
     */
    SIDEBAR_COLLAPSED: 'sidebarCollapsed'
  },

  /**
   * Handlebars template paths used by the module
   * @type {Object}
   */
  TEMPLATES: {
    /**
     * Main spell book content template
     * @type {string}
     */
    SPELL_BOOK_CONTENT: 'modules/spell-book/templates/spell-book.hbs',

    /**
     * Sidebar template for filters
     * @type {string}
     */
    SPELL_BOOK_SIDEBAR: 'modules/spell-book/templates/spell-book-sidebar.hbs',

    /**
     * Spell list template
     * @type {string}
     */
    SPELL_BOOK_LIST: 'modules/spell-book/templates/spell-book-list.hbs',

    /**
     * Footer template with action buttons
     * @type {string}
     */
    SPELL_BOOK_FOOTER: 'modules/spell-book/templates/spell-book-footer.hbs',

    /**
     * Filter configuration template
     * @type {string}
     */
    FILTER_CONFIG: 'modules/spell-book/templates/player-filter-configuration.hbs',
    GM_SPELL_LIST_MANAGER: 'modules/spell-book/templates/gm-spell-list-manager.hbs',
    GM_SPELL_LIST_MANAGER_LEFT: 'modules/spell-book/templates/gm-spell-list-manager-left.hbs',
    GM_SPELL_LIST_MANAGER_MIDDLE: 'modules/spell-book/templates/gm-spell-list-manager-middle.hbs',
    GM_SPELL_LIST_MANAGER_RIGHT: 'modules/spell-book/templates/gm-spell-list-manager-right.hbs',
    GM_SPELL_LIST_MANAGER_FOOTER: 'modules/spell-book/templates/gm-spell-list-manager-footer.hbs'
  },

  /**
   * Logging level for the module
   * 0 = none, 1 = errors, 2 = warnings, 3 = verbose
   * @type {number}
   */
  LOG_LEVEL: 0,

  /**
   * Collections of spellcasting classes categorized by type
   * Populated during initialization
   * @type {Object}
   */
  SPELLCASTING_CLASSES: {
    /**
     * Classes with "known" spell progression
     * @type {Array}
     */
    KNOWN: [],

    /**
     * Classes with "pact" spell progression
     * @type {Array}
     */
    PACT: []
  },

  /**
   * Cache for storing frequently accessed data
   * @type {Object}
   */
  CACHE: {
    /**
     * Cached spell data by actor/level
     * @type {Object}
     */
    spellData: {},

    /**
     * Timestamp of when spell data was cached
     * @type {Object}
     */
    spellDataTime: {},

    /**
     * Fully processed spell data ready for display
     * @type {Object}
     */
    processedData: {}
  }
};

/**
 * Settings keys used by the module
 * @type {Object}
 */
export const SETTINGS_KEYS = {
  /**
   * Logging level setting key
   * @type {string}
   */
  LOGGING_LEVEL: 'loggingLevel',

  /**
   * Rest prompt setting key
   * @type {string}
   */
  ENABLE_REST_PROMPT: 'enableRestPrompt',

  /**
   * Distance unit setting key
   * @type {string}
   */
  DISTANCE_UNIT: 'distanceUnit',

  /**
   * Filter configuration setting key
   * @type {string}
   */
  FILTER_CONFIGURATION: 'filterConfiguration'
};

/**
 * Filter types used in configuration
 * @type {Object}
 */
export const FILTER_TYPES = {
  SEARCH: 'search',
  DROPDOWN: 'dropdown',
  CHECKBOX: 'checkbox',
  RANGE: 'range'
};

/**
 * Sort options for spell display
 * @type {Object}
 */
export const SORT_BY = {
  LEVEL: 'level',
  NAME: 'name',
  SCHOOL: 'school',
  PREPARED: 'prepared'
};

/**
 * Default filter configuration
 * Defines all available filters and their initial state
 * @type {Array}
 */
export const DEFAULT_FILTER_CONFIG = [
  {
    id: 'name',
    type: FILTER_TYPES.SEARCH,
    enabled: true,
    order: 10,
    label: 'SPELLBOOK.Filters.SearchPlaceholder',
    sortable: false // Keep search at the top
  },
  {
    id: 'level',
    type: FILTER_TYPES.DROPDOWN,
    enabled: true,
    order: 20,
    label: 'SPELLBOOK.Filters.Level',
    sortable: true
  },
  {
    id: 'school',
    type: FILTER_TYPES.DROPDOWN,
    enabled: true,
    order: 30,
    label: 'SPELLBOOK.Filters.School',
    sortable: true
  },
  {
    id: 'castingTime',
    type: FILTER_TYPES.DROPDOWN,
    enabled: true,
    order: 40,
    label: 'SPELLBOOK.Filters.CastingTime',
    sortable: true
  },
  {
    id: 'range',
    type: FILTER_TYPES.RANGE,
    enabled: true,
    order: 50,
    label: 'SPELLBOOK.Filters.Range',
    sortable: true
  },
  {
    id: 'damageType',
    type: FILTER_TYPES.DROPDOWN,
    enabled: true,
    order: 60,
    label: 'SPELLBOOK.Filters.DamageType',
    sortable: true
  },
  {
    id: 'condition',
    type: FILTER_TYPES.DROPDOWN,
    enabled: true,
    order: 70,
    label: 'SPELLBOOK.Filters.Condition',
    sortable: true
  },
  {
    id: 'requiresSave',
    type: FILTER_TYPES.DROPDOWN,
    enabled: true,
    order: 80,
    label: 'SPELLBOOK.Filters.RequiresSave',
    sortable: true
  },
  {
    id: 'concentration',
    type: FILTER_TYPES.DROPDOWN,
    enabled: true,
    order: 90,
    label: 'SPELLBOOK.Filters.RequiresConcentration',
    sortable: true
  },
  {
    id: 'sortBy',
    type: FILTER_TYPES.DROPDOWN,
    enabled: true,
    order: 1000,
    label: 'SPELLBOOK.Filters.SortBy',
    sortable: false // Keep sort option at the bottom
  },
  {
    id: 'prepared',
    type: FILTER_TYPES.CHECKBOX,
    enabled: true,
    order: 2000,
    label: 'SPELLBOOK.Filters.PreparedOnly',
    sortable: false // Keep checkboxes at the bottom
  },
  {
    id: 'ritual',
    type: FILTER_TYPES.CHECKBOX,
    enabled: true,
    order: 3000,
    label: 'SPELLBOOK.Filters.RitualOnly',
    sortable: false // Keep checkboxes at the bottom
  }
];

/**
 * Cache settings
 * @type {Object}
 */
export const CACHE_CONFIG = {
  /**
   * How long to keep cached data in milliseconds (5 minutes)
   * @type {number}
   */
  TTL: 5 * 60 * 1000
};
