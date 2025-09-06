/**
 * @typedef {Object} DeprecatedFlag
 * @property {string} key The flag name
 * @property {string} reason Reason for deprecation
 * @property {string|undefined} removedInVersion Optional version in which it was removed
 */

/**
 * Deprecated flags that should be removed during migration
 * Each entry should include the flag name and reason for deprecation
 * @type {DeprecatedFlag[]}
 */
export const DEPRECATED_FLAGS = [];

/**
 * Flags used for data storage and state tracking
 * @typedef {Object} FlagKeys
 * @property {string} CANTRIP_SWAP_TRACKING
 * @property {string} CLASS_RULES
 * @property {string} COLLAPSED_FOLDERS
 * @property {string} COLLAPSED_LEVELS
 * @property {string} ENFORCEMENT_BEHAVIOR
 * @property {string} GM_COLLAPSED_LEVELS
 * @property {string} LONG_REST_COMPLETED
 * @property {string} PARTY_MODE_ENABLED
 * @property {string} PREPARED_SPELLS_BY_CLASS
 * @property {string} PREPARED_SPELLS
 * @property {string} PREVIOUS_CANTRIP_MAX
 * @property {string} PREVIOUS_LEVEL
 * @property {string} RECENT_SEARCHES
 * @property {string} RULE_SET_OVERRIDE
 * @property {string} SELECTED_FOCUS
 * @property {string} SIDEBAR_COLLAPSED
 * @property {string} SPELL_LOADOUTS
 * @property {string} SPELLCASTING_FOCUS
 * @property {string} SWAP_TRACKING
 * @property {string} WIZARD_COPIED_SPELLS
 * @property {string} WIZARD_RITUAL_CASTING
 */

/** @type {FlagKeys} */
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
