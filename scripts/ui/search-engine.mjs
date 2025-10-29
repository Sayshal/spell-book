/**
 * Advanced Search Manager for Spell Book Module
 *
 * This module provides Google-style search functionality with intelligent
 * autocomplete, field-based search syntax, and search history management. It handles
 * both standard fuzzy name matching and advanced query parsing with support for
 * complex field-based searches.
 *
 * @module UIUtils/SearchEngine
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as ValidationUtils from '../validation/_module.mjs';

/**
 * Advanced search manager for handling Google-style search with recent searches and fuzzy matching.
 */
export class SearchEngine {
  /**
   * Create a new advanced search manager instance.
   * @param {SpellBook} app - The parent application instance
   */
  constructor(app) {
    /** @type {Actor5e} - The actor associated with this search manager */
    this.actor = app.actor;

    /** @type {SpellBook} - The parent spell book application */
    this.app = app;

    /** @type {HTMLButtonElement|null} - Clear button element for search input */
    this.clearButtonElement = null;

    /** @type {ValidationUtils.SearchFields} - Field definitions for advanced search syntax */
    this.fieldDefinitions = new ValidationUtils.SearchFields();

    /** @type {number|null} - Timeout ID for focus event debouncing */
    this.focusDebounceTimeout = null;

    /** @type {boolean} - Whether the current query uses advanced search syntax */
    this.isAdvancedQuery = false;

    /** @type {boolean} - Whether the search dropdown is currently visible */
    this.isDropdownVisible = false;

    /** @type {boolean} - Whether the search manager has been initialized */
    this.isInitialized = false;

    /** @type {boolean} - Whether a focus event is currently being processed */
    this.isProcessingFocusEvent = false;

    /** @type {boolean} - Whether a search operation is currently in progress */
    this.isProcessingSearch = false;

    /** @type {boolean} - Whether a suggestion selection is being processed */
    this.isProcessingSuggestion = false;

    /** @type {string|null} - Last query used to generate dropdown content */
    this.lastDropdownQuery = null;

    /** @type {string|null} - Last processed query string for duplicate prevention */
    this.lastProcessedQuery = null;

    /** @type {number|null} - Timestamp of last processed query */
    this.lastProcessedTime = null;

    /** @type {ParsedQuery|null} - Currently parsed advanced query object */
    this.parsedQuery = null;

    /** @type {Map<string, ParsedQuery|null>} - Cache for parsed queries to avoid reprocessing */
    this.queryCache = new Map();

    /** @type {ValidationUtils.QueryExecutor} - Query executor for advanced search operations */
    this.queryExecutor = new ValidationUtils.QueryExecutor();

    /** @type {ValidationUtils.QueryParser} - Parser for advanced search syntax */
    this.queryParser = new ValidationUtils.QueryParser(this.fieldDefinitions);

    /** @type {HTMLInputElement|null} - Main search input element */
    this.searchInputElement = null;

    /** @type {number|null} - Timeout ID for search input debouncing */
    this.searchTimeout = null;

    /** @type {number} - Index of currently selected suggestion in dropdown (-1 for none) */
    this.selectedSuggestionIndex = -1;

    /** @type {string} - Prefix character that triggers advanced search mode */
    this.searchPrefix = game.settings.get(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX);

    /** @type {foundry.utils.WordTree|null} - WordTree for efficient fuzzy spell name matching */
    this.spellNameTree = null;

    /** @type {number|null} - Timestamp of last WordTree build for cache invalidation */
    this.treeLastBuilt = null;

    log(3, 'SearchEngine constructed.', { actor: this.actor.name, searchPrefix: this.searchPrefix });
  }

  /**
   * Get the application's DOM element.
   * @returns {HTMLElement|null} The application element or null if not available
   */
  get element() {
    return this.app.element;
  }

  /**
   * Initialize advanced search functionality and set up the interface.
   * @returns {void}
   */
  initialize() {
    if (this.isInitialized) return;
    this.cleanup();
    this.setupSearchInterface();
    this.setupEventListeners();
    this.isInitialized = true;
    log(3, 'SearchEngine initialized.');
  }

  /**
   * Parse and cache query to avoid redundant parsing operations.
   * @param {string} query - Query string without the ^ prefix
   * @returns {ParsedQuery|null} Parsed query object or null if parsing failed
   */
  parseAndCacheQuery(query) {
    if (this.queryCache.has(query)) return this.queryCache.get(query);
    const parsed = this.queryParser.parseQuery(query);
    this.queryCache.set(query, parsed);
    log(3, 'Parsed and cached query.', { query, parsed: !!parsed });
    return parsed;
  }

  /**
   * Build or rebuild the WordTree index for efficient fuzzy spell name matching.
   * Uses Foundry's WordTree utility for case-insensitive prefix-based lookups.
   * @returns {void}
   */
  buildSpellNameTree() {
    const spells = this.app._state?.getCurrentSpellList() || [];
    if (!spells.length) return;
    this.spellNameTree = new foundry.utils.WordTree();
    for (const spell of spells) if (spell.name) this.spellNameTree.addLeaf(spell.name, spell);
    this.treeLastBuilt = Date.now();
    log(3, 'Spell name tree built.', { spellCount: spells.length });
  }

  /**
   * Ensure the spell name tree is built and current.
   * Rebuilds if not yet built or if spell data has changed.
   * @todo: Add cache invalidation logic based on spell data changes
   * @returns {boolean} Whether tree is ready for use
   */
  ensureSpellNameTree() {
    if (!this.spellNameTree || !this.treeLastBuilt) this.buildSpellNameTree();
    return !!this.spellNameTree;
  }

  /**
   * Setup the enhanced search interface with accessibility features.
   * @returns {void}
   */
  setupSearchInterface() {
    const searchInput = this.element.querySelector('input[name="filter-name"]');
    if (!searchInput) return;
    const hasAdvancedClass = searchInput.classList.contains('advanced-search-input');
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
  }

  /**
   * Create clear button for search input with accessibility attributes.
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
   * Create dropdown container for search suggestions.
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
   * Set up event listeners for search functionality.
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
  }

  /**
   * Handle search input changes with debouncing and query processing.
   * @param {InputEvent} event - Input event from search field
   * @returns {Promise<void>}
   */
  async handleSearchInput(event) {
    const query = event.target.value;
    log(3, 'Handling search input.', { query, isAdvanced: query.startsWith(this.searchPrefix) });
    if (this.isProcessingSuggestion) return;
    if (this.isProcessingSearch || (query === '' && this.isAdvancedQuery)) return;
    this.updateClearButtonVisibility();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (query.startsWith(this.searchPrefix)) {
      this.searchTimeout = setTimeout(async () => {
        if (!this.app._state._initialized) await this.app._state.initialize();
        await new Promise((resolve) => setTimeout(resolve, 50));
        this.updateDropdownContent(query);
        if (this.isAdvancedQueryComplete(query)) log(3, 'Advanced query appears complete, but waiting for Enter key');
      }, 150);
    } else {
      this.searchTimeout = setTimeout(async () => {
        if (!this.app._state._initialized) await this.app._state.initialize();
        await new Promise((resolve) => setTimeout(resolve, 50));
        this.updateDropdownContent(query);
        this.performSearch(query);
      }, 800);
    }
    if (!this.isDropdownVisible) this.showDropdown();
  }

  /**
   * Check if an advanced query appears to be syntactically complete.
   * @param {string} query - The query string to validate
   * @returns {boolean} Whether the query is complete and valid
   */
  isAdvancedQueryComplete(query) {
    if (!query.startsWith(this.searchPrefix)) return false;
    const queryWithoutTrigger = query.substring(1);
    const parsed = this.parseAndCacheQuery(queryWithoutTrigger);
    return parsed !== null;
  }

  /**
   * Handle keyboard navigation in search dropdown.
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
   * Handle search input focus events with debouncing.
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
   * Handle search input blur events.
   * @param {FocusEvent} _event - Blur event from search field
   * @returns {void}
   */
  handleSearchBlur(_event) {
    if (this.isProcessingSuggestion) return;
    setTimeout(() => {
      if (!document.querySelector('.search-dropdown:hover') && !this.isProcessingSuggestion) this.hideDropdown();
    }, 150);
  }

  /**
   * Handle document click events for dropdown interaction and cleanup.
   * @param {MouseEvent} event - Click event from document
   */
  handleDocumentClick(event) {
    if (event.target.closest('.clear-recent-search')) {
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
   * Select a suggestion from the dropdown and update search state.
   * @param {HTMLElement} suggestionElement - The suggestion DOM element
   */
  selectSuggestion(suggestionElement) {
    const query = suggestionElement.dataset.query;
    const now = Date.now();
    if (!query) return;
    if (this.lastProcessedQuery === query && now - this.lastProcessedTime < 500) return;
    log(3, 'Selecting suggestion.', { query, isSubmit: suggestionElement.classList.contains('submit-query') });
    this.lastProcessedQuery = query;
    this.lastProcessedTime = now;
    this.isProcessingSuggestion = true;
    this.searchInputElement.value = query;
    this.searchInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    if (suggestionElement.classList.contains('submit-query')) {
      this.performSearch(query);
      this.addToRecentSearches(query);
      this.hideDropdown();
    } else {
      this.lastDropdownQuery = null;
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }
      this.updateDropdownContent(query);
      if (!this.isDropdownVisible) this.showDropdown();
    }
    setTimeout(() => {
      this.isProcessingSuggestion = false;
      if (document.activeElement !== this.searchInputElement) this.searchInputElement.focus();
    }, 100);
  }

  /**
   * Show the search dropdown with proper positioning and accessibility.
   * @returns {void}
   */
  showDropdown() {
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown || this.isDropdownVisible) return;
    const activeInput = this.getActiveSearchInput();
    if (!activeInput) return;
    const rect = activeInput.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.transform = 'none';
    dropdown.style.display = 'block';
    dropdown.style.zIndex = '1000';
    dropdown.classList.add('visible');
    activeInput.setAttribute('aria-expanded', 'true');
    this.isDropdownVisible = true;
    this.selectedSuggestionIndex = -1;
  }

  /**
   * Hide the search dropdown and reset selection state.
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
  }

  /**
   * Update dropdown content based on current query type.
   * @param {string} query - Current search query string
   */
  updateDropdownContent(query) {
    if (this.lastDropdownQuery === query) return;
    log(3, 'Updating dropdown content.', { query, isAdvanced: query.startsWith(this.searchPrefix) });
    this.lastDropdownQuery = query;
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown) return;
    let content = '';
    this.isAdvancedQuery = query.startsWith(this.searchPrefix);
    if (this.isAdvancedQuery) content += this._generateAdvancedQueryContent(query);
    else content += this._generateStandardQueryContent(query);
    dropdown.innerHTML = content;
  }

  /**
   * Generate content for advanced query suggestions.
   * @param {string} query - The advanced query string
   * @returns {string} HTML content for dropdown
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
    if (endsWithFieldColon) {
      const fieldId = this.fieldDefinitions.getFieldId(endsWithFieldColon);
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
   * Check if query ends with AND operator and needs a field suggestion.
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
   * Check if query ends with a field name followed by a colon.
   * @param {string} query - Query string without the ^ prefix
   * @returns {string|null} Field name if found, null otherwise
   */
  queryEndsWithFieldColon(query) {
    const parts = query.split(/\s+and\s+/i);
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart && lastPart.endsWith(':')) {
      const potentialField = lastPart.slice(0, -1);
      return this.fieldDefinitions.getFieldId(potentialField) ? potentialField : null;
    }
    return null;
  }

  /**
   * Check if a value appears to be incomplete while typing.
   * @param {string} queryWithoutTrigger - Query without ^ prefix
   * @returns {IncompleteValueMatch|null} Object with field and value if incomplete, null otherwise
   */
  isIncompleteValue(queryWithoutTrigger) {
    const parts = queryWithoutTrigger.split(/\s+and\s+/i);
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
   * Check if a value appears to be incomplete while typing.
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
   * Generate content for standard queries.
   * @param {string} query - The query string
   * @returns {string} HTML content
   */
  _generateStandardQueryContent(query) {
    let content = '';
    if (!query || query.length < 3) content += this._generateRecentSearches();
    else content += this._generateFuzzyMatches(query);
    return content;
  }

  /**
   * Generate HTML content for recent searches section.
   * @returns {string} HTML content for recent searches
   */
  _generateRecentSearches() {
    const recentSearches = this.getRecentSearches();
    if (recentSearches.length === 0) return '';
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
   * Generate HTML content for fuzzy spell name matches using WordTree.
   * @param {string} query - The search query string
   * @returns {string} HTML string containing search suggestions or no matches message
   */
  _generateFuzzyMatches(query) {
    let content = `<div class="search-section-header">${game.i18n.localize('SPELLBOOK.Search.Suggestions')}</div>`;
    if (!this.ensureSpellNameTree()) {
      content += `<div class="search-status">${game.i18n.localize('SPELLBOOK.Search.NoMatches')}</div>`;
      return content;
    }
    const matches = this.spellNameTree.lookup(query, { limit: 5 });
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
   * Update visual selection state of dropdown suggestions.
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
   * Perform the actual search operation based on query type.
   * @param {string} query - Search query string
   * @returns {Promise<void>}
   */
  async performSearch(query) {
    if (this.isProcessingSearch) return;
    log(3, 'Performing search.', { query, isAdvanced: query?.startsWith(this.searchPrefix) });
    this.isProcessingSearch = true;
    if (query && query.startsWith(this.searchPrefix)) {
      const parsedQuery = this.parseAndCacheQuery(query.substring(1));
      if (parsedQuery) {
        this.isAdvancedQuery = true;
        this.parsedQuery = parsedQuery;
        this.applyAdvancedQueryToFilters(parsedQuery);
        this.app.filterHelper.invalidateFilterCache();
        this.app.filterHelper.applyFilters();
        this.isProcessingSearch = false;
        log(3, 'Advanced search complete.');
        return;
      }
    }
    this.isAdvancedQuery = false;
    this.parsedQuery = null;
    this.app.filterHelper.invalidateFilterCache();
    this.app.filterHelper.applyFilters();
    this.isProcessingSearch = false;
    log(3, 'Standard search complete.');
  }

  /**
   * Apply advanced query results to current filter state.
   * @param {ParsedQuery} parsedQuery - The parsed query object with filters
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
    log(3, 'Advanced query applied to filters.', { conditionsCount: parsedQuery.conditions?.length });
  }

  /**
   * Parse a range value string into minimum and maximum components.
   * @param {string} rangeValue - Range value like "0-30", "30", "*-30", "30-*"
   * @returns {RangeParseResult} Array containing [min, max] values
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
   * Set range filter values in the UI elements.
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
   * Set filter value in the appropriate UI element.
   * @param {string} fieldId - Field identifier for the filter
   * @param {string} value - Value to set in the filter
   * @returns {void}
   */
  setFilterValue(fieldId, value) {
    const filterElement = this.element.querySelector(`[name="filter-${fieldId}"]`);
    if (!filterElement) return;
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
  }

  /**
   * Setup search functionality for collapsed footer.
   * @param {HTMLElement} searchInput - The search input in collapsed footer
   */
  setupCollapsedFooterSearch(searchInput) {
    this.collapsedFooterSearchInput = searchInput;
    searchInput.addEventListener('input', this.handleSearchInput.bind(this));
    searchInput.addEventListener('focus', this.handleSearchFocus.bind(this));
    searchInput.addEventListener('blur', this.handleSearchBlur.bind(this));
    searchInput.addEventListener('keydown', this.handleSearchKeydown.bind(this));
  }

  /**
   * Get the currently active search input element.
   * @returns {HTMLElement|null} The active search input
   */
  getActiveSearchInput() {
    const isCollapsed = this.app.element.classList.contains('sidebar-collapsed');
    if (isCollapsed && this.collapsedFooterSearchInput) return this.collapsedFooterSearchInput;
    return this.searchInputElement;
  }

  /**
   * Update dropdown positioning based on current footer state.
   */
  updateDropdownPositioning() {
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown || !this.isDropdownVisible) return;
    const activeInput = this.getActiveSearchInput();
    if (!activeInput) return;
    const rect = activeInput.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.transform = 'none';
  }

  /**
   * Check if the current query uses advanced search syntax.
   * @returns {boolean} Whether the current query is an advanced query
   */
  isCurrentQueryAdvanced() {
    return this.isAdvancedQuery && this.parsedQuery !== null;
  }

  /**
   * Execute advanced query against a collection of spells.
   * @param {Array<Object>} spells - Array of spell objects to filter
   * @returns {Array<Object>} Filtered array of spells matching the query
   */
  executeAdvancedQuery(spells) {
    if (!this.isCurrentQueryAdvanced() || !this.parsedQuery) return spells;
    return this.queryExecutor.executeQuery(this.parsedQuery, spells);
  }

  /**
   * Clear the search input and reset search state.
   * @returns {void}
   */
  clearSearch() {
    log(3, 'Clearing search.');
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
   * Update visibility of the clear button based on input content.
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
   * Get recent search queries from actor flags.
   * @returns {Array<string>} Array of recent search query strings
   */
  getRecentSearches() {
    const recent = this.actor.getFlag(MODULE.ID, FLAGS.RECENT_SEARCHES) || [];
    return Array.isArray(recent) ? recent : [];
  }

  /**
   * Add a search query to the recent searches list.
   * @param {string} query - The search query string to add
   * @returns {void}
   */
  addToRecentSearches(query) {
    if (!query || !query.trim()) return;
    log(3, 'Adding to recent searches.', { query });
    const recentSearches = this.getRecentSearches();
    const trimmedQuery = query.trim();
    const existingIndex = recentSearches.indexOf(trimmedQuery);
    if (existingIndex !== -1) recentSearches.splice(existingIndex, 1);
    recentSearches.unshift(trimmedQuery);
    const limitedSearches = recentSearches.slice(0, 8);
    this.actor.setFlag(MODULE.ID, FLAGS.RECENT_SEARCHES, limitedSearches);
  }

  /**
   * Remove a search query from the recent searches list.
   * @param {string} query - The search query string to remove
   * @returns {void}
   */
  removeFromRecentSearches(query) {
    const recentSearches = this.getRecentSearches();
    const updatedSearches = recentSearches.filter((search) => search !== query);
    this.actor.setFlag(MODULE.ID, FLAGS.RECENT_SEARCHES, updatedSearches);
  }

  /**
   * Invalidate the spell name tree cache, forcing a rebuild on next use.
   * @returns {void}
   */
  invalidateSpellNameTree() {
    this.spellNameTree = null;
    this.treeLastBuilt = null;
  }

  /**
   * Clean up event listeners, timeouts, and DOM elements.
   * @returns {void}
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
    if (this.boundHandleDocumentClick) document.removeEventListener('click', this.boundHandleDocumentClick);
    const existingDropdown = document.querySelector('.search-dropdown');
    if (existingDropdown) existingDropdown.remove();
    this.isDropdownVisible = false;
    this.selectedSuggestionIndex = -1;
    this.queryCache.clear();
    this.invalidateSpellNameTree();
    this.isInitialized = false;
    log(3, 'SearchEngine cleaned up.');
  }
}
