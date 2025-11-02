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
 * @todo reorganize code by flow state.
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
      compareSpell: this.#compareSpell,
      editNote: this.#editNote,
      learnSpell: this.#learnSpell,
      learnSpellFromScroll: this.#learnSpellFromScroll,
      openAnalytics: this.#openAnalytics,
      openCustomization: this.#openCustomization,
      openFilterConfig: this.#openFilterConfig,
      openLoadoutDialog: this.#openLoadouts,
      openPartyManager: this.#openPartyMode,
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
   * @returns {WizardBook|null} The primary wizard manager instance or null if none found
   */
  get wizardManager() {
    log(3, 'Retrieving wizardmanger.', { managers: this.wizardManagers });
    const wizardEntry = this.wizardManagers.get('wizard');
    if (wizardEntry?.isWizard) return wizardEntry;
    for (const manager of this.wizardManagers.values()) if (manager.isWizard) return manager;
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
    this.spellManager = new SpellManager(actor, this);

    /** @type {State} State manager for the application */
    this._state = new State(this);

    /** @type {Map<string, WizardBook>} Wizard managers by class identifier */
    this.wizardManagers = new Map();

    // Initialize wizard managers for all wizard-enabled classes
    const wizardClasses = this._state.getWizardEnabledClasses();
    for (const { identifier } of wizardClasses) this.wizardManagers.set(identifier, new WizardBook(actor, identifier));

    /** @type {UIUtils.SpellBookUI} UI helper for interface management */
    this.ui = new UIUtils.SpellBookUI(this);

    /** @type {UIUtils.Filters} Filter helper for spell filtering */
    this.filterHelper = new UIUtils.Filters(this);

    /** @type {Set<string>} Cached enabled UI elements for player interface */
    this.enabledElements = UIUtils.CustomUI.getEnabledPlayerElements();

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
          this.spellManager.clearSettingsCache();
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

    log(3, 'PlayerSpellBook constructed.');
  }

  /**
   * @returns {Promise<void>}
   */
  async _preInitialize() {
    if (this._preInitialized) return;
    if (!this._state._initialized) await this._state.initialize();
    if (!this._state._classesDetected) this._state.detectSpellcastingClasses();
    if (!this._classColorsApplied || this._classesChanged) await this._prepareClassStylingData();
    this._preInitialized = true;
    log(3, 'Pre-initialization complete.');
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
            const color = await UIUtils.getClassColorForWizardTab(classData.item);
            this._classStylingCache.set(identifier, color);
          }
        }
      }
    }
    log(3, 'PSB Class Styling Data created', { stylingCache: this._classStylingCache });
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
  async _prepareContext(options) {
    if (!this._preInitialized) await this._preInitialize();
    const context = await this._createBaseContext(options);
    context.spellcastingClasses = this._state.spellcastingClasses;
    context.activeClass = this._state.activeClass;
    context.activeTab = this.tabGroups['spellbook-tabs'];
    context.tabs = this._prepareTabs('spellbook-tabs');
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
    log(3, 'PSB Context Created:', { context });
    return context;
  }

  /** @inheritdoc */
  async _preparePartContext(partId, context, options) {
    /** @todo: Some of our context doesn't end up in templates - is it required? */
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    const classMatch = partId.match(/^([^T]+)Tab$/);
    if (classMatch) {
      const classIdentifier = classMatch[1];
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
      context.classIdentifier = classIdentifier;
      context.className = this._state.classSpellData[classIdentifier]?.className || classIdentifier;
      const wizardManager = this.wizardManagers.get(classIdentifier);
      context.isWizard = wizardManager?.isWizard || false;
      context.isForceWizard = DataUtils.getWizardData(this.actor)[classIdentifier]?.isForceWizard ?? false;
      const wizardTabData = this._state.tabData?.[partId];
      if (wizardTabData) {
        const rawSpellLevels = wizardTabData.spellLevels || [];
        context.spellLevels = await this._processSpellLevelsForContext(rawSpellLevels);
        context.spellPreparation = wizardTabData.spellPreparation;
        context.wizardTotalSpellbookCount = wizardTabData.wizardTotalSpellbookCount || 0;
        context.wizardFreeSpellbookCount = wizardTabData.wizardFreeSpellbookCount || 0;
        context.wizardRemainingFreeSpells = wizardTabData.wizardRemainingFreeSpells || 0;
        context.wizardHasFreeSpells = wizardTabData.wizardHasFreeSpells || false;
        context.wizardMaxSpellbookCount = wizardTabData.wizardMaxSpellbookCount || 0;
        context.wizardIsAtMax = wizardTabData.wizardIsAtMax || false;
      } else {
        context.spellLevels = [];
        context.spellPreparation = { current: 0, maximum: 0 };
      }
    }
    log(3, 'PSB Part context created:', { partId, context, options });
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
      const inputKey = this._getInputCacheKey(input);
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
   * Create the base context for the application.
   * @param {Object} options - The options passed to the context preparation
   * @returns {Object} The base context
   * @private
   */
  async _createBaseContext(options) {
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
    log(3, 'Base context created:', { options, context, buttons });
    return { ...context, spellLevels: this.spellLevels, className: this.className, filters: this.filterHelper.getFilterState(), buttons: buttons, isGM: game.user.isGM };
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

  /** @inheritdoc */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    const lastPosition = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION);
    if (lastPosition) Object.assign(options.position, lastPosition);
    log(3, 'initialized application options:', { options, lastPosition });
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
    const classes = ['spell-item'];
    if (spell.preparation?.prepared) classes.push('prepared-spell');
    if (this._state.wizardbookCache && spell.sourceClass) {
      const classSpellbook = this._state.wizardbookCache.get(spell.sourceClass);
      if (classSpellbook?.includes(spell.compendiumUuid)) classes.push('in-wizard-spellbook');
    }
    processedSpell.cssClasses = classes.join(' ');
    processedSpell.dataAttributes = this._getSpellDataAttributes(spell);
    if (!spell.tags) spell.tags = this._getSpellPreparationTag(spell);
    processedSpell.tags = spell.tags;
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
    return processedSpell;
  }

  /**
   * Check if a spell should have a source class.
   * @param {Object} spell - The spell to check
   * @returns {boolean} Whether this spell should have a source class
   * @private
   */
  _shouldSpellHaveSourceClass(spell) {
    log(3, `Checking if ${spell.name} should have source class set.`, { spell });
    if (!spell.preparation?.prepared) return false;
    if (spell.system?.prepared === 2) return false;
    if (spell.flags?.dnd5e?.cachedFor) return false;
    return true;
  }

  /**
   * DETECTION: Attempt to automatically determine the correct source class for a prepared spell.
   * @param {Object} spell - The spell to analyze
   * @returns {string|null} The determined source class identifier, or null if couldn't be determined
   * @private
   */
  _attemptToFixSourceClass(spell) {
    log(3, `Detecting source class for ${spell.name}.`, { spell });
    const spellcastingClasses = this.actor.spellcastingClasses || {};
    const classIdentifiers = Object.keys(spellcastingClasses);
    if (classIdentifiers.length === 0) return null;
    if (classIdentifiers.length === 1) return classIdentifiers[0];
    if (this._state?.classSpellData) {
      const spellUuid = spell.compendiumUuid || spell.uuid;
      for (const classIdentifier of classIdentifiers) {
        const classData = this._state.classSpellData[classIdentifier];
        if (classData?.spells?.some((s) => s.compendiumUuid === spellUuid || s.uuid === spellUuid)) return classIdentifier;
      }
    }
    return null;
  }

  /**
   * APPLICATION: Apply all queued source class fixes to the actor in a single batch update.
   * @returns {Promise<void>}
   * @private
   */
  async _applySourceClassFixes() {
    if (!this._sourceClassFixQueue?.length) return;
    log(3, `Applying ${this._sourceClassFixQueue.length} source class fix${this._sourceClassFixQueue.length !== 1 ? 'es' : ''}.`);
    const updates = this._sourceClassFixQueue.map((fix) => ({ _id: fix.spellId, 'system.sourceClass': fix.sourceClass }));
    this._sourceClassFixQueue = [];
    await this.actor.updateEmbeddedDocuments('Item', updates);
    log(3, `Successfully fixed source class for ${updates.length} spell${updates.length !== 1 ? 's' : ''}.`);
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
   * Get the preparation tags for a spell.
   * @param {Object} spell - The spell object
   * @returns {Array} Array of tag objects
   * @private
   */
  _getSpellPreparationTag(spell) {
    log(3, 'Getting spell tag(s)', { spellName: spell.name, flags: spell.flags, system: spell.system, preparation: spell.preparation, aggregatedModes: spell.aggregatedModes });
    const tags = [];
    const sourceClass = spell.system?.sourceClass || spell.sourceClass;
    const modes = spell.aggregatedModes;
    if (modes?.hasPrepared) tags.push({ cssClass: 'prepared', text: game.i18n.localize('SPELLBOOK.Preparation.Prepared'), tooltip: game.i18n.localize('SPELLBOOK.Preparation.PreparedTooltip') });
    if (modes?.hasPact) tags.push({ cssClass: 'pact', text: game.i18n.localize('SPELLBOOK.Preparation.Pact'), tooltip: game.i18n.localize('SPELLBOOK.SpellSource.PactMagic') });
    if (modes?.hasAlwaysPrepared) {
      let tooltip = game.i18n.localize('SPELLBOOK.Preparation.AlwaysTooltip');
      if (sourceClass && this.actor?.spellcastingClasses?.[sourceClass]) {
        const spellcastingData = this.actor.spellcastingClasses[sourceClass];
        const classItem = this.actor.items.get(spellcastingData.id);
        if (classItem?.type === 'subclass') tooltip = classItem.name;
        else if (classItem?.type === 'class') {
          const subclass = this.actor.items.find((i) => i.type === 'subclass' && i.system?.classIdentifier === sourceClass);
          tooltip = subclass?.name || classItem.name;
        }
      }
      tags.push({ cssClass: 'always-prepared', text: game.i18n.localize('SPELLBOOK.Preparation.Always'), tooltip: tooltip });
    }
    if (modes?.hasGranted) {
      const cachedFor = spell.flags?.dnd5e?.cachedFor;
      const itemId = foundry.utils.parseUuid(cachedFor, { relative: this.actor }).embedded[1];
      const grantingItem = this.actor?.items.get(itemId);
      tags.push({ cssClass: 'granted', text: game.i18n.localize('SPELLBOOK.SpellSource.Granted'), tooltip: grantingItem?.name || '' });
    }
    if (modes?.hasInnate) tags.push({ cssClass: 'innate', text: game.i18n.localize('SPELLBOOK.Preparation.Innate'), tooltip: game.i18n.localize('SPELLBOOK.Preparation.InnateTooltip') });
    if (modes?.hasRitual) tags.push({ cssClass: 'ritual', text: game.i18n.localize('SPELLBOOK.Preparation.Ritual'), tooltip: game.i18n.localize('SPELLBOOK.Preparation.RitualTooltip') });
    if (modes?.hasAtWill) tags.push({ cssClass: 'atwill', text: game.i18n.localize('SPELLBOOK.Preparation.AtWill'), tooltip: game.i18n.localize('SPELLBOOK.Preparation.AtWillTooltip') });
    return tags;
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

  /**
   * Reset initialization state when actor changes.
   * @returns {void}
   */
  _resetInitializationState() {
    log(3, 'Resetting initialization state');
    this._preInitialized = false;
    this._classColorsApplied = false;
    this._classStylingCache = null;
    this._preparationListenersSetup = false;
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

    this._setupContentWrapper();
    const sidebarControlsBottom = game.settings.get(MODULE.ID, SETTINGS.SIDEBAR_CONTROLS_BOTTOM);
    this.element.dataset.sidebarControlsBottom = sidebarControlsBottom;
    this.ui.setSidebarState();
    requestAnimationFrame(() => {
      this._setupDeferredUI();
    });
  }

  /**
   * Setup non-critical UI elements after the window is visible.
   * @returns {Promise<void>}
   * @private
   */
  async _setupDeferredUI() {
    log(3, 'Setting up deferred UI.');
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
  }

  /**
   * Apply pre-calculated class styling to the DOM.
   * @returns {Promise<void>}
   * @private
   */
  async _applyPreCalculatedClassStyling() {
    log(3, 'Applying pre-calculated class stylings.');
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
    log(3, 'Injecting wizardbook CSS coloration(s).');
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
   * @param {Set<string>} enabledElements - Cached set of enabled UI elements
   * @returns {Promise<Array<ProcessedSpell>>} Processed spells ready for template
   * @private
   */
  async _processSpellsForLevel(spells, enabledElements) {
    log(3, 'Beginning spells for level processing:', { spells });
    const processedSpells = [];
    for (const spell of spells) {
      const processedSpell = this._processSpellForDisplay(spell);
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
    await this._applySourceClassFixes();
    log(3, 'Finishing spells for level processing:', { spells, processedSpells });
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
    log(3, 'Processing spell levels for context:', { spellLevels });
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
    const enabledElements = this.enabledElements;
    const processedLevels = [];
    for (const levelData of spellLevels) {
      const level = String(levelData.level);
      const spells = levelData.spells || [];
      const isCollapsed = collapsedLevels.includes(level);
      const processedSpells = await this._processSpellsForLevel(spells, enabledElements);
      let preparedCount = 0;
      if (level !== '0') preparedCount = spells.filter((spell) => spell.preparation?.prepared).length;
      const cantripCounter = { enabled: level === '0', current: 0, maximum: 0 };
      processedLevels.push({ level, levelName: levelData.name, spells: processedSpells, isCollapsed, preparedCount, cantripCounter });
    }
    return processedLevels;
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
        const isOnActor = this.actor.items.some((item) => item.type === 'spell' && (item._stats?.compendiumSource === spellUuid || item.uuid === spellUuid));
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
   * Set up the content wrapper element to allow hiding sidebar in collapsed mode.
   * @private
   */
  _setupContentWrapper() {
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

  /**
   * Sync journal favorites to match current actor.system.favorites state.
   * @private
   */
  async _syncJournalToActorState() {
    log(3, 'Syncing jounral to actor state.');
    const actorFavorites = this.actor.system.favorites || [];
    const actorFavoriteSpellIds = new Set(actorFavorites.filter((fav) => fav.type === 'item' && fav.id.startsWith('.Item.')).map((fav) => fav.id.replace('.Item.', '')));
    const actorSpells = this.actor.items.filter((item) => item.type === 'spell');
    const targetUserId = DataUtils.getTargetUserId(this.actor);
    const changedSpells = [];
    for (const spell of actorSpells) {
      const spellUuid = spell._stats?.compendiumSource || spell.uuid;
      if (!spellUuid) continue;
      const isFavoritedInActor = actorFavoriteSpellIds.has(spell.id);
      const userData = await DataUtils.UserData.getUserDataForSpell(spellUuid, targetUserId, this.actor.id);
      const isFavoritedInJournal = userData?.favorited || false;
      if (isFavoritedInJournal && !isFavoritedInActor) {
        await DataUtils.UserData.setSpellFavorite(spellUuid, false);
        changedSpells.push({ uuid: spellUuid, newState: false });
      }
      if (!isFavoritedInJournal && isFavoritedInActor) {
        await DataUtils.UserData.setSpellFavorite(spellUuid, true);
        changedSpells.push({ uuid: spellUuid, newState: true });
      }
    }
    if (changedSpells.length > 0) this._applyImmediateFavoriteChanges(changedSpells);
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
        icon.classList.remove('far');
        icon.classList.add('fas');
        button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
        button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
      } else {
        button.classList.remove('favorited');
        icon.classList.remove('fas');
        icon.classList.add('far');
        button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
        button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
      }
    }
    if (changedSpells.length > 0) log(3, `Applied immediate UI changes for ${changedSpells.length} favorite buttons`);
  }

  /** @inheritdoc */
  async _onClose(options) {
    log(3, 'Closing Player Spell Book...', { options });
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
    if (this._loadoutClickHandler) document.removeEventListener('click', this._loadoutClickHandler);
    if (this._partyClickHandler) document.removeEventListener('click', this._partyClickHandler);
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
    log(3, 'Setting up prep listeners...');
    if (this._preparationListener) document.removeEventListener('change', this._preparationListener);
    this._preparationListener = async (event) => {
      const target = event.target;
      if (target.matches('dnd5e-checkbox[data-uuid]')) await this._handlePreparationChange(event);
      else if (target.matches('dnd5e-checkbox[name^="filter-"]')) {
        this.filterHelper.invalidateFilterCache();
        this.filterHelper.applyFilters();
      }
    };
    document.addEventListener('change', this._preparationListener);
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

  /**
   * Prepare class-specific preparation data for footer display.
   * @returns {Array<Object>} Array of class preparation data
   * @private
   */
  _prepareClassPreparationData() {
    log(3, 'Preparing class preparation data (for footer).');
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
        filterConfig = this._migrateFilterConfiguration(filterConfig);
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
            result.unit = dnd5e.utils.defaultUnits('length') === 'm' ? 'meters' : 'feet';
            break;
          default:
            return null;
        }
        if (!element) return null;
        result.elementHtml = ValidationUtils.elementToHtml(element);
        return result;
      })
      .filter(Boolean);
    log(3, 'Preparing filters:', { result });
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
    log(3, 'Creating range filter element:', { filterId, filterState });
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
   * @todo I don't think we need to updateCantripCounter or updateSpellPreparationTracking in an apply filter logic loop?
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
    log(3, 'Setting up loadout context menu.');
    const loadoutButton = this.element.querySelector('[data-action="openLoadoutDialog"]');
    if (!loadoutButton) return;
    loadoutButton.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      await this._showLoadoutContextMenu(event);
    });
    this._loadoutClickHandler = (event) => {
      if (!event.target.closest('#spell-loadout-context-menu')) {
        this._hideLoadoutContextMenu();
        document.removeEventListener('click', this._loadoutClickHandler);
      }
    };
  }

  /**
   * Set up context menu for party button.
   * @private
   */
  _setupPartyContextMenu() {
    log(3, 'Setting up partymode context menu.');
    const partyButton = this.element.querySelector('[data-action="openPartyManager"]');
    if (!partyButton) return;
    partyButton.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      await this._showPartyContextMenu(event);
    });
    this._partyClickHandler = (event) => {
      if (!event.target.closest('#party-context-menu')) {
        this._hidePartyContextMenu();
        document.removeEventListener('click', this._partyClickHandler);
      }
    };
  }

  /**
   * Show context menu with available loadouts.
   * @param {Event} event - The right-click event
   * @private
   */
  async _showLoadoutContextMenu(event) {
    log(3, 'Showing loadout context menu.');
    this._hideLoadoutContextMenu();
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._state.activeClass;
    if (!classIdentifier) return;
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
    this._positionLoadoutContextMenu(event, contextMenu);
    setTimeout(() => document.addEventListener('click', this._loadoutClickHandler), 0);
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
  }

  /**
   * Show context menu for party button.
   * @param {Event} event - The right-click event
   * @private
   */
  async _showPartyContextMenu(event) {
    log(3, 'Showing partymode context menu.');
    this._hidePartyContextMenu();
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
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
    setTimeout(() => document.addEventListener('click', this._partyClickHandler), 0);
    contextMenu.addEventListener('click', async (clickEvent) => {
      const item = clickEvent.target.closest('.context-menu-item');
      if (!item) return;
      const action = item.dataset.action;
      switch (action) {
        case 'enable-party-mode':
        case 'disable-party-mode':
          await this._togglePartyMode();
          break;
      }
      this._hidePartyContextMenu();
    });
    this._activePartyContextMenu = contextMenu;
  }

  /**
   * Position party context menu near the button.
   * @param {Event} event - The click event
   * @param {HTMLElement} menu - The context menu element
   * @private
   */
  _positionPartyContextMenu(event, menu) {
    log(3, 'Positioning party context menu.');
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
   * Position loadout context menu at the left edge of the application.
   * @param {Event} event - The click event
   * @param {HTMLElement} menu - The context menu element
   * @private
   */
  _positionLoadoutContextMenu(event, menu) {
    log(3, 'Positioning loadout context menu.');
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
   * @todo Is this required anymore? Since we have submitOnChange true? Meaning our formHandler executes on every change to our form.
   * @returns {Promise<void>}
   * @private
   */
  async _handlePreparationChange(event) {
    log(3, 'Handling preparation change.');
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
      log(1, 'Error changing preparations:', error);
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
    log(3, 'Handling cantrip preparation change.', { event, uuid, spellItem });
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

  /**
   * Update wizard tab data after learning a spell.
   * @param {boolean} isFree - Whether the spell was learned for free
   * @param {string} [classIdentifier] - The class identifier for the wizard tab
   * @private
   */
  _updatewizardbookDataAfterSpellLearning(isFree, classIdentifier) {
    log(3, 'Updating wizardbook data after learning a spell.');
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
   * @returns {Array} The migrated configuration
   * @private
   */
  _migrateFilterConfiguration(oldConfig) {
    log(3, 'Migrating filter config.');
    const userPreferences = new Map(oldConfig.map((f) => [f.id, { enabled: f.enabled, order: f.order }]));
    return MODULE.DEFAULT_FILTER_CONFIG.map((defaultFilter) => {
      const userPref = userPreferences.get(defaultFilter.id);
      return userPref ? { ...defaultFilter, enabled: userPref.enabled, order: userPref.order ?? defaultFilter.order } : foundry.utils.deepClone(defaultFilter);
    });
  }

  /**
   * Ensure filter configuration integrity using foundry.utils.mergeObject.
   * @param {Array} filterConfig - Current filter configuration
   * @returns {Array} Updated filter configuration
   * @private
   */
  _ensureFilterIntegrity(filterConfig) {
    log(3, 'Ensuring filter config integrity.');
    const userFilters = new Map(filterConfig.map((f) => [f.id, f]));
    const validDefaultIds = new Set(MODULE.DEFAULT_FILTER_CONFIG.map((f) => f.id));
    const result = MODULE.DEFAULT_FILTER_CONFIG.map((defaultFilter) => userFilters.get(defaultFilter.id) ?? foundry.utils.deepClone(defaultFilter));
    return result.concat(filterConfig.filter((f) => !validDefaultIds.has(f.id) && userFilters.has(f.id)));
  }

  /**
   * Check if a specific class needs a validation notice.
   * @param {string} classIdentifier - The class identifier
   * @param {string} className - The class name
   * @returns {Object|null} Notice object or null
   * @private
   */
  _prepareClassValidationNotice(classIdentifier, className) {
    log(3, 'Preparing class validation notice.');
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
    log(3, 'Getting learned label key!', { source });
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
   * Handle opening loadout dialog.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static async #openLoadouts(_event, _target) {
    log(3, 'Handling loadout dialog.', { _event, _target });
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._state.activeClass;
    if (!classIdentifier) return;
    new LoadoutSelector(this.actor, this, classIdentifier).render({ force: true });
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
      SpellBook._updateFavoriteButtonState(target, newFavoriteStatus);
    } catch (error) {
      log(1, 'Error toggling favorite:', error);
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
    log(3, 'Updating favorite button state.', { button, isFavorited });
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
   * Handle opening party manager.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static async #openPartyMode(_event, _target) {
    log(3, 'Handling opening party manager.', { _event, _target });
    const primaryGroup = PartyMode.getPrimaryGroupForActor(this.actor);
    if (!primaryGroup) return;
    const partyActors = PartyMode.getPartyActors(primaryGroup);
    if (partyActors.length === 0) return;
    new PartyCoordinator(partyActors, this.actor, primaryGroup).render({ force: true });
  }

  /**
   * Handle toggling party mode (called from context menu).
   * @returns {Promise<void>}
   * @private
   */
  async _togglePartyMode() {
    log(3, 'Handling partymode toggle.');
    const primaryGroup = PartyMode.getPrimaryGroupForActor(this.actor);
    if (!primaryGroup) return;
    const currentMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
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
    log(3, 'Confirming if actor has the spell prepared.', { actor, spellUuid });
    if (!PartyMode.prototype.hasViewPermission(actor)) return false;
    const preparedSpells = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS) || [];
    if (preparedSpells.includes(spellUuid)) return true;
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    for (const classSpells of Object.values(preparedByClass)) {
      for (const spellKey of classSpells) {
        const parsed = this.spellManager._parseClassSpellKey(spellKey);
        if (parsed?.spellUuid === spellUuid) return true;
      }
    }
    return false;
  }

  /**
   * Handle form submission by updating internal state cache.
   * @param {Event} _event - The form submission event
   * @param {HTMLElement} form - The form element
   * @param {Object} _formData - The form data
   * @returns {Promise<void>}
   * @static
   */
  static async formHandler(_event, form, _formData) {
    const targetElement = form || this.element;
    if (!targetElement) return;
    const allInputs = targetElement.querySelectorAll('input, select, textarea, dnd5e-checkbox');
    allInputs.forEach((input) => {
      const inputKey = this._getInputCacheKey(input);
      if (!inputKey) return;
      let value;
      if (input.type === 'checkbox' || input.matches('dnd5e-checkbox')) value = input.checked;
      else if (input.tagName === 'SELECT' && input.multiple) value = Array.from(input.selectedOptions).map((option) => option.value);
      else value = input.value;
      this._formStateCache.set(inputKey, value);
    });
    log(3, 'Updated form state cache.');
  }

  /**
   * Handle save button click.
   * @this SpellBook
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   * @todo Investigate bug: Non-prepared Revivify spells are slowly being removed from actors
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
      const sourceClass = checkbox.dataset.sourceClass || 'unknown';
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
}
