/**
 * Spell Book Filtering System - UI Controller
 *
 * This module provides the UI controller for spell filtering in the Spell Book application.
 * Manages filter state caching, DOM manipulation for filter UI, and coordinates with
 * SpellFilterService for actual filtering logic.
 * @module UIUtils/SpellbookFilters
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as ValidationUtils from '../validation/_module.mjs';
import { SpellFilterService, convertRangeToStandardUnit } from './spell-filter-service.mjs';

/**
 * Default filter state used as fallback when DOM is unavailable.
 * @type {object}
 */
export const DEFAULT_FILTER_STATE = Object.freeze({
  name: '',
  level: '',
  school: '',
  castingTime: '',
  minRange: '',
  maxRange: '',
  damageType: '',
  condition: '',
  requiresSave: '',
  prepared: false,
  ritual: false,
  favorited: false,
  concentration: '',
  materialComponents: '',
  preparedByParty: false,
  source: '',
  spellSource: ''
});

/**
 * Cached filter options (without selected state)
 * @type {Map<string, Array<{value: string, label: string}>>}
 */
const FILTER_OPTIONS_CACHE = new Map();

/**
 * Helper class for filtering spells in the Spell Book application with cached filter state.
 */
export class Filters {
  /**
   * Create a new filter helper.
   * @param {object} app - The parent application instance
   */
  constructor(app) {
    this.app = app;
    this._cachedFilterState = null;
    this._lastFilterUpdate = 0;
    this.searchPrefix = game.settings.get(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX);
    log(3, 'Filters constructed.');
  }

  /**
   * Get the application's element.
   * @returns {HTMLElement|null} The application element or null if not available
   */
  get element() {
    return this.app.element;
  }

  /**
   * Invalidate cached filter state.
   * @returns {void}
   */
  invalidateFilterCache() {
    this._cachedFilterState = null;
    this._lastFilterUpdate = 0;
    log(3, 'Filter cache invalidated.');
  }

  /**
   * Get the current filter state from the UI (with caching).
   * @returns {object} The current filter state
   */
  getFilterState() {
    const now = Date.now();
    if (this._cachedFilterState && now - this._lastFilterUpdate < 1000) {
      log(3, 'Returning cached filter state.');
      return this._cachedFilterState;
    }
    if (!this.element) {
      return { ...DEFAULT_FILTER_STATE };
    }
    this._cachedFilterState = {
      name: this.element.querySelector('[name="filter-name"]')?.value || '',
      level: this.element.querySelector('[name="filter-level"]')?.value || '',
      school: this.element.querySelector('[name="filter-school"]')?.value || '',
      castingTime: this.element.querySelector('[name="filter-castingTime"]')?.value || '',
      minRange: this.element.querySelector('[name="filter-min-range"]')?.value || '',
      maxRange: this.element.querySelector('[name="filter-max-range"]')?.value || '',
      damageType: this.element.querySelector('[name="filter-damageType"]')?.value || '',
      condition: this.element.querySelector('[name="filter-condition"]')?.value || '',
      requiresSave: this.element.querySelector('[name="filter-requiresSave"]')?.value || '',
      prepared: this.element.querySelector('[name="filter-prepared"]')?.checked || false,
      ritual: this.element.querySelector('[name="filter-ritual"]')?.checked || false,
      favorited: this.element.querySelector('[name="filter-favorited"]')?.checked || false,
      concentration: this.element.querySelector('[name="filter-concentration"]')?.value || '',
      materialComponents: this.element.querySelector('[name="filter-materialComponents"]')?.value || '',
      preparedByParty: this.element.querySelector('[name="filter-preparedByParty"]')?.checked || false,
      source: this.element.querySelector('[name="spell-compendium-source"]')?.value || '',
      spellSource: this.element.querySelector('[name="spell-source"]')?.value || ''
    };
    this._lastFilterUpdate = now;
    log(3, 'Filter state retrieved from DOM.', { name: this._cachedFilterState.name, level: this._cachedFilterState.level });
    return this._cachedFilterState;
  }

  /**
   * Reset all filter controls to their default state.
   * @returns {void}
   */
  resetFilterControls() {
    if (!this.element) return;
    const inputs = this.element.querySelectorAll('.spell-filters input[type="text"], .spell-filters input[type="number"]');
    inputs.forEach((input) => {
      input.value = '';
    });
    const selects = this.element.querySelectorAll('.spell-filters select');
    selects.forEach((select) => {
      select.value = select.options[0].value;
    });
    const checkboxes = this.element.querySelectorAll('.spell-filters input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    this.invalidateFilterCache();
    log(3, 'Filter controls reset complete.');
  }

  /**
   * Filter available spells based on current filter state.
   * @param {Array<object>} availableSpells - Array of available spells to filter
   * @param {Set<string>} selectedSpellUUIDs - Set of selected spell UUIDs to exclude
   * @param {Function} isSpellInSelectedList - Function to check if spell is in selected list
   * @param {object} [filterState] - Optional filter state to use instead of reading from DOM
   * @returns {object} Filtered spells with count information
   */
  filterAvailableSpells(availableSpells, selectedSpellUUIDs, isSpellInSelectedList, filterState = null) {
    const filters = filterState || this.getFilterState();
    return SpellFilterService.filterSpells(availableSpells, filters, { selectedSpellUUIDs, isSpellInSelectedList, searchPrefix: this.searchPrefix, searchEngine: this.app.ui?.search });
  }

  /**
   * Apply filters to the spell list.
   * @returns {void}
   */
  applyFilters() {
    if (!this.element) return;
    log(3, 'Applying filters to spell list.');
    const filters = this.getFilterState();
    const spellItems = this.element.querySelectorAll('.spell-item');
    let visibleCount = 0;
    const levelVisibilityMap = new Map();
    for (const item of spellItems) {
      const spellData = this._extractSpellDataFromElement(item);
      const visible = this._checkSpellVisibility(filters, spellData);
      item.style.display = visible ? '' : 'none';
      if (visible) {
        visibleCount++;
        this._updateLevelVisibilityStats(levelVisibilityMap, spellData, item);
      }
    }
    this._updateNoResultsDisplay(visibleCount);
    this._updateLevelContainers(levelVisibilityMap);
    log(3, 'Filters applied to spell list.', { totalSpells: spellItems.length, visibleCount });
  }

  /**
   * Extract spell data from DOM element for filtering.
   * @param {HTMLElement} item - The spell item element
   * @returns {object} Extracted spell data for filtering
   * @private
   */
  _extractSpellDataFromElement(item) {
    const titleElement = item.querySelector('.spell-name .title');
    const extractedName = titleElement?.textContent?.trim() || item.querySelector('.spell-name')?.textContent?.trim() || '';
    const partyIcons = item.querySelector('.party-icons');
    const hasPartyIcons = partyIcons && partyIcons.children.length > 0;
    return {
      name: extractedName.toLowerCase(),
      isPrepared: item.classList.contains('prepared-spell'),
      level: item.dataset.spellLevel || '',
      school: item.dataset.spellSchool || '',
      castingTimeType: item.dataset.castingTimeType || '',
      castingTimeValue: item.dataset.castingTimeValue || '',
      rangeUnits: item.dataset.rangeUnits || '',
      rangeValue: item.dataset.rangeValue || '0',
      damageTypes: (item.dataset.damageTypes || '').split(',').filter(Boolean),
      isRitual: item.dataset.ritual === 'true',
      isConcentration: item.dataset.concentration === 'true',
      requiresSave: item.dataset.requiresSave === 'true',
      conditions: (item.dataset.conditions || '').split(',').filter(Boolean),
      hasMaterialComponents: item.dataset.materialComponents === 'true',
      isFavorited: item.dataset.favorited === 'true',
      hasPartyIcons: hasPartyIcons
    };
  }

  /**
   * Update level visibility statistics.
   * @param {Map<string, object>} levelVisibilityMap - Map to track level statistics
   * @param {object} spellData - Spell data
   * @param {HTMLElement} item - Spell item element
   * @private
   */
  _updateLevelVisibilityStats(levelVisibilityMap, spellData, item) {
    const level = spellData.level;
    const isGranted = !!item.querySelector('.tag.granted');
    const isAlwaysPrepared = !!item.querySelector('.tag.always-prepared');
    const isCountable = !isGranted && !isAlwaysPrepared;
    if (!levelVisibilityMap.has(level)) levelVisibilityMap.set(level, { visible: 0, prepared: 0, countable: 0, countablePrepared: 0 });
    const levelStats = levelVisibilityMap.get(level);
    levelStats.visible++;
    if (isCountable) {
      levelStats.countable++;
      if (spellData.isPrepared) levelStats.countablePrepared++;
    }
    if (spellData.isPrepared) levelStats.prepared++;
  }

  /**
   * Update the "no results" display.
   * @param {number} visibleCount - Number of visible spells
   * @private
   */
  _updateNoResultsDisplay(visibleCount) {
    const noResults = this.element.querySelector('.no-filter-results');
    if (noResults) noResults.style.display = visibleCount > 0 ? 'none' : 'block';
  }

  /**
   * Check if a spell matches the current filters.
   * @param {object} filters - The current filter state
   * @param {object} spell - The spell to check
   * @returns {boolean} Whether the spell should be visible
   * @private
   */
  _checkSpellVisibility(filters, spell) {
    if (filters.name && !this._checkEnhancedNameMatch(filters.name, spell.name)) return false;
    if (filters.level && spell.level !== filters.level) return false;
    if (filters.school && spell.school !== filters.school) return false;
    if (filters.castingTime) {
      const [filterType, filterValue] = filters.castingTime.split(':');
      const itemType = spell.castingTimeType;
      const itemValue = spell.castingTimeValue || '1';
      if (itemType !== filterType || itemValue !== filterValue) return false;
    }
    if ((filters.minRange || filters.maxRange) && spell.rangeUnits) {
      const rangeValue = parseInt(spell.rangeValue, 10);
      const convertedRange = convertRangeToStandardUnit(spell.rangeUnits, rangeValue);
      const minRange = filters.minRange ? parseInt(filters.minRange, 10) : 0;
      const maxRange = filters.maxRange ? parseInt(filters.maxRange, 10) : Infinity;
      if (convertedRange < minRange || convertedRange > maxRange) return false;
    }
    if (filters.damageType && !spell.damageTypes.includes(filters.damageType)) return false;
    if (filters.condition && !spell.conditions.includes(filters.condition)) return false;
    if (filters.requiresSave) {
      const expected = filters.requiresSave === 'true';
      if (spell.requiresSave !== expected) return false;
    }
    if (filters.concentration) {
      const expected = filters.concentration === 'true';
      if (spell.isConcentration !== expected) return false;
    }
    if (filters.materialComponents) {
      const consumed = filters.materialComponents === 'consumed';
      if (spell.hasMaterialComponents !== consumed) return false;
    }
    if (filters.ritual && !spell.isRitual) return false;
    if (filters.prepared && !spell.isPrepared) return false;
    if (filters.favorited && !spell.isFavorited) return false;
    if (filters.preparedByParty && !spell.hasPartyIcons) return false;
    return true;
  }

  /**
   * Check if spell name matches the search query with enhanced syntax support.
   * @param {string} searchQuery - The search query
   * @param {string} spellName - The spell name to check
   * @returns {boolean} Whether the spell name matches
   * @private
   */
  _checkEnhancedNameMatch(searchQuery, spellName) {
    return SpellFilterService.checkEnhancedNameMatch(searchQuery, spellName);
  }

  /**
   * Update level container visibility and counts.
   * @param {Map<string, object>} levelVisibilityMap - Map of level visibility data
   * @private
   */
  _updateLevelContainers(levelVisibilityMap) {
    const levelContainers = this.element.querySelectorAll('.spell-level');
    for (const container of levelContainers) {
      const levelId = container.dataset.level;
      const levelStats = levelVisibilityMap.get(levelId) || { visible: 0, prepared: 0, countable: 0, countablePrepared: 0 };
      container.style.display = levelStats.visible > 0 ? '' : 'none';
      const countDisplay = container.querySelector('.spell-count');
      if (countDisplay && levelStats.countable > 0) countDisplay.textContent = `(${levelStats.countablePrepared}/${levelStats.countable})`;
      else if (countDisplay) countDisplay.textContent = '';
    }
  }
}

/**
 * Get base filter options (cached, without selected state).
 * @param {string} filterId - The filter identifier
 * @returns {Array<{value: string, label: string}>} Base options
 * @private
 */
function _getBaseFilterOptions(filterId) {
  if (FILTER_OPTIONS_CACHE.has(filterId)) return FILTER_OPTIONS_CACHE.get(filterId);
  const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];
  switch (filterId) {
    case 'level':
      Object.entries(CONFIG.DND5E.spellLevels).forEach(([level, label]) => {
        options.push({ value: level, label: label });
      });
      break;
    case 'school':
      Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, _school]) => {
        const label = DataUtils.getConfigLabel(CONFIG.DND5E.spellSchools, key);
        options.push({ value: key, label });
      });
      break;
    case 'damageType': {
      const damageTypes = {
        ...CONFIG.DND5E.damageTypes,
        healing: { label: game.i18n.localize('DND5E.Healing'), name: game.i18n.localize('DND5E.Healing') }
      };
      Object.entries(damageTypes)
        .sort((a, b) => {
          const labelA = a[0] === 'healing' ? damageTypes.healing.label : DataUtils.getConfigLabel(CONFIG.DND5E.damageTypes, a[0]) || a[0];
          const labelB = b[0] === 'healing' ? damageTypes.healing.label : DataUtils.getConfigLabel(CONFIG.DND5E.damageTypes, b[0]) || b[0];
          return labelA.localeCompare(labelB);
        })
        .forEach(([key, _type]) => {
          const label = key === 'healing' ? damageTypes.healing.label : DataUtils.getConfigLabel(CONFIG.DND5E.damageTypes, key) || key;
          options.push({ value: key, label });
        });
      break;
    }
    case 'condition':
      Object.entries(CONFIG.DND5E.conditionTypes)
        .filter(([_key, condition]) => !condition.pseudo)
        .sort((a, b) => {
          const labelA = DataUtils.getConfigLabel(CONFIG.DND5E.conditionTypes, a[0]);
          const labelB = DataUtils.getConfigLabel(CONFIG.DND5E.conditionTypes, b[0]);
          return labelA.localeCompare(labelB);
        })
        .forEach(([key, _condition]) => {
          const label = DataUtils.getConfigLabel(CONFIG.DND5E.conditionTypes, key);
          options.push({ value: key, label });
        });
      break;
    case 'requiresSave':
    case 'concentration':
      options.push({ value: 'true', label: game.i18n.localize('SPELLBOOK.Filters.True') }, { value: 'false', label: game.i18n.localize('SPELLBOOK.Filters.False') });
      break;
    case 'materialComponents':
      options.push(
        { value: 'consumed', label: game.i18n.localize('SPELLBOOK.Filters.Materials.Consumed') },
        { value: 'notConsumed', label: game.i18n.localize('SPELLBOOK.Filters.Materials.NotConsumed') }
      );
      break;
  }
  FILTER_OPTIONS_CACHE.set(filterId, options);
  return options;
}

/**
 * Prepare filter options based on filter type and current state.
 * @param {string} filterId - The filter identifier (level, school, etc.)
 * @param {object} filterState - Current filter state with selected values
 * @returns {Array<{ value: string; label: string; }>} Options for the dropdown control
 */
export function getOptionsForFilter(filterId, filterState) {
  if (filterId === 'castingTime') {
    const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];
    const uniqueTypes = getCastingTimeOptions(filterState);
    options.push(...uniqueTypes);
    log(3, 'Generated filter options (dynamic).', { filterId, optionsCount: options.length });
    return options;
  }
  const baseOptions = _getBaseFilterOptions(filterId);
  const options = baseOptions.map((opt) => ({
    ...opt,
    selected: opt.value === filterState[filterId] || (filterId === 'materialComponents' && opt.value === filterState.materialComponents)
  }));
  log(3, 'Generated filter options (cached).', { filterId, optionsCount: options.length });
  return options;
}

/**
 * Get casting time options with proper sorting and formatting.
 * @param {object} filterState - Current filter state for selection tracking
 * @returns {Array<{ value: string; label: string; }>} Sorted casting time options
 * @private
 */
export function getCastingTimeOptions(filterState) {
  const castingTimes = [
    { type: 'action', value: 1, priority: 1 },
    { type: 'bonus', value: 1, priority: 2 },
    { type: 'reaction', value: 1, priority: 3 },
    { type: 'minute', value: 1, priority: 4 },
    { type: 'minute', value: 10, priority: 4 },
    { type: 'hour', value: 1, priority: 5 },
    { type: 'hour', value: 8, priority: 5 },
    { type: 'hour', value: 24, priority: 6 },
    { type: 'special', value: 1, priority: 7 }
  ];
  const options = [];
  castingTimes
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.value - b.value))
    .forEach(({ type, value }) => {
      const typeLabel = CONFIG.DND5E.abilityActivationTypes[type] || type;
      const label = value === 1 ? typeLabel : `${value} ${typeLabel}${value !== 1 ? 's' : ''}`;
      const combo = `${type}:${value}`;
      options.push({ value: combo, label, selected: filterState.castingTime === combo });
    });
  log(3, 'Generated casting time options.', { optionsCount: options.length });
  return options;
}

/**
 * Ensure filter configuration integrity using foundry.utils.mergeObject.
 * @param {Array} filterConfig - Current filter configuration
 * @returns {Array} Updated filter configuration
 */
export function ensureFilterIntegrity(filterConfig) {
  log(3, 'Ensuring filter config integrity.');
  const userFilters = new Map(filterConfig.map((f) => [f.id, f]));
  const validDefaultIds = new Set(MODULE.DEFAULT_FILTER_CONFIG.map((f) => f.id));
  const result = MODULE.DEFAULT_FILTER_CONFIG.map((defaultFilter) => userFilters.get(defaultFilter.id) ?? foundry.utils.deepClone(defaultFilter));
  return result.concat(filterConfig.filter((f) => !validDefaultIds.has(f.id) && userFilters.has(f.id)));
}

/**
 * Prepare filter data for the UI.
 * @param {object} actor - The actor instance
 * @param {Filters} filterHelper - The filter helper instance
 * @returns {Array<object>} The prepared filter objects ready for UI rendering
 */
export function prepareFilters(actor, filterHelper) {
  let filterConfigData = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
  if (!filterConfigData || !filterConfigData.version) {
    filterConfigData = { version: MODULE.DEFAULT_FILTER_CONFIG_VERSION, filters: foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG) };
  }
  let filterConfig = filterConfigData?.filters || [];
  if (filterConfig.length === 0) filterConfig = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
  else {
    const currentVersion = MODULE.DEFAULT_FILTER_CONFIG_VERSION;
    const storedVersion = filterConfigData.version || '0.0.0';
    if (foundry.utils.isNewerVersion(currentVersion, storedVersion)) {
      filterConfig = DataUtils.migrateFilterData(filterConfig);
      const updatedConfigData = { version: currentVersion, filters: filterConfig };
      game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, updatedConfigData);
    } else filterConfig = ensureFilterIntegrity(filterConfig);
  }
  const sortedFilters = filterConfig.sort((a, b) => a.order - b.order);
  const filterState = filterHelper.getFilterState();
  const result = sortedFilters
    .map((filter) => {
      let filterEnabled = filter.enabled;
      if (filter.id === 'favorited') {
        const favoritesUIEnabled = game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES);
        filterEnabled = filter.enabled && favoritesUIEnabled;
      }
      if (filter.id === 'preparedByParty') {
        const isPartyModeEnabled = actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
        filterEnabled = filter.enabled && isPartyModeEnabled;
      }
      const result = {
        id: filter.id,
        type: filter.type,
        name: `filter-${filter.id}`,
        label: game.i18n.localize(filter.label),
        enabled: filterEnabled
      };
      let element;
      switch (filter.type) {
        case 'search':
          element = ValidationUtils.createTextInput({
            name: `filter-${filter.id}`,
            value: filterState[filter.id] || '',
            placeholder: `${game.i18n.localize(filter.label)}...`,
            ariaLabel: game.i18n.localize(filter.label),
            cssClass: 'advanced-search-input'
          });
          break;
        case 'dropdown':
          const options = getOptionsForFilter(filter.id, filterState);
          element = ValidationUtils.createSelect({
            name: `filter-${filter.id}`,
            options: options,
            ariaLabel: game.i18n.localize(filter.label)
          });
          break;
        case 'checkbox':
          element = ValidationUtils.createCheckbox({
            name: `filter-${filter.id}`,
            checked: filterState[filter.id] || false,
            label: game.i18n.localize(filter.label),
            ariaLabel: game.i18n.localize(filter.label)
          });
          break;
        case 'range': {
          log(3, 'Creating range filter element:', { filterId: filter.id, filterState });
          const container = document.createElement('div');
          container.className = 'range-inputs';
          container.setAttribute('role', 'group');
          container.setAttribute('aria-labelledby', `${filter.id}-label`);
          const minInput = ValidationUtils.createNumberInput({
            name: 'filter-min-range',
            value: filterState.minRange || '',
            placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMin'),
            ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMinLabel')
          });
          const separator = document.createElement('div');
          separator.className = 'range-separator';
          separator.setAttribute('aria-hidden', 'true');
          separator.innerHTML = '<dnd5e-icon src="systems/dnd5e/icons/svg/range-connector.svg"></dnd5e-icon>';
          const maxInput = ValidationUtils.createNumberInput({
            name: 'filter-max-range',
            value: filterState.maxRange || '',
            placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMax'),
            ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMaxLabel')
          });
          container.appendChild(minInput);
          container.appendChild(separator);
          container.appendChild(maxInput);
          element = container;
          result.unit = dnd5e.utils.defaultUnits('length') === 'm' ? 'meters' : 'feet';
          break;
        }
        default:
          return null;
      }
      if (!element) return null;
      result.elementHtml = ValidationUtils.elementToHtml(element);
      return result;
    })
    .filter(Boolean);
  log(3, 'Preparing filters:', { result });
  return result;
}
