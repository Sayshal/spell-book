/**
 * Spell Book Module Settings Registration
 *
 * Registers and manages all configurable settings for the Spell Book module,
 * including game mechanics, UI preferences, analytics, and party coordination
 * features. Provides centralized configuration management with proper validation,
 * defaults, and migration support.
 *
 * Settings are organized into logical groups:
 * - Menus & Classes: Dialog and application launchers
 * - Core Functionality: Basic module operations and spell data
 * - UI & UX: User interface preferences and layout
 * - Spell Behavior: Spellcasting rules and enforcement
 * - Notes & Annotations: Personal notes and descriptions
 * - UI Customization: Display element preferences
 * - Party Spell Tracking: Multi-character coordination
 * - Technical: Internal configurations and caching
 * - Troubleshooting: Debugging and diagnostic tools
 *
 * @module Settings
 * @author Tyler
 */

import { SpellBookTroubleshooter, SpellListManager } from './apps/_module.mjs';
import { MODULE, SETTINGS } from './constants/_module.mjs';
import { CompendiumSelectionDialog, SpellDetailsCustomization } from './dialogs/_module.mjs';
import { log } from './logger.mjs';
import * as UIHelpers from './ui/_module.mjs';

/**
 * Register all module settings with Foundry VTT.
 *
 * This function registers the complete configuration interface for the Spell Book module.
 * Settings are organized into logical groups and include validation, change handlers,
 * and appropriate scopes (world vs client) for each configuration option.
 *
 * The registration process includes:
 * - Menu items for launching configuration dialogs
 * - Core functionality settings for spell data and behavior
 * - User interface customization options
 * - Technical settings for performance and debugging
 * - Validation and error handling for setting changes
 *
 * @returns {void}
 */
export function registerSettings() {
  // ========================================//
  //  Menus & Classes                        //
  // ========================================//

  /** Register spell list manager menu launcher */
  game.settings.registerMenu(MODULE.ID, 'openSpellListManager', {
    name: 'SPELLBOOK.Settings.OpenSpellListManager.Name',
    hint: 'SPELLBOOK.Settings.OpenSpellListManager.Hint',
    label: 'SPELLBOOK.Settings.OpenSpellListManager.Button',
    icon: 'fas fa-hat-wizard',
    scope: 'world',
    type: SpellListManager,
    restricted: true
  });

  /** Register compendium selection dialog menu launcher */
  game.settings.registerMenu(MODULE.ID, 'compendiumSelection', {
    name: 'SPELLBOOK.Settings.CompendiumSelectionName',
    hint: 'SPELLBOOK.Settings.CompendiumSelectionHint',
    label: 'SPELLBOOK.Settings.CompendiumSelectionButton',
    icon: 'fas fa-books',
    scope: 'world',
    type: CompendiumSelectionDialog,
    restricted: true
  });

  // ========================================//
  //  Core Functionality                     //
  // ========================================//

  /** Indexed compendiums configuration for spell data caching */
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

  /** Enable/disable spell usage analytics tracking */
  game.settings.register(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING, {
    name: 'SPELLBOOK.Settings.EnableSpellUsageTracking.Name',
    hint: 'SPELLBOOK.Settings.EnableSpellUsageTracking.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      ui.notifications.info(value ? game.i18n.localize('SPELLBOOK.Settings.SpellUsageTrackingEnabled') : game.i18n.localize('SPELLBOOK.Settings.SpellUsageTrackingDisabled'));
    }
  });

  /** Custom spell list mappings for class-specific spell lists */
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

  /** Setup mode for module configuration and initial setup */
  game.settings.register(MODULE.ID, SETTINGS.SETUP_MODE, {
    name: 'SPELLBOOK.Settings.SetupMode.Name',
    hint: 'SPELLBOOK.Settings.SetupMode.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  if (game.modules.get('chris-premades')?.active) {
    /** Enable Cauldron of Plentiful Resources compatibility */
    game.settings.register(MODULE.ID, SETTINGS.CPR_COMPATIBILITY, {
      name: 'SPELLBOOK.Settings.CPRCompatibility.Name',
      hint: 'SPELLBOOK.Settings.CPRCompatibility.Hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => {
        const status = value ? 'enabled' : 'disabled';
        ui.notifications.info(game.i18n.format('SPELLBOOK.Settings.CPRCompatibility.Changed', { status }));
      }
    });
  }

  // ========================================//
  //  UI & UX                                //
  // ========================================//

  /** Spell book window position and size preferences */
  game.settings.register(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION, {
    name: 'SPELLBOOK.Settings.SpellBookPosition.Name',
    hint: 'SPELLBOOK.Settings.SpellBookPosition.Hint',
    scope: 'client',
    config: false,
    type: Object,
    default: {}
  });

  /** Position sidebar controls at bottom of interface */
  game.settings.register(MODULE.ID, SETTINGS.SIDEBAR_CONTROLS_BOTTOM, {
    name: 'SPELLBOOK.Settings.SidebarControlsBottom.Name',
    hint: 'SPELLBOOK.Settings.SidebarControlsBottom.Hint',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false
  });

  /** Enable spell list manager button in journal directory */
  game.settings.register(MODULE.ID, SETTINGS.ENABLE_JOURNAL_BUTTON, {
    name: 'SPELLBOOK.Settings.EnableJournalButton.Name',
    hint: 'SPELLBOOK.Settings.EnableJournalButton.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  /** Maximum number of spells allowed in comparison view */
  game.settings.register(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX, {
    name: 'SPELLBOOK.Settings.SpellComparisonMax.Name',
    hint: 'SPELLBOOK.Settings.SpellComparisonMax.Hint',
    scope: 'world',
    config: true,
    type: Number,
    default: 3,
    range: { min: 2, max: 7, step: 1 }
  });

  /** Wizard book icon color customization */
  game.settings.register(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.WizardBookIconColor',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.ColorField({
      required: false,
      nullable: true,
      blank: true,
      initial: null,
      label: 'SPELLBOOK.Settings.DetailsCustomization.WizardBookIconColor'
    }),
    default: null
  });

  /** Advanced search prefix character configuration */
  game.settings.register(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX, {
    name: 'SPELLBOOK.Settings.AdvancedSearchPrefix.Name',
    hint: 'SPELLBOOK.Settings.AdvancedSearchPrefix.Hint',
    scope: 'client',
    config: true,
    type: String,
    default: '^',
    onChange: (value) => {
      try {
        if (value.length !== 1) {
          log(2, 'Advanced search prefix must be exactly 1 character, resetting to default');
          game.settings.set(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX, '^');
          ui.notifications.warn('Advanced search prefix must be exactly 1 character');
          return;
        }
        if (/[\dA-Za-z]/.test(value)) {
          log(2, 'Advanced search prefix cannot be a letter or number, resetting to default');
          game.settings.set(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX, '^');
          ui.notifications.warn('Advanced search prefix cannot be a letter or number');
          return;
        }
        log(3, `Advanced search prefix changed to "${value}"`);
        ui.notifications.info(`Advanced search prefix updated to "${value}"`);
      } catch (error) {
        log(1, 'Error validating advanced search prefix:', error);
        game.settings.set(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX, '^');
      }
    }
  });

  // ========================================//
  //  Spell Behavior                         //
  // ========================================//

  /** Spellcasting rule set selection (legacy vs modern) */
  game.settings.register(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET, {
    name: 'SPELLBOOK.Settings.SpellcastingRuleSet.Name',
    hint: 'SPELLBOOK.Settings.SpellcastingRuleSet.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      [MODULE.RULE_SETS.LEGACY]: 'SPELLBOOK.Settings.SpellcastingRuleSet.Legacy',
      [MODULE.RULE_SETS.MODERN]: 'SPELLBOOK.Settings.SpellcastingRuleSet.Modern'
    },
    default: MODULE.RULE_SETS.LEGACY,
    onChange: () => {
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Settings.RuleSetChanged'));
    }
  });

  /** Default enforcement behavior for spell preparation rules */
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

  /** Whether to consume scrolls when learning spells from them */
  game.settings.register(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING, {
    name: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Name',
    hint: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  /** Disable long rest spell swap prompts */
  game.settings.register(MODULE.ID, SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT, {
    name: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Name',
    hint: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  });

  /** Cantrip scaling value configuration for damage calculations */
  game.settings.register(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES, {
    name: 'SPELLBOOK.Settings.CantripScaleValues.Name',
    hint: 'SPELLBOOK.Settings.CantripScaleValues.Hint',
    scope: 'world',
    config: true,
    type: String,
    default: 'cantrips-known, cantrips'
  });

  // ========================================//
  //  Notes & Annotations                    //
  // ========================================//

  /** Spell notes injection into spell descriptions */
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

  /** Maximum length for spell notes */
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

  // ========================================//
  //  UI Customization                       //
  // ========================================//

  /** Spell details customization menu launcher */
  game.settings.registerMenu(MODULE.ID, 'spellDetailsCustomization', {
    name: 'SPELLBOOK.Settings.DetailsCustomization.MenuName',
    hint: 'SPELLBOOK.Settings.DetailsCustomization.MenuHint',
    icon: 'fa-solid fa-palette',
    label: 'SPELLBOOK.Settings.DetailsCustomization.MenuLabel',
    type: SpellDetailsCustomization,
    restricted: false
  });

  /** Player UI element visibility settings */
  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Favorites',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_COMPARE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Compare',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_NOTES, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Notes',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_SPELL_LEVEL, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevel',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_COMPONENTS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Components',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_SCHOOL, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.School',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_CASTING_TIME, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.CastingTime',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_RANGE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Range',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_DAMAGE_TYPES, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypes',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_CONDITIONS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Conditions',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_SAVE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Save',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_CONCENTRATION, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Concentration',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_MATERIAL_COMPONENTS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponents',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  /** GM UI element visibility settings */
  game.settings.register(MODULE.ID, SETTINGS.GM_UI_COMPARE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Compare',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_SPELL_LEVEL, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevel',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_COMPONENTS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Components',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_SCHOOL, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.School',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_CASTING_TIME, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.CastingTime',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_RANGE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Range',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_DAMAGE_TYPES, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypes',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_CONDITIONS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Conditions',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_SAVE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Save',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_CONCENTRATION, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Concentration',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_MATERIAL_COMPONENTS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponents',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  // ========================================//
  //  Party Spell Tracking                   //
  // ========================================//

  /** Available focus options for party spell coordination */
  game.settings.register(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS, {
    name: 'SPELLBOOK.Settings.FocusOptions.Name',
    hint: 'SPELLBOOK.Settings.FocusOptions.Hint',
    scope: 'world',
    config: false,
    type: Array,
    default: MODULE.DEFAULT_FOCUSES
  });

  /** Token limit for party mode display */
  game.settings.register(MODULE.ID, SETTINGS.PARTY_MODE_TOKEN_LIMIT, {
    name: 'SPELLBOOK.Settings.PartyModeTokenLimit.Name',
    hint: 'SPELLBOOK.Settings.PartyModeTokenLimit.Hint',
    scope: 'client',
    config: true,
    type: Number,
    default: 4,
    range: { min: 2, max: 8, step: 1 }
  });

  // ========================================//
  //  Technical                              //
  // ========================================//

  /** Filter configuration for spell browser interface */
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

  /** Hidden spell lists configuration */
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

  /** Suppress migration warnings setting */
  game.settings.register(MODULE.ID, SETTINGS.SUPPRESS_MIGRATION_WARNINGS, {
    name: 'SPELLBOOK.Settings.SuppressMigrationWarnings.Name',
    hint: 'SPELLBOOK.Settings.SuppressMigrationWarnings.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  // ========================================//
  //  Troubleshooting                        //
  // ========================================//

  /** Troubleshooter menu launcher for diagnostic reports */
  game.settings.registerMenu(MODULE.ID, 'troubleshooterMenu', {
    name: 'SPELLBOOK.Settings.Troubleshooter.Menu.Name',
    hint: 'SPELLBOOK.Settings.Troubleshooter.Menu.Hint',
    label: 'SPELLBOOK.Settings.Troubleshooter.GenerateReport',
    icon: 'fas fa-bug',
    scope: 'world',
    type: SpellBookTroubleshooter,
    restricted: true
  });

  /** Include actor data in troubleshooter reports */
  game.settings.register(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS, {
    scope: 'client',
    config: false,
    type: Boolean,
    default: false
  });

  /** Logging level configuration for debug output */
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
