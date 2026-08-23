/** @enum {string} Module identification */
export const MODULE = { ID: 'spell-book', TITLE: 'Spell Book', TEMPLATES_PATH: 'modules/spell-book/templates' };

/**
 * Hooks this module fires. Namespaced with the module id so third-party listeners can rely on them.
 * @enum {string}
 */
export const HOOKS = {
  LOADOUT_APPLIED: `${MODULE.ID}.loadoutApplied`,
  PRE_LEARN_SPELL: `${MODULE.ID}.preLearnSpell`,
  PREPARATION_SAVED: `${MODULE.ID}.preparationSaved`,
  SPELL_BOOK_CLOSED: `${MODULE.ID}.spellBookClosed`,
  SPELL_BOOK_OPENED: `${MODULE.ID}.spellBookOpened`,
  SPELL_COPIED: `${MODULE.ID}.spellCopied`,
  SPELL_LEARNED: `${MODULE.ID}.spellLearned`
};

/** @enum {string} Compendium pack IDs */
export const PACK = { SPELLS: 'spell-book.custom-spell-lists', MACROS: 'spell-book.spell-book-macros', USER_SPELL_DATA: 'spell-book.user-spell-data' };

/** @enum {string} Static asset paths */
export const ASSETS = { MODULE_ICON: 'modules/spell-book/assets/icon_colored.png' };

/** @enum {string} Actor/journal flag keys */
export const FLAGS = {
  CANTRIP_SWAP_TRACKING: 'cantripSwapTracking',
  CLASS_IDENTIFIER: 'classIdentifier',
  CLASS_RULES: 'classRules',
  COLLAPSED_FOLDERS: 'collapsedFolders',
  DOWNTIME_NOTE: 'downtimeNote',
  FOLDER_TYPE: 'folderType',
  GM_COLLAPSED_LEVELS: 'gmCollapsedSpellLevels',
  IS_ACTOR_SPELLBOOK: 'isActorSpellbook',
  IS_USER_SPELL_DATA_JOURNAL: 'isUserSpellDataJournal',
  KIND: 'kind',
  MESSAGE_TYPE: 'messageType',
  NOTIFY_GM: 'notifyGm',
  ORIGINAL_UUID: 'originalUuid',
  LONG_REST_COMPLETED: 'longRestCompleted',
  PARTY_COLLAPSED_LEVELS: 'partyCollapsedLevels',
  PARTY_MODE_ENABLED: 'partyModeEnabled',
  PENDING_SPELL_COPY: 'pendingSpellCopy',
  PREPARED_SPELLS_BY_CLASS: 'preparedSpellsByClass',
  PREVIOUS_CANTRIP_MAX: 'previousCantripMax',
  PREVIOUS_LEVEL: 'previousLevel',
  RULE_SET_OVERRIDE: 'ruleSetOverride',
  SPELL_LOADOUTS: 'spellLoadouts',
  SPELLCASTING_NOTIFIED: 'spellcastingNotified',
  SWAP_TRACKING: 'swapTracking',
  WIZARD_COPIED_SPELLS: 'wizardCopiedSpells',
  WIZARD_RITUAL_CASTING: 'wizardRitualCasting',
  USER_SPELL_DATA: 'userSpellData'
};

/** @enum {string} Settings registration keys */
export const SETTINGS = {
  AUTO_DELETE_UNPREPARED_SPELLS: 'autoDeleteUnpreparedSpells',
  CANTRIP_SCALE_VALUES: 'cantripScaleValues',
  CLASS_RULE_LISTS_MIGRATION_COMPLETE: 'classRuleListsMigrationComplete',
  CHARGE_SCROLL_LEARNING_COST: 'chargeScrollLearningCost',
  CONSUME_SCROLLS_WHEN_LEARNING: 'consumeScrollsWhenLearning',
  CPR_COMPATIBILITY: 'cprCompatibility',
  CUSTOM_SPELL_LIST_MAPPINGS: 'customSpellListMappings',
  DEDUCT_SPELL_LEARNING_COST: 'deductSpellLearningCost',
  DISABLE_LONG_REST_SWAP_PROMPT: 'disableLongRestSwapPrompt',
  NOTIFY_GM_ON_SPELL_CHANGES: 'notifyGmOnSpellChanges',
  GM_APPROVE_SPELL_COPY: 'gmApproveSpellCopy',
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
  SPELL_BOOK_POSITION: 'spellBookPositionn',
  SPELL_COPY_DOWNTIME_NOTE: 'spellCopyDowntimeNote',
  SPELL_LIST_KINDS_MIGRATION_COMPLETE: 'spellListKindsMigrationComplete',
  SPELL_LIST_MANAGER_POSITION: 'spellListManagerPosition',
  INJECT_NOTES_INTO_DESCRIPTIONS: 'injectNotesIntoDescriptions',
  SPELL_NOTES_MAX_LENGTH: 'spellNotesMaxLength',
  SPELLCASTING_RULE_SET: 'spellcastingRuleSet'
};

/**
 * Spell display elements the GM can toggle, and the settings that back them.
 * @type {Array<{key: string, player: string, gm: string|null, label: string, description: string, metadata: boolean}>}
 */
export const UI_ELEMENTS = [
  {
    key: 'favorites',
    player: SETTINGS.PLAYER_UI_FAVORITES,
    gm: null,
    label: 'SPELLBOOK.Settings.DetailsCustomization.Favorites',
    description: 'SPELLBOOK.Settings.DetailsCustomization.FavoritesDesc',
    metadata: false
  },
  {
    key: 'compare',
    player: SETTINGS.PLAYER_UI_COMPARE,
    gm: SETTINGS.GM_UI_COMPARE,
    label: 'SPELLBOOK.Settings.DetailsCustomization.Compare',
    description: 'SPELLBOOK.Settings.DetailsCustomization.CompareDesc',
    metadata: false
  },
  { key: 'notes', player: SETTINGS.PLAYER_UI_NOTES, gm: null, label: 'ATLAS.Common.Notes', description: 'SPELLBOOK.Settings.DetailsCustomization.NotesDesc', metadata: false },
  {
    key: 'spellLevel',
    player: SETTINGS.PLAYER_UI_SPELL_LEVEL,
    gm: SETTINGS.GM_UI_SPELL_LEVEL,
    label: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevel',
    description: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevelDesc',
    metadata: true
  },
  {
    key: 'components',
    player: SETTINGS.PLAYER_UI_COMPONENTS,
    gm: SETTINGS.GM_UI_COMPONENTS,
    label: 'SPELLBOOK.Settings.DetailsCustomization.Components',
    description: 'SPELLBOOK.Settings.DetailsCustomization.ComponentsDesc',
    metadata: true
  },
  {
    key: 'school',
    player: SETTINGS.PLAYER_UI_SCHOOL,
    gm: SETTINGS.GM_UI_SCHOOL,
    label: 'SPELLBOOK.Settings.DetailsCustomization.School',
    description: 'SPELLBOOK.Settings.DetailsCustomization.SchoolDesc',
    metadata: true
  },
  {
    key: 'castingTime',
    player: SETTINGS.PLAYER_UI_CASTING_TIME,
    gm: SETTINGS.GM_UI_CASTING_TIME,
    label: 'SPELLBOOK.Settings.DetailsCustomization.CastingTime',
    description: 'SPELLBOOK.Settings.DetailsCustomization.CastingTimeDesc',
    metadata: true
  },
  { key: 'range', player: SETTINGS.PLAYER_UI_RANGE, gm: SETTINGS.GM_UI_RANGE, label: 'ATLAS.Common.Range', description: 'SPELLBOOK.Settings.DetailsCustomization.RangeDesc', metadata: true },
  {
    key: 'damageTypes',
    player: SETTINGS.PLAYER_UI_DAMAGE_TYPES,
    gm: SETTINGS.GM_UI_DAMAGE_TYPES,
    label: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypes',
    description: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypesDesc',
    metadata: true
  },
  {
    key: 'conditions',
    player: SETTINGS.PLAYER_UI_CONDITIONS,
    gm: SETTINGS.GM_UI_CONDITIONS,
    label: 'SPELLBOOK.Settings.DetailsCustomization.Conditions',
    description: 'SPELLBOOK.Settings.DetailsCustomization.ConditionsDesc',
    metadata: true
  },
  {
    key: 'save',
    player: SETTINGS.PLAYER_UI_SAVE,
    gm: SETTINGS.GM_UI_SAVE,
    label: 'SPELLBOOK.Settings.DetailsCustomization.Save',
    description: 'SPELLBOOK.Settings.DetailsCustomization.SaveDesc',
    metadata: true
  },
  {
    key: 'concentration',
    player: SETTINGS.PLAYER_UI_CONCENTRATION,
    gm: SETTINGS.GM_UI_CONCENTRATION,
    label: 'SPELLBOOK.Settings.DetailsCustomization.Concentration',
    description: 'SPELLBOOK.Settings.DetailsCustomization.ConcentrationDesc',
    metadata: true
  },
  {
    key: 'materialComponents',
    player: SETTINGS.PLAYER_UI_MATERIAL_COMPONENTS,
    gm: SETTINGS.GM_UI_MATERIAL_COMPONENTS,
    label: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponents',
    description: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponentsDesc',
    metadata: true
  }
];

/** @enum {string} Spell preparation modes */
export const SPELL_MODE = { ALWAYS: 'always', AT_WILL: 'atwill', GRANTED: 'granted', INNATE: 'innate', PACT: 'pact', RITUAL: 'ritual', SPELL: 'spell' };

/** @enum {string} Ritual casting behavior */
export const RITUAL_CASTING_MODES = { NONE: 'none', PREPARED: 'prepared', ALWAYS: 'always' };

/** @enum {string} Spellcasting rule sets */
export const RULE_SETS = { GLOBAL: 'global', LEGACY: 'legacy', MODERN: 'modern' };

/**
 * Folder names the module maintains in the custom spell list pack.
 * @enum {string}
 */
export const FOLDER_TYPES = { ACTOR_SPELLBOOK: 'actorSpellbook', CUSTOM: 'custom', MERGED: 'merged', MODIFIED: 'modified' };

/** @enum {string} Module-owned spell list page kinds */
export const LIST_KINDS = { CUSTOM: 'custom', DUPLICATE: 'duplicate', MERGED: 'merged' };

/** @enum {string} Spell/cantrip swap timing */
export const SWAP_MODES = { NONE: 'none', LEVEL_UP: 'levelUp', LONG_REST: 'longRest' };

/**
 * Sub-keys under the swap-tracking flag.
 * @enum {string}
 */
export const SWAP_PERIODS = { LEVEL_UP: 'levelUp', LONG_REST: 'longRest' };

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

/** @enum {string} Chat message kinds this module stamps on its own messages */
export const MESSAGE_TYPES = { COPY_APPROVAL: 'copy-approval', SCROLL_PURCHASE: 'scroll-purchase', SPELLCASTING_NOTICE: 'spellcasting-notice', UPDATE_REPORT: 'update-report' };

/** @enum {string} dnd5e spell list `system.type` values this module registers */
export const SPELL_LIST_TYPES = { ACTOR_SPELLBOOK: 'actor-spellbook' };

/** @enum {string} `system.sourceItem` prefixes used to attribute a granted spell */
export const SOURCE_PREFIXES = { CLASS: 'class:', FEAT: 'feat:', RACE: 'race:' };

/** @enum {string} Prefixes for generated tab ids */
export const TAB_PREFIXES = { WIZARD_BOOK: 'wizardbook-' };

/** @enum {string} Per-class rule names stored under the CLASS_RULES flag */
export const CLASS_RULE_NAMES = {
  CANTRIP_PREPARATION_BONUS: 'cantripPreparationBonus',
  CANTRIP_SWAPPING: 'cantripSwapping',
  CUSTOM_SPELL_LIST: 'customSpellList',
  CUSTOM_SUBCLASS_SPELL_LIST: 'customSubclassSpellList',
  FORCE_WIZARD_MODE: 'forceWizardMode',
  RITUAL_CASTING: 'ritualCasting',
  SHOW_CANTRIPS: 'showCantrips',
  SPELL_LEARNING_COST_MULTIPLIER: 'spellLearningCostMultiplier',
  SPELL_LEARNING_TIME_MULTIPLIER: 'spellLearningTimeMultiplier',
  SPELL_PREPARATION_BONUS: 'spellPreparationBonus',
  SPELL_SWAPPING: 'spellSwapping',
  SPELLS_PER_LEVEL: 'spellsPerLevel',
  STARTING_SPELLS: 'startingSpells'
};

/** @enum {string} Wizard spell source types */
export const WIZARD_SPELL_SOURCE = { COPIED: 'copied', FREE: 'free', INITIAL: 'initial', LEVEL_UP: 'levelUp', SCROLL: 'scroll' };

/** @type {number} Debounce delay for UI filter and input changes (ms) */
export const DEBOUNCE_DELAY = 150;

/** @type {number} Debounce delay for text search (ms) */
export const SEARCH_DEBOUNCE_DELAY = 800;

/** @type {object} Template path constants */
export const TEMPLATES = {
  COMPONENTS: {
    CANTRIP_NOTIFICATION: `${MODULE.TEMPLATES_PATH}/components/cantrip-notification.hbs`,
    DETACH_BUTTON: `${MODULE.TEMPLATES_PATH}/components/detach-button.hbs`,
    SPELLCASTING_NOTICE: `${MODULE.TEMPLATES_PATH}/components/spellcasting-notice.hbs`,
    EMPTY: `${MODULE.TEMPLATES_PATH}/components/empty-state.hbs`,
    FILTER_ITEM: `${MODULE.TEMPLATES_PATH}/components/filter-item.hbs`,
    FOLDER_SECTION: `${MODULE.TEMPLATES_PATH}/components/folder-section.hbs`,
    LOADING: `${MODULE.TEMPLATES_PATH}/components/loading-spinner.hbs`,
    PREPARATION_CHECKBOX: `${MODULE.TEMPLATES_PATH}/components/preparation-checkbox.hbs`,
    SCROLL_PURCHASE: `${MODULE.TEMPLATES_PATH}/components/scroll-purchase.hbs`,
    SETTING_ITEM: `${MODULE.TEMPLATES_PATH}/components/setting-item.hbs`,
    SPELL_ITEM: `${MODULE.TEMPLATES_PATH}/components/spell-item.hbs`,
    SPELL_LEVEL: `${MODULE.TEMPLATES_PATH}/components/spell-level.hbs`,
    SPELL_TAB_SCAFFOLD: `${MODULE.TEMPLATES_PATH}/components/spell-tab-scaffold.hbs`,
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
    PARTY: { MAIN: `${MODULE.TEMPLATES_PATH}/apps/party/main.hbs` }
  },
  DIALOGS: {
    CLASS_RULES: `${MODULE.TEMPLATES_PATH}/dialogs/class-rules.hbs`,
    COPY_APPROVAL: `${MODULE.TEMPLATES_PATH}/dialogs/copy-approval.hbs`,
    CREATE_SPELL_LIST: `${MODULE.TEMPLATES_PATH}/dialogs/create-spell-list.hbs`,
    DETAILS_CUSTOMIZATION: `${MODULE.TEMPLATES_PATH}/dialogs/details-customization.hbs`,
    LEARN_FROM_SCROLL: `${MODULE.TEMPLATES_PATH}/dialogs/learn-from-scroll.hbs`,
    LOADOUT_SELECTOR: `${MODULE.TEMPLATES_PATH}/dialogs/loadout-selector.hbs`,
    LONG_REST_SWAP: `${MODULE.TEMPLATES_PATH}/dialogs/long-rest-swap.hbs`,
    MANAGER_DOCUMENTATION: `${MODULE.TEMPLATES_PATH}/dialogs/spell-list-manager-documentation.hbs`,
    MERGE_SPELL_LISTS: `${MODULE.TEMPLATES_PATH}/dialogs/merge-spell-lists.hbs`,
    RENAME_SPELL_LIST: `${MODULE.TEMPLATES_PATH}/dialogs/rename-spell-list.hbs`,
    SPELL_COMPARISON: `${MODULE.TEMPLATES_PATH}/dialogs/spell-comparison.hbs`,
    SPELL_LIST_CHANGE_CONFIRMATION: `${MODULE.TEMPLATES_PATH}/dialogs/spell-list-change-confirmation.hbs`,
    SPELL_NOTES: `${MODULE.TEMPLATES_PATH}/dialogs/spell-notes.hbs`,
    SYNERGY_ANALYSIS: `${MODULE.TEMPLATES_PATH}/dialogs/synergy-analysis.hbs`,
    WIZARD_LEARN_SPELL: `${MODULE.TEMPLATES_PATH}/dialogs/wizard-learn-spell.hbs`,
    WIZARD_UNLEARN_SPELL: `${MODULE.TEMPLATES_PATH}/dialogs/wizard-unlearn-spell.hbs`
  }
};
