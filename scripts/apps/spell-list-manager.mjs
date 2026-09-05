import { DEBOUNCE_DELAY, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import {
  compareListVersions,
  fetchAllSpells,
  findAllSpellLists,
  findDuplicateSpellList,
  formatActivationLabel,
  getClassPacks,
  getPackTopLevelFolderName,
  getValidCustomListMappings,
  isListEnabledForRegistry,
  isSourceHiddenSpellList
} from '../data/_module.mjs';
import { DetailsCustomization, SpellComparison } from '../dialogs/_module.mjs';
import { buildGMMetadata, createSpellIconLink, detachedRenderOptions, extractSpellFilterData, getEnabledGMElements, processSpellListForDisplay } from '../ui/_module.mjs';
import { CreationController } from './spell-list-creation.mjs';
import { DeletionController } from './spell-list-deletion.mjs';
import { EditingController } from './spell-list-editing.mjs';
import { DEFAULT_FILTER_STATE, DROPDOWN_FILTERS } from './spell-list-filters.mjs';
const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

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
    window: { frame: false, positioned: true, title: 'SPELLBOOK.Manager.Application.Title' },
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
    content: { template: TEMPLATES.APPS.SPELL_LIST_MANAGER.LIST_CONTENT, scrollable: ['.available-spells-panel .panel-scroll', '.current-list-panel .panel-scroll'] },
    footer: { template: TEMPLATES.APPS.SPELL_LIST_MANAGER.FOOTER }
  };

  /** @type {number} Number of available spells to mount into the DOM per batch. */
  static BATCH_SIZE = 50;

  /** @type {number} Pixels from the bottom of the scroll container that trigger the next batch. */
  static SCROLL_MARGIN = 100;

  /** @type {number} Upper bound on rows carried across a content re-render. */
  static MAX_CARRIED_ROWS = 500;

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

  /** @type {string} Serialized filter state the current batch index belongs to. */
  _filterSignature = '';

  /** @type {number} How many filtered spells have been mounted into the DOM so far. */
  _batchIndex = 0;

  /** @type {boolean} Reentrancy guard for select-all processing. */
  isSelectingAll = false;

  /** @type {number|undefined} Debounce handle for the name filter input */
  #nameFilterTimer;

  /** @type {number|undefined} Debounce handle for the dropdown filters */
  #dropdownFilterTimer;

  /** @type {number|undefined} Debounce handle for the range filters */
  #rangeFilterTimer;

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
      await this.#loadData();
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
    if (this.availableLists.length) this.#organizeSidebarLists(context);
    const mappings = await getValidCustomListMappings();
    context.customListMap = mappings;
    if (this.selectedList) {
      this.#addSelectedListContext(context);
      if (this.availableSpells.length) await this.#addEditingContext(context);
    }
    if (this.sidebarMode === 'filters') context.filterFormElements = this.#buildFilterFormData();
    context.detached = options.window?.attach ? false : options.window?.detach ? true : !!this.window.windowId;
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#enableDragging();
    this.#setupFilterListeners();
    this.#setupMultiSelectListeners();
    this.#setupDragDrop();
    this.#setupLazyScroll();
    this.#applyCollapsedLevels();
    this.#applyCollapsedFolders();
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

  /** Enable drag-to-move via the header strip and resize via a corner handle. Re-wires on every render since PART DOM is replaced. */
  #enableDragging() {
    const handle = this.element?.querySelector('.spell-book-header');
    if (!handle || handle.dataset.dragWired === '1') return;
    handle.dataset.dragWired = '1';
    this.#ensureResizeHandle();
    const drag = new foundry.applications.ux.Draggable.implementation(this, this.element, handle, { selector: '.spell-book-resize-handle' });
    const originalMouseDown = drag._onDragMouseDown.bind(drag);
    drag._onDragMouseDown = (event) => {
      if (event.target.closest('button, a, input, select, [data-action], .spell-book-resize-handle')) return;
      originalMouseDown(event);
    };
    const originalResizeUp = drag._onResizeMouseUp.bind(drag);
    drag._onResizeMouseUp = (event) => {
      originalResizeUp(event);
      const { left, top, width, height } = this.position;
      game.settings.set(MODULE.ID, SETTINGS.SPELL_LIST_MANAGER_POSITION, { left, top, width, height });
    };
  }

  /** No-op shim for Foundry Draggable, which calls `app._onResize` after a resize drag ends. */
  _onResize() {}

  /** Inject the resize handle into the app root once. Idempotent across re-renders. */
  #ensureResizeHandle() {
    if (!this.element || this.element.querySelector(':scope > .spell-book-resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'spell-book-resize-handle';
    handle.setAttribute('aria-label', _loc('ATLAS.Common.Resize'));
    this.element.appendChild(handle);
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
  #setupLazyScroll() {
    const scroll = this.element.querySelector('.available-spells-panel .panel-scroll');
    if (!scroll) return;
    scroll.addEventListener('scroll', this.#onScrollAvailableSpells.bind(this), { passive: true });
  }

  /**
   * Load the next batch of filtered spells into the DOM when near the bottom.
   * @param {Event} event - Scroll event
   * @private
   */
  #onScrollAvailableSpells(event) {
    if (this._batchIndex >= this._filteredAll.length) return;
    const { scrollTop, scrollHeight, clientHeight } = event.target;
    if (scrollTop + clientHeight < scrollHeight - SpellListManager.SCROLL_MARGIN) return;
    const next = this._filteredAll.slice(this._batchIndex, this._batchIndex + SpellListManager.BATCH_SIZE);
    const list = this.element.querySelector('.available-spells-panel .spell-list-items');
    if (!next.length || !list) return;
    this._batchIndex += next.length;
    list.insertAdjacentHTML('beforeend', next.map((spell) => this.#buildAvailableSpellRow(this.#enrichSpellForDisplay(spell))).join(''));
  }

  /**
   * Build the HTML for a single available-spell row. Mirrors the template markup.
   * @param {object} spell - Enriched spell (with `isSelectedForAdd`, etc.)
   * @returns {string} HTML string
   * @private
   */
  #buildAvailableSpellRow(spell) {
    const classes = ['spell-item', 'available'];
    if (this.selectionMode) classes.push('selectable');
    if (spell.isSelectedForAdd) classes.push('selected');
    const nameEscaped = foundry.utils.escapeHTML(spell.name);
    const addTooltip = foundry.utils.escapeHTML(_loc('SPELLBOOK.Manager.Buttons.AddSpell', { name: spell.name }));
    let compareIcon = '';
    if (spell.showCompare) {
      const compareTooltip = foundry.utils.escapeHTML(_loc('SPELLBOOK.Comparison.CompareSpell', { name: spell.name }));
      const activeClass = spell.isInComparison ? ' active' : '';
      compareIcon = `<i class="fa-solid fa-scale-balanced spell-compare-icon${activeClass}" data-action="compareSpell" data-uuid="${spell.uuid}" data-tooltip="${compareTooltip}" aria-label="${compareTooltip}"></i>`;
    }
    const selectable = this.selectionMode;
    const btnClass = selectable ? 'add-spell select-toggle' : 'add-spell';
    const iconHtml = selectable ? `<i class="fas fa-${spell.isSelectedForAdd ? 'check-square' : 'square'}" aria-hidden="true"></i>` : `<i class="fas fa-plus" aria-hidden="true"></i>`;
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
    const { top, left, width, height } = this.position;
    game.settings.set(MODULE.ID, SETTINGS.SPELL_LIST_MANAGER_POSITION, { top, left, width, height });
    return super._onClose(options);
  }

  /** Re-read enabled elements, invalidate cached metadata, and re-render content/sidebar. */
  async refreshDisplay() {
    this.enabledElements = getEnabledGMElements();
    for (const spell of this.availableSpells) delete spell.formattedDetails;
    this.render(false, { parts: ['content', 'sidebar', 'footer'] });
  }

  /** Load all spell lists and available spells on first render. */
  async #loadData() {
    this.enabledElements = getEnabledGMElements();
    const progress = ui.notifications.info('SPELLBOOK.Manager.Loading.Spells', { localize: true, progress: true, console: false });
    const ESTIMATE = 1500;
    try {
      this.availableLists = await findAllSpellLists();
      this.classFolderCache = await this.#buildClassFolderCache();
      for (const list of this.availableLists) {
        list.isSubclass = list.document?.system?.type === 'subclass';
        list.icon = list.isSubclass ? 'fas fa-shield' : 'fas fa-book';
      }
      this.availableLists.sort((a, b) => a.name.localeCompare(b.name));
      this.availableSpells = await fetchAllSpells({
        onProgress: (_pack, count) => progress.update({ pct: Math.min(count / ESTIMATE, 1) })
      });
      progress.update({ pct: 1 });
      ATLAS.log(3, `SpellListManager loaded ${this.availableLists.length} lists, ${this.availableSpells.length} spells`);
    } catch (err) {
      ATLAS.log(1, 'SpellListManager load failed:', err);
      progress.update({ pct: 1, message: 'SPELLBOOK.Manager.Loading.Failed', localize: true });
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
  async #buildClassFolderCache() {
    const cache = new Map();
    const classPacks = getClassPacks();
    for (const pack of classPacks) {
      const topLevelFolder = getPackTopLevelFolderName(pack);
      if (!topLevelFolder) continue;
      try {
        const index = await pack.getIndex({ fields: ['type', 'system.identifier'] });
        for (const entry of index) if ((entry.type === 'class' || entry.type === 'subclass') && entry.system?.identifier) cache.set(`${topLevelFolder}:${entry.system.identifier.toLowerCase()}`, true);
      } catch (err) {
        ATLAS.log(2, `Error indexing pack "${pack.collection}" for class cache`, err);
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
  async #findClassInTopLevelFolder(identifier, topLevelFolderName) {
    const key = `${topLevelFolderName}:${identifier.toLowerCase()}`;
    if (this.classFolderCache && !this.classFolderCache.has(key)) return null;
    const classPacks = getClassPacks();
    for (const pack of classPacks) {
      const packTopLevelFolder = getPackTopLevelFolderName(pack);
      if (packTopLevelFolder !== topLevelFolderName) continue;
      try {
        const index = await pack.getIndex({ fields: ['type', 'system.identifier'] });
        const entry = index.find((e) => (e.type === 'class' || e.type === 'subclass') && e.system?.identifier?.toLowerCase() === identifier.toLowerCase());
        if (entry) return await pack.getDocument(entry._id);
      } catch (err) {
        ATLAS.log(2, `Error indexing pack "${pack.collection}"`, err);
      }
    }
    return null;
  }

  /**
   * Organize the sidebar list categories into the context.
   * @param {object} context - Context object to mutate
   * @private
   */
  #organizeSidebarLists(context) {
    const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const actorOwned = this.availableLists.filter((l) => l.isActorOwned);
    const hidden = this.availableLists.filter((l) => !l.isActorOwned && hiddenLists.includes(l.uuid));
    const modified = this.availableLists.filter((l) => !l.isActorOwned && l.isModified && !hiddenLists.includes(l.uuid));
    const merged = this.availableLists.filter((l) => !l.isActorOwned && l.isMerged && !hiddenLists.includes(l.uuid));
    const custom = this.availableLists.filter((l) => !l.isActorOwned && l.isCustom && !hiddenLists.includes(l.uuid));
    const sourceConfig = game.settings.get('dnd5e', 'packSourceConfiguration') ?? {};
    const allStandard = this.availableLists.filter((l) => !l.isActorOwned && !l.isCustom && !l.isMerged && !l.isModified && !hiddenLists.includes(l.uuid));
    const standard = allStandard.filter((l) => !isSourceHiddenSpellList(l.system?.spells, false, sourceConfig));
    const sourceHiddenCount = allStandard.length - standard.length;
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
    context.visibleSpellListsCount = this.availableLists.length - hiddenLists.length - sourceHiddenCount;
    context.hiddenSpellListsCount = hidden.length;
    context.sourceHiddenCount = sourceHiddenCount;
    context.hiddenListUuids = hiddenLists;
    context.availableSpellLists = this.availableLists;
  }

  /**
   * Enrich the selected list for display (status flags, renameable, comparison).
   * @param {object} context - Context object to mutate
   * @private
   */
  #addSelectedListContext(context) {
    const processed = processSpellListForDisplay(this.selectedList, this.classFolderCache, this.availableLists, this.enabledElements);
    const flags = this.selectedList.document.flags?.[MODULE.ID] || {};
    processed.isRenameable = !!flags.kind;
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
    if (processed.spellsByLevel) processed.spellsByLevel = processed.spellsByLevel.map((level) => ({ ...level, spells: level.spells.map((spell) => this.#decorateSpellForSelectedList(spell)) }));
    context.selectedList = processed;
  }

  /**
   * Decorate a selected-list spell with comparison/selection state.
   * @param {object} spell - Processed spell
   * @returns {object} Spell copy with comparison/removal flags set
   * @private
   */
  #decorateSpellForSelectedList(spell) {
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
  async #addEditingContext(context) {
    const flags = this.selectedList.document.flags?.[MODULE.ID] || {};
    context.isCustomList = !!flags.kind;
    if (context.isCustomList && flags.originalUuid) {
      context.originalUuid = flags.originalUuid;
      context.compareInfo = await compareListVersions(flags.originalUuid, this.selectedList.document.uuid);
    }
    const filtered = this._filterAvailableSpells();
    const signature = JSON.stringify(this.filterState);
    const carried = signature === this._filterSignature ? Math.min(this._batchIndex, SpellListManager.MAX_CARRIED_ROWS) : 0;
    this._filterSignature = signature;
    this._filteredAll = filtered.spells;
    this._batchIndex = Math.min(Math.max(carried, SpellListManager.BATCH_SIZE), filtered.spells.length);
    const firstBatch = filtered.spells.slice(0, this._batchIndex).map((spell) => this.#enrichSpellForDisplay(spell));
    context.filteredSpells = { spells: firstBatch, totalFiltered: filtered.totalFiltered };
  }

  /**
   * Build the render-time view for a single available spell. Caches expensive fields on the spell.
   * @param {object} spell - Raw index entry from `this.availableSpells`
   * @returns {object} Spread copy with enrichedIcon, formattedDetails, isSelectedForAdd, etc.
   * @private
   */
  #enrichSpellForDisplay(spell) {
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
  #buildFilterFormData() {
    const disabled = false;
    const f = this.filterState;
    return {
      search: {
        name: 'spell-search',
        id: 'spell-search',
        type: 'text',
        value: f.name || '',
        placeholder: 'SPELLBOOK.Manager.Filters.SearchPlaceholder',
        ariaLabel: 'SPELLBOOK.Manager.Filters.SearchPlaceholder',
        disabled
      },
      level: { name: 'spell-level', id: 'spell-level', type: 'select', label: 'DND5E.SpellLevel', ariaLabel: 'DND5E.SpellLevel', options: this.#buildLevelOptions(f.level), disabled },
      school: {
        name: 'spell-school',
        id: 'spell-school',
        type: 'select',
        label: 'DND5E.School',
        ariaLabel: 'DND5E.School',
        options: this.#buildSchoolOptions(f.school),
        disabled
      },
      castingTime: {
        name: 'spell-castingTime',
        id: 'spell-castingTime',
        type: 'select',
        label: 'DND5E.SpellCastTime',
        ariaLabel: 'DND5E.SpellCastTime',
        options: this.#buildCastingTimeOptions(f.castingTime),
        disabled
      },
      damageType: {
        name: 'spell-damageType',
        id: 'spell-damageType',
        type: 'select',
        label: 'DND5E.DamageType',
        ariaLabel: 'DND5E.DamageType',
        options: this.#buildDamageTypeOptions(f.damageType),
        disabled
      },
      condition: {
        name: 'spell-condition',
        id: 'spell-condition',
        type: 'select',
        label: 'SPELLBOOK.Filters.Condition',
        ariaLabel: 'SPELLBOOK.Filters.Condition',
        options: this.#buildConditionOptions(f.condition),
        disabled
      },
      requiresSave: {
        name: 'spell-requiresSave',
        id: 'spell-requiresSave',
        type: 'select',
        label: 'SPELLBOOK.Filters.RequiresSave',
        ariaLabel: 'SPELLBOOK.Filters.RequiresSave',
        options: this.#buildBinaryOptions(f.requiresSave),
        disabled
      },
      concentration: {
        name: 'spell-concentration',
        id: 'spell-concentration',
        type: 'select',
        label: 'SPELLBOOK.Filters.RequiresConcentration',
        ariaLabel: 'SPELLBOOK.Filters.RequiresConcentration',
        options: this.#buildBinaryOptions(f.concentration),
        disabled
      },
      materialComponents: {
        name: 'spell-materialComponents',
        id: 'spell-materialComponents',
        type: 'select',
        label: 'SPELLBOOK.Filters.Materials.Title',
        ariaLabel: 'SPELLBOOK.Filters.Materials.Title',
        options: this.#buildMaterialOptions(f.materialComponents),
        disabled
      },
      ritual: { name: 'spell-ritual', id: 'spell-ritual', type: 'checkbox', label: 'SPELLBOOK.Filters.RitualOnly', ariaLabel: 'SPELLBOOK.Filters.RitualOnly', checked: !!f.ritual, disabled },
      minRange: {
        name: 'spell-min-range',
        id: 'spell-min-range',
        type: 'number',
        value: f.minRange || '',
        placeholder: 'ATLAS.Common.Min',
        ariaLabel: 'SPELLBOOK.Filters.RangeMinLabel',
        disabled
      },
      maxRange: {
        name: 'spell-max-range',
        id: 'spell-max-range',
        type: 'number',
        value: f.maxRange || '',
        placeholder: 'ATLAS.Common.Max',
        ariaLabel: 'SPELLBOOK.Filters.RangeMaxLabel',
        disabled
      },
      compendiumSource: {
        name: 'spell-compendium-source',
        id: 'spell-compendium-source',
        type: 'select',
        label: 'SPELLBOOK.Manager.Filters.CompendiumSource',
        ariaLabel: 'SPELLBOOK.Manager.Filters.CompendiumSource',
        options: this.#buildCompendiumSourceOptions(f.source),
        disabled
      },
      spellSource: {
        name: 'spell-source',
        id: 'spell-source',
        type: 'select',
        label: 'SPELLBOOK.Manager.Filters.SpellSource',
        ariaLabel: 'SPELLBOOK.Manager.Filters.SpellSource',
        options: this.#buildSpellSourceOptions(f.spellSource),
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
  #buildLevelOptions(selected) {
    const options = [{ value: '', label: _loc('SPELLBOOK.Manager.Filters.AllLevels'), selected: !selected }];
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
  #buildSchoolOptions(selected) {
    const options = [{ value: '', label: _loc('SPELLBOOK.Manager.Filters.AllSchools'), selected: !selected }];
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
  #buildCastingTimeOptions(selected) {
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
    const options = [{ value: '', label: _loc('ATLAS.Common.All'), selected: !selected }];
    for (const entry of sortable) {
      const label = formatActivationLabel(entry.type, entry.value);
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
  #buildDamageTypeOptions(selected) {
    const options = [{ value: '', label: _loc('ATLAS.Common.All'), selected: !selected }];
    const healingConfig = CONFIG.DND5E.healingTypes?.healing;
    const healingLabel = healingConfig?.labelShort ?? healingConfig?.label ?? _loc('DND5E.HEAL.Type.HealingShort');
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
  #buildConditionOptions(selected) {
    const options = [{ value: '', label: _loc('ATLAS.Common.All'), selected: !selected }];
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
  #buildBinaryOptions(selected) {
    return [
      { value: '', label: _loc('ATLAS.Common.All'), selected: !selected },
      { value: 'yes', label: _loc('ATLAS.Common.Yes'), selected: selected === 'yes' },
      { value: 'no', label: _loc('ATLAS.Common.No'), selected: selected === 'no' }
    ];
  }

  /**
   * Build material component filter options.
   * @param {string} selected - Currently selected value
   * @returns {object[]} Option list
   * @private
   */
  #buildMaterialOptions(selected) {
    return [
      { value: '', label: _loc('ATLAS.Common.All'), selected: !selected },
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
  #buildCompendiumSourceOptions(selected) {
    const sourceMap = new Map();
    sourceMap.set('all', { id: 'all', label: _loc('SPELLBOOK.Manager.Filters.AllSources') });
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
  #buildSpellSourceOptions(selected) {
    const sourceMap = new Map();
    sourceMap.set('all', { id: 'all', label: _loc('ATLAS.Common.All') });
    const noSourceLabel = _loc('SPELLBOOK.Manager.Filters.NoSource');
    for (const spell of this.availableSpells) {
      const resolved = SpellListManager.#resolveSpellSource(spell);
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
  static #resolveSpellSource(spell) {
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
      if (f.concentration === 'yes' && !hasProp('concentration')) return false;
      if (f.concentration === 'no' && hasProp('concentration')) return false;
      if (f.materialComponents === 'consumed' && !spell.system?.materials?.consumed) return false;
      if (f.materialComponents === 'notConsumed' && (!hasProp('material') || spell.system?.materials?.consumed)) return false;
      if (f.spellSource && f.spellSource !== 'all') {
        const src = SpellListManager.#resolveSpellSource(spell) || 'no-source';
        if (src !== f.spellSource) return false;
      }
      const rangeValue = Number(spell.system?.range?.value ?? 0);
      if (!Number.isNaN(minRange) && f.minRange !== '' && rangeValue < minRange) return false;
      if (!Number.isNaN(maxRange) && f.maxRange !== '' && rangeValue > maxRange) return false;
      if (f.damageType && !getFilterData(spell).damageTypes.includes(f.damageType)) return false;
      if (f.condition && !getFilterData(spell).conditions.includes(f.condition)) return false;
      if (f.requiresSave === 'yes' && !getFilterData(spell).requiresSave) return false;
      if (f.requiresSave === 'no' && getFilterData(spell).requiresSave) return false;
      return true;
    });
    return { spells, totalFiltered: spells.length };
  }

  /**
   * Reset filter state to defaults.
   * @private
   */
  #resetFilters() {
    this.filterState = { ...DEFAULT_FILTER_STATE };
    this.render(false, { parts: ['sidebar', 'content'] });
  }

  /**
   * Attach listeners to filter inputs.
   * @private
   */
  #setupFilterListeners() {
    if (this.sidebarMode !== 'filters') return;
    const nameInput = this.element.querySelector('input[name="spell-search"]');
    if (nameInput) {
      nameInput.addEventListener('input', (event) => {
        this.filterState.name = event.target.value;
        clearTimeout(this.#nameFilterTimer);
        this.#nameFilterTimer = setTimeout(() => this.render(false, { parts: ['content'] }), DEBOUNCE_DELAY);
      });
    }
    for (const { name, property } of DROPDOWN_FILTERS) {
      const el = this.element.querySelector(`select[name="${name}"]`);
      if (!el) continue;
      el.addEventListener('change', (event) => {
        if (this.filterState[property] === event.target.value) return;
        this.filterState[property] = event.target.value;
        clearTimeout(this.#dropdownFilterTimer);
        this.#dropdownFilterTimer = setTimeout(() => this.render(false, { parts: ['content'] }), DEBOUNCE_DELAY);
      });
    }
    for (const prop of ['minRange', 'maxRange']) {
      const inputName = prop === 'minRange' ? 'spell-min-range' : 'spell-max-range';
      const el = this.element.querySelector(`input[name="${inputName}"]`);
      if (!el) continue;
      el.addEventListener('input', (event) => {
        this.filterState[prop] = event.target.value;
        clearTimeout(this.#rangeFilterTimer);
        this.#rangeFilterTimer = setTimeout(() => this.render(false, { parts: ['content'] }), DEBOUNCE_DELAY);
      });
    }
    const ritualCb = this.element.querySelector('dnd5e-checkbox[name="spell-ritual"]');
    if (ritualCb) {
      ritualCb.addEventListener('change', (event) => {
        this.filterState.ritual = event.target.checked;
        this.render(false, { parts: ['content'] });
      });
    }
    const resetButton = this.element.querySelector('.reset-filters');
    if (resetButton) resetButton.addEventListener('click', () => this.#resetFilters());
  }

  /** Apply saved collapsed spell-level state from user flags. */
  #applyCollapsedLevels() {
    const collapsed = game.user.getFlag(MODULE.ID, FLAGS.GM_COLLAPSED_LEVELS) || [];
    for (const levelId of collapsed) {
      const el = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (el) el.classList.add('collapsed');
    }
  }

  /** Apply saved collapsed folder state from user flags. */
  #applyCollapsedFolders() {
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
  async #toggleUserFlagArray(flagKey, id) {
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
  #setupMultiSelectListeners() {
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
  #setupDragDrop() {
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
   * Toggle detached-window mode.
   * @this {SpellListManager}
   */
  static #onToggleDetach() {
    if (this.window.windowId) this.attachWindow();
    else this.detachWindow();
  }

  /**
   * Close the manager.
   * @this {SpellListManager}
   */
  static async #onClose() {
    this.element?.classList.add('closing');
    await new Promise((resolve) => setTimeout(resolve, 250));
    await this.close({ animate: false });
  }

  /**
   * Switch sidebar between list browser and filter modes.
   * @this {SpellListManager}
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
   * @this {SpellListManager}
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The folder header element
   */
  static async #onToggleFolder(_event, target) {
    const folder = target.closest('.list-folder');
    if (!folder?.dataset?.folderId) return;
    const isCollapsed = await this.#toggleUserFlagArray(FLAGS.COLLAPSED_FOLDERS, folder.dataset.folderId);
    folder.classList.toggle('collapsed', isCollapsed);
  }

  /**
   * Select a sidebar list.
   * @this {SpellListManager}
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
   * @this {SpellListManager}
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
      window: { title: 'SPELLBOOK.Manager.Documentation.Title', icon: 'fas fa-question-circle' },
      content,
      classes: ['spell-book', 'spell-manager-documentation'],
      buttons: [{ icon: 'fas fa-check', label: 'ATLAS.Common.Close', action: 'close' }],
      position: { width: 600, height: 700 },
      default: 'close',
      rejectClose: false,
      renderOptions: detachedRenderOptions(this)
    });
  }

  /**
   * Open the actor sheet for an actor-owned spell list.
   * @this {SpellListManager}
   */
  static async #onOpenActor() {
    const actorId = this.selectedList?.document?.flags?.[MODULE.ID]?.actorId;
    const actor = actorId ? game.actors.get(actorId) : null;
    if (actor) await actor.sheet.render(true);
  }

  /**
   * Open the class item sheet for the selected list's identifier.
   * @this {SpellListManager}
   */
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
    const classItem = await this.#findClassInTopLevelFolder(identifier, meta.pack);
    if (classItem) await classItem.sheet.render(true);
  }

  /** Open the details customization dialog. */
  static #onOpenCustomization() {
    new DetailsCustomization().render({ force: true, ...detachedRenderOptions(this) });
  }

  /**
   * Toggle a spell-level header collapsed state and persist to user flags.
   * @this {SpellListManager}
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The spell level header element
   */
  static async #onToggleSpellHeader(_event, target) {
    const container = target.closest('.spell-level');
    if (!container?.dataset?.level) return;
    const isCollapsed = await this.#toggleUserFlagArray(FLAGS.GM_COLLAPSED_LEVELS, container.dataset.level);
    container.classList.toggle('collapsed', isCollapsed);
  }

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
