import { log } from '../../logger.mjs';
import * as filterUtils from '../filters.mjs';

/**
 * Helper class for filtering spells in the spellbook application
 */
export class SpellbookFilterHelper {
  /**
   * Create a new filter helper
   * @param {PlayerSpellBook} app - The parent application
   */
  constructor(app) {
    this.app = app;
    this.actor = app.actor;
  }

  /**
   * Get the application's element
   * @returns {HTMLElement|null} The application element
   */
  get element() {
    return this.app.element;
  }

  /**
   * Get the current filter state from the UI
   * @returns {Object} The filter state
   */
  getFilterState() {
    if (!this.element) return filterUtils.getDefaultFilterState();

    return {
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
      sortBy: this.element.querySelector('[name="sort-by"]')?.value || 'level'
    };
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
          conditions
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
      if (noResults) {
        noResults.style.display = visibleCount > 0 ? 'none' : 'block';
      }

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
    try {
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

        for (const item of items) {
          list.appendChild(item);
        }
      }
    } catch (error) {
      log(1, 'Error applying sorting:', error);
    }
  }

  /**
   * Update level container visibility and counts
   * @param {Map} levelVisibilityMap - Map of level visibility data
   * @private
   */
  _updateLevelContainers(levelVisibilityMap) {
    try {
      const levelContainers = this.element.querySelectorAll('.spell-level');

      for (const container of levelContainers) {
        const levelId = container.dataset.level;
        const levelStats = levelVisibilityMap.get(levelId) || {
          visible: 0,
          prepared: 0,
          countable: 0,
          countablePrepared: 0
        };

        container.style.display = levelStats.visible > 0 ? '' : ''; // TODO: Fix this when '' = none, our new templates changed how this is found
        const countDisplay = container.querySelector('.spell-count');
        if (countDisplay && levelStats.countable > 0) {
          countDisplay.textContent = `(${levelStats.countablePrepared}/${levelStats.countable})`;
        } else if (countDisplay) {
          countDisplay.textContent = '';
        }
      }
    } catch (error) {
      log(1, 'Error updating level containers:', error);
    }
  }
}
