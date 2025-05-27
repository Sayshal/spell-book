import { ENFORCEMENT_BEHAVIOR, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as filterUtils from '../helpers/filters.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
import { RitualManager } from '../helpers/ritual-manager.mjs';
import { SpellManager } from '../helpers/spell-preparation.mjs';
import { SpellbookState } from '../helpers/state/spellbook-state.mjs';
import { SpellbookFilterHelper } from '../helpers/ui/spellbook-filters.mjs';
import { SpellbookUI } from '../helpers/ui/spellbook-ui.mjs';
import { WizardSpellbookManager } from '../helpers/wizard-spellbook.mjs';
import { log } from '../logger.mjs';
import { PlayerFilterConfiguration } from './player-filter-configuration.mjs';
import { SpellbookSettingsDialog } from './spellbook-settings-dialog.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Player-facing spell book application for managing prepared spells
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
      sortSpells: PlayerSpellBook.sortSpells,
      reset: PlayerSpellBook.handleReset,
      toggleSpellLevel: PlayerSpellBook.toggleSpellLevel,
      configureFilters: PlayerSpellBook.configureFilters,
      configureCantripSettings: PlayerSpellBook.configureCantripSettings,
      learnSpell: PlayerSpellBook.learnSpell
    },
    classes: ['spell-book', 'vertical-tabs'],
    window: {
      icon: 'fas fa-book-open',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: {
      height: '875',
      width: '600'
    }
  };

  static PARTS = {
    container: { template: TEMPLATES.PLAYER.CONTAINER },
    sidebar: { template: TEMPLATES.PLAYER.SIDEBAR },
    navigation: { template: TEMPLATES.PLAYER.TAB_NAV },
    wizardbook: { template: TEMPLATES.PLAYER.TAB_WIZARD_SPELLBOOK, scrollable: [''] },
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
   * Create a new PlayerSpellBook application
   * @param {Actor} actor - The actor whose spells to display
   * @param {Object} options - Application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.spellManager = new SpellManager(actor);
    this.wizardManager = genericUtils.isWizard(actor) ? new WizardSpellbookManager(actor) : null;
    this._stateManager = new SpellbookState(this);
    this.ui = new SpellbookUI(this);
    this.filterHelper = new SpellbookFilterHelper(this);
    this.ritualManager = null;
    this.isLoading = true;
    this.spellLevels = [];
    this.className = '';
    this.spellPreparation = { current: 0, maximum: 0 };
    this._newlyCheckedCantrips = new Set();
    this._isLongRest = this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED) || false;
    this._wizardInitialized = false;

    // Register class-specific parts immediately
    this._registerClassParts();

    this._flagChangeHook = Hooks.on('updateActor', (updatedActor, changes) => {
      if (updatedActor.id !== this.actor.id) return;
      if (changes.flags?.[MODULE.ID]) {
        const changedFlags = Object.keys(changes.flags[MODULE.ID]);
        const cantripFlagChanged = changedFlags.some((flag) => [FLAGS.CANTRIP_RULES, FLAGS.ENFORCEMENT_BEHAVIOR, FLAGS.FORCE_WIZARD_MODE].includes(flag));
        const wizardFlagChanged = changedFlags.some((flag) => [FLAGS.WIZARD_SPELLBOOK, FLAGS.WIZARD_LEARNED_SPELLS, FLAGS.WIZARD_COPIED_SPELLS].includes(flag));

        if ((cantripFlagChanged || wizardFlagChanged) && this.rendered) {
          this.render(false);
        }
      }
    });
  }

  /**
   * Get or create the ritual manager when needed
   * @returns {RitualManager|null}
   */
  getRitualManager() {
    if (!this.ritualManager && this.wizardManager?.isWizard) {
      this.ritualManager = new RitualManager(this.actor, this.wizardManager);
    }
    return this.ritualManager;
  }

  /**
   * Register class-specific parts for all spellcasting classes
   * @private
   */
  async _registerClassParts() {
    try {
      // Only detect classes for registration, don't duplicate the full detection
      if (!this._stateManager._classesDetected) {
        await this._stateManager.detectSpellcastingClasses();
      }

      // Register a part for each spellcasting class
      if (this._stateManager.spellcastingClasses) {
        for (const [identifier, classData] of Object.entries(this._stateManager.spellcastingClasses)) {
          const tabId = `${identifier}Tab`;

          // Add to constructor's PARTS directly
          this.constructor.PARTS[tabId] = {
            template: TEMPLATES.PLAYER.TAB_SPELLS,
            scrollable: [''],
            data: {
              classIdentifier: identifier,
              className: classData.name
            }
          };
        }
      }
    } catch (error) {
      log(1, 'Error registering class parts:', error);
    }
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = this._createBaseContext();
    if (this.isLoading) return context;

    // Get all class spellcasting data
    context.spellcastingClasses = this._stateManager.spellcastingClasses;
    context.activeClass = this._stateManager.activeClass;

    // Set up tabs
    context.activeTab = this.tabGroups['spellbook-tabs'];
    context.tabs = this._getTabs();

    // Add global preparation data
    context.globalPrepared = this._stateManager.spellPreparation;

    // Add class-specific preparation data for footer
    context.classPreparationData = this._prepareClassPreparationData();

    // Wizard-specific context - explicitly call this method to maintain compatibility
    context.isWizard = !!this.wizardManager?.isWizard;
    if (context.isWizard) {
      this._addWizardContextData(context);
    }

    context.hasMultipleTabs = Object.keys(context.tabs).length > 1;
    context.filters = this._prepareFilters();

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
    context = await super._preparePartContext(partId, context, options);

    // Set tab data for all parts that have a tab
    if (context.tabs?.[partId]) {
      context.tab = context.tabs[partId];
    }

    // Handle class-specific tabs
    const classMatch = partId.match(/^([^T]+)Tab$/);
    if (classMatch) {
      const classIdentifier = classMatch[1];
      if (this._stateManager.classSpellData[classIdentifier]) {
        context.classIdentifier = classIdentifier;
        context.className = this._stateManager.classSpellData[classIdentifier].className;
        context.spellLevels = this._stateManager.classSpellData[classIdentifier].spellLevels.map((level) => {
          const processedLevel = { ...level };
          processedLevel.spells = level.spells.map((spell) => this._processSpellForDisplay(spell));
          return processedLevel;
        });

        // Add class-specific spell preparation data
        context.spellPreparation = this._stateManager.classSpellData[classIdentifier].spellPreparation;

        // Add global preparation data
        context.globalPrepared = this._stateManager.spellPreparation;
      }
    }

    // Handle wizard tab specifically
    if (partId === 'wizardbook' && this._stateManager.tabData?.wizardbook) {
      context.spellLevels = this._stateManager.tabData.wizardbook.spellLevels.map((level) => {
        const processedLevel = { ...level };
        processedLevel.spells = level.spells.map((spell) => this._processSpellForDisplay(spell));
        return processedLevel;
      });
      context.spellPreparation = this._stateManager.tabData.wizardbook.spellPreparation;
      context.wizardTotalSpellbookCount = this._stateManager.tabData.wizardbook.wizardTotalSpellbookCount || 0;
      context.wizardFreeSpellbookCount = this._stateManager.tabData.wizardbook.wizardFreeSpellbookCount || 0;
      context.wizardRemainingFreeSpells = this._stateManager.tabData.wizardbook.wizardRemainingFreeSpells || 0;
      context.wizardHasFreeSpells = this._stateManager.tabData.wizardbook.wizardHasFreeSpells || false;

      // Add global preparation data
      context.globalPrepared = this._stateManager.spellPreparation;
    }

    return context;
  }

  /**
   * Create the base context for the application
   * @returns {Object} The base context
   * @private
   */
  _createBaseContext() {
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
      }
    ];

    return {
      actor: this.actor,
      isLoading: this.isLoading,
      spellLevels: this.spellLevels || [],
      className: this.className || '',
      filters: this.isLoading ? { search: null, dropdowns: [], checkboxes: [], range: null } : this.filterHelper.getFilterState(),
      spellSchools: CONFIG.DND5E.spellSchools,
      buttons: buttons,
      actorId: this.actor.id,
      spellPreparation: this.spellPreparation || { current: 0, maximum: 0 },
      isGM: game.user.isGM
    };
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

    const ariaLabel =
      spell.preparation.prepared ?
        game.i18n.format('SPELLBOOK.Preparation.Unprepare', { name: spell.name })
      : game.i18n.format('SPELLBOOK.Preparation.Prepare', { name: spell.name });

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

    // Add sourceClass data attribute
    if (spell.sourceClass) {
      checkbox.dataset.sourceClass = spell.sourceClass;
    }

    if (spell.preparation.disabled && spell.preparation.disabledReason) checkbox.dataset.tooltip = game.i18n.localize(spell.preparation.disabledReason);
    processedSpell.preparationCheckboxHtml = formElements.elementToHtml(checkbox);
    if (this.wizardManager?.isWizard) processedSpell.inWizardSpellbook = this._stateManager.wizardSpellbookCache?.includes(spell.compendiumUuid) || false;
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
      `data-concentration="${spell.filterData?.concentration || false}"`,
      `data-requires-save="${spell.filterData?.requiresSave || false}"`,
      `data-conditions="${spell.filterData?.conditions || ''}"`
    ];

    // Add sourceClass attribute if available
    if (spell.sourceClass) {
      attributes.push(`data-source-class="${spell.sourceClass}"`);
    }

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
    if (this.wizardManager?.isWizard && this._stateManager.wizardSpellbookCache?.includes(spell.compendiumUuid)) {
      classes.push('in-wizard-spellbook');
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

    const modes = {
      pact: true,
      innate: true,
      ritual: true,
      atwill: true
    };

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

  /**
   * Add wizard-specific data to the context
   * @param {Object} context - The context object to modify
   * @private
   */
  _addWizardContextData(context) {
    context.wizardSpellbookCount = this._stateManager.wizardSpellbookCache?.length || 0;
    context.wizardRulesVersion = this.spellManager.getSettings().rules;

    // Add wizard tab
    context.tabs.wizardbook = {
      id: 'wizardbook',
      label: game.i18n.format('SPELLBOOK.Tabs.WizardSpells', { class: this.className }),
      group: 'spellbook-tabs',
      cssClass: this.tabGroups['spellbook-tabs'] === 'wizardbook' ? 'active' : '',
      icon: 'fa-solid fa-book-spells'
    };

    // Add tab data if available
    if (this._stateManager.tabData?.wizardbook) {
      context.wizardTotalSpellbookCount = this._stateManager.tabData.wizardbook.wizardTotalSpellbookCount || 0;
      context.wizardFreeSpellbookCount = this._stateManager.tabData.wizardbook.wizardFreeSpellbookCount || 0;
      context.wizardRemainingFreeSpells = this._stateManager.tabData.wizardbook.wizardRemainingFreeSpells || 0;
      context.wizardHasFreeSpells = this._stateManager.tabData.wizardbook.wizardHasFreeSpells || false;
    }
  }

  /** @inheritdoc */
  async _onRender(context, options) {
    super._onRender(context, options);
    this._setupContentWrapper();

    try {
      this.ui.setSidebarState();

      if (this.isLoading) {
        this.element.classList.add('loading');
        this.ui.disableInputsWhileLoading();
        this.ui.positionFooter();
        await this._loadSpellData();
        return;
      } else {
        this.element.classList.remove('loading');
      }

      // Initialize wizard spellbook if needed
      if (this.wizardManager?.isWizard && !this._wizardInitialized) {
        this._wizardInitialized = true;
        await this.wizardManager.getOrCreateSpellbookJournal().catch((err) => {
          log(1, `Error initializing wizard spellbook journal:`, err);
        });
      }

      // Set up UI - only once
      this.ui.positionFooter();
      this.ui.setupFilterListeners();

      // Only set up preparation listeners once
      if (!this._preparationListenersSetup) {
        this.setupPreparationListeners();
        this._preparationListenersSetup = true;
      }

      this.ui.applyCollapsedLevels();
      this._applyFilters();
      this.ui.updateSpellPreparationTracking();
      this.ui.setupCantripUI();
      this.ui.updateSpellCounts();

      // Apply class-specific styling
      await this.ui.applyClassStyling();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
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

      const elementsToWrap = [
        this.element.querySelector('.sidebar'),
        this.element.querySelector('.spell-book-container'),
        this.element.querySelector('.window-content > footer')
      ].filter((el) => el);

      if (elementsToWrap.length && elementsToWrap[0].parentNode) {
        elementsToWrap[0].parentNode.insertBefore(wrapper, elementsToWrap[0]);
        elementsToWrap.forEach((el) => wrapper.appendChild(el));

        if (tabsNav && tabsNav.parentNode === wrapper) {
          this.element.querySelector('.window-content').appendChild(tabsNav);
        }
      }
    }
  }

  /** @inheritdoc */
  _onClose() {
    try {
      // Clean up event listeners
      if (this._preparationListener) {
        document.removeEventListener('change', this._preparationListener);
        this._preparationListener = null;
      }

      if (this._isLongRest) {
        this.actor.unsetFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
      }

      if (this._flagChangeHook) {
        Hooks.off('updateActor', this._flagChangeHook);
      }

      super._onClose();
    } catch (error) {
      log(1, 'Error in _onClose:', error);
    }
  }

  /**
   * Set up event listeners for spell preparation checkboxes
   * Only set up once to prevent multiple handlers
   */
  setupPreparationListeners() {
    try {
      // Remove existing listener if it exists
      if (this._preparationListener) {
        document.removeEventListener('change', this._preparationListener);
      }

      // Create and store the listener
      this._preparationListener = async (event) => {
        const target = event.target;
        if (target.matches('dnd5e-checkbox[data-uuid]')) {
          await this._handlePreparationChange(event);
        }
      };

      // Add the listener
      document.addEventListener('change', this._preparationListener);
    } catch (error) {
      log(1, 'Error setting up preparation listeners:', error);
    }
  }

  /**
   * Get available tabs for the application
   * @returns {Object} The tab configuration
   * @private
   */
  _getTabs() {
    const tabGroup = 'spellbook-tabs';
    const tabs = {};

    // If no active tab is set yet, set it to the first spellcasting class's tab
    if (!this.tabGroups[tabGroup] && this._stateManager.activeClass) {
      this.tabGroups[tabGroup] = `${this._stateManager.activeClass}Tab`;
    } else if (!this.tabGroups[tabGroup] && this.wizardManager?.isWizard) {
      this.tabGroups[tabGroup] = 'wizardbook'; // Default to wizardbook if it exists and no active class
    } else if (!this.tabGroups[tabGroup] && Object.keys(this._stateManager.spellcastingClasses || {}).length > 0) {
      // Default to first class tab if no active tab is set
      this.tabGroups[tabGroup] = `${Object.keys(this._stateManager.spellcastingClasses)[0]}Tab`;
    }

    // Add tabs for each spellcasting class
    if (this._stateManager.spellcastingClasses) {
      for (const [identifier, classData] of Object.entries(this._stateManager.spellcastingClasses)) {
        const tabId = `${identifier}Tab`;
        const iconPath = classData?.img || 'icons/svg/book.svg';
        tabs[tabId] = {
          id: tabId,
          label: game.i18n.format('SPELLBOOK.Tabs.ClassSpells', { class: classData.name }),
          group: tabGroup,
          cssClass: this.tabGroups[tabGroup] === tabId ? 'active' : '',
          icon: 'fa-solid fa-book-open',
          data: {
            classImg: iconPath,
            classIdentifier: identifier,
            className: classData.name
          }
        };
      }
    }

    // Add wizardbook tab for wizards
    if (this.wizardManager?.isWizard) {
      tabs.wizardbook = {
        id: 'wizardbook',
        label: game.i18n.format('SPELLBOOK.Tabs.WizardSpells', { class: this._stateManager.className }),
        group: tabGroup,
        cssClass: this.tabGroups[tabGroup] === 'wizardbook' ? 'active' : '',
        icon: 'fa-solid fa-book-spells'
      };
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
    try {
      // Store the current tab's uncommitted state before switching
      const currentTab = this.tabGroups[groupName];
      if (currentTab && currentTab !== tabName) {
        this._preserveTabState(currentTab);
      }

      // Call parent method to update tabGroups
      super.changeTab(tabName, groupName, options);

      // Extract class identifier from tab name if it's a class tab
      const classMatch = tabName.match(/^([^T]+)Tab$/);
      const classIdentifier = classMatch ? classMatch[1] : null;

      // If this is a class tab, set the active class in the state manager
      if (classIdentifier && this._stateManager.classSpellData[classIdentifier]) {
        this._stateManager.setActiveClass(classIdentifier);
      }

      // CRITICAL: Update global preparation counts BEFORE rendering footer
      // This ensures the footer gets accurate data
      this._stateManager.updateGlobalPreparationCount();

      // Switch tab visibility without full re-render
      this._switchTabVisibility(tabName);
      this._restoreTabState(tabName);

      // Now render footer with guaranteed up-to-date data
      this.render(false, { parts: ['footer'] });

      // Update UI elements that depend on the active tab
      setTimeout(() => {
        this.ui.updateSpellCounts();
        this.ui.updateSpellPreparationTracking();
        this.ui.setupCantripUI();
      }, 50);
    } catch (error) {
      log(1, 'Error in enhanced changeTab:', error);
      this._fallbackChangeTab(tabName, groupName, options);
    }
  }

  /**
   * Preserve the current state of a tab before switching away
   * @param {string} tabName - The tab to preserve state for
   * @private
   */
  _preserveTabState(tabName) {
    try {
      const tabElement = this.element.querySelector(`.tab[data-tab="${tabName}"]`);
      if (!tabElement) return;

      // Store checkbox states
      const checkboxes = tabElement.querySelectorAll('dnd5e-checkbox[data-uuid]');
      const tabState = {
        checkboxStates: new Map(),
        timestamp: Date.now()
      };

      checkboxes.forEach((checkbox) => {
        const uuid = checkbox.dataset.uuid;
        const sourceClass = checkbox.dataset.sourceClass;
        const key = `${sourceClass}:${uuid}`;

        tabState.checkboxStates.set(key, {
          checked: checkbox.checked,
          disabled: checkbox.disabled,
          wasPrepared: checkbox.dataset.wasPrepared === 'true'
        });
      });

      // Store in a session-based cache (not persistent across page reloads)
      if (!this._tabStateCache) this._tabStateCache = new Map();
      this._tabStateCache.set(tabName, tabState);

      log(3, `Preserved state for tab ${tabName} with ${tabState.checkboxStates.size} checkboxes`);
    } catch (error) {
      log(2, `Error preserving tab state for ${tabName}:`, error);
    }
  }

  /**
   * Restore preserved state to a tab after switching to it
   * @param {string} tabName - The tab to restore state for
   * @private
   */
  _restoreTabState(tabName) {
    try {
      if (!this._tabStateCache || !this._tabStateCache.has(tabName)) return;

      const tabElement = this.element.querySelector(`.tab[data-tab="${tabName}"]`);
      if (!tabElement) return;

      const tabState = this._tabStateCache.get(tabName);
      const checkboxes = tabElement.querySelectorAll('dnd5e-checkbox[data-uuid]');

      let restoredCount = 0;
      checkboxes.forEach((checkbox) => {
        const uuid = checkbox.dataset.uuid;
        const sourceClass = checkbox.dataset.sourceClass;
        const key = `${sourceClass}:${uuid}`;

        const savedState = tabState.checkboxStates.get(key);
        if (savedState) {
          // Only restore if the checkbox wasn't in a different state due to database changes
          const currentWasPrepared = checkbox.dataset.wasPrepared === 'true';
          if (savedState.wasPrepared === currentWasPrepared) {
            checkbox.checked = savedState.checked;
            restoredCount++;
          }
        }
      });

      log(3, `Restored state for tab ${tabName}, ${restoredCount} checkboxes restored`);
    } catch (error) {
      log(2, `Error restoring tab state for ${tabName}:`, error);
    }
  }

  /**
   * Switch tab visibility without re-rendering
   * @param {string} activeTabName - The tab to make active
   * @private
   */
  _switchTabVisibility(activeTabName) {
    try {
      // Hide all tabs
      const allTabs = this.element.querySelectorAll('.tab');
      allTabs.forEach((tab) => {
        tab.classList.remove('active');
        tab.style.display = 'none';
      });

      // Show and activate the target tab
      const activeTab = this.element.querySelector(`.tab[data-tab="${activeTabName}"]`);
      if (activeTab) {
        activeTab.classList.add('active');
        activeTab.style.display = 'block';
      }

      // Update navigation
      const navItems = this.element.querySelectorAll('.tabs .item');
      navItems.forEach((item) => {
        item.classList.remove('active');
        if (item.dataset.tab === activeTabName) {
          item.classList.add('active');
        }
      });

      log(3, `Switched to tab ${activeTabName} without re-rendering`);
    } catch (error) {
      log(2, `Error switching tab visibility:`, error);
    }
  }

  /**
   * Clear preserved state when form is submitted
   * @private
   */
  _clearTabStateCache() {
    if (this._tabStateCache) {
      this._tabStateCache.clear();
      log(3, 'Cleared tab state cache after form submission');
    }
  }

  /**
   * Fallback to original tab change behavior
   * @param {string} tabName - Tab name
   * @param {string} groupName - Group name
   * @param {Object} options - Options
   * @private
   */
  _fallbackChangeTab(tabName, groupName, options) {
    super.changeTab(tabName, groupName, options);
    this.render(false, { parts: ['footer'] });

    const classMatch = tabName.match(/^([^T]+)Tab$/);
    const classIdentifier = classMatch ? classMatch[1] : null;

    if (classIdentifier && this._stateManager.classSpellData[classIdentifier]) {
      this._stateManager.setActiveClass(classIdentifier);
    }

    this.render(false, { parts: ['navigation', tabName] });

    setTimeout(() => {
      this.ui.updateSpellCounts();
      this.ui.updateSpellPreparationTracking();
      this.ui.setupCantripUI();
    }, 100);
  }

  /** @inheritdoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);

    // If specific parts are requested, don't modify them (except navigation)
    if (options.parts && Array.isArray(options.parts)) {
      // If a specific tab is requested but navigation is not included, add it
      if (!options.parts.includes('navigation')) {
        options.parts.unshift('navigation');
      }
      return;
    }

    // Default: include base parts and all class tabs
    options.parts = ['container', 'sidebar', 'navigation', 'footer'];

    // Add all registered class parts
    for (const [partId, partConfig] of Object.entries(this.constructor.PARTS)) {
      // Skip base parts and add only class tab parts
      if (['container', 'sidebar', 'navigation', 'wizardbook', 'footer'].includes(partId)) continue;

      // Add class tab parts
      if (partId.endsWith('Tab')) {
        options.parts.push(partId);
      }
    }

    // Add wizardbook tab if actor is a wizard
    if (this.wizardManager?.isWizard) {
      options.parts.push('wizardbook');
    }
  }

  /**
   * Prepare class-specific preparation data for footer display
   * @returns {Array} Array of class preparation data
   * @private
   */
  _prepareClassPreparationData() {
    try {
      const activeTab = this.tabGroups['spellbook-tabs'];
      const classPreparationData = [];

      // Get active class identifier from tab
      const activeClassMatch = activeTab?.match(/^([^T]+)Tab$/);
      const activeClassIdentifier = activeClassMatch ? activeClassMatch[1] : null;

      // Build data for each spellcasting class
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

      // Sort alphabetically only (remove active-first sorting)
      classPreparationData.sort((a, b) => a.className.localeCompare(b.className));

      return classPreparationData;
    } catch (error) {
      log(1, 'Error preparing class preparation data:', error);
      return [];
    }
  }

  /**
   * Load spell data from the state manager
   * @returns {Promise<void>}
   * @private
   * @async
   */
  async _loadSpellData() {
    try {
      // Prevent multiple initializations
      if (this._stateManager._initialized) {
        log(3, 'State manager already initialized, updating UI only');
        this.isLoading = false;
        this.spellLevels = this._stateManager.spellLevels;
        this.className = this._stateManager.className;
        this.spellPreparation = this._stateManager.spellPreparation;
        return;
      }

      await this._stateManager.initialize();
      this.isLoading = this._stateManager.isLoading;
      this.spellLevels = this._stateManager.spellLevels;
      this.className = this._stateManager.className;
      this.spellPreparation = this._stateManager.spellPreparation;

      this.render(false);
    } catch (error) {
      log(1, 'Error loading spell data:', error);
      this.isLoading = false;
      this.render(false);
    }
  }

  /**
   * Prepare filter data for the UI
   * @returns {Array} The prepared filters
   * @private
   */
  _prepareFilters() {
    try {
      let filterConfig = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
      if (!Array.isArray(filterConfig) || !filterConfig.length) {
        filterConfig = DEFAULT_FILTER_CONFIG;
      }

      const sortedFilters = filterConfig.filter((f) => f.enabled).sort((a, b) => a.order - b.order);
      const filterState = this.filterHelper.getFilterState();

      return sortedFilters.map((filter) => {
        const result = {
          id: filter.id,
          type: filter.type,
          name: `filter-${filter.id}`,
          label: game.i18n.localize(filter.label)
        };

        let element;

        switch (filter.type) {
          case 'search':
            element = formElements.createTextInput({
              name: `filter-${filter.id}`,
              value: filterState[filter.id] || '',
              placeholder: game.i18n.localize(filter.label),
              ariaLabel: game.i18n.localize(filter.label)
            });
            break;

          case 'dropdown':
            const options = this._getFilterOptions(filter.id, filterState);
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
        }

        result.elementHtml = formElements.elementToHtml(element);
        return result;
      });
    } catch (error) {
      log(1, 'Error preparing filters:', error);
      return [];
    }
  }

  /**
   * Get options for a filter dropdown
   * @param {string} filterId - The filter identifier
   * @param {Object} filterState - The current filter state
   * @returns {Array} The filter options
   * @private
   */
  _getFilterOptions(filterId, filterState) {
    return filterUtils.getOptionsForFilter(filterId, filterState, this.spellLevels);
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
   * Apply filters to spells
   * @private
   */
  _applyFilters() {
    this.filterHelper.applyFilters();
  }

  /**
   * Handle preparation checkbox change
   * @param {Event} event - The change event
   * @returns {Promise<void>}
   * @async
   */
  async _handlePreparationChange(event) {
    try {
      // Prevent multiple executions during the same event
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

      if (spellLevel === '0') {
        await this._handleCantripPreparationChange(event, uuid, spellItem);
      } else {
        // Handle regular spell preparation with swapping enforcement
        await this._handleSpellPreparationChange(event, uuid, spellItem, sourceClass, wasPrepared, isChecked);
      }

      // Only update UI if element is ready
      if (this.element) {
        this.ui.updateSpellPreparationTracking();
        this.ui.updateSpellCounts();

        // Only re-render footer, not the whole app
        this.render(false, { parts: ['footer'] });
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
    try {
      const checkbox = event.target;

      // Get the active tab's class identifier - use sourceClass as fallback
      const activeTab = this.tabGroups['spellbook-tabs'];
      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      const classIdentifier = activeTabContent?.dataset.classIdentifier || sourceClass || this._stateManager.activeClass;

      if (!classIdentifier) {
        log(2, `No class identifier could be determined for spell change handling`);
        return;
      }

      const sourceSpell = await fromUuid(uuid);
      if (!sourceSpell) {
        log(1, `Could not find source spell for UUID: ${uuid}`);
        return;
      }

      // Get class data for max limit checking
      const classData = this._stateManager.classSpellData[classIdentifier];
      const settings = this.spellManager.getSettings(classIdentifier);

      // Check max limits first (only for enforced mode)
      if (settings.behavior === ENFORCEMENT_BEHAVIOR.ENFORCED && isChecked && !wasPrepared) {
        const currentPrepared = classData?.spellPreparation?.current || 0;
        const maxPrepared = classData?.spellPreparation?.maximum || 0;

        if (currentPrepared >= maxPrepared) {
          // Revert the checkbox state
          checkbox.checked = false;
          ui.notifications.warn(
            game.i18n.format('SPELLBOOK.Preparation.ClassAtMaximum', {
              class: classData?.className || classIdentifier
            })
          );
          return;
        }
      }

      // Check if spell swapping is allowed (for unchecking prepared spells)
      const canChange = this.spellManager.canChangeSpellStatus(sourceSpell, isChecked, wasPrepared, classIdentifier);

      if (!canChange.allowed) {
        // Revert the checkbox state
        checkbox.checked = !isChecked;
        if (canChange.message) {
          ui.notifications.warn(game.i18n.localize(canChange.message));
        }
        return;
      }

      // Update visual state
      if (spellItem) {
        spellItem.classList.toggle('prepared-spell', isChecked);
      }
    } catch (error) {
      log(1, 'Error handling spell preparation change:', error);
    }
  }

  /**
   * Handle cantrip preparation change
   * @param {Event} event - The change event
   * @param {string} uuid - The spell UUID
   * @param {HTMLElement} spellItem - The spell item element
   * @returns {Promise<void>}
   * @private
   * @async
   */
  async _handleCantripPreparationChange(event, uuid, spellItem) {
    try {
      const checkbox = event.target;
      const isChecked = checkbox.checked;
      const wasPrepared = checkbox.dataset.wasPrepared === 'true';
      const isLevelUp = this.spellManager.canBeLeveledUp();
      const isLongRest = this._isLongRest;
      const sourceClass = checkbox.dataset.sourceClass;

      // Get the active tab's class identifier - use sourceClass as fallback
      const activeTab = this.tabGroups['spellbook-tabs'];
      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      // Use a fallback if activeTabContent isn't found
      const classIdentifier = activeTabContent?.dataset.classIdentifier || sourceClass || this._stateManager.activeClass;

      if (!classIdentifier) {
        log(2, `No class identifier could be determined for cantrip change handling - using first available class`);
        // Last resort - use the first available class
        const firstClass = Object.keys(this._stateManager.classSpellData)[0];
        if (!firstClass) {
          log(1, `No class data available, cannot process cantrip change for ${uuid}`);
          return;
        }
      }

      const sourceSpell = await fromUuid(uuid);
      if (!sourceSpell) {
        log(1, `Could not find source spell for UUID: ${uuid}`);
        return;
      }

      // During UI interaction, only enforce count limits for checking cantrips
      // Rule-based restrictions will be applied after form submission
      if (isChecked) {
        // Check count limits when checking a cantrip
        const canChange = this.spellManager.canChangeCantripStatus(sourceSpell, isChecked, isLevelUp, isLongRest, this._uiCantripCount, classIdentifier);

        if (!canChange.allowed) {
          checkbox.checked = !isChecked;
          if (canChange.message) {
            ui.notifications.warn(game.i18n.localize(canChange.message));
          }

          // Update counter without triggering recursive lock setup
          if (this.ui) {
            try {
              this.ui.updateCantripCounter(null, true);
            } catch (err) {
              log(2, 'Error updating cantrip counter after prevention:', err);
            }
          }
          return;
        }
      }
      // For unchecking during UI interaction, allow it freely - rules will be enforced after saving

      this.spellManager.trackCantripChange(sourceSpell, isChecked, isLevelUp, isLongRest, classIdentifier);

      if (isChecked && !wasPrepared) {
        this._newlyCheckedCantrips.add(uuid);
      } else if (!isChecked && this._newlyCheckedCantrips.has(uuid)) {
        this._newlyCheckedCantrips.delete(uuid);
      }

      if (this.ui) {
        // Update visual indicators - safely
        try {
          // Update the counter without triggering lock setup
          this.ui.updateCantripCounter(null, true);

          if (spellItem) {
            spellItem.classList.toggle('prepared-spell', isChecked);
          }

          // Call setupCantripLocks with count-only during UI interaction
          this.ui.setupCantripLocks(false, false);
        } catch (err) {
          log(2, 'Error updating UI after cantrip change:', err);
        }
      }
    } catch (error) {
      log(1, 'Error handling cantrip preparation change:', error);
    }
  }

  /**
   * Update wizard tab data after learning a spell
   * @param {boolean} isFree - Whether the spell was learned for free
   */
  _updatewizardbookDataAfterSpellLearning(isFree) {
    if (this._stateManager.tabData && this._stateManager.tabData.wizardbook) {
      this._stateManager.tabData.wizardbook.wizardTotalSpellbookCount = (this._stateManager.tabData.wizardbook.wizardTotalSpellbookCount || 0) + 1;

      if (isFree) {
        this._stateManager.tabData.wizardbook.wizardRemainingFreeSpells = Math.max(0, (this._stateManager.tabData.wizardbook.wizardRemainingFreeSpells || 0) - 1);
        this._stateManager.tabData.wizardbook.wizardHasFreeSpells = this._stateManager.tabData.wizardbook.wizardRemainingFreeSpells > 0;
      }
    }
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
    try {
      const isCollapsing = !this.element.classList.contains('sidebar-collapsed');
      this.element.classList.toggle('sidebar-collapsed');

      const caretIcon = event.currentTarget.querySelector('i');
      if (caretIcon) {
        caretIcon.style.transform = isCollapsing ? 'rotate(180deg)' : 'rotate(0)';
      }

      this.ui.positionFooter();
      game.user.setFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED, isCollapsing);
    } catch (error) {
      log(1, 'Error toggling sidebar:', error);
    }
  }

  /**
   * Apply filters to spells
   * @param {Event} _event - The event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static filterSpells(_event, _form) {
    this._applyFilters();
  }

  /**
   * Apply sorting to spells
   * @param {Event} event - The change event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static sortSpells(event, _form) {
    try {
      const sortBy = event.target.value;
      this.filterHelper.applySorting(sortBy);
    } catch (error) {
      log(1, 'Error sorting spells:', error);
    }
  }

  /**
   * Handle reset button click
   * @param {Event} event - The click event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static handleReset(event, form) {
    try {
      const isShiftReset = event.shiftKey;

      if (isShiftReset) {
        const checkboxes = this.element.querySelectorAll('dnd5e-checkbox[data-uuid]:not([disabled])');
        checkboxes.forEach((checkbox) => (checkbox.checked = false));

        const filters = this.element.querySelectorAll('.spell-filters input, .spell-filters select');
        filters.forEach((filter) => {
          if (filter.type === 'checkbox') filter.checked = false;
          else if (filter.type === 'text' || filter.type === 'number') filter.value = '';
          else if (filter.tagName === 'SELECT') filter.selectedIndex = 0;
        });

        const spellItems = this.element.querySelectorAll('.spell-item');
        spellItems.forEach((item) => {
          const checkbox = item.querySelector('dnd5e-checkbox');
          if (checkbox && !checkbox.disabled) item.classList.remove('prepared-spell');
        });

        const collapsedLevels = this.element.querySelectorAll('.spell-level.collapsed');
        collapsedLevels.forEach((level) => {
          level.classList.remove('collapsed');
          const heading = level.querySelector('.spell-level-heading');
          if (heading) heading.setAttribute('aria-expanded', 'true');
        });

        game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS, []);

        this._applyFilters();
        this.ui.updateSpellPreparationTracking();
        this.ui.updateCantripCounter();

        event.preventDefault();
      } else {
        setTimeout(() => {
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

          this._applyFilters();
          this.ui.updateSpellPreparationTracking();
          this.ui.updateCantripCounter();
        }, 0);
      }
    } catch (error) {
      log(1, 'Error handling reset:', error);
    }
  }

  /**
   * Toggle spell level expansion/collapse
   * @param {Event} _event - The click event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static toggleSpellLevel(_event, form) {
    try {
      const levelContainer = form.parentElement;
      if (!levelContainer || !levelContainer.classList.contains('spell-level')) return;

      const levelId = levelContainer.dataset.level;
      levelContainer.classList.toggle('collapsed');

      const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
      const isCollapsed = levelContainer.classList.contains('collapsed');

      if (isCollapsed && !collapsedLevels.includes(levelId)) {
        collapsedLevels.push(levelId);
      } else if (!isCollapsed && collapsedLevels.includes(levelId)) {
        collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
      }

      game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS, collapsedLevels);
    } catch (error) {
      log(1, 'Error toggling spell level:', error);
    }
  }

  /**
   * Open filter configuration dialog
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static configureFilters(_event, _form) {
    try {
      const filterConfig = new PlayerFilterConfiguration(this);
      filterConfig.render(true);
    } catch (error) {
      log(1, 'Error configuring filters:', error);
    }
  }

  /**
   * Open cantrip settings dialog
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static configureCantripSettings(_event, _form) {
    try {
      const dialog = new SpellbookSettingsDialog(this.actor);
      dialog.render(true);
    } catch (error) {
      log(1, 'Error configuring cantrip settings:', error);
    }
  }

  /**
   * Handle learn spell button click
   * @param {Event} event - The click event
   * @returns {Promise<void>}
   * @static
   * @async
   */
  static async learnSpell(event) {
    try {
      const spellUuid = event.target.dataset.uuid;
      if (!spellUuid) return;

      const collapsedLevels = Array.from(this.element.querySelectorAll('.spell-level.collapsed')).map((el) => el.dataset.level);
      const activeTab = this.tabGroups['spellbook-tabs'];

      const spell = await fromUuid(spellUuid);
      if (!spell) {
        ui.notifications.error(game.i18n.format('SPELLBOOK.Error.SpellNotFound', { uuid: spellUuid }));
        return;
      }

      const costInfo = await this.wizardManager.getCopyingCostWithFree(spell);
      const time = this.wizardManager.getCopyingTime(spell);
      const costText = costInfo.isFree ? game.i18n.localize('SPELLBOOK.Wizard.SpellCopyFree') : game.i18n.format('SPELLBOOK.Wizard.SpellCopyCost', { cost: costInfo.cost });
      const result = await DialogV2.wait({
        title: game.i18n.format('SPELLBOOK.Wizard.LearnSpellTitle', { name: spell.name }),
        content: `
        <form class="wizard-copy-form">
          <p>${game.i18n.format('SPELLBOOK.Wizard.LearnSpellPrompt', { name: spell.name })}</p>
          <div class="copy-details">
            <div class="form-group">
              <label>${game.i18n.localize('SPELLBOOK.Wizard.CostLabel')}:</label>
              <span>${costText}</span>
            </div>
            <div class="form-group">
              <label>${game.i18n.localize('SPELLBOOK.Wizard.TimeLabel')}:</label>
              <span>${game.i18n.format('SPELLBOOK.Wizard.SpellCopyTime', { hours: time })}</span>
            </div>
          </div>
        </form>
      `,
        buttons: [
          {
            icon: 'fas fa-book',
            label: game.i18n.localize('SPELLBOOK.Wizard.LearnSpellButton'),
            action: 'confirm',
            className: 'dialog-button'
          },
          {
            icon: 'fas fa-times',
            label: game.i18n.localize('SPELLBOOK.UI.Cancel'),
            action: 'cancel',
            className: 'dialog-button'
          }
        ],
        default: 'confirm'
      });

      if (result === 'confirm') {
        const success = await this.wizardManager.copySpell(spellUuid, costInfo.cost, time, costInfo.isFree);

        if (success) {
          if (this._stateManager.wizardSpellbookCache) {
            this._stateManager.wizardSpellbookCache.push(spellUuid);
          }

          this._updatewizardbookDataAfterSpellLearning(costInfo.isFree);
          await this._stateManager.refreshClassSpellData('wizard');
          const spellItem = this.element.querySelector(`.spell-item[data-spell-uuid="${spellUuid}"]`);
          if (spellItem) {
            const buttonContainer = spellItem.querySelector('.wizard-spell-status');
            if (buttonContainer) {
              buttonContainer.innerHTML = `<span class="in-spellbook-tag" aria-label="Spell is in your spellbook">${game.i18n.localize('SPELLBOOK.Wizard.InSpellbook')}</span>`;
            }
            spellItem.classList.add('in-wizard-spellbook', 'prepared-spell');
          }

          this._spellsTabNeedsReload = true;
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
    } catch (error) {
      log(1, 'Error learning spell:', error);
    }
  }

  /**
   * Handle class rule changes and re-render accordingly
   * @param {string} classIdentifier - The class that had rules changed
   * @returns {Promise<void>}
   */
  async handleClassRulesChange(classIdentifier) {
    try {
      log(3, `Handling class rules change for ${classIdentifier}`);

      // Reload spell data for the affected class
      if (this._stateManager.spellcastingClasses[classIdentifier]) {
        const classData = this._stateManager.spellcastingClasses[classIdentifier];
        const classItem = this.actor.items.get(classData.id);

        if (classItem) {
          // Reload spell data for this class
          await this._stateManager.loadClassSpellData(classIdentifier, classItem);

          // Update global preparation count
          this._stateManager.updateGlobalPreparationCount();

          // Re-render the application
          this.render(false);
        }
      }
    } catch (error) {
      log(1, `Error handling class rules change for ${classIdentifier}:`, error);
    }
  }

  /**
   * Refresh the spellbook after settings changes
   * @returns {Promise<void>}
   */
  async refreshFromSettingsChange() {
    // Store current tab selection
    const currentTab = this.tabGroups['spellbook-tabs'];

    // Clear cached state
    this._stateManager._initialized = false;
    this._stateManager._classesDetected = false;
    this._stateManager.spellcastingClasses = {};
    this._stateManager.classSpellData = {};

    // Clear tab state cache
    if (this._tabStateCache) {
      this._tabStateCache.clear();
    }

    // Re-register class parts
    await this._registerClassParts();

    // Reload everything
    await this._stateManager.initialize();

    // Restore previous tab if it still exists
    if (currentTab && this._stateManager.spellcastingClasses) {
      const classMatch = currentTab.match(/^([^T]+)Tab$/);
      const classIdentifier = classMatch ? classMatch[1] : null;

      if (classIdentifier && this._stateManager.classSpellData[classIdentifier]) {
        this.tabGroups['spellbook-tabs'] = currentTab;
        this._stateManager.setActiveClass(classIdentifier);
      } else {
        // Default to first available class
        const firstClass = Object.keys(this._stateManager.spellcastingClasses)[0];
        if (firstClass) {
          this.tabGroups['spellbook-tabs'] = `${firstClass}Tab`;
          this._stateManager.setActiveClass(firstClass);
        }
      }
    }

    // Force complete re-render
    this.render(true);
  }

  /**
   * Form handler for saving spellbook settings with class-specific preparation
   * @param {Event} _event - The form submission event
   * @param {HTMLElement} form - The form element
   * @param {Object} formData - The form data
   * @returns {Promise<Actor|null>} The updated actor or null
   * @static
   * @async
   */
  static async formHandler(_event, form, formData) {
    try {
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

        // Skip special preparation mode spells (always-prepared, granted, etc.)
        // But allow ritual spells to be processed
        const isAlwaysPrepared = spellItem?.querySelector('.tag.always-prepared');
        const isGranted = spellItem?.querySelector('.tag.granted');
        const isInnate = spellItem?.querySelector('.tag.innate');
        const isAtWill = spellItem?.querySelector('.tag.atwill');

        if (isAlwaysPrepared || isGranted || isInnate || isAtWill) {
          continue; // Skip these - they're managed by the system
        }

        // Initialize class data if needed
        if (!spellDataByClass[sourceClass]) {
          spellDataByClass[sourceClass] = {};
        }

        // Create class-specific spell key
        const classSpellKey = `${sourceClass}:${uuid}`;

        spellDataByClass[sourceClass][classSpellKey] = {
          uuid,
          name,
          wasPrepared,
          isPrepared,
          isRitual,
          sourceClass,
          classSpellKey,
          spellLevel
        };

        log(3, `Processed spell: ${name} (${uuid}) - prepared: ${isPrepared}, ritual: ${isRitual}, class: ${sourceClass}`);
      }

      // Handle wizard ritual spells - add missing ritual spells to the data
      if (this.wizardManager?.isWizard) {
        await this._addMissingRitualSpells(spellDataByClass);
      }

      // Process each class independently and collect cantrip changes
      const allCantripChangesByClass = {};
      for (const [classIdentifier, classSpellData] of Object.entries(spellDataByClass)) {
        const saveResult = await this.spellManager.saveClassSpecificPreparedSpells(classIdentifier, classSpellData);
        if (saveResult && saveResult.cantripChanges && saveResult.cantripChanges.hasChanges) {
          allCantripChangesByClass[classIdentifier] = saveResult.cantripChanges;
        }
      }

      // Send GM notifications if needed
      await this._sendGMNotifications(spellDataByClass, allCantripChangesByClass);

      // Handle post-processing
      await this._handlePostProcessing(actor);

      // Clean up and refresh
      this._newlyCheckedCantrips.clear();
      this._clearTabStateCache();

      if (actor.sheet.rendered) {
        actor.sheet.render(true);
      }

      // Apply rule-based locks now that changes are saved
      if (this.ui && this.rendered) {
        this.ui.setupCantripUI();
        this.ui.setupSpellLocks(true);
      }

      return actor;
    } catch (error) {
      log(1, 'Error handling form submission:', error);
      return null;
    }
  }

  /**
   * Add missing ritual spells from wizard spellbook to the spell data
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   * @private
   */
  async _addMissingRitualSpells(spellDataByClass) {
    try {
      const ritualManager = this.getRitualManager();
      if (!ritualManager?.isWizard) return;

      // Get all spells in wizard spellbook
      const spellbookSpells = await this.wizardManager.getSpellbookSpells();
      const processedUuids = new Set();

      // Collect UUIDs that are already processed
      if (spellDataByClass.wizard) {
        Object.values(spellDataByClass.wizard).forEach((spellData) => {
          processedUuids.add(spellData.uuid);
        });
      }

      // Check each spellbook spell for ritual tag
      for (const spellUuid of spellbookSpells) {
        if (processedUuids.has(spellUuid)) continue; // Already processed

        try {
          const sourceSpell = await fromUuid(spellUuid);
          if (!sourceSpell || !sourceSpell.system.components?.ritual || sourceSpell.system.level === 0) {
            continue; // Not a ritual or is a cantrip
          }

          log(1, `Found missing ritual spell: ${sourceSpell.name} (${spellUuid})`);

          // Initialize wizard class data if needed
          if (!spellDataByClass.wizard) {
            spellDataByClass.wizard = {};
          }

          // Add as unprepared ritual spell
          const classSpellKey = `wizard:${spellUuid}`;
          spellDataByClass.wizard[classSpellKey] = {
            uuid: spellUuid,
            name: sourceSpell.name,
            wasPrepared: false,
            isPrepared: false, // Ritual spells start unprepared
            isRitual: true,
            sourceClass: 'wizard',
            classSpellKey,
            spellLevel: sourceSpell.system.level
          };

          log(1, `Added missing ritual spell: ${sourceSpell.name} as unprepared`);
        } catch (error) {
          log(2, `Error processing potential ritual spell ${spellUuid}:`, error);
        }
      }
    } catch (error) {
      log(1, `Error adding missing ritual spells:`, error);
    }
  }

  /**
   * Send GM notifications if needed
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @param {Object} allCantripChangesByClass - Cantrip changes by class
   * @returns {Promise<void>}
   * @private
   */
  async _sendGMNotifications(spellDataByClass, allCantripChangesByClass) {
    const globalBehavior =
      this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || ENFORCEMENT_BEHAVIOR.NOTIFY_GM;

    if (globalBehavior !== ENFORCEMENT_BEHAVIOR.NOTIFY_GM) return;

    const notificationData = {
      actorName: this.actor.name,
      classChanges: {}
    };

    // Build notification data using actual save results
    for (const [classIdentifier, classSpellData] of Object.entries(spellDataByClass)) {
      const classData = this._stateManager.classSpellData[classIdentifier];
      if (!classData) continue;

      const className = classData.className || classIdentifier;
      const cantripChanges = allCantripChangesByClass[classIdentifier] || { added: [], removed: [] };

      // Count final prepared amounts
      const cantripCount = Object.values(classSpellData).filter((spell) => spell.isPrepared && spell.spellLevel === 0).length;
      const spellCount = Object.values(classSpellData).filter((spell) => spell.isPrepared && spell.spellLevel > 0).length;

      const maxCantrips = this.spellManager.getMaxAllowed(classIdentifier);
      const maxSpells = classData.spellPreparation?.maximum || 0;

      notificationData.classChanges[classIdentifier] = {
        className,
        cantripChanges,
        overLimits: {
          cantrips: {
            isOver: cantripCount > maxCantrips,
            current: cantripCount,
            max: maxCantrips
          },
          spells: {
            isOver: spellCount > maxSpells,
            current: spellCount,
            max: maxSpells
          }
        }
      };
    }

    // Send comprehensive notification
    await this.spellManager.cantripManager.sendComprehensiveGMNotification(notificationData);
  }

  /**
   * Handle post-processing after spell save
   * @param {Actor} actor - The actor
   * @returns {Promise<void>}
   * @private
   */
  async _handlePostProcessing(actor) {
    if (this.spellManager.canBeLeveledUp()) {
      await this.spellManager.completeCantripsLevelUp();
    }

    if (this._isLongRest) {
      await this.spellManager.resetSwapTracking();
      await actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, false);
      this._isLongRest = false;
    }
  }
}
