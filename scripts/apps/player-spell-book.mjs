/**
 * Player Spell Book Application
 *
 * The primary user-facing interface for managing spells, spell preparation, and spellcasting
 * capabilities. This application serves as the central hub for all spell-related
 * activities including preparation management, filter configuration, analytics access, and
 * party coordination features.
 *
 * Key features:
 * - Multi-class spell management with dynamic tab generation
 * - Advanced filtering system with customizable filter configurations
 * - Spell preparation enforcement with class-specific rules and validation
 * - Wizard spellbook management with learning and copying capabilities
 * - Cantrip management with level-up and long rest tracking
 * - Party mode integration with spell coordination
 * - Analytics dashboard integration for usage tracking
 * - Loadout system for quick spell configuration changes
 * - Favorites and notes system with persistent storage
 * - Spell comparison functionality for detailed analysis
 * - Responsive UI with collapsible sections and state persistence
 * - Context menu integration for advanced actions
 * - Real-time synchronization with actor data and journal storage
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
 * Spell preparation information for display and validation.
 *
 * @typedef {Object} SpellPreparation
 * @property {boolean} prepared - Whether the spell is currently prepared
 * @property {boolean} disabled - Whether preparation can be changed
 * @property {boolean} alwaysPrepared - Whether the spell is always prepared
 * @property {boolean} isGranted - Whether the spell is granted by a feature
 * @property {boolean} isOwned - Whether the spell is owned by the actor
 * @property {string} preparationMode - The preparation mode ('spell', 'pact', 'innate', etc.)
 * @property {string} [disabledReason] - Localization key for why preparation is disabled
 * @property {string} [preparedByOtherClass] - Class that prepared this spell
 * @property {Object} [sourceItem] - Item that grants this spell
 */

/**
 * Processed spell data for UI display.
 *
 * @typedef {Object} ProcessedSpell
 * @property {string} name - Spell name
 * @property {string} uuid - Spell UUID
 * @property {string} compendiumUuid - Compendium UUID for the spell
 * @property {Object} system - Spell system data
 * @property {SpellPreparation} preparation - Preparation information
 * @property {string} cssClasses - CSS classes for the spell item
 * @property {string} dataAttributes - HTML data attributes string
 * @property {string} preparationCheckboxHtml - HTML for preparation checkbox
 * @property {Object} [tag] - Preparation tag information
 * @property {boolean} [inWizardSpellbook] - Whether spell is in wizard spellbook
 * @property {boolean} [showCompareLink] - Whether to show comparison link
 * @property {boolean} [isInComparison] - Whether spell is in comparison set
 * @property {Object} [filterData] - Filter-related data
 */

/**
 * Class-specific spell data structure.
 *
 * @typedef {Object} ClassSpellData
 * @property {string} className - Display name of the class
 * @property {Object} classItem - The class item from the actor
 * @property {Array<Object>} spellLevels - Spell levels with their spells
 * @property {Object} spellPreparation - Current/maximum preparation counts
 */

/**
 * Tab configuration for the spell book interface.
 *
 * @typedef {Object} SpellBookTab
 * @property {string} id - Tab identifier
 * @property {string} label - Display label for the tab
 * @property {string} group - Tab group identifier
 * @property {string} cssClass - CSS classes for the tab
 * @property {string} icon - Icon for the tab
 * @property {Object} data - Additional data for the tab
 */

/**
 * Filter configuration for spell filtering.
 *
 * @typedef {Object} FilterConfig
 * @property {string} id - Filter identifier
 * @property {string} type - Filter type ('search', 'dropdown', 'checkbox', 'range')
 * @property {string} name - Form field name
 * @property {string} label - Display label
 * @property {boolean} enabled - Whether the filter is enabled
 * @property {string} elementHtml - HTML for the filter element
 */

/**
 * Button configuration for the spell book interface.
 *
 * @typedef {Object} SpellBookButton
 * @property {string} type - Button type ('submit', 'reset', 'button')
 * @property {string} [action] - Action handler for the button
 * @property {string} icon - Icon class for the button
 * @property {string} label - Button label localization key
 * @property {string} tooltip - Tooltip localization key
 * @property {string} cssClass - CSS class for the button
 */

/**
 * Party icon display information.
 *
 * @typedef {Object} PartyIconInfo
 * @property {string} actorId - Actor ID
 * @property {string} name - Actor name
 * @property {string} img - Actor image path
 * @property {boolean} hasSpell - Whether actor has the spell prepared
 */

/**
 * Cantrip change tracking information.
 *
 * @typedef {Object} CantripChanges
 * @property {boolean} hasChanges - Whether there are cantrip changes
 * @property {Array<string>} added - UUIDs of added cantrips
 * @property {Array<string>} removed - UUIDs of removed cantrips
 * @property {string} classIdentifier - Class that changed cantrips
 */

/**
 * Player-facing Spell Book application for managing prepared spells.
 */
export class SpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
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
      save: SpellBook._handleSave,
      toggleSidebar: SpellBook.toggleSidebar,
      filterSpells: SpellBook.filterSpells,
      reset: SpellBook.handleReset,
      toggleSpellLevel: SpellBook.toggleSpellLevel,
      configureFilters: SpellBook.configureFilters,
      configureCantripSettings: SpellBook.configureCantripSettings,
      learnSpell: SpellBook.learnSpell,
      learnFromScroll: SpellBook.handleLearnFromScroll,
      openLoadoutDialog: SpellBook.openLoadoutDialog,
      toggleFavorite: SpellBook.handleToggleFavorite,
      editNotes: SpellBook.handleEditNotes,
      openAnalyticsDashboard: SpellBook.handleOpenAnalyticsDashboard,
      compareSpell: SpellBook.handleCompareSpell,
      openCustomization: SpellBook.handleOpenCustomization,
      openPartyManager: SpellBook.openPartyManager,
      togglePartyMode: SpellBook.togglePartyMode
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
  get title() {
    return game.i18n.format('SPELLBOOK.Application.ActorTitle', { name: this.actor.name });
  }

  /**
   * Get the primary wizard manager for backward compatibility.
   * @returns {WizardBook|null} The primary wizard manager instance or null if none found
   */
  get wizardManager() {
    for (const [identifier, manager] of this.wizardManagers) if (manager.isWizard) if (identifier === 'wizard') return manager;
    for (const [manager] of this.wizardManagers) if (manager.isWizard) return manager;
    return null;
  }

  /**
   * Create a new SpellBook application.
   * @param {Actor} actor - The actor whose spells to display
   * @param {Object} [options={}] - Application options
   */
  constructor(actor, options = {}) {
    super(options);

    /** @type {Actor} The actor whose spells are being managed */
    this.actor = actor;

    /** @type {Actor|null} The primary group actor for this actor */
    this.group = PartyMode.getPrimaryGroupForActor(actor);

    /** @type {SpellManager} Main spell management instance */
    this.spellManager = new SpellManager(actor);

    /** @type {Map<string, WizardBook>} Wizard managers by class identifier */
    this.wizardManagers = new Map();

    // Initialize wizard managers for all wizard-enabled classes
    const wizardClasses = DataUtils.getWizardEnabledClasses(actor);
    for (const { identifier } of wizardClasses) this.wizardManagers.set(identifier, new WizardBook(actor, identifier));

    /** @type {State} State manager for the application */
    this._state = new State(this);

    /** @type {UIUtils.SpellBookUI} UI helper for interface management */
    this.ui = new UIUtils.SpellBookUI(this);

    /** @type {UIUtils.Filters} Filter helper for spell filtering */
    this.filterHelper = new UIUtils.Filters(this);

    /** @type {Map} Ritual managers by class (currently unused) */
    this.ritualManagers = new Map();

    /** @type {Array} Spell levels data */
    this.spellLevels = [];

    /** @type {string} Current class name */
    this.className = '';

    /** @type {Object} Current spell preparation counts */
    this.spellPreparation = { current: 0, maximum: 0 };

    /** @type {Set<string>} Newly checked cantrips in this session */
    this._newlyCheckedCantrips = new Set();

    /** @type {boolean} Whether a long rest was completed */
    this._isLongRest = this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED) || false;

    /** @type {Map<string, any>} Internal form state cache for unsaved changes */
    this._formStateCache = new Map();

    // Register dynamic parts for class tabs
    this._registerClassParts();

    /** @type {boolean} Whether cantrip UI has been initialized */
    this._cantripUIInitialized = false;

    /** @type {boolean} Whether class colors have been applied */
    this._classColorsApplied = false;

    /** @type {boolean} Whether classes have changed since last render */
    this._classesChanged = false;

    /** @type {Map<string, string>} Wizard book images by class identifier */
    this._wizardBookImages = new Map();

    // Set up flag change listener for real-time updates
    this._flagChangeHook = Hooks.on('updateActor', (updatedActor, changes) => {
      if (updatedActor.id !== this.actor.id) return;
      if (changes.flags?.[MODULE.ID]) {
        const changedFlags = Object.keys(changes.flags[MODULE.ID]);
        const cantripFlagChanged = changedFlags.some((flag) => [FLAGS.CLASS_RULES, FLAGS.ENFORCEMENT_BEHAVIOR].includes(flag));
        const wizardFlagChanged = changedFlags.some((flag) => flag.startsWith(FLAGS.WIZARD_COPIED_SPELLS));
        if ((cantripFlagChanged || wizardFlagChanged) && this.rendered) {
          this.spellManager.cantripManager.clearCache();
          this.render(false);
        }
      }
    });

    /** @type {boolean} Whether spell data is currently being loaded */
    this._isLoadingSpellData = false;

    /** @type {Set<string>} Set of spell UUIDs for comparison */
    this.comparisonSpells = new Set();

    /** @type {SpellComparison|null} Active comparison dialog */
    this.comparisonDialog = null;

    /** @type {boolean} Whether expensive pre-initialization is complete */
    this._preInitialized = false;

    /** @type {Map<string, string>} Cached class styling data */
    this._classStylingCache = null;

    /** @type {boolean} Whether preparation listeners have been set up */
    this._preparationListenersSetup = false;
  }

  /**
   * @returns {Promise<void>}
   */
  async _preInitialize() {
    if (this._preInitialized) return;
    log(3, 'Pre-initializing SpellBook data...');
    const startTime = performance.now();
    try {
      if (!this._state._initialized) await this._state.initialize();
      if (!this._state._classesDetected) this._state.detectSpellcastingClasses();
      if (!this._classColorsApplied || this._classesChanged) await this._prepareClassStylingData();
      this._preInitialized = true;
      const elapsed = performance.now() - startTime;
      log(3, `Pre-initialization complete in ${elapsed.toFixed(2)}ms`);
    } catch (error) {
      log(1, 'Error during pre-initialization:', error);
      throw error;
    }
  }

  /**
   * Pre-calculate class styling data without DOM manipulation.
   * @returns {Promise<void>}
   * @private
   */
  async _prepareClassStylingData() {
    if (!this._classStylingCache) this._classStylingCache = new Map();
    if (this.wizardManagers.size > 0) {
      for (const [identifier, wizardManager] of this.wizardManagers) {
        if (wizardManager.isWizard) {
          const classData = this._state.spellcastingClasses[identifier];
          if (classData?.item) {
            try {
              const color = await UIUtils.getClassColorForWizardTab(classData.item);
              this._classStylingCache.set(identifier, color);
            } catch (error) {
              log(2, `Error pre-calculating color for ${identifier}:`, error);
            }
          }
        }
      }
    }
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    if (!this._preInitialized) await this._preInitialize();
    const context = this._createBaseContext(options);
    context.spellcastingClasses = this._state.spellcastingClasses;
    context.activeClass = this._state.activeClass;
    context.activeTab = this.tabGroups['spellbook-tabs'];
    context.tabs = this._getTabs();
    context.globalPrepared = this._state.spellPreparation;
    context.classPreparationData = this._prepareClassPreparationData();
    context.isWizard = !this.wizardManager?.isWizard;
    context.hasMultipleTabs = Object.keys(context.tabs).length > 1;
    context.filters = this._prepareFilters();
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
    return context;
  }

  /** @inheritdoc */
  async _preparePartContext(partId, context, options) {
    log(3, `Preparing context for part: ${partId}`);
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    const classMatch = partId.match(/^([^T]+)Tab$/);
    if (classMatch) {
      const classIdentifier = classMatch[1];
      log(3, `Processing class tab for identifier: ${classIdentifier}`);
      if (this._state.classSpellData[classIdentifier]) {
        context.classIdentifier = classIdentifier;
        context.className = this._state.classSpellData[classIdentifier].className;
        const rawSpellLevels = this._state.classSpellData[classIdentifier].spellLevels;
        context.spellLevels = await this._processSpellLevelsForContext(rawSpellLevels);
        context.spellPreparation = this._state.classSpellData[classIdentifier].spellPreparation;
        context.globalPrepared = this._state.spellPreparation;
        const classNotice = this._prepareClassValidationNotice(classIdentifier, context.className);
        context.hasClassNotice = !!classNotice;
        context.classNotice = classNotice;
      }
    }
    const wizardMatch = partId.match(/^wizardbook-(.+)$/);
    if (wizardMatch) {
      const classIdentifier = wizardMatch[1];
      log(3, `Processing wizard tab for identifier: ${classIdentifier}`);
      context.classIdentifier = classIdentifier;
      context.className = this._state.classSpellData[classIdentifier]?.className || classIdentifier;
      const wizardManager = this.wizardManagers.get(classIdentifier);
      context.isWizard = wizardManager?.isWizard || false;
      context.isForceWizard = wizardManager?.classItem && DataUtils.isClassWizardEnabled(this.actor, classIdentifier);
      const wizardTabData = this._state.tabData?.[partId];
      if (wizardTabData) {
        const rawSpellLevels = wizardTabData.spellLevels || [];
        context.spellLevels = await this._processSpellLevelsForContext(rawSpellLevels);
        context.spellLevels = await this._processSpellLevelsForContext(rawSpellLevels);
        context.spellPreparation = wizardTabData.spellPreparation;
        context.wizardTotalSpellbookCount = wizardTabData.wizardTotalSpellbookCount || 0;
        context.wizardFreeSpellbookCount = wizardTabData.wizardFreeSpellbookCount || 0;
        context.wizardRemainingFreeSpells = wizardTabData.wizardRemainingFreeSpells || 0;
        context.wizardHasFreeSpells = wizardTabData.wizardHasFreeSpells || false;
        context.wizardMaxSpellbookCount = wizardTabData.wizardMaxSpellbookCount || 0;
        context.wizardIsAtMax = wizardTabData.wizardIsAtMax || false;
        log(3, `Wizard tab context: ${context.spellLevels.length} spell levels, ${context.wizardRemainingFreeSpells} free spells remaining`);
      } else {
        log(1, `No wizard tab data found for ${partId}`);
        context.spellLevels = [];
        context.spellPreparation = { current: 0, maximum: 0 };
      }
    }
    return context;
  }

  /** @inheritdoc */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    if (!priorElement || this._formStateCache.size === 0) return;
    const allInputs = priorElement.querySelectorAll('input, select, textarea, dnd5e-checkbox');
    allInputs.forEach((input) => {
      const inputKey = this._getInputCacheKey(input);
      if (!inputKey || !this._formStateCache.has(inputKey)) return;
      const cachedValue = this._formStateCache.get(inputKey);
      try {
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
        log(3, `Restored ${inputKey} to cached value:`, cachedValue);
      } catch (error) {
        log(1, `Error restoring cached state for ${inputKey}:`, error);
      }
    });
  }

  /** @inheritdoc */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if (this._formStateCache.size === 0) return;
    const newInputs = newElement.querySelectorAll('dnd5e-checkbox');
    newInputs.forEach((input) => {
      const inputKey = this._getInputCacheKey(input);
      if (!inputKey || !this._formStateCache.has(inputKey)) return;
      const cachedValue = this._formStateCache.get(inputKey);
      try {
        input.checked = cachedValue;
        if (typeof input.requestUpdate === 'function') input.requestUpdate();
        const spellItem = input.closest('.spell-item');
        if (spellItem) {
          if (cachedValue) {
            if (!spellItem.classList.contains('prepared-spell')) spellItem.classList.add('prepared-spell');
            else spellItem.classList.remove('prepared-spell');
          }
        }
        log(3, `Post-sync restored ${inputKey} to cached value:`, cachedValue);
      } catch (error) {
        log(1, `Error in post-sync restoration for ${inputKey}:`, error);
      }
    });
  }

  /**
   * Generate a unique cache key for form inputs.
   * @param {HTMLElement} input - The input element
   * @returns {string|null} The cache key or null if input shouldn't be cached
   * @private
   */
  _getInputCacheKey(input) {
    if (input.disabled || input.readonly) return null;
    if (input.name) return `name:${input.name}`;
    if ((input.type === 'checkbox' || input.matches('dnd5e-checkbox')) && input.dataset.uuid) {
      const sourceClass = input.dataset.sourceClass || 'unknown';
      return `checkbox:${sourceClass}:${input.dataset.uuid}`;
    }
    if (input.id) return `id:${input.id}`;
    return null;
  }

  /**
   * Update form state cache with current input values.
   * @param {HTMLElement} [formElement] - Specific form element to cache, defaults to this.element
   * @private
   */
  _updateFormStateCache(formElement = null) {
    const targetElement = formElement || this.element;
    if (!targetElement) return;
    const allInputs = targetElement.querySelectorAll('input, select, textarea, dnd5e-checkbox');
    allInputs.forEach((input) => {
      const inputKey = this._getInputCacheKey(input);
      if (!inputKey) return;
      let value;
      if (input.type === 'checkbox' || input.matches('dnd5e-checkbox')) value = input.checked;
      else if (input.type === 'radio') {
        if (input.checked) value = input.value;
        else return;
      } else if (input.tagName === 'SELECT' && input.multiple) value = Array.from(input.selectedOptions).map((option) => option.value);
      else value = input.value;
      this._formStateCache.set(inputKey, value);
    });
    log(3, `Updated form state cache with ${this._formStateCache.size} entries`);
  }

  /**
   * Create the base context for the application.
   * @param {Object} options - The options passed to the context preparation
   * @returns {Object} The base context
   * @private
   */
  _createBaseContext(options) {
    const context = super._prepareContext(options);

    /** @type {Array<SpellBookButton>} */
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
        action: 'openAnalyticsDashboard',
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
    return {
      ...context,
      actor: this.actor,
      spellLevels: this.spellLevels || [],
      className: this.className || '',
      filters: this.filterHelper.getFilterState(),
      spellSchools: CONFIG.DND5E.spellSchools,
      buttons: buttons,
      actorId: this.actor.id,
      spellPreparation: this.spellPreparation || { current: 0, maximum: 0 },
      isGM: game.user.isGM
    };
  }

  /**
   * Register class-specific parts for all spellcasting classes and wizard tabs.
   * @private
   */
  _registerClassParts() {
    if (!this._state._classesDetected) this._state.detectSpellcastingClasses();
    if (this._state.spellcastingClasses) {
      for (const [identifier, classData] of Object.entries(this._state.spellcastingClasses)) {
        const tabId = `${identifier}Tab`;
        this.constructor.PARTS[tabId] = {
          template: TEMPLATES.PLAYER_SPELL_BOOK.TAB_SPELLS,
          scrollable: [''],
          data: { classIdentifier: identifier, className: classData.name }
        };
        log(3, `Registered class tab part: ${tabId}`);
      }
    }
    const wizardClasses = DataUtils.getWizardEnabledClasses(this.actor);
    for (const { identifier } of wizardClasses) {
      const tabId = `wizardbook-${identifier}`;
      this.constructor.PARTS[tabId] = {
        template: TEMPLATES.PLAYER_SPELL_BOOK.TAB_WIZARD_SPELLBOOK,
        scrollable: [''],
        data: { classIdentifier: identifier }
      };
      log(3, `Registered wizard tab part: ${tabId}`);
    }
    log(3, `Total registered parts: ${Object.keys(this.constructor.PARTS).join(', ')}`);
  }

  /** @inheritdoc */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    const lastPosition = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION);
    if (lastPosition) Object.assign(options.position, lastPosition);
    return options;
  }

  /**
   * Process a spell for display in the UI.
   * @param {Object} spell - The spell to process
   * @returns {ProcessedSpell} The processed spell with UI elements
   * @private
   */
  _processSpellForDisplay(spell) {
    const processedSpell = foundry.utils.deepClone(spell);
    if (!spell.compendiumUuid) spell.compendiumUuid = spell.uuid;
    processedSpell.cssClasses = this._getSpellCssClasses(spell);
    processedSpell.dataAttributes = this._getSpellDataAttributes(spell);
    processedSpell.tag = this._getSpellPreparationTag(spell);
    const ariaLabel = spell.preparation.prepared ? game.i18n.format('SPELLBOOK.Preparation.Unprepare', { name: spell.name }) : game.i18n.format('SPELLBOOK.Preparation.Prepare', { name: spell.name });
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
      const shouldHaveSourceClass = this._shouldSpellHaveSourceClass(spell);
      if (shouldHaveSourceClass) {
        const fixedSourceClass = this._attemptToFixSourceClass(spell);
        if (fixedSourceClass) {
          log(2, `Auto-fixing missing source class for ${spell.name}: assigning to ${fixedSourceClass}`);
          checkbox.dataset.sourceClass = fixedSourceClass;
          if (!this._sourceClassFixQueue) this._sourceClassFixQueue = [];
          this._sourceClassFixQueue.push({ spellId: spell._id, spellName: spell.name, sourceClass: fixedSourceClass });
        } else {
          log(2, `No source class found for prepared spell: ${spell.name}`, {
            spell,
            preparation: spell.preparation,
            sourceItem: spell.preparation?.sourceItem,
            spellcastingClasses: Object.keys(this.actor.spellcastingClasses || {})
          });
        }
      }
    }
    if (spell.preparation?.preparedByOtherClass) checkbox.dataset.crossClass = 'true';
    if (spell.preparation.disabled && spell.preparation.disabledReason) checkbox.dataset.tooltip = game.i18n.localize(spell.preparation.disabledReason);
    processedSpell.preparationCheckboxHtml = ValidationUtils.elementToHtml(checkbox);
    if (spell.sourceClass && this._state.wizardSpellbookCache) {
      const classSpellbook = this._state.wizardSpellbookCache.get(spell.sourceClass);
      processedSpell.inWizardSpellbook = classSpellbook ? classSpellbook.includes(spell.compendiumUuid) : false;
    } else processedSpell.inWizardSpellbook = false;
    if (this.comparisonSpells.size < game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX)) {
      processedSpell.showCompareLink = true;
      processedSpell.isInComparison = this.comparisonSpells.has(spell.compendiumUuid);
    }
    return processedSpell;
  }

  /**
   * Check if a spell should have a source class.
   * @param {Object} spell - The spell to check
   * @returns {boolean} Whether this spell should have a source class
   * @private
   */
  _shouldSpellHaveSourceClass(spell) {
    const prep = spell.preparation;
    if (!prep) return false;
    if (!prep.prepared) return false;
    if (prep.alwaysPrepared) return false;
    if (prep.isGranted) return false;
    const sourceItemType = prep.sourceItem?.type;
    if (sourceItemType && sourceItemType !== 'class' && sourceItemType !== 'subclass') return false;
    return true;
  }

  /**
   * Attempt to automatically fix a missing source class.
   * @param {Object} spell - The spell to fix
   * @returns {string|null} The determined source class, or null if couldn't be fixed
   * @private
   */
  _attemptToFixSourceClass(spell) {
    const spellcastingClasses = this.actor.spellcastingClasses || {};
    const classIdentifiers = Object.keys(spellcastingClasses);
    if (classIdentifiers.length === 0) return null;
    if (classIdentifiers.length === 1) return classIdentifiers[0];
    if (this._state?.classSpellData) {
      for (const classIdentifier of classIdentifiers) {
        const classData = this._state.classSpellData[classIdentifier];
        if (classData?.spells) {
          const spellUuid = spell.compendiumUuid || spell.uuid;
          const isInClassList = classData.spells.some((s) => s.compendiumUuid === spellUuid || s.uuid === spellUuid);
          if (isInClassList) return classIdentifier;
        }
      }
    }
    return null;
  }

  /**
   * Apply queued source class fixes to spell items.
   * @returns {Promise<void>}
   * @private
   */
  async _applySourceClassFixes() {
    if (!this._sourceClassFixQueue || this._sourceClassFixQueue.length === 0) return;
    const fixes = this._sourceClassFixQueue;
    this._sourceClassFixQueue = [];
    log(2, `Applying ${fixes.length} source class fixes...`);
    const updates = fixes.map((fix) => ({ _id: fix.spellId, 'system.sourceClass': fix.sourceClass }));
    try {
      await this.actor.updateEmbeddedDocuments('Item', updates);
      log(
        2,
        `Successfully fixed source class for ${fixes.length} spells:`,
        fixes.map((f) => `${f.spellName} → ${f.sourceClass}`)
      );
    } catch (error) {
      log(1, 'Error applying source class fixes:', error);
    }
  }

  /**
   * Get data attributes for a spell item.
   * @param {Object} spell - The spell object
   * @returns {string} HTML-ready data attributes
   * @private
   */
  _getSpellDataAttributes(spell) {
    const attributes = [
      `data-spell-uuid="${spell.compendiumUuid}"`,
      `data-spell-level="${spell.system.level || 0}"`,
      `data-spell-school="${spell.system?.school || ''}"`,
      `data-casting-time-type="${spell.filterData?.castingTime?.type || ''}"`,
      `data-casting-time-value="${spell.filterData?.castingTime?.value || ''}"`,
      `data-range-units="${spell.filterData?.range?.units || ''}"`,
      `data-range-value="${spell.system?.range?.value || ''}"`,
      `data-damage-types="${spell.filterData?.damageTypes || ''}"`,
      `data-ritual="${spell.filterData?.isRitual || false}"`,
      `data-favorited="${spell.filterData?.favorited || false}"`,
      `data-concentration="${spell.filterData?.concentration || false}"`,
      `data-requires-save="${spell.filterData?.requiresSave || false}"`,
      `data-conditions="${spell.filterData?.conditions || ''}"`,
      `data-material-components="${spell.filterData?.materialComponents?.hasConsumedMaterials || false}"`
    ];
    if (spell.sourceClass) attributes.push(`data-source-class="${spell.sourceClass}"`);
    return attributes.join(' ');
  }

  /**
   * Get CSS classes for a spell item.
   * @param {Object} spell - The spell object
   * @returns {string} Space-separated CSS classes
   * @private
   */
  _getSpellCssClasses(spell) {
    const classes = ['spell-item'];
    if (spell.preparation?.isOwned) classes.push('owned-spell');
    if (spell.preparation?.prepared) classes.push('prepared-spell');
    if (this._state.wizardSpellbookCache && spell.sourceClass) {
      const classSpellbook = this._state.wizardSpellbookCache.get(spell.sourceClass);
      if (classSpellbook && classSpellbook.includes(spell.compendiumUuid)) classes.push('in-wizard-spellbook');
    }
    return classes.join(' ');
  }

  /**
   * Get the preparation tag for a spell.
   * @param {Object} spell - The spell object
   * @returns {Object|null} Tag information or null
   * @private
   */
  _getSpellPreparationTag(spell) {
    if (!spell.preparation) return null;
    if (spell.preparation.alwaysPrepared) {
      return {
        cssClass: 'always-prepared',
        text: game.i18n.localize('SPELLBOOK.Preparation.Always'),
        tooltip: spell.preparation.sourceItem?.name || game.i18n.localize('SPELLBOOK.Preparation.AlwaysTooltip')
      };
    }
    if (spell.preparation.isGranted) {
      return {
        cssClass: 'granted',
        text: game.i18n.localize('SPELLBOOK.SpellSource.Granted'),
        tooltip: spell.preparation.sourceItem?.name || ''
      };
    }
    const modes = { pact: true, innate: true, ritual: true, atwill: true };
    if (modes[spell.preparation.preparationMode]) {
      return {
        cssClass: spell.preparation.preparationMode,
        text: spell.preparation.localizedPreparationMode,
        tooltip: spell.preparation.sourceItem?.name || ''
      };
    }
    if (spell.preparation.preparationMode === 'spell' && spell.preparation.prepared) {
      let tooltip = '';
      if (spell.preparation.disabled && spell.preparation.disabledReason) tooltip = spell.preparation.disabledReason;
      return {
        cssClass: 'prepared',
        text: game.i18n.localize('SPELLBOOK.Preparation.Prepared'),
        tooltip: tooltip
      };
    }
    return null;
  }

  /** @inheritdoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (!options.isFirstRender) {
      log(3, 'Subsequent render: Updating dynamic content...');
      this.ui.updateSpellCounts();
      this.ui.updateSpellPreparationTracking();
      requestAnimationFrame(() => {
        if (this._classesChanged) this._setupDeferredUI(context, options);
      });
    }
    this.ui.positionFooter();
  }

  /**
   * Reset initialization state when actor changes.
   * @returns {void}
   */
  _resetInitializationState() {
    this._preInitialized = false;
    this._classColorsApplied = false;
    this._classStylingCache = null;
    this._preparationListenersSetup = false;
  }

  /** @inheritdoc */
  async _preFirstRender(context, options) {
    await super._preFirstRender(context, options);
    if (!this._preInitialized) await this._preInitialize();
    log(3, 'Pre-first render complete, ready for DOM insertion');
  }

  /** @inheritdoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    log(3, 'First render: Setting up essential UI...');
    this._setupContentWrapper();
    const sidebarControlsBottom = game.settings.get(MODULE.ID, SETTINGS.SIDEBAR_CONTROLS_BOTTOM);
    this.element.dataset.sidebarControlsBottom = sidebarControlsBottom;
    this.ui.setSidebarState();
    requestAnimationFrame(() => {
      this._setupDeferredUI();
      this._setupDeferredUI();
    });
  }

  /**
   * Setup non-critical UI elements after the window is visible.
   * @returns {Promise<void>}
   * @private
   */
  async _setupDeferredUI() {
    log(3, 'Setting up deferred UI elements...');
    try {
      this.ui.setupFilterListeners();
      if (!this._preparationListenersSetup) {
        this.setupPreparationListeners();
        this._preparationListenersSetup = true;
      }
      this.ui.applyCollapsedLevels();
      this.ui.setupCantripUI();
      this.ui.updateSpellCounts();
      this.ui.updateSpellPreparationTracking();
      if (!this._classColorsApplied || this._classesChanged) {
        await this._applyPreCalculatedClassStyling();
        this._classColorsApplied = true;
        this._classesChanged = false;
      }
      this._setupLoadoutContextMenu();
      this._setupPartyContextMenu();
      this.ui.setupAdvancedSearch();
      const favoriteButtons = this.element.querySelectorAll('.spell-favorite-toggle[data-uuid]');
      if (favoriteButtons.length > 0) {
        await this._applyFavoriteStatesToButtons(favoriteButtons);
        favoriteButtons.forEach((button) => button.setAttribute('data-favorites-applied', 'true'));
      }
      log(3, 'Deferred UI setup complete');
    } catch (error) {
      log(1, 'Error during deferred UI setup:', error);
    }
  }

  /**
   * Apply pre-calculated class styling to the DOM.
   * @returns {Promise<void>}
   * @private
   */
  async _applyPreCalculatedClassStyling() {
    if (!this._classStylingCache || this._classStylingCache.size === 0) {
      await this.ui.applyClassStyling();
      return;
    }
    if (this.wizardManagers.size > 0) {
      for (const [identifier, wizardManager] of this.wizardManagers) {
        if (wizardManager.isWizard) {
          const color = this._classStylingCache.get(identifier);
          if (color) {
            const wizardTab = this.element.querySelector(`[data-tab="wizardbook-${identifier}"]`);
            if (wizardTab) wizardTab.style.setProperty('--wizard-book-color', color);
          }
        }
      }
    }
    await this.ui.applyClassStyling();
  }

  /**
   * Inject CSS custom properties for wizard book tab colors.
   * @returns {void}
   * @private
   */
  _injectWizardBookColorCSS() {
    if (!this._wizardBookColors || this._wizardBookColors.size === 0) return;
    const styleId = 'spell-book-wizard-colors';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    let css = '';
    for (const [identifier, color] of this._wizardBookColors) {
      const colorObj = foundry.utils.Color.fromString(color);
      if (colorObj.valid) {
        const r = Math.round(colorObj.r * 255);
        const g = Math.round(colorObj.g * 255);
        const b = Math.round(colorObj.b * 255);
        const [h] = colorObj.hsl;
        css += `
        .tabs.tabs-right > .item[data-tab="wizardbook-${identifier}"] {
          --wizard-book-color: ${color};
          --wizard-book-color-rgb: ${r}, ${g}, ${b};
          --wizard-book-color-hue: ${h * 360}deg;
        }
      `;
      }
    }
    styleElement.textContent = css;
  }

  /**
   * Process spells for a spell level during context preparation.
   * @param {Array<Object>} spells - Raw spell data
   * @returns {Promise<Array<ProcessedSpell>>} Processed spells ready for template
   * @private
   */
  async _processSpellsForLevel(spells) {
    const processedSpells = [];
    for (const spell of spells) {
      const processedSpell = this._processSpellForDisplay(spell);
      const spellUuid = processedSpell.uuid || processedSpell.compendiumUuid;
      const comparisonIcon = {
        enabled: UIUtils.CustomUI.isPlayerElementEnabled('compare') && processedSpell.showCompareLink,
        active: processedSpell.isInComparison,
        uuid: processedSpell.compendiumUuid,
        tooltip: game.i18n.localize('SPELLBOOK.Comparison.Compare'),
        ariaLabel: game.i18n.format('SPELLBOOK.Comparison.CompareSpell', { name: processedSpell.name })
      };
      const favoriteButton = {
        enabled: UIUtils.CustomUI.isPlayerElementEnabled('favorites') && spellUuid,
        favorited: processedSpell.favorited,
        uuid: spellUuid,
        tooltip: processedSpell.favorited ? game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites') : game.i18n.localize('SPELLBOOK.UI.AddToFavorites'),
        iconClass: processedSpell.favorited ? 'fas' : 'far'
      };
      const notesIcon = {
        enabled: UIUtils.CustomUI.isPlayerElementEnabled('notes') && spellUuid,
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
          learningSourceLabel = game.i18n.localize(this._getLearnedLabelKey(learningSource));
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
      const partyIcons = this._preparePartyIconsData(processedSpell);
      const formattedDetails = UIUtils.CustomUI.buildPlayerMetadata(processedSpell);
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
    await this._applySourceClassFixes();
    return processedSpells;
  }

  /**
   * Prepare party icons data for a spell.
   * @param {Object} spellData - The spell data
   * @returns {Object} Party icons data structure
   * @private
   */
  _preparePartyIconsData(spellData) {
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    if (!isPartyMode) return { enabled: false, icons: [] };
    const partyActors = PartyMode.getPartyActors();
    const tokenLimit = game.settings.get(MODULE.ID, SETTINGS.PARTY_MODE_TOKEN_LIMIT);
    const spellUuid = spellData.sourceUuid || spellData.compendiumUuid || spellData.uuid;
    const icons = [];
    let iconCount = 0;
    for (const actor of partyActors) {
      if (iconCount >= tokenLimit) break;
      if (actor.id === this.actor.id) continue;
      if (this._actorHasSpellPrepared(actor, spellUuid)) {
        const associatedUser = game.users.find((user) => user.character?.id === actor.id);
        const userColor = associatedUser?.color?.css || game.user.color.css || 'transparent';
        icons.push({ src: actor.img, name: actor.name, actorId: actor.id, userColor: userColor });
        iconCount++;
      }
    }
    return { enabled: icons.length > 0, icons: icons };
  }

  /**
   * Process spell levels for context preparation.
   * @param {Array<Object>} spellLevels - Raw spell level data
   * @returns {Promise<Array<Object>>} Processed spell levels ready for template
   * @private
   */
  async _processSpellLevelsForContext(spellLevels) {
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
    const processedLevels = [];
    for (const levelData of spellLevels) {
      const level = String(levelData.level);
      const spells = levelData.spells || [];
      const isCollapsed = collapsedLevels.includes(level);
      const processedSpells = await this._processSpellsForLevel(spells);
      let preparedCount = 0;
      if (level !== '0') preparedCount = spells.filter((spell) => spell.preparation?.prepared).length;
      const cantripCounter = { enabled: level === '0', current: 0, maximum: 0 };
      processedLevels.push({ level, levelName: levelData.name, spells: processedSpells, isCollapsed, preparedCount, cantripCounter });
    }
    return processedLevels;
  }

  /**
   * Show error state if spell loading fails.
   * @param {Error} error - The error that occurred
   * @private
   */
  _showErrorState(error) {
    log(1, `${game.user.name} encountered an error:`, error);
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const spellsContainer = activeTabContent?.querySelector('.spells-container');
    if (spellsContainer) {
      const errorHtml = `
      <div class="error-state" role="alert">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <p>${game.i18n.localize('SPELLBOOK.Errors.FailedToLoad')}</p>
        <button type="button" onclick="this.closest('.error-state').parentElement.innerHTML = ''; this.dispatchEvent(new CustomEvent('retry-load', {bubbles: true}));">
          ${game.i18n.localize('SPELLBOOK.UI.Retry')}
        </button>
      </div>
    `;
      spellsContainer.innerHTML = errorHtml;
    }
  }

  /**
   * Apply favorite states after render based on user data.
   * @private
   */
  async _applyFavoriteStatesAfterRender() {
    const favoritesEnabled = game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES);
    if (!favoritesEnabled) return;
    const favoriteButtons = this.element.querySelectorAll('.spell-favorite-toggle[data-uuid]');
    log(3, `Applying favorite states to ${favoriteButtons.length} buttons after render`);
    if (favoriteButtons.length === 0) {
      setTimeout(async () => {
        const retryButtons = this.element.querySelectorAll('.spell-favorite-toggle[data-uuid]');
        if (retryButtons.length > 0) await this._applyFavoriteStatesToButtons(retryButtons);
        else log(2, 'No favorite buttons found even after retry');
      }, 100);
      return;
    }
    await this._applyFavoriteStatesToButtons(favoriteButtons);
  }

  /**
   * Apply favorite states with actor state validation.
   * @param {NodeList} buttons - The buttons to update
   * @private
   */
  async _applyFavoriteStatesToButtons(buttons) {
    const targetUserId = DataUtils.getTargetUserId(this.actor);
    let updatedCount = 0;
    for (const button of buttons) {
      const spellUuid = button.dataset.uuid;
      if (!spellUuid) continue;
      let isFavorited = this._state.getFavoriteSessionState(spellUuid);
      if (isFavorited === null) {
        const userData = await DataUtils.UserData.getUserDataForSpell(spellUuid, targetUserId, this.actor.id);
        const journalFavorited = userData?.favorited || false;
        const isOnActor = this._isSpellOnActor(spellUuid);
        if (isOnActor && journalFavorited) isFavorited = true;
        else if (isOnActor && !journalFavorited) isFavorited = false;
        else if (!isOnActor) isFavorited = journalFavorited;
      }
      const icon = button.querySelector('i');
      const currentlyFavorited = button.classList.contains('favorited');
      if (currentlyFavorited !== isFavorited) {
        if (isFavorited) {
          button.classList.add('favorited');
          if (icon) {
            icon.classList.remove('far');
            icon.classList.add('fas');
          }
          button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
          button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
        } else {
          button.classList.remove('favorited');
          if (icon) {
            icon.classList.remove('fas');
            icon.classList.add('far');
          }
          button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
          button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
        }
        updatedCount++;
      }
    }
    if (updatedCount > 0) log(3, `Applied favorite states: ${updatedCount} buttons updated`);
  }

  /**
   * Check if a spell UUID is currently on the actor.
   * @param {string} spellUuid - The spell UUID to check
   * @returns {boolean} Whether the spell is on the actor
   * @private
   */
  _isSpellOnActor(spellUuid) {
    return this.actor.items.some((item) => item.type === 'spell' && (item._stats?.compendiumSource === spellUuid || item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid));
  }

  /**
   * Set up the content wrapper element to allow hiding sidebar in collapsed mode.
   * @private
   */
  _setupContentWrapper() {
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

  /**
   * Sync journal favorites to match current actor.system.favorites state.
   * @private
   */
  async _syncJournalToActorState() {
    try {
      log(3, 'Syncing journal favorites to current actor state...');
      const actorFavorites = this.actor.system.favorites || [];
      const actorFavoriteSpellIds = new Set(actorFavorites.filter((fav) => fav.type === 'item' && fav.id.startsWith('.Item.')).map((fav) => fav.id.replace('.Item.', '')));
      const actorSpells = this.actor.items.filter((item) => item.type === 'spell');
      const targetUserId = DataUtils.getTargetUserId(this.actor);
      let syncCount = 0;
      const changedSpells = [];
      for (const spell of actorSpells) {
        const spellUuid = spell._stats?.compendiumSource || spell.flags?.core?.sourceId || spell.uuid;
        if (!spellUuid) continue;
        const isFavoritedInActor = actorFavoriteSpellIds.has(spell.id);
        const userData = await DataUtils.UserData.getUserDataForSpell(spellUuid, targetUserId, this.actor.id);
        const isFavoritedInJournal = userData?.favorited || false;
        if (isFavoritedInJournal && !isFavoritedInActor) {
          log(3, `Unfavoriting ${spell.name} in journal to match actor state`);
          await DataUtils.UserData.setSpellFavorite(spellUuid, false);
          changedSpells.push({ uuid: spellUuid, newState: false });
          syncCount++;
        }
        if (!isFavoritedInJournal && isFavoritedInActor) {
          log(3, `Favoriting ${spell.name} in journal to match actor state`);
          await DataUtils.UserData.setSpellFavorite(spellUuid, true);
          changedSpells.push({ uuid: spellUuid, newState: true });
          syncCount++;
        }
      }
      if (changedSpells.length > 0) this._applyImmediateFavoriteChanges(changedSpells);
      log(3, `Journal sync complete: ${syncCount} spells synchronized`);
    } catch (error) {
      log(1, 'Error syncing journal to actor state:', error);
    }
  }

  /**
   * Immediately apply favorite changes to UI without waiting for next render.
   * @param {Array<{uuid: string, newState: boolean}>} changedSpells - Array of changed spell states
   * @private
   */
  _applyImmediateFavoriteChanges(changedSpells) {
    for (const { uuid, newState } of changedSpells) {
      const button = this.element.querySelector(`.spell-favorite-toggle[data-uuid="${uuid}"]`);
      if (!button) continue;
      const icon = button.querySelector('i');
      if (newState) {
        button.classList.add('favorited');
        if (icon) {
          icon.classList.remove('far');
          icon.classList.add('fas');
        }
        button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
        button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
      } else {
        button.classList.remove('favorited');
        if (icon) {
          icon.classList.remove('fas');
          icon.classList.add('far');
        }
        button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
        button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
      }
    }
    if (changedSpells.length > 0) log(3, `Applied immediate UI changes for ${changedSpells.length} favorite buttons`);
  }

  /** @inheritdoc */
  async _onClose(options) {
    this._resetInitializationState();
    if (this._formStateCache) this._formStateCache.clear();
    await game.settings.set(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION, this.position);
    SpellBook.DEFAULT_OPTIONS.position = this.position;
    if (this._preparationListener) {
      document.removeEventListener('change', this._preparationListener);
      this._preparationListener = null;
    }
    if (this._isLongRest) this.actor.unsetFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
    if (this._flagChangeHook) Hooks.off('updateActor', this._flagChangeHook);
    document.removeEventListener('click', this._hideLoadoutContextMenu.bind(this));
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    if (isPartyMode) await this.actor.setFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED, false);
    if (this.ui?.search) this.ui.search.cleanup();
    super._onClose(options);
  }

  /**
   * Set up event listeners for spell preparation checkboxes and filter checkboxes.
   * @private
   */
  setupPreparationListeners() {
    if (this._preparationListener) document.removeEventListener('change', this._preparationListener);
    this._preparationListener = async (event) => {
      const target = event.target;
      if (target.matches('dnd5e-checkbox[data-uuid]')) await this._handlePreparationChange(event);
      else if (target.matches('dnd5e-checkbox[name^="filter-"]')) SpellBook.filterSpells.call(this);
    };
    document.addEventListener('change', this._preparationListener);
  }

  /**
   * Get tabs for the application including multiple wizard tabs.
   * @returns {Object<string, SpellBookTab>} The tab configuration
   * @private
   */
  _getTabs() {
    const tabGroup = 'spellbook-tabs';
    const tabs = {};
    if (!this.tabGroups[tabGroup] && this._state.activeClass) this.tabGroups[tabGroup] = `${this._state.activeClass}Tab`;
    else if (!this.tabGroups[tabGroup] && this.wizardManagers.size > 0) {
      const firstWizardClass = Array.from(this.wizardManagers.keys())[0];
      this.tabGroups[tabGroup] = `wizardbook-${firstWizardClass}`;
    } else if (!this.tabGroups[tabGroup] && Object.keys(this._state.spellcastingClasses || {}).length > 0) {
      this.tabGroups[tabGroup] = `${Object.keys(this._state.spellcastingClasses)[0]}Tab`;
    }
    if (this._state.spellcastingClasses) {
      const sortedClassIdentifiers = Object.keys(this._state.spellcastingClasses).sort();
      for (const identifier of sortedClassIdentifiers) {
        const classData = this._state.spellcastingClasses[identifier];
        const classTabId = `${identifier}Tab`;
        const iconPath = classData?.img || ASSETS.MODULE_ICON;
        tabs[classTabId] = {
          id: classTabId,
          label: game.i18n.format('SPELLBOOK.Tabs.ClassSpells', { class: classData.name }),
          group: tabGroup,
          cssClass: this.tabGroups[tabGroup] === classTabId ? 'active' : '',
          icon: 'spell-book-module-icon',
          data: {
            classImg: iconPath,
            classIdentifier: identifier,
            className: classData.name
          }
        };
        const wizardManager = this.wizardManagers.get(identifier);
        if (wizardManager && wizardManager.isWizard) {
          const wizardTabId = `wizardbook-${identifier}`;
          const className = classData.name;
          tabs[wizardTabId] = {
            id: wizardTabId,
            label: game.i18n.format('SPELLBOOK.Tabs.WizardSpells', { class: className }),
            group: tabGroup,
            cssClass: this.tabGroups[tabGroup] === wizardTabId ? 'active' : '',
            icon: 'fa-solid fa-book-spells',
            data: {
              classImg: ASSETS.MODULE_ICON,
              classIdentifier: identifier,
              className: className,
              isWizardTab: true
            }
          };
        }
      }
    }
    return tabs;
  }

  /** @inheritdoc */
  async changeTab(tabName, groupName, options = {}) {
    const previousTab = this.tabGroups[groupName];
    const isFromWizardTab = previousTab && (previousTab === 'wizardbook' || previousTab.startsWith('wizardbook-'));
    const isToPreparationTab = tabName.endsWith('Tab') && !tabName.startsWith('wizardbook');
    super.changeTab(tabName, groupName, options);
    const classMatch = tabName.match(/^([^T]+)Tab$/);
    const classIdentifier = classMatch ? classMatch[1] : null;
    if (classIdentifier && this._state.classSpellData[classIdentifier]) this._state.setActiveClass(classIdentifier);
    this._state.updateGlobalPreparationCount();
    this._switchTabVisibility(tabName);
    if (isFromWizardTab && isToPreparationTab) this.render(false, { parts: [tabName, 'footer'] });
    else this.render(false, { parts: ['footer'] });
    this.ui.updateSpellCounts();
    this.ui.updateSpellPreparationTracking();
    this.ui.setupCantripUI();
    const favoritesEnabled = game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES);
    if (favoritesEnabled) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const activeTabElement = this.element.querySelector(`.tab[data-tab="${tabName}"]`);
      if (activeTabElement) {
        const favoriteButtons = activeTabElement.querySelectorAll('.spell-favorite-toggle[data-uuid]:not([data-favorites-applied])');
        if (favoriteButtons.length > 0) {
          await this._applyFavoriteStatesToButtons(favoriteButtons);
          favoriteButtons.forEach((button) => button.setAttribute('data-favorites-applied', 'true'));
        }
      }
    }
  }

  /**
   * Switch tab visibility without re-rendering.
   * @param {string} activeTabName - The tab to make active
   * @private
   */
  _switchTabVisibility(activeTabName) {
    const allTabs = this.element.querySelectorAll('.tab');
    allTabs.forEach((tab) => {
      tab.classList.remove('active');
      tab.style.display = 'none';
    });
    const activeTab = this.element.querySelector(`.tab[data-tab="${activeTabName}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
      activeTab.style.display = 'block';
    }
    const navItems = this.element.querySelectorAll('.tabs .item');
    navItems.forEach((item) => {
      item.classList.remove('active');
      if (item.dataset.tab === activeTabName) item.classList.add('active');
    });
    log(3, `Switched to tab ${activeTabName} without re-rendering`);
  }

  /** @inheritdoc */
  _configureRenderOptions(options) {
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

  /**
   * Prepare class-specific preparation data for footer display.
   * @returns {Array<Object>} Array of class preparation data
   * @private
   */
  _prepareClassPreparationData() {
    const activeTab = this.tabGroups['spellbook-tabs'];
    const classPreparationData = [];
    const activeClassMatch = activeTab?.match(/^([^T]+)Tab$/);
    const activeClassIdentifier = activeClassMatch ? activeClassMatch[1] : null;
    for (const [identifier, classData] of Object.entries(this._state.classSpellData)) {
      const isActive = identifier === activeClassIdentifier;
      classPreparationData.push({
        identifier: identifier,
        className: classData.className,
        current: classData.spellPreparation?.current || 0,
        maximum: classData.spellPreparation?.maximum || 0,
        isActive: isActive
      });
    }
    classPreparationData.sort((a, b) => a.className.localeCompare(b.className));
    return classPreparationData;
  }

  /**
   * Prepare filter data for the UI.
   * @returns {Array<FilterConfig>} The prepared filters
   * @private
   */
  _prepareFilters() {
    let filterConfigData = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
    if (!filterConfigData || !filterConfigData.version) {
      filterConfigData = { version: MODULE.DEFAULT_FILTER_CONFIG_VERSION, filters: foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG) };
    }
    let filterConfig = filterConfigData?.filters || [];
    if (filterConfig.length === 0) filterConfig = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
    else {
      const currentVersion = MODULE.DEFAULT_FILTER_CONFIG_VERSION;
      const storedVersion = filterConfigData.version || '0.0.0';
      if (foundry.utils.isNewerVersion(currentVersion, storedVersion)) {
        log(3, `Migrating filter configuration from ${storedVersion} to ${currentVersion}`);
        filterConfig = this._migrateFilterConfiguration(filterConfig, storedVersion, currentVersion);
        const updatedConfigData = { version: currentVersion, filters: filterConfig };
        game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, updatedConfigData);
      } else filterConfig = this._ensureFilterIntegrity(filterConfig);
    }

    const sortedFilters = filterConfig.sort((a, b) => a.order - b.order);
    const filterState = this.filterHelper.getFilterState();
    const result = sortedFilters
      .map((filter) => {
        let filterEnabled = filter.enabled;
        if (filter.id === 'favorited') {
          const favoritesUIEnabled = game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES);
          filterEnabled = filter.enabled && favoritesUIEnabled;
        }
        if (filter.id === 'preparedByParty') {
          const isPartyModeEnabled = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
          filterEnabled = filter.enabled && isPartyModeEnabled;
        }
        const result = {
          id: filter.id,
          type: filter.type,
          name: `filter-${filter.id}`,
          label: game.i18n.localize(filter.label),
          enabled: filterEnabled
        };
        let element;
        switch (filter.type) {
          case 'search':
            element = ValidationUtils.createTextInput({
              name: `filter-${filter.id}`,
              value: filterState[filter.id] || '',
              placeholder: `${game.i18n.localize(filter.label)}...`,
              ariaLabel: game.i18n.localize(filter.label),
              cssClass: 'advanced-search-input'
            });
            break;
          case 'dropdown':
            const options = UIUtils.getOptionsForFilter(filter.id, filterState);
            element = ValidationUtils.createSelect({
              name: `filter-${filter.id}`,
              options: options,
              ariaLabel: game.i18n.localize(filter.label)
            });
            break;
          case 'checkbox':
            element = ValidationUtils.createCheckbox({
              name: `filter-${filter.id}`,
              checked: filterState[filter.id] || false,
              label: game.i18n.localize(filter.label),
              ariaLabel: game.i18n.localize(filter.label)
            });
            break;
          case 'range':
            element = this._createRangeFilterElement(filter.id, filterState);
            result.unit = DataUtils.shouldUseMetric() ? 'meters' : 'feet';
            break;
          default:
            log(2, `Unknown filter type: ${filter.type} for filter ${filter.id}`);
            return null;
        }
        if (!element) return null;
        result.elementHtml = ValidationUtils.elementToHtml(element);
        return result;
      })
      .filter(Boolean);
    return result;
  }

  /**
   * Create a range filter element with min/max inputs.
   * @param {string} filterId - The filter identifier
   * @param {Object} filterState - The current filter state
   * @returns {HTMLElement} The created range filter element
   * @private
   */
  _createRangeFilterElement(filterId, filterState) {
    const container = document.createElement('div');
    container.className = 'range-inputs';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-labelledby', `${filterId}-label`);
    const minInput = ValidationUtils.createNumberInput({
      name: 'filter-min-range',
      value: filterState.minRange || '',
      placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMin'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMinLabel')
    });
    const separator = document.createElement('div');
    separator.className = 'range-separator';
    separator.setAttribute('aria-hidden', 'true');
    separator.innerHTML = '<dnd5e-icon src="systems/dnd5e/icons/svg/range-connector.svg"></dnd5e-icon>';
    const maxInput = ValidationUtils.createNumberInput({
      name: 'filter-max-range',
      value: filterState.maxRange || '',
      placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMax'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMaxLabel')
    });
    container.appendChild(minInput);
    container.appendChild(separator);
    container.appendChild(maxInput);
    return container;
  }

  /**
   * Apply collapsed state to any existing level headers.
   *
   * @private
   */
  _applyCollapsedStateToExistingHeaders() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
    this.element.querySelectorAll('.spell-level').forEach((levelElement) => {
      const level = levelElement.dataset.level;
      const isCollapsed = collapsedLevels.includes(level);
      const header = levelElement.querySelector('.spell-level-heading');
      const spellList = levelElement.querySelector('.spell-list');
      const collapseIcon = header?.querySelector('.collapse-indicator');
      if (header) {
        header.setAttribute('aria-expanded', !isCollapsed);
        if (isCollapsed) header.classList.add('collapsed');
        else header.classList.remove('collapsed');
      }
      if (spellList) spellList.style.display = isCollapsed ? 'none' : '';
      if (collapseIcon) collapseIcon.className = `fas fa-caret-${isCollapsed ? 'right' : 'down'} collapse-indicator`;
    });
  }

  /**
   * Apply filters to spells.
   * @private
   */
  async _applyFilters() {
    if (!this.element) return;
    this.filterHelper.applyFilters();
    this.ui.updateSpellPreparationTracking();
    this.ui.updateCantripCounter();
  }

  /**
   * Set up context menu for loadout button.
   * @private
   */
  _setupLoadoutContextMenu() {
    const loadoutButton = this.element.querySelector('[data-action="openLoadoutDialog"]');
    if (!loadoutButton) return;
    loadoutButton.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      await this._showLoadoutContextMenu(event);
    });
    document.addEventListener('click', this._hideLoadoutContextMenu.bind(this));
  }

  /**
   * Set up context menu for party button.
   * @private
   */
  _setupPartyContextMenu() {
    const partyButton = this.element.querySelector('[data-action="openPartyManager"]');
    if (!partyButton) return;
    partyButton.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      await this._showPartyContextMenu(event);
    });
    document.addEventListener('click', this._hidePartyContextMenu.bind(this));
  }

  /**
   * Show context menu with available loadouts.
   * @param {Event} event - The right-click event
   * @private
   */
  async _showLoadoutContextMenu(event) {
    this._hideLoadoutContextMenu();
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._state.activeClass;
    if (!classIdentifier) return;
    try {
      const loadoutManager = new Loadouts(this.actor, this);
      const availableLoadouts = loadoutManager.getAvailableLoadouts(classIdentifier);
      if (availableLoadouts.length === 0) return;
      const contextMenu = document.createElement('div');
      contextMenu.id = 'spell-loadout-context-menu';
      contextMenu.className = 'spell-loadout-context-menu';
      const menuItems = availableLoadouts
        .map((loadout) => {
          const spellCount = loadout.spellConfiguration?.length || 0;
          return `
        <div class="context-menu-item" data-loadout-id="${loadout.id}">
          <i class="fas fa-magic item-icon"></i>
          <span class="item-text">${loadout.name} (${spellCount})</span>
        </div>
      `;
        })
        .join('');
      contextMenu.innerHTML = menuItems;
      document.body.appendChild(contextMenu);
      this._positionContextMenu(event, contextMenu);
      contextMenu.addEventListener('click', async (clickEvent) => {
        const item = clickEvent.target.closest('.context-menu-item');
        if (!item || item.classList.contains('separator')) return;
        if (item.dataset.action === 'manage') {
          const dialog = new LoadoutSelector(this.actor, this, classIdentifier);
          dialog.render(true);
        } else if (item.dataset.loadoutId) {
          await loadoutManager.applyLoadout(item.dataset.loadoutId, classIdentifier);
        }
        this._hideLoadoutContextMenu();
      });
      this._activeContextMenu = contextMenu;
    } catch (error) {
      log(1, 'Error showing loadout context menu:', error);
    }
  }

  /**
   * Show context menu for party button.
   * @param {Event} event - The right-click event
   * @private
   */
  async _showPartyContextMenu(event) {
    this._hidePartyContextMenu();
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    try {
      const contextMenu = document.createElement('div');
      contextMenu.id = 'party-context-menu';
      contextMenu.className = 'party-mode-context-menu';
      contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="${isPartyMode ? 'disable' : 'enable'}-party-mode">
        <i class="fas ${isPartyMode ? 'fa-eye-slash' : 'fa-users'}" aria-hidden="true"></i>
        <span>${game.i18n.localize(isPartyMode ? 'SPELLBOOK.Party.DisablePartyMode' : 'SPELLBOOK.Party.EnablePartyMode')}</span>
      </div>
    `;
      document.body.appendChild(contextMenu);
      this._positionPartyContextMenu(event, contextMenu);
      contextMenu.addEventListener('click', async (clickEvent) => {
        const item = clickEvent.target.closest('.context-menu-item');
        if (!item) return;
        const action = item.dataset.action;
        switch (action) {
          case 'enable-party-mode':
          case 'disable-party-mode':
            await SpellBook.togglePartyMode.call(this, clickEvent, item);
            break;
        }
        this._hidePartyContextMenu();
      });
      this._activePartyContextMenu = contextMenu;
    } catch (error) {
      log(1, 'Error showing party context menu:', error);
    }
  }

  /**
   * Position party context menu near the button.
   * @param {Event} event - The click event
   * @param {HTMLElement} menu - The context menu element
   * @private
   */
  _positionPartyContextMenu(event, menu) {
    const button = event.currentTarget;
    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    let finalX = buttonRect.left;
    let finalY = buttonRect.top - menuRect.height - 5;
    if (finalY < 10) finalY = buttonRect.bottom + 5;
    if (finalX + menuRect.width > viewportWidth - 10) finalX = buttonRect.right - menuRect.width;
    if (finalX < 10) finalX = 10;
    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;
  }

  /**
   * Position context menu at the left edge of the Spell Book application.
   * @param {Event} event - The click event
   * @param {HTMLElement} menu - The context menu element
   * @private
   */
  _positionContextMenu(event, menu) {
    const button = event.currentTarget;
    const appRect = this.element.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const finalX = appRect.left - menuRect.width;
    let finalY = buttonRect.top;
    if (finalY + menuRect.height > viewportHeight) {
      const aboveY = buttonRect.bottom - menuRect.height;
      if (aboveY >= 10) finalY = aboveY;
      else finalY = viewportHeight - menuRect.height - 10;
    }
    if (finalY < 10) finalY = 10;
    const minX = 10;
    const adjustedX = Math.max(finalX, minX);
    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${finalY}px`;
  }

  /**
   * Hide loadout context menu.
   * @private
   */
  _hideLoadoutContextMenu() {
    const existingMenu = document.getElementById('spell-loadout-context-menu');
    if (existingMenu) existingMenu.remove();
    this._activeContextMenu = null;
  }

  /**
   * Hide party context menu.
   * @private
   */
  _hidePartyContextMenu() {
    const existingMenu = document.getElementById('party-context-menu');
    if (existingMenu) existingMenu.remove();
    this._activePartyContextMenu = null;
  }

  /**
   * Handle preparation checkbox change with optimized UI updates.
   * @param {Event} event - The change event
   * @returns {Promise<void>}
   * @private
   */
  async _handlePreparationChange(event) {
    try {
      if (this._handlingPreparation) return;
      this._handlingPreparation = true;
      const checkbox = event.target;
      const uuid = checkbox.dataset.uuid;
      const sourceClass = checkbox.dataset.sourceClass;
      const spellItem = checkbox.closest('.spell-item');
      const spellLevel = spellItem?.dataset.spellLevel;
      const wasPrepared = checkbox.dataset.wasPrepared === 'true';
      const isChecked = checkbox.checked;
      if (spellLevel === '0') await this._handleCantripPreparationChange(event, uuid, spellItem);
      else {
        await this._handleSpellPreparationChange(event, uuid, spellItem, sourceClass, wasPrepared, isChecked);
        this.ui.updateSpellPreparationTracking();
        this.ui.updateSpellCounts();
      }
    } catch (error) {
      log(1, 'Error handling preparation change:', error);
    } finally {
      this._handlingPreparation = false;
    }
  }

  /**
   * Handle regular spell preparation change with swapping enforcement.
   * @param {Event} event - The change event
   * @param {string} uuid - The spell UUID
   * @param {HTMLElement} spellItem - The spell item element
   * @param {string} sourceClass - The source class identifier
   * @param {boolean} wasPrepared - Whether the spell was previously prepared
   * @param {boolean} isChecked - Whether the spell is being checked
   * @returns {Promise<void>}
   * @private
   */
  async _handleSpellPreparationChange(event, uuid, spellItem, sourceClass, wasPrepared, isChecked) {
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
  }

  /**
   * Handle cantrip preparation change using Cantrips.
   * @param {Event} event - The change event
   * @param {string} uuid - The spell UUID
   * @param {HTMLElement} spellItem - The spell item element
   * @returns {Promise<void>}
   * @private
   */
  async _handleCantripPreparationChange(event, uuid, spellItem) {
    const checkbox = event.target;
    const isChecked = checkbox.checked;
    const wasPrepared = checkbox.dataset.wasPrepared === 'true';
    const isLevelUp = this.spellManager.cantripManager.canBeLeveledUp();
    const isLongRest = this._isLongRest;
    const sourceClass = checkbox.dataset.sourceClass;
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
        this.ui.updateCantripCounter(null, true);
        return;
      }
    }
    this.spellManager.cantripManager.trackCantripChange(sourceSpell, isChecked, isLevelUp, isLongRest, classIdentifier);
    if (isChecked && !wasPrepared) this._newlyCheckedCantrips.add(uuid);
    else if (!isChecked && this._newlyCheckedCantrips.has(uuid)) this._newlyCheckedCantrips.delete(uuid);
    if (spellItem) spellItem.classList.toggle('prepared-spell', isChecked);
    this.ui.updateCantripCounter(null, false);
  }

  /**
   * Update wizard tab data after learning a spell.
   * @param {boolean} isFree - Whether the spell was learned for free
   * @param {string} [classIdentifier='wizard'] - The class identifier for the wizard tab
   * @private
   */
  _updatewizardbookDataAfterSpellLearning(isFree, classIdentifier = 'wizard') {
    const wizardTabId = `wizardbook-${classIdentifier}`;
    if (this._state.tabData && this._state.tabData[wizardTabId]) {
      this._state.tabData[wizardTabId].wizardTotalSpellbookCount = (this._state.tabData[wizardTabId].wizardTotalSpellbookCount || 0) + 1;
      if (isFree) {
        this._state.tabData[wizardTabId].wizardRemainingFreeSpells = Math.max(0, (this._state.tabData[wizardTabId].wizardRemainingFreeSpells || 0) - 1);
        this._state.tabData[wizardTabId].wizardHasFreeSpells = this._state.tabData[wizardTabId].wizardRemainingFreeSpells > 0;
      }
      const wizardManager = this.wizardManagers.get(classIdentifier);
      if (wizardManager) wizardManager.invalidateCache();
    }
  }

  /**
   * Migrate filter configuration from old version to new version.
   * @param {Array} oldConfig - The old filter configuration
   * @param {string} oldVersion - The old version
   * @param {string} newVersion - The new version
   * @returns {Array} The migrated configuration
   * @private
   */
  _migrateFilterConfiguration(oldConfig, oldVersion, newVersion) {
    const existingFilters = new Map(oldConfig.map((f) => [f.id, f]));
    const migratedConfig = MODULE.DEFAULT_FILTER_CONFIG.map((defaultFilter) => {
      const existingFilter = existingFilters.get(defaultFilter.id);
      if (existingFilter) return { ...defaultFilter, enabled: existingFilter.enabled, order: existingFilter.order !== undefined ? existingFilter.order : defaultFilter.order };
      else return foundry.utils.deepClone(defaultFilter);
    });
    log(3, `Migrated filter configuration from version ${oldVersion} to ${newVersion}`);
    return migratedConfig;
  }

  /**
   * Ensure filter configuration integrity by adding missing filters and removing obsolete ones.
   * @param {Array} filterConfig - Current filter configuration
   * @returns {Array} Updated filter configuration
   * @private
   */
  _ensureFilterIntegrity(filterConfig) {
    const existingFilters = new Map(filterConfig.map((f) => [f.id, f]));
    const defaultFilterIds = new Set(MODULE.DEFAULT_FILTER_CONFIG.map((f) => f.id));
    for (const defaultFilter of MODULE.DEFAULT_FILTER_CONFIG) if (!existingFilters.has(defaultFilter.id)) filterConfig.push(foundry.utils.deepClone(defaultFilter));
    filterConfig = filterConfig.filter((filter) => defaultFilterIds.has(filter.id));
    return filterConfig;
  }

  /**
   * Check if a specific class needs a validation notice.
   * @param {string} classIdentifier - The class identifier
   * @param {string} className - The class name
   * @returns {Object|null} Notice object or null
   * @private
   */
  _prepareClassValidationNotice(classIdentifier, className) {
    const classItem = this.actor.items.find((item) => item.type === 'class' && (item.system?.identifier?.toLowerCase() === classIdentifier || item.name.toLowerCase() === classIdentifier));
    const isFromCompendium = !!(classItem._stats?.compendiumSource && classItem._stats.compendiumSource.startsWith('Compendium.'));
    const isDnDBeyondClass = !!classItem?.flags?.ddbimporter;
    if (!isFromCompendium && !isDnDBeyondClass) {
      const customSpellListSetting = this.actor.getFlag(MODULE.ID, `classRules.${classIdentifier}.customSpellList`);
      const hasCustomSpellList = !!(customSpellListSetting && customSpellListSetting !== 'auto');
      if (!hasCustomSpellList) {
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
   * Toggle sidebar visibility.
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static toggleSidebar(event, _form) {
    const isCollapsing = !this.element.classList.contains('sidebar-collapsed');
    this.element.classList.toggle('sidebar-collapsed');
    const caretIcon = event.currentTarget.querySelector('.collapse-indicator');
    if (caretIcon) caretIcon.className = isCollapsing ? 'fas fa-caret-right collapse-indicator' : 'fas fa-caret-left collapse-indicator';
    this.ui.positionFooter();
    game.user.setFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED, isCollapsing);
  }

  /**
   * Apply filters to spells.
   * @param {Event} _event - The event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static filterSpells(_event, _form) {
    this.filterHelper.invalidateFilterCache();
    this.filterHelper.applyFilters();
  }

  /**
   * Handle reset button click.
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleReset(event, _form) {
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
          SpellBook._updateFavoriteButtonState(button, false);
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
      this._applyFilters();
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
        this._applyFilters();
        this.ui.updateSpellPreparationTracking();
        this.ui.updateCantripCounter();
      }, 0);
    }
  }

  /**
   * Toggle spell level expansion/collapse.
   * @param {Event} _event - The click event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static toggleSpellLevel(_event, form) {
    const levelContainer = form.parentElement;
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

  /**
   * Open filter configuration dialog.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static configureFilters(_event, _form) {
    const filterConfig = new PlayerFilterConfiguration(this);
    filterConfig.render(true);
  }

  /**
   * Open cantrip settings dialog.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static configureCantripSettings(_event, _form) {
    const dialog = new SpellBookSettings(this.actor, { parentApp: this });
    dialog.render(true);
  }

  /**
   * Handle learn spell button click.
   * @param {Event} event - The click event
   * @returns {Promise<void>}
   * @static
   */
  static async learnSpell(event) {
    const spellUuid = event.target.dataset.uuid;
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
        if (this._state.wizardSpellbookCache) {
          this._state.wizardSpellbookCache.set(classIdentifier, [...(this._state.wizardSpellbookCache.get(classIdentifier) || []), spellUuid]);
        }
        this._updatewizardbookDataAfterSpellLearning(costInfo.isFree, classIdentifier);
        await this._state.refreshClassSpellData(classIdentifier);
        const spellItem = this.element.querySelector(`.spell-item[data-spell-uuid="${spellUuid}"]`);
        if (spellItem) {
          const buttonContainer = spellItem.querySelector('.wizard-spell-status');
          if (buttonContainer) {
            const source = costInfo.isFree ? MODULE.WIZARD_SPELL_SOURCE.FREE : MODULE.WIZARD_SPELL_SOURCE.COPIED;
            const labelKey = this._getLearnedLabelKey(source);
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
          this._applyFilters();
        }, 50);
      }
    }
  }

  /**
   * Get the appropriate localization key for a learned spell based on its source.
   * @param {string} source - The learning source (free, copied, scroll)
   * @returns {string} Localization key
   * @private
   */
  _getLearnedLabelKey(source) {
    switch (source) {
      case MODULE.WIZARD_SPELL_SOURCE.FREE:
        return 'SPELLBOOK.Wizard.LearnedFree';
      case MODULE.WIZARD_SPELL_SOURCE.COPIED:
        return 'SPELLBOOK.Wizard.LearnedPurchased';
      case MODULE.WIZARD_SPELL_SOURCE.SCROLL:
        return 'SPELLBOOK.Wizard.LearnedFromScroll';
      default:
        return 'SPELLBOOK.Wizard.LearnedFree';
    }
  }

  /**
   * Handle learning a spell from a scroll.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleLearnFromScroll(event, _form) {
    const spellUuid = event.target.dataset.uuid;
    const scrollId = event.target.dataset.scrollId;
    if (!spellUuid || !scrollId) return;
    const scrollSpellData = this._state.scrollSpells.find((s) => s.spellUuid === spellUuid && s.scrollId === scrollId);
    if (!scrollSpellData) return;
    const wizardManager = this.wizardManager;
    if (!wizardManager) return;
    const success = await DataUtils.ScrollProcessor.learnSpellFromScroll(this.actor, scrollSpellData, wizardManager);
    if (success) {
      await this._state.refreshClassSpellData('wizard');
      this.render(false);
    }
  }

  /**
   * Open the spell loadout dialog.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async openLoadoutDialog(_event, _form) {
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._state.activeClass;
    if (!classIdentifier) return;
    const dialog = new LoadoutSelector(this.actor, this, classIdentifier);
    dialog.render(true);
  }

  /**
   * Handle toggling spell favorite status.
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The target element containing spell data
   * @static
   */
  static async handleToggleFavorite(event, target) {
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
        log(1, `Failed to persist favorite status for ${spellUuid}`);
        this._state.updateFavoriteSessionState(spellUuid, currentlyFavorited);
        return;
      }
      if (newFavoriteStatus) await UIUtils.addSpellToActorFavorites(spellUuid, this.actor);
      else await UIUtils.removeSpellFromActorFavorites(spellUuid, this.actor);
      SpellBook._updateFavoriteButtonState(target, newFavoriteStatus);
      log(3, `Successfully toggled favorite for spell ${spellUuid}: ${newFavoriteStatus}`);
    } catch (error) {
      log(1, 'Error in handleToggleFavorite:', error);
      const userData = await DataUtils.UserData.getUserDataForSpell(spellUuid, null, this.actor.id);
      this._state.updateFavoriteSessionState(spellUuid, userData?.favorited || false);
    }
  }

  /**
   * Update favorite button state immediately.
   * @param {HTMLElement} button - The favorite button element
   * @param {boolean} isFavorited - Whether the spell is favorited
   * @static
   */
  static _updateFavoriteButtonState(button, isFavorited) {
    const icon = button.querySelector('i');
    if (isFavorited) {
      button.classList.add('favorited');
      if (icon) {
        icon.classList.remove('far');
        icon.classList.add('fas');
      }
      button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
      button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
    } else {
      button.classList.remove('favorited');
      if (icon) {
        icon.classList.remove('fas');
        icon.classList.add('far');
      }
      button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
      button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
    }
  }

  /**
   * Handle opening spell notes dialog.
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The target element containing spell data
   * @static
   */
  static async handleEditNotes(event, target) {
    event.preventDefault();
    const spellUuid = target.dataset.uuid;
    if (!spellUuid) return;
    const spellName = fromUuidSync(spellUuid).name;
    new SpellNotes({ spellUuid, spellName, actor: this.actor }).render(true);
  }

  /**
   * Handle opening the spell analytics dashboard.
   * @param {MouseEvent} _event - The click event (unused)
   * @param {HTMLElement} _target - The target element (unused)
   * @returns {Promise<void>}
   * @static
   */
  static async handleOpenAnalyticsDashboard(_event, _target) {
    new AnalyticsDashboard().render({ force: true });
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
    }
  }

  /**
   * Handle opening spell details customization dialog.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the event
   * @static
   */
  static handleOpenCustomization(_event, _target) {
    const dialog = new DetailsCustomization();
    dialog.render(true);
  }

  /**
   * Open party spell manager.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The event target
   * @static
   */
  static async openPartyManager(_event, _target) {
    const primaryGroup = PartyMode.getPrimaryGroupForActor(this.actor);
    if (!primaryGroup) return;
    const partyActors = PartyMode.getPartyActors(primaryGroup);
    if (partyActors.length === 0) return;
    const manager = new PartyCoordinator(partyActors, this.actor, primaryGroup);
    manager.render(true);
  }

  /**
   * Toggle party mode visualization.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The event target
   * @static
   */
  static async togglePartyMode(_event, _target) {
    const primaryGroup = PartyMode.getPrimaryGroupForActor(this.actor);
    if (!primaryGroup) return;
    const currentMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    log(1, 'CURRENT MODE:', { currentMode });
    await this.actor.setFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED, !currentMode);
    await this.render();
  }

  /**
   * Check if an actor has a specific spell prepared.
   * @param {Actor} actor - The actor to check
   * @param {string} spellUuid - The spell UUID
   * @returns {boolean} True if actor has spell prepared
   * @private
   */
  _actorHasSpellPrepared(actor, spellUuid) {
    if (!PartyMode.prototype.hasViewPermission(actor)) return false;
    const preparedSpells = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS) || [];
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    if (preparedSpells.includes(spellUuid)) return true;
    for (const classSpells of Object.values(preparedByClass)) {
      for (const spellKey of classSpells) {
        const parsed = this.spellManager._parseClassSpellKey(spellKey);
        if (parsed && parsed.spellUuid === spellUuid) return true;
      }
    }
    return false;
  }

  /**
   * Handle form submission by updating internal state cache.
   * @param {Event} _event - The form submission event
   * @param {HTMLElement} form - The form element
   * @param {Object} _formData - The form data
   * @param {Object} _formData - The form data
   * @returns {Promise<void>}
   * @static
   */
  static async formHandler(_event, form, _formData) {
    log(3, 'Processing form submission for state cache update');
    this._updateFormStateCache(form);
    log(3, 'Form state cached successfully');
  }

  /**
   * Handle save action to commit cached changes to the actor.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The event target
   * @returns {Promise<void>}
   * @static
   */
  static async _handleSave(_event, _target) {
    const actor = this.actor;
    if (!actor) return;
    log(3, 'Starting spell book save process');
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
      const sourceClass = checkbox.dataset.sourceClass || 'unknown';
      const spellItem = checkbox.closest('.spell-item');
      const spellLevel = spellItem?.dataset.spellLevel ? parseInt(spellItem.dataset.spellLevel) : 0;
      const isAlwaysPrepared = spellItem?.querySelector('.tag.always-prepared');
      const isGranted = spellItem?.querySelector('.tag.granted');
      const isInnate = spellItem?.querySelector('.tag.innate');
      const isAtWill = spellItem?.querySelector('.tag.atwill');
      if (isAlwaysPrepared || isGranted || isInnate || isAtWill) continue;
      if (!spellDataByClass[sourceClass]) spellDataByClass[sourceClass] = {};
      const classSpellKey = `${sourceClass}:${uuid}`;
      const classData = this._state.classSpellData[sourceClass];
      const classItem = classData?.classItem;
      const isPactCaster = classItem?.system?.spellcasting?.type === 'pact';
      let preparationMode = 'spell';
      if (isPactCaster && spellLevel > 0) preparationMode = 'pact';
      spellDataByClass[sourceClass][classSpellKey] = {
        uuid,
        name,
        wasPrepared,
        isPrepared,
        isRitual,
        sourceClass,
        spellItem,
        spellLevel,
        isAlwaysPrepared,
        isGranted,
        isInnate,
        isAtWill,
        classSpellKey,
        preparationMode
      };
      log(3, `Processed spell: ${name} - prepared: ${isPrepared}, ritual: ${isRitual}, class: ${sourceClass}, mode: ${preparationMode}`);
    }
    this._state.clearFavoriteSessionState();
    await this._state.addMissingRitualSpells(spellDataByClass);
    const allChangesByClass = {};
    for (const [classIdentifier, classSpellData] of Object.entries(spellDataByClass)) {
      const saveResult = await this.spellManager.saveClassSpecificPreparedSpells(classIdentifier, classSpellData);
      if (saveResult) {
        allChangesByClass[classIdentifier] = {
          cantripChanges: saveResult.cantripChanges || { added: [], removed: [] },
          spellChanges: saveResult.spellChanges || { added: [], removed: [] }
        };
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
    if (this.ui && this.rendered) {
      this.ui.setupCantripUI();
      this.ui.setupSpellLocks();
    }
    const cprEnabled = game.modules.get('chris-premades')?.active;
    if (cprEnabled) {
      const cprCompatibility = game.settings.get(MODULE.ID, SETTINGS.CPR_COMPATIBILITY);
      if (cprCompatibility) {
        try {
          log(3, 'Running CPR automation setup for actor:', actor.name);
          await chrisPremades.utils.actorUtils.updateAll(actor);
          log(3, 'CPR automation setup completed successfully');
        } catch (error) {
          log(1, 'Error running CPR automation setup:', error);
        }
      }
    }
    ui.notifications.info('SPELLBOOK.UI.ChangesSaved', { localize: true });
    log(3, 'Spell book save process completed successfully');
    this.close();
  }
}
