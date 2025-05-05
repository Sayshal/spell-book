import { MODULE } from '../constants.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import * as managementUtils from '../helpers/spell-management.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for browsing, duplicating, and customizing spell lists from compendiums.
 * Allows GMs to maintain custom versions of spell lists for player characters.
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class GMSpellListManager extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `gm-spell-list-manager-${MODULE.ID}`,
    tag: 'form',
    classes: ['gm-spell-list-manager'],
    window: {
      title: 'GM Spell List Manager',
      icon: 'fas fa-magic',
      minimizable: true,
      resizable: true
    },
    actions: {
      selectSpellList: GMSpellListManager._onSelectSpellList,
      editSpellList: GMSpellListManager._onEditSpellList,
      addSpell: GMSpellListManager._onAddSpell,
      removeSpell: GMSpellListManager._onRemoveSpell,
      saveCustomList: GMSpellListManager._onSaveCustomList,
      deleteCustomList: GMSpellListManager._onDeleteCustomList,
      restoreOriginal: GMSpellListManager._onRestoreOriginal,
      configureSources: GMSpellListManager._onConfigureSources,
      clearName: GMSpellListManager._onClearName,
      setFilter: GMSpellListManager._onSetFilter,
      toggleCollapse: GMSpellListManager._onToggleCollapse,
      toggleSidebar: GMSpellListManager._onToggleSidebar,
      toggleSpellLevel: GMSpellListManager._onToggleSpellLevel,
      showDocumentation: GMSpellListManager._onShowDocumentation
    },
    form: {
      handler: GMSpellListManager.#formHandler,
      closeOnSubmit: false,
      submitOnChange: false
    },
    position: {
      height: 700,
      width: 1100
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER,
      templates: [MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER_LEFT, MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER_MIDDLE, MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER_RIGHT]
    },
    footer: { template: MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER_FOOTER }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * Batching configuration.
   * @type {Record<string, number>}
   */
  static BATCHING = {
    /**
     * The number of pixels before reaching the end of the scroll container to begin loading additional entries.
     */
    MARGIN: 50,

    /**
     * The number of entries to load per batch.
     */
    SIZE: 50
  };

  /**
   * The number of milliseconds to delay between user keypresses before executing a search.
   * @type {number}
   */
  static SEARCH_DELAY = 200;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Current filters selected.
   * @type {Object}
   */
  _filters = {
    name: '',
    level: '',
    school: '',
    source: '',
    castingTime: '',
    minRange: '',
    maxRange: '',
    damageType: '',
    condition: '',
    requiresSave: '',
    concentration: '',
    ritual: false
  };

  /**
   * Currently selected spell list
   * @type {Object|null}
   */
  _selectedSpellList = null;

  /**
   * Available spell lists
   * @type {Array}
   */
  #availableSpellLists = [];

  /**
   * Available spells for adding
   * @type {Promise<object[]>|object[]}
   */
  #availableSpells = [];

  /**
   * Editing state
   * @type {boolean}
   */
  _isEditing = false;

  /**
   * Loading state
   * @type {boolean}
   */
  #isLoading = true;

  /**
   * Error state
   * @type {boolean}
   */
  #hasError = false;

  /**
   * Error message
   * @type {string}
   */
  #errorMessage = '';

  /**
   * The index of the next result to render as part of batching.
   * @type {number}
   */
  #resultIndex = -1;

  /**
   * Whether rendering is currently throttled.
   * @type {boolean}
   */
  #renderThrottle = false;

  /**
   * The cached set of available sources to filter on.
   * @type {Record<string, string>}
   */
  #sources;

  /**
   * Cache for normalized UUIDs to improve comparison performance
   * @type {Map<string, Set<string>>}
   */
  _uuidCache = new Map();

  /**
   * The function to invoke when searching results by name.
   * @type {Function}
   */
  _debouncedSearch = foundry.utils.debounce(this._onSearchName.bind(this), this.constructor.SEARCH_DELAY);

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {object} options - ApplicationV2 options
   */
  constructor(options = {}) {
    super(options);
  }

  /* -------------------------------------------- */
  /*  Data Loading & Processing                   */
  /* -------------------------------------------- */

  /**
   * Load all required data
   * @returns {Promise<void>}
   * @private
   */
  async #loadData() {
    try {
      log(3, 'Loading spell lists for GM manager');

      // Get all available spell lists from compendiums
      this.#availableSpellLists = await managementUtils.findCompendiumSpellLists();

      // Sort by name for better usability
      this.#availableSpellLists.sort((a, b) => a.name.localeCompare(b.name));

      // Pre-fetch all available spells as well for column 3
      this.#availableSpells = await managementUtils.fetchAllCompendiumSpells();

      // Mark loading as complete
      this.#isLoading = false;
      this.render(false);
    } catch (error) {
      log(1, 'Error loading spell lists:', error);
      this.#hasError = true;
      this.#errorMessage = 'Failed to load spell lists.';
      this.#isLoading = false;
      this.render(false);
    }
  }

  /**
   * Apply filtering to available spells
   * @returns {Object} Filtered spells with additional metadata
   * @private
   */
  #filterAvailableSpells() {
    const selectedSpellUUIDs = this.#getNormalizedSelectedSpellUUIDs();

    // Apply filters to available spells
    const filteredSpells = this.#availableSpells.filter((spell) => {
      // Check if spell is already in the list using normalized UUID comparison
      if (selectedSpellUUIDs.size > 0) {
        // Direct UUID match
        if (selectedSpellUUIDs.has(spell.uuid)) return false;

        // ID part match
        const spellIdPart = spell.uuid.split('.').pop();
        if (selectedSpellUUIDs.has(spellIdPart)) return false;

        // Try normalized comparison
        try {
          const parsedUuid = foundry.utils.parseUuid(spell.uuid);
          if (parsedUuid.collection) {
            const normalizedId = `Compendium.${parsedUuid.collection.collection}.${parsedUuid.id}`;
            if (selectedSpellUUIDs.has(normalizedId)) return false;
          }
        } catch (e) {
          // Continue with filtering if parsing fails
        }
      }

      // Apply text search
      if (this._filters.name && !spell.name.toLowerCase().includes(this._filters.name.toLowerCase())) {
        return false;
      }

      // Filter by level
      if (this._filters.level && spell.level !== parseInt(this._filters.level)) {
        return false;
      }

      // Filter by school
      if (this._filters.school && spell.school !== this._filters.school) {
        return false;
      }

      // Filter by source
      if (this._filters.source && this._filters.source.trim() !== '') {
        const spellSourceParts = spell.sourceId?.split('.') || [];
        if (spellSourceParts.length >= 2) {
          const spellSource = `${spellSourceParts[0]}.${spellSourceParts[1]}`;
          if (spellSource !== this._filters.source) return false;
        } else if (spell.sourceId !== this._filters.source) {
          return false;
        }
      }

      // Filter by casting time
      if (this._filters.castingTime) {
        const [filterType, filterValue] = this._filters.castingTime.split(':');
        const spellCastingType = spell.filterData?.castingTime?.type || spell.system?.activation?.type || '';
        const spellCastingValue = spell.filterData?.castingTime?.value || spell.system?.activation?.value || '1';

        if (spellCastingType !== filterType || spellCastingValue !== filterValue) {
          return false;
        }
      }

      // Filter by range
      if ((this._filters.minRange || this._filters.maxRange) && (spell.filterData?.range?.units || spell.system?.range)) {
        const rangeUnits = spell.filterData?.range?.units || spell.system?.range?.units || '';
        const rangeValue = parseInt(spell.system?.range?.value || 0);

        // Convert to standard units for comparison
        let standardizedRange = rangeValue;
        if (rangeUnits === 'mi') {
          standardizedRange = rangeValue * 5280; // Miles to feet
        } else if (rangeUnits === 'spec') {
          standardizedRange = 0; // Special cases like "Self" or "Touch"
        }

        const minRangeVal = this._filters.minRange ? parseInt(this._filters.minRange) : 0;
        const maxRangeVal = this._filters.maxRange ? parseInt(this._filters.maxRange) : Infinity;

        if (standardizedRange < minRangeVal || standardizedRange > maxRangeVal) {
          return false;
        }
      }

      // Filter by damage type
      if (this._filters.damageType) {
        const spellDamageTypes = spell.filterData?.damageTypes || spell.system?.damage?.parts?.map((part) => part[1] || '').filter(Boolean) || [];
        if (spellDamageTypes.length === 0) return false;
        if (!spellDamageTypes.includes(this._filters.damageType)) return false;
      }

      // Filter by condition
      if (this._filters.condition) {
        const spellConditions = spell.filterData?.conditions || [];
        if (!spellConditions.includes(this._filters.condition)) return false;
      }

      // Filter by requires save
      if (this._filters.requiresSave) {
        const spellRequiresSave = spell.filterData?.requiresSave || !!spell.system?.save?.ability || false;
        if (this._filters.requiresSave === 'true' && !spellRequiresSave) return false;
        if (this._filters.requiresSave === 'false' && spellRequiresSave) return false;
      }

      // Filter by concentration
      if (this._filters.concentration) {
        const requiresConcentration = spell.filterData?.concentration || spell.system?.duration?.concentration || false;
        if (this._filters.concentration === 'true' && !requiresConcentration) return false;
        if (this._filters.concentration === 'false' && requiresConcentration) return false;
      }

      // Filter by ritual
      if (this._filters.ritual) {
        const isRitual = spell.filterData?.isRitual || false;
        if (!isRitual) return false;
      }

      return true;
    });

    return {
      spells: filteredSpells,
      totalFiltered: filteredSpells.length
    };
  }

  /**
   * Get normalized UUIDs for the selected spell list to aid in filtering
   * @returns {Set<string>} Set of normalized UUIDs
   * @private
   */
  #getNormalizedSelectedSpellUUIDs() {
    // If no selected spell list, return empty set
    if (!this._selectedSpellList?.spells) return new Set();

    // Check if we have cached UUIDs for this spell list
    const cacheKey = this._selectedSpellList.uuid;
    if (this._uuidCache.has(cacheKey)) {
      return this._uuidCache.get(cacheKey);
    }

    // Create a new set for normalization
    const selectedSpellUUIDs = new Set();

    for (const spell of this._selectedSpellList.spells) {
      if (spell.compendiumUuid) {
        try {
          // Parse UUID to get core components for comparison
          const parsedUuid = foundry.utils.parseUuid(spell.compendiumUuid);

          // Create a normalized reference that ignores "Item" inclusion
          if (parsedUuid.collection) {
            const normalizedId = `Compendium.${parsedUuid.collection.collection}.${parsedUuid.id}`;
            selectedSpellUUIDs.add(normalizedId);
          }

          // Also add the original UUID
          selectedSpellUUIDs.add(spell.compendiumUuid);

          // Also add just the ID part (last segment)
          const idPart = spell.compendiumUuid.split('.').pop();
          if (idPart) {
            selectedSpellUUIDs.add(idPart);
          }
        } catch (e) {
          log(1, `Error parsing UUID for ${spell.name}:`, e);
        }
      }
    }

    // Cache the result
    this._uuidCache.set(cacheKey, selectedSpellUUIDs);

    return selectedSpellUUIDs;
  }

  /**
   * Load spell details for the selected spell list
   * @param {Array} spellUuids - Array of spell UUIDs
   * @returns {Promise<void>}
   * @private
   */
  async _loadSpellDetails(spellUuids) {
    if (!this._selectedSpellList) return;

    try {
      // Update UI to show loading state
      this._selectedSpellList.isLoadingSpells = true;
      this.render(false);

      // Use the managementUtils helper to fetch and organize spells
      const spellDocs = await managementUtils.fetchSpellDocuments(spellUuids, 9);
      const spellLevels = await managementUtils.organizeSpellsByLevel(spellDocs);

      // Process each spell for icons and details
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          spell.enrichedIcon = await formattingUtils.createSpellIconLink(spell);
        }
      }

      // Store both the flat list and the organized levels
      this._selectedSpellList.spells = spellDocs;
      this._selectedSpellList.spellsByLevel = spellLevels;
      this._selectedSpellList.isLoadingSpells = false;

      // Render the updated view
      this.render(false);

      // Clear the UUID cache for this spell list
      this._uuidCache.delete(this._selectedSpellList.uuid);

      log(3, `Loaded ${spellDocs.length} spells for selected spell list`);
    } catch (error) {
      log(1, 'Error loading spell details:', error);
      this._selectedSpellList.isLoadingSpells = false;
      this._selectedSpellList.hasError = true;
      this.render(false);
    }
  }

  /**
   * Enrich available spells with icons and other data
   * @returns {Promise<void>}
   * @private
   */
  async #enrichAvailableSpells() {
    if (!this.#availableSpells.length) return;

    log(3, 'Enriching available spells with icons');

    // Process in batches to avoid performance issues
    const batchSize = 50;
    for (let i = 0; i < this.#availableSpells.length; i += batchSize) {
      const batch = this.#availableSpells.slice(i, i + batchSize);

      // Process batch in parallel
      await Promise.all(
        batch.map(async (spell) => {
          spell.enrichedIcon = await formattingUtils.createSpellIconLink(spell);
        })
      );

      // Allow UI updates if needed
      if ((i + batchSize) % 200 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    log(3, 'Completed enriching available spells');
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = {
      isLoading: this.#isLoading,
      hasError: this.#hasError,
      errorMessage: this.#errorMessage,
      availableSpellLists: this.#availableSpellLists,
      selectedSpellList: this._selectedSpellList,
      spellSchools: CONFIG.DND5E.spellSchools,
      spellLevels: CONFIG.DND5E.spellLevels,
      isEditing: this._isEditing,
      availableSpells: this.#availableSpells,
      filterState: this._filters,
      settings: {
        distanceUnit: game.settings.get(MODULE.ID, 'distanceUnit')
      }
    };

    if (this.#isLoading) {
      return context;
    }

    // Get mappings to determine which lists have custom versions
    const customMappings = game.settings.get(MODULE.ID, 'customSpellListMappings') || {};
    context.customListMap = customMappings;

    // If we have available spells, apply filters
    if (this.#availableSpells.length > 0) {
      // Collect available sources
      const sourceMap = new Map();
      this.#availableSpells.forEach((spell) => {
        if (spell.packName && !sourceMap.has(spell.sourceId)) {
          sourceMap.set(spell.sourceId, {
            id: spell.sourceId,
            label: spell.packName
          });
        }
      });
      context.spellSources = Array.from(sourceMap.values()).sort((a, b) => a.label.localeCompare(b.label));

      // Prepare filter options
      context.castingTimeOptions = managementUtils.prepareCastingTimeOptions(this.#availableSpells, this._filters);
      context.damageTypeOptions = managementUtils.prepareDamageTypeOptions(this._filters);
      context.conditionOptions = managementUtils.prepareConditionOptions(this._filters);

      // Apply filters
      context.filteredSpells = this.#filterAvailableSpells();
    }

    // Add additional context for editing state
    if (this._isEditing && this._selectedSpellList) {
      context.isCustomList = !!this._selectedSpellList.document.flags?.[MODULE.ID]?.isDuplicate;

      // If this is a custom list, get compare info for original
      if (context.isCustomList) {
        const originalUuid = this._selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid;
        if (originalUuid) {
          context.originalUuid = originalUuid;
          try {
            const compareResult = await managementUtils.compareListVersions(originalUuid, this._selectedSpellList.document.uuid);
            context.compareInfo = compareResult;
          } catch (error) {
            log(2, 'Error comparing versions:', error);
          }
        }
      }
    }

    return context;
  }

  /**
   * Handle rendering the application
   * @param {Object} context - The template context
   * @param {Object} options - The rendering options
   * @override
   * @private
   */
  _onRender(context, options) {
    super._onRender?.(context, options);

    // If we're loading, start the loading process
    if (this.#isLoading) {
      this.#loadData();
      return;
    }

    // Set up event listeners for spell filter inputs
    this.#setupFilterListeners();

    // Apply saved collapsed states
    this.#applyCollapsedLevels();

    // Enrich spell icons
    this.#enrichAvailableSpells();
  }

  /**
   * Render spell results batched for performance
   * @private
   */
  async _renderSpellResults() {
    // Clear container first
    const container = this.element.querySelector('.results-container');
    if (!container) return;

    // Show loading indicator
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading spells...</div>';

    const filteredData = this.#filterAvailableSpells();
    if (!filteredData || !filteredData.spells.length) {
      container.innerHTML = '<div class="no-results">No spells found matching the filters.</div>';
      return;
    }

    // Get batch of spells
    const results = filteredData.spells;
    const batchEnd = Math.min(this.constructor.BATCHING.SIZE, results.length);

    // Clear and prepare container
    container.innerHTML = '<div class="spell-list"></div>';
    const spellList = container.querySelector('.spell-list');

    // Render each spell
    for (let i = 0; i < batchEnd; i++) {
      const spell = results[i];
      const html = await this.#renderSpellItem(spell);
      spellList.insertAdjacentHTML('beforeend', html);
    }

    this.#resultIndex = batchEnd;

    // Add scroll event listener for infinite scrolling
    container.addEventListener('scroll', this.#onScrollResults.bind(this));
  }

  /**
   * Render a single spell item for the results list
   * @param {Object} spell - The spell data
   * @returns {Promise<string>} HTML string for the spell item
   * @private
   */
  async #renderSpellItem(spell) {
    return `<li class="spell-item" data-uuid="${spell.uuid}">
      <div class="spell-header">
        <div class="spell-name">${spell.name}</div>
        <div class="spell-level">${CONFIG.DND5E.spellLevels[spell.level]}</div>
      </div>
      <div class="spell-details">
        <div class="spell-school">${CONFIG.DND5E.spellSchools[spell.school].label}</div>
        <div class="spell-actions">
          <button type="button" class="btn add-spell" data-action="addSpell" data-uuid="${spell.uuid}">
            <i class="fas fa-plus"></i> Add
          </button>
        </div>
      </div>
    </li>`;
  }

  /**
   * Set up listeners for filter inputs
   * @private
   */
  #setupFilterListeners() {
    // Only set up listeners if we're in the editing state
    if (!this._isEditing) return;

    // Name input
    const nameInput = this.element.querySelector('input[name="spell-search"]');
    if (nameInput) {
      nameInput.addEventListener('input', (evt) => {
        this._filters.name = evt.target.value;
        if (!this._debouncedApplyFilters) {
          this._debouncedApplyFilters = foundry.utils.debounce(() => {
            this._renderSpellResults();
          }, 200);
        }
        this._debouncedApplyFilters();
      });
    }

    // Handle filter changes from select and checkbox elements through data-action="setFilter"
  }

  /**
   * Apply saved collapsed states after rendering
   * @private
   */
  #applyCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'gmCollapsedSpellLevels') || [];

    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) {
        levelContainer.classList.add('collapsed');
      }
    }
  }

  /**
   * Handle loading more results on scroll
   * @param {Event} event - The scroll event
   * @private
   */
  #onScrollResults(event) {
    if (this.#renderThrottle) return;

    const container = event.target;
    const { scrollTop, scrollHeight, clientHeight } = container;

    if (scrollTop + clientHeight < scrollHeight - this.constructor.BATCHING.MARGIN) return;

    // Don't proceed if we've already loaded all results
    const filteredData = this.#filterAvailableSpells();
    if (this.#resultIndex >= filteredData.spells.length) return;

    this.#renderThrottle = true;

    // Load more results
    const spellList = container.querySelector('.spell-list');
    const batchStart = this.#resultIndex;
    const batchEnd = Math.min(batchStart + this.constructor.BATCHING.SIZE, filteredData.spells.length);

    // Render and append next batch
    (async () => {
      for (let i = batchStart; i < batchEnd; i++) {
        const spell = filteredData.spells[i];
        const html = await this.#renderSpellItem(spell);
        spellList.insertAdjacentHTML('beforeend', html);
      }

      this.#resultIndex = batchEnd;
      this.#renderThrottle = false;
    })();
  }

  /**
   * Search by name
   * @param {KeyboardEvent} event - The input event
   * @private
   */
  _onSearchName(event) {
    if (!event.target.matches('input[name="spell-search"]')) return;
    this._filters.name = event.target.value;
    this._renderSpellResults();
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Create a confirmation dialog with standardized template
   * @param {Object} options - Dialog options
   * @returns {Promise<boolean>} True if confirmed, false otherwise
   * @private
   */
  async _confirmDialog({
    title = game.i18n.localize('SPELLMANAGER.Confirm.Title'),
    content = game.i18n.localize('SPELLMANAGER.Confirm.Content'),
    confirmLabel = game.i18n.localize('SPELLMANAGER.Confirm.Confirm'),
    confirmIcon = 'fas fa-check',
    cancelLabel = game.i18n.localize('SPELLMANAGER.Confirm.Cancel'),
    cancelIcon = 'fas fa-times',
    confirmCssClass = ''
  }) {
    const result = await foundry.applications.api.DialogV2.wait({
      title,
      content: `<p>${content}</p>`,
      buttons: [
        {
          icon: `${confirmIcon}`,
          label: confirmLabel,
          action: 'confirm',
          className: `dialog-button ${confirmCssClass}`
        },
        {
          icon: `${cancelIcon}`,
          label: cancelLabel,
          action: 'cancel',
          className: 'dialog-button'
        }
      ],
      default: 'cancel'
    });

    return result === 'confirm';
  }

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

  /**
   * Handle selecting a spell list
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onSelectSpellList(event, target) {
    const uuid = event.target.dataset.uuid;
    if (!uuid) return;

    log(3, `Selecting spell list: ${uuid}`);

    try {
      // First check if we have a custom version of this spell list
      const duplicate = await managementUtils.findDuplicateSpellList(uuid);

      // If a duplicate exists and we're not the duplicate, select the duplicate instead
      if (duplicate && duplicate.uuid !== uuid) {
        log(3, `Found custom version of spell list, selecting that instead: ${duplicate.uuid}`);
        return GMSpellListManager._onSelectSpellList({ target: { dataset: { uuid: duplicate.uuid } } });
      }

      // Get the spell list
      const spellList = await fromUuid(uuid);
      if (!spellList) {
        ui.notifications.error('Spell list not found.');
        return;
      }

      // Reset editing state when selecting a new spell list
      this._isEditing = false;

      // Extract the spell UUIDs
      const spellUuids = Array.from(spellList.system.spells || []);

      // Set up the selected spell list with loading state
      this._selectedSpellList = {
        document: spellList,
        uuid: spellList.uuid,
        name: spellList.name,
        spellUuids: spellUuids,
        spells: [],
        isLoadingSpells: true
      };

      // Try to determine the appropriate source filter
      log(3, 'Determining source filter for spell list');
      let sourceFilter = '';

      // Check if this is a custom spell list
      const isCustomList = !!spellList.flags?.[MODULE.ID]?.isDuplicate;
      if (isCustomList) {
        // Get the original UUID and extract the pack
        const originalUuid = spellList.flags?.[MODULE.ID]?.originalUuid;
        if (originalUuid) {
          try {
            const parsedUuid = foundry.utils.parseUuid(originalUuid);
            sourceFilter = parsedUuid.collection.metadata.packageName;
            log(3, `Using original source from flag: ${sourceFilter}`);
          } catch (e) {
            log(2, `Error parsing original UUID: ${e.message}`);
          }
        }
      } else if (spellList.pack) {
        // Use the current pack
        const [packageName, packName] = spellList.pack.split('.');
        sourceFilter = `${packageName}.${packName}`;
        log(3, `Using current pack source: ${sourceFilter}`);
      }

      // Only set the filter if we found a valid source
      if (sourceFilter) {
        this._filters.source = sourceFilter;
      } else {
        // Clear the source filter if we couldn't determine a valid source
        this._filters.source = '';
        log(3, 'No valid source found, clearing source filter');
      }

      // Render to show loading state
      this.render(false);

      // Load the spell details
      await this._loadSpellDetails(spellUuids);
    } catch (error) {
      log(1, 'Error selecting spell list:', error);
      ui.notifications.error('Failed to load spell list.');
    }
  }

  /**
   * Handle editing a spell list
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onEditSpellList(event, target) {
    if (!this._selectedSpellList) return;

    try {
      const uuid = target.dataset.uuid;
      log(3, `Editing spell list: ${uuid}`);

      // Check if this is already a custom list
      const isCustom = !!this._selectedSpellList.document.flags?.[MODULE.ID]?.isDuplicate;

      if (!isCustom) {
        // This is an original list, so we need to duplicate it first
        ui.notifications.info('Creating a custom copy of this spell list...');

        // Store the original source before duplicating
        let originalSource = '';
        if (this._selectedSpellList.document.pack) {
          const [packageName, packName] = this._selectedSpellList.document.pack.split('.');
          originalSource = `${packageName}.${packName}`;
          log(3, `Stored original source: ${originalSource}`);
        }

        // Duplicate the spell list
        const duplicateList = await managementUtils.duplicateSpellList(this._selectedSpellList.document);

        // Switch to the duplicate
        this._selectedSpellList = {
          document: duplicateList,
          uuid: duplicateList.uuid,
          name: duplicateList.name,
          spellUuids: Array.from(duplicateList.system.spells || []),
          spells: this._selectedSpellList.spells, // Keep the loaded spells
          isLoadingSpells: false
        };

        // Preserve the original source for filtering
        if (originalSource) {
          this._filters.source = originalSource;
          log(3, `Preserved original source for filtering: ${originalSource}`);
        }

        ui.notifications.info('Custom copy created. You are now editing your custom version.');
      }

      // Enter editing mode
      this._isEditing = true;

      this.render(false);
    } catch (error) {
      log(1, 'Error entering edit mode:', error);
      ui.notifications.error('Failed to enter edit mode.');
    }
  }

  /**
   * Handle adding a spell to the list
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onAddSpell(event, target) {
    if (!this._selectedSpellList || !this._isEditing) return;

    try {
      const spellUuid = target.dataset.uuid;
      log(3, `Adding spell: ${spellUuid}`);

      // Add the spell to the list in the data model
      await managementUtils.addSpellToList(this._selectedSpellList.document, spellUuid);

      // Refresh the document to ensure we have the latest data
      const updatedDocument = await fromUuid(this._selectedSpellList.document.uuid);
      if (!updatedDocument) {
        log(2, 'Could not retrieve updated document after adding spell');
        return;
      }

      // Update our reference to the document
      this._selectedSpellList.document = updatedDocument;

      // Get the fresh spell UUIDs from the updated document
      const updatedSpellUuids = Array.from(updatedDocument.system.spells || []);
      this._selectedSpellList.spellUuids = updatedSpellUuids;

      // Clear the UUID cache for this spell list
      this._uuidCache.delete(this._selectedSpellList.uuid);

      // Reload all spell details
      await this._loadSpellDetails(updatedSpellUuids);

      // Hide the added spell in the results
      const spellItem = this.element.querySelector(`.spell-item[data-uuid="${spellUuid}"]`);
      if (spellItem) {
        spellItem.style.display = 'none'; // Hide it directly
      }

      // Refresh the results
      this._renderSpellResults();

      ui.notifications.info('Spell added to list.');
    } catch (error) {
      log(1, 'Error adding spell:', error);
      ui.notifications.error('Failed to add spell to list.');
    }
  }

  /**
   * Handle removing a spell from the list
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onRemoveSpell(event, target) {
    if (!this._selectedSpellList || !this._isEditing) return;

    try {
      const spellUuid = target.dataset.uuid;
      log(3, `Removing spell: ${spellUuid}`);

      // Remove the spell from the list in the data model
      await managementUtils.removeSpellFromList(this._selectedSpellList.document, spellUuid);

      // Refresh the document to ensure we have the latest data
      const updatedDocument = await fromUuid(this._selectedSpellList.document.uuid);
      if (!updatedDocument) {
        log(2, 'Could not retrieve updated document');
        return;
      }

      // Update our reference to the document
      this._selectedSpellList.document = updatedDocument;

      // Get the fresh spell UUIDs from the updated document
      const updatedSpellUuids = Array.from(updatedDocument.system.spells || []);
      this._selectedSpellList.spellUuids = updatedSpellUuids;

      // Clear the UUID cache for this spell list
      this._uuidCache.delete(this._selectedSpellList.uuid);

      // Reload all spell details
      await this._loadSpellDetails(updatedSpellUuids);

      // Refresh the results to show the removed spell
      this._renderSpellResults();

      ui.notifications.info('Spell removed from list.');
    } catch (error) {
      log(1, 'Error removing spell:', error);
      ui.notifications.error('Failed to remove spell from list.');
    }
  }

  /**
   * Handle saving a custom list
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onSaveCustomList(event, target) {
    if (!this._selectedSpellList || !this._isEditing) return;

    // Just exit edit mode - changes are saved automatically
    this._isEditing = false;
    this.render(false);

    ui.notifications.info('Custom spell list saved.');
  }

  /**
   * Handle deleting a custom list
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onDeleteCustomList(event, target) {
    if (!this._selectedSpellList) return;

    const uuid = this._selectedSpellList.uuid;
    const listName = this._selectedSpellList.name;

    // Confirm deletion with our enhanced dialog
    const confirmed = await this._confirmDialog({
      title: game.i18n.localize('SPELLMANAGER.Confirm.DeleteTitle'),
      content: game.i18n.format('SPELLMANAGER.Confirm.DeleteContent', { name: listName }),
      confirmLabel: game.i18n.localize('SPELLMANAGER.Confirm.DeleteButton'),
      confirmIcon: 'fas fa-trash',
      confirmCssClass: 'dialog-button-danger'
    });

    if (!confirmed) return;

    try {
      // Remove the custom spell list
      await managementUtils.removeCustomSpellList(uuid);

      // Clear selection
      this._selectedSpellList = null;
      this._isEditing = false;

      // Clear the UUID cache
      this._uuidCache.clear();

      // Re-render
      this.render(false);

      ui.notifications.info(game.i18n.format('SPELLMANAGER.Notifications.ListDeleted', { name: listName }));
    } catch (error) {
      log(1, 'Error deleting custom spell list:', error);
      ui.notifications.error(game.i18n.localize('SPELLMANAGER.Notifications.ListDeleteError'));
    }
  }

  /**
   * Handle restoring a custom list from its original
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onRestoreOriginal(event, target) {
    if (!this._selectedSpellList) return;

    const originalUuid = this._selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid;
    if (!originalUuid) return;

    const listName = this._selectedSpellList.name;

    // Confirm restoration with our enhanced dialog
    const confirmed = await this._confirmDialog({
      title: 'Restore from Original',
      content: `Are you sure you want to restore <strong>${listName}</strong> from the original source? Your customizations will be lost.`,
      confirmLabel: 'Restore',
      confirmIcon: 'fas fa-sync',
      confirmCssClass: 'dialog-button-warning'
    });

    if (!confirmed) return;

    try {
      // Get the original spell list
      const originalList = await fromUuid(originalUuid);
      if (!originalList) {
        ui.notifications.error('Original spell list not found.');
        return;
      }

      // Get original spells
      const originalSpells = Array.from(originalList.system.spells || []);

      // Update the custom list with original spells
      await this._selectedSpellList.document.update({
        'system.spells': originalSpells,
        [`flags.${MODULE.ID}.originalModTime`]: originalList._stats?.modifiedTime || 0,
        [`flags.${MODULE.ID}.originalVersion`]: originalList._stats?.systemVersion || game.system.version
      });

      // Clear the UUID cache for this spell list
      this._uuidCache.delete(this._selectedSpellList.uuid);

      // Update our data and reload spell details
      this._selectedSpellList.spellUuids = originalSpells;
      await this._loadSpellDetails(originalSpells);

      // Exit edit mode
      this._isEditing = false;

      // Re-render
      this.render(false);

      ui.notifications.info(`Spell list "${listName}" restored from original.`);
    } catch (error) {
      log(1, 'Error restoring from original:', error);
      ui.notifications.error('Failed to restore from original.');
    }
  }

  /**
   * Handle configuring sources
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static _onConfigureSources(event, target) {
    // This would open a configuration dialog for sources
    ui.notifications.info('Source configuration not yet implemented');
  }

  /**
   * Handle clearing the name filter
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static _onClearName(event, target) {
    const input = target.closest('.search-container').querySelector('input');
    input.value = '';
    this._filters.name = '';
    this._renderSpellResults();
  }

  /**
   * Handle setting a filter
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static _onSetFilter(event, target) {
    const name = target.name;
    if (!name) return;

    const filterName = name.replace('filter-', '');
    const value = target.type === 'checkbox' ? target.checked : target.value;

    this._filters[filterName] = value;
    this._renderSpellResults();
  }

  /**
   * Handle toggling collapsed state
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static _onToggleCollapse(event, target) {
    target.closest('.collapsible')?.classList.toggle('collapsed');
  }

  /**
   * Handle toggling the sidebar
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static _onToggleSidebar(event, target) {
    this.element.classList.toggle('sidebar-collapsed');
  }

  /**
   * Handle toggling spell level collapsing
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static _onToggleSpellLevel(event, target) {
    // Find the parent spell-level container
    const levelContainer = target.closest('.spell-level');

    if (!levelContainer || !levelContainer.classList.contains('spell-level')) {
      return;
    }

    const levelId = levelContainer.dataset.level;

    // Toggle collapsed state
    levelContainer.classList.toggle('collapsed');

    // Save state to user flags
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'gmCollapsedSpellLevels') || [];
    const isCollapsed = levelContainer.classList.contains('collapsed');
    if (isCollapsed && !collapsedLevels.includes(levelId)) {
      collapsedLevels.push(levelId);
    } else if (!isCollapsed && collapsedLevels.includes(levelId)) {
      collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
    }

    game.user.setFlag(MODULE.ID, 'gmCollapsedSpellLevels', collapsedLevels);
  }

  /**
   * Handle showing the documentation
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static _onShowDocumentation(event, target) {
    const content = `
      <h2>${game.i18n.localize('SPELLMANAGER.Documentation.Title')}</h2>

      <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Overview.Title')}</h3>
      <p>${game.i18n.localize('SPELLMANAGER.Documentation.Overview.Content')}</p>

      <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Title')}</h3>
      <ol>
        <li>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Step1')}</li>
        <li>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Step2')}</li>
        <li>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Step3')}</li>
        <li>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Step4')}</li>
      </ol>

      <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Title')}</h3>
      <p>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Content')}</p>
      <ul>
        <li><strong>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Control1')}</strong></li>
        <li><strong>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Control2')}</strong></li>
      </ul>
      <p>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Note')}</p>

      <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Title')}</h3>
      <p>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Intro')}</p>
      <ol>
        <li>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Step1')}</li>
        <li>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Step2')}</li>
        <li>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Step3')}</li>
      </ol>
    `;

    foundry.applications.api.DialogV2.wait({
      title: game.i18n.localize('SPELLMANAGER.Documentation.Title'),
      content,
      classes: ['gm-spell-list-manager-helper'],
      buttons: [
        {
          icon: 'fas fa-check',
          label: game.i18n.localize('SPELLBOOK.Buttons.Close'),
          action: 'close'
        }
      ],
      position: {
        height: 600,
        width: 600
      },
      default: 'close'
    });
  }

  /**
   * Form handler
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The form data
   * @private
   */
  static async #formHandler(event, form, formData) {
    event.preventDefault();
    // Form submission handled by individual handler methods
  }
}
