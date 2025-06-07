import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as actorSpellUtils from '../helpers/actor-spells.mjs';
import * as managerHelpers from '../helpers/compendium-management.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import { SpellbookFilterHelper } from '../helpers/ui/spellbook-filters.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM Spell List Manager application for viewing, editing, and creating spell lists
 * Thin application that delegates business logic to helpers
 */
export class GMSpellListManager extends HandlebarsApplicationMixin(ApplicationV2) {
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
      mergeLists: GMSpellListManager.handleMergeLists
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

  /**
   * @returns {string} The application title
   */
  get title() {
    return game.i18n.localize('SPELLMANAGER.Application.Title');
  }

  /**
   * @param {Object} options - Application options
   */
  constructor(options) {
    super(options);
    this.isLoading = true;
    this.availableSpellLists = [];
    this.selectedSpellList = null;
    this.availableSpells = [];
    this.isEditing = false;
    this.pendingChanges = { added: new Set(), removed: new Set() };
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
    this.filterHelper = new SpellbookFilterHelper(this);
  }

  /** @inheritdoc */
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
      const mergedLists = this.availableSpellLists.filter((list) => !list.isActorOwned && list.isMerged);
      const customLists = this.availableSpellLists.filter((list) => !list.isActorOwned && !list.isMerged && (list.isCustom || list.document?.flags?.[MODULE.ID]?.isNewList));
      const standardLists = this.availableSpellLists.filter((list) => !list.isActorOwned && !list.isCustom && !list.isMerged && !list.document?.flags?.[MODULE.ID]?.isNewList);
      actorOwnedLists.sort((a, b) => {
        if (a.actorName && b.actorName) return a.actorName.localeCompare(b.actorName);
        if (a.actorName) return -1;
        if (b.actorName) return 1;
        return a.name.localeCompare(b.name);
      });
      customLists.sort((a, b) => a.name.localeCompare(b.name));
      mergedLists.sort((a, b) => a.name.localeCompare(b.name));
      standardLists.sort((a, b) => a.name.localeCompare(b.name));
      context.actorOwnedLists = actorOwnedLists;
      context.customLists = customLists;
      context.mergedLists = mergedLists;
      context.standardLists = standardLists;
      context.hasActorOwnedLists = actorOwnedLists.length > 0;
      context.hasCustomLists = customLists.length > 0;
      context.hasMergedLists = mergedLists.length > 0;
      context.hasStandardLists = standardLists.length > 0;
    }
    if (this.isLoading) return context;
    const customMappings = game.settings.get(MODULE.ID, SETTINGS.CUSTOM_SPELL_MAPPINGS) || {};
    context.customListMap = customMappings;
    if (this.availableSpells.length > 0) {
      context.spellSources = managerHelpers.prepareSpellSources(this.availableSpells);
      context.castingTimeOptions = managerHelpers.prepareCastingTimeOptions(this.availableSpells, this.filterState);
      context.damageTypeOptions = managerHelpers.prepareDamageTypeOptions(this.filterState);
      context.conditionOptions = managerHelpers.prepareConditionOptions(this.filterState);
      context.filteredSpells = this._filterAvailableSpells();
      context.filterFormElements = this._prepareFilterFormElements();
    }
    if (this.isEditing && this.selectedSpellList) await this._addEditingContext(context);
    if (this.selectedSpellList) context.selectedSpellList = formattingUtils.processSpellListForDisplay(this.selectedSpellList);
    return context;
  }

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
    classOptions.push({ value: 'custom', label: game.i18n.localize('SPELLMANAGER.CreateList.CustomOption'), selected: false });
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
    return {
      sourceListSelectHtml: formElements.elementToHtml(sourceListSelect),
      copyFromListSelectHtml: formElements.elementToHtml(copyFromListSelect),
      mergedListNameInputHtml: formElements.elementToHtml(mergedListNameInput)
    };
  }

  /**
   * Build spell list options for dropdowns
   * @param {string} defaultLabel - Localization key for default option
   * @returns {Array} Array of option objects
   * @private
   */
  _buildSpellListOptions(defaultLabel) {
    const options = [{ value: '', label: game.i18n.localize(defaultLabel), selected: true }];
    const actorOwnedLists = this.availableSpellLists.filter((list) => list.isActorOwned);
    const customLists = this.availableSpellLists.filter((list) => !list.isActorOwned && !list.isMerged && (list.isCustom || list.document?.flags?.[MODULE.ID]?.isNewList));
    const mergedLists = this.availableSpellLists.filter((list) => !list.isActorOwned && list.isMerged);
    const standardLists = this.availableSpellLists.filter((list) => !list.isActorOwned && !list.isCustom && !list.isMerged && !list.document?.flags?.[MODULE.ID]?.isNewList);
    if (actorOwnedLists.length > 0) {
      options.push({ value: 'optgroup', label: game.i18n.localize('SPELLMANAGER.Folders.PlayerSpellbooks'), optgroup: true });
      actorOwnedLists.forEach((list) => {
        const label = `${list.name} (${list.actorName || game.i18n.localize('SPELLMANAGER.ListSource.Character')})`;
        options.push({ value: list.uuid, label: label, selected: false });
      });
    }
    if (customLists.length > 0) {
      options.push({ value: 'optgroup', label: game.i18n.localize('SPELLMANAGER.Folders.CustomLists'), optgroup: true });
      customLists.forEach((list) => {
        options.push({ value: list.uuid, label: list.name, selected: false });
      });
    }
    if (mergedLists.length > 0) {
      options.push({ value: 'optgroup', label: game.i18n.localize('SPELLMANAGER.Folders.MergedLists'), optgroup: true });
      mergedLists.forEach((list) => {
        options.push({ value: list.uuid, label: list.name, selected: false });
      });
    }
    if (standardLists.length > 0) {
      options.push({ value: 'optgroup', label: game.i18n.localize('SPELLMANAGER.Folders.SpellLists'), optgroup: true });
      standardLists.forEach((list) => {
        options.push({ value: list.uuid, label: `${list.name} (${list.pack})`, selected: false });
      });
    }
    return options;
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

  /** @inheritdoc */
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

  /** @inheritdoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ['container', 'spellLists', 'listContent', 'availableSpells', 'footer'];
  }

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
    for (let spell of this.availableSpells) spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
  }

  /**
   * Filter available spells using the filter helper
   * @returns {Object} Filtered spells with count
   * @private
   */
  _filterAvailableSpells() {
    try {
      const selectedSpellUUIDs = this.getSelectedSpellUUIDs();
      log(3, 'Beginning Filtering:', selectedSpellUUIDs.size, 'selected spells out of', this.availableSpells.length, 'total available');
      return this.filterHelper.filterAvailableSpells(this.availableSpells, selectedSpellUUIDs, this.isSpellInSelectedList.bind(this), this.filterState);
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
   * Apply filters to the DOM elements in the UI
   */
  applyFilters() {
    const filteredData = this._filterAvailableSpells();
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
      { selector: 'select[name="spell-concentration"]', property: 'concentration' },
      { selector: 'select[name="spell-materialComponents"]', property: 'materialComponents' }
    ];

    for (const { selector, property } of dropdownSelectors) {
      const element = this.element.querySelector(selector);
      if (element) {
        element.addEventListener('change', (event) => {
          if (this.filterState[property] !== event.target.value) {
            this.filterState[property] = event.target.value;
            if (property === 'level' || property === 'source') this._refreshFilteredContent();
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
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS) || [];
    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) levelContainer.classList.add('collapsed');
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
      const spellDocs = await actorSpellUtils.fetchSpellDocuments(new Set(spellUuids), 9);
      const spellLevels = actorSpellUtils.organizeSpellsByLevel(spellDocs, null);
      for (const level of spellLevels) {
        for (const spell of level.spells) spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
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
      await this.loadData();
      await this.selectSpellList(newList.uuid);
    }
  }

  /**
   * Select a spell list by UUID
   * @param {string} uuid - The UUID of the spell list to select
   * @returns {Promise<void>}
   */
  async selectSpellList(uuid) {
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
   * Apply saved collapsed folder states from user flags
   */
  applyCollapsedFolders() {
    const collapsedFolders = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_FOLDERS) || [];
    for (const folderId of collapsedFolders) {
      const folderContainer = this.element.querySelector(`.list-folder[data-folder-id="${folderId}"]`);
      if (folderContainer) folderContainer.classList.add('collapsed');
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
   * Handle selecting a spell list
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleSelectSpellList(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;
    await this.selectSpellList(element.dataset.uuid);
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
    this.selectedSpellList.spellsByLevel = actorSpellUtils.organizeSpellsByLevel(this.selectedSpellList.spells, null);
    this._ensureSpellIcons();
    this.render(false);
    this.applyFilters();
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
    log(3, 'Saving custom spell list with pending changes');
    const document = this.selectedSpellList.document;
    const currentSpells = new Set(document.system.spells || []);
    for (const spellUuid of this.pendingChanges.removed) {
      const normalizedForms = managerHelpers.normalizeUuid(spellUuid);
      for (const existingUuid of currentSpells) {
        if (normalizedForms.includes(existingUuid)) currentSpells.delete(existingUuid);
      }
    }
    log(3, `Processing ${this.pendingChanges.added.size} spell additions`);
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
    if (result === 'merge' && formData) await this._mergeListsCallback(formData.sourceListUuid, formData.copyFromListUuid, formData.mergedListName);
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
      window: {
        title: game.i18n.localize('SPELLMANAGER.MergeLists.DialogTitle'),
        icon: 'fas fa-code-merge'
      },
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
              mergedListName: mergedListName
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
   * Create merged spell list
   * @param {string} sourceListUuid - UUID of the source spell list
   * @param {string} copyFromListUuid - UUID of the list to copy from
   * @param {string} mergedListName - Name for the merged list
   * @returns {Promise<void>}
   * @private
   */
  async _mergeListsCallback(sourceListUuid, copyFromListUuid, mergedListName) {
    try {
      const mergedList = await managerHelpers.createMergedSpellList(sourceListUuid, copyFromListUuid, mergedListName);
      if (mergedList) {
        ui.notifications.info(
          game.i18n.format('SPELLMANAGER.MergeLists.SuccessMessage', {
            name: mergedListName
          })
        );
        await this.loadData();
        await this.selectSpellList(mergedList.uuid);
      }
    } catch (error) {
      log(1, 'Error creating merged spell list:', error);
      ui.notifications.error(game.i18n.localize('SPELLMANAGER.MergeLists.ErrorMessage'));
    }
  }
}
