/**
 * Core module identification and configuration constants
 * @type {Object}
 */
export const MODULE = {
  ID: 'spell-book',
  NAME: 'Spell Book',
  PACK: { SPELLS: 'spell-book.custom-spell-lists', MACROS: 'spell-book.spell-book-macros', USERDATA: 'spell-book.user-spell-data' },
  LOG_LEVEL: 0,

  /**
   * Current version of the default filter configuration
   * Increment this when you make changes to DEFAULT_FILTER_CONFIG
   */
  DEFAULT_FILTER_CONFIG_VERSION: '0.10.0',

  /**
   * Default filter configuration
   * @type {Array}
   */
  DEFAULT_FILTER_CONFIG: [
    { id: 'name', type: 'search', enabled: true, order: 10, label: 'SPELLBOOK.Filters.Search', sortable: false },
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
  }
};

/**
 * Settings keys used by the module
 * @type {Object}
 */
export const SETTINGS = {
  ADVANCED_SEARCH_PREFIX: 'advancedSearchPrefix',
  CANTRIP_SCALE_VALUES: 'cantripScaleValues',
  COMPENDIUM_SELECTION: 'compendiumSelection',
  CONSUME_SCROLLS_WHEN_LEARNING: 'consumeScrollsWhenLearning',
  CUSTOM_SPELL_MAPPINGS: 'customSpellListMappings',
  DEFAULT_ENFORCEMENT_BEHAVIOR: 'defaultEnforcementBehavior',
  DISABLE_LONG_REST_SWAP_PROMPT: 'disableLongRestSwapPrompt',
  ENABLE_JOURNAL_BUTTON: 'enableJournalButton',
  ENABLE_SPELL_USAGE_TRACKING: 'enableSpellUsageTracking',
  FILTER_CONFIGURATION: 'filterConfiguration',
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
  INDEXED_COMPENDIUMS: 'indexedCompendiums',
  LOGGING_LEVEL: 'loggingLevel',
  OPEN_SPELL_MANAGER: 'openSpellListManager',
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
  SETUP_MODE: 'setupMode',
  SIDEBAR_CONTROLS_BOTTOM: 'sidebarControlsBottom',
  SPELL_BOOK_POSITION: 'spellBookPositionn',
  SPELL_COMPARISON_MAX: 'spellComparisonMax',
  SPELL_NOTES_DESC_INJECTION: 'injectNotesIntoDescriptions',
  SPELL_NOTES_LENGTH: 'spellNotesMaxLength',
  SPELLCASTING_RULE_SET: 'spellcastingRuleSet',
  WIZARD_BOOK_ICON_COLOR: 'wizardBookIconColor'
};

/**
 * Asset paths used by the module
 * @type {Object}
 */
export const ASSETS = {
  WIZARDBOOK_ICON: 'modules/spell-book/assets/icon.webp',
  MODULE_ICON: 'modules/spell-book/assets/icon_colored.webp'
};
