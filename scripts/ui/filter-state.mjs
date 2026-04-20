import { log } from '../utils/logger.mjs';

/** @type {object} Default filter state used when DOM is unavailable. */
export const DEFAULT_FILTER_STATE = Object.freeze({
  name: '',
  minLevel: '',
  maxLevel: '',
  school: '',
  castingTime: '',
  minRange: '',
  maxRange: '',
  damageType: '',
  condition: '',
  requiresSave: '',
  prepared: false,
  favorited: false,
  properties: {},
  materialCostly: false,
  preparedByParty: false,
  target: '',
  source: '',
  spellSource: ''
});

/** @type {object|null} Cached filter state */
let cachedState = null;

/** @type {AbortController|null} Event listener controller for cleanup */
let abortController = null;

/**
 * Read the current filter state from the DOM, using the cache if valid.
 * @param {HTMLElement} formElement - The filter form/container element
 * @returns {object} The current filter state
 */
export function getFilterState(formElement) {
  if (cachedState) return cachedState;
  if (!formElement) return { ...DEFAULT_FILTER_STATE };
  const properties = {};
  for (const btn of formElement.querySelectorAll('.prop-toggle[data-filter-prop]')) {
    const state = btn.dataset.state;
    if (state === 'include' || state === 'exclude') properties[btn.dataset.filterProp] = state;
  }
  cachedState = {
    name: formElement.querySelector('[name="filter-name"]')?.value || '',
    minLevel: formElement.querySelector('[name="filter-min-level"]')?.value || '',
    maxLevel: formElement.querySelector('[name="filter-max-level"]')?.value || '',
    school: formElement.querySelector('[name="filter-school"]')?.value || '',
    castingTime: formElement.querySelector('[name="filter-castingTime"]')?.value || '',
    minRange: formElement.querySelector('[name="filter-min-range"]')?.value || '',
    maxRange: formElement.querySelector('[name="filter-max-range"]')?.value || '',
    damageType: formElement.querySelector('[name="filter-damageType"]')?.value || '',
    condition: formElement.querySelector('[name="filter-condition"]')?.value || '',
    requiresSave: formElement.querySelector('[name="filter-requiresSave"]')?.value || '',
    prepared: formElement.querySelector('[name="filter-prepared"]')?.checked || false,
    favorited: formElement.querySelector('[name="filter-favorited"]')?.checked || false,
    properties,
    materialCostly: formElement.querySelector('[name="filter-material-costly"]')?.checked || false,
    target: formElement.querySelector('[name="filter-target"]')?.value || '',
    preparedByParty: formElement.querySelector('[name="filter-preparedByParty"]')?.checked || false,
    source: formElement.querySelector('[name="filter-source"]')?.value || ''
  };
  log(3, 'Filter state read from DOM.');
  return cachedState;
}

/**
 * Clear the cached filter state, forcing a re-read on next access.
 */
export function clearFilterState() {
  cachedState = null;
  log(3, 'Filter cache cleared.');
}

/**
 * Bind reactive invalidation listeners to a filter container.
 * @param {HTMLElement} filterContainer - The filter container element
 */
export function bindFilterListeners(filterContainer) {
  unbindFilterListeners();
  abortController = new AbortController();
  const opts = { signal: abortController.signal };
  filterContainer.addEventListener(
    'input',
    () => {
      cachedState = null;
    },
    opts
  );
  filterContainer.addEventListener(
    'change',
    () => {
      cachedState = null;
    },
    opts
  );
  log(3, 'Filter listeners bound.');
}

/**
 * Remove reactive invalidation listeners.
 */
export function unbindFilterListeners() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}
