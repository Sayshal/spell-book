/**
 * Advanced Search Manager for Spell Book Module
 *
 * This module provides comprehensive Google-style search functionality with intelligent
 * autocomplete, field-based search syntax, and search history management. It handles
 * both standard fuzzy name matching and advanced query parsing with support for
 * complex field-based searches.
 *
 * Key features include:
 * - Advanced query syntax with field-based filtering (^field:value AND field2:value2)
 * - Intelligent autocomplete with dropdown suggestions
 * - Search history management and recent searches
 * - Fuzzy matching for spell names
 * - Keyboard navigation support
 * - Accessibility features with ARIA attributes
 * - Debounced search execution for performance
 * - Integration with validation helpers for query parsing and execution
 *
 * The search manager supports two distinct modes:
 * 1. Standard Mode: Fuzzy name matching with recent search suggestions
 * 2. Advanced Mode: Field-based query syntax with intelligent field and value suggestions
 *
 * @module UIHelpers/AdvancedSearchManager
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as ValidationHelpers from '../validation/_module.mjs';

/**
 * Parsed query structure returned by the query parser.
 *
 * @typedef {Object} ParsedQuery
 * @property {string} type - Query type ('conjunction', 'field', etc.)
 * @property {Array<ParsedQueryCondition>} conditions - Array of query conditions for conjunction queries
 * @property {string} [field] - Field name for field-type queries
 * @property {string} [value] - Field value for field-type queries
 */

/**
 * Individual condition within a parsed query.
 *
 * @typedef {Object} ParsedQueryCondition
 * @property {string} type - Condition type ('field')
 * @property {string} field - Field identifier for the condition
 * @property {string} value - Value to match for the condition
 */

/**
 * Result object for incomplete value detection during typing.
 *
 * @typedef {Object} IncompleteValueMatch
 * @property {string} field - Field identifier being typed
 * @property {string} value - Current incomplete value being typed
 */

/**
 * Range parsing result for range-based field queries.
 *
 * @typedef {Object} RangeParseResult
 * @property {number|null} min - Minimum range value or null if not specified
 * @property {number|null} max - Maximum range value or null if not specified
 */

/**
 * Search suggestion data structure for dropdown display.
 *
 * @typedef {Object} SearchSuggestion
 * @property {string} query - Complete query string for this suggestion
 * @property {string} text - Display text for the suggestion
 * @property {string} type - Suggestion type ('field', 'value', 'execute', 'recent', 'fuzzy')
 * @property {boolean} [isSubmittable] - Whether selecting this suggestion should execute search
 */

/**
 * Advanced search manager for handling Google-style search with recent searches and fuzzy matching.
 *
 * Provides intelligent autocomplete, field-based search syntax, and search history management.
 * The manager handles both standard fuzzy name searches and advanced field-based queries with
 * comprehensive suggestion systems and keyboard navigation support.
 *
 * This class integrates with the validation helpers to parse and execute advanced queries,
 * manages search state and history, and provides a polished search experience with
 * accessibility features and performance optimizations.
 */
export class AdvancedSearchManager {
  /**
   * Create a new advanced search manager instance.
   *
   * Initializes the search manager with references to the parent application and sets up
   * internal state for search processing, suggestion handling, and query management.
   *
   * @param {SpellBook} app - The parent application instance
   */
  constructor(app) {
    /** @type {Actor5e} - The actor associated with this search manager */
    this.actor = app.actor;

    /** @type {SpellBook} - The parent spell book application */
    this.app = app;

    /** @type {HTMLButtonElement|null} - Clear button element for search input */
    this.clearButtonElement = null;

    /** @type {ValidationHelpers.FieldDefinitions} - Field definitions for advanced search syntax */
    this.fieldDefinitions = new ValidationHelpers.FieldDefinitions();

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

    /** @type {ValidationHelpers.QueryExecutor} - Query executor for advanced search operations */
    this.queryExecutor = new ValidationHelpers.QueryExecutor();

    /** @type {ValidationHelpers.QueryParser} - Parser for advanced search syntax */
    this.queryParser = new ValidationHelpers.QueryParser(this.fieldDefinitions);

    /** @type {HTMLInputElement|null} - Main search input element */
    this.searchInputElement = null;

    /** @type {number|null} - Timeout ID for search input debouncing */
    this.searchTimeout = null;

    /** @type {number} - Index of currently selected suggestion in dropdown (-1 for none) */
    this.selectedSuggestionIndex = -1;

    /** @type {string} - Prefix character that triggers advanced search mode */
    this.searchPrefix = game.settings.get(MODULE.ID, SETTINGS.ADVANCED_SEARCH_PREFIX);
  }

  /**
   * Get the application's DOM element.
   *
   * @returns {HTMLElement|null} The application element or null if not available
   */
  get element() {
    return this.app.element;
  }

  /**
   * Initialize advanced search functionality and set up the interface.
   *
   * Sets up the search interface, creates necessary DOM elements, and establishes
   * event listeners for search interaction. This method is idempotent and can be
   * called multiple times safely.
   *
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
   * Parse and cache query to avoid redundant parsing operations.
   *
   * Maintains an internal cache of parsed queries to improve performance when
   * the same query is processed multiple times. Returns cached results when
   * available or parses and caches new queries.
   *
   * @param {string} query - Query string without the ^ prefix
   * @returns {ParsedQuery|null} Parsed query object or null if parsing failed
   */
  parseAndCacheQuery(query) {
    if (this.queryCache.has(query)) return this.queryCache.get(query);
    try {
      const parsed = this.queryParser.parseQuery(query);
      this.queryCache.set(query, parsed);
      return parsed;
    } catch (error) {
      log(1, 'Error:', error);
      this.queryCache.set(query, null);
      return null;
    }
  }

  /**
   * Setup the enhanced search interface with accessibility features.
   *
   * Modifies the existing search input to support advanced search functionality,
   * adds appropriate ARIA attributes for accessibility, and creates supporting
   * UI elements like clear buttons and suggestion dropdowns.
   *
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
   * Create clear button for search input with accessibility attributes.
   *
   * Adds a clear button next to the search input that allows users to quickly
   * clear their search query. The button is initially hidden and only appears
   * when there is content in the search field.
   *
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
   *
   * Creates a floating dropdown element that will be positioned relative to the
   * search input and populated with search suggestions. The dropdown is initially
   * hidden and will be shown when relevant suggestions are available.
   *
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
   *
   * Establishes all necessary event listeners for search input interaction,
   * dropdown navigation, clear button functionality, and document-level
   * click handling for dropdown management.
   *
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
   * Handle search input changes with debouncing and query processing.
   *
   * Processes input changes with appropriate debouncing for different query types.
   * Advanced queries (starting with search prefix) have shorter debouncing for
   * more responsive suggestions, while standard queries have longer debouncing
   * to reduce unnecessary processing.
   *
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
          if (!this.app._stateManager._initialized) await this.app._stateManager.initialize();
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
          if (!this.app._stateManager._initialized) await this.app._stateManager.initialize();
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
   * Check if an advanced query appears to be syntactically complete.
   *
   * Validates whether an advanced search query has valid syntax and could
   * potentially be executed. This is used to determine when to show the
   * "Execute Query" suggestion in the dropdown.
   *
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
   * Handle keyboard navigation in search dropdown.
   *
   * Provides keyboard navigation support for the search dropdown including
   * arrow key navigation, Enter to select suggestions, and Escape to close.
   * Also handles special logic for executing complete advanced queries.
   *
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
   *
   * Shows the search dropdown when the input receives focus and updates
   * the dropdown content based on the current query. Uses debouncing to
   * prevent excessive processing during rapid focus events.
   *
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
   *
   * Hides the search dropdown when the input loses focus, with a small delay
   * to allow for suggestion selection via mouse click. The delay prevents
   * the dropdown from hiding before click events can be processed.
   *
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
   *
   * Manages click interactions with dropdown suggestions and clear buttons,
   * and handles closing the dropdown when clicking outside the search area.
   * This method coordinates various click-based interactions with the search system.
   *
   * @param {MouseEvent} event - Click event from document
   */
  handleDocumentClick(event) {
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
   * Select a suggestion from the dropdown and update search state.
   *
   * Processes the selection of a dropdown suggestion, updating the search input
   * and either executing a search or updating suggestions based on the suggestion type.
   * Includes duplicate selection prevention and proper state management.
   *
   * @param {HTMLElement} suggestionElement - The suggestion DOM element
   */
  selectSuggestion(suggestionElement) {
    const suggestionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
   * Show the search dropdown with proper positioning and accessibility.
   *
   * Displays the search dropdown below the active search input with proper
   * positioning and accessibility attributes. Handles responsive positioning
   * and ensures proper z-index layering.
   *
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
    log(3, 'Search dropdown shown below input');
  }

  /**
   * Hide the search dropdown and reset selection state.
   *
   * Hides the search dropdown and resets associated state including selection
   * index and accessibility attributes. Provides clean state management for
   * dropdown visibility.
   *
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
   * Update dropdown content based on current query type.
   *
   * Generates and updates the dropdown content based on whether the query
   * is a standard search or an advanced query. Implements caching to avoid
   * regenerating identical content and delegates to specialized methods
   * for different query types.
   *
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
   * Generate content for advanced query suggestions.
   *
   * Creates comprehensive dropdown content for advanced queries including
   * field suggestions, value suggestions, status indicators, and execution
   * options. Handles different stages of query construction with appropriate
   * contextual suggestions.
   *
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
   * Check if query ends with AND operator and needs a field suggestion.
   *
   * Determines whether the current query ends with an AND operator, indicating
   * that the user is in the process of adding another condition and should be
   * presented with field suggestions.
   *
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
   *
   * Analyzes the query to determine if it ends with a field name and colon,
   * indicating that the user is ready to enter a value for that field.
   * Returns the field name if found for value suggestion generation.
   *
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
   *
   * Determines whether the user is in the middle of typing a value for a field,
   * which should trigger value completion suggestions. Returns information about
   * the field and current partial value if detected.
   *
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
   *
   * Evaluates whether a value being typed for a specific field appears to be
   * incomplete based on field-specific rules. For boolean fields, checks if
   * the value is a partial match for valid boolean values.
   *
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
   *
   * Creates dropdown content for standard (non-advanced) queries, showing
   * either recent searches for short queries or fuzzy matching results for
   * longer queries. Provides contextual suggestions based on query length.
   *
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
   *
   * Creates a section showing recent search queries with options to reuse
   * or remove them. Each recent search includes a clear button for removal
   * and is clickable to reuse the search.
   *
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
   * Generate HTML content for fuzzy spell name matches.
   *
   * Creates suggestions based on fuzzy matching of spell names against the
   * current query. Shows up to 5 matching spells with highlighting and
   * provides feedback when no matches are found.
   *
   * @param {string} query - The search query string
   * @returns {string} HTML string containing search suggestions or no matches message
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
   * Update visual selection state of dropdown suggestions.
   *
   * Updates the visual appearance and accessibility attributes of dropdown
   * suggestions to reflect the current keyboard selection. Ensures proper
   * ARIA states for screen reader compatibility.
   *
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
   *
   * Executes search operations with proper duplicate prevention and state management.
   * Handles both advanced queries (with field-based filtering) and standard queries,
   * applying appropriate filters and triggering UI updates.
   *
   * @param {string} query - Search query string
   * @returns {Promise<void>}
   */
  async performSearch(query) {
    const searchId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
          this.app.filterHelper.applyFilters();
          this.isProcessingSearch = false;
          log(3, `[${searchId}] Advanced query processing completed`);
          return;
        }
      }
      this.isAdvancedQuery = false;
      this.parsedQuery = null;
      this.app.filterHelper.invalidateFilterCache();
      this.app.filterHelper.applyFilters();
      this.isProcessingSearch = false;
    } catch (error) {
      log(1, `performSearch [${searchId}] error:`, error);
      this.isProcessingSearch = false;
    }
  }

  /**
   * Apply advanced query results to current filter state.
   *
   * Translates parsed advanced query conditions into filter state and updates
   * UI elements accordingly. Handles special cases like range filtering and
   * ensures proper synchronization between query state and filter UI.
   *
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
    log(3, 'Advanced query filters applied');
  }

  /**
   * Parse a range value string into minimum and maximum components.
   *
   * Converts range strings (like "0-30", "30", "*-30", "30-*") into structured
   * minimum and maximum values for range filtering. Handles various range
   * formats and provides appropriate defaults for incomplete ranges.
   *
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
   *
   * Updates the minimum and maximum range input fields based on parsed
   * range values and triggers appropriate input events to update the
   * filter system. Handles both single values and range specifications.
   *
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
   *
   * Updates the specified filter element with the given value and triggers
   * appropriate events to update the filter system. Handles different input
   * types including checkboxes, select elements, and text inputs.
   *
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
    log(3, `Set filter ${fieldId} to: ${value}`);
  }

  /**
   * Setup search functionality for collapsed footer.
   *
   * Configures search functionality for the collapsed footer search input,
   * establishing event listeners and integrating with the main search system.
   * This allows search to work in both expanded and collapsed UI states.
   *
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
   *
   * Determines which search input is currently active based on the UI state
   * (expanded vs collapsed). Returns the appropriate input element for
   * interaction and positioning of dropdown suggestions.
   *
   * @returns {HTMLElement|null} The active search input
   */
  getActiveSearchInput() {
    const isCollapsed = this.app.element.classList.contains('sidebar-collapsed');
    if (isCollapsed && this.collapsedFooterSearchInput) return this.collapsedFooterSearchInput;
    return this.searchInputElement;
  }

  /**
   * Update dropdown positioning based on current footer state.
   *
   * Adjusts the position of the search dropdown when the UI layout changes,
   * ensuring it remains properly positioned relative to the active search input.
   * This is particularly important when transitioning between expanded and collapsed states.
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
   *
   * Determines whether the current search state represents an advanced query
   * with parsed syntax. This is used by other components to determine how
   * to handle search filtering and display.
   *
   * @returns {boolean} Whether the current query is an advanced query
   */
  isCurrentQueryAdvanced() {
    return this.isAdvancedQuery && this.parsedQuery !== null;
  }

  /**
   * Execute advanced query against a collection of spells.
   *
   * Applies the current advanced query to filter a collection of spells.
   * Returns the original collection if no advanced query is active.
   * This method integrates with the query execution system for consistent filtering.
   *
   * @param {Array<Object>} spells - Array of spell objects to filter
   * @returns {Array<Object>} Filtered array of spells matching the query
   */
  executeAdvancedQuery(spells) {
    if (!this.isCurrentQueryAdvanced() || !this.parsedQuery) return spells;
    return this.queryExecutor.executeQuery(this.parsedQuery, spells);
  }

  /**
   * Clear the search input and reset search state.
   *
   * Resets the search system to its initial state, clearing the input,
   * hiding the dropdown, and performing an empty search to reset filters.
   * Provides a clean way to reset the search interface.
   *
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
   * Update visibility of the clear button based on input content.
   *
   * Shows or hides the clear button based on whether the search input
   * contains any content. Provides visual feedback about the ability
   * to clear the current search.
   *
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
   *
   * Retrieves the list of recent search queries stored in actor flags.
   * Provides fallback handling for missing or corrupted data and ensures
   * the returned value is always a valid array.
   *
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
   * Add a search query to the recent searches list.
   *
   * Adds a new search query to the beginning of the recent searches list,
   * removing any existing occurrence and maintaining a maximum list size.
   * Stores the updated list in actor flags for persistence.
   *
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
   * Remove a search query from the recent searches list.
   *
   * Removes a specific search query from the recent searches list and updates
   * the stored list in actor flags. Provides a way for users to clean up
   * their search history by removing unwanted entries.
   *
   * @param {string} query - The search query string to remove
   * @returns {void}
   */
  removeFromRecentSearches(query) {
    const recentSearches = this.getRecentSearches();
    const updatedSearches = recentSearches.filter((search) => search !== query);
    this.actor.setFlag(MODULE.ID, FLAGS.RECENT_SEARCHES, updatedSearches);
    log(3, 'Removed from recent searches:', query);
  }

  /**
   * Clean up event listeners, timeouts, and DOM elements.
   *
   * Performs comprehensive cleanup of the search manager, removing event listeners,
   * clearing timeouts, removing DOM elements, and resetting internal state.
   * Should be called when the search manager is no longer needed.
   *
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
