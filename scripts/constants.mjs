/**
 * Core module identification and configuration constants
 * @type {Object}
 */
export const MODULE = {
  ID: 'spell-book',
  NAME: 'Spell Book',
  PACK: 'spell-book.custom-spell-lists',
  LOG_LEVEL: 0
};

/**
 * Flags used for data storage and state tracking
 * @type {Object}
 */
export const FLAGS = {
  CANTRIP_RULES: 'cantripRules',
  CANTRIP_SWAP_TRACKING: 'cantripSwapTracking',
  COLLAPSED_FOLDERS: 'collapsedFolders',
  COLLAPSED_LEVELS: 'collapsedSpellLevels',
  ENFORCEMENT_BEHAVIOR: 'enforcementBehavior',
  FORCE_WIZARD_MODE: 'forceWizardMode',
  GM_COLLAPSED_LEVELS: 'gmCollapsedSpellLevels',
  PREPARED_SPELLS: 'preparedSpells',
  PREVIOUS_CANTRIP_MAX: 'previousCantripMax',
  PREVIOUS_LEVEL: 'previousLevel',
  SIDEBAR_COLLAPSED: 'sidebarCollapsed',
  WIZARD_COPIED_SPELLS: 'wizardCopiedSpells',
  WIZARD_LEARNED_SPELLS: 'wizardLearnedSpells',
  WIZARD_LONG_REST_TRACKING: 'wizardLongRestTracking',
  WIZARD_SPELLBOOK: 'wizardSpellbook'
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
  CUSTOM_SPELL_MAPPINGS: 'customSpellListMappings',
  DEFAULT_CANTRIP_RULES: 'defaultCantripRules',
  DEFAULT_ENFORCEMENT_BEHAVIOR: 'defaultEnforcementBehavior',
  DISABLE_CANTRIP_SWAP_PROMPT: 'disableCantripSwapPrompt',
  DISTANCE_UNIT: 'distanceUnit',
  ENABLE_JOURNAL_BUTTON: 'enableJournalButton',
  ENABLE_REST_PROMPT: 'enableRestPrompt',
  FILTER_CONFIGURATION: 'filterConfiguration',
  LOGGING_LEVEL: 'loggingLevel',
  OPEN_SPELL_MANAGER: 'openSpellListManager',
  RUN_MIGRATIONS: 'runMigrations'
};

/**
 * Filter types used in configuration
 * @type {Object}
 */
export const FILTER_TYPES = {
  CHECKBOX: 'checkbox',
  DROPDOWN: 'dropdown',
  RANGE: 'range',
  SEARCH: 'search'
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

/**
 * Default filter configuration
 * @type {Array}
 */
export const DEFAULT_FILTER_CONFIG = [
  {
    id: 'name',
    type: FILTER_TYPES.SEARCH,
    enabled: true,
    order: 10,
    label: 'SPELLBOOK.Filters.SearchPlaceholder',
    sortable: false
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
    sortable: false
  },
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

/**
 * Cantrip rules options
 * @type {Object}
 */
export const CANTRIP_RULES = {
  LEGACY: 'legacy',
  MODERN_LEVEL_UP: 'levelUp',
  MODERN_LONG_REST: 'longRest'
};

/**
 * Cantrip change behavior options
 * @type {Object}
 */
export const ENFORCEMENT_BEHAVIOR = {
  ENFORCED: 'enforced',
  NOTIFY_GM: 'notifyGM',
  UNENFORCED: 'unenforced'
};

/**
 * Default wizard configuration values
 * @type {Object}
 */
export const WIZARD_DEFAULTS = {
  RITUAL_CASTING: true,
  SPELLS_PER_LEVEL: 2,
  STARTING_SPELLS: 6
};

/**
 * Wizard spell source types
 * @type {Object}
 */
export const WIZARD_SPELL_SOURCE = {
  COPIED: 'copied',
  FREE: 'free',
  INITIAL: 'initial',
  LEVEL_UP: 'levelUp'
};

/**
 * Class identifiers for spellcasting classes
 * @type {Object}
 */
export const CLASS_IDENTIFIERS = {
  ARTIFICER: 'artificer',
  BARD: 'bard',
  CLERIC: 'cleric',
  DRUID: 'druid',
  RANGER: 'ranger',
  SORCERER: 'sorcerer',
  WARLOCK: 'warlock',
  WIZARD: 'wizard'
};
