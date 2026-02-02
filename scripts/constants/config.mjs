/**
 * Timing, performance, and threshold configuration constants.
 * Centralizes magic numbers used across multiple modules.
 * @module Constants/Config
 * @author Tyler
 */

/** Debounce delay for UI filter and input changes (ms). */
export const DEBOUNCE_DELAY = 150;

/** Debounce delay for standard text search (ms). */
export const SEARCH_DEBOUNCE_DELAY = 800;

/** Cache timeout for loadout data (ms). */
export const LOADOUT_CACHE_TTL = 30000;

/** Minimum character length for incomplete search value detection. */
export const MIN_SEARCH_VALUE_LENGTH = 2;

/** Minimum query length before showing fuzzy suggestions. */
export const MIN_QUERY_LENGTH_FOR_SUGGESTIONS = 3;

/** Maximum number of recent searches to retain per actor. */
export const MAX_RECENT_SEARCHES = 8;
