/**
 * Spell Book Module Settings Registration
 * @module Settings
 * @author Tyler
 */

import { Troubleshooter } from './apps/_module.mjs';
import { MODULE, SETTINGS } from './constants/_module.mjs';
import { CompendiumSelection, DetailsCustomization } from './dialogs/_module.mjs';
import { log } from './logger.mjs';
import * as UIUtils from './ui/_module.mjs';
import * as DataUtils from './data/_module.mjs';

/**
 * Register all module settings with Foundry VTT.
 * @returns {void}
 */
export function registerSettings() {
  // ========================================//
  //  Menus & Classes                        //
  // ========================================//

  /** Register compendium selection dialog menu launcher */
  game.settings.registerMenu(MODULE.ID, 'compendiumSelection', {
    name: 'SPELLBOOK.Settings.CompendiumSelectionName',
    hint: 'SPELLBOOK.Settings.CompendiumSelectionHint',
    label: 'SPELLBOOK.Settings.CompendiumSelectionButton',
    icon: 'fas fa-books',
    scope: 'world',
    type: CompendiumSelection,
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
    type: new foundry.data.fields.ObjectField(),
    onChange: (value) => {
      if (typeof value !== 'object' || value === null) game.settings.set(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS, {});
      DataUtils.invalidatePackIndexCache();
    }
  });

  /** Enable/disable spell usage analytics tracking */
  game.settings.register(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING, {
    name: 'SPELLBOOK.Settings.EnableSpellUsageTracking.Name',
    hint: 'SPELLBOOK.Settings.EnableSpellUsageTracking.Hint',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  /** Custom spell list mappings for class-specific spell lists */
  game.settings.register(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, {
    name: 'SPELLBOOK.Settings.CustomSpellMappings.Name',
    hint: 'SPELLBOOK.Settings.CustomSpellMappings.Hint',
    scope: 'world',
    config: false,
    type: new foundry.data.fields.ObjectField(),
    onChange: (value) => {
      if (typeof value !== 'object' || value === null) game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, {});
    }
  });

  /** Setup mode for module configuration and initial setup */
  game.settings.register(MODULE.ID, SETTINGS.SETUP_MODE, {
    name: 'SPELLBOOK.Settings.SetupMode.Name',
    hint: 'SPELLBOOK.Settings.SetupMode.Hint',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: false }),
    requiresReload: true
  });

  if (game.modules.get('chris-premades')?.active) {
    /** Enable Cauldron of Plentiful Resources compatibility */
    game.settings.register(MODULE.ID, SETTINGS.CPR_COMPATIBILITY, {
      name: 'SPELLBOOK.Settings.CPRCompatibility.Name',
      hint: 'SPELLBOOK.Settings.CPRCompatibility.Hint',
      scope: 'world',
      config: true,
      type: new foundry.data.fields.BooleanField({ initial: false })
    });
  }

  game.settings.register(MODULE.ID, SETTINGS.AUTO_DELETE_UNPREPARED_SPELLS, {
    name: 'SPELLBOOK.Settings.AutoDeleteUnpreparedSpells.Name',
    hint: 'SPELLBOOK.Settings.AutoDeleteUnpreparedSpells.Hint',
    scope: 'user',
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: false })
  });

  // ========================================//
  //  UI & UX                                //
  // ========================================//

  /** Spell book window position and size preferences */
  game.settings.register(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION, {
    name: 'SPELLBOOK.Settings.SpellBookPosition.Name',
    hint: 'SPELLBOOK.Settings.SpellBookPosition.Hint',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.ObjectField()
  });

  /** Position sidebar controls at bottom of interface */
  game.settings.register(MODULE.ID, SETTINGS.SIDEBAR_CONTROLS_BOTTOM, {
    name: 'SPELLBOOK.Settings.SidebarControlsBottom.Name',
    hint: 'SPELLBOOK.Settings.SidebarControlsBottom.Hint',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: false })
  });

  /** Maximum number of spells allowed in comparison view */
  game.settings.register(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX, {
    name: 'SPELLBOOK.Settings.SpellComparisonMax.Name',
    hint: 'SPELLBOOK.Settings.SpellComparisonMax.Hint',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.NumberField({ min: 2, max: 7, step: 1, initial: 3, nullable: false })
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
    })
  });

  /** Advanced search prefix character configuration */
  game.settings.register(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX, {
    name: 'SPELLBOOK.Settings.AdvancedSearchPrefix.Name',
    hint: 'SPELLBOOK.Settings.AdvancedSearchPrefix.Hint',
    scope: 'client',
    config: true,
    type: new foundry.data.fields.StringField({ initial: '^' }),
    onChange: (value) => {
      if (value.length !== 1 || /[\dA-Za-z]/.test(value)) game.settings.set(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX, '^');
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
    type: new foundry.data.fields.StringField({
      choices: {
        [MODULE.RULE_SETS.LEGACY]: 'SPELLBOOK.Settings.SpellcastingRuleSet.Legacy',
        [MODULE.RULE_SETS.MODERN]: 'SPELLBOOK.Settings.SpellcastingRuleSet.Modern'
      },
      initial: MODULE.RULE_SETS.LEGACY
    })
  });

  /** Default enforcement behavior for spell preparation rules */
  game.settings.register(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR, {
    name: 'SPELLBOOK.Settings.DefaultEnforcementBehavior.Name',
    hint: 'SPELLBOOK.Settings.DefaultEnforcementBehavior.Hint',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.StringField({
      choices: {
        [MODULE.ENFORCEMENT_BEHAVIOR.UNENFORCED]: 'SPELLBOOK.Cantrips.BehaviorUnenforced',
        [MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM]: 'SPELLBOOK.Cantrips.BehaviorNotifyGM',
        [MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED]: 'SPELLBOOK.Cantrips.BehaviorEnforced'
      },
      initial: MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM
    })
  });

  /** Whether to consume scrolls when learning spells from them */
  game.settings.register(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING, {
    name: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Name',
    hint: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Hint',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  /** Whether to deduct gold cost when learning spells */
  game.settings.register(MODULE.ID, SETTINGS.DEDUCT_SPELL_LEARNING_COST, {
    name: 'SPELLBOOK.Settings.DeductSpellLearningCost.Name',
    hint: 'SPELLBOOK.Settings.DeductSpellLearningCost.Hint',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: false })
  });

  /** Disable long rest spell swap prompts */
  game.settings.register(MODULE.ID, SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT, {
    name: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Name',
    hint: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Hint',
    scope: 'client',
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: false })
  });

  /** Cantrip scaling value configuration for damage calculations */
  game.settings.register(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES, {
    name: 'SPELLBOOK.Settings.CantripScaleValues.Name',
    hint: 'SPELLBOOK.Settings.CantripScaleValues.Hint',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.StringField({ initial: 'cantrips-known, cantrips' })
  });

  /** Registry-enabled spell lists for D&D 5e SpellListRegistry integration */
  game.settings.register(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS, {
    name: game.i18n.localize('SPELLBOOK.Settings.RegistryEnabledLists.Name'),
    hint: game.i18n.localize('SPELLBOOK.Settings.RegistryEnabledLists.Hint'),
    scope: 'world',
    config: false,
    type: new foundry.data.fields.ArrayField(new foundry.data.fields.StringField()),
    onChange: async () => {
      await DataUtils.registerCustomSpellLists();
    }
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
    type: new foundry.data.fields.StringField({
      choices: {
        off: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Off',
        before: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Before',
        after: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.After'
      },
      initial: 'off'
    }),
    onChange: async (value) => {
      await UIUtils.DescriptionInjector.handleSettingChange(value);
    }
  });

  /** Maximum length for spell notes */
  game.settings.register(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH, {
    name: 'SPELLBOOK.Settings.NotesMaxLength.Name',
    hint: 'SPELLBOOK.Settings.NotesMaxLength.Hint',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.NumberField({ min: 10, max: 1000, step: 10, initial: 240, nullable: false })
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
    type: DetailsCustomization,
    restricted: false
  });

  /** Player UI element visibility settings */
  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Favorites',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_COMPARE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Compare',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_NOTES, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Notes',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_SPELL_LEVEL, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevel',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_COMPONENTS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Components',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_SCHOOL, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.School',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_CASTING_TIME, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.CastingTime',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_RANGE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Range',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_DAMAGE_TYPES, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypes',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_CONDITIONS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Conditions',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_SAVE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Save',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_CONCENTRATION, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Concentration',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.PLAYER_UI_MATERIAL_COMPONENTS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponents',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  /** GM UI element visibility settings */
  game.settings.register(MODULE.ID, SETTINGS.GM_UI_COMPARE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Compare',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_SPELL_LEVEL, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevel',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_COMPONENTS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Components',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_SCHOOL, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.School',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_CASTING_TIME, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.CastingTime',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_RANGE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Range',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_DAMAGE_TYPES, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypes',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_CONDITIONS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Conditions',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_SAVE, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Save',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_CONCENTRATION, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.Concentration',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
  });

  game.settings.register(MODULE.ID, SETTINGS.GM_UI_MATERIAL_COMPONENTS, {
    name: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponents',
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: true })
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
    type: new foundry.data.fields.ObjectField({ initial: { focuses: MODULE.DEFAULT_FOCUSES } })
  });

  /** Token limit for party mode display */
  game.settings.register(MODULE.ID, SETTINGS.PARTY_MODE_TOKEN_LIMIT, {
    name: 'SPELLBOOK.Settings.PartyModeTokenLimit.Name',
    hint: 'SPELLBOOK.Settings.PartyModeTokenLimit.Hint',
    scope: 'client',
    config: true,
    type: new foundry.data.fields.NumberField({ min: 2, max: 8, step: 1, initial: 4, nullable: false })
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
    type: new foundry.data.fields.ObjectField({ initial: { version: MODULE.DEFAULT_FILTER_CONFIG_VERSION, filters: MODULE.DEFAULT_FILTER_CONFIG } }),
    onChange: (value) => {
      if (!value || !Array.isArray(value.filters)) {
        game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, { version: MODULE.DEFAULT_FILTER_CONFIG_VERSION, filters: MODULE.DEFAULT_FILTER_CONFIG });
      }
    }
  });

  /** Hidden spell lists configuration */
  game.settings.register(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, {
    name: 'SPELLBOOK.Settings.HiddenSpellLists.Name',
    hint: 'SPELLBOOK.Settings.HiddenSpellLists.Hint',
    scope: 'world',
    config: false,
    type: new foundry.data.fields.ArrayField(new foundry.data.fields.StringField()),
    onChange: (value) => {
      if (!Array.isArray(value)) game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, []);
    }
  });

  /** Suppress migration warnings setting */
  game.settings.register(MODULE.ID, SETTINGS.SUPPRESS_MIGRATION_WARNINGS, {
    name: 'SPELLBOOK.Settings.SuppressMigrationWarnings.Name',
    hint: 'SPELLBOOK.Settings.SuppressMigrationWarnings.Hint',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: false })
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
    type: Troubleshooter,
    restricted: true
  });

  /** Include actor data in troubleshooter reports */
  game.settings.register(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS, {
    scope: 'client',
    config: false,
    type: new foundry.data.fields.BooleanField({ initial: false })
  });

  /** Logging level configuration for debug output */
  game.settings.register(MODULE.ID, SETTINGS.LOGGING_LEVEL, {
    name: 'SPELLBOOK.Settings.Logger.Name',
    hint: 'SPELLBOOK.Settings.Logger.Hint',
    scope: 'client',
    config: true,
    type: new foundry.data.fields.StringField({
      choices: {
        0: 'SPELLBOOK.Settings.Logger.Choices.Off',
        1: 'SPELLBOOK.Settings.Logger.Choices.Errors',
        2: 'SPELLBOOK.Settings.Logger.Choices.Warnings',
        3: 'SPELLBOOK.Settings.Logger.Choices.Verbose'
      },
      initial: 2
    }),
    onChange: (value) => {
      MODULE.LOG_LEVEL = parseInt(value);
    }
  });
  log(3, 'Module settings registered.');
}
