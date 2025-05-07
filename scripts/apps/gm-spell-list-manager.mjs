import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as actorSpellUtils from '../helpers/actor-spells.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import * as managerHelpers from '../helpers/spell-management.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
      toggleSpellLevel: GMSpellListManager.handleToggleSpellLevel,
      createNewList: GMSpellListManager.handleCreateNewList
    },
    classes: ['gm-spell-list-manager'],
    window: {
      icon: 'fas fa-bars-progress',
      resizable: true,
      minimizable: true
    },
    position: {
      width: Math.max(1100, window.innerWidth - 650),
      height: Math.max(600, window.innerHeight - 200)
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: TEMPLATES.GM.MAIN,
      templates: [TEMPLATES.GM.SPELL_LISTS, TEMPLATES.GM.LIST_CONTENT, TEMPLATES.GM.AVAILABLE_SPELLS]
    },
    footer: { template: TEMPLATES.GM.FOOTER }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /** Loading state */
  isLoading = true;

  /** Available spell lists */
  availableSpellLists = [];

  /** Currently selected spell list */
  selectedSpellList = null;

  /** Available spells for adding */
  availableSpells = [];

  /** Current filter state for available spells */
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

  /** Editing state */
  isEditing = false;

  /** Pending changes to apply on save */
  pendingChanges = {
    added: new Set(),
    removed: new Set()
  };

  /** Window title getter */
  get title() {
    return game.i18n.localize('SPELLMANAGER.Application.Title');
  }

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {object} options - ApplicationV2 options
   */
  constructor(options = {}) {
    super(options);

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
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /**
   * Prepare the application context data
   * @override
   */
  async _prepareContext(_options) {
    try {
      // Get basic context
      const context = {
        isLoading: this.isLoading,
        availableSpellLists: this.availableSpellLists,
        selectedSpellList: this.selectedSpellList,
        spellSchools: CONFIG.DND5E.spellSchools,
        spellLevels: CONFIG.DND5E.spellLevels,
        isEditing: this.isEditing,
        availableSpells: this.availableSpells,
        filterState: this.filterState,
        settings: {
          distanceUnit: game.settings.get(MODULE.ID, SETTINGS.DISTANCE_UNIT)
        }
      };

      if (this.isLoading) {
        return context;
      }

      // Get mappings for custom lists
      const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
      context.customListMap = customMappings;

      // If we have available spells, prepare filter options
      if (this.availableSpells.length > 0) {
        // Get unique sources
        const sourceMap = new Map();
        sourceMap.set('all', {
          id: 'all',
          label: game.i18n.localize('SPELLMANAGER.Filters.AllSources')
        });

        // Add each unique source from available spells
        this.availableSpells.forEach((spell) => {
          if (spell.sourceId) {
            // Extract just the package name
            const sourceId = spell.sourceId.split('.')[0];
            if (!sourceMap.has(sourceId)) {
              sourceMap.set(sourceId, {
                id: sourceId,
                label: spell.packName?.split(' - ')[0] || sourceId
              });
            }
          }
        });

        // Convert to array and sort
        context.spellSources = Array.from(sourceMap.values()).sort((a, b) => {
          // Always keep "all" at the top
          if (a.id === 'all') return -1;
          if (b.id === 'all') return 1;
          return a.label.localeCompare(b.label);
        });

        // Prepare filter options
        context.castingTimeOptions = managerHelpers.prepareCastingTimeOptions(this.availableSpells, this.filterState);
        context.damageTypeOptions = managerHelpers.prepareDamageTypeOptions(this.filterState);
        context.conditionOptions = managerHelpers.prepareConditionOptions(this.filterState);

        // Apply filters
        context.filteredSpells = this.filterAvailableSpells();
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
              log(1, 'Error comparing versions:', error);
            }
          }
        }
      }

      return context;
    } catch (error) {
      log(1, 'Error preparing context:', error);
      return {
        isLoading: true
      };
    }
  }

  /**
   * Handle rendering the application
   * @override
   */
  _onRender(context, options) {
    super._onRender(context, options);

    try {
      // Start loading data if needed
      if (this.isLoading) {
        this.loadData();
        return;
      }

      // Set up event listeners
      this.setupFilterListeners();

      // Apply saved collapsed states
      this.applyCollapsedLevels();
    } catch (error) {
      log(1, 'Error during render:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Data Loading                                */
  /* -------------------------------------------- */

  /**
   * Load all required data
   */
  async loadData() {
    try {
      log(3, 'Loading spell lists for GM manager');

      // Clean up invalid mappings first
      await managerHelpers.getValidCustomListMappings();

      // Get all available spell lists from compendiums
      this.availableSpellLists = await managerHelpers.findCompendiumSpellLists();

      // Sort by name for better usability
      this.availableSpellLists.sort((a, b) => a.name.localeCompare(b.name));

      // Fetch all available spells for column 3
      this.availableSpells = await managerHelpers.fetchAllCompendiumSpells();
      await this.enrichAvailableSpells();
    } catch (error) {
      log(1, 'Error loading spell lists:', error);
    } finally {
      this.isLoading = false;
      this.render(false);
    }
  }

  /**
   * Enrich available spells with icons
   * @returns {Promise<void>}
   */
  async enrichAvailableSpells() {
    if (!this.availableSpells.length) return;

    log(3, 'Enriching available spells with icons');

    for (let spell of this.availableSpells) {
      try {
        spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
      } catch (error) {
        log(1, `Error enriching spell icon for ${spell.name}:`, error);
      }
    }

    log(3, 'Completed enriching available spells');
  }

  /**
   * Filter available spells based on current filter state
   * @returns {Object} Filtered spells with additional metadata
   */
  filterAvailableSpells() {
    try {
      const { name, level, school, source, castingTime, minRange, maxRange, damageType, condition, requiresSave, concentration, ritual } = this.filterState;

      // Get selected spell UUIDs to avoid showing spells already in the list
      const selectedSpellUUIDs = this.getSelectedSpellUUIDs();
      log(3, 'Beginning Filtering:', selectedSpellUUIDs.size, 'selected spells out of', this.availableSpells.length, 'total available');

      let remainingSpells = [...this.availableSpells];

      // Filter: Already in list
      remainingSpells = remainingSpells.filter((spell) => !this.isSpellInSelectedList(spell, selectedSpellUUIDs));
      log(3, 'After in-list filter:', remainingSpells.length, 'spells remaining');

      // Filter: Source
      if (source && source.trim() !== '' && source !== 'all') {
        const beforeCount = remainingSpells.length;
        remainingSpells = remainingSpells.filter((spell) => {
          const spellSource = (spell.sourceId || '').split('.')[0]; // Get just the package name
          const packName = spell.packName || '';

          // More flexible source matching
          const sourceMatch = spellSource.includes(source) || spellSource === source || packName.toLowerCase().includes(source.toLowerCase());

          return sourceMatch;
        });

        // If no spells remain after filtering by source, reset to all spells
        if (remainingSpells.length === 0 && beforeCount > 0) {
          log(3, `Source '${source}' filtered out all spells, resetting to show all sources`);
          remainingSpells = [...this.availableSpells].filter((spell) => !this.isSpellInSelectedList(spell, selectedSpellUUIDs));
          source = 'all'; // Reset source filter
        } else {
          log(3, `After source filter: ${remainingSpells.length} spells remaining. Source filter: ${source}`);
        }
      } else {
        // "all" is selected or empty - don't filter by source
        log(3, 'Source filter is unset or "all", showing all sources');
      }

      // Filter: Name
      if (name) {
        remainingSpells = remainingSpells.filter((spell) => spell.name.toLowerCase().includes(name.toLowerCase()));
        log(3, 'After name filter:', remainingSpells.length, 'spells remaining');
      }

      // Filter: Level
      if (level) {
        remainingSpells = remainingSpells.filter((spell) => spell.level === parseInt(level));
        log(3, 'After level filter:', remainingSpells.length, 'spells remaining');
      }

      // Filter: School
      if (school) {
        remainingSpells = remainingSpells.filter((spell) => spell.school === school);
        log(3, 'After school filter:', remainingSpells.length, 'spells remaining');
      }

      // Filter: Casting Time
      if (castingTime) {
        remainingSpells = remainingSpells.filter((spell) => {
          const [filterType, filterValue] = castingTime.split(':');
          const spellCastingType = spell.filterData?.castingTime?.type || spell.system?.activation?.type || '';
          const spellCastingValue = String(spell.filterData?.castingTime?.value || spell.system?.activation?.value || '1');
          return spellCastingType === filterType && spellCastingValue === filterValue;
        });
        log(3, 'After casting time filter:', remainingSpells.length, 'spells remaining');
      }

      // Filter: Range
      if (minRange || maxRange) {
        remainingSpells = remainingSpells.filter((spell) => {
          if (!(spell.filterData?.range?.units || spell.system?.range?.units)) return true;

          const rangeUnits = spell.filterData?.range?.units || spell.system?.range?.units || '';
          const rangeValue = parseInt(spell.system?.range?.value || 0);

          let standardizedRange = rangeValue;
          if (rangeUnits === 'mi') {
            standardizedRange = rangeValue * 5280;
          } else if (rangeUnits === 'spec') {
            standardizedRange = 0;
          }

          const minRangeVal = minRange ? parseInt(minRange) : 0;
          const maxRangeVal = maxRange ? parseInt(maxRange) : Infinity;

          return standardizedRange >= minRangeVal && standardizedRange <= maxRangeVal;
        });
        log(3, 'After range filter:', remainingSpells.length, 'spells remaining');
      }

      // Filter: Damage Type
      if (damageType) {
        remainingSpells = remainingSpells.filter((spell) => {
          const spellDamageTypes = Array.isArray(spell.filterData?.damageTypes) ? spell.filterData.damageTypes : [];
          return spellDamageTypes.length > 0 && spellDamageTypes.includes(damageType);
        });
        log(3, 'After damage type filter:', remainingSpells.length, 'spells remaining');
      }

      // Filter: Condition
      if (condition) {
        remainingSpells = remainingSpells.filter((spell) => {
          const spellConditions = Array.isArray(spell.filterData?.conditions) ? spell.filterData.conditions : [];
          return spellConditions.includes(condition);
        });
        log(3, 'After condition filter:', remainingSpells.length, 'spells remaining');
      }

      // Filter: Requires Save
      if (requiresSave) {
        remainingSpells = remainingSpells.filter((spell) => {
          const spellRequiresSave = spell.filterData?.requiresSave || false;
          return (requiresSave === 'true' && spellRequiresSave) || (requiresSave === 'false' && !spellRequiresSave);
        });
        log(3, 'After save filter:', remainingSpells.length, 'spells remaining');
      }

      // Filter: Concentration
      if (concentration) {
        remainingSpells = remainingSpells.filter((spell) => {
          const requiresConcentration = !!spell.filterData?.concentration;
          return (concentration === 'true' && requiresConcentration) || (concentration === 'false' && !requiresConcentration);
        });
      }

      // Filter: Ritual
      if (ritual) {
        remainingSpells = remainingSpells.filter((spell) => {
          return !!spell.filterData?.isRitual;
        });
        log(3, 'After ritual filter:', remainingSpells.length, 'spells remaining');
      }

      log(3, 'Final spells count:', remainingSpells.length);

      // Return filtered spells and count
      return {
        spells: remainingSpells,
        totalFiltered: remainingSpells.length
      };
    } catch (error) {
      log(1, 'Error filtering available spells:', error);
      return { spells: [], totalFiltered: 0 };
    }
  }

  /**
   * Check if a spell is already in the selected spell list
   * @param {Object} spell - The spell to check
   * @param {Set<string>} selectedSpellUUIDs - Set of normalized selected spell UUIDs
   * @returns {boolean} - Whether the spell is already in the selected list
   */
  isSpellInSelectedList(spell, selectedSpellUUIDs) {
    try {
      if (!selectedSpellUUIDs.size) return false;

      // Direct UUID match
      if (selectedSpellUUIDs.has(spell.uuid)) return true;

      // ID part match
      const spellIdPart = spell.uuid.split('.').pop();
      if (spellIdPart && selectedSpellUUIDs.has(spellIdPart)) return true;

      // Try normalized comparison
      try {
        const parsedUuid = foundry.utils.parseUuid(spell.uuid);
        if (parsedUuid.collection) {
          const normalizedId = `Compendium.${parsedUuid.collection.collection}.${parsedUuid.id}`;
          if (selectedSpellUUIDs.has(normalizedId)) return true;
        }
      } catch (e) {
        log(2, 'Unable to Parse UUID.', spell.uuid, spellIdPart);
      }

      return false;
    } catch (error) {
      log(1, 'Error checking if spell is in selected list:', error);
      return false;
    }
  }

  /**
   * Get normalized UUIDs for the selected spell list
   * @returns {Set<string>} Set of normalized UUIDs
   */
  getSelectedSpellUUIDs() {
    try {
      // Return empty set if no selected spell list
      if (!this.selectedSpellList?.spells) return new Set();

      // Create a new set for normalization
      const selectedSpellUUIDs = new Set();

      for (const spell of this.selectedSpellList.spells) {
        if (spell.compendiumUuid) {
          try {
            // Parse UUID to get core components
            const parsedUuid = foundry.utils.parseUuid(spell.compendiumUuid);

            // Create a normalized reference
            if (parsedUuid.collection) {
              const normalizedId = `Compendium.${parsedUuid.collection.collection}.${parsedUuid.id}`;
              selectedSpellUUIDs.add(normalizedId);
            }

            // Also add the original UUID
            selectedSpellUUIDs.add(spell.compendiumUuid);

            // Also add just the ID part
            const idPart = spell.compendiumUuid.split('.').pop();
            if (idPart) {
              selectedSpellUUIDs.add(idPart);
            }
          } catch (e) {
            log(1, `Error parsing UUID for ${spell.name}:`, e);
          }
        }
      }

      return selectedSpellUUIDs;
    } catch (error) {
      log(1, 'Error getting normalized selected spell UUIDs:', error);
      return new Set();
    }
  }

  /**
   * Apply all current filters to the UI
   */
  applyFilters() {
    try {
      log(3, 'Applying filters to available spells');

      // Calculate filtered results
      const filteredData = this.filterAvailableSpells();

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
   */
  setupFilterListeners() {
    try {
      // Only set up listeners if we're in the editing state
      if (!this.isEditing) return;

      // Name input
      const nameInput = this.element.querySelector('input[name="spell-search"]');
      if (nameInput) {
        nameInput.addEventListener('input', (event) => {
          this.filterState.name = event.target.value;
          // Debounce filter application
          clearTimeout(this._nameFilterTimer);
          this._nameFilterTimer = setTimeout(() => {
            this.applyFilters();
          }, 200);
        });
      }

      // Dropdown selects
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
          element.addEventListener('change', (event) => {
            const oldValue = this.filterState[property];
            const newValue = event.target.value;

            // Only update and filter if value changed
            if (oldValue !== newValue) {
              this.filterState[property] = newValue;
              this.applyFilters();
            }
          });
        }
      }

      // Range inputs
      const rangeInputs = ['input[name="spell-min-range"]', 'input[name="spell-max-range"]'];

      rangeInputs.forEach((selector) => {
        const input = this.element.querySelector(selector);
        if (input) {
          input.addEventListener('input', (event) => {
            const property = event.target.name === 'spell-min-range' ? 'minRange' : 'maxRange';
            const oldValue = this.filterState[property];
            const newValue = event.target.value;

            // Only update if value changed
            if (oldValue !== newValue) {
              this.filterState[property] = newValue;

              // Debounce range filter application
              clearTimeout(this._rangeFilterTimer);
              this._rangeFilterTimer = setTimeout(() => {
                this.applyFilters();
              }, 20);
            }
          });
        }
      });

      // Checkbox inputs
      const checkboxSelectors = [{ selector: 'input[name="spell-ritual"]', property: 'ritual' }];

      for (const { selector, property } of checkboxSelectors) {
        const element = this.element.querySelector(selector);
        if (element) {
          element.addEventListener('change', (event) => {
            const oldValue = this.filterState[property];
            const newValue = event.target.checked;

            // Only update if value changed
            if (oldValue !== newValue) {
              this.filterState[property] = newValue;
              this.applyFilters();
            }
          });
        }
      }
    } catch (error) {
      log(1, 'Error setting up filter listeners:', error);
    }
  }

  /**
   * Apply saved collapsed levels state
   */
  applyCollapsedLevels() {
    try {
      const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS) || [];

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

  /* -------------------------------------------- */
  /*  Spell List Operations                       */
  /* -------------------------------------------- */

  /**
   * Load spell details for the selected spell list
   * @param {Array} spellUuids - Array of spell UUIDs
   */
  async loadSpellDetails(spellUuids) {
    if (!this.selectedSpellList) return;

    try {
      // Update UI to show loading state
      this.selectedSpellList.isLoadingSpells = true;
      this.render(false);

      // Fetch spell documents
      const spellDocs = await actorSpellUtils.fetchSpellDocuments(new Set(spellUuids), 9);

      // Organize spells by level
      const spellLevels = await actorSpellUtils.organizeSpellsByLevel(spellDocs, null);

      // Create icons for each spell
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
        }
      }

      // Store both the flat list and the organized levels
      this.selectedSpellList.spells = spellDocs;
      this.selectedSpellList.spellsByLevel = spellLevels;
      this.selectedSpellList.isLoadingSpells = false;

      // Render the updated view
      this.render(false);

      log(3, `Loaded ${spellDocs.length} spells for selected spell list`);
    } catch (error) {
      log(1, 'Error loading spell details:', error);
      this.selectedSpellList.isLoadingSpells = false;
      this.render(false);
    }
  }

  /**
   * Create a confirmation dialog with standardized template
   * @param {Object} options - Dialog options
   * @returns {Promise<boolean>} True if confirmed, false otherwise
   */
  async confirmDialog({
    title = game.i18n.localize('SPELLMANAGER.Confirm.Title'),
    content = game.i18n.localize('SPELLMANAGER.Confirm.Content'),
    confirmLabel = game.i18n.localize('SPELLMANAGER.Confirm.Confirm'),
    confirmIcon = 'fas fa-check',
    cancelLabel = game.i18n.localize('SPELLMANAGER.Confirm.Cancel'),
    cancelIcon = 'fas fa-times',
    confirmCssClass = ''
  }) {
    try {
      const result = await DialogV2.wait({
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
    } catch (error) {
      log(1, 'Error showing confirmation dialog:', error);
      return false;
    }
  }

  /* -------------------------------------------- */
  /*  Action Methods                              */
  /* -------------------------------------------- */

  /**
   * Select a spell list
   * @param {string} uuid - UUID of the spell list
   * @returns {Promise<void>}
   */
  async selectSpellList(uuid) {
    try {
      log(3, `Selecting spell list: ${uuid}`);

      // Check if we have a custom version
      const duplicate = await managerHelpers.findDuplicateSpellList(uuid);

      // If a duplicate exists and we're not the duplicate, select it instead
      if (duplicate && duplicate.uuid !== uuid) {
        log(3, `Found custom version, selecting instead: ${duplicate.uuid}`);
        return this.selectSpellList(duplicate.uuid);
      }

      // Get the spell list document
      const spellList = await fromUuid(uuid);
      if (!spellList) {
        log(1, 'Spell list not found.');
        return;
      }

      // Reset editing state
      this.isEditing = false;

      // Extract spell UUIDs
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

      // Try to set appropriate source filter
      this.determineSourceFilter(spellList);

      // Render to show loading state
      this.render(false);

      // Load the spell details
      await this.loadSpellDetails(spellUuids);
    } catch (error) {
      log(1, 'Error selecting spell list:', error);
    }
  }

  /**
   * Determine appropriate source filter for a spell list
   * @param {Object} spellList - The spell list document
   */
  determineSourceFilter(spellList) {
    try {
      log(3, 'Determining source filter for spell list');

      // Default to "all" - show all sources
      let sourceFilter = 'all';

      // Check if this is a custom list
      const isCustomList = !!spellList.flags?.[MODULE.ID]?.isDuplicate;

      if (isCustomList) {
        // Get original UUID and extract the pack
        const originalUuid = spellList.flags?.[MODULE.ID]?.originalUuid;
        if (originalUuid) {
          try {
            const parsedUuid = foundry.utils.parseUuid(originalUuid);
            // Extract just the package name (first part before the dot)
            const packageName = parsedUuid.collection.metadata.packageName.split('.')[0];
            sourceFilter = packageName;
            log(3, `Using original source: ${sourceFilter}`);
          } catch (e) {
            log(1, `Error parsing original UUID: ${e.message}`);
          }
        }
      } else if (spellList.pack) {
        // Extract just the package name (first part before the dot)
        const packageName = spellList.pack.split('.')[0];
        sourceFilter = packageName;
        log(3, `Using current pack source: ${sourceFilter}`);
      }

      // Set the filter
      this.filterState.source = sourceFilter;
      log(3, `Set source filter to: ${sourceFilter}`);
    } catch (error) {
      log(1, 'Error determining source filter:', error);
      this.filterState.source = 'all'; // Default to all on error
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

      // Reset pending changes
      this.pendingChanges = {
        added: new Set(),
        removed: new Set()
      };

      // Get flags for this list
      const flags = this.selectedSpellList.document.flags?.[MODULE.ID] || {};

      // Check if this is already any type of custom list:
      // - Either a duplicate (isDuplicate=true)
      // - OR a true custom list (isCustom=true or isNewList=true)
      const isCustom = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;

      if (!isCustom) {
        // Store original source - just take the package name (first part before any dots)
        let originalSource = '';
        if (this.selectedSpellList.document.pack) {
          // Extract just the first part of the pack name, removing any .xyz suffixes
          originalSource = this.selectedSpellList.document.pack.split('.')[0];
          log(3, `Stored original source: ${originalSource}`);
        }

        // Duplicate the list
        const duplicateList = await managerHelpers.duplicateSpellList(this.selectedSpellList.document);

        // Switch to the duplicate while preserving spell data
        const spells = this.selectedSpellList.spells;
        const spellsByLevel = this.selectedSpellList.spellsByLevel;
        const spellUuids = this.selectedSpellList.spellUuids;

        this.selectedSpellList = {
          document: duplicateList,
          uuid: duplicateList.uuid,
          name: duplicateList.name,
          spellUuids: spellUuids,
          spells: spells,
          spellsByLevel: spellsByLevel,
          isLoadingSpells: false
        };

        // Preserve original source without suffixes
        if (originalSource) {
          this.filterState.source = originalSource;
          log(3, `Preserved source for filtering: ${originalSource}`);
        }
      } else {
        log(3, `List is already custom (${flags.isDuplicate ? 'duplicate' : 'new'}), proceeding with edit directly`);
      }

      // Enter editing mode
      this.isEditing = true;

      // Reset source filter to "all" to ensure spells are visible
      this.filterState.source = 'all';
      log(3, 'Reset source filter to "all" for editing');

      // First render to update UI state
      this.render(false);

      // Explicitly update available spells - important to do this AFTER render
      // This forces a full refilter with proper state
      setTimeout(() => {
        this.applyFilters();
      }, 100);
    } catch (error) {
      log(1, 'Error entering edit mode:', error);
    }
  }

  /**
   * Remove a spell from the selected spell list
   * @param {string} spellUuid - UUID of the spell to remove
   * @returns {Promise<void>}
   */
  async removeSpell(spellUuid) {
    if (!this.selectedSpellList || !this.isEditing) return;

    try {
      log(3, `Removing spell: ${spellUuid} in pending changes`);

      // Add to removed list
      this.pendingChanges.removed.add(spellUuid);

      // Remove from added if it was there
      this.pendingChanges.added.delete(spellUuid);

      // Find all forms of the UUID for proper matching
      const normalizedForms = managerHelpers.normalizeUuid(spellUuid);

      // Remove from the spellUuids array
      this.selectedSpellList.spellUuids = this.selectedSpellList.spellUuids.filter((uuid) => !normalizedForms.includes(uuid));

      // Remove from spells array - match by any normalized form
      this.selectedSpellList.spells = this.selectedSpellList.spells.filter((spell) => {
        const spellUuids = [spell.uuid, spell.compendiumUuid, ...(spell._id ? [spell._id] : [])];

        // Keep the spell if none of its IDs match any normalized form
        return !spellUuids.some((id) => normalizedForms.includes(id));
      });

      // Re-organize spells by level
      this.selectedSpellList.spellsByLevel = await actorSpellUtils.organizeSpellsByLevel(this.selectedSpellList.spells, null);

      // For all spells in spellsByLevel, ensure they have icons
      for (const level of this.selectedSpellList.spellsByLevel) {
        for (const s of level.spells) {
          if (!s.enrichedIcon) {
            s.enrichedIcon = formattingUtils.createSpellIconLink(s);
          }
        }
      }

      // Re-render to show changes
      this.render(false);

      // Apply filters to show the removed spell in available spells
      this.applyFilters();
    } catch (error) {
      log(1, 'Error removing spell:', error);
    }
  }

  /**
   * Add a spell to the selected spell list
   * @param {string} spellUuid - UUID of the spell to add
   * @returns {Promise<void>}
   */
  async addSpell(spellUuid) {
    if (!this.selectedSpellList || !this.isEditing) return;

    try {
      log(3, `Adding spell: ${spellUuid} to pending changes`);

      // Add to pending changes
      this.pendingChanges.added.add(spellUuid);

      // Remove from removed if it was there
      this.pendingChanges.removed.delete(spellUuid);

      // Find the spell in availableSpells
      const spell = this.availableSpells.find((s) => s.uuid === spellUuid);

      if (spell) {
        // Create a copy to avoid reference issues
        const spellCopy = foundry.utils.deepClone(spell);

        // Ensure it has enrichedIcon
        if (!spellCopy.enrichedIcon) {
          spellCopy.enrichedIcon = formattingUtils.createSpellIconLink(spellCopy);
        }

        // Add to the display (but not to the document yet)
        this.selectedSpellList.spellUuids.push(spellUuid);
        this.selectedSpellList.spells.push(spellCopy);

        // Re-organize spells by level preserving icons
        this.selectedSpellList.spellsByLevel = await actorSpellUtils.organizeSpellsByLevel(this.selectedSpellList.spells, null);

        // For all spells in spellsByLevel, ensure they have icons
        for (const level of this.selectedSpellList.spellsByLevel) {
          for (const s of level.spells) {
            if (!s.enrichedIcon) {
              s.enrichedIcon = formattingUtils.createSpellIconLink(s);
            }
          }
        }

        // Re-render to show changes
        this.render(false);

        // Apply filters to hide the added spell from available spells
        this.applyFilters();
      }
    } catch (error) {
      log(1, 'Error adding spell:', error);
    }
  }

  /**
   * Save the custom spell list
   * @returns {Promise<void>}
   */
  async saveCustomList() {
    if (!this.selectedSpellList || !this.isEditing) return;

    try {
      log(3, 'Saving custom spell list with pending changes');

      // Get the current spell list
      const document = this.selectedSpellList.document;
      const currentSpells = new Set(document.system.spells || []);

      // Process removals first
      log(3, `Processing ${this.pendingChanges.removed.size} spell removals`);
      for (const spellUuid of this.pendingChanges.removed) {
        // Normalize the UUID for matching
        const normalizedForms = managerHelpers.normalizeUuid(spellUuid);

        // Check each spell in the list against all normalized forms
        for (const existingUuid of currentSpells) {
          if (normalizedForms.includes(existingUuid)) {
            currentSpells.delete(existingUuid);
            log(3, `Removed spell ${existingUuid} from list`);
          }
        }
      }

      // Process additions
      log(3, `Processing ${this.pendingChanges.added.size} spell additions`);
      for (const spellUuid of this.pendingChanges.added) {
        currentSpells.add(spellUuid);
        log(3, `Added spell ${spellUuid} to list`);
      }

      // Update the document
      await document.update({
        'system.spells': Array.from(currentSpells)
      });

      // Reset pending changes
      this.pendingChanges = {
        added: new Set(),
        removed: new Set()
      };

      // Exit edit mode
      this.isEditing = false;

      // Refresh the spell list to ensure everything is up to date
      await this.selectSpellList(document.uuid);
    } catch (error) {
      log(1, 'Error saving spell list:', error);
    }
  }

  /**
   * Delete the current custom spell list
   * @returns {Promise<void>}
   */
  async deleteCustomList() {
    if (!this.selectedSpellList) return;

    const uuid = this.selectedSpellList.uuid;
    const listName = this.selectedSpellList.name;

    // Confirm deletion
    const confirmed = await this.confirmDialog({
      title: game.i18n.localize('SPELLMANAGER.Confirm.DeleteTitle'),
      content: game.i18n.format('SPELLMANAGER.Confirm.DeleteContent', { name: listName }),
      confirmLabel: game.i18n.localize('SPELLMANAGER.Confirm.DeleteButton'),
      confirmIcon: 'fas fa-trash',
      confirmCssClass: 'dialog-button-danger'
    });

    if (!confirmed) return;

    try {
      // Remove the custom list
      await managerHelpers.removeCustomSpellList(uuid);

      // Clear selection
      this.selectedSpellList = null;
      this.isEditing = false;

      // Re-render
      this.render(false);
    } catch (error) {
      log(1, 'Error deleting custom spell list:', error);
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

    // Confirm restoration
    const confirmed = await this.confirmDialog({
      title: 'Restore from Original',
      content: `Are you sure you want to restore <strong>${listName}</strong> from the original source? Your customizations will be lost.`,
      confirmLabel: 'Restore',
      confirmIcon: 'fas fa-sync',
      confirmCssClass: 'dialog-button-warning'
    });

    if (!confirmed) return;

    try {
      // Get the original list
      const originalList = await fromUuid(originalUuid);
      if (!originalList) {
        return;
      }

      // Get original spells
      const originalSpells = Array.from(originalList.system.spells || []);

      // Update the custom list
      await this.selectedSpellList.document.update({
        'system.spells': originalSpells,
        [`flags.${MODULE.ID}.originalModTime`]: originalList._stats?.modifiedTime || 0,
        [`flags.${MODULE.ID}.originalVersion`]: originalList._stats?.systemVersion || game.system.version
      });

      // Update our data and reload spell details
      this.selectedSpellList.spellUuids = originalSpells;
      await this.loadSpellDetails(originalSpells);

      // Exit edit mode
      this.isEditing = false;

      // Re-render
      this.render(false);
    } catch (error) {
      log(1, 'Error restoring from original:', error);
    }
  }

  /**
   * Show the documentation dialog
   * @returns {Promise<void>}
   */
  async showDocumentation() {
    try {
      log(3, 'Opening documentation dialog');

      // Render the template with minimal context
      const content = await renderTemplate(TEMPLATES.DIALOGS.MANAGER_DOCUMENTATION, {});

      // Show the dialog with the rendered template
      await DialogV2.wait({
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
      log(3, 'Documentation dialog displayed');
    } catch (error) {
      log(1, 'Error showing documentation:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

  /**
   * Handle selecting a spell list
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleSelectSpellList(event, _form) {
    try {
      const element = event.target.closest('[data-uuid]');
      if (!element) return;

      const uuid = element.dataset.uuid;

      // Get the application instance
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);

      if (!instance) {
        log(1, 'Could not find GMSpellListManager instance');
        return;
      }

      await instance.selectSpellList(uuid);
    } catch (error) {
      log(1, 'Error handling select spell list:', error);
    }
  }

  /**
   * Handle clicking the edit button
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleEditSpellList(event, _form) {
    try {
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
    } catch (error) {
      log(1, 'Error handling edit spell list:', error);
    }
  }

  /**
   * Handle removing a spell
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleRemoveSpell(event, _form) {
    try {
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
    } catch (error) {
      log(1, 'Error handling remove spell:', error);
    }
  }

  /**
   * Handle adding a spell
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleAddSpell(event, _form) {
    try {
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
    } catch (error) {
      log(1, 'Error handling add spell:', error);
    }
  }

  /**
   * Handle saving a custom list
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleSaveCustomList(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);

      if (!instance) {
        log(1, 'Could not find GMSpellListManager instance');
        return;
      }

      await instance.saveCustomList();
    } catch (error) {
      log(1, 'Error handling save custom list:', error);
    }
  }

  /**
   * Handle deleting a custom list
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleDeleteCustomList(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);

      if (!instance) {
        log(1, 'Could not find GMSpellListManager instance');
        return;
      }

      await instance.deleteCustomList();
    } catch (error) {
      log(1, 'Error handling delete custom list:', error);
    }
  }

  /**
   * Handle restoring from original
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleRestoreOriginal(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);

      if (!instance) {
        log(1, 'Could not find GMSpellListManager instance');
        return;
      }

      await instance.restoreOriginal();
    } catch (error) {
      log(1, 'Error handling restore original:', error);
    }
  }

  /**
   * Handle closing the manager
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleClose(_event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);

      if (!instance) {
        log(1, 'Could not find GMSpellListManager instance');
        return;
      }

      instance.close();
    } catch (error) {
      log(1, 'Error handling close:', error);
    }
  }

  /**
   * Handle showing documentation
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleShowDocumentation(_event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);

      if (!instance) {
        log(1, 'Could not find GMSpellListManager instance');
        return;
      }

      instance.showDocumentation();
    } catch (error) {
      log(1, 'Error handling show documentation:', error);
    }
  }

  /**
   * Handle toggling the sidebar
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleToggleSidebar(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);

      if (!instance) {
        log(1, 'Could not find GMSpellListManager instance');
        return;
      }

      // Toggle the sidebar-collapsed class
      instance.element.classList.toggle('sidebar-collapsed');
    } catch (error) {
      log(1, 'Error handling toggle sidebar:', error);
    }
  }

  /**
   * Handle spell level toggle action
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleToggleSpellLevel(event, _form) {
    try {
      // Find the parent spell-level container
      const levelContainer = event.target.closest('.spell-level');

      if (!levelContainer || !levelContainer.classList.contains('spell-level')) {
        return;
      }

      const levelId = levelContainer.dataset.level;

      // Toggle collapsed state
      levelContainer.classList.toggle('collapsed');

      // Save state to user flags
      const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS) || [];
      const isCollapsed = levelContainer.classList.contains('collapsed');
      if (isCollapsed && !collapsedLevels.includes(levelId)) {
        collapsedLevels.push(levelId);
      } else if (!isCollapsed && collapsedLevels.includes(levelId)) {
        collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
      }

      game.user.setFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS, collapsedLevels);
    } catch (error) {
      log(1, 'Error handling toggle spell level:', error);
    }
  }

  /**
   * Handle creating a new spell list
   */
  async createNewList() {
    try {
      // Get class identifiers
      const classIdentifiers = await managerHelpers.findClassIdentifiers();

      // Format identifiers for the template
      const identifierOptions = Object.entries(classIdentifiers)
        .sort(([, dataA], [, dataB]) => dataA.name.localeCompare(dataB.name))
        .map(([id, data]) => ({
          id: id,
          name: data.fullDisplay,
          plainName: data.name
        }));

      // Render template with data
      const content = await renderTemplate(TEMPLATES.DIALOGS.CREATE_SPELL_LIST, {
        identifierOptions
      });

      // Store form data
      let formData = null;

      // Use DialogV2
      const dialogResult = await DialogV2.wait({
        window: { title: game.i18n.localize('SPELLMANAGER.Buttons.CreateNew'), icon: 'fas fa-star' },
        content: content,
        buttons: [
          {
            label: game.i18n.localize('SPELLMANAGER.Buttons.CreateNew'),
            icon: 'fas fa-check',
            action: 'create',
            callback: (event, target, form) => {
              // Capture form data
              const nameInput = form.querySelector('[name="name"]');
              const identifierSelect = form.querySelector('[name="identifier"]');
              const customIdentifierInput = form.querySelector('[name="customIdentifier"]');

              if (!identifierSelect) return false;

              // Get the name, or leave empty to use default
              let name = nameInput.value.trim();
              let identifier = '';
              let defaultClassName = '';

              // Check if using custom identifier
              if (identifierSelect.value === 'custom') {
                identifier = customIdentifierInput?.value || '';

                // Validate custom identifier format
                const identifierPattern = /^[a-z0-9_-]+$/;
                if (!identifierPattern.test(identifier)) {
                  // Show validation error
                  const errorElement = form.querySelector('.validation-error');
                  if (errorElement) errorElement.style.display = 'block';
                  customIdentifierInput.focus();
                  return false;
                }

                // If name is empty, use identifier as default name (capitalized)
                defaultClassName = identifier.charAt(0).toUpperCase() + identifier.slice(1);
              } else {
                identifier = identifierSelect.value;

                // Find the matching class data to get the plain name
                const selectedOption = identifierOptions.find((opt) => opt.id === identifier);
                if (selectedOption) {
                  defaultClassName = selectedOption.plainName;
                }
              }

              // If name is empty, use the default class name
              if (!name && defaultClassName) {
                name = defaultClassName;
              }

              // Final validation - we must have both name and identifier
              if (!name || !identifier) return false;

              formData = { name, identifier };
              return 'create';
            }
          },
          {
            label: game.i18n.localize('SPELLMANAGER.Confirm.Cancel'),
            icon: 'fas fa-times',
            action: 'cancel'
          }
        ],
        default: 'cancel',
        render: (event, target, form) => {
          // Show custom field when "Custom..." is selected
          const identifierSelect = target.querySelector('#class-identifier');
          const customField = target.querySelector('.custom-id-group');
          const customIdentifierInput = target.querySelector('#custom-identifier');
          const createButton = target.querySelector('button[data-action="create"]');

          if (identifierSelect && customField && customIdentifierInput) {
            // Initial setup
            identifierSelect.addEventListener('change', (e) => {
              if (e.target.value === 'custom') {
                customField.style.display = 'block';

                // Check initial validity when switching to custom
                const isValid = /^[a-z0-9_-]+$/.test(customIdentifierInput.value);
                createButton.disabled = customIdentifierInput.value !== '' && !isValid;

                // Show validation error if needed
                const errorElement = target.querySelector('.validation-error');
                if (errorElement) {
                  errorElement.style.display = customIdentifierInput.value !== '' && !isValid ? 'block' : 'none';
                }
              } else {
                customField.style.display = 'none';
                // Enable button when using predefined identifiers
                createButton.disabled = false;
                // Hide any validation errors when switching away
                const errorElement = target.querySelector('.validation-error');
                if (errorElement) errorElement.style.display = 'none';
              }
            });

            // Add real-time validation for custom identifier
            customIdentifierInput.addEventListener('input', (e) => {
              const value = e.target.value;
              const isValid = /^[a-z0-9_-]+$/.test(value);
              const errorElement = target.querySelector('.validation-error');

              // Show/hide error message
              if (errorElement) {
                errorElement.style.display = isValid || value === '' ? 'none' : 'block';
              }

              // Enable/disable create button based on validation
              createButton.disabled = value !== '' && !isValid;

              // Visual feedback on the input
              if (value !== '') {
                customIdentifierInput.classList.toggle('error', !isValid);
              } else {
                customIdentifierInput.classList.remove('error');
                // Empty is invalid, so disable button
                createButton.disabled = true;
              }
            });
          }
        }
      });

      // Process the captured form data
      if (dialogResult === 'create' && formData) {
        await this._createNewListCallback(formData.name, formData.identifier);
      }
    } catch (error) {
      log(1, 'Error creating new list:', error);
    }
  }

  /**
   * Callback to actually create the new list after dialog
   */
  async _createNewListCallback(name, identifier) {
    try {
      const source = game.i18n.localize('SPELLMANAGER.CreateList.Custom');
      const newList = await managerHelpers.createNewSpellList(name, identifier, source);

      if (newList) {
        await this.loadData();
        await this.selectSpellList(newList.uuid);
      }
    } catch (error) {
      log(1, `Error creating list: ${error.message}`);
    }
  }

  // Fixed handler function
  static async handleCreateNewList(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);

      if (!instance) {
        log(1, 'Could not find GMSpellListManager instance');
        return;
      }

      await instance.createNewList();
    } catch (error) {
      log(1, 'Error handling create new list:', error);
    }
  }

  /**
   * Form handler
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
