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
    // Register settings by group
    registerLoggingSettings();
    registerIntegrationSettings();
    registerUISettings();
    registerGMSettings();

    log(3, 'Module settings registered');
  } catch (error) {
    log(1, 'Error registering settings:', error);
  }
}

/**
 * Register logging-related settings
 */
function registerLoggingSettings() {
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
}

/**
 * Register system integration settings
 */
function registerIntegrationSettings() {
  // Rest prompt setting
  game.settings.register(MODULE.ID, SETTINGS_KEYS.ENABLE_REST_PROMPT, {
    name: 'SPELLBOOK.Settings.EnableRestPrompt.Name',
    hint: 'SPELLBOOK.Settings.EnableRestPrompt.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  // Custom spell list mappings (not shown in settings menu)
  game.settings.register(MODULE.ID, SETTINGS_KEYS.CUSTOM_SPELL_MAPPINGS, {
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
          game.settings.set(MODULE.ID, SETTINGS_KEYS.CUSTOM_SPELL_MAPPINGS, {});
        }
      } catch (error) {
        log(1, 'Error validating custom spell mappings:', error);
      }
    }
  });
}

/**
 * Register UI-related settings
 */
function registerUISettings() {
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

  // Filter configuration (not shown in settings menu)
  game.settings.register(MODULE.ID, SETTINGS_KEYS.FILTER_CONFIGURATION, {
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
          game.settings.set(MODULE.ID, SETTINGS_KEYS.FILTER_CONFIGURATION, DEFAULT_FILTER_CONFIG);
        }
      } catch (error) {
        log(1, 'Error validating filter configuration:', error);
      }
    }
  });
}

/**
 * Register GM-specific settings
 */
function registerGMSettings() {
  // Spell manager page size setting
  game.settings.register(MODULE.ID, SETTINGS_KEYS.SPELL_MANAGER_PAGE_SIZE, {
    name: 'SPELLBOOK.Settings.SpellManagerPageSize.Name',
    hint: 'SPELLBOOK.Settings.SpellManagerPageSize.Hint',
    scope: 'client',
    config: true,
    type: Number,
    range: {
      min: 25,
      max: 500,
      step: 25
    },
    default: 100,
    // Add validation
    onChange: (value) => {
      try {
        // Ensure value is within valid range
        const numValue = Number(value);
        if (isNaN(numValue) || numValue < 25 || numValue > 500) {
          log(2, 'Invalid page size value, resetting to default');
          game.settings.set(MODULE.ID, SETTINGS_KEYS.SPELL_MANAGER_PAGE_SIZE, 100);
        }
      } catch (error) {
        log(1, 'Error validating page size setting:', error);
      }
    }
  });
}

/**
 * Get the current filter configuration, falling back to default if needed
 * @returns {Array} The current filter configuration
 */
export function getFilterConfiguration() {
  try {
    const config = game.settings.get(MODULE.ID, SETTINGS_KEYS.FILTER_CONFIGURATION);
    return Array.isArray(config) ? config : DEFAULT_FILTER_CONFIG;
  } catch (error) {
    log(1, 'Error getting filter configuration:', error);
    return DEFAULT_FILTER_CONFIG;
  }
}

/**
 * Save the filter configuration
 * @param {Array} config - The new filter configuration
 * @returns {Promise<void>} A promise that resolves when the settings are saved
 */
export async function saveFilterConfiguration(config) {
  try {
    if (!Array.isArray(config)) {
      throw new Error('Invalid filter configuration format');
    }
    await game.settings.set(MODULE.ID, SETTINGS_KEYS.FILTER_CONFIGURATION, config);
    log(3, 'Filter configuration saved');
  } catch (error) {
    log(1, 'Error saving filter configuration:', error);
    throw error;
  }
}
