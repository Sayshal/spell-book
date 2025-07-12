import { PlayerSpellBook } from '../../apps/player-spell-book.mjs';
import { FLAGS, MODULE, SETTINGS } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import { FieldDefinitions } from './field-definitions.mjs';
import { QueryExecutor } from './query-executor.mjs';
import { QueryParser } from './query-parser.mjs';

/**
 * Advanced search manager for handling Google-style search with recent searches and fuzzy matching.
 * Provides intelligent autocomplete, field-based search syntax, and search history management.
 */
export class AdvancedSearchManager {
  /**
   * Create a new advanced search manager instance
   * @param {PlayerSpellBook} app - The parent application instance
   */
  constructor(app) {
    this.actor = app.actor;
    this.app = app;
    this.clearButtonElement = null;
    this.fieldDefinitions = new FieldDefinitions();
    this.focusDebounceTimeout = null;
    this.isAdvancedQuery = false;
    this.isDropdownVisible = false;
    this.isInitialized = false;
    this.isProcessingFocusEvent = false;
    this.isProcessingSearch = false;
    this.isProcessingSuggestion = false;
    this.lastDropdownQuery = null;
    this.lastProcessedQuery = null;
    this.lastProcessedTime = null;
    this.parsedQuery = null;
    this.queryCache = new Map();
    this.queryExecutor = new QueryExecutor();
    this.queryParser = new QueryParser(this.fieldDefinitions);
    this.searchInputElement = null;
    this.searchTimeout = null;
    this.selectedSuggestionIndex = -1;
    this.searchPrefix = game.settings.get(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX);
  }

  /**
   * Get the application's DOM element
   * @returns {HTMLElement|null} The application element or null if not available
   */
  get element() {
    return this.app.element;
  }

  /**
   * Initialize advanced search functionality and set up the interface
   * @returns {void}
   */
  initialize() {
    if (this.isInitialized) return;
    this.cleanup();
    this.setupSearchInterface();
    this.setupEventListeners();
    this.isInitialized = true;
  }

  /**
   * Parse and cache query to avoid redundant parsing operations
   * @param {string} query - Query string without the ^ prefix
   * @returns {Object|null} Parsed query object or null if parsing failed
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
   * Setup the enhanced search interface with accessibility features
   * @private
   * @returns {void}
   */
  setupSearchInterface() {
    log(3, 'Starting setupSearchInterface...');
    const searchInput = this.element.querySelector('input[name="filter-name"]');
    if (!searchInput) {
      log(1, 'No search input found, aborting setupSearchInterface');
      return;
    }
    const hasAdvancedClass = searchInput.classList.contains('advanced-search-input');
    const existingDropdown = document.querySelector('.search-dropdown');
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
   * Create clear button for search input with accessibility attributes
   * @private
   * @returns {void}
   */
  createClearButton() {
    if (this.clearButtonElement) return;
    const searchContainer = this.searchInputElement.parentElement;
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'search-input-clear';
    clearButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    clearButton.style.display = 'none';
    clearButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Search.ClearSearch'));
    clearButton.setAttribute('tabindex', '-1');
    searchContainer.appendChild(clearButton);
    this.clearButtonElement = clearButton;
  }

  /**
   * Create dropdown container for search suggestions
   * @private
   * @returns {void}
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
   * Set up event listeners for search functionality
   * @private
   * @returns {void}
   */
  setupEventListeners() {
    if (!this.searchInputElement) return;
    this.searchInputElement.addEventListener('input', this.handleSearchInput.bind(this));
    this.searchInputElement.addEventListener('focus', this.handleSearchFocus.bind(this));
    this.searchInputElement.addEventListener('blur', this.handleSearchBlur.bind(this));
    this.searchInputElement.addEventListener('keydown', this.handleSearchKeydown.bind(this));
    if (this.clearButtonElement) this.clearButtonElement.addEventListener('click', this.clearSearch.bind(this));
    this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
    document.addEventListener('click', this.boundHandleDocumentClick);
    log(3, 'Event listeners setup complete');
  }

  /**
   * Handle search input changes with debouncing and query processing
   * @async
   * @param {InputEvent} event - Input event from search field
   * @returns {Promise<void>}
   */
  async handleSearchInput(event) {
    const query = event.target.value;
    if (this.isProcessingSuggestion) return;
    if (this.isProcessingSearch || (query === '' && this.isAdvancedQuery)) return;
    this.updateClearButtonVisibility();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (query.startsWith(this.searchPrefix)) {
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
          log(1, 'Error ensuring spell data for fuzzy search:', error);
        }
        this.updateDropdownContent(query);
        this.performSearch(query);
      }, 800);
    }
    if (!this.isDropdownVisible) this.showDropdown();
  }

  /**
   * Check if an advanced query appears to be syntactically complete
   * @param {string} query - The query string to validate
   * @returns {boolean} Whether the query is complete and valid
   */
  isAdvancedQueryComplete(query) {
    if (!query.startsWith(this.searchPrefix)) return false;
    const queryWithoutTrigger = query.substring(1);
    try {
      const parsed = this.parseAndCacheQuery(queryWithoutTrigger);
      return parsed !== null;
    } catch (error) {
      log(1, 'Query validation failed:', error.message);
      return false;
    }
  }

  /**
   * Handle keyboard navigation in search dropdown
   * @param {KeyboardEvent} event - Keydown event from search field
   * @returns {void}
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
          if (query.startsWith(this.searchPrefix) && this.isAdvancedQueryComplete(query)) {
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
   * Handle search input focus events with debouncing
   * @param {FocusEvent} event - Focus event from search field
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
   * Handle search input blur events
   * @param {FocusEvent} event - Blur event from search field
   * @returns {void}
   */
  handleSearchBlur(event) {
    if (this.isProcessingSuggestion) return;
    setTimeout(() => {
      if (!document.querySelector('.search-dropdown:hover') && !this.isProcessingSuggestion) this.hideDropdown();
    }, 150);
  }

  /**
   * Handle document click events for dropdown interaction and cleanup
   * @param {MouseEvent} event - Click event from document
   */
  handleDocumentClick(event) {
    const dropdown = document.querySelector('.search-dropdown');
    if (event.target.closest('.clear-recent-search')) {
      log(3, 'Handling clear recent search click');
      event.preventDefault();
      event.stopPropagation();
      const suggestionElement = event.target.closest('.search-suggestion');
      const searchText = suggestionElement.dataset.query;
      suggestionElement.style.display = 'none';
      this.removeFromRecentSearches(searchText);
      this.updateDropdownContent(this.searchInputElement.value);
      return;
    }
    if (event.target.closest('.search-suggestion')) {
      event.preventDefault();
      event.stopPropagation();
      this.selectSuggestion(event.target.closest('.search-suggestion'));
      return;
    }
    if (this.isDropdownVisible && !event.target.closest('.advanced-search-input') && !event.target.closest('.search-dropdown')) this.hideDropdown();
  }

  /**
   * Select a suggestion from the dropdown and update search state
   * @param {HTMLElement} suggestionElement - The suggestion DOM element
   */
  selectSuggestion(suggestionElement) {
    const suggestionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const query = suggestionElement.dataset.query;
    const now = Date.now();
    if (!query) return;
    if (this.lastProcessedQuery === query && now - this.lastProcessedTime < 500) return;
    this.lastProcessedQuery = query;
    this.lastProcessedTime = now;
    this.isProcessingSuggestion = true;
    this.searchInputElement.value = query;
    this.searchInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    if (suggestionElement.classList.contains('submit-query')) {
      log(3, `[${suggestionId}] Submit query - calling performSearch`);
      this.performSearch(query);
      this.addToRecentSearches(query);
      this.hideDropdown();
      log(3, `[${suggestionId}] Submit query completed`);
    } else {
      log(3, `[${suggestionId}] Not submit query - updating dropdown content`);
      this.lastDropdownQuery = null;
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }
      this.updateDropdownContent(query);
      if (!this.isDropdownVisible) this.showDropdown();
      log(3, `[${suggestionId}] Dropdown content updated and shown`);
    }
    setTimeout(() => {
      this.isProcessingSuggestion = false;
      if (document.activeElement !== this.searchInputElement) this.searchInputElement.focus();
    }, 100);
  }

  /**
   * Show the search dropdown with proper positioning and accessibility
   * @returns {void}
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
   * Hide the search dropdown and reset selection state
   * @returns {void}
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
   * Update dropdown content based on current query type
   * @param {string} query - Current search query string
   */
  updateDropdownContent(query) {
    if (this.lastDropdownQuery === query) return;
    this.lastDropdownQuery = query;
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown) return;
    let content = '';
    this.isAdvancedQuery = query.startsWith(this.searchPrefix);
    if (this.isAdvancedQuery) content += this._generateAdvancedQueryContent(query);
    else content += this._generateStandardQueryContent(query);
    dropdown.innerHTML = content;
    log(3, 'Dropdown content updated for query:', query);
  }

  /**
   * Generate content for advanced query suggestions
   * @async
   * @private
   * @param {string} query - The advanced query string
   * @returns {Promise<string>} HTML content for dropdown
   */
  _generateAdvancedQueryContent(query) {
    const queryWithoutTrigger = query.substring(1);
    let content = `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.Advanced')}</div>`;
    if (!queryWithoutTrigger.trim() || this.isIncompleteAndQuery(query)) {
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
    log(3, `endsWithFieldColon result: "${endsWithFieldColon}"`);
    if (endsWithFieldColon) {
      const fieldId = this.fieldDefinitions.getFieldId(endsWithFieldColon);
      log(3, `fieldId resolved to: "${fieldId}"`);
      content += `<div class="search-status info">${game.i18n.localize('SPELLBOOK.Search.EnterValue')}</div>`;
      if (fieldId === 'range') {
        content += `<div class="search-note">
        <i class="fas fa-info-circle"></i>
        <span class="suggestion-text">${game.i18n.localize('SPELLBOOK.Search.TypeRange')}</span>
      </div>`;
        return content;
      }
      if (fieldId) {
        const validValues = this.fieldDefinitions.getValidValuesForField(fieldId);
        log(3, `validValues for ${fieldId}:`, validValues);
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
   * Check if query ends with AND operator and needs a field suggestion
   * @param {string} query - The query string to check
   * @returns {boolean} Whether query ends with AND operator
   */
  isIncompleteAndQuery(query) {
    if (!query.startsWith(this.searchPrefix)) return false;
    const queryWithoutTrigger = query.substring(1);
    const trimmed = queryWithoutTrigger.trim();
    return trimmed.endsWith(' AND') || queryWithoutTrigger.endsWith(' AND ');
  }

  /**
   * Check if query ends with a field name followed by a colon
   * @param {string} query - Query string without the ^ prefix
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
    if (['requiresSave', 'concentration', 'prepared', 'favorited', 'ritual'].includes(fieldId)) {
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
   * Generate HTML content for recent searches section
   * @private
   * @returns {string} HTML content for recent searches
   */
  _generateRecentSearches() {
    const recentSearches = this.getRecentSearches();
    if (recentSearches.length === 0) return `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.NoRecent')}</div>`;
    let content = `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.Recent')}</div>`;
    recentSearches.forEach((search) => {
      const tooltipAttr = search.length > 32 ? `data-tooltip="${search}"` : '';
      content += `<div class="search-suggestion" data-query="${search}" role="option" tabindex="-1" aria-selected="false">
        <span class="suggestion-text" ${tooltipAttr}>${search}</span>
        <button class="clear-recent-search" aria-label="${game.i18n.localize('SPELLBOOK.Search.Remove')}"><i class="fa-solid fa-square-xmark"></i></button>
      </div>`;
    });
    return content;
  }

  /**
   * Generate HTML content for fuzzy spell name matches
   * @private
   * @param {string} query - The search query string
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
   * @param {string} query - The query string to check
   * @returns {boolean} Whether it's a complete field:value pair
   */
  isCompleteFieldValue(query) {
    if (!query.startsWith(this.searchPrefix)) return false;
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
   * @param {string} query - The query string to check
   * @returns {boolean} Whether it contains AND operators
   */
  hasAndOperators(query) {
    const upperQuery = query.toUpperCase();
    return upperQuery.includes(' AND ');
  }

  /**
   * Update visual selection state of dropdown suggestions
   * @param {NodeList} suggestions - List of suggestion DOM elements
   * @returns {void}
   */
  updateSuggestionSelection(suggestions) {
    suggestions.forEach((suggestion, index) => {
      const isSelected = index === this.selectedSuggestionIndex;
      suggestion.classList.toggle('selected', isSelected);
      suggestion.setAttribute('aria-selected', isSelected.toString());
    });
  }

  /**
   * Perform the actual search operation based on query type
   * @async
   * @param {string} query - Search query string
   * @returns {Promise<void>}
   */
  async performSearch(query) {
    const searchId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    if (this.isProcessingSearch) return;
    log(3, `performSearch [${searchId}] started with query: "${query}"`);
    this.isProcessingSearch = true;
    try {
      if (query && query.startsWith(this.searchPrefix)) {
        log(3, `[${searchId}] Processing advanced query`);
        const parsedQuery = this.parseAndCacheQuery(query.substring(1));
        if (parsedQuery) {
          this.isAdvancedQuery = true;
          this.parsedQuery = parsedQuery;
          log(3, `[${searchId}] Calling applyAdvancedQueryToFilters`);
          this.applyAdvancedQueryToFilters(parsedQuery);
          this.app.filterHelper.invalidateFilterCache();
          this.isProcessingSearch = false;
          log(3, `[${searchId}] Advanced query processing completed`);
          return;
        }
      }
      this.isAdvancedQuery = false;
      this.parsedQuery = null;
      this.app.filterHelper.invalidateFilterCache();
      setTimeout(() => {
        this.app.filterHelper.applyFilters();
        this.isProcessingSearch = false;
      }, 100);
    } catch (error) {
      log(1, `performSearch [${searchId}] error:`, error);
      this.isProcessingSearch = false;
    }
  }

  /**
   * Apply advanced query results to current filter state
   * @param {Object} parsedQuery - The parsed query object with filters
   * @returns {void}
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
   * Parse a range value string into minimum and maximum components
   * @param {string} rangeValue - Range value like "0-30", "30", "*-30", "30-*"
   * @returns {Array<number|null>} Array containing [min, max] values
   */
  parseRangeValue(rangeValue) {
    if (!rangeValue) return [null, null];
    if (!rangeValue.includes('-')) {
      const num = parseInt(rangeValue);
      return isNaN(num) ? [null, null] : [num, null];
    }
    const parts = rangeValue.split('-');
    if (parts.length !== 2) return [null, null];
    const minPart = parts[0].trim();
    const maxPart = parts[1].trim();
    let min = null;
    if (minPart && minPart !== '*') {
      const parsedMin = parseInt(minPart);
      if (!isNaN(parsedMin)) min = parsedMin;
    }
    let max = null;
    if (maxPart && maxPart !== '*') {
      const parsedMax = parseInt(maxPart);
      if (!isNaN(parsedMax)) max = parsedMax;
    }
    return [min, max];
  }

  /**
   * Set range filter values in the UI elements
   * @param {string} rangeValue - Range value like "0-30"
   * @returns {void}
   */
  setRangeFilterValue(rangeValue) {
    const [min, max] = this.parseRangeValue(rangeValue);
    if (min !== null) {
      const minInput = document.querySelector('input[name="filter-min-range"]');
      if (minInput) minInput.value = min;
    }
    if (max !== null) {
      const maxInput = document.querySelector('input[name="filter-max-range"]');
      if (maxInput) maxInput.value = max;
    }
    const minInput = document.querySelector('input[name="filter-min-range"]');
    if (minInput) minInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Set filter value in the appropriate UI element
   * @param {string} fieldId - Field identifier for the filter
   * @param {string} value - Value to set in the filter
   * @returns {void}
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
   * @async
   * @param {string} query - Search query string
   * @returns {Promise<void>}
   */
  async ensureSpellsLoadedForSearch(query) {
    let allSpells = [];
    const activeClass = this.app._stateManager?.activeClass;
    if (activeClass && this.app._stateManager.classSpellData[activeClass]?.spellLevels) allSpells = this.app._stateManager.classSpellData[activeClass].spellLevels;
    if (allSpells.length === 0) return;
    const matchingIndices = [];
    if (query.startsWith(this.searchPrefix) && this.isCurrentQueryAdvanced()) {
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
   * Check if the current query uses advanced search syntax
   * @returns {boolean} Whether the current query is an advanced query
   */
  isCurrentQueryAdvanced() {
    return this.isAdvancedQuery && this.parsedQuery !== null;
  }

  /**
   * Get the parsed query object for advanced queries
   * @returns {Object|null} The parsed query object or null if not advanced
   */
  getParsedQuery() {
    return this.parsedQuery;
  }

  /**
   * Execute advanced query against a collection of spells
   * @param {Array<Object>} spells - Array of spell objects to filter
   * @returns {Array<Object>} Filtered array of spells matching the query
   */
  executeAdvancedQuery(spells) {
    if (!this.isCurrentQueryAdvanced() || !this.parsedQuery) return spells;
    return this.queryExecutor.executeQuery(this.parsedQuery, spells);
  }

  /**
   * Clear the search input and reset search state
   * @returns {void}
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
   * Update visibility of the clear button based on input content
   * @private
   * @returns {void}
   */
  updateClearButtonVisibility() {
    const clearButton = this.clearButtonElement;
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
    if (!clearButton || !searchInput) return;
    const hasValue = searchInput.value && searchInput.value.trim() !== '';
    clearButton.style.display = hasValue ? 'block' : 'none';
  }

  /**
   * Get recent search queries from actor flags
   * @returns {Array<string>} Array of recent search query strings
   */
  getRecentSearches() {
    try {
      const recent = this.actor.getFlag(MODULE.ID, FLAGS.RECENT_SEARCHES) || [];
      return Array.isArray(recent) ? recent : [];
    } catch (error) {
      log(1, 'Error getting recent searches:', error);
      return [];
    }
  }

  /**
   * Add a search query to the recent searches list
   * @param {string} query - The search query string to add
   * @returns {void}
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
      log(1, 'Error adding to recent searches:', error);
    }
  }

  /**
   * Remove a search query from the recent searches list
   * @param {string} query - The search query string to remove
   * @returns {void}
   */
  removeFromRecentSearches(query) {
    try {
      const recentSearches = this.getRecentSearches();
      const updatedSearches = recentSearches.filter((search) => search !== query);
      this.actor.setFlag(MODULE.ID, FLAGS.RECENT_SEARCHES, updatedSearches);
      log(3, 'Removed from recent searches:', query);
    } catch (error) {
      log(1, 'Error removing from recent searches:', error);
    }
  }

  /**
   * Clean up event listeners, timeouts, and DOM elements
   * @returns {void}
   */
  cleanup() {
    log(3, 'AdvancedSearchManager cleanup called');
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
    if (this.focusDebounceTimeout) {
      clearTimeout(this.focusDebounceTimeout);
      this.focusDebounceTimeout = null;
    }
    if (this.boundHandleDocumentClick) document.removeEventListener('click', this.boundHandleDocumentClick);
    const existingDropdown = document.querySelector('.search-dropdown');
    if (existingDropdown) existingDropdown.remove();
    this.isDropdownVisible = false;
    this.selectedSuggestionIndex = -1;
    this.queryCache.clear();
    this.isInitialized = false;
    log(3, 'Advanced search manager cleaned up');
  }
}
