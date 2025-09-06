import { MODULE, SETTINGS } from './constants/_module.mjs';

/**
 * Log level enumeration for filtering and categorization
 * @typedef {1 | 2 | 3} LogLevel
 * 1 = Error messages only
 * 2 = Warnings and errors
 * 3 = Verbose (all messages including debug)
 */

/**
 * Log entry structure for the console history
 * @typedef {Object} LogEntry
 * @property {LogType} type The type of log entry
 * @property {string} timestamp Formatted timestamp (HH:MM:SS)
 * @property {LogLevel} level Numeric log level
 * @property {Array<*>} content The logged content items
 */

/**
 * Log type strings for categorization
 * @typedef {"error" | "warn" | "debug"} LogType
 */

/**
 * Console method mapping for different log levels
 * @typedef {Object} ConsoleMethodMap
 * @property {Function} 1 Console error method
 * @property {Function} 2 Console warn method
 * @property {Function} 3 Console debug method
 */

/**
 * Caller information extracted from stack trace
 * @typedef {Object} CallerInfo
 * @property {string} className The class name of the calling method
 * @property {string} methodName The method name that called the logger
 * @property {string} formatted Formatted caller string for display
 */

/**
 * Global console logs array stored on window object
 * @typedef {LogEntry[]} ConsoleLogsArray
 */

// ========== LOGGER IMPLEMENTATION ==========

/**
 * Custom logger with caller context information and persistent history.
 *
 * Provides enhanced logging capabilities including:
 * - Automatic caller context detection
 * - Configurable log levels with filtering
 * - Persistent log history with rotation
 * - Integration with Foundry VTT settings system
 * - Stack trace analysis for debugging
 *
 * Log Levels:
 * - 1: Error messages only (critical issues)
 * - 2: Warnings and errors (potential problems)
 * - 3: Verbose logging (all messages including debug info)
 *
 * @param {LogLevel} level Log level (1=error, 2=warning, 3=verbose)
 * @param {...*} args Content to log to console
 * @returns {void}
 */
export function log(level, ...args) {
  try {
    const callerInfo = _extractCallerInfo();
    if (typeof args[0] === 'string') args[0] = callerInfo.formatted + args[0];
    else args.unshift(callerInfo.formatted);
    const timestamp = _formatTimestamp();
    const logEntry = { type: _getLogType(level), timestamp, level, content: [...args] };
    _addToLogHistory(logEntry);
    const configuredLogLevel = MODULE.LOG_LEVEL;
    if (configuredLogLevel > 0 && level <= configuredLogLevel) _outputToConsole(level, args);
  } catch (error) {
    console.error(`${MODULE.ID} | Logger error:`, error);
    console.error(`${MODULE.ID} | Original log:`, ...args);
  }
}

/**
 * Initialize the logger with current module settings.
 * Reads the configured log level and applies it to the module.
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

/**
 * Extract caller information from the current stack trace.
 * Attempts to identify the class and method that called the logger.
 * @returns {CallerInfo} Caller information object
 * @private
 */
function _extractCallerInfo() {
  try {
    const stack = new Error().stack.split('\n');
    if (stack.length > 2) {
      const callerLine = stack[2].trim();
      const callerMatch = callerLine.match(/at\s+([^.]+)\.(\w+)/);
      if (callerMatch) return { className: callerMatch[1], methodName: callerMatch[2], formatted: `[${callerMatch[1]}.${callerMatch[2]}] : ` };
    }
    return { className: 'Unknown', methodName: 'unknown', formatted: '' };
  } catch (error) {
    return { className: 'Error', methodName: 'extracting', formatted: '[Error extracting caller] : ' };
  }
}

/**
 * Format current time as HH:MM:SS string.
 * @returns {string} Formatted timestamp string
 * @private
 */
function _formatTimestamp() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

/**
 * Convert numeric log level to log type string.
 * @param {LogLevel} level Numeric log level
 * @returns {LogType} Log type string
 * @private
 */
function _getLogType(level) {
  switch (level) {
    case 1:
      return 'error';
    case 2:
      return 'warn';
    case 3:
    default:
      return 'debug';
  }
}

/**
 * Add log entry to persistent history with automatic rotation.
 * Maintains a maximum of 2000 log entries to prevent memory issues.
 * @param {LogEntry} logEntry The log entry to add to history
 * @returns {void}
 * @private
 */
function _addToLogHistory(logEntry) {
  if (!window.console_logs) window.console_logs = [];
  if (window.console_logs.length > 2000) window.console_logs.shift();
  window.console_logs.push(logEntry);
}

/**
 * Output log message to appropriate console method based on level.
 * @param {LogLevel} level Log level determining console method
 * @param {Array<*>} args Arguments to pass to console method
 * @returns {void}
 * @private
 */
function _outputToConsole(level, args) {
  const prefix = `${MODULE.ID} |`;
  switch (level) {
    case 1:
      console.error(prefix, ...args);
      break;
    case 2:
      console.warn(prefix, ...args);
      break;
    case 3:
    default:
      console.debug(prefix, ...args);
      break;
  }
}
