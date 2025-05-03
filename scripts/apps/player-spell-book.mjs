import { DEFAULT_FILTER_CONFIG, MODULE } from '../constants.mjs';
import * as actorSpellUtils from '../helpers/actor-spells.mjs';
import * as filterUtils from '../helpers/filters.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import * as preparationUtils from '../helpers/spell-preparation.mjs';
import { log } from '../logger.mjs';
import { PlayerFilterConfiguration } from './player-filter-configuration.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for viewing and preparing spells for D&D 5e characters
 * Allows filtering, sorting, and selecting which spells to prepare
 */
export class PlayerSpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `player-${MODULE.ID}`,
    tag: 'form',
    form: {
      handler: PlayerSpellBook.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      toggleSidebar: PlayerSpellBook.toggleSidebar,
      filterSpells: PlayerSpellBook.filterSpells,
      sortSpells: PlayerSpellBook.sortSpells,
      reset: PlayerSpellBook.handleReset,
      toggleSpellLevel: PlayerSpellBook.toggleSpellLevel,
      configureFilters: PlayerSpellBook.configureFilters
    },
    classes: ['spell-book'],
    window: {
      icon: 'fas fa-hat-wizard',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: {
      height: '780',
      width: '600',
      top: '75'
    }
  };

  /** @override */
  static PARTS = {
    form: { template: MODULE.TEMPLATES.SPELL_BOOK_CONTENT, templates: [MODULE.TEMPLATES.SPELL_BOOK_SIDEBAR, MODULE.TEMPLATES.SPELL_BOOK_LIST] },
    footer: { template: MODULE.TEMPLATES.SPELL_BOOK_FOOTER }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * The actor this spell book is for
   * @type {Actor5e}
   */
  actor = null;

  /**
   * Loading state for the spell book
   * @type {boolean}
   */
  isLoading = true;

  /**
   * Error state tracking
   * @type {boolean}
   */
  hasError = false;

  /**
   * Error message if loading failed
   * @type {string}
   */
  errorMessage = '';

  /**
   * Spell levels data
   * @type {Array}
   */
  spellLevels = [];

  /**
   * Class name for spellcasting
   * @type {string}
   */
  className = '';

  /**
   * Spell preparation statistics
   * @type {Object}
   */
  spellPreparation = { current: 0, maximum: 0 };

  /**
   * Window title getter
   * @type {string}
   */
  get title() {
    return game.i18n.format('SPELLBOOK.Application.ActorTitle', { name: this.actor.name });
  }

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Actor5e} actor - The actor to display spells for
   * @param {object} options - ApplicationV2 options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /**
   * @override
   */
  async _prepareContext(options) {
    // Create basic context with loading state
    const context = this._createBaseContext();

    // Skip detailed preparation if we're still loading
    if (this.isLoading) {
      return context;
    }

    // Add spell data to context
    context.spellLevels = this.spellLevels;
    context.className = this.className;
    context.spellPreparation = this.spellPreparation;

    // Prepare the filters using the new unified system
    context.filters = this._prepareFilters();

    return context;
  }

  /**
   * Creates the base context object with minimal information
   * @returns {Object} The base context
   * @private
   */
  _createBaseContext() {
    // Get filter configuration - needed even during loading state
    let filterConfig = game.settings.get(MODULE.ID, 'filterConfiguration');
    if (!Array.isArray(filterConfig) || !filterConfig.length) {
      filterConfig = DEFAULT_FILTER_CONFIG;
    }

    // Create empty filters structure to prevent UI issues during loading
    const emptyFilters = {
      search: null,
      dropdowns: [],
      checkboxes: [],
      range: null
    };

    return {
      actor: this.actor,
      isLoading: this.isLoading,
      hasError: this.hasError,
      errorMessage: this.errorMessage,
      spellLevels: this.spellLevels || [],
      className: this.className || '',
      filters: this.isLoading ? emptyFilters : this._getFilterState(),
      spellSchools: CONFIG.DND5E.spellSchools,
      buttons: [
        { type: 'submit', icon: 'fas fa-save', label: 'SPELLBOOK.UI.Save', cssClass: 'submit-button' },
        { type: 'reset', action: 'reset', icon: 'fas fa-undo', label: 'SPELLBOOK.UI.Reset', cssClass: 'reset-button' }
      ],
      actorId: this.actor.id,
      TEMPLATES: MODULE.TEMPLATES,
      spellPreparation: this.spellPreparation || { current: 0, maximum: 0 }
    };
  }

  /**
   * Sets up the form after rendering
   * @param {object} context - The render context
   * @param {object} _options - Render options
   * @override
   */
  _onRender(context, _options) {
    super._onRender?.(context, _options);

    try {
      // Set sidebar state based on user preference immediately
      const sidebarCollapsed = game.user.getFlag(MODULE.ID, 'sidebarCollapsed');
      if (sidebarCollapsed) {
        this.element.classList.add('sidebar-collapsed');
      }

      // Add loading class if we're in the loading state
      if (this.isLoading) {
        this.element.classList.add('loading');

        // Disable filter inputs during loading
        this._disableFiltersWhileLoading();

        // Position the footer even during loading
        this._positionFooter();

        // Start loading the data in the background
        this._loadSpellData();
        return;
      } else {
        this.element.classList.remove('loading');
      }

      // Only set up UI elements if we're not loading
      this._positionFooter();
      this._setupFilterListeners();
      this._setupPreparationListeners();

      // Apply saved collapsed spell level states
      this._applyCollapsedLevels();

      // Update spell counts
      this._updateSpellCounts();

      // Apply filters and initialize tracking
      this._applyFilters();
      this._updateSpellPreparationTracking();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
  }

  /**
   * Disable filter inputs while the spell data is loading
   * @private
   */
  _disableFiltersWhileLoading() {
    const inputs = this.element.querySelectorAll('.spell-filters input, .spell-filters select, .spell-filters button');
    inputs.forEach((input) => {
      input.disabled = true;
    });
  }

  /* -------------------------------------------- */
  /*  Data Loading                                */
  /* -------------------------------------------- */

  /**
   * Loads all spell data asynchronously after the initial render
   * @private
   */
  async _loadSpellData() {
    const start = performance.now();
    const timing = (label) => log(3, `${label}: ${(performance.now() - start).toFixed(2)}ms`);

    timing('Start _loadSpellData');

    try {
      // Check for preloaded data first
      if (MODULE.CACHE.processedData && MODULE.CACHE.processedData[this.actor.id]) {
        const cachedData = MODULE.CACHE.processedData[this.actor.id];
        const cacheAge = Date.now() - cachedData.timestamp;

        // Use cache if it's less than 5 minutes old
        if (cacheAge < 300000) {
          log(3, `Using preloaded data for ${this.actor.name} (age: ${(cacheAge / 1000).toFixed(1)}s)`);

          // Apply cached data directly
          this.spellLevels = cachedData.spellLevels;
          this.className = cachedData.className;
          this.spellPreparation = cachedData.spellPreparation;

          // This step creates the enrichedIcon and formattedDetails for each spell
          log(3, 'Enriching cached spell data with icons and details');
          await this._enrichSpellData(this.spellLevels);

          // Complete loading and return early
          this.isLoading = false;
          this.render(false);
          return;
        }
      }

      // Step 1: Find spellcasting class
      const classItem = await this._loadSpellcastingClass();
      if (!classItem) return; // Error already set

      const className = classItem.name.toLowerCase();
      timing('Found class item');

      // Step 2: Get spell list
      const spellUuids = await this._getSpellUuids(classItem);
      if (!spellUuids || !spellUuids.size) {
        log(2, 'No spells found for class:', className);
        timing('No spells found');
        this._setErrorState(game.i18n.format('SPELLBOOK.Errors.NoSpellsFound', { actor: this.actor.name }));
        return;
      }
      timing('Fetched class spell list');

      // Step 3: Get max spell level and fetch spell data
      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);
      log(3, `Max spell level for level ${actorLevel}: ${maxSpellLevel}`);

      const spellItems = await this._fetchSpellDataWithCache(spellUuids, maxSpellLevel);
      timing('Fetched spell data with cache');

      // Step 4: Organize and enrich spell data
      await this._processSpellData(spellItems, classItem);
      timing('Finished _loadSpellData');
    } catch (error) {
      log(1, 'Error loading spell data:', error);
      this._setErrorState('An error occurred while loading spells.');
    } finally {
      // Complete loading and re-render
      this.isLoading = false;
      this.render(false);
    }
  }

  /**
   * Loads the spellcasting class for the actor
   * @returns {Promise<Item5e|null>} The spellcasting class item or null if not found
   * @private
   */
  async _loadSpellcastingClass() {
    const classItem = discoveryUtils.findSpellcastingClass(this.actor);
    if (!classItem) {
      this._setErrorState(game.i18n.format('SPELLBOOK.Errors.NoSpellsFound', { actor: this.actor.name }));
      return null;
    }
    return classItem;
  }

  /**
   * Process spell data by organizing, sorting, and enriching
   * @param {Array} spellItems - The spell items to process
   * @param {Item5e} classItem - The spellcasting class
   * @returns {Promise<void>}
   * @private
   */
  async _processSpellData(spellItems, classItem) {
    // Step 1: Organize spells by level
    const spellLevels = await actorSpellUtils.organizeSpellsByLevel(spellItems, this.actor);

    // Step 2: Sort spells within each level
    this._sortAllSpellLevels(spellLevels);

    // Step 3: Enrich spell data with icons and details
    await this._enrichSpellData(spellLevels);

    // Step 4: Calculate preparation stats
    const prepStats = this._calculatePreparationStats(spellLevels, classItem);

    // Update context with the loaded data
    this.spellLevels = spellLevels;
    this.className = classItem.name;
    this.spellPreparation = prepStats;
  }

  /**
   * Get spell UUIDs for the class
   * @param {Item5e} classItem - The class item
   * @returns {Promise<Set<string>>} - Set of spell UUIDs or null
   * @private
   */
  async _getSpellUuids(classItem) {
    log(3, `Getting spell list for ${classItem.name}`);
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    return await discoveryUtils.getClassSpellList(className, classUuid);
  }

  /**
   * Set an error state
   * @param {string} message - The error message
   * @private
   */
  _setErrorState(message) {
    this.hasError = true;
    this.errorMessage = message;
    this.isLoading = false;
  }

  /**
   * Sort spells in all spell levels
   * @param {Array} spellLevels - Array of spell level data
   * @private
   */
  _sortAllSpellLevels(spellLevels) {
    const sortBy = this._getFilterState().sortBy || 'level';
    for (const level of spellLevels) {
      level.spells = this._sortSpells(level.spells, sortBy);
    }
  }

  /**
   * Calculate preparation statistics for the spell levels
   * @param {Array} spellLevels - Array of spell level data
   * @param {Item5e} classItem - The spellcasting class item
   * @returns {Object} Preparation statistics
   * @private
   */
  _calculatePreparationStats(spellLevels, classItem) {
    let preparedCount = 0;
    let maxPrepared = 0;

    if (classItem) {
      const spellcastingAbility = classItem.system.spellcasting?.ability;
      if (spellcastingAbility) {
        const abilityMod = this.actor.system.abilities[spellcastingAbility]?.mod || 0;
        const classLevel = classItem.system.levels || this.actor.system.details.level;
        maxPrepared = Math.max(1, classLevel + abilityMod);
      }
    }

    for (const level of spellLevels) {
      for (const spell of level.spells) {
        if (spell.preparation.prepared && !spell.preparation.alwaysPrepared) {
          preparedCount++;
        }
      }
    }

    return {
      current: preparedCount,
      maximum: maxPrepared
    };
  }

  /**
   * Enrich spell data with icons and formatted details
   * @param {Array} spellLevels - Array of spell level data
   * @returns {Promise<void>}
   * @private
   */
  async _enrichSpellData(spellLevels) {
    for (const level of spellLevels) {
      let failedUUIDs = [];
      for (const spell of level.spells) {
        try {
          // Use the shared helper for icon enrichment
          spell.enrichedIcon = await formattingUtils.createEnrichedSpellIcon(spell);
          spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
        } catch (error) {
          failedUUIDs.push(spell);
          log(2, `Failed to enrich spell: ${spell.name}`, error);
        }
      }
      if (failedUUIDs.length > 0) {
        log(2, 'Some spells failed UUID check:', failedUUIDs);
      }
    }
  }

  /**
   * Fetch spell data with caching
   * @param {Set<string>} spellUuids - Set of spell UUIDs
   * @param {number} maxSpellLevel - Maximum spell level to include
   * @returns {Promise<Array>} - Array of spell documents
   * @private
   */
  async _fetchSpellDataWithCache(spellUuids, maxSpellLevel) {
    const start = performance.now();
    const timing = (label) => log(3, `${label}: ${(performance.now() - start).toFixed(2)}ms`);

    // Create a cache key based on actor ID and spell list
    const cacheKey = `${this.actor.id}-${maxSpellLevel}`;
    timing('Created cache key');

    // Check if we have cached data for this actor
    const cachedData = MODULE.CACHE.spellData[cacheKey];
    const cacheTime = MODULE.CACHE.spellDataTime[cacheKey] || 0;
    timing('Checked cache presence');

    // Use cache if available and less than 5 minutes old
    if (cachedData && Date.now() - cacheTime < 300000) {
      log(3, `Using cached spell data for ${this.actor.name} (${cachedData.length} spells)`);
      timing('Using cached data');
      return cachedData;
    }

    // Otherwise fetch fresh data
    log(3, `Fetching fresh spell data for ${this.actor.name}`);
    timing('Starting fetch of fresh spell data');

    const data = await actorSpellUtils.fetchSpellDocuments(spellUuids, maxSpellLevel);
    timing('Fetched fresh spell data');

    // Cache the results
    MODULE.CACHE.spellData[cacheKey] = data;
    MODULE.CACHE.spellDataTime[cacheKey] = Date.now();
    timing('Cached fresh spell data');

    return data;
  }

  /* -------------------------------------------- */
  /*  Filter Management                           */
  /* -------------------------------------------- */

  /**
   * Apply all current filters to the spell list
   * @private
   */
  _applyFilters() {
    try {
      const filters = this._getFilterState();
      log(3, 'Applying filters');

      const spellItems = this.element.querySelectorAll('.spell-item');
      let visibleCount = 0;

      // Create a map to track visible spells per level
      const levelVisibilityMap = new Map();

      for (const item of spellItems) {
        // Extract basic spell metadata
        const nameEl = item.querySelector('.spell-name');
        const name = nameEl?.textContent.toLowerCase() || '';
        const isPrepared = item.classList.contains('prepared-spell');
        const level = item.dataset.spellLevel || '';
        const school = item.dataset.spellSchool || '';

        // Extract filter data from dataset
        const castingTimeType = item.dataset.castingTimeType || '';
        const castingTimeValue = item.dataset.castingTimeValue || '';
        const rangeUnits = item.dataset.rangeUnits || '';
        const damageTypes = (item.dataset.damageTypes || '').split(',');
        const isRitual = item.dataset.ritual === 'true';
        const isConcentration = item.dataset.concentration === 'true';
        const requiresSave = item.dataset.requiresSave === 'true';
        const conditions = (item.dataset.conditions || '').split(',');

        // Check if this is a granted or always prepared spell
        const isGranted = !!item.querySelector('.granted-spell-tag');
        const isAlwaysPrepared = !!item.querySelector('.always-prepared-tag');
        const isCountable = !isGranted && !isAlwaysPrepared;

        // Check all filter conditions
        let visible = true;

        // Text search
        if (filters.name && !name.includes(filters.name.toLowerCase())) {
          visible = false;
        }

        // Level filter
        if (filters.level && level !== filters.level) {
          visible = false;
        }

        // School filter
        if (filters.school && school !== filters.school) {
          visible = false;
        }

        // Casting Time filter
        if (filters.castingTime) {
          const [filterType, filterValue] = filters.castingTime.split(':');
          const itemType = castingTimeType;
          const itemValue = castingTimeValue === '' || castingTimeValue === null ? '1' : castingTimeValue;

          // Check if types match, and if values match (accounting for null = 1)
          if (itemType !== filterType || itemValue !== filterValue) {
            visible = false;
          }
        }

        // Range filter
        if ((filters.minRange || filters.maxRange) && rangeUnits) {
          const rangeValue = parseInt(item.dataset.rangeValue || '0', 10);
          const convertedRange = filterUtils.convertRangeToStandardUnit(rangeUnits, rangeValue);

          const minRange = filters.minRange ? parseInt(filters.minRange, 10) : 0;
          const maxRange = filters.maxRange ? parseInt(filters.maxRange, 10) : Infinity;

          if (convertedRange < minRange || convertedRange > maxRange) {
            visible = false;
          }
        }

        // Damage Type filter
        if (filters.damageType && !damageTypes.includes(filters.damageType)) {
          visible = false;
        }

        // Condition filter
        if (filters.condition && !conditions.includes(filters.condition)) {
          visible = false;
        }

        // Requires Save filter
        if (filters.requiresSave) {
          if (filters.requiresSave === 'true' && !requiresSave) {
            visible = false;
          } else if (filters.requiresSave === 'false' && requiresSave) {
            visible = false;
          }
        }

        // Prepared only
        if (filters.prepared && !isPrepared) {
          visible = false;
        }

        // Ritual only
        if (filters.ritual && !isRitual) {
          visible = false;
        }

        // Concentration filter
        if (filters.concentration) {
          const spellConcentration = isConcentration;
          if (filters.concentration === 'true' && !spellConcentration) {
            visible = false;
          } else if (filters.concentration === 'false' && spellConcentration) {
            visible = false;
          }
        }

        // Update visibility
        item.style.display = visible ? '' : 'none';
        if (visible) {
          visibleCount++;

          // Update level visibility tracker
          if (!levelVisibilityMap.has(level)) {
            levelVisibilityMap.set(level, { total: 0, visible: 0, prepared: 0, countable: 0, countablePrepared: 0 });
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

      // Show/hide no results message
      const noResults = this.element.querySelector('.no-filter-results');
      if (noResults) {
        noResults.style.display = visibleCount > 0 ? 'none' : 'block';
      }

      // Update level container visibility and counts
      this._updateLevelContainers(levelVisibilityMap);
    } catch (error) {
      log(1, 'Error applying filters:', error);
    }
  }

  /**
   * Apply sorting to the current spell lists
   * @param {string} sortBy Sorting criteria
   * @private
   */
  _applySorting(sortBy) {
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
              return 0; // Keep current order
          }
        });

        // Re-append the sorted items
        for (const item of items) {
          list.appendChild(item);
        }
      }
    } catch (error) {
      log(1, 'Error applying sorting:', error);
    }
  }

  /**
   * Sort spell list by specified criteria
   * @param {Array} spells Array of spells to sort
   * @param {string} sortBy Sorting criteria
   * @returns {Array} Sorted array of spells
   * @private
   */
  _sortSpells(spells, sortBy) {
    return [...spells].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);

        case 'school':
          const schoolA = a.system.school || '';
          const schoolB = b.system.school || '';
          return schoolA.localeCompare(schoolB) || a.name.localeCompare(b.name);

        case 'prepared':
          // Sort prepared spells first, then by name
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
   * Prepare all filters for display based on configuration
   * @returns {Array} Array of organized filters for the template
   * @private
   */
  _prepareFilters() {
    // Get the filter configuration
    let filterConfig = game.settings.get(MODULE.ID, 'filterConfiguration');
    if (!Array.isArray(filterConfig) || !filterConfig.length) {
      filterConfig = DEFAULT_FILTER_CONFIG;
    }

    // Sort by order property and filter for enabled only
    const sortedFilters = filterConfig.filter((f) => f.enabled).sort((a, b) => a.order - b.order);

    // Get current filter state
    const filterState = this._getFilterState();

    // Process each filter to add template-specific properties
    return sortedFilters.map((filter) => {
      const result = {
        id: filter.id,
        type: filter.type,
        name: `filter-${filter.id}`,
        label: game.i18n.localize(filter.label)
      };

      // Add type-specific properties
      switch (filter.type) {
        case 'search':
          result.value = filterState[filter.id] || '';
          break;

        case 'dropdown':
          result.options = filterUtils.getOptionsForFilter(filter.id, filterState, this.spellLevels);
          break;

        case 'checkbox':
          result.checked = filterState[filter.id] || false;
          break;

        case 'range':
          result.minName = `filter-min-range`;
          result.maxName = `filter-max-range`;
          result.minValue = filterState.minRange || '';
          result.maxValue = filterState.maxRange || '';
          result.unit = game.settings.get(MODULE.ID, 'distanceUnit');
          break;
      }

      return result;
    });
  }

  /**
   * Get the current filter state from form inputs or defaults
   * @returns {Object} The current filter state
   * @private
   */
  _getFilterState() {
    if (!this.element) {
      return filterUtils.getDefaultFilterState();
    }

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

  /* -------------------------------------------- */
  /*  Event Listeners                             */
  /* -------------------------------------------- */

  /**
   * Set up event listeners for preparation checkboxes
   * @private
   */
  _setupPreparationListeners() {
    // Add listeners to preparation checkboxes
    const prepCheckboxes = this.element.querySelectorAll('input[type="checkbox"][data-uuid]:not([disabled])');
    prepCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        // Update the prepared-spell class based on checkbox state
        const spellItem = event.target.closest('.spell-item');
        if (spellItem) {
          if (event.target.checked) {
            spellItem.classList.add('prepared-spell');
          } else {
            spellItem.classList.remove('prepared-spell');
          }
        }
        this._updateSpellPreparationTracking();
        this._updateSpellCounts();
      });
    });
  }

  /**
   * Update the spell preparation tracking and manage checkbox states
   * @private
   */
  _updateSpellPreparationTracking() {
    const preparedCheckboxes = this.element.querySelectorAll('input[type="checkbox"][data-uuid]:not([disabled])');
    const countDisplay = this.element.querySelector('.spell-prep-tracking');

    if (!countDisplay) return;

    // Count checked non-disabled checkboxes (excludes "always prepared" spells)
    let preparedCount = 0;
    preparedCheckboxes.forEach((checkbox) => {
      if (checkbox.checked) preparedCount++;
    });

    // Get the maximum from the context
    const maxPrepared = this?.spellPreparation?.maximum || 0;

    // Update the counter text using the span elements
    const currentCountEl = countDisplay.querySelector('.current-count');
    const maxCountEl = countDisplay.querySelector('.max-count');

    if (currentCountEl) currentCountEl.textContent = preparedCount;
    if (maxCountEl) maxCountEl.textContent = maxPrepared;

    // Add visual indicator when at/over max
    if (preparedCount >= maxPrepared) {
      countDisplay.classList.add('at-max');
    } else {
      countDisplay.classList.remove('at-max');
    }

    // Only apply limits if we have a valid maximum (avoid limiting when max is 0)
    if (maxPrepared > 0) {
      // Disable unchecked checkboxes when at maximum
      if (preparedCount >= maxPrepared) {
        // Add class to form to indicate we're at max spells
        this.element.classList.add('at-max-spells');

        preparedCheckboxes.forEach((checkbox) => {
          if (!checkbox.checked) {
            checkbox.disabled = true;
            // Add class to parent spell item for styling
            checkbox.closest('.spell-item')?.classList.add('max-prepared');
          }
        });
      } else {
        // Remove max spells class
        this.element.classList.remove('at-max-spells');

        // Re-enable all preparation checkboxes
        preparedCheckboxes.forEach((checkbox) => {
          checkbox.disabled = false;
          checkbox.closest('.spell-item')?.classList.remove('max-prepared');
        });
      }
    }
  }
  /**
   * Set up event listeners for all filter elements
   * @private
   */
  _setupFilterListeners() {
    // Text search (already handled separately, keeping for reference)
    const searchInput = this.element.querySelector('input[name="filter-name"]');
    if (searchInput) {
      searchInput.addEventListener('input', this._onSearchInput.bind(this));
    }

    // Add listeners to all dropdown selects (both filters and sort)
    const dropdowns = this.element.querySelectorAll('select[name^="filter-"], select[name="sort-by"]');
    dropdowns.forEach((dropdown) => {
      dropdown.addEventListener('change', () => {
        this._applyFilters();

        // Handle special case for sort-by
        if (dropdown.name === 'sort-by') {
          this._applySorting(dropdown.value);
        }
      });
    });

    // Add listeners to checkbox filters
    const checkboxes = this.element.querySelectorAll('input[type="checkbox"][name^="filter-"]');
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        this._applyFilters();
      });
    });

    // Add listeners to range input filters
    const rangeInputs = this.element.querySelectorAll('input[type="number"][name^="filter-"]');
    rangeInputs.forEach((input) => {
      input.addEventListener('input', () => {
        // Debounce filter application similar to search input
        clearTimeout(this._rangeTimer);
        this._rangeTimer = setTimeout(() => {
          this._applyFilters();
        }, 200); // 200ms debounce
      });
    });
  }

  /**
   * Handler for search input to ensure it's properly bound to this instance
   * @param {Event} _event - The input event
   * @private
   */
  _onSearchInput(_event) {
    if (!this._debouncedApplyFilters) {
      this._debouncedApplyFilters = foundry.utils.debounce(() => {
        this._applyFilters();
      }, 200);
    }
    this._debouncedApplyFilters();
  }

  /**
   * Position the footer in the appropriate container based on sidebar state
   * @private
   */
  _positionFooter() {
    try {
      const footer = this.element.querySelector('footer');
      if (!footer) return;

      const isSidebarCollapsed = this.element.classList.contains('sidebar-collapsed');
      const sidebarFooterContainer = this.element.querySelector('.sidebar-footer-container');
      const collapsedFooter = this.element.querySelector('.collapsed-footer');

      if (isSidebarCollapsed && collapsedFooter) {
        collapsedFooter.appendChild(footer);
        collapsedFooter.classList.remove('hidden');
      } else if (sidebarFooterContainer) {
        sidebarFooterContainer.appendChild(footer);
        if (collapsedFooter) collapsedFooter.classList.add('hidden');
      }
    } catch (error) {
      log(1, 'Error positioning footer:', error);
    }
  }

  /**
   * Apply saved collapsed states after rendering
   * @private
   */
  _applyCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'collapsedSpellLevels') || [];

    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) {
        levelContainer.classList.add('collapsed');
      }
    }
  }

  /**
   * Update the spell counts for each level
   * @private
   */
  _updateSpellCounts() {
    const spellLevels = this.element.querySelectorAll('.spell-level');

    spellLevels.forEach((levelContainer) => {
      const spellItems = levelContainer.querySelectorAll('.spell-item');

      // Count only spells that are not granted or always prepared
      const countableSpells = Array.from(spellItems).filter((item) => !item.querySelector('.granted-spell-tag') && !item.querySelector('.always-prepared-tag'));

      // Count prepared spells among the countable ones
      const preparedCount = countableSpells.filter((item) => item.classList.contains('prepared-spell')).length;

      const totalAvailable = countableSpells.length;

      // Update the count display
      const countDisplay = levelContainer.querySelector('.spell-count');
      if (countDisplay && totalAvailable > 0) {
        countDisplay.textContent = `(${preparedCount}/${totalAvailable})`;
      } else if (countDisplay) {
        countDisplay.textContent = '';
      }
    });
  }

  /**
   * Update visibility of spell level containers based on filtered content
   * @param {Map} levelVisibilityMap - Map of level IDs to visibility stats
   * @private
   */
  _updateLevelContainers(levelVisibilityMap) {
    const levelContainers = this.element.querySelectorAll('.spell-level');
    for (const container of levelContainers) {
      const levelId = container.dataset.level;
      const levelStats = levelVisibilityMap.get(levelId) || { visible: 0, prepared: 0, countable: 0, countablePrepared: 0 };

      // Update visibility of the container
      container.style.display = levelStats.visible > 0 ? '' : 'none';

      // Update the count display - use countable numbers instead of all visible
      const countDisplay = container.querySelector('.spell-count');
      if (countDisplay && levelStats.countable > 0) {
        countDisplay.textContent = `(${levelStats.countablePrepared}/${levelStats.countable})`;
      } else if (countDisplay) {
        countDisplay.textContent = '';
      }
    }
  }

  /* -------------------------------------------- */
  /*  Static Methods                              */
  /* -------------------------------------------- */

  /**
   * Handle sidebar toggle action
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static toggleSidebar(event, _form) {
    log(3, 'toggleSidebar action triggered');

    const isCollapsing = !this.element.classList.contains('sidebar-collapsed');
    this.element.classList.toggle('sidebar-collapsed');

    // Rotate the caret icon
    const caretIcon = event.currentTarget.querySelector('i');
    if (caretIcon) {
      caretIcon.style.transform = isCollapsing ? 'rotate(180deg)' : 'rotate(0)';
    }

    // Reposition footer
    this._positionFooter();

    // Store user preference
    game.user.setFlag(MODULE.ID, 'sidebarCollapsed', isCollapsing);

    log(3, `Sidebar ${isCollapsing ? 'collapsed' : 'expanded'}`);
  }

  /**
   * Handle filter changes
   * @param {Event} _event - The change event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static filterSpells(_event, _form) {
    log(3, 'filterSpells action triggered');
    this._applyFilters();
  }

  /**
   * Handle sorting selection
   * @param {Event} event - The change event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static sortSpells(event, _form) {
    log(3, 'sortSpells action triggered');
    const sortBy = event.target.value;
    this._applySorting(sortBy);
  }

  /**
   * Handle form reset action
   * @param {Event} _event - The reset event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleReset(_event, _form) {
    log(3, 'handleReset action triggered');

    // Give the browser time to reset the form elements
    setTimeout(() => {
      // Update all spell items to match their checkbox state
      const spellItems = this.element.querySelectorAll('.spell-item');
      spellItems.forEach((item) => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) {
          item.classList.remove('prepared-spell');
        }
      });

      // Reapply filters to ensure consistency
      this._applyFilters();

      // Update preparation tracking
      this._updateSpellPreparationTracking();
    }, 0);
  }

  /**
   * Handle spell level toggle action
   * @param {Event} _event - The click event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static toggleSpellLevel(_event, form) {
    // Find the parent spell-level container
    const levelContainer = form.parentElement;

    if (!levelContainer || !levelContainer.classList.contains('spell-level')) {
      return;
    }

    const levelId = levelContainer.dataset.level;

    // Toggle collapsed state
    levelContainer.classList.toggle('collapsed');

    // Save state to user flags
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'collapsedSpellLevels') || [];
    const isCollapsed = levelContainer.classList.contains('collapsed');

    if (isCollapsed && !collapsedLevels.includes(levelId)) {
      collapsedLevels.push(levelId);
    } else if (!isCollapsed && collapsedLevels.includes(levelId)) {
      collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
    }

    game.user.setFlag(MODULE.ID, 'collapsedSpellLevels', collapsedLevels);
  }

  /**
   * Show dialog to configure filters
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static configureFilters(_event, _form) {
    const filterConfig = new PlayerFilterConfiguration(this);
    filterConfig.render(true);
  }

  /**
   * Handle form submission to save prepared spells
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<Actor|null>} - The updated actor or null if failed
   */
  static async formHandler(_event, form, formData) {
    log(3, 'Processing form submission', { formData: formData.object });
    try {
      const actor = this.actor;
      if (!actor) {
        log(1, 'No actor found');
        return null;
      }

      // Extract prepared spells from form data - this contains the checked boxes
      const spellPreparationData = formData.object.spellPreparation || {};

      // Gather all spell information from the form
      const spellData = {};

      // Process each input in the form to gather spell data
      const checkboxes = form.querySelectorAll('input[type="checkbox"][data-uuid]');
      for (const checkbox of checkboxes) {
        const uuid = checkbox.dataset.uuid;
        const name = checkbox.dataset.name;
        const wasPrepared = checkbox.dataset.wasPrepared === 'true';

        // Check if this spell is prepared in the form data
        // Look directly at the checkbox's checked state as a fallback
        const isPrepared = checkbox.disabled ? wasPrepared : !!spellPreparationData[uuid] || checkbox.checked;

        log(3, `Processing spell ${name} preparation status`);

        spellData[uuid] = {
          name,
          wasPrepared,
          isPrepared,
          // This helps identify disabled checkboxes (always prepared spells)
          isAlwaysPrepared: checkbox.disabled
        };
      }

      // Save the processed spell data to actor
      await preparationUtils.saveActorPreparedSpells(actor, spellData);

      ui.notifications.info(game.i18n.format('SPELLBOOK.Notifications.SpellsUpdated', { name: actor.name }));

      // Re-render any open character sheets
      if (actor.sheet.rendered) {
        actor.sheet.render(true);
      }

      return actor;
    } catch (error) {
      log(1, 'Error handling form submission:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Notifications.UpdateFailed'));
      return null;
    }
  }
}
