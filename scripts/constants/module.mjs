/**
 * Core module constants, identifiers, and configuration for the Spell Book module.
 *
 * This module contains all central configuration constants including module identification,
 * settings keys, default configurations, enums, and asset paths. It serves as the
 * authoritative source for all module-wide constants and default values.
 *
 * @module Constants/Module
 * @author Tyler
 */

/**
 * Spellcasting focus option configuration.
 *
 * @typedef {Object} FocusOption
 * @property {string} id - Unique identifier for the focus option (e.g., 'focus-damage', 'focus-healer')
 * @property {string} name - Display name of the focus option (e.g., 'Offensive Mage', 'Support')
 * @property {string} icon - File path to the focus option icon image (e.g., 'icons/magic/fire/explosion-fireball-large-orange.webp')
 * @property {string} description - Descriptive text explaining the focus role and strategy
 */

/**
 * Focus selections mapping stored in group actor flags.
 *
 * @typedef {Object} FocusSelections
 * @property {Object<string, string>} selections - Maps user IDs to selected focus option IDs
 */

/**
 * Party member data with focus assignment information.
 *
 * @typedef {Object} PartyMember
 * @property {string} id - User ID
 * @property {string} name - User display name
 * @property {string|null} actorName - Associated actor name (if available)
 * @property {string|null} selectedFocus - Currently selected focus option ID
 */

/**
 * Group actor focus data structure for dual-flag system.
 *
 * @typedef {Object} GroupFocusData
 * @property {Object<string, string>} userSelections - Maps user IDs to focus IDs in group flags
 * @property {Object<string, string>} actorFlags - Maps actor IDs to focus names in individual flags
 */

/**
 * Module identification and configuration constants.
 * Contains all core module settings, identifiers, and default configurations.
 *
 * @typedef {Object} ModuleConfig
 * @property {string} ID - The module identifier for Foundry VTT
 * @property {string} NAME - Human-readable module name
 * @property {PackConfig} PACK - Compendium pack configurations
 * @property {number} LOG_LEVEL - Current logging level (0=off, 1=error, 2=warn, 3=debug)
 * @property {string} DEFAULT_FILTER_CONFIG_VERSION - Version number for filter configuration schema
 * @property {FilterConfigItem[]} DEFAULT_FILTER_CONFIG - Default filter configuration array
 * @property {FocusOption[]} DEFAULT_FOCUSES - Default spellcasting focus options based on magical archetypes
 * @property {EnforcementBehaviorConfig} ENFORCEMENT_BEHAVIOR - Spell change enforcement options
 * @property {WizardDefaultsConfig} WIZARD_DEFAULTS - Default wizard configuration values
 * @property {WizardSpellSourceConfig} WIZARD_SPELL_SOURCE - Wizard spell source type identifiers
 * @property {ClassIdentifiersConfig} CLASS_IDENTIFIERS - Spellcasting class identifier constants
 * @property {RuleSetsConfig} RULE_SETS - Available spellcasting rule set options
 * @property {SwapModesConfig} SWAP_MODES - Spell and cantrip swap timing options
 * @property {RitualCastingModesConfig} RITUAL_CASTING_MODES - Ritual casting behavior options
 */

/**
 * Compendium pack configuration for module data storage.
 *
 * @typedef {Object} PackConfig
 * @property {string} SPELLS - Custom spell lists compendium identifier
 * @property {string} MACROS - Spell book macros compendium identifier
 * @property {string} USERDATA - User spell data compendium identifier
 */

/**
 * Individual filter configuration item for spell browser filtering.
 *
 * @typedef {Object} FilterConfigItem
 * @property {string} id - Unique filter identifier
 * @property {FilterType} type - Type of filter control
 * @property {boolean} enabled - Whether filter is enabled by default
 * @property {number} order - Display order for filter controls
 * @property {string} label - Localization key for filter label
 * @property {boolean} sortable - Whether filter results can be sorted
 * @property {string[]} [searchAliases] - Alternative search terms for advanced search
 */

/**
 * Valid filter types for spell filtering interface.
 *
 * @typedef {"search" | "dropdown" | "range" | "checkbox"} FilterType
 */

/**
 * Party spell coordination configuration with focus system.
 *
 * @typedef {Object} PartySpellConfig
 * @property {FocusOption[]} DEFAULT_FOCUSES - Default spellcasting focus options for party coordination
 * @property {Object} DUAL_FLAG_SYSTEM - Configuration for dual-flag focus storage system
 * @property {string} DUAL_FLAG_SYSTEM.GROUP_FLAG - Flag key for group actor focus selections
 * @property {string} DUAL_FLAG_SYSTEM.ACTOR_FLAG - Flag key for individual actor focus storage
 */

/**
 * Spell change enforcement behavior configuration.
 *
 * @typedef {Object} EnforcementBehaviorConfig
 * @property {string} ENFORCED - Strictly enforce spell preparation rules
 * @property {string} NOTIFY_GM - Warn GM about rule violations but allow changes
 * @property {string} UNENFORCED - No enforcement of spell preparation rules
 */

/**
 * Default wizard spellcasting configuration values.
 *
 * @typedef {Object} WizardDefaultsConfig
 * @property {boolean} RITUAL_CASTING - Default ritual casting enabled state
 * @property {number} SPELLS_PER_LEVEL - Default spells gained per wizard level
 * @property {number} STARTING_SPELLS - Default starting spells for new wizards
 */

/**
 * Wizard spell source type identifiers for tracking spell origins.
 *
 * @typedef {Object} WizardSpellSourceConfig
 * @property {string} COPIED - Spells copied from scrolls or other spellbooks
 * @property {string} FREE - Free spells gained through level advancement
 * @property {string} INITIAL - Initial spells at character creation
 * @property {string} LEVEL_UP - Spells gained through level advancement
 */

/**
 * Spellcasting class identifier constants for consistent class recognition.
 *
 * @typedef {Object} ClassIdentifiersConfig
 * @property {string} ARTIFICER - Artificer class identifier
 * @property {string} BARD - Bard class identifier
 * @property {string} CLERIC - Cleric class identifier
 * @property {string} DRUID - Druid class identifier
 * @property {string} PALADIN - Paladin class identifier
 * @property {string} RANGER - Ranger class identifier
 * @property {string} SORCERER - Sorcerer class identifier
 * @property {string} WARLOCK - Warlock class identifier
 * @property {string} WIZARD - Wizard class identifier
 */

/**
 * Available spellcasting rule set options.
 *
 * @typedef {Object} RuleSetsConfig
 * @property {string} LEGACY - Legacy spellcasting rules for backward compatibility
 * @property {string} MODERN - Modern spellcasting rules with enhanced features
 */

/**
 * Spell and cantrip swap timing mode options.
 *
 * @typedef {Object} SwapModesConfig
 * @property {string} NONE - No swapping allowed
 * @property {string} LEVEL_UP - Swapping allowed only on level up
 * @property {string} LONG_REST - Swapping allowed on long rest
 */

/**
 * Ritual casting behavior mode options.
 *
 * @typedef {Object} RitualCastingModesConfig
 * @property {string} NONE - No ritual casting allowed
 * @property {string} PREPARED - Can only ritual cast prepared spells
 * @property {string} ALWAYS - Can ritual cast any known ritual spell
 */

/**
 * Settings keys used by the module for Foundry VTT game settings.
 * Each key corresponds to a registered setting that can be configured by users.
 *
 * @typedef {Object} SettingsKeys
 * @property {string} ADVANCED_SEARCH_PREFIX - Prefix character for advanced search syntax
 * @property {string} AVAILABLE_FOCUS_OPTIONS - Available spellcasting focus options for party mode (stores FocusOption[] in nested object)
 * @property {string} CANTRIP_SCALE_VALUES - Scale values for cantrip damage calculations
 * @property {string} CONSUME_SCROLLS_WHEN_LEARNING - Whether to consume scrolls when learning spells
 * @property {string} CPR_COMPATIBILITY - Enable Cauldron of Plentiful Resources compatibility
 * @property {string} CUSTOM_SPELL_MAPPINGS - Custom spell list mappings for classes
 * @property {string} DEFAULT_ENFORCEMENT_BEHAVIOR - Default enforcement behavior for new actors
 * @property {string} DISABLE_LONG_REST_SWAP_PROMPT - Disable long rest spell swap prompts
 * @property {string} ENABLE_JOURNAL_BUTTON - Enable spell list manager button in journal directory
 * @property {string} ENABLE_SPELL_USAGE_TRACKING - Enable spell usage analytics tracking
 * @property {string} FILTER_CONFIGURATION - User filter configuration for spell browser
 * @property {string} GM_UI_CASTING_TIME - Show casting time in GM spell details
 * @property {string} GM_UI_COMPARE - Show compare button in GM spell details
 * @property {string} GM_UI_COMPONENTS - Show components in GM spell details
 * @property {string} GM_UI_CONCENTRATION - Show concentration in GM spell details
 * @property {string} GM_UI_CONDITIONS - Show conditions in GM spell details
 * @property {string} GM_UI_DAMAGE_TYPES - Show damage types in GM spell details
 * @property {string} GM_UI_MATERIAL_COMPONENTS - Show material components in GM spell details
 * @property {string} GM_UI_RANGE - Show range in GM spell details
 * @property {string} GM_UI_SAVE - Show save information in GM spell details
 * @property {string} GM_UI_SCHOOL - Show spell school in GM spell details
 * @property {string} GM_UI_SPELL_LEVEL - Show spell level in GM spell details
 * @property {string} HIDDEN_SPELL_LISTS - Hidden spell lists in spell list manager
 * @property {string} INDEXED_COMPENDIUMS - Compendiums that have been indexed for searching
 * @property {string} LOGGING_LEVEL - Module logging level for debugging
 * @property {string} PARTY_MODE_TOKEN_LIMIT - Maximum tokens to consider for party mode
 * @property {string} PLAYER_UI_CASTING_TIME - Show casting time in player spell details
 * @property {string} PLAYER_UI_COMPARE - Show compare button in player spell details
 * @property {string} PLAYER_UI_COMPONENTS - Show components in player spell details
 * @property {string} PLAYER_UI_CONCENTRATION - Show concentration in player spell details
 * @property {string} PLAYER_UI_CONDITIONS - Show conditions in player spell details
 * @property {string} PLAYER_UI_DAMAGE_TYPES - Show damage types in player spell details
 * @property {string} PLAYER_UI_FAVORITES - Show favorites button in player spell details
 * @property {string} PLAYER_UI_MATERIAL_COMPONENTS - Show material components in player spell details
 * @property {string} PLAYER_UI_NOTES - Show notes button in player spell details
 * @property {string} PLAYER_UI_RANGE - Show range in player spell details
 * @property {string} PLAYER_UI_SAVE - Show save information in player spell details
 * @property {string} PLAYER_UI_SCHOOL - Show spell school in player spell details
 * @property {string} PLAYER_UI_SPELL_LEVEL - Show spell level in player spell details
 * @property {string} SETUP_MODE - Enable setup mode for initial configuration
 * @property {string} SIDEBAR_CONTROLS_BOTTOM - Position sidebar controls at bottom
 * @property {string} SPELL_BOOK_POSITION - Saved position data for spell book window
 * @property {string} SPELL_COMPARISON_MAX - Maximum number of spells to compare simultaneously
 * @property {string} SPELL_NOTES_DESC_INJECTION - Mode for injecting notes into spell descriptions
 * @property {string} SPELL_NOTES_LENGTH - Maximum length for spell notes
 * @property {string} SPELLCASTING_RULE_SET - Default spellcasting rule set for new actors
 * @property {string} TROUBLESHOOTER_INCLUDE_ACTORS - Include actor data in troubleshooter reports
 * @property {string} WIZARD_BOOK_ICON_COLOR - Custom color for wizard book icons
 */

/**
 * Actor and group flag keys used by the focus system.
 *
 * Dual Flag System for Focus Coordination:
 *
 * 1. **Group Actor Flags (Primary)**: FLAGS.SELECTED_FOCUS
 *    - Stores user ID to focus ID mappings
 *    - Used for party coordination and management
 *    - Structure: { "userId1": "focus-damage", "userId2": "focus-healer" }
 *
 * 2. **Individual Actor Flags (Sync)**: FLAGS.SPELLCASTING_FOCUS
 *    - Stores focus names (not IDs) for backward compatibility
 *    - Synchronized automatically when group selections change
 *    - Structure: "Offensive Mage" (human-readable name)
 *
 * @typedef {Object} FocusFlagKeys
 * @property {string} SELECTED_FOCUS - Group actor flag storing user-to-focus mappings
 * @property {string} SPELLCASTING_FOCUS - Individual actor flag for backward compatibility
 */

/**
 * Asset file paths used by the module for icons and graphics.
 *
 * @typedef {Object} AssetPaths
 * @property {string} WIZARDBOOK_ICON - Path to wizard book icon image
 * @property {string} MODULE_ICON - Path to module icon image
 */

/**
 * Core module identification and configuration constants.
 * Contains all module-wide settings, identifiers, and default configurations.
 *
 * @type {ModuleConfig}
 */
export const MODULE = {
  /** @type {string} Foundry VTT module identifier */
  ID: 'spell-book',

  /** @type {string} Human-readable module name */
  NAME: 'Spell Book',

  /** @type {PackConfig} Compendium pack configurations */
  PACK: { SPELLS: 'spell-book.custom-spell-lists', MACROS: 'spell-book.spell-book-macros', USERDATA: 'spell-book.user-spell-data' },

  /** @type {number} Current logging level (0=off, 1=error, 2=warn, 3=debug) */
  LOG_LEVEL: 0,

  /**
   * Current version of the default filter configuration.
   * Increment this when making changes to DEFAULT_FILTER_CONFIG.
   */
  DEFAULT_FILTER_CONFIG_VERSION: '1.0.0',

  /**
   * Default filter configuration for spell book interface.
   * Defines available filters, their types, display order, and search capabilities.
   *
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
    { id: 'favorited', type: 'checkbox', enabled: true, order: 4000, label: 'SPELLBOOK.Filters.FavoritedOnly', sortable: false, searchAliases: ['FAVORITED', 'FAVE', 'FAV'] },
    { id: 'preparedByParty', type: 'checkbox', enabled: true, order: 5000, label: 'SPELLBOOK.Filters.PreparedByParty', sortable: false, searchAliases: ['PARTYSPELLS', 'PARTY'] }
  ],

  /**
   * Default focus options based on common magical archetypes.
   *
   * Provides 10 predefined spellcasting focus types that cover the most
   * common magical roles in D&D 5e parties. Each focus includes a unique
   * ID, display name, thematic icon, and strategic description.
   *
   * @type {FocusOption[]}
   *
   */
  DEFAULT_FOCUSES: [
    { id: 'focus-arcanist', name: 'Arcanist', icon: 'icons/magic/symbols/elements-air-earth-fire-water.webp', description: 'Versatile; handle multiple roles moderately well.' },
    { id: 'focus-buffer', name: 'Buffer', icon: 'icons/magic/control/buff-strength-muscle-damage.webp', description: 'Weaken foes and strengthen allies.' },
    { id: 'focus-crowd-control', name: 'Crowd Controller', icon: 'icons/magic/control/debuff-chains-shackles-movement-blue.webp', description: 'Restrict or disable enemies via control effects.' },
    { id: 'focus-damage', name: 'Offensive Mage', icon: 'icons/magic/fire/explosion-fireball-large-orange.webp', description: 'Maximize offensive magical damage.' },
    { id: 'focus-defensive', name: 'Protector', icon: 'icons/magic/defensive/shield-barrier-flaming-pentagon-blue.webp', description: 'Provide defensive shields and wards.' },
    { id: 'focus-healer', name: 'Support', icon: 'icons/magic/life/heart-cross-strong-green.webp', description: 'Heal, resurrect, and sustain allies.' },
    { id: 'focus-hybrid', name: 'Brawler Mage', icon: 'icons/weapons/staves/staff-ornate-jeweled-blue.webp', description: 'Blend melee combat with magical abilities.' },
    { id: 'focus-specialist', name: 'Elementalist', icon: 'icons/magic/symbols/rune-sigil-horned-blue.webp', description: 'Focus on specific magical domains.' },
    { id: 'focus-summoner', name: 'Summoner', icon: 'icons/magic/symbols/runes-star-pentagon-magenta.webp', description: 'Conjure allies to join fight.' },
    { id: 'focus-utility', name: 'Utility', icon: 'icons/magic/control/hypnosis-mesmerism-eye.webp', description: 'Manipulate battlefield and circumstances.' }
  ],

  /**
   * Spell change enforcement behavior options.
   * @type {EnforcementBehaviorConfig}
   */
  ENFORCEMENT_BEHAVIOR: {
    ENFORCED: 'enforced',
    NOTIFY_GM: 'notifyGM',
    UNENFORCED: 'unenforced'
  },

  /**
   * Default wizard spellcasting configuration values.
   * @type {WizardDefaultsConfig}
   */
  WIZARD_DEFAULTS: {
    RITUAL_CASTING: true,
    SPELLS_PER_LEVEL: 2,
    STARTING_SPELLS: 6
  },

  /**
   * Wizard spell source type identifiers.
   * @type {WizardSpellSourceConfig}
   */
  WIZARD_SPELL_SOURCE: {
    COPIED: 'copied',
    FREE: 'free',
    INITIAL: 'initial',
    LEVEL_UP: 'levelUp'
  },

  /**
   * Spellcasting class identifier constants.
   * @type {ClassIdentifiersConfig}
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
   * Available spellcasting rule set options.
   * @type {RuleSetsConfig}
   */
  RULE_SETS: {
    LEGACY: 'legacy',
    MODERN: 'modern'
  },

  /**
   * Spell and cantrip swap timing modes.
   * @type {SwapModesConfig}
   */
  SWAP_MODES: {
    NONE: 'none',
    LEVEL_UP: 'levelUp',
    LONG_REST: 'longRest'
  },

  /**
   * Ritual casting behavior modes.
   * @type {RitualCastingModesConfig}
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
 *
 * @type {SettingsKeys}
 */
export const SETTINGS = {
  /** @type {string} Prefix character for advanced search syntax */
  ADVANCED_SEARCH_PREFIX: 'advancedSearchPrefix',

  /** @type {string} Available spellcasting focus options for party mode */
  AVAILABLE_FOCUS_OPTIONS: 'availableFocusOptions',

  /** @type {string} Scale values for cantrip damage calculations */
  CANTRIP_SCALE_VALUES: 'cantripScaleValues',

  /** @type {string} Whether to consume scrolls when learning spells */
  CONSUME_SCROLLS_WHEN_LEARNING: 'consumeScrollsWhenLearning',

  /** @type {string} Enable Cauldron of Plentiful Resources compatibility */
  CPR_COMPATIBILITY: 'cprCompatibility',

  /** @type {string} Custom spell list mappings for classes */
  CUSTOM_SPELL_MAPPINGS: 'customSpellListMappings',

  /** @type {string} Default enforcement behavior for new actors */
  DEFAULT_ENFORCEMENT_BEHAVIOR: 'defaultEnforcementBehavior',

  /** @type {string} Disable long rest spell swap prompts */
  DISABLE_LONG_REST_SWAP_PROMPT: 'disableLongRestSwapPrompt',

  /** @type {string} Enable spell list manager button in journal directory */
  ENABLE_JOURNAL_BUTTON: 'enableJournalButton',

  /** @type {string} Enable spell usage analytics tracking */
  ENABLE_SPELL_USAGE_TRACKING: 'enableSpellUsageTracking',

  /** @type {string} User filter configuration for spell browser */
  FILTER_CONFIGURATION: 'filterConfiguration',

  /** @type {string} Show casting time in GM spell details */
  GM_UI_CASTING_TIME: 'gmUICastingTime',

  /** @type {string} Show compare button in GM spell details */
  GM_UI_COMPARE: 'gmUICompare',

  /** @type {string} Show components in GM spell details */
  GM_UI_COMPONENTS: 'gmUIComponents',

  /** @type {string} Show concentration in GM spell details */
  GM_UI_CONCENTRATION: 'gmUIConcentration',

  /** @type {string} Show conditions in GM spell details */
  GM_UI_CONDITIONS: 'gmUIConditions',

  /** @type {string} Show damage types in GM spell details */
  GM_UI_DAMAGE_TYPES: 'gmUIDamageTypes',

  /** @type {string} Show material components in GM spell details */
  GM_UI_MATERIAL_COMPONENTS: 'gmUIMaterialComponents',

  /** @type {string} Show range in GM spell details */
  GM_UI_RANGE: 'gmUIRange',

  /** @type {string} Show save information in GM spell details */
  GM_UI_SAVE: 'gmUISave',

  /** @type {string} Show spell school in GM spell details */
  GM_UI_SCHOOL: 'gmUISchool',

  /** @type {string} Show spell level in GM spell details */
  GM_UI_SPELL_LEVEL: 'gmUISpellLevel',

  /** @type {string} Hidden spell lists in spell list manager */
  HIDDEN_SPELL_LISTS: 'hiddenSpellLists',

  /** @type {string} Compendiums that have been indexed for searching */
  INDEXED_COMPENDIUMS: 'indexedCompendiums',

  /** @type {string} Module logging level for debugging */
  LOGGING_LEVEL: 'loggingLevel',

  /** @type {string} Maximum tokens to consider for party mode */
  PARTY_MODE_TOKEN_LIMIT: 'partyModeTokenLimit',

  /** @type {string} Show casting time in player spell details */
  PLAYER_UI_CASTING_TIME: 'playerUICastingTime',

  /** @type {string} Show compare button in player spell details */
  PLAYER_UI_COMPARE: 'playerUICompare',

  /** @type {string} Show components in player spell details */
  PLAYER_UI_COMPONENTS: 'playerUIComponents',

  /** @type {string} Show concentration in player spell details */
  PLAYER_UI_CONCENTRATION: 'playerUIConcentration',

  /** @type {string} Show conditions in player spell details */
  PLAYER_UI_CONDITIONS: 'playerUIConditions',

  /** @type {string} Show damage types in player spell details */
  PLAYER_UI_DAMAGE_TYPES: 'playerUIDamageTypes',

  /** @type {string} Show favorites button in player spell details */
  PLAYER_UI_FAVORITES: 'playerUIFavorites',

  /** @type {string} Show material components in player spell details */
  PLAYER_UI_MATERIAL_COMPONENTS: 'playerUIMaterialComponents',

  /** @type {string} Show notes button in player spell details */
  PLAYER_UI_NOTES: 'playerUINotes',

  /** @type {string} Show range in player spell details */
  PLAYER_UI_RANGE: 'playerUIRange',

  /** @type {string} Show save information in player spell details */
  PLAYER_UI_SAVE: 'playerUISave',

  /** @type {string} Show spell school in player spell details */
  PLAYER_UI_SCHOOL: 'playerUISchool',

  /** @type {string} Show spell level in player spell details */
  PLAYER_UI_SPELL_LEVEL: 'playerUISpellLevel',

  /** @type {string} Enable setup mode for initial configuration */
  SETUP_MODE: 'setupMode',

  /** @type {string} Position sidebar controls at bottom */
  SIDEBAR_CONTROLS_BOTTOM: 'sidebarControlsBottom',

  /** @type {string} Saved position data for spell book window */
  SPELL_BOOK_POSITION: 'spellBookPositionn',

  /** @type {string} Maximum number of spells to compare simultaneously */
  SPELL_COMPARISON_MAX: 'spellComparisonMax',

  /** @type {string} Mode for injecting notes into spell descriptions */
  SPELL_NOTES_DESC_INJECTION: 'injectNotesIntoDescriptions',

  /** @type {string} Maximum length for spell notes */
  SPELL_NOTES_LENGTH: 'spellNotesMaxLength',

  /** @type {string} Default spellcasting rule set for new actors */
  SPELLCASTING_RULE_SET: 'spellcastingRuleSet',

  /** @type {string} Include actor data in troubleshooter reports */
  TROUBLESHOOTER_INCLUDE_ACTORS: 'troubleshooterIncludeActors',

  /** @type {string} Custom color for wizard book icons */
  WIZARD_BOOK_ICON_COLOR: 'wizardBookIconColor'
};

/**
 * Static asset file paths used by the module for icons and graphics.
 * All paths are relative to the module's root directory.
 *
 * @type {AssetPaths}
 */
export const ASSETS = {
  /** @type {string} Path to wizard book icon (primary module icon) */
  WIZARDBOOK_ICON: 'modules/spell-book/assets/icon.webp',

  /** @type {string} Path to colored module icon for enhanced UI */
  MODULE_ICON: 'modules/spell-book/assets/icon_colored.webp'
};
