import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { MODULE, SETTINGS } from './constants.mjs';
import { SpellDescriptionInjection } from './helpers/spell-description-injection.mjs';
import { log } from './logger.mjs';

/**
 * Register all module settings
 */
export function registerSettings() {
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

  game.settings.register(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION, {
    name: 'SPELLBOOK.Settings.SpellBookPosition.Name',
    hint: 'SPELLBOOK.Settings.SpellBookPosition.Hint',
    scope: 'client',
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE.ID, SETTINGS.DISTANCE_UNIT, {
    name: 'SPELLBOOK.Settings.DistanceUnit.Name',
    hint: 'SPELLBOOK.Settings.DistanceUnit.Hint',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      feet: 'SPELLBOOK.Settings.DistanceUnit.Feet',
      meters: 'SPELLBOOK.Settings.DistanceUnit.Meters'
    },
    default: 'feet'
  });

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

  game.settings.registerMenu(MODULE.ID, SETTINGS.OPEN_SPELL_MANAGER, {
    name: 'SPELLBOOK.Settings.OpenSpellListManager.Name',
    hint: 'SPELLBOOK.Settings.OpenSpellListManager.Hint',
    label: 'SPELLBOOK.Settings.OpenSpellListManager.Button',
    icon: 'fas fa-hat-wizard',
    scope: 'world',
    type: GMSpellListManager,
    restricted: true
  });

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
    onChange: (value) => {
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Settings.RuleSetChanged'));
    }
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

  game.settings.register(MODULE.ID, SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT, {
    name: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Name',
    hint: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE.ID, SETTINGS.ENABLE_JOURNAL_BUTTON, {
    name: 'SPELLBOOK.Settings.EnableJournalButton.Name',
    hint: 'SPELLBOOK.Settings.EnableJournalButton.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      if (game.user.isGM) ui.sidebar.render(true);
    }
  });

  game.settings.register(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES, {
    name: 'SPELLBOOK.Settings.CantripScaleValues.Name',
    hint: 'SPELLBOOK.Settings.CantripScaleValues.Hint',
    scope: 'world',
    config: true,
    type: String,
    default: 'cantrips-known, cantrips',
    onChange: (value) => {
      try {
        const scaleValues = value
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
        if (scaleValues.length === 0) {
          log(2, 'Cantrip scale values setting cannot be empty, resetting to default');
          game.settings.set(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES, 'cantrips-known, cantrips');
        }
      } catch (error) {
        log(1, 'Error validating cantrip scale values setting:', error);
      }
    }
  });

  game.settings.register(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING, {
    name: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Name',
    hint: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
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

  game.settings.register(MODULE.ID, SETTINGS.LAZY_BATCH_SIZE, {
    name: 'SPELLBOOK.Settings.LazyBatchSize.Name',
    hint: 'SPELLBOOK.Settings.LazyBatchSize.Hint',
    scope: 'client',
    config: true,
    type: Number,
    default: MODULE.BATCHING.SIZE,
    range: {
      min: 20,
      max: 250,
      step: 10
    },
    onChange: (value) => {
      MODULE.BATCHING.SIZE = value;
      log(3, `Lazy batch size changed to ${value}`);
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
      await SpellDescriptionInjection.handleSettingChange(value);
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
      ui.notifications.info(value ? game.i18n.localize('SPELLBOOK.Settings.SpellUsageTrackingEnabled') : game.i18n.localize('SPELLBOOK.Settings.SpellUsageTrackingDisabled'));
    }
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
        if (/[a-zA-Z0-9]/.test(value)) {
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
}
