/**
 * Spell Book Filtering System
 *
 * This module provides filtering capabilities for the Spell Book application,
 * managing both data-level filtering for spell lists and DOM-level filtering for displayed
 * spells. It includes advanced search integration, caching mechanisms, and sophisticated
 * matching algorithms for various spell properties.
 *
 * The filtering system operates on multiple levels:
 * - Basic property filtering (name, level, school, casting time)
 * - Advanced search query execution with field-based syntax
 * - Range-based filtering with unit conversion
 * - Damage type and condition filtering
 * - Special property filtering (ritual, concentration, saves)
 * - Enhanced name matching with fuzzy search and exact phrase support
 *
 * Key features include:
 * - Cached filter state management for performance optimization
 * - Integration with advanced search manager for complex queries
 * - Real-time DOM filtering with visibility management
 * - Level container statistics and visibility tracking
 * - Enhanced search syntax including exact phrase matching
 * - Fallback mechanisms for incomplete or missing data
 *
 * The system ensures responsive filtering performance while providing
 * search and filtering capabilities across all spell properties and metadata.
 *
 * @module UIHelpers/SpellbookFilters
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as ValidationHelpers from '../validation/_module.mjs';

/**
 * @typedef {"consumed"|"notConsumed"} MaterialComponentFilter
 */

/**
 * Complete filter state structure containing all possible filter criteria.
 *
 * @typedef {Object} FilterState
 * @property {string} [name] - Name/text search query
 * @property {number} [level] - Spell level filter (0-9)
 * @property {string} [school] - School of magic filter
 * @property {string} [castingTime] - Casting time filter in format "type:value"
 * @property {string} [minRange] - Minimum range value in feet
 * @property {string} [maxRange] - Maximum range value in feet
 * @property {string} [damageType] - Damage type filter
 * @property {string} [condition] - Condition filter
 * @property {boolean} [requiresSave] - Saving throw requirement filter
 * @property {boolean} [prepared] - Show only prepared spells
 * @property {boolean} [ritual] - Show only ritual spells
 * @property {boolean} [favorited] - Show only favorited spells
 * @property {boolean} [concentration] - Concentration requirement filter
 * @property {MaterialComponentFilter} [materialComponents] - Material component filter
 * @property {string} [source] - Source filter for spell compendiums
 */

/**
 * Extracted spell data structure from DOM elements for filtering.
 *
 * @typedef {Object} ExtractedSpellData
 * @property {string} name - Lowercase spell name for matching
 * @property {number} level - Spell level as a number
 * @property {string} school - School of magic identifier
 * @property {string} castingTimeType - Type of casting time action
 * @property {string} [castingTimeValue] - Numeric value for casting time
 * @property {string} [rangeUnits] - Range measurement units
 * @property {string|number} rangeValue - Numeric range value
 * @property {string[]} damageTypes - Array of damage type identifiers
 * @property {string[]} conditions - Array of condition identifiers
 * @property {boolean} isRitual - Whether the spell can be cast as ritual
 * @property {boolean} isConcentration - Whether the spell requires concentration
 * @property {boolean} requiresSave - Whether the spell requires a saving throw
 * @property {boolean} hasMaterialComponents - Whether the spell consumes material components
 * @property {boolean} isPrepared - Whether the spell is currently prepared
 * @property {boolean} isFavorited - Whether the spell is marked as favorite
 */

/**
 * Level visibility statistics for tracking filtered spell counts.
 *
 * @typedef {Object} LevelVisibilityStats
 * @property {number} visible - Total visible spells at this level
 * @property {number} prepared - Total prepared spells at this level
 * @property {number} countable - Countable spells (excludes granted and always-prepared)
 * @property {number} countablePrepared - Prepared countable spells at this level
 */

/**
 * Filtering result structure for available spell filtering.
 *
 * @typedef {Object} FilterResult
 * @property {Array<Object>} spells - Array of filtered spell objects
 * @property {number} totalFiltered - Total number of spells after filtering
 */

/**
 * Helper class for filtering spells in the Spell Book application with cached filter state.
 *
 * This class provides filtering capabilities for spell data and DOM elements,
 * managing filter state caching, advanced search integration, and real-time filtering
 * updates. It handles both programmatic filtering of spell arrays and visual filtering
 * of displayed spell elements.
 *
 * The filter helper integrates with the advanced search manager to support complex
 * field-based queries while also providing traditional dropdown and checkbox filtering.
 * It includes performance optimizations through state caching and efficient DOM updates.
 */

export class SpellbookFilterHelper {
  /**
   * Create a new filter helper.
   *
   * Initializes the filter helper with references to the parent application and sets up
   * caching mechanisms for filter state management. The helper integrates with the
   * application's advanced search functionality and manages filter performance.
   *
   * @param {SpellBook} app - The parent application instance
   */
  constructor(app) {
    /** @type {SpellBook} - The parent spell book application */
    this.app = app;

    /** @type {FilterState|null} - Cached filter state to avoid repeated DOM queries */
    this._cachedFilterState = null;

    /** @type {number} - Timestamp of last filter state update for cache invalidation */
    this._lastFilterUpdate = 0;

    /** @type {string} - Prefix character that triggers advanced search mode */
    this.searchPrefix = game.settings.get(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX);
  }

  /**
   * Get the application's element.
   *
   * @returns {HTMLElement|null} The application element or null if not available
   */
  get element() {
    return this.app.element;
  }

  /**
   * Invalidate cached filter state.
   *
   * Forces the next filter state request to read fresh data from the DOM instead
   * of using cached values. This should be called when filter controls are
   * programmatically updated outside of user interaction.
   *
   * @returns {void}
   */
  invalidateFilterCache() {
    this._cachedFilterState = null;
    this._lastFilterUpdate = 0;
  }

  /**
   * Get the current filter state from the UI (with caching).
   *
   * Retrieves the current filter state by reading values from DOM elements,
   * with intelligent caching to avoid repeated DOM queries within a short
   * time window. Returns a default filter state if the application element
   * is not available.
   *
   * The cache is automatically invalidated after 1 second to ensure filter
   * changes are reflected promptly while still providing performance benefits.
   *
   * @returns {FilterState} The current filter state
   */
  getFilterState() {
    const now = Date.now();
    if (this._cachedFilterState && now - this._lastFilterUpdate < 1000) return this._cachedFilterState;
    if (!this.element) {
      return {
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
        preparedByParty: false
      };
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
    return this._cachedFilterState;
  }

  /**
   * Reset all filter controls to their default state.
   *
   * Clears all filter input values, resets selects to first option, and unchecks
   * all checkboxes. This handles the DOM manipulation for filter reset while
   * leaving state management to the calling application.
   *
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
  }

  /**
   * Filter available spells based on current filter state.
   *
   * Applies filtering to an array of spell objects using the current
   * filter state. The filtering process is executed in stages for optimal performance,
   * with early returns and efficient array operations.
   *
   * The filtering stages include:
   * 1. Removal of spells already in selected lists
   * 2. Source-based filtering (if applicable)
   * 3. Basic property filtering (name, level, school, casting time)
   * 4. Range-based filtering with unit conversion
   * 5. Damage type and condition filtering
   * 6. Special property filtering (ritual, concentration, etc.)
   *
   * @param {Array<Object>} availableSpells - Array of available spells to filter
   * @param {Set<string>} selectedSpellUUIDs - Set of selected spell UUIDs to exclude
   * @param {Function} isSpellInSelectedList - Function to check if spell is in selected list
   * @param {FilterState} [filterState] - Optional filter state to use instead of reading from DOM
   * @returns {FilterResult} Filtered spells with count information
   */
  filterAvailableSpells(availableSpells, selectedSpellUUIDs, isSpellInSelectedList, filterState = null) {
    try {
      const filters = filterState || this.getFilterState();
      log(3, 'Beginning Filtering:', selectedSpellUUIDs.size, 'selected spells out of', availableSpells.length, 'total available');
      let remainingSpells = [...availableSpells];
      remainingSpells = this._filterBySelectedList(remainingSpells, selectedSpellUUIDs, isSpellInSelectedList);
      remainingSpells = this._filterBySource(remainingSpells, filters);
      remainingSpells = this._filterBySpellSource(remainingSpells, filters);
      remainingSpells = this._filterByBasicProperties(remainingSpells, filters);
      remainingSpells = this._filterByRange(remainingSpells, filters);
      remainingSpells = this._filterByDamageAndConditions(remainingSpells, filters);
      remainingSpells = this._filterBySpecialProperties(remainingSpells, filters);
      log(3, 'Final spells count:', remainingSpells.length);
      return { spells: remainingSpells, totalFiltered: remainingSpells.length };
    } catch (error) {
      log(1, 'ERROR in SpellbookFilterHelper Filter Available Spells:', error);
      return { spells: [], totalFiltered: 0 };
    }
  }

  /**
   * Filter out spells already in the selected list.
   *
   * Removes spells that are already present in the selected spell list to avoid
   * duplicates in the available spells display. Uses the provided function to
   * check for spell membership in the selected list.
   *
   * @param {Array<Object>} spells - Spells to filter
   * @param {Set<string>} selectedSpellUUIDs - UUIDs in selected list
   * @param {Function} isSpellInSelectedList - Function to check if spell is in list
   * @returns {Array<Object>} Filtered spells excluding those in selected list
   * @private
   */
  _filterBySelectedList(spells, selectedSpellUUIDs, isSpellInSelectedList) {
    const filtered = spells.filter((spell) => !isSpellInSelectedList(spell, selectedSpellUUIDs));
    log(3, 'After in-list filter:', filtered.length, 'spells remaining');
    return filtered;
  }

  /**
   * Filter spells by source.
   *
   * Filters spells based on their source compendium or pack origin. Supports
   * partial matching for source names and provides fallback behavior when
   * filtering would exclude all spells.
   *
   * @param {Array<Object>} spells - Spells to filter
   * @param {FilterState} filterState - Current filter state
   * @returns {Array<Object>} Filtered spells matching source criteria
   * @private
   */
  _filterBySource(spells, filterState) {
    const { source } = filterState;
    if (!source || source.trim() === '' || source === 'all') return spells;
    const beforeCount = spells.length;
    const filtered = spells.filter((spell) => {
      const spellSource = (spell.sourceId || '').split('.')[0];
      const packName = spell.packName || '';
      return spellSource.includes(source) || spellSource === source || packName.toLowerCase().includes(source.toLowerCase());
    });
    if (filtered.length === 0 && beforeCount > 0) {
      log(3, `Source '${source}' filtered out all spells, resetting to show all sources`);
      filterState.source = 'all';
      return spells;
    }
    return filtered;
  }

  /**
   * Filter spells by spell source (spell.system.source.label).
   *
   * Filters spells based on their system source label. Handles cases where
   * the source is null, undefined, or empty string by treating them as "No Source".
   *
   * @param {Array<Object>} spells - Spells to filter
   * @param {FilterState} filterState - Current filter state
   * @returns {Array<Object>} Filtered spells matching spell source criteria
   * @private
   */
  _filterBySpellSource(spells, filterState) {
    const { spellSource } = filterState;
    if (!spellSource || spellSource.trim() === '' || spellSource === 'all') return spells;
    const beforeCount = spells.length;
    const filtered = spells.filter((spell) => {
      const spellSourceId = spell.filterData?.spellSourceId;
      return spellSourceId === spellSource;
    });
    if (filtered.length === 0 && beforeCount > 0) {
      log(3, `Spell Source '${spellSource}' filtered out all spells, resetting to show all sources`);
      filterState.spellSource = 'all';
      return spells;
    }
    log(3, 'After spell source filter:', filtered.length, 'spells remaining');
    return filtered;
  }

  /**
   * Filter spells by basic properties (name, level, school, casting time).
   *
   * Applies filtering for fundamental spell properties including enhanced name
   * matching with advanced search support, exact level matching, school filtering,
   * and casting time filtering with type and value matching.
   *
   * @param {Array<Object>} spells - Spells to filter
   * @param {FilterState} filterState - Current filter state
   * @returns {Array<Object>} Filtered spells matching basic property criteria
   * @private
   */
  _filterByBasicProperties(spells, filterState) {
    const { name, level, school, castingTime } = filterState;
    let filtered = spells;
    if (name) filtered = this._filterByEnhancedName(filtered, name);
    if (level) {
      const levelValue = parseInt(level);
      filtered = filtered.filter((spell) => spell.level === levelValue);
    }
    if (school) filtered = filtered.filter((spell) => spell.school === school);
    if (castingTime) {
      filtered = filtered.filter((spell) => {
        const [filterType, filterValue] = castingTime.split(':');
        const spellCastingType = spell.filterData?.castingTime?.type || spell.system?.activation?.type || '';
        const spellCastingValue = String(spell.filterData?.castingTime?.value || spell.system?.activation?.value || '1');
        return spellCastingType === filterType && spellCastingValue === filterValue;
      });
    }
    return filtered;
  }

  /**
   * Enhanced name filtering with fuzzy search and advanced syntax.
   *
   * Provides sophisticated name matching including:
   * - Advanced search query execution for complex field-based searches
   * - Exact phrase matching with quote syntax
   * - Multi-word fuzzy matching with various strategies
   * - Exact match, starts-with, contains, and partial word matching
   *
   * @param {Array<Object>} spells - Spells to filter
   * @param {string} searchQuery - Search query string
   * @returns {Array<Object>} Filtered spells matching name criteria
   * @private
   */
  _filterByEnhancedName(spells, searchQuery) {
    if (!searchQuery || !searchQuery.trim()) return spells;
    const query = searchQuery.trim();
    if (query.startsWith(this.searchPrefix)) {
      const advancedSearchManager = this.app.ui?.advancedSearchManager;
      if (advancedSearchManager && advancedSearchManager.isCurrentQueryAdvanced()) {
        log(3, 'Using advanced query execution');
        const filtered = advancedSearchManager.executeAdvancedQuery(spells);
        log(3, 'Advanced query results:', filtered.length);
        return filtered;
      } else return [];
    }
    const exactPhraseMatch = query.match(/^["'](.+?)["']$/);
    if (exactPhraseMatch) {
      const phrase = exactPhraseMatch[1].toLowerCase();
      log(3, 'Exact phrase search for:', phrase);
      const filtered = spells.filter((spell) => {
        const spellName = spell.name ? spell.name.toLowerCase() : '';
        const matches = spellName.includes(phrase);
        if (matches) log(3, 'Exact phrase match found:', spell.name);
        return matches;
      });
      log(3, 'Exact phrase search results:', filtered.length);
      return filtered;
    }
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 0);
    const filtered = spells.filter((spell) => {
      const spellName = spell.name ? spell.name.toLowerCase() : '';
      const exactMatch = spellName === query.toLowerCase();
      if (exactMatch) return true;
      const startsWithQuery = spellName.startsWith(query.toLowerCase());
      if (startsWithQuery) return true;
      const containsQuery = spellName.includes(query.toLowerCase());
      if (containsQuery) return true;
      const allWordsMatch = queryWords.every((word) => spellName.includes(word));
      if (allWordsMatch) return true;
      const anyWordMatches = queryWords.some((word) => spellName.includes(word));
      return anyWordMatches;
    });
    log(3, 'Fuzzy search results:', filtered.length);
    return filtered;
  }

  /**
   * Filter spells by range.
   *
   * Applies range-based filtering with automatic unit conversion to standardize
   * different range measurements. Converts miles to feet and handles special
   * range types appropriately.
   *
   * @param {Array<Object>} spells - Spells to filter
   * @param {FilterState} filterState - Current filter state
   * @returns {Array<Object>} Filtered spells within specified range
   * @private
   */
  _filterByRange(spells, filterState) {
    const { minRange, maxRange } = filterState;
    if (!minRange && !maxRange) return spells;
    const filtered = spells.filter((spell) => {
      if (!(spell.filterData?.range?.units || spell.system?.range?.units)) return true;
      const rangeUnits = spell.filterData?.range?.units || spell.system?.range?.units || '';
      const rangeValue = parseInt(spell.system?.range?.value || 0);
      let standardizedRange = rangeValue;
      if (rangeUnits === 'mi') standardizedRange = rangeValue * 5280;
      else if (rangeUnits === 'spec') standardizedRange = 0;
      const minRangeVal = minRange ? parseInt(minRange) : 0;
      const maxRangeVal = maxRange ? parseInt(maxRange) : Infinity;
      return standardizedRange >= minRangeVal && standardizedRange <= maxRangeVal;
    });
    log(3, 'After range filter:', filtered.length, 'spells remaining');
    return filtered;
  }

  /**
   * Filter spells by damage types and conditions.
   *
   * Applies filtering based on damage types that spells can inflict and
   * conditions that spells can impose on targets. Both filters check for
   * inclusion in arrays of possible values.
   *
   * @param {Array<Object>} spells - Spells to filter
   * @param {FilterState} filterState - Current filter state
   * @returns {Array<Object>} Filtered spells matching damage/condition criteria
   * @private
   */
  _filterByDamageAndConditions(spells, filterState) {
    const { damageType, condition } = filterState;
    let filtered = spells;
    if (damageType) {
      filtered = filtered.filter((spell) => {
        const spellDamageTypes = Array.isArray(spell.filterData?.damageTypes) ? spell.filterData.damageTypes : [];
        return spellDamageTypes.length > 0 && spellDamageTypes.includes(damageType);
      });
    }
    if (condition) {
      filtered = filtered.filter((spell) => {
        const spellConditions = Array.isArray(spell.filterData?.conditions) ? spell.filterData.conditions : [];
        return spellConditions.includes(condition);
      });
    }
    return filtered;
  }

  /**
   * Filter spells by special properties (saves, concentration, ritual).
   *
   * Applies filtering for special spell properties including saving throw
   * requirements, concentration needs, ritual capabilities, favorite status,
   * and material component consumption.
   *
   * @param {Array<Object>} spells - Spells to filter
   * @param {FilterState} filterState - Current filter state
   * @returns {Array<Object>} Filtered spells matching special property criteria
   * @private
   */
  _filterBySpecialProperties(spells, filterState) {
    const { requiresSave, concentration, ritual, favorited, materialComponents } = filterState;
    let filtered = spells;
    if (requiresSave) {
      filtered = filtered.filter((spell) => {
        const spellRequiresSave = spell.filterData?.requiresSave || false;
        return (requiresSave === 'true' && spellRequiresSave) || (requiresSave === 'false' && !spellRequiresSave);
      });
    }
    if (concentration) {
      filtered = filtered.filter((spell) => {
        const requiresConcentration = !!spell.filterData?.concentration;
        return (concentration === 'true' && requiresConcentration) || (concentration === 'false' && !requiresConcentration);
      });
    }
    if (materialComponents) {
      filtered = filtered.filter((spell) => {
        const hasMaterialComponents = spell.filterData?.materialComponents?.hasConsumedMaterials || false;
        return (materialComponents === 'consumed' && hasMaterialComponents) || (materialComponents === 'notConsumed' && !hasMaterialComponents);
      });
    }
    if (favorited) filtered = filtered.filter((spell) => !!spell.favorited);
    if (ritual) filtered = filtered.filter((spell) => !!spell.filterData?.isRitual);
    return filtered;
  }

  /**
   * Apply filters to the spell list.
   *
   * Performs real-time DOM-based filtering of spell elements, updating visibility
   * and maintaining level container statistics. This method directly manipulates
   * the display of spell elements based on current filter criteria.
   *
   * @returns {void}
   */
  applyFilters() {
    try {
      if (!this.element) return;
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
    } catch (error) {
      log(1, 'Error applying filters:', error);
    }
  }

  /**
   * Extract spell data from DOM element for filtering.
   *
   * Analyzes a spell item DOM element to extract all filterable properties
   * from data attributes and element classes. This data is used for real-time
   * filtering without requiring full spell object access.
   *
   * @param {HTMLElement} item - The spell item element
   * @returns {ExtractedSpellData} Extracted spell data for filtering
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
   *
   * Maintains statistics about spell visibility within each spell level for
   * proper display of level containers and preparation counts. Distinguishes
   * between different types of spells (granted, always-prepared, countable).
   *
   * @param {Map<string, LevelVisibilityStats>} levelVisibilityMap - Map to track level statistics
   * @param {ExtractedSpellData} spellData - Spell data
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
   *
   * Shows or hides the "no results" message based on whether any spells
   * are currently visible after filtering.
   *
   * @param {number} visibleCount - Number of visible spells
   * @private
   */
  _updateNoResultsDisplay(visibleCount) {
    const noResults = this.element.querySelector('.no-filter-results');
    if (noResults) noResults.style.display = visibleCount > 0 ? 'none' : 'block';
  }

  /**
   * Check if a spell matches the current filters.
   *
   * Evaluates all filter criteria against extracted spell data to determine
   * visibility. Uses enhanced name matching and proper type conversions for
   * numeric comparisons.
   *
   * @param {FilterState} filters - The current filter state
   * @param {ExtractedSpellData} spell - The spell to check
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
      const convertedRange = ValidationHelpers.convertRangeToStandardUnit(spell.rangeUnits, rangeValue);
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
   *
   * Provides sophisticated name matching including exact phrase matching with
   * quotes and multi-word fuzzy matching with various matching strategies.
   *
   * @param {string} searchQuery - The search query
   * @param {string} spellName - The spell name to check
   * @returns {boolean} Whether the spell name matches
   * @private
   */
  _checkEnhancedNameMatch(searchQuery, spellName) {
    if (!searchQuery || !searchQuery.trim()) return true;
    if (!spellName) return false;
    const query = searchQuery.trim();
    const spellNameLower = spellName.toLowerCase().trim();
    const exactPhraseMatch = query.match(/^["'](.+?)["']$/);
    if (exactPhraseMatch) {
      const phrase = exactPhraseMatch[1].toLowerCase().trim();
      return spellNameLower === phrase;
    }
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 0);
    if (queryWords.length === 1) return spellNameLower.includes(queryWords[0]);
    const allWordsMatch = queryWords.every((word) => spellNameLower.includes(word));
    const phraseMatch = spellNameLower.includes(query.toLowerCase());
    return allWordsMatch || phraseMatch;
  }

  /**
   * Update level container visibility and counts.
   *
   * Updates the display of spell level containers based on visibility statistics,
   * hiding empty levels and updating preparation count displays for levels
   * that contain countable spells.
   *
   * @param {Map<string, LevelVisibilityStats>} levelVisibilityMap - Map of level visibility data
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
