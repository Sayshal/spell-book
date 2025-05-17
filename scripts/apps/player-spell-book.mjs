import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as filterUtils from '../helpers/filters.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
import { SpellManager } from '../helpers/spell-preparation.mjs';
import { SpellbookState } from '../helpers/state/spellbook-state.mjs';
import { SpellbookFilterHelper } from '../helpers/ui/spellbook-filters.mjs';
import { SpellbookUI } from '../helpers/ui/spellbook-ui.mjs';
import { WizardSpellbookManager } from '../helpers/wizard-spellbook.mjs';
import { log } from '../logger.mjs';
import { PlayerFilterConfiguration } from './player-filter-configuration.mjs';
import { SpellbookSettingsDialog } from './spellbook-settings-dialog.mjs';
import { WizardSpellCopyDialog } from './wizard-spell-copy-dialog.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
      height: '840',
      width: '600',
      top: '75'
    }
  };

  static PARTS = {
    container: { template: TEMPLATES.PLAYER.CONTAINER },
    sidebar: { template: TEMPLATES.PLAYER.SIDEBAR },
    navigation: { template: TEMPLATES.PLAYER.TAB_NAV },
    spellsTab: { template: TEMPLATES.PLAYER.TAB_SPELLS, scrollable: [''] },
    wizardTab: { template: TEMPLATES.PLAYER.TAB_WIZARD_SPELLBOOK, scrollable: [''] },
    footer: { template: TEMPLATES.PLAYER.FOOTER }
  };

  get title() {
    return game.i18n.format('SPELLBOOK.Application.ActorTitle', { name: this.actor.name });
  }

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.spellManager = new SpellManager(actor);
    this.wizardManager = genericUtils.isWizard(actor) ? new WizardSpellbookManager(actor) : null;

    // Initialize helpers
    this._stateManager = new SpellbookState(this);
    this.ui = new SpellbookUI(this);
    this.filterHelper = new SpellbookFilterHelper(this);

    // Set up state properties
    this.isLoading = true;
    this.spellLevels = [];
    this.className = '';
    this.spellPreparation = { current: 0, maximum: 0 };
    this._newlyCheckedCantrips = new Set();
    this._isLongRest = this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING) || false;
    this._wizardInitialized = false;

    // Initialize tab groups
    if (!this.tabGroups['spellbook-tabs']) this.tabGroups['spellbook-tabs'] = 'spellstab';

    // Register flag change hook
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

  async _prepareContext(options) {
    const context = this._createBaseContext();
    if (this.isLoading) return context;
    context.spellLevels = this.spellLevels.map((level) => {
      const processedLevel = { ...level };
      processedLevel.spells = level.spells.map((spell) => this._processSpellForDisplay(spell));
      return processedLevel;
    });
    context.activeTab = this.tabGroups['spellbook-tabs'];
    context.tabs = this._getTabs();
    context.isWizard = !!this.wizardManager?.isWizard;
    if (context.isWizard) {
      this._addWizardContextData(context);
    }
    context.hasMultipleTabs = Object.keys(context.tabs).length > 1;
    context.filters = this._prepareFilters();
    return context;
  }

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

  _processSpellForDisplay(spell) {
    const processedSpell = foundry.utils.deepClone(spell);

    if (!spell.compendiumUuid) {
      spell.compendiumUuid = genericUtils.getSpellUuid(spell);
    }

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

    if (spell.preparation.disabled && spell.preparation.disabledReason) {
      checkbox.dataset.tooltip = game.i18n.localize(spell.preparation.disabledReason);
    }

    processedSpell.preparationCheckboxHtml = formElements.elementToHtml(checkbox);

    if (this.wizardManager?.isWizard) {
      processedSpell.inWizardSpellbook = this._stateManager.wizardSpellbookCache?.includes(spell.compendiumUuid) || false;
    }

    return processedSpell;
  }

  _addWizardContextData(context) {
    context.wizardSpellbookCount = this._stateManager.wizardSpellbookCache?.length || 0;
    context.wizardRulesVersion = this.spellManager.getSettings().rules;

    // Add wizard tab
    context.tabs.wizardtab = {
      id: 'wizardtab',
      label: game.i18n.format('SPELLBOOK.Tabs.WizardSpells', { class: this.className }),
      group: 'spellbook-tabs',
      cssClass: this.tabGroups['spellbook-tabs'] === 'wizardtab' ? 'active' : '',
      icon: 'fa-solid fa-book-spells'
    };

    // Add tab data if available
    if (this._stateManager.tabData?.wizardtab) {
      context.wizardTotalSpellbookCount = this._stateManager.tabData.wizardtab.wizardTotalSpellbookCount || 0;
      context.wizardFreeSpellbookCount = this._stateManager.tabData.wizardtab.wizardFreeSpellbookCount || 0;
      context.wizardRemainingFreeSpells = this._stateManager.tabData.wizardtab.wizardRemainingFreeSpells || 0;
      context.wizardHasFreeSpells = this._stateManager.tabData.wizardtab.wizardHasFreeSpells || false;
    }
  }

  async _onRender(context, options) {
    super._onRender?.(context, options);
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

      // Set up UI
      this.ui.positionFooter();
      this.ui.setupFilterListeners();
      this.ui.setupPreparationListeners();
      this.ui.applyCollapsedLevels();
      this._applyFilters();
      this.ui.updateSpellPreparationTracking();
      this.ui.setupCantripUI();
      this.ui.updateSpellCounts();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
  }

  _setupContentWrapper() {
    if (!this.element.querySelector('.content-wrapper')) {
      const tabsNav = this.element.querySelector('.window-content > nav.tabs.tabs-right');
      const wrapper = document.createElement('div');
      wrapper.className = 'content-wrapper';

      const elementsToWrap = [this.element.querySelector('.sidebar'), this.element.querySelector('.spell-book-container'), this.element.querySelector('.window-content > footer')].filter((el) => el);

      if (elementsToWrap.length && elementsToWrap[0].parentNode) {
        elementsToWrap[0].parentNode.insertBefore(wrapper, elementsToWrap[0]);
        elementsToWrap.forEach((el) => wrapper.appendChild(el));

        if (tabsNav && tabsNav.parentNode === wrapper) {
          this.element.querySelector('.window-content').appendChild(tabsNav);
        }
      }
    }
  }

  _onClose() {
    try {
      if (this._isLongRest) {
        this.actor.unsetFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING);
      }

      if (this._flagChangeHook) {
        Hooks.off('updateActor', this._flagChangeHook);
      }

      super._onClose?.();
    } catch (error) {
      log(1, 'Error in _onClose:', error);
    }
  }

  _getTabs() {
    const tabGroup = 'spellbook-tabs';

    return {
      spellstab: {
        id: 'spellstab',
        label: game.i18n.format('SPELLBOOK.Tabs.Spells', { name: this.actor.name }),
        group: tabGroup,
        cssClass: this.tabGroups[tabGroup] === 'spellstab' ? 'active' : '',
        icon: 'fa-solid fa-book-open'
      }
    };
  }

  changeTab(tabName, groupName, options = {}) {
    super.changeTab(tabName, groupName, options);

    if (tabName === 'spellstab' && this._spellsTabNeedsReload && this.wizardManager?.isWizard) {
      this._spellsTabNeedsReload = false;

      if (this._stateManager.tabData) {
        const collapsedLevels = Array.from(this.element.querySelectorAll('.spell-level.collapsed')).map((el) => el.dataset.level);

        this._loadSpellData().then(() => {
          setTimeout(() => {
            collapsedLevels.forEach((levelId) => {
              const levelEl = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
              if (levelEl) {
                levelEl.classList.add('collapsed');
                const heading = levelEl.querySelector('.spell-level-heading');
                if (heading) heading.setAttribute('aria-expanded', 'false');
              }
            });
          }, 50);
        });
        return;
      }
    }

    if (this.wizardManager?.isWizard && this._stateManager.tabData && this._stateManager.tabData[tabName]) {
      this.spellLevels = this._stateManager.tabData[tabName].spellLevels;
      this.spellPreparation = this._stateManager.tabData[tabName].spellPreparation;
      this.render(false);
    }
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);

    options.parts = ['container', 'sidebar', 'navigation', 'spellsTab', 'footer'];

    if (this.wizardManager?.isWizard) {
      options.parts.push('wizardTab');
    }
  }

  async _loadSpellData() {
    try {
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

  _getFilterOptions(filterId, filterState) {
    return filterUtils.getOptionsForFilter(filterId, filterState, this.spellLevels);
  }

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

  _applyFilters() {
    this.filterHelper.applyFilters();
  }

  async _handlePreparationChange(event) {
    try {
      const checkbox = event.target;
      const uuid = checkbox.dataset.uuid;
      const spellItem = checkbox.closest('.spell-item');
      const spellLevel = spellItem?.dataset.spellLevel;

      if (spellLevel === '0') {
        await this._handleCantripPreparationChange(event, uuid, spellItem);
      } else if (spellItem) {
        spellItem.classList.toggle('prepared-spell', checkbox.checked);
      }

      this.ui.updateSpellPreparationTracking();
      this.ui.updateSpellCounts();
    } catch (error) {
      log(1, 'Error handling preparation change:', error);
    }
  }

  async _handleCantripPreparationChange(event, uuid, spellItem) {
    try {
      const checkbox = event.target;
      const isChecked = checkbox.checked;
      const wasPrepared = checkbox.dataset.wasPrepared === 'true';
      const spellName = spellItem?.querySelector('.spell-name .title')?.textContent || 'unknown';

      const isLevelUp = this.spellManager.canBeLeveledUp();
      const isLongRest = this._isLongRest;

      const sourceSpell = await fromUuid(uuid);
      if (!sourceSpell) {
        log(1, `Could not find source spell for UUID: ${uuid}`);
        return;
      }

      const canChange = this.spellManager.canChangeCantripStatus(sourceSpell, isChecked, isLevelUp, isLongRest, this._uiCantripCount);

      if (!canChange.allowed) {
        checkbox.checked = !isChecked;
        if (canChange.message) {
          ui.notifications.warn(game.i18n.localize(canChange.message));
        }
        this.ui.updateCantripCounter();
        return;
      }

      this.spellManager.trackCantripChange(sourceSpell, isChecked, isLevelUp, isLongRest);

      if (isChecked && !wasPrepared) {
        this._newlyCheckedCantrips.add(uuid);
      } else if (!isChecked && this._newlyCheckedCantrips.has(uuid)) {
        this._newlyCheckedCantrips.delete(uuid);
      }

      this.ui.updateCantripCounter();

      if (spellItem) {
        spellItem.classList.toggle('prepared-spell', isChecked);
      }

      this.ui.setupCantripLocks();
    } catch (error) {
      log(1, 'Error handling cantrip preparation change:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

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

  static filterSpells(_event, _form) {
    this._applyFilters();
  }

  static sortSpells(event, _form) {
    try {
      const sortBy = event.target.value;
      this.filterHelper.applySorting(sortBy);
    } catch (error) {
      log(1, 'Error sorting spells:', error);
    }
  }

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

  static configureFilters(_event, _form) {
    try {
      const filterConfig = new PlayerFilterConfiguration(this);
      filterConfig.render(true);
    } catch (error) {
      log(1, 'Error configuring filters:', error);
    }
  }

  static configureCantripSettings(_event, _form) {
    try {
      const dialog = new SpellbookSettingsDialog(this.actor);
      dialog.render(true);
    } catch (error) {
      log(1, 'Error configuring cantrip settings:', error);
    }
  }

  static async learnSpell(event) {
    try {
      const spellUuid = event.target.dataset.uuid;
      if (!spellUuid) return;

      const collapsedLevels = Array.from(this.element.querySelectorAll('.spell-level.collapsed')).map((el) => el.dataset.level);
      const activeTab = this.tabGroups['spellbook-tabs'];

      const spell = await fromUuid(spellUuid);
      if (!spell) {
        ui.notifications.error(`Could not find spell with UUID: ${spellUuid}`);
        return;
      }

      const costInfo = await this.wizardManager.getCopyingCostWithFree(spell);
      const time = this.wizardManager.getCopyingTime(spell);

      const dialog = new WizardSpellCopyDialog(spell, this.wizardManager, costInfo, time);
      const result = await dialog.getResult();

      if (result.confirmed) {
        const success = await this.wizardManager.copySpell(spellUuid, costInfo.cost, time, costInfo.isFree);

        if (success) {
          ui.notifications.info(`Learned ${spell.name} and added it to your spellbook.`);

          if (this._stateManager.wizardSpellbookCache) {
            this._stateManager.wizardSpellbookCache.push(spellUuid);
          }

          this._updateWizardTabDataAfterSpellLearning(costInfo.isFree);

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
          ui.notifications.warn(`Could not learn ${spell.name}.`);
        }
      }
    } catch (error) {
      log(1, 'Error learning spell:', error);
      ui.notifications.error('Failed to learn spell');
    }
  }

  _updateWizardTabDataAfterSpellLearning(isFree) {
    if (this._stateManager.tabData && this._stateManager.tabData.wizardtab) {
      this._stateManager.tabData.wizardtab.wizardTotalSpellbookCount = (this._stateManager.tabData.wizardtab.wizardTotalSpellbookCount || 0) + 1;

      if (isFree) {
        this._stateManager.tabData.wizardtab.wizardRemainingFreeSpells = Math.max(0, (this._stateManager.tabData.wizardtab.wizardRemainingFreeSpells || 0) - 1);
        this._stateManager.tabData.wizardtab.wizardHasFreeSpells = this._stateManager.tabData.wizardtab.wizardRemainingFreeSpells > 0;
      }
    }
  }

  static async formHandler(_event, form, formData) {
    try {
      const actor = this.actor;
      if (!actor) return null;

      const spellData = {};
      const checkboxes = form.querySelectorAll('dnd5e-checkbox[data-uuid]');

      for (const checkbox of checkboxes) {
        const uuid = checkbox.dataset.uuid;
        const name = checkbox.dataset.name;
        const wasPrepared = checkbox.dataset.wasPrepared === 'true';
        const isPrepared = checkbox.checked;
        const isRitual = checkbox.dataset.ritual === 'true';

        const spellItem = checkbox.closest('.spell-item');
        const isAlwaysPreparedElement = spellItem && (spellItem.querySelector('.tag.always-prepared') || spellItem.querySelector('.tag.granted'));

        if (isAlwaysPreparedElement) continue;

        spellData[uuid] = {
          name,
          wasPrepared,
          isPrepared,
          isAlwaysPrepared: false,
          isRitual
        };
      }

      await this.spellManager.saveActorPreparedSpells(spellData);

      if (this.spellManager.canBeLeveledUp()) {
        await this.spellManager.completeCantripsLevelUp();
      }

      if (this._isLongRest) {
        await this.spellManager.resetSwapTracking();
        await actor.setFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING, false);
        this._isLongRest = false;
      }

      this._newlyCheckedCantrips.clear();

      if (actor.sheet.rendered) {
        actor.sheet.render(true);
      }

      return actor;
    } catch (error) {
      log(1, 'Error handling form submission:', error);
      return null;
    }
  }
}
