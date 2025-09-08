/**
 * Player Spell Book Application
 *
 * The primary user-facing interface for managing spells, spell preparation, and spellcasting
 * capabilities. This comprehensive application serves as the central hub for all spell-related
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
import * as DataHelpers from '../data/_module.mjs';
import { SpellComparisonDialog, SpellDetailsCustomization, SpellLoadoutDialog, SpellNotesDialog, SpellbookSettingsDialog } from '../dialogs/_module.mjs';
import { log } from '../logger.mjs';
import { SpellLoadoutManager, SpellManager, WizardSpellbookManager, PartySpellManager } from '../managers/_module.mjs';
import { SpellbookState } from '../state/_module.mjs';
import * as UIHelpers from '../ui/_module.mjs';
import * as ValidationHelpers from '../validation/_module.mjs';
import { PlayerFilterConfiguration, SpellAnalyticsDashboard, PartySpells } from './_module.mjs';

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
 *
 * This is the main application interface that players interact with to manage their
 * spells, preparation, and related features. It serves as a thin application layer
 * that delegates business logic to specialized managers and helpers while providing
 * a comprehensive and user-friendly interface.
 *
 * The application dynamically generates tabs for each spellcasting class and wizard
 * spellbook, provides advanced filtering capabilities, manages spell preparation
 * with enforcement rules, and integrates with the broader spell book ecosystem
 * including analytics, loadouts, and party coordination.
 */
export class SpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: `player-${MODULE.ID}`,
    tag: 'form',
    form: {
      handler: SpellBook.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
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
   *
   * Returns the wizard manager with preference for the 'wizard' identifier,
   * falling back to the first available wizard manager.
   *
   * @returns {WizardSpellbookManager|null} The primary wizard manager instance or null if none found
   */
  get wizardManager() {
    for (const [identifier, manager] of this.wizardManagers) if (manager.isWizard) if (identifier === 'wizard') return manager;
    for (const [manager] of this.wizardManagers) if (manager.isWizard) return manager;
    return null;
  }

  /**
   * Create a new SpellBook application.
   *
   * Initializes the spell book with comprehensive manager setup, state tracking,
   * and UI helpers. Sets up wizard managers for all wizard-enabled classes and
   * establishes event listeners for actor updates.
   *
   * @param {Actor} actor - The actor whose spells to display
   * @param {Object} [options={}] - Application options
   */
  constructor(actor, options = {}) {
    super(options);

    /** @type {Actor} The actor whose spells are being managed */
    this.actor = actor;

    /** @type {Actor|null} The primary group actor for this actor */
    this.group = PartySpellManager.getPrimaryGroupForActor(actor);

    /** @type {SpellManager} Main spell management instance */
    this.spellManager = new SpellManager(actor);

    /** @type {Map<string, WizardSpellbookManager>} Wizard managers by class identifier */
    this.wizardManagers = new Map();

    // Initialize wizard managers for all wizard-enabled classes
    const wizardClasses = DataHelpers.getWizardEnabledClasses(actor);
    for (const { identifier } of wizardClasses) this.wizardManagers.set(identifier, new WizardSpellbookManager(actor, identifier));

    /** @type {SpellbookState} State manager for the application */
    this._stateManager = new SpellbookState(this);

    /** @type {UIHelpers.SpellbookUI} UI helper for interface management */
    this.ui = new UIHelpers.SpellbookUI(this);

    /** @type {UIHelpers.SpellbookFilterHelper} Filter helper for spell filtering */
    this.filterHelper = new UIHelpers.SpellbookFilterHelper(this);

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

    /** @type {SpellComparisonDialog|null} Active comparison dialog */
    this.comparisonDialog = null;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    if (isPartyMode) await this.actor.setFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED, false);
    const context = this._createBaseContext(options);
    await this._ensureAllSpellDataLoaded();
    if (!this._stateManager._classesDetected) this._stateManager.detectSpellcastingClasses();
    context.spellcastingClasses = this._stateManager.spellcastingClasses;
    context.activeClass = this._stateManager.activeClass;
    context.activeTab = this.tabGroups['spellbook-tabs'];
    context.tabs = this._getTabs();
    context.globalPrepared = this._stateManager.spellPreparation;
    context.classPreparationData = this._prepareClassPreparationData();
    context.isWizard = !this.wizardManager?.isWizard;
    context.hasMultipleTabs = Object.keys(context.tabs).length > 1;
    context.filters = this._prepareFilters();
    const activeTab = context.activeTab;
    if (activeTab && (activeTab === 'wizardbook' || activeTab.startsWith('wizardbook-'))) {
      const wizardTabData = this._stateManager.tabData?.[activeTab];
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
      if (this._stateManager.classSpellData[classIdentifier]) {
        context.classIdentifier = classIdentifier;
        context.className = this._stateManager.classSpellData[classIdentifier].className;
        const flattenedSpells = this._stateManager.classSpellData[classIdentifier].spellLevels;
        context.spellLevels = flattenedSpells;
        context.spellPreparation = this._stateManager.classSpellData[classIdentifier].spellPreparation;
        context.globalPrepared = this._stateManager.spellPreparation;
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
      context.className = this._stateManager.classSpellData[classIdentifier]?.className || classIdentifier;
      const wizardManager = this.wizardManagers.get(classIdentifier);
      context.isWizard = wizardManager?.isWizard || false;
      context.isForceWizard = wizardManager?.classItem && DataHelpers.isClassWizardEnabled(this.actor, classIdentifier);
      const wizardTabData = this._stateManager.tabData?.[partId];
      if (wizardTabData) {
        context.spellLevels = wizardTabData.spellLevels || [];
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

  /**
   * Create the base context for the application.
   *
   * Establishes the foundational context including button configuration,
   * party integration, actor information, and basic spell book data.
   *
   * @param {Object} options - The options passed to the context preparation
   * @returns {Object} The base context
   * @private
   */
  _createBaseContext(options) {
    const context = super._prepareContext(options);

    /** @type {Array<SpellBookButton>} */
    const buttons = [
      {
        type: 'submit',
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
    const partyActors = PartySpellManager.getPartyActors();
    const showPartyButton = partyActors.length !== 0;
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
   *
   * Dynamically creates template parts for each detected spellcasting class
   * and wizard-enabled class, allowing for proper tab rendering and navigation.
   *
   * @private
   */
  _registerClassParts() {
    if (!this._stateManager._classesDetected) this._stateManager.detectSpellcastingClasses();
    if (this._stateManager.spellcastingClasses) {
      for (const [identifier, classData] of Object.entries(this._stateManager.spellcastingClasses)) {
        const tabId = `${identifier}Tab`;
        this.constructor.PARTS[tabId] = {
          template: TEMPLATES.PLAYER_SPELL_BOOK.TAB_SPELLS,
          scrollable: [''],
          data: { classIdentifier: identifier, className: classData.name }
        };
        log(3, `Registered class tab part: ${tabId}`);
      }
    }
    const wizardClasses = DataHelpers.getWizardEnabledClasses(this.actor);
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

  /**
   * Ensure all spell data (including wizard data) is loaded before rendering.
   *
   * Handles the complex initialization sequence for spell data loading,
   * including wizard data completion, state manager initialization, and
   * UI updates. Provides error handling with user-friendly error states.
   *
   * @returns {Promise<void>}
   * @private
   */
  async _ensureAllSpellDataLoaded() {
    if (this._isLoadingSpellData) return;
    this._isLoadingSpellData = true;
    try {
      if (!this._stateManager._initialized) {
        log(3, 'Initializing state manager and waiting for wizard data completion');
        await this._stateManager.initialize();
        await this._stateManager.waitForWizardDataCompletion();
        this.ui.updateSpellPreparationTracking();
        this.ui.updateSpellCounts();
        log(3, 'State manager initialization and wizard data loading completed');
        return;
      }
      await this._stateManager.waitForWizardDataCompletion();
      await this._renderAllSpells();
      this.ui.updateSpellPreparationTracking();
      this.ui.updateSpellCounts();
      this.ui.setupCantripUI();
    } catch (error) {
      log(1, 'Error ensuring all spell data is loaded:', error);
      this._showErrorState(error);
    } finally {
      this._isLoadingSpellData = false;
      if (this.element) await this._applyFavoriteStatesAfterRender();
    }
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
   *
   * Transforms raw spell data into a display-ready format with all necessary
   * UI elements including checkboxes, CSS classes, data attributes, and tags.
   * Handles complex preparation logic and wizard spellbook integration.
   *
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
    const checkbox = ValidationHelpers.createCheckbox({
      name: `spellPreparation.${spell.compendiumUuid}`,
      checked: spell.preparation.prepared,
      disabled: spell.preparation.disabled,
      ariaLabel: ariaLabel
    });
    checkbox.id = `prep-${spell.compendiumUuid}`;
    checkbox.dataset.uuid = spell.compendiumUuid;
    checkbox.dataset.name = spell.name;
    checkbox.dataset.ritual = spell.filterData?.isRitual || false;
    checkbox.dataset.wasPrepared = spell.preparation.prepared;
    let sourceClass = null;
    if (spell.system?.sourceClass) sourceClass = spell.system.sourceClass;
    else if (spell.sourceClass) sourceClass = spell.sourceClass;
    else if (spell.preparation?.preparedByOtherClass) sourceClass = spell.preparation.preparedByOtherClass;
    if (sourceClass) checkbox.dataset.sourceClass = sourceClass;
    else if (spell.preparation?.prepared) log(2, `No source class found for prepared spell: ${spell.name}`);
    if (spell.preparation?.preparedByOtherClass) checkbox.dataset.crossClass = 'true';
    if (spell.preparation.disabled && spell.preparation.disabledReason) checkbox.dataset.tooltip = game.i18n.localize(spell.preparation.disabledReason);
    processedSpell.preparationCheckboxHtml = ValidationHelpers.elementToHtml(checkbox);
    if (spell.sourceClass && this._stateManager.wizardSpellbookCache) {
      const classSpellbook = this._stateManager.wizardSpellbookCache.get(spell.sourceClass);
      processedSpell.inWizardSpellbook = classSpellbook ? classSpellbook.includes(spell.compendiumUuid) : false;
    } else processedSpell.inWizardSpellbook = false;
    if (this.comparisonSpells.size < game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX)) {
      processedSpell.showCompareLink = true;
      processedSpell.isInComparison = this.comparisonSpells.has(spell.compendiumUuid);
    }
    return processedSpell;
  }

  /**
   * Get data attributes for a spell item.
   *
   * Creates HTML data attributes for spell filtering, searching, and display.
   * Includes comprehensive spell metadata for advanced filtering capabilities.
   *
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
   *
   * Determines appropriate CSS classes based on spell preparation status,
   * ownership, and wizard spellbook inclusion.
   *
   * @param {Object} spell - The spell object
   * @returns {string} Space-separated CSS classes
   * @private
   */
  _getSpellCssClasses(spell) {
    const classes = ['spell-item'];
    if (spell.preparation?.isOwned) classes.push('owned-spell');
    if (spell.preparation?.prepared) classes.push('prepared-spell');
    if (this._stateManager.wizardSpellbookCache && spell.sourceClass) {
      const classSpellbook = this._stateManager.wizardSpellbookCache.get(spell.sourceClass);
      if (classSpellbook && classSpellbook.includes(spell.compendiumUuid)) classes.push('in-wizard-spellbook');
    }
    return classes.join(' ');
  }

  /**
   * Get the preparation tag for a spell.
   *
   * Creates display tags for special spell preparation modes including
   * always prepared, granted, pact, innate, ritual, and at-will spells.
   *
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
    super._onRender(context, options);
    this._setupContentWrapper();
    const sidebarControlsBottom = game.settings.get(MODULE.ID, SETTINGS.SIDEBAR_CONTROLS_BOTTOM);
    this.element.dataset.sidebarControlsBottom = sidebarControlsBottom;
    this.ui.setSidebarState();
    this.ui.positionFooter();
    this.ui.setupFilterListeners();
    if (!this._preparationListenersSetup) {
      this.setupPreparationListeners();
      this._preparationListenersSetup = true;
    }
    this.ui.applyCollapsedLevels();
    this.ui.setupCantripUI();
    this.ui.updateSpellCounts();
    if (!this._classColorsApplied || this._classesChanged) {
      await this.ui.applyClassStyling();
      this._classColorsApplied = true;
      this._classesChanged = false;
    }
    this._setupLoadoutContextMenu();
    this.ui.setupAdvancedSearch();
    await this._ensureSpellData();
    const favoriteButtons = this.element.querySelectorAll('.spell-favorite-toggle[data-uuid]');
    if (favoriteButtons.length > 0) {
      await this._applyFavoriteStatesToButtons(favoriteButtons);
      favoriteButtons.forEach((button) => button.setAttribute('data-favorites-applied', 'true'));
    }
    this._setupPartyContextMenu();
  }

  /** @inheritdoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if (this.wizardManagers.size > 0) {
      this._wizardBookImages = new Map();
      const colorPromises = [];
      for (const [identifier, wizardManager] of this.wizardManagers) {
        if (wizardManager.isWizard) {
          const classData = this._stateManager.spellcastingClasses[identifier];
          if (classData && classData.img) {
            const colorPromise = (async () => {
              try {
                let dominantColor;
                const customColor = game.settings.get(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR);
                if (customColor && customColor !== null && customColor !== '') {
                  dominantColor = customColor.css;
                  log(3, `Using custom color ${dominantColor} for wizard book ${identifier}`);
                } else {
                  dominantColor = await UIHelpers.extractDominantColor(classData.img);
                  log(3, `Extracted color ${dominantColor} from class image for wizard book ${identifier}`);
                }
                const theme = UIHelpers.d ? UIHelpers.d() : 'dark';
                const background = theme === 'light' ? '#f4f4f4' : '#1b1d24';
                const contrast = UIHelpers.getContrastRatio ? UIHelpers.getContrastRatio(dominantColor, background) : 'unavailable';
                const wizardBookImage = await UIHelpers.applyColorOverlay(ASSETS.WIZARDBOOK_ICON, dominantColor);
                this._wizardBookImages.set(identifier, wizardBookImage);
                log(3, `Applied ${dominantColor} color overlay to wizardbook for class ${identifier}`);
              } catch (error) {
                log(1, `Failed to apply color overlay for class ${identifier}:`, error);
                this._wizardBookImages.set(identifier, ASSETS.WIZARDBOOK_ICON);
              }
            })();
            colorPromises.push(colorPromise);
          } else {
            this._wizardBookImages.set(identifier, ASSETS.WIZARDBOOK_ICON);
          }
        }
      }
      await Promise.all(colorPromises);
      this.render(false, { parts: ['navigation'] });
    }
    this._stateManager.clearFavoriteSessionState();
    await this._syncJournalToActorState();
  }

  /**
   * Ensure spell data is loaded (alternate entry point).
   *
   * @todo Consolidate with _ensureAllSpellDataLoaded to eliminate duplication
   * @private
   */
  async _ensureSpellData() {
    if (this._isLoadingSpellData) return;
    this._isLoadingSpellData = true;
    try {
      if (!this._stateManager._initialized) {
        await this._stateManager.initialize();
        this.ui.updateSpellPreparationTracking();
        this.ui.updateSpellCounts();
        this.render(false);
        return;
      }
      await this._renderAllSpells();
      this.ui.updateSpellPreparationTracking();
      this.ui.updateSpellCounts();
      this.ui.setupCantripUI();
    } catch (error) {
      log(1, 'Error loading spell data:', error);
      this._showErrorState(error);
    } finally {
      this._isLoadingSpellData = false;
      await this._applyFavoriteStatesAfterRender();
    }
  }

  /**
   * Render all spells for the currently active tab.
   *
   * Dynamically renders spell level sections for the active tab by removing
   * existing content and rebuilding from current spell data. Handles both
   * class tabs and wizard tabs appropriately.
   *
   * @returns {Promise<void>}
   * @private
   */
  async _renderAllSpells() {
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent) return;
    const spellsContainer = activeTabContent.querySelector('.spells-container');
    if (!spellsContainer) return;
    const existingSpellLevels = spellsContainer.querySelectorAll('.spell-level');
    existingSpellLevels.forEach((el) => el.remove());
    const classIdentifier = activeTabContent.dataset.classIdentifier;
    let tabData;
    if (activeTab.startsWith('wizardbook-')) tabData = this._stateManager.tabData[activeTab];
    else tabData = this._stateManager.getClassTabData(classIdentifier);
    if (!tabData || !tabData.spellLevels) return;
    for (const levelData of tabData.spellLevels) {
      const levelHtml = this._createSpellLevelHtml(levelData);
      spellsContainer.insertAdjacentHTML('beforeend', levelHtml);
    }
    this._applyCollapsedStateToExistingHeaders();
    this.ui.updateSpellCounts();
    const favoriteButtons = spellsContainer.querySelectorAll('.spell-favorite-toggle[data-uuid]');
    if (favoriteButtons.length > 0) {
      await this._applyFavoriteStatesToButtons(favoriteButtons);
      favoriteButtons.forEach((button) => button.setAttribute('data-favorites-applied', 'true'));
    }
    const cantripLevel = spellsContainer.querySelector('.spell-level[data-level="0"]');
    if (cantripLevel) this.ui.updateCantripCounter(cantripLevel, true);
  }

  /**
   * Create HTML string for a spell level section.
   *
   * Generates the complete HTML structure for a spell level including header,
   * collapse controls, spell count indicators, cantrip counters, and spell list.
   *
   * @param {Object} levelData - The spell level data containing level, name, and spells
   * @returns {string} HTML string for the spell level section
   * @private
   */
  _createSpellLevelHtml(levelData) {
    const level = String(levelData.level);
    const levelName = levelData.name;
    const spells = levelData.spells || [];
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
    const isCollapsed = collapsedLevels.includes(level);
    let spellsHtml = '';
    for (const spell of spells) {
      const processedSpell = this._processSpellForDisplay(spell);
      spellsHtml += this._createSpellItemHtml(processedSpell);
    }
    let preparedCount = 0;
    if (level !== '0') preparedCount = spells.filter((spell) => spell.preparation?.prepared).length;
    let cantripCounterHtml = '';
    if (level === '0') cantripCounterHtml = '<span class="cantrip-counter" title="Current/Maximum Cantrips">[0/0]</span>';
    return `
    <div class="spell-level" data-level="${level}">
      <h3 class="spell-level-heading" data-action="toggleSpellLevel" data-level="${level}" role="button" aria-expanded="${!isCollapsed}" aria-controls="spell-list-${level}" style="">
        <i class="fas fa-caret-${isCollapsed ? 'right' : 'down'} collapse-indicator" aria-hidden="true"></i>
        ${levelName}
        <span class="spell-count" aria-label="Spell Count">(${preparedCount}/${spells.length})</span>${cantripCounterHtml}
      </h3>
      <ul class="spell-list" id="spell-list-${level}" style="${isCollapsed ? 'display: none;' : ''}" role="list">
        ${spellsHtml}
      </ul>
    </div>
  `;
  }

  /**
   * Show error state if spell loading fails.
   *
   * Displays a user-friendly error message with retry functionality when
   * spell data loading encounters problems.
   *
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
      spellsContainer.addEventListener('retry-load', () => {
        this._ensureSpellData();
      });
    }
  }

  /**
   * Apply favorite states after render based on user data.
   *
   * Handles the application of favorite states to spell buttons after rendering,
   * including retry logic for delayed button availability.
   *
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
   *
   * Updates favorite button states based on a combination of session state,
   * journal data, and actor ownership. Handles complex state reconciliation
   * between different data sources.
   *
   * @param {NodeList} buttons - The buttons to update
   * @private
   */
  async _applyFavoriteStatesToButtons(buttons) {
    const targetUserId = DataHelpers._getTargetUserId(this.actor);
    let updatedCount = 0;
    for (const button of buttons) {
      const spellUuid = button.dataset.uuid;
      if (!spellUuid) continue;
      let isFavorited = this._stateManager.getFavoriteSessionState(spellUuid);
      if (isFavorited === null) {
        const userData = await DataHelpers.SpellUserDataJournal.getUserDataForSpell(spellUuid, targetUserId, this.actor.id);
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
   *
   * @param {string} spellUuid - The spell UUID to check
   * @returns {boolean} Whether the spell is on the actor
   * @private
   */
  _isSpellOnActor(spellUuid) {
    return this.actor.items.some((item) => {
      if (item.type !== 'spell') return false;
      if (item.flags?.core?.sourceId === spellUuid) return true;
      if (item.uuid === spellUuid) return true;
      return false;
    });
  }

  /**
   * Set up the content wrapper element to allow hiding sidebar in collapsed mode.
   *
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
   *
   * Handles the case where user closed without saving - journal is "ahead" of actor.
   * Ensures consistency between journal data and actor state by synchronizing
   * favorites based on the actor's current state.
   *
   * @private
   */
  async _syncJournalToActorState() {
    try {
      log(3, 'Syncing journal favorites to current actor state...');
      const actorFavorites = this.actor.system.favorites || [];
      const actorFavoriteSpellIds = new Set(actorFavorites.filter((fav) => fav.type === 'item' && fav.id.startsWith('.Item.')).map((fav) => fav.id.replace('.Item.', '')));
      const actorSpells = this.actor.items.filter((item) => item.type === 'spell');
      const targetUserId = DataHelpers._getTargetUserId(this.actor);
      let syncCount = 0;
      const changedSpells = [];
      for (const spell of actorSpells) {
        const spellUuid = spell.flags?.core?.sourceId || spell.uuid;
        if (!spellUuid) continue;
        const isFavoritedInActor = actorFavoriteSpellIds.has(spell.id);
        const userData = await DataHelpers.SpellUserDataJournal.getUserDataForSpell(spellUuid, targetUserId, this.actor.id);
        const isFavoritedInJournal = userData?.favorited || false;
        if (isFavoritedInJournal && !isFavoritedInActor) {
          log(3, `Unfavoriting ${spell.name} in journal to match actor state`);
          await DataHelpers.SpellUserDataJournal.setSpellFavorite(spellUuid, false);
          changedSpells.push({ uuid: spellUuid, newState: false });
          syncCount++;
        }
        if (!isFavoritedInJournal && isFavoritedInActor) {
          log(3, `Favoriting ${spell.name} in journal to match actor state`);
          await DataHelpers.SpellUserDataJournal.setSpellFavorite(spellUuid, true);
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
   *
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
    if (this.ui?.advancedSearchManager) this.ui.advancedSearchManager.cleanup();
    super._onClose(options);
  }

  /**
   * Set up event listeners for spell preparation checkboxes and filter checkboxes.
   *
   * Only set up once to prevent multiple handlers. Handles both spell preparation
   * changes and filter changes through a single delegated event listener.
   *
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
   *
   * Dynamically generates tab configuration for all spellcasting classes
   * and wizard tabs, including proper icons, labels, and active states.
   *
   * @returns {Object<string, SpellBookTab>} The tab configuration
   * @private
   */
  _getTabs() {
    const tabGroup = 'spellbook-tabs';
    const tabs = {};
    if (!this.tabGroups[tabGroup] && this._stateManager.activeClass) this.tabGroups[tabGroup] = `${this._stateManager.activeClass}Tab`;
    else if (!this.tabGroups[tabGroup] && this.wizardManagers.size > 0) {
      const firstWizardClass = Array.from(this.wizardManagers.keys())[0];
      this.tabGroups[tabGroup] = `wizardbook-${firstWizardClass}`;
    } else if (!this.tabGroups[tabGroup] && Object.keys(this._stateManager.spellcastingClasses || {}).length > 0) {
      this.tabGroups[tabGroup] = `${Object.keys(this._stateManager.spellcastingClasses)[0]}Tab`;
    }
    if (this._stateManager.spellcastingClasses) {
      const sortedClassIdentifiers = Object.keys(this._stateManager.spellcastingClasses).sort();
      for (const identifier of sortedClassIdentifiers) {
        const classData = this._stateManager.spellcastingClasses[identifier];
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
          const wizardBookImage = this._wizardBookImages?.get(identifier) || ASSETS.WIZARDBOOK_ICON;
          tabs[wizardTabId] = {
            id: wizardTabId,
            label: game.i18n.format('SPELLBOOK.Tabs.WizardSpells', { class: className }),
            group: tabGroup,
            cssClass: this.tabGroups[tabGroup] === wizardTabId ? 'active' : '',
            icon: 'fa-solid fa-book-spells',
            data: {
              classImg: wizardBookImage,
              classIdentifier: identifier,
              className: className
            }
          };
        }
      }
    }
    return tabs;
  }

  /** @inheritdoc */
  changeTab(tabName, groupName, options = {}) {
    super.changeTab(tabName, groupName, options);
    const classMatch = tabName.match(/^([^T]+)Tab$/);
    const classIdentifier = classMatch ? classMatch[1] : null;
    if (classIdentifier && this._stateManager.classSpellData[classIdentifier]) this._stateManager.setActiveClass(classIdentifier);
    this._stateManager.updateGlobalPreparationCount();
    this._switchTabVisibility(tabName);
    this.render(false, { parts: ['footer'] });
    this.ui.updateSpellCounts();
    this.ui.updateSpellPreparationTracking();
    this.ui.setupCantripUI();
  }

  /**
   * Switch tab visibility without re-rendering.
   *
   * Efficiently switches between tabs by manipulating DOM visibility and
   * active states without triggering a full re-render.
   *
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

  /**
   * @todo This seems overly complicated and could be simplified
   * @inheritdoc
   */
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
   *
   * @returns {Array<Object>} Array of class preparation data
   * @private
   */
  _prepareClassPreparationData() {
    const activeTab = this.tabGroups['spellbook-tabs'];
    const classPreparationData = [];
    const activeClassMatch = activeTab?.match(/^([^T]+)Tab$/);
    const activeClassIdentifier = activeClassMatch ? activeClassMatch[1] : null;
    for (const [identifier, classData] of Object.entries(this._stateManager.classSpellData)) {
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
   *
   * Processes filter configuration including migration, validation, and
   * element generation for each enabled filter. Handles special cases
   * like favorites UI integration and range filters.
   *
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

        // Special handling for favorites filter
        if (filter.id === 'favorited') {
          const favoritesUIEnabled = game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES);
          filterEnabled = filter.enabled && favoritesUIEnabled;
        }

        // Special handling for party filter - only show when party mode is enabled
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
            element = ValidationHelpers.createTextInput({
              name: `filter-${filter.id}`,
              value: filterState[filter.id] || '',
              placeholder: `${game.i18n.localize(filter.label)}...`,
              ariaLabel: game.i18n.localize(filter.label),
              cssClass: 'advanced-search-input'
            });
            break;
          case 'dropdown':
            const options = ValidationHelpers.getOptionsForFilter(filter.id, filterState);
            element = ValidationHelpers.createSelect({
              name: `filter-${filter.id}`,
              options: options,
              ariaLabel: game.i18n.localize(filter.label)
            });
            break;
          case 'checkbox':
            element = ValidationHelpers.createCheckbox({
              name: `filter-${filter.id}`,
              checked: filterState[filter.id] || false,
              label: game.i18n.localize(filter.label),
              ariaLabel: game.i18n.localize(filter.label)
            });
            break;
          case 'range':
            element = this._createRangeFilterElement(filter.id, filterState);
            result.unit = DataHelpers.shouldUseMetricUnits() ? 'meters' : 'feet';
            break;
          default:
            log(2, `Unknown filter type: ${filter.type} for filter ${filter.id}`);
            return null;
        }
        if (!element) return null;
        result.elementHtml = ValidationHelpers.elementToHtml(element);
        return result;
      })
      .filter(Boolean);
    return result;
  }

  /**
   * Create a range filter element with min/max inputs.
   *
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
    const minInput = ValidationHelpers.createNumberInput({
      name: 'filter-min-range',
      value: filterState.minRange || '',
      placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMin'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMinLabel')
    });
    const separator = document.createElement('div');
    separator.className = 'range-separator';
    separator.setAttribute('aria-hidden', 'true');
    separator.innerHTML = '<dnd5e-icon src="systems/dnd5e/icons/svg/range-connector.svg"></dnd5e-icon>';
    const maxInput = ValidationHelpers.createNumberInput({
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
   * Create HTML for a spell item.
   *
   * @todo Should this be a template? This should be a template.
   * @param {ProcessedSpell} spell - Processed spell
   * @returns {string} HTML string
   * @private
   */
  _createSpellItemHtml(spell) {
    const tagHtml = spell.tag ? `<span class="tag ${spell.tag.cssClass}" ${spell.tag.tooltip ? `data-tooltip="${spell.tag.tooltip}"` : ''}>${spell.tag.text}</span>` : '';
    const enrichedIcon = spell.enrichedIcon || '';
    const name = spell.name || game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
    const formattedDetails = UIHelpers.UICustomizationHelper.buildPlayerMetadata(spell);
    const cssClasses = spell.cssClasses || 'spell-item';
    const dataAttributes = spell.dataAttributes || '';
    const activeTab = this.tabGroups['spellbook-tabs'];
    const isWizardTab = activeTab && activeTab.startsWith('wizardbook-');
    const spellUuid = spell.uuid || spell.compendiumUuid;
    let comparisonIconHtml = '';
    if (UIHelpers.UICustomizationHelper.isPlayerElementEnabled('compare') && spell.showCompareLink) {
      const activeClass = spell.isInComparison ? ' active' : '';
      const compareText = game.i18n.localize('SPELLBOOK.Comparison.Compare');
      const ariaLabel = game.i18n.format('SPELLBOOK.Comparison.CompareSpell', { name: name });
      comparisonIconHtml = `<i class="fa-solid fa-clipboard-question spell-compare-icon${activeClass}" data-action="compareSpell" data-uuid="${spell.compendiumUuid}" data-tooltip="${compareText}" aria-label="${ariaLabel}"></i>`;
    }
    const favoriteStarHtml =
      UIHelpers.UICustomizationHelper.isPlayerElementEnabled('favorites') && spellUuid
        ? `<button type="button" class="spell-favorite-toggle ${spell.favorited ? 'favorited' : ''}"
        data-action="toggleFavorite"
        data-uuid="${spellUuid}"
        data-tooltip="${spell.favorited ? game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites') : game.i18n.localize('SPELLBOOK.UI.AddToFavorites')}"
        aria-label="${spell.favorited ? game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites') : game.i18n.localize('SPELLBOOK.UI.AddToFavorites')}">
        <i class="${spell.favorited ? 'fas' : 'far'} fa-star" aria-hidden="true"></i>
      </button>`
        : '';
    const notesIconHtml =
      UIHelpers.UICustomizationHelper.isPlayerElementEnabled('notes') && spellUuid
        ? `<i class="${spell.hasNotes ? 'fas fa-sticky-note' : 'far fa-sticky-note'} spell-notes-icon"
        data-uuid="${spellUuid}" data-action="editNotes"
        data-tooltip="${spell.hasNotes ? game.i18n.localize('SPELLBOOK.UI.HasNotes') : game.i18n.localize('SPELLBOOK.UI.AddNotes')}"
        aria-label="${spell.hasNotes ? game.i18n.localize('SPELLBOOK.UI.HasNotes') : game.i18n.localize('SPELLBOOK.UI.AddNotes')}"></i>`
        : '';
    let actionHtml = '';
    if (isWizardTab) {
      if (spell.isFromScroll) {
        actionHtml = `
    <div class="wizard-spell-status">
      <button class="copy-spell-btn scroll-spell-btn" data-action="learnFromScroll"
        data-uuid="${spell.spellUuid || spell.compendiumUuid}" data-scroll-id="${spell.scrollId}" type="button"
        aria-label="${game.i18n.format('SPELLBOOK.Scrolls.LearnFromScroll', { name })}">
        <i class="fas fa-scroll"></i> ${game.i18n.localize('SPELLBOOK.Wizard.LearnSpell')}
      </button>
    </div>`;
      } else if (spell.inWizardSpellbook) {
        actionHtml = `
    <div class="wizard-spell-status">
      <span class="in-spellbook-tag" aria-label="${game.i18n.localize('SPELLBOOK.Wizard.InSpellbook')}">
        ${game.i18n.localize('SPELLBOOK.Wizard.InSpellbook')}
      </span>
    </div>`;
      } else if (spell.system?.level > 0) {
        actionHtml = `
    <div class="wizard-spell-status">
      <button class="copy-spell-btn" data-action="learnSpell" data-uuid="${spell.compendiumUuid}" type="button">
        <i class="fas fa-book"></i> ${game.i18n.localize('SPELLBOOK.Wizard.LearnSpell')}
      </button>
    </div>`;
      }
    } else {
      const preparationCheckboxHtml = spell.preparationCheckboxHtml || '';
      actionHtml = `
  <div class="spell-preparation dnd5e2">
    ${preparationCheckboxHtml}
  </div>`;
    }
    const subtitleParts = [];
    if (comparisonIconHtml) subtitleParts.push(comparisonIconHtml);
    if (notesIconHtml) subtitleParts.push(notesIconHtml);
    if (formattedDetails) subtitleParts.push(formattedDetails);
    const subtitleContent = subtitleParts.join(' ');
    const hasMaterialComponents = spell.filterData?.materialComponents?.hasConsumedMaterials === true;
    let tooltipAttr = '';
    if (hasMaterialComponents) {
      const lastIconIndex = subtitleContent.lastIndexOf('</i>');
      const tooltipContent = lastIconIndex !== -1 ? subtitleContent.substring(lastIconIndex + 4).trim() : subtitleContent;
      tooltipAttr = tooltipContent ? `data-tooltip="${tooltipContent}"` : '';
    }
    const spellHtml = `<li class="${cssClasses}" ${dataAttributes}>
  <div class="spell-name">
    ${enrichedIcon}
    <div class="name-stacked">
      <span class="title">${name}${favoriteStarHtml ? ` ${favoriteStarHtml}` : ''}${tagHtml ? ` ${tagHtml}` : ''}</span>
      ${subtitleContent ? `<span class="subtitle" ${tooltipAttr}>${subtitleContent}</span>` : ''}
    </div>
  </div>
  ${actionHtml}
</li>`;
    return this._enhanceSpellWithPartyIcons(spellHtml, spell);
  }

  /**
   * Apply filters to spells.
   *
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
   *
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
   *
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
   *
   * @todo Localize ui.notifications
   * @param {Event} event - The right-click event
   * @private
   */
  async _showLoadoutContextMenu(event) {
    this._hideLoadoutContextMenu();
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._stateManager.activeClass;
    if (!classIdentifier) return;
    try {
      const loadoutManager = new SpellLoadoutManager(this.actor, this);
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
          const dialog = new SpellLoadoutDialog(this.actor, this, classIdentifier);
          dialog.render(true);
        } else if (item.dataset.loadoutId) {
          const success = await loadoutManager.applyLoadout(item.dataset.loadoutId, classIdentifier);
          if (success) ui.notifications.info('Loadout applied successfully');
          else ui.notifications.error('Failed to apply loadout');
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
   *
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
   *
   * @param {Event} event - The click event
   * @param {HTMLElement} menu - The context menu element
   * @private
   */
  _positionPartyContextMenu(event, menu) {
    const button = event.currentTarget;
    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
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
   *
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
   *
   * @private
   */
  _hideLoadoutContextMenu() {
    const existingMenu = document.getElementById('spell-loadout-context-menu');
    if (existingMenu) existingMenu.remove();
    this._activeContextMenu = null;
  }

  /**
   * Hide party context menu.
   *
   * @private
   */
  _hidePartyContextMenu() {
    const existingMenu = document.getElementById('party-context-menu');
    if (existingMenu) existingMenu.remove();
    this._activePartyContextMenu = null;
  }

  /**
   * Handle preparation checkbox change with optimized UI updates.
   *
   * Processes spell preparation changes including validation, cantrip handling,
   * and UI state updates. Manages enforcement rules and provides user feedback
   * for preparation limitations.
   *
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
   *
   * Validates spell preparation changes against class limits and enforcement
   * rules, providing appropriate user feedback for invalid operations.
   *
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
    const classIdentifier = activeTabContent?.dataset.classIdentifier || sourceClass || this._stateManager.activeClass;
    if (!classIdentifier) return;
    const sourceSpell = await fromUuid(uuid);
    if (!sourceSpell) return;
    const classData = this._stateManager.classSpellData[classIdentifier];
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
  }

  /**
   * Handle cantrip preparation change using CantripManager.
   *
   * Processes cantrip preparation changes with specialized validation for
   * cantrip-specific rules including level-up restrictions and limits.
   *
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
    const classIdentifier = activeTabContent?.dataset.classIdentifier || sourceClass || this._stateManager.activeClass;
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
   *
   * Updates wizard spellbook counts and free spell tracking after a successful
   * spell learning operation.
   *
   * @param {boolean} isFree - Whether the spell was learned for free
   * @param {string} [classIdentifier='wizard'] - The class identifier for the wizard tab
   * @private
   */
  _updatewizardbookDataAfterSpellLearning(isFree, classIdentifier = 'wizard') {
    const wizardTabId = `wizardbook-${classIdentifier}`;
    if (this._stateManager.tabData && this._stateManager.tabData[wizardTabId]) {
      this._stateManager.tabData[wizardTabId].wizardTotalSpellbookCount = (this._stateManager.tabData[wizardTabId].wizardTotalSpellbookCount || 0) + 1;
      if (isFree) {
        this._stateManager.tabData[wizardTabId].wizardRemainingFreeSpells = Math.max(0, (this._stateManager.tabData[wizardTabId].wizardRemainingFreeSpells || 0) - 1);
        this._stateManager.tabData[wizardTabId].wizardHasFreeSpells = this._stateManager.tabData[wizardTabId].wizardRemainingFreeSpells > 0;
      }
      const wizardManager = this.wizardManagers.get(classIdentifier);
      if (wizardManager) wizardManager.invalidateCache();
    }
  }

  /**
   * Migrate filter configuration from old version to new version.
   *
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
   *
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
   *
   * Determines if a class requires a validation warning due to not being
   * from a compendium or D&D Beyond import, and lacking custom spell list configuration.
   *
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
   *
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
   *
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
   *
   * Provides two reset modes: normal reset (filters only) and shift+reset
   * (complete reset including preparation and favorites).
   *
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
          this._stateManager.updateFavoriteSessionState(spellUuid, false);
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
   *
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
   *
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
   *
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static configureCantripSettings(_event, _form) {
    const dialog = new SpellbookSettingsDialog(this.actor);
    dialog.render(true);
  }

  /**
   * Handle learn spell button click.
   *
   * Manages the wizard spell learning process including cost calculation,
   * confirmation dialog, and spell copying with appropriate UI feedback.
   *
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
      title: game.i18n.format('SPELLBOOK.Wizard.LearnSpellTitle', { name: spell.name }),
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
        if (this._stateManager.wizardSpellbookCache) {
          this._stateManager.wizardSpellbookCache.set(classIdentifier, [...(this._stateManager.wizardSpellbookCache.get(classIdentifier) || []), spellUuid]);
        }
        this._updatewizardbookDataAfterSpellLearning(costInfo.isFree, classIdentifier);
        await this._stateManager.refreshClassSpellData(classIdentifier);
        const spellItem = this.element.querySelector(`.spell-item[data-spell-uuid="${spellUuid}"]`);
        if (spellItem) {
          const buttonContainer = spellItem.querySelector('.wizard-spell-status');
          if (buttonContainer) {
            buttonContainer.innerHTML = `<span class="in-spellbook-tag" aria-label="Spell is in your spellbook">${game.i18n.localize('SPELLBOOK.Wizard.InSpellbook')}</span>`;
          }
          spellItem.classList.add('in-wizard-spellbook', 'prepared-spell');
        }
        this.render(false);
        setTimeout(() => {
          if (activeTab && this.tabGroups['spellbook-tabs'] !== activeTab) {
            this.changeTab(activeTab, 'spellbook-tabs');
          }
          collapsedLevels.forEach((levelId) => {
            const levelEl = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
            if (levelEl) {
              levelEl.classList.add('collapsed');
              const heading = levelEl.querySelector('.spell-level-heading');
              if (heading) heading.setAttribute('aria-expanded', 'false');
            }
          });
        }, 50);
      } else {
        ui.notifications.warn(game.i18n.format('SPELLBOOK.Wizard.LearnFailed', { name: spell.name }));
      }
    }
  }

  /**
   * Handle learning a spell from a scroll.
   *
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async handleLearnFromScroll(event, _form) {
    const spellUuid = event.target.dataset.uuid;
    const scrollId = event.target.dataset.scrollId;
    if (!spellUuid || !scrollId) return;
    const scrollSpellData = this._stateManager.scrollSpells.find((s) => s.spellUuid === spellUuid && s.scrollId === scrollId);
    if (!scrollSpellData) return;
    const wizardManager = this.wizardManager;
    if (!wizardManager) return;
    const success = await DataHelpers.learnSpellFromScroll(this.actor, scrollSpellData, wizardManager);
    if (success) {
      await this._stateManager.refreshClassSpellData('wizard');
      this.render(false);
    }
  }

  /**
   * Open the spell loadout dialog.
   *
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async openLoadoutDialog(_event, _form) {
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._stateManager.activeClass;
    if (!classIdentifier) return;
    const dialog = new SpellLoadoutDialog(this.actor, this, classIdentifier);
    dialog.render(true);
  }

  /**
   * Handle toggling spell favorite status.
   *
   * Manages the complete favorite toggle process including journal persistence,
   * actor favorites synchronization, and UI state updates.
   *
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
      const userData = await DataHelpers.SpellUserDataJournal.getUserDataForSpell(spellUuid, targetUserId, targetActorId);
      const currentlyFavorited = userData?.favorited || false;
      const newFavoriteStatus = !currentlyFavorited;
      this._stateManager.updateFavoriteSessionState(spellUuid, newFavoriteStatus);
      const success = await DataHelpers.setSpellFavorite(spellUuid, newFavoriteStatus, targetUserId, targetActorId);
      if (!success) {
        log(1, `Failed to persist favorite status for ${spellUuid}`);
        this._stateManager.updateFavoriteSessionState(spellUuid, currentlyFavorited);
        return;
      }
      if (newFavoriteStatus) await UIHelpers.addSpellToActorFavorites(spellUuid, this.actor);
      else await UIHelpers.removeSpellFromActorFavorites(spellUuid, this.actor);
      SpellBook._updateFavoriteButtonState(target, newFavoriteStatus);
      log(3, `Successfully toggled favorite for spell ${spellUuid}: ${newFavoriteStatus}`);
    } catch (error) {
      log(1, 'Error in handleToggleFavorite:', error);
      const userData = await DataHelpers.SpellUserDataJournal.getUserDataForSpell(spellUuid, null, this.actor.id);
      this._stateManager.updateFavoriteSessionState(spellUuid, userData?.favorited || false);
    }
  }

  /**
   * Update favorite button state immediately.
   *
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
   *
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The target element containing spell data
   * @static
   */
  static async handleEditNotes(event, target) {
    event.preventDefault();
    const spellUuid = target.dataset.uuid;
    if (!spellUuid) return;
    const spellName = fromUuidSync(spellUuid).name;
    new SpellNotesDialog({ spellUuid, spellName, actor: this.actor }).render(true);
  }

  /**
   * Handle opening the spell analytics dashboard.
   *
   * @param {MouseEvent} _event - The click event (unused)
   * @param {HTMLElement} _target - The target element (unused)
   * @returns {Promise<void>}
   * @static
   */
  static async handleOpenAnalyticsDashboard(_event, _target) {
    new SpellAnalyticsDashboard().render({ force: true });
  }

  /**
   * Handle spell comparison selection and dialog management.
   *
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
        this.comparisonDialog = new SpellComparisonDialog(this);
        this.comparisonDialog.render(true);
      } else {
        this.comparisonDialog.render(false);
        this.comparisonDialog.bringToFront();
      }
    }
  }

  /**
   * Handle opening spell details customization dialog.
   *
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the event
   * @static
   */
  static handleOpenCustomization(_event, _target) {
    const dialog = new SpellDetailsCustomization();
    dialog.render(true);
  }

  /**
   * Open party spell manager.
   *
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The event target
   * @static
   */
  static async openPartyManager(_event, _target) {
    const partyActors = PartySpellManager.getPartyActors();
    if (partyActors.length === 0) {
      ui.notifications.warn('SPELLBOOK.Party.NoSpellcasters', { localize: true });
      return;
    }
    const manager = new PartySpells(partyActors, this.actor, this.group);
    manager.render(true);
  }

  /**
   * Toggle party mode visualization.
   *
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The event target
   * @static
   */
  static async togglePartyMode(_event, _target) {
    const currentMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    await this.actor.setFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED, !currentMode);
    await this.render();
    ui.notifications.info(!currentMode ? 'SPELLBOOK.Party.PartyModeEnabled' : 'SPELLBOOK.Party.PartyModeDisabled', { localize: true });
  }

  /**
   * Enhance spell rendering with party member icons.
   *
   * Adds party member icons to spells when party mode is enabled, showing
   * which other party members have the same spell prepared.
   *
   * @param {string} spellHtml - Original spell HTML
   * @param {Object} spellData - Spell data
   * @returns {string} Enhanced HTML with party member icons
   * @private
   */
  _enhanceSpellWithPartyIcons(spellHtml, spellData) {
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    if (!isPartyMode) return spellHtml;
    const partyActors = PartySpellManager.getPartyActors();
    const tokenLimit = game.settings.get(MODULE.ID, SETTINGS.PARTY_MODE_TOKEN_LIMIT);
    let partyIcons = '';
    let iconCount = 0;
    for (const actor of partyActors) {
      if (iconCount >= tokenLimit) break;
      if (actor.id === this.actor.id) continue;
      if (this._actorHasSpellPrepared(actor, spellData.uuid)) {
        const associatedUser = game.users.find((user) => user.character?.id === actor.id);
        const userColor = associatedUser?.color?.css || game.user.color.css || 'transparent';
        partyIcons += `<img src="${actor.img}" class="party-member-icon" data-tooltip="${actor.name}"  data-actor-id="${actor.id}" style="box-shadow: 0 0 0.1rem 0.1rem ${userColor};">`;
        iconCount++;
      }
    }
    if (partyIcons) {
      const titleStartIndex = spellHtml.indexOf('<span class="title">');
      if (titleStartIndex !== -1) {
        const titleContentStart = titleStartIndex + '<span class="title">'.length;
        const titleEndIndex = spellHtml.indexOf('</span>', titleContentStart);
        if (titleEndIndex !== -1) {
          const beforeTitle = spellHtml.substring(0, titleEndIndex);
          const afterTitle = spellHtml.substring(titleEndIndex);
          return `${beforeTitle}<span class="party-icons">${partyIcons}</span>${afterTitle}`;
        }
      }
    }
    return spellHtml;
  }

  /**
   * Check if an actor has a specific spell prepared.
   *
   * @param {Actor} actor - The actor to check
   * @param {string} spellUuid - The spell UUID
   * @returns {boolean} True if actor has spell prepared
   * @private
   */
  _actorHasSpellPrepared(actor, spellUuid) {
    if (!PartySpellManager.prototype.hasViewPermission(actor)) return false;

    // Check both the legacy prepared spells flag and the new class-based system
    const preparedSpells = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS) || [];
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};

    // Check legacy flag first
    if (preparedSpells.includes(spellUuid)) return true;

    // Check class-based preparations
    for (const classSpells of Object.values(preparedByClass)) {
      for (const spellKey of classSpells) {
        // Parse the class spell key to extract UUID
        const parsed = this.spellManager._parseClassSpellKey(spellKey);
        if (parsed && parsed.spellUuid === spellUuid) return true;
      }
    }

    // Also check for canonical UUID matching (for spells copied from compendiums)
    for (const storedUuid of preparedSpells) {
      if (this._normalizeSpellUuid(storedUuid) === this._normalizeSpellUuid(spellUuid)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize spell UUIDs for comparison by resolving to canonical form.
   *
   * @param {string} uuid - Spell UUID to normalize
   * @returns {string} Normalized UUID
   * @private
   */
  _normalizeSpellUuid(uuid) {
    try {
      if (uuid.startsWith('Actor.')) {
        const spellDoc = fromUuidSync(uuid);
        return spellDoc?.flags?.core?.sourceId || uuid;
      }
      return uuid.replace(/\.Item\./g, '.');
    } catch (error) {
      return uuid;
    }
  }

  /**
   * Refresh the Spell Book after settings changes.
   *
   * @todo Can this be replaced since it's only called once?
   * @returns {Promise<void>}
   */
  async refreshFromSettingsChange() {
    const currentTab = this.tabGroups['spellbook-tabs'];
    this.spellManager.cantripManager.clearCache();
    this._stateManager._initialized = false;
    this._stateManager._classesDetected = false;
    this._stateManager.spellcastingClasses = {};
    this._stateManager.classSpellData = {};
    this._classesChanged = true;
    this._cantripUIInitialized = false;
    this.wizardManagers.clear();
    this.ritualManagers.clear();
    this._wizardBookImages?.clear();
    const wizardClasses = DataHelpers.getWizardEnabledClasses(this.actor);
    for (const { identifier } of wizardClasses) this.wizardManagers.set(identifier, new WizardSpellbookManager(this.actor, identifier));
    await this._stateManager.initialize();
    if (this.wizardManagers.size > 0) {
      if (!this._wizardBookImages) this._wizardBookImages = new Map();
      const usedImages = new Set();
      for (const [identifier, wizardManager] of this.wizardManagers) {
        if (wizardManager.isWizard && !this._wizardBookImages.has(identifier)) {
          let wizardBookImage;
          let attempts = 0;
          const classData = this._stateManager.classSpellData[identifier];
          if (classData && classData.classImg) {
            try {
              const dominantColor = await UIHelpers.extractDominantColor(classData.classImg);
              wizardBookImage = await UIHelpers.applyColorOverlay(ASSETS.WIZARDBOOK_ICON, dominantColor);
              log(3, `Applied ${dominantColor} color overlay to wizardbook for class ${identifier}`);
            } catch (error) {
              log(2, `Failed to apply color overlay for class ${identifier}:`, error);
              wizardBookImage = ASSETS.WIZARDBOOK_ICON;
            }
          } else {
            wizardBookImage = ASSETS.WIZARDBOOK_ICON;
          }
          do {
            attempts++;
          } while (usedImages.has(wizardBookImage) && attempts < 10);
          usedImages.add(wizardBookImage);
          this._wizardBookImages.set(identifier, wizardBookImage);
        }
      }
    }
    if (currentTab && this._stateManager.spellcastingClasses) {
      const classMatch = currentTab.match(/^([^T]+)Tab$/);
      const wizardMatch = currentTab.match(/^wizardbook-(.+)$/);
      if (classMatch) {
        const classIdentifier = classMatch[1];
        if (this._stateManager.classSpellData[classIdentifier]) {
          this.tabGroups['spellbook-tabs'] = currentTab;
          this._stateManager.setActiveClass(classIdentifier);
        } else {
          const firstClass = Object.keys(this._stateManager.spellcastingClasses)[0];
          if (firstClass) {
            this.tabGroups['spellbook-tabs'] = `${firstClass}Tab`;
            this._stateManager.setActiveClass(firstClass);
          }
        }
      } else if (wizardMatch) {
        const classIdentifier = wizardMatch[1];
        if (this.wizardManagers.has(classIdentifier)) {
          this.tabGroups['spellbook-tabs'] = currentTab;
          this._stateManager.setActiveClass(classIdentifier);
        } else {
          const firstWizardClass = Array.from(this.wizardManagers.keys())[0];
          if (firstWizardClass) {
            this.tabGroups['spellbook-tabs'] = `wizardbook-${firstWizardClass}`;
            this._stateManager.setActiveClass(firstWizardClass);
          } else {
            const firstClass = Object.keys(this._stateManager.spellcastingClasses)[0];
            if (firstClass) {
              this.tabGroups['spellbook-tabs'] = `${firstClass}Tab`;
              this._stateManager.setActiveClass(firstClass);
            }
          }
        }
      } else {
        const firstClass = Object.keys(this._stateManager.spellcastingClasses)[0];
        if (firstClass) {
          this.tabGroups['spellbook-tabs'] = `${firstClass}Tab`;
          this._stateManager.setActiveClass(firstClass);
        }
      }
    }
    this.render(true);
  }

  /**
   * Form handler for saving Spell Book settings with class-specific preparation AND favorites.
   *
   * Processes form submission including spell preparation changes, cantrip tracking,
   * ritual spell handling, and favorites integration. Manages complex class-specific
   * logic and provides comprehensive saving with proper notifications.
   *
   * @param {Event} _event - The form submission event
   * @param {HTMLElement} form - The form element
   * @param {Object} _formData - The form data
   * @returns {Promise<Actor|null>} The updated actor or null
   * @static
   */
  static async formHandler(_event, form, _formData) {
    const actor = this.actor;
    if (!actor) return null;
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
      const classData = this._stateManager.classSpellData[sourceClass];
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
    this._stateManager.clearFavoriteSessionState();
    await this._stateManager.addMissingRitualSpells(spellDataByClass);
    const allCantripChangesByClass = {};
    for (const [classIdentifier, classSpellData] of Object.entries(spellDataByClass)) {
      const saveResult = await this.spellManager.saveClassSpecificPreparedSpells(classIdentifier, classSpellData);
      if (saveResult && saveResult.cantripChanges && saveResult.cantripChanges.hasChanges) allCantripChangesByClass[classIdentifier] = saveResult.cantripChanges;
      const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
      for (const [classIdentifier, preparedSpells] of Object.entries(existingPreparedByClass)) {
        if (!spellDataByClass[classIdentifier]) preparedByClass[classIdentifier] = preparedSpells;
      }
      await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
    }
    await this._stateManager.sendGMNotifications(spellDataByClass, allCantripChangesByClass);
    await this._stateManager.handlePostProcessing(actor);
    this._newlyCheckedCantrips.clear();
    await UIHelpers.processFavoritesFromForm(form, actor);
    if (actor.sheet.rendered) actor.sheet.render(true);
    if (this.ui && this.rendered) {
      this.ui.setupCantripUI();
      this.ui.setupSpellLocks();
    }
    return actor;
  }
}
