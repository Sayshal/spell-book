import { MODULE, SETTINGS } from './constants.mjs';

/**
 * Custom logger with caller context information and timing capabilities
 * @param {number} level - Log level (1=error, 2=warning, 3=verbose, 4=timing)
 * @param {...any} args - Content to log to console, or for level 4: (label, operation, options)
 */
export function log(level, ...args) {
  try {
    if (level === 4) return handleTimingLog(...args);
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
    const logEntry = {
      type:
        level === 1 ? 'error'
        : level === 2 ? 'warn'
        : 'debug',
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
 * Handle timing operations for log level 4
 * @param {string} label - Description of the operation being timed
 * @param {Function|Promise|any} operation - Function/Promise to time, or data to log
 * @param {Object} [options] - Additional options for timing
 * @returns {Promise<any>|any} - Result of the operation if it was a function/promise
 */
async function handleTimingLog(label, operation, options = {}) {
  const stack = new Error().stack.split('\n');
  let callerInfo = '';

  if (stack.length > 3) {
    const callerLine = stack[3].trim(); // Skip one more level for handleTimingLog
    const callerMatch = callerLine.match(/at\s+([^.]+)\.(\w+)/);
    if (callerMatch) callerInfo = `[${callerMatch[1]}.${callerMatch[2]}] : `;
  }

  // If operation is a function or looks like a promise, time it
  if (typeof operation === 'function' || (operation && typeof operation.then === 'function')) {
    return await timeOperation(label, operation, options, callerInfo);
  } else {
    // Just log timing info
    logTimingInfo(label, operation, options, callerInfo);
  }
}

/**
 * Time a function or promise operation
 * @param {string} label - Operation label
 * @param {Function|Promise} operation - Operation to time
 * @param {Object} options - Timing options
 * @param {string} callerInfo - Caller context
 * @returns {Promise<any>|any} - Operation result
 */
async function timeOperation(label, operation, options, callerInfo) {
  const startTime = performance.now();
  const startMemory = options.trackMemory ? getMemoryUsage() : null;

  let result;
  let error = null;

  try {
    // Handle both functions and promises
    if (typeof operation === 'function') {
      result = await operation();
    } else {
      result = await operation;
    }
  } catch (err) {
    error = err;
    throw err; // Re-throw to maintain error flow
  } finally {
    const endTime = performance.now();
    const duration = endTime - startTime;
    const endMemory = options.trackMemory ? getMemoryUsage() : null;

    logTimingResult(label, duration, {
      callerInfo,
      error: error?.message,
      context: options.context,
      startMemory,
      endMemory
    });
  }

  return result;
}

/**
 * Log timing information without timing an operation
 * @param {string} label - Operation label
 * @param {any} data - Data to log with timing entry
 * @param {Object} options - Timing options
 * @param {string} callerInfo - Caller context
 */
function logTimingInfo(label, data, options, callerInfo) {
  const now = new Date();
  const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

  const timingEntry = {
    type: 'timing',
    timestamp,
    level: 4,
    operation: label,
    content: data,
    context: options.context || null
  };

  // Store in logs
  if (!window.console_logs) window.console_logs = [];
  if (window.console_logs.length > 2000) window.console_logs.shift();
  window.console_logs.push(timingEntry);

  // Console output if timing level is enabled
  const configuredLogLevel = MODULE.LOG_LEVEL;
  if (configuredLogLevel >= 4) {
    console.debug(`${MODULE.ID} | 🕐 ${callerInfo}${label}:`, data);
  }
}

/**
 * Log timing operation results
 * @param {string} label - Operation label
 * @param {number} duration - Duration in milliseconds
 * @param {Object} metadata - Additional timing metadata
 */
function logTimingResult(label, duration, metadata) {
  const now = new Date();
  const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

  const timingEntry = {
    type: 'timing',
    timestamp,
    level: 4,
    operation: label,
    duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
    success: !metadata.error,
    error: metadata.error || null,
    context: metadata.context || null,
    memoryDelta: metadata.startMemory && metadata.endMemory ? metadata.endMemory.usedJSHeapSize - metadata.startMemory.usedJSHeapSize : null
  };

  // Store in logs
  if (!window.console_logs) window.console_logs = [];
  if (window.console_logs.length > 2000) window.console_logs.shift();
  window.console_logs.push(timingEntry);

  // Console output if timing level is enabled
  const configuredLogLevel = MODULE.LOG_LEVEL;
  if (configuredLogLevel >= 4) {
    const durationStr = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration.toFixed(2)}ms`;

    const errorStr = metadata.error ? ` [ERROR: ${metadata.error}]` : '';
    const contextStr = metadata.context ? ` ${JSON.stringify(metadata.context)}` : '';
    const memoryStr = timingEntry.memoryDelta !== null ? ` [Memory: ${formatBytes(timingEntry.memoryDelta)}]` : '';

    console.debug(`${MODULE.ID} | 🕐 ${metadata.callerInfo}${label}: ${durationStr}${errorStr}${contextStr}${memoryStr}`);
  }
}

/**
 * Get current memory usage (if available)
 * @returns {Object|null} Memory usage info or null
 */
function getMemoryUsage() {
  if (performance.memory) {
    return {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    };
  }
  return null;
}

/**
 * Format bytes for display
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const formatted = (bytes / Math.pow(k, i)).toFixed(1);
  return `${bytes >= 0 ? '+' : ''}${formatted} ${sizes[i]}`;
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
    MODULE.LOG_LEVEL = 1;
  }
}

/**
 * Generate a performance report from collected timing logs
 * @returns {Object} Performance summary
 */
export function generatePerformanceReport() {
  if (!window.console_logs) return { error: 'No logs available' };

  const timingLogs = window.console_logs.filter((log) => log.type === 'timing' && log.duration !== undefined);

  if (timingLogs.length === 0) {
    return { error: 'No timing data available' };
  }

  const operationStats = {};

  timingLogs.forEach((log) => {
    if (!operationStats[log.operation]) {
      operationStats[log.operation] = {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errors: 0
      };
    }

    const stats = operationStats[log.operation];
    stats.count++;
    stats.totalDuration += log.duration;
    stats.minDuration = Math.min(stats.minDuration, log.duration);
    stats.maxDuration = Math.max(stats.maxDuration, log.duration);
    if (!log.success) stats.errors++;
  });

  // Calculate averages and format
  const summary = Object.entries(operationStats)
    .map(([operation, stats]) => ({
      operation,
      count: stats.count,
      avgDuration: Math.round((stats.totalDuration / stats.count) * 100) / 100,
      minDuration: Math.round(stats.minDuration * 100) / 100,
      maxDuration: Math.round(stats.maxDuration * 100) / 100,
      totalDuration: Math.round(stats.totalDuration * 100) / 100,
      errorRate: Math.round((stats.errors / stats.count) * 100 * 100) / 100
    }))
    .sort((a, b) => b.totalDuration - a.totalDuration);

  return {
    totalOperations: timingLogs.length,
    uniqueOperations: summary.length,
    totalTime: Math.round(timingLogs.reduce((sum, log) => sum + log.duration, 0) * 100) / 100,
    operations: summary
  };
}
