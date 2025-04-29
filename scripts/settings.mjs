/**
 * Module settings registration
 * Defines user-configurable settings for the Spell Book module
 * @module spell-book/settings
 */

import { DEFAULT_FILTER_CONFIG, MODULE, SETTINGS_KEYS } from './constants.mjs';
import { log } from './logger.mjs';

/**
 * Register all module settings
 */
export function registerSettings() {
  try {
    // Logging level setting
    game.settings.register(MODULE.ID, SETTINGS_KEYS.LOGGING_LEVEL, {
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
        log(2, `Logging level changed to ${MODULE.LOG_LEVEL}`);
      }
    });

    // Rest prompt setting
    game.settings.register(MODULE.ID, SETTINGS_KEYS.ENABLE_REST_PROMPT, {
      name: 'SPELLBOOK.Settings.EnableRestPrompt.Name',
      hint: 'SPELLBOOK.Settings.EnableRestPrompt.Hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // Distance unit setting (affects range filter)
    game.settings.register(MODULE.ID, SETTINGS_KEYS.DISTANCE_UNIT, {
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

    // Filter configuration - not shown in settings menu
    game.settings.register(MODULE.ID, SETTINGS_KEYS.FILTER_CONFIGURATION, {
      name: 'Filter Configuration',
      hint: 'Configure which filters are enabled and their display order',
      scope: 'client',
      config: false,
      type: Object,
      default: DEFAULT_FILTER_CONFIG
    });

    log(3, 'Module settings registered');
  } catch (error) {
    log(1, 'Error registering settings:', error);
  }
}
