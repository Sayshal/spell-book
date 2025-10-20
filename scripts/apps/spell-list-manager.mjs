/**
 * Spell List Manager Application
 *
 * A GM-facing application for viewing, editing, and creating spell lists
 * with advanced multi-select functionality for bulk operations. This application serves
 * as the central hub for managing all spell list content within the system.
 *
 * Key features:
 * - Spell list management with create, edit, delete, and merge operations
 * - Advanced filtering system with multiple criteria and real-time updates
 * - Multi-select functionality with bulk add/remove operations and shift-click range selection
 * - Spell comparison integration for detailed analysis
 * - Dynamic sidebar organization with collapsible folders and visibility controls
 * - Custom spell list creation with identifier validation
 * - Merged spell list functionality with source list management
 * - Analytics dashboard integration for usage tracking
 * - Real-time synchronization with compendium data and actor spellbooks
 * - Responsive UI with state persistence and collapse management
 * - Context-aware dialog systems for complex operations
 * - Integration with the broader spell book ecosystem
 *
 * @module Applications/SpellListManager
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { SpellComparison, DetailsCustomization } from '../dialogs/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from '../ui/_module.mjs';
import * as ValidationUtils from '../validation/_module.mjs';
import { AnalyticsDashboard } from './_module.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/**
 * Spell list metadata for display and management.
 *
 * @typedef {Object} SpellListMeta
 * @property {string} uuid - Unique identifier for the spell list
 * @property {string} name - Display name of the spell list
 * @property {string} pack - Source pack identifier
 * @property {boolean} isActorOwned - Whether this list belongs to an actor
 * @property {boolean} isCustom - Whether this is a custom created list
 * @property {boolean} isMerged - Whether this is a merged list
 * @property {string} [actorName] - Name of the owning actor if applicable
 * @property {Object} document - The underlying document object
 */

/**
 * Selected spell list data structure.
 *
 * @typedef {Object} SelectedSpellList
 * @property {Object} document - The spell list document
 * @property {string} uuid - Document UUID
 * @property {string} name - List name
 * @property {Array<string>} spellUuids - Array of spell UUIDs in the list
 * @property {Array<Object>} spells - Array of spell objects with full data
 * @property {Array<Object>} spellsByLevel - Spells organized by level
 * @property {boolean} isLoadingSpells - Whether spells are currently loading
 * @property {boolean} [hasError] - Whether loading encountered an error
 * @property {boolean} [isRenameable] - Whether the list can be renamed
 */

/**
 * Filter state for spell filtering operations.
 *
 * @typedef {Object} FilterState
 * @property {string} name - Name/search filter
 * @property {string} level - Spell level filter
 * @property {string} school - School of magic filter
 * @property {string} source - Source compendium filter
 * @property {string} castingTime - Casting time filter
 * @property {string} minRange - Minimum range filter
 * @property {string} maxRange - Maximum range filter
 * @property {string} damageType - Damage type filter
 * @property {string} condition - Condition filter
 * @property {string} requiresSave - Requires save filter
 * @property {string} concentration - Concentration requirement filter
 * @property {string} materialComponents - Material components filter
 * @property {boolean} prepared - Preparation status filter
 * @property {boolean} ritual - Ritual casting filter
 */

/**
 * Pending changes tracking for edit operations.
 *
 * @typedef {Object} PendingChanges
 * @property {Set<string>} added - Set of spell UUIDs to be added
 * @property {Set<string>} removed - Set of spell UUIDs to be removed
 */

/**
 * Multi-select state tracking.
 *
 * @typedef {Object} SelectionState
 * @property {Set<string>} selectedSpellsToAdd - Spells selected for adding
 * @property {Set<string>} selectedSpellsToRemove - Spells selected for removal
 * @property {boolean} selectionMode - Whether selection mode is active
 * @property {Object} lastSelectedIndex - Last selected indices for range selection
 * @property {boolean} isSelectingAll - Whether select-all operation is in progress
 */

/**
 * Dialog form data structures.
 *
 * @typedef {Object} CreateListFormData
 * @property {string} name - Name for the new list
 * @property {string} identifier - Class identifier for the new list
 */

/**
 * @typedef {Object} MergeListFormData
 * @property {string} sourceListUuid - UUID of the source spell list
 * @property {string} copyFromListUuid - UUID of the list to copy from
 * @property {string} mergedListName - Name for the merged list
 * @property {boolean} hideSourceLists - Whether to hide source lists after merge
 */

/**
 * @typedef {Object} RenameFormData
 * @property {string} newName - New name for the spell list
 */

/**
 * Spell List Manager application for viewing, editing, and creating spell lists
 */
export class SpellListManager extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: `gm-spell-list-manager-${MODULE.ID}`,
    tag: 'div',
    actions: {
      selectSpellList: SpellListManager.handleSelectSpellList,
      editSpellList: SpellListManager.handleEditSpellList,
      removeSpell: SpellListManager.handleRemoveSpell,
      addSpell: SpellListManager.handleAddSpell,
      saveCustomList: SpellListManager.handleSaveCustomList,
      deleteCustomList: SpellListManager.handleDeleteCustomList,
      restoreOriginal: SpellListManager.handleRestoreOriginal,
      showDocumentation: SpellListManager.handleShowDocumentation,
      toggleSidebar: SpellListManager.handleToggleSidebar,
      toggleSpellLevel: SpellListManager.handleToggleSpellLevel,
      toggleFolder: SpellListManager.handleToggleFolder,
      openActor: SpellListManager.handleOpenActor,
      openClass: SpellListManager.handleOpenClass,
      createNewList: SpellListManager.handleCreateNewList,
      renameSpellList: SpellListManager.handleRenameSpellList,
      mergeLists: SpellListManager.handleMergeLists,
      toggleSelectionMode: SpellListManager.handleToggleSelectionMode,
      selectAll: SpellListManager.handleSelectAll,
      bulkSave: SpellListManager.handleBulkSave,
      cancelSelection: SpellListManager.handleCancelSelection,
      toggleListVisibility: SpellListManager.handleToggleListVisibility,
      openAnalyticsDashboard: SpellListManager.handleOpenAnalyticsDashboard,
      openCustomization: SpellListManager.handleOpenCustomization,
      compareSpell: SpellListManager.handleCompareSpell,
      toggleRegistry: SpellListManager.handleToggleRegistry
    },
    classes: ['gm-spell-list-manager'],
    window: { icon: 'fas fa-bars-progress', resizable: true, minimizable: true },
    position: { width: Math.max(1100, window.innerWidth - 650), height: Math.max(600, window.innerHeight - 200) }
  };

  /** @inheritdoc */
  static PARTS = {
    main: { template: TEMPLATES.SPELL_LIST_MANAGER.MAIN },
    sidebar: { template: TEMPLATES.SPELL_LIST_MANAGER.SPELL_LISTS },
    content: { template: TEMPLATES.SPELL_LIST_MANAGER.LIST_CONTENT },
    availableSpells: { template: TEMPLATES.SPELL_LIST_MANAGER.AVAILABLE_SPELLS },
    footer: { template: TEMPLATES.SPELL_LIST_MANAGER.FOOTER }
  };

  /** @inheritdoc */
  get title() {
    return game.i18n.localize('SPELLMANAGER.Application.Title');
  }

  /**
   * Initialize the GM Spell List Manager.
   * @param {Object} [options={}] - Application options
   */
  constructor(options) {
    super(options);

    /** @type {boolean} Whether the application is currently loading data */
    this.isLoading = true;

    /** @type {Array<SpellListMeta>} Available spell lists for management */
    this.availableSpellLists = [];

    /** @type {SelectedSpellList|null} Currently selected spell list */
    this.selectedSpellList = null;

    /** @type {Array<Object>} All available spells for filtering and selection */
    this.availableSpells = [];

    /** @type {boolean} Whether the application is in editing mode */
    this.isEditing = false;

    /** @type {PendingChanges} Tracking for pending add/remove operations */
    this.pendingChanges = { added: new Set(), removed: new Set() };

    /** @type {Set<string>} Spells selected for adding in multi-select mode */
    this.selectedSpellsToAdd = new Set();

    /** @type {Set<string>} Spells selected for removal in multi-select mode */
    this.selectedSpellsToRemove = new Set();

    /** @type {boolean} Whether multi-select mode is active */
    this.selectionMode = false;

    /** @type {Object} Last selected indices for range selection */
    this.lastSelectedIndex = { add: -1, remove: -1 };

    /** @type {boolean} Whether a select-all operation is in progress */
    this.isSelectingAll = false;

    /** @type {Set<string>} Set of spell UUIDs for comparison */
    this.comparisonSpells = new Set();

    /** @type {SpellComparison|null} Active comparison dialog */
    this.comparisonDialog = null;

    /** @type {FilterState} Current filter state for spell filtering */
    this.filterState = {
      name: '',
      level: '',
      school: '',
      source: '',
      spellSource: 'all',
      castingTime: '',
      minRange: '',
      maxRange: '',
      damageType: '',
      condition: '',
      requiresSave: '',
      concentration: '',
      materialComponents: '',
      prepared: false,
      ritual: false
    };

    /** @type {UIUtils.Filters} Filter helper for spell filtering */
    this.filterHelper = new UIUtils.Filters(this);

    /** @type {boolean} Whether checkboxes are currently being updated programmatically */
    this.isUpdatingCheckboxes = false;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isLoading = this.isLoading;
    context.isEditing = this.isEditing;
    context.selectedSpellList = this.selectedSpellList;
    context.availableSpells = this.availableSpells;
    context.filterState = this.filterState;
    context.settings = { useMetricUnits: DataUtils.shouldUseMetric() };
    context.selectionMode = this.selectionMode;
    context.selectedSpellsToAdd = this.selectedSpellsToAdd;
    context.selectedSpellsToRemove = this.selectedSpellsToRemove;
    context.selectedToAddCount = this.selectedSpellsToAdd.size;
    context.selectedToRemoveCount = this.selectedSpellsToRemove.size;
    context.totalSelectedCount = this.selectedSpellsToAdd.size + this.selectedSpellsToRemove.size;
    context.spellSchools = CONFIG.DND5E.spellSchools;
    context.spellLevels = CONFIG.DND5E.spellLevels;
    context.comparisonSpells = this.comparisonSpells;
    const maxSpells = game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX);
    const comparisonFull = this.comparisonSpells.size >= maxSpells;
    if (this.isEditing && this.selectionMode) {
      context.selectAllAddCheckboxHtml = this._createSelectAllCheckbox('add');
      context.selectAllRemoveCheckboxHtml = this._createSelectAllCheckbox('remove');
    }
    if (!this.isLoading && this.availableSpellLists?.length) this._organizeSpellListsContext(context);
    if (this.isLoading) return context;
    const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
    context.customListMap = customMappings;
    if (this.availableSpells.length > 0) this._prepareFilterContext(context);
    if (this.isEditing && this.selectedSpellList) await this._addEditingContext(context);
    if (this.selectedSpellList) {
      context.selectedSpellList = UIUtils.processSpellListForDisplay(this.selectedSpellList, this.classFolderCache, this.availableSpellLists);
      const flags = this.selectedSpellList.document.flags?.[MODULE.ID] || {};
      const isCustomList = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;
      context.selectedSpellList.isRenameable = isCustomList || this.selectedSpellList.isMerged;
      context.selectedSpellList.isRegistryEnabled = DataUtils.isListEnabledForRegistry(this.selectedSpellList.uuid);
      const registryCheckbox = ValidationUtils.createCheckbox({
        name: 'registry-enabled',
        checked: context.selectedSpellList.isRegistryEnabled,
        ariaLabel: game.i18n.localize('SPELLBOOK.Registry.EnableLabel')
      });
      registryCheckbox.dataset.action = 'toggleRegistry';
      context.selectedSpellList.registryCheckboxHtml = ValidationUtils.elementToHtml(registryCheckbox);
      context.selectedSpellList.isActorOwned = !!flags.actorId;
    }
    if (context.selectedSpellList?.spellsByLevel) {
      if (this.isEditing && this.selectionMode) {
        context.selectedSpellList.spellsByLevel = context.selectedSpellList.spellsByLevel.map((levelData) => {
          const processedLevel = { ...levelData };
          processedLevel.spells = levelData.spells.map((spell) => {
            const spellUuid = spell.uuid || spell.compendiumUuid;
            const processedSpell = { ...spell };
            processedSpell.selectRemoveCheckboxHtml = this._createSpellSelectCheckbox(spell, 'remove', this.selectedSpellsToRemove.has(spellUuid));
            processedSpell.isInComparison = this.comparisonSpells.has(spellUuid);
            processedSpell.showCompareLink = !comparisonFull || processedSpell.isInComparison;
            return processedSpell;
          });
          return processedLevel;
        });
      } else {
        context.selectedSpellList.spellsByLevel = context.selectedSpellList.spellsByLevel.map((levelData) => {
          const processedLevel = { ...levelData };
          processedLevel.spells = levelData.spells.map((spell) => {
            const spellUuid = spell.uuid || spell.compendiumUuid;
            const processedSpell = { ...spell };
            processedSpell.isInComparison = this.comparisonSpells.has(spellUuid);
            processedSpell.showCompareLink = !comparisonFull || processedSpell.isInComparison;
            return processedSpell;
          });
          return processedLevel;
        });
      }
    }
    if (context.isEditing && context.selectedSpellList) {
      if (!context.selectedSpellList.spellCount && context.selectedSpellList.spells) {
        context.selectedSpellList.spellCount = context.selectedSpellList.spells.length;
      }
      if (context.selectedSpellList.spells) {
        const spellSources = new Set();
        context.selectedSpellList.spells.forEach((spell) => {
          if (spell.sourceId) {
            const packName = spell.sourceId.split('.')[0];
            spellSources.add(packName);
          } else if (spell.packName) {
            spellSources.add(spell.packName);
          }
        });
        context.selectedSpellList.spellSources = Array.from(spellSources).sort();
      }
    } else if (!context.isEditing && this.availableSpellLists) {
      const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
      context.visibleSpellListsCount = this.availableSpellLists.length - hiddenLists.length;
      context.hiddenSpellListsCount = hiddenLists.length;
    }
    return context;
  }

  /**
   * Organize spell lists into categories for the context.
   * @param {Object} context - The context object to modify
   * @private
   */
  _organizeSpellListsContext(context) {
    const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const actorOwnedLists = this.availableSpellLists.filter((list) => list.isActorOwned);
    const hiddenSpellLists = this.availableSpellLists.filter((list) => !list.isActorOwned && hiddenLists.includes(list.uuid));
    const mergedLists = this.availableSpellLists.filter((list) => !list.isActorOwned && list.isMerged && !hiddenLists.includes(list.uuid));
    const customLists = this.availableSpellLists.filter(
      (list) => !list.isActorOwned && !list.isMerged && (list.isCustom || list.document?.flags?.[MODULE.ID]?.isNewList) && !hiddenLists.includes(list.uuid)
    );
    const standardLists = this.availableSpellLists.filter(
      (list) => !list.isActorOwned && !list.isCustom && !list.isMerged && !list.document?.flags?.[MODULE.ID]?.isNewList && !hiddenLists.includes(list.uuid)
    );
    actorOwnedLists.sort((a, b) => {
      if (a.actorName && b.actorName) return a.actorName.localeCompare(b.actorName);
      if (a.actorName) return -1;
      if (b.actorName) return 1;
      return a.name.localeCompare(b.name);
    });
    customLists.sort((a, b) => a.name.localeCompare(b.name));
    mergedLists.sort((a, b) => a.name.localeCompare(b.name));
    standardLists.sort((a, b) => a.name.localeCompare(b.name));
    hiddenSpellLists.sort((a, b) => a.name.localeCompare(b.name));
    context.actorOwnedLists = actorOwnedLists;
    context.customLists = customLists;
    context.mergedLists = mergedLists;
    context.standardLists = standardLists;
    context.hiddenSpellLists = hiddenSpellLists;
    context.hasActorOwnedLists = actorOwnedLists.length > 0;
    context.hasCustomLists = customLists.length > 0;
    context.hasMergedLists = mergedLists.length > 0;
    context.hasStandardLists = standardLists.length > 0;
    context.hasHiddenLists = hiddenSpellLists.length > 0;
    context.availableSpellLists = this.availableSpellLists;
    context.hiddenListUuids = hiddenLists;
  }

  /**
   * Prepare filter-related context data.
   * @param {Object} context - The context object to modify
   * @private
   */
  _prepareFilterContext(context) {
    context.spellSources = DataUtils.prepareSpellSources(this.availableSpells);
    context.castingTimeOptions = DataUtils.prepareCastingTimeOptions(this.availableSpells, this.filterState);
    context.damageTypeOptions = DataUtils.prepareDamageTypeOptions(this.filterState);
    context.conditionOptions = DataUtils.prepareConditionOptions(this.filterState);
    const filteredData = this._filterAvailableSpells();
    const maxSpells = game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX);
    const comparisonFull = this.comparisonSpells.size >= maxSpells;
    if (this.isEditing && this.selectionMode && filteredData.spells) {
      filteredData.spells = filteredData.spells.map((spell) => {
        const processedSpell = UIUtils.processSpellItemForDisplay(spell);
        processedSpell.selectAddCheckboxHtml = this._createSpellSelectCheckbox(spell, 'add', this.selectedSpellsToAdd.has(spell.uuid));
        processedSpell.isInComparison = this.comparisonSpells.has(spell.uuid);
        processedSpell.showCompareLink = !comparisonFull || processedSpell.isInComparison;
        return processedSpell;
      });
    } else if (filteredData.spells) {
      filteredData.spells = filteredData.spells.map((spell) => {
        const processedSpell = UIUtils.processSpellItemForDisplay(spell);
        processedSpell.isInComparison = this.comparisonSpells.has(spell.uuid);
        processedSpell.showCompareLink = !comparisonFull || processedSpell.isInComparison;
        return processedSpell;
      });
    }
    context.filteredSpells = filteredData;
    context.filterFormElements = this._prepareFilterElements();
  }

  /**
   * Add editing-specific context data.
   * @param {Object} context - Context object to modify
   * @returns {Promise<void>}
   * @private
   */
  async _addEditingContext(context) {
    const flags = this.selectedSpellList.document.flags?.[MODULE.ID] || {};
    context.isCustomList = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;
    if (context.isCustomList) {
      const originalUuid = this.selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid;
      if (originalUuid) {
        context.originalUuid = originalUuid;
        const compareResult = await DataUtils.compareListVersions(originalUuid, this.selectedSpellList.document.uuid);
        context.compareInfo = compareResult;
      }
    }
  }

  /**
   * Load spell lists and available spells.
   * @returns {Promise<void>}
   */
  async loadData() {
    try {
      DataUtils.getValidCustomListMappings();
      this.availableSpellLists = await DataUtils.findCompendiumSpellLists(true);
      this.classFolderCache = await this._buildClassFolderCache();
      for (const list of this.availableSpellLists) {
        const document = list.document;
        if (document?.system?.type === 'subclass') {
          list.isSubclass = true;
          list.icon = 'fas fa-shield';
        } else {
          list.isSubclass = false;
          list.icon = 'fas fa-book';
        }
      }
      this.availableSpellLists.sort((a, b) => a.name.localeCompare(b.name));
      const preloadedData = DataUtils.getPreloadedData();
      if (preloadedData && preloadedData.enrichedSpells.length > 0) {
        log(3, `Starting with ${preloadedData.enrichedSpells.length} preloaded spells`);
        this.availableSpells = [...preloadedData.enrichedSpells];
        const allSpells = await DataUtils.fetchAllCompendiumSpells();
        const preloadedUuids = new Set(this.availableSpells.map((s) => s.uuid));
        const missingSpells = allSpells.filter((spell) => !preloadedUuids.has(spell.uuid));
        log(3, `Found ${missingSpells.length} missing spells to load`);
        if (missingSpells.length > 0) {
          for (let spell of missingSpells) spell.enrichedIcon = UIUtils.createSpellIconLink(spell);
          this.availableSpells.push(...missingSpells);
        }
        log(3, `GM Manager loaded: ${this.availableSpells.length} total spells (${preloadedData.enrichedSpells.length} preloaded + ${missingSpells.length} additional)`);
      } else {
        log(3, 'No preloaded data available, loading all spells from scratch');
        this.availableSpells = await DataUtils.fetchAllCompendiumSpells();
        this.enrichAvailableSpells();
      }
    } catch (error) {
      log(1, 'Error loading spell lists:', error);
    } finally {
      this.isLoading = false;
      this.render(false);
    }
  }

  /**
   * Add icon enrichment to available spells.
   */
  enrichAvailableSpells() {
    if (!this.availableSpells.length) return;
    for (let spell of this.availableSpells) spell.enrichedIcon = UIUtils.createSpellIconLink(spell);
  }

  /**
   * Load spell details for a list of spell UUIDs.
   * @param {Array<string>} spellUuids - Array of spell UUIDs to load
   * @returns {Promise<void>}
   */
  async loadSpellDetails(spellUuids) {
    if (!this.selectedSpellList) return;
    try {
      this.selectedSpellList.isLoadingSpells = true;
      this.render(false);
      const maxSpellLevel = 9;
      const preloadedData = DataUtils.getPreloadedData();
      let spellItems = [];
      if (preloadedData && preloadedData.enrichedSpells.length > 0) {
        log(3, 'Using preloaded spell data for GM spell list');
        const spellUuidsSet = new Set(spellUuids);
        const preloadedSpells = preloadedData.enrichedSpells.filter((spell) => spellUuidsSet.has(spell.uuid));
        const missingSpells = spellUuids.filter((uuid) => !preloadedSpells.some((spell) => spell.uuid === uuid));
        if (missingSpells.length > 0) {
          log(3, `Loading ${missingSpells.length} missing spells from compendiums`);
          const additionalSpells = await DataUtils.fetchSpellDocuments(new Set(missingSpells), maxSpellLevel);
          spellItems = [...preloadedSpells, ...additionalSpells];
        } else spellItems = preloadedSpells;
      } else spellItems = await DataUtils.fetchSpellDocuments(new Set(spellUuids), maxSpellLevel);
      for (const spell of spellItems) {
        if (!spell.enrichedIcon) spell.enrichedIcon = UIUtils.createSpellIconLink(spell);
        if (!spell.compendiumUuid) spell.compendiumUuid = spell.uuid;
      }
      this.selectedSpellList.spells = spellItems;
      this.selectedSpellList.spellsByLevel = DataUtils.organizeSpellsByLevel(spellItems);
      this.selectedSpellList.isLoadingSpells = false;
      log(3, `Loaded ${spellItems.length} spells for spell list`);
    } catch (error) {
      log(1, 'Error loading spell details:', error);
      this.selectedSpellList.isLoadingSpells = false;
      this.selectedSpellList.hasError = true;
    }
    this.render(false);
  }

  /**
   * Select a spell list by UUID.
   * @param {string} uuid - The UUID of the spell list to select
   * @returns {Promise<void>}
   */
  async selectSpellList(uuid) {
    this._clearSelections();
    log(3, `Selecting spell list: ${uuid}`);
    const duplicate = await DataUtils.findDuplicateSpellList(uuid);
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
  }

  /**
   * Determine appropriate source filter based on spell list.
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
          const parsedUuid = foundry.utils.parseUuid(originalUuid);
          const packageName = parsedUuid.collection.metadata.packageName.split('.')[0];
          sourceFilter = packageName;
          log(3, `Using original source: ${sourceFilter}`);
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
   * Filter available spells using the filter helper.
   * @returns {Object} Filtered spells with count
   * @private
   */
  _filterAvailableSpells() {
    if (!this.isEditing) return { spells: [], totalFiltered: 0 };
    try {
      const selectedSpellUUIDs = this.getSelectedSpellUUIDs();
      const result = this.filterHelper.filterAvailableSpells(this.availableSpells, selectedSpellUUIDs, this.isSpellInSelectedList.bind(this), this.filterState);
      return result;
    } catch (error) {
      log(1, 'Error filtering available spells:', error);
      return { spells: [], totalFiltered: 0 };
    }
  }

  /**
   * Check if a spell is in the currently selected list.
   * @param {Object} spell - The spell to check
   * @param {Set<string>} selectedSpellUUIDs - Set of UUIDs in the selected list
   * @returns {boolean} Whether the spell is in the selected list
   */
  isSpellInSelectedList(spell, selectedSpellUUIDs) {
    if (!selectedSpellUUIDs.size) return false;
    if (selectedSpellUUIDs.has(spell.uuid)) return true;
    return false;
  }

  /**
   * Get a set of UUIDs for spells in the currently selected list.
   * @returns {Set<string>} Set of spell UUIDs
   */
  getSelectedSpellUUIDs() {
    try {
      if (!this.selectedSpellList?.spells) return new Set();
      const selectedSpellUUIDs = new Set();
      for (const spell of this.selectedSpellList.spells) if (spell.uuid) selectedSpellUUIDs.add(spell.uuid);
      return selectedSpellUUIDs;
    } catch (error) {
      log(1, 'Error getting selected spell UUIDs:', error);
      return new Set();
    }
  }

  /**
   * Apply filters to the DOM elements in the UI.
   */
  applyFilters() {
    if (this.isUpdatingCheckboxes) return;
    const filteredData = this._filterAvailableSpells();
    if (!filteredData || !filteredData.spells) return;
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
  }

  /**
   * Apply saved collapsed level states from user flags.
   */
  applyCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS) || [];
    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) {
        levelContainer.classList.add('collapsed');
        const header = levelContainer.querySelector('.spell-level-heading');
        const spellList = levelContainer.querySelector('.spell-list');
        const collapseIcon = header?.querySelector('.collapse-indicator');
        if (header) {
          header.setAttribute('aria-expanded', 'false');
          header.classList.add('collapsed');
        }
        if (spellList) spellList.style.display = 'none';
        if (collapseIcon) collapseIcon.className = 'fas fa-caret-right collapse-indicator';
      }
    }
  }

  /**
   * Apply saved collapsed folder states from user flags.
   */
  applyCollapsedFolders() {
    const collapsedFolders = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_FOLDERS) || [];
    for (const folderId of collapsedFolders) {
      const folderContainer = this.element.querySelector(`.list-folder[data-folder-id="${folderId}"]`);
      if (folderContainer) {
        folderContainer.classList.add('collapsed');
        const header = folderContainer.querySelector('.folder-header');
        const content = folderContainer.querySelector('.folder-content');
        const collapseIcon = header?.querySelector('.collapse-indicator');
        if (header) header.setAttribute('aria-expanded', 'false');
        if (content) content.style.display = 'none';
        if (collapseIcon) collapseIcon.className = 'fas fa-chevron-right collapse-indicator';
      }
    }
  }

  /**
   * Clear all selections and exit selection mode.
   * @private
   */
  _clearSelections() {
    this.selectedSpellsToAdd.clear();
    this.selectedSpellsToRemove.clear();
    this.selectionMode = false;
    this.lastSelectedIndex = { add: -1, remove: -1 };
    this.isSelectingAll = false;
  }

  /**
   * Update selection count display in footer.
   * @private
   */
  _updateSelectionCount() {
    const addCount = this.selectedSpellsToAdd.size;
    const removeCount = this.selectedSpellsToRemove.size;
    const totalCount = addCount + removeCount;
    const addCountElements = this.element.querySelectorAll('.add-count');
    const removeCountElements = this.element.querySelectorAll('.remove-count');
    const totalCountElements = this.element.querySelectorAll('.total-count');
    addCountElements.forEach((element) => {
      element.textContent = addCount.toString();
    });
    removeCountElements.forEach((element) => {
      element.textContent = removeCount.toString();
    });
    totalCountElements.forEach((element) => {
      element.textContent = totalCount.toString();
    });
    const bulkSaveBtn = this.element.querySelector('.bulk-save-btn');
    if (bulkSaveBtn) {
      bulkSaveBtn.disabled = totalCount === 0;
      const buttonText = bulkSaveBtn.querySelector('.button-text');
      if (buttonText) buttonText.textContent = game.i18n.format('SPELLMANAGER.BulkOps.SaveChanges', { count: totalCount });
    }
    const summaryElement = this.element.querySelector('.selection-summary');
    if (summaryElement) {
      let summaryText = '';
      if (addCount > 0 && removeCount > 0) summaryText = game.i18n.format('SPELLMANAGER.Selection.AddAndRemoveCount', { addCount, removeCount });
      else if (addCount > 0) summaryText = game.i18n.format('SPELLMANAGER.Selection.AddCount', { count: addCount });
      else if (removeCount > 0) summaryText = game.i18n.format('SPELLMANAGER.Selection.RemoveCount', { count: removeCount });
      else summaryText = game.i18n.localize('SPELLMANAGER.Selection.NoneSelected');
      summaryElement.textContent = summaryText;
    }
  }

  /**
   * Update spell checkboxes to match current selection.
   * @private
   */
  _updateSpellCheckboxes() {
    this.isUpdatingCheckboxes = true;
    const addCheckboxes = this.element.querySelectorAll('.spell-select-cb[data-type="add"]');
    addCheckboxes.forEach((checkbox) => {
      const uuid = checkbox.dataset.uuid;
      const shouldBeChecked = this.selectedSpellsToAdd.has(uuid);
      checkbox.checked = shouldBeChecked;
    });
    const removeCheckboxes = this.element.querySelectorAll('.spell-select-cb[data-type="remove"]');
    removeCheckboxes.forEach((checkbox) => {
      const uuid = checkbox.dataset.uuid;
      const shouldBeChecked = this.selectedSpellsToRemove.has(uuid);
      checkbox.checked = shouldBeChecked;
    });
    this.isUpdatingCheckboxes = false;
  }

  /**
   * Update select all checkbox states (including indeterminate).
   * @private
   */
  _updateSelectAllCheckboxes() {
    const selectAllAddCheckbox = this.element.querySelector('.select-all-checkbox[data-type="add"]');
    if (selectAllAddCheckbox) {
      const visibleSpells = this._getVisibleSpells();
      const visibleSelected = visibleSpells.filter((spell) => this.selectedSpellsToAdd.has(spell.uuid));
      if (visibleSelected.length === 0) {
        selectAllAddCheckbox.checked = false;
        selectAllAddCheckbox.indeterminate = false;
      } else if (visibleSelected.length === visibleSpells.length) {
        selectAllAddCheckbox.checked = true;
        selectAllAddCheckbox.indeterminate = false;
      } else {
        selectAllAddCheckbox.checked = false;
        selectAllAddCheckbox.indeterminate = true;
      }
    }
    const selectAllRemoveCheckbox = this.element.querySelector('.select-all-checkbox[data-type="remove"]');
    if (selectAllRemoveCheckbox) {
      const currentSpells = this.selectedSpellList?.spells || [];
      const currentSelected = currentSpells.filter((spell) => this.selectedSpellsToRemove.has(spell.uuid || spell.compendiumUuid));
      if (currentSelected.length === 0) {
        selectAllRemoveCheckbox.checked = false;
        selectAllRemoveCheckbox.indeterminate = false;
      } else if (currentSelected.length === currentSpells.length) {
        selectAllRemoveCheckbox.checked = true;
        selectAllRemoveCheckbox.indeterminate = false;
      } else {
        selectAllRemoveCheckbox.checked = false;
        selectAllRemoveCheckbox.indeterminate = true;
      }
    }
  }

  /**
   * Get visible filtered spells for selection operations.
   * @returns {Array<Object>} Array of visible spell objects
   * @private
   */
  _getVisibleSpells() {
    const filteredData = this._filterAvailableSpells();
    return filteredData.spells || [];
  }

  /**
   * Set up event listeners for filter elements.
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

  /**
   * Set up name search filter listener.
   * @private
   */
  _setupNameFilter() {
    const nameInput = this.element.querySelector('input[name="spell-search"]');
    if (nameInput) {
      nameInput.addEventListener('input', (event) => {
        const previousValue = this.filterState.name;
        this.filterState.name = event.target.value;
        clearTimeout(this._nameFilterTimer);
        this._nameFilterTimer = setTimeout(() => {
          const wasFiltered = previousValue && previousValue.trim();
          const isFiltered = this.filterState.name && this.filterState.name.trim();
          if (wasFiltered !== isFiltered) {
            const currentInput = this.element.querySelector('input[name="spell-search"]');
            const cursorPosition = currentInput?.selectionStart;
            this.render(false, { parts: ['availableSpells'] }).then(() => {
              const newInput = this.element.querySelector('input[name="spell-search"]');
              if (newInput && cursorPosition !== undefined) {
                newInput.focus();
                newInput.setSelectionRange(cursorPosition, cursorPosition);
              }
            });
          } else this.applyFilters();
        }, 200);
      });
    }
  }

  /**
   * Set up dropdown filter listeners with debouncing.
   * @private
   */
  _setupDropdownFilters() {
    const dropdownSelectors = [
      { selector: 'select[name="spell-level"]', property: 'level' },
      { selector: 'select[name="spell-school"]', property: 'school' },
      { selector: 'select[name="spell-compendium-source"]', property: 'source' },
      { selector: 'select[name="spell-source"]', property: 'spellSource' },
      { selector: 'select[name="spell-castingTime"]', property: 'castingTime' },
      { selector: 'select[name="spell-damageType"]', property: 'damageType' },
      { selector: 'select[name="spell-condition"]', property: 'condition' },
      { selector: 'select[name="spell-requiresSave"]', property: 'requiresSave' },
      { selector: 'select[name="spell-concentration"]', property: 'concentration' },
      { selector: 'select[name="spell-materialComponents"]', property: 'materialComponents' }
    ];
    for (const { selector, property } of dropdownSelectors) {
      const element = this.element.querySelector(selector);
      if (element) {
        element.addEventListener('change', (event) => {
          if (this.filterState[property] !== event.target.value) {
            this.filterState[property] = event.target.value;
            clearTimeout(this._dropdownFilterTimer);
            this._dropdownFilterTimer = setTimeout(() => {
              if (property === 'level' || property === 'source' || property === 'spellSource') this.render(false, { parts: ['availableSpells'] });
              else this.applyFilters();
            }, 150);
          }
        });
      }
    }
  }

  /**
   * Set up range filter listeners.
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
            }, 200);
          }
        });
      }
    });
  }

  /**
   * Set up checkbox filter listeners.
   * @private
   */
  _setupCheckboxFilters() {
    const checkboxSelectors = [{ selector: 'dnd5e-checkbox[name="filter-ritual"]', property: 'ritual' }];
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
   * Reset all filters to their default state and clear form inputs.
   * @returns {void}
   * @private
   */
  _resetAllFilters() {
    this.filterState = {
      name: '',
      level: '',
      school: '',
      source: '',
      spellSource: 'all',
      castingTime: '',
      minRange: '',
      maxRange: '',
      damageType: '',
      condition: '',
      requiresSave: '',
      concentration: '',
      materialComponents: '',
      prepared: false,
      ritual: false
    };
    this.filterHelper.resetFilterControls();
    this.render(false, { parts: ['availableSpells'] });
  }

  /**
   * Prepare form elements for the spell filters.
   * @returns {Object} Object containing all filter form element HTML
   * @private
   */
  _prepareFilterElements() {
    const searchInput = ValidationUtils.createTextInput({
      name: 'spell-search',
      value: this.filterState.name || '',
      placeholder: game.i18n.localize('SPELLMANAGER.Filters.SearchPlaceholder'),
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLMANAGER.Filters.SearchPlaceholder')
    });
    searchInput.id = 'spell-search';
    const levelOptions = [{ value: '', label: game.i18n.localize('SPELLMANAGER.Filters.AllLevels'), selected: !this.filterState.level }];
    Object.entries(CONFIG.DND5E.spellLevels).forEach(([level, label]) => {
      levelOptions.push({ value: level, label: label, selected: this.filterState.level === level });
    });
    const levelSelect = ValidationUtils.createSelect({
      name: 'spell-level',
      options: levelOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.Level')
    });
    levelSelect.id = 'spell-level';
    const schoolOptions = [{ value: '', label: game.i18n.localize('SPELLMANAGER.Filters.AllSchools'), selected: !this.filterState.school }];
    Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, _school]) => {
      const label = DataUtils.getConfigLabel(CONFIG.DND5E.spellSchools, key);
      schoolOptions.push({ value: key, label, selected: this.filterState.school === key });
    });
    const schoolSelect = ValidationUtils.createSelect({
      name: 'spell-school',
      options: schoolOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.School')
    });
    schoolSelect.id = 'spell-school';
    const castingTimeOptions = DataUtils.prepareCastingTimeOptions(this.availableSpells, this.filterState);
    const castingTimeSelect = ValidationUtils.createSelect({
      name: 'spell-castingTime',
      options: castingTimeOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.CastingTime')
    });
    castingTimeSelect.id = 'spell-castingTime';
    const damageTypeOptions = DataUtils.prepareDamageTypeOptions(this.filterState);
    const damageTypeSelect = ValidationUtils.createSelect({
      name: 'spell-damageType',
      options: damageTypeOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.DamageType')
    });
    damageTypeSelect.id = 'spell-damageType';
    const conditionOptions = DataUtils.prepareConditionOptions(this.filterState);
    const conditionSelect = ValidationUtils.createSelect({
      name: 'spell-condition',
      options: conditionOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.Condition')
    });
    conditionSelect.id = 'spell-condition';
    const requiresSaveOptions = [
      { value: '', label: game.i18n.localize('SPELLBOOK.Filters.All'), selected: !this.filterState.requiresSave },
      { value: 'true', label: game.i18n.localize('SPELLBOOK.Filters.True'), selected: this.filterState.requiresSave === 'true' },
      { value: 'false', label: game.i18n.localize('SPELLBOOK.Filters.False'), selected: this.filterState.requiresSave === 'false' }
    ];
    const requiresSaveSelect = ValidationUtils.createSelect({
      name: 'spell-requiresSave',
      options: requiresSaveOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RequiresSave')
    });
    requiresSaveSelect.id = 'spell-requiresSave';
    const concentrationOptions = [
      { value: '', label: game.i18n.localize('SPELLBOOK.Filters.All'), selected: !this.filterState.concentration },
      { value: 'true', label: game.i18n.localize('SPELLBOOK.Filters.True'), selected: this.filterState.concentration === 'true' },
      { value: 'false', label: game.i18n.localize('SPELLBOOK.Filters.False'), selected: this.filterState.concentration === 'false' }
    ];
    const concentrationSelect = ValidationUtils.createSelect({
      name: 'spell-concentration',
      options: concentrationOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RequiresConcentration')
    });
    concentrationSelect.id = 'spell-concentration';
    const materialComponentsOptions = [
      { value: '', label: game.i18n.localize('SPELLBOOK.Filters.All'), selected: !this.filterState.materialComponents },
      { value: 'consumed', label: game.i18n.localize('SPELLBOOK.Filters.Materials.Consumed'), selected: this.filterState.materialComponents === 'consumed' },
      { value: 'notConsumed', label: game.i18n.localize('SPELLBOOK.Filters.Materials.NotConsumed'), selected: this.filterState.materialComponents === 'notConsumed' }
    ];
    const materialComponentsSelect = ValidationUtils.createSelect({
      name: 'spell-materialComponents',
      options: materialComponentsOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.Materials.Title')
    });
    materialComponentsSelect.id = 'spell-materialComponents';
    const ritualCheckbox = ValidationUtils.createCheckbox({
      name: 'filter-ritual',
      checked: this.filterState.ritual || false,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RitualOnly')
    });
    ritualCheckbox.id = 'filter-ritual';
    const minRangeInput = ValidationUtils.createNumberInput({
      name: 'spell-min-range',
      value: this.filterState.minRange || '',
      placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMin'),
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMinLabel')
    });
    minRangeInput.id = 'spell-min-range';
    const maxRangeInput = ValidationUtils.createNumberInput({
      name: 'spell-max-range',
      value: this.filterState.maxRange || '',
      placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMax'),
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMaxLabel')
    });
    maxRangeInput.id = 'spell-max-range';
    const spellSources = DataUtils.prepareSpellSources(this.availableSpells);
    const currentCompendiumSourceValue = this.filterState.source || 'all';
    const compendiumSourceOptions = spellSources.map((source) => ({
      value: source.id,
      label: source.label,
      selected: currentCompendiumSourceValue === source.id
    }));
    const compendiumSourceSelect = ValidationUtils.createSelect({
      name: 'spell-compendium-source',
      options: compendiumSourceOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLMANAGER.Filters.CompendiumSource')
    });
    compendiumSourceSelect.id = 'spell-compendium-source';
    const spellSourceOptions = DataUtils.prepareSpellSourceOptions(this.availableSpells);
    const currentSpellSourceValue = this.filterState.spellSource || 'all';
    const spellSourceSelectOptions = spellSourceOptions.map((source) => ({
      value: source.id,
      label: source.label,
      selected: currentSpellSourceValue === source.id
    }));
    const spellSourceSelect = ValidationUtils.createSelect({
      name: 'spell-source',
      options: spellSourceSelectOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLMANAGER.Filters.SpellSource')
    });
    spellSourceSelect.id = 'spell-source';
    return {
      searchInputHtml: ValidationUtils.elementToHtml(searchInput),
      levelSelectHtml: ValidationUtils.elementToHtml(levelSelect),
      schoolSelectHtml: ValidationUtils.elementToHtml(schoolSelect),
      castingTimeSelectHtml: ValidationUtils.elementToHtml(castingTimeSelect),
      damageTypeSelectHtml: ValidationUtils.elementToHtml(damageTypeSelect),
      conditionSelectHtml: ValidationUtils.elementToHtml(conditionSelect),
      requiresSaveSelectHtml: ValidationUtils.elementToHtml(requiresSaveSelect),
      concentrationSelectHtml: ValidationUtils.elementToHtml(concentrationSelect),
      materialComponentsSelectHtml: ValidationUtils.elementToHtml(materialComponentsSelect),
      ritualCheckboxHtml: ValidationUtils.elementToHtml(ritualCheckbox),
      minRangeInputHtml: ValidationUtils.elementToHtml(minRangeInput),
      maxRangeInputHtml: ValidationUtils.elementToHtml(maxRangeInput),
      compendiumSourceSelectHtml: ValidationUtils.elementToHtml(compendiumSourceSelect),
      sourceSelectHtml: ValidationUtils.elementToHtml(spellSourceSelect)
    };
  }

  /**
   * Prepare form data for the create spell list dialog.
   * @param {Array<Object>} identifierOptions - Available class identifier options
   * @returns {Object} Object containing form element HTML
   * @private
   */
  _prepareCreateListFormData(identifierOptions) {
    const nameInput = ValidationUtils.createTextInput({
      name: 'name',
      required: true,
      ariaLabel: game.i18n.localize('SPELLMANAGER.CreateList.ListNameLabel')
    });
    nameInput.id = 'list-name';
    const classOptions = identifierOptions.map((option) => ({
      value: option.id,
      label: option.name,
      selected: false
    }));
    classOptions.push({
      value: 'custom',
      label: game.i18n.localize('SPELLMANAGER.CreateList.CustomOption'),
      selected: false
    });
    const classSelect = ValidationUtils.createSelect({
      name: 'identifier',
      options: classOptions,
      ariaLabel: game.i18n.localize('SPELLMANAGER.CreateList.ClassLabel')
    });
    classSelect.id = 'class-identifier';
    const customInput = ValidationUtils.createTextInput({
      name: 'customIdentifier',
      pattern: '[a-z0-9_-]+',
      title: game.i18n.localize('SPELLMANAGER.CreateList.IdentifierNotes'),
      ariaLabel: game.i18n.localize('SPELLMANAGER.CreateList.CustomIdentifierLabel')
    });
    customInput.id = 'custom-identifier';
    const subclassCheckbox = ValidationUtils.createCheckbox({
      name: 'is-subclass',
      checked: false,
      ariaLabel: game.i18n.localize('SPELLMANAGER.CreateList.SubclassLabel'),
      cssClass: 'dnd5e2'
    });
    subclassCheckbox.id = 'is-subclass';
    return {
      nameInputHtml: ValidationUtils.elementToHtml(nameInput),
      classSelectHtml: ValidationUtils.elementToHtml(classSelect),
      customInputHtml: ValidationUtils.elementToHtml(customInput),
      subclassCheckboxHtml: ValidationUtils.elementToHtml(subclassCheckbox)
    };
  }

  /**
   * Prepare form data for the merge spell lists dialog.
   * @returns {Object} Object containing form element HTML
   * @private
   */
  _prepareMergeListFormData() {
    const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const actorOwnedLists = this.availableSpellLists.filter((list) => list.isActorOwned && !hiddenLists.includes(list.uuid));
    const customLists = this.availableSpellLists.filter(
      (list) => !list.isActorOwned && !list.isMerged && (list.isCustom || list.document?.flags?.[MODULE.ID]?.isNewList) && !hiddenLists.includes(list.uuid)
    );
    const mergedLists = this.availableSpellLists.filter((list) => !list.isActorOwned && list.isMerged && !hiddenLists.includes(list.uuid));
    const standardLists = this.availableSpellLists.filter(
      (list) => !list.isActorOwned && !list.isCustom && !list.isMerged && !list.document?.flags?.[MODULE.ID]?.isNewList && !hiddenLists.includes(list.uuid)
    );
    const multiSelectOptions = [];
    standardLists.forEach((list) => {
      multiSelectOptions.push({ value: list.uuid, label: list.name, group: 'SPELLMANAGER.MergeLists.Groups.StandardLists' });
    });
    customLists.forEach((list) => {
      multiSelectOptions.push({ value: list.uuid, label: list.name, group: 'SPELLMANAGER.MergeLists.Groups.CustomLists' });
    });
    mergedLists.forEach((list) => {
      multiSelectOptions.push({ value: list.uuid, label: list.name, group: 'SPELLMANAGER.MergeLists.Groups.MergedLists' });
    });
    actorOwnedLists.forEach((list) => {
      const label = `${list.name} (${list.actorName || game.i18n.localize('SPELLMANAGER.ListSource.Character')})`;
      multiSelectOptions.push({ value: list.uuid, label: label, group: 'SPELLMANAGER.MergeLists.Groups.PlayerSpellbooks' });
    });
    const allPossibleGroups = [
      'SPELLMANAGER.MergeLists.Groups.StandardLists',
      'SPELLMANAGER.MergeLists.Groups.CustomLists',
      'SPELLMANAGER.MergeLists.Groups.MergedLists',
      'SPELLMANAGER.MergeLists.Groups.PlayerSpellbooks'
    ];
    const groupsWithOptions = allPossibleGroups.filter((groupKey) => {
      return multiSelectOptions.some((option) => option.group === groupKey);
    });
    const spellListsMultiSelect = ValidationUtils.createMultiSelect(multiSelectOptions, {
      name: 'spellListsToMerge',
      selectedValues: [],
      groups: groupsWithOptions,
      ariaLabel: game.i18n.localize('SPELLMANAGER.MergeLists.SpellListsLabel'),
      cssClass: 'spell-lists-multi-select'
    });
    spellListsMultiSelect.id = 'spell-lists-to-merge';
    const mergedListNameInput = ValidationUtils.createTextInput({
      name: 'mergedListName',
      placeholder: game.i18n.localize('SPELLMANAGER.MergeLists.MergedListNamePlaceholder'),
      ariaLabel: game.i18n.localize('SPELLMANAGER.MergeLists.MergedListNameLabel'),
      required: true
    });
    mergedListNameInput.id = 'merged-list-name';
    const hideSourceListsCheckbox = ValidationUtils.createCheckbox({
      name: 'hideSourceLists',
      checked: false,
      ariaLabel: game.i18n.localize('SPELLMANAGER.MergeLists.HideSourceListsLabel'),
      cssClass: 'dnd5e2'
    });
    hideSourceListsCheckbox.id = 'hide-source-lists';
    return {
      spellListsMultiSelectHtml: ValidationUtils.elementToHtml(spellListsMultiSelect),
      mergedListNameInputHtml: ValidationUtils.elementToHtml(mergedListNameInput),
      hideSourceListsCheckboxHtml: ValidationUtils.elementToHtml(hideSourceListsCheckbox)
    };
  }

  /**
   * Display a confirmation dialog.
   * @param {Object} options - Dialog configuration options
   * @param {string} [options.title] - The dialog title text
   * @param {string} [options.content] - The dialog message content
   * @param {string} [options.confirmLabel] - Text label for the confirm button
   * @param {string} [options.confirmIcon] - FontAwesome icon class for the confirm button
   * @param {string} [options.cancelLabel] - Text label for the cancel button
   * @param {string} [options.cancelIcon] - FontAwesome icon class for the cancel button
   * @param {string} [options.confirmCssClass] - Additional CSS class for the confirm button styling
   * @returns {Promise<boolean>} Whether confirmed
   */
  async confirmDialog({
    title = game.i18n.localize('SPELLMANAGER.Confirm.Title'),
    content = game.i18n.localize('SPELLMANAGER.Confirm.Content'),
    confirmLabel = game.i18n.localize('SPELLMANAGER.Confirm.Confirm'),
    confirmIcon = 'fas fa-check',
    cancelLabel = game.i18n.localize('SPELLBOOK.UI.Cancel'),
    cancelIcon = 'fas fa-times',
    confirmCssClass = ''
  }) {
    try {
      const result = await DialogV2.wait({
        title,
        content: `<p>${content}</p>`,
        buttons: [
          { icon: `${confirmIcon}`, label: confirmLabel, action: 'confirm', className: `dialog-button ${confirmCssClass}` },
          { icon: `${cancelIcon}`, label: cancelLabel, action: 'cancel', className: 'dialog-button' }
        ],
        default: 'cancel',
        rejectClose: false
      });
      return result === 'confirm';
    } catch (error) {
      log(1, 'Error showing confirmation dialog:', error);
      return false;
    }
  }

  /**
   * Show the create list dialog and return result.
   * @param {Array<Object>} identifierOptions - Class identifier options
   * @returns {Promise<Object>} Dialog result and form data
   * @private
   */
  async _showCreateListDialog(identifierOptions) {
    let formData = null;
    const formElements = this._prepareCreateListFormData(identifierOptions);
    const content = await renderTemplate(TEMPLATES.DIALOGS.CREATE_SPELL_LIST, { identifierOptions, formElements });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = content;
    const result = await DialogV2.wait({
      window: {
        title: game.i18n.localize('SPELLMANAGER.Buttons.CreateNew'),
        icon: 'fas fa-star',
        resizable: false,
        minimizable: false,
        positioned: true
      },
      position: { width: 650, height: 'auto' },
      content: wrapper,
      buttons: [
        {
          label: game.i18n.localize('SPELLMANAGER.Buttons.CreateNew'),
          icon: 'fas fa-check',
          action: 'create',
          callback: (_event, _target, form) => {
            const formElement = form?.querySelector ? form : form.element;
            const nameInput = formElement.querySelector('[name="name"]');
            const identifierSelect = formElement.querySelector('[name="identifier"]');
            const customIdentifierInput = formElement.querySelector('[name="customIdentifier"]');
            const subclassCheckbox = formElement.querySelector('[name="is-subclass"]');
            if (!identifierSelect) return false;
            let name = nameInput.value.trim();
            let identifier = '';
            let defaultClassName = '';
            let isSubclass = subclassCheckbox ? subclassCheckbox.checked : false;
            if (identifierSelect.value === 'custom') {
              identifier = customIdentifierInput?.value || '';
              const identifierPattern = /^[\d_a-z-]+$/;
              if (!identifierPattern.test(identifier)) {
                const errorElement = formElement.querySelector('.validation-error');
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
            formData = { name, identifier, isSubclass };
            return 'create';
          }
        },
        {
          label: game.i18n.localize('SPELLBOOK.UI.Cancel'),
          icon: 'fas fa-times',
          action: 'cancel'
        }
      ],
      default: 'cancel',
      rejectClose: false,
      render: (_event, target, _form) => {
        const dialogElement = target.querySelector ? target : target.element;
        this._setupCreateListDialogListeners(dialogElement);
      }
    });
    return { result, formData };
  }

  /**
   * Show the merge lists dialog and return result.
   * @returns {Promise<Object>} Dialog result and form data
   * @private
   */
  async _showMergeListsDialog() {
    let formData = null;
    const formElements = this._prepareMergeListFormData();
    const content = await renderTemplate(TEMPLATES.DIALOGS.MERGE_SPELL_LISTS, { formElements });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = content;
    const result = await DialogV2.wait({
      window: {
        title: game.i18n.localize('SPELLMANAGER.MergeLists.DialogTitle'),
        icon: 'fas fa-code-merge',
        resizable: false,
        minimizable: false,
        positioned: true
      },
      position: { width: 650, height: 'auto' },
      content: wrapper,
      buttons: [
        {
          label: game.i18n.localize('SPELLMANAGER.Buttons.MergeLists'),
          icon: 'fas fa-code-merge',
          action: 'merge',
          default: false,
          disabled: true,
          callback: (_event, _target, form) => {
            const formElement = form?.querySelector ? form : form.element;
            const spellListsMultiSelect = formElement.querySelector('[name="spellListsToMerge"]');
            const mergedListNameInput = formElement.querySelector('[name="mergedListName"]');
            const hideSourceListsCheckbox = formElement.querySelector('[name="hideSourceLists"]');
            const errorElement = formElement.querySelector('.validation-error');
            const selectedListUuids = spellListsMultiSelect?.value;
            if (selectedListUuids.length < 2) {
              if (errorElement) {
                errorElement.textContent = game.i18n.localize('SPELLMANAGER.MergeLists.MinimumListsError');
                errorElement.style.display = 'block';
              }
              return false;
            }
            const mergedListName = mergedListNameInput.value.trim();
            if (!mergedListName) {
              if (errorElement) {
                errorElement.textContent = game.i18n.localize('SPELLMANAGER.MergeLists.NameRequiredError');
                errorElement.style.display = 'block';
              }
              return false;
            }
            formData = {
              spellListUuids: selectedListUuids,
              mergedListName: mergedListName,
              hideSourceLists: hideSourceListsCheckbox ? hideSourceListsCheckbox.checked : false
            };
            return 'merge';
          }
        },
        { label: game.i18n.localize('SPELLBOOK.UI.Cancel'), icon: 'fas fa-times', action: 'cancel' }
      ],
      default: 'cancel',
      rejectClose: false,
      render: async (_event, target, _form) => {
        const dialogElement = target.querySelector ? target : target.element;
        const multiSelect = dialogElement.querySelector('multi-select');
        if (multiSelect) {
          await customElements.whenDefined('multi-select');
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        this._setupMergeListsDialogListeners(dialogElement);
        target.setPosition({ width: 650, height: 'auto' });
      }
    });
    return { result, formData };
  }

  /**
   * Build spell list options for dropdowns.
   * @param {string} defaultLabel - Localization key for default option
   * @returns {Array<Object>} Array of option objects
   * @private
   */
  _buildSpellListOptions(defaultLabel) {
    const options = [{ value: '', label: game.i18n.localize(defaultLabel), selected: true }];
    const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const actorOwnedLists = this.availableSpellLists.filter((list) => list.isActorOwned);
    const customLists = this.availableSpellLists.filter(
      (list) => !list.isActorOwned && !list.isMerged && (list.isCustom || list.document?.flags?.[MODULE.ID]?.isNewList) && !hiddenLists.includes(list.uuid)
    );
    const mergedLists = this.availableSpellLists.filter((list) => !list.isActorOwned && list.isMerged && !hiddenLists.includes(list.uuid));
    const standardLists = this.availableSpellLists.filter(
      (list) => !list.isActorOwned && !list.isCustom && !list.isMerged && !list.document?.flags?.[MODULE.ID]?.isNewList && !hiddenLists.includes(list.uuid)
    );
    if (actorOwnedLists.length > 0) {
      options.push({ value: '', label: game.i18n.localize('SPELLMANAGER.Folders.PlayerSpellbooks'), optgroup: 'start' });
      actorOwnedLists.forEach((list) => {
        const label = `${list.name} (${list.actorName || game.i18n.localize('SPELLMANAGER.ListSource.Character')})`;
        options.push({ value: list.uuid, label: label, selected: false });
      });
      options.push({ value: '', label: '', optgroup: 'end' });
    }
    if (customLists.length > 0) {
      options.push({ value: '', label: game.i18n.localize('SPELLMANAGER.Folders.CustomLists'), optgroup: 'start' });
      customLists.forEach((list) => {
        options.push({ value: list.uuid, label: list.name, selected: false });
      });
      options.push({ value: '', label: '', optgroup: 'end' });
    }
    if (mergedLists.length > 0) {
      options.push({ value: '', label: game.i18n.localize('SPELLMANAGER.Folders.MergedLists'), optgroup: 'start' });
      mergedLists.forEach((list) => {
        options.push({ value: list.uuid, label: list.name, selected: false });
      });
      options.push({ value: '', label: '', optgroup: 'end' });
    }
    if (standardLists.length > 0) {
      options.push({ value: '', label: game.i18n.localize('SPELLMANAGER.Folders.SpellLists'), optgroup: 'start' });
      standardLists.forEach((list) => {
        options.push({ value: list.uuid, label: `${list.name} (${list.pack})`, selected: false });
      });
      options.push({ value: '', label: '', optgroup: 'end' });
    }
    return options;
  }

  /**
   * Set up listeners for the create list dialog.
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
          customField.style.display = 'flex';
          const isValid = /^[\d_a-z-]+$/.test(customIdentifierInput.value);
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
        const isValid = /^[\d_a-z-]+$/.test(value);
        const errorElement = target.querySelector('.validation-error');
        if (errorElement) errorElement.style.display = isValid || value === '' ? 'none' : 'block';
        createButton.disabled = value !== '' && !isValid;
        if (value !== '') customIdentifierInput.classList.toggle('error', !isValid);
        else {
          customIdentifierInput.classList.remove('error');
          createButton.disabled = true;
        }
      });
    }
  }

  /**
   * Set up listeners for the merge lists dialog.
   * @param {HTMLElement} target - The dialog DOM element
   * @private
   */
  _setupMergeListsDialogListeners(target) {
    const spellListsMultiSelect = target.querySelector('[name="spellListsToMerge"]');
    const mergedListNameInput = target.querySelector('[name="mergedListName"]');
    const mergeButton = target.querySelector('button[data-action="merge"]');
    const errorElement = target.querySelector('.validation-error');
    const validateForm = () => {
      if (errorElement) errorElement.style.display = 'none';
      let selectedCount = 0;
      if (spellListsMultiSelect) {
        const tagsContainer = spellListsMultiSelect.querySelector('.tags.input-element-tags');
        if (tagsContainer) selectedCount = tagsContainer.querySelectorAll('.tag').length;
      }
      const hasName = mergedListNameInput ? mergedListNameInput.value.trim().length > 0 : false;
      const isValid = selectedCount >= 2 && hasName;
      if (mergeButton) mergeButton.disabled = !isValid;
    };
    if (spellListsMultiSelect) spellListsMultiSelect.addEventListener('change', validateForm);
    if (mergedListNameInput) mergedListNameInput.addEventListener('input', validateForm);
    validateForm();
  }

  /**
   * Duplicate the selected spell list for editing.
   * @returns {Promise<void>}
   * @private
   */
  async _duplicateForEditing() {
    this._clearSelections();
    let originalSource = '';
    if (this.selectedSpellList.document.pack) originalSource = this.selectedSpellList.document.pack.split('.')[0];
    const duplicateList = await DataUtils.duplicateSpellList(this.selectedSpellList.document);
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
   * Ensure all spells in the list have icons.
   * @private
   */
  _ensureSpellIcons() {
    for (const level of this.selectedSpellList.spellsByLevel) for (const spell of level.spells) if (!spell.enrichedIcon) spell.enrichedIcon = UIUtils.createSpellIconLink(spell);
  }

  /**
   * Find a class item in a specific top-level folder.
   * @param {string} identifier - The class identifier to search for
   * @param {string} topLevelFolderName - The top-level folder name to search in
   * @returns {Promise<Item|null>} The found class item or null
   * @private
   */
  async _findClassInTopLevelFolder(identifier, topLevelFolderName) {
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');
    for (const pack of itemPacks) {
      let packTopLevelFolder = null;
      if (pack.folder) {
        if (pack.folder.depth !== 1) packTopLevelFolder = pack.folder.getParentFolders().at(-1).name;
        else packTopLevelFolder = pack.folder.name;
      }
      if (packTopLevelFolder !== topLevelFolderName) continue;
      try {
        const index = await pack.getIndex({ fields: ['type', 'system.identifier'] });
        const entry = index.find((e) => (e.type === 'class' || e.type === 'subclass') && e.system?.identifier?.toLowerCase() === identifier.toLowerCase());
        if (entry) {
          const classItem = await pack.getDocument(entry._id);
          log(3, `Found class ${classItem.name} in pack ${pack.metadata.label} (folder: ${packTopLevelFolder})`);
          return classItem;
        }
      } catch (err) {
        log(2, `Error searching pack ${pack.metadata.label}:`, err);
      }
    }
    log(2, `No class with identifier "${identifier}" found in top-level folder "${topLevelFolderName}"`);
    return null;
  }

  /**
   * Build a cache of which identifiers have matching classes in which folders.
   * @returns {Promise<Map<string, boolean>>} Map with keys like "FolderName:identifier"
   * @private
   */
  async _buildClassFolderCache() {
    const cache = new Map();
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');
    for (const pack of itemPacks) {
      let packTopLevelFolder = null;
      if (pack.folder) {
        if (pack.folder.depth !== 1) packTopLevelFolder = pack.folder.getParentFolders().at(-1).name;
        else packTopLevelFolder = pack.folder.name;
      }
      if (!packTopLevelFolder) continue;
      try {
        const index = await pack.getIndex({ fields: ['type', 'system.identifier'] });
        const classItems = index.filter((e) => (e.type === 'class' || e.type === 'subclass') && e.system?.identifier);
        for (const cls of classItems) {
          const identifier = cls.system.identifier.toLowerCase();
          const key = `${packTopLevelFolder}:${identifier}`;
          cache.set(key, true);
        }
      } catch (err) {
        log(2, `Error indexing pack ${pack.metadata.label}:`, err);
      }
    }
    return cache;
  }

  /**
   * Create a new spell list.
   * @param formData - Necessary data to build the temporary form.
   * @returns {Promise<void>}
   * @private
   */
  async _createNewListCallback(formData) {
    let { name, identifier, isSubclass } = formData;
    const newList = await DataUtils.createNewSpellList(name, identifier, isSubclass ? 'subclass' : 'class');
    if (newList) {
      await this.loadData();
      await this.selectSpellList(newList.uuid);
    }
  }

  /**
   * Create merged spell list.
   * @param {string[]} spellListUuids - Array of UUIDs of the spell lists to merge
   * @param {string} mergedListName - Name for the merged list
   * @param {boolean} [hideSourceLists=false] - Whether to hide source lists after merge
   * @returns {Promise<void>}
   * @private
   */
  async _mergeListsCallback(spellListUuids, mergedListName, hideSourceLists = false) {
    try {
      const mergedList = await DataUtils.createMergedSpellList(spellListUuids, mergedListName);
      if (mergedList) {
        if (hideSourceLists) {
          const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
          const listsToHide = [];
          for (const uuid of spellListUuids) {
            const sourceList = this.availableSpellLists.find((l) => l.uuid === uuid);
            if (sourceList && !sourceList.isActorOwned && !hiddenLists.includes(uuid)) listsToHide.push(uuid);
          }

          if (listsToHide.length > 0) {
            await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, [...hiddenLists, ...listsToHide]);
          }
        }
        await this.loadData();
        await this.selectSpellList(mergedList.uuid);
      }
    } catch (error) {
      log(1, 'Error creating merged spell list:', error);
    }
  }

  /**
   * Handle selecting a spell list.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleSelectSpellList(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;
    await this.selectSpellList(element.dataset.uuid);
  }

  /**
   * Handle editing a spell list.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleEditSpellList(_event, _form) {
    if (!this.selectedSpellList) return;
    this.pendingChanges = { added: new Set(), removed: new Set() };
    const flags = this.selectedSpellList.document.flags?.[MODULE.ID] || {};
    const isCustom = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;
    const isActorSpellbook = !!flags.isActorSpellbook;
    if (!isCustom && !isActorSpellbook) await this._duplicateForEditing();
    this.isEditing = true;
    this.render(false);
    setTimeout(() => this.applyFilters(), 100);
  }

  /**
   * Handle removing a spell from the list.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleRemoveSpell(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;
    const spellUuid = element.dataset.uuid;
    if (!this.selectedSpellList || !this.isEditing) return;
    log(3, `Removing spell: ${spellUuid} from list`);
    this.pendingChanges.removed.add(spellUuid);
    this.pendingChanges.added.delete(spellUuid);
    this.selectedSpellList.spellUuids = this.selectedSpellList.spellUuids.filter((uuid) => uuid !== spellUuid);
    this.selectedSpellList.spells = this.selectedSpellList.spells.filter((spell) => spell.uuid !== spellUuid && spell.compendiumUuid !== spellUuid);
    this.selectedSpellList.spellsByLevel = DataUtils.organizeSpellsByLevel(this.selectedSpellList.spells);
    this._ensureSpellIcons();
    this.render(false);
    this.applyFilters();
  }

  /**
   * Handle adding a spell to the list.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleAddSpell(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;
    let spellUuid = element.dataset.uuid;
    if (!this.selectedSpellList || !this.isEditing) return;
    this.pendingChanges.added.add(spellUuid);
    this.pendingChanges.removed.delete(spellUuid);
    const spell = this.availableSpells.find((s) => s.uuid === spellUuid);
    if (!spell) return;
    const spellCopy = foundry.utils.deepClone(spell);
    spellCopy.compendiumUuid = spellUuid;
    if (!spellCopy.enrichedIcon) spellCopy.enrichedIcon = UIUtils.createSpellIconLink(spellCopy);
    this.selectedSpellList.spellUuids.push(spellUuid);
    this.selectedSpellList.spells.push(spellCopy);
    this.selectedSpellList.spellsByLevel = DataUtils.organizeSpellsByLevel(this.selectedSpellList.spells);
    this._ensureSpellIcons();
    this.render(false);
    this.applyFilters();
  }

  /**
   * Handle saving the custom spell list.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleSaveCustomList(_event, _form) {
    if (!this.selectedSpellList || !this.isEditing) return;
    const document = this.selectedSpellList.document;
    const originalSpells = Array.from(document.system.spells || []);
    const currentSpells = new Set(originalSpells);
    log(3, `Processing ${this.pendingChanges.added.size} spell additions`);
    for (const spellUuid of this.pendingChanges.added) currentSpells.add(spellUuid);
    await document.update({ 'system.spells': Array.from(currentSpells) });
    this.pendingChanges = { added: new Set(), removed: new Set() };
    this.isEditing = false;
    await this.selectSpellList(document.uuid);
  }

  /**
   * Handle deleting the custom spell list.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleDeleteCustomList(_event, _form) {
    if (!this.selectedSpellList) return;
    const uuid = this.selectedSpellList.uuid;
    const listName = this.selectedSpellList.name;
    const confirmed = await this.confirmDialog({
      title: game.i18n.localize('SPELLMANAGER.Confirm.DeleteTitle'),
      content: game.i18n.format('SPELLMANAGER.Confirm.DeleteContent', { name: `<strong>${listName}</strong>` }),
      confirmLabel: game.i18n.localize('SPELLMANAGER.Confirm.DeleteButton'),
      confirmIcon: 'fas fa-trash',
      confirmCssClass: 'dialog-button-danger'
    });
    if (!confirmed) return;
    await DataUtils.removeCustomSpellList(uuid);
    this.selectedSpellList = null;
    this.isEditing = false;
    this.render(false);
  }

  /**
   * Handle restoring from the original spell list.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleRestoreOriginal(_event, _form) {
    if (!this.selectedSpellList) return;
    const originalUuid = this.selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid;
    if (!originalUuid) return;
    const listName = this.selectedSpellList.name;
    const confirmed = await this.confirmDialog({
      title: game.i18n.localize('SPELLMANAGER.Confirm.RestoreTitle'),
      content: game.i18n.format('SPELLMANAGER.Confirm.RestoreContent', { name: `<strong>${listName}</strong>` }),
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

  /** @inheritdoc */
  async _onClose(options) {
    if (this.comparisonDialog) {
      await this.comparisonDialog.close();
      this.comparisonDialog = null;
    }
    this.comparisonSpells.clear();
    return super._onClose(options);
  }

  /**
   * Handle showing the documentation dialog.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleShowDocumentation(_event, _form) {
    const content = await renderTemplate(TEMPLATES.DIALOGS.MANAGER_DOCUMENTATION, {});
    await DialogV2.wait({
      window: { title: game.i18n.localize('SPELLMANAGER.Documentation.Title'), icon: 'fas fa-question-circle' },
      content: content,
      classes: ['spell-book', 'spell-manager-documentation'],
      buttons: [{ icon: 'fas fa-check', label: game.i18n.localize('Close'), action: 'close' }],
      position: { width: 650, height: 'auto' },
      default: 'close',
      rejectClose: false
    });
  }

  /**
   * Handle toggling the sidebar collapsed state
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleToggleSidebar(event, _form) {
    const isCollapsing = !this.element.classList.contains('sidebar-collapsed');
    this.element.classList.toggle('sidebar-collapsed');
    const caretIcon = event.currentTarget.querySelector('.collapse-indicator');
    if (caretIcon) caretIcon.className = isCollapsing ? 'fas fa-caret-right collapse-indicator' : 'fas fa-caret-left collapse-indicator';
  }

  /**
   * Handle toggling a spell level's collapsed state.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleToggleSpellLevel(event, _form) {
    const levelContainer = event.target.closest('.spell-level');
    if (!levelContainer || !levelContainer.classList.contains('spell-level')) return;
    const levelId = levelContainer.dataset.level;
    levelContainer.classList.toggle('collapsed');
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS) || [];
    const isCollapsed = levelContainer.classList.contains('collapsed');
    if (isCollapsed && !collapsedLevels.includes(levelId)) collapsedLevels.push(levelId);
    else if (!isCollapsed && collapsedLevels.includes(levelId)) collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
    game.user.setFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS, collapsedLevels);
    const header = levelContainer.querySelector('.spell-level-heading');
    const spellList = levelContainer.querySelector('.spell-list');
    const collapseIcon = header?.querySelector('.collapse-indicator');
    if (header) {
      header.setAttribute('aria-expanded', !isCollapsed);
      if (isCollapsed) header.classList.add('collapsed');
      else header.classList.remove('collapsed');
    }
    if (spellList) spellList.style.display = isCollapsed ? 'none' : '';
    if (collapseIcon) collapseIcon.className = `fas fa-caret-${isCollapsed ? 'right' : 'down'} collapse-indicator`;
  }

  /**
   * Handle toggling a folder's collapsed state.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleToggleFolder(event, _form) {
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
    const header = folderContainer.querySelector('.folder-header');
    const content = folderContainer.querySelector('.folder-content');
    const collapseIcon = header?.querySelector('.collapse-indicator');
    if (header) header.setAttribute('aria-expanded', !isCollapsed);
    if (content) content.style.display = isCollapsed ? 'none' : '';
    if (collapseIcon) collapseIcon.className = `fas fa-chevron-${isCollapsed ? 'right' : 'down'} collapse-indicator`;
  }

  /**
   * Handle opening an actor sheet.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleOpenActor(_event, _form) {
    const document = this.selectedSpellList.document;
    const actorId = document.flags?.[MODULE.ID]?.actorId;
    if (!actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    await actor.sheet.render(true);
  }

  /**
   * Handle opening a class item sheet.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleOpenClass(_event, _form) {
    const selectedSpellList = this.selectedSpellList;
    const identifier = selectedSpellList.document.system?.identifier;
    if (!identifier) return;
    let spellListMeta = this.availableSpellLists.find((list) => list.uuid === selectedSpellList.uuid);
    if (!spellListMeta || (spellListMeta.isCustom && selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid)) {
      const originalUuid = selectedSpellList.document.flags[MODULE.ID].originalUuid;
      if (originalUuid) spellListMeta = this.availableSpellLists.find((list) => list.uuid === originalUuid);
    }
    if (!spellListMeta) return;
    const topLevelFolderName = spellListMeta.pack;
    log(3, `Searching for class ${identifier} in source: ${topLevelFolderName}`);
    const classItem = await this._findClassInTopLevelFolder(identifier, topLevelFolderName);
    if (!classItem) return;
    await classItem.sheet.render(true);
    log(3, `Opened class sheet for ${classItem.name} from ${topLevelFolderName}`);
  }

  /**
   * Handle creating a new spell list.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleCreateNewList(_event, _form) {
    const classIdentifiers = await DataUtils.findClassIdentifiers();
    const identifierOptions = Object.entries(classIdentifiers)
      .sort(([, dataA], [, dataB]) => dataA.name.localeCompare(dataB.name))
      .map(([id, data]) => ({
        id: id,
        name: data.fullDisplay,
        plainName: data.name
      }));
    const { result, formData } = await this._showCreateListDialog(identifierOptions);
    if (result === 'create' && formData) await this._createNewListCallback(formData);
  }

  /**
   * Handle renaming a spell list.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleRenameSpellList(_event, _form) {
    if (!this.selectedSpellList) return;
    const currentName = this.selectedSpellList.name;
    const listUuid = this.selectedSpellList.uuid;
    const flags = this.selectedSpellList.document.flags?.[MODULE.ID] || {};
    const isRenameable = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList || this.selectedSpellList.isMerged;
    if (!isRenameable) return;
    try {
      const { result, formData } = await this._showRenameDialog(currentName);
      if (result === 'rename' && formData?.newName && formData.newName !== currentName) await this._performRename(listUuid, formData.newName);
    } catch (error) {
      log(1, 'Error in rename dialog:', error);
    }
  }

  /**
   * Show the rename dialog and return result.
   * @param {string} currentName - Current name of the spell list
   * @returns {Promise<Object>} Dialog result and form data
   * @private
   */
  async _showRenameDialog(currentName) {
    let formData = null;
    let isValid = false;
    const content = await renderTemplate(TEMPLATES.DIALOGS.RENAME_SPELL_LIST, { currentName });
    const result = await DialogV2.wait({
      window: { title: game.i18n.format('SPELLMANAGER.Rename.Title', { currentName: currentName }), icon: 'fas fa-pen' },
      content: content,
      position: { width: 'auto', height: 'auto' },
      classes: ['spell-book', 'rename-spell-list-dialog'],
      buttons: [
        {
          label: game.i18n.localize('SPELLMANAGER.Buttons.Rename'),
          icon: 'fas fa-check',
          action: 'rename',
          callback: (_event, _target, form) => {
            const formElement = form?.querySelector ? form : form.element;
            const newNameInput = formElement.querySelector('[name="newName"]');
            const newName = newNameInput?.value.trim();
            if (!isValid || !newName || newName === currentName) return false;
            formData = { newName };
            return 'rename';
          }
        },
        {
          label: game.i18n.localize('SPELLBOOK.UI.Cancel'),
          icon: 'fas fa-times',
          action: 'cancel'
        }
      ],
      default: 'cancel',
      rejectClose: false,
      render: (_event, target, _form) => {
        const dialogElement = target.querySelector ? target : target.element;
        this._setupRenameDialogListeners(dialogElement, currentName, (valid) => {
          isValid = valid;
        });
      }
    });
    return { result, formData };
  }

  /**
   * Set up listeners for the rename dialog.
   * @param {HTMLElement} target - The dialog DOM element
   * @param {string} currentName - Current name for comparison
   * @param {Function} validationCallback - Callback to report validation status
   * @private
   */
  _setupRenameDialogListeners(target, currentName, validationCallback) {
    const newNameInput = target.querySelector('#new-name');
    const renameButton = target.querySelector('button[data-action="rename"]');
    const errorElement = target.querySelector('.validation-error');
    const errorMessage = target.querySelector('.error-message');
    if (newNameInput && renameButton) {
      newNameInput.addEventListener('focus', () => {
        newNameInput.select();
      });
      const validateName = () => {
        const value = newNameInput.value.trim();
        const isNotEmpty = value.length > 0 && value.length <= 100;
        const isNotSame = value !== currentName;
        const isNotDuplicate = !this._checkDuplicateName(value);
        const isValid = isNotEmpty && isNotSame && isNotDuplicate;
        renameButton.disabled = !isValid;
        newNameInput.classList.toggle('error', !isValid && value.length > 0);
        if (errorElement && errorMessage) {
          if (value.length > 0 && !isNotDuplicate) {
            errorMessage.textContent = game.i18n.localize('SPELLMANAGER.Rename.DuplicateNameError');
            errorElement.style.display = 'block';
          } else if (value.length > 0 && !isNotEmpty) {
            errorMessage.textContent = game.i18n.localize('SPELLMANAGER.Rename.ValidationError');
            errorElement.style.display = 'block';
          } else {
            errorElement.style.display = 'none';
          }
        }
        if (validationCallback) validationCallback(isValid);
      };
      newNameInput.addEventListener('input', validateName);
      validateName();
      setTimeout(() => newNameInput.focus(), 100);
    }
  }

  /**
   * Check if a spell list name already exists.
   * @param {string} name - Name to check
   * @returns {boolean} True if name exists
   * @private
   */
  _checkDuplicateName(name) {
    const duplicate = this.availableSpellLists.some((list) => {
      const nameMatch = list.name.toLowerCase() === name.toLowerCase();
      const isNotCurrentList = list.uuid !== this.selectedSpellList?.uuid;
      return nameMatch && isNotCurrentList;
    });
    return duplicate;
  }

  /**
   * Perform the actual rename operation.
   * @param {string} listUuid - UUID of the list to rename
   * @param {string} newName - New name for the list
   * @returns {Promise<void>}
   * @private
   */
  async _performRename(listUuid, newName) {
    try {
      const document = this.selectedSpellList.document;
      if (document.parent && document.parent.pages.size === 1) await document.parent.update({ name: newName });
      await document.update({ name: newName });
      this.selectedSpellList.name = newName;
      await this.loadData();
      await this.selectSpellList(listUuid);
    } catch (error) {
      log(1, 'Error renaming spell list:', error);
    }
  }

  /**
   * Handle merging spell lists.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleMergeLists(_event, _form) {
    if (this.availableSpellLists.length < 2) return;
    const { result, formData } = await this._showMergeListsDialog();
    if (result === 'merge' && formData) {
      await this._mergeListsCallback(formData.spellListUuids, formData.mergedListName, formData.hideSourceLists);
    }
  }

  /**
   * Handle toggling selection mode.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleToggleSelectionMode(_event, _form) {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this._clearSelections();
    } else {
      this.selectedSpellsToAdd.clear();
      this.selectedSpellsToRemove.clear();
      this.lastSelectedIndex = { add: -1, remove: -1 };
    }
    this.render(false);
  }

  /**
   * Handle selecting all visible spells.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleSelectAll(event, _form) {
    if (this.isSelectingAll) return;
    this.isSelectingAll = true;
    const checkbox = event.target;
    const type = checkbox.dataset.type;
    if (type === 'add') {
      const visibleSpells = this._getVisibleSpells();
      if (checkbox.checked) {
        visibleSpells.forEach((spell) => {
          this.selectedSpellsToAdd.add(spell.uuid);
        });
      } else {
        visibleSpells.forEach((spell) => {
          this.selectedSpellsToAdd.delete(spell.uuid);
        });
      }
    } else if (type === 'remove') {
      const currentSpells = this.selectedSpellList?.spells || [];
      if (checkbox.checked) {
        currentSpells.forEach((spell) => {
          const spellUuid = spell.uuid || spell.compendiumUuid;
          this.selectedSpellsToRemove.add(spellUuid);
        });
      } else {
        currentSpells.forEach((spell) => {
          const spellUuid = spell.uuid || spell.compendiumUuid;
          this.selectedSpellsToRemove.delete(spellUuid);
        });
      }
    }
    this._updateSelectionCount();
    this._updateSpellCheckboxes();
    setTimeout(() => {
      this._updateSelectAllCheckboxes();
      this.isSelectingAll = false;
    }, 50);
  }

  /**
   * Handle bulk save operation.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleBulkSave(_event, _form) {
    const addCount = this.selectedSpellsToAdd.size;
    const removeCount = this.selectedSpellsToRemove.size;
    const totalCount = addCount + removeCount;
    if (totalCount === 0 || !this.selectedSpellList || !this.isEditing) return;
    let confirmMessage = '';
    if (addCount > 0 && removeCount > 0) confirmMessage = game.i18n.format('SPELLMANAGER.BulkOps.ConfirmAddAndRemove', { addCount, removeCount });
    else if (addCount > 0) confirmMessage = game.i18n.format('SPELLMANAGER.BulkOps.ConfirmAdd', { count: addCount });
    else confirmMessage = game.i18n.format('SPELLMANAGER.BulkOps.ConfirmRemove', { count: removeCount });
    const confirmed = await this.confirmDialog({
      title: game.i18n.localize('SPELLMANAGER.BulkOps.ConfirmSave'),
      content: confirmMessage,
      confirmLabel: game.i18n.format('SPELLMANAGER.BulkOps.SaveChanges', { count: totalCount }),
      confirmIcon: 'fas fa-save',
      confirmCssClass: 'dialog-button-success'
    });
    if (!confirmed) return;
    try {
      let processed = 0;
      let failed = 0;
      if (removeCount > 0) {
        for (const spellUuid of this.selectedSpellsToRemove) {
          try {
            this.pendingChanges.removed.add(spellUuid);
            this.pendingChanges.added.delete(spellUuid);
            this.selectedSpellList.spellUuids = this.selectedSpellList.spellUuids.filter((uuid) => uuid !== spellUuid);
            this.selectedSpellList.spells = this.selectedSpellList.spells.filter((spell) => spell.uuid !== spellUuid && spell.compendiumUuid !== spellUuid);
            processed++;
          } catch (error) {
            log(1, `Failed to remove spell ${spellUuid}:`, error);
            failed++;
          }
        }
      }
      if (addCount > 0) {
        for (const spellUuid of this.selectedSpellsToAdd) {
          try {
            this.pendingChanges.added.add(spellUuid);
            this.pendingChanges.removed.delete(spellUuid);
            const spell = this.availableSpells.find((s) => s.uuid === spellUuid);
            if (spell) {
              const spellCopy = foundry.utils.deepClone(spell);
              spellCopy.compendiumUuid = spellUuid;
              if (!spellCopy.enrichedIcon) spellCopy.enrichedIcon = UIUtils.createSpellIconLink(spellCopy);
              this.selectedSpellList.spellUuids.push(spellUuid);
              this.selectedSpellList.spells.push(spellCopy);
            } else log(2, `Could not find spell with UUID: ${spellUuid}`);
            processed++;
          } catch (error) {
            log(1, `Failed to add spell ${spellUuid}:`, error);
            failed++;
          }
        }
      }
      this.selectedSpellList.spellsByLevel = DataUtils.organizeSpellsByLevel(this.selectedSpellList.spells);
      this._ensureSpellIcons();
      this._clearSelections();
      if (failed === 0) ui.notifications.info(game.i18n.format('SPELLMANAGER.BulkOps.Completed', { count: processed }));
      else ui.notifications.warn(game.i18n.format('SPELLMANAGER.BulkOps.PartialFailure', { success: processed, total: totalCount, failed }));
      this.render(false);
    } catch (error) {
      log(1, 'Error in bulk save operation:', error);
    }
  }

  /**
   * Handle canceling selection mode.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleCancelSelection(_event, _form) {
    this._clearSelections();
    this.render(false);
  }

  /**
   * Handle toggling spell list visibility.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleToggleListVisibility(event, _form) {
    event.stopPropagation();
    const listItem = event.target.closest('[data-uuid]');
    if (!listItem) return;
    const uuid = listItem.dataset.uuid;
    const list = this.availableSpellLists.find((l) => l.uuid === uuid);
    if (!list || list.isActorOwned) return;
    const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const isCurrentlyHidden = hiddenLists.includes(uuid);
    try {
      if (isCurrentlyHidden) {
        const newHiddenLists = hiddenLists.filter((id) => id !== uuid);
        await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, newHiddenLists);
      } else {
        const newHiddenLists = [...hiddenLists, uuid];
        await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, newHiddenLists);
      }
      this.render(false);
    } catch (error) {
      log(1, 'Error toggling list visibility:', error);
    }
  }

  /**
   * Handle opening the analytics dashboard for GM users.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the event
   * @returns {Promise<void>}
   * @static
   */
  static async handleOpenAnalyticsDashboard(_event, _target) {
    const dashboard = new AnalyticsDashboard({ viewMode: 'gm' });
    dashboard.render(true);
  }

  /**
   * Handle opening the spell details customization dialog.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the event
   * @returns {Promise<void>}
   * @static
   */
  static async handleOpenCustomization(_event, _target) {
    const dialog = new DetailsCustomization();
    dialog.render(true);
  }

  /**
   * Handle spell comparison selection and dialog management.
   * @param {MouseEvent} event - The click event
   * @param {HTMLFormElement} _form - The form element (unused)
   * @returns {Promise<void>}
   * @static
   */
  static async handleCompareSpell(event, _form) {
    const spellUuid = event.target.dataset.uuid;
    const maxSpells = game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX);
    if (this.comparisonSpells.has(spellUuid)) this.comparisonSpells.delete(spellUuid);
    else if (this.comparisonSpells.size < maxSpells) this.comparisonSpells.add(spellUuid);
    this.render(false);
    if (this.comparisonSpells.size >= 2) {
      if (!this.comparisonDialog) {
        this.comparisonDialog = new SpellComparison(this);
        this.comparisonDialog.render(true);
      } else {
        this.comparisonDialog.render(false);
        this.comparisonDialog.bringToFront();
      }
    } else if (this.comparisonDialog && this.comparisonSpells.size < 2) {
      this.comparisonDialog.close();
      this.comparisonDialog = null;
    }
  }

  /**
   * Handle toggling registry integration for a spell list.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleToggleRegistry(event, _form) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selectedSpellList) return;
    const uuid = this.selectedSpellList.uuid;
    const checkbox = event.target.closest('input[type="checkbox"]');
    try {
      const newState = await DataUtils.toggleListForRegistry(uuid);
      checkbox.checked = newState;
    } catch (error) {
      log(1, 'Error toggling registry:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Registry.ToggleError'));
      checkbox.checked = !checkbox.checked; // Revert on error
    }
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.isLoading) {
      this.loadData();
      return;
    }
    this.setupFilterListeners();
    this.setupMultiSelectListeners();
    this.applyCollapsedLevels();
    this.applyCollapsedFolders();
  }

  /**
   * Set up event listeners for multi-select functionality.
   */
  setupMultiSelectListeners() {
    if (!this.isEditing) return;
    this.element.addEventListener('click', (event) => {
      if (!this.selectionMode) return;
      if (event.target.tagName === 'DND5E-CHECKBOX' && event.target.classList.contains('spell-select-cb') && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const checkbox = event.target;
        const uuid = checkbox.dataset.uuid;
        const type = checkbox.dataset.type;
        const isAvailableSpell = type === 'add';
        checkbox.checked = true;
        this._handleRangeSelection(uuid, isAvailableSpell);
        this._updateSelectionCount();
        this._updateSpellCheckboxes();
        this._updateSelectAllCheckboxes();
        return;
      }
      if (event.target.tagName === 'DND5E-CHECKBOX') return;
      const spellItem = event.target.closest('.spell-item');
      if (spellItem && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const uuid = spellItem.dataset.uuid;
        const type = spellItem.dataset.selectionType;
        const isAvailableSpell = type === 'add';
        this._handleRangeSelection(uuid, isAvailableSpell);
        this._updateSelectionCount();
        this._updateSpellCheckboxes();
        this._updateSelectAllCheckboxes();
      }
    });
    this.element.addEventListener('change', (event) => {
      if (!this.selectionMode || this.isUpdatingCheckboxes) return;
      const checkbox = event.target;
      if (checkbox.tagName !== 'DND5E-CHECKBOX' || !checkbox.classList.contains('spell-select-cb')) return;
      event.stopPropagation();
      const uuid = checkbox.dataset.uuid;
      const type = checkbox.dataset.type;
      const selectedSet = type === 'add' ? this.selectedSpellsToAdd : this.selectedSpellsToRemove;
      const isAvailableSpell = type === 'add';
      if (checkbox.checked) selectedSet.add(uuid);
      else selectedSet.delete(uuid);
      const lastIndexKey = isAvailableSpell ? 'add' : 'remove';
      if (this.lastSelectedIndex[lastIndexKey] === -1) this._updateLastSelectedIndex(uuid, isAvailableSpell);
      this._updateSelectionCount();
      this._updateSpellCheckboxes();
      this._updateSelectAllCheckboxes();
    });
    this.element.addEventListener('keydown', (event) => {
      if (!this.selectionMode) return;
      if (event.key === 'Escape') {
        this._clearSelections();
        this.render(false);
        event.preventDefault();
      } else if (event.key === 'Enter' && this.selectedSpellsToAdd.size + this.selectedSpellsToRemove.size > 0) {
        const bulkSaveBtn = this.element.querySelector('.bulk-save-btn');
        if (bulkSaveBtn && !bulkSaveBtn.disabled) SpellListManager.handleBulkSave.call(this, { target: bulkSaveBtn }, null);
        event.preventDefault();
      }
    });
    if (this.selectionMode) {
      this._updateSpellCheckboxes();
      this._updateSelectAllCheckboxes();
      this._updateSelectionCount();
    }
  }

  /**
   * Handle range selection with shift+click.
   * @param {string} uuid - The clicked spell UUID
   * @param {boolean} isAvailableSpell - Whether this is an available spell or selected spell
   * @private
   */
  _handleRangeSelection(uuid, isAvailableSpell) {
    const selectedSet = isAvailableSpell ? this.selectedSpellsToAdd : this.selectedSpellsToRemove;
    let spells;
    if (isAvailableSpell) spells = this._getVisibleSpells();
    else {
      spells = [];
      if (this.selectedSpellList?.spellsByLevel) for (const levelData of this.selectedSpellList.spellsByLevel) if (levelData.spells) spells.push(...levelData.spells);
    }
    const lastIndexKey = isAvailableSpell ? 'add' : 'remove';
    const currentIndex = spells.findIndex((spell) => {
      if (isAvailableSpell) return spell.uuid === uuid;
      else return (spell.uuid || spell.compendiumUuid) === uuid;
    });
    if (currentIndex === -1) return;
    if (this.lastSelectedIndex[lastIndexKey] >= 0) {
      const start = Math.min(this.lastSelectedIndex[lastIndexKey], currentIndex);
      const end = Math.max(this.lastSelectedIndex[lastIndexKey], currentIndex);
      for (let i = start; i <= end; i++) {
        const spellUuid = isAvailableSpell ? spells[i].uuid : spells[i].uuid || spells[i].compendiumUuid;
        selectedSet.add(spellUuid);
      }
    } else selectedSet.add(uuid);
    this.lastSelectedIndex[lastIndexKey] = currentIndex;
  }

  /**
   * Update the last selected index for range selection.
   * @param {string} uuid - The clicked spell UUID
   * @param {boolean} isAvailableSpell - Whether this is an available spell or selected spell
   * @private
   */
  _updateLastSelectedIndex(uuid, isAvailableSpell) {
    let spells;
    if (isAvailableSpell) spells = this._getVisibleSpells();
    else {
      spells = [];
      if (this.selectedSpellList?.spellsByLevel) for (const levelData of this.selectedSpellList.spellsByLevel) if (levelData.spells) spells.push(...levelData.spells);
    }
    const lastIndexKey = isAvailableSpell ? 'add' : 'remove';
    const currentIndex = spells.findIndex((spell) => {
      if (isAvailableSpell) return spell.uuid === uuid;
      else return (spell.uuid || spell.compendiumUuid) === uuid;
    });
    if (currentIndex >= 0) this.lastSelectedIndex[lastIndexKey] = currentIndex;
  }

  /**
   * Create a spell selection checkbox with proper data attributes.
   * @param {Object} spell - The spell object
   * @param {string} type - 'add' or 'remove'
   * @param {boolean} [isChecked=false] - Whether the checkbox should be checked
   * @returns {string} HTML string for the checkbox
   * @private
   */
  _createSpellSelectCheckbox(spell, type, isChecked = false) {
    const checkbox = ValidationUtils.createCheckbox({
      checked: isChecked,
      cssClass: 'spell-select-cb',
      ariaLabel:
        type === 'add' ? game.i18n.format('SPELLMANAGER.Selection.SelectSpellToAdd', { name: spell.name }) : game.i18n.format('SPELLMANAGER.Selection.SelectSpellToRemove', { name: spell.name })
    });
    checkbox.dataset.type = type;
    checkbox.dataset.uuid = spell.uuid || spell.compendiumUuid;
    return ValidationUtils.elementToHtml(checkbox);
  }

  /**
   * Create a select-all checkbox with proper data attributes.
   * @param {string} type - 'add' or 'remove'
   * @returns {string} HTML string for the checkbox
   * @private
   */
  _createSelectAllCheckbox(type) {
    const checkbox = ValidationUtils.createCheckbox({
      cssClass: 'select-all-checkbox',
      ariaLabel: type === 'add' ? game.i18n.localize('SPELLMANAGER.Selection.SelectAllToAdd') : game.i18n.localize('SPELLMANAGER.Selection.SelectAllToRemove')
    });
    checkbox.dataset.action = 'selectAll';
    checkbox.dataset.type = type;
    return ValidationUtils.elementToHtml(checkbox);
  }
}
