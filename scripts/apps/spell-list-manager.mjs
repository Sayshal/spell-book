import { DEBOUNCE_DELAY, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import {
  compareListVersions,
  createMergedSpellList,
  createNewSpellList,
  duplicateSpellList,
  findAllSpellLists,
  findDuplicateSpellList,
  getValidCustomListMappings,
  removeCustomSpellList
} from '../data/custom-lists.mjs';
import { fetchAllSpells } from '../data/spell-fetcher.mjs';
import { ensureListRegistered, isListEnabledForRegistry, toggleListForRegistry } from '../data/spell-list-registry.mjs';
import { findSpellListsByType } from '../data/spell-list-resolver.mjs';
import { DetailsCustomization, SpellComparison } from '../dialogs/_module.mjs';
import { buildGMMetadata, getEnabledGMElements, isGMElementEnabled } from '../ui/custom-ui.mjs';
import { confirmDialog, detachedRenderOptions } from '../ui/dialogs.mjs';
import { createSpellIconLink, extractSpellFilterData, processSpellListForDisplay } from '../ui/formatting.mjs';
import { log } from '../utils/logger.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** @type {object} Default spell filter state. */
const DEFAULT_FILTER_STATE = Object.freeze({
  name: '',
  level: '',
  school: '',
  source: 'all',
  spellSource: 'all',
  castingTime: '',
  damageType: '',
  condition: '',
  requiresSave: '',
  concentration: '',
  materialComponents: '',
  ritual: false,
  minRange: '',
  maxRange: ''
});

/** @type {Array<{name: string, property: string}>} Dropdown filter metadata for data-driven listener setup (replaces _source:705-780 duplication). */
const DROPDOWN_FILTERS = Object.freeze([
  { name: 'spell-level', property: 'level' },
  { name: 'spell-school', property: 'school' },
  { name: 'spell-compendium-source', property: 'source' },
  { name: 'spell-source', property: 'spellSource' },
  { name: 'spell-castingTime', property: 'castingTime' },
  { name: 'spell-damageType', property: 'damageType' },
  { name: 'spell-condition', property: 'condition' },
  { name: 'spell-requiresSave', property: 'requiresSave' },
  { name: 'spell-concentration', property: 'concentration' },
  { name: 'spell-materialComponents', property: 'materialComponents' }
]);

/**
 * Spell List Manager application.
 * @extends HandlebarsApplicationMixin(ApplicationV2)
 */
export class SpellListManager extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: `spell-list-manager-${MODULE.ID}`,
    tag: 'div',
    classes: ['spell-book', 'spell-list-manager'],
    window: { frame: false, positioned: true, title: 'SPELLMANAGER.Application.Title' },
    position: { width: 1100, height: 800 },
    actions: {
      switchSidebarMode: SpellListManager.#onSwitchSidebarMode,
      toggleFolder: SpellListManager.#onToggleFolder,
      selectList: SpellListManager.#onSelectList,
      hideList: SpellListManager.#onHideList,
      showDocs: SpellListManager.#onShowDocs,
      openActor: SpellListManager.#onOpenActor,
      openClass: SpellListManager.#onOpenClass,
      openCustomization: SpellListManager.#onOpenCustomization,
      toggleSpellHeader: SpellListManager.#onToggleSpellHeader,
      saveList: SpellListManager.#onSaveList,
      addSpell: SpellListManager.#onAddSpell,
      removeSpell: SpellListManager.#onRemoveSpell,
      restoreList: SpellListManager.#onRestoreList,
      renameList: SpellListManager.#onRenameList,
      registerList: SpellListManager.#onRegisterList,
      compareSpell: SpellListManager.#onCompareSpell,
      toggleSelectionMode: SpellListManager.#onToggleSelectionMode,
      selectAll: SpellListManager.#onSelectAll,
      bulkSave: SpellListManager.#onBulkSave,
      cancelSelection: SpellListManager.#onCancelSelection,
      createList: SpellListManager.#onCreateList,
      mergeLists: SpellListManager.#onMergeLists,
      deleteList: SpellListManager.#onDeleteList,
      toggleDetach: SpellListManager.#onToggleDetach,
      closeManager: SpellListManager.#onClose
    }
  };

  /** @override */
  static PARTS = {
    header: { template: TEMPLATES.APPS.SPELL_LIST_MANAGER.HEADER },
    main: { template: TEMPLATES.APPS.SPELL_LIST_MANAGER.MAIN },
    sidebar: { template: TEMPLATES.APPS.SPELL_LIST_MANAGER.SPELL_LISTS, scrollable: ['.lists-container', '.sidebar-filter-section'] },
    content: { template: TEMPLATES.APPS.SPELL_LIST_MANAGER.LIST_CONTENT, scrollable: ['.available-spells-panel', '.current-list-panel'] },
    footer: { template: TEMPLATES.APPS.SPELL_LIST_MANAGER.FOOTER }
  };

  /** @type {number} Number of available spells to mount into the DOM per batch. */
  static BATCH_SIZE = 50;

  /** @type {number} Pixels from the bottom of the scroll container that trigger the next batch. */
  static SCROLL_MARGIN = 100;

  /** @type {boolean} Whether initial data load has run. */
  #preInitialized = false;

  /** @type {boolean} Whether data is currently loading. */
  isLoading = true;

  /** @type {object[]} Discovered spell list metadata. */
  availableLists = [];

  /** @type {object[]} All compendium spells (cold fetch). */
  availableSpells = [];

  /** @type {object|null} Currently selected spell list and its spells. */
  selectedList = null;

  /** @type {'lists'|'filters'} Active sidebar view mode. */
  sidebarMode = 'lists';

  /** @type {{ added: Set<string>, removed: Set<string> }} Pending edits. */
  pendingChanges = { added: new Set(), removed: new Set() };

  /** @type {boolean} Whether bulk selection mode is active. */
  selectionMode = false;

  /** @type {Set<string>} Spells queued for bulk add. */
  selectedToAdd = new Set();

  /** @type {Set<string>} Spells queued for bulk remove. */
  selectedToRemove = new Set();

  /** @type {{ add: number, remove: number }} Last clicked indices for shift-range selection. */
  lastSelectedIndex = { add: -1, remove: -1 };

  /** @type {object[]} Full filtered available-spell list (only the first batch is in the DOM). */
  _filteredAll = [];

  /** @type {number} How many filtered spells have been mounted into the DOM so far. */
  _batchIndex = 0;

  /** @type {boolean} Reentrancy guard for select-all processing. */
  isSelectingAll = false;

  /** @type {boolean} Reentrancy guard for checkbox updates. */
  isUpdatingCheckboxes = false;

  /** @type {Set<string>} Spells currently in the comparison set. */
  comparisonSet = new Set();

  /** @type {SpellComparison|null} Active spell comparison dialog. */
  comparisonDialog = null;

  /** @type {object} Active filter state. */
  filterState = { ...DEFAULT_FILTER_STATE };

  /** @type {Map<string, boolean>|null} Cache of {folder:identifier} → hasClass. */
  classFolderCache = null;

  /** @type {Set<string>} Enabled GM UI elements. */
  enabledElements = new Set();

  /** @override */
  async render(options = {}, _options = {}) {
    if (!this.#preInitialized) {
      await this._loadData();
      this.#preInitialized = true;
    }
    return super.render(options, _options);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isLoading = this.isLoading;
    context.sidebarMode = this.sidebarMode;
    context.selectionMode = this.selectionMode;
    context.selectedToAddCount = this.selectedToAdd.size;
    context.selectedToRemoveCount = this.selectedToRemove.size;
    context.totalSelectedCount = this.selectedToAdd.size + this.selectedToRemove.size;
    context.filterState = this.filterState;
    context.spellSchools = CONFIG.DND5E.spellSchools;
    context.spellLevels = CONFIG.DND5E.spellLevels;
    context.comparisonSet = this.comparisonSet;
    context.settings = { useMetricUnits: dnd5e.utils.defaultUnits('length') === 'm' };
    context.totalSpellCount = this.availableSpells.length;
    if (this.availableLists.length) this._organizeSidebarLists(context);
    const mappings = await getValidCustomListMappings();
    context.customListMap = mappings;
    if (this.selectedList) {
      this._addSelectedListContext(context);
      if (this.availableSpells.length) await this._addEditingContext(context);
    }
    if (this.sidebarMode === 'filters') context.filterFormElements = this._buildFilterFormData();
    context.detached = options.window?.attach ? false : options.window?.detach ? true : !!this.window.windowId;
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#enableDragging();
    this._setupFilterListeners();
    this._setupMultiSelectListeners();
    this._setupDragDrop();
    this._setupLazyScroll();
    this._applyCollapsedLevels();
    this._applyCollapsedFolders();
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.bringToFront();
  }

  /** @override */
  bringToFront() {
    if (!this.element) return;
    this.position.zIndex = ++ApplicationV2._maxZ;
    this.element.style.zIndex = String(this.position.zIndex);
    ui.activeWindow = this;
  }

  /** @override */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener('mousedown', () => this.bringToFront(), { capture: false });
  }

  /** Enable drag-to-move via the header strip. Re-wires on every render since PART DOM is replaced. */
  #enableDragging() {
    const handle = this.element?.querySelector('.spell-book-header');
    if (!handle || handle.dataset.dragWired === '1') return;
    handle.dataset.dragWired = '1';
    const drag = new foundry.applications.ux.Draggable.implementation(this, this.element, handle, false);
    const originalMouseDown = drag._onDragMouseDown.bind(drag);
    drag._onDragMouseDown = (event) => {
      if (event.target.closest('button, a, input, select, [data-action]')) return;
      originalMouseDown(event);
    };
  }

  /** @override */
  _onDetach(from, to) {
    super._onDetach?.(from, to);
    this.render({ parts: ['header'] });
  }

  /** @override */
  _onAttach(from, to) {
    super._onAttach?.(from, to);
    this.render({ parts: ['header'] });
  }

  /** Attach the "load more on scroll" listener to the available-spells panel. */
  _setupLazyScroll() {
    const scroll = this.element.querySelector('.available-spells-panel .panel-scroll');
    if (!scroll) return;
    scroll.addEventListener('scroll', this._onScrollAvailableSpells.bind(this), { passive: true });
  }

  /**
   * Load the next batch of filtered spells into the DOM when near the bottom.
   * @param {Event} event - Scroll event
   * @private
   */
  _onScrollAvailableSpells(event) {
    if (this._batchIndex >= this._filteredAll.length) return;
    const { scrollTop, scrollHeight, clientHeight } = event.target;
    if (scrollTop + clientHeight < scrollHeight - SpellListManager.SCROLL_MARGIN) return;
    const next = this._filteredAll.slice(this._batchIndex, this._batchIndex + SpellListManager.BATCH_SIZE);
    const list = this.element.querySelector('.available-spells-panel .spell-list-items');
    if (!next.length || !list) return;
    this._batchIndex += next.length;
    list.insertAdjacentHTML('beforeend', next.map((spell) => this._buildAvailableSpellRow(this._enrichSpellForDisplay(spell))).join(''));
  }

  /**
   * Build the HTML for a single available-spell row. Mirrors the template markup.
   * @param {object} spell - Enriched spell (with `isSelectedForAdd`, etc.)
   * @returns {string} HTML string
   * @private
   */
  _buildAvailableSpellRow(spell) {
    const classes = ['spell-item', 'available'];
    if (this.selectionMode) classes.push('selectable');
    if (spell.isSelectedForAdd) classes.push('selected');
    const nameEscaped = foundry.utils.escapeHTML(spell.name);
    const addTooltip = foundry.utils.escapeHTML(_loc('SPELLMANAGER.Buttons.AddSpell', { name: spell.name }));
    let compareIcon = '';
    if (spell.showCompare) {
      const compareTooltip = foundry.utils.escapeHTML(_loc('SPELLBOOK.Comparison.CompareSpell', { name: spell.name }));
      const activeClass = spell.isInComparison ? ' active' : '';
      compareIcon = `<i class="fa-solid fa-scale-balanced spell-compare-icon${activeClass}" data-action="compareSpell" data-uuid="${spell.uuid}" data-tooltip="${compareTooltip}" aria-label="${compareTooltip}"></i>`;
    }
    const selectable = this.selectionMode;
    const btnClass = selectable ? 'add-spell select-toggle' : 'add-spell';
    const iconHtml = selectable
      ? `<i class="fas fa-${spell.isSelectedForAdd ? 'check-square' : 'square'}" aria-hidden="true"></i>`
      : `<i class="fas fa-plus" aria-hidden="true"></i>`;
    return `<li class="${classes.join(' ')}" data-uuid="${spell.uuid}" draggable="true">
      <div class="spell-name">${spell.enrichedIcon ?? ''}<div class="name-stacked"><span class="title">${nameEscaped}</span><span class="subtitle">${spell.formattedDetails ?? ''}</span></div></div>
      ${compareIcon}
      <button type="button" class="${btnClass}" data-action="addSpell" data-uuid="${spell.uuid}" data-tooltip="${addTooltip}">${iconHtml}</button>
    </li>`;
  }

  /** @override */
  async _onClose(options) {
    if (this.comparisonDialog) {
      await this.comparisonDialog.close();
      this.comparisonDialog = null;
    }
    this.comparisonSet.clear();
    return super._onClose(options);
  }

  /** Re-read enabled elements, invalidate cached metadata, and re-render content/sidebar. */
  async refreshDisplay() {
    this.enabledElements = getEnabledGMElements();
    for (const spell of this.availableSpells) delete spell.formattedDetails;
    this.render(false, { parts: ['content', 'sidebar', 'footer'] });
  }

  /** Load all spell lists and available spells on first render. */
  async _loadData() {
    this.enabledElements = getEnabledGMElements();
    const progress = ui.notifications.info('SPELLMANAGER.Loading.Spells', { localize: true, progress: true, console: false });
    const ESTIMATE = 1500;
    try {
      this.availableLists = await findAllSpellLists();
      this.classFolderCache = await this._buildClassFolderCache();
      for (const list of this.availableLists) {
        list.isSubclass = list.document?.system?.type === 'subclass';
        list.icon = list.isSubclass ? 'fas fa-shield' : 'fas fa-book';
      }
      this.availableLists.sort((a, b) => a.name.localeCompare(b.name));
      this.availableSpells = await fetchAllSpells({
        onProgress: (_pack, count) => progress.update({ pct: Math.min(count / ESTIMATE, 1) })
      });
      progress.update({ pct: 1 });
      log(3, `SpellListManager loaded ${this.availableLists.length} lists, ${this.availableSpells.length} spells`);
    } catch (err) {
      log(1, 'SpellListManager load failed:', err);
      progress.update({ pct: 1, message: 'SPELLMANAGER.Loading.Failed', localize: true });
    } finally {
      this.isLoading = false;
    }
  }

  /** Refresh only the spell list metadata, skipping the expensive spell fetch. */
  async _refreshLists() {
    this.availableLists = await findAllSpellLists();
    for (const list of this.availableLists) {
      list.isSubclass = list.document?.system?.type === 'subclass';
      list.icon = list.isSubclass ? 'fas fa-shield' : 'fas fa-book';
    }
    this.availableLists.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Build a cache of `folder:identifier` keys for early-exit class lookups.
   * @returns {Promise<Map<string, boolean>>} Cache keyed by `{folder}:{identifier}` → true
   * @private
   */
  async _buildClassFolderCache() {
    const cache = new Map();
    const classPacks = game.packs.filter((p) => {
      if (p.metadata.type !== 'Item') return false;
      const types = p.metadata.flags?.dnd5e?.types;
      if (!types) return true;
      const typeSet = new Set(types);
      return typeSet.has('class') || typeSet.has('subclass');
    });
    for (const pack of classPacks) {
      let topLevelFolder = null;
      if (pack.folder) topLevelFolder = pack.folder.depth !== 1 ? pack.folder.getParentFolders().at(-1).name : pack.folder.name;
      if (!topLevelFolder) continue;
      try {
        const index = await pack.getIndex({ fields: ['type', 'system.identifier'] });
        for (const entry of index) if ((entry.type === 'class' || entry.type === 'subclass') && entry.system?.identifier) cache.set(`${topLevelFolder}:${entry.system.identifier.toLowerCase()}`, true);
      } catch (err) {
        log(2, `Error indexing pack "${pack.collection}" for class cache: ${err.message}`);
      }
    }
    return cache;
  }

  /**
   * Find a class/subclass item in the compendium packs under a top-level folder.
   * @param {string} identifier - Class identifier
   * @param {string} topLevelFolderName - Top-level folder name
   * @returns {Promise<object|null>} The resolved class Item document, or null
   * @private
   */
  async _findClassInTopLevelFolder(identifier, topLevelFolderName) {
    const key = `${topLevelFolderName}:${identifier.toLowerCase()}`;
    if (this.classFolderCache && !this.classFolderCache.has(key)) return null;
    const classPacks = game.packs.filter((p) => {
      if (p.metadata.type !== 'Item') return false;
      const types = p.metadata.flags?.dnd5e?.types;
      if (!types) return true;
      const typeSet = new Set(types);
      return typeSet.has('class') || typeSet.has('subclass');
    });
    for (const pack of classPacks) {
      let packTopLevelFolder = null;
      if (pack.folder) packTopLevelFolder = pack.folder.depth !== 1 ? pack.folder.getParentFolders().at(-1).name : pack.folder.name;
      if (packTopLevelFolder !== topLevelFolderName) continue;
      try {
        const index = await pack.getIndex({ fields: ['type', 'system.identifier'] });
        const entry = index.find((e) => (e.type === 'class' || e.type === 'subclass') && e.system?.identifier?.toLowerCase() === identifier.toLowerCase());
        if (entry) return await pack.getDocument(entry._id);
      } catch (err) {
        log(2, `Error indexing pack "${pack.collection}": ${err.message}`);
      }
    }
    return null;
  }

  /**
   * Organize the sidebar list categories into the context.
   * @param {object} context - Context object to mutate
   * @private
   */
  _organizeSidebarLists(context) {
    const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const actorOwned = this.availableLists.filter((l) => l.isActorOwned);
    const hidden = this.availableLists.filter((l) => !l.isActorOwned && hiddenLists.includes(l.uuid));
    const modified = this.availableLists.filter((l) => !l.isActorOwned && l.isModified && !hiddenLists.includes(l.uuid));
    const merged = this.availableLists.filter((l) => !l.isActorOwned && l.isMerged && !hiddenLists.includes(l.uuid));
    const custom = this.availableLists.filter((l) => !l.isActorOwned && !l.isMerged && !l.isModified && (l.isCustom || l.document?.flags?.[MODULE.ID]?.isNewList) && !hiddenLists.includes(l.uuid));
    const standard = this.availableLists.filter((l) => !l.isActorOwned && !l.isCustom && !l.isMerged && !l.isModified && !l.document?.flags?.[MODULE.ID]?.isNewList && !hiddenLists.includes(l.uuid));
    const byActor = (a, b) => (a.actorName && b.actorName ? a.actorName.localeCompare(b.actorName) : a.actorName ? -1 : b.actorName ? 1 : a.name.localeCompare(b.name));
    const byName = (a, b) => a.name.localeCompare(b.name);
    actorOwned.sort(byActor);
    [custom, merged, modified, standard, hidden].forEach((arr) => arr.sort(byName));
    context.actorOwnedLists = actorOwned;
    context.customLists = custom;
    context.mergedLists = merged;
    context.modifiedLists = modified;
    context.standardLists = standard;
    context.hiddenSpellLists = hidden;
    context.hasActorOwnedLists = actorOwned.length > 0;
    context.hasCustomLists = custom.length > 0;
    context.hasMergedLists = merged.length > 0;
    context.hasModifiedLists = modified.length > 0;
    context.hasStandardLists = standard.length > 0;
    context.hasHiddenLists = hidden.length > 0;
    context.visibleSpellListsCount = this.availableLists.length - hiddenLists.length;
    context.hiddenSpellListsCount = hidden.length;
    context.hiddenListUuids = hiddenLists;
    context.availableSpellLists = this.availableLists;
  }

  /**
   * Enrich the selected list for display (status flags, renameable, comparison).
   * @param {object} context - Context object to mutate
   * @private
   */
  _addSelectedListContext(context) {
    const processed = processSpellListForDisplay(this.selectedList, this.classFolderCache, this.availableLists, this.enabledElements);
    const flags = this.selectedList.document.flags?.[MODULE.ID] || {};
    const isCustomList = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;
    processed.isRenameable = isCustomList || !!this.selectedList.isMerged;
    processed.isRegistryEnabled = isListEnabledForRegistry(this.selectedList.uuid);
    processed.isActorOwned = !!flags.actorId;
    processed.spellCount = processed.spells?.length ?? 0;
    if (processed.spells?.length) {
      const sources = new Set();
      for (const spell of processed.spells) {
        const src = spell.system?.source?.custom || spell.system?.source?.book;
        if (src) sources.add(src);
      }
      processed.spellSources = [...sources].sort();
    }
    if (processed.spellsByLevel) processed.spellsByLevel = processed.spellsByLevel.map((level) => ({ ...level, spells: level.spells.map((spell) => this._decorateSpellForSelectedList(spell)) }));
    context.selectedList = processed;
  }

  /**
   * Decorate a selected-list spell with comparison/selection state.
   * @param {object} spell - Processed spell
   * @returns {object} Spell copy with comparison/removal flags set
   * @private
   */
  _decorateSpellForSelectedList(spell) {
    const uuid = spell.uuid || spell.compendiumUuid;
    const decorated = { ...spell };
    decorated.isInComparison = this.comparisonSet.has(uuid);
    decorated.showCompareLink = true;
    if (this.selectedList && this.selectionMode) decorated.isSelectedForRemoval = this.selectedToRemove.has(uuid);
    return decorated;
  }

  /**
   * Add editing-mode context (filtered available spells, comparison data, filter form data).
   * @param {object} context - Context object to mutate
   * @private
   */
  async _addEditingContext(context) {
    const flags = this.selectedList.document.flags?.[MODULE.ID] || {};
    context.isCustomList = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;
    if (context.isCustomList && flags.originalUuid) {
      context.originalUuid = flags.originalUuid;
      context.compareInfo = await compareListVersions(flags.originalUuid, this.selectedList.document.uuid);
    }
    const filtered = this._filterAvailableSpells();
    this._filteredAll = filtered.spells;
    this._batchIndex = Math.min(SpellListManager.BATCH_SIZE, filtered.spells.length);
    const firstBatch = filtered.spells.slice(0, this._batchIndex).map((spell) => this._enrichSpellForDisplay(spell));
    context.filteredSpells = { spells: firstBatch, totalFiltered: filtered.totalFiltered };
  }

  /**
   * Build the render-time view for a single available spell. Caches expensive fields on the spell.
   * @param {object} spell - Raw index entry from `this.availableSpells`
   * @returns {object} Spread copy with enrichedIcon, formattedDetails, isSelectedForAdd, etc.
   * @private
   */
  _enrichSpellForDisplay(spell) {
    if (!spell.enrichedIcon) spell.enrichedIcon = createSpellIconLink(spell);
    if (!spell.formattedDetails) spell.formattedDetails = buildGMMetadata(spell, this.enabledElements);
    return {
      ...spell,
      showCompare: !!this.enabledElements?.has('compare'),
      isInComparison: this.comparisonSet.has(spell.uuid),
      showCompareLink: true,
      isSelectedForAdd: this.selectionMode ? this.selectedToAdd.has(spell.uuid) : false
    };
  }

  /**
   * Build the data objects consumed by the `filter-item.hbs` partial.
   * Each entry matches the partial's expected shape: `{ name, id, type,
   * label?, options?, value?, checked?, placeholder?, ariaLabel, disabled }`.
   * @returns {object} Map of filter key → filter-item data
   * @private
   */
  _buildFilterFormData() {
    const disabled = false;
    const f = this.filterState;
    return {
      search: {
        name: 'spell-search',
        id: 'spell-search',
        type: 'text',
        value: f.name || '',
        placeholder: 'SPELLMANAGER.Filters.SearchPlaceholder',
        ariaLabel: 'SPELLMANAGER.Filters.SearchPlaceholder',
        disabled
      },
      level: { name: 'spell-level', id: 'spell-level', type: 'select', label: 'DND5E.SpellLevel', ariaLabel: 'DND5E.SpellLevel', options: this._buildLevelOptions(f.level), disabled },
      school: {
        name: 'spell-school',
        id: 'spell-school',
        type: 'select',
        label: 'DND5E.School',
        ariaLabel: 'DND5E.School',
        options: this._buildSchoolOptions(f.school),
        disabled
      },
      castingTime: {
        name: 'spell-castingTime',
        id: 'spell-castingTime',
        type: 'select',
        label: 'DND5E.SpellCastTime',
        ariaLabel: 'DND5E.SpellCastTime',
        options: this._buildCastingTimeOptions(f.castingTime),
        disabled
      },
      damageType: {
        name: 'spell-damageType',
        id: 'spell-damageType',
        type: 'select',
        label: 'DND5E.DamageType',
        ariaLabel: 'DND5E.DamageType',
        options: this._buildDamageTypeOptions(f.damageType),
        disabled
      },
      condition: {
        name: 'spell-condition',
        id: 'spell-condition',
        type: 'select',
        label: 'SPELLBOOK.Filters.Condition',
        ariaLabel: 'SPELLBOOK.Filters.Condition',
        options: this._buildConditionOptions(f.condition),
        disabled
      },
      requiresSave: {
        name: 'spell-requiresSave',
        id: 'spell-requiresSave',
        type: 'select',
        label: 'SPELLBOOK.Filters.RequiresSave',
        ariaLabel: 'SPELLBOOK.Filters.RequiresSave',
        options: this._buildBinaryOptions(f.requiresSave),
        disabled
      },
      concentration: {
        name: 'spell-concentration',
        id: 'spell-concentration',
        type: 'select',
        label: 'SPELLBOOK.Filters.RequiresConcentration',
        ariaLabel: 'SPELLBOOK.Filters.RequiresConcentration',
        options: this._buildBinaryOptions(f.concentration),
        disabled
      },
      materialComponents: {
        name: 'spell-materialComponents',
        id: 'spell-materialComponents',
        type: 'select',
        label: 'SPELLBOOK.Filters.Materials.Title',
        ariaLabel: 'SPELLBOOK.Filters.Materials.Title',
        options: this._buildMaterialOptions(f.materialComponents),
        disabled
      },
      ritual: { name: 'filter-ritual', id: 'filter-ritual', type: 'checkbox', label: 'SPELLBOOK.Filters.RitualOnly', ariaLabel: 'SPELLBOOK.Filters.RitualOnly', checked: !!f.ritual, disabled },
      minRange: {
        name: 'spell-min-range',
        id: 'spell-min-range',
        type: 'number',
        value: f.minRange || '',
        placeholder: 'SPELLBOOK.Filters.RangeMin',
        ariaLabel: 'SPELLBOOK.Filters.RangeMinLabel',
        disabled
      },
      maxRange: {
        name: 'spell-max-range',
        id: 'spell-max-range',
        type: 'number',
        value: f.maxRange || '',
        placeholder: 'SPELLBOOK.Filters.RangeMax',
        ariaLabel: 'SPELLBOOK.Filters.RangeMaxLabel',
        disabled
      },
      compendiumSource: {
        name: 'spell-compendium-source',
        id: 'spell-compendium-source',
        type: 'select',
        label: 'SPELLMANAGER.Filters.CompendiumSource',
        ariaLabel: 'SPELLMANAGER.Filters.CompendiumSource',
        options: this._buildCompendiumSourceOptions(f.source),
        disabled
      },
      spellSource: {
        name: 'spell-source',
        id: 'spell-source',
        type: 'select',
        label: 'SPELLMANAGER.Filters.SpellSource',
        ariaLabel: 'SPELLMANAGER.Filters.SpellSource',
        options: this._buildSpellSourceOptions(f.spellSource),
        disabled
      }
    };
  }

  /**
   * Build spell level options.
   * @param {string} selected - Currently selected value
   * @returns {object[]} Option list
   * @private
   */
  _buildLevelOptions(selected) {
    const options = [{ value: '', label: _loc('SPELLMANAGER.Filters.AllLevels'), selected: !selected }];
    for (const [level, label] of Object.entries(CONFIG.DND5E.spellLevels)) {
      options.push({ value: level, label, selected: selected === level });
    }
    return options;
  }

  /**
   * Build spell school options.
   * @param {string} selected - Currently selected value
   * @returns {object[]} Option list
   * @private
   */
  _buildSchoolOptions(selected) {
    const options = [{ value: '', label: _loc('SPELLMANAGER.Filters.AllSchools'), selected: !selected }];
    for (const [key, school] of Object.entries(CONFIG.DND5E.spellSchools)) {
      const label = school?.label ?? school?.name ?? String(school);
      options.push({ value: key, label, selected: selected === key });
    }
    return options;
  }

  /**
   * Build casting time options from available spells.
   * @param {string} selected - Currently selected value
   * @returns {object[]} Option list
   * @private
   */
  _buildCastingTimeOptions(selected) {
    const unique = new Map();
    for (const spell of this.availableSpells) {
      const type = spell.system?.activation?.type;
      if (!type) continue;
      const value = spell.system?.activation?.value || 1;
      unique.set(`${type}:${value}`, { type, value });
    }
    const typeOrder = { action: 1, bonus: 2, reaction: 3, minute: 4, hour: 5, day: 6, legendary: 7, mythic: 8, lair: 9, crew: 10, special: 11, none: 12 };
    const sortable = [...unique.entries()]
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => {
        const pa = typeOrder[a.type] || 999;
        const pb = typeOrder[b.type] || 999;
        return pa !== pb ? pa - pb : a.value - b.value;
      });
    const options = [{ value: '', label: _loc('SPELLBOOK.Filters.All'), selected: !selected }];
    for (const entry of sortable) {
      const typeLabel = CONFIG.DND5E.abilityActivationTypes[entry.type] || entry.type;
      const label = entry.value === 1 ? typeLabel : `${entry.value} ${typeLabel}s`;
      options.push({ value: entry.key, label, selected: selected === entry.key });
    }
    return options;
  }

  /**
   * Build damage type options (including healing).
   * @param {string} selected - Currently selected value
   * @returns {object[]} Option list
   * @private
   */
  _buildDamageTypeOptions(selected) {
    const options = [{ value: '', label: _loc('SPELLBOOK.Filters.All'), selected: !selected }];
    const healingConfig = CONFIG.DND5E.healingTypes?.healing;
    const healingLabel = healingConfig?.labelShort ?? healingConfig?.label ?? 'Healing';
    const entries = Object.entries(CONFIG.DND5E.damageTypes).map(([key, damage]) => ({ key, label: damage?.label ?? damage?.name ?? String(damage) }));
    entries.push({ key: 'healing', label: healingLabel });
    entries.sort((a, b) => a.label.localeCompare(b.label));
    for (const { key, label } of entries) options.push({ value: key, label, selected: selected === key });
    return options;
  }

  /**
   * Build condition type options (excluding pseudo-conditions).
   * @param {string} selected - Currently selected value
   * @returns {object[]} Option list
   * @private
   */
  _buildConditionOptions(selected) {
    const options = [{ value: '', label: _loc('SPELLBOOK.Filters.All'), selected: !selected }];
    const entries = Object.entries(CONFIG.DND5E.conditionTypes)
      .filter(([, condition]) => !condition.pseudo)
      .map(([key, condition]) => ({ key, label: condition?.label ?? condition?.name ?? String(condition) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    for (const { key, label } of entries) options.push({ value: key, label, selected: selected === key });
    return options;
  }

  /**
   * Build true/false/all binary select options for yes-no filters.
   * @param {string} selected - Currently selected value ('', 'true', 'false')
   * @returns {object[]} Option list
   * @private
   */
  _buildBinaryOptions(selected) {
    return [
      { value: '', label: _loc('SPELLBOOK.Filters.All'), selected: !selected },
      { value: 'true', label: _loc('COMMON.Yes'), selected: selected === 'true' },
      { value: 'false', label: _loc('COMMON.No'), selected: selected === 'false' }
    ];
  }

  /**
   * Build material component filter options.
   * @param {string} selected - Currently selected value
   * @returns {object[]} Option list
   * @private
   */
  _buildMaterialOptions(selected) {
    return [
      { value: '', label: _loc('SPELLBOOK.Filters.All'), selected: !selected },
      { value: 'consumed', label: _loc('SPELLBOOK.Filters.Materials.Consumed'), selected: selected === 'consumed' },
      { value: 'notConsumed', label: _loc('SPELLBOOK.Filters.Materials.NotConsumed'), selected: selected === 'notConsumed' }
    ];
  }

  /**
   * Build compendium source options from the packages contributing available spells.
   * @param {string} selected - Currently selected value
   * @returns {object[]} Option list
   * @private
   */
  _buildCompendiumSourceOptions(selected) {
    const sourceMap = new Map();
    sourceMap.set('all', { id: 'all', label: _loc('SPELLMANAGER.Filters.AllSources') });
    for (const spell of this.availableSpells) {
      const parts = spell.uuid?.split('.');
      if (parts?.[0] !== 'Compendium' || parts.length < 3) continue;
      const packId = `${parts[1]}.${parts[2]}`;
      if (sourceMap.has(packId)) continue;
      const pack = game.packs.get(packId);
      let label = pack?.metadata?.label || packId;
      if (pack?.folder) {
        const parents = pack.folder.getParentFolders?.();
        label = (parents?.length ? parents.at(-1).name : pack.folder.name) || label;
      }
      sourceMap.set(packId, { id: packId, label });
    }
    return [...sourceMap.values()]
      .sort((a, b) => (a.id === 'all' ? -1 : b.id === 'all' ? 1 : a.label.localeCompare(b.label)))
      .map(({ id, label }) => ({ value: id, label, selected: selected === id }));
  }

  /**
   * Build spell source options from system.source.book / system.source.custom.
   * @param {string} selected - Currently selected value
   * @returns {object[]} Option list
   * @private
   */
  _buildSpellSourceOptions(selected) {
    const sourceMap = new Map();
    sourceMap.set('all', { id: 'all', label: _loc('SPELLMANAGER.Filters.AllSpellSources') });
    const noSourceLabel = _loc('SPELLMANAGER.Filters.NoSource');
    for (const spell of this.availableSpells) {
      const resolved = SpellListManager._resolveSpellSource(spell);
      const label = resolved || noSourceLabel;
      const id = resolved || 'no-source';
      if (!sourceMap.has(id)) sourceMap.set(id, { id, label });
    }
    return [...sourceMap.values()]
      .sort((a, b) => (a.id === 'all' ? -1 : b.id === 'all' ? 1 : a.label.localeCompare(b.label)))
      .map(({ id, label }) => ({ value: id, label, selected: selected === id }));
  }

  /**
   * Resolve a spell's source label from its system data.
   * @param {object} spell - Spell index entry
   * @returns {string} Resolved source label or empty string
   */
  static _resolveSpellSource(spell) {
    const s = spell.system?.source;
    if (!s) return '';
    const raw = s.custom?.trim() || s.bookPlaceholder?.trim() || s.book?.trim() || '';
    return raw;
  }

  /**
   * Return the currently visible available-spell set given the filter state.
   * @returns {{ spells: object[], totalFiltered: number }} Visible spells and their count
   * @private
   */
  _filterAvailableSpells() {
    if (!this.selectedList) return { spells: [], totalFiltered: 0 };
    const selectedUuids = new Set(this.selectedList.spells?.map((s) => s.uuid).filter(Boolean) ?? []);
    const f = this.filterState;
    const name = f.name?.trim().toLowerCase() || '';
    const minRange = parseFloat(f.minRange);
    const maxRange = parseFloat(f.maxRange);
    const getFilterData = (spell) => {
      if (!spell._filterData) spell._filterData = extractSpellFilterData(spell);
      return spell._filterData;
    };
    const spells = this.availableSpells.filter((spell) => {
      if (selectedUuids.has(spell.uuid)) return false;
      if (name && !spell.name.toLowerCase().includes(name)) return false;
      if (f.level !== '' && String(spell.system?.level ?? 0) !== f.level) return false;
      if (f.school && spell.system?.school !== f.school) return false;
      if (f.source !== 'all') {
        const parts = spell.uuid?.split('.');
        const packId = parts?.[0] === 'Compendium' && parts.length >= 3 ? `${parts[1]}.${parts[2]}` : '';
        if (packId !== f.source) return false;
      }
      if (f.castingTime && `${spell.system?.activation?.type ?? ''}:${spell.system?.activation?.value ?? ''}` !== f.castingTime) return false;
      const hasProp = (key) => (Array.isArray(spell.system?.properties) ? spell.system.properties.includes(key) : !!spell.system?.properties?.has?.(key));
      if (f.ritual && !hasProp('ritual')) return false;
      if (f.concentration === 'true' && !hasProp('concentration')) return false;
      if (f.concentration === 'false' && hasProp('concentration')) return false;
      if (f.materialComponents === 'consumed' && !spell.system?.materials?.consumed) return false;
      if (f.materialComponents === 'notConsumed' && (!hasProp('material') || spell.system?.materials?.consumed)) return false;
      if (f.spellSource && f.spellSource !== 'all') {
        const src = SpellListManager._resolveSpellSource(spell) || 'no-source';
        if (src !== f.spellSource) return false;
      }
      const rangeValue = Number(spell.system?.range?.value ?? 0);
      if (!Number.isNaN(minRange) && f.minRange !== '' && rangeValue < minRange) return false;
      if (!Number.isNaN(maxRange) && f.maxRange !== '' && rangeValue > maxRange) return false;
      if (f.damageType && !getFilterData(spell).damageTypes.includes(f.damageType)) return false;
      if (f.condition && !getFilterData(spell).conditions.includes(f.condition)) return false;
      if (f.requiresSave === 'true' && !getFilterData(spell).requiresSave) return false;
      if (f.requiresSave === 'false' && getFilterData(spell).requiresSave) return false;
      return true;
    });
    return { spells, totalFiltered: spells.length };
  }

  /**
   * Reset filter state to defaults.
   * @private
   */
  _resetFilters() {
    this.filterState = { ...DEFAULT_FILTER_STATE };
    this.render(false, { parts: ['sidebar', 'content'] });
  }

  /**
   * Attach listeners to filter inputs.
   * @private
   */
  _setupFilterListeners() {
    if (this.sidebarMode !== 'filters') return;
    const nameInput = this.element.querySelector('input[name="spell-search"]');
    if (nameInput) {
      nameInput.addEventListener('input', (event) => {
        this.filterState.name = event.target.value;
        clearTimeout(this._nameFilterTimer);
        this._nameFilterTimer = setTimeout(() => this.render(false, { parts: ['content'] }), DEBOUNCE_DELAY);
      });
    }
    for (const { name, property } of DROPDOWN_FILTERS) {
      const el = this.element.querySelector(`select[name="${name}"]`);
      if (!el) continue;
      el.addEventListener('change', (event) => {
        if (this.filterState[property] === event.target.value) return;
        this.filterState[property] = event.target.value;
        clearTimeout(this._dropdownFilterTimer);
        this._dropdownFilterTimer = setTimeout(() => this.render(false, { parts: ['content'] }), DEBOUNCE_DELAY);
      });
    }
    for (const prop of ['minRange', 'maxRange']) {
      const inputName = prop === 'minRange' ? 'spell-min-range' : 'spell-max-range';
      const el = this.element.querySelector(`input[name="${inputName}"]`);
      if (!el) continue;
      el.addEventListener('input', (event) => {
        this.filterState[prop] = event.target.value;
        clearTimeout(this._rangeFilterTimer);
        this._rangeFilterTimer = setTimeout(() => this.render(false, { parts: ['content'] }), DEBOUNCE_DELAY);
      });
    }
    const ritualCb = this.element.querySelector('dnd5e-checkbox[name="filter-ritual"]');
    if (ritualCb) {
      ritualCb.addEventListener('change', (event) => {
        this.filterState.ritual = event.target.checked;
        this.render(false, { parts: ['content'] });
      });
    }
    const resetButton = this.element.querySelector('.reset-filters');
    if (resetButton) resetButton.addEventListener('click', () => this._resetFilters());
  }

  /** Apply saved collapsed spell-level state from user flags. */
  _applyCollapsedLevels() {
    const collapsed = game.user.getFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS) || [];
    for (const levelId of collapsed) {
      const el = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (el) el.classList.add('collapsed');
    }
  }

  /** Apply saved collapsed folder state from user flags. */
  _applyCollapsedFolders() {
    const collapsed = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_FOLDERS) || [];
    for (const folderId of collapsed) {
      const el = this.element.querySelector(`.list-folder[data-folder-id="${folderId}"]`);
      if (el) el.classList.add('collapsed');
    }
  }

  /**
   * Toggle a value in a user flag array and return the new membership state.
   * @param {string} flagKey - The flag key (FLAGS.*)
   * @param {string} id - Value to toggle
   * @returns {Promise<boolean>} Whether the value is now present
   * @private
   */
  async _toggleUserFlagArray(flagKey, id) {
    const current = game.user.getFlag(MODULE.ID, flagKey) || [];
    const isCollapsed = current.includes(id);
    const next = isCollapsed ? current.filter((x) => x !== id) : [...current, id];
    await game.user.setFlag(MODULE.ID, flagKey, next);
    return !isCollapsed;
  }

  /** Clear all bulk selection state. */
  _clearSelections() {
    this.selectedToAdd.clear();
    this.selectedToRemove.clear();
    this.selectionMode = false;
    this.lastSelectedIndex = { add: -1, remove: -1 };
    this.isSelectingAll = false;
  }

  /**
   * Setup click/keyboard listeners for shift-click range selection.
   * @private
   */
  _setupMultiSelectListeners() {
    if (!this.selectedList) return;
    this.element.addEventListener('keydown', (event) => {
      if (!this.selectionMode) return;
      if (event.key === 'Escape') {
        this._clearSelections();
        this.render(false, { parts: ['content'] });
        event.preventDefault();
      }
    });
  }

  /** Set up drag-and-drop between the available and current spell panels. */
  _setupDragDrop() {
    const available = this.element.querySelector('.available-spells-panel');
    const current = this.element.querySelector('.current-list-panel');
    if (!available || !current) return;
    const onDragStart = (event) => {
      const li = event.target.closest('.spell-item[data-uuid]');
      if (!li) return;
      event.dataTransfer.setData('text/plain', li.dataset.uuid);
      event.dataTransfer.effectAllowed = 'move';
      li.classList.add('dragging');
    };
    const onDragEnd = (event) => {
      event.target.closest('.spell-item')?.classList.remove('dragging');
      available.classList.remove('drag-over');
      current.classList.remove('drag-over');
    };
    const onDragOver = (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    };
    const onDragEnter = (event) => {
      event.preventDefault();
      event.currentTarget.classList.add('drag-over');
    };
    const onDragLeave = (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('drag-over');
    };
    available.addEventListener('dragstart', onDragStart);
    available.addEventListener('dragend', onDragEnd);
    current.addEventListener('dragstart', onDragStart);
    current.addEventListener('dragend', onDragEnd);
    // Drop on current panel = add spell
    current.addEventListener('dragover', onDragOver);
    current.addEventListener('dragenter', onDragEnter);
    current.addEventListener('dragleave', onDragLeave);
    current.addEventListener('drop', (event) => {
      event.preventDefault();
      current.classList.remove('drag-over');
      const uuid = event.dataTransfer.getData('text/plain');
      if (uuid) EditingController.addSpell(this, uuid);
    });
    // Drop on available panel = remove spell
    available.addEventListener('dragover', onDragOver);
    available.addEventListener('dragenter', onDragEnter);
    available.addEventListener('dragleave', onDragLeave);
    available.addEventListener('drop', (event) => {
      event.preventDefault();
      available.classList.remove('drag-over');
      const uuid = event.dataTransfer.getData('text/plain');
      if (uuid) EditingController.removeSpell(this, uuid);
    });
  }

  /**
   * Select a spell list by UUID (used by controllers and the selectList action).
   * @param {string} uuid - Spell list UUID
   * @returns {Promise<void>}
   */
  async selectSpellList(uuid) {
    this._clearSelections();
    const duplicate = await findDuplicateSpellList(uuid);
    if (duplicate && duplicate.uuid !== uuid) return this.selectSpellList(duplicate.uuid);
    const doc = await fromUuid(uuid);
    if (!doc) return;
    this.pendingChanges = { added: new Set(), removed: new Set() };
    this.filterState = { ...DEFAULT_FILTER_STATE };
    this._filteredAll = [];
    this._batchIndex = 0;
    const spellUuids = Array.from(doc.system.spells || []);
    this.selectedList = { document: doc, uuid: doc.uuid, name: doc.name, spellUuids, spells: [], isLoadingSpells: true };
    this.sidebarMode = 'filters';
    this.render(false, { parts: ['sidebar', 'content', 'footer'] });
    await this._loadSelectedSpellDetails(spellUuids);
  }

  /**
   * Load full spell documents for the selected list and group by level.
   * @param {string[]} spellUuids - UUIDs to load
   * @private
   */
  async _loadSelectedSpellDetails(spellUuids) {
    if (!this.selectedList) return;
    const uuidSet = new Set(spellUuids);
    // Match against the already-loaded CB.fetch spell index instead of individual fromUuid calls
    const spells = this.availableSpells.filter((s) => uuidSet.has(s.uuid)).map((s) => ({ ...s, compendiumUuid: s.uuid, enrichedIcon: createSpellIconLink(s) }));
    this.selectedList.spells = spells;
    this.selectedList.spellsByLevel = this._organizeSpellsByLevel(spells);
    this.selectedList.isLoadingSpells = false;
    this.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Group spells by level for display.
   * @param {object[]} spells - Spells to group
   * @returns {object[]} Level groups sorted ascending
   * @private
   */
  _organizeSpellsByLevel(spells) {
    const byLevel = new Map();
    for (const spell of spells) {
      const level = spell.system?.level ?? 0;
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level).push(spell);
    }
    return [...byLevel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, levelSpells]) => ({ level, levelName: CONFIG.DND5E.spellLevels[level] || `Level ${level}`, spells: levelSpells.sort((a, b) => a.name.localeCompare(b.name)) }));
  }

  /**
   * Set the source filter based on the selected list's pack.
   * @param {object} doc - Spell list document
   * @private
   */

  /**
   * Toggle sidebar collapsed class.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The button element
   */
  /** Toggle detached-window mode. */
  static #onToggleDetach() {
    if (this.window.windowId) this.attachWindow();
    else this.detachWindow();
  }

  /** Close the manager. */
  static async #onClose() {
    this.element?.classList.add('closing');
    await new Promise((resolve) => setTimeout(resolve, 250));
    await this.close({ animate: false });
  }

  /**
   * Switch sidebar between list browser and filter modes.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The button with data-mode
   */
  static #onSwitchSidebarMode(_event, target) {
    this.sidebarMode = target.dataset.mode || 'lists';
    if (this.sidebarMode === 'lists') {
      this.selectedList = null;
      this.pendingChanges = { added: new Set(), removed: new Set() };
    }
    this.render(false, { parts: ['sidebar', 'content', 'footer'] });
  }

  /**
   * Toggle a sidebar folder's collapsed state and persist to user flags.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The folder header element
   */
  static async #onToggleFolder(_event, target) {
    const folder = target.closest('.list-folder');
    if (!folder?.dataset?.folderId) return;
    const isCollapsed = await this._toggleUserFlagArray(FLAGS.COLLAPSED_FOLDERS, folder.dataset.folderId);
    folder.classList.toggle('collapsed', isCollapsed);
  }

  /**
   * Select a sidebar list.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The list row element
   */
  static async #onSelectList(_event, target) {
    const el = target.closest('[data-uuid]');
    if (!el) return;
    await this.selectSpellList(el.dataset.uuid);
  }

  /**
   * Toggle a list's hidden state via HIDDEN_SPELL_LISTS setting.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _target - The capturing element (unused; event.target is used)
   */
  static async #onHideList(event, _target) {
    event.stopPropagation();
    const listItem = event.target.closest('[data-uuid]');
    if (!listItem) return;
    const uuid = listItem.dataset.uuid;
    const list = this.availableLists.find((l) => l.uuid === uuid);
    if (!list || list.isActorOwned) return;
    const hidden = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const next = hidden.includes(uuid) ? hidden.filter((id) => id !== uuid) : [...hidden, uuid];
    await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, next);
    this.render(false, { parts: ['sidebar', 'footer'] });
  }

  /** Show the documentation dialog. */
  static async #onShowDocs() {
    const content = await renderTemplate(TEMPLATES.DIALOGS.MANAGER_DOCUMENTATION, {});
    await DialogV2.wait({
      window: { title: _loc('SPELLMANAGER.Documentation.Title'), icon: 'fas fa-question-circle' },
      content,
      classes: ['spell-book', 'spell-manager-documentation'],
      buttons: [{ icon: 'fas fa-check', label: _loc('Close'), action: 'close' }],
      position: { width: 600, height: 700 },
      default: 'close',
      rejectClose: false,
      renderOptions: detachedRenderOptions(this)
    });
  }

  /** Open the actor sheet for an actor-owned spell list. */
  static async #onOpenActor() {
    const actorId = this.selectedList?.document?.flags?.[MODULE.ID]?.actorId;
    const actor = actorId ? game.actors.get(actorId) : null;
    if (actor) await actor.sheet.render(true);
  }

  /** Open the class item sheet for the selected list's identifier. */
  static async #onOpenClass() {
    if (!this.selectedList) return;
    const identifier = this.selectedList.document.system?.identifier;
    if (!identifier) return;
    let meta = this.availableLists.find((l) => l.uuid === this.selectedList.uuid);
    if (!meta || (meta.isCustom && this.selectedList.document.flags?.[MODULE.ID]?.originalUuid)) {
      const originalUuid = this.selectedList.document.flags?.[MODULE.ID]?.originalUuid;
      if (originalUuid) meta = this.availableLists.find((l) => l.uuid === originalUuid);
    }
    if (!meta) return;
    const classItem = await this._findClassInTopLevelFolder(identifier, meta.pack);
    if (classItem) await classItem.sheet.render(true);
  }

  /** Open the details customization dialog. */
  static #onOpenCustomization() {
    new DetailsCustomization().render({ force: true, ...detachedRenderOptions(this) });
  }

  /**
   * Toggle a spell-level header collapsed state and persist to user flags.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The spell level header element
   */
  static async #onToggleSpellHeader(_event, target) {
    const container = target.closest('.spell-level');
    if (!container?.dataset?.level) return;
    const isCollapsed = await this._toggleUserFlagArray(FLAGS.GM_COLLAPSED_LEVELS, container.dataset.level);
    container.classList.toggle('collapsed', isCollapsed);
  }

  /**
   * Enter edit mode for the selected list.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The capturing element
   * @returns {Promise<void>} Resolves after the controller finishes
   */
  /**
   * Save pending edits for the current list.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The capturing element
   * @returns {Promise<void>} Resolves after the controller finishes
   */
  static #onSaveList(event, target) {
    return EditingController.saveEdits(this, event, target);
  }

  /**
   * Add a spell to the editing list.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The spell row element
   * @returns {void}
   */
  static #onAddSpell(event, target) {
    return EditingController.addSpell(this, event, target);
  }

  /**
   * Remove a spell from the editing list.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The spell row element
   * @returns {void}
   */
  static #onRemoveSpell(event, target) {
    return EditingController.removeSpell(this, event, target);
  }

  /**
   * Restore a custom list to its original state.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The capturing element
   * @returns {Promise<void>} Resolves after the controller finishes
   */
  static #onRestoreList(event, target) {
    return EditingController.restoreOriginal(this, event, target);
  }

  /**
   * Rename the currently selected list via dialog.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The capturing element
   * @returns {Promise<void>} Resolves after the controller finishes
   */
  static #onRenameList(event, target) {
    return EditingController.renameList(this, event, target);
  }

  /**
   * Toggle the selected list's registry enrollment.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The checkbox element
   * @returns {Promise<void>} Resolves after the controller finishes
   */
  static #onRegisterList(event, target) {
    return EditingController.toggleRegistry(this, event, target);
  }

  /**
   * Toggle a spell in/out of the comparison set.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The compare icon element
   * @returns {void}
   */
  static #onCompareSpell(event, target) {
    return EditingController.compareSpell(this, event, target);
  }

  /**
   * Toggle bulk selection mode on/off.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The capturing element
   * @returns {void}
   */
  static #onToggleSelectionMode(event, target) {
    return EditingController.toggleSelectionMode(this, event, target);
  }

  /**
   * Bulk select or deselect all visible spells of a type.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The select-all checkbox
   * @returns {void}
   */
  static #onSelectAll(event, target) {
    return EditingController.selectAll(this, event, target);
  }

  /**
   * Apply all pending bulk additions/removals at once.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The bulk save button
   * @returns {Promise<void>} Resolves after the controller finishes
   */
  static #onBulkSave(event, target) {
    return EditingController.bulkSave(this, event, target);
  }

  /**
   * Cancel the current bulk selection without applying.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The capturing element
   * @returns {void}
   */
  static #onCancelSelection(event, target) {
    return EditingController.cancelSelection(this, event, target);
  }

  /**
   * Open the create-new-list dialog.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The capturing element
   * @returns {Promise<void>} Resolves after the controller finishes
   */
  static #onCreateList(event, target) {
    return CreationController.createList(this, event, target);
  }

  /**
   * Open the merge-lists dialog.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The capturing element
   * @returns {Promise<void>} Resolves after the controller finishes
   */
  static #onMergeLists(event, target) {
    return CreationController.mergeLists(this, event, target);
  }

  /**
   * Delete the currently selected custom list.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The capturing element
   * @returns {Promise<void>} Resolves after the controller finishes
   */
  static #onDeleteList(event, target) {
    return DeletionController.deleteList(this, event, target);
  }
}

/** Sub-controller for editing-mode actions. Internal to this module. */
class EditingController {
  /**
   * Enter edit mode for the selected list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async enterEditMode(app) {
    if (!app.selectedList) return;
    app.pendingChanges = { added: new Set(), removed: new Set() };
    const flags = app.selectedList.document.flags?.[MODULE.ID] || {};
    const isCustom = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;
    const isActorSpellbook = !!flags.actorId;
    if (!isCustom && !isActorSpellbook) await this._duplicateForEditing(app);
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Save pending edits to the selected list document.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async saveEdits(app) {
    if (!app.selectedList) return;
    let doc = app.selectedList.document;
    const flags = doc.flags?.[MODULE.ID] || {};
    const isCustom = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList;
    const isActorSpellbook = !!flags.actorId;
    if (!isCustom && !isActorSpellbook) {
      const originalUuid = doc.uuid;
      await this._duplicateForEditing(app);
      doc = app.selectedList.document;
      const hidden = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
      if (!hidden.includes(originalUuid)) await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, [...hidden, originalUuid]);
    }
    const current = new Set(Array.from(doc.system.spells || []));
    for (const uuid of app.pendingChanges.added) current.add(uuid);
    for (const uuid of app.pendingChanges.removed) current.delete(uuid);
    await doc.update({ 'system.spells': Array.from(current) });
    await ensureListRegistered(doc.uuid);
    app.pendingChanges = { added: new Set(), removed: new Set() };
    app.availableLists = await findAllSpellLists();
    await app.selectSpellList(doc.uuid);
  }

  /**
   * Add a single spell to the editing list (from the [data-action=addSpell] row).
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The capturing element
   */
  static addSpell(app, eventOrUuid, target) {
    const uuid = typeof eventOrUuid === 'string' ? eventOrUuid : target?.closest('[data-uuid]')?.dataset?.uuid;
    if (!uuid || !app.selectedList) return;
    if (app.selectionMode) {
      const event = typeof eventOrUuid === 'object' ? eventOrUuid : null;
      EditingController._toggleSelection(app, 'add', uuid, target, event);
      app.render(false, { parts: ['content', 'footer'] });
      return;
    }
    if (app.selectedList.spellUuids.includes(uuid)) return;
    app.pendingChanges.added.add(uuid);
    app.pendingChanges.removed.delete(uuid);
    const spell = app.availableSpells.find((s) => s.uuid === uuid);
    if (!spell) return;
    const clone = foundry.utils.deepClone(spell);
    clone.compendiumUuid = uuid;
    if (!clone.enrichedIcon) clone.enrichedIcon = createSpellIconLink(clone);
    app.selectedList.spellUuids.push(uuid);
    app.selectedList.spells.push(clone);
    app.selectedList.spellsByLevel = app._organizeSpellsByLevel(app.selectedList.spells);
    app.render(false, { parts: ['content'] });
  }

  /**
   * Remove a single spell from the editing list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The capturing element
   */
  static removeSpell(app, eventOrUuid, target) {
    const uuid = typeof eventOrUuid === 'string' ? eventOrUuid : target?.closest('[data-uuid]')?.dataset?.uuid;
    if (!uuid || !app.selectedList) return;
    if (app.selectionMode) {
      const event = typeof eventOrUuid === 'object' ? eventOrUuid : null;
      EditingController._toggleSelection(app, 'remove', uuid, target, event);
      app.render(false, { parts: ['content', 'footer'] });
      return;
    }
    app.pendingChanges.removed.add(uuid);
    app.pendingChanges.added.delete(uuid);
    app.selectedList.spellUuids = app.selectedList.spellUuids.filter((u) => u !== uuid);
    app.selectedList.spells = app.selectedList.spells.filter((s) => s.uuid !== uuid && s.compendiumUuid !== uuid);
    app.selectedList.spellsByLevel = app._organizeSpellsByLevel(app.selectedList.spells);
    app.render(false, { parts: ['content'] });
  }

  /**
   * Restore a custom list to its original state.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async restoreOriginal(app) {
    if (!app.selectedList) return;
    const originalUuid = app.selectedList.document.flags?.[MODULE.ID]?.originalUuid;
    if (!originalUuid) return;
    const confirmed = await confirmDialog({
      title: _loc('SPELLMANAGER.Confirm.RestoreTitle'),
      content: _loc('SPELLMANAGER.Confirm.RestoreContent', { name: `<strong>${app.selectedList.name}</strong>` }),
      confirmLabel: _loc('SPELLMANAGER.Confirm.RestoreButton'),
      confirmIcon: 'fas fa-sync',
      confirmCssClass: 'dialog-button-warning',
      parent: app
    });
    if (!confirmed) return;
    const original = await fromUuid(originalUuid);
    if (!original) return;
    const originalSpells = Array.from(original.system.spells || []);
    await app.selectedList.document.update({
      'system.spells': originalSpells,
      [`flags.${MODULE.ID}.originalModTime`]: original._stats?.modifiedTime || 0,
      [`flags.${MODULE.ID}.originalVersion`]: original._stats?.systemVersion || game.system.version
    });
    app.selectedList.spellUuids = originalSpells;
    await app._loadSelectedSpellDetails(originalSpells);
  }

  /**
   * Rename a custom/merged spell list via dialog.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async renameList(app) {
    if (!app.selectedList) return;
    const flags = app.selectedList.document.flags?.[MODULE.ID] || {};
    const isRenameable = !!flags.isDuplicate || !!flags.isCustom || !!flags.isNewList || !!app.selectedList.isMerged;
    if (!isRenameable) return;
    const currentName = app.selectedList.name;
    const content = await renderTemplate(TEMPLATES.DIALOGS.RENAME_SPELL_LIST, { currentName });
    let newName = null;
    const result = await DialogV2.wait({
      window: { title: _loc('SPELLMANAGER.Rename.Title', { currentName }), icon: 'fas fa-pen' },
      classes: ['spell-book', 'rename-spell-list-dialog'],
      content,
      position: { width: 'auto', height: 'auto' },
      renderOptions: detachedRenderOptions(app),
      buttons: [
        {
          label: _loc('SPELLMANAGER.Buttons.Rename'),
          icon: 'fas fa-check',
          action: 'rename',
          callback: (_event, _target, form) => {
            const el = form?.querySelector ? form : form.element;
            const value = el.querySelector('[name="newName"]')?.value?.trim();
            if (!value || value === currentName || this._isDuplicateName(app, value)) return false;
            newName = value;
            return 'rename';
          }
        },
        { label: _loc('COMMON.Cancel'), icon: 'fas fa-times', action: 'cancel' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    if (result !== 'rename' || !newName) return;
    const doc = app.selectedList.document;
    if (doc.parent && doc.parent.pages.size === 1) await doc.parent.update({ name: newName });
    await doc.update({ name: newName });
    app.selectedList.name = newName;
    await app._refreshLists();
    await app.selectSpellList(doc.uuid);
  }

  /**
   * Check whether a proposed name already exists (excluding the current list).
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {string} name - Proposed name to check
   * @returns {boolean} True if another list already has this name
   * @private
   */
  static _isDuplicateName(app, name) {
    const lower = name.toLowerCase();
    return app.availableLists.some((l) => l.name.toLowerCase() === lower && l.uuid !== app.selectedList?.uuid);
  }

  /**
   * Toggle the selected list's registry enrollment.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The registry checkbox element
   */
  static async toggleRegistry(app, event, target) {
    event.preventDefault();
    event.stopPropagation();
    if (!app.selectedList) return;
    const newState = await toggleListForRegistry(app.selectedList.uuid);
    target.checked = newState;
  }

  /**
   * Toggle a spell into/out of the comparison set.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The capturing element
   */
  static async compareSpell(app, _event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    if (app.comparisonSet.has(uuid)) app.comparisonSet.delete(uuid);
    else app.comparisonSet.add(uuid);
    log(3, `[compare] toggled uuid=${uuid} size=${app.comparisonSet.size} dialogExists=${!!app.comparisonDialog}`);
    try {
      if (app.comparisonSet.size >= 2) {
        if (!app.comparisonDialog) {
          log(3, '[compare] opening new SpellComparison dialog');
          app.comparisonDialog = new SpellComparison({
            spellUuids: Array.from(app.comparisonSet),
            onClose: () => {
              app.comparisonDialog = null;
              app.comparisonSet.clear();
              app.render(false, { parts: ['content'] });
            }
          });
          await app.comparisonDialog.render({ force: true, ...detachedRenderOptions(app) });
          log(3, '[compare] SpellComparison rendered');
        } else {
          app.comparisonDialog.spellUuids = Array.from(app.comparisonSet);
          await app.comparisonDialog.render({ force: false, ...detachedRenderOptions(app) });
          app.comparisonDialog.bringToFront();
        }
      } else if (app.comparisonDialog && app.comparisonSet.size < 2) {
        await app.comparisonDialog.close();
        app.comparisonDialog = null;
      }
    } catch (err) {
      log(1, '[compare] failed', err);
      ui.notifications.error(`Spell comparison failed: ${err.message}`);
    }
    app.render(false, { parts: ['content'] });
  }

  /**
   * Toggle bulk selection mode.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static toggleSelectionMode(app) {
    app.selectionMode = !app.selectionMode;
    if (!app.selectionMode) app._clearSelections();
    else {
      app.selectedToAdd.clear();
      app.selectedToRemove.clear();
      app.lastSelectedIndex = { add: -1, remove: -1 };
    }
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Toggle a spell's selection, with shift-click range support against the last clicked item.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {'add'|'remove'} type - Which selection set to operate on
   * @param {string} uuid - Clicked spell uuid
   * @param {HTMLElement} [target] - Clicked DOM element (button or item)
   * @param {Event} [event] - Originating click event (for shiftKey detection)
   * @private
   */
  static _toggleSelection(app, type, uuid, target, event) {
    const set = type === 'add' ? app.selectedToAdd : app.selectedToRemove;
    const panel = target?.closest(type === 'add' ? '.available-spells-panel' : '.current-list-panel');
    const items = panel ? Array.from(panel.querySelectorAll('.spell-item[data-uuid]')) : [];
    const clickedIdx = items.findIndex((li) => li.dataset.uuid === uuid);
    const lastIdx = app.lastSelectedIndex?.[type] ?? -1;
    if (event?.shiftKey && lastIdx >= 0 && clickedIdx >= 0 && lastIdx < items.length) {
      const shouldSelect = !set.has(uuid);
      const [lo, hi] = clickedIdx < lastIdx ? [clickedIdx, lastIdx] : [lastIdx, clickedIdx];
      for (let i = lo; i <= hi; i++) {
        const id = items[i]?.dataset?.uuid;
        if (!id) continue;
        if (shouldSelect) set.add(id);
        else set.delete(id);
      }
    } else if (set.has(uuid)) set.delete(uuid);
    else set.add(uuid);
    if (clickedIdx >= 0) app.lastSelectedIndex[type] = clickedIdx;
  }

  /**
   * Bulk select all visible spells of a given type.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The capturing element
   */
  static selectAll(app, _event, target) {
    if (app.isSelectingAll) return;
    app.isSelectingAll = true;
    const type = target.dataset.type;
    if (type === 'add') {
      const visible = app._filterAvailableSpells().spells;
      for (const spell of visible) {
        if (target.checked) app.selectedToAdd.add(spell.uuid);
        else app.selectedToAdd.delete(spell.uuid);
      }
    } else if (type === 'remove') {
      const current = app.selectedList?.spells || [];
      for (const spell of current) {
        const uuid = spell.uuid || spell.compendiumUuid;
        if (target.checked) app.selectedToRemove.add(uuid);
        else app.selectedToRemove.delete(uuid);
      }
    }
    app.isSelectingAll = false;
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Apply all pending bulk additions/removals at once.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async bulkSave(app) {
    const addCount = app.selectedToAdd.size;
    const removeCount = app.selectedToRemove.size;
    const total = addCount + removeCount;
    if (total === 0 || !app.selectedList || !app.selectedList) return;
    let msg = '';
    if (addCount > 0 && removeCount > 0) msg = _loc('SPELLMANAGER.BulkOps.ConfirmAddAndRemove', { addCount, removeCount });
    else if (addCount > 0) msg = _loc('SPELLMANAGER.BulkOps.ConfirmAdd', { count: addCount });
    else msg = _loc('SPELLMANAGER.BulkOps.ConfirmRemove', { count: removeCount });
    const confirmed = await confirmDialog({
      title: _loc('SPELLMANAGER.BulkOps.ConfirmSave'),
      content: msg,
      confirmLabel: _loc('SPELLMANAGER.BulkOps.SaveChanges'),
      confirmIcon: 'fas fa-save',
      confirmCssClass: 'dialog-button-success',
      parent: app
    });
    if (!confirmed) return;
    for (const uuid of app.selectedToRemove) {
      app.pendingChanges.removed.add(uuid);
      app.pendingChanges.added.delete(uuid);
      app.selectedList.spellUuids = app.selectedList.spellUuids.filter((u) => u !== uuid);
      app.selectedList.spells = app.selectedList.spells.filter((s) => s.uuid !== uuid && s.compendiumUuid !== uuid);
    }
    for (const uuid of app.selectedToAdd) {
      app.pendingChanges.added.add(uuid);
      app.pendingChanges.removed.delete(uuid);
      const spell = app.availableSpells.find((s) => s.uuid === uuid);
      if (!spell) continue;
      const clone = foundry.utils.deepClone(spell);
      clone.compendiumUuid = uuid;
      if (!clone.enrichedIcon) clone.enrichedIcon = createSpellIconLink(clone);
      app.selectedList.spellUuids.push(uuid);
      app.selectedList.spells.push(clone);
    }
    app.selectedList.spellsByLevel = app._organizeSpellsByLevel(app.selectedList.spells);
    app._clearSelections();
    ui.notifications.info(_loc('SPELLMANAGER.BulkOps.Completed', { count: total }));
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Cancel the current bulk selection without applying.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static cancelSelection(app) {
    app._clearSelections();
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Duplicate the currently-selected standard list so it can be edited.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @private
   */
  static async _duplicateForEditing(app) {
    app._clearSelections();
    let originalSource = '';
    if (app.selectedList.document.pack) originalSource = app.selectedList.document.pack.split('.')[0];
    const duplicate = await duplicateSpellList(app.selectedList.document);
    if (!duplicate) return;
    const { spells, spellsByLevel, spellUuids } = app.selectedList;
    app.selectedList = { document: duplicate, uuid: duplicate.uuid, name: duplicate.name, spellUuids, spells, spellsByLevel, isLoadingSpells: false };
    if (originalSource) app.filterState.source = originalSource;
  }
}

/** Sub-controller for list creation and merging. Internal to this module. */
class CreationController {
  /**
   * Open the "create new list" dialog and create the list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async createList(app) {
    const identifierOptions = await this._getClassIdentifierOptions();
    const content = await renderTemplate(TEMPLATES.DIALOGS.CREATE_SPELL_LIST, { identifierOptions });
    let formData = null;
    const result = await DialogV2.wait({
      window: { title: _loc('SPELLMANAGER.Buttons.CreateNew'), icon: 'fas fa-plus', resizable: false, minimizable: false },
      classes: ['spell-book', 'create-spell-list-dialog'],
      position: { width: 650, height: 'auto' },
      content,
      renderOptions: detachedRenderOptions(app),
      render: (_event, dialog) => {
        const identifierSelect = dialog.element.querySelector('[name="identifier"]');
        const customInput = dialog.element.querySelector('[name="customIdentifier"]');
        if (!identifierSelect || !customInput) return;
        const sync = () => {
          customInput.disabled = identifierSelect.value !== 'custom';
        };
        identifierSelect.addEventListener('change', sync);
        sync();
      },
      buttons: [
        {
          label: _loc('SPELLMANAGER.Buttons.CreateNew'),
          icon: 'fas fa-check',
          action: 'create',
          callback: (_event, _target, form) => {
            const el = form?.querySelector ? form : form.element;
            const name = el.querySelector('[name="name"]')?.value?.trim();
            const identifierSelect = el.querySelector('[name="identifier"]');
            const customInput = el.querySelector('[name="customIdentifier"]');
            const isSubclass = !!el.querySelector('[name="is-subclass"]')?.checked;
            if (!identifierSelect) return false;
            let identifier = identifierSelect.value;
            let defaultName = '';
            if (identifier === 'custom') {
              identifier = customInput?.value || '';
              if (!/^[\d_a-z-]+$/.test(identifier)) return false;
              defaultName = identifier.charAt(0).toUpperCase() + identifier.slice(1);
            } else {
              const opt = identifierOptions.find((o) => o.id === identifier);
              if (opt) defaultName = opt.plainName;
            }
            const finalName = name || defaultName;
            if (!finalName || !identifier) return false;
            formData = { name: finalName, identifier, isSubclass };
            return 'create';
          }
        },
        { label: _loc('COMMON.Cancel'), icon: 'fas fa-times', action: 'cancel' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    if (result !== 'create' || !formData) return;
    const newList = await createNewSpellList(formData.name, formData.identifier, formData.isSubclass ? 'subclass' : 'class');
    if (!newList) return;
    await app._refreshLists();
    await app.selectSpellList(newList.uuid);
  }

  /**
   * Open the "merge lists" dialog and create a merged list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async mergeLists(app) {
    if (app.availableLists.length < 2) return;
    const content = await renderTemplate(TEMPLATES.DIALOGS.MERGE_SPELL_LISTS, { lists: this._getMergeCandidates(app) });
    let formData = null;
    const result = await DialogV2.wait({
      window: { title: _loc('SPELLMANAGER.MergeLists.DialogTitle'), icon: 'fas fa-code-merge', resizable: false, minimizable: false },
      classes: ['spell-book', 'merge-spell-lists-dialog'],
      position: { width: 650, height: 'auto' },
      content,
      renderOptions: detachedRenderOptions(app),
      buttons: [
        {
          label: _loc('SPELLMANAGER.Buttons.MergeLists'),
          icon: 'fas fa-code-merge',
          action: 'merge',
          callback: (_event, _target, form) => {
            const el = form?.querySelector ? form : form.element;
            const multi = el.querySelector('[name="spellListsToMerge"]');
            const nameInput = el.querySelector('[name="mergedListName"]');
            const hideSource = !!el.querySelector('[name="hideSourceLists"]')?.checked;
            const uuids = Array.isArray(multi?.value) ? multi.value : [];
            const name = nameInput?.value?.trim();
            if (uuids.length < 2 || !name) return false;
            formData = { spellListUuids: uuids, mergedListName: name, hideSourceLists: hideSource };
            return 'merge';
          }
        },
        { label: _loc('COMMON.Cancel'), icon: 'fas fa-times', action: 'cancel' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    if (result !== 'merge' || !formData) return;
    const merged = await createMergedSpellList(formData.spellListUuids, formData.mergedListName);
    if (!merged) return;
    if (formData.hideSourceLists) {
      const hidden = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
      const toHide = formData.spellListUuids.filter((uuid) => {
        const src = app.availableLists.find((l) => l.uuid === uuid);
        return src && !src.isActorOwned && !hidden.includes(uuid);
      });
      if (toHide.length) await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, [...hidden, ...toHide]);
    }
    await app._refreshLists();
    await app.selectSpellList(merged.uuid);
  }

  /**
   * Produce class identifier options for the create-list dialog.
   * @returns {Promise<object[]>} [{ id, name, plainName }]
   * @private
   */
  static async _getClassIdentifierOptions() {
    const options = [];
    const seen = new Set();
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');
    for (const pack of itemPacks) {
      try {
        const index = await pack.getIndex({ fields: ['type', 'system.identifier'] });
        for (const entry of index) {
          if (entry.type !== 'class' || !entry.system?.identifier) continue;
          const id = entry.system.identifier.toLowerCase();
          if (seen.has(id)) continue;
          seen.add(id);
          options.push({ id, name: entry.name, plainName: entry.name });
        }
      } catch (err) {
        log(2, `Error indexing ${pack.collection}: ${err.message}`);
      }
    }
    for (const opt of findSpellListsByType('class')) {
      const id = opt.value?.split(':')[1]?.toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const label = opt.label || id;
      options.push({ id, name: label, plainName: label });
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Build grouped merge candidates for the merge dialog.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @returns {object} { standard, custom, merged, actorOwned }
   * @private
   */
  static _getMergeCandidates(app) {
    const hidden = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const visible = (list) => !hidden.includes(list.uuid);
    return {
      standard: app.availableLists.filter((l) => !l.isActorOwned && !l.isCustom && !l.isMerged && visible(l)),
      custom: app.availableLists.filter((l) => !l.isActorOwned && !l.isMerged && l.isCustom && visible(l)),
      merged: app.availableLists.filter((l) => !l.isActorOwned && l.isMerged && visible(l)),
      actorOwned: app.availableLists.filter((l) => l.isActorOwned && visible(l))
    };
  }
}

/** Sub-controller for list deletion. Internal to this module. */
class DeletionController {
  /**
   * Confirm and delete the currently selected custom list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async deleteList(app) {
    if (!app.selectedList) return;
    const uuid = app.selectedList.uuid;
    const name = app.selectedList.name;
    const confirmed = await confirmDialog({
      title: _loc('SPELLMANAGER.Confirm.DeleteTitle'),
      content: _loc('SPELLMANAGER.Confirm.DeleteContent', { name: `<strong>${name}</strong>` }),
      confirmLabel: _loc('SPELLMANAGER.Confirm.DeleteButton'),
      confirmIcon: 'fas fa-trash',
      confirmCssClass: 'dialog-button-danger',
      parent: app
    });
    if (!confirmed) return;
    await removeCustomSpellList(uuid);
    app.selectedList = null;
    app.sidebarMode = 'lists';
    app.filterState = { ...DEFAULT_FILTER_STATE };
    app._filteredAll = [];
    app._batchIndex = 0;
    await app._refreshLists();
    app.render(false, { parts: ['sidebar', 'content', 'footer'] });
  }
}
