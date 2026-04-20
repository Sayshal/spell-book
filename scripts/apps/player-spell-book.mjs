import { ASSETS, FLAGS, MODULE, SEARCH_DEBOUNCE_DELAY, SETTINGS, TEMPLATES, WIZARD_SPELL_SOURCE } from '../constants.mjs';
import { getConfigLabel, getSpellSourceDocument, getTargetUserId } from '../data/helpers.mjs';
import { scanForScrollSpells } from '../data/scroll-processor.mjs';
import { fetchAllSpells } from '../data/spell-fetcher.mjs';
import { loadUserSpellData } from '../data/user-data.mjs';
import { ClassRules, LoadoutSelector, SpellComparison, SpellNotes } from '../dialogs/_module.mjs';
import { ClassManager } from '../managers/class-manager.mjs';
import { Loadouts } from '../managers/loadouts.mjs';
import { SpellDataManager } from '../managers/spell-data-manager.mjs';
import { PartyMode } from '../managers/party-mode.mjs';
import { RuleSet } from '../managers/rule-set.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';
import { WizardBook } from '../managers/wizard-book.mjs';
import { getEnabledPlayerElements } from '../ui/custom-ui.mjs';
import { detachedRenderOptions } from '../ui/dialogs.mjs';
import { addSpellToActorFavorites, removeSpellFromActorFavorites } from '../ui/favorites.mjs';
import { bindFilterListeners, clearFilterState, getFilterState, unbindFilterListeners } from '../ui/filter-state.mjs';
import { createSpellIconLink, extractSpellFilterData } from '../ui/formatting.mjs';
import { enrichSingleSpell } from '../ui/spell-render.mjs';
import { PartyCoordinator } from './party-coordinator.mjs';
import { SpellListManager } from './spell-list-manager.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main player-facing spell book.
 * @extends HandlebarsApplicationMixin(ApplicationV2)
 */
export class SpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'player-spell-book',
    classes: ['spell-book'],
    tag: 'form',
    form: {
      handler: SpellBook.formHandler,
      closeOnSubmit: false,
      submitOnChange: false
    },
    window: { frame: false, positioned: true },
    position: { height: 850, width: 700 },
    actions: {
      toggleFavorite: SpellBook.#onToggleFavorite,
      compareSpell: SpellBook.#onCompareSpell,
      editNote: SpellBook.#onEditNote,
      learnSpell: SpellBook.#onLearnSpell,
      unlearnSpell: SpellBook.#onUnlearnSpell,
      learnSpellFromScroll: SpellBook.#onLearnSpellFromScroll,
      openLoadoutDialog: SpellBook.#onOpenLoadoutDialog,
      openSettings: SpellBook.#onOpenSettings,
      openPartyManager: SpellBook.#onOpenPartyManager,
      toggleSpellHeader: SpellBook.#onToggleSpellLevel,
      saveSpells: SpellBook.#onSaveSpells,
      resetState: SpellBook.#onResetState,
      toggleDetach: SpellBook.#onToggleDetach,
      openManager: SpellBook.#onOpenManager,
      closeSpellBook: SpellBook.#onClose
    }
  };

  /** @override */
  static PARTS = {
    header: { template: TEMPLATES.APPS.PLAYER.HEADER },
    sidebar: { template: TEMPLATES.APPS.PLAYER.SIDEBAR }
  };

  /** @override */
  static TABS = { primary: { tabs: [], initial: null } };

  /** @type {Map<string, { results: object[], allResults: object[], resultIndex: number, loaded: boolean }>} Per-class runtime state */
  #state = new Map();

  /** @type {Promise<object[]>} Cold fetch of all spells for filter dropdown population */
  #coldFetchPromise = null;

  /** @type {object|null} Cached filter dropdown options extracted from cold fetch */
  #filterOptions = null;

  /** @type {Function} Debounced filter application bound to search inputs */
  #debouncedApplyFilters = null;

  /** @type {Set<string>} Spell UUIDs selected for comparison */
  #comparisonSet = new Set();

  /** @type {SpellComparison|null} Active spell comparison dialog. */
  #comparisonDialog = null;

  /** @type {Map<string, Map<string, boolean>>} Pending checkbox changes per tab, keyed by spell UUID */
  #pendingChanges = new Map();

  /** @type {boolean} Whether the spell book was opened during a long rest swap window */
  #isLongRest = false;

  /** @type {boolean} Whether a level-up was detected since last open */
  #isLevelUp = false;

  /**
   * @param {object} [options] - Application options
   * @param {object} options.actor - The actor whose spell book to display
   */
  constructor({ actor, ...options } = {}) {
    super(options);
    this.actor = actor;
    this.#coldFetchPromise = fetchAllSpells();
    this.#debouncedApplyFilters = foundry.utils.debounce(() => this._applyFiltersForActive(), SEARCH_DEBOUNCE_DELAY);
  }

  /** @override */
  get title() {
    return _loc('SPELLBOOK.Application.ActorTitle', { name: this.actor.name });
  }

  /** @override */
  bringToFront() {
    if (!this.element) return;
    this.position.zIndex = ++ApplicationV2._maxZ;
    this.element.style.zIndex = String(this.position.zIndex);
    ui.activeWindow = this;
  }

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const classes = ClassManager.detectSpellcastingClasses(this.actor);
    for (const id of Object.keys(classes)) parts[id] = { template: TEMPLATES.APPS.PLAYER.TAB_PREPARE, templates: [] };
    for (const wiz of ClassManager.getWizardEnabledClasses(this.actor)) parts[`wizardbook-${wiz.identifier}`] = { template: TEMPLATES.APPS.PLAYER.TAB_LEARN, templates: [] };
    return parts;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    if (partId !== 'sidebar' && context.tabs?.[partId]) partContext.tab = context.tabs[partId];
    return partContext;
  }

  /** @override */
  _prepareTabs(group) {
    if (group !== 'primary') return super._prepareTabs(group);
    const tabs = {};
    const classes = ClassManager.detectSpellcastingClasses(this.actor);
    const classIds = Object.keys(classes);
    this.tabGroups.primary ??= classIds[0] ?? null;
    for (const id of classIds) {
      const active = this.tabGroups.primary === id;
      tabs[id] = { id, group: 'primary', active, cssClass: active ? 'active' : '', label: classes[id].name, img: classes[id].img, mode: 'prepare', classIdentifier: id };
    }
    for (const wiz of ClassManager.getWizardEnabledClasses(this.actor)) {
      const id = `wizardbook-${wiz.identifier}`;
      const active = this.tabGroups.primary === id;
      tabs[id] = {
        id,
        group: 'primary',
        active,
        cssClass: active ? 'active' : '',
        label: _loc('SPELLBOOK.Wizard.SpellbookTab', { class: wiz.classItem.name }),
        img: ASSETS.MODULE_ICON,
        mode: 'learn',
        classIdentifier: wiz.identifier
      };
    }
    return tabs;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    const tabs = this._prepareTabs('primary');
    const tabArr = Object.values(tabs);
    context.tabs = tabs;
    context.tabArr = tabArr;
    context.prepareTabs = tabArr.filter((t) => t.mode === 'prepare');
    context.learnTabs = tabArr.filter((t) => t.mode === 'learn');
    context.hasParty = !!PartyMode.getPrimaryGroupForActor(this.actor);
    context.partyModeActive = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    context.detached = options.window?.attach ? false : options.window?.detach ? true : !!this.window.windowId;
    context.isGM = game.user.isGM;
    return context;
  }

  /** @override */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener('mousedown', () => this.bringToFront(), { capture: false });
  }

  /** @override */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId === 'sidebar') {
      const searchInput = htmlElement.querySelector('[name="filter-name"]');
      if (searchInput) searchInput.addEventListener('input', this.#debouncedApplyFilters);
      const partyBtn = htmlElement.querySelector('[data-action="openPartyManager"]');
      if (partyBtn) {
        partyBtn.addEventListener('contextmenu', async (event) => {
          event.preventDefault();
          const current = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
          await this.actor.setFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED, !current);
          partyBtn.classList.toggle('active', !current);
          ui.notifications.info(_loc(current ? 'SPELLBOOK.Party.ModeDisabled' : 'SPELLBOOK.Party.ModeEnabled'));
          this._invalidateAndReload(this.tabGroups.primary);
        });
      }
      const loadoutBtn = htmlElement.querySelector('[data-action="openLoadoutDialog"]');
      if (loadoutBtn) this.#attachLoadoutQuickSelect(loadoutBtn);
      return;
    }
    // Listen for checkbox changes on spell tabs to update UI state (no persistence)
    htmlElement.addEventListener('change', (event) => {
      const cb = event.target.closest('input[type="checkbox"]');
      if (!cb?.dataset?.uuid) return;
      event.stopPropagation();
      const tabId = htmlElement.dataset.tab;
      const classId = this._resolveClassId(tabId);
      // Validate cantrip changes
      const spellLevel = parseInt(cb.closest('li')?.dataset?.spellLevel ?? cb.closest('.spell-level')?.dataset?.level ?? '-1', 10);
      if (spellLevel === 0 && cb.checked && classId) {
        const spell = fromUuidSync(cb.dataset.uuid);
        if (spell) {
          const check = SpellManager.canChangeCantripStatus(this.actor, spell, true, this.#isLevelUp, this.#isLongRest, null, classId);
          if (!check.allowed) {
            cb.checked = false;
            if (check.message) ui.notifications.warn(check.message, { localize: true });
            return;
          }
        }
      }
      const sbCheckbox = cb.closest('.sb-checkbox');
      if (sbCheckbox) sbCheckbox.classList.toggle('checked', cb.checked);
      const spellItem = cb.closest('.spell-item');
      if (spellItem) spellItem.classList.toggle('prepared-spell', cb.checked);
      if (tabId && !this._isLearnTab(tabId)) {
        if (spellLevel === 0) this._updateCantripCounter(tabId);
        else this._updatePreparationFooter(tabId);
      }
    });
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#isLongRest = this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED) === true;
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL);
    const currentLevel = this.actor.system.details?.level;
    this.#isLevelUp = !!(previousLevel && currentLevel && currentLevel > previousLevel);
    Hooks.callAll('spellBookOpened', { actor: this.actor, app: this });
    this._initializeFilters();
    if (this.tabGroups.primary) this._loadClassData(this.tabGroups.primary);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#enableDragging();
  }

  /** Enable drag-to-move via the header strip. Re-wires on every render since PART DOM is replaced. */
  #enableDragging() {
    const dragHandle = this.element?.querySelector('.spell-book-header');
    if (!dragHandle || dragHandle.dataset.dragWired === '1') return;
    dragHandle.dataset.dragWired = '1';
    const drag = new foundry.applications.ux.Draggable.implementation(this, this.element, dragHandle, false);
    const originalMouseDown = drag._onDragMouseDown.bind(drag);
    drag._onDragMouseDown = (event) => {
      if (event.target.closest('button, a, input, select, [data-action]')) return;
      originalMouseDown(event);
    };
    const originalMouseUp = drag._onDragMouseUp.bind(drag);
    drag._onDragMouseUp = (event) => {
      originalMouseUp(event);
      const { left, top } = this.position;
      game.settings.set(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION, { left, top });
    };
  }

  /** @override */
  changeTab(tab, group, options) {
    if (group === 'primary') this._savePendingChanges();
    super.changeTab(tab, group, options);
    if (group !== 'primary') return;
    if (!this.#state.get(tab)?.loaded) this._loadClassData(tab);
    else this._restorePendingChanges(tab);
  }

  /**
   * Read UUIDs currently marked prepared in a class tab, using live checkbox state if loaded.
   * Falls back to any stored pending changes for non-active tabs, and finally to the actor flag.
   * @param {string} classIdentifier - The class tab id
   * @returns {string[]} UUIDs flagged as prepared
   */
  getCurrentPreparedUuids(classIdentifier) {
    const panel = this._getPanelEl(classIdentifier);
    const checkboxes = panel?.querySelectorAll('input[type="checkbox"][data-uuid]');
    if (checkboxes?.length)
      return Array.from(checkboxes)
        .filter((cb) => cb.checked)
        .map((cb) => cb.dataset.uuid);
    const pending = this.#pendingChanges.get(classIdentifier);
    if (pending?.size)
      return Array.from(pending.entries())
        .filter(([, checked]) => checked)
        .map(([uuid]) => uuid);
    const flag = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const keys = Array.isArray(flag) ? [] : flag[classIdentifier] || [];
    return keys.map((k) => k.split(':').slice(1).join(':'));
  }

  /** Capture current checkbox states for the active tab before switching away. */
  _savePendingChanges() {
    const activeTab = this.tabGroups.primary;
    if (!activeTab || this._isLearnTab(activeTab)) return;
    const panel = this._getPanelEl(activeTab);
    if (!panel) return;
    const changes = new Map();
    for (const cb of panel.querySelectorAll('input[type="checkbox"][data-uuid]')) {
      changes.set(cb.dataset.uuid, cb.checked);
    }
    this.#pendingChanges.set(activeTab, changes);
  }

  /** Restore pending checkbox states after a tab re-renders. */
  _restorePendingChanges(tabId) {
    const changes = this.#pendingChanges.get(tabId);
    if (!changes?.size) return;
    const panel = this._getPanelEl(tabId);
    if (!panel) return;
    for (const cb of panel.querySelectorAll('input[type="checkbox"][data-uuid]')) {
      const pending = changes.get(cb.dataset.uuid);
      if (pending !== undefined && cb.checked !== pending) {
        cb.checked = pending;
        const label = cb.closest('.sb-checkbox');
        if (label) label.classList.toggle('checked', pending);
        const spellItem = cb.closest('.spell-item');
        if (spellItem) spellItem.classList.toggle('prepared-spell', pending);
      }
    }
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    unbindFilterListeners();
    this.#state.clear();
    const { top, left, width, height } = this.position;
    game.settings.set(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION, { top, left, width, height });
    Hooks.callAll('spellBookClosed', { actor: this.actor });
  }

  /**
   * Get the DOM `<section>` for a specific class tab.
   * @param {string} tabId - The tab id (may include `wizardbook-` prefix)
   * @returns {HTMLElement|null} The panel element, or null if not rendered
   */
  _getPanelEl(tabId) {
    return this.element?.querySelector(`.tab[data-tab="${CSS.escape(tabId)}"]`) ?? null;
  }

  /**
   * Resolve a tab identifier to the underlying class identifier.
   * @param {string} tabId - Tab identifier (may include `wizardbook-` prefix)
   * @returns {string} The base class identifier
   */
  _resolveClassId(tabId) {
    return tabId?.startsWith('wizardbook-') ? tabId.slice(11) : tabId;
  }

  /**
   * Whether a given tab id is a wizard learn-mode tab.
   * @param {string} tabId - The tab id
   * @returns {boolean} True if the tab id is a wizardbook-* identifier
   */
  _isLearnTab(tabId) {
    return tabId?.startsWith('wizardbook-') ?? false;
  }

  /**
   * Toggle a spell's favorite state on the actor.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The favorite toggle button or child element
   */
  static async #onToggleFavorite(_event, target) {
    const btn = target.closest('.spell-favorite-toggle') || target;
    const uuid = btn.dataset.uuid;
    if (!uuid) return;
    const wasFavorited = btn.classList.contains('favorited');
    if (wasFavorited) await removeSpellFromActorFavorites(uuid, this.actor);
    else await addSpellToActorFavorites(uuid, this.actor);
    btn.classList.toggle('favorited');
    const icon = btn.querySelector('i');
    if (icon) icon.className = `${wasFavorited ? 'fa-regular' : 'fa-solid'} fa-star`;
  }

  /**
   * Toggle a spell in/out of the comparison set.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The comparison icon element
   */
  static async #onCompareSpell(_event, target) {
    const icon = target.closest('.spell-compare-icon') || target;
    const uuid = icon.dataset.uuid;
    if (!uuid) return;
    if (this.#comparisonSet.has(uuid)) {
      this.#comparisonSet.delete(uuid);
      icon.classList.remove('active');
    } else {
      this.#comparisonSet.add(uuid);
      icon.classList.add('active');
    }
    if (this.#comparisonSet.size >= 2) {
      if (!this.#comparisonDialog) {
        this.#comparisonDialog = new SpellComparison({
          spellUuids: Array.from(this.#comparisonSet),
          onClose: () => {
            this.#comparisonDialog = null;
            this.#comparisonSet.clear();
            this.element?.querySelectorAll('.spell-compare-icon.active').forEach((el) => el.classList.remove('active'));
          }
        });
        await this.#comparisonDialog.render({ force: true, ...detachedRenderOptions(this) });
      } else {
        this.#comparisonDialog.spellUuids = Array.from(this.#comparisonSet);
        await this.#comparisonDialog.render({ force: false, ...detachedRenderOptions(this) });
        this.#comparisonDialog.bringToFront();
      }
    } else if (this.#comparisonDialog) {
      await this.#comparisonDialog.close();
      this.#comparisonDialog = null;
    }
  }

  /**
   * Open the spell notes editor dialog.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The notes icon element
   */
  static #onEditNote(_event, target) {
    const icon = target.closest('.spell-notes-icon') || target;
    const uuid = icon.dataset.uuid;
    if (!uuid) return;
    new SpellNotes({ spellUuid: uuid, actor: this.actor }).render({ force: true, ...detachedRenderOptions(this) });
  }

  /**
   * Add a spell to the wizard's spellbook journal.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The learn button element
   */
  static async #onLearnSpell(_event, target) {
    const uuid = target.dataset.uuid;
    const baseClass = this._resolveClassId(this.tabGroups.primary);
    if (!uuid || !baseClass) return;
    const spell = fromUuidSync(uuid);
    if (!spell) return;
    const { cost, isFree } = await WizardBook.getCopyingCost(this.actor, baseClass, spell);
    if (isFree) {
      await WizardBook.addSpellToSpellbook(this.actor, baseClass, uuid, WIZARD_SPELL_SOURCE.FREE);
    } else {
      const time = WizardBook.getCopyingTime(this.actor, baseClass, spell);
      const costText = `${cost} GP`;
      const content = await foundry.applications.handlebars.renderTemplate(TEMPLATES.DIALOGS.WIZARD_LEARN_SPELL, { spell, costText, time });
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: _loc('SPELLBOOK.Wizard.LearnSpellTitle', { name: spell.name }) },
        content,
        rejectClose: false,
        renderOptions: detachedRenderOptions(this)
      });
      if (!confirmed) return;
      await WizardBook.addSpellToSpellbook(this.actor, baseClass, uuid, WIZARD_SPELL_SOURCE.COPIED, { cost, timeSpent: time });
      if (game.settings.get(MODULE.ID, SETTINGS.DEDUCT_SPELL_LEARNING_COST)) await WizardBook._deductCurrency(this.actor, cost);
    }
    this.#state.delete(baseClass);
    this._invalidateAndReload(this.tabGroups.primary);
  }

  /**
   * Remove a spell from the wizard's spellbook journal.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The unlearn wrapper or child element
   */
  static async #onUnlearnSpell(_event, target) {
    const wrapper = target.closest('.in-spellbook-wrapper') || target;
    const uuid = wrapper.dataset.uuid;
    const baseClass = this._resolveClassId(this.tabGroups.primary);
    if (!uuid || !baseClass) return;
    await WizardBook.removeSpellFromSpellbook(this.actor, baseClass, uuid);
    this.#state.delete(baseClass);
    this._invalidateAndReload(this.tabGroups.primary);
  }

  /**
   * Learn a spell from a scroll item; optionally consumes the scroll.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The scroll learn button element
   */
  static async #onLearnSpellFromScroll(_event, target) {
    const uuid = target.dataset.uuid;
    const scrollId = target.dataset.scrollId;
    const baseClass = this._resolveClassId(this.tabGroups.primary);
    if (!uuid || !scrollId || !baseClass) return;
    await WizardBook.addSpellToSpellbook(this.actor, baseClass, uuid, WIZARD_SPELL_SOURCE.SCROLL, { fromScroll: true });
    if (game.settings.get(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING)) {
      const scrollItem = this.actor.items.get(scrollId);
      if (scrollItem) {
        const qty = scrollItem.system.quantity ?? 1;
        if (qty <= 1) await scrollItem.delete();
        else await scrollItem.update({ 'system.quantity': qty - 1 });
      }
    }
    this.#state.delete(baseClass);
    this._invalidateAndReload(this.tabGroups.primary);
  }

  /** Open the spell loadout selector dialog. */
  static #onOpenLoadoutDialog() {
    const classId = this._resolveClassId(this.tabGroups.primary);
    new LoadoutSelector({ actor: this.actor, classIdentifier: classId, parent: this }).render({ force: true, ...detachedRenderOptions(this) });
  }

  /**
   * Bind a right-click ContextMenu to the Loadouts sidebar button that lists saved loadouts for the active class.
   * Clicking an entry applies that loadout immediately. Items are refreshed on every open.
   * @param {HTMLElement} button - The loadout sidebar button
   */
  #attachLoadoutQuickSelect(button) {
    if (button.dataset.loadoutMenuBound === '1') return;
    button.dataset.loadoutMenuBound = '1';
    const menu = new foundry.applications.ux.ContextMenu.implementation(button, '[data-action="openLoadoutDialog"]', [], { eventName: 'contextmenu', jQuery: false, fixed: true });
    button.addEventListener(
      'contextmenu',
      () => {
        const classId = this._resolveClassId(this.tabGroups.primary);
        const loadouts = Loadouts.getLoadouts(this.actor, classId);
        menu.menuItems = loadouts.length
          ? loadouts.map((l) => ({
              name: l.name,
              icon: '<i class="fas fa-check"></i>',
              onClick: async () => {
                await LoadoutSelector.applySpellConfiguration(this.actor, classId, l.spellConfiguration || []);
                await this.refreshClassTab(classId);
              }
            }))
          : [{ name: _loc('SPELLBOOK.Loadouts.NoLoadouts'), icon: '<i class="fas fa-ban"></i>', onClick: () => {} }];
      },
      { capture: true }
    );
  }

  /**
   * Open the class rules settings dialog. If the triggering button has a `data-scroll-class`
   * attribute, scroll that class's custom-spell-list field into view on first render.
   * @param {PointerEvent} _event - The triggering event
   * @param {HTMLElement} [target] - The button that was clicked
   */
  static #onOpenSettings(_event, target) {
    const scrollClass = target?.dataset?.scrollClass;
    const dialog = new ClassRules({ actor: this.actor });
    if (scrollClass) dialog.scrollToClass = scrollClass;
    dialog.render({ force: true, ...detachedRenderOptions(this) });
  }

  /** Open the party spell coordinator. */
  static #onOpenPartyManager() {
    new PartyCoordinator({ actor: this.actor }).render({ force: true, ...detachedRenderOptions(this) });
  }

  /**
   * GM-only: open the Spell List Manager on the current tab's class list (or subclass list).
   * Prompts the user to pick if multiple lists are configured.
   * @this SpellBook
   */
  static async #onOpenManager() {
    if (!game.user.isGM) return;
    const classId = this._resolveClassId(this.tabGroups.primary);
    if (!classId) return;
    const rules = RuleSet.getClassRules(this.actor, classId);
    const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    const classUuids = toArray(rules.customSpellList);
    const subclassUuids = toArray(rules.customSubclassSpellList);
    const all = [...classUuids, ...subclassUuids].filter(Boolean);
    if (!all.length) {
      ui.notifications.warn('SPELLBOOK.Settings.NoListAssigned.Title', { localize: true });
      return;
    }
    const openWith = async (uuid) => {
      const mgr = new SpellListManager();
      await mgr.render({ force: true, ...detachedRenderOptions(this) });
      await mgr.selectSpellList(uuid);
    };
    if (all.length === 1) return openWith(all[0]);
    const options = await Promise.all(
      all.map(async (uuid) => {
        const doc = await fromUuid(uuid);
        const isSubclass = subclassUuids.includes(uuid);
        const label = doc?.name || uuid;
        const group = isSubclass ? _loc('SPELLBOOK.Settings.SubclassSpellLists.Label') : _loc('SPELLBOOK.Settings.SpellLists.Label');
        return `<option value="${foundry.utils.escapeHTML(uuid)}">${foundry.utils.escapeHTML(`${group} — ${label}`)}</option>`;
      })
    );
    const content = `<div class="standard-form"><div class="form-group"><label for="spellbook-list-picker">${_loc('SPELLBOOK.UI.PickListLabel')}</label><div class="form-fields"><select id="spellbook-list-picker" name="uuid">${options.join('')}</select></div></div></div>`;
    const chosen = await foundry.applications.api.DialogV2.prompt({
      window: { title: _loc('SPELLBOOK.UI.OpenManager'), icon: 'fas fa-bars-progress' },
      classes: ['spell-book'],
      position: { width: 420 },
      content,
      ok: { label: _loc('Open'), callback: (_event, button) => button.form.elements.uuid.value },
      renderOptions: detachedRenderOptions(this)
    });
    if (chosen) await openWith(chosen);
  }

  /** Toggle detached-window mode for the spell book. */
  static #onToggleDetach() {
    if (this.window.windowId) this.attachWindow();
    else this.detachWindow();
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

  /** Close the spell book. */
  static async #onClose() {
    this.element?.classList.add('closing');
    await new Promise((resolve) => setTimeout(resolve, 250));
    await this.close({ animate: false });
  }

  /**
   * Toggle a spell level group's collapsed state.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The clicked heading element
   */
  static async #onToggleSpellLevel(_event, target) {
    const heading = target.closest('.spell-level-heading') || target;
    const container = heading.closest('.spell-level');
    if (!container) return;
    const isCollapsed = container.classList.toggle('collapsed');
    const list = container.querySelector('.spell-list');
    if (list) list.style.display = isCollapsed ? 'none' : '';
    const icon = heading.querySelector('.collapse-indicator');
    if (icon) {
      icon.classList.toggle('fa-caret-down', !isCollapsed);
      icon.classList.toggle('fa-caret-right', isCollapsed);
    }
    heading.setAttribute('aria-expanded', String(!isCollapsed));
  }

  /**
   * Invalidate cached state for a class and reload its data.
   * @param {string} tabId - The tab id to reload
   * @returns {Promise<void>} Resolves when the class data has been reloaded and rendered
   */
  _invalidateAndReload(tabId) {
    this.#state.delete(tabId);
    SpellDataManager.invalidateClassCache(this.actor, this._resolveClassId(tabId));
    return this._loadClassData(tabId);
  }

  /**
   * Re-render a single class tab's spell list, picking up any flag-driven preparation changes.
   * Clears pending checkbox edits for that tab.
   * @param {string} classIdentifier - The class tab id
   */
  async refreshClassTab(classIdentifier) {
    this.#pendingChanges.delete(classIdentifier);
    if (!this.#state.get(classIdentifier)?.loaded) return;
    await this._renderClassResults(classIdentifier);
    this._updateCantripCounter(classIdentifier);
    this._updatePreparationFooter(classIdentifier);
  }

  /** Invalidate and reload every class tab currently loaded (e.g. after Class Rules changes). */
  async reloadAllClasses() {
    const tabIds = [...this.#state.keys()];
    this.#state.clear();
    SpellDataManager.invalidateCache(this.actor);
    await Promise.all(tabIds.map((tabId) => this._loadClassData(tabId)));
  }

  /** Re-render all loaded class panels using the current Details Customization settings. */
  async refreshDisplay() {
    for (const [tabId, state] of this.#state) {
      if (!state.loaded) continue;
      state.resultIndex = 0;
      await this._renderClassResults(tabId);
    }
  }

  /**
   * Fetch spell data for a class and render the first batch into its panel.
   * @param {string} tabId - The tab id to load
   */
  async _loadClassData(tabId) {
    const panel = this._getPanelEl(tabId);
    if (!panel) return;
    const baseClass = this._resolveClassId(tabId);
    const isLearn = this._isLearnTab(tabId);
    let results = isLearn ? await SpellDataManager.getLearnableSpellsForClass(this.actor, baseClass) : await SpellDataManager.getPreparableSpellsForClass(this.actor, baseClass);
    if (isLearn) {
      const maxLevel = SpellDataManager._calculateMaxSpellLevel(this.actor, baseClass);
      const scrollEntries = await scanForScrollSpells(this.actor, maxLevel);
      const spellbook = await WizardBook.getWizardSpellbook(this.actor, baseClass);
      const resultUuids = new Set(results.map((s) => s.uuid));
      const scrollOnly = [];
      for (const entry of scrollEntries) {
        if (spellbook?.includes(entry.spellUuid)) continue;
        if (resultUuids.has(entry.spellUuid)) continue;
        const spell = entry.spell;
        spell._fromScroll = true;
        spell._scrollId = entry.scrollId;
        spell._scrollName = entry.scrollName;
        scrollOnly.push(spell);
      }
      if (scrollOnly.length) results = [...scrollOnly, ...results];
    }
    this.#state.set(tabId, { results, allResults: results, loaded: true });
    await this._renderClassResults(tabId);
    if (isLearn) await this._updateWizardCounters(tabId);
    else {
      this._updateCantripCounter(tabId);
      this._updatePreparationFooter(tabId);
    }
  }

  /**
   * Render the first batch of results for a class into its panel.
   * @param {string} tabId - The tab id whose panel should be populated
   */
  async _renderClassResults(tabId) {
    const panel = this._getPanelEl(tabId);
    const state = this.#state.get(tabId);
    if (!panel || !state) return;
    const spinner = panel.querySelector('.results-loading');
    const listEl = panel.querySelector('.spell-list-items');
    if (spinner) spinner.hidden = true;
    if (!state.allResults?.length) {
      listEl?.replaceChildren(this._buildNoListNotice(tabId));
      state.resultIndex = 0;
      return;
    }
    if (!state.results?.length) {
      listEl?.replaceChildren();
      state.resultIndex = 0;
      return;
    }
    const rc = await this._buildRenderContext(tabId);

    // Group spells by level and render all
    const groups = this._groupByLevel(state.results);
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      if (!group.spells.length) continue;
      const levelHtml = await foundry.applications.handlebars.renderTemplate(TEMPLATES.COMPONENTS.SPELL_LEVEL, { ...group, spells: [] });
      const levelTpl = document.createElement('template');
      levelTpl.innerHTML = levelHtml;
      const levelEl = levelTpl.content.firstElementChild;
      const spellList = levelEl.querySelector('.spell-list');
      const rendered = await Promise.all(group.spells.map((s) => this._renderResult(s, rc)));
      spellList?.append(...rendered);
      fragment.appendChild(levelEl);
    }
    if (spinner) spinner.hidden = true;
    listEl?.replaceChildren(fragment);
    this._restorePendingChanges(tabId);
  }

  /**
   * Build the "no spell list assigned" notice element shown when a class has no list configured.
   * @returns {HTMLElement} A <li> notice with a button that opens the Class Rules dialog
   * @private
   */
  _buildNoListNotice(tabId) {
    const classId = this._resolveClassId(tabId) ?? '';
    const li = document.createElement('li');
    li.className = 'spell-list-notice no-list-notice';
    li.innerHTML = `
      <p><strong>${_loc('SPELLBOOK.NoListAssigned.Title')}</strong></p>
      <p>${_loc('SPELLBOOK.NoListAssigned.Hint')}</p>
      <button type="button" data-action="openSettings" data-scroll-class="${classId}">
        <i class="fas fa-gear" aria-hidden="true"></i>
        <span>${_loc('SPELLBOOK.NoListAssigned.OpenSettings')}</span>
      </button>`;
    return li;
  }

  /**
   * Group spells by level for level-grouped rendering.
   * @param {object[]} spells - Flat array of spell documents
   * @returns {Array<{ level: number, levelName: string, spells: object[], isCollapsed: boolean, isWizardContext: boolean, cantripCounter: object }>} Sorted level groups
   */
  _groupByLevel(spells) {
    const groups = new Map();
    const scrollOnly = [];
    for (const spell of spells) {
      if (spell._fromScroll) {
        scrollOnly.push(spell);
        continue;
      }
      const level = spell.system?.level ?? 0;
      if (!groups.has(level)) groups.set(level, []);
      groups.get(level).push(spell);
    }
    const byLevel = [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, levelSpells]) => ({
        level,
        levelName: level === 0 ? _loc('DND5E.SpellLevel0') : CONFIG.DND5E.spellLevels?.[level] || `${_loc('DND5E.SpellLevel')} ${level}`,
        spells: levelSpells.sort((a, b) => a.name.localeCompare(b.name)),
        isCollapsed: false,
        isWizardContext: false,
        cantripCounter: { enabled: false }
      }));
    if (scrollOnly.length) {
      const scrollGroup = {
        level: 'scroll',
        levelName: _loc('SPELLBOOK.Wizard.LearnFromScroll'),
        spells: scrollOnly.sort((a, b) => (a.system?.level ?? 0) - (b.system?.level ?? 0) || a.name.localeCompare(b.name)),
        isCollapsed: false,
        isWizardContext: false,
        cantripCounter: { enabled: false }
      };
      byLevel.unshift(scrollGroup);
    }
    return byLevel;
  }

  /**
   * Build the shared render context computed once per batch for a given class tab.
   * @param {string} tabId - The tab id being rendered
   * @returns {Promise<object>} Render context object for `_renderResult`
   */
  async _buildRenderContext(tabId) {
    const baseClass = this._resolveClassId(tabId);
    const isLearn = this._isLearnTab(tabId);
    let scrollSpellMap = null;
    if (isLearn) {
      const maxLevel = SpellDataManager._calculateMaxSpellLevel(this.actor, baseClass);
      const scrollSpells = await scanForScrollSpells(this.actor, maxLevel);
      scrollSpellMap = new Map(scrollSpells.map((s) => [s.spellUuid, s]));
    }
    const wizardSpellbook = isLearn ? await WizardBook.getWizardSpellbook(this.actor, baseClass) : null;
    const wizardbookCache = new Map();
    if (wizardSpellbook) wizardbookCache.set(baseClass, wizardSpellbook);
    return {
      classId: baseClass,
      isLearn,
      batchData: baseClass ? SpellManager.prepareBatchData(this.actor, baseClass) : null,
      userData: await loadUserSpellData(getTargetUserId(this.actor)),
      wizardSpellbook,
      scrollSpellMap,
      enabledElements: getEnabledPlayerElements(),
      appState: {
        wizardbookCache,
        comparisonSpells: this.#comparisonSet,
        wizardManagers: null
      }
    };
  }

  /**
   * Render a single spell item as a DOM element using the spell-item partial.
   * @param {object} spell - Spell document from the class spell list
   * @param {object} rc - Shared render context from `_buildRenderContext`
   * @returns {Promise<HTMLElement>} The rendered `<li>` spell item element
   */
  async _renderResult(spell, rc) {
    const { batchData, userData, wizardSpellbook, scrollSpellMap, classId: baseClass, isLearn, enabledElements, appState } = rc;
    const spellUuid = spell.uuid;

    // Attach user data so enrichSingleSpell can read favorites/notes state
    spell.favorited = !!userData?.[spellUuid]?.favorite;
    spell.hasNotes = !!userData?.[spellUuid]?.notes;

    // Use canonical enrichment pipeline for tags, details, icons, party indicators
    const enriched = enrichSingleSpell(spell, this.actor, enabledElements, appState);
    try {
      enriched.enrichedIcon = createSpellIconLink(spell);
    } catch {
      enriched.enrichedIcon = `<img src="${spell.img || 'icons/svg/book.svg'}" class="spell-icon" alt="${spell.name}" width="32" height="32" loading="lazy">`;
    }

    // Preparation status — class-specific, not handled by enrichSingleSpell
    let status = batchData ? SpellManager.getSpellPreparationStatus(this.actor, spell, baseClass, batchData) : { prepared: false, disabled: true, disabledReason: '' };
    const props = spell.system?.properties;
    const isRitual = spell.system?.components?.ritual || (props instanceof Set ? props.has('ritual') : Array.isArray(props) ? props.includes('ritual') : false);
    const prepId = `${baseClass}-${spellUuid}`.replaceAll('.', '-').replaceAll(':', '-');

    // Build tags from batchData (compendium spells don't have aggregatedModes, so enrichSingleSpell tags are empty)
    const tags = [];
    let crossClass = false;
    const canonical = spell._stats?.compendiumSource || spell.flags?.core?.sourceId || spellUuid;
    const owned = batchData?.ownedSpellsMap?.get(spellUuid) || batchData?.ownedSpellsMap?.get(canonical);
    const otherClass = batchData?.preparedByOtherClassMap?.get(spellUuid);
    if (otherClass) {
      crossClass = true;
      const otherClassName = this.actor.spellcastingClasses?.[otherClass]?.name || otherClass;
      tags.push({ cssClass: 'cross-class', icon: 'fas fa-right-left', tooltip: _loc('SPELLBOOK.Preparation.PreparedByClass', { class: otherClassName }) });
    }
    if (owned) {
      const alwaysPrepared = owned.find((o) => o.prepared === 2);
      if (alwaysPrepared) {
        const sourceDoc = getSpellSourceDocument(alwaysPrepared.item, this.actor);
        const tooltip = sourceDoc?.name ? _loc('SPELLBOOK.Preparation.GrantedBy', { source: sourceDoc.name }) : '';
        tags.push({ cssClass: 'always-prepared', icon: 'fas fa-certificate', tooltip });
      }
      const granted = owned.find((o) => o.item?.flags?.dnd5e?.cachedFor);
      if (granted && !alwaysPrepared) {
        tags.push({ cssClass: 'granted', icon: 'fas fa-hand-sparkles', tooltip: granted.item.name || '' });
      }
      const pact = owned.find((o) => o.method === 'pact');
      if (pact) {
        tags.push({ cssClass: 'pact', icon: 'fas fa-handshake-simple', tooltip: _loc('DND5E.PactMagic') });
      }
      if (!status.prepared) {
        const regularlyPrepared = owned.find((o) => o.prepared === 1);
        if (regularlyPrepared) status.prepared = true;
      }
    }
    if (isRitual) tags.push({ cssClass: 'ritual', icon: 'fas fa-book-open', tooltip: _loc('SPELLBOOK.Preparation.RitualTooltip') });
    enriched.tags = tags.length ? tags : undefined;

    // Update cssClasses with preparation state
    if (status.prepared && !enriched.cssClasses.includes('prepared-spell')) enriched.cssClasses += ' prepared-spell';

    // Wizard action — learn mode only, needs scroll map + spellbook data
    let wizardAction;
    if (isLearn) {
      const inSpellbook = wizardSpellbook?.includes(spellUuid) ?? false;
      const fromScroll = !!spell._fromScroll;
      const scrollEntry = fromScroll ? { scrollId: spell._scrollId, scrollName: spell._scrollName } : !inSpellbook ? scrollSpellMap?.get(spellUuid) : null;
      const source = inSpellbook ? WizardBook.getSpellLearningSource(this.actor, baseClass, spellUuid) : null;
      const labelKey = source ? WizardBook.getLearnedLabelKey(source) : null;
      wizardAction = {
        inSpellbook,
        canLearn: !inSpellbook && !scrollEntry,
        isFromScroll: !!scrollEntry,
        scrollId: scrollEntry?.scrollId,
        uuid: spellUuid,
        ariaLabel: spell.name,
        learningSource: source,
        learningSourceLabel: labelKey ? _loc(labelKey) : ''
      };
    }

    const context = {
      spell: {
        ...enriched,
        compendiumUuid: spellUuid,
        wizardAction,
        preparation: {
          identifier: prepId,
          prepared: status.prepared,
          disabled: status.disabled,
          disabledReason: status.disabledReason || '',
          ariaLabel: spell.name,
          classIdentifier: baseClass,
          isRitual,
          crossClass
        }
      },
      isWizardContext: isLearn
    };
    const html = await foundry.applications.handlebars.renderTemplate(TEMPLATES.COMPONENTS.SPELL_ITEM, context);
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    return tpl.content.firstElementChild;
  }

  /** Await cold fetch, extract filter options, and render the dropdown bar into all class panels. */
  async _initializeFilters() {
    const allSpells = await this.#coldFetchPromise;
    if (!this.element) return;
    this.#filterOptions = SpellBook._extractFilterOptions(allSpells);
    await this._renderSidebarFilters();
  }

  /**
   * Extract unique filter dropdown values from the full spell index.
   * @param {object[]} spells - Full spell index from cold fetch
   * @returns {{ schools: Array, activationTypes: Array, sources: Array, damageTypes: Array, conditions: Array }} Sorted filter option arrays
   */
  static _extractFilterOptions(spells) {
    const schools = new Map();
    const activationTypes = new Map();
    const sources = new Map();
    for (const spell of spells) {
      const school = spell.system?.school;
      if (school && !schools.has(school)) schools.set(school, getConfigLabel(CONFIG.DND5E.spellSchools, school));
      const activation = spell.system?.activation?.type;
      if (activation && !activationTypes.has(activation)) activationTypes.set(activation, getConfigLabel(CONFIG.DND5E.abilityActivationTypes, activation) || activation);
      const source = spell.system?.source?.book;
      if (source && !sources.has(source)) sources.set(source, source);
    }
    const sortByLabel = ([, a], [, b]) => a.localeCompare(b, game.i18n.lang);
    const levels = [];
    for (let i = 0; i <= 9; i++) levels.push([String(i), i === 0 ? _loc('DND5E.SpellLevel0') : CONFIG.DND5E.spellLevels?.[i] || `${_loc('DND5E.SpellLevel')} ${i}`]);
    return {
      levels,
      schools: [...schools.entries()].sort(sortByLabel),
      activationTypes: [...activationTypes.entries()].sort(sortByLabel),
      sources: [...sources.entries()].sort(sortByLabel),
      damageTypes: Object.keys(CONFIG.DND5E.damageTypes ?? {})
        .map((k) => [k, getConfigLabel(CONFIG.DND5E.damageTypes, k) || k])
        .sort(sortByLabel),
      conditions: Object.keys(CONFIG.DND5E.conditionTypes ?? {})
        .map((k) => [k, getConfigLabel(CONFIG.DND5E.conditionTypes, k) || k])
        .sort(sortByLabel),
      targets: Object.keys(CONFIG.DND5E.spellTargetTypes ?? CONFIG.DND5E.targetTypes ?? {})
        .map((k) => [k, getConfigLabel(CONFIG.DND5E.spellTargetTypes ?? CONFIG.DND5E.targetTypes, k) || k])
        .sort(sortByLabel)
    };
  }

  /**
   * Render filter dropdown controls into the sidebar's filter section.
   */
  async _renderSidebarFilters() {
    const container = this.element?.querySelector('.sidebar-filter-section');
    if (!container || !this.#filterOptions) return;
    const allLabel = _loc('SPELLBOOK.Filters.All');
    const yesNo = [
      { value: '', label: allLabel },
      { value: 'yes', label: _loc('COMMON.Yes') },
      { value: 'no', label: _loc('COMMON.No') }
    ];
    const makeOpts = (entries) => [{ value: '', label: allLabel }, ...entries.map(([value, label]) => ({ value, label }))];
    const useMetric = dnd5e.utils.defaultUnits('length') === 'm';
    const rangeUnit = useMetric ? _loc('DND5E.DistM') : _loc('DND5E.DistFt');
    const selects = [
      { name: 'filter-school', id: 'filter-school', label: 'DND5E.School', ariaLabel: 'DND5E.School', type: 'select', options: makeOpts(this.#filterOptions.schools) },
      { name: 'filter-castingTime', id: 'filter-castingTime', label: 'DND5E.SpellCastTime', ariaLabel: 'DND5E.SpellCastTime', type: 'select', options: makeOpts(this.#filterOptions.activationTypes) },
      { name: 'filter-target', id: 'filter-target', label: 'SPELLBOOK.Filters.Target', ariaLabel: 'SPELLBOOK.Filters.Target', type: 'select', options: makeOpts(this.#filterOptions.targets) },
      { name: 'filter-damageType', id: 'filter-damageType', label: 'DND5E.DamageType', ariaLabel: 'DND5E.DamageType', type: 'select', options: makeOpts(this.#filterOptions.damageTypes) },
      {
        name: 'filter-condition',
        id: 'filter-condition',
        label: 'SPELLBOOK.Filters.Condition',
        ariaLabel: 'SPELLBOOK.Filters.Condition',
        type: 'select',
        options: makeOpts(this.#filterOptions.conditions)
      },
      { name: 'filter-requiresSave', id: 'filter-requiresSave', label: 'SPELLBOOK.Filters.RequiresSave', ariaLabel: 'SPELLBOOK.Filters.RequiresSave', type: 'select', options: yesNo },
      { name: 'filter-source', id: 'filter-source', label: 'SPELLBOOK.Filters.Source', ariaLabel: 'SPELLBOOK.Filters.Source', type: 'select', options: makeOpts(this.#filterOptions.sources) }
    ];
    const selectsHtml = (await Promise.all(selects.map((c) => foundry.applications.handlebars.renderTemplate(TEMPLATES.COMPONENTS.FILTER_ITEM, c)))).join('');
    const levelMin = _loc('SPELLBOOK.Filters.Min');
    const levelMax = _loc('SPELLBOOK.Filters.Max');
    const levelRangeHtml = `
      <div class="filter-range-group">
        <label>${_loc('DND5E.SpellLevel')}</label>
        <div class="range-inputs">
          <input type="number" name="filter-min-level" min="0" max="9" step="1" placeholder="${levelMin}" aria-label="${_loc('SPELLBOOK.Filters.LevelMinLabel')}">
          <input type="number" name="filter-max-level" min="0" max="9" step="1" placeholder="${levelMax}" aria-label="${_loc('SPELLBOOK.Filters.LevelMaxLabel')}">
        </div>
      </div>`;
    const rangeHtml = `
      <div class="filter-range-group">
        <label>${_loc('DND5E.Range')} (${rangeUnit})</label>
        <div class="range-inputs">
          <input type="number" name="filter-min-range" min="0" step="5" placeholder="${levelMin}" aria-label="${_loc('SPELLBOOK.Filters.RangeMinLabel')}">
          <input type="number" name="filter-max-range" min="0" step="5" placeholder="${levelMax}" aria-label="${_loc('SPELLBOOK.Filters.RangeMaxLabel')}">
        </div>
      </div>`;
    const prop = (key, label) =>
      `<button type="button" class="prop-toggle" data-filter-prop="${key}" data-state="ignore">
        <span class="prop-indicator" aria-hidden="true"></span>
        <span class="prop-label">${label}</span>
      </button>`;
    const propHtml = `
      <fieldset class="filter-properties">
        <legend>${_loc('SPELLBOOK.Filters.Properties')}</legend>
        ${prop('vocal', _loc('DND5E.ComponentVerbal'))}
        ${prop('somatic', _loc('DND5E.ComponentSomatic'))}
        ${prop('material', _loc('DND5E.ComponentMaterial'))}
        ${prop('concentration', _loc('DND5E.Concentration'))}
        ${prop('ritual', _loc('DND5E.Ritual'))}
      </fieldset>`;
    const togglesHtml = `
      <div class="filter-toggles">
        <label><input type="checkbox" name="filter-material-costly"> ${_loc('SPELLBOOK.Filters.MaterialCostly')}</label>
        <label><input type="checkbox" name="filter-prepared"> ${_loc('SPELLBOOK.Filters.PreparedOnly')}</label>
        <label><input type="checkbox" name="filter-favorited"> ${_loc('SPELLBOOK.Filters.FavoritesOnly')}</label>
      </div>`;
    container.innerHTML = levelRangeHtml + selectsHtml + rangeHtml + propHtml + togglesHtml;
    for (const btn of container.querySelectorAll('.prop-toggle')) {
      btn.addEventListener('click', () => this.#cyclePropertyToggle(btn, 1));
      btn.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.#cyclePropertyToggle(btn, -1);
      });
    }
    bindFilterListeners(container);
    container.addEventListener('change', () => this._applyFiltersForActive());
  }

  /**
   * Cycle a property toggle through three states: ignore → include → exclude → ignore.
   * @param {HTMLElement} btn - The button element with data-filter-prop
   */
  #cyclePropertyToggle(btn, direction = 1) {
    const order = ['ignore', 'include', 'exclude'];
    const idx = order.indexOf(btn.dataset.state);
    btn.dataset.state = order[(idx + direction + order.length) % order.length];
    btn.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Apply filters to the currently-active class panel (called from the debounced search input). */
  _applyFiltersForActive() {
    if (this.tabGroups.primary) this._applyFilters(this.tabGroups.primary);
  }

  /**
   * Apply search query and dropdown filters to a class's full result set, then re-render its panel.
   * @param {string} tabId - The tab id whose filters should be applied
   */
  _applyFilters(tabId) {
    const state = this.#state.get(tabId);
    if (!state?.allResults?.length) return;
    const sidebar = this.element?.querySelector('.spell-book-sidebar');
    if (!sidebar) return;
    const query = sidebar.querySelector('[name="filter-name"]')?.value?.trim() || '';
    const filterState = getFilterState(sidebar.querySelector('.sidebar-filter-section'));
    const nameQuery = query.toLowerCase();
    const getFilterData = (spell) => {
      if (!spell._filterData) spell._filterData = extractSpellFilterData(spell);
      return spell._filterData;
    };
    const hasProp = (spell, key) => (Array.isArray(spell.system?.properties) ? spell.system.properties.includes(key) : !!spell.system?.properties?.has?.(key));
    const minLevel = filterState.minLevel !== '' ? Number(filterState.minLevel) : null;
    const maxLevel = filterState.maxLevel !== '' ? Number(filterState.maxLevel) : null;
    const minRange = filterState.minRange !== '' ? Number(filterState.minRange) : null;
    const maxRange = filterState.maxRange !== '' ? Number(filterState.maxRange) : null;
    state.results = state.allResults.filter((spell) => {
      if (nameQuery && !spell.name.toLowerCase().includes(nameQuery)) return false;
      const level = spell.system?.level ?? 0;
      if (minLevel !== null && level < minLevel) return false;
      if (maxLevel !== null && level > maxLevel) return false;
      if (filterState.school && spell.system?.school !== filterState.school) return false;
      if (filterState.castingTime && spell.system?.activation?.type !== filterState.castingTime) return false;
      if (filterState.source && spell.system?.source?.book !== filterState.source) return false;
      if (filterState.properties) {
        for (const [p, mode] of Object.entries(filterState.properties)) {
          const has = hasProp(spell, p);
          if (mode === 'include' && !has) return false;
          if (mode === 'exclude' && has) return false;
        }
      }
      if (filterState.materialCostly && !getFilterData(spell).materialComponents?.hasCostlyMaterials) return false;
      if (filterState.target && getFilterData(spell).target.affectsType !== filterState.target) return false;
      if (filterState.damageType && !getFilterData(spell).damageTypes.includes(filterState.damageType)) return false;
      if (filterState.condition && !getFilterData(spell).conditions.includes(filterState.condition)) return false;
      if (filterState.requiresSave === 'yes' && !getFilterData(spell).requiresSave) return false;
      if (filterState.requiresSave === 'no' && getFilterData(spell).requiresSave) return false;
      if (minRange !== null || maxRange !== null) {
        const r = getFilterData(spell).range?.value ?? 0;
        if (minRange !== null && r < minRange) return false;
        if (maxRange !== null && r > maxRange) return false;
      }
      if (filterState.prepared && !spell.preparation?.prepared) return false;
      if (filterState.favorited && !spell.favorited) return false;
      return true;
    });
    state.resultIndex = 0;
    this._renderClassResults(tabId);
  }

  /**
   * Form handler — no-op since submitOnChange is false. Save is via the save button.
   */
  static async formHandler() {}

  /**
   * Save all preparation changes for all class tabs.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The save button
   */
  /**
   * Reset filters (click) or reset filters + uncheck all preparation boxes (shift-click).
   * @this SpellBook
   * @param {PointerEvent} event - The click event
   */
  static #onResetState(event) {
    const sidebar = this.element.querySelector('.spell-book-sidebar');
    const nameInput = sidebar?.querySelector('[name="filter-name"]');
    if (nameInput) nameInput.value = '';
    const filterSection = sidebar?.querySelector('.sidebar-filter-section');
    if (filterSection) {
      for (const select of filterSection.querySelectorAll('select')) select.value = '';
      for (const cb of filterSection.querySelectorAll('input[type="checkbox"]')) cb.checked = false;
      for (const btn of filterSection.querySelectorAll('.prop-toggle')) btn.dataset.state = 'ignore';
      for (const input of filterSection.querySelectorAll('input[type="text"], input[type="number"]')) input.value = '';
    }
    clearFilterState();
    if (event.shiftKey) {
      for (const tabId of this.#state.keys()) {
        if (this._isLearnTab(tabId)) continue;
        const panel = this._getPanelEl(tabId);
        const pending = this.#pendingChanges.get(tabId) ?? new Map();
        for (const cb of panel?.querySelectorAll('input[type="checkbox"][data-uuid]:not(:disabled)') ?? []) {
          pending.set(cb.dataset.uuid, false);
        }
        if (pending.size) this.#pendingChanges.set(tabId, pending);
      }
    }
    this._applyFiltersForActive();
    if (event.shiftKey) {
      for (const tabId of this.#state.keys()) {
        if (this._isLearnTab(tabId)) continue;
        this._updateCantripCounter(tabId);
        this._updatePreparationFooter(tabId);
      }
    }
  }

  static async #onSaveSpells(_event, _target) {
    // Restore pending changes to inactive tabs before collecting
    for (const [tabId] of this.#pendingChanges) {
      if (tabId === this.tabGroups.primary) continue;
      this._restorePendingChanges(tabId);
    }
    // Collect ALL checkboxes from ALL tabs — like _source
    const spellDataByClass = {};
    for (const cb of this.element.querySelectorAll('input[type="checkbox"][data-class-identifier]')) {
      const uuid = cb.dataset.uuid;
      if (!uuid) continue;
      const classId = cb.dataset.classIdentifier;
      if (!spellDataByClass[classId]) spellDataByClass[classId] = {};
      const key = SpellManager._createClassSpellKey(uuid, classId);
      spellDataByClass[classId][key] = {
        uuid,
        isPrepared: cb.checked,
        wasPrepared: cb.dataset.wasPrepared === 'true',
        spellLevel: parseInt(cb.closest('li')?.dataset.spellLevel ?? cb.closest('.spell-level')?.dataset.level ?? '0', 10),
        name: cb.dataset.name || '',
        isRitual: cb.dataset.ritual === 'true'
      };
    }
    for (const [classId, classSpellData] of Object.entries(spellDataByClass)) {
      // Inject wizard spellbook ritual spells when ritualCasting: always
      const ritualMode = RuleSet.getClassRule(this.actor, classId, 'ritualCasting', 'none');
      if (ritualMode === 'always') {
        const wizardClasses = ClassManager.getWizardEnabledClasses(this.actor);
        if (wizardClasses.some((w) => w.identifier === classId)) {
          const spellbook = await WizardBook.getWizardSpellbook(this.actor, classId);
          for (const spellUuid of spellbook) {
            const key = SpellManager._createClassSpellKey(spellUuid, classId);
            if (classSpellData[key]) continue;
            const spell = fromUuidSync(spellUuid);
            if (!spell || spell.system?.level === 0) continue;
            const p = spell.system?.properties;
            const isRitual = spell.system?.components?.ritual || (p instanceof Set ? p.has('ritual') : Array.isArray(p) ? p.includes('ritual') : false);
            if (!isRitual) continue;
            classSpellData[key] = { uuid: spellUuid, isPrepared: false, wasPrepared: false, spellLevel: spell.system?.level ?? 1, name: spell.name || '', isRitual: true };
          }
        }
      }
      await SpellManager.saveClassSpecificPreparedSpells(this.actor, classId, classSpellData);
      // Clean up ritual spells that shouldn't exist under current mode
      if (ritualMode !== 'always') {
        const ritualSpells = this.actor.itemTypes.spell.filter(
          (s) => s.system?.method === 'ritual' && ClassManager.getSpellClassIdentifier(s) === classId && s.flags?.[MODULE.ID]?.isModuleRitual === true
        );
        let idsToRemove;
        if (ritualMode === 'prepared') {
          idsToRemove = ritualSpells
            .filter((r) => {
              const src = r._stats?.compendiumSource || r.uuid;
              return !this.actor.itemTypes.spell.some((s) => s.id !== r.id && (s._stats?.compendiumSource === src || s.uuid === src) && s.system?.prepared >= 1 && s.system?.method !== 'ritual');
            })
            .map((s) => s.id);
        } else {
          idsToRemove = ritualSpells.map((s) => s.id);
        }
        if (idsToRemove?.length) await this.actor.deleteEmbeddedDocuments('Item', idsToRemove);
      }
    }
    this.#pendingChanges.clear();
    if (game.modules.get('chris-premades')?.active && game.settings.get(MODULE.ID, SETTINGS.CPR_COMPATIBILITY)) {
      await chrisPremades.utils.actorUtils.updateAll(this.actor);
    }
    ui.notifications.info('SPELLBOOK.UI.ChangesSaved', { localize: true });
    for (const cb of this.element.querySelectorAll('input[type="checkbox"][data-uuid]')) {
      cb.dataset.wasPrepared = String(cb.checked);
    }
  }

  /**
   * Update the cantrip counter display and lock/unlock unchecked cantrip checkboxes.
   * @param {string} tabId - The prep-mode tab id
   */
  _updateCantripCounter(tabId) {
    const panel = this._getPanelEl(tabId);
    const baseClass = this._resolveClassId(tabId);
    if (!panel || !baseClass) return;
    let current = 0;
    for (const cb of panel.querySelectorAll('.spell-level[data-level="0"] .spell-list input[type="checkbox"]')) {
      if (cb.checked) current++;
    }
    const max = SpellManager.getMaxCantrips(this.actor, baseClass);
    const counter = panel.querySelector('.cantrip-count');
    if (counter) {
      counter.textContent = `${current}/${max} Cantrips`;
      counter.classList.toggle('at-max', current >= max);
    }
    for (const li of panel.querySelectorAll('.spell-level[data-level="0"] .spell-list li')) {
      const cb = li.querySelector('input[type="checkbox"]');
      if (!cb || cb.checked) continue;
      cb.disabled = false;
      delete cb.dataset.tooltip;
    }
  }

  /**
   * Update the prep-mode footer preparation count display.
   * Reads per-class max from spellcasting config (dnd5e 5.3 scale values) + preparation bonus.
   * @param {string} tabId - The prep-mode tab id
   */
  _updatePreparationFooter(tabId) {
    const panel = this._getPanelEl(tabId);
    const footer = panel?.querySelector('.prep-count');
    if (!footer) return;
    const baseClass = this._resolveClassId(tabId);
    const spellcastingData = this.actor.spellcastingClasses?.[baseClass];
    const baseMax = spellcastingData?.preparation?.max ?? spellcastingData?.spellcasting?.preparation?.max ?? this.actor.system.attributes?.preparation?.max ?? 0;
    const bonus = RuleSet.getClassRule(this.actor, baseClass, 'spellPreparationBonus', 0);
    const max = Math.max(0, baseMax + bonus);
    let current = 0;
    for (const cb of panel.querySelectorAll('.spell-level:not([data-level="0"]) input[type="checkbox"][data-class-identifier]')) {
      if (cb.checked) current++;
    }
    footer.textContent = `${current}/${max} Spells`;
    footer.classList.toggle('at-max', max > 0 && current >= max);
  }

  /**
   * Update the wizard learn-tab counters header (total/max spells, free spells remaining).
   * @param {string} tabId - The learn-mode tab id
   */
  async _updateWizardCounters(tabId) {
    const panel = this._getPanelEl(tabId);
    const baseClass = this._resolveClassId(tabId);
    if (!panel || !baseClass) return;
    const counters = await SpellDataManager.getWizardCounters(this.actor, baseClass);
    const totalEl = panel.querySelector('.wizard-total-count');
    const freeEl = panel.querySelector('.wizard-free-count');
    if (totalEl) totalEl.textContent = `${counters.total}/${counters.max} Spells`;
    if (freeEl) freeEl.textContent = `${counters.freeRemaining} Free`;
  }
}
