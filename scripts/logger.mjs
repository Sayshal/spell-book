/**
 * Spell Book Module Logger
 * @module Logger
 * @author Tyler
 */

import { MODULE, SETTINGS } from './constants/_module.mjs';

/**
 * Simple logging function with module ID prefix and colored styling.
 * @param {LogLevel} level - Log level (1=error, 2=warning, 3=verbose)
 * @param {...*} args - Content to log to console (any number of arguments)
 */
export function log(level, ...args) {
  const configuredLogLevel = MODULE.LOG_LEVEL;
  if (configuredLogLevel > 0 && level <= configuredLogLevel) {
    switch (level) {
      case 1:
        console.error(`%c${MODULE.ID}%c |`, 'background: #991b1b; color: white; font-weight: bold; padding: 2px 4px; border-radius: 3px;', 'color: white;', ...args);
        break;
      case 2:
        console.warn(`%c${MODULE.ID}%c |`, 'background: #c2410c; color: black; font-weight: bold; padding: 2px 4px; border-radius: 3px;', 'color: black;', ...args);
        break;
      case 3:
      default:
        console.debug(`%c${MODULE.ID}%c |`, 'background: #7c3aed; color: white; font-weight: bold; padding: 2px 4px; border-radius: 3px;', 'color: white;', ...args);
        break;
    }
  }
}

/**
 * Initialize the logger with current game settings.
 * @returns {void}
 */
export function initializeLogger() {
  try {
    const logLevel = game.settings.get(MODULE.ID, SETTINGS.LOGGING_LEVEL);
    MODULE.LOG_LEVEL = parseInt(logLevel) || 0;
  } catch (error) {
    console.error(`${MODULE.ID} | Error initializing logger:`, error);
    MODULE.LOG_LEVEL = 1;
  }
}
