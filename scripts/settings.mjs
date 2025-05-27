import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import {
  CANTRIP_RULES,
  CANTRIP_SWAP_TIMING,
  DEFAULT_FILTER_CONFIG,
  ENFORCEMENT_BEHAVIOR,
  MODULE,
  RITUAL_CASTING_MODES,
  RULE_SETS,
  SETTINGS,
  SPELL_SWAP_MODES
} from './constants.mjs';
import { log } from './logger.mjs';

/**
 * Register all module settings
 */
export function registerSettings() {
  try {
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

    game.settings.register(MODULE.ID, SETTINGS.ENABLE_REST_PROMPT, {
      name: 'SPELLBOOK.Settings.EnableRestPrompt.Name',
      hint: 'SPELLBOOK.Settings.EnableRestPrompt.Hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
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
      default: DEFAULT_FILTER_CONFIG,
      onChange: (value) => {
        try {
          if (!Array.isArray(value)) {
            log(2, 'Invalid filter configuration format, resetting to default');
            game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, DEFAULT_FILTER_CONFIG);
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

    game.settings.register(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_RULES, {
      name: 'SPELLBOOK.Settings.DefaultCantripRules.Name',
      hint: 'SPELLBOOK.Settings.DefaultCantripRules.Hint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        [CANTRIP_RULES.LEGACY]: 'SPELLBOOK.Cantrips.RulesLegacy',
        [CANTRIP_RULES.MODERN_LEVEL_UP]: 'SPELLBOOK.Cantrips.RulesModernLevelUp',
        [CANTRIP_RULES.MODERN_LONG_REST]: 'SPELLBOOK.Cantrips.RulesModernLongRest'
      },
      default: CANTRIP_RULES.LEGACY
    });

    game.settings.register(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR, {
      name: 'SPELLBOOK.Settings.DefaultEnforcementBehavior.Name',
      hint: 'SPELLBOOK.Settings.DefaultEnforcementBehavior.Hint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        [ENFORCEMENT_BEHAVIOR.UNENFORCED]: 'SPELLBOOK.Cantrips.BehaviorUnenforced',
        [ENFORCEMENT_BEHAVIOR.NOTIFY_GM]: 'SPELLBOOK.Cantrips.BehaviorNotifyGM',
        [ENFORCEMENT_BEHAVIOR.ENFORCED]: 'SPELLBOOK.Cantrips.BehaviorEnforced'
      },
      default: ENFORCEMENT_BEHAVIOR.NOTIFY_GM
    });

    game.settings.register(MODULE.ID, SETTINGS.DISABLE_CANTRIP_SWAP_PROMPT, {
      name: 'SPELLBOOK.Settings.DisableCantripSwapPrompt.Name',
      hint: 'SPELLBOOK.Settings.DisableCantripSwapPrompt.Hint',
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

    game.settings.register(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET, {
      name: 'SPELLBOOK.Settings.SpellcastingRuleSet.Name',
      hint: 'SPELLBOOK.Settings.SpellcastingRuleSet.Hint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        [RULE_SETS.LEGACY]: 'SPELLBOOK.Settings.SpellcastingRuleSet.Legacy',
        [RULE_SETS.MODERN]: 'SPELLBOOK.Settings.SpellcastingRuleSet.Modern'
      },
      default: RULE_SETS.LEGACY,
      onChange: (value) => {
        ui.notifications.info(game.i18n.localize('SPELLBOOK.Settings.RuleSetChanged'));
      }
    });

    game.settings.register(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_SWAPPING, {
      name: 'SPELLBOOK.Settings.DefaultCantripSwapping.Name',
      hint: 'SPELLBOOK.Settings.DefaultCantripSwapping.Hint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        [CANTRIP_SWAP_TIMING.NONE]: 'SPELLBOOK.Settings.CantripSwapping.None',
        [CANTRIP_SWAP_TIMING.LEVEL_UP]: 'SPELLBOOK.Settings.CantripSwapping.LevelUp',
        [CANTRIP_SWAP_TIMING.LONG_REST]: 'SPELLBOOK.Settings.CantripSwapping.LongRest'
      },
      default: CANTRIP_SWAP_TIMING.NONE
    });

    game.settings.register(MODULE.ID, SETTINGS.DEFAULT_SPELL_SWAPPING, {
      name: 'SPELLBOOK.Settings.DefaultSpellSwapping.Name',
      hint: 'SPELLBOOK.Settings.DefaultSpellSwapping.Hint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        [SPELL_SWAP_MODES.NONE]: 'SPELLBOOK.Settings.SpellSwapping.None',
        [SPELL_SWAP_MODES.LEVEL_UP]: 'SPELLBOOK.Settings.SpellSwapping.LevelUp',
        [SPELL_SWAP_MODES.LONG_REST]: 'SPELLBOOK.Settings.SpellSwapping.LongRest'
      },
      default: SPELL_SWAP_MODES.LEVEL_UP
    });

    game.settings.register(MODULE.ID, SETTINGS.DEFAULT_RITUAL_CASTING, {
      name: 'SPELLBOOK.Settings.DefaultRitualCasting.Name',
      hint: 'SPELLBOOK.Settings.DefaultRitualCasting.Hint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        [RITUAL_CASTING_MODES.NONE]: 'SPELLBOOK.Settings.RitualCasting.None',
        [RITUAL_CASTING_MODES.PREPARED]: 'SPELLBOOK.Settings.RitualCasting.Prepared',
        [RITUAL_CASTING_MODES.ALWAYS]: 'SPELLBOOK.Settings.RitualCasting.Always'
      },
      default: RITUAL_CASTING_MODES.NONE
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
          // Validate the setting by parsing it
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

    log(3, 'Module settings registered');
  } catch (error) {
    log(1, 'Error registering settings:', error);
  }
}
