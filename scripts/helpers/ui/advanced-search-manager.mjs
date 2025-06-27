import { PlayerSpellBook } from '../../apps/player-spell-book.mjs';
import { FLAGS, MODULE } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import { FieldDefinitions } from './field-definitions.mjs';
import { QueryExecutor } from './query-executor.mjs';
import { QueryParser } from './query-parser.mjs';

/**
 * Advanced search manager for handling Google-style search with recent searches and fuzzy matching
 */
export class AdvancedSearchManager {
  /**
   * Create a new advanced search manager
   * @param {PlayerSpellBook} app - The parent application
   */
  constructor(app) {
    this.app = app;
    this.actor = app.actor;
    this.searchTimeout = null;
    this.isDropdownVisible = false;
    this.selectedSuggestionIndex = -1;
    this.isFieldSuggestionActive = false;
    this.fieldDefinitions = new FieldDefinitions();
    this.queryParser = new QueryParser(this.fieldDefinitions);
    this.queryExecutor = new QueryExecutor();
    this.isAdvancedQuery = false;
    this.parsedQuery = null;
    this.queryCache = new Map();
    this.lastParsedQuery = null;
    this.focusDebounceTimeout = null;
    this.lastDropdownQuery = null;
    this.isProcessingFocusEvent = false;
  }

  /**
   * Get the application's element
   * @returns {HTMLElement|null} The application element
   */
  get element() {
    return this.app.element;
  }

  /**
   * Initialize advanced search functionality
   */
  initialize() {
    this.cleanup();
    this.setupSearchInterface();
    this.setupEventListeners();
  }

  /**
   * Parse and cache query to avoid redundant parsing
   * @param {string} query - Query string without the ^ prefix
   * @returns {Object|null} Parsed query object or null
   */
  parseAndCacheQuery(query) {
    if (this.queryCache.has(query)) return this.queryCache.get(query);
    try {
      const parsed = this.queryParser.parseQuery(query);
      this.queryCache.set(query, parsed);
      return parsed;
    } catch (error) {
      this.queryCache.set(query, null);
      return null;
    }
  }

  /**
   * Setup the enhanced search interface
   */
  setupSearchInterface() {
    log(3, 'Starting setupSearchInterface...');
    const searchInput = this.element.querySelector('input[name="filter-name"]');
    log(3, 'Search input found:', !!searchInput, searchInput);
    if (!searchInput) {
      log(1, 'No search input found, aborting setupSearchInterface');
      return;
    }
    const hasAdvancedClass = searchInput.classList.contains('advanced-search-input');
    log(3, 'Search input has advanced class:', hasAdvancedClass);
    const existingDropdown = document.querySelector('.search-dropdown');
    log(3, 'Existing dropdown found:', !!existingDropdown);
    if (!hasAdvancedClass) {
      searchInput.classList.add('advanced-search-input');
      searchInput.setAttribute('placeholder', game.i18n.localize('SPELLBOOK.Search.AdvancedPlaceholder'));
      searchInput.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Search.AdvancedSyntaxSupport'));
      searchInput.setAttribute('autocomplete', 'off');
      searchInput.setAttribute('spellcheck', 'false');
      searchInput.setAttribute('aria-expanded', 'false');
      searchInput.setAttribute('aria-haspopup', 'listbox');
      searchInput.setAttribute('role', 'combobox');
    }
    this.searchInputElement = searchInput;
    this.createClearButton();
    this.createDropdown();
    log(3, 'Search interface setup complete');
  }

  /**
   * Create clear button for search input
   */
  createClearButton() {
    if (this.clearButtonElement) return;
    const searchContainer = this.searchInputElement.parentElement;
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'search-clear-button';
    clearButton.innerHTML = '×';
    clearButton.style.display = 'none';
    clearButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Search.ClearSearch'));
    clearButton.setAttribute('tabindex', '-1');
    searchContainer.appendChild(clearButton);
    this.clearButtonElement = clearButton;
  }

  /**
   * Create dropdown container
   */
  createDropdown() {
    if (document.querySelector('.search-dropdown')) return;
    const dropdown = document.createElement('div');
    dropdown.className = 'search-dropdown';
    dropdown.style.display = 'none';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Search.SearchSuggestions'));
    document.body.appendChild(dropdown);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (!this.searchInputElement) return;
    this.searchInputElement.addEventListener('input', this.handleSearchInput.bind(this));
    this.searchInputElement.addEventListener('focus', this.handleSearchFocus.bind(this));
    this.searchInputElement.addEventListener('blur', this.handleSearchBlur.bind(this));
    this.searchInputElement.addEventListener('keydown', this.handleSearchKeydown.bind(this));
    if (this.clearButtonElement) this.clearButtonElement.addEventListener('click', this.clearSearch.bind(this));
    document.addEventListener('click', this.handleDocumentClick.bind(this));
    log(3, 'Event listeners setup complete');
  }

  /**
   * Handle search input changes
   * @param {Event} event - Input event
   */
  handleSearchInput(event) {
    const query = event.target.value;
    this.updateClearButtonVisibility();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (query.startsWith('^')) {
      this.searchTimeout = setTimeout(async () => {
        try {
          await this.app._ensureSpellDataAndInitializeLazyLoading();
          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (error) {
          log(2, 'Error ensuring spell data for advanced search:', error);
        }
        this.updateDropdownContent(query);
        if (this.isAdvancedQueryComplete(query)) log(3, 'Advanced query appears complete, but waiting for Enter key');
      }, 150);
    } else {
      this.searchTimeout = setTimeout(async () => {
        try {
          await this.app._ensureSpellDataAndInitializeLazyLoading();
          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (error) {
          log(2, 'Error ensuring spell data for fuzzy search:', error);
        }
        this.updateDropdownContent(query);
        this.performSearch(query);
      }, 800);
    }
    if (!this.isDropdownVisible) this.showDropdown();
  }

  /**
   * Check if an advanced query appears to be complete
   * @param {string} query - The query to check
   * @returns {boolean} Whether the query seems complete
   */
  isAdvancedQueryComplete(query) {
    if (!query.startsWith('^')) return false;
    const queryWithoutTrigger = query.substring(1);
    try {
      const parsed = this.parseAndCacheQuery(queryWithoutTrigger);
      return parsed !== null;
    } catch (error) {
      log(3, 'Query validation failed:', error.message);
      return false;
    }
  }

  /**
   * Handle keyboard navigation in search
   * @param {Event} event - Keydown event
   */
  handleSearchKeydown(event) {
    const dropdown = document.querySelector('.search-dropdown');
    const suggestions = dropdown ? dropdown.querySelectorAll('.search-suggestion') : [];
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, suggestions.length - 1);
        this.updateSuggestionSelection(suggestions);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, -1);
        this.updateSuggestionSelection(suggestions);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.selectedSuggestionIndex >= 0 && suggestions[this.selectedSuggestionIndex]) {
          this.selectSuggestion(suggestions[this.selectedSuggestionIndex]);
        } else {
          const query = event.target.value;
          if (query.startsWith('^') && this.isAdvancedQueryComplete(query)) {
            this.performSearch(query);
            this.addToRecentSearches(query);
            this.hideDropdown();
          }
        }
        break;
      case 'Escape':
        this.hideDropdown();
        event.target.blur();
        break;
    }
  }

  /**
   * Handle search focus
   * @param {Event} event - Focus event
   */
  handleSearchFocus(event) {
    if (this.isProcessingFocusEvent) return;
    this.isProcessingFocusEvent = true;
    if (this.focusDebounceTimeout) clearTimeout(this.focusDebounceTimeout);
    this.focusDebounceTimeout = setTimeout(() => {
      const query = event.target.value;
      this.updateDropdownContent(query);
      this.showDropdown();
      this.isProcessingFocusEvent = false;
    }, 50);
  }

  /**
   * Handle search blur
   * @param {Event} event - Blur event
   */
  handleSearchBlur(event) {
    setTimeout(() => {
      if (!document.querySelector('.search-dropdown:hover')) this.hideDropdown();
    }, 150);
  }

  /**
   * Handle document click
   * @param {Event} event - Click event
   */
  handleDocumentClick(event) {
    const dropdown = document.querySelector('.search-dropdown');
    if (event.target.closest('.search-suggestion')) {
      this.selectSuggestion(event.target.closest('.search-suggestion'));
      return;
    }
    if (event.target.closest('.clear-recent-search')) {
      const searchText = event.target.closest('.search-suggestion').dataset.query;
      this.removeFromRecentSearches(searchText);
      this.updateDropdownContent(this.searchInputElement.value);
      return;
    }
    if (!event.target.closest('.advanced-search-input') && !event.target.closest('.search-dropdown')) this.hideDropdown();
  }

  /**
   * Select a suggestion
   * @param {Element} suggestionElement - The suggestion element
   */
  selectSuggestion(suggestionElement) {
    const query = suggestionElement.dataset.query;
    if (!query) return;
    this.searchInputElement.value = query;
    this.searchInputElement.focus();
    if (suggestionElement.classList.contains('submit-query')) {
      this.performSearch(query);
      this.addToRecentSearches(query);
      this.hideDropdown();
    } else {
      this.updateDropdownContent(query);
      this.updateClearButtonVisibility();
    }
    this.selectedSuggestionIndex = -1;
  }

  /**
   * Show dropdown
   */
  showDropdown() {
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown || this.isDropdownVisible) return;
    const rect = this.searchInputElement.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.display = 'block';
    dropdown.style.zIndex = '1000';
    dropdown.classList.add('visible');
    this.searchInputElement.setAttribute('aria-expanded', 'true');
    this.isDropdownVisible = true;
    this.selectedSuggestionIndex = -1;
    log(3, 'Search dropdown shown');
  }

  /**
   * Hide dropdown
   */
  hideDropdown() {
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown || !this.isDropdownVisible) return;
    dropdown.style.display = 'none';
    dropdown.classList.remove('visible');
    this.searchInputElement.setAttribute('aria-expanded', 'false');
    this.isDropdownVisible = false;
    this.selectedSuggestionIndex = -1;
    log(3, 'Search dropdown hidden');
  }

  /**
   * Update dropdown content based on current query
   * @param {string} query - Current search query
   */
  async updateDropdownContent(query) {
    if (this.lastDropdownQuery === query) return;
    this.lastDropdownQuery = query;
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown) return;
    let content = '';
    this.isAdvancedQuery = query.startsWith('^');
    if (this.isAdvancedQuery) content += this._generateAdvancedQueryContent(query);
    else content += this._generateStandardQueryContent(query);
    dropdown.innerHTML = content;
    log(3, 'Dropdown content updated for query:', query);
  }

  /**
   * Generate content for advanced queries
   * @param {string} query - The query string
   * @returns {string} HTML content
   * @private
   */
  _generateAdvancedQueryContent(query) {
    const queryWithoutTrigger = query.substring(1);
    let content = `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.Advanced')}</div>`;
    if (this.isIncompleteAndQuery(query)) {
      content += `<div class="search-status info">${game.i18n.localize('SPELLBOOK.Search.EnterField')}</div>`;
      const fieldAliases = this.fieldDefinitions.getAllFieldAliases();
      const uniqueFields = [];
      const seenFields = new Set();
      for (const alias of fieldAliases) {
        const fieldId = this.fieldDefinitions.getFieldId(alias);
        if (fieldId && !seenFields.has(fieldId)) {
          seenFields.add(fieldId);
          uniqueFields.push(alias);
        }
      }
      if (uniqueFields.length > 0) {
        content += `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.Fields')}</div>`;
        uniqueFields.forEach((field) => {
          const tooltipAttr = field.length > 32 ? `data-tooltip="${field}"` : '';
          content += `<div class="search-suggestion" data-query="${query}${field}:" role="option" tabindex="-1" aria-selected="false">
            <span class="suggestion-text" ${tooltipAttr}>${field}</span>
          </div>`;
        });
      }
      return content;
    }
    const endsWithFieldColon = this.queryEndsWithFieldColon(queryWithoutTrigger);
    if (endsWithFieldColon) {
      const fieldId = this.fieldDefinitions.getFieldId(endsWithFieldColon);
      content += `<div class="search-status info">${game.i18n.localize('SPELLBOOK.Search.EnterValue')}</div>`;
      if (fieldId && fieldId !== 'range') {
        const validValues = this.fieldDefinitions.getValidValuesForField(fieldId);
        if (validValues.length > 0) {
          content += `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.Values')}</div>`;
          validValues.forEach((value) => {
            const tooltipAttr = value.length > 32 ? `data-tooltip="${value}"` : '';
            content += `<div class="search-suggestion" data-query="${query}${value}" role="option" tabindex="-1" aria-selected="false">
              <span class="suggestion-text" ${tooltipAttr}>${value}</span>
            </div>`;
          });
        }
      }
      return content;
    }
    const incompleteValueMatch = this.isIncompleteValue(queryWithoutTrigger);
    if (incompleteValueMatch) {
      const { field: fieldId, value: currentValue } = incompleteValueMatch;
      content += `<div class="search-status info">${game.i18n.localize('SPELLBOOK.Search.CompleteValue')}</div>`;
      const validValues = this.fieldDefinitions.getValidValuesForField(fieldId);
      const matchingValues = validValues.filter((value) => value.toLowerCase().startsWith(currentValue.toLowerCase()));
      if (matchingValues.length > 0) {
        content += `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.MatchingValues')}</div>`;
        matchingValues.forEach((value) => {
          const beforeColon = queryWithoutTrigger.substring(0, queryWithoutTrigger.lastIndexOf(':') + 1);
          const fullQuery = `^${beforeColon}${value}`;
          const tooltipAttr = value.length > 32 ? `data-tooltip="${value}"` : '';
          content += `<div class="search-suggestion" data-query="${fullQuery}" role="option" tabindex="-1" aria-selected="false">
            <span class="suggestion-text" ${tooltipAttr}>${value}</span>
          </div>`;
        });
      }
      return content;
    }
    if (this.isAdvancedQueryComplete(query)) {
      content += `<div class="search-suggestion submit-query" data-query="${query}" role="option" tabindex="-1" aria-selected="false">
        <span class="suggestion-text">${game.i18n.localize('SPELLBOOK.Search.ExecuteQuery')}</span>
        <span class="suggestion-execute">⏎</span>
      </div>`;
    }
    return content;
  }

  /**
   * Check if query ends with AND and needs a field
   * @param {string} query - The query to check
   * @returns {boolean} Whether it ends with AND
   */
  isIncompleteAndQuery(query) {
    if (!query.startsWith('^')) return false;
    const queryWithoutTrigger = query.substring(1);
    const trimmed = queryWithoutTrigger.trim();
    return trimmed.endsWith(' AND') || queryWithoutTrigger.endsWith(' AND ');
  }

  /**
   * Check if query ends with a field name followed by a colon
   * @param {string} query - Query without the ^ prefix
   * @returns {string|null} Field name if found, null otherwise
   */
  queryEndsWithFieldColon(query) {
    const parts = query.split(/\s+AND\s+/i);
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart && lastPart.endsWith(':')) {
      const potentialField = lastPart.slice(0, -1);
      return this.fieldDefinitions.getFieldId(potentialField) ? potentialField : null;
    }
    return null;
  }

  /**
   * Check if a value appears to be incomplete while typing
   * @param {string} queryWithoutTrigger - Query without ^ prefix
   * @returns {Object|null} Object with field and value if incomplete, null otherwise
   */
  isIncompleteValue(queryWithoutTrigger) {
    const parts = queryWithoutTrigger.split(/\s+AND\s+/i);
    const lastPart = parts[parts.length - 1].trim();
    const colonIndex = lastPart.indexOf(':');
    if (colonIndex !== -1) {
      const field = lastPart.substring(0, colonIndex);
      const value = lastPart.substring(colonIndex + 1);
      const fieldId = this.fieldDefinitions.getFieldId(field);
      if (fieldId && value && this.isIncompleteValueForField(fieldId, value)) return { field: fieldId, value };
    }
    return null;
  }

  /**
   * Check if a value appears to be incomplete while typing
   * @param {string} fieldId - The field ID
   * @param {string} value - The value being typed
   * @returns {boolean} Whether the value appears incomplete
   */
  isIncompleteValueForField(fieldId, value) {
    if (['requiresSave', 'concentration', 'prepared', 'ritual'].includes(fieldId)) {
      const upperValue = value.toUpperCase();
      const validValues = ['TRUE', 'FALSE', 'YES', 'NO'];
      if (!validValues.includes(upperValue)) return validValues.some((valid) => valid.startsWith(upperValue));
    }
    return value.length < 2;
  }

  /**
   * Generate content for standard queries
   * @param {string} query - The query string
   * @returns {string} HTML content
   * @private
   */
  _generateStandardQueryContent(query) {
    let content = '';
    if (!query || query.length < 3) content += this._generateRecentSearches();
    else content += this._generateFuzzyMatches(query);
    return content;
  }

  /**
   * Generate recent searches content
   * @returns {string} HTML content
   * @private
   */
  _generateRecentSearches() {
    const recentSearches = this.getRecentSearches();
    if (recentSearches.length === 0) return `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.NoRecent')}</div>`;
    let content = `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.Recent')}</div>`;
    recentSearches.forEach((search) => {
      const tooltipAttr = search.length > 32 ? `data-tooltip="${search}"` : '';
      content += `<div class="search-suggestion" data-query="${search}" role="option" tabindex="-1" aria-selected="false">
        <span class="suggestion-text" ${tooltipAttr}>${search}</span>
        <button class="clear-recent-search" aria-label="${game.i18n.localize('SPELLBOOK.Search.Remove')}">&times;</button>
      </div>`;
    });
    return content;
  }

  /**
   * Generate fuzzy matches content
   * @param {string} query - The query string
   * @returns {string} HTML content
   * @private
   */
  _generateFuzzyMatches(query) {
    let content = `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.Suggestions')}</div>`;
    const spells = this.app._stateManager?.getCurrentSpellList() || [];
    const matches = spells.filter((spell) => spell.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
    if (matches.length > 0) {
      matches.forEach((spell) => {
        const tooltipAttr = spell.name.length > 32 ? `data-tooltip="${spell.name}"` : '';
        content += `<div class="search-suggestion" data-query="${spell.name}" role="option" tabindex="-1" aria-selected="false">
          <span class="suggestion-text" ${tooltipAttr}>${spell.name}</span>
        </div>`;
      });
    } else content += `<div class="search-status">${game.i18n.localize('SPELLBOOK.Search.NoMatches')}</div>`;
    return content;
  }

  /**
   * Check if query is a complete field:value expression
   * @param {string} query - The query to check
   * @returns {boolean} Whether it's a complete field:value
   */
  isCompleteFieldValue(query) {
    if (!query.startsWith('^')) return false;
    const queryWithoutTrigger = query.substring(1);
    const colonIndex = queryWithoutTrigger.indexOf(':');
    if (colonIndex === -1) return false;
    const fieldPart = queryWithoutTrigger.substring(0, colonIndex);
    const valuePart = queryWithoutTrigger.substring(colonIndex + 1);
    if (!fieldPart || !valuePart) return false;
    const fieldId = this.fieldDefinitions.getFieldId(fieldPart);
    if (!fieldId) return false;
    try {
      return this.fieldDefinitions.validateValue(fieldId, valuePart);
    } catch {
      return false;
    }
  }

  /**
   * Check if query contains AND operators
   * @param {string} query - The query to check
   * @returns {boolean} Whether it contains AND operators
   */
  hasAndOperators(query) {
    const upperQuery = query.toUpperCase();
    return upperQuery.includes(' AND ');
  }

  /**
   * Update visual selection of suggestions
   * @param {NodeList} suggestions - List of suggestion elements
   */
  updateSuggestionSelection(suggestions) {
    suggestions.forEach((suggestion, index) => {
      const isSelected = index === this.selectedSuggestionIndex;
      suggestion.classList.toggle('selected', isSelected);
      suggestion.setAttribute('aria-selected', isSelected.toString());
    });
  }

  /**
   * Perform the actual search
   * @param {string} query - Search query
   */
  async performSearch(query) {
    try {
      if (query && query.startsWith('^')) {
        const parsedQuery = this.parseAndCacheQuery(query.substring(1));
        if (parsedQuery) {
          this.isAdvancedQuery = true;
          this.parsedQuery = parsedQuery;
          this.applyAdvancedQueryToFilters(parsedQuery);
          this.app.filterHelper.invalidateFilterCache();
          setTimeout(() => {
            this.app.filterHelper.applyFilters();
          }, 100);
          return;
        }
      }
      this.isAdvancedQuery = false;
      this.parsedQuery = null;
      this.app.filterHelper.invalidateFilterCache();
      setTimeout(() => {
        this.app.filterHelper.applyFilters();
      }, 100);
    } catch (error) {
      log(1, 'Error in performSearch:', error);
    }
  }

  /**
   * Apply advanced query results to filter state
   * @param {Object} parsedQuery - The parsed query object
   */
  applyAdvancedQueryToFilters(parsedQuery) {
    if (!this.app.filterHelper._cachedFilterState) this.app.filterHelper._cachedFilterState = {};
    if (parsedQuery.type === 'conjunction') {
      for (const condition of parsedQuery.conditions) {
        if (condition.type === 'field') {
          if (condition.field === 'range') {
            const [min, max] = this.parseRangeValue(condition.value);
            this.app.filterHelper._cachedFilterState.minRange = min;
            this.app.filterHelper._cachedFilterState.maxRange = max;
            this.setRangeFilterValue(condition.value);
          } else {
            this.app.filterHelper._cachedFilterState[condition.field] = condition.value;
            this.setFilterValue(condition.field, condition.value);
          }
        }
      }
    }
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]') || document.querySelector('input[name="spell-search"]');
    if (searchInput && searchInput.value) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      this.updateClearButtonVisibility();
    }
    log(3, 'Advanced query filters applied');
  }

  /**
   * Parse a range value string into min and max components
   * @param {string} rangeValue - Range value like "0-30" or "5-100"
   * @returns {Array} [min, max] values
   */
  parseRangeValue(rangeValue) {
    if (!rangeValue || !rangeValue.includes('-')) return [null, null];
    const parts = rangeValue.split('-');
    const min = parts[0] ? parseInt(parts[0]) : null;
    const max = parts[1] ? parseInt(parts[1]) : null;
    return [min, max];
  }

  /**
   * Set range filter values in the UI
   * @param {string} rangeValue - Range value like "0-30"
   */
  setRangeFilterValue(rangeValue) {
    const [min, max] = this.parseRangeValue(rangeValue);
    if (min !== null) {
      const minInput = document.querySelector('input[name="min-range"]');
      if (minInput) {
        minInput.value = min;
        minInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    if (max !== null) {
      const maxInput = document.querySelector('input[name="max-range"]');
      if (maxInput) {
        maxInput.value = max;
        maxInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  /**
   * Set filter value in the UI
   * @param {string} fieldId - Field identifier
   * @param {string} value - Value to set
   */
  setFilterValue(fieldId, value) {
    const filterElement = this.element.querySelector(`[name="filter-${fieldId}"]`);
    if (!filterElement) {
      log(3, `Filter element not found for field: ${fieldId}`);
      return;
    }
    if (filterElement.type === 'checkbox') {
      filterElement.checked = value === 'true';
      filterElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (filterElement.tagName === 'SELECT') {
      filterElement.value = value;
      filterElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      filterElement.value = value;
      filterElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    log(3, `Set filter ${fieldId} to: ${value}`);
  }

  /**
   * Ensure spells matching the search query are loaded in the DOM
   * @param {string} query - Search query
   */
  async ensureSpellsLoadedForSearch(query) {
    let allSpells = [];
    const activeClass = this.app._stateManager?.activeClass;
    if (activeClass && this.app._stateManager.classSpellData[activeClass]?.spellLevels) allSpells = this.app._stateManager.classSpellData[activeClass].spellLevels;
    if (allSpells.length === 0) return;
    const matchingIndices = [];
    if (query.startsWith('^') && this.isCurrentQueryAdvanced()) {
      log(3, 'Advanced query detected, ensuring all spells are loaded for filtering');
      const totalSpells = allSpells.length;
      const currentlyLoaded = document.querySelectorAll('.spell-item').length;
      if (totalSpells > currentlyLoaded) {
        log(3, 'Loading all spells for advanced query filtering');
        try {
          await this.app._ensureSpellDataAndInitializeLazyLoading();
          let attempts = 0;
          const maxAttempts = 15;
          while (document.querySelectorAll('.spell-item').length < totalSpells && attempts < maxAttempts) {
            if (this.app._renderSpellBatch) this.app._renderSpellBatch();
            else if (this.app._initializeLazyLoading) this.app._initializeLazyLoading();
            await new Promise((resolve) => setTimeout(resolve, 100));
            attempts++;
          }
          log(3, 'Advanced query spell loading complete:', {
            attempts,
            loadedSpells: document.querySelectorAll('.spell-item').length,
            totalSpells
          });
        } catch (error) {
          log(2, 'Error during advanced query lazy loading:', error);
        }
      }
      return;
    }
    const queryLower = query.toLowerCase().trim();
    const exactPhraseMatch = query.match(/^["'](.+?)["']$/);
    const isExactSearch = !!exactPhraseMatch;
    const searchTerm = isExactSearch ? exactPhraseMatch[1].toLowerCase() : queryLower;
    allSpells.forEach((spell, index) => {
      if (!spell || !spell.name) return;
      const spellName = spell.name.toLowerCase();
      let matches = false;
      if (isExactSearch) matches = spellName.includes(searchTerm);
      else {
        const queryWords = searchTerm.split(/\s+/).filter((word) => word.length > 0);
        matches = queryWords.every((word) => spellName.includes(word)) || queryWords.some((word) => spellName.includes(word));
      }
      if (matches) matchingIndices.push(index);
    });
    log(3, 'Found matching spells at indices:', matchingIndices, 'for query:', query);
    if (matchingIndices.length === 0) return;
    const maxIndex = Math.max(...matchingIndices);
    const currentlyLoaded = document.querySelectorAll('.spell-item').length;
    log(3, 'Need to load up to index:', maxIndex, 'currently loaded:', currentlyLoaded);
    if (maxIndex >= currentlyLoaded) {
      log(3, 'Triggering lazy loading to load more spells');
      try {
        await this.app._ensureSpellDataAndInitializeLazyLoading();
        let attempts = 0;
        const maxAttempts = 10;
        while (document.querySelectorAll('.spell-item').length <= maxIndex && attempts < maxAttempts) {
          if (this.app._renderSpellBatch) this.app._renderSpellBatch();
          else if (this.app._initializeLazyLoading) this.app._initializeLazyLoading();
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }
        log(3, 'After lazy loading attempts:', {
          attempts,
          loadedSpells: document.querySelectorAll('.spell-item').length,
          targetIndex: maxIndex
        });
      } catch (error) {
        log(2, 'Error during lazy loading:', error);
      }
    }
  }

  /**
   * Check if current query is an advanced query
   * @returns {boolean} Whether the current query uses advanced syntax
   */
  isCurrentQueryAdvanced() {
    return this.isAdvancedQuery && this.parsedQuery !== null;
  }

  /**
   * Get the parsed query object for advanced queries
   * @returns {Object|null} The parsed query or null
   */
  getParsedQuery() {
    return this.parsedQuery;
  }

  /**
   * Execute advanced query against spells
   * @param {Array} spells - Spells to filter
   * @returns {Array} Filtered spells
   */
  executeAdvancedQuery(spells) {
    if (!this.isCurrentQueryAdvanced() || !this.parsedQuery) return spells;
    return this.queryExecutor.executeQuery(this.parsedQuery, spells);
  }

  /**
   * Clear the search input and reset
   */
  clearSearch() {
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
    if (searchInput) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.focus();
    }
    this.isAdvancedQuery = false;
    this.parsedQuery = null;
    this.updateClearButtonVisibility();
    this.hideDropdown();
    this.performSearch('');
  }

  /**
   * Update visibility of clear button
   */
  updateClearButtonVisibility() {
    const clearButton = this.clearButtonElement;
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
    if (!clearButton || !searchInput) return;
    const hasValue = searchInput.value && searchInput.value.trim() !== '';
    clearButton.style.display = hasValue ? 'block' : 'none';
  }

  /**
   * Get recent searches from actor flags
   * @returns {Array<string>} Array of recent searches
   */
  getRecentSearches() {
    try {
      const recent = this.actor.getFlag(MODULE.ID, FLAGS.RECENT_SEARCHES) || [];
      return Array.isArray(recent) ? recent : [];
    } catch (error) {
      log(2, 'Error getting recent searches:', error);
      return [];
    }
  }

  /**
   * Add a search to recent searches
   * @param {string} query - The search query to add
   */
  addToRecentSearches(query) {
    if (!query || !query.trim()) return;
    try {
      const recentSearches = this.getRecentSearches();
      const trimmedQuery = query.trim();
      const existingIndex = recentSearches.indexOf(trimmedQuery);
      if (existingIndex !== -1) recentSearches.splice(existingIndex, 1);
      recentSearches.unshift(trimmedQuery);
      const limitedSearches = recentSearches.slice(0, 8);
      this.actor.setFlag(MODULE.ID, FLAGS.RECENT_SEARCHES, limitedSearches);
      log(3, 'Added to recent searches:', trimmedQuery);
    } catch (error) {
      log(2, 'Error adding to recent searches:', error);
    }
  }

  /**
   * Remove a search from recent searches
   * @param {string} query - The search query to remove
   */
  removeFromRecentSearches(query) {
    try {
      const recentSearches = this.getRecentSearches();
      const updatedSearches = recentSearches.filter((search) => search !== query);
      this.actor.setFlag(MODULE.ID, FLAGS.RECENT_SEARCHES, updatedSearches);
      log(3, 'Removed from recent searches:', query);
    } catch (error) {
      log(2, 'Error removing from recent searches:', error);
    }
  }

  /**
   * Cleanup event listeners and elements
   */
  cleanup() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
    if (this.focusDebounceTimeout) {
      clearTimeout(this.focusDebounceTimeout);
      this.focusDebounceTimeout = null;
    }
    const existingDropdown = document.querySelector('.search-dropdown');
    if (existingDropdown) existingDropdown.remove();
    this.isDropdownVisible = false;
    this.selectedSuggestionIndex = -1;
    this.queryCache.clear();
    log(3, 'Advanced search manager cleaned up');
  }
}
