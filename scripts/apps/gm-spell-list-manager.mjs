import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as actorSpellUtils from '../helpers/actor-spells.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import * as managerHelpers from '../helpers/spell-management.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM Spell List Manager application for viewing, editing, and creating spell lists
 */
export class GMSpellListManager extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `gm-spell-list-manager-${MODULE.ID}`,
    tag: 'div',
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
      toggleFolder: GMSpellListManager.handleToggleFolder,
      openActor: GMSpellListManager.handleOpenActor,
      openClass: GMSpellListManager.handleOpenClass,
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
    container: { template: TEMPLATES.GM.MAIN },
    spellLists: { template: TEMPLATES.GM.SPELL_LISTS, scrollable: ['.lists-container'] },
    listContent: { template: TEMPLATES.GM.LIST_CONTENT, scrollable: ['.selected-list-spells'] },
    availableSpells: { template: TEMPLATES.GM.AVAILABLE_SPELLS, scrollable: ['.available-spells-wrapper'] },
    footer: { template: TEMPLATES.GM.FOOTER }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /** @type {boolean} Loading state */
  isLoading = true;

  /** @type {Array} Available spell lists */
  availableSpellLists = [];

  /** @type {Object|null} Currently selected spell list */
  selectedSpellList = null;

  /** @type {Array} Available spells for adding */
  availableSpells = [];

  /** @type {Object} Current filter state for available spells */
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

  /** @type {boolean} Editing state */
  isEditing = false;

  /** @type {Object} Pending changes to apply on save */
  pendingChanges = {
    added: new Set(),
    removed: new Set()
  };

  /**
   * @returns {string} The application title
   */
  get title() {
    return game.i18n.localize('SPELLMANAGER.Application.Title');
  }

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Object} options - Application options
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

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isLoading = this.isLoading;
    context.availableSpellLists = this.availableSpellLists;
    context.selectedSpellList = this.selectedSpellList;
    context.spellSchools = CONFIG.DND5E.spellSchools;
    context.spellLevels = CONFIG.DND5E.spellLevels;
    context.isEditing = this.isEditing;
    context.availableSpells = this.availableSpells;
    context.filterState = this.filterState;
    context.settings = { distanceUnit: game.settings.get(MODULE.ID, SETTINGS.DISTANCE_UNIT) };

    if (!this.isLoading && this.availableSpellLists?.length) {
      const actorOwnedLists = this.availableSpellLists.filter((list) => list.isActorOwned);
      const customLists = this.availableSpellLists.filter((list) => !list.isActorOwned && (list.isCustom || list.document?.flags?.[MODULE.ID]?.isNewList));
      const standardLists = this.availableSpellLists.filter((list) => !list.isActorOwned && !customLists.includes(list));
      actorOwnedLists.sort((a, b) => {
        if (a.actorName && b.actorName) return a.actorName.localeCompare(b.actorName);
        if (a.actorName) return -1;
        if (b.actorName) return 1;
        return a.name.localeCompare(b.name);
      });
      customLists.sort((a, b) => a.name.localeCompare(b.name));
      standardLists.sort((a, b) => a.name.localeCompare(b.name));
      context.actorOwnedLists = actorOwnedLists;
      context.customLists = customLists;
      context.standardLists = standardLists;
      context.hasActorOwnedLists = actorOwnedLists.length > 0;
      context.hasCustomLists = customLists.length > 0;
      context.hasStandardLists = standardLists.length > 0;
    }

    if (this.isLoading) return context;
    const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
    context.customListMap = customMappings;
    if (this.availableSpells.length > 0) {
      context.spellSources = this._prepareSpellSources();
      context.castingTimeOptions = managerHelpers.prepareCastingTimeOptions(this.availableSpells, this.filterState);
      context.damageTypeOptions = managerHelpers.prepareDamageTypeOptions(this.filterState);
      context.conditionOptions = managerHelpers.prepareConditionOptions(this.filterState);
      context.filteredSpells = this.filterAvailableSpells();
    }

    if (this.isEditing && this.selectedSpellList) {
      await this._addEditingContext(context);
    }
    if (this.selectedSpellList) {
      context.selectedSpellList = this._processSpellListForDisplay(this.selectedSpellList);
    }

    return context;
  }

  /**
   * Prepare spell sources for filtering
   * @returns {Array} Array of source options
   * @private
   */
  _prepareSpellSources() {
    const sourceMap = new Map();
    sourceMap.set('all', {
      id: 'all',
      label: game.i18n.localize('SPELLMANAGER.Filters.AllSources')
    });

    // Add each unique source from available spells
    this.availableSpells.forEach((spell) => {
      if (spell.sourceId) {
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
    return Array.from(sourceMap.values()).sort((a, b) => {
      if (a.id === 'all') return -1;
      if (b.id === 'all') return 1;
      return a.label.localeCompare(b.label);
    });
  }

  /**
   * Add editing-specific context data
   * @param {Object} context - Context object to modify
   * @returns {Promise<void>}
   * @private
   */
  async _addEditingContext(context) {
    context.isCustomList = !!this.selectedSpellList.document.flags?.[MODULE.ID]?.isDuplicate;

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

  /**
   * @override
   * @param {Object} context - The context data
   * @param {Object} options - Rendering options
   */
  _onRender(context, options) {
    super._onRender(context, options);

    if (this.isLoading) {
      this.loadData();
      return;
    }

    this.setupFilterListeners();
    this.applyCollapsedLevels();
    this.applyCollapsedFolders();
  }

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ['container', 'spellLists', 'listContent', 'availableSpells', 'footer'];
  }

  /* -------------------------------------------- */
  /*  Data Loading                                */
  /* -------------------------------------------- */

  /**
   * Load spell lists and available spells
   * @returns {Promise<void>}
   */
  async loadData() {
    try {
      log(3, 'Loading spell lists for GM manager');

      await managerHelpers.getValidCustomListMappings();
      this.availableSpellLists = await managerHelpers.findCompendiumSpellLists();
      this.availableSpellLists.sort((a, b) => a.name.localeCompare(b.name));
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
   * Add icon enrichment to available spells
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
  }

  /**
   * Process spell list data for display
   * @param {Object} spellList - The spell list to process
   * @returns {Object} Processed spell list with display data
   */
  _processSpellListForDisplay(spellList) {
    if (!spellList) return null;
    const processed = foundry.utils.deepClone(spellList);
    processed.isCustomList = !!spellList.document.flags?.[MODULE.ID]?.isDuplicate;
    processed.canRestore = !!(processed.isCustomList && spellList.document.flags?.[MODULE.ID]?.originalUuid);
    processed.originalUuid = spellList.document.flags?.[MODULE.ID]?.originalUuid;
    processed.actorId = spellList.document.flags?.[MODULE.ID]?.actorId;
    processed.isPlayerSpellbook = !!processed.actorId;
    processed.identifier = spellList.document.system?.identifier;
    processed.isClassSpellList = !processed.isCustomList && !processed.isPlayerSpellbook && !!processed.identifier;

    if (spellList.spellsByLevel?.length) {
      processed.spellsByLevel = spellList.spellsByLevel.map((level) => ({
        ...level,
        spells: level.spells.map((spell) => this._processSpellItemForDisplay(spell))
      }));
    }

    return processed;
  }

  /**
   * Process spell item for display in the GM interface
   * @param {Object} spell - The spell to process
   * @returns {Object} Processed spell with display data
   */
  _processSpellItemForDisplay(spell) {
    if (!spell.compendiumUuid) spell.compendiumUuid = spell.uuid;
    const processed = foundry.utils.deepClone(spell);
    processed.cssClasses = 'spell-item';
    processed.dataAttributes = `data-uuid="${spell.compendiumUuid}"`;
    return processed;
  }
  /* -------------------------------------------- */
  /*  Filtering Methods                           */
  /* -------------------------------------------- */

  /**
   * Filter available spells based on current filter state
   * @returns {Object} Filtered spells with count
   */
  filterAvailableSpells() {
    try {
      const selectedSpellUUIDs = this.getSelectedSpellUUIDs();
      log(3, 'Beginning Filtering:', selectedSpellUUIDs.size, 'selected spells out of', this.availableSpells.length, 'total available');
      let remainingSpells = [...this.availableSpells];
      remainingSpells = this._filterBySelectedList(remainingSpells, selectedSpellUUIDs);
      remainingSpells = this._filterBySource(remainingSpells);
      remainingSpells = this._filterByBasicProperties(remainingSpells);
      remainingSpells = this._filterByRange(remainingSpells);
      remainingSpells = this._filterByDamageAndConditions(remainingSpells);
      remainingSpells = this._filterBySpecialProperties(remainingSpells);
      log(3, 'Final spells count:', remainingSpells.length);
      return { spells: remainingSpells, totalFiltered: remainingSpells.length };
    } catch (error) {
      log(1, 'Error filtering available spells:', error);
      return { spells: [], totalFiltered: 0 };
    }
  }

  /**
   * Filter out spells already in the selected list
   * @param {Array} spells - Spells to filter
   * @param {Set} selectedSpellUUIDs - UUIDs in selected list
   * @returns {Array} Filtered spells
   * @private
   */
  _filterBySelectedList(spells, selectedSpellUUIDs) {
    const filtered = spells.filter((spell) => !this.isSpellInSelectedList(spell, selectedSpellUUIDs));
    log(3, 'After in-list filter:', filtered.length, 'spells remaining');
    return filtered;
  }

  /**
   * Filter spells by source
   * @param {Array} spells - Spells to filter
   * @returns {Array} Filtered spells
   * @private
   */
  _filterBySource(spells) {
    const { source } = this.filterState;

    if (!source || source.trim() === '' || source === 'all') {
      return spells;
    }

    const beforeCount = spells.length;
    const filtered = spells.filter((spell) => {
      const spellSource = (spell.sourceId || '').split('.')[0];
      const packName = spell.packName || '';
      return spellSource.includes(source) || spellSource === source || packName.toLowerCase().includes(source.toLowerCase());
    });

    if (filtered.length === 0 && beforeCount > 0) {
      log(3, `Source '${source}' filtered out all spells, resetting to show all sources`);
      this.filterState.source = 'all';
      return spells;
    }

    log(3, `After source filter: ${filtered.length} spells remaining`);
    return filtered;
  }

  /**
   * Filter spells by basic properties (name, level, school, casting time)
   * @param {Array} spells - Spells to filter
   * @returns {Array} Filtered spells
   * @private
   */
  _filterByBasicProperties(spells) {
    const { name, level, school, castingTime } = this.filterState;
    let filtered = spells;
    if (name) filtered = filtered.filter((spell) => spell.name.toLowerCase().includes(name.toLowerCase()));
    if (level) {
      const levelValue = parseInt(level);
      filtered = filtered.filter((spell) => spell.level === levelValue);
    }
    if (school) filtered = filtered.filter((spell) => spell.school === school);
    if (castingTime) {
      filtered = filtered.filter((spell) => {
        const [filterType, filterValue] = castingTime.split(':');
        const spellCastingType = spell.filterData?.castingTime?.type || spell.system?.activation?.type || '';
        const spellCastingValue = String(spell.filterData?.castingTime?.value || spell.system?.activation?.value || '1');
        return spellCastingType === filterType && spellCastingValue === filterValue;
      });
    }

    return filtered;
  }

  /**
   * Filter spells by range
   * @param {Array} spells - Spells to filter
   * @returns {Array} Filtered spells
   * @private
   */
  _filterByRange(spells) {
    const { minRange, maxRange } = this.filterState;
    if (!minRange && !maxRange) return spells;

    const filtered = spells.filter((spell) => {
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

    log(3, 'After range filter:', filtered.length, 'spells remaining');
    return filtered;
  }

  /**
   * Filter spells by damage types and conditions
   * @param {Array} spells - Spells to filter
   * @returns {Array} Filtered spells
   * @private
   */
  _filterByDamageAndConditions(spells) {
    const { damageType, condition } = this.filterState;
    let filtered = spells;

    if (damageType) {
      filtered = filtered.filter((spell) => {
        const spellDamageTypes = Array.isArray(spell.filterData?.damageTypes) ? spell.filterData.damageTypes : [];
        return spellDamageTypes.length > 0 && spellDamageTypes.includes(damageType);
      });
    }

    if (condition) {
      filtered = filtered.filter((spell) => {
        const spellConditions = Array.isArray(spell.filterData?.conditions) ? spell.filterData.conditions : [];
        return spellConditions.includes(condition);
      });
    }

    return filtered;
  }

  /**
   * Filter spells by special properties (saves, concentration, ritual)
   * @param {Array} spells - Spells to filter
   * @returns {Array} Filtered spells
   * @private
   */
  _filterBySpecialProperties(spells) {
    const { requiresSave, concentration, ritual } = this.filterState;
    let filtered = spells;

    if (requiresSave) {
      filtered = filtered.filter((spell) => {
        const spellRequiresSave = spell.filterData?.requiresSave || false;
        return (requiresSave === 'true' && spellRequiresSave) || (requiresSave === 'false' && !spellRequiresSave);
      });
    }

    if (concentration) {
      filtered = filtered.filter((spell) => {
        const requiresConcentration = !!spell.filterData?.concentration;
        return (concentration === 'true' && requiresConcentration) || (concentration === 'false' && !requiresConcentration);
      });
    }

    if (ritual) filtered = filtered.filter((spell) => !!spell.filterData?.isRitual);
    return filtered;
  }

  /**
   * Check if a spell is in the currently selected list
   * @param {Object} spell - The spell to check
   * @param {Set} selectedSpellUUIDs - Set of UUIDs in the selected list
   * @returns {boolean} Whether the spell is in the selected list
   */
  isSpellInSelectedList(spell, selectedSpellUUIDs) {
    try {
      if (!selectedSpellUUIDs.size) return false;
      if (selectedSpellUUIDs.has(spell.uuid)) return true;
      const spellIdPart = spell.uuid.split('.').pop();
      if (spellIdPart && selectedSpellUUIDs.has(spellIdPart)) return true;

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
   * Get a set of UUIDs for spells in the currently selected list
   * @returns {Set} Set of spell UUIDs
   */
  getSelectedSpellUUIDs() {
    try {
      if (!this.selectedSpellList?.spells) return new Set();

      const selectedSpellUUIDs = new Set();

      for (const spell of this.selectedSpellList.spells) {
        if (spell.compendiumUuid) {
          try {
            const parsedUuid = foundry.utils.parseUuid(spell.compendiumUuid);
            if (parsedUuid.collection) {
              const normalizedId = `Compendium.${parsedUuid.collection.collection}.${parsedUuid.id}`;
              selectedSpellUUIDs.add(normalizedId);
            }

            selectedSpellUUIDs.add(spell.compendiumUuid);
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
   * Apply filters to the DOM elements in the UI
   */
  applyFilters() {
    try {
      const filteredData = this.filterAvailableSpells();
      const visibleUUIDs = new Set(filteredData.spells.map((spell) => spell.uuid));
      const spellItems = this.element.querySelectorAll('.available-spells .spell-item');
      let visibleCount = 0;
      spellItems.forEach((item) => {
        const uuid = item.dataset.uuid;
        const isVisible = visibleUUIDs.has(uuid);
        item.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount++;
      });
      const noResults = this.element.querySelector('.no-spells');
      if (noResults) noResults.style.display = visibleCount > 0 ? 'none' : 'block';
      const countDisplay = this.element.querySelector('.filter-count');
      if (countDisplay) countDisplay.textContent = `${visibleCount} spells`;
    } catch (error) {
      log(1, 'Error applying filters:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Filter Setup & Event Handlers               */
  /* -------------------------------------------- */

  /**
   * Set up event listeners for filter elements
   */
  setupFilterListeners() {
    if (!this.isEditing) return;
    this._setupNameFilter();
    this._setupDropdownFilters();
    this._setupRangeFilters();
    this._setupCheckboxFilters();
    const resetButton = this.element.querySelector('.reset-filters');
    if (resetButton) resetButton.addEventListener('click', () => this._resetAllFilters());
  }

  _resetAllFilters() {
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

    const nameInput = this.element.querySelector('input[name="spell-search"]');
    if (nameInput) nameInput.value = '';
    const selects = this.element.querySelectorAll('select[name^="spell-"]');
    selects.forEach((select) => {
      select.value = select.options[0].value;
    });
    const rangeInputs = this.element.querySelectorAll('input[name^="spell-"][type="number"]');
    rangeInputs.forEach((input) => {
      input.value = '';
    });
    const checkboxes = this.element.querySelectorAll('input[name^="spell-"][type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });

    this._refreshFilteredContent();
  }

  /**
   * Set up name search filter listener
   * @private
   */
  _setupNameFilter() {
    const nameInput = this.element.querySelector('input[name="spell-search"]');
    if (nameInput) {
      nameInput.addEventListener('input', (event) => {
        this.filterState.name = event.target.value;
        clearTimeout(this._nameFilterTimer);
        this._nameFilterTimer = setTimeout(() => {
          this.applyFilters();
        }, 200);
      });
    }
  }

  /**
   * Set up dropdown filter listeners
   * @private
   */
  _setupDropdownFilters() {
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
          if (this.filterState[property] !== event.target.value) {
            this.filterState[property] = event.target.value;
            if (property === 'level') this._refreshFilteredContent();
            else this.applyFilters();
          }
        });
      }
    }
  }

  _refreshFilteredContent() {
    this.render(false, { parts: ['availableSpells'] });
  }

  /**
   * Set up range filter listeners
   * @private
   */
  _setupRangeFilters() {
    const rangeInputs = ['input[name="spell-min-range"]', 'input[name="spell-max-range"]'];

    rangeInputs.forEach((selector) => {
      const input = this.element.querySelector(selector);
      if (input) {
        input.addEventListener('input', (event) => {
          const property = event.target.name === 'spell-min-range' ? 'minRange' : 'maxRange';

          if (this.filterState[property] !== event.target.value) {
            this.filterState[property] = event.target.value;

            clearTimeout(this._rangeFilterTimer);
            this._rangeFilterTimer = setTimeout(() => {
              this.applyFilters();
            }, 20);
          }
        });
      }
    });
  }

  /**
   * Set up checkbox filter listeners
   * @private
   */
  _setupCheckboxFilters() {
    const checkboxSelectors = [{ selector: 'input[name="spell-ritual"]', property: 'ritual' }];

    for (const { selector, property } of checkboxSelectors) {
      const element = this.element.querySelector(selector);
      if (element) {
        element.addEventListener('change', (event) => {
          if (this.filterState[property] !== event.target.checked) {
            this.filterState[property] = event.target.checked;
            this.applyFilters();
          }
        });
      }
    }
  }

  /**
   * Apply saved collapsed level states from user flags
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
   * Load spell details for a list of spell UUIDs
   * @param {Array} spellUuids - Array of spell UUIDs to load
   * @returns {Promise<void>}
   */
  async loadSpellDetails(spellUuids) {
    if (!this.selectedSpellList) return;

    try {
      this.selectedSpellList.isLoadingSpells = true;
      this.render(false);

      const spellDocs = await actorSpellUtils.fetchSpellDocuments(new Set(spellUuids), 9);
      const spellLevels = actorSpellUtils.organizeSpellsByLevel(spellDocs, null);

      for (const level of spellLevels) {
        for (const spell of level.spells) {
          spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
        }
      }

      this.selectedSpellList.spells = spellDocs;
      this.selectedSpellList.spellsByLevel = spellLevels;
      this.selectedSpellList.isLoadingSpells = false;
      this.render(false);

      log(3, `Loaded ${spellDocs.length} spells for selected spell list`);
    } catch (error) {
      log(1, 'Error loading spell details:', error);
      this.selectedSpellList.isLoadingSpells = false;
      this.render(false);
    }
  }

  /* -------------------------------------------- */
  /*  Dialog Methods                              */
  /* -------------------------------------------- */

  /**
   * Display a confirmation dialog
   * @param {Object} options - Dialog configuration options
   * @returns {Promise<boolean>} Whether confirmed
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

  /**
   * Show the documentation dialog
   * @returns {Promise<void>}
   */
  async showDocumentation() {
    const content = await renderTemplate(TEMPLATES.DIALOGS.MANAGER_DOCUMENTATION, {});
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
  }

  /**
   * Show the create new list dialog
   * @returns {Promise<void>}
   */
  async createNewList() {
    try {
      const classIdentifiers = await managerHelpers.findClassIdentifiers();
      const identifierOptions = Object.entries(classIdentifiers)
        .sort(([, dataA], [, dataB]) => dataA.name.localeCompare(dataB.name))
        .map(([id, data]) => ({
          id: id,
          name: data.fullDisplay,
          plainName: data.name
        }));

      const content = await renderTemplate(TEMPLATES.DIALOGS.CREATE_SPELL_LIST, { identifierOptions });
      const { result, formData } = await this._showCreateListDialog(content, identifierOptions);

      if (result === 'create' && formData) await this._createNewListCallback(formData.name, formData.identifier);
    } catch (error) {
      log(1, 'Error creating new list:', error);
    }
  }

  /**
   * Show the create list dialog and return result
   * @param {string} content - Dialog content HTML
   * @param {Array} identifierOptions - Class identifier options
   * @returns {Promise<Object>} Dialog result and form data
   * @private
   */
  async _showCreateListDialog(content, identifierOptions) {
    let formData = null;

    const result = await DialogV2.wait({
      window: { title: game.i18n.localize('SPELLMANAGER.Buttons.CreateNew'), icon: 'fas fa-star' },
      content: content,
      buttons: [
        {
          label: game.i18n.localize('SPELLMANAGER.Buttons.CreateNew'),
          icon: 'fas fa-check',
          action: 'create',
          callback: (event, target, form) => {
            const nameInput = form.querySelector('[name="name"]');
            const identifierSelect = form.querySelector('[name="identifier"]');
            const customIdentifierInput = form.querySelector('[name="customIdentifier"]');

            if (!identifierSelect) return false;
            let name = nameInput.value.trim();
            let identifier = '';
            let defaultClassName = '';

            if (identifierSelect.value === 'custom') {
              identifier = customIdentifierInput?.value || '';
              const identifierPattern = /^[a-z0-9_-]+$/;
              if (!identifierPattern.test(identifier)) {
                const errorElement = form.querySelector('.validation-error');
                if (errorElement) errorElement.style.display = 'block';
                customIdentifierInput.focus();
                return false;
              }

              defaultClassName = identifier.charAt(0).toUpperCase() + identifier.slice(1);
            } else {
              identifier = identifierSelect.value;
              const selectedOption = identifierOptions.find((opt) => opt.id === identifier);
              if (selectedOption) defaultClassName = selectedOption.plainName;
            }

            if (!name && defaultClassName) name = defaultClassName;
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
        this._setupCreateListDialogListeners(target);
      }
    });

    return { result, formData };
  }

  /**
   * Set up listeners for the create list dialog
   * @param {HTMLElement} target - The dialog DOM element
   * @private
   */
  _setupCreateListDialogListeners(target) {
    const identifierSelect = target.querySelector('#class-identifier');
    const customField = target.querySelector('.custom-id-group');
    const customIdentifierInput = target.querySelector('#custom-identifier');
    const createButton = target.querySelector('button[data-action="create"]');

    if (identifierSelect && customField && customIdentifierInput) {
      identifierSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          customField.style.display = 'block';
          const isValid = /^[a-z0-9_-]+$/.test(customIdentifierInput.value);
          createButton.disabled = customIdentifierInput.value !== '' && !isValid;
          const errorElement = target.querySelector('.validation-error');
          if (errorElement) {
            errorElement.style.display = customIdentifierInput.value !== '' && !isValid ? 'block' : 'none';
          }
        } else {
          customField.style.display = 'none';
          createButton.disabled = false;
          const errorElement = target.querySelector('.validation-error');
          if (errorElement) errorElement.style.display = 'none';
        }
      });

      customIdentifierInput.addEventListener('input', (e) => {
        const value = e.target.value;
        const isValid = /^[a-z0-9_-]+$/.test(value);
        const errorElement = target.querySelector('.validation-error');

        if (errorElement) {
          errorElement.style.display = isValid || value === '' ? 'none' : 'block';
        }

        createButton.disabled = value !== '' && !isValid;

        if (value !== '') {
          customIdentifierInput.classList.toggle('error', !isValid);
        } else {
          customIdentifierInput.classList.remove('error');
          createButton.disabled = true;
        }
      });
    }
  }

  /**
   * Create a new spell list
   * @param {string} name - Name for the new list
   * @param {string} identifier - Class identifier for the new list
   * @returns {Promise<void>}
   * @private
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

  /* -------------------------------------------- */
  /*  Action Methods                              */
  /* -------------------------------------------- */

  /**
   * Select a spell list by UUID
   * @param {string} uuid - The UUID of the spell list to select
   * @returns {Promise<void>}
   */
  async selectSpellList(uuid) {
    try {
      log(3, `Selecting spell list: ${uuid}`);

      const duplicate = await managerHelpers.findDuplicateSpellList(uuid);

      if (duplicate && duplicate.uuid !== uuid) return this.selectSpellList(duplicate.uuid);
      const spellList = await fromUuid(uuid);
      if (!spellList) return;
      this.isEditing = false;
      const spellUuids = Array.from(spellList.system.spells || []);
      this.selectedSpellList = {
        document: spellList,
        uuid: spellList.uuid,
        name: spellList.name,
        spellUuids: spellUuids,
        spells: [],
        isLoadingSpells: true
      };

      this.determineSourceFilter(spellList);
      this.render(false);
      await this.loadSpellDetails(spellUuids);
    } catch (error) {
      log(1, 'Error selecting spell list:', error);
    }
  }

  /**
   * Determine appropriate source filter based on spell list
   * @param {Object} spellList - The spell list document
   */
  determineSourceFilter(spellList) {
    try {
      log(3, 'Determining source filter for spell list');
      let sourceFilter = 'all';
      const isCustomList = !!spellList.flags?.[MODULE.ID]?.isDuplicate;

      if (isCustomList) {
        const originalUuid = spellList.flags?.[MODULE.ID]?.originalUuid;
        if (originalUuid) {
          try {
            const parsedUuid = foundry.utils.parseUuid(originalUuid);
            const packageName = parsedUuid.collection.metadata.packageName.split('.')[0];
            sourceFilter = packageName;
            log(3, `Using original source: ${sourceFilter}`);
          } catch (e) {
            log(1, `Error parsing original UUID: ${e.message}`);
          }
        }
      } else if (spellList.pack) {
        const packageName = spellList.pack.split('.')[0];
        sourceFilter = packageName;
        log(3, `Using current pack source: ${sourceFilter}`);
      }

      this.filterState.source = sourceFilter;
      log(3, `Set source filter to: ${sourceFilter}`);
    } catch (error) {
      log(1, 'Error determining source filter:', error);
      this.filterState.source = 'all';
    }
  }

  /**
   * Enter edit mode for a spell list
   * @param {string} uuid - The UUID of the spell list to edit
   * @returns {Promise<void>}
   */
  async editSpellList(uuid) {
    if (!this.selectedSpellList) return;

    try {
      log(3, `Editing spell list: ${uuid}`);
      this.pendingChanges = { added: new Set(), removed: new Set() };
      const flags = this.selectedSpellList.document.flags?.[MODULE.ID] || {};
      const isCustom = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;
      const isActorSpellbook = !!flags.isActorSpellbook;
      if (!isCustom && !isActorSpellbook) await this._duplicateForEditing();
      this.isEditing = true;
      this.render(false);
      setTimeout(() => this.applyFilters(), 100);
    } catch (error) {
      log(1, 'Error entering edit mode:', error);
    }
  }

  /**
   * Duplicate the selected spell list for editing
   * @returns {Promise<void>}
   * @private
   */
  async _duplicateForEditing() {
    let originalSource = '';
    if (this.selectedSpellList.document.pack) originalSource = this.selectedSpellList.document.pack.split('.')[0];
    const duplicateList = await managerHelpers.duplicateSpellList(this.selectedSpellList.document);
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

    if (originalSource) this.filterState.source = originalSource;
  }

  /**
   * Remove a spell from the current list
   * @param {string} spellUuid - The UUID of the spell to remove
   */
  removeSpell(spellUuid) {
    if (!this.selectedSpellList || !this.isEditing) return;

    try {
      log(3, `Removing spell: ${spellUuid} in pending changes`);
      this.pendingChanges.removed.add(spellUuid);
      this.pendingChanges.added.delete(spellUuid);
      const normalizedForms = managerHelpers.normalizeUuid(spellUuid);
      this.selectedSpellList.spellUuids = this.selectedSpellList.spellUuids.filter((uuid) => !normalizedForms.includes(uuid));
      this.selectedSpellList.spells = this.selectedSpellList.spells.filter((spell) => {
        const spellUuids = [spell.uuid, spell.compendiumUuid, ...(spell._id ? [spell._id] : [])];
        return !spellUuids.some((id) => normalizedForms.includes(id));
      });
      this.selectedSpellList.spellsByLevel = actorSpellUtils.organizeSpellsByLevel(this.selectedSpellList.spells, null);
      this._ensureSpellIcons();
      this.render(false);
      this.applyFilters();
    } catch (error) {
      log(1, 'Error removing spell:', error);
    }
  }

  /**
   * Add a spell to the current list
   * @param {string} spellUuid - The UUID of the spell to add
   */
  addSpell(spellUuid) {
    if (!this.selectedSpellList || !this.isEditing) return;
    try {
      this.pendingChanges.added.add(spellUuid);
      this.pendingChanges.removed.delete(spellUuid);
      const spell = this.availableSpells.find((s) => s.uuid === spellUuid);
      if (!spell) return;
      const spellCopy = foundry.utils.deepClone(spell);
      spellCopy.compendiumUuid = spellUuid;
      if (!spellCopy.enrichedIcon) spellCopy.enrichedIcon = formattingUtils.createSpellIconLink(spellCopy);
      this.selectedSpellList.spellUuids.push(spellUuid);
      this.selectedSpellList.spells.push(spellCopy);
      this.selectedSpellList.spellsByLevel = actorSpellUtils.organizeSpellsByLevel(this.selectedSpellList.spells, null);
      this._ensureSpellIcons();
      this.render(false);
      this.applyFilters();
    } catch (error) {
      log(1, 'Error adding spell:', error);
    }
  }

  /**
   * Ensure all spells in the list have icons
   * @private
   */
  _ensureSpellIcons() {
    for (const level of this.selectedSpellList.spellsByLevel) {
      for (const spell of level.spells) {
        if (!spell.enrichedIcon) {
          spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
        }
      }
    }
  }

  /**
   * Save changes to the custom spell list
   * @returns {Promise<void>}
   */
  async saveCustomList() {
    if (!this.selectedSpellList || !this.isEditing) return;

    try {
      log(3, 'Saving custom spell list with pending changes');
      const document = this.selectedSpellList.document;
      const currentSpells = new Set(document.system.spells || []);
      for (const spellUuid of this.pendingChanges.removed) {
        const normalizedForms = managerHelpers.normalizeUuid(spellUuid);
        for (const existingUuid of currentSpells) {
          if (normalizedForms.includes(existingUuid)) {
            currentSpells.delete(existingUuid);
            log(3, `Removed spell ${existingUuid} from list`);
          }
        }
      }

      log(3, `Processing ${this.pendingChanges.added.size} spell additions`);
      for (const spellUuid of this.pendingChanges.added) currentSpells.add(spellUuid);
      await document.update({ 'system.spells': Array.from(currentSpells) });
      this.pendingChanges = { added: new Set(), removed: new Set() };
      this.isEditing = false;
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
    const confirmed = await this.confirmDialog({
      title: game.i18n.localize('SPELLMANAGER.Confirm.DeleteTitle'),
      content: game.i18n.format('SPELLMANAGER.Confirm.DeleteContent', { name: listName }),
      confirmLabel: game.i18n.localize('SPELLMANAGER.Confirm.DeleteButton'),
      confirmIcon: 'fas fa-trash',
      confirmCssClass: 'dialog-button-danger'
    });

    if (!confirmed) return;

    try {
      await managerHelpers.removeCustomSpellList(uuid);
      this.selectedSpellList = null;
      this.isEditing = false;
      this.render(false);
    } catch (error) {
      log(1, 'Error deleting custom spell list:', error);
    }
  }

  /**
   * Restore a custom spell list from its original source
   * @returns {Promise<void>}
   */
  async restoreOriginal() {
    if (!this.selectedSpellList) return;
    const originalUuid = this.selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid;
    if (!originalUuid) return;

    const listName = this.selectedSpellList.name;
    const confirmed = await this.confirmDialog({
      title: game.i18n.localize('SPELLMANAGER.Confirm.RestoreTitle'),
      content: game.i18n.format('SPELLMANAGER.Confirm.RestoreContent', { name: listName }),
      confirmLabel: game.i18n.localize('SPELLMANAGER.Confirm.RestoreButton'),
      confirmIcon: 'fas fa-sync',
      confirmCssClass: 'dialog-button-warning'
    });

    if (!confirmed) return;

    try {
      const originalList = await fromUuid(originalUuid);
      if (!originalList) return;
      const originalSpells = Array.from(originalList.system.spells || []);

      await this.selectedSpellList.document.update({
        'system.spells': originalSpells,
        [`flags.${MODULE.ID}.originalModTime`]: originalList._stats?.modifiedTime || 0,
        [`flags.${MODULE.ID}.originalVersion`]: originalList._stats?.systemVersion || game.system.version
      });

      this.selectedSpellList.spellUuids = originalSpells;
      await this.loadSpellDetails(originalSpells);
      this.isEditing = false;
      this.render(false);
    } catch (error) {
      log(1, 'Error restoring from original:', error);
    }
  }

  /**
   * Apply saved collapsed folder states from user flags
   */
  applyCollapsedFolders() {
    try {
      const collapsedFolders = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_FOLDERS) || [];
      for (const folderId of collapsedFolders) {
        const folderContainer = this.element.querySelector(`.list-folder[data-folder-id="${folderId}"]`);
        if (folderContainer) folderContainer.classList.add('collapsed');
      }
    } catch (error) {
      log(1, 'Error applying collapsed folders:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

  /**
   * Handle selecting a spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleSelectSpellList(event, _form) {
    try {
      const element = event.target.closest('[data-uuid]');
      if (!element) return;
      const uuid = element.dataset.uuid;
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      await instance.selectSpellList(uuid);
    } catch (error) {
      log(1, 'Error handling select spell list:', error);
    }
  }

  /**
   * Handle editing a spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleEditSpellList(event, _form) {
    try {
      const element = event.target.closest('[data-uuid]');
      if (!element) return;
      const uuid = element.dataset.uuid;
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      await instance.editSpellList(uuid);
    } catch (error) {
      log(1, 'Error handling edit spell list:', error);
    }
  }

  /**
   * Handle removing a spell from the list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleRemoveSpell(event, _form) {
    try {
      const element = event.target.closest('[data-uuid]');
      if (!element) return;
      const uuid = element.dataset.uuid;
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      instance.removeSpell(uuid);
    } catch (error) {
      log(1, 'Error handling remove spell:', error);
    }
  }

  /**
   * Handle adding a spell to the list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleAddSpell(event, _form) {
    try {
      const element = event.target.closest('[data-uuid]');
      if (!element) return;
      const uuid = element.dataset.uuid;
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      instance.addSpell(uuid);
    } catch (error) {
      log(1, 'Error handling add spell:', error);
    }
  }

  /**
   * Handle saving the custom spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleSaveCustomList(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      await instance.saveCustomList();
    } catch (error) {
      log(1, 'Error handling save custom list:', error);
    }
  }

  /**
   * Handle deleting the custom spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleDeleteCustomList(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      await instance.deleteCustomList();
    } catch (error) {
      log(1, 'Error handling delete custom list:', error);
    }
  }

  /**
   * Handle restoring from the original spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleRestoreOriginal(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      await instance.restoreOriginal();
    } catch (error) {
      log(1, 'Error handling restore original:', error);
    }
  }

  /**
   * Handle closing the spell manager
   * @static
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleClose(_event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      instance.close();
    } catch (error) {
      log(1, 'Error handling close:', error);
    }
  }

  /**
   * Handle showing the documentation dialog
   * @static
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleShowDocumentation(_event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      instance.showDocumentation();
    } catch (error) {
      log(1, 'Error handling show documentation:', error);
    }
  }

  /**
   * Handle toggling the sidebar collapsed state
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleToggleSidebar(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      instance.element.classList.toggle('sidebar-collapsed');
    } catch (error) {
      log(1, 'Error handling toggle sidebar:', error);
    }
  }

  /**
   * Handle toggling a spell level's collapsed state
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleToggleSpellLevel(event, _form) {
    try {
      const levelContainer = event.target.closest('.spell-level');
      if (!levelContainer || !levelContainer.classList.contains('spell-level')) return;
      const levelId = levelContainer.dataset.level;
      levelContainer.classList.toggle('collapsed');
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
   * Handle toggling a folder's collapsed state
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleToggleFolder(event, _form) {
    try {
      const folderContainer = event.target.closest('.list-folder');
      if (!folderContainer) return;
      const folderId = folderContainer.dataset.folderId;
      if (!folderId) return;
      folderContainer.classList.toggle('collapsed');
      const collapsedFolders = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_FOLDERS) || [];
      const isCollapsed = folderContainer.classList.contains('collapsed');
      if (isCollapsed && !collapsedFolders.includes(folderId)) collapsedFolders.push(folderId);
      else if (!isCollapsed && collapsedFolders.includes(folderId)) collapsedFolders.splice(collapsedFolders.indexOf(folderId), 1);
      game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_FOLDERS, collapsedFolders);
    } catch (error) {
      log(1, 'Error handling toggle folder:', error);
    }
  }

  /**
   * Handle opening an actor sheet
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static async handleOpenActor(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance || !instance.selectedSpellList) return;
      const document = instance.selectedSpellList.document;
      const actorId = document.flags?.[MODULE.ID]?.actorId;

      if (!actorId) {
        ui.notifications.warn(game.i18n.localize('SPELLMANAGER.Warnings.NoActorFound'));
        return;
      }

      const actor = game.actors.get(actorId);
      if (!actor) {
        ui.notifications.warn(game.i18n.format('SPELLMANAGER.Warnings.ActorNotFound', { id: actorId }));
        return;
      }

      await actor.sheet.render(true);
      log(3, `Opened actor sheet for ${actor.name}`);
    } catch (error) {
      log(1, 'Error opening actor sheet:', error);
    }
  }

  /**
   * Handle opening a class item sheet
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static async handleOpenClass(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance || !instance.selectedSpellList) return;
      const identifier = instance.selectedSpellList.document.system?.identifier;
      if (!identifier) {
        ui.notifications.warn(game.i18n.localize('SPELLMANAGER.Warnings.NoClassIdentifier'));
        return;
      }

      const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');
      let classItem = null;
      for (const actor of game.actors) {
        const matchingItem = actor.items.find((i) => i.type === 'class' && i.system?.identifier?.toLowerCase() === identifier.toLowerCase());

        if (matchingItem) {
          classItem = matchingItem;
          break;
        }
      }

      if (!classItem) {
        for (const pack of itemPacks) {
          if (classItem) break;

          try {
            const index = await pack.getIndex({ fields: ['type', 'system.identifier'] });
            for (const entry of index) {
              if (entry.type === 'class' && entry.system?.identifier?.toLowerCase() === identifier.toLowerCase()) {
                classItem = await pack.getDocument(entry._id);
                break;
              }
            }
          } catch (err) {
            log(2, `Error searching pack ${pack.metadata.label}:`, err);
          }
        }
      }

      if (!classItem) {
        ui.notifications.warn(game.i18n.format('SPELLMANAGER.Warnings.ClassNotFound', { identifier: identifier }));
        return;
      }

      await classItem.sheet.render(true);
      log(3, `Opened class sheet for ${classItem.name}`);
    } catch (error) {
      log(1, 'Error opening class sheet:', error);
    }
  }

  /**
   * Handle creating a new spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleCreateNewList(event, _form) {
    try {
      const appId = `gm-spell-list-manager-${MODULE.ID}`;
      const instance = foundry.applications.instances.get(appId);
      if (!instance) return;
      await instance.createNewList();
    } catch (error) {
      log(1, 'Error handling create new list:', error);
    }
  }
}
