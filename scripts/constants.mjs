/**
 * Constants for the Spell Book module
 * @module spell-book/constants
 */

//-----------------------------------------------------------------------------
// CORE MODULE IDENTIFICATION
//-----------------------------------------------------------------------------

/**
 * Core module identification and configuration constants
 * @type {Object}
 */
export const MODULE = {
  /**
   * Unique identifier for the module
   * @type {string}
   */
  ID: 'spell-book',

  /**
   * Display name of the module
   * @type {string}
   */
  NAME: 'Spell Book',

  /**
   * Logging level for the module
   * 0 = none, 1 = errors, 2 = warnings, 3 = verbose
   * @type {number}
   */
  LOG_LEVEL: 0
};

//-----------------------------------------------------------------------------
// FLAGS
//-----------------------------------------------------------------------------

/**
 * Flags used for data storage and state tracking
 * @type {Object}
 */
export const FLAGS = {
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
};

//-----------------------------------------------------------------------------
// TEMPLATE PATHS
//-----------------------------------------------------------------------------

/**
 * Handlebars template paths used by the module
 * @type {Object}
 */
export const TEMPLATES = {
  PLAYER: {
    MAIN: 'modules/spell-book/templates/player/spell-book.hbs',
    SIDEBAR: 'modules/spell-book/templates/player/sidebar.hbs',
    SPELL_LIST: 'modules/spell-book/templates/player/spell-list.hbs',
    FOOTER: 'modules/spell-book/templates/player/footer.hbs'
  },

  GM: {
    MAIN: 'modules/spell-book/templates/gm/manager.hbs',
    SPELL_LISTS: 'modules/spell-book/templates/gm/spell-lists.hbs',
    LIST_CONTENT: 'modules/spell-book/templates/gm/list-content.hbs',
    AVAILABLE_SPELLS: 'modules/spell-book/templates/gm/available-spells.hbs',
    FOOTER: 'modules/spell-book/templates/gm/footer.hbs'
  },

  COMPONENTS: {
    LOADING: 'modules/spell-book/templates/components/loading-spinner.hbs',
    ERROR: 'modules/spell-book/templates/components/error-message.hbs',
    EMPTY: 'modules/spell-book/templates/components/empty-state.hbs',
    SPELL_LEVEL: 'modules/spell-book/templates/components/spell-level.hbs',
    SPELL_ITEM: 'modules/spell-book/templates/components/spell-item.hbs',
    FILTERS: {
      SEARCH: 'modules/spell-book/templates/components/filter-fields/search.hbs',
      DROPDOWN: 'modules/spell-book/templates/components/filter-fields/dropdown.hbs',
      RANGE: 'modules/spell-book/templates/components/filter-fields/range.hbs',
      CHECKBOX: 'modules/spell-book/templates/components/filter-fields/checkbox.hbs'
    }
  },

  DIALOGS: {
    FILTER_CONFIG: 'modules/spell-book/templates/dialogs/filter-configuration.hbs',
    CREATE_SPELL_LIST: 'modules/spell-book/templates/dialogs/create-spell-list.hbs'
  }
};

//-----------------------------------------------------------------------------
// SETTINGS
//-----------------------------------------------------------------------------

/**
 * Settings keys used by the module
 * @type {Object}
 */
export const SETTINGS = {
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
  FILTER_CONFIGURATION: 'filterConfiguration',

  /**
   * Custom spell list mappings setting key
   * @type {string}
   */
  CUSTOM_SPELL_MAPPINGS: 'customSpellListMappings'
};

//-----------------------------------------------------------------------------
// FILTER CONFIGURATION
//-----------------------------------------------------------------------------

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
  // Search filter (always at top)
  {
    id: 'name',
    type: FILTER_TYPES.SEARCH,
    enabled: true,
    order: 10,
    label: 'SPELLBOOK.Filters.SearchPlaceholder',
    sortable: false
  },

  // Dropdown filters (middle)
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

  // Sort options (always at bottom)
  {
    id: 'sortBy',
    type: FILTER_TYPES.DROPDOWN,
    enabled: true,
    order: 1000,
    label: 'SPELLBOOK.Filters.SortBy',
    sortable: false
  },

  // Checkbox filters (always at bottom)
  {
    id: 'prepared',
    type: FILTER_TYPES.CHECKBOX,
    enabled: true,
    order: 2000,
    label: 'SPELLBOOK.Filters.PreparedOnly',
    sortable: false
  },
  {
    id: 'ritual',
    type: FILTER_TYPES.CHECKBOX,
    enabled: true,
    order: 3000,
    label: 'SPELLBOOK.Filters.RitualOnly',
    sortable: false
  }
];
