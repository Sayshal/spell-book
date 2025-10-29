/**
 * Spell Book Module Logger
 *
 * Provides enhanced logging functionality with caller context information,
 * level-based filtering, and persistent log storage. The logger automatically
 * captures caller file path and line information from the call stack and maintains
 * a circular buffer of log entries for troubleshooting purposes.
 *
 * Features:
 * - Automatic caller file path and line extraction from stack traces
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
 * Enhanced logging function with automatic caller file path detection.
 * @param {LogLevel} level - Log level (1=error, 2=warning, 3=verbose)
 * @param {...*} args - Content to log to console (any number of arguments)
 */
export function log(level, ...args) {
  try {
    const stack = new Error().stack.split('\n');
    let callerInfo = '';
    for (let i = 2; i < Math.min(stack.length, 5); i++) {
      const callerLine = stack[i].trim();
      const extractedInfo = extractCallerInfo(callerLine);
      if (extractedInfo) {
        callerInfo = `[${extractedInfo}] : `;
        break;
      }
    }
    if (!callerInfo) callerInfo = '[Unknown] : ';
    if (typeof args[0] === 'string') args[0] = callerInfo + args[0];
    else args.unshift(callerInfo);
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
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
 * Extract meaningful caller file path and line information from a stack trace line.
 * @param {string} stackLine - Single line from Error.stack
 * @returns {string|null} - File path with line info or null if not extractable
 */
function extractCallerInfo(stackLine) {
  const cleanLine = stackLine.replace(/^\s*at\s+/, '');
  const match = cleanLine.match(/\(.*?\/modules\/spell-book(\/[^)]+)\)$/);
  if (match) return match[1];
  const fallbackMatch = cleanLine.match(/\/modules\/spell-book(\/\S+)/);
  if (fallbackMatch) return fallbackMatch[1];
  return null;
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
