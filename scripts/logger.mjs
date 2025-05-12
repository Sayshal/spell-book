import { MODULE, SETTINGS } from './constants.mjs';

/**
 * Custom logger with caller context information
 * @param {number} level - Log level (1=error, 2=warning, 3=verbose)
 * @param {...any} args - Content to log to console
 * @returns {void}
 */
export function log(level, ...args) {
  try {
    // Get calling context using Error stack trace
    const stack = new Error().stack.split('\n');
    let callerInfo = '';

    if (stack.length > 2) {
      const callerLine = stack[2].trim();
      const callerMatch = callerLine.match(/at\s+([^.]+)\.(\w+)/);
      if (callerMatch) {
        callerInfo = `[${callerMatch[1]}.${callerMatch[2]}] : `;
      }
    }

    // Prepend caller info to first argument if it's a string
    if (typeof args[0] === 'string') {
      args[0] = callerInfo + args[0];
    } else {
      // Insert caller info as first argument
      args.unshift(callerInfo);
    }

    // Record log entry for debugging
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const logEntry = {
      type:
        level === 1 ? 'error'
        : level === 2 ? 'warn'
        : 'debug',
      timestamp,
      level,
      content: args
    };

    // Initialize global log store if needed
    if (!window.console_logs) window.console_logs = [];

    // Only keep the last 2000 logs to prevent memory issues
    if (window.console_logs.length > 2000) {
      window.console_logs.shift();
    }

    window.console_logs.push(logEntry);

    // Check if we should output to console based on log level setting
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
    // Fallback if logger itself has an error
    console.error(`${MODULE.ID} | Logger error:`, error);
    console.error(`${MODULE.ID} | Original log:`, ...args);
  }
}

/**
 * Initialize the logger with current settings
 */
export function initializeLogger() {
  try {
    const logLevel = game.settings.get(MODULE.ID, SETTINGS.LOGGING_LEVEL);
    MODULE.LOG_LEVEL = parseInt(logLevel) || 0;
    log(3, `Logger initialized with level ${MODULE.LOG_LEVEL}`);
  } catch (error) {
    console.error(`${MODULE.ID} | Error initializing logger:`, error);
    MODULE.LOG_LEVEL = 1; // Default to errors only if there's a problem
  }
}
