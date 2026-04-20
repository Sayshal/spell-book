/** @type {object} Module identification */
export const MODULE = { ID: 'spell-book', NAME: 'Spell Book', LOG_LEVEL: 0, TEMPLATES_PATH: 'modules/spell-book/templates' };

/** @type {object} Compendium pack IDs */
export const PACK = { SPELLS: 'spell-book.custom-spell-lists', MACROS: 'spell-book.spell-book-macros', USERDATA: 'spell-book.user-spell-data' };

/** @type {object} Static asset paths */
export const ASSETS = { MODULE_ICON: 'modules/spell-book/assets/icon_colored.png' };

/** @enum {string} Actor/journal flag keys */
export const FLAGS = {
  CANTRIP_SWAP_TRACKING: 'cantripSwapTracking',
  CLASS_RULES: 'classRules',
  COLLAPSED_FOLDERS: 'collapsedFolders',
  COLLAPSED_LEVELS: 'collapsedSpellLevels',
  GM_COLLAPSED_LEVELS: 'gmCollapsedSpellLevels',
  NOTIFY_GM: 'notifyGm',
  LONG_REST_COMPLETED: 'longRestCompleted',
  PARTY_COLLAPSED_LEVELS: 'partyCollapsedLevels',
  PARTY_MODE_ENABLED: 'partyModeEnabled',
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
  WIZARD_RITUAL_CASTING: 'wizardRitualCasting',
  USER_SPELL_DATA: 'userSpellData'
};

/** @enum {string} Settings registration keys */
export const SETTINGS = {
  AUTO_DELETE_UNPREPARED_SPELLS: 'autoDeleteUnpreparedSpells',
  CANTRIP_SCALE_VALUES: 'cantripScaleValues',
  CONSUME_SCROLLS_WHEN_LEARNING: 'consumeScrollsWhenLearning',
  CPR_COMPATIBILITY: 'cprCompatibility',
  CUSTOM_SPELL_MAPPINGS: 'customSpellListMappings',
  DEDUCT_SPELL_LEARNING_COST: 'deductSpellLearningCost',
  DISABLE_LONG_REST_SWAP_PROMPT: 'disableLongRestSwapPrompt',
  NOTIFY_GM_ON_SPELL_CHANGES: 'notifyGmOnSpellChanges',
  GM_UI_CASTING_TIME: 'gmUICastingTime',
  GM_UI_COMPARE: 'gmUICompare',
  GM_UI_COMPONENTS: 'gmUIComponents',
  GM_UI_CONCENTRATION: 'gmUIConcentration',
  GM_UI_CONDITIONS: 'gmUIConditions',
  GM_UI_DAMAGE_TYPES: 'gmUIDamageTypes',
  GM_UI_MATERIAL_COMPONENTS: 'gmUIMaterialComponents',
  GM_UI_RANGE: 'gmUIRange',
  GM_UI_SAVE: 'gmUISave',
  GM_UI_SCHOOL: 'gmUISchool',
  GM_UI_SPELL_LEVEL: 'gmUISpellLevel',
  HIDDEN_SPELL_LISTS: 'hiddenSpellLists',
  LOGGING_LEVEL: 'loggingLevel',
  PARTY_MODE_TOKEN_LIMIT: 'partyModeTokenLimit',
  PLAYER_UI_CASTING_TIME: 'playerUICastingTime',
  PLAYER_UI_COMPARE: 'playerUICompare',
  PLAYER_UI_COMPONENTS: 'playerUIComponents',
  PLAYER_UI_CONCENTRATION: 'playerUIConcentration',
  PLAYER_UI_CONDITIONS: 'playerUIConditions',
  PLAYER_UI_DAMAGE_TYPES: 'playerUIDamageTypes',
  PLAYER_UI_FAVORITES: 'playerUIFavorites',
  PLAYER_UI_MATERIAL_COMPONENTS: 'playerUIMaterialComponents',
  PLAYER_UI_NOTES: 'playerUINotes',
  PLAYER_UI_RANGE: 'playerUIRange',
  PLAYER_UI_SAVE: 'playerUISave',
  PLAYER_UI_SCHOOL: 'playerUISchool',
  PLAYER_UI_SPELL_LEVEL: 'playerUISpellLevel',
  REGISTRY_ENABLED_LISTS: 'registryEnabledLists',
  SIDEBAR_CONTROLS_BOTTOM: 'sidebarControlsBottom',
  SPELL_BOOK_POSITION: 'spellBookPositionn',
  SPELL_NOTES_DESC_INJECTION: 'injectNotesIntoDescriptions',
  SPELL_NOTES_LENGTH: 'spellNotesMaxLength',
  SPELLCASTING_RULE_SET: 'spellcastingRuleSet',
  TROUBLESHOOTER_INCLUDE_ACTORS: 'troubleshooterIncludeActors',
  WIZARD_BOOK_ICON_COLOR: 'wizardBookIconColor'
};

/** @enum {string} Spell preparation modes */
export const SPELL_MODE = { ALWAYS: 'always', AT_WILL: 'atwill', GRANTED: 'granted', INNATE: 'innate', PACT: 'pact', RITUAL: 'ritual', SPELL: 'spell' };

/** @enum {string} Ritual casting behavior */
export const RITUAL_CASTING_MODES = { NONE: 'none', PREPARED: 'prepared', ALWAYS: 'always' };

/** @enum {string} Spellcasting rule sets */
export const RULE_SETS = { LEGACY: 'legacy', MODERN: 'modern' };

/** @enum {string} Spell/cantrip swap timing */
export const SWAP_MODES = { NONE: 'none', LEVEL_UP: 'levelUp', LONG_REST: 'longRest' };

/** @enum {string} Spell change enforcement */

/** @enum {string} Spellcasting class identifiers */
export const CLASS_IDENTIFIERS = {
  ARTIFICER: 'artificer',
  BARD: 'bard',
  CLERIC: 'cleric',
  DRUID: 'druid',
  PALADIN: 'paladin',
  RANGER: 'ranger',
  SORCERER: 'sorcerer',
  WARLOCK: 'warlock',
  WIZARD: 'wizard'
};

/** @type {object} Default wizard configuration */
export const WIZARD_DEFAULTS = { RITUAL_CASTING: true, SPELL_LEARNING_COST_MULTIPLIER: 50, SPELL_LEARNING_TIME_MULTIPLIER: 120, SPELLS_PER_LEVEL: 2, STARTING_SPELLS: 6 };

/** @type {object} Default preparation bonuses */
export const PREPARATION_DEFAULTS = { SPELL_PREPARATION_BONUS: 0, CANTRIP_PREPARATION_BONUS: 0 };

/** @enum {string} Wizard spell source types */
export const WIZARD_SPELL_SOURCE = { COPIED: 'copied', FREE: 'free', INITIAL: 'initial', LEVEL_UP: 'levelUp', SCROLL: 'scroll' };

/** @type {number} Debounce delay for UI filter and input changes (ms) */
export const DEBOUNCE_DELAY = 150;

/** @type {number} Debounce delay for text search (ms) */
export const SEARCH_DEBOUNCE_DELAY = 800;

/** @type {number} Maximum recent searches retained per actor */
export const MAX_RECENT_SEARCHES = 8;

/** @type {object} Template path constants */
export const TEMPLATES = {
  CHAT: {
    RELEASE_MESSAGE: `${MODULE.TEMPLATES_PATH}/chat/release-message.hbs`
  },
  COMPONENTS: {
    CANTRIP_NOTIFICATION: `${MODULE.TEMPLATES_PATH}/components/cantrip-notification.hbs`,
    CONTEXT_MENU: `${MODULE.TEMPLATES_PATH}/components/context-menu.hbs`,
    EMPTY: `${MODULE.TEMPLATES_PATH}/components/empty-state.hbs`,
    ERROR: `${MODULE.TEMPLATES_PATH}/components/error-message.hbs`,
    FILTER_ITEM: `${MODULE.TEMPLATES_PATH}/components/filter-item.hbs`,
    FOLDER_SECTION: `${MODULE.TEMPLATES_PATH}/components/folder-section.hbs`,
    LOADING: `${MODULE.TEMPLATES_PATH}/components/loading-spinner.hbs`,
    PREPARATION_CHECKBOX: `${MODULE.TEMPLATES_PATH}/components/preparation-checkbox.hbs`,
    SEARCH_ADVANCED_DROPDOWN: `${MODULE.TEMPLATES_PATH}/components/search-advanced-dropdown.hbs`,
    SETTING_ITEM: `${MODULE.TEMPLATES_PATH}/components/setting-item.hbs`,
    SPELL_ITEM: `${MODULE.TEMPLATES_PATH}/components/spell-item.hbs`,
    SPELL_LEVEL: `${MODULE.TEMPLATES_PATH}/components/spell-level.hbs`,
    USER_SPELL_DATA_TABLES: `${MODULE.TEMPLATES_PATH}/components/user-spell-data-tables.hbs`
  },
  APPS: {
    PLAYER: {
      HEADER: `${MODULE.TEMPLATES_PATH}/apps/player/header.hbs`,
      SIDEBAR: `${MODULE.TEMPLATES_PATH}/apps/player/sidebar.hbs`,
      TAB_PREPARE: `${MODULE.TEMPLATES_PATH}/apps/player/tab-prepare.hbs`,
      TAB_LEARN: `${MODULE.TEMPLATES_PATH}/apps/player/tab-learn.hbs`
    },
    SPELL_LIST_MANAGER: {
      HEADER: `${MODULE.TEMPLATES_PATH}/apps/spell-list-manager/header.hbs`,
      FOOTER: `${MODULE.TEMPLATES_PATH}/apps/spell-list-manager/footer.hbs`,
      LIST_CONTENT: `${MODULE.TEMPLATES_PATH}/apps/spell-list-manager/list-content.hbs`,
      MAIN: `${MODULE.TEMPLATES_PATH}/apps/spell-list-manager/main.hbs`,
      SPELL_LISTS: `${MODULE.TEMPLATES_PATH}/apps/spell-list-manager/spell-lists.hbs`
    },
    PARTY: {
      MAIN: `${MODULE.TEMPLATES_PATH}/apps/party/main.hbs`,
      SYNERGY_ANALYSIS: `${MODULE.TEMPLATES_PATH}/apps/party/synergy-analysis.hbs`
    },
    TROUBLESHOOTER: `${MODULE.TEMPLATES_PATH}/apps/troubleshooter.hbs`
  },
  DIALOGS: {
    CLASS_RULES: `${MODULE.TEMPLATES_PATH}/dialogs/class-rules.hbs`,
    CREATE_SPELL_LIST: `${MODULE.TEMPLATES_PATH}/dialogs/create-spell-list.hbs`,
    CUSTOM_SPELL_LIST: `${MODULE.TEMPLATES_PATH}/dialogs/custom-spell-list.hbs`,
    DETAILS_CUSTOMIZATION: `${MODULE.TEMPLATES_PATH}/dialogs/details-customization.hbs`,
    LEARN_FROM_SCROLL: `${MODULE.TEMPLATES_PATH}/dialogs/learn-from-scroll.hbs`,
    LOADOUT_SELECTOR: `${MODULE.TEMPLATES_PATH}/dialogs/loadout-selector.hbs`,
    LONG_REST_SWAP: `${MODULE.TEMPLATES_PATH}/dialogs/long-rest-swap.hbs`,
    MANAGER_DOCUMENTATION: `${MODULE.TEMPLATES_PATH}/dialogs/spell-list-manager-documentation.hbs`,
    MERGE_SPELL_LISTS: `${MODULE.TEMPLATES_PATH}/dialogs/merge-spell-lists.hbs`,
    RENAME_SPELL_LIST: `${MODULE.TEMPLATES_PATH}/dialogs/rename-spell-list.hbs`,
    SCROLL_SCANNER_RESULTS: `${MODULE.TEMPLATES_PATH}/dialogs/scroll-scanner-results.hbs`,
    SPELL_COMPARISON: `${MODULE.TEMPLATES_PATH}/dialogs/spell-comparison.hbs`,
    SPELL_LIST_CHANGE_CONFIRMATION: `${MODULE.TEMPLATES_PATH}/dialogs/spell-list-change-confirmation.hbs`,
    SPELL_NOTES: `${MODULE.TEMPLATES_PATH}/dialogs/spell-notes.hbs`,
    WIZARD_LEARN_SPELL: `${MODULE.TEMPLATES_PATH}/dialogs/wizard-learn-spell.hbs`,
    WIZARD_UNLEARN_SPELL: `${MODULE.TEMPLATES_PATH}/dialogs/wizard-unlearn-spell.hbs`
  }
};
