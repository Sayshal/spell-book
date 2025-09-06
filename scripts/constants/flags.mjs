/**
 * Definition of a deprecated flag for migration tracking
 * @typedef {Object} DeprecatedFlag
 * @property {string} key The flag name that is deprecated
 * @property {string} reason Human-readable reason for deprecation
 * @property {string} [removedInVersion] Optional version in which it was removed
 */

/**
 * Complete set of actor flag keys used for data storage and state tracking
 * @typedef {Object} FlagKeys
 * @property {string} CANTRIP_SWAP_TRACKING Flag for tracking cantrip swap state during level-up/long rest
 * @property {string} CLASS_RULES Flag for storing per-class spellcasting rule overrides
 * @property {string} COLLAPSED_FOLDERS Flag for storing collapsed folder state in UI
 * @property {string} COLLAPSED_LEVELS Flag for storing collapsed spell level state in UI
 * @property {string} ENFORCEMENT_BEHAVIOR Flag for actor-specific enforcement behavior override
 * @property {string} GM_COLLAPSED_LEVELS Flag for storing GM view collapsed spell level state
 * @property {string} LONG_REST_COMPLETED Flag indicating if long rest swap dialog was completed
 * @property {string} PARTY_MODE_ENABLED Flag for enabling party spell coordination mode
 * @property {string} PREPARED_SPELLS_BY_CLASS Flag for storing prepared spells organized by class
 * @property {string} PREPARED_SPELLS Flag for storing prepared spells (legacy format)
 * @property {string} PREVIOUS_CANTRIP_MAX Flag for tracking previous maximum cantrips for level-up detection
 * @property {string} PREVIOUS_LEVEL Flag for tracking previous character level for level-up detection
 * @property {string} RECENT_SEARCHES Flag for storing recent spell search queries
 * @property {string} RULE_SET_OVERRIDE Flag for actor-specific rule set override (legacy/modern)
 * @property {string} SELECTED_FOCUS Flag for storing selected spellcasting focus in party mode
 * @property {string} SIDEBAR_COLLAPSED Flag for storing sidebar collapsed state in spell book UI
 * @property {string} SPELL_LOADOUTS Flag for storing saved spell loadout configurations
 * @property {string} SPELLCASTING_FOCUS Flag for storing spellcasting focus selection
 * @property {string} SWAP_TRACKING Flag for tracking spell swap state during level-up/long rest
 * @property {string} WIZARD_COPIED_SPELLS Flag for tracking wizard spells copied from scrolls/other sources
 * @property {string} WIZARD_RITUAL_CASTING Flag for wizard ritual casting preferences
 */

/**
 * Swap tracking data structure for cantrips and spells
 * @typedef {Object} SwapTrackingData
 * @property {boolean} hasUnlearned Whether a spell/cantrip was unlearned this session
 * @property {string|null} unlearned UUID of the unlearned spell/cantrip
 * @property {boolean} hasLearned Whether a spell/cantrip was learned this session
 * @property {string|null} learned UUID of the learned spell/cantrip
 * @property {string[]} originalChecked UUIDs of spells/cantrips originally prepared
 */

/**
 * Class-specific rules configuration stored in actor flags
 * @typedef {Object} ClassRulesData
 * @property {string} [cantripSwapping] When cantrips can be swapped ('none'|'levelUp'|'longRest')
 * @property {string} [spellSwapping] When spells can be swapped ('none'|'levelUp'|'longRest')
 * @property {string} [ritualCasting] Ritual casting mode ('none'|'prepared'|'always')
 * @property {boolean} [showCantrips] Whether to show cantrips for this class
 * @property {string} [customSpellList] UUID of custom spell list override
 * @property {number} [spellPreparationBonus] Bonus spells that can be prepared
 * @property {number} [cantripPreparationBonus] Bonus cantrips that can be prepared
 * @property {boolean} [forceWizardMode] Force wizard-style spellbook for this class
 */

/**
 * Spell loadout configuration data
 * @typedef {Object} SpellLoadoutData
 * @property {string} name Human-readable name for the loadout
 * @property {string} description Optional description of the loadout
 * @property {Object.<string, string[]>} spellsByClass Prepared spells organized by class identifier
 * @property {number} createdAt Timestamp when loadout was created
 * @property {number} [lastUsed] Timestamp when loadout was last applied
 */

/**
 * Party spell focus data for coordination
 * @typedef {Object} PartyFocusData
 * @property {string} actorId Actor ID of the party member
 * @property {string} focus Selected spellcasting focus role
 * @property {string[]} [preferredSpells] List of preferred spell UUIDs for this focus
 */

/**
 * Deprecated flags that should be removed during migration.
 * Each entry should include the flag name and reason for deprecation.
 * @type {DeprecatedFlag[]}
 */
export const DEPRECATED_FLAGS = [];

/**
 * Standardized flag keys used throughout the module for consistent data storage.
 * These keys are used with Foundry's actor.getFlag() and actor.setFlag() methods.
 * @type {FlagKeys}
 */
export const FLAGS = {
  CANTRIP_SWAP_TRACKING: 'cantripSwapTracking',
  CLASS_RULES: 'classRules',
  COLLAPSED_FOLDERS: 'collapsedFolders',
  COLLAPSED_LEVELS: 'collapsedSpellLevels',
  ENFORCEMENT_BEHAVIOR: 'enforcementBehavior',
  GM_COLLAPSED_LEVELS: 'gmCollapsedSpellLevels',
  LONG_REST_COMPLETED: 'longRestCompleted',
  PARTY_MODE_ENABLED: 'partyModeEnabled',
  PREPARED_SPELLS_BY_CLASS: 'preparedSpellsByClass',
  PREPARED_SPELLS: 'preparedSpells',
  PREVIOUS_CANTRIP_MAX: 'previousCantripMax',
  PREVIOUS_LEVEL: 'previousLevel',
  RECENT_SEARCHES: 'recentSearches',
  RULE_SET_OVERRIDE: 'ruleSetOverride',
  SELECTED_FOCUS: 'selectedFocus',
  SIDEBAR_COLLAPSED: 'sidebarCollapsed',
  SPELL_LOADOUTS: 'spellLoadouts',
  SPELLCASTING_FOCUS: 'spellcastingFocus',
  SWAP_TRACKING: 'swapTracking',
  WIZARD_COPIED_SPELLS: 'wizardCopiedSpells',
  WIZARD_RITUAL_CASTING: 'wizardRitualCasting'
};
