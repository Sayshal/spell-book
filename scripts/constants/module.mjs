/**
 * Module identification and configuration constants
 * @typedef {Object} ModuleConfig
 * @property {string} ID The module identifier for Foundry VTT
 * @property {string} NAME Human-readable module name
 * @property {PackConfig} PACK Compendium pack configurations
 * @property {number} LOG_LEVEL Current logging level (0=off, 1=error, 2=warn, 3=debug)
 * @property {string} DEFAULT_FILTER_CONFIG_VERSION Version number for filter configuration schema
 * @property {FilterConfigItem[]} DEFAULT_FILTER_CONFIG Default filter configuration array
 * @property {PartySpellConfig} PARTY_SPELL Party spell coordination settings
 * @property {EnforcementBehavior} ENFORCEMENT_BEHAVIOR Spell change enforcement options
 * @property {WizardDefaults} WIZARD_DEFAULTS Default wizard configuration values
 * @property {WizardSpellSource} WIZARD_SPELL_SOURCE Wizard spell source type identifiers
 * @property {ClassIdentifiers} CLASS_IDENTIFIERS Spellcasting class identifier constants
 * @property {RuleSets} RULE_SETS Available spellcasting rule set options
 * @property {SwapModes} SWAP_MODES Spell and cantrip swap timing options
 * @property {RitualCastingModes} RITUAL_CASTING_MODES Ritual casting behavior options
 */

/**
 * Compendium pack configuration
 * @typedef {Object} PackConfig
 * @property {string} SPELLS Custom spell lists compendium identifier
 * @property {string} MACROS Spell book macros compendium identifier
 * @property {string} USERDATA User spell data compendium identifier
 */

/**
 * Individual filter configuration item
 * @typedef {Object} FilterConfigItem
 * @property {string} id Unique filter identifier
 * @property {FilterType} type Type of filter control
 * @property {boolean} enabled Whether filter is enabled by default
 * @property {number} order Display order for filter controls
 * @property {string} label Localization key for filter label
 * @property {boolean} sortable Whether filter results can be sorted
 * @property {string[]} [searchAliases] Alternative search terms for advanced search
 */

/**
 * Valid filter types for spell filtering
 * @typedef {"search" | "dropdown" | "range" | "checkbox"} FilterType
 */

/**
 * Party spell coordination configuration
 * @typedef {Object} PartySpellConfig
 * @property {string[]} DEFAULT_FOCUSES Default spellcasting focus role options
 */

/**
 * Enforcement behavior options for spell changes
 * @typedef {Object} EnforcementBehavior
 * @property {string} ENFORCED Strictly enforce all spell preparation rules
 * @property {string} NOTIFY_GM Allow changes but notify GM of violations
 * @property {string} UNENFORCED Allow all changes without restrictions
 */

/**
 * Default wizard configuration values
 * @typedef {Object} WizardDefaults
 * @property {boolean} RITUAL_CASTING Whether ritual casting is enabled by default
 * @property {number} SPELLS_PER_LEVEL Number of free spells gained per wizard level
 * @property {number} STARTING_SPELLS Number of spells in starting wizard spellbook
 */

/**
 * Wizard spell source type identifiers
 * @typedef {Object} WizardSpellSource
 * @property {string} COPIED Spells copied from scrolls or other wizards
 * @property {string} FREE Free spells gained on level up
 * @property {string} INITIAL Starting spells at level 1
 * @property {string} LEVEL_UP Additional spells learned through advancement
 */

/**
 * D&D 5e spellcasting class identifiers
 * @typedef {Object} ClassIdentifiers
 * @property {string} ARTIFICER Artificer class identifier
 * @property {string} BARD Bard class identifier
 * @property {string} CLERIC Cleric class identifier
 * @property {string} DRUID Druid class identifier
 * @property {string} PALADIN Paladin class identifier
 * @property {string} RANGER Ranger class identifier
 * @property {string} SORCERER Sorcerer class identifier
 * @property {string} WARLOCK Warlock class identifier
 * @property {string} WIZARD Wizard class identifier
 */

/**
 * Available spellcasting rule sets
 * @typedef {Object} RuleSets
 * @property {string} LEGACY 2014 PHB rules with traditional restrictions
 * @property {string} MODERN 2024 PHB rules with updated flexibility
 */

/**
 * Spell and cantrip swap timing modes
 * @typedef {Object} SwapModes
 * @property {string} NONE No swapping allowed (locked choices)
 * @property {string} LEVEL_UP Swapping allowed only on level up
 * @property {string} LONG_REST Swapping allowed on long rest (class-specific)
 */

/**
 * Ritual casting behavior modes
 * @typedef {Object} RitualCastingModes
 * @property {string} NONE No ritual casting capability
 * @property {string} PREPARED Can cast rituals only if prepared
 * @property {string} ALWAYS Can cast any known ritual without preparation
 */

/**
 * Settings keys used by the module for game settings
 * @typedef {Object} SettingsKeys
 * @property {string} ADVANCED_SEARCH_PREFIX Prefix character for advanced search queries
 * @property {string} AVAILABLE_FOCUS_OPTIONS Available party focus options list
 * @property {string} CANTRIP_SCALE_VALUES Scale value keys for cantrip progression
 * @property {string} CONSUME_SCROLLS_WHEN_LEARNING Whether to consume scrolls when learning
 * @property {string} CUSTOM_SPELL_MAPPINGS Custom spell list mappings configuration
 * @property {string} DEFAULT_ENFORCEMENT_BEHAVIOR Default enforcement behavior for new actors
 * @property {string} DISABLE_LONG_REST_SWAP_PROMPT Disable automatic long rest swap prompts
 * @property {string} ENABLE_JOURNAL_BUTTON Show spell book button in journal directory
 * @property {string} ENABLE_SPELL_USAGE_TRACKING Enable spell usage analytics tracking
 * @property {string} FILTER_CONFIGURATION User-customized filter configuration
 * @property {string} GM_UI_CASTING_TIME Show casting time in GM spell details
 * @property {string} GM_UI_COMPARE Show compare button in GM spell details
 * @property {string} GM_UI_COMPONENTS Show components in GM spell details
 * @property {string} GM_UI_CONCENTRATION Show concentration in GM spell details
 * @property {string} GM_UI_CONDITIONS Show conditions in GM spell details
 * @property {string} GM_UI_DAMAGE_TYPES Show damage types in GM spell details
 * @property {string} GM_UI_MATERIAL_COMPONENTS Show material components in GM spell details
 * @property {string} GM_UI_RANGE Show range in GM spell details
 * @property {string} GM_UI_SAVE Show save information in GM spell details
 * @property {string} GM_UI_SCHOOL Show spell school in GM spell details
 * @property {string} GM_UI_SPELL_LEVEL Show spell level in GM spell details
 * @property {string} HIDDEN_SPELL_LISTS List of hidden spell list UUIDs
 * @property {string} INDEXED_COMPENDIUMS List of compendiums to index for spells
 * @property {string} LOGGING_LEVEL Module logging level setting
 * @property {string} PARTY_MODE_TOKEN_LIMIT Maximum tokens to consider for party mode
 * @property {string} PLAYER_UI_CASTING_TIME Show casting time in player spell details
 * @property {string} PLAYER_UI_COMPARE Show compare button in player spell details
 * @property {string} PLAYER_UI_COMPONENTS Show components in player spell details
 * @property {string} PLAYER_UI_CONCENTRATION Show concentration in player spell details
 * @property {string} PLAYER_UI_CONDITIONS Show conditions in player spell details
 * @property {string} PLAYER_UI_DAMAGE_TYPES Show damage types in player spell details
 * @property {string} PLAYER_UI_FAVORITES Show favorites button in player spell details
 * @property {string} PLAYER_UI_MATERIAL_COMPONENTS Show material components in player spell details
 * @property {string} PLAYER_UI_NOTES Show notes button in player spell details
 * @property {string} PLAYER_UI_RANGE Show range in player spell details
 * @property {string} PLAYER_UI_SAVE Show save information in player spell details
 * @property {string} PLAYER_UI_SCHOOL Show spell school in player spell details
 * @property {string} PLAYER_UI_SPELL_LEVEL Show spell level in player spell details
 * @property {string} SETUP_MODE Enable setup mode for initial configuration
 * @property {string} SIDEBAR_CONTROLS_BOTTOM Position sidebar controls at bottom
 * @property {string} SPELL_BOOK_POSITION Saved position data for spell book window
 * @property {string} SPELL_COMPARISON_MAX Maximum number of spells to compare simultaneously
 * @property {string} SPELL_NOTES_DESC_INJECTION Mode for injecting notes into spell descriptions
 * @property {string} SPELL_NOTES_LENGTH Maximum length for spell notes
 * @property {string} SPELLCASTING_RULE_SET Default spellcasting rule set for new actors
 * @property {string} TROUBLESHOOTER_INCLUDE_ACTORS Include actor data in troubleshooter reports
 * @property {string} WIZARD_BOOK_ICON_COLOR Custom color for wizard book icons
 */

/**
 * Asset file paths used by the module
 * @typedef {Object} AssetPaths
 * @property {string} WIZARDBOOK_ICON Path to wizard book icon image
 * @property {string} MODULE_ICON Path to module icon image
 */

/**
 * Core module identification and configuration constants.
 * Contains all module-wide settings, identifiers, and default configurations.
 * @type {ModuleConfig}
 */
export const MODULE = {
  ID: 'spell-book',
  NAME: 'Spell Book',
  PACK: { SPELLS: 'spell-book.custom-spell-lists', MACROS: 'spell-book.spell-book-macros', USERDATA: 'spell-book.user-spell-data' },
  LOG_LEVEL: 0,

  /**
   * Current version of the default filter configuration.
   * Increment this when you make changes to DEFAULT_FILTER_CONFIG.
   */
  DEFAULT_FILTER_CONFIG_VERSION: '0.10.0',

  /**
   * Default filter configuration for spell book interface.
   * Defines available filters, their types, order, and search capabilities.
   * @type {FilterConfigItem[]}
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
   * Party spell coordination configuration.
   * @type {PartySpellConfig}
   */
  PARTY_SPELL: {
    DEFAULT_FOCUSES: ['Support', 'Healing', 'Damage/Blasting', 'Control', 'Utility', 'Tank/Defense', 'Stealth/Infiltration', 'Social/Enchantment']
  },

  /**
   * Spell change enforcement behavior options.
   * @type {EnforcementBehavior}
   */
  ENFORCEMENT_BEHAVIOR: {
    ENFORCED: 'enforced',
    NOTIFY_GM: 'notifyGM',
    UNENFORCED: 'unenforced'
  },

  /**
   * Default wizard configuration values.
   * @type {WizardDefaults}
   */
  WIZARD_DEFAULTS: {
    RITUAL_CASTING: true,
    SPELLS_PER_LEVEL: 2,
    STARTING_SPELLS: 6
  },

  /**
   * Wizard spell source type identifiers.
   * @type {WizardSpellSource}
   */
  WIZARD_SPELL_SOURCE: {
    COPIED: 'copied',
    FREE: 'free',
    INITIAL: 'initial',
    LEVEL_UP: 'levelUp'
  },

  /**
   * D&D 5e spellcasting class identifiers.
   * @type {ClassIdentifiers}
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
   * Available spellcasting rule sets.
   * @type {RuleSets}
   */
  RULE_SETS: {
    LEGACY: 'legacy',
    MODERN: 'modern'
  },

  /**
   * Spell and cantrip swap timing modes.
   * @type {SwapModes}
   */
  SWAP_MODES: {
    NONE: 'none',
    LEVEL_UP: 'levelUp',
    LONG_REST: 'longRest'
  },

  /**
   * Ritual casting behavior modes.
   * @type {RitualCastingModes}
   */
  RITUAL_CASTING_MODES: {
    NONE: 'none',
    PREPARED: 'prepared',
    ALWAYS: 'always'
  }
};

/**
 * Settings keys used by the module for Foundry VTT game settings.
 * Each key corresponds to a registered setting that can be configured by users.
 * @type {SettingsKeys}
 */
export const SETTINGS = {
  ADVANCED_SEARCH_PREFIX: 'advancedSearchPrefix',
  AVAILABLE_FOCUS_OPTIONS: 'availableFocusOptions',
  CANTRIP_SCALE_VALUES: 'cantripScaleValues',
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
  SETUP_MODE: 'setupMode',
  SIDEBAR_CONTROLS_BOTTOM: 'sidebarControlsBottom',
  SPELL_BOOK_POSITION: 'spellBookPositionn',
  SPELL_COMPARISON_MAX: 'spellComparisonMax',
  SPELL_NOTES_DESC_INJECTION: 'injectNotesIntoDescriptions',
  SPELL_NOTES_LENGTH: 'spellNotesMaxLength',
  SPELLCASTING_RULE_SET: 'spellcastingRuleSet',
  TROUBLESHOOTER_INCLUDE_ACTORS: 'troubleshooterIncludeActors',
  WIZARD_BOOK_ICON_COLOR: 'wizardBookIconColor'
};

/**
 * Static asset file paths used by the module.
 * @type {AssetPaths}
 */
export const ASSETS = {
  WIZARDBOOK_ICON: 'modules/spell-book/assets/icon.webp',
  MODULE_ICON: 'modules/spell-book/assets/icon_colored.webp'
};
