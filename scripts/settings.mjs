import { GMSpellListManager } from './apps/gm-spell-list-manager.mjs';
import { CANTRIP_CHANGE_BEHAVIOR, CANTRIP_RULES, DEFAULT_FILTER_CONFIG, MODULE, SETTINGS } from './constants.mjs';
import { log } from './logger.mjs';

/**
 * Register all module settings
 */
export function registerSettings() {
  try {
    // Logging level setting
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

    // Rest prompt setting
    game.settings.register(MODULE.ID, SETTINGS.ENABLE_REST_PROMPT, {
      name: 'SPELLBOOK.Settings.EnableRestPrompt.Name',
      hint: 'SPELLBOOK.Settings.EnableRestPrompt.Hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // Custom spell list mappings (not shown in settings menu)
    game.settings.register(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, {
      name: 'Custom Spell List Mappings',
      hint: 'Mappings between original and custom spell lists',
      scope: 'world',
      config: false,
      type: Object,
      default: {},
      // Add validation to ensure proper structure
      onChange: (value) => {
        try {
          // Simple validation to ensure it's an object
          if (typeof value !== 'object' || value === null) {
            log(2, 'Invalid custom spell mappings format, resetting to default');
            game.settings.set(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS, {});
          }
        } catch (error) {
          log(1, 'Error validating custom spell mappings:', error);
        }
      }
    });

    // Distance unit setting (affects range filter)
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

    // Filter configuration (not shown in settings menu)
    game.settings.register(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, {
      name: 'Filter Configuration',
      hint: 'Configure which filters are enabled and their display order',
      scope: 'client',
      config: false,
      type: Object,
      default: DEFAULT_FILTER_CONFIG,
      // Add validation
      onChange: (value) => {
        try {
          // Ensure value is an array
          if (!Array.isArray(value)) {
            log(2, 'Invalid filter configuration format, resetting to default');
            game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, DEFAULT_FILTER_CONFIG);
          }
        } catch (error) {
          log(1, 'Error validating filter configuration:', error);
        }
      }
    });

    // Add Spell List Manager button
    game.settings.registerMenu(MODULE.ID, SETTINGS.OPEN_SPELL_MANAGER, {
      name: 'SPELLBOOK.Settings.OpenSpellListManager.Name',
      hint: 'SPELLBOOK.Settings.OpenSpellListManager.Hint',
      label: 'SPELLBOOK.Settings.OpenSpellListManager.Button',
      icon: 'fas fa-hat-wizard',
      scope: 'world',
      type: GMSpellListManager,
      restricted: true
    });

    /* Cantrip Settings */
    game.settings.register(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_RULES, {
      name: 'SPELLBOOK.Settings.DefaultCantripRules',
      hint: 'SPELLBOOK.Settings.DefaultCantripRulesHint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        [CANTRIP_RULES.DEFAULT]: 'SPELLBOOK.Cantrips.RulesDefault',
        [CANTRIP_RULES.MODERN]: 'SPELLBOOK.Cantrips.RulesModern'
      },
      default: CANTRIP_RULES.DEFAULT
    });

    game.settings.register(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_BEHAVIOR, {
      name: 'SPELLBOOK.Settings.DefaultCantripBehavior',
      hint: 'SPELLBOOK.Settings.DefaultCantripBehaviorHint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        [CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED]: 'SPELLBOOK.Cantrips.BehaviorUnrestricted',
        [CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM]: 'SPELLBOOK.Cantrips.BehaviorNotifyGM',
        [CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX]: 'SPELLBOOK.Cantrips.BehaviorLockAfterMax'
      },
      default: CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM
    });

    log(3, 'Module settings registered');
  } catch (error) {
    log(1, 'Error registering settings:', error);
    log(1, `Fatal error registering settings:`, error);
  }
}
