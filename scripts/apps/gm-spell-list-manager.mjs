import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as managerHelpers from '../helpers/compendium-management.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import { SpellbookFilterHelper } from '../helpers/ui/spellbook-filters.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM Spell List Manager application for viewing, editing, and creating spell lists
 * with comprehensive multi-select functionality for bulk operations and lazy loading
 */
export class GMSpellListManager extends HandlebarsApplicationMixin(ApplicationV2) {
  // ========================================
  // Constructor and Basic Setup
  // ========================================

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
      createNewList: GMSpellListManager.handleCreateNewList,
      mergeLists: GMSpellListManager.handleMergeLists,
      toggleSelectionMode: GMSpellListManager.handleToggleSelectionMode,
      selectAll: GMSpellListManager.handleSelectAll,
      bulkSave: GMSpellListManager.handleBulkSave,
      cancelSelection: GMSpellListManager.handleCancelSelection,
      toggleListVisibility: GMSpellListManager.handleToggleListVisibility
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

  static BATCHING = {
    SIZE: 50,
    MARGIN: 100
  };

  /** @override */
  static PARTS = {
    container: { template: TEMPLATES.GM.MAIN },
    spellLists: { template: TEMPLATES.GM.SPELL_LISTS, scrollable: ['.lists-container'] },
    listContent: { template: TEMPLATES.GM.LIST_CONTENT, scrollable: ['.selected-list-spells'] },
    availableSpells: { template: TEMPLATES.GM.AVAILABLE_SPELLS, scrollable: ['.available-spells-wrapper'] },
    footer: { template: TEMPLATES.GM.FOOTER }
  };

  /**
   * @returns {string} The application title
   */
  get title() {
    return game.i18n.localize('SPELLMANAGER.Application.Title');
  }

  /**
   * Get batch size from settings
   * @returns {number}
   */
  get batchSize() {
    return game.settings.get(MODULE.ID, SETTINGS.LAZY_BATCH_SIZE) || this.constructor.BATCHING.SIZE;
  }

  /**
   * Initialize the GM Spell List Manager
   * @param {Object} options - Application options
   */
  constructor(options) {
    log(1, 'GMSpellListManager: Constructor called with options:', options);
    super(options);

    log(1, 'GMSpellListManager: Initializing properties...');
    this.availableSpellLists = [];
    this.selectedSpellList = null;
    this.availableSpells = [];
    this.isEditing = false;
    this.pendingChanges = { added: new Set(), removed: new Set() };
    this.selectedSpellsToAdd = new Set();
    this.selectedSpellsToRemove = new Set();
    this.selectionMode = false;
    this.lastSelectedIndex = { add: -1, remove: -1 };
    this.isSelectingAll = false;

    log(1, 'GMSpellListManager: Initializing filter state...');
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
      materialComponents: '',
      prepared: false,
      ritual: false
    };

    log(1, 'GMSpellListManager: Creating filter helper...');
    this.filterHelper = new SpellbookFilterHelper(this);
    this.isUpdatingCheckboxes = false;

    log(1, 'GMSpellListManager: Initializing lazy loading properties...');
    this.#lazyAvailableResults = null;
    this.#lazyAvailableRenderIndex = -1;
    this.#lazyAvailableRenderThrottle = false;
    this.#lazySelectedResults = null;
    this.#lazySelectedRenderIndex = -1;
    this.#lazySelectedRenderThrottle = false;
    this._currentSelectedLevelHeaders = new Map();
    this._lastScrollElementAvailable = null;
    this._lastScrollElementSelected = null;

    log(1, 'GMSpellListManager: Constructor completed successfully');

    log(1, 'GMSpellListManager: Starting spell lists load (Phase 1)');
    this.loadSpellLists();
  }

  /**
   * Lazy loading state properties
   */
  #lazyAvailableResults = null;
  #lazyAvailableRenderIndex = -1;
  #lazyAvailableRenderThrottle = false;

  #lazySelectedResults = null;
  #lazySelectedRenderIndex = -1;
  #lazySelectedRenderThrottle = false;

  // ========================================
  // Context Preparation
  // ========================================

  /** @inheritdoc */
  async _prepareContext(options) {
    log(1, 'GMSpellListManager: _prepareContext() called with options:', options);
    const context = await super._prepareContext(options);
    log(1, 'GMSpellListManager: Base context prepared');
    context.isEditing = this.isEditing;
    context.selectedSpellList = this.selectedSpellList;
    context.availableSpells = this.availableSpells;
    context.filterState = this.filterState;
    context.settings = { distanceUnit: game.settings.get(MODULE.ID, SETTINGS.DISTANCE_UNIT) };
    context.selectionMode = this.selectionMode;
    context.selectedSpellsToAdd = this.selectedSpellsToAdd;
    context.selectedSpellsToRemove = this.selectedSpellsToRemove;
    context.selectedToAddCount = this.selectedSpellsToAdd.size;
    context.selectedToRemoveCount = this.selectedSpellsToRemove.size;
    context.totalSelectedCount = this.selectedSpellsToAdd.size + this.selectedSpellsToRemove.size;
    context.spellSchools = CONFIG.DND5E.spellSchools;
    context.spellLevels = CONFIG.DND5E.spellLevels;

    log(1, `GMSpellListManager: Context properties set - availableSpellLists length: ${this.availableSpellLists?.length || 0}`);
    log(1, `GMSpellListManager: Context - isEditing: ${context.isEditing}, selectedSpellList: ${!!context.selectedSpellList}`);

    if (this.isEditing && this.selectionMode) {
      log(1, 'GMSpellListManager: Creating select all checkboxes for selection mode');
      context.selectAllAddCheckboxHtml = this._createSelectAllCheckbox('add');
      context.selectAllRemoveCheckboxHtml = this._createSelectAllCheckbox('remove');
    }

    if (this.availableSpellLists?.length) {
      log(1, 'GMSpellListManager: Organizing spell lists context...');
      this._organizeSpellListsContext(context);
      log(1, 'GMSpellListManager: Spell lists organized successfully');
    } else {
      log(1, 'GMSpellListManager: CRITICAL - No availableSpellLists to organize! This explains the empty sidebar.');
    }

    const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
    context.customListMap = customMappings;

    if (this.availableSpells.length > 0) {
      log(1, 'GMSpellListManager: Preparing filter context...');
      this._prepareFilterContext(context);
    } else {
      log(1, 'GMSpellListManager: No available spells - skipping filter context preparation');
    }

    if (this.isEditing && this.selectedSpellList) {
      log(1, 'GMSpellListManager: Adding editing context...');
      await this._addEditingContext(context);
    }

    if (this.selectedSpellList?.spellsByLevel && this.isEditing && this.selectionMode) {
      this.selectedSpellList.spellsByLevel = this.selectedSpellList.spellsByLevel.map((levelData) => {
        const processedLevel = { ...levelData };
        processedLevel.spells = levelData.spells.map((spell) => {
          const spellUuid = spell.uuid || spell.compendiumUuid;
          const processedSpell = { ...spell };
          processedSpell.selectRemoveCheckboxHtml = this._createSpellSelectCheckbox(spell, 'remove', this.selectedSpellsToRemove.has(spellUuid));
          return processedSpell;
        });
        return processedLevel;
      });
    }
    if (this.selectedSpellList) {
      log(1, 'GMSpellListManager: Processing selected spell list for display...');
      context.selectedSpellList = formattingUtils.processSpellListForDisplay(this.selectedSpellList);
    }

    log(1, 'GMSpellListManager: _prepareContext() completed, returning context');
    return context;
  }

  /**
   * Organize spell lists into categories for the context
   * @param {Object} context - The context object to modify
   * @private
   */
  _organizeSpellListsContext(context) {
    log(1, 'GMSpellListManager: _organizeSpellListsContext() called');
    log(1, `GMSpellListManager: Input availableSpellLists length: ${this.availableSpellLists.length}`);

    const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    log(1, `GMSpellListManager: Hidden lists count: ${hiddenLists.length}`);

    const actorOwnedLists = this.availableSpellLists.filter((list) => list.isActorOwned);
    log(1, `GMSpellListManager: Actor owned lists: ${actorOwnedLists.length}`);

    const hiddenSpellLists = this.availableSpellLists.filter((list) => !list.isActorOwned && hiddenLists.includes(list.uuid));
    log(1, `GMSpellListManager: Hidden spell lists: ${hiddenSpellLists.length}`);

    const mergedLists = this.availableSpellLists.filter((list) => !list.isActorOwned && list.isMerged && !hiddenLists.includes(list.uuid));
    log(1, `GMSpellListManager: Merged lists: ${mergedLists.length}`);

    const customLists = this.availableSpellLists.filter(
      (list) => !list.isActorOwned && !list.isMerged && (list.isCustom || list.document?.flags?.[MODULE.ID]?.isNewList) && !hiddenLists.includes(list.uuid)
    );
    log(1, `GMSpellListManager: Custom lists: ${customLists.length}`);

    const standardLists = this.availableSpellLists.filter(
      (list) => !list.isActorOwned && !list.isCustom && !list.isMerged && !list.document?.flags?.[MODULE.ID]?.isNewList && !hiddenLists.includes(list.uuid)
    );
    log(1, `GMSpellListManager: Standard lists: ${standardLists.length}`);
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

    log(1, 'GMSpellListManager: Context organization completed');
    log(1, `GMSpellListManager: Final context has ${context.availableSpellLists.length} total lists`);
    log(
      1,
      `GMSpellListManager: Categories - Actor: ${context.hasActorOwnedLists}, Custom: ${context.hasCustomLists}, Merged: ${context.hasMergedLists}, Standard: ${context.hasStandardLists}, Hidden: ${context.hasHiddenLists}`
    );
  }

  /**
   * Prepare filter-related context data
   * @param {Object} context - The context object to modify
   * @private
   */
  _prepareFilterContext(context) {
    context.spellSources = managerHelpers.prepareSpellSources(this.availableSpells);
    context.castingTimeOptions = managerHelpers.prepareCastingTimeOptions(this.availableSpells, this.filterState);
    context.damageTypeOptions = managerHelpers.prepareDamageTypeOptions(this.filterState);
    context.conditionOptions = managerHelpers.prepareConditionOptions(this.filterState);
    context.filterFormElements = this._prepareFilterFormElements();
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
        const compareResult = await managerHelpers.compareListVersions(originalUuid, this.selectedSpellList.document.uuid);
        context.compareInfo = compareResult;
      }
    }
  }

  // ========================================
  // Lazy Loading Implementation
  // ========================================

  /**
   * Reset lazy loading state for both panels
   * @param {string} panel - 'available', 'selected', or 'both'
   */
  _resetLazyState(panel = 'both') {
    log(1, `Resetting lazy state for ${panel} panel(s)`);
    if (panel === 'available' || panel === 'both') {
      this.#lazyAvailableResults = null;
      this.#lazyAvailableRenderIndex = -1;
      this.#lazyAvailableRenderThrottle = false;
    }
    if (panel === 'selected' || panel === 'both') {
      this.#lazySelectedResults = null;
      this.#lazySelectedRenderIndex = -1;
      this.#lazySelectedRenderThrottle = false;
      this._currentSelectedLevelHeaders.clear();
    }
  }

  /**
   * Prepare lazy spell data for available spells (right panel)
   * @returns {Array} Filtered spell array ready for batching
   */
  _prepareLazyAvailableSpellData() {
    log(1, `Preparing lazy data for available spells`);
    const selectedSpellUUIDs = this.getSelectedSpellUUIDs();
    const filteredData = this.filterHelper.filterAvailableSpells(this.availableSpells, selectedSpellUUIDs, this.isSpellInSelectedList.bind(this), this.filterState);
    const spellsWithSelection = filteredData.spells.map((spell) => {
      const processedSpell = { ...spell };
      if (this.isEditing && this.selectionMode) processedSpell.selectAddCheckboxHtml = this._createSpellSelectCheckbox(spell, 'add', this.selectedSpellsToAdd.has(spell.uuid));
      return processedSpell;
    });
    log(1, `Prepared ${spellsWithSelection.length} available spells for lazy loading`);
    return spellsWithSelection;
  }

  /**
   * Prepare lazy spell data for selected spells (center panel) - flatten level organization
   * @returns {Array} Flattened spell array with level metadata ready for batching
   */
  _prepareLazySelectedSpellData() {
    log(1, `Preparing lazy data for selected spells`);
    if (!this.selectedSpellList?.spellsByLevel) {
      log(2, `No spell data found for selected list`);
      return [];
    }
    const flattened = [];
    const sortedLevels = [...this.selectedSpellList.spellsByLevel].sort((a, b) => Number(a.level) - Number(b.level));
    for (const levelData of sortedLevels) {
      const levelName = levelData.levelName || CONFIG.DND5E.spellLevels[levelData.level];
      for (let i = 0; i < levelData.spells.length; i++) {
        const spell = levelData.spells[i];
        const processedSpell = { ...spell };
        processedSpell._levelMetadata = {
          level: levelData.level,
          levelName: levelName,
          isFirstInLevel: i === 0,
          levelSpellCount: levelData.spells.length,
          levelIndex: i
        };
        if (this.isEditing && this.selectionMode) {
          const spellUuid = spell.uuid || spell.compendiumUuid;
          processedSpell.selectRemoveCheckboxHtml = this._createSpellSelectCheckbox(spell, 'remove', this.selectedSpellsToRemove.has(spellUuid));
        }
        flattened.push(processedSpell);
      }
    }
    log(1, `Prepared ${flattened.length} selected spells for lazy loading across ${sortedLevels.length} levels`);
    return flattened;
  }

  /**
   * Initialize lazy loading for available spells panel
   */
  _initializeLazyLoadingAvailable() {
    log(1, `Initializing lazy loading for available spells`);
    this._resetLazyState('available');
    this.#lazyAvailableResults = this._prepareLazyAvailableSpellData();
    if (!this.#lazyAvailableResults || this.#lazyAvailableResults.length === 0) {
      log(2, `No available spells to render`);
      const availableSpellsList = this.element.querySelector('.available-spells');
      if (availableSpellsList) {
        availableSpellsList.innerHTML = '';
        const emptyState = `<div class="empty-state" role="status">
          <p>${game.i18n.localize('SPELLMANAGER.Columns.NoMatchingSpells')}</p>
        </div>`;
        availableSpellsList.insertAdjacentHTML('beforeend', emptyState);
      }
      return;
    }
    const availableSpellsList = this.element.querySelector('.available-spells');
    if (availableSpellsList) availableSpellsList.innerHTML = '';
    this._renderAvailableSpellsBatch();
  }

  /**
   * Initialize lazy loading for selected spells panel
   */
  _initializeLazyLoadingSelected() {
    log(1, `Initializing lazy loading for selected spells`);
    this._resetLazyState('selected');
    this.#lazySelectedResults = this._prepareLazySelectedSpellData();
    if (!this.#lazySelectedResults || this.#lazySelectedResults.length === 0) {
      log(2, `No selected spells to render`);
      const spellsContainer = this.element.querySelector('.selected-list-spells .spells-container');
      if (spellsContainer) {
        spellsContainer.innerHTML = '';
        const emptyState = `<div class="empty-state" role="status">
          <p>${this.isEditing ? game.i18n.localize('SPELLMANAGER.Columns.AddSpellsPrompt') : game.i18n.localize('SPELLMANAGER.Columns.NoSpells')}</p>
        </div>`;
        spellsContainer.insertAdjacentHTML('beforeend', emptyState);
      }
      return;
    }
    const spellsContainer = this.element.querySelector('.selected-list-spells .spells-container');
    if (spellsContainer) spellsContainer.innerHTML = '';
    this._renderSelectedSpellsBatch();
  }

  /**
   * Render next batch of available spells
   */
  _renderAvailableSpellsBatch() {
    if (this.#lazyAvailableRenderThrottle || !this.#lazyAvailableResults) return;
    const batchStart = this.#lazyAvailableRenderIndex + 1;
    const batchEnd = Math.min(batchStart + this.batchSize, this.#lazyAvailableResults.length);
    if (batchStart >= this.#lazyAvailableResults.length) return;
    log(1, `Rendering available spells batch ${batchStart} to ${batchEnd - 1}`);
    this.#lazyAvailableRenderThrottle = true;
    const availableSpellsList = this.element.querySelector('.available-spells');
    if (!availableSpellsList) {
      log(2, `No available spells list found for batch rendering`);
      this.#lazyAvailableRenderThrottle = false;
      return;
    }
    for (let i = batchStart; i < batchEnd; i++) {
      const spell = this.#lazyAvailableResults[i];
      const spellHtml = this._createAvailableSpellItemHtml(spell);
      availableSpellsList.insertAdjacentHTML('beforeend', spellHtml);
    }
    this.#lazyAvailableRenderIndex = batchEnd - 1;
    this.#lazyAvailableRenderThrottle = false;
    log(1, `Rendered ${batchEnd - batchStart} available spells, index now at ${this.#lazyAvailableRenderIndex}`);
  }

  /**
   * Render next batch of selected spells with dynamic level headers
   */
  _renderSelectedSpellsBatch() {
    if (this.#lazySelectedRenderThrottle || !this.#lazySelectedResults) return;
    const batchStart = this.#lazySelectedRenderIndex + 1;
    const batchEnd = Math.min(batchStart + this.batchSize, this.#lazySelectedResults.length);
    if (batchStart >= this.#lazySelectedResults.length) return;
    log(1, `Rendering selected spells batch ${batchStart} to ${batchEnd - 1}`);
    this.#lazySelectedRenderThrottle = true;
    const spellsContainer = this.element.querySelector('.selected-list-spells .spells-container');
    if (!spellsContainer) {
      log(2, `No spells container found for batch rendering`);
      this.#lazySelectedRenderThrottle = false;
      return;
    }
    for (let i = batchStart; i < batchEnd; i++) {
      const spell = this.#lazySelectedResults[i];
      this._renderSingleSelectedSpell(spell, spellsContainer);
    }
    this.#lazySelectedRenderIndex = batchEnd - 1;
    this.#lazySelectedRenderThrottle = false;
    log(1, `Rendered ${batchEnd - batchStart} selected spells, index now at ${this.#lazySelectedRenderIndex}`);
  }

  /**
   * Render a single selected spell with level header if needed
   * @param {Object} spell - Spell with level metadata
   * @param {HTMLElement} container - Spells container
   */
  _renderSingleSelectedSpell(spell, container) {
    const levelMetadata = spell._levelMetadata;
    const levelId = levelMetadata.level;
    let levelContainer = container.querySelector(`.spell-level[data-level="${levelId}"]`);
    if (!levelContainer) levelContainer = this._createSelectedLevelHeader(levelMetadata, container);
    if (!levelContainer) {
      log(2, `Failed to get or create level container for spell ${spell.name}`);
      return;
    }
    const spellHtml = this._createSelectedSpellItemHtml(spell);
    const spellList = levelContainer.querySelector('.spell-list');
    if (spellList) spellList.insertAdjacentHTML('beforeend', spellHtml);
    else log(2, `No spell list found in level container for level ${levelId}`);
  }

  /**
   * Create level header for selected spells dynamically
   * @param {Object} levelMetadata - Level metadata
   * @param {HTMLElement} container - Container to append to
   * @returns {HTMLElement} Created level container
   */
  _createSelectedLevelHeader(levelMetadata, container) {
    const levelHtml = `
      <div class="spell-level" data-level="${levelMetadata.level}">
        <h3 class="spell-level-heading" data-action="toggleSpellLevel" role="button" aria-expanded="true"
            aria-controls="spell-list-${levelMetadata.level}">
          <i class="fas fa-caret-down collapse-indicator" aria-hidden="true"></i>
          ${levelMetadata.levelName}
          <span class="spell-count" aria-label="${game.i18n.localize('SPELLBOOK.UI.SpellCount')}"></span>
        </h3>
        <ul id="spell-list-${levelMetadata.level}" class="spell-list" role="list">
        </ul>
      </div>
    `;
    let insertPosition = null;
    const existingLevels = container.querySelectorAll('.spell-level');
    for (const existingLevel of existingLevels) {
      const existingLevelId = existingLevel.dataset.level;
      if (parseInt(existingLevelId) > parseInt(levelMetadata.level)) {
        insertPosition = existingLevel;
        break;
      }
    }
    if (insertPosition) insertPosition.insertAdjacentHTML('beforebegin', levelHtml);
    else container.insertAdjacentHTML('beforeend', levelHtml);
    const levelContainer = container.querySelector(`.spell-level[data-level="${levelMetadata.level}"]`);
    if (!levelContainer) {
      log(2, `Failed to create level container for level ${levelMetadata.level}`);
      return null;
    }
    this._currentSelectedLevelHeaders.set(levelMetadata.level, levelContainer);
    return levelContainer;
  }

  /**
   * Create HTML for an available spell item
   * @param {Object} spell - Processed spell
   * @returns {string} HTML string
   */
  _createAvailableSpellItemHtml(spell) {
    const enrichedIcon = spell.enrichedIcon || formattingUtils.createSpellIconLink(spell);
    const name = spell.name || 'Unknown Spell';
    const formattedDetails = spell.formattedDetails || formattingUtils.formatSpellDetails(spell);
    const selectionClass = this.selectionMode && this.selectedSpellsToAdd.has(spell.uuid) ? ' selected' : '';
    const selectionModeClass = this.selectionMode ? ' selectable' : '';
    const dataAttributes = `data-uuid="${spell.uuid}" data-spell-level="${spell.level}" data-spell-school="${spell.school}" data-selection-type="add"`;
    let actionHtml = '';
    if (this.selectionMode) {
      actionHtml = spell.selectAddCheckboxHtml || '';
    } else {
      actionHtml = `<button type="button" class="add-spell" data-action="addSpell" data-uuid="${spell.uuid}"
        aria-label="${game.i18n.format('SPELLMANAGER.Buttons.AddSpell', { name: spell.name })}">
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>`;
    }
    return `
      <li class="spell-item available${selectionModeClass}${selectionClass}" ${dataAttributes} role="listitem">
        <div class="spell-name">
          ${enrichedIcon}
          <div class="name-stacked">
            <span class="title">${name}</span>
            <span class="subtitle">${formattedDetails}</span>
          </div>
        </div>
        <div class="spell-meta">
          ${actionHtml}
        </div>
      </li>
    `;
  }

  /**
   * Create HTML for a selected spell item
   * @param {Object} spell - Processed spell
   * @returns {string} HTML string
   */
  _createSelectedSpellItemHtml(spell) {
    const enrichedIcon = spell.enrichedIcon || formattingUtils.createSpellIconLink(spell);
    const name = spell.name || 'Unknown Spell';
    const formattedDetails = spell.formattedDetails || formattingUtils.formatSpellDetails(spell);
    const spellUuid = spell.uuid || spell.compendiumUuid;
    const selectionClass = this.selectionMode && this.selectedSpellsToRemove.has(spellUuid) ? ' selected' : '';
    const selectionModeClass = this.selectionMode ? ' selectable' : '';
    const dataAttributes = `data-uuid="${spellUuid}" data-selection-type="remove"`;
    let actionHtml = '';
    if (this.isEditing) {
      if (this.selectionMode) {
        actionHtml = spell.selectRemoveCheckboxHtml || '';
      } else {
        actionHtml = `<button type="button" class="remove-spell" data-action="removeSpell"
          data-uuid="${spellUuid}"
          aria-label="${game.i18n.format('SPELLMANAGER.Buttons.RemoveSpell', { name: spell.name })}">
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>`;
      }
    }
    return `
      <li class="spell-item${selectionModeClass}${selectionClass}" ${dataAttributes} role="listitem">
        <div class="spell-name">
          ${enrichedIcon}
          <div class="name-stacked">
            <span class="title">${name}</span>
            <span class="subtitle">${formattedDetails}</span>
          </div>
        </div>
        ${actionHtml ? `<div class="spell-preparation">${actionHtml}</div>` : ''}
      </li>
    `;
  }

  /**
   * Set up scroll listeners for both panels
   */
  _setupScrollListeners() {
    if (this._lastScrollElementAvailable) this._lastScrollElementAvailable.removeEventListener('scroll', this._onScrollAvailable);
    const availableWrapper = this.element.querySelector('.available-spells-wrapper');
    if (availableWrapper) {
      this._onScrollAvailable = this._onScrollAvailableSpells.bind(this);
      availableWrapper.addEventListener('scroll', this._onScrollAvailable, { passive: true });
      this._lastScrollElementAvailable = availableWrapper;
      log(1, `Set up scroll listener for available spells`);
    }
    if (this._lastScrollElementSelected) this._lastScrollElementSelected.removeEventListener('scroll', this._onScrollSelected);
    const selectedSpellsContainer = this.element.querySelector('.selected-list-spells');
    if (selectedSpellsContainer) {
      this._onScrollSelected = this._onScrollSelectedSpells.bind(this);
      selectedSpellsContainer.addEventListener('scroll', this._onScrollSelected, { passive: true });
      this._lastScrollElementSelected = selectedSpellsContainer;
      log(1, `Set up scroll listener for selected spells`);
    }
  }

  /**
   * Handle scroll events for available spells (right panel)
   * @param {Event} event - Scroll event
   */
  _onScrollAvailableSpells(event) {
    if (this.#lazyAvailableRenderThrottle || !this.#lazyAvailableResults) return;
    const container = event.target;
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollTop + clientHeight >= scrollHeight - this.constructor.BATCHING.MARGIN) {
      log(1, `Available spells scroll threshold reached, rendering next batch`);
      this._renderAvailableSpellsBatch();
    }
  }

  /**
   * Handle scroll events for selected spells (center panel)
   * @param {Event} event - Scroll event
   */
  _onScrollSelectedSpells(event) {
    if (this.#lazySelectedRenderThrottle || !this.#lazySelectedResults) return;
    const container = event.target;
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollTop + clientHeight >= scrollHeight - this.constructor.BATCHING.MARGIN) {
      log(1, `Selected spells scroll threshold reached, rendering next batch`);
      this._renderSelectedSpellsBatch();
    }
  }

  // ========================================
  // Data Loading and Management
  // ========================================

  /**
   * Phase 1: Load spell lists quickly for sidebar (constructor)
   * @returns {Promise<void>}
   */
  async loadSpellLists() {
    try {
      log(1, 'GMSpellListManager: loadSpellLists() - loading sidebar data only');

      log(1, 'GMSpellListManager: Getting valid custom list mappings...');
      await managerHelpers.getValidCustomListMappings();
      log(1, 'GMSpellListManager: Custom list mappings loaded successfully');

      log(1, 'GMSpellListManager: Finding compendium spell lists...');
      this.availableSpellLists = await managerHelpers.findCompendiumSpellLists(true);
      log(1, `GMSpellListManager: Found ${this.availableSpellLists?.length || 0} spell lists`);

      if (!this.availableSpellLists || this.availableSpellLists.length === 0) {
        log(1, 'GMSpellListManager: WARNING - No spell lists found! This is the main issue.');
        log(1, 'GMSpellListManager: managerHelpers.findCompendiumSpellLists returned:', this.availableSpellLists);
      } else {
        log(
          1,
          'GMSpellListManager: Spell lists found, sample:',
          this.availableSpellLists.slice(0, 3).map((list) => ({ name: list.name, uuid: list.uuid }))
        );
      }

      log(1, 'GMSpellListManager: Sorting spell lists...');
      this.availableSpellLists.sort((a, b) => a.name.localeCompare(b.name));

      // Keep available spells empty for now - Phase 2 will load them
      this.availableSpells = [];
      log(1, 'GMSpellListManager: Available spells kept empty for lazy loading');
    } catch (error) {
      log(1, 'GMSpellListManager: ERROR in loadSpellLists():', error);
      log(1, 'GMSpellListManager: Error stack:', error.stack);
    } finally {
      log(1, 'GMSpellListManager: loadSpellLists() completed, calling render...');
      this.render(false);
      log(1, 'GMSpellListManager: render() call completed');
    }
  }

  /**
   * Phase 2: Load available spells for editing mode (when edit button clicked)
   * @returns {Promise<void>}
   */
  async loadAvailableSpells() {
    if (this.availableSpells.length > 0) {
      log(1, 'GMSpellListManager: Available spells already loaded, skipping');
      return;
    }

    try {
      log(1, 'GMSpellListManager: loadAvailableSpells() - loading editing mode data');

      log(1, 'GMSpellListManager: Fetching all compendium spells...');
      this.availableSpells = await managerHelpers.fetchAllCompendiumSpells();
      log(1, `GMSpellListManager: Found ${this.availableSpells?.length || 0} available spells`);

      if (!this.availableSpells || this.availableSpells.length === 0) {
        log(1, 'GMSpellListManager: WARNING - No available spells found!');
      }

      log(1, 'GMSpellListManager: Enriching available spells...');
      await this.enrichAvailableSpells();
      log(1, 'GMSpellListManager: Available spells enriched');
    } catch (error) {
      log(1, 'GMSpellListManager: ERROR in loadAvailableSpells():', error);
      log(1, 'GMSpellListManager: Error stack:', error.stack);
    }
  }

  /**
   * Phase 3: Load specific spell list data (when list selected)
   * @param {Array} spellUuids - Array of spell UUIDs to load
   * @returns {Promise<void>}
   */
  async loadSelectedListSpells(spellUuids) {
    if (!this.selectedSpellList || !spellUuids?.length) {
      log(1, 'GMSpellListManager: No selected list or UUIDs, skipping spell loading');
      return;
    }

    try {
      log(1, `GMSpellListManager: loadSelectedListSpells() - Loading ${spellUuids.length} spells for selected list`);

      this.selectedSpellList.isLoadingSpells = true;
      this.render(false, { parts: ['listContent'] }); // Show loading in center panel

      const spellDocs = await this._fetchSpellDocuments(new Set(spellUuids), 9);
      const spellLevels = this._organizeSpellsByLevel(spellDocs, null);

      // Enrich only the spells in this list
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
        }
      }

      this.selectedSpellList.spells = spellDocs;
      this.selectedSpellList.spellsByLevel = spellLevels;
      this.selectedSpellList.isLoadingSpells = false;

      log(1, `GMSpellListManager: Loaded ${spellDocs.length} spells for selected spell list`);
    } catch (error) {
      log(1, 'GMSpellListManager: ERROR loading selected list spells:', error);
      this.selectedSpellList.isLoadingSpells = false;
    } finally {
      this.render(false, { parts: ['listContent'] }); // Update center panel
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
      spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
    }
  }

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
      const spellDocs = await this._fetchSpellDocuments(new Set(spellUuids), 9);
      const spellLevels = this._organizeSpellsByLevel(spellDocs, null);
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

  /**
   * Fetch spell documents from UUIDs (simplified version)
   * @param {Set<string>} spellUuids - Set of spell UUIDs
   * @param {number} maxSpellLevel - Maximum spell level to include
   * @returns {Promise<Array>} - Array of spell documents
   */
  async _fetchSpellDocuments(spellUuids, maxSpellLevel) {
    const spellItems = [];
    const errors = [];
    log(3, `Fetching spell documents: ${spellUuids.size} spells, max level ${maxSpellLevel}`);
    for (const uuid of spellUuids) {
      try {
        const spell = await fromUuid(uuid);
        if (!spell) {
          errors.push({ uuid, reason: 'Document not found' });
          continue;
        }
        if (spell.type !== 'spell') {
          errors.push({ uuid, reason: 'Not a valid spell document' });
          continue;
        }
        const sourceUuid = spell.parent && spell.flags?.core?.sourceId ? spell.flags.core.sourceId : uuid;
        if (spell.system.level <= maxSpellLevel) spellItems.push({ ...spell, compendiumUuid: sourceUuid });
      } catch (error) {
        errors.push({ uuid, reason: error.message || 'Unknown error' });
      }
    }
    if (errors.length > 0) log(2, `Failed to fetch ${errors.length} spells out of ${spellUuids.size}`, { errors });
    log(3, `Successfully fetched ${spellItems.length}/${spellUuids.size} spells`);
    return spellItems;
  }

  /**
   * Organize spells by level (simplified version)
   * @param {Array} spellItems - Array of spell documents
   * @param {*} actor - Actor (unused here)
   * @returns {Array} - Array of level objects with spells
   */
  _organizeSpellsByLevel(spellItems, actor) {
    const spellsByLevel = {};
    for (const spell of spellItems) {
      if (spell?.system?.level === undefined) continue;
      const level = spell.system.level;
      if (!spellsByLevel[level]) spellsByLevel[level] = [];
      const spellData = {
        ...spell,
        formattedDetails: formattingUtils.formatSpellDetails(spell),
        enrichedIcon: formattingUtils.createSpellIconLink(spell)
      };
      spellsByLevel[level].push(spellData);
    }
    for (const level in spellsByLevel) {
      if (spellsByLevel.hasOwnProperty(level)) spellsByLevel[level].sort((a, b) => a.name.localeCompare(b.name));
    }
    const levelArray = [];
    const sortedLevels = Object.keys(spellsByLevel).sort((a, b) => Number(a) - Number(b));
    for (const level of sortedLevels) {
      const levelName = CONFIG.DND5E.spellLevels[level];
      levelArray.push({
        level: level,
        levelName: levelName,
        spells: spellsByLevel[level]
      });
    }
    return levelArray;
  }

  /**
   * Select a spell list by UUID
   * @param {string} uuid - The UUID of the spell list to select
   * @returns {Promise<void>}
   */
  async selectSpellList(uuid) {
    this._clearSelections();
    log(1, `GMSpellListManager: Selecting spell list: ${uuid}`);

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

    // Phase 3: Load only this list's spells
    await this.loadSelectedListSpells(spellUuids);
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

  // ========================================
  // Filtering and UI Helpers
  // ========================================

  /**
   * Store filtered available spells in lazy state instead of returning
   * @private
   */
  _filterAvailableSpells() {
    try {
      log(1, `Filtering available spells and storing in lazy state`);
      this._resetLazyState('available');
      this.#lazyAvailableResults = this._prepareLazyAvailableSpellData();
      return { spells: [], totalFiltered: this.#lazyAvailableResults.length };
    } catch (error) {
      log(1, 'Error filtering available spells:', error);
      return { spells: [], totalFiltered: 0 };
    }
  }

  /**
   * Check if a spell is in the currently selected list
   * @param {Object} spell - The spell to check
   * @param {Set} selectedSpellUUIDs - Set of UUIDs in the selected list
   * @returns {boolean} Whether the spell is in the selected list
   */
  isSpellInSelectedList(spell, selectedSpellUUIDs) {
    if (!selectedSpellUUIDs.size) return false;
    if (selectedSpellUUIDs.has(spell.uuid)) return true;
    const spellIdPart = spell.uuid.split('.').pop();
    if (spellIdPart && selectedSpellUUIDs.has(spellIdPart)) return true;
    const parsedUuid = foundry.utils.parseUuid(spell.uuid);
    if (parsedUuid.collection) {
      const normalizedId = `Compendium.${parsedUuid.collection.collection}.${parsedUuid.id}`;
      if (selectedSpellUUIDs.has(normalizedId)) return true;
    }
    return false;
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
          const parsedUuid = foundry.utils.parseUuid(spell.compendiumUuid);
          if (parsedUuid.collection) {
            const normalizedId = `Compendium.${parsedUuid.collection.collection}.${parsedUuid.id}`;
            selectedSpellUUIDs.add(normalizedId);
          }
          selectedSpellUUIDs.add(spell.compendiumUuid);
          const idPart = spell.compendiumUuid.split('.').pop();
          if (idPart) selectedSpellUUIDs.add(idPart);
        }
      }
      return selectedSpellUUIDs;
    } catch (error) {
      log(1, 'Error getting normalized selected spell UUIDs:', error);
      return new Set();
    }
  }

  /**
   * Apply filters with lazy loading support
   */
  applyFilters() {
    if (this.isUpdatingCheckboxes) return;
    log(1, `Applying filters with lazy loading`);
    this._resetLazyState('available');
    this._initializeLazyLoadingAvailable();
    const countDisplay = this.element.querySelector('.filter-count');
    if (countDisplay && this.#lazyAvailableResults) countDisplay.textContent = `${this.#lazyAvailableResults.length} spells`;
    setTimeout(() => {
      this._setupScrollListeners();
    }, 50);
  }

  /**
   * Apply saved collapsed level states from user flags
   */
  applyCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS) || [];
    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) levelContainer.classList.add('collapsed');
    }
  }

  /**
   * Apply saved collapsed folder states from user flags
   */
  applyCollapsedFolders() {
    const collapsedFolders = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_FOLDERS) || [];
    for (const folderId of collapsedFolders) {
      const folderContainer = this.element.querySelector(`.list-folder[data-folder-id="${folderId}"]`);
      if (folderContainer) folderContainer.classList.add('collapsed');
    }
  }

  // ========================================
  // Multi-Select Management
  // ========================================

  /**
   * Clear all selections and exit selection mode
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
   * Update selection count display in footer
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
   * Update spell checkboxes to match current selection
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
   * Update select all checkbox states (including indeterminate)
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
   * Get visible filtered spells for selection operations
   * @returns {Array} Array of visible spell objects
   * @private
   */
  _getVisibleSpells() {
    return this.#lazyAvailableResults || [];
  }

  // ========================================
  // Filter Setup and Management
  // ========================================

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
      { selector: 'select[name="spell-concentration"]', property: 'concentration' },
      { selector: 'select[name="spell-materialComponents"]', property: 'materialComponents' }
    ];
    for (const { selector, property } of dropdownSelectors) {
      const element = this.element.querySelector(selector);
      if (element) {
        element.addEventListener('change', (event) => {
          if (this.filterState[property] !== event.target.value) {
            this.filterState[property] = event.target.value;
            this.applyFilters();
          }
        });
      }
    }
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
            }, 200);
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
   * Reset all filters to default state
   * @private
   */
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
      materialComponents: '',
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
    this.applyFilters();
  }

  // ========================================
  // Form Element Preparation
  // ========================================

  /**
   * Prepare form elements for the spell filters
   * @returns {Object} Object containing all filter form element HTML
   * @private
   */
  _prepareFilterFormElements() {
    const searchInput = formElements.createTextInput({
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
    const levelSelect = formElements.createSelect({
      name: 'spell-level',
      options: levelOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.Level')
    });
    levelSelect.id = 'spell-level';
    const schoolOptions = [{ value: '', label: game.i18n.localize('SPELLMANAGER.Filters.AllSchools'), selected: !this.filterState.school }];
    Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, school]) => {
      schoolOptions.push({ value: key, label: school.label, selected: this.filterState.school === key });
    });
    const schoolSelect = formElements.createSelect({
      name: 'spell-school',
      options: schoolOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.School')
    });
    schoolSelect.id = 'spell-school';
    const castingTimeOptions = managerHelpers.prepareCastingTimeOptions(this.availableSpells, this.filterState);
    const castingTimeSelect = formElements.createSelect({
      name: 'spell-castingTime',
      options: castingTimeOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.CastingTime')
    });
    castingTimeSelect.id = 'spell-castingTime';
    const damageTypeOptions = managerHelpers.prepareDamageTypeOptions(this.filterState);
    const damageTypeSelect = formElements.createSelect({
      name: 'spell-damageType',
      options: damageTypeOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.DamageType')
    });
    damageTypeSelect.id = 'spell-damageType';
    const conditionOptions = managerHelpers.prepareConditionOptions(this.filterState);
    const conditionSelect = formElements.createSelect({
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
    const requiresSaveSelect = formElements.createSelect({
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
    const concentrationSelect = formElements.createSelect({
      name: 'spell-concentration',
      options: concentrationOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RequiresConcentration')
    });
    concentrationSelect.id = 'spell-concentration';
    const materialComponentsOptions = [
      { value: '', label: game.i18n.localize('SPELLBOOK.Filters.All'), selected: !this.filterState.materialComponents },
      { value: 'consumed', label: game.i18n.localize('SPELLBOOK.Filters.MaterialComponents.Consumed'), selected: this.filterState.materialComponents === 'consumed' },
      { value: 'notConsumed', label: game.i18n.localize('SPELLBOOK.Filters.MaterialComponents.NotConsumed'), selected: this.filterState.materialComponents === 'notConsumed' }
    ];
    const materialComponentsSelect = formElements.createSelect({
      name: 'spell-materialComponents',
      options: materialComponentsOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.MaterialComponents')
    });
    materialComponentsSelect.id = 'spell-materialComponents';
    const ritualCheckbox = formElements.createCheckbox({
      name: 'spell-ritual',
      checked: this.filterState.ritual || false,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RitualOnly')
    });
    ritualCheckbox.id = 'spell-ritual';
    const minRangeInput = formElements.createNumberInput({
      name: 'spell-min-range',
      value: this.filterState.minRange || '',
      placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMin'),
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMinLabel')
    });
    minRangeInput.id = 'spell-min-range';
    const maxRangeInput = formElements.createNumberInput({
      name: 'spell-max-range',
      value: this.filterState.maxRange || '',
      placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMax'),
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMaxLabel')
    });
    maxRangeInput.id = 'spell-max-range';
    const spellSources = managerHelpers.prepareSpellSources(this.availableSpells);
    const currentSourceValue = this.filterState.source || 'all';
    const sourceOptions = spellSources.map((source) => ({
      value: source.id,
      label: source.label,
      selected: currentSourceValue === source.id
    }));
    const sourceSelect = formElements.createSelect({
      name: 'spell-source',
      options: sourceOptions,
      disabled: !this.isEditing,
      ariaLabel: game.i18n.localize('SPELLMANAGER.Filters.Source')
    });
    sourceSelect.id = 'spell-source';
    return {
      searchInputHtml: formElements.elementToHtml(searchInput),
      levelSelectHtml: formElements.elementToHtml(levelSelect),
      schoolSelectHtml: formElements.elementToHtml(schoolSelect),
      castingTimeSelectHtml: formElements.elementToHtml(castingTimeSelect),
      damageTypeSelectHtml: formElements.elementToHtml(damageTypeSelect),
      conditionSelectHtml: formElements.elementToHtml(conditionSelect),
      requiresSaveSelectHtml: formElements.elementToHtml(requiresSaveSelect),
      concentrationSelectHtml: formElements.elementToHtml(concentrationSelect),
      materialComponentsSelectHtml: formElements.elementToHtml(materialComponentsSelect),
      ritualCheckboxHtml: formElements.elementToHtml(ritualCheckbox),
      minRangeInputHtml: formElements.elementToHtml(minRangeInput),
      maxRangeInputHtml: formElements.elementToHtml(maxRangeInput),
      sourceSelectHtml: formElements.elementToHtml(sourceSelect)
    };
  }

  /**
   * Prepare form data for the create spell list dialog
   * @param {Array} identifierOptions - Available class identifier options
   * @returns {Object} Object containing form element HTML
   * @private
   */
  _prepareCreateListFormData(identifierOptions) {
    const nameInput = formElements.createTextInput({
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
    const classSelect = formElements.createSelect({
      name: 'identifier',
      options: classOptions,
      ariaLabel: game.i18n.localize('SPELLMANAGER.CreateList.ClassLabel')
    });
    classSelect.id = 'class-identifier';
    const customInput = formElements.createTextInput({
      name: 'customIdentifier',
      pattern: '[a-z0-9_-]+',
      title: game.i18n.localize('SPELLMANAGER.CreateList.IdentifierNotes'),
      ariaLabel: game.i18n.localize('SPELLMANAGER.CreateList.CustomIdentifierLabel')
    });
    customInput.id = 'custom-identifier';
    return {
      nameInputHtml: formElements.elementToHtml(nameInput),
      classSelectHtml: formElements.elementToHtml(classSelect),
      customInputHtml: formElements.elementToHtml(customInput)
    };
  }

  /**
   * Prepare form data for the merge spell lists dialog
   * @returns {Object} Object containing form element HTML
   * @private
   */
  _prepareMergeListFormData() {
    const sourceListOptions = this._buildSpellListOptions('SPELLMANAGER.MergeLists.SelectSourceList');
    const sourceListSelect = formElements.createSelect({
      name: 'sourceList',
      options: sourceListOptions,
      required: true,
      ariaLabel: game.i18n.localize('SPELLMANAGER.MergeLists.SourceListLabel')
    });
    sourceListSelect.id = 'source-list';
    const copyFromListOptions = this._buildSpellListOptions('SPELLMANAGER.MergeLists.SelectCopyFromList');
    const copyFromListSelect = formElements.createSelect({
      name: 'copyFromList',
      options: copyFromListOptions,
      required: true,
      ariaLabel: game.i18n.localize('SPELLMANAGER.MergeLists.CopyFromListLabel')
    });
    copyFromListSelect.id = 'copy-from-list';
    const mergedListNameInput = formElements.createTextInput({
      name: 'mergedListName',
      placeholder: game.i18n.localize('SPELLMANAGER.MergeLists.MergedListNamePlaceholder'),
      ariaLabel: game.i18n.localize('SPELLMANAGER.MergeLists.MergedListNameLabel')
    });
    mergedListNameInput.id = 'merged-list-name';
    const hideSourceListsCheckbox = formElements.createCheckbox({
      name: 'hideSourceLists',
      checked: false,
      ariaLabel: game.i18n.localize('SPELLMANAGER.MergeLists.HideSourceListsLabel')
    });
    hideSourceListsCheckbox.id = 'hide-source-lists';
    return {
      sourceListSelectHtml: formElements.elementToHtml(sourceListSelect),
      copyFromListSelectHtml: formElements.elementToHtml(copyFromListSelect),
      mergedListNameInputHtml: formElements.elementToHtml(mergedListNameInput),
      hideSourceListsCheckboxHtml: formElements.elementToHtml(hideSourceListsCheckbox)
    };
  }

  // ========================================
  // Dialog Helpers
  // ========================================

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
   * Show the create list dialog and return result
   * @param {Array} identifierOptions - Class identifier options
   * @returns {Promise<Object>} Dialog result and form data
   * @private
   */
  async _showCreateListDialog(identifierOptions) {
    let formData = null;
    const formElements = this._prepareCreateListFormData(identifierOptions);
    const content = await renderTemplate(TEMPLATES.DIALOGS.CREATE_SPELL_LIST, {
      identifierOptions,
      formElements
    });
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
      rejectClose: false,
      render: (event, target, form) => {
        this._setupCreateListDialogListeners(target);
      }
    });

    return { result, formData };
  }

  /**
   * Show the merge lists dialog and return result
   * @returns {Promise<Object>} Dialog result and form data
   * @private
   */
  async _showMergeListsDialog() {
    let formData = null;
    const formElements = this._prepareMergeListFormData();
    const context = {
      actorOwnedLists: this.availableSpellLists.filter((list) => list.isActorOwned),
      customLists: this.availableSpellLists.filter((list) => !list.isActorOwned && !list.isMerged && (list.isCustom || list.document?.flags?.[MODULE.ID]?.isNewList)),
      mergedLists: this.availableSpellLists.filter((list) => !list.isActorOwned && list.isMerged),
      standardLists: this.availableSpellLists.filter((list) => !list.isActorOwned && !list.isCustom && !list.isMerged && !list.document?.flags?.[MODULE.ID]?.isNewList),
      hasActorOwnedLists: false,
      hasCustomLists: false,
      hasMergedLists: false,
      hasStandardLists: false,
      formElements
    };
    context.hasActorOwnedLists = context.actorOwnedLists.length > 0;
    context.hasCustomLists = context.customLists.length > 0;
    context.hasMergedLists = context.mergedLists.length > 0;
    context.hasStandardLists = context.standardLists.length > 0;
    const content = await renderTemplate(TEMPLATES.DIALOGS.MERGE_SPELL_LISTS, context);
    const result = await DialogV2.wait({
      window: { title: game.i18n.localize('SPELLMANAGER.MergeLists.DialogTitle'), icon: 'fas fa-code-merge' },
      content: content,
      buttons: [
        {
          label: game.i18n.localize('SPELLMANAGER.Buttons.MergeLists'),
          icon: 'fas fa-code-merge',
          action: 'merge',
          callback: (event, target, form) => {
            const sourceListSelect = form.querySelector('[name="sourceList"]');
            const copyFromListSelect = form.querySelector('[name="copyFromList"]');
            const mergedListNameInput = form.querySelector('[name="mergedListName"]');
            const hideSourceListsCheckbox = form.querySelector('[name="hideSourceLists"]');
            if (!sourceListSelect.value || !copyFromListSelect.value) return false;
            if (sourceListSelect.value === copyFromListSelect.value) {
              const errorElement = form.querySelector('.validation-error');
              if (errorElement) errorElement.style.display = 'block';
              return false;
            }
            let mergedListName = mergedListNameInput.value.trim();
            if (!mergedListName) {
              const sourceList = this.availableSpellLists.find((list) => list.uuid === sourceListSelect.value);
              mergedListName = game.i18n.format('SPELLMANAGER.MergeLists.DefaultMergedName', {
                sourceName: sourceList ? sourceList.name : 'Unknown'
              });
            }
            formData = {
              sourceListUuid: sourceListSelect.value,
              copyFromListUuid: copyFromListSelect.value,
              mergedListName: mergedListName,
              hideSourceLists: hideSourceListsCheckbox ? hideSourceListsCheckbox.checked : false
            };
            return 'merge';
          }
        },
        {
          label: game.i18n.localize('SPELLMANAGER.Confirm.Cancel'),
          icon: 'fas fa-times',
          action: 'cancel'
        }
      ],
      default: 'cancel',
      rejectClose: false,
      render: (event, target, form) => {
        this._setupMergeListsDialogListeners(target);
      }
    });
    return { result, formData };
  }

  // ========================================
  // Utility Methods
  // ========================================

  /**
   * Build spell list options for dropdowns
   * @param {string} defaultLabel - Localization key for default option
   * @returns {Array} Array of option objects
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
   * Set up listeners for the merge lists dialog
   * @param {HTMLElement} target - The dialog DOM element
   * @private
   */
  _setupMergeListsDialogListeners(target) {
    const sourceListSelect = target.querySelector('#source-list');
    const copyFromListSelect = target.querySelector('#copy-from-list');
    const mergeButton = target.querySelector('button[data-action="merge"]');
    const errorElement = target.querySelector('.validation-error');
    const validateSelections = () => {
      const sourceValue = sourceListSelect.value;
      const copyFromValue = copyFromListSelect.value;
      const hasBothSelections = sourceValue && copyFromValue;
      const sameListSelected = sourceValue === copyFromValue;
      if (errorElement) errorElement.style.display = sameListSelected && hasBothSelections ? 'block' : 'none';
      mergeButton.disabled = !hasBothSelections || sameListSelected;
    };
    if (sourceListSelect && copyFromListSelect) {
      sourceListSelect.addEventListener('change', validateSelections);
      copyFromListSelect.addEventListener('change', validateSelections);
      validateSelections();
    }
  }

  /**
   * Duplicate the selected spell list for editing
   * @returns {Promise<void>}
   * @private
   */
  async _duplicateForEditing() {
    this._clearSelections();
    let originalSource = '';
    if (this.selectedSpellList.document.pack) {
      originalSource = this.selectedSpellList.document.pack.split('.')[0];
    }
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
   * Ensure all spells in the list have icons
   * @private
   */
  _ensureSpellIcons() {
    for (const level of this.selectedSpellList.spellsByLevel) {
      for (const spell of level.spells) {
        if (!spell.enrichedIcon) spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
      }
    }
  }

  /**
   * Find a class item in a specific top-level folder
   * @private
   * @param {string} identifier - The class identifier to search for
   * @param {string} topLevelFolderName - The top-level folder name to search in
   * @returns {Promise<Item|null>} The found class item or null
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
        const entry = index.find((e) => e.type === 'class' && e.system?.identifier?.toLowerCase() === identifier.toLowerCase());
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
   * Create a new spell list
   * @param {string} name - Name for the new list
   * @param {string} identifier - Class identifier for the new list
   * @returns {Promise<void>}
   * @private
   */
  async _createNewListCallback(name, identifier) {
    const source = game.i18n.localize('SPELLMANAGER.CreateList.Custom');
    const newList = await managerHelpers.createNewSpellList(name, identifier, source);
    if (newList) {
      log(1, 'GMSpellListManager: New list created, refreshing spell lists');
      await this.loadSpellLists(); // Only reload spell lists, not all spells
      await this.selectSpellList(newList.uuid);
    }
  }

  /**
   * Create merged spell list
   * @param {string} sourceListUuid - UUID of the source spell list
   * @param {string} copyFromListUuid - UUID of the list to copy from
   * @param {string} mergedListName - Name for the merged list
   * @param {boolean} hideSourceLists - Whether to hide source lists after merge
   * @returns {Promise<void>}
   * @private
   */
  async _mergeListsCallback(sourceListUuid, copyFromListUuid, mergedListName, hideSourceLists = false) {
    try {
      const mergedList = await managerHelpers.createMergedSpellList(sourceListUuid, copyFromListUuid, mergedListName);
      if (mergedList) {
        ui.notifications.info(game.i18n.format('SPELLMANAGER.MergeLists.SuccessMessage', { name: mergedListName }));

        if (hideSourceLists) {
          const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
          const sourceList = this.availableSpellLists.find((l) => l.uuid === sourceListUuid);
          const copyFromList = this.availableSpellLists.find((l) => l.uuid === copyFromListUuid);
          const listsToHide = [];

          if (sourceList && !sourceList.isActorOwned && !hiddenLists.includes(sourceListUuid)) {
            listsToHide.push(sourceListUuid);
          }
          if (copyFromList && !copyFromList.isActorOwned && !hiddenLists.includes(copyFromListUuid)) {
            listsToHide.push(copyFromListUuid);
          }

          if (listsToHide.length > 0) {
            await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, [...hiddenLists, ...listsToHide]);
            ui.notifications.info(game.i18n.format('SPELLMANAGER.MergeLists.SourceListsHidden', { count: listsToHide.length }));
          }
        }

        log(1, 'GMSpellListManager: Merged list created, refreshing spell lists');
        await this.loadSpellLists(); // Only reload spell lists, not all spells
        await this.selectSpellList(mergedList.uuid);
      }
    } catch (error) {
      log(1, 'Error creating merged spell list:', error);
      ui.notifications.error(game.i18n.localize('SPELLMANAGER.MergeLists.ErrorMessage'));
    }
  }

  // ========================================
  // Event Handlers (Existing Functionality)
  // ========================================

  /**
   * Handle selecting a spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleSelectSpellList(event, _form) {
    log(1, 'GMSpellListManager: handleSelectSpellList called');
    const element = event.target.closest('[data-uuid]');
    if (!element) {
      log(1, 'GMSpellListManager: No element with data-uuid found');
      return;
    }
    log(1, `GMSpellListManager: Selecting spell list with UUID: ${element.dataset.uuid}`);
    await this.selectSpellList(element.dataset.uuid);
    log(1, 'GMSpellListManager: selectSpellList completed');
  }

  /**
   * Handle editing a spell list
   * @static
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleEditSpellList(_event, _form) {
    if (!this.selectedSpellList) return;
    log(1, 'GMSpellListManager: Entering edit mode - loading available spells');
    await this.loadAvailableSpells();
    this.pendingChanges = { added: new Set(), removed: new Set() };
    const flags = this.selectedSpellList.document.flags?.[MODULE.ID] || {};
    const isCustom = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;
    const isActorSpellbook = !!flags.isActorSpellbook;
    if (!isCustom && !isActorSpellbook) await this._duplicateForEditing();
    this.isEditing = true;
    this.render(false);
    setTimeout(() => {
      this._initializeLazyLoadingAvailable();
      if (this.selectedSpellList) this._initializeLazyLoadingSelected();
      this.setupFilterListeners();
      this._setupScrollListeners();
    }, 100);
  }

  /**
   * Handle removing a spell from the list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleRemoveSpell(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;
    let spellUuid = element.dataset.uuid;
    if (!this.selectedSpellList || !this.isEditing) return;
    log(1, `Removing spell: ${spellUuid} in pending changes`);
    this.pendingChanges.removed.add(spellUuid);
    this.pendingChanges.added.delete(spellUuid);
    const normalizedForms = managerHelpers.normalizeUuid(spellUuid);
    this.selectedSpellList.spellUuids = this.selectedSpellList.spellUuids.filter((uuid) => !normalizedForms.includes(uuid));
    this.selectedSpellList.spells = this.selectedSpellList.spells.filter((spell) => {
      const spellUuids = [spell.uuid, spell.compendiumUuid, ...(spell._id ? [spell._id] : [])];
      return !spellUuids.some((id) => normalizedForms.includes(id));
    });
    this.selectedSpellList.spellsByLevel = this._organizeSpellsByLevel(this.selectedSpellList.spells, null);
    this._ensureSpellIcons();
    this.render(false);
    setTimeout(() => {
      this._initializeLazyLoadingSelected();
      this._setupScrollListeners();
    }, 50);
  }

  /**
   * Handle adding a spell to the list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
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
    if (!spellCopy.enrichedIcon) spellCopy.enrichedIcon = formattingUtils.createSpellIconLink(spellCopy);
    this.selectedSpellList.spellUuids.push(spellUuid);
    this.selectedSpellList.spells.push(spellCopy);
    this.selectedSpellList.spellsByLevel = this._organizeSpellsByLevel(this.selectedSpellList.spells, null);
    this._ensureSpellIcons();
    this.render(false);
    setTimeout(() => {
      this._initializeLazyLoadingSelected();
      this._setupScrollListeners();
    }, 50);
  }

  /**
   * Handle saving the custom spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleSaveCustomList(event, _form) {
    if (!this.selectedSpellList || !this.isEditing) return;
    log(1, 'Saving custom spell list with pending changes');
    const document = this.selectedSpellList.document;
    const currentSpells = new Set(document.system.spells || []);
    for (const spellUuid of this.pendingChanges.removed) {
      const normalizedForms = managerHelpers.normalizeUuid(spellUuid);
      for (const existingUuid of currentSpells) {
        if (normalizedForms.includes(existingUuid)) currentSpells.delete(existingUuid);
      }
    }
    log(1, `Processing ${this.pendingChanges.added.size} spell additions`);
    for (const spellUuid of this.pendingChanges.added) currentSpells.add(spellUuid);
    await document.update({ 'system.spells': Array.from(currentSpells) });
    this.pendingChanges = { added: new Set(), removed: new Set() };
    this.isEditing = false;
    await this.selectSpellList(document.uuid);
  }

  /**
   * Handle deleting the custom spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleDeleteCustomList(event, _form) {
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
    await managerHelpers.removeCustomSpellList(uuid);
    this.selectedSpellList = null;
    this.isEditing = false;
    this.render(false);
  }

  /**
   * Handle restoring from the original spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleRestoreOriginal(event, _form) {
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
   * Handle closing the spell manager
   * @static
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleClose(_event, _form) {
    this.close();
  }

  /**
   * Handle showing the documentation dialog
   * @static
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static async handleShowDocumentation(_event, _form) {
    const content = await renderTemplate(TEMPLATES.DIALOGS.MANAGER_DOCUMENTATION, {});
    await DialogV2.wait({
      window: { title: game.i18n.localize('SPELLMANAGER.Documentation.Title') },
      content: content,
      classes: ['gm-spell-list-manager-helper'],
      buttons: [{ icon: 'fas fa-check', label: game.i18n.localize('SPELLMANAGER.Buttons.Close'), action: 'close' }],
      position: { width: 650, height: 800 },
      default: 'close',
      rejectClose: false
    });
  }

  /**
   * Handle toggling the sidebar collapsed state
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleToggleSidebar(event, _form) {
    this.element.classList.toggle('sidebar-collapsed');
  }

  /**
   * Handle toggling a spell level's collapsed state
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
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
  }

  /**
   * Handle toggling a folder's collapsed state
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
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
  }

  /**
   * Handle opening an actor sheet
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static async handleOpenActor(event, _form) {
    const document = this.selectedSpellList.document;
    const actorId = document.flags?.[MODULE.ID]?.actorId;
    if (!actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    await actor.sheet.render(true);
  }

  /**
   * Handle opening a class item sheet
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static async handleOpenClass(event, _form) {
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
   * Handle creating a new spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleCreateNewList(event, _form) {
    const classIdentifiers = await managerHelpers.findClassIdentifiers();
    const identifierOptions = Object.entries(classIdentifiers)
      .sort(([, dataA], [, dataB]) => dataA.name.localeCompare(dataB.name))
      .map(([id, data]) => ({
        id: id,
        name: data.fullDisplay,
        plainName: data.name
      }));
    const { result, formData } = await this._showCreateListDialog(identifierOptions);
    if (result === 'create' && formData) await this._createNewListCallback(formData.name, formData.identifier);
  }

  /**
   * Handle merging spell lists
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleMergeLists(event, _form) {
    if (this.availableSpellLists.length < 2) {
      ui.notifications.warn(game.i18n.localize('SPELLMANAGER.MergeLists.InsufficientLists'));
      return;
    }
    const { result, formData } = await this._showMergeListsDialog();
    if (result === 'merge' && formData) await this._mergeListsCallback(formData.sourceListUuid, formData.copyFromListUuid, formData.mergedListName, formData.hideSourceLists);
  }

  // ========================================
  // Multi-Select Event Handlers
  // ========================================

  /**
   * Handle toggling selection mode
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleToggleSelectionMode(event, _form) {
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
   * Handle selecting all visible spells
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
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
   * Handle bulk save operation
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleBulkSave(event, _form) {
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
            const normalizedForms = managerHelpers.normalizeUuid(spellUuid);
            this.selectedSpellList.spellUuids = this.selectedSpellList.spellUuids.filter((uuid) => !normalizedForms.includes(uuid));
            this.selectedSpellList.spells = this.selectedSpellList.spells.filter((spell) => {
              const spellUuids = [spell.uuid, spell.compendiumUuid, ...(spell._id ? [spell._id] : [])];
              return !spellUuids.some((id) => normalizedForms.includes(id));
            });
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
              if (!spellCopy.enrichedIcon) spellCopy.enrichedIcon = formattingUtils.createSpellIconLink(spellCopy);
              this.selectedSpellList.spellUuids.push(spellUuid);
              this.selectedSpellList.spells.push(spellCopy);
            } else {
              log(2, `Could not find spell with UUID: ${spellUuid}`);
            }
            processed++;
          } catch (error) {
            log(1, `Failed to add spell ${spellUuid}:`, error);
            failed++;
          }
        }
      }
      this.selectedSpellList.spellsByLevel = this._organizeSpellsByLevel(this.selectedSpellList.spells, null);
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
   * Handle canceling selection mode
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   */
  static handleCancelSelection(event, _form) {
    this._clearSelections();
    this.render(false);
  }

  /**
   * Handle toggling spell list visibility
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
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
        ui.notifications.clear();
        ui.notifications.info(game.i18n.format('SPELLMANAGER.HideList.Unhidden', { name: list.name }));
      } else {
        const newHiddenLists = [...hiddenLists, uuid];
        await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, newHiddenLists);
        ui.notifications.clear();
        ui.notifications.info(game.i18n.format('SPELLMANAGER.HideList.Hidden', { name: list.name }));
      }
      this.render(false);
    } catch (error) {
      log(1, 'Error toggling list visibility:', error);
      ui.notifications.clear();
      ui.notifications.error(game.i18n.localize('SPELLMANAGER.HideList.ToggleError'));
    }
  }

  // ========================================
  // Render and Lifecycle Methods
  // ========================================

  /** @inheritdoc */
  _onRender(context, options) {
    log(1, 'GMSpellListManager: _onRender() called');
    log(1, 'GMSpellListManager: Context at render time:', {
      hasAvailableSpellLists: !!context.availableSpellLists,
      availableSpellListsLength: context.availableSpellLists?.length || 0,
      hasStandardLists: context.hasStandardLists,
      hasCustomLists: context.hasCustomLists,
      isEditing: context.isEditing
    });

    super._onRender(context, options);

    log(1, 'GMSpellListManager: Setting up filter listeners...');
    this.setupFilterListeners();

    log(1, 'GMSpellListManager: Setting up multi-select listeners...');
    this.setupMultiSelectListeners();

    log(1, 'GMSpellListManager: Applying collapsed levels...');
    this.applyCollapsedLevels();

    log(1, 'GMSpellListManager: Applying collapsed folders...');
    this.applyCollapsedFolders();

    if (this.isEditing) {
      log(1, 'GMSpellListManager: Initializing lazy loading for editing mode...');
      setTimeout(() => {
        this._initializeLazyLoadingAvailable();
        if (this.selectedSpellList) this._initializeLazyLoadingSelected();
        this.setupFilterListeners();
        this._setupScrollListeners();
        log(1, 'GMSpellListManager: Lazy loading initialization completed');
      }, 100);
    }

    log(1, 'GMSpellListManager: _onRender() completed');
  }

  /** @inheritdoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ['container', 'spellLists', 'listContent', 'availableSpells', 'footer'];
  }

  /**
   * Set up event listeners for multi-select functionality
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
        if (bulkSaveBtn && !bulkSaveBtn.disabled) GMSpellListManager.handleBulkSave.call(this, { target: bulkSaveBtn }, null);
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
   * Handle range selection with shift+click
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
      if (this.selectedSpellList?.spellsByLevel) {
        for (const levelData of this.selectedSpellList.spellsByLevel) {
          if (levelData.spells) spells.push(...levelData.spells);
        }
      }
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
   * Update the last selected index for range selection
   * @param {string} uuid - The clicked spell UUID
   * @param {boolean} isAvailableSpell - Whether this is an available spell or selected spell
   * @private
   */
  _updateLastSelectedIndex(uuid, isAvailableSpell) {
    let spells;
    if (isAvailableSpell) spells = this._getVisibleSpells();
    else {
      spells = [];
      if (this.selectedSpellList?.spellsByLevel) {
        for (const levelData of this.selectedSpellList.spellsByLevel) {
          if (levelData.spells) spells.push(...levelData.spells);
        }
      }
    }
    const lastIndexKey = isAvailableSpell ? 'add' : 'remove';
    const currentIndex = spells.findIndex((spell) => {
      if (isAvailableSpell) return spell.uuid === uuid;
      else return (spell.uuid || spell.compendiumUuid) === uuid;
    });
    if (currentIndex >= 0) this.lastSelectedIndex[lastIndexKey] = currentIndex;
  }

  /**
   * Create a spell selection checkbox with proper data attributes
   * @param {Object} spell - The spell object
   * @param {string} type - 'add' or 'remove'
   * @param {boolean} isChecked - Whether the checkbox should be checked
   * @returns {string} HTML string for the checkbox
   * @private
   */
  _createSpellSelectCheckbox(spell, type, isChecked = false) {
    const checkbox = formElements.createCheckbox({
      checked: isChecked,
      cssClass: 'spell-select-cb',
      ariaLabel:
        type === 'add' ?
          game.i18n.format('SPELLMANAGER.Selection.SelectSpellToAdd', { name: spell.name })
        : game.i18n.format('SPELLMANAGER.Selection.SelectSpellToRemove', { name: spell.name })
    });
    checkbox.dataset.type = type;
    checkbox.dataset.uuid = spell.uuid || spell.compendiumUuid;
    return formElements.elementToHtml(checkbox);
  }

  /**
   * Create a select-all checkbox with proper data attributes
   * @param {string} type - 'add' or 'remove'
   * @returns {string} HTML string for the checkbox
   * @private
   */
  _createSelectAllCheckbox(type) {
    const checkbox = formElements.createCheckbox({
      cssClass: 'select-all-checkbox',
      ariaLabel: type === 'add' ? game.i18n.localize('SPELLMANAGER.Selection.SelectAllToAdd') : game.i18n.localize('SPELLMANAGER.Selection.SelectAllToRemove')
    });
    checkbox.dataset.action = 'selectAll';
    checkbox.dataset.type = type;
    return formElements.elementToHtml(checkbox);
  }
}
