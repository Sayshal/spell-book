import { MODULE, SETTINGS } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import * as filterUtils from '../filters.mjs';

/**
 * Helper class for filtering spells in the spellbook application with cached filter state
 */
export class SpellbookFilterHelper {
  /**
   * Create a new filter helper
   * @param {PlayerSpellBook} app - The parent application
   */
  constructor(app) {
    this.app = app;
    this.actor = app.actor;
    this._cachedFilterState = null;
    this._lastFilterUpdate = 0;
    this.searchPrefix = game.settings.get(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX);
  }

  /**
   * Get the application's element
   * @returns {HTMLElement|null} The application element
   */
  get element() {
    return this.app.element;
  }

  /**
   * Invalidate cached filter state
   */
  invalidateFilterCache() {
    this._cachedFilterState = null;
    this._lastFilterUpdate = 0;
  }

  /**
   * Get the current filter state from the UI (with caching)
   * @returns {Object} The filter state
   */
  getFilterState() {
    const now = Date.now();
    if (this._cachedFilterState && now - this._lastFilterUpdate < 1000) return this._cachedFilterState;
    if (!this.element) return filterUtils.getDefaultFilterState();
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
      materialComponents: this.element.querySelector('[name="filter-materialComponents"]')?.value || ''
    };
    this._lastFilterUpdate = now;
    return this._cachedFilterState;
  }

  /**
   * Filter available spells based on current filter state
   * @param {Array} availableSpells - Array of available spells
   * @param {Set} selectedSpellUUIDs - Set of selected spell UUIDs
   * @param {Function} isSpellInSelectedList - Function to check if spell is in selected list
   * @param {Object} [filterState] - Optional filter state to use instead of reading from DOM
   * @returns {Object} Filtered spells with count
   */
  filterAvailableSpells(availableSpells, selectedSpellUUIDs, isSpellInSelectedList, filterState = null) {
    const filters = filterState || this.getFilterState();
    log(3, 'Beginning Filtering:', selectedSpellUUIDs.size, 'selected spells out of', availableSpells.length, 'total available');
    let remainingSpells = [...availableSpells];
    remainingSpells = this._filterBySelectedList(remainingSpells, selectedSpellUUIDs, isSpellInSelectedList);
    remainingSpells = this._filterBySource(remainingSpells, filters);
    remainingSpells = this._filterByBasicProperties(remainingSpells, filters);
    remainingSpells = this._filterByRange(remainingSpells, filters);
    remainingSpells = this._filterByDamageAndConditions(remainingSpells, filters);
    remainingSpells = this._filterBySpecialProperties(remainingSpells, filters);
    log(3, 'Final spells count:', remainingSpells.length);
    return { spells: remainingSpells, totalFiltered: remainingSpells.length };
  }

  /**
   * Filter out spells already in the selected list
   * @param {Array} spells - Spells to filter
   * @param {Set} selectedSpellUUIDs - UUIDs in selected list
   * @param {Function} isSpellInSelectedList - Function to check if spell is in list
   * @returns {Array} Filtered spells
   * @private
   */
  _filterBySelectedList(spells, selectedSpellUUIDs, isSpellInSelectedList) {
    const filtered = spells.filter((spell) => !isSpellInSelectedList(spell, selectedSpellUUIDs));
    log(3, 'After in-list filter:', filtered.length, 'spells remaining');
    return filtered;
  }

  /**
   * Filter spells by source
   * @param {Array} spells - Spells to filter
   * @param {Object} filterState - Current filter state
   * @returns {Array} Filtered spells
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
   * Filter spells by basic properties (name, level, school, casting time)
   * @param {Array} spells - Spells to filter
   * @param {Object} filterState - Current filter state
   * @returns {Array} Filtered spells
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
   * Enhanced name filtering with fuzzy search and advanced syntax
   * @param {Array} spells - Spells to filter
   * @param {string} searchQuery - Search query
   * @returns {Array} Filtered spells
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
   * Filter spells by range
   * @param {Array} spells - Spells to filter
   * @param {Object} filterState - Current filter state
   * @returns {Array} Filtered spells
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
   * Filter spells by damage types and conditions
   * @param {Array} spells - Spells to filter
   * @param {Object} filterState - Current filter state
   * @returns {Array} Filtered spells
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
   * Filter spells by special properties (saves, concentration, ritual)
   * @param {Array} spells - Spells to filter
   * @param {Object} filterState - Current filter state
   * @returns {Array} Filtered spells
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
   * Apply filters to the spell list
   */
  applyFilters() {
    try {
      const filters = this.getFilterState();
      const spellItems = this.element.querySelectorAll('.spell-item');
      let visibleCount = 0;
      const levelVisibilityMap = new Map();
      for (const item of spellItems) {
        const titleElement = item.querySelector('.spell-name .title');
        const extractedName = titleElement?.textContent?.trim() || item.querySelector('.spell-name')?.textContent?.trim() || '';
        const name = extractedName.toLowerCase();
        const isPrepared = item.classList.contains('prepared-spell');
        const level = item.dataset.spellLevel || '';
        const school = item.dataset.spellSchool || '';
        const castingTimeType = item.dataset.castingTimeType || '';
        const castingTimeValue = item.dataset.castingTimeValue || '';
        const rangeUnits = item.dataset.rangeUnits || '';
        const rangeValue = item.dataset.rangeValue || '0';
        const damageTypes = (item.dataset.damageTypes || '').split(',');
        const isRitual = item.dataset.ritual === 'true';
        const isConcentration = item.dataset.concentration === 'true';
        const requiresSave = item.dataset.requiresSave === 'true';
        const conditions = (item.dataset.conditions || '').split(',');
        const hasMaterialComponents = item.dataset.materialComponents === 'true';
        const isFavorited = item.dataset.favorited === 'true';
        const isGranted = !!item.querySelector('.tag.granted');
        const isAlwaysPrepared = !!item.querySelector('.tag.always-prepared');
        const isCountable = !isGranted && !isAlwaysPrepared;
        const visible = this._checkSpellVisibility(filters, {
          name,
          isPrepared,
          level,
          school,
          castingTimeType,
          castingTimeValue,
          rangeUnits,
          rangeValue,
          damageTypes,
          isRitual,
          isFavorited,
          isConcentration,
          requiresSave,
          conditions,
          hasMaterialComponents
        });
        item.style.display = visible ? '' : 'none';
        if (visible) {
          visibleCount++;
          if (!levelVisibilityMap.has(level)) {
            levelVisibilityMap.set(level, {
              visible: 0,
              prepared: 0,
              countable: 0,
              countablePrepared: 0
            });
          }
          const levelStats = levelVisibilityMap.get(level);
          levelStats.visible++;
          if (isCountable) {
            levelStats.countable++;
            if (isPrepared) levelStats.countablePrepared++;
          }
          if (isPrepared) levelStats.prepared++;
        }
      }
      const noResults = this.element.querySelector('.no-filter-results');
      if (noResults) noResults.style.display = visibleCount > 0 ? 'none' : 'block';
      this._updateLevelContainers(levelVisibilityMap);
    } catch (error) {
      log(1, 'Error applying filters:', error);
    }
  }

  /**
   * Check if a spell matches the current filters
   * @param {Object} filters - The current filter state
   * @param {Object} spell - The spell to check
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
      const convertedRange = filterUtils.convertRangeToStandardUnit(spell.rangeUnits, rangeValue);
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
      if (spell.hasMaterialComponents === consumed) return false;
    }
    if (filters.ritual && !spell.isRitual) return false;
    if (filters.prepared && !spell.isPrepared) return false;
    if (filters.favorited && !spell.isFavorited) return false;
    return true;
  }

  /**
   * Check if spell name matches the search query with enhanced syntax support
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
   * Update level container visibility and counts
   * @param {Map} levelVisibilityMap - Map of level visibility data
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
