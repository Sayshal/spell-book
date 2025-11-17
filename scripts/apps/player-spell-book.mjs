/**
 * Player Spell Book Application
 *
 * The primary user-facing interface for managing spells, spell preparation, and spellcasting
 * capabilities. This application serves as the central hub for all spell-related
 * activities including preparation management, filter configuration, analytics access, and
 * party coordination features.
 *
 * @module Applications/SpellBook
 * @author Tyler
 */

import { ASSETS, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { SpellComparison, DetailsCustomization, LoadoutSelector, SpellNotes, SpellBookSettings } from '../dialogs/_module.mjs';
import { log } from '../logger.mjs';
import { Loadouts, SpellManager, WizardBook, PartyMode } from '../managers/_module.mjs';
import { State } from '../state/_module.mjs';
import * as UIUtils from '../ui/_module.mjs';
import * as ValidationUtils from '../validation/_module.mjs';
import { PlayerFilterConfiguration, AnalyticsDashboard, PartyCoordinator } from './_module.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/**
 * Player-facing Spell Book application for managing prepared spells.
 */
export class SpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Create a new SpellBook application.
   * @param {Object} actor - The actor whose spells to display
   * @param {Object} [options={}] - Application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.group = PartyMode.getPrimaryGroupForActor(actor);
    this.spellManager = new SpellManager(actor, this);
    this._state = new State(this);
    this.wizardManagers = new Map();
    const wizardClasses = this._state.getWizardEnabledClasses();
    for (const { identifier } of wizardClasses) this.wizardManagers.set(identifier, new WizardBook(actor, identifier));
    this.ui = new UIUtils.SpellBookUI(this);
    this.filterHelper = new UIUtils.Filters(this);
    this.enabledElements = UIUtils.CustomUI.getEnabledPlayerElements();
    this.ritualManagers = new Map();
    this.spellLevels = [];
    this.className = '';
    this.spellPreparation = { current: 0, maximum: 0 };
    this._newlyCheckedCantrips = new Set();
    this._isLongRest = this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED) || false;
    this._formStateCache = new Map();
    this._cantripUIInitialized = false;
    this._classColorsApplied = false;
    this._classesChanged = false;
    this._wizardBookImages = new Map();
    this._flagChangeHook = Hooks.on('updateActor', (updatedActor, changes) => {
      if (updatedActor.id !== this.actor.id) return;
      if (changes.flags?.[MODULE.ID]) {
        const changedFlags = Object.keys(changes.flags[MODULE.ID]);
        const cantripFlagChanged = changedFlags.some((flag) => [FLAGS.CLASS_RULES, FLAGS.ENFORCEMENT_BEHAVIOR].includes(flag));
        const wizardFlagChanged = changedFlags.some((flag) => flag.startsWith(FLAGS.WIZARD_COPIED_SPELLS));
        if ((cantripFlagChanged || wizardFlagChanged) && this.rendered) {
          this.spellManager.cantripManager.clearCache();
          this.spellManager.clearSettingsCache();
          this.render(false);
        }
      }
    });
    this._isLoadingSpellData = false;
    this.comparisonSpells = new Set();
    this.comparisonDialog = null;
    this._preInitialized = false;
    this._classStylingCache = null;
    log(3, 'PlayerSpellBook constructed.');
  }

  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: `player-${MODULE.ID}`,
    tag: 'form',
    form: {
      handler: SpellBook.formHandler,
      closeOnSubmit: false,
      submitOnChange: true
    },
    actions: {
      compareSpell: this.#compareSpell,
      editNote: this.#editNote,
      learnSpell: this.#learnSpell,
      learnSpellFromScroll: this.#learnSpellFromScroll,
      openAnalytics: this.#openAnalytics,
      openCustomization: this.#openCustomization,
      openFilterConfig: this.#openFilterConfig,
      openLoadoutDialog: { handler: this.#openLoadouts, buttons: [0, 2] },
      openPartyManager: { handler: this.#openPartyMode, buttons: [0, 2] },
      openSettings: this.#openSettings,
      reset: this.#reset,
      save: this.#save,
      toggleFavorite: this.#toggleFavorite,
      toggleSidebar: this.#toggleSidebar,
      toggleSpellHeader: this.#toggleSpellHeader
    },
    classes: ['spell-book', 'vertical-tabs'],
    window: { icon: 'spell-book-module-icon', resizable: true, minimizable: true, positioned: true },
    position: { height: 850, width: 600 }
  };

  /** @inheritdoc */
  static PARTS = {
    container: { template: TEMPLATES.PLAYER_SPELL_BOOK.CONTAINER },
    sidebar: { template: TEMPLATES.PLAYER_SPELL_BOOK.SIDEBAR },
    navigation: { template: TEMPLATES.PLAYER_SPELL_BOOK.TAB_NAV },
    footer: { template: TEMPLATES.PLAYER_SPELL_BOOK.FOOTER }
  };

  /** @inheritdoc */
  static TABS = {
    'spellbook-tabs': {
      tabs: [],
      initial: null
    }
  };

  /** @inheritdoc */
  get title() {
    return game.i18n.format('SPELLBOOK.Application.ActorTitle', { name: this.actor.name });
  }

  /**
   * Get the primary wizard manager for backward compatibility.
   * @returns {Object|null} The primary wizard manager instance or null if none found
   */
  get wizardManager() {
    log(3, 'Retrieving wizardmanger.', { managers: this.wizardManagers });
    const wizardEntry = this.wizardManagers.get('wizard');
    if (wizardEntry?.isWizard) return wizardEntry;
    for (const manager of this.wizardManagers.values()) if (manager.isWizard) return manager;
    return null;
  }

  /** @inheritdoc */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    const lastPosition = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION);
    if (lastPosition) Object.assign(options.position, lastPosition);
    log(3, 'initialized application options:', { options, lastPosition });
    return options;
  }

  /** @inheritdoc */
  _configureRenderOptions(options) {
    log(3, 'Configuring render options!', { options });
    super._configureRenderOptions(options);
    if (options.parts && Array.isArray(options.parts)) {
      if (!options.parts.includes('navigation')) options.parts.unshift('navigation');
      return;
    }
    options.parts = ['container', 'sidebar', 'navigation', 'footer'];
    for (const [partId] of Object.entries(this.constructor.PARTS)) {
      if (['container', 'sidebar', 'navigation', 'footer'].includes(partId)) continue;
      if (partId.endsWith('Tab')) options.parts.push(partId);
      if (partId.startsWith('wizardbook-')) options.parts.push(partId);
    }
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    if (!this._preInitialized) await this._preInitialize();
    const context = await super._prepareContext(options);
    const buttons = [
      {
        type: 'button',
        action: 'save',
        icon: 'fas fa-save',
        label: 'SPELLBOOK.UI.Save',
        tooltip: 'SPELLBOOK.UI.SaveTooltip',
        cssClass: 'submit-button'
      },
      {
        type: 'reset',
        action: 'reset',
        icon: 'fas fa-undo',
        label: 'SPELLBOOK.UI.Reset',
        tooltip: 'SPELLBOOK.UI.ResetTooltip',
        cssClass: 'reset-button'
      },
      {
        type: 'button',
        action: 'openAnalytics',
        icon: 'fas fa-chart-bar',
        label: 'SPELLBOOK.Analytics.OpenDashboard',
        tooltip: 'SPELLBOOK.Analytics.OpenDashboardTooltip',
        cssClass: 'analytics-button'
      },
      {
        type: 'button',
        action: 'openLoadoutDialog',
        icon: 'fas fa-toolbox',
        label: 'SPELLBOOK.UI.SpellLoadouts',
        tooltip: 'SPELLBOOK.Loadouts.ManageLoadouts',
        cssClass: 'loadout-button'
      }
    ];
    const primaryGroup = PartyMode.getPrimaryGroupForActor(this.actor);
    let showPartyButton = false;
    if (primaryGroup) {
      const creatures = primaryGroup.system?.creatures || [];
      const spellcasters = creatures.filter((actor) => actor && Object.keys(actor?.spellcastingClasses || {}).length > 0);
      showPartyButton = spellcasters.length > 0;
    }
    if (showPartyButton) {
      const isPartyModeEnabled = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
      buttons.push({
        type: 'button',
        action: 'openPartyManager',
        icon: 'fas fa-users',
        label: 'SPELLBOOK.Party.Party',
        tooltip: 'SPELLBOOK.Party.OpenPartyManager',
        cssClass: `party-button${isPartyModeEnabled ? ' party-mode-active' : ''}`
      });
    }
    context.spellLevels = this.spellLevels;
    context.className = this.className;
    context.buttons = buttons;
    context.isGM = game.user.isGM;
    context.spellcastingClasses = this._state.spellcastingClasses;
    context.activeClass = this._state.activeClass;
    context.activeTab = this.tabGroups['spellbook-tabs'];
    context.tabs = this._prepareTabs('spellbook-tabs');
    context.globalPrepared = this._state.spellPreparation;
    context.classPreparationData = this.spellManager.prepareClassPreparationData();
    context.isWizard = !this.wizardManager?.isWizard;
    context.hasMultipleTabs = Object.keys(context.tabs).length > 1;
    context.filters = UIUtils.prepareFilters(this.actor, this.filterHelper);
    const activeTab = context.activeTab;
    context.isWizardTab = activeTab && (activeTab === 'wizardbook' || activeTab.startsWith('wizardbook-'));
    if (context.isWizardTab) {
      const wizardTabData = this._state.tabData?.[activeTab];
      if (wizardTabData) {
        context.wizardTotalSpellbookCount = wizardTabData.wizardTotalSpellbookCount || 0;
        context.wizardFreeSpellbookCount = wizardTabData.wizardFreeSpellbookCount || 0;
        context.wizardRemainingFreeSpells = wizardTabData.wizardRemainingFreeSpells || 0;
        context.wizardHasFreeSpells = wizardTabData.wizardHasFreeSpells || false;
        context.wizardMaxSpellbookCount = wizardTabData.wizardMaxSpellbookCount || 0;
        context.wizardIsAtMax = wizardTabData.wizardIsAtMax || false;
      }
    }
    log(3, 'PSB Context Created:', { context });
    return context;
  }

  /** @inheritdoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    const classMatch = partId.match(/^([^T]+)Tab$/);
    if (classMatch) {
      const classIdentifier = classMatch[1];
      if (this._state.classSpellData[classIdentifier]) {
        context.classIdentifier = classIdentifier;
        context.className = this._state.classSpellData[classIdentifier].className;
        const rawSpellLevels = this._state.classSpellData[classIdentifier].spellLevels;
        context.spellLevels = await this.#processSpellsByLevel(rawSpellLevels);
        context.globalPrepared = this._state.spellPreparation;
        context.classNotice = this.#prepareClassValidationNotice(classIdentifier, context.className);
      }
    }
    if (partId.startsWith('wizardbook-')) {
      const classIdentifier = partId.slice(11);
      context.classIdentifier = classIdentifier;
      context.className = this._state.classSpellData[classIdentifier]?.className || classIdentifier;
      const wizardTabData = this._state.tabData[partId];
      if (!wizardTabData) {
        log(1, `Wizard tab data missing for ${classIdentifier}, using empty defaults`);
        context.spellLevels = [];
        context.wizardTotalSpellbookCount = 0;
        context.wizardRemainingFreeSpells = 0;
        context.wizardHasFreeSpells = false;
        context.wizardMaxSpellbookCount = 0;
      } else {
        const rawSpellLevels = wizardTabData.spellLevels || [];
        context.spellLevels = await this.#processSpellsByLevel(rawSpellLevels);
        context.wizardTotalSpellbookCount = wizardTabData.wizardTotalSpellbookCount || 0;
        context.wizardRemainingFreeSpells = wizardTabData.wizardRemainingFreeSpells || 0;
        context.wizardHasFreeSpells = wizardTabData.wizardHasFreeSpells || false;
        context.wizardMaxSpellbookCount = wizardTabData.wizardMaxSpellbookCount || 0;
      }
      context.classNotice = this.#prepareClassValidationNotice(classIdentifier, context.className);
    }
    log(3, 'PSB Part context created:', { partId, context, options });
    return context;
  }

  /** @inheritdoc */
  _getTabsConfig(group) {
    if (group !== 'spellbook-tabs') return super._getTabsConfig(group);
    const tabs = [];
    let initial = null;
    if (this._state.spellcastingClasses) {
      const sortedClassIdentifiers = Object.keys(this._state.spellcastingClasses).sort();
      for (const identifier of sortedClassIdentifiers) {
        const classData = this._state.spellcastingClasses[identifier];
        const classTabId = `${identifier}Tab`;
        const iconPath = classData?.img || ASSETS.MODULE_ICON;
        tabs.push({ id: classTabId, label: game.i18n.format('SPELLBOOK.Tabs.ClassSpells', { class: classData.name }), classImg: iconPath, classIdentifier: identifier, className: classData.name });
        const wizardManager = this.wizardManagers.get(identifier);
        if (wizardManager && wizardManager.isWizard) {
          const wizardTabId = `wizardbook-${identifier}`;
          const className = classData.name;
          tabs.push({
            id: wizardTabId,
            label: game.i18n.format('SPELLBOOK.Tabs.WizardSpells', { class: className }),
            icon: 'fa-solid fa-book-spells',
            classImg: ASSETS.MODULE_ICON,
            classIdentifier: identifier,
            className: className,
            isWizardTab: true
          });
        }
      }
    }
    initial = tabs.length > 0 ? tabs[0].id : null;
    return { tabs, initial };
  }

  /** @inheritdoc */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    if (!priorElement || this._formStateCache.size === 0) return;
    const allInputs = priorElement.querySelectorAll('input, select, textarea, dnd5e-checkbox');
    allInputs.forEach((input) => {
      const inputKey = this.#getInputKey(input);
      if (!inputKey || !this._formStateCache.has(inputKey)) return;
      const cachedValue = this._formStateCache.get(inputKey);
      if (input.type === 'checkbox' || input.matches('dnd5e-checkbox')) {
        if (input.matches('dnd5e-checkbox')) {
          input.checked = cachedValue;
          if (cachedValue !== input.checked) input.dispatchEvent(new Event('change', { bubbles: true }));
        } else input.checked = cachedValue;
      } else if (input.type === 'radio') input.checked = input.value === cachedValue;
      else if (input.tagName === 'SELECT') {
        input.value = cachedValue;
        if (input.multiple && Array.isArray(cachedValue)) {
          Array.from(input.options).forEach((option) => {
            option.selected = cachedValue.includes(option.value);
          });
        }
      } else input.value = cachedValue;
    });
    log(3, 'Pre Sync-part start:', { partId, newElement, priorElement, state });
  }

  /** @inheritdoc */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if (this._formStateCache.size === 0) return;
    const newInputs = newElement.querySelectorAll('dnd5e-checkbox');
    newInputs.forEach((input) => {
      const inputKey = this.#getInputKey(input);
      if (!inputKey || !this._formStateCache.has(inputKey)) return;
      const cachedValue = this._formStateCache.get(inputKey);
      input.checked = cachedValue;
      if (typeof input.requestUpdate === 'function') input.requestUpdate();
      const spellItem = input.closest('.spell-item');
      if (spellItem) {
        if (cachedValue) {
          if (!spellItem.classList.contains('prepared-spell')) spellItem.classList.add('prepared-spell');
          else spellItem.classList.remove('prepared-spell');
        }
      }
    });
    log(3, 'Sync-part start:', { partId, newElement, priorElement, state });
  }

  /** @inheritdoc */
  async _preFirstRender(context, options) {
    log(3, 'Pre-first render logic called...');
    await super._preFirstRender(context, options);
    if (!this._preInitialized) await this._preInitialize();
  }

  /** @inheritdoc */
  async _onFirstRender(context, options) {
    log(3, 'First render logic called...');
    await super._onFirstRender(context, options);
    UIUtils.injectWizardBookColorCSS(this._classStylingCache);
    this.#setupContentWrapper();
    const sidebarControlsBottom = game.settings.get(MODULE.ID, SETTINGS.SIDEBAR_CONTROLS_BOTTOM);
    this.element.dataset.sidebarControlsBottom = sidebarControlsBottom;
    this.ui.setSidebarState();
    requestAnimationFrame(() => {
      this.ui.setupDeferredUI();
    });
  }

  /** @inheritdoc */
  async _onRender(context, options) {
    log(3, 'Rendering!', { context, options });
    await super._onRender(context, options);
    if (!options.isFirstRender) {
      this.ui.updateSpellCounts();
      this.ui.updateSpellPreparationTracking();
      requestAnimationFrame(() => {
        if (this._classesChanged) this._setupDeferredUI(context, options);
      });
    }
    this.ui.positionFooter();
  }

  /** @inheritdoc */
  async _onClose(options) {
    log(3, 'Closing Player Spell Book...', { options });
    this._preInitialized = false;
    this._classColorsApplied = false;
    this._classStylingCache = null;
    if (this._formStateCache) this._formStateCache.clear();
    await game.settings.set(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION, this.position);
    SpellBook.DEFAULT_OPTIONS.position = this.position;
    if (this._isLongRest) this.actor.unsetFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
    if (this._flagChangeHook) Hooks.off('updateActor', this._flagChangeHook);
    this._hideContextMenu();
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    if (isPartyMode) await this.actor.setFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED, false);
    if (this.ui?.search) this.ui.search.cleanup();
    super._onClose(options);
  }

  /** @inheritdoc */
  async changeTab(tabName, groupName, options = {}) {
    log(3, 'Changing tab...', { tabName, groupName, options });
    super.changeTab(tabName, groupName, options);
    const classMatch = tabName.match(/^([^T]+)Tab$/);
    const classIdentifier = classMatch ? classMatch[1] : null;
    if (classIdentifier && this._state.classSpellData[classIdentifier]) this._state.setActiveClass(classIdentifier);
    this.ui.updateSpellCounts();
    this.ui.updateSpellPreparationTracking();
    this.ui.setupCantripUI();
    this.render(false, { parts: ['footer'] });
  }

  /**
   * Handle form submission by updating internal state cache and processing preparation/filter changes.
   * @param {Event} event - The form submission event
   * @param {HTMLElement} form - The form element
   * @param {Object} _formData - The form data
   * @returns {Promise<void>}
   * @static
   */
  static async formHandler(event, form, _formData) {
    log(3, 'Form handler executing.');
    if (event?.target?.matches('dnd5e-checkbox[data-uuid]')) {
      const uuid = event.target.dataset.uuid;
      const sourceClass = event.target.dataset.sourceClass;
      const spellItem = event.target.closest('.spell-item');
      const spellLevel = spellItem?.dataset.spellLevel;
      const wasPrepared = event.target.dataset.wasPrepared === 'true';
      const isChecked = event.target.checked;

      // Handle cantrip preparation change
      if (spellLevel === '0') {
        log(3, 'Handling cantrip preparation change.', { event, uuid, spellItem });
        const checkbox = event.target;
        const isLevelUp = this.spellManager.cantripManager.canBeLeveledUp();
        const isLongRest = this._isLongRest;
        const activeTab = this.tabGroups['spellbook-tabs'];
        const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
        const classIdentifier = activeTabContent?.dataset.classIdentifier || sourceClass || this._state.activeClass;
        const sourceSpell = await fromUuid(uuid);
        if (!sourceSpell) return;
        if (isChecked) {
          const canChange = this.spellManager.cantripManager.canChangeCantripStatus(sourceSpell, isChecked, isLevelUp, isLongRest, this._uiCantripCount, classIdentifier);
          if (!canChange.allowed) {
            checkbox.checked = !isChecked;
            if (canChange.message) ui.notifications.warn(game.i18n.localize(canChange.message));
            this.ui.updateCantripCounter();
            return;
          }
        }
        this.spellManager.cantripManager.trackCantripChange(sourceSpell, isChecked, isLevelUp, isLongRest, classIdentifier);
        if (isChecked && !wasPrepared) this._newlyCheckedCantrips.add(uuid);
        else if (!isChecked && this._newlyCheckedCantrips.has(uuid)) this._newlyCheckedCantrips.delete(uuid);
        if (spellItem) spellItem.classList.toggle('prepared-spell', isChecked);
        this.ui.setupCantripLocks();
      }
      // Handle regular spell preparation change
      else {
        log(3, 'Handling spell preparation change.', { event, uuid, spellItem, sourceClass, wasPrepared, isChecked });
        const checkbox = event.target;
        const activeTab = this.tabGroups['spellbook-tabs'];
        const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
        const classIdentifier = activeTabContent?.dataset.classIdentifier || sourceClass || this._state.activeClass;
        if (!classIdentifier) return;
        const sourceSpell = await fromUuid(uuid);
        if (!sourceSpell) return;
        const classData = this._state.classSpellData[classIdentifier];
        const isLevelUp = this.spellManager.cantripManager.canBeLeveledUp();
        const isLongRest = this._isLongRest;
        const currentPrepared = classData?.spellPreparation?.current || 0;
        const maxPrepared = classData?.spellPreparation?.maximum || 0;
        const canChange = this.spellManager.canChangeSpellStatus(sourceSpell, isChecked, wasPrepared, isLevelUp, isLongRest, classIdentifier, currentPrepared, maxPrepared);
        if (!canChange.allowed) {
          checkbox.checked = !isChecked;
          if (canChange.message) {
            let message = game.i18n.localize(canChange.message);
            if (canChange.message === 'SPELLBOOK.Preparation.ClassAtMaximum') message = game.i18n.format('SPELLBOOK.Preparation.ClassAtMaximum', { class: classData?.className || classIdentifier });
            ui.notifications.warn(message);
          }
          return;
        }
        if (spellItem) spellItem.classList.toggle('prepared-spell', isChecked);
        if (isLongRest && !isChecked && wasPrepared) this.render(false);
        this.ui.updateSpellPreparationTracking();
        this.ui.updateSpellCounts();
      }
    } else if (event?.target?.matches('dnd5e-checkbox[name^="filter-"]')) {
      this.filterHelper.invalidateFilterCache();
      this.filterHelper.applyFilters();
    }
    const allInputs = form.querySelectorAll('input, select, textarea, dnd5e-checkbox');
    allInputs.forEach((input) => {
      const inputKey = this.#getInputKey(input);
      if (!inputKey) return;
      let value;
      if (input.type === 'checkbox' || input.matches('dnd5e-checkbox')) value = input.checked;
      else if (input.tagName === 'SELECT' && input.multiple) value = Array.from(input.selectedOptions).map((option) => option.value);
      else value = input.value;
      this._formStateCache.set(inputKey, value);
    });
    log(3, 'Updated form state cache.');
  }

  /* -------------------------------------------- */
  /*  Action Handlers                             */
  /* -------------------------------------------- */

  /**
   * Handle spell comparison selection and dialog management.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static async #compareSpell(_event, target) {
    log(3, 'Handling spell comparison.', { _event, target });
    const spellUuid = target.dataset.uuid;
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
    }
  }

  /**
   * Handle opening spell note dialog.
   * @this SpellBook
   * @param {PointerEvent} event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static async #editNote(event, target) {
    log(3, 'Handling note editing.', { event, target });
    event.preventDefault();
    const spellUuid = target.dataset.uuid;
    if (!spellUuid) return;
    const spellName = target.closest('.name-stacked')?.querySelector('.title')?.textContent?.trim();
    if (!spellName) return;
    new SpellNotes({ spellUuid, spellName, actor: this.actor }).render({ force: true });
  }

  /**
   * Handle learning spell.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static async #learnSpell(_event, target) {
    log(3, 'Handling spell learning.', { _event, target });
    const spellUuid = target.dataset.uuid;
    if (!spellUuid) return;
    const collapsedLevels = Array.from(this.element.querySelectorAll('.spell-level.collapsed')).map((el) => el.dataset.level);
    const activeTab = this.tabGroups['spellbook-tabs'];
    const wizardMatch = activeTab.match(/^wizardbook-(.+)$/);
    const classIdentifier = wizardMatch ? wizardMatch[1] : 'wizard';
    const wizardManager = this.wizardManagers.get(classIdentifier);
    if (!wizardManager) return;
    const spell = await fromUuid(spellUuid);
    if (!spell) return;
    const costInfo = await wizardManager.getCopyingCost(spell);
    const time = wizardManager.getCopyingTime(spell);
    const costText = costInfo.isFree ? game.i18n.localize('SPELLBOOK.Wizard.SpellCopyFree') : game.i18n.format('SPELLBOOK.Wizard.SpellCopyCost', { cost: costInfo.cost });
    const content = await renderTemplate(TEMPLATES.DIALOGS.WIZARD_LEARN_SPELL, { spell, costText, time });
    const result = await DialogV2.wait({
      window: { title: game.i18n.format('SPELLBOOK.Wizard.LearnSpellTitle', { name: spell.name }) },
      content: content,
      buttons: [
        { icon: 'fas fa-book', label: game.i18n.localize('SPELLBOOK.Wizard.LearnSpellButton'), action: 'confirm', className: 'dialog-button' },
        { icon: 'fas fa-times', label: game.i18n.localize('SPELLBOOK.UI.Cancel'), action: 'cancel', className: 'dialog-button' }
      ],
      default: 'confirm',
      rejectClose: false
    });
    if (result === 'confirm') {
      const success = await wizardManager.copySpell(spellUuid, costInfo.cost, time, costInfo.isFree);
      if (success) {
        if (this._state.wizardbookCache) this._state.wizardbookCache.set(classIdentifier, [...(this._state.wizardbookCache.get(classIdentifier) || []), spellUuid]);
        this._state.updateWizardBook(classIdentifier, costInfo.isFree);
        await this._state.refreshClassSpellData(classIdentifier);
        const spellItem = this.element.querySelector(`.spell-item[data-spell-uuid="${spellUuid}"]`);
        if (spellItem) {
          const buttonContainer = spellItem.querySelector('.wizard-spell-status');
          if (buttonContainer) {
            const source = costInfo.isFree ? MODULE.WIZARD_SPELL_SOURCE.FREE : MODULE.WIZARD_SPELL_SOURCE.COPIED;
            const labelKey = WizardBook.getLearnedLabelKey(source);
            buttonContainer.innerHTML = `<span class="in-spellbook-tag learned-${source}" aria-label="Spell is in your spellbook">${game.i18n.localize(labelKey)}</span>`;
          }
          spellItem.classList.add('in-wizard-spellbook', 'prepared-spell');
        }
        this.render(false);
        setTimeout(async () => {
          if (activeTab && this.tabGroups['spellbook-tabs'] !== activeTab) await this.changeTab(activeTab, 'spellbook-tabs');
          collapsedLevels.forEach((levelId) => {
            const levelEl = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
            if (levelEl) {
              levelEl.classList.add('collapsed');
              const heading = levelEl.querySelector('.spell-level-heading');
              if (heading) heading.setAttribute('aria-expanded', 'false');
            }
          });
          this.filterHelper.applyFilters();
        }, 50);
      }
    }
  }

  /**
   * Handle learning a spell from a scroll.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static async #learnSpellFromScroll(_event, target) {
    log(3, 'Handling spell level toggling.', { _event, target });
    const spellUuid = target.dataset.uuid;
    const scrollId = target.dataset.scrollId;
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._state.activeClass;
    if (!classIdentifier) return;
    if (!spellUuid || !scrollId) return;
    const scrollSpellData = this._state.scrollSpells.find((s) => s.spellUuid === spellUuid && s.scrollId === scrollId);
    if (!scrollSpellData) return;
    const wizardManager = this.wizardManager;
    if (!wizardManager) return;
    const success = await DataUtils.ScrollProcessor.learnSpellFromScroll(this.actor, scrollSpellData, wizardManager);
    if (success) {
      await this._state.refreshClassSpellData(classIdentifier);
      this.render(false);
    }
  }

  /**
   * Handle opening analytics dashboard.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static async #openAnalytics(_event, _target) {
    log(3, 'Handling analytics dashboard opening.', { _event, _target });
    new AnalyticsDashboard().render({ force: true });
  }

  /**
   * Handle opening customization dialog.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static #openCustomization(_event, _target) {
    log(3, 'Handling opening customization dialog.', { _event, _target });
    new DetailsCustomization().render({ force: true });
  }

  /**
   * Handle opening spellbook filter configuration.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static #openFilterConfig(_event, _target) {
    log(3, 'Handling spell level toggling.', { _event, _target });
    new PlayerFilterConfiguration(this).render({ force: true });
  }

  /**
   * Handle opening loadout dialog or context menu.
   * @this SpellBook
   * @param {PointerEvent} event - The originating click or contextmenu event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static async #openLoadouts(event, target) {
    log(3, 'Handling loadout action.', { event, target, type: event.type });
    if (event.type === 'contextmenu') {
      event.preventDefault();
      await this._showLoadoutContextMenu(event, target);
      return;
    }
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._state.activeClass;
    if (!classIdentifier) return;
    new LoadoutSelector(this.actor, this, classIdentifier).render({ force: true });
  }

  /**
   * Handle opening party manager or context menu.
   * @this SpellBook
   * @param {PointerEvent} event - The originating click or contextmenu event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static async #openPartyMode(event, target) {
    log(3, 'Handling party action.', { event, target, type: event.type });
    if (event.type === 'contextmenu') {
      event.preventDefault();
      await this._showPartyContextMenu(event, target);
      return;
    }
    const primaryGroup = PartyMode.getPrimaryGroupForActor(this.actor);
    if (!primaryGroup) return;
    const partyActors = PartyMode.getPartyActors(primaryGroup);
    if (partyActors.length === 0) return;
    new PartyCoordinator(partyActors, this.actor, primaryGroup).render({ force: true });
  }

  /**
   * Handle opening spellbook settings dialog.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static #openSettings(_event, _target) {
    log(3, 'Handling spell level toggling.', { _event, _target });
    new SpellBookSettings(this.actor, { parentApp: this }).render({ force: true });
  }

  /**
   * Handle reset button click.
   * @this SpellBook
   * @param {PointerEvent} event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static #reset(event, _target) {
    log(3, 'Handling reset.', { event, _target });
    const isShiftReset = event.shiftKey;
    if (isShiftReset) {
      const checkboxes = this.element.querySelectorAll('dnd5e-checkbox[data-uuid]:not([disabled])');
      checkboxes.forEach((checkbox) => (checkbox.checked = false));
      const filters = this.element.querySelectorAll('.spell-filters input, .spell-filters select, .spell-filters dnd5e-checkbox');
      filters.forEach((filter) => {
        if (filter.type === 'checkbox' || filter.tagName === 'DND5E-CHECKBOX') filter.checked = false;
        else if (filter.type === 'text' || filter.type === 'number') filter.value = '';
        else if (filter.tagName === 'SELECT') filter.selectedIndex = 0;
      });
      const spellItems = this.element.querySelectorAll('.spell-item');
      spellItems.forEach((item) => {
        const checkbox = item.querySelector('dnd5e-checkbox');
        if (checkbox && !checkbox.disabled) item.classList.remove('prepared-spell');
      });
      const favoriteButtons = this.element.querySelectorAll('.spell-favorite-toggle[data-uuid]');
      favoriteButtons.forEach((button) => {
        const spellUuid = button.dataset.uuid;
        if (spellUuid) {
          this.ui.updateFavoriteButtonState(button, false);
          this._state.updateFavoriteSessionState(spellUuid, false);
        }
      });
      const collapsedLevels = this.element.querySelectorAll('.spell-level.collapsed');
      collapsedLevels.forEach((level) => {
        level.classList.remove('collapsed');
        const heading = level.querySelector('.spell-level-heading');
        if (heading) heading.setAttribute('aria-expanded', 'true');
      });
      game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS, []);
      this.filterHelper.invalidateFilterCache();
      this.filterHelper.applyFilters();
      this.ui.updateSpellPreparationTracking();
      this.ui.updateCantripCounter();
      event.preventDefault();
    } else {
      setTimeout(() => {
        const filters = this.element.querySelectorAll('.spell-filters input, .spell-filters select, .spell-filters dnd5e-checkbox');
        filters.forEach((filter) => {
          if (filter.type === 'checkbox' || filter.tagName === 'DND5E-CHECKBOX') filter.checked = false;
          else if (filter.type === 'text' || filter.type === 'number') filter.value = '';
          else if (filter.tagName === 'SELECT') filter.selectedIndex = 0;
        });
        const spellItems = this.element.querySelectorAll('.spell-item');
        spellItems.forEach((item) => {
          const checkbox = item.querySelector('dnd5e-checkbox');
          if (checkbox && !checkbox.checked) item.classList.remove('prepared-spell');
        });
        const collapsedLevels = this.element.querySelectorAll('.spell-level.collapsed');
        collapsedLevels.forEach((level) => {
          level.classList.remove('collapsed');
          const heading = level.querySelector('.spell-level-heading');
          if (heading) heading.setAttribute('aria-expanded', 'true');
        });
        game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS, []);
        this.filterHelper.invalidateFilterCache();
        this.filterHelper.applyFilters();
        this.ui.updateSpellPreparationTracking();
        this.ui.updateCantripCounter();
      }, 0);
    }
  }

  /**
   * Handle save button click.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static async #save(_event, _target) {
    log(3, 'Handling save.', { _event, _target });
    const actor = this.actor;
    if (!actor) return;
    const form = this.element.querySelector('form') || this.element;
    const existingPreparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const spellDataByClass = {};
    const checkboxes = form.querySelectorAll('dnd5e-checkbox[data-uuid]');
    for (const checkbox of checkboxes) {
      const uuid = checkbox.dataset.uuid;
      const name = checkbox.dataset.name;
      const wasPrepared = checkbox.dataset.wasPrepared === 'true';
      const isPrepared = checkbox.checked;
      const isRitual = checkbox.dataset.ritual === 'true';
      const sourceClass = checkbox.dataset.sourceClass || game.i18n.localize('Unknown');
      const spellItem = checkbox.closest('.spell-item');
      const spellLevel = spellItem?.dataset.spellLevel ? parseInt(spellItem.dataset.spellLevel) : 0;
      if (!spellDataByClass[sourceClass]) spellDataByClass[sourceClass] = {};
      const classSpellKey = `${sourceClass}:${uuid}`;
      const classData = this._state.classSpellData[sourceClass];
      const classItem = classData?.classItem;
      const isPactCaster = classItem?.system?.spellcasting?.type === MODULE.SPELL_MODE.PACT;
      let preparationMode = MODULE.SPELL_MODE.SPELL;
      if (isPactCaster && spellLevel > 0) preparationMode = MODULE.SPELL_MODE.PACT;
      spellDataByClass[sourceClass][classSpellKey] = { uuid, name, wasPrepared, isPrepared, isRitual, sourceClass, spellItem, spellLevel, classSpellKey, preparationMode };
    }
    this._state.clearFavoriteSessionState();
    await this._state.addMissingRitualSpells(spellDataByClass);
    const allChangesByClass = {};
    for (const [classIdentifier, classSpellData] of Object.entries(spellDataByClass)) {
      const saveResult = await this.spellManager.saveClassSpecificPreparedSpells(classIdentifier, classSpellData);
      if (saveResult) {
        allChangesByClass[classIdentifier] = { cantripChanges: saveResult.cantripChanges || { added: [], removed: [] }, spellChanges: saveResult.spellChanges || { added: [], removed: [] } };
      }
      const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
      for (const [classIdentifier, preparedSpells] of Object.entries(existingPreparedByClass)) if (!spellDataByClass[classIdentifier]) preparedByClass[classIdentifier] = preparedSpells;
      await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
    }
    await this._state.sendGMNotifications(spellDataByClass, allChangesByClass);
    await this._state.handlePostProcessing(actor);
    this._newlyCheckedCantrips.clear();
    await UIUtils.processFavoritesFromForm(form, actor);
    this._formStateCache.clear();
    if (actor.sheet.rendered) actor.sheet.render(true);
    if (game.modules.get('chris-premades')?.active && game.settings.get(MODULE.ID, SETTINGS.CPR_COMPATIBILITY)) await chrisPremades.utils.actorUtils.updateAll(actor);
    ui.notifications.info('SPELLBOOK.UI.ChangesSaved', { localize: true });
    this.close();
  }

  /**
   * Handle toggling spell favorite status.
   * @this SpellBook
   * @param {PointerEvent} event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static async #toggleFavorite(event, target) {
    log(3, 'Handling favorite toggling.', { event, target });
    event.preventDefault();
    const spellUuid = target.dataset.uuid;
    if (!spellUuid) return;
    try {
      let targetUserId = game.user.id;
      let targetActorId = this.actor.id;
      if (game.user.isActiveGM) {
        const actorOwner = game.users.find((user) => user.character?.id === this.actor.id);
        if (actorOwner) targetUserId = actorOwner.id;
        else log(2, `No owner found for actor ${this.actor.name}, applying to GM`);
      }
      const userData = await DataUtils.UserData.getUserDataForSpell(spellUuid, targetUserId, targetActorId);
      const currentlyFavorited = userData?.favorited || false;
      const newFavoriteStatus = !currentlyFavorited;
      this._state.updateFavoriteSessionState(spellUuid, newFavoriteStatus);
      const success = await DataUtils.UserData.setSpellFavorite(spellUuid, newFavoriteStatus, targetUserId, targetActorId);
      if (!success) {
        this._state.updateFavoriteSessionState(spellUuid, currentlyFavorited);
        return;
      }
      if (newFavoriteStatus) await UIUtils.addSpellToActorFavorites(spellUuid, this.actor);
      else await UIUtils.removeSpellFromActorFavorites(spellUuid, this.actor);
      this.ui.updateFavoriteButtonState(target, newFavoriteStatus);
    } catch (error) {
      log(1, 'Error toggling favorite:', error);
      const userData = await DataUtils.UserData.getUserDataForSpell(spellUuid, null, this.actor.id);
      this._state.updateFavoriteSessionState(spellUuid, userData?.favorited || false);
    }
  }

  /**
   * Handle toggling sidebar.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #toggleSidebar(_event, target) {
    log(3, 'Handling sidebar toggling!', { _event, target });
    const isCollapsing = !this.element.classList.contains('sidebar-collapsed');
    this.element.classList.toggle('sidebar-collapsed');
    const caretIcon = target.querySelector('.collapse-indicator');
    if (caretIcon) caretIcon.className = isCollapsing ? 'fas fa-caret-right collapse-indicator' : 'fas fa-caret-left collapse-indicator';
    this.ui.positionFooter();
    game.user.setFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED, isCollapsing);
  }

  /**
   * Handle toggling spell header.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #toggleSpellHeader(_event, target) {
    log(3, 'Handling spell level toggling.', { _event, target });
    const levelContainer = target.parentElement;
    if (!levelContainer || !levelContainer.classList.contains('spell-level')) return;
    const levelId = levelContainer.dataset.level;
    levelContainer.classList.toggle('collapsed');
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
    const isCollapsed = levelContainer.classList.contains('collapsed');
    if (isCollapsed && !collapsedLevels.includes(levelId)) collapsedLevels.push(levelId);
    else if (!isCollapsed && collapsedLevels.includes(levelId)) collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
    game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS, collapsedLevels);
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

  /* -------------------------------------------- */
  /*  Helper & Factory Methods                    */
  /* -------------------------------------------- */

  /**
   * @returns {Promise<void>}
   */
  async _preInitialize() {
    if (this._preInitialized) return;
    if (!this._state._initialized) await this._state.initialize();
    if (!this._state._classesDetected) this._state.detectSpellcastingClasses();
    this.#loadDynamicTabs();
    if (!this._classColorsApplied || this._classesChanged) await this.ui.prepareClassStylingData();
    const changedSpells = await DataUtils.UserData.syncActorFavoritesToJournal(this.actor);
    if (changedSpells.length > 0) this.ui.applyImmediateFavoriteChanges(changedSpells);
    this._preInitialized = true;
    log(3, 'Pre-initialization complete.');
  }

  /**
   * Generate a unique cache key for form inputs.
   * @param {HTMLElement} input - The input element
   * @returns {string|null} The cache key or null if input shouldn't be cached
   * @private
   */
  #getInputKey(input) {
    if (input.disabled || input.readonly) return null;
    if (input.name) return `name:${input.name}`;
    if ((input.type === 'checkbox' || input.matches('dnd5e-checkbox')) && input.dataset.uuid) {
      const sourceClass = input.dataset.sourceClass || game.i18n.localize('Unknown');
      return `checkbox:${sourceClass}:${input.dataset.uuid}`;
    }
    if (input.id) return `id:${input.id}`;
    return null;
  }

  /**
   * Check if a specific class needs a validation notice.
   * @param {string} classIdentifier - The class identifier
   * @param {string} className - The class name
   * @returns {Object|null} Notice object or null
   * @private
   */
  #prepareClassValidationNotice(classIdentifier, className) {
    log(3, 'Preparing class validation notice.', { classIdentifier, className });
    const classItem = this.actor.items.find((item) => item.type === 'class' && (item.system?.identifier?.toLowerCase() === classIdentifier || item.name.toLowerCase() === classIdentifier));
    if (!classItem) {
      log(2, `Class item not found for identifier: ${classIdentifier}`);
      return null;
    }
    const compendiumSource = classItem._stats?.compendiumSource;
    const isFromCompendium = !!(compendiumSource && compendiumSource.startsWith('Compendium.'));
    const isDnDBeyondClass = !!classItem?.flags?.ddbimporter;
    log(3, 'Class validation check:', { classIdentifier, compendiumSource, isFromCompendium, isDnDBeyondClass });
    if (!isFromCompendium && !isDnDBeyondClass) {
      const customSpellListSetting = this.actor.getFlag(MODULE.ID, `classRules.${classIdentifier}.customSpellList`);
      const hasCustomSpellList = !!(customSpellListSetting && customSpellListSetting !== 'auto');
      log(3, 'Custom spell list check:', { customSpellListSetting, hasCustomSpellList });
      if (!hasCustomSpellList) {
        log(2, `Showing validation notice for ${className} (not from compendium, no custom spell list)`);
        return {
          type: 'warning',
          icon: 'fas fa-exclamation-triangle',
          title: game.i18n.localize('SPELLBOOK.Notices.ClassValidationWarning'),
          message: game.i18n.format('SPELLBOOK.Notices.ClassNotFromCompendium', { className: className })
        };
      }
    }
    return null;
  }

  /**
   * Process spell levels for context preparation.
   * @param {Array<Object>} spellLevels - Raw spell level data
   * @returns {Promise<Array<Object>>} Processed spell levels ready for template
   * @private
   */
  async #processSpellsByLevel(spellLevels) {
    log(3, 'Processing spell levels for context:', { spellLevels });
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
    const enabledElements = this.enabledElements;
    const processedLevels = [];

    for (const levelData of spellLevels) {
      const level = String(levelData.level);
      const spells = levelData.spells || [];
      const isCollapsed = collapsedLevels.includes(level);

      // Process spells for this level (inlined from #processSpellsByLevel)
      log(3, 'Beginning spells for level processing:', { spells });
      const processedSpells = [];

      for (const spell of spells) {
        // Build spell for display (inlined from #buildSpellForDisplay)
        const processedSpell = foundry.utils.deepClone(spell);
        if (!spell.compendiumUuid) spell.compendiumUuid = spell.uuid;
        const classes = ['spell-item'];
        if (spell.preparation?.prepared) classes.push('prepared-spell');
        if (this._state.wizardbookCache && spell.sourceClass) {
          const classSpellbook = this._state.wizardbookCache.get(spell.sourceClass);
          if (classSpellbook?.includes(spell.compendiumUuid)) classes.push('in-wizard-spellbook');
        }
        processedSpell.cssClasses = classes.join(' ');
        processedSpell.dataAttributes = UIUtils.getSpellDataAttributes(spell);
        if (!spell.tags) spell.tags = UIUtils.getSpellPreparationTags(spell, this.actor);
        processedSpell.tags = spell.tags;

        const ariaLabel = spell.preparation.prepared
          ? game.i18n.format('SPELLBOOK.Preparation.Unprepare', { name: spell.name })
          : game.i18n.format('SPELLBOOK.Preparation.Prepare', { name: spell.name });
        const checkbox = ValidationUtils.createCheckbox({
          name: `spell-${spell.system.identifier}`,
          checked: spell.preparation.prepared,
          disabled: spell.preparation.disabled,
          ariaLabel: ariaLabel
        });
        checkbox.id = `prep-${spell.system.identifier}`;
        checkbox.dataset.uuid = spell.compendiumUuid;
        checkbox.dataset.name = spell.name;
        checkbox.dataset.ritual = spell.filterData?.isRitual || false;
        checkbox.dataset.wasPrepared = spell.preparation.prepared;

        let sourceClass = null;
        if (spell.system?.sourceClass) sourceClass = spell.system.sourceClass;
        else if (spell.sourceClass) sourceClass = spell.sourceClass;
        else if (spell.preparation?.preparedByOtherClass) sourceClass = spell.preparation.preparedByOtherClass;

        if (sourceClass) checkbox.dataset.sourceClass = sourceClass;
        else {
          log(3, `Checking if ${spell.name} should have source class set.`, { spell });
          const shouldHaveSourceClass = spell.preparation?.prepared && spell.system?.prepared !== 2 && !spell.flags?.dnd5e?.cachedFor;
          if (shouldHaveSourceClass) {
            const fixedSourceClass = this.spellManager.attemptToFixSourceClass(spell);
            if (fixedSourceClass) {
              checkbox.dataset.sourceClass = fixedSourceClass;
              if (!this._sourceClassFixQueue) this._sourceClassFixQueue = [];
              this._sourceClassFixQueue.push({ spellId: spell._id, spellName: spell.name, sourceClass: fixedSourceClass });
            } else {
              log(2, `No source class found for prepared spell: ${spell.name}`, {
                spell,
                preparation: spell.preparation,
                spellcastingClasses: Object.keys(this.actor.spellcastingClasses || {})
              });
            }
          }
        }

        if (spell.preparation?.preparedByOtherClass) checkbox.dataset.crossClass = 'true';
        if (spell.preparation?.disabled && spell.preparation?.disabledReason) checkbox.dataset.tooltip = game.i18n.localize(spell.preparation.disabledReason);
        processedSpell.preparationCheckboxHtml = ValidationUtils.elementToHtml(checkbox);

        if (spell.sourceClass && this._state.wizardbookCache) {
          const classSpellbook = this._state.wizardbookCache.get(spell.sourceClass);
          processedSpell.inWizardSpellbook = classSpellbook ? classSpellbook.includes(spell.compendiumUuid) : false;
        } else processedSpell.inWizardSpellbook = false;

        if (this.comparisonSpells.size < game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX)) {
          processedSpell.showCompareLink = true;
          processedSpell.isInComparison = this.comparisonSpells.has(spell.compendiumUuid);
        }

        // Build spell metadata and UI elements
        const spellUuid = processedSpell.uuid || processedSpell.compendiumUuid;
        const comparisonIcon = {
          enabled: enabledElements.has('compare') && processedSpell.showCompareLink,
          active: processedSpell.isInComparison,
          uuid: processedSpell.compendiumUuid,
          tooltip: game.i18n.localize('SPELLBOOK.Comparison.Compare'),
          ariaLabel: game.i18n.format('SPELLBOOK.Comparison.CompareSpell', { name: processedSpell.name })
        };
        const favoriteButton = {
          enabled: enabledElements.has('favorites') && spellUuid,
          favorited: processedSpell.favorited,
          uuid: spellUuid,
          tooltip: processedSpell.favorited ? game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites') : game.i18n.localize('SPELLBOOK.UI.AddToFavorites'),
          iconClass: processedSpell.favorited ? 'fas' : 'far'
        };
        const notesIcon = {
          enabled: enabledElements.has('notes') && spellUuid,
          hasNotes: processedSpell.hasNotes,
          uuid: spellUuid,
          tooltip: processedSpell.hasNotes ? game.i18n.localize('SPELLBOOK.UI.HasNotes') : game.i18n.localize('SPELLBOOK.UI.AddNotes'),
          iconClass: processedSpell.hasNotes ? 'fas fa-sticky-note' : 'far fa-sticky-note'
        };

        let learningSource = null;
        let learningSourceLabel = null;
        if (processedSpell.inWizardSpellbook && processedSpell.sourceClass) {
          const wizardManager = this.wizardManagers.get(processedSpell.sourceClass);
          if (wizardManager) {
            const spellUuid = processedSpell.spellUuid || processedSpell.compendiumUuid;
            learningSource = await wizardManager.getSpellLearningSource(spellUuid);
            learningSourceLabel = game.i18n.localize(WizardBook.getLearnedLabelKey(learningSource));
          }
        }
        const wizardAction = {
          isFromScroll: processedSpell.isFromScroll,
          inSpellbook: processedSpell.inWizardSpellbook,
          canLearn: processedSpell.system?.level > 0 && !processedSpell.inWizardSpellbook && !processedSpell.isFromScroll,
          uuid: processedSpell.spellUuid || processedSpell.compendiumUuid,
          scrollId: processedSpell.scrollId,
          ariaLabel: game.i18n.format('SPELLBOOK.Scrolls.LearnFromScroll', { name: processedSpell.name }),
          learningSource: learningSource,
          learningSourceLabel: learningSourceLabel
        };

        // Prepare party icons data
        const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
        let partyIcons = { enabled: false, icons: [] };
        if (isPartyMode) {
          const partyActors = PartyMode.getPartyActors();
          const tokenLimit = game.settings.get(MODULE.ID, SETTINGS.PARTY_MODE_TOKEN_LIMIT);
          const spellUuid = processedSpell.sourceUuid || processedSpell.compendiumUuid || processedSpell.uuid;
          const icons = [];
          let iconCount = 0;
          for (const actor of partyActors) {
            if (iconCount >= tokenLimit) break;
            if (actor.id === this.actor.id) continue;
            if (PartyMode.actorHasSpell(actor, spellUuid)) {
              const associatedUser = game.users.find((user) => user.character?.id === actor.id);
              const userColor = associatedUser?.color?.css || game.user.color.css || 'transparent';
              icons.push({ src: actor.img, name: actor.name, actorId: actor.id, userColor: userColor });
              iconCount++;
            }
          }
          partyIcons = { enabled: icons.length > 0, icons: icons };
        }

        const formattedDetails = UIUtils.CustomUI.buildPlayerMetadata(processedSpell, enabledElements, this.actor);
        let materialComponentsTooltip = '';
        const hasMaterialComponents = processedSpell.filterData?.materialComponents?.hasConsumedMaterials === true;
        if (hasMaterialComponents && formattedDetails) {
          const lastIconIndex = formattedDetails.lastIndexOf('</i>');
          materialComponentsTooltip = lastIconIndex !== -1 ? formattedDetails.substring(lastIconIndex + 4).trim() : formattedDetails;
        }

        const finalSpell = {
          ...processedSpell,
          name: processedSpell.name,
          cssClasses: processedSpell.cssClasses || 'spell-item',
          comparisonIcon,
          favoriteButton,
          notesIcon,
          wizardAction,
          partyIcons,
          formattedDetails,
          materialComponentsTooltip,
          preparationCheckboxHtml: processedSpell.preparationCheckboxHtml
        };
        processedSpells.push(finalSpell);
      }

      await this.spellManager.applySourceClassFixes();
      log(3, 'Finishing spells for level processing:', { spells, processedSpells });

      let preparedCount = 0;
      if (level !== '0') preparedCount = spells.filter((spell) => spell.preparation?.prepared).length;
      const cantripCounter = { enabled: level === '0', current: 0, maximum: 0 };
      processedLevels.push({ level, levelName: levelData.name, spells: processedSpells, isCollapsed, preparedCount, cantripCounter });
    }
    return processedLevels;
  }

  /**
   * Register class-specific parts for all spellcasting classes and wizard tabs.
   * @private
   */
  #loadDynamicTabs() {
    if (this._state.spellcastingClasses) {
      for (const [identifier, classData] of Object.entries(this._state.spellcastingClasses)) {
        const tabId = `${identifier}Tab`;
        this.constructor.PARTS[tabId] = {
          template: TEMPLATES.PLAYER_SPELL_BOOK.TAB_SPELLS,
          scrollable: [''],
          data: { classIdentifier: identifier, className: classData.name }
        };
        log(3, 'Registering class part:', { identifier, classData });
      }
    }
    const wizardClasses = this._state.getWizardEnabledClasses();
    for (const { identifier } of wizardClasses) {
      const tabId = `wizardbook-${identifier}`;
      this.constructor.PARTS[tabId] = {
        template: TEMPLATES.PLAYER_SPELL_BOOK.TAB_WIZARD_SPELLBOOK,
        scrollable: [''],
        data: { classIdentifier: identifier }
      };
      log(3, 'Registering wizard class part:', { identifier });
    }
    log(3, 'Registered class parts:', { parts: this.constructor.PARTS });
  }

  /**
   * Set up the content wrapper element to allow hiding sidebar in collapsed mode.
   * @private
   */
  #setupContentWrapper() {
    log(3, 'Building content wrapper.');
    if (!this.element.querySelector('.content-wrapper')) {
      const tabsNav = this.element.querySelector('.window-content > nav.tabs.tabs-right');
      const wrapper = document.createElement('div');
      wrapper.className = 'content-wrapper';
      const elementsToWrap = [this.element.querySelector('.sidebar'), this.element.querySelector('.spell-book-container'), this.element.querySelector('.window-content > footer')].filter((el) => el);
      if (elementsToWrap.length && elementsToWrap[0].parentNode) {
        elementsToWrap[0].parentNode.insertBefore(wrapper, elementsToWrap[0]);
        elementsToWrap.forEach((el) => wrapper.appendChild(el));
        if (tabsNav && tabsNav.parentNode === wrapper) this.element.querySelector('.window-content').appendChild(tabsNav);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Context Menu System                         */
  /* -------------------------------------------- */

  /**
   * Show context menu with available loadouts.
   * @param {PointerEvent} event - The contextmenu event
   * @param {HTMLElement} target - The button element
   * @private
   */
  async _showLoadoutContextMenu(event, target) {
    log(3, 'Showing loadout context menu.');
    this._hideContextMenu();
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._state.activeClass;
    if (!classIdentifier) return;
    const loadoutManager = new Loadouts(this.actor, this);
    const availableLoadouts = loadoutManager.getAvailableLoadouts(classIdentifier);
    if (availableLoadouts.length === 0) return;
    const items = availableLoadouts.map((loadout) => ({
      id: loadout.id,
      icon: 'fas fa-magic',
      label: `${loadout.name} (${loadout.spellConfiguration?.length || 0})`,
      action: async () => {
        await loadoutManager.applyLoadout(loadout.id, classIdentifier);
        this._hideContextMenu();
      }
    }));
    const menu = this._createContextMenu('loadout', items);
    this._positionContextMenu(menu, event, target, 'left');
    this._setupContextMenuClickHandler();
  }

  /**
   * Show context menu for party mode toggle.
   * @param {PointerEvent} event - The contextmenu event
   * @param {HTMLElement} target - The button element
   * @private
   */
  async _showPartyContextMenu(event, target) {
    log(3, 'Showing party context menu.');
    this._hideContextMenu();
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    const items = [
      {
        id: 'toggle-party-mode',
        icon: `fas ${isPartyMode ? 'fa-eye-slash' : 'fa-users'}`,
        label: game.i18n.localize(isPartyMode ? 'SPELLBOOK.Party.DisablePartyMode' : 'SPELLBOOK.Party.EnablePartyMode'),
        action: async () => {
          const primaryGroup = PartyMode.getPrimaryGroupForActor(this.actor);
          if (primaryGroup) {
            await this.actor.setFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED, !isPartyMode);
            await this.render();
          }
          this._hideContextMenu();
        }
      }
    ];
    const menu = this._createContextMenu('party', items);
    this._positionContextMenu(menu, event, target, 'above');
    this._setupContextMenuClickHandler();
  }

  /**
   * Create a context menu element.
   * @param {string} type - Menu type identifier
   * @param {Array<{id: string, icon: string, label: string, action: Function}>} items - Menu items
   * @returns {HTMLElement} The menu element
   * @private
   */
  _createContextMenu(type, items) {
    const menu = document.createElement('div');
    menu.id = `spell-book-context-menu-${type}`;
    menu.className = 'spell-book-context-menu';
    menu.dataset.menuType = type;
    menu.innerHTML = items
      .map(
        (item) => `
      <div class="context-menu-item" data-item-id="${item.id}">
        <i class="${item.icon} item-icon" aria-hidden="true"></i>
        <span class="item-text">${item.label}</span>
      </div>
    `
      )
      .join('');
    menu.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.context-menu-item');
      if (!itemEl) return;
      const itemId = itemEl.dataset.itemId;
      const item = items.find((i) => i.id === itemId);
      if (item?.action) await item.action();
    });
    document.body.appendChild(menu);
    return menu;
  }

  /**
   * Position a context menu.
   * @param {HTMLElement} menu - The menu element
   * @param {PointerEvent} _event - The triggering event
   * @param {HTMLElement} target - The button element
   * @param {'left'|'above'} strategy - Positioning strategy
   * @private
   */
  _positionContextMenu(menu, _event, target, strategy) {
    const targetRect = target.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const appRect = this.element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    let left, top;
    if (strategy === 'left') {
      left = Math.max(10, appRect.left - menuRect.width);
      top = targetRect.top;
      if (top + menuRect.height > viewportHeight) {
        top = Math.max(10, viewportHeight - menuRect.height - 10);
      }
    } else if (strategy === 'above') {
      left = targetRect.left;
      top = targetRect.top - menuRect.height - 5;
      if (top < 10) top = targetRect.bottom + 5;
      if (left + menuRect.width > viewportWidth - 10) {
        left = targetRect.right - menuRect.width;
      }
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  /**
   * Setup click-outside handler to close menu.
   * @private
   */
  _setupContextMenuClickHandler() {
    if (!this._contextMenuClickHandler) {
      this._contextMenuClickHandler = (e) => {
        if (!e.target.closest('.spell-book-context-menu')) {
          this._hideContextMenu();
        }
      };
    }
    setTimeout(() => {
      document.addEventListener('click', this._contextMenuClickHandler);
    }, 0);
  }

  /**
   * Hide any active context menu.
   * @private
   */
  _hideContextMenu() {
    const existingMenu = document.querySelector('.spell-book-context-menu');
    if (existingMenu) existingMenu.remove();
    if (this._contextMenuClickHandler) {
      document.removeEventListener('click', this._contextMenuClickHandler);
    }
  }
}
