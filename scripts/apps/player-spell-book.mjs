import { DEFAULT_FILTER_CONFIG, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
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
      icon: 'fas fa-book-open',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: {
      height: '800',
      width: '600',
      top: '75'
    }
  };

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.PLAYER.MAIN, templates: [TEMPLATES.PLAYER.SIDEBAR, TEMPLATES.PLAYER.SPELL_LIST] },
    footer: { template: TEMPLATES.PLAYER.FOOTER }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /** The actor this spell book is for */
  actor = null;

  /** Loading state */
  isLoading = true;

  /** Spell levels data */
  spellLevels = [];

  /** Class name for spellcasting */
  className = '';

  /** Spell preparation statistics */
  spellPreparation = { current: 0, maximum: 0 };

  /** Window title getter */
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
   * Prepare the application context data
   * @override
   */
  async _prepareContext(options) {
    // Create basic context with loading state
    const context = this._createBaseContext();

    // Skip detailed preparation if we're still loading
    if (this.isLoading) {
      return context;
    }

    context.spellLevels = this.spellLevels;
    context.filters = this._prepareFilters();

    return context;
  }

  /**
   * Creates the base context object with minimal information
   * @returns {Object} The base context
   * @private
   */
  _createBaseContext() {
    // Get filter configuration
    let filterConfig = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
    if (!Array.isArray(filterConfig) || !filterConfig.length) {
      filterConfig = DEFAULT_FILTER_CONFIG;
    }

    // Create empty filters structure for loading state
    const emptyFilters = {
      search: null,
      dropdowns: [],
      checkboxes: [],
      range: null
    };

    return {
      actor: this.actor,
      isLoading: this.isLoading,
      spellLevels: this.spellLevels || [],
      className: this.className || '',
      filters: this.isLoading ? emptyFilters : this._getFilterState(),
      spellSchools: CONFIG.DND5E.spellSchools,
      buttons: [
        {
          type: 'submit',
          icon: 'fas fa-save',
          label: 'SPELLBOOK.UI.Save',
          cssClass: 'submit-button'
        },
        {
          type: 'reset',
          action: 'reset',
          icon: 'fas fa-undo',
          label: 'SPELLBOOK.UI.Reset',
          cssClass: 'reset-button'
        }
      ],
      actorId: this.actor.id,
      TEMPLATES: TEMPLATES,
      spellPreparation: this.spellPreparation || { current: 0, maximum: 0 }
    };
  }

  /**
   * Sets up the form after rendering
   * @override
   */
  _onRender(context, options) {
    super._onRender?.(context, options);

    try {
      // Set sidebar state based on user preference
      this._setSidebarState();

      if (this.isLoading) {
        this.element.classList.add('loading');
        this._disableInputsWhileLoading();
        this._positionFooter();

        // Start loading data
        this._loadSpellData();
        return;
      } else {
        this.element.classList.remove('loading');
      }

      // Set up UI elements
      this._positionFooter();
      this._setupFilterListeners();
      this._setupPreparationListeners();
      this._applyCollapsedLevels();
      this._updateSpellCounts();
      this._applyFilters();
      this._updateSpellPreparationTracking();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
  }

  /**
   * Set sidebar state based on user preference
   * @private
   */
  _setSidebarState() {
    const sidebarCollapsed = game.user.getFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED);
    if (sidebarCollapsed) {
      this.element.classList.add('sidebar-collapsed');
    }
  }

  /**
   * Disable inputs while loading data
   * @private
   */
  _disableInputsWhileLoading() {
    const inputs = this.element.querySelectorAll('.spell-filters input, .spell-filters select, .spell-filters button');
    inputs.forEach((input) => {
      input.disabled = true;
    });
  }

  /* -------------------------------------------- */
  /*  Data Loading                                */
  /* -------------------------------------------- */

  /**
   * Load all spell data for the actor
   * @private
   */
  async _loadSpellData() {
    try {
      log(3, `Loading spell data for ${this.actor.name}`);

      const classItem = await this._loadSpellcastingClass();
      if (!classItem) return;

      const spellList = await this._loadSpellList(classItem);
      if (!spellList || !spellList.size) return;

      const spellItems = await this._loadSpellItems(spellList, classItem);
      if (!spellItems || !spellItems.length) return;

      await this._processAndOrganizeSpells(spellItems, classItem);

      log(3, `Completed loading spell data for ${this.actor.name}`);
    } catch (error) {
      log(1, 'Error loading spell data:', error);
    } finally {
      this.isLoading = false;
      this.render(false);
    }
  }

  /**
   * Find the actor's spellcasting class
   * @returns {Promise<Item5e|null>} The spellcasting class
   * @private
   */
  async _loadSpellcastingClass() {
    try {
      const classItem = discoveryUtils.findSpellcastingClass(this.actor);
      if (!classItem) {
        return null;
      }

      log(3, `Found spellcasting class: ${classItem.name}`);
      return classItem;
    } catch (error) {
      log(1, 'Error finding spellcasting class:', error);
      return null;
    }
  }

  /**
   * Load spell list for the class
   * @param {Item5e} classItem - The class item
   * @returns {Promise<Set<string>>} Set of spell UUIDs
   * @private
   */
  async _loadSpellList(classItem) {
    try {
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;

      log(3, `Loading spell list for ${className}`);
      const spellUuids = await discoveryUtils.getClassSpellList(className, classUuid);

      if (!spellUuids || !spellUuids.size) {
        return new Set();
      }

      log(3, `Found ${spellUuids.size} spells for class ${className}`);
      return spellUuids;
    } catch (error) {
      log(1, 'Error loading spell list:', error);
      return new Set();
    }
  }

  /**
   * Load spell items from UUIDs
   * @param {Set<string>} spellUuids - Set of spell UUIDs
   * @param {Item5e} classItem - The class item
   * @returns {Promise<Array>} Array of spell items
   * @private
   */
  async _loadSpellItems(spellUuids, classItem) {
    try {
      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);

      log(3, `Loading spells up to level ${maxSpellLevel} for ${this.actor.name}`);
      const spellItems = await actorSpellUtils.fetchSpellDocuments(spellUuids, maxSpellLevel);

      if (!spellItems || !spellItems.length) {
        return [];
      }

      log(3, `Loaded ${spellItems.length} spell items`);
      return spellItems;
    } catch (error) {
      log(1, 'Error loading spell items:', error);
      return [];
    }
  }

  /**
   * Process and organize spell data
   * @param {Array} spellItems - Array of spell items
   * @param {Item5e} classItem - The class item
   * @returns {Promise<void>}
   * @private
   */
  async _processAndOrganizeSpells(spellItems, classItem) {
    try {
      // Organize spells by level
      const spellLevels = await actorSpellUtils.organizeSpellsByLevel(spellItems, this.actor);
      log(3, `Organized spells into ${spellLevels.length} levels`);

      // Sort spells within each level
      const sortBy = this._getFilterState().sortBy || 'level';
      for (const level of spellLevels) {
        level.spells = this._sortSpells(level.spells, sortBy);
      }

      // Enrich spell data with icons and details
      await this._enrichSpellData(spellLevels);

      // Calculate preparation stats
      const prepStats = this._calculatePreparationStats(spellLevels, classItem);

      // Update state with processed data
      this.spellLevels = spellLevels;
      this.className = classItem.name;
      this.spellPreparation = prepStats;

      log(3, `Completed processing spell data for ${this.actor.name}`);
    } catch (error) {
      log(1, 'Error processing spell data:', error);
    }
  }

  /**
   * Enrich spell data with icons and formatted details
   * @param {Array} spellLevels - Array of spell level data
   * @returns {Promise<void>}
   * @private
   */
  async _enrichSpellData(spellLevels) {
    try {
      log(3, 'Enriching spell data with icons and details');
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          try {
            spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
            spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
          } catch (error) {
            log(1, `Failed to enrich spell: ${spell.name}`, error);
          }
        }
      }
    } catch (error) {
      log(1, 'Error enriching spell data:', error);
    }
  }

  /**
   * Calculate preparation statistics
   * @param {Array} spellLevels - Array of spell level data
   * @param {Item5e} classItem - The spellcasting class
   * @returns {Object} Preparation statistics
   * @private
   */
  _calculatePreparationStats(spellLevels, classItem) {
    try {
      let preparedCount = 0;
      let maxPrepared = 0;

      // Calculate maximum prepared spells
      if (classItem) {
        const spellcastingAbility = classItem.system.spellcasting?.ability;
        if (spellcastingAbility) {
          const abilityMod = this.actor.system.abilities[spellcastingAbility]?.mod || 0;
          const classLevel = classItem.system.levels || this.actor.system.details.level;
          maxPrepared = Math.max(1, classLevel + abilityMod);
        }
      }

      // Count prepared spells
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
    } catch (error) {
      log(1, 'Error calculating preparation stats:', error);
      return { current: 0, maximum: 0 };
    }
  }

  /* -------------------------------------------- */
  /*  Filter Management                           */
  /* -------------------------------------------- */

  /**
   * Get the current filter state
   * @returns {Object} Current filter state
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

  /**
   * Prepare filters for display
   * @returns {Array} Organized filters for the template
   * @private
   */
  _prepareFilters() {
    try {
      // Get the filter configuration
      let filterConfig = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
      if (!Array.isArray(filterConfig) || !filterConfig.length) {
        filterConfig = DEFAULT_FILTER_CONFIG;
      }

      // Get enabled filters in the right order
      const sortedFilters = filterConfig.filter((f) => f.enabled).sort((a, b) => a.order - b.order);

      const filterState = this._getFilterState();

      // Process each filter
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
            result.unit = game.settings.get(MODULE.ID, SETTINGS.DISTANCE_UNIT);
            break;
        }

        return result;
      });
    } catch (error) {
      log(1, 'Error preparing filters:', error);
      return [];
    }
  }

  /**
   * Apply all current filters to the spell list
   * @private
   */
  _applyFilters() {
    try {
      const filters = this._getFilterState();
      log(3, 'Applying filters to spell list');

      const spellItems = this.element.querySelectorAll('.spell-item');
      let visibleCount = 0;

      // Track visible spells per level
      const levelVisibilityMap = new Map();

      for (const item of spellItems) {
        // Get basic spell metadata
        const nameEl = item.querySelector('.spell-name');
        const name = nameEl?.textContent.toLowerCase() || '';
        const isPrepared = item.classList.contains('prepared-spell');
        const level = item.dataset.spellLevel || '';
        const school = item.dataset.spellSchool || '';

        // Get filter data from dataset
        const castingTimeType = item.dataset.castingTimeType || '';
        const castingTimeValue = item.dataset.castingTimeValue || '';
        const rangeUnits = item.dataset.rangeUnits || '';
        const damageTypes = (item.dataset.damageTypes || '').split(',');
        const isRitual = item.dataset.ritual === 'true';
        const isConcentration = item.dataset.concentration === 'true';
        const requiresSave = item.dataset.requiresSave === 'true';
        const conditions = (item.dataset.conditions || '').split(',');

        // Special preparation statuses
        const isGranted = !!item.querySelector('.granted-spell-tag');
        const isAlwaysPrepared = !!item.querySelector('.always-prepared-tag');
        const isCountable = !isGranted && !isAlwaysPrepared;

        // Apply each filter as a separate condition
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

        // Update visibility
        item.style.display = visible ? '' : 'none';

        if (visible) {
          visibleCount++;

          // Update level visibility tracker
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

      // Show/hide no results message
      const noResults = this.element.querySelector('.no-filter-results');
      if (noResults) {
        noResults.style.display = visibleCount > 0 ? 'none' : 'block';
      }

      // Update level container visibility and counts
      this._updateLevelContainers(levelVisibilityMap);

      log(3, `Filter applied: ${visibleCount} spells visible`);
    } catch (error) {
      log(1, 'Error applying filters:', error);
    }
  }

  /**
   * Check if a spell should be visible based on filters
   * @param {Object} filters - The filter state
   * @param {Object} spell - The spell properties
   * @returns {boolean} Whether the spell should be visible
   * @private
   */
  _checkSpellVisibility(filters, spell) {
    // Text search
    if (filters.name && !spell.name.includes(filters.name.toLowerCase())) {
      return false;
    }

    // Level filter
    if (filters.level && spell.level !== filters.level) {
      return false;
    }

    // School filter
    if (filters.school && spell.school !== filters.school) {
      return false;
    }

    // Casting Time filter
    if (filters.castingTime) {
      const [filterType, filterValue] = filters.castingTime.split(':');
      const itemType = spell.castingTimeType;
      const itemValue = spell.castingTimeValue === '' || spell.castingTimeValue === null ? '1' : spell.castingTimeValue;

      if (itemType !== filterType || itemValue !== filterValue) {
        return false;
      }
    }

    // Range filter
    if ((filters.minRange || filters.maxRange) && spell.rangeUnits) {
      const rangeValue = parseInt(spell.rangeValue, 10);
      const convertedRange = filterUtils.convertRangeToStandardUnit(spell.rangeUnits, rangeValue);

      const minRange = filters.minRange ? parseInt(filters.minRange, 10) : 0;
      const maxRange = filters.maxRange ? parseInt(filters.maxRange, 10) : Infinity;

      if (convertedRange < minRange || convertedRange > maxRange) {
        return false;
      }
    }

    // Damage Type filter
    if (filters.damageType && !spell.damageTypes.includes(filters.damageType)) {
      return false;
    }

    // Condition filter
    if (filters.condition && !spell.conditions.includes(filters.condition)) {
      return false;
    }

    // Requires Save filter
    if (filters.requiresSave) {
      if (filters.requiresSave === 'true' && !spell.requiresSave) {
        return false;
      } else if (filters.requiresSave === 'false' && spell.requiresSave) {
        return false;
      }
    }

    // Prepared only
    if (filters.prepared && !spell.isPrepared) {
      return false;
    }

    // Ritual only
    if (filters.ritual && !spell.isRitual) {
      return false;
    }

    // Concentration filter
    if (filters.concentration) {
      if (filters.concentration === 'true' && !spell.isConcentration) {
        return false;
      } else if (filters.concentration === 'false' && spell.isConcentration) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sort spells by specified criteria
   * @param {Array} spells - Array of spells to sort
   * @param {string} sortBy - Sorting criteria
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
   * Apply sorting to DOM elements
   * @param {string} sortBy - Sorting criteria
   * @private
   */
  _applySorting(sortBy) {
    try {
      log(3, `Applying sorting: ${sortBy}`);
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

        // Re-append sorted items
        for (const item of items) {
          list.appendChild(item);
        }
      }
    } catch (error) {
      log(1, 'Error applying sorting:', error);
    }
  }

  /**
   * Update visibility of spell level containers
   * @param {Map} levelVisibilityMap - Map of level IDs to visibility stats
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

        // Update visibility
        container.style.display = levelStats.visible > 0 ? '' : 'none';

        // Update count display
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

  /* -------------------------------------------- */
  /*  UI Management                               */
  /* -------------------------------------------- */

  /**
   * Set up event listeners for filter inputs
   * @private
   */
  _setupFilterListeners() {
    try {
      // Text search input
      const searchInput = this.element.querySelector('input[name="filter-name"]');
      if (searchInput) {
        searchInput.addEventListener('input', (event) => {
          clearTimeout(this._searchTimer);
          this._searchTimer = setTimeout(() => {
            this._applyFilters();
          }, 200);
        });
      }

      // Dropdown selects
      const dropdowns = this.element.querySelectorAll('select[name^="filter-"], select[name="sort-by"]');

      dropdowns.forEach((dropdown) => {
        dropdown.addEventListener('change', () => {
          this._applyFilters();

          // Special case for sort-by
          if (dropdown.name === 'sort-by') {
            this._applySorting(dropdown.value);
          }
        });
      });

      // Checkbox filters
      const checkboxes = this.element.querySelectorAll('input[type="checkbox"][name^="filter-"]');

      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          this._applyFilters();
        });
      });

      // Range inputs
      const rangeInputs = this.element.querySelectorAll('input[type="number"][name^="filter-"]');

      rangeInputs.forEach((input) => {
        input.addEventListener('input', () => {
          clearTimeout(this._rangeTimer);
          this._rangeTimer = setTimeout(() => {
            this._applyFilters();
          }, 200);
        });
      });
    } catch (error) {
      log(1, 'Error setting up filter listeners:', error);
    }
  }

  /**
   * Set up event listeners for preparation checkboxes
   * @private
   */
  _setupPreparationListeners() {
    try {
      // Find checkboxes that aren't disabled
      const prepCheckboxes = this.element.querySelectorAll('input[type="checkbox"][data-uuid]:not([disabled])');

      prepCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', (event) => {
          // Update UI class
          const spellItem = event.target.closest('.spell-item');
          if (spellItem) {
            if (event.target.checked) {
              spellItem.classList.add('prepared-spell');
            } else {
              spellItem.classList.remove('prepared-spell');
            }
          }

          // Update tracking and counts
          this._updateSpellPreparationTracking();
          this._updateSpellCounts();
        });
      });
    } catch (error) {
      log(1, 'Error setting up preparation listeners:', error);
    }
  }

  /**
   * Update the spell preparation tracking UI
   * @private
   */
  _updateSpellPreparationTracking() {
    try {
      const preparedCheckboxes = this.element.querySelectorAll('input[type="checkbox"][data-uuid]:not([disabled])');

      const countDisplay = this.element.querySelector('.spell-prep-tracking');
      if (!countDisplay) return;

      // Count checked non-disabled checkboxes
      let preparedCount = 0;
      preparedCheckboxes.forEach((checkbox) => {
        if (checkbox.checked) preparedCount++;
      });

      // Get maximum from context
      const maxPrepared = this?.spellPreparation?.maximum || 0;

      // Update counter elements
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

      // Only apply limits if we have a valid maximum
      if (maxPrepared > 0) {
        if (preparedCount >= maxPrepared) {
          // Add class to form
          this.element.classList.add('at-max-spells');

          // Disable unchecked checkboxes
          preparedCheckboxes.forEach((checkbox) => {
            if (!checkbox.checked) {
              checkbox.disabled = true;
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
    } catch (error) {
      log(1, 'Error updating spell preparation tracking:', error);
    }
  }

  /**
   * Update the spell counts for each level
   * @private
   */
  _updateSpellCounts() {
    try {
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
    } catch (error) {
      log(1, 'Error updating spell counts:', error);
    }
  }

  /**
   * Apply saved collapsed states after rendering
   * @private
   */
  _applyCollapsedLevels() {
    try {
      const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];

      for (const levelId of collapsedLevels) {
        const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);

        if (levelContainer) {
          levelContainer.classList.add('collapsed');
        }
      }
    } catch (error) {
      log(1, 'Error applying collapsed levels:', error);
    }
  }

  /**
   * Position the footer appropriately
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

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

  /**
   * Handle sidebar toggle action
   * @static
   */
  static toggleSidebar(event, _form) {
    try {
      log(3, 'Toggling sidebar');
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
      game.user.setFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED, isCollapsing);
    } catch (error) {
      log(1, 'Error toggling sidebar:', error);
    }
  }

  /**
   * Handle filter changes
   * @static
   */
  static filterSpells(_event, _form) {
    try {
      log(3, 'Filtering spells');
      this._applyFilters();
    } catch (error) {
      log(1, 'Error filtering spells:', error);
    }
  }

  /**
   * Handle sorting selection
   * @static
   */
  static sortSpells(event, _form) {
    try {
      log(3, 'Sorting spells');
      const sortBy = event.target.value;
      this._applySorting(sortBy);
    } catch (error) {
      log(1, 'Error sorting spells:', error);
    }
  }

  /**
   * Handle form reset action
   * @static
   */
  static handleReset(_event, _form) {
    try {
      log(3, 'Handling form reset');

      // Give the browser time to reset form elements
      setTimeout(() => {
        // Update spell items to match checkbox state
        const spellItems = this.element.querySelectorAll('.spell-item');
        spellItems.forEach((item) => {
          const checkbox = item.querySelector('input[type="checkbox"]');
          if (checkbox && !checkbox.checked) {
            item.classList.remove('prepared-spell');
          }
        });

        // Uncollapse all spell levels
        const collapsedLevels = this.element.querySelectorAll('.spell-level.collapsed');
        collapsedLevels.forEach((level) => {
          level.classList.remove('collapsed');

          // Update the aria-expanded attribute
          const heading = level.querySelector('.spell-level-heading');
          if (heading) {
            heading.setAttribute('aria-expanded', 'true');
          }
        });

        // Clear the collapsed levels in user flags
        game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS, []);

        // Reapply filters
        this._applyFilters();

        // Update preparation tracking
        this._updateSpellPreparationTracking();
      }, 0);
    } catch (error) {
      log(1, 'Error handling reset:', error);
    }
  }

  /**
   * Handle spell level toggle action
   * @static
   */
  static toggleSpellLevel(_event, form) {
    try {
      const levelContainer = form.parentElement;
      if (!levelContainer || !levelContainer.classList.contains('spell-level')) {
        return;
      }

      const levelId = levelContainer.dataset.level;

      // Toggle collapsed state
      levelContainer.classList.toggle('collapsed');

      // Save state to user flags
      const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
      const isCollapsed = levelContainer.classList.contains('collapsed');

      if (isCollapsed && !collapsedLevels.includes(levelId)) {
        collapsedLevels.push(levelId);
      } else if (!isCollapsed && collapsedLevels.includes(levelId)) {
        collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
      }

      game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS, collapsedLevels);
    } catch (error) {
      log(1, 'Error toggling spell level:', error);
    }
  }

  /**
   * Show dialog to configure filters
   * @static
   */
  static configureFilters(_event, _form) {
    try {
      log(3, 'Opening filter configuration');
      const filterConfig = new PlayerFilterConfiguration(this);
      filterConfig.render(true);
    } catch (error) {
      log(1, 'Error configuring filters:', error);
    }
  }

  /**
   * Handle form submission to save prepared spells
   * @static
   */
  static async formHandler(_event, form, formData) {
    try {
      log(3, 'Processing form submission');
      const actor = this.actor;
      if (!actor) {
        log(1, 'No actor found');
        return null;
      }

      // Extract prepared spells from form data
      const spellPreparationData = formData.object.spellPreparation || {};

      // Gather spell information
      const spellData = {};
      const checkboxes = form.querySelectorAll('input[type="checkbox"][data-uuid]');

      for (const checkbox of checkboxes) {
        const uuid = checkbox.dataset.uuid;
        const name = checkbox.dataset.name;
        const wasPrepared = checkbox.dataset.wasPrepared === 'true';

        // Get prepared status (handle disabled checkboxes)
        const isPrepared = checkbox.disabled ? wasPrepared : !!spellPreparationData[uuid] || checkbox.checked;

        spellData[uuid] = {
          name,
          wasPrepared,
          isPrepared,
          isAlwaysPrepared: checkbox.disabled
        };
      }

      // Save to actor
      await preparationUtils.saveActorPreparedSpells(actor, spellData);

      if (actor.sheet.rendered) {
        actor.sheet.render(true);
      }
      return actor;
    } catch (error) {
      log(1, 'Error handling form submission:', error);
      return null;
    }
  }
}
