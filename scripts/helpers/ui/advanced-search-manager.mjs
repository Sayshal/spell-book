import { PlayerSpellBook } from '../../apps/player-spell-book.mjs';
import { FLAGS, MODULE } from '../../constants.mjs';
import { log } from '../../logger.mjs';

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
    const searchInput = this.element.querySelector('input[name="filter-name"]');
    if (!searchInput) return;
    if (searchInput.classList.contains('advanced-search-input')) return;
    log(3, 'Found search input:', searchInput);
    const existingDropdown = document.querySelector('.search-dropdown');
    if (existingDropdown) existingDropdown.remove();
    const filterItem = searchInput.closest('.filter-item');
    if (!filterItem) return;
    const existingClearButton = filterItem.querySelector('.search-input-clear');
    if (existingClearButton) existingClearButton.remove();
    const clearButton = document.createElement('button');
    clearButton.className = 'search-input-clear';
    clearButton.type = 'button';
    clearButton.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    clearButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Search.ClearInput'));
    clearButton.setAttribute('title', game.i18n.localize('SPELLBOOK.Search.ClearInput'));
    clearButton.style.display = 'none';
    searchInput.parentNode.insertBefore(clearButton, searchInput.nextSibling);
    const dropdownElement = document.createElement('div');
    dropdownElement.className = 'search-dropdown';
    dropdownElement.setAttribute('role', 'region');
    dropdownElement.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Search.Dropdown'));
    document.body.appendChild(dropdownElement);
    searchInput.classList.add('advanced-search-input');
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.setAttribute('aria-haspopup', 'listbox');
    filterItem.classList.add('has-advanced-search');
    this.searchInputElement = searchInput;
    this.clearButtonElement = clearButton;
    log(3, 'Advanced search interface setup complete. Search input classes:', searchInput.className);
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
        log(3, 'Search input clicked');
        this.handleSearchFocus(event);
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
          newSearchInput.value = '';
          log(3, 'Input cleared - new value:', newSearchInput.value);
          this.app.filterHelper.invalidateFilterCache();
          PlayerSpellBook.filterSpells.call(this.app, null, null);
          newSearchInput.focus();
          this.updateClearButtonVisibility();
          this.showDropdown();
        },
        true
      );
    } else {
      log(2, 'Clear button not found for event listener setup');
    }
    dropdown.addEventListener(
      'mousedown',
      (event) => {
        const clearButton = event.target.closest('.clear-recent-search');
        if (clearButton) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          this.isDeletingRecentSearch = true;
          let query = clearButton.dataset.query;
          query = query.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
          log(3, 'Deleting recent search:', query);
          this.removeRecentSearch(query)
            .then(() => {
              log(3, 'Recent search deleted, updating dropdown');
              this.updateDropdownContent(this.getCurrentQuery());
              this.showDropdown();
              setTimeout(() => {
                const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
                if (searchInput) searchInput.focus();
                this.isDeletingRecentSearch = false;
              }, 10);
            })
            .catch((error) => {
              log(1, 'Error deleting recent search:', error);
              this.isDeletingRecentSearch = false;
            });
          return false;
        } else {
          event.preventDefault();
        }
      },
      true
    );
    dropdown.addEventListener(
      'click',
      (event) => {
        const clearButton = event.target.closest('.clear-recent-search');
        if (clearButton) return;
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
        if (!newSearchInput.contains(event.target) && !dropdown.contains(event.target) && !clearButton?.contains(event.target)) this.hideDropdown();
      },
      true
    );
    log(3, 'Advanced search event listeners attached');
  }

  /**
   * Handle search input focus
   * @param {Event} event - Focus event
   */
  handleSearchFocus(event) {
    log(3, 'Handling search focus');
    this.showDropdown();
  }

  /**
   * Handle search input changes
   * @param {Event} event - Input event
   */
  handleSearchInput(event) {
    const query = event.target.value;
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(async () => {
      try {
        await this.app._ensureSpellDataAndInitializeLazyLoading();
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        log(2, 'Error ensuring spell data for fuzzy search:', error);
      }
      this.updateDropdownContent(query);
      this.performSearch(query);
    }, 300);
    if (!this.isDropdownVisible) this.showDropdown();
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
        if (this.selectedSuggestionIndex >= 0 && suggestions[this.selectedSuggestionIndex]) {
          this.selectSuggestion(suggestions[this.selectedSuggestionIndex]);
        } else {
          const currentQuery = this.getCurrentQuery();
          if (currentQuery && currentQuery.trim()) {
            this.addToRecentSearches(currentQuery.trim());
            this.performSearch(currentQuery.trim());
            this.updateClearButtonVisibility();
          }
          this.hideDropdown();
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.hideDropdown();
        break;
    }
  }

  /**
   * Handle search input blur
   * @param {Event} event - Blur event
   */
  handleSearchBlur(event) {
    if (this.isDeletingRecentSearch) return;
    const currentQuery = this.getCurrentQuery();
    if (currentQuery && currentQuery.trim()) this.addToRecentSearches(currentQuery.trim());
    setTimeout(() => {
      if (!this.isDeletingRecentSearch) {
        const dropdown = document.querySelector('.search-dropdown');
        if (!dropdown || !dropdown.matches(':hover')) this.hideDropdown();
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
    const inputRect = searchInput.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${inputRect.bottom + 2}px`;
    dropdown.style.left = `${inputRect.left}px`;
    dropdown.style.width = `${inputRect.width}px`;
    dropdown.style.zIndex = '10000';
    dropdown.classList.add('visible');
    this.isDropdownVisible = true;
    this.selectedSuggestionIndex = -1;
    this.updateDropdownContent(this.getCurrentQuery());
    if (searchInput) searchInput.setAttribute('aria-expanded', 'true');
    log(3, 'Dropdown shown and positioned');
  }

  /**
   * Hide the search dropdown
   */
  hideDropdown() {
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown) return;
    dropdown.classList.remove('visible');
    this.isDropdownVisible = false;
    this.selectedSuggestionIndex = -1;
    const searchInput = document.querySelector('input[name="filter-name"]');
    if (searchInput) searchInput.setAttribute('aria-expanded', 'false');
  }

  /**
   * Update dropdown content based on current query
   * @param {string} query - Current search query
   */
  updateDropdownContent(query) {
    const dropdown = document.querySelector('.search-dropdown');
    if (!dropdown) return;
    const suggestions = this.generateSuggestions(query);
    dropdown.innerHTML = this.createSuggestionsHtml(suggestions, query);
    log(3, 'Dropdown content updated:', {
      query: query,
      suggestionsCount: suggestions.length,
      recentSearches: this.getRecentSearches().length
    });
  }

  /**
   * Generate search suggestions based on query
   * @param {string} query - Current search query
   * @returns {Array} Array of suggestion objects
   */
  generateSuggestions(query) {
    const suggestions = [];
    const recentSearches = this.getRecentSearches();
    if (!query || query.length < 3) {
      recentSearches.forEach((search) => {
        suggestions.push({
          type: 'recent',
          query: search.query,
          label: search.query,
          timestamp: search.timestamp
        });
      });
    } else {
      recentSearches.forEach((search) => {
        if (search.query.toLowerCase().includes(query.toLowerCase()) && search.query.toLowerCase() !== query.toLowerCase()) {
          suggestions.push({
            type: 'recent',
            query: search.query,
            label: search.query,
            timestamp: search.timestamp
          });
        }
      });
      const isQuotedSearch = query.match(/^["'](.+?)["']$/);
      if (isQuotedSearch) {
        const phrase = isQuotedSearch[1];
        const exactMatches = this.generateExactPhraseMatches(phrase);
        exactMatches.slice(0, 5).forEach((match) => {
          suggestions.push({
            type: 'exact',
            query: match.name,
            label: match.name,
            score: match.score
          });
        });
      } else {
        const fuzzyMatches = this.generateFuzzyMatches(query);
        fuzzyMatches.slice(0, 5).forEach((match) => {
          suggestions.push({
            type: 'fuzzy',
            query: match.name,
            label: match.name,
            score: match.score
          });
        });
      }
    }
    return suggestions;
  }

  /**
   * Generate exact phrase matches for quoted searches using complete spell data
   * @param {string} phrase - Search phrase (without quotes)
   * @returns {Array} Array of exact matches with scores
   */
  generateExactPhraseMatches(phrase) {
    if (!phrase || phrase.length < 1) return [];
    let availableSpells = [];
    if (this.app.availableSpells && this.app.availableSpells.length > 0) availableSpells = this.app.availableSpells;
    else if (this.app._stateManager?.classSpellData) {
      const activeClass = this.app._stateManager.activeClass;
      if (activeClass && this.app._stateManager.classSpellData[activeClass]?.spellLevels) availableSpells = this.app._stateManager.classSpellData[activeClass].spellLevels;
    } else {
      const spellItems = document.querySelectorAll('.spell-item .spell-name');
      availableSpells = Array.from(spellItems).map((item) => {
        const fullText = item.textContent.trim();
        const componentMatch = fullText.match(/([A-Za-z\s'.-]+?)(?:\s*\n\s*[VSM]|$)/);
        const spellName = componentMatch ? componentMatch[1].trim() : fullText.trim().split('\n')[0];
        return { name: spellName };
      });
    }
    log(3, 'Exact phrase search data:', {
      phrase: phrase,
      availableSpellsCount: availableSpells.length,
      source:
        this.app.availableSpells?.length > 0 ? 'app.availableSpells'
        : this.app._stateManager?.classSpellData ? 'stateManager.complete'
        : 'DOM'
    });
    const matches = [];
    const phraseLower = phrase.toLowerCase().trim();
    availableSpells.forEach((spell) => {
      const spellName = spell.name || spell.system?.name || '';
      if (!spellName) return;
      const spellNameLower = spellName.toLowerCase().trim();
      if (spellNameLower === phraseLower) {
        matches.push({ name: spellName, score: 100 });
      }
    });
    const sortedMatches = matches.sort((a, b) => b.score - a.score);
    log(3, 'Exact phrase matches found:', sortedMatches.length, 'for phrase:', phrase);
    return sortedMatches;
  }

  /**
   * Generate fuzzy search matches using complete spell data
   * @param {string} query - Search query
   * @returns {Array} Array of fuzzy matches with scores
   */
  generateFuzzyMatches(query) {
    if (!query || query.length < 3) return [];
    let availableSpells = [];
    if (this.app.availableSpells && this.app.availableSpells.length > 0) availableSpells = this.app.availableSpells;
    else if (this.app._stateManager?.classSpellData) {
      const activeClass = this.app._stateManager.activeClass;
      if (activeClass && this.app._stateManager.classSpellData[activeClass]?.spellLevels) availableSpells = this.app._stateManager.classSpellData[activeClass].spellLevels;
    } else {
      const spellItems = document.querySelectorAll('.spell-item .spell-name');
      availableSpells = Array.from(spellItems).map((item) => {
        const fullText = item.textContent.trim();
        const componentMatch = fullText.match(/([A-Za-z\s'.-]+?)(?:\s*\n\s*[VSM]|$)/);
        const spellName = componentMatch ? componentMatch[1].trim() : fullText.trim().split('\n')[0];
        return { name: spellName };
      });
    }
    log(3, 'Fuzzy search data:', {
      query: query,
      availableSpellsCount: availableSpells.length,
      source:
        this.app.availableSpells?.length > 0 ? 'app.availableSpells'
        : this.app._stateManager?.classSpellData ? 'stateManager.complete'
        : 'DOM'
    });
    if (availableSpells.length === 0) return [];
    const matches = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((word) => word.length > 0);
    availableSpells.forEach((spell) => {
      const spellName = spell.name || spell.system?.name || '';
      if (!spellName) return;
      const spellNameLower = spellName.toLowerCase();
      let score = 0;
      if (spellNameLower === queryLower) score = 100;
      else if (spellNameLower.startsWith(queryLower)) score = 80;
      else if (spellNameLower.includes(queryLower)) score = 60;
      else {
        let wordMatches = 0;
        queryWords.forEach((word) => {
          if (spellNameLower.includes(word)) wordMatches++;
        });
        if (wordMatches > 0) score = (wordMatches / queryWords.length) * 40;
      }
      if (score > 0) matches.push({ name: spellName, score: score });
    });
    const sortedMatches = matches.sort((a, b) => b.score - a.score);
    log(3, 'Fuzzy matches found:', sortedMatches.length, 'for query:', query);
    return sortedMatches;
  }

  /**
   * Create HTML for search suggestions
   * @param {Array} suggestions - Array of suggestion objects
   * @param {string} currentQuery - Current search query
   * @returns {string} HTML string for suggestions
   */
  createSuggestionsHtml(suggestions, currentQuery) {
    let html = '<div class="search-suggestions" role="listbox">';
    const recentSuggestions = suggestions.filter((s) => s.type === 'recent');
    const fuzzyMatches = suggestions.filter((s) => s.type === 'fuzzy');
    const exactMatches = suggestions.filter((s) => s.type === 'exact');
    if (recentSuggestions.length > 0) {
      html += `<div class="suggestion-group">
      <div class="suggestion-header">${game.i18n.localize('SPELLBOOK.Search.RecentSearches')}</div>`;
      recentSuggestions.forEach((suggestion) => {
        const escapedQuery = suggestion.query.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const displayQuery = suggestion.label || suggestion.query;
        html += `<div class="search-suggestion recent-search" role="option" data-query="${escapedQuery}">
        <i class="fas fa-history" aria-hidden="true"></i>
        <span class="suggestion-text">${displayQuery}</span>
        <button class="clear-recent-search" data-query="${escapedQuery}"
                aria-label="${game.i18n.localize('SPELLBOOK.Search.ClearRecent')}"
                title="${game.i18n.localize('SPELLBOOK.Search.ClearRecent')}"
                type="button">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>`;
      });
      html += '</div>';
    }
    if (exactMatches.length > 0) {
      html += `<div class="suggestion-group">
      <div class="suggestion-header">${game.i18n.localize('SPELLBOOK.Search.ExactMatches')}</div>`;
      exactMatches.forEach((suggestion) => {
        const escapedQuery = suggestion.query.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        html += `<div class="search-suggestion exact-match" role="option" data-query="${escapedQuery}">
        <i class="fas fa-quote-left" aria-hidden="true"></i>
        <span class="suggestion-text">${suggestion.label}</span>
      </div>`;
      });
      html += '</div>';
    }
    if (fuzzyMatches.length > 0 && currentQuery && currentQuery.length >= 3) {
      html += `<div class="suggestion-group">
      <div class="suggestion-header">${game.i18n.localize('SPELLBOOK.Search.Suggestions')}</div>`;
      fuzzyMatches.forEach((suggestion) => {
        const escapedQuery = suggestion.query.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        html += `<div class="search-suggestion fuzzy-match" role="option" data-query="${escapedQuery}">
        <i class="fas fa-search" aria-hidden="true"></i>
        <span class="suggestion-text">${this.highlightMatch(suggestion.label, currentQuery)}</span>
      </div>`;
      });
      html += '</div>';
    }
    if (suggestions.length === 0) {
      if (!currentQuery || currentQuery.length < 3) {
        html += `<div class="no-suggestions" role="status">
        <p>${game.i18n.localize('SPELLBOOK.Search.StartTyping')}</p>
      </div>`;
      } else {
        html += `<div class="no-suggestions" role="status">
        <p>${game.i18n.localize('SPELLBOOK.Search.NoSuggestions')}</p>
      </div>`;
      }
    }
    html += '</div>';
    return html;
  }

  /**
   * Highlight matching text in suggestions
   * @param {string} text - Text to highlight
   * @param {string} query - Search query
   * @returns {string} Text with highlighted matches
   */
  highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
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
      searchInput.value = query;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      this.addToRecentSearches(query);
      searchInput.focus();
      this.updateClearButtonVisibility();
      this.hideDropdown();
      this.performSearch(query);
    }
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
      if (query && query.trim()) await this.ensureSpellsLoadedForSearch(query);
      this.app.filterHelper.invalidateFilterCache();
      const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
      if (searchInput && query) searchInput.value = query;

      setTimeout(() => {
        this.app.filterHelper.applyFilters();
        log(3, 'Search filtering completed for query:', query);
      }, 50);
      log(3, 'Search performed for query:', query);
    } catch (error) {
      log(1, 'Error performing search:', error);
    }
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
    const queryLower = query.toLowerCase().trim();
    const exactPhraseMatch = query.match(/^["'](.+?)["']$/);
    const isExactSearch = !!exactPhraseMatch;
    const searchTerm = isExactSearch ? exactPhraseMatch[1].toLowerCase() : queryLower;
    allSpells.forEach((spell, index) => {
      const spellName = spell.name || '';
      if (!spellName) return;
      const spellNameLower = spellName.toLowerCase();
      let matches = false;
      if (isExactSearch) matches = spellNameLower === searchTerm;
      else {
        matches = spellNameLower.includes(searchTerm);
        if (!matches) {
          const queryWords = searchTerm.split(/\s+/).filter((word) => word.length > 0);
          if (queryWords.length > 1) matches = queryWords.every((word) => spellNameLower.includes(word)) || spellNameLower.includes(searchTerm);
        }
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
      const originalQuery = query;
      const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
      if (searchInput) {
        const originalValue = searchInput.value;
        searchInput.value = '';
        this.app.filterHelper.invalidateFilterCache();
      }
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
      if (searchInput) {
        searchInput.value = originalQuery;
        this.app.filterHelper.invalidateFilterCache();
      }
    }
  }

  /**
   * Get current search query
   * @returns {string} Current search query
   */
  getCurrentQuery() {
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
    return searchInput ? searchInput.value : '';
  }

  /**
   * Get recent searches from actor flags
   * @returns {Array} Array of recent search objects
   */
  getRecentSearches() {
    const recentSearches = this.actor.getFlag(MODULE.ID, FLAGS.RECENT_SEARCHES) || [];
    return recentSearches.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Add query to recent searches
   * @param {string} query - Search query to add
   */
  async addToRecentSearches(query) {
    if (!query || !query.trim()) return;
    const trimmedQuery = query.trim();
    let recentSearches = this.getRecentSearches();
    recentSearches = recentSearches.filter((search) => search.query !== trimmedQuery);
    recentSearches.unshift({ query: trimmedQuery, timestamp: Date.now() });
    recentSearches = recentSearches.slice(0, 8);
    await this.actor.setFlag(MODULE.ID, FLAGS.RECENT_SEARCHES, recentSearches);
  }

  /**
   * Remove a query from recent searches
   * @param {string} query - Search query to remove
   */
  async removeRecentSearch(query) {
    let recentSearches = this.getRecentSearches();
    recentSearches = recentSearches.filter((search) => search.query !== query);
    await this.actor.setFlag(MODULE.ID, FLAGS.RECENT_SEARCHES, recentSearches);
  }

  /**
   * Clear all recent searches
   */
  async clearAllRecentSearches() {
    await this.actor.setFlag(MODULE.ID, FLAGS.RECENT_SEARCHES, []);
  }

  /**
   * Create search dropdown HTML structure
   * @returns {string} HTML for search dropdown
   */
  createSearchDropdownHtml() {
    return `
      <div class="search-dropdown" role="region" aria-label="${game.i18n.localize('SPELLBOOK.Search.Dropdown')}">
        <!-- Content will be populated dynamically -->
      </div>
    `;
  }

  /**
   * Update clear button visibility based on input content and focus
   */
  updateClearButtonVisibility() {
    const clearButton = this.clearButtonElement || document.querySelector('.search-input-clear');
    const searchInput = this.searchInputElement || document.querySelector('input[name="filter-name"]');
    if (clearButton && searchInput) {
      const hasValue = searchInput.value.length > 0;
      const isFocused = document.activeElement === searchInput;
      clearButton.style.display = hasValue && isFocused ? 'block' : 'none';
    }
  }

  /**
   * Clean up dropdown and any setup when application closes or reinitializes
   */
  cleanup() {
    const dropdown = document.querySelector('.search-dropdown');
    if (dropdown) dropdown.remove();
    const clearButton = document.querySelector('.search-input-clear');
    if (clearButton) clearButton.remove();
    const searchInput = document.querySelector('input[name="filter-name"]');
    if (searchInput) searchInput.classList.remove('advanced-search-input');
    const filterItem = document.querySelector('.filter-item.has-advanced-search');
    if (filterItem) filterItem.classList.remove('has-advanced-search');
    const containers = document.querySelectorAll('.search-input-container');
    containers.forEach((container) => {
      if (container.parentNode) {
        while (container.firstChild) container.parentNode.insertBefore(container.firstChild, container);
        container.remove();
      }
    });
  }
}
