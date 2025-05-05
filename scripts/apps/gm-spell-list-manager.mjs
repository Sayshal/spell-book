import { MODULE } from '../constants.mjs';
import * as actorSpellUtils from '../helpers/actor-spells.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import * as managerHelpers from '../helpers/spell-management.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for GM management of spell lists
 * Allows browsing, duplicating, and customizing spell lists from compendiums
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
    form: {
      handler: GMSpellListManager.formHandler,
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      selectSpellList: GMSpellListManager.handleSelectSpellList,
      closeSpellManager: GMSpellListManager.handleClose,
      editSpellList: GMSpellListManager.handleEditSpellList,
      removeSpell: GMSpellListManager.handleRemoveSpell,
      addSpell: GMSpellListManager.handleAddSpell,
      saveCustomList: GMSpellListManager.handleSaveCustomList,
      deleteCustomList: GMSpellListManager.handleDeleteCustomList,
      restoreOriginal: GMSpellListManager.handleRestoreOriginal,
      showDocumentation: GMSpellListManager.handleShowDocumentation,
      toggleSidebar: GMSpellListManager.handleToggleSidebar,
      toggleSpellLevel: GMSpellListManager.handleToggleSpellLevel
    },
    classes: ['gm-spell-list-manager'],
    window: {
      title: 'GM Spell List Manager',
      resizable: true,
      minimizable: true
    },
    position: {
      top: 150,
      left: 150,
      width: 1100,
      height: Math.max(600, window.innerHeight - 300)
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
   * Loading state for the spell manager
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
   * Available spell lists
   * @type {Array}
   */
  availableSpellLists = [];

  /**
   * Currently selected spell list
   * @type {Object|null}
   */
  selectedSpellList = null;

  /**
   * Available spells for adding
   * @type {Array}
   */
  availableSpells = [];

  /**
   * Current filter state for available spells
   * @type {Object}
   */
  filterState = {
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
    prepared: false,
    ritual: false
  };

  /**
   * Editing state
   * @type {boolean}
   */
  isEditing = false;

  /**
   * Cache for normalized UUIDs to improve comparison performance
   * @type {Map<string, Set<string>>}
   * @private
   */
  _uuidCache = new Map();

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {object} options - ApplicationV2 options
   */
  constructor(options = {}) {
    super(options);
  }

  /**
   * Initialize the application
   * @override
   * @private
   */
  _initialize() {
    super._initialize();

    // Initialize filter state
    this.filterState = {
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
      prepared: false,
      ritual: false
    };

    // Set position to fill most of the screen
    this.position.width = Math.max(800, window.innerWidth - 300);
    this.position.height = Math.max(600, window.innerHeight - 300);
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /**
   * Prepare the application context data
   * @param {Object} options - Application options
   * @returns {Promise<Object>} The prepared context
   * @override
   * @private
   */
  async _prepareContext(options) {
    // Get basic context
    const context = {
      isLoading: this.isLoading,
      hasError: this.hasError,
      errorMessage: this.errorMessage,
      availableSpellLists: this.availableSpellLists,
      selectedSpellList: this.selectedSpellList,
      spellSchools: CONFIG.DND5E.spellSchools,
      spellLevels: CONFIG.DND5E.spellLevels,
      isEditing: this.isEditing,
      availableSpells: this.availableSpells,
      filterState: this.filterState,
      settings: {
        distanceUnit: game.settings.get(MODULE.ID, 'distanceUnit')
      }
    };

    if (this.isLoading) {
      return context;
    }

    // Get mappings to determine which lists have custom versions
    const customMappings = game.settings.get(MODULE.ID, 'customSpellListMappings') || {};
    context.customListMap = customMappings;

    // If we have available spells, apply filters
    if (this.availableSpells.length > 0) {
      const sourceMap = new Map();
      this.availableSpells.forEach((spell) => {
        if (spell.packName && !sourceMap.has(spell.sourceId)) {
          sourceMap.set(spell.sourceId, {
            id: spell.sourceId,
            label: spell.packName
          });
        }
      });
      context.spellSources = Array.from(sourceMap.values()).sort((a, b) => a.label.localeCompare(b.label));

      // Prepare filter options
      context.castingTimeOptions = managerHelpers.prepareCastingTimeOptions(this.availableSpells, this.filterState);
      context.damageTypeOptions = managerHelpers.prepareDamageTypeOptions(this.filterState);
      context.conditionOptions = managerHelpers.prepareConditionOptions(this.filterState);

      context.filteredSpells = this._filterAvailableSpells();
    }

    // Add additional context for editing state
    if (this.isEditing && this.selectedSpellList) {
      context.isCustomList = !!this.selectedSpellList.document.flags?.[MODULE.ID]?.isDuplicate;

      // If this is a custom list, get compare info for original
      if (context.isCustomList) {
        const originalUuid = this.selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid;
        if (originalUuid) {
          context.originalUuid = originalUuid;
          try {
            const compareResult = await managerHelpers.compareListVersions(originalUuid, this.selectedSpellList.document.uuid);
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
    log(1, 'Render Called');
    super._onRender?.(context, options);

    // If we're loading, start the loading process
    if (this.isLoading) {
      this._loadData();
      return;
    }

    // Set up event listeners for spell filter inputs
    this._setupFilterListeners();

    // Apply saved collapsed states
    this._applyCollapsedLevels();
  }

  /* -------------------------------------------- */
  /*  Data Loading                                */
  /* -------------------------------------------- */

  /**
   * Load all required data
   * @private
   */
  async _loadData() {
    try {
      log(3, 'Loading spell lists for GM manager');

      // Get all available spell lists from compendiums
      this.availableSpellLists = await managerHelpers.findCompendiumSpellLists();

      // Sort by name for better usability
      this.availableSpellLists.sort((a, b) => a.name.localeCompare(b.name));

      // Pre-fetch all available spells as well for column 3
      this.availableSpells = await managerHelpers.fetchAllCompendiumSpells();
      await this._enrichAvailableSpells();

      this.isLoading = false;
      this.render(false);
    } catch (error) {
      log(1, 'Error loading spell lists:', error);
      this.hasError = true;
      this.errorMessage = 'Failed to load spell lists.';
      this.isLoading = false;
      this.render(false);
    }
  }

  /**
   * Enrich available spells with icons
   * @returns {Promise<void>}
   * @private
   */
  async _enrichAvailableSpells() {
    if (!this.availableSpells.length) return;

    log(3, 'Enriching available spells with icons');

    // Process in batches to avoid performance issues
    const batchSize = 50;
    for (let i = 0; i < this.availableSpells.length; i += batchSize) {
      const batch = this.availableSpells.slice(i, i + batchSize);

      // Process batch in parallel
      await Promise.all(
        batch.map(async (spell) => {
          spell.enrichedIcon = await formattingUtils.createEnrichedSpellIcon(spell);
        })
      );

      // Allow UI updates if needed
      if ((i + batchSize) % 200 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    log(3, 'Completed enriching available spells');
  }

  /**
   * Filter available spells
   * @returns {Object} Filtered spells with additional metadata
   * @private
   */
  _filterAvailableSpells() {
    const { name, level, school, source, castingTime, minRange, maxRange, damageType, condition, requiresSave, concentration, ritual } = this.filterState;

    // Normalize selected spell UUIDs - only do this once per selected spell list
    const selectedSpellUUIDs = this._getNormalizedSelectedSpellUUIDs();

    // Filter the entire list
    const filteredSpells = this.availableSpells.filter((spell) => {
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

      // Filter by name
      if (name && !spell.name.toLowerCase().includes(name.toLowerCase())) {
        return false;
      }

      // Filter by level
      if (level && spell.level !== parseInt(level)) {
        return false;
      }

      // Filter by school
      if (school && spell.school !== school) {
        return false;
      }

      // Filter by source
      if (source && source.trim() !== '') {
        const spellSourceParts = spell.sourceId?.split('.') || [];
        if (spellSourceParts.length >= 2) {
          const spellSource = `${spellSourceParts[0]}.${spellSourceParts[1]}`;
          if (spellSource !== source) return false;
        } else if (spell.sourceId !== source) {
          return false;
        }
      }

      // Filter by casting time
      if (castingTime) {
        const [filterType, filterValue] = castingTime.split(':');
        const spellCastingType = spell.filterData?.castingTime?.type || spell.system?.activation?.type || '';
        const spellCastingValue = spell.filterData?.castingTime?.value || spell.system?.activation?.value || '1';

        if (spellCastingType !== filterType || spellCastingValue !== filterValue) {
          return false;
        }
      }

      // Filter by range
      if ((minRange || maxRange) && (spell.filterData?.range?.units || spell.system?.range)) {
        const rangeUnits = spell.filterData?.range?.units || spell.system?.range?.units || '';
        const rangeValue = parseInt(spell.system?.range?.value || 0);

        // Convert to standard units for comparison
        let standardizedRange = rangeValue;
        if (rangeUnits === 'mi') {
          standardizedRange = rangeValue * 5280; // Miles to feet
        } else if (rangeUnits === 'spec') {
          standardizedRange = 0; // Special cases like "Self" or "Touch"
        }

        const minRangeVal = minRange ? parseInt(minRange) : 0;
        const maxRangeVal = maxRange ? parseInt(maxRange) : Infinity;

        if (standardizedRange < minRangeVal || standardizedRange > maxRangeVal) {
          return false;
        }
      }

      // Filter by damage type
      if (damageType) {
        const spellDamageTypes = spell.filterData?.damageTypes || spell.system?.damage?.parts?.map((part) => part[1] || '').filter(Boolean) || [];
        if (spellDamageTypes.length === 0) return false;
        if (!spellDamageTypes.includes(damageType)) return false;
      }

      // Filter by condition
      if (condition) {
        const spellConditions = spell.filterData?.conditions || [];
        if (!spellConditions.includes(condition)) return false;
      }

      // Filter by requires save
      if (requiresSave) {
        const spellRequiresSave = spell.filterData?.requiresSave || !!spell.system?.save?.ability || false;
        if (requiresSave === 'true' && !spellRequiresSave) return false;
        if (requiresSave === 'false' && spellRequiresSave) return false;
      }

      // Filter by concentration
      if (concentration) {
        const requiresConcentration = spell.filterData?.concentration || spell.system?.duration?.concentration || false;
        if (concentration === 'true' && !requiresConcentration) return false;
        if (concentration === 'false' && requiresConcentration) return false;
      }

      // Filter by ritual
      if (ritual) {
        const isRitual = spell.filterData?.isRitual || false;
        if (!isRitual) return false;
      }

      return true;
    });

    // Return all filtered spells and count for UI
    return {
      spells: filteredSpells,
      totalFiltered: filteredSpells.length
    };
  }

  /**
   * Get normalized UUIDs for the selected spell list
   * @returns {Set<string>} Set of normalized UUIDs
   * @private
   */
  _getNormalizedSelectedSpellUUIDs() {
    // If no selected spell list, return empty set
    if (!this.selectedSpellList?.spells) return new Set();

    // Check if we have cached UUIDs for this spell list
    const cacheKey = this.selectedSpellList.uuid;
    if (this._uuidCache.has(cacheKey)) {
      return this._uuidCache.get(cacheKey);
    }

    // Create a new set for normalization
    const selectedSpellUUIDs = new Set();

    for (const spell of this.selectedSpellList.spells) {
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
   * Apply all current filters to the spell list - DOM manipulation for efficiency
   * @private
   */
  _applyFilters() {
    try {
      log(3, 'Applying filters to available spells');

      // Calculate filtered results
      const filteredData = this._filterAvailableSpells();

      // Create a set of visible UUIDs for quick lookup
      const visibleUUIDs = new Set(filteredData.spells.map((spell) => spell.uuid));

      // Update visibility in the DOM
      const spellItems = this.element.querySelectorAll('.available-spells .spell-item');
      let visibleCount = 0;

      for (const item of spellItems) {
        const uuid = item.dataset.uuid;
        const isVisible = visibleUUIDs.has(uuid);
        item.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount++;
      }

      // Show/hide no results message
      const noResults = this.element.querySelector('.no-spells');
      if (noResults) {
        noResults.style.display = visibleCount > 0 ? 'none' : 'block';
      }

      // Update filter count display
      const countDisplay = this.element.querySelector('.filter-count');
      if (countDisplay) {
        countDisplay.textContent = `${visibleCount} spells`;
      }
    } catch (error) {
      log(1, 'Error applying filters:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Filter Setup & Event Handlers               */
  /* -------------------------------------------- */

  /**
   * Set up listeners for filter inputs
   * @private
   */
  _setupFilterListeners() {
    // Only set up listeners if we're in the editing state
    if (!this.isEditing) return;

    // Name input
    const nameInput = this.element.querySelector('input[name="spell-search"]');
    if (nameInput) {
      nameInput.addEventListener('input', (evt) => {
        this.filterState.name = evt.target.value;
        if (!this._debouncedApplyFilters) {
          this._debouncedApplyFilters = foundry.utils.debounce(() => {
            this._applyFilters();
          }, 200);
        }
        this._debouncedApplyFilters();
      });
    }

    // Dropdown selects - using more specific change event handlers
    const dropdownSelectors = [
      { selector: 'select[name="spell-level"]', property: 'level' },
      { selector: 'select[name="spell-school"]', property: 'school' },
      { selector: 'select[name="spell-source"]', property: 'source' },
      { selector: 'select[name="spell-castingTime"]', property: 'castingTime' },
      { selector: 'select[name="spell-damageType"]', property: 'damageType' },
      { selector: 'select[name="spell-condition"]', property: 'condition' },
      { selector: 'select[name="spell-requiresSave"]', property: 'requiresSave' },
      { selector: 'select[name="spell-concentration"]', property: 'concentration' }
    ];

    for (const { selector, property } of dropdownSelectors) {
      const element = this.element.querySelector(selector);
      if (element) {
        element.addEventListener('change', (evt) => {
          const oldValue = this.filterState[property];
          const newValue = evt.target.value;

          // Only update and filter if the value actually changed
          if (oldValue !== newValue) {
            this.filterState[property] = newValue;
            this._applyFilters();
          }
        });
      }
    }

    // Range inputs
    const rangeInputs = ['input[name="spell-min-range"]', 'input[name="spell-max-range"]'];
    rangeInputs.forEach((selector) => {
      const input = this.element.querySelector(selector);
      if (input) {
        input.addEventListener('input', (evt) => {
          const property = evt.target.name === 'spell-min-range' ? 'minRange' : 'maxRange';
          const oldValue = this.filterState[property];
          const newValue = evt.target.value;

          // Only update if value changed
          if (oldValue !== newValue) {
            this.filterState[property] = newValue;

            if (!this._debouncedRangeFilters) {
              this._debouncedRangeFilters = foundry.utils.debounce(() => {
                this._applyFilters();
              }, 200);
            }
            this._debouncedRangeFilters();
          }
        });
      }
    });

    // Checkbox inputs
    const checkboxSelectors = [{ selector: 'input[name="spell-ritual"]', property: 'ritual' }];

    for (const { selector, property } of checkboxSelectors) {
      const element = this.element.querySelector(selector);
      if (element) {
        element.addEventListener('change', (evt) => {
          const oldValue = this.filterState[property];
          const newValue = evt.target.checked;

          // Only update if value changed
          if (oldValue !== newValue) {
            this.filterState[property] = newValue;
            this._applyFilters();
          }
        });
      }
    }
  }

  /**
   * Apply saved collapsed states after rendering
   * @private
   */
  _applyCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'gmCollapsedSpellLevels') || [];

    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) {
        levelContainer.classList.add('collapsed');
      }
    }
  }

  /* -------------------------------------------- */
  /*  Spell List Operations                       */
  /* -------------------------------------------- */

  /**
   * Load spell details for the selected spell list
   * @param {Array} spellUuids - Array of spell UUIDs
   * @private
   */
  async _loadSpellDetails(spellUuids) {
    if (!this.selectedSpellList) return;

    try {
      // Update UI to show loading state
      this.selectedSpellList.isLoadingSpells = true;
      this.render(false);

      // Use the fetchSpellDocuments helper from actor-spells
      const spellDocs = await actorSpellUtils.fetchSpellDocuments(new Set(spellUuids), 9);

      // Organize spells by level using the modified helper (passing null for actor)
      const spellLevels = await actorSpellUtils.organizeSpellsByLevel(spellDocs, null);

      // Enrich the icons and details for each spell
      const enrichmentPromises = [];

      for (const level of spellLevels) {
        for (const spell of level.spells) {
          // Create a promise for each icon enrichment
          enrichmentPromises.push(
            formattingUtils.createEnrichedSpellIcon(spell).then((icon) => {
              spell.enrichedIcon = icon;
            })
          );
        }
      }

      // Wait for all icon enrichments to complete
      await Promise.all(enrichmentPromises);

      // Store both the flat list and the organized levels
      this.selectedSpellList.spells = spellDocs;
      this.selectedSpellList.spellsByLevel = spellLevels;
      this.selectedSpellList.isLoadingSpells = false;

      // Render the updated view
      this.render(false);

      // Clear the UUID cache for this spell list
      this._uuidCache.delete(this.selectedSpellList.uuid);

      log(3, `Loaded ${spellDocs.length} spells for selected spell list`);
    } catch (error) {
      log(1, 'Error loading spell details:', error);
      this.selectedSpellList.isLoadingSpells = false;
      this.selectedSpellList.hasError = true;
      this.render(false);
    }
  }

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
          icon: `<i class="${confirmIcon}"></i>`,
          label: confirmLabel,
          action: 'confirm',
          className: `dialog-button ${confirmCssClass}`
        },
        {
          icon: `<i class="${cancelIcon}"></i>`,
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
  /*  Event Handler Action Methods                */
  /* -------------------------------------------- */

  /**
   * Select a spell list
   * @param {string} uuid - UUID of the spell list
   * @returns {Promise<void>}
   */
  async selectSpellList(uuid) {
    try {
      log(3, `Selecting spell list: ${uuid}`);

      // First check if we have a custom version of this spell list
      const duplicate = await managerHelpers.findDuplicateSpellList(uuid);

      // If a duplicate exists and we're not the duplicate, select the duplicate instead
      if (duplicate && duplicate.uuid !== uuid) {
        log(3, `Found custom version of spell list, selecting that instead: ${duplicate.uuid}`);
        return this.selectSpellList(duplicate.uuid);
      }

      // Get the spell list
      const spellList = await fromUuid(uuid);
      if (!spellList) {
        ui.notifications.error('Spell list not found.');
        return;
      }

      // Reset editing state when selecting a new spell list
      this.isEditing = false;

      // Extract the spell UUIDs
      const spellUuids = Array.from(spellList.system.spells || []);

      // Set up the selected spell list with loading state
      this.selectedSpellList = {
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
        this.filterState.source = sourceFilter;
      } else {
        // Clear the source filter if we couldn't determine a valid source
        this.filterState.source = '';
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
   * Enter edit mode for a spell list
   * @param {string} uuid - UUID of the spell list
   * @returns {Promise<void>}
   */
  async editSpellList(uuid) {
    if (!this.selectedSpellList) return;

    try {
      log(3, `Editing spell list: ${uuid}`);

      // Check if this is already a custom list
      const isCustom = !!this.selectedSpellList.document.flags?.[MODULE.ID]?.isDuplicate;

      if (!isCustom) {
        // This is an original list, so we need to duplicate it first
        ui.notifications.info('Creating a custom copy of this spell list...');

        // Store the original source before duplicating
        let originalSource = '';
        if (this.selectedSpellList.document.pack) {
          const [packageName, packName] = this.selectedSpellList.document.pack.split('.');
          originalSource = `${packageName}.${packName}`;
          log(3, `Stored original source: ${originalSource}`);
        }

        // Duplicate the spell list
        const duplicateList = await managerHelpers.duplicateSpellList(this.selectedSpellList.document);

        // Switch to the duplicate
        this.selectedSpellList = {
          document: duplicateList,
          uuid: duplicateList.uuid,
          name: duplicateList.name,
          spellUuids: Array.from(duplicateList.system.spells || []),
          spells: this.selectedSpellList.spells, // Keep the loaded spells
          isLoadingSpells: false
        };

        // Preserve the original source for filtering
        if (originalSource) {
          this.filterState.source = originalSource;
          log(3, `Preserved original source for filtering: ${originalSource}`);
        }

        ui.notifications.info('Custom copy created. You are now editing your custom version.');
      }

      // Enter editing mode
      this.isEditing = true;

      this.render(false);
    } catch (error) {
      log(1, 'Error entering edit mode:', error);
      ui.notifications.error('Failed to enter edit mode.');
    }
  }

  /**
   * Remove a spell from the selected spell list with proper UI updates
   * @param {string} spellUuid - UUID of the spell to remove
   * @returns {Promise<void>}
   */
  async removeSpell(spellUuid) {
    if (!this.selectedSpellList || !this.isEditing) return;

    try {
      log(3, `Attempting to remove spell: ${spellUuid}`);

      // Remove the spell from the list in the data model
      await managerHelpers.removeSpellFromList(this.selectedSpellList.document, spellUuid);

      // Refresh the document to ensure we have the latest data
      const updatedDocument = await fromUuid(this.selectedSpellList.document.uuid);
      if (!updatedDocument) {
        log(2, 'Could not retrieve updated document');
        return;
      }

      // Update our reference to the document
      this.selectedSpellList.document = updatedDocument;

      // Get the fresh spell UUIDs from the updated document
      const updatedSpellUuids = Array.from(updatedDocument.system.spells || []);
      this.selectedSpellList.spellUuids = updatedSpellUuids;

      // Clear the UUID cache for this spell list
      this._uuidCache.delete(this.selectedSpellList.uuid);

      // Reload all spell details
      await this._loadSpellDetails(updatedSpellUuids);

      // For add/remove operations, re-render to ensure both lists are synchronized
      // Reset the filter state to ensure removed spell can appear in available spells
      this._applyFilters();

      ui.notifications.info('Spell removed from list.');
    } catch (error) {
      log(1, 'Error removing spell:', error);
      ui.notifications.error('Failed to remove spell from list.');
    }
  }

  /**
   * Add a spell to the selected spell list with proper UI updates
   * @param {string} spellUuid - UUID of the spell to add
   * @returns {Promise<void>}
   */
  async addSpell(spellUuid) {
    if (!this.selectedSpellList || !this.isEditing) return;

    try {
      log(3, `Adding spell: ${spellUuid}`);

      // Add the spell to the list in the data model
      await managerHelpers.addSpellToList(this.selectedSpellList.document, spellUuid);

      // Refresh the document to ensure we have the latest data
      const updatedDocument = await fromUuid(this.selectedSpellList.document.uuid);
      if (!updatedDocument) {
        log(2, 'Could not retrieve updated document after adding spell');
        return;
      }

      // Update our reference to the document
      this.selectedSpellList.document = updatedDocument;

      // Get the fresh spell UUIDs from the updated document
      const updatedSpellUuids = Array.from(updatedDocument.system.spells || []);
      this.selectedSpellList.spellUuids = updatedSpellUuids;

      // Clear the UUID cache for this spell list
      this._uuidCache.delete(this.selectedSpellList.uuid);

      // Reload all spell details
      await this._loadSpellDetails(updatedSpellUuids);

      // Apply filters to update available spells list
      this._applyFilters();

      ui.notifications.info('Spell added to list.');
    } catch (error) {
      log(1, 'Error adding spell:', error);
      ui.notifications.error('Failed to add spell to list.');
    }
  }

  /**
   * Save the custom spell list
   * @returns {Promise<void>}
   */
  async saveCustomList() {
    if (!this.selectedSpellList || !this.isEditing) return;

    // Just exit edit mode - changes are saved automatically
    this.isEditing = false;
    this.render(false);

    ui.notifications.info('Custom spell list saved.');
  }

  /**
   * Delete the current custom spell list
   * @returns {Promise<void>}
   */
  async deleteCustomList() {
    if (!this.selectedSpellList) return;

    const uuid = this.selectedSpellList.uuid;
    const listName = this.selectedSpellList.name;

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
      await managerHelpers.removeCustomSpellList(uuid);

      // Clear selection
      this.selectedSpellList = null;
      this.isEditing = false;

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
   * Restore a custom spell list from its original
   * @returns {Promise<void>}
   */
  async restoreOriginal() {
    if (!this.selectedSpellList) return;

    const originalUuid = this.selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid;
    if (!originalUuid) return;

    const listName = this.selectedSpellList.name;

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
      await this.selectedSpellList.document.update({
        'system.spells': originalSpells,
        [`flags.${MODULE.ID}.originalModTime`]: originalList._stats?.modifiedTime || 0,
        [`flags.${MODULE.ID}.originalVersion`]: originalList._stats?.systemVersion || game.system.version
      });

      // Clear the UUID cache for this spell list
      this._uuidCache.delete(this.selectedSpellList.uuid);

      // Update our data and reload spell details
      this.selectedSpellList.spellUuids = originalSpells;
      await this._loadSpellDetails(originalSpells);

      // Exit edit mode
      this.isEditing = false;

      // Re-render
      this.render(false);

      ui.notifications.info(`Spell list "${listName}" restored from original.`);
    } catch (error) {
      log(1, 'Error restoring from original:', error);
      ui.notifications.error('Failed to restore from original.');
    }
  }

  /**
   * Show the documentation dialog
   * @returns {Promise<void>}
   */
  async showDocumentation() {
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

    <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Title')}</h3>
    <ul>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Item1')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Item2')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Item3')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Item4')}</li>
    </ul>
  `;

    const dialog = await foundry.applications.api.DialogV2.wait({
      title: game.i18n.localize('SPELLMANAGER.Documentation.Title'),
      content: content,
      classes: ['gm-spell-list-manager-helper'],
      buttons: [
        {
          icon: 'fas fa-check',
          label: game.i18n.localize('SPELLMANAGER.Buttons.Close'),
          action: 'close'
        }
      ],
      position: {
        top: 150,
        left: 150,
        width: 600,
        height: 800
      },
      default: 'close'
    });

    return dialog;
  }

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

  /**
   * Handle selecting a spell list (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleSelectSpellList(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;

    const uuid = element.dataset.uuid;

    // Get the application instance directly from foundry
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.selectSpellList(uuid);
  }

  /**
   * Handle clicking the edit button (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleEditSpellList(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;

    const uuid = element.dataset.uuid;

    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.editSpellList(uuid);
  }

  /**
   * Handle removing a spell (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleRemoveSpell(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;

    const uuid = element.dataset.uuid;

    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.removeSpell(uuid);
  }

  /**
   * Handle adding a spell (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleAddSpell(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;

    const uuid = element.dataset.uuid;

    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.addSpell(uuid);
  }

  /**
   * Handle saving a custom list (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleSaveCustomList(event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.saveCustomList();
  }

  /**
   * Handle deleting a custom list (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleDeleteCustomList(event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.deleteCustomList();
  }

  /**
   * Handle restoring from original (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleRestoreOriginal(event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.restoreOriginal();
  }

  /**
   * Handle closing the manager (static entry point)
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleClose(_event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    instance.close();
  }

  /**
   * Handle showing documentation
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleShowDocumentation(_event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    instance.showDocumentation();
  }

  /**
   * Handle toggling the sidebar
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleToggleSidebar(event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    // Toggle the sidebar-collapsed class
    instance.element.classList.toggle('sidebar-collapsed');
  }

  /**
   * Handle spell level toggle action
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleToggleSpellLevel(event, _form) {
    // Find the parent spell-level container
    const levelContainer = event.target.closest('.spell-level');

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
   * Form handler (static entry point)
   * @param {Event} event - The submit event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The form data
   * @static
   */
  static async formHandler(event, form, formData) {
    event.preventDefault();
    // This will be used for saving customized spell lists
  }
}
