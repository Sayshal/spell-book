/**
 * Spell Filter Service - Pure filtering logic without DOM dependencies
 *
 * Provides spell filtering capabilities that can be used independently
 * of DOM state. Designed for testability and reusability.
 * @module UIUtils/SpellFilterService
 * @author Tyler
 */

import { log } from '../logger.mjs';

/**
 * Convert a spell range to standard units (feet or meters based on D&D 5e system settings).
 * @param {string} units - The range units (ft, mi, spec, etc.)
 * @param {number} value - The range value to convert
 * @returns {number} The converted range value in standard units
 */
export function convertRangeToStandardUnit(units, value) {
  if (!units || !value) return 0;
  if (units === 'spec') return 0;
  const inFeet = units === 'ft' ? value : units === 'mi' ? value * 5280 : value;
  const defaultUnit = dnd5e.utils.defaultUnits('length');
  if (defaultUnit === 'm') return Math.round(dnd5e.utils.convertLength(inFeet, 'ft', 'm'));
  return inFeet;
}

/**
 * Pure filtering service for spell data.
 * All methods are static and operate on data without DOM dependencies.
 */
export class SpellFilterService {
  /**
   * Filter spells based on filter state.
   * @param {Array<object>} spells - Array of spells to filter
   * @param {object} filterState - Current filter state
   * @param {object} [options] - Filtering options
   * @param {Set<string>} [options.selectedSpellUUIDs] - UUIDs to exclude
   * @param {Function} [options.isSpellInSelectedList] - Function to check if spell is selected
   * @param {string} [options.searchPrefix] - Prefix for advanced search
   * @param {object} [options.searchEngine] - Search engine instance for advanced queries
   * @returns {object} Filtered spells with count information
   */
  static filterSpells(spells, filterState, options = {}) {
    const { selectedSpellUUIDs, isSpellInSelectedList, searchPrefix = '/', searchEngine } = options;
    let remainingSpells = [...spells];
    if (selectedSpellUUIDs && isSpellInSelectedList) remainingSpells = this._filterBySelectedList(remainingSpells, selectedSpellUUIDs, isSpellInSelectedList);
    remainingSpells = this._filterBySource(remainingSpells, filterState);
    remainingSpells = this._filterBySpellSource(remainingSpells, filterState);
    remainingSpells = this._filterByBasicProperties(remainingSpells, filterState, searchPrefix, searchEngine);
    remainingSpells = this._filterByRange(remainingSpells, filterState);
    remainingSpells = this._filterByDamageAndConditions(remainingSpells, filterState);
    remainingSpells = this._filterBySpecialProperties(remainingSpells, filterState);
    log(3, 'SpellFilterService: spells filtered.', { filteredCount: remainingSpells.length });
    return { spells: remainingSpells, totalFiltered: remainingSpells.length };
  }

  /**
   * Check if a spell matches the filter criteria.
   * @param {object} spell - Spell object with system/filterData properties
   * @param {object} filterState - Current filter state
   * @param {object} [options] - Additional options
   * @param {string} [options.searchPrefix] - Prefix for advanced search
   * @returns {boolean} Whether the spell matches all filters
   */
  static matchSpell(spell, filterState, options = {}) {
    const { searchPrefix = '/' } = options;
    const result = this.filterSpells([spell], filterState, { searchPrefix });
    return result.spells.length > 0;
  }

  /**
   * Filter out spells already in the selected list.
   * @param {Array<object>} spells - Spells to filter
   * @param {Set<string>} selectedSpellUUIDs - UUIDs in selected list
   * @param {Function} isSpellInSelectedList - Function to check if spell is in list
   * @returns {Array<object>} Filtered spells excluding those in selected list
   * @private
   */
  static _filterBySelectedList(spells, selectedSpellUUIDs, isSpellInSelectedList) {
    return spells.filter((spell) => !isSpellInSelectedList(spell, selectedSpellUUIDs));
  }

  /**
   * Filter spells by source.
   * @param {Array<object>} spells - Spells to filter
   * @param {object} filterState - Current filter state
   * @returns {Array<object>} Filtered spells matching source criteria
   * @private
   */
  static _filterBySource(spells, filterState) {
    const { source } = filterState;
    if (!source || source.trim() === '' || source === 'all') return spells;
    const beforeCount = spells.length;
    const filtered = spells.filter((spell) => {
      const spellSource = (spell.sourceId || '').split('.')[0];
      const packName = spell.packName || '';
      return spellSource.includes(source) || spellSource === source || packName.toLowerCase().includes(source.toLowerCase());
    });
    if (filtered.length === 0 && beforeCount > 0) {
      filterState.source = 'all';
      log(3, 'SpellFilterService: Source filter returned no results, resetting to all.', { source });
      return spells;
    }
    log(3, 'SpellFilterService: Filtered by source.', { source, beforeCount, afterCount: filtered.length });
    return filtered;
  }

  /**
   * Filter spells by spell source (spell.system.source.label).
   * @param {Array<object>} spells - Spells to filter
   * @param {object} filterState - Current filter state
   * @returns {Array<object>} Filtered spells matching spell source criteria
   * @private
   */
  static _filterBySpellSource(spells, filterState) {
    const { spellSource } = filterState;
    if (!spellSource || spellSource.trim() === '' || spellSource === 'all') return spells;
    const beforeCount = spells.length;
    const filtered = spells.filter((spell) => {
      const spellSourceId = spell.filterData?.spellSourceId;
      return spellSourceId === spellSource;
    });
    if (filtered.length === 0 && beforeCount > 0) {
      filterState.spellSource = 'all';
      log(3, 'SpellFilterService: Spell source filter returned no results, resetting to all.', { spellSource });
      return spells;
    }
    log(3, 'SpellFilterService: Filtered by spell source.', { spellSource, beforeCount, afterCount: filtered.length });
    return filtered;
  }

  /**
   * Filter spells by basic properties (name, level, school, casting time).
   * @param {Array<object>} spells - Spells to filter
   * @param {object} filterState - Current filter state
   * @param {string} searchPrefix - Advanced search prefix
   * @param {object} searchEngine - Search engine for advanced queries
   * @returns {Array<object>} Filtered spells matching basic property criteria
   * @private
   */
  static _filterByBasicProperties(spells, filterState, searchPrefix, searchEngine) {
    const { name, level, school, castingTime } = filterState;
    let filtered = spells;
    if (name && name.trim()) filtered = this._filterByEnhancedName(filtered, name, searchPrefix, searchEngine);
    if (level) filtered = filtered.filter((spell) => dnd5e.Filter.performCheck(spell, { k: 'level', v: parseInt(level), o: 'exact' }));
    if (school) filtered = filtered.filter((spell) => dnd5e.Filter.performCheck(spell, { k: 'school', v: school, o: 'exact' }));
    if (castingTime) {
      const [filterType, filterValue] = castingTime.split(':');
      filtered = filtered.filter((spell) => {
        const castingTimeTypeMatch = dnd5e.Filter.performCheck(spell, { k: 'filterData.castingTime.type', v: filterType, o: 'exact' });
        if (!castingTimeTypeMatch) return dnd5e.Filter.performCheck(spell, { k: 'system.activation.type', v: filterType, o: 'exact' });
        const spellCastingValue = String(spell.filterData?.castingTime?.value || spell.system?.activation?.value || '1');
        return castingTimeTypeMatch && spellCastingValue === filterValue;
      });
    }
    log(3, 'SpellFilterService: Filtered by basic properties.', { name, level, school, castingTime, resultCount: filtered.length });
    return filtered;
  }

  /**
   * Enhanced name filtering with fuzzy search and advanced syntax.
   * @param {Array<object>} spells - Spells to filter
   * @param {string} searchQuery - Search query string
   * @param {string} searchPrefix - Advanced search prefix
   * @param {object} searchEngine - Search engine for advanced queries
   * @returns {Array<object>} Filtered spells matching name criteria
   * @private
   */
  static _filterByEnhancedName(spells, searchQuery, searchPrefix, searchEngine) {
    if (!searchQuery || !searchQuery.trim()) return spells;
    const query = searchQuery.trim();
    if (query.startsWith(searchPrefix)) {
      if (searchEngine && searchEngine.isCurrentQueryAdvanced()) {
        const filtered = searchEngine.executeAdvancedQuery(spells);
        log(3, 'SpellFilterService: Filtered by advanced search.', { query, resultCount: filtered.length });
        return filtered;
      } else return [];
    }
    const exactPhraseMatch = query.match(/^["'](.+?)["']$/);
    if (exactPhraseMatch) {
      const phrase = exactPhraseMatch[1].toLowerCase();
      const filtered = spells.filter((spell) => {
        const spellName = spell.name ? spell.name.toLowerCase() : '';
        return spellName.includes(phrase);
      });
      log(3, 'SpellFilterService: Filtered by exact phrase.', { phrase, resultCount: filtered.length });
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
    log(3, 'SpellFilterService: Filtered by enhanced name.', { query, resultCount: filtered.length });
    return filtered;
  }

  /**
   * Filter spells by range.
   * @param {Array<object>} spells - Spells to filter
   * @param {object} filterState - Current filter state
   * @returns {Array<object>} Filtered spells within specified range
   * @private
   */
  static _filterByRange(spells, filterState) {
    const { minRange, maxRange } = filterState;
    if (!minRange && !maxRange) return spells;
    const filtered = spells.filter((spell) => {
      if (!(spell.filterData?.range?.units || spell.system?.range?.units)) return true;
      const rangeUnits = spell.filterData?.range?.units || spell.system?.range?.units || '';
      const rangeValue = parseInt(spell.system?.range?.value || 0);
      const standardizedRange = convertRangeToStandardUnit(rangeUnits, rangeValue);
      const minRangeVal = minRange ? parseInt(minRange) : 0;
      const maxRangeVal = maxRange ? parseInt(maxRange) : Infinity;
      return standardizedRange >= minRangeVal && standardizedRange <= maxRangeVal;
    });
    log(3, 'SpellFilterService: Filtered by range.', { minRange, maxRange, resultCount: filtered.length });
    return filtered;
  }

  /**
   * Filter spells by damage types and conditions.
   * @param {Array<object>} spells - Spells to filter
   * @param {object} filterState - Current filter state
   * @returns {Array<object>} Filtered spells matching damage/condition criteria
   * @private
   */
  static _filterByDamageAndConditions(spells, filterState) {
    const { damageType, condition } = filterState;
    let filtered = spells;
    if (damageType) {
      filtered = filtered.filter((spell) => {
        const spellDamageTypes = Array.isArray(spell.filterData?.damageTypes) ? spell.filterData.damageTypes : [];
        if (spellDamageTypes.length === 0) return false;
        return dnd5e.Filter.performCheck(spell, { k: 'filterData.damageTypes', v: damageType, o: 'has' });
      });
    }
    if (condition) filtered = filtered.filter((spell) => dnd5e.Filter.performCheck(spell, { k: 'filterData.conditions', v: condition, o: 'has' }));
    log(3, 'SpellFilterService: Filtered by damage and conditions.', { damageType, condition, resultCount: filtered.length });
    return filtered;
  }

  /**
   * Filter spells by special properties (saves, concentration, ritual).
   * @param {Array<object>} spells - Spells to filter
   * @param {object} filterState - Current filter state
   * @returns {Array<object>} Filtered spells matching special property criteria
   * @private
   */
  static _filterBySpecialProperties(spells, filterState) {
    const { requiresSave, concentration, ritual, favorited, materialComponents } = filterState;
    let filtered = spells;
    if (requiresSave) {
      const expectedValue = requiresSave === 'true';
      filtered = filtered.filter((spell) => dnd5e.Filter.performCheck(spell, { k: 'filterData.requiresSave', v: expectedValue, o: 'exact' }));
    }
    if (concentration) {
      const expectedValue = concentration === 'true';
      filtered = filtered.filter((spell) => {
        const requiresConcentration = !!spell.filterData?.concentration;
        return requiresConcentration === expectedValue;
      });
    }
    if (materialComponents) {
      const expectedValue = materialComponents === 'consumed';
      filtered = filtered.filter((spell) => {
        const hasMaterialComponents = spell.filterData?.materialComponents?.hasConsumedMaterials || false;
        return hasMaterialComponents === expectedValue;
      });
    }
    if (favorited) filtered = filtered.filter((spell) => dnd5e.Filter.performCheck(spell, { k: 'favorited', v: true, o: 'exact' }));
    if (ritual) filtered = filtered.filter((spell) => dnd5e.Filter.performCheck(spell, { k: 'filterData.isRitual', v: true, o: 'exact' }));
    log(3, 'SpellFilterService: Filtered by special properties.', { requiresSave, concentration, ritual, favorited, materialComponents, resultCount: filtered.length });
    return filtered;
  }

  /**
   * Check if spell name matches the search query with enhanced syntax support.
   * @param {string} searchQuery - The search query
   * @param {string} spellName - The spell name to check
   * @returns {boolean} Whether the spell name matches
   */
  static checkEnhancedNameMatch(searchQuery, spellName) {
    if (!searchQuery || !searchQuery.trim()) return true;
    if (!spellName) return false;
    const query = searchQuery.trim();
    const spellNameLower = spellName.toLowerCase().trim();
    const exactPhraseMatch = query.match(/^["'](.+?)["']$/);
    if (exactPhraseMatch) return spellNameLower === exactPhraseMatch[1].toLowerCase().trim();
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 0);
    if (queryWords.length === 1) return spellNameLower.includes(queryWords[0]);
    const allWordsMatch = queryWords.every((word) => spellNameLower.includes(word));
    const phraseMatch = spellNameLower.includes(query.toLowerCase());
    return allWordsMatch || phraseMatch;
  }
}
