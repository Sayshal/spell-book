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

    // Initialize advanced query components
    this.fieldDefinitions = new FieldDefinitions();
    this.queryParser = new QueryParser(this.fieldDefinitions);
    this.queryExecutor = new QueryExecutor();
    this.isAdvancedQuery = false;
    this.parsedQuery = null;
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

    // Don't skip if class exists - we need to ensure dropdown exists too
    const hasAdvancedClass = searchInput.classList.contains('advanced-search-input');
    log(3, 'Search input has advanced class:', hasAdvancedClass);

    const existingDropdown = document.querySelector('.search-dropdown');
    log(3, 'Existing dropdown found:', !!existingDropdown, existingDropdown);

    // If we have the class but no dropdown, we need to recreate the dropdown
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

    // Only create clear button if it doesn't exist
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

    // Verify dropdown was actually added
    const verifyDropdown = document.querySelector('.search-dropdown');
    log(3, 'Verification - dropdown in DOM:', !!verifyDropdown, verifyDropdown);

    // Only add classes if not already present
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

    // Clone and replace the search input to remove any existing listeners
    const clonedInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(clonedInput, searchInput);
    const newSearchInput = this.element.querySelector('input[name="filter-name"]');
    this.searchInputElement = newSearchInput;

    const clearButton = newSearchInput.parentNode.querySelector('.search-input-clear');
    this.clearButtonElement = clearButton;
    this.isDeletingRecentSearch = false;

    // Search input focus event
    newSearchInput.addEventListener(
      'focus',
      (event) => {
        log(3, 'Search input focused');
        this.handleSearchFocus(event);
        this.updateClearButtonVisibility();
      },
      true
    );

    // Search input click event
    newSearchInput.addEventListener(
      'click',
      (event) => {
        log(3, 'Search input clicked');
        this.handleSearchFocus(event);
      },
      true
    );

    // Search input change event
    newSearchInput.addEventListener(
      'input',
      (event) => {
        log(3, 'Search input changed:', event.target.value);
        this.handleSearchInput(event);
        this.updateClearButtonVisibility();
      },
      true
    );

    // Search input keydown event
    newSearchInput.addEventListener('keydown', (event) => this.handleSearchKeydown(event), true);

    // Search input blur event
    newSearchInput.addEventListener(
      'blur',
      (event) => {
        this.handleSearchBlur(event);
        this.updateClearButtonVisibility();
      },
      true
    );

    // Clear button events (if exists)
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

    // Dropdown mousedown event - Critical for preventing blur when deleting recent searches
    dropdown.addEventListener(
      'mousedown',
      (event) => {
        const clearButton = event.target.closest('.clear-recent-search');
        if (clearButton) {
          // FIX: Prevent blur by handling mousedown and setting flag
          event.preventDefault();
          event.stopPropagation();

          // Set flag to prevent blur from hiding dropdown
          this.isDeletingRecentSearch = true;

          const query = clearButton.dataset.search;
          log(3, 'Removing recent search (mousedown):', query);

          // FIX: Immediately hide the row for instant visual feedback
          const recentSearchRow = clearButton.closest('.search-suggestion.recent-search');
          if (recentSearchRow) {
            recentSearchRow.style.opacity = '0.3';
            recentSearchRow.style.pointerEvents = 'none';
            // Animate it out
            setTimeout(() => {
              if (recentSearchRow.parentNode) {
                recentSearchRow.style.display = 'none';
              }
            }, 150);
          }

          // Remove from actor flags
          this.removeFromRecentSearches(query);

          // FIX: Force immediate re-render of dropdown content
          setTimeout(() => {
            const currentQuery = this.searchInputElement?.value || '';
            this.updateDropdownContent(currentQuery);

            // Reset flag after dropdown content is updated
            this.isDeletingRecentSearch = false;
          }, 200);

          return false;
        }
      },
      true
    );

    // Dropdown click event - Handle suggestion selection
    dropdown.addEventListener(
      'click',
      (event) => {
        const clearButton = event.target.closest('.clear-recent-search');
        if (clearButton) {
          // Already handled in mousedown, just prevent bubbling
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

    // Document click event - Hide dropdown when clicking outside
    document.addEventListener(
      'click',
      (event) => {
        // FIX: More precise targeting and don't use capture phase
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
      false // Use bubble phase instead of capture
    );

    log(3, 'Advanced search event listeners attached');
  }

  /**
   * Handle search input focus
   * @param {Event} event - Focus event
   */
  handleSearchFocus(event) {
    log(3, 'Handling search focus');

    // FIX: Add delay to ensure any conflicting blur events have finished
    setTimeout(() => {
      this.showDropdown();
      // Update dropdown content to show recent searches immediately
      const currentQuery = event.target.value || '';
      this.updateDropdownContent(currentQuery);
    }, 10);
  }

  /**
   * Handle search input changes
   * @param {Event} event - Input event
   */
  handleSearchInput(event) {
    // FIXED: Don't process input events when a field suggestion was just selected
    if (this.isFieldSuggestionActive) {
      return;
    }

    const query = event.target.value;
    if (this.searchTimeout) clearTimeout(this.searchTimeout);

    // Check if this is an advanced query
    const isAdvancedQuery = query.startsWith('^');

    if (isAdvancedQuery) {
      // For advanced queries, only update dropdown content, don't auto-submit
      this.searchTimeout = setTimeout(async () => {
        try {
          await this.app._ensureSpellDataAndInitializeLazyLoading();
          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (error) {
          log(2, 'Error ensuring spell data for advanced search:', error);
        }

        // Only update dropdown content, don't perform search
        this.updateDropdownContent(query);

        // Check if the query is complete and valid
        if (this.isAdvancedQueryComplete(query)) {
          log(3, 'Advanced query appears complete, but waiting for Enter key');
        }
      }, 150); // Shorter timeout for dropdown updates
    } else {
      // For regular queries, use longer timeout and auto-submit
      this.searchTimeout = setTimeout(async () => {
        try {
          await this.app._ensureSpellDataAndInitializeLazyLoading();
          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (error) {
          log(2, 'Error ensuring spell data for fuzzy search:', error);
        }
        this.updateDropdownContent(query);
        this.performSearch(query);
      }, 800); // Longer timeout for regular search
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

    // Use the actual QueryParser to validate completeness
    try {
      const parsed = this.queryParser.parseQuery(queryWithoutTrigger);
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

    // FIXED: Don't hide dropdown if we just selected a field suggestion or are deleting recent search
    if (this.isDeletingRecentSearch || this.isFieldSuggestionActive) {
      log(3, 'Preventing blur hide due to recent search deletion or field suggestion');
      return;
    }

    setTimeout(() => {
      if (!this.isDeletingRecentSearch && !this.isFieldSuggestionActive) {
        this.hideDropdown();
      }
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
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown) return;

    let content = '';

    // Check if this is an advanced query
    this.isAdvancedQuery = query.startsWith('^');

    if (this.isAdvancedQuery) {
      content += this._generateAdvancedQueryContent(query);
    } else {
      content += this._generateStandardQueryContent(query);
    }

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
    const queryWithoutTrigger = query.substring(1); // Remove ^
    let content = '<div class="search-section-header">Advanced</div>';

    // Handle incomplete operator queries (like "DAMAGE:FIRE AND ")
    if (this.isIncompleteOperatorQuery(query)) {
      content += '<div class="search-status info">→ Enter field</div>';

      // Show field suggestions for the next part of the query
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

    // NEW: Check if query ends with field: in complex expressions
    const endsWithFieldColon = this.queryEndsWithFieldColon(queryWithoutTrigger);
    if (endsWithFieldColon) {
      const fieldId = this.fieldDefinitions.getFieldId(endsWithFieldColon);
      content += '<div class="search-status info">→ Enter value</div>';

      // Show valid values for this field (except range)
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

    // Show field suggestions if query is incomplete (no colon)
    if (!queryWithoutTrigger.includes(':')) {
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

      const matchingFields = uniqueFields.filter((alias) => alias.toLowerCase().includes(queryWithoutTrigger.toLowerCase()));

      if (matchingFields.length > 0) {
        content += '<div class="search-section-header">Fields</div>';
        matchingFields.forEach((field) => {
          const tooltipAttr = field.length > 32 ? `data-tooltip="${field}"` : '';
          content += `<div class="search-suggestion" data-query="^${field}:">
          <span class="suggestion-text" ${tooltipAttr}>${field}</span>
        </div>`;
        });
      } else if (queryWithoutTrigger.length > 0) {
        content += '<div class="search-section-header">No matches</div>';
      }
    }
    // Handle simple field with colon (legacy path for simple queries)
    else {
      const colonIndex = queryWithoutTrigger.indexOf(':');
      const fieldPart = queryWithoutTrigger.substring(0, colonIndex);
      const valuePart = queryWithoutTrigger.substring(colonIndex + 1);

      // Check if field exists
      const fieldId = this.fieldDefinitions.getFieldId(fieldPart);

      if (!fieldId) {
        content += '<div class="search-status error">✗ Unknown field</div>';
        this.parsedQuery = null;
      }
      // Field exists but no value yet (ends with colon)
      else if (valuePart === '') {
        content += '<div class="search-status info">→ Enter value</div>';

        // Show valid values for this field (except range)
        if (fieldId !== 'range') {
          const validValues = this.fieldDefinitions.getValidValuesForField(fieldId);
          if (validValues.length > 0) {
            content += '<div class="search-section-header">Values</div>';
            validValues.forEach((value) => {
              const tooltipAttr = value.length > 32 ? `data-tooltip="${value}"` : '';
              content += `<div class="search-suggestion" data-query="^${fieldPart}:${value}">
              <span class="suggestion-text" ${tooltipAttr}>${value}</span>
            </div>`;
            });
          }
        }
        this.parsedQuery = null;
      }
      // Field and value provided - try to parse (with graceful error handling)
      else {
        try {
          // NEW: Don't validate while typing incomplete values
          if (this.isIncompleteValue(fieldId, valuePart)) {
            content += '<div class="search-status info">→ Continue typing...</div>';
            this.parsedQuery = null;
            return content;
          }

          this.parsedQuery = this.queryParser.parseQuery(queryWithoutTrigger);
          if (this.parsedQuery) {
            content += '<div class="search-status success">✓ Valid</div>';

            // FIXED: Always show operator suggestions for valid queries
            // regardless of whether operators already exist
            content += '<div class="search-section-header">Add</div>';
            content += `<div class="search-suggestion" data-query="${query} AND ">
            <span class="suggestion-text">+ AND</span>
          </div>`;
            content += `<div class="search-suggestion" data-query="${query} OR ">
            <span class="suggestion-text">+ OR</span>
          </div>`;

            // Always show execute option for valid queries
            content += '<div class="search-section-header">Execute</div>';
            content += `<div class="search-suggestion submit-query" data-query="${query}">
              <span class="suggestion-text">🔍 Run Query</span>
            </div>`;
          }
        } catch (error) {
          // Graceful error handling - don't spam console
          content += '<div class="search-status error">✗ Invalid</div>';
          this.parsedQuery = null;

          // Show valid values if it's a validation error (except range)
          if (fieldId && fieldId !== 'range') {
            const validValues = this.fieldDefinitions.getValidValuesForField(fieldId);
            if (validValues.length > 0) {
              content += '<div class="search-section-header">Valid Values</div>';
              validValues.slice(0, 6).forEach((value) => {
                const tooltipAttr = value.length > 32 ? `data-tooltip="${value}"` : '';
                content += `<div class="search-suggestion" data-query="^${fieldPart}:${value}">
                <span class="suggestion-text" ${tooltipAttr}>${value}</span>
              </div>`;
              });
            }
          }
        }
      }
    }

    return content;
  }

  /**
   * Check if a query ends with FIELD: in complex expressions
   * @param {string} queryWithoutTrigger - Query without the ^ prefix
   * @returns {string|null} Field name if ends with field:, null otherwise
   */
  queryEndsWithFieldColon(queryWithoutTrigger) {
    // Check if ends with WORD: pattern
    const match = queryWithoutTrigger.match(/\b([A-Z]+):$/i);
    if (match) {
      const potentialField = match[1].toUpperCase();
      const fieldId = this.fieldDefinitions.getFieldId(potentialField);
      return fieldId ? potentialField : null;
    }
    return null;
  }

  /**
   * Check if a value appears to be incomplete while typing
   * @param {string} fieldId - The field ID
   * @param {string} value - The value being typed
   * @returns {boolean} Whether the value appears incomplete
   */
  isIncompleteValue(fieldId, value) {
    // For boolean fields, detect partial typing of TRUE/FALSE
    if (['requiresSave', 'concentration', 'prepared', 'ritual'].includes(fieldId)) {
      const upperValue = value.toUpperCase();
      const validValues = ['TRUE', 'FALSE', 'YES', 'NO'];

      // If it's not a complete valid value, check if it's a partial match
      if (!validValues.includes(upperValue)) {
        return validValues.some((valid) => valid.startsWith(upperValue));
      }
    }

    // For other fields, consider very short values as potentially incomplete
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

    if (!query || query.length < 3) {
      content += this._generateRecentSearches();
    } else {
      content += this._generateFuzzyMatches(query);
    }

    return content;
  }

  /**
   * Generate recent searches content
   * @returns {string} HTML content
   * @private
   */
  _generateRecentSearches() {
    const recentSearches = this.getRecentSearches();
    if (recentSearches.length === 0) {
      return '<div class="search-section-header">No recent</div>';
    }

    let content = '<div class="search-section-header">Recent</div>';
    recentSearches.forEach((search) => {
      // Add tooltip for long searches that might be truncated
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
    if (matches.length === 0) {
      return '<div class="search-section-header">No suggestions found</div>';
    }

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

      // Remove if already exists
      const existingIndex = recentSearches.indexOf(trimmedQuery);
      if (existingIndex !== -1) {
        recentSearches.splice(existingIndex, 1);
      }

      // Add to beginning
      recentSearches.unshift(trimmedQuery);

      // Keep only last 8
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

        // Exact match
        if (spellNameLower === queryLower) {
          score = 100;
        }
        // Starts with query
        else if (spellNameLower.startsWith(queryLower)) {
          score = 90;
        }
        // Contains exact query
        else if (spellNameLower.includes(queryLower)) {
          score = 80;
        }
        // Fuzzy word matching
        else {
          const queryWords = queryLower.split(/\s+/);
          const spellWords = spellNameLower.split(/\s+/);

          let wordMatches = 0;
          for (const queryWord of queryWords) {
            for (const spellWord of spellWords) {
              if (spellWord.includes(queryWord)) {
                wordMatches++;
                break;
              }
            }
          }

          if (wordMatches > 0) {
            score = 60 + (wordMatches / queryWords.length) * 20;
          }
        }

        if (score > 0) {
          matches.push({
            name: spell.name,
            score: Math.round(score)
          });
        }
      }

      // Sort by score and return top 5
      matches.sort((a, b) => b.score - a.score);
      return matches.slice(0, 5);
    } catch (error) {
      log(2, 'Error getting fuzzy matches:', error);
      return [];
    }
  }

  /**
   * Highlight matching text in search results
   * @param {string} text - The text to highlight
   * @param {string} query - The search query
   * @returns {string} HTML with highlighted text
   */
  highlightText(text, query) {
    if (!query || !query.trim()) return text;

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
      // FIXED: Clear any pending search timeout to prevent conflicts
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }

      searchInput.value = query;
      this.updateClearButtonVisibility();

      // Check if this is a "submit-query" suggestion (explicit execute)
      const isSubmitQuery = suggestionElement.classList.contains('submit-query');

      if (isSubmitQuery) {
        // User explicitly chose to execute - do it immediately
        this.addToRecentSearches(query);
        this.hideDropdown();
        this.performSearch(query);
        return;
      }

      // FIXED: Handle different types of suggestions
      if (query.endsWith(':')) {
        // This is a field suggestion - show value suggestions immediately
        this.isFieldSuggestionActive = true;
        this.updateDropdownContent(query);
        if (!this.isDropdownVisible) {
          this.showDropdown();
        }
        searchInput.focus();
        setTimeout(() => {
          this.isFieldSuggestionActive = false;
        }, 100);
      } else if (this.isIncompleteOperatorQuery(query)) {
        // This is an incomplete operator query - show field suggestions for next part
        this.isFieldSuggestionActive = true;
        this.updateDropdownContent(query);
        if (!this.isDropdownVisible) {
          this.showDropdown();
        }
        searchInput.focus();
        setTimeout(() => {
          this.isFieldSuggestionActive = false;
        }, 100);
      } else if (this.isAdvancedQueryComplete(query)) {
        // FIXED: For complete advanced queries, always show expansion options
        // instead of auto-executing
        this.isFieldSuggestionActive = true;
        this.updateDropdownContent(query);
        if (!this.isDropdownVisible) {
          this.showDropdown();
        }
        searchInput.focus();
        setTimeout(() => {
          this.isFieldSuggestionActive = false;
        }, 100);
      } else {
        // This is a regular/incomplete suggestion - execute immediately
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

    // Check if ends with incomplete operators
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

    // Must have field and value
    if (!fieldPart || !valuePart) return false;

    // Check if field exists and value is valid
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
      const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');

      // Handle advanced queries by setting filter values directly
      if (query && query.startsWith('^')) {
        const parsedQuery = this.queryParser.parseQuery(query.substring(1));
        if (parsedQuery) {
          this.parsedQuery = parsedQuery;
          // Apply the advanced query to filters (even if hidden)
          this.applyAdvancedQueryToFilters(parsedQuery);

          // FIX: Use the correct method name
          this.app.filterHelper.invalidateFilterCache();

          // Apply filters using the correct method
          setTimeout(() => {
            this.app.filterHelper.applyFilters(); // FIX: Use applyFilters() not _applyFiltersAndRender()
          }, 50);

          return;
        }
      }

      // Handle regular search
      this.isAdvancedQuery = false;
      this.parsedQuery = null;

      // For regular searches, just trigger normal filtering
      this.app.filterHelper.invalidateFilterCache();
      setTimeout(() => {
        this.app.filterHelper.applyFilters(); // FIX: Use applyFilters() not _applyFiltersAndRender()
      }, 50);
    } catch (error) {
      log(1, 'Error in performSearch:', error);
    }
  }

  /**
   * Apply advanced query results to filter state even when filters are hidden
   * @param {Object} parsedQuery - The parsed query object
   */
  applyAdvancedQueryToFilters(parsedQuery) {
    // Clear search input to prevent name filter interference
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
    if (searchInput && searchInput.value) {
      searchInput.value = '';
    }

    if (parsedQuery.type === 'field') {
      // Special handling for range field which uses two separate inputs
      if (parsedQuery.field === 'range') {
        this.setRangeFilterValue(parsedQuery.value);
      } else {
        // Set the filter value directly (works even if UI element is hidden)
        this.setFilterValue(parsedQuery.field, parsedQuery.value);
      }

      // FIX: Also update the app's internal filter state directly
      if (!this.app.filterHelper._cachedFilterState) {
        this.app.filterHelper._cachedFilterState = {};
      }

      if (parsedQuery.field === 'range') {
        // Parse range value and set both min/max in filter state
        const [min, max] = this.parseRangeValue(parsedQuery.value);
        this.app.filterHelper._cachedFilterState.minRange = min;
        this.app.filterHelper._cachedFilterState.maxRange = max;
      } else {
        this.app.filterHelper._cachedFilterState[parsedQuery.field] = parsedQuery.value;
      }
    } else if (parsedQuery.type === 'boolean') {
      // Handle boolean operations (AND, OR, NOT)
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

    log(3, 'Advanced query filters applied');
  }

  /**
   * Parse a range value string into min and max components
   * @param {string} rangeValue - Range value like "0-30" or "5-100"
   * @returns {Array} [min, max] values
   */
  parseRangeValue(rangeValue) {
    if (!rangeValue || typeof rangeValue !== 'string') {
      return ['', ''];
    }

    // Handle single values (treat as exact range)
    if (!rangeValue.includes('-')) {
      return [rangeValue, rangeValue];
    }

    // Split on dash and clean up values
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

    // Set minimum range input
    const minInput = this.element.querySelector('input[name="filter-min-range"]');
    if (minInput) {
      minInput.value = min;
      minInput.dispatchEvent(new Event('input', { bubbles: true }));
      log(3, `Set min range to: ${min}`);
    }

    // Set maximum range input
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
    // Clear dropdowns
    const dropdowns = this.element.querySelectorAll('select[name^="filter-"]');
    dropdowns.forEach((select) => {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Clear checkboxes
    const checkboxes = this.element.querySelectorAll('input[type="checkbox"][name^="filter-"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Clear range inputs (specifically target the range input names)
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

    // Set the value based on element type
    if (filterElement.type === 'checkbox') {
      filterElement.checked = value === 'true';
      // Trigger change event for checkboxes
      filterElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (filterElement.tagName === 'SELECT') {
      filterElement.value = value;
      // Trigger change event for selects
      filterElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      filterElement.value = value;
      // Trigger input event for text inputs
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
    if (activeClass && this.app._stateManager.classSpellData[activeClass]?.spellLevels) {
      allSpells = this.app._stateManager.classSpellData[activeClass].spellLevels;
    }
    if (allSpells.length === 0) return;

    const matchingIndices = [];

    // FIX: Handle advanced queries differently
    if (query.startsWith('^') && this.isCurrentQueryAdvanced()) {
      // For advanced queries, we need to load all spells to properly filter
      // Advanced filtering happens in the filter step, not here
      log(3, 'Advanced query detected, ensuring all spells are loaded for filtering');

      // Load all spells for advanced queries
      const totalSpells = allSpells.length;
      const currentlyLoaded = document.querySelectorAll('.spell-item').length;

      if (totalSpells > currentlyLoaded) {
        log(3, 'Loading all spells for advanced query filtering');

        try {
          await this.app._ensureSpellDataAndInitializeLazyLoading();
          let attempts = 0;
          const maxAttempts = 15; // Increase attempts for loading all spells

          while (document.querySelectorAll('.spell-item').length < totalSpells && attempts < maxAttempts) {
            if (this.app._renderSpellBatch) {
              this.app._renderSpellBatch();
            } else if (this.app._initializeLazyLoading) {
              this.app._initializeLazyLoading();
            }
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

    // Original fuzzy search logic for regular queries
    const queryLower = query.toLowerCase().trim();
    const exactPhraseMatch = query.match(/^["'](.+?)["']$/);
    const isExactSearch = !!exactPhraseMatch;
    const searchTerm = isExactSearch ? exactPhraseMatch[1].toLowerCase() : queryLower;

    allSpells.forEach((spell, index) => {
      if (!spell || !spell.name) return;
      const spellName = spell.name.toLowerCase();
      let matches = false;

      if (isExactSearch) {
        matches = spellName.includes(searchTerm);
      } else {
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
          if (this.app._renderSpellBatch) {
            this.app._renderSpellBatch();
          } else if (this.app._initializeLazyLoading) {
            this.app._initializeLazyLoading();
          }
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
    if (!this.isCurrentQueryAdvanced() || !this.parsedQuery) {
      return spells;
    }

    return this.queryExecutor.executeQuery(this.parsedQuery, spells);
  }

  /**
   * Cleanup advanced search resources
   */
  cleanup() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    this.isAdvancedQuery = false;
    this.parsedQuery = null;
    this.selectedSuggestionIndex = -1;
    this.isDropdownVisible = false;

    const existingDropdown = document.querySelector('.search-dropdown');
    if (existingDropdown) existingDropdown.remove();
  }
}
