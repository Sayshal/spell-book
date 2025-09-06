/**
 * Spell Book Module Logger
 *
 * Provides enhanced logging functionality with caller context information,
 * level-based filtering, and persistent log storage. The logger automatically
 * captures caller information from the call stack and maintains a circular
 * buffer of log entries for troubleshooting purposes.
 *
 * Features:
 * - Automatic caller context extraction from stack traces
 * - Level-based log filtering (error, warning, debug)
 * - Persistent log storage in global window object
 * - Timestamp generation for log entries
 * - Configurable log levels through module settings
 *
 * @module Logger
 * @author Tyler
 */

import { MODULE, SETTINGS } from './constants/_module.mjs';

/**
 * Log levels for filtering and categorizing log output.
 *
 * @typedef {1|2|3} LogLevel
 * @description
 * - 1: Error level - Critical errors only
 * - 2: Warning level - Errors and warnings
 * - 3: Debug level - All messages including verbose debug info
 */

/**
 * Log entry structure stored in the global console log buffer.
 *
 * @typedef {Object} LogEntry
 * @property {'error'|'warn'|'debug'} type - Type of log entry based on level
 * @property {string} timestamp - HH:MM:SS formatted timestamp
 * @property {LogLevel} level - Numeric log level (1=error, 2=warn, 3=debug)
 * @property {Array<*>} content - Array of arguments passed to the log function
 */

/**
 * Enhanced logging function with automatic caller context detection.
 *
 * This function provides level-based logging with automatic extraction of caller
 * information from the JavaScript call stack. It maintains a persistent log buffer
 * and respects the configured log level for console output.
 *
 * The function automatically prepends caller context (class.method) to log messages
 * and stores all log entries in a global buffer for troubleshooting, regardless
 * of the current log level setting.
 *
 * @param {LogLevel} level - Log level (1=error, 2=warning, 3=verbose)
 * @param {...*} args - Content to log to console (any number of arguments)
 */
export function log(level, ...args) {
  try {
    const stack = new Error().stack.split('\n');
    let callerInfo = '';
    if (stack.length > 2) {
      const callerLine = stack[2].trim();
      const callerMatch = callerLine.match(/at\s+([^.]+)\.(\w+)/);
      if (callerMatch) callerInfo = `[${callerMatch[1]}.${callerMatch[2]}] : `;
    }

    if (typeof args[0] === 'string') args[0] = callerInfo + args[0];
    else args.unshift(callerInfo);
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    /** @type {LogEntry} */
    const logEntry = {
      type: level === 1 ? 'error' : level === 2 ? 'warn' : 'debug',
      timestamp,
      level,
      content: args
    };

    if (!window.console_logs) window.console_logs = [];
    if (window.console_logs.length > 2000) window.console_logs.shift();
    window.console_logs.push(logEntry);
    const configuredLogLevel = MODULE.LOG_LEVEL;
    if (configuredLogLevel > 0 && level <= configuredLogLevel) {
      switch (level) {
        case 1:
          console.error(`${MODULE.ID} |`, ...args);
          break;
        case 2:
          console.warn(`${MODULE.ID} |`, ...args);
          break;
        case 3:
        default:
          console.debug(`${MODULE.ID} |`, ...args);
          break;
      }
    }
  } catch (error) {
    console.error(`${MODULE.ID} | Logger error:`, error);
    console.error(`${MODULE.ID} | Original log:`, ...args);
  }
}

/**
 * Initialize the logger with current game settings.
 *
 * Retrieves the logging level from game settings and updates the module
 * configuration. This function is called during module initialization
 * to ensure the logger respects user preferences.
 *
 * If settings retrieval fails, defaults to error-level logging (level 1)
 * for safety and logs the initialization error.
 *
 * @returns {void}
 */
export function initializeLogger() {
  try {
    const logLevel = game.settings.get(MODULE.ID, SETTINGS.LOGGING_LEVEL);
    MODULE.LOG_LEVEL = parseInt(logLevel) || 0;
    log(3, `Logger initialized with level ${MODULE.LOG_LEVEL}`);
  } catch (error) {
    console.error(`${MODULE.ID} | Error initializing logger:`, error);
    MODULE.LOG_LEVEL = 1;
  }
}
