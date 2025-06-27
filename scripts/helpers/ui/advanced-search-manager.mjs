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
    log(3, 'Existing dropdown found:', !!existingDropdown, existingDropdown);
    if (hasAdvancedClass && existingDropdown) {
      log(3, 'Setup already complete and dropdown exists, skipping');
      this.searchInputElement = searchInput;
      this.clearButtonElement = searchInput.parentNode.querySelector('.search-input-clear');
      return;
    }
    if (existingDropdown) {
      log(3, 'Removing existing dropdown...');
      existingDropdown.remove();
      log(3, 'Existing dropdown removed');
    }
    const filterItem = searchInput.closest('.filter-item');
    log(3, 'Filter item found:', !!filterItem, filterItem);
    if (!filterItem) {
      log(1, 'No filter item found, aborting setupSearchInterface');
      return;
    }
    let clearButton = filterItem.querySelector('.search-input-clear');
    if (!clearButton) {
      log(3, 'Creating clear button...');
      clearButton = document.createElement('button');
      clearButton.className = 'search-input-clear';
      clearButton.type = 'button';
      clearButton.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
      clearButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Search.ClearInput'));
      clearButton.setAttribute('title', game.i18n.localize('SPELLBOOK.Search.ClearInput'));
      clearButton.style.display = 'none';
      log(3, 'Clear button created:', clearButton);
      log(3, 'Inserting clear button after search input...');
      searchInput.parentNode.insertBefore(clearButton, searchInput.nextSibling);
      log(3, 'Clear button inserted');
    } else {
      log(3, 'Clear button already exists:', clearButton);
    }
    log(3, 'Creating dropdown element...');
    const dropdownElement = document.createElement('div');
    dropdownElement.className = 'search-dropdown';
    dropdownElement.setAttribute('role', 'region');
    dropdownElement.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Search.Dropdown'));
    log(3, 'Dropdown element created:', dropdownElement);
    log(3, 'Appending dropdown to document.body...');
    document.body.appendChild(dropdownElement);
    log(3, 'Dropdown appended to body');
    const verifyDropdown = document.querySelector('.search-dropdown');
    log(3, 'Verification - dropdown in DOM:', !!verifyDropdown, verifyDropdown);
    if (!hasAdvancedClass) {
      log(3, 'Adding classes and attributes to search input...');
      searchInput.classList.add('advanced-search-input');
      searchInput.setAttribute('autocomplete', 'off');
      searchInput.setAttribute('aria-expanded', 'false');
      searchInput.setAttribute('aria-haspopup', 'listbox');
      filterItem.classList.add('has-advanced-search');
      log(3, 'Classes and attributes added');
    } else {
      log(3, 'Search input already has advanced setup');
    }
    this.searchInputElement = searchInput;
    this.clearButtonElement = clearButton;
    log(3, 'References stored');
    log(3, 'Advanced search interface setup complete');
    log(3, 'Final verification - dropdown in DOM:', !!document.querySelector('.search-dropdown'));
  }

  /**
   * Setup event listeners for search functionality
   */
  setupEventListeners() {
    const searchInput = this.element.querySelector('input[name="filter-name"]');
    const dropdown = document.querySelector('.search-dropdown');
    if (!searchInput || !dropdown) {
      log(2, 'Advanced search setup incomplete:', { searchInput: !!searchInput, dropdown: !!dropdown });
      return;
    }
    log(3, 'Setting up advanced search event listeners');
    const clonedInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(clonedInput, searchInput);
    const newSearchInput = this.element.querySelector('input[name="filter-name"]');
    this.searchInputElement = newSearchInput;
    const clearButton = newSearchInput.parentNode.querySelector('.search-input-clear');
    this.clearButtonElement = clearButton;
    this.isDeletingRecentSearch = false;
    newSearchInput.addEventListener(
      'focus',
      (event) => {
        log(3, 'Search input focused');
        this.handleSearchFocus(event);
        this.updateClearButtonVisibility();
      },
      true
    );
    newSearchInput.addEventListener(
      'click',
      (event) => {
        if (document.activeElement !== newSearchInput) {
          log(3, 'Search input clicked');
          this.handleSearchFocus(event);
        }
      },
      true
    );
    newSearchInput.addEventListener(
      'input',
      (event) => {
        log(3, 'Search input changed:', event.target.value);
        this.handleSearchInput(event);
        this.updateClearButtonVisibility();
      },
      true
    );
    newSearchInput.addEventListener('keydown', (event) => this.handleSearchKeydown(event), true);
    newSearchInput.addEventListener(
      'blur',
      (event) => {
        this.handleSearchBlur(event);
        this.updateClearButtonVisibility();
      },
      true
    );
    if (clearButton) {
      clearButton.addEventListener(
        'mousedown',
        (event) => {
          log(3, 'Clear button mousedown');
          event.preventDefault();
          event.stopPropagation();
        },
        true
      );
      clearButton.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          log(3, 'Clear button clicked');
          this.clearSearch();
        },
        true
      );
    }
    dropdown.addEventListener(
      'mousedown',
      (event) => {
        const clearButton = event.target.closest('.clear-recent-search');
        if (clearButton) {
          event.preventDefault();
          event.stopPropagation();
          this.isDeletingRecentSearch = true;
          const query = clearButton.dataset.search;
          log(3, 'Removing recent search (mousedown):', query);
          const recentSearchRow = clearButton.closest('.search-suggestion.recent-search');
          if (recentSearchRow) {
            recentSearchRow.style.opacity = '0.3';
            recentSearchRow.style.pointerEvents = 'none';
            setTimeout(() => {
              if (recentSearchRow.parentNode) {
                recentSearchRow.style.display = 'none';
              }
            }, 150);
          }
          this.removeFromRecentSearches(query);
          setTimeout(() => {
            const currentQuery = this.searchInputElement?.value || '';
            this.updateDropdownContent(currentQuery);
            this.isDeletingRecentSearch = false;
          }, 200);
          return false;
        }
      },
      true
    );
    dropdown.addEventListener(
      'click',
      (event) => {
        const clearButton = event.target.closest('.clear-recent-search');
        if (clearButton) {
          event.preventDefault();
          event.stopPropagation();
          return false;
        }
        const suggestion = event.target.closest('.search-suggestion');
        if (suggestion) {
          event.stopPropagation();
          this.selectSuggestion(suggestion);
        }
      },
      true
    );
    document.addEventListener(
      'click',
      (event) => {
        if (
          !newSearchInput.contains(event.target) &&
          !dropdown.contains(event.target) &&
          !clearButton?.contains(event.target) &&
          !event.target.closest('.search-dropdown') &&
          !event.target.closest('.filter-item') &&
          !this.isDeletingRecentSearch
        ) {
          this.hideDropdown();
        }
      },
      false
    );
    log(3, 'Advanced search event listeners attached');
  }

  /**
   * Handle search input focus
   * @param {Event} event - Focus event
   */
  handleSearchFocus(event) {
    if (this.isProcessingFocusEvent) return;
    this.isProcessingFocusEvent = true;
    if (this.focusDebounceTimeout) clearTimeout(this.focusDebounceTimeout);
    this.focusDebounceTimeout = setTimeout(() => {
      log(3, 'Handling search focus');
      this.showDropdown();
      const currentQuery = event.target.value || '';
      this.updateDropdownContent(currentQuery);
      this.isProcessingFocusEvent = false;
      this.focusDebounceTimeout = null;
    }, 10);
  }

  /**
   * Handle search input changes
   * @param {Event} event - Input event
   */
  handleSearchInput(event) {
    if (this.isFieldSuggestionActive) return;
    const query = event.target.value;
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    const isAdvancedQuery = query.startsWith('^');
    if (isAdvancedQuery) {
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
        event.stopPropagation();
        if (this.searchTimeout) {
          clearTimeout(this.searchTimeout);
          this.searchTimeout = null;
        }
        if (this.selectedSuggestionIndex >= 0 && this.selectedSuggestionIndex < suggestions.length) {
          this.selectSuggestion(suggestions[this.selectedSuggestionIndex]);
        } else {
          const query = event.target.value;
          if (query) {
            if (query.startsWith('^')) {
              if (this.isAdvancedQueryComplete(query)) {
                this.addToRecentSearches(query);
                this.hideDropdown();
                this.performSearch(query);
              } else {
                log(2, 'Advanced query incomplete or invalid:', query);
              }
            } else {
              this.addToRecentSearches(query);
              this.hideDropdown();
              this.performSearch(query);
            }
          }
        }
        break;
      case 'Escape':
        this.hideDropdown();
        break;
    }
  }

  /**
   * Handle search input blur
   * @param {Event} event - Blur event
   */
  handleSearchBlur(event) {
    log(3, 'Search blur event, isDeletingRecentSearch:', this.isDeletingRecentSearch, 'isFieldSuggestionActive:', this.isFieldSuggestionActive);
    if (this.isDeletingRecentSearch || this.isFieldSuggestionActive) {
      log(3, 'Preventing blur hide due to recent search deletion or field suggestion');
      return;
    }
    setTimeout(() => {
      if (!this.isDeletingRecentSearch && !this.isFieldSuggestionActive) this.hideDropdown();
    }, 150);
  }

  /**
   * Show the search dropdown
   */
  showDropdown() {
    const dropdown = document.querySelector('.search-dropdown');
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
    if (!dropdown || !searchInput) return;
    const rect = searchInput.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.display = 'block';
    dropdown.style.zIndex = '1000';
    dropdown.classList.add('visible');
    searchInput.setAttribute('aria-expanded', 'true');
    this.isDropdownVisible = true;
    this.selectedSuggestionIndex = -1;
    log(3, 'Search dropdown shown');
  }

  /**
   * Hide the search dropdown
   */
  hideDropdown() {
    const dropdown = document.querySelector('.search-dropdown');
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
    if (!dropdown) return;
    dropdown.style.display = 'none';
    dropdown.classList.remove('visible');
    if (searchInput) searchInput.setAttribute('aria-expanded', 'false');
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
    let content = '<div class="search-section-header">Advanced</div>';
    if (this.isIncompleteOperatorQuery(query)) {
      content += '<div class="search-status info">→ Enter field</div>';
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
        content += '<div class="search-section-header">Fields</div>';
        uniqueFields.forEach((field) => {
          const tooltipAttr = field.length > 32 ? `data-tooltip="${field}"` : '';
          content += `<div class="search-suggestion" data-query="${query}${field}:">
          <span class="suggestion-text" ${tooltipAttr}>${field}</span>
        </div>`;
        });
      }
      return content;
    }
    const endsWithFieldColon = this.queryEndsWithFieldColon(queryWithoutTrigger);
    if (endsWithFieldColon) {
      const fieldId = this.fieldDefinitions.getFieldId(endsWithFieldColon);
      content += '<div class="search-status info">→ Enter value</div>';
      if (fieldId && fieldId !== 'range') {
        const validValues = this.fieldDefinitions.getValidValuesForField(fieldId);
        if (validValues.length > 0) {
          content += '<div class="search-section-header">Values</div>';
          validValues.forEach((value) => {
            const tooltipAttr = value.length > 32 ? `data-tooltip="${value}"` : '';
            content += `<div class="search-suggestion" data-query="${query}${value}">
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
      content += '<div class="search-status info">→ Complete value</div>';
      const validValues = this.fieldDefinitions.getValidValuesForField(fieldId);
      const matchingValues = validValues.filter((value) => value.toLowerCase().startsWith(currentValue.toLowerCase()));
      if (matchingValues.length > 0) {
        content += '<div class="search-section-header">Matching Values</div>';
        matchingValues.forEach((value) => {
          const beforeColon = queryWithoutTrigger.substring(0, queryWithoutTrigger.lastIndexOf(':') + 1);
          const fullQuery = `^${beforeColon}${value}`;
          const tooltipAttr = value.length > 32 ? `data-tooltip="${value}"` : '';
          content += `<div class="search-suggestion" data-query="${fullQuery}">
          <span class="suggestion-text" ${tooltipAttr}>${value}</span>
        </div>`;
        });
      }
      return content;
    }
    if (this.isAdvancedQueryComplete(query)) {
      content += `<div class="search-suggestion submit-query" data-query="${query}">
        <span class="suggestion-text">Execute Query</span>
        <span class="suggestion-execute">⏎</span>
      </div>`;
    }
    return content;
  }

  /**
   * Check if query ends with a field name followed by a colon
   * @param {string} query - Query without the ^ prefix
   * @returns {string|null} Field name if found, null otherwise
   */
  queryEndsWithFieldColon(query) {
    const parts = query.split(/[\s()]+/);
    const lastPart = parts[parts.length - 1];
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
    const parts = queryWithoutTrigger.split(/[\s()]+/);
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const colonIndex = part.indexOf(':');
      if (colonIndex !== -1) {
        const field = part.substring(0, colonIndex);
        const value = part.substring(colonIndex + 1);
        const fieldId = this.fieldDefinitions.getFieldId(field);
        if (fieldId && value && this.isIncompleteValueForField(fieldId, value)) return { field: fieldId, value };
        break;
      }
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
    if (recentSearches.length === 0) return '<div class="search-section-header">No recent</div>';
    let content = '<div class="search-section-header">Recent</div>';
    recentSearches.forEach((search) => {
      const tooltipAttr = search.length > 32 ? `data-tooltip="${search}"` : '';
      content += `<div class="search-suggestion" data-query="${search}">
      <span class="suggestion-text" ${tooltipAttr}>${search}</span>
      <button class="clear-recent-search" data-search="${search}" aria-label="Delete search">
        <i class="fas fa-times"></i>
      </button>
    </div>`;
    });
    return content;
  }

  /**
   * Generate fuzzy match suggestions
   * @param {string} query - The search query
   * @returns {string} HTML content
   * @private
   */
  _generateFuzzyMatches(query) {
    const matches = this.getFuzzyMatches(query);
    if (matches.length === 0) return '<div class="search-section-header">No suggestions found</div>';
    let content = '<div class="search-section-header">Suggestions</div>';
    matches.forEach((match) => {
      content += `<div class="search-suggestion fuzzy-match" data-query="${match.name}">
        <span class="suggestion-text">${this.highlightText(match.name, query)}</span>
        <span class="suggestion-score">${match.score}</span>
      </div>`;
    });
    return content;
  }

  /**
   * Highlight matching text in search results
   * @param {string} text - Text to highlight
   * @param {string} query - Search query
   * @returns {string} Text with highlighted matches
   */
  highlightText(text, query) {
    if (!query || query.length < 2) return text;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(${escapedQuery
        .split(/\s+/)
        .filter((word) => word.length > 0)
        .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')})`,
      'gi'
    );
    return text.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Select a suggestion from the dropdown
   * @param {HTMLElement} suggestionElement - The selected suggestion element
   */
  selectSuggestion(suggestionElement) {
    const query = suggestionElement.dataset.query;
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
    if (searchInput && query) {
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }
      searchInput.value = query;
      this.updateClearButtonVisibility();
      const isSubmitQuery = suggestionElement.classList.contains('submit-query');
      if (isSubmitQuery) {
        this.addToRecentSearches(query);
        this.hideDropdown();
        this.performSearch(query);
        return;
      }
      if (query.endsWith(':')) {
        this.isFieldSuggestionActive = true;
        this.updateDropdownContent(query);
        if (!this.isDropdownVisible) this.showDropdown();
        searchInput.focus();
        setTimeout(() => {
          this.isFieldSuggestionActive = false;
        }, 100);
      } else if (this.isIncompleteOperatorQuery(query)) {
        this.isFieldSuggestionActive = true;
        this.updateDropdownContent(query);
        if (!this.isDropdownVisible) this.showDropdown();
        searchInput.focus();
        setTimeout(() => {
          this.isFieldSuggestionActive = false;
        }, 100);
      } else if (this.isAdvancedQueryComplete(query)) {
        this.isFieldSuggestionActive = true;
        this.updateDropdownContent(query);
        if (!this.isDropdownVisible) this.showDropdown();
        searchInput.focus();
        setTimeout(() => {
          this.isFieldSuggestionActive = false;
        }, 100);
      } else {
        this.addToRecentSearches(query);
        this.hideDropdown();
        this.performSearch(query);
      }
    }
  }

  /**
   * Check if query is an incomplete operator query (ends with operators)
   * @param {string} query - The query to check
   * @returns {boolean} Whether it's an incomplete operator query
   */
  isIncompleteOperatorQuery(query) {
    if (!query.startsWith('^')) return false;
    const queryWithoutTrigger = query.substring(1);
    const trimmed = queryWithoutTrigger.trim();
    return (
      trimmed.endsWith(' AND') ||
      trimmed.endsWith(' OR') ||
      trimmed.endsWith(' NOT') ||
      trimmed.endsWith('(') ||
      queryWithoutTrigger.endsWith(' AND ') ||
      queryWithoutTrigger.endsWith(' OR ') ||
      queryWithoutTrigger.endsWith(' NOT ') ||
      queryWithoutTrigger.endsWith('( ')
    );
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
   * Check if query contains boolean operators
   * @param {string} query - The query to check
   * @returns {boolean} Whether it contains operators
   */
  hasOperators(query) {
    const upperQuery = query.toUpperCase();
    return upperQuery.includes(' AND ') || upperQuery.includes(' OR ') || upperQuery.includes(' NOT ') || upperQuery.includes('(') || upperQuery.includes(')');
  }

  /**
   * Update visual selection of suggestions
   * @param {NodeList} suggestions - List of suggestion elements
   */
  updateSuggestionSelection(suggestions) {
    suggestions.forEach((suggestion, index) => {
      suggestion.classList.toggle('selected', index === this.selectedSuggestionIndex);
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
   * Apply advanced query results to filter state even when filters are hidden
   * @param {Object} parsedQuery - The parsed query object
   */
  applyAdvancedQueryToFilters(parsedQuery) {
    if (!this.app.filterHelper._cachedFilterState) this.app.filterHelper._cachedFilterState = {};
    if (parsedQuery.type === 'field') {
      if (parsedQuery.field === 'range') {
        const [min, max] = this.parseRangeValue(parsedQuery.value);
        this.app.filterHelper._cachedFilterState.minRange = min;
        this.app.filterHelper._cachedFilterState.maxRange = max;
        this.setRangeFilterValue(parsedQuery.value);
      } else {
        this.app.filterHelper._cachedFilterState[parsedQuery.field] = parsedQuery.value;
        this.setFilterValue(parsedQuery.field, parsedQuery.value);
      }
    } else if (parsedQuery.type === 'boolean') {
      if (parsedQuery.operator === 'AND') {
        this.applyAdvancedQueryToFilters(parsedQuery.left);
        this.applyAdvancedQueryToFilters(parsedQuery.right);
      } else if (parsedQuery.operator === 'OR') {
        log(2, 'OR operations not fully supported in UI, applying left side only');
        this.applyAdvancedQueryToFilters(parsedQuery.left);
      } else if (parsedQuery.operator === 'NOT') {
        log(2, 'NOT operations not supported in current UI');
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
    if (!rangeValue || typeof rangeValue !== 'string') return ['', ''];
    if (!rangeValue.includes('-')) return [rangeValue, rangeValue];
    const parts = rangeValue.split('-');
    const min = parts[0]?.trim() || '';
    const max = parts[1]?.trim() || '';
    return [min, max];
  }

  /**
   * Set range filter values for both min and max inputs
   * @param {string} rangeValue - Range value like "0-30"
   */
  setRangeFilterValue(rangeValue) {
    const [min, max] = this.parseRangeValue(rangeValue);
    const minInput = this.element.querySelector('input[name="filter-min-range"]');
    if (minInput) {
      minInput.value = min;
      minInput.dispatchEvent(new Event('input', { bubbles: true }));
      log(3, `Set min range to: ${min}`);
    }
    const maxInput = this.element.querySelector('input[name="filter-max-range"]');
    if (maxInput) {
      maxInput.value = max;
      maxInput.dispatchEvent(new Event('input', { bubbles: true }));
      log(3, `Set max range to: ${max}`);
    }
  }

  /**
   * Clear all filter form elements
   */
  clearAllFilters() {
    const dropdowns = this.element.querySelectorAll('select[name^="filter-"]');
    dropdowns.forEach((select) => {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const checkboxes = this.element.querySelectorAll('input[type="checkbox"][name^="filter-"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const minRangeInput = this.element.querySelector('input[name="filter-min-range"]');
    const maxRangeInput = this.element.querySelector('input[name="filter-max-range"]');
    if (minRangeInput) {
      minRangeInput.value = '';
      minRangeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (maxRangeInput) {
      maxRangeInput.value = '';
      maxRangeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    log(3, 'All filters cleared');
  }

  /**
   * Set a specific filter value in the UI
   * @param {string} fieldId - The field ID
   * @param {string} value - The value to set
   */
  setFilterValue(fieldId, value) {
    const filterElement = this.element.querySelector(`[name="filter-${fieldId}"]`);
    if (!filterElement) {
      log(2, `No filter element found for field: ${fieldId}`);
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
   * Get fuzzy matches for a query
   * @param {string} query - The search query
   * @returns {Array} Array of matching spell names with scores
   */
  getFuzzyMatches(query) {
    try {
      if (!query || query.length < 3) return [];
      const activeClass = this.app._stateManager?.activeClass;
      if (!activeClass || !this.app._stateManager.classSpellData[activeClass]?.spellLevels) return [];
      const spells = this.app._stateManager.classSpellData[activeClass].spellLevels;
      const matches = [];
      const queryLower = query.toLowerCase();
      for (const spell of spells) {
        if (!spell.name) continue;
        const spellNameLower = spell.name.toLowerCase();
        let score = 0;
        if (spellNameLower === queryLower) score = 100;
        else if (spellNameLower.startsWith(queryLower)) score = 90;
        else if (spellNameLower.includes(queryLower)) score = 80;
        else {
          const words = queryLower.split(/\s+/);
          const matchedWords = words.filter((word) => spellNameLower.includes(word));
          if (matchedWords.length > 0) score = Math.floor((matchedWords.length / words.length) * 70);
        }
        if (score > 0) matches.push({ name: spell.name, score });
      }
      return matches.sort((a, b) => b.score - a.score).slice(0, 10);
    } catch (error) {
      log(2, 'Error getting fuzzy matches:', error);
      return [];
    }
  }

  /**
   * Cleanup advanced search resources
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
    this.isAdvancedQuery = false;
    this.parsedQuery = null;
    this.selectedSuggestionIndex = -1;
    this.isDropdownVisible = false;
    this.isProcessingFocusEvent = false;
    this.lastDropdownQuery = null;
    this.queryCache.clear();
    const existingDropdown = document.querySelector('.search-dropdown');
    if (existingDropdown) existingDropdown.remove();
  }
}
