import { SpellBookTroubleshooter, SpellListManager } from './apps/_module.mjs';
import { MODULE, SETTINGS } from './constants/_module.mjs';
import { CompendiumSelectionDialog, SpellDetailsCustomization } from './dialogs/_module.mjs';
import { log } from './logger.mjs';
import * as UIHelpers from './ui/_module.mjs';

/**
 * Foundry VTT setting configuration object
 * @typedef {Object} SettingConfig
 * @property {string} name Localization key for setting name
 * @property {string} [hint] Localization key for setting description
 * @property {SettingScope} scope Setting scope ('world' | 'client')
 * @property {boolean} config Whether setting appears in configuration UI
 * @property {SettingType} type JavaScript type for setting value
 * @property {*} default Default value for the setting
 * @property {Object} [choices] Choice options for dropdown settings
 * @property {SettingRange} [range] Range constraints for numeric settings
 * @property {Function} [onChange] Callback function when setting changes
 * @property {boolean} [requiresReload] Whether changing requires world reload
 * @property {boolean} [restricted] Whether setting is GM-only
 */

/**
 * Setting scope determines where the setting is stored
 * @typedef {"world" | "client"} SettingScope
 */

/**
 * JavaScript type constructors for settings
 * @typedef {StringConstructor | NumberConstructor | BooleanConstructor | ObjectConstructor | ArrayConstructor} SettingType
 */

/**
 * Numeric setting range constraints
 * @typedef {Object} SettingRange
 * @property {number} min Minimum allowed value
 * @property {number} max Maximum allowed value
 * @property {number} step Step increment for input controls
 */

/**
 * Filter configuration structure stored in settings
 * @typedef {Object} FilterConfiguration
 * @property {string} version Configuration schema version
 * @property {FilterConfigItem[]} filters Array of filter definitions
 */

/**
 * Individual filter configuration item
 * @typedef {Object} FilterConfigItem
 * @property {string} id Unique filter identifier
 * @property {string} type Filter control type
 * @property {boolean} enabled Whether filter is enabled
 * @property {number} order Display order
 * @property {string} label Localization key for label
 * @property {boolean} sortable Whether results can be sorted
 * @property {string[]} [searchAliases] Alternative search terms
 */

/**
 * Compendium indexing configuration
 * @typedef {Object} CompendiumIndexConfig
 * @property {Object.<string, boolean>} [packId] Pack ID mapped to enabled status
 */

/**
 * Custom spell mappings configuration
 * @typedef {Object} CustomSpellMappings
 * @property {Object.<string, string>} [classId] Class ID mapped to spell list UUID
 */

/**
 * Available focus options for party mode
 * @typedef {Object} AvailableFocusOptions
 * @property {PartyFocus[]} focuses Array of available focus definitions
 */

/**
 * Party spellcasting focus definition
 * @typedef {Object} PartyFocus
 * @property {string} id Unique focus identifier
 * @property {string} name Display name for focus
 * @property {string} icon Icon class for focus
 * @property {string} description Focus description
 */

/**
 * Hidden spell lists configuration
 * @typedef {string[]} HiddenSpellLists Array of spell list UUIDs to hide
 */

/**
 * Position data for spell book window
 * @typedef {Object} SpellBookPosition
 * @property {number} [height] Window height in pixels
 * @property {number} [width] Window width in pixels
 * @property {number} [left] Window left position
 * @property {number} [top] Window top position
 */

/**
 * Register all module settings with Foundry VTT.
 *
 * Organizes settings into logical groups:
 * - Menus & Classes: Interactive setting menus
 * - Core Functionality: Essential module behavior
 * - UI & UX: User interface customization
 * - Notes & Annotations: Spell notes and descriptions
 * - UI Customization: Detailed interface options
 * - Party Spell Tracking: Group coordination features
 * - Technical: Advanced configuration options
 * - Troubleshooting: Debug and diagnostic tools
 *
 * @returns {void}
 */
export function registerSettings() {
  // ========================================
  //  Menus & Classes
  // ========================================

  game.settings.registerMenu(MODULE.ID, 'openSpellListManager', {
    name: 'SPELLBOOK.Settings.OpenSpellListManager.Name',
    hint: 'SPELLBOOK.Settings.OpenSpellListManager.Hint',
    label: 'SPELLBOOK.Settings.OpenSpellListManager.Button',
    icon: 'fas fa-hat-wizard',
    scope: 'world',
    type: SpellListManager,
    restricted: true
  });

  game.settings.registerMenu(MODULE.ID, 'compendiumSelection', {
    name: 'SPELLBOOK.Settings.CompendiumSelectionName',
    hint: 'SPELLBOOK.Settings.CompendiumSelectionHint',
    label: 'SPELLBOOK.Settings.CompendiumSelectionButton',
    icon: 'fas fa-books',
    scope: 'world',
    type: CompendiumSelectionDialog,
    restricted: true
  });

  // ========================================
  //  Core Functionality
  // ========================================

  game.settings.register(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS, {
    name: 'SPELLBOOK.Settings.IndexedCompendiumsName',
    hint: 'SPELLBOOK.Settings.IndexedCompendiumsHint',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    onChange: (value) => {
      try {
        if (typeof value !== 'object' || value === null) {
          log(2, 'Invalid indexed compendiums format, resetting to default');
          game.settings.set(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS, {});
        }
        if (window.spellBookCompendiumCache) window.spellBookCompendiumCache.clear();
      } catch (error) {
        log(1, 'Error validating indexed compendiums setting:', error);
      }
    }
  });

  game.settings.register(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING, {
    name: 'SPELLBOOK.Settings.EnableSpellUsageTracking.Name',
    hint: 'SPELLBOOK.Settings.EnableSpellUsageTracking.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      const message = value ? game.i18n.localize('SPELLBOOK.Settings.SpellUsageTrackingEnabled') : game.i18n.localize('SPELLBOOK.Settings.SpellUsageTrackingDisabled');
      ui.notifications.info(message);
    }
  });

  game.settings.register(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, {
    name: 'SPELLBOOK.Settings.CustomSpellMappings.Name',
    hint: 'SPELLBOOK.Settings.CustomSpellMappings.Hint',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    onChange: (value) => {
      try {
        if (typeof value !== 'object' || value === null) {
          log(2, 'Invalid custom spell mappings format, resetting to default');
          game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, {});
        }
      } catch (error) {
        log(1, 'Error validating custom spell mappings:', error);
      }
    }
  });

  game.settings.register(MODULE.ID, SETTINGS.SETUP_MODE, {
    name: 'SPELLBOOK.Settings.SetupMode.Name',
    hint: 'SPELLBOOK.Settings.SetupMode.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  game.settings.register(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR, {
    name: 'SPELLBOOK.Settings.DefaultEnforcementBehavior.Name',
    hint: 'SPELLBOOK.Settings.DefaultEnforcementBehavior.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      [MODULE.ENFORCEMENT_BEHAVIOR.UNENFORCED]: 'SPELLBOOK.Cantrips.BehaviorUnenforced',
      [MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM]: 'SPELLBOOK.Cantrips.BehaviorNotifyGM',
      [MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED]: 'SPELLBOOK.Cantrips.BehaviorEnforced'
    },
    default: MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM
  });

  game.settings.register(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING, {
    name: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Name',
    hint: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT, {
    name: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Name',
    hint: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES, {
    name: 'SPELLBOOK.Settings.CantripScaleValues.Name',
    hint: 'SPELLBOOK.Settings.CantripScaleValues.Hint',
    scope: 'world',
    config: true,
    type: String,
    default: 'cantrips-known, cantrips'
  });

  // ========================================
  //  UI & UX
  // ========================================

  game.settings.register(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION, {
    name: 'SPELLBOOK.Settings.SpellBookPosition.Name',
    hint: 'SPELLBOOK.Settings.SpellBookPosition.Hint',
    scope: 'client',
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE.ID, SETTINGS.SIDEBAR_CONTROLS_BOTTOM, {
    name: 'SPELLBOOK.Settings.SidebarControlsBottom.Name',
    hint: 'SPELLBOOK.Settings.SidebarControlsBottom.Hint',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE.ID, SETTINGS.ENABLE_JOURNAL_BUTTON, {
    name: 'SPELLBOOK.Settings.EnableJournalButton.Name',
    hint: 'SPELLBOOK.Settings.EnableJournalButton.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX, {
    name: 'SPELLBOOK.Settings.SpellComparisonMax.Name',
    hint: 'SPELLBOOK.Settings.SpellComparisonMax.Hint',
    scope: 'world',
    config: true,
    type: Number,
    default: 3,
    range: { min: 2, max: 7, step: 1 }
  });

  game.settings.register(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR, {
    name: 'SPELLBOOK.Settings.WizardBookIconColor.Name',
    hint: 'SPELLBOOK.Settings.WizardBookIconColor.Hint',
    scope: 'client',
    config: false,
    type: String,
    default: ''
  });

  // ========================================
  //  Notes & Annotations
  // ========================================

  game.settings.register(MODULE.ID, SETTINGS.SPELL_NOTES_DESC_INJECTION, {
    name: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Name',
    hint: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Hint',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      off: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Off',
      before: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Before',
      after: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.After'
    },
    default: 'off',
    onChange: async (value) => {
      await UIHelpers.SpellDescriptionInjection.handleSettingChange(value);
    }
  });

  game.settings.register(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH, {
    name: 'SPELLBOOK.Settings.NotesMaxLength.Name',
    hint: 'SPELLBOOK.Settings.NotesMaxLength.Hint',
    scope: 'world',
    config: true,
    type: Number,
    default: 240,
    range: {
      min: 10,
      max: 1000,
      step: 10
    }
  });

  // ========================================
  //  UI Customization
  // ========================================

  game.settings.registerMenu(MODULE.ID, 'spellDetailsCustomization', {
    name: 'SPELLBOOK.Settings.DetailsCustomization.MenuName',
    hint: 'SPELLBOOK.Settings.DetailsCustomization.MenuHint',
    icon: 'fa-solid fa-palette',
    label: 'SPELLBOOK.Settings.DetailsCustomization.MenuLabel',
    type: SpellDetailsCustomization,
    restricted: false
  });

  _registerUICustomizationSettings();

  // ========================================
  //  Party Spell Tracking
  // ========================================

  game.settings.register(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS, {
    name: 'Available Focus Options',
    scope: 'world',
    config: false,
    type: Object,
    default: {
      focuses: MODULE.PARTY_SPELL.DEFAULT_FOCUSES.map((name, index) => ({
        id: `focus-${index}`,
        name: name,
        icon: 'fas fa-magic',
        description: `${name} spellcasting focus`
      }))
    }
  });

  game.settings.register(MODULE.ID, SETTINGS.PARTY_MODE_TOKEN_LIMIT, {
    name: 'SPELLBOOK.Settings.PartyModeTokenLimit.Name',
    hint: 'SPELLBOOK.Settings.PartyModeTokenLimit.Hint',
    scope: 'client',
    config: true,
    type: Number,
    default: 4,
    range: { min: 2, max: 8, step: 1 }
  });

  // ========================================
  //  Technical
  // ========================================

  game.settings.register(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, {
    name: 'SPELLBOOK.Settings.FilterConfiguration.Name',
    hint: 'SPELLBOOK.Settings.FilterConfiguration.Hint',
    scope: 'client',
    config: false,
    type: Object,
    default: {
      version: MODULE.DEFAULT_FILTER_CONFIG_VERSION,
      filters: MODULE.DEFAULT_FILTER_CONFIG
    },
    onChange: (value) => {
      try {
        if (!value || !Array.isArray(value.filters)) {
          log(2, 'Invalid filter configuration format, resetting to default');
          game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, {
            version: MODULE.DEFAULT_FILTER_CONFIG_VERSION,
            filters: MODULE.DEFAULT_FILTER_CONFIG
          });
        }
      } catch (error) {
        log(1, 'Error validating filter configuration:', error);
      }
    }
  });

  game.settings.register(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, {
    name: 'SPELLBOOK.Settings.HiddenSpellLists.Name',
    hint: 'SPELLBOOK.Settings.HiddenSpellLists.Hint',
    scope: 'world',
    config: false,
    type: Array,
    default: [],
    onChange: (value) => {
      try {
        if (!Array.isArray(value)) {
          log(2, 'Invalid hidden spell lists format, resetting to default');
          game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, []);
        }
      } catch (error) {
        log(1, 'Error validating hidden spell lists setting:', error);
      }
    }
  });

  // ========================================
  //  Troubleshooting
  // ========================================

  game.settings.registerMenu(MODULE.ID, 'troubleshooterMenu', {
    name: 'SPELLBOOK.Settings.Troubleshooter.Menu.Name',
    hint: 'SPELLBOOK.Settings.Troubleshooter.Menu.Hint',
    label: 'SPELLBOOK.Settings.Troubleshooter.GenerateReport',
    icon: 'fas fa-bug',
    scope: 'world',
    type: SpellBookTroubleshooter,
    restricted: true
  });

  game.settings.register(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS, {
    scope: 'client',
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE.ID, SETTINGS.LOGGING_LEVEL, {
    name: 'SPELLBOOK.Settings.Logger.Name',
    hint: 'SPELLBOOK.Settings.Logger.Hint',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      0: 'SPELLBOOK.Settings.Logger.Choices.Off',
      1: 'SPELLBOOK.Settings.Logger.Choices.Errors',
      2: 'SPELLBOOK.Settings.Logger.Choices.Warnings',
      3: 'SPELLBOOK.Settings.Logger.Choices.Verbose'
    },
    default: 2,
    onChange: (value) => {
      MODULE.LOG_LEVEL = parseInt(value);
      log(3, `Logging level changed to ${MODULE.LOG_LEVEL}`);
    }
  });
}

/**
 * Register all UI customization boolean settings.
 * Reduces code duplication for similar settings.
 * @returns {void}
 * @private
 */
function _registerUICustomizationSettings() {
  const playerUISettings = [
    'FAVORITES',
    'COMPARE',
    'NOTES',
    'SPELL_LEVEL',
    'COMPONENTS',
    'SCHOOL',
    'CASTING_TIME',
    'RANGE',
    'DAMAGE_TYPES',
    'CONDITIONS',
    'SAVE',
    'CONCENTRATION',
    'MATERIAL_COMPONENTS'
  ];
  for (const setting of playerUISettings) {
    game.settings.register(MODULE.ID, SETTINGS[`PLAYER_UI_${setting}`], {
      name: `SPELLBOOK.Settings.DetailsCustomization.${setting.toLowerCase().replace(/_/g, '')}`,
      scope: 'client',
      config: false,
      type: Boolean,
      default: true
    });
  }
  const gmUISettings = ['COMPARE', 'SPELL_LEVEL', 'COMPONENTS', 'SCHOOL', 'CASTING_TIME', 'RANGE', 'DAMAGE_TYPES', 'CONDITIONS', 'SAVE', 'CONCENTRATION', 'MATERIAL_COMPONENTS'];
  for (const setting of gmUISettings) {
    game.settings.register(MODULE.ID, SETTINGS[`GM_UI_${setting}`], {
      name: `SPELLBOOK.Settings.DetailsCustomization.${setting.toLowerCase().replace(/_/g, '')}`,
      scope: 'client',
      config: false,
      type: Boolean,
      default: true
    });
  }
}
