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
    if (this._cachedFilterState && now - this._lastFilterUpdate < 100) return this._cachedFilterState;
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
      concentration: this.element.querySelector('[name="filter-concentration"]')?.value || '',
      materialComponents: this.element.querySelector('[name="filter-materialComponents"]')?.value || '',
      sortBy: this.element.querySelector('[name="sort-by"]')?.value || 'level'
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
    log(3, `After source filter: ${filtered.length} spells remaining`);
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
    if (name) filtered = filtered.filter((spell) => spell.name.toLowerCase().includes(name.toLowerCase()));
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
    const { requiresSave, concentration, ritual, materialComponents } = filterState;
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
        const name = item.querySelector('.spell-name')?.textContent.toLowerCase() || '';
        const isPrepared = item.classList.contains('prepared-spell');
        const level = item.dataset.spellLevel || '';
        const school = item.dataset.spellSchool || '';
        const castingTimeType = item.dataset.castingTimeType || '';
        const castingTimeValue = item.dataset.castingTimeValue || '';
        const rangeUnits = item.dataset.rangeUnits || '';
        const damageTypes = (item.dataset.damageTypes || '').split(',');
        const isRitual = item.dataset.ritual === 'true';
        const isConcentration = item.dataset.concentration === 'true';
        const requiresSave = item.dataset.requiresSave === 'true';
        const conditions = (item.dataset.conditions || '').split(',');
        const hasMaterialComponents = item.dataset.materialComponents === 'true';
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
          rangeValue: item.dataset.rangeValue || '0',
          damageTypes,
          isRitual,
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
    if (filters.name && !spell.name.includes(filters.name.toLowerCase())) return false;
    if (filters.level && spell.level !== filters.level) return false;
    if (filters.school && spell.school !== filters.school) return false;
    if (filters.castingTime) {
      const [filterType, filterValue] = filters.castingTime.split(':');
      const itemType = spell.castingTimeType;
      const itemValue = spell.castingTimeValue === '' || spell.castingTimeValue === null ? '1' : spell.castingTimeValue;
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
      if (filters.requiresSave === 'true' && !spell.requiresSave) return false;
      if (filters.requiresSave === 'false' && spell.requiresSave) return false;
    }
    if (filters.prepared && !spell.isPrepared) return false;
    if (filters.ritual && !spell.isRitual) return false;
    if (filters.concentration) {
      if (filters.concentration === 'true' && !spell.isConcentration) return false;
      if (filters.concentration === 'false' && spell.isConcentration) return false;
    }
    if (filters.materialComponents) {
      if (filters.materialComponents === 'consumed' && !spell.hasMaterialComponents) return false;
      if (filters.materialComponents === 'notConsumed' && spell.hasMaterialComponents) return false;
    }

    return true;
  }

  /**
   * Sort spells according to criteria
   * @param {Array} spells - Spells to sort
   * @param {string} sortBy - Sort criteria
   * @returns {Array} Sorted spells
   */
  sortSpells(spells, sortBy) {
    return [...spells].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'school':
          const schoolA = a.system.school || '';
          const schoolB = b.system.school || '';
          return schoolA.localeCompare(schoolB) || a.name.localeCompare(b.name);
        case 'prepared':
          const prepA = a.preparation.prepared ? 0 : 1;
          const prepB = b.preparation.prepared ? 0 : 1;
          return prepA - prepB || a.name.localeCompare(b.name);
        case 'level':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }

  /**
   * Apply sorting to spells in the DOM
   * @param {string} sortBy - Sort criteria
   */
  applySorting(sortBy) {
    const levelContainers = this.element.querySelectorAll('.spell-level');
    for (const levelContainer of levelContainers) {
      const list = levelContainer.querySelector('.spell-list');
      if (!list) continue;
      const items = Array.from(list.children);
      items.sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.querySelector('.spell-name').textContent.localeCompare(b.querySelector('.spell-name').textContent);
          case 'school':
            const schoolA = a.dataset.spellSchool || '';
            const schoolB = b.dataset.spellSchool || '';
            return schoolA.localeCompare(schoolB) || a.querySelector('.spell-name').textContent.localeCompare(b.querySelector('.spell-name').textContent);
          case 'prepared':
            const aPrepared = a.classList.contains('prepared-spell') ? 0 : 1;
            const bPrepared = b.classList.contains('prepared-spell') ? 0 : 1;
            return aPrepared - bPrepared || a.querySelector('.spell-name').textContent.localeCompare(b.querySelector('.spell-name').textContent);
          default:
            return 0;
        }
      });
      for (const item of items) list.appendChild(item);
    }
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
      const levelStats = levelVisibilityMap.get(levelId) || {
        visible: 0,
        prepared: 0,
        countable: 0,
        countablePrepared: 0
      };
      container.style.display = levelStats.visible > 0 ? '' : '';
      const countDisplay = container.querySelector('.spell-count');
      if (countDisplay && levelStats.countable > 0) {
        countDisplay.textContent = `(${levelStats.countablePrepared}/${levelStats.countable})`;
      } else if (countDisplay) {
        countDisplay.textContent = '';
      }
    }
  }
}
