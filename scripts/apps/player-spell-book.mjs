import { ASSETS, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as colorUtils from '../helpers/color-utils.mjs';
import * as filterUtils from '../helpers/filters.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
import { ScrollScanner } from '../helpers/scroll-scanner.mjs';
import * as spellFavorites from '../helpers/spell-favorites.mjs';
import { SpellUserDataJournal } from '../helpers/spell-user-data.mjs';
import { SpellbookState } from '../helpers/state/spellbook-state.mjs';
import { UICustomizationHelper } from '../helpers/ui-customization.mjs';
import { SpellbookFilterHelper } from '../helpers/ui/spellbook-filters.mjs';
import { SpellbookUI } from '../helpers/ui/spellbook-ui.mjs';
import { log } from '../logger.mjs';
import { RitualManager } from '../managers/ritual-manager.mjs';
import { SpellLoadoutManager } from '../managers/spell-loadout-manager.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';
import { WizardSpellbookManager } from '../managers/wizard-spellbook-manager.mjs';
import { PlayerFilterConfiguration } from './player-filter-configuration.mjs';
import { SpellAnalyticsDashboard } from './spell-analytics-dashboard.mjs';
import { SpellComparisonDialog } from './spell-comparison-dialog.mjs';
import { SpellDetailsCustomization } from './spell-details-customization.mjs';
import { SpellLoadoutDialog } from './spell-loadout-dialog.mjs';
import { SpellNotesDialog } from './spell-notes-dialog.mjs';
import { SpellbookSettingsDialog } from './spellbook-settings-dialog.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Player-facing spell book application for managing prepared spells
 * Thin application that delegates business logic to managers and helpers
 */
export class PlayerSpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `player-${MODULE.ID}`,
    tag: 'form',
    form: {
      handler: PlayerSpellBook.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      toggleSidebar: PlayerSpellBook.toggleSidebar,
      filterSpells: PlayerSpellBook.filterSpells,
      reset: PlayerSpellBook.handleReset,
      toggleSpellLevel: PlayerSpellBook.toggleSpellLevel,
      configureFilters: PlayerSpellBook.configureFilters,
      configureCantripSettings: PlayerSpellBook.configureCantripSettings,
      learnSpell: PlayerSpellBook.learnSpell,
      learnFromScroll: PlayerSpellBook.handleLearnFromScroll,
      openLoadoutDialog: PlayerSpellBook.openLoadoutDialog,
      toggleFavorite: PlayerSpellBook.handleToggleFavorite,
      editNotes: PlayerSpellBook.handleEditNotes,
      openAnalyticsDashboard: PlayerSpellBook.handleOpenAnalyticsDashboard,
      compareSpell: PlayerSpellBook.handleCompareSpell,
      openCustomization: PlayerSpellBook.handleOpenCustomization
    },
    classes: ['spell-book', 'vertical-tabs'],
    window: { icon: 'spell-book-module-icon', resizable: true, minimizable: true, positioned: true },
    position: { height: 875, width: 600 }
  };

  static PARTS = {
    container: { template: TEMPLATES.PLAYER.CONTAINER },
    sidebar: { template: TEMPLATES.PLAYER.SIDEBAR },
    navigation: { template: TEMPLATES.PLAYER.TAB_NAV },
    footer: { template: TEMPLATES.PLAYER.FOOTER }
  };

  /**
   * Get the window title for this application
   * @returns {string} The formatted title including actor name
   */
  get title() {
    return game.i18n.format('SPELLBOOK.Application.ActorTitle', { name: this.actor.name });
  }

  /**
   * Get the primary wizard manager (for backward compatibility)
   * @returns {WizardSpellbookManager|null}
   */
  get wizardManager() {
    for (const [identifier, manager] of this.wizardManagers) if (manager.isWizard) if (identifier === 'wizard') return manager;
    for (const [identifier, manager] of this.wizardManagers) if (manager.isWizard) return manager;
    return null;
  }

  /**
   * Create a new PlayerSpellBook application
   * @param {Actor} actor - The actor whose spells to display
   * @param {Object} options - Application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.spellManager = new SpellManager(actor, this);
    this.wizardManagers = new Map();
    const wizardClasses = genericUtils.getWizardEnabledClasses(actor);
    for (const { identifier } of wizardClasses) this.wizardManagers.set(identifier, new WizardSpellbookManager(actor, identifier));
    this._stateManager = new SpellbookState(this);
    this.ui = new SpellbookUI(this);
    this.filterHelper = new SpellbookFilterHelper(this);
    this.ritualManagers = new Map();
    this.spellLevels = [];
    this.className = '';
    this.spellPreparation = { current: 0, maximum: 0 };
    this._newlyCheckedCantrips = new Set();
    this._isLongRest = this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED) || false;
    this._wizardInitialized = false;
    this._registerClassParts();
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
          this.render(false);
        }
      }
    });
    this._isLoadingSpellData = false;
    this.comparisonSpells = new Set();
    this.comparisonDialog = null;
  }

  /**
   * Get or create ritual managers for wizard-enabled classes
   * @param {string} classIdentifier - The class identifier
   * @returns {RitualManager|null}
   */
  getRitualManager(classIdentifier = 'wizard') {
    if (!this.ritualManagers.has(classIdentifier)) {
      const wizardManager = this.wizardManagers.get(classIdentifier);
      if (wizardManager?.isWizard) this.ritualManagers.set(classIdentifier, new RitualManager(this.actor, wizardManager));
    }
    return this.ritualManagers.get(classIdentifier) || null;
  }

  /**
   * Register class-specific parts for all spellcasting classes and wizard tabs
   * @private
   */
  _registerClassParts() {
    if (!this._stateManager._classesDetected) this._stateManager.detectSpellcastingClasses();
    if (this._stateManager.spellcastingClasses) {
      for (const [identifier, classData] of Object.entries(this._stateManager.spellcastingClasses)) {
        const tabId = `${identifier}Tab`;
        this.constructor.PARTS[tabId] = {
          template: TEMPLATES.PLAYER.TAB_SPELLS,
          scrollable: [''],
          data: { classIdentifier: identifier, className: classData.name }
        };
        log(3, `Registered class tab part: ${tabId}`);
      }
    }
    const wizardClasses = genericUtils.getWizardEnabledClasses(this.actor);
    for (const { identifier } of wizardClasses) {
      const tabId = `wizardbook-${identifier}`;
      this.constructor.PARTS[tabId] = {
        template: TEMPLATES.PLAYER.TAB_WIZARD_SPELLBOOK,
        scrollable: [''],
        data: { classIdentifier: identifier }
      };
      log(3, `Registered wizard tab part: ${tabId}`);
    }
    log(3, `Total registered parts: ${Object.keys(this.constructor.PARTS).join(', ')}`);
  }

  /** @inheritdoc */
  async _prepareContext(options) {
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

  /**
   * Prepares context data for a specific part/tab of the application
   * @param {string} partId - ID of the template part being rendered
   * @param {object} context - Shared context from _prepareContext
   * @param {object} options - Render options
   * @returns {object} Modified context for the specific part
   * @protected
   */
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
      context.isForceWizard = wizardManager?.classItem && genericUtils.isClassWizardEnabled(this.actor, classIdentifier);
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
   * Create the base context for the application
   * @param {Object} options - The options passed to the context preparation
   * @returns {Object} The base context
   * @private
   */
  _createBaseContext(options) {
    const context = super._prepareContext(options);
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
   * Ensure all spell data (including wizard data) is loaded before rendering
   * @private
   * @async
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

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    const lastPosition = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION);
    if (lastPosition) Object.assign(options.position, lastPosition);
    return options;
  }

  /**
   * Process a spell for display in the UI
   * @param {Object} spell - The spell to process
   * @returns {Object} The processed spell with UI elements
   * @private
   */
  _processSpellForDisplay(spell) {
    const processedSpell = foundry.utils.deepClone(spell);
    if (!spell.compendiumUuid) spell.compendiumUuid = genericUtils.getSpellUuid(spell);
    processedSpell.cssClasses = this._getSpellCssClasses(spell);
    processedSpell.dataAttributes = this._getSpellDataAttributes(spell);
    processedSpell.tag = this._getSpellPreparationTag(spell);
    const ariaLabel = spell.preparation.prepared ? game.i18n.format('SPELLBOOK.Preparation.Unprepare', { name: spell.name }) : game.i18n.format('SPELLBOOK.Preparation.Prepare', { name: spell.name });
    const checkbox = formElements.createCheckbox({
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
    if (spell.sourceClass) checkbox.dataset.sourceClass = spell.sourceClass;
    if (spell.preparation.disabled && spell.preparation.disabledReason) checkbox.dataset.tooltip = game.i18n.localize(spell.preparation.disabledReason);
    processedSpell.preparationCheckboxHtml = formElements.elementToHtml(checkbox);
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
   * Get data attributes for a spell item
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
   * Get CSS classes for a spell item
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
   * Get the preparation tag for a spell
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
    if (spell.preparation.preparationMode === 'prepared' && spell.preparation.prepared) {
      return {
        cssClass: 'prepared',
        text: game.i18n.localize('SPELLBOOK.Preparation.Prepared'),
        tooltip: ''
      };
    }
    return null;
  }

  /** @inheritdoc */
  async _onRender(context, options) {
    super._onRender(context, options);
    this._setupContentWrapper();
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
    setTimeout(async () => {
      await this._ensureSpellData();
      setTimeout(async () => {
        const favoriteButtons = this.element.querySelectorAll('.spell-favorite-toggle[data-uuid]');
        if (favoriteButtons.length > 0) {
          await this._applyFavoriteStatesToButtons(favoriteButtons);
          favoriteButtons.forEach((button) => button.setAttribute('data-favorites-applied', 'true'));
        }
      }, 50);
    }, 10);
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
                const dominantColor = await colorUtils.extractDominantColor(classData.img);
                const wizardBookImage = await colorUtils.applyColorOverlay(ASSETS.WIZARDBOOK_ICON, dominantColor);
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
   * Ensure spell data is loaded
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
    if (level === '0') cantripCounterHtml = `<span class="cantrip-counter" title="Current/Maximum Cantrips">[0/0]</span>`;
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
   * Show error state if spell loading fails
   * @param {Error} error - The error that occurred
   * @private
   */
  _showErrorState(error) {
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
   * Apply favorite states after render based on user data
   * @private
   */
  async _applyFavoriteStatesAfterRender() {
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
   * Apply favorite states with actor state validation
   * @param {NodeList} buttons - The buttons to update
   * @private
   */
  async _applyFavoriteStatesToButtons(buttons) {
    const targetUserId = genericUtils._getTargetUserId(this.actor);
    let updatedCount = 0;
    for (const button of buttons) {
      const spellUuid = button.dataset.uuid;
      if (!spellUuid) continue;
      let isFavorited = this._stateManager.getFavoriteSessionState(spellUuid);
      if (isFavorited === null) {
        const userData = await SpellUserDataJournal.getUserDataForSpell(spellUuid, targetUserId, this.actor.id);
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
   * Check if a spell UUID is currently on the actor
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
   * Sync journal favorites to match current actor.system.favorites state
   * This handles the case where user closed without saving - journal is "ahead" of actor
   * @private
   */
  async _syncJournalToActorState() {
    try {
      log(3, 'Syncing journal favorites to current actor state...');
      const actorFavorites = this.actor.system.favorites || [];
      const actorFavoriteSpellIds = new Set(actorFavorites.filter((fav) => fav.type === 'item' && fav.id.startsWith('.Item.')).map((fav) => fav.id.replace('.Item.', '')));
      const actorSpells = this.actor.items.filter((item) => item.type === 'spell');
      const targetUserId = genericUtils._getTargetUserId(this.actor);
      let syncCount = 0;
      const changedSpells = [];
      for (const spell of actorSpells) {
        const spellUuid = spell.flags?.core?.sourceId || spell.uuid;
        if (!spellUuid) continue;
        const isFavoritedInActor = actorFavoriteSpellIds.has(spell.id);
        const userData = await SpellUserDataJournal.getUserDataForSpell(spellUuid, targetUserId, this.actor.id);
        const isFavoritedInJournal = userData?.favorited || false;
        if (isFavoritedInJournal && !isFavoritedInActor) {
          log(3, `Unfavoriting ${spell.name} in journal to match actor state`);
          await SpellUserDataJournal.setSpellFavorite(spellUuid, false);
          changedSpells.push({ uuid: spellUuid, newState: false });
          syncCount++;
        }
        if (!isFavoritedInJournal && isFavoritedInActor) {
          log(3, `Favoriting ${spell.name} in journal to match actor state`);
          await SpellUserDataJournal.setSpellFavorite(spellUuid, true);
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
   * Immediately apply favorite changes to UI without waiting for next render
   * @param {Array} changedSpells - Array of {uuid, newState} objects
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

  /**
   * Set up the content wrapper element for proper layout
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

  /** @inheritdoc */
  _onClose(options) {
    game.settings.set(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION, this.position);
    PlayerSpellBook.DEFAULT_OPTIONS.position = this.position;
    if (this._preparationListener) {
      document.removeEventListener('change', this._preparationListener);
      this._preparationListener = null;
    }
    if (this._isLongRest) this.actor.unsetFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
    if (this._flagChangeHook) Hooks.off('updateActor', this._flagChangeHook);
    document.removeEventListener('click', this._hideLoadoutContextMenu.bind(this));
    if (this.ui?.advancedSearchManager) this.ui.advancedSearchManager.cleanup();
    super._onClose();
  }

  /**
   * Set up event listeners for spell preparation checkboxes and filter checkboxes
   * Only set up once to prevent multiple handlers
   */
  setupPreparationListeners() {
    if (this._preparationListener) document.removeEventListener('change', this._preparationListener);
    this._preparationListener = async (event) => {
      const target = event.target;
      if (target.matches('dnd5e-checkbox[data-uuid]')) await this._handlePreparationChange(event);
      else if (target.matches('dnd5e-checkbox[name^="filter-"]')) PlayerSpellBook.filterSpells.call(this);
    };
    document.addEventListener('change', this._preparationListener);
  }

  /**
   * Get tabs for the application including multiple wizard tabs
   * @returns {Object} The tab configuration
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

  /**
   * Enhanced tab switching that ensures state synchronization before footer render
   * @param {string} tabName - The name of the tab to activate
   * @param {string} groupName - The tab group name
   * @param {Object} options - Additional options
   * @override
   */
  changeTab(tabName, groupName, options = {}) {
    const currentTab = this.tabGroups[groupName];
    super.changeTab(tabName, groupName, options);
    const classMatch = tabName.match(/^([^T]+)Tab$/);
    const classIdentifier = classMatch ? classMatch[1] : null;
    if (classIdentifier && this._stateManager.classSpellData[classIdentifier]) this._stateManager.setActiveClass(classIdentifier);
    this._stateManager.updateGlobalPreparationCount();
    this._switchTabVisibility(tabName);
    this.render(false, { parts: ['footer'] });
    setTimeout(() => {
      this.ui.updateSpellCounts();
      this.ui.updateSpellPreparationTracking();
      this.ui.setupCantripUI();
    }, 50);
  }

  /**
   * Switch tab visibility without re-rendering
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
    for (const [partId, partConfig] of Object.entries(this.constructor.PARTS)) {
      if (['container', 'sidebar', 'navigation', 'footer'].includes(partId)) continue;
      if (partId.endsWith('Tab')) options.parts.push(partId);
      if (partId.startsWith('wizardbook-')) options.parts.push(partId);
    }
  }

  /**
   * Prepare class-specific preparation data for footer display
   * @returns {Array} Array of class preparation data
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
   * Prepare filter data for the UI
   * @returns {Array} The prepared filters
   * @private
   */
  _prepareFilters() {
    let filterConfigData = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
    if (!filterConfigData.version) {
      log(2, 'No version field found in filter configuration. Rebuilding for 0.9.0 upgrade...');
      filterConfigData = {
        version: MODULE.DEFAULT_FILTER_CONFIG_VERSION,
        filters: foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG)
      };
      game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, filterConfigData);
    }
    let filterConfig = filterConfigData.filters || [];
    const storedVersion = filterConfigData.version;
    const currentVersion = MODULE.DEFAULT_FILTER_CONFIG_VERSION;
    if (storedVersion !== currentVersion) {
      log(2, `Filter configuration version mismatch. Stored: ${storedVersion}, Current: ${currentVersion}. Updating...`);
      filterConfig = this._migrateFilterConfiguration(filterConfig, storedVersion, currentVersion);
      const updatedConfigData = { version: currentVersion, filters: filterConfig };
      game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, updatedConfigData);
    } else if (filterConfig.length === 0) filterConfig = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
    else filterConfig = this._ensureFilterIntegrity(filterConfig);
    const sortedFilters = filterConfig.sort((a, b) => a.order - b.order);
    const filterState = this.filterHelper.getFilterState();
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element?.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._stateManager.activeClass;
    let spellData = [];
    if (classIdentifier && this._stateManager.classSpellData[classIdentifier]) {
      spellData = this._stateManager.classSpellData[classIdentifier].spellLevels || [];
    }
    const result = sortedFilters
      .map((filter) => {
        const result = {
          id: filter.id,
          type: filter.type,
          name: `filter-${filter.id}`,
          label: game.i18n.localize(filter.label),
          enabled: filter.enabled
        };
        let element;
        switch (filter.type) {
          case 'search':
            element = formElements.createTextInput({
              name: `filter-${filter.id}`,
              value: filterState[filter.id] || '',
              placeholder: `${game.i18n.localize(filter.label)}...`,
              ariaLabel: game.i18n.localize(filter.label),
              cssClass: 'advanced-search-input'
            });
            break;
          case 'dropdown':
            const options = this._getFilterOptions(filter.id, filterState, spellData);
            element = formElements.createSelect({
              name: `filter-${filter.id}`,
              options: options,
              ariaLabel: game.i18n.localize(filter.label)
            });
            break;
          case 'checkbox':
            element = formElements.createCheckbox({
              name: `filter-${filter.id}`,
              checked: filterState[filter.id] || false,
              label: game.i18n.localize(filter.label),
              ariaLabel: game.i18n.localize(filter.label)
            });
            break;
          case 'range':
            element = this._createRangeFilterElement(filter.id, filterState);
            result.unit = game.settings.get(MODULE.ID, SETTINGS.DISTANCE_UNIT);
            break;
          default:
            log(2, `Unknown filter type: ${filter.type} for filter ${filter.id}`);
            return null;
        }
        if (!element) return null;
        result.elementHtml = formElements.elementToHtml(element);
        return result;
      })
      .filter(Boolean);
    return result;
  }

  /**
   * Get options for a filter dropdown
   * @param {string} filterId - The filter identifier
   * @param {Object} filterState - The current filter state
   * @param {Array} spellData - The current spell data
   * @returns {Array} The filter options
   * @private
   */
  _getFilterOptions(filterId, filterState, spellData = []) {
    return filterUtils.getOptionsForFilter(filterId, filterState, spellData);
  }

  /**
   * Create a range filter element
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
    const minInput = formElements.createNumberInput({
      name: `filter-min-range`,
      value: filterState.minRange || '',
      placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMin'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMinLabel')
    });
    const separator = document.createElement('div');
    separator.className = 'range-separator';
    separator.setAttribute('aria-hidden', 'true');
    separator.innerHTML = '<dnd5e-icon src="systems/dnd5e/icons/svg/range-connector.svg"></dnd5e-icon>';
    const maxInput = formElements.createNumberInput({
      name: `filter-max-range`,
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
   * Apply collapsed state to any existing level headers
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
   * Create HTML for a spell item (ensure enriched icon is handled properly)
   * @param {Object} spell - Processed spell
   * @returns {string} HTML string
   */
  /**
   * Create HTML for a spell item (ensure enriched icon is handled properly)
   * @param {Object} spell - Processed spell
   * @returns {string} HTML string
   */
  _createSpellItemHtml(spell) {
    const tagHtml = spell.tag ? `<span class="tag ${spell.tag.cssClass}" ${spell.tag.tooltip ? `data-tooltip="${spell.tag.tooltip}"` : ''}>${spell.tag.text}</span>` : '';
    const enrichedIcon = spell.enrichedIcon || '';
    const name = spell.name || game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
    const formattedDetails = UICustomizationHelper.buildPlayerMetadata(spell);
    const cssClasses = spell.cssClasses || 'spell-item';
    const dataAttributes = spell.dataAttributes || '';
    const activeTab = this.tabGroups['spellbook-tabs'];
    const isWizardTab = activeTab && activeTab.startsWith('wizardbook-');
    const spellUuid = spell.uuid || spell.compendiumUuid;
    let comparisonLinkHtml = '';
    if (UICustomizationHelper.isPlayerElementEnabled('compare') && spell.showCompareLink && !isWizardTab) {
      const activeClass = spell.isInComparison ? ' active' : '';
      const compareText = game.i18n.localize('SPELLBOOK.Comparison.Compare');
      const ariaLabel = game.i18n.format('SPELLBOOK.Comparison.CompareSpell', { name: name });
      comparisonLinkHtml = `<button class="compare-button compare-link${activeClass}" data-action="compareSpell" data-uuid="${spell.compendiumUuid}" aria-label="${ariaLabel}">${compareText}</button>`;
    }
    const favoriteStarHtml =
      UICustomizationHelper.isPlayerElementEnabled('favorites') && spellUuid ?
        `<button type="button" class="spell-favorite-toggle ${spell.favorited ? 'favorited' : ''}"
          data-action="toggleFavorite"
          data-uuid="${spellUuid}"
          data-tooltip="${spell.favorited ? game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites') : game.i18n.localize('SPELLBOOK.UI.AddToFavorites')}"
          aria-label="${spell.favorited ? game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites') : game.i18n.localize('SPELLBOOK.UI.AddToFavorites')}">
          <i class="${spell.favorited ? 'fas' : 'far'} fa-star" aria-hidden="true"></i>
        </button>`
      : '';
    const notesIconHtml =
      UICustomizationHelper.isPlayerElementEnabled('notes') && spellUuid ?
        `<i class="${spell.hasNotes ? 'fas fa-sticky-note' : 'far fa-sticky-note'} spell-notes-icon"
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
    if (comparisonLinkHtml) subtitleParts.push(comparisonLinkHtml);
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
    return `<li class="${cssClasses}" ${dataAttributes}>
    <div class="spell-name">
      ${enrichedIcon}
      <div class="name-stacked">
        <span class="title">${name}${favoriteStarHtml ? ` ${favoriteStarHtml}` : ''}${tagHtml ? ` ${tagHtml}` : ''}</span>
        ${subtitleContent ? `<span class="subtitle" ${tooltipAttr}>${subtitleContent}</span>` : ''}
      </div>
    </div>
    ${actionHtml}
  </li>`;
  }

  /**
   * Apply filters to spells
   * @private
   */
  async _applyFilters() {
    if (!this.element) return;
    this.filterHelper.applyFilters();
    this.ui.updateSpellPreparationTracking();
    this.ui.updateCantripCounter();
  }

  /**
   * Set up context menu for loadout button
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
   * Show context menu with available loadouts
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
        }
        this._hideLoadoutContextMenu();
      });
      this._activeContextMenu = contextMenu;
    } catch (error) {
      log(1, 'Error showing loadout context menu:', error);
    }
  }

  /**
   * Position context menu at the left edge of the spell book application
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
   * Hide loadout context menu
   * @private
   */
  _hideLoadoutContextMenu() {
    const existingMenu = document.getElementById('spell-loadout-context-menu');
    if (existingMenu) existingMenu.remove();
    this._activeContextMenu = null;
  }

  /**
   * Handle preparation checkbox change with optimized UI updates
   * @param {Event} event - The change event
   * @returns {Promise<void>}
   * @async
   */
  async _handlePreparationChange(event) {
    try {
      if (this._handlingPreparation) return;
      this._handlingPreparation = true;
      const checkbox = event.target;
      const uuid = checkbox.dataset.uuid;
      const sourceClass = checkbox.dataset.sourceClass;
      const spellItem = checkbox.closest('.spell-item');
      const spellName = spellItem?.querySelector('.spell-name')?.textContent.trim() || 'unknown';
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
   * Handle regular spell preparation change with swapping enforcement
   * @param {Event} event - The change event
   * @param {string} uuid - The spell UUID
   * @param {HTMLElement} spellItem - The spell item element
   * @param {string} sourceClass - The source class identifier
   * @param {boolean} wasPrepared - Whether the spell was previously prepared
   * @param {boolean} isChecked - Whether the spell is being checked
   * @returns {Promise<void>}
   * @private
   * @async
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
   * Handle cantrip preparation change using CantripManager
   * @param {Event} event - The change event
   * @param {string} uuid - The spell UUID
   * @param {HTMLElement} spellItem - The spell item element
   * @returns {Promise<void>}
   * @private
   * @async
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
   * Update wizard tab data after learning a spell
   * @param {boolean} isFree - Whether the spell was learned for free
   * @param {string} classIdentifier - The class identifier for the wizard tab
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
   * Migrate filter configuration from old version to new version
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
      if (existingFilter) {
        return {
          ...defaultFilter,
          enabled: existingFilter.enabled,
          order: existingFilter.order !== undefined ? existingFilter.order : defaultFilter.order
        };
      } else {
        return foundry.utils.deepClone(defaultFilter);
      }
    });
    log(3, `Migrated filter configuration from version ${oldVersion} to ${newVersion}`);
    return migratedConfig;
  }

  /**
   * Ensure filter configuration integrity by adding missing filters and removing obsolete ones
   * @param {Array} filterConfig - Current filter configuration
   * @returns {Array} Updated filter configuration
   * @private
   */
  _ensureFilterIntegrity(filterConfig) {
    const existingFilters = new Map(filterConfig.map((f) => [f.id, f]));
    const defaultFilterIds = new Set(MODULE.DEFAULT_FILTER_CONFIG.map((f) => f.id));
    for (const defaultFilter of MODULE.DEFAULT_FILTER_CONFIG) {
      if (!existingFilters.has(defaultFilter.id)) filterConfig.push(foundry.utils.deepClone(defaultFilter));
    }
    filterConfig = filterConfig.filter((filter) => defaultFilterIds.has(filter.id));
    return filterConfig;
  }

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

  /**
   * Toggle sidebar visibility
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static toggleSidebar(event, _form) {
    const isCollapsing = !this.element.classList.contains('sidebar-collapsed');
    this.element.classList.toggle('sidebar-collapsed');
    const caretIcon = event.currentTarget.querySelector('i');
    if (caretIcon) caretIcon.className = isCollapsing ? 'fas fa-caret-right' : 'fas fa-caret-left';
    this.ui.positionFooter();
    game.user.setFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED, isCollapsing);
  }

  /**
   * Apply filters to spells
   * @param {Event} _event - The event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static filterSpells(_event, _form) {
    this.filterHelper.invalidateFilterCache();
  }

  /**
   * Handle reset button click
   * @param {Event} event - The click event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static handleReset(event, form) {
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
          PlayerSpellBook._updateFavoriteButtonState(button, false);
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
   * Toggle spell level expansion/collapse
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
   * Open filter configuration dialog
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static configureFilters(_event, _form) {
    const filterConfig = new PlayerFilterConfiguration(this);
    filterConfig.render(true);
  }

  /**
   * Open cantrip settings dialog
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static configureCantripSettings(_event, _form) {
    const dialog = new SpellbookSettingsDialog(this.actor);
    dialog.render(true);
  }

  /**
   * Handle learn spell button click
   * @param {Event} event - The click event
   * @returns {Promise<void>}
   * @static
   * @async
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
    const costInfo = await wizardManager.getCopyingCostWithFree(spell);
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
   * Handle learning a spell from a scroll
   * @static
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _form - The form element
   * @returns {Promise<void>}
   */
  static async handleLearnFromScroll(event, _form) {
    const spellUuid = event.target.dataset.uuid;
    const scrollId = event.target.dataset.scrollId;
    if (!spellUuid || !scrollId) return;
    const scrollSpellData = this._stateManager.scrollSpells.find((s) => s.spellUuid === spellUuid && s.scrollId === scrollId);
    if (!scrollSpellData) return;
    const wizardManager = this.wizardManager;
    if (!wizardManager) return;
    const success = await ScrollScanner.learnSpellFromScroll(this.actor, scrollSpellData, wizardManager);
    if (success) {
      await this._stateManager.refreshClassSpellData('wizard');
      this.render(false);
    }
  }

  /**
   * Open the spell loadout dialog
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async openLoadoutDialog(event, _form) {
    const activeTab = this.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this._stateManager.activeClass;
    if (!classIdentifier) return;
    const dialog = new SpellLoadoutDialog(this.actor, this, classIdentifier);
    dialog.render(true);
  }

  /**
   * Handle toggling spell favorite status
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
      const userData = await SpellUserDataJournal.getUserDataForSpell(spellUuid, targetUserId, targetActorId);
      const currentlyFavorited = userData?.favorited || false;
      const newFavoriteStatus = !currentlyFavorited;
      this._stateManager.updateFavoriteSessionState(spellUuid, newFavoriteStatus);
      const success = await SpellUserDataJournal.setSpellFavorite(spellUuid, newFavoriteStatus, targetUserId, targetActorId);
      if (!success) {
        log(1, `Failed to persist favorite status for ${spellUuid}`);
        this._stateManager.updateFavoriteSessionState(spellUuid, currentlyFavorited);
        return;
      }
      if (newFavoriteStatus) await spellFavorites.addSpellToActorFavorites(spellUuid, this.actor);
      else await spellFavorites.removeSpellFromActorFavorites(spellUuid, this.actor);
      PlayerSpellBook._updateFavoriteButtonState(target, newFavoriteStatus);
      log(3, `Successfully toggled favorite for spell ${spellUuid}: ${newFavoriteStatus}`);
    } catch (error) {
      log(1, 'Error in handleToggleFavorite:', error);
      const userData = await SpellUserDataJournal.getUserDataForSpell(spellUuid, null, this.actor.id);
      this._stateManager.updateFavoriteSessionState(spellUuid, userData?.favorited || false);
    }
  }

  /**
   * Update favorite button state immediately
   * @param {HTMLElement} button - The favorite button element
   * @param {boolean} isFavorited - Whether the spell is favorited
   * @private
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
   * Handle opening spell notes dialog
   */
  static async handleEditNotes(event, target) {
    event.preventDefault();
    const spellUuid = target.dataset.uuid;
    if (!spellUuid) return;
    const spellElement = target.closest('.spell-item');
    const spellName = fromUuidSync(spellUuid).name;
    new SpellNotesDialog({ spellUuid, spellName, actor: this.actor }).render(true);
  }

  /**
   * Handle opening the spell analytics dashboard
   * @async
   * @static
   * @param {MouseEvent} _event - The click event (unused)
   * @param {HTMLElement} _target - The target element (unused)
   * @returns {Promise<void>}
   */
  static async handleOpenAnalyticsDashboard(_event, _target) {
    new SpellAnalyticsDashboard().render({ force: true });
  }

  /**
   * Handle spell comparison selection and dialog management
   * @async
   * @static
   * @param {MouseEvent} event - The click event
   * @param {HTMLFormElement} _form - The form element (unused)
   * @returns {Promise<void>}
   */
  static async handleCompareSpell(event, _form) {
    const spellUuid = event.target.dataset.uuid;
    const maxSpells = game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX);
    if (this.comparisonSpells.has(spellUuid)) this.comparisonSpells.delete(spellUuid);
    else if (this.comparisonSpells.size < maxSpells) this.comparisonSpells.add(spellUuid);
    else return;
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

  static handleOpenCustomization(event, target) {
    const dialog = new SpellDetailsCustomization();
    dialog.render(true);
  }

  /**
   * Refresh the spellbook after settings changes
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
    const wizardClasses = genericUtils.getWizardEnabledClasses(this.actor);
    for (const { identifier } of wizardClasses) this.wizardManagers.set(identifier, new WizardSpellbookManager(this.actor, identifier));
    this._registerClassParts();
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
              const dominantColor = await colorUtils.extractDominantColor(classData.classImg);
              wizardBookImage = await colorUtils.applyColorOverlay(ASSETS.WIZARDBOOK_ICON, dominantColor);
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
   * Form handler for saving spellbook settings with class-specific preparation AND favorites
   * @param {Event} _event - The form submission event
   * @param {HTMLElement} form - The form element
   * @param {Object} formData - The form data
   * @returns {Promise<Actor|null>} The updated actor or null
   * @static
   * @async
   */
  static async formHandler(_event, form, formData) {
    const actor = this.actor;
    if (!actor) return null;
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
      let preparationMode = 'prepared';
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
      log(3, `Processed spell: ${name} (${uuid}) - prepared: ${isPrepared}, ritual: ${isRitual}, class: ${sourceClass}, mode: ${preparationMode}`);
    }
    this._stateManager.clearFavoriteSessionState();
    await this._stateManager.addMissingRitualSpells(spellDataByClass);
    const allCantripChangesByClass = {};
    for (const [classIdentifier, classSpellData] of Object.entries(spellDataByClass)) {
      const saveResult = await this.spellManager.saveClassSpecificPreparedSpells(classIdentifier, classSpellData);
      if (saveResult && saveResult.cantripChanges && saveResult.cantripChanges.hasChanges) {
        allCantripChangesByClass[classIdentifier] = saveResult.cantripChanges;
      }
    }
    await this._stateManager.sendGMNotifications(spellDataByClass, allCantripChangesByClass);
    await this._stateManager.handlePostProcessing(actor);
    this._newlyCheckedCantrips.clear();
    await spellFavorites.processFavoritesFromForm(form, actor);
    if (actor.sheet.rendered) actor.sheet.render(true);
    if (this.ui && this.rendered) {
      this.ui.setupCantripUI();
      this.ui.setupSpellLocks(true);
    }
    return actor;
  }
}
