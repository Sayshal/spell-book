/**
 * Deprecated flags that should be removed during migration
 * Each entry should include the flag name and reason for deprecation
 * @type {Array<{key: string, reason: string, removedInVersion?: string}>}
 */
export const DEPRECATED_FLAGS = [];

/**
 * Flags used for data storage and state tracking
 * @type {Object}
 */
export const FLAGS = {
  CANTRIP_SWAP_TRACKING: 'cantripSwapTracking',
  CLASS_RULES: 'classRules',
  COLLAPSED_FOLDERS: 'collapsedFolders',
  COLLAPSED_LEVELS: 'collapsedSpellLevels',
  ENFORCEMENT_BEHAVIOR: 'enforcementBehavior',
  LONG_REST_COMPLETED: 'longRestCompleted',
  GM_COLLAPSED_LEVELS: 'gmCollapsedSpellLevels',
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
  WIZARD_RITUAL_CASTING: 'wizardRitualCasting'
};
