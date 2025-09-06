/**
 * Actor flag definitions and data structures for the Spell Book module.
 *
 * This module defines all flag keys used for storing data on actor documents,
 * along with comprehensive type definitions for the data structures stored
 * in those flags. It also tracks deprecated flags for migration purposes.
 *
 * @module Constants/Flags
 * @author Tyler
 */

/**
 * Definition of a deprecated flag for migration tracking.
 * Used to identify flags that should be removed during system updates.
 *
 * @typedef {Object} DeprecatedFlag
 * @property {string} key - The flag name that is deprecated
 * @property {string} reason - Human-readable reason for deprecation
 * @property {string} [removedInVersion] - Optional version in which it was removed
 * @property {string} [migrationPath] - Optional path for data migration
 */

/**
 * Complete set of actor flag keys used for data storage and state tracking.
 * These keys are used with Foundry's actor.getFlag() and actor.setFlag() methods.
 *
 * @typedef {Object} FlagKeys
 * @property {string} CANTRIP_SWAP_TRACKING - Flag for tracking cantrip swap state during level-up/long rest
 * @property {string} CLASS_RULES - Flag for storing per-class spellcasting rule overrides
 * @property {string} COLLAPSED_FOLDERS - Flag for storing collapsed folder state in UI
 * @property {string} COLLAPSED_LEVELS - Flag for storing collapsed spell level state in UI
 * @property {string} ENFORCEMENT_BEHAVIOR - Flag for actor-specific enforcement behavior override
 * @property {string} GM_COLLAPSED_LEVELS - Flag for storing GM view collapsed spell level state
 * @property {string} LONG_REST_COMPLETED - Flag indicating if long rest swap dialog was completed
 * @property {string} PARTY_MODE_ENABLED - Flag for enabling party spell coordination mode
 * @property {string} PREPARED_SPELLS_BY_CLASS - Flag for storing prepared spells organized by class
 * @property {string} PREPARED_SPELLS - Flag for storing prepared spells (legacy format)
 * @property {string} PREVIOUS_CANTRIP_MAX - Flag for tracking previous maximum cantrips for level-up detection
 * @property {string} PREVIOUS_LEVEL - Flag for tracking previous character level for level-up detection
 * @property {string} RECENT_SEARCHES - Flag for storing recent spell search queries
 * @property {string} RULE_SET_OVERRIDE - Flag for actor-specific rule set override (legacy/modern)
 * @property {string} SELECTED_FOCUS - Flag for storing selected spellcasting focus in party mode
 * @property {string} SIDEBAR_COLLAPSED - Flag for storing sidebar collapsed state in spell book UI
 * @property {string} SPELL_LOADOUTS - Flag for storing saved spell loadout configurations
 * @property {string} SPELLCASTING_FOCUS - Flag for storing spellcasting focus selection
 * @property {string} SWAP_TRACKING - Flag for tracking spell swap state during level-up/long rest
 * @property {string} WIZARD_COPIED_SPELLS - Flag for tracking wizard spells copied from scrolls/other sources
 * @property {string} WIZARD_RITUAL_CASTING - Flag for wizard ritual casting preferences
 */

/**
 * Swap tracking data structure for cantrips and spells.
 * Used to track changes during level-up and long rest sessions.
 *
 * @typedef {Object} SwapTrackingData
 * @property {boolean} hasUnlearned - Whether a spell/cantrip was unlearned this session
 * @property {string|null} unlearned - UUID of the unlearned spell/cantrip
 * @property {boolean} hasLearned - Whether a spell/cantrip was learned this session
 * @property {string|null} learned - UUID of the learned spell/cantrip
 * @property {string[]} originalChecked - UUIDs of spells/cantrips originally prepared
 */

/**
 * Class-specific rules configuration stored in actor flags.
 * Allows overriding default spellcasting behavior per class.
 *
 * @typedef {Object} ClassRulesData
 * @property {string} [cantripSwapping] - When cantrips can be swapped ('none'|'levelUp'|'longRest')
 * @property {string} [spellSwapping] - When spells can be swapped ('none'|'levelUp'|'longRest')
 * @property {string} [ritualCasting] - Ritual casting mode ('none'|'prepared'|'always')
 * @property {boolean} [showCantrips] - Whether to show cantrips for this class
 * @property {string} [customSpellList] - UUID of custom spell list override
 * @property {number} [spellPreparationBonus] - Bonus spells that can be prepared
 * @property {number} [cantripPreparationBonus] - Bonus cantrips that can be prepared
 * @property {boolean} [forceWizardMode] - Force wizard-style spellbook for this class
 */

/**
 * Spell loadout configuration data for saving and loading spell preparations.
 * Allows players to save multiple spell configurations for quick switching.
 *
 * @typedef {Object} SpellLoadoutData
 * @property {string} name - Human-readable name for the loadout
 * @property {string} description - Optional description of the loadout
 * @property {Object.<string, string[]>} spellsByClass - Prepared spells organized by class identifier
 * @property {number} createdAt - Timestamp when loadout was created
 * @property {number} [lastUsed] - Timestamp when loadout was last applied
 * @property {string} [version] - Loadout format version for migration tracking
 */

/**
 * Party spell focus data for coordination between party members.
 * Used in party mode to coordinate spellcasting roles and preferences.
 *
 * @typedef {Object} PartyFocusData
 * @property {string} actorId - Actor ID of the party member
 * @property {string} focus - Selected spellcasting focus role
 * @property {string[]} [preferredSpells] - List of preferred spell UUIDs for this focus
 * @property {number} [priority] - Priority level for this focus (1-10)
 * @property {boolean} [isActive] - Whether this focus is currently active
 */

/**
 * Deprecated flags that should be removed during migration.
 * Each entry includes the flag name, reason for deprecation, and optional migration info.
 *
 * @type {DeprecatedFlag[]}
 */
export const DEPRECATED_FLAGS = [];

/**
 * Standardized flag keys used throughout the module for consistent data storage.
 * These keys are used with Foundry's actor.getFlag() and actor.setFlag() methods.
 *
 * All flag operations should use these constants rather than hardcoded strings
 * to ensure consistency and enable easier refactoring.
 *
 * @type {FlagKeys}
 */
export const FLAGS = {
  /** @type {string} Flag for tracking cantrip swap state during level-up/long rest */
  CANTRIP_SWAP_TRACKING: 'cantripSwapTracking',

  /** @type {string} Flag for storing per-class spellcasting rule overrides */
  CLASS_RULES: 'classRules',

  /** @type {string} Flag for storing collapsed folder state in UI */
  COLLAPSED_FOLDERS: 'collapsedFolders',

  /** @type {string} Flag for storing collapsed spell level state in UI */
  COLLAPSED_LEVELS: 'collapsedSpellLevels',

  /** @type {string} Flag for actor-specific enforcement behavior override */
  ENFORCEMENT_BEHAVIOR: 'enforcementBehavior',

  /** @type {string} Flag for storing GM view collapsed spell level state */
  GM_COLLAPSED_LEVELS: 'gmCollapsedSpellLevels',

  /** @type {string} Flag indicating if long rest swap dialog was completed */
  LONG_REST_COMPLETED: 'longRestCompleted',

  /** @type {string} Flag for enabling party spell coordination mode */
  PARTY_MODE_ENABLED: 'partyModeEnabled',

  /** @type {string} Flag for storing prepared spells organized by class */
  PREPARED_SPELLS_BY_CLASS: 'preparedSpellsByClass',

  /** @type {string} Flag for storing prepared spells (legacy format) */
  PREPARED_SPELLS: 'preparedSpells',

  /** @type {string} Flag for tracking previous maximum cantrips for level-up detection */
  PREVIOUS_CANTRIP_MAX: 'previousCantripMax',

  /** @type {string} Flag for tracking previous character level for level-up detection */
  PREVIOUS_LEVEL: 'previousLevel',

  /** @type {string} Flag for storing recent spell search queries */
  RECENT_SEARCHES: 'recentSearches',

  /** @type {string} Flag for actor-specific rule set override (legacy/modern) */
  RULE_SET_OVERRIDE: 'ruleSetOverride',

  /** @type {string} Flag for storing selected spellcasting focus in party mode */
  SELECTED_FOCUS: 'selectedFocus',

  /** @type {string} Flag for storing sidebar collapsed state in spell book UI */
  SIDEBAR_COLLAPSED: 'sidebarCollapsed',

  /** @type {string} Flag for storing saved spell loadout configurations */
  SPELL_LOADOUTS: 'spellLoadouts',

  /** @type {string} Flag for storing spellcasting focus selection */
  SPELLCASTING_FOCUS: 'spellcastingFocus',

  /** @type {string} Flag for tracking spell swap state during level-up/long rest */
  SWAP_TRACKING: 'swapTracking',

  /** @type {string} Flag for tracking wizard spells copied from scrolls/other sources */
  WIZARD_COPIED_SPELLS: 'wizardCopiedSpells',

  /** @type {string} Flag for wizard ritual casting preferences */
  WIZARD_RITUAL_CASTING: 'wizardRitualCasting'
};
