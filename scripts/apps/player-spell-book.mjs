import { CANTRIP_RULES, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as actorSpellUtils from '../helpers/actor-spells.mjs';
import * as filterUtils from '../helpers/filters.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import { SpellManager } from '../helpers/spell-preparation.mjs';
import { log } from '../logger.mjs';
import { CantripSettingsDialog } from './cantrip-settings-dialog.mjs';
import { PlayerFilterConfiguration } from './player-filter-configuration.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Player-facing spell book application for managing prepared spells
 */
export class PlayerSpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
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
      configureCantripSettings: PlayerSpellBook.configureCantripSettings
    },
    classes: ['spell-book'],
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

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.PLAYER.MAIN, templates: [TEMPLATES.PLAYER.SIDEBAR, TEMPLATES.PLAYER.SPELL_LIST] },
    footer: { template: TEMPLATES.PLAYER.FOOTER }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /** The actor this spell book is for */
  actor = null;

  /** Loading state */
  isLoading = true;

  /** Spell levels data */
  spellLevels = [];

  /** Class name for spellcasting */
  className = '';

  /** Spell preparation statistics */
  spellPreparation = { current: 0, maximum: 0 };

  /** Cantrip manager instance */
  spellManager = null;

  /** Tracking state for cantrip swapping during level-up */
  _cantripTracking = {
    originalChecked: new Set(),
    hasUnlearned: false,
    hasLearned: false,
    unlearned: null,
    learned: null
  };

  /** Current cantrip count from UI state */
  _uiCantripCount = 0;

  _newlyCheckedCantrips = new Set();

  get title() {
    return game.i18n.format('SPELLBOOK.Application.ActorTitle', { name: this.actor.name });
  }

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  constructor(actor, options = {}) {
    super(options);
    log(3, `Initializing PlayerSpellBook for ${actor.name}`);
    this.actor = actor;
    this.spellManager = new SpellManager(actor);
    this._newlyCheckedCantrips = new Set();

    // Listen for flag changes to refresh the display
    this._flagChangeHook = Hooks.on('updateActor', (updatedActor, changes) => {
      if (updatedActor.id !== this.actor.id) return;

      // Check for spell book related flag changes
      if (changes.flags?.[MODULE.ID]) {
        const changedFlags = Object.keys(changes.flags[MODULE.ID]);
        const cantripFlagChanged = changedFlags.some((flag) => [FLAGS.CANTRIP_RULES, FLAGS.CANTRIP_CHANGE_BEHAVIOR, FLAGS.CANTRIP_CHANGE_ALLOWED].includes(flag));

        if (cantripFlagChanged && this.rendered) {
          log(3, 'Cantrip flags changed, re-rendering spell book');
          this.render(false);
        }
      }
    });
  }

  /* -------------------------------------------- */
  /*  Core Application Methods                    */
  /* -------------------------------------------- */

  /**
   * @override
   */
  async _prepareContext(options) {
    log(3, 'Preparing PlayerSpellBook context');

    // Create basic context with loading state
    const context = this._createBaseContext();

    // Skip detailed preparation if we're still loading
    if (this.isLoading) {
      return context;
    }

    // Process spell levels to add HTML checkboxes
    context.spellLevels = this.spellLevels.map((level) => {
      // Create a copy of the level data
      const processedLevel = { ...level };

      // Process spells to add checkbox HTML
      processedLevel.spells = level.spells.map((spell) => {
        // Create a deep copy of the spell
        const processedSpell = foundry.utils.deepClone(spell);

        // Set up checkbox configuration
        const ariaLabel =
          spell.preparation.prepared ? game.i18n.format('SPELLBOOK.Preparation.Unprepare', { name: spell.name }) : game.i18n.format('SPELLBOOK.Preparation.Prepare', { name: spell.name });

        // Use the form element helper to create the checkbox
        const checkbox = formElements.createCheckbox({
          name: `spellPreparation.${spell.compendiumUuid}`,
          checked: spell.preparation.prepared,
          disabled: spell.preparation.disabled,
          ariaLabel: ariaLabel
        });

        // Add data attributes to the checkbox element
        checkbox.id = `prep-${spell.compendiumUuid}`;
        checkbox.dataset.uuid = spell.compendiumUuid;
        checkbox.dataset.name = spell.name;
        checkbox.dataset.ritual = spell.filterData?.isRitual || false;
        checkbox.dataset.wasPrepared = spell.preparation.prepared;

        // Add tooltip with reason for disabled state
        if (spell.preparation.disabled && spell.preparation.disabledReason) {
          checkbox.dataset.tooltip = game.i18n.localize(spell.preparation.disabledReason);
        }

        // Convert the checkbox to HTML using the helper
        processedSpell.preparationCheckboxHtml = formElements.elementToHtml(checkbox);

        return processedSpell;
      });

      return processedLevel;
    });

    context.filters = this._prepareFilters();
    return context;
  }

  _createBaseContext() {
    // Get filter configuration
    let filterConfig = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
    if (!Array.isArray(filterConfig) || !filterConfig.length) {
      filterConfig = DEFAULT_FILTER_CONFIG;
    }

    // Create empty filters structure for loading state
    const emptyFilters = {
      search: null,
      dropdowns: [],
      checkboxes: [],
      range: null
    };

    // Create buttons array with GM-only cantrip config
    const buttons = [
      {
        type: 'submit',
        icon: 'fas fa-save',
        label: 'SPELLBOOK.UI.Save',
        cssClass: 'submit-button'
      },
      {
        type: 'reset',
        action: 'reset',
        icon: 'fas fa-undo',
        label: 'SPELLBOOK.UI.Reset',
        cssClass: 'reset-button'
      }
    ];

    return {
      actor: this.actor,
      isLoading: this.isLoading,
      spellLevels: this.spellLevels || [],
      className: this.className || '',
      filters: this.isLoading ? emptyFilters : this._getFilterState(),
      spellSchools: CONFIG.DND5E.spellSchools,
      buttons: buttons,
      actorId: this.actor.id,
      spellPreparation: this.spellPreparation || { current: 0, maximum: 0 },
      isGM: game.user.isGM
    };
  }

  /**
   * @override
   */
  _onRender(context, options) {
    super._onRender?.(context, options);

    try {
      // Set sidebar state based on user preference
      this._setSidebarState();

      if (this.isLoading) {
        log(3, 'Spell book still loading, setting up loading UI');
        this.element.classList.add('loading');
        this._disableInputsWhileLoading();
        this._positionFooter();

        // Start loading data
        this._loadSpellData();
        return;
      } else {
        this.element.classList.remove('loading');
      }

      log(3, 'Setting up UI elements for loaded spell book');

      // Set up UI elements
      this._positionFooter();
      this._setupFilterListeners();
      this._setupPreparationListeners();
      this._applyCollapsedLevels();
      this._updateSpellCounts();
      this._applyFilters();
      this._updateSpellPreparationTracking();

      // Setup cantrip UI elements
      this._setupCantripUI();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
  }

  /**
   * @override
   */
  _onClose() {
    try {
      // Remove the flag change hook
      if (this._flagChangeHook) {
        Hooks.off('updateActor', this._flagChangeHook);
      }

      log(3, `Closed PlayerSpellBook for ${this.actor.name}`);
      super._onClose?.();
    } catch (error) {
      log(1, 'Error in _onClose:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Data Loading Methods                        */
  /* -------------------------------------------- */

  async _loadSpellData() {
    try {
      log(3, `Loading spell data for ${this.actor.name}`);

      // Initialize cantrip manager and flags
      await this.spellManager.initializeFlags();

      // Load spellcasting class
      const classItem = await this._loadSpellcastingClass();
      if (!classItem) {
        log(1, 'No spellcasting class found for actor');
        this.isLoading = false;
        this.render(false);
        return;
      }

      // Check for cantrip level-up
      const cantripLevelUp = this.spellManager.checkForLevelUp();
      if (cantripLevelUp) {
        const settings = this.spellManager.getSettings();
        const message = settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LevelUpDefault' : 'SPELLBOOK.Cantrips.LevelUpModern';

        ui.notifications.info(game.i18n.localize(message));
        log(3, `Cantrip level-up detected, using rules: ${settings.rules}`);
      }

      // Continue loading spells
      const spellList = await this._loadSpellList(classItem);
      if (!spellList || !spellList.size) {
        log(1, 'No spells found in spell list');
        this.isLoading = false;
        this.render(false);
        return;
      }

      const spellItems = await this._loadSpellItems(spellList, classItem);
      if (!spellItems || !spellItems.length) {
        log(1, 'No spell items could be loaded');
        this.isLoading = false;
        this.render(false);
        return;
      }

      await this._processAndOrganizeSpells(spellItems, classItem);

      log(3, `Completed loading spell data for ${this.actor.name}`);
    } catch (error) {
      log(1, 'Error loading spell data:', error);
    } finally {
      this.isLoading = false;
      this.render(false);
    }
  }

  async _loadSpellcastingClass() {
    try {
      const classItem = discoveryUtils.findSpellcastingClass(this.actor);
      if (!classItem) {
        return null;
      }

      log(3, `Found spellcasting class: ${classItem.name}`);
      return classItem;
    } catch (error) {
      log(1, 'Error finding spellcasting class:', error);
      return null;
    }
  }

  async _loadSpellList(classItem) {
    try {
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;

      log(3, `Loading spell list for ${className}`);
      const spellUuids = await discoveryUtils.getClassSpellList(className, classUuid);

      if (!spellUuids || !spellUuids.size) {
        log(1, 'No spells found in class spell list');
        return new Set();
      }

      log(3, `Found ${spellUuids.size} spells for class ${className}`);
      return spellUuids;
    } catch (error) {
      log(1, 'Error loading spell list:', error);
      return new Set();
    }
  }

  async _loadSpellItems(spellUuids, classItem) {
    try {
      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);

      log(3, `Loading spells up to level ${maxSpellLevel} for ${this.actor.name}`);
      const spellItems = await actorSpellUtils.fetchSpellDocuments(spellUuids, maxSpellLevel);

      if (!spellItems || !spellItems.length) {
        return [];
      }

      log(3, `Loaded ${spellItems.length} spell items`);
      return spellItems;
    } catch (error) {
      log(1, 'Error loading spell items:', error);
      return [];
    }
  }

  async _processAndOrganizeSpells(spellItems, classItem) {
    try {
      log(3, 'Processing and organizing spells');

      // Organize spells by level
      const spellLevels = await actorSpellUtils.organizeSpellsByLevel(spellItems, this.actor);
      log(3, `Organized spells into ${spellLevels.length} levels`);

      // Sort spells within each level
      const sortBy = this._getFilterState().sortBy || 'level';
      for (const level of spellLevels) {
        level.spells = this._sortSpells(level.spells, sortBy);
      }

      // Enrich spell data with icons and details
      await this._enrichSpellData(spellLevels);

      // Calculate preparation stats
      const prepStats = this._calculatePreparationStats(spellLevels, classItem);

      // Update state with processed data
      this.spellLevels = spellLevels;
      this.className = classItem.name;
      this.spellPreparation = prepStats;

      log(3, `Preparation statistics: ${prepStats.current}/${prepStats.maximum}`);
    } catch (error) {
      log(1, 'Error processing spell data:', error);
    }
  }

  /**
   * Enrich spell data with icons and formatted details
   * @param {Array} spellLevels - Array of spell level data
   * @returns {Promise<void>}
   * @private
   */
  async _enrichSpellData(spellLevels) {
    try {
      log(3, 'Enriching spell data with icons and details');
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          try {
            spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
            spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
          } catch (error) {
            log(1, `Failed to enrich spell: ${spell.name}`, error);
          }
        }
      }
    } catch (error) {
      log(1, 'Error enriching spell data:', error);
    }
  }

  _calculatePreparationStats(spellLevels, classItem) {
    try {
      let preparedCount = 0;
      let maxPrepared = 0;

      // Calculate maximum prepared spells
      if (classItem) {
        const spellcastingAbility = classItem.system.spellcasting?.ability;
        if (spellcastingAbility) {
          const abilityMod = this.actor.system.abilities[spellcastingAbility]?.mod || 0;
          const classLevel = classItem.system.levels || this.actor.system.details.level;
          maxPrepared = Math.max(1, classLevel + abilityMod);
        }
      }

      // Count prepared spells (excluding cantrips)
      for (const level of spellLevels) {
        // Skip cantrips (level 0)
        if (level.level === '0' || level.level === 0) continue;

        for (const spell of level.spells) {
          if (spell.preparation.prepared && !spell.preparation.alwaysPrepared) {
            preparedCount++;
          }
        }
      }

      return {
        current: preparedCount,
        maximum: maxPrepared
      };
    } catch (error) {
      log(1, 'Error calculating preparation stats:', error);
      return { current: 0, maximum: 0 };
    }
  }

  /* -------------------------------------------- */
  /*  UI Setup & Management                       */
  /* -------------------------------------------- */

  _setSidebarState() {
    try {
      const sidebarCollapsed = game.user.getFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED);
      if (sidebarCollapsed) {
        this.element.classList.add('sidebar-collapsed');
        log(3, 'Setting sidebar to collapsed state');
      }
    } catch (error) {
      log(1, 'Error setting sidebar state:', error);
    }
  }

  _disableInputsWhileLoading() {
    try {
      const inputs = this.element.querySelectorAll('.spell-filters input, .spell-filters select, .spell-filters button');
      inputs.forEach((input) => {
        input.disabled = true;
      });
      log(3, 'Disabled inputs during loading');
    } catch (error) {
      log(1, 'Error disabling inputs:', error);
    }
  }

  _positionFooter() {
    try {
      const footer = this.element.querySelector('footer');
      if (!footer) return;

      const isSidebarCollapsed = this.element.classList.contains('sidebar-collapsed');
      const sidebarFooterContainer = this.element.querySelector('.sidebar-footer-container');
      const collapsedFooter = this.element.querySelector('.collapsed-footer');

      if (isSidebarCollapsed && collapsedFooter) {
        collapsedFooter.appendChild(footer);
        collapsedFooter.classList.remove('hidden');
      } else if (sidebarFooterContainer) {
        sidebarFooterContainer.appendChild(footer);
        if (collapsedFooter) collapsedFooter.classList.add('hidden');
      }
    } catch (error) {
      log(1, 'Error positioning footer:', error);
    }
  }

  _setupFilterListeners() {
    try {
      log(3, 'Setting up filter listeners');

      // Use a delegated event handler approach by adding listeners to the filters container
      const filtersContainer = this.element.querySelector('.spell-filters');
      if (!filtersContainer) {
        log(2, 'Filter container not found, unable to set up listeners');
        return;
      }

      // Handle 'change' events for select dropdowns and checkboxes
      filtersContainer.addEventListener('change', (event) => {
        const target = event.target;

        // Handle different element types
        if (target.matches('dnd5e-checkbox') || target.matches('select')) {
          // Apply filters immediately
          this._applyFilters();

          // Special case for sort-by
          if (target.name === 'sort-by') {
            this._applySorting(target.value);
          }
        }
      });

      // Handle 'input' events for text search and number inputs
      filtersContainer.addEventListener('input', (event) => {
        const target = event.target;
        if (target.matches('input[type="text"]')) {
          // Debounce text search
          clearTimeout(this._searchTimer);
          this._searchTimer = setTimeout(() => {
            this._applyFilters();
          }, 200);
        } else if (target.matches('input[type="number"]')) {
          // Debounce range inputs
          clearTimeout(this._rangeTimer);
          this._rangeTimer = setTimeout(() => {
            this._applyFilters();
          }, 200);
        }
      });

      log(3, 'Delegated filter listeners setup complete');
    } catch (error) {
      log(1, 'Error setting up filter listeners:', error);
    }
  }

  _setupPreparationListeners() {
    try {
      log(3, 'Setting up preparation listeners');

      // Use event delegation for checkbox changes
      const spellsContainer = this.element.querySelector('.spells-container');
      if (!spellsContainer) {
        log(1, 'Spells container not found, unable to set up preparation listeners');
        return;
      }

      // Check if we need to handle cantrip rules
      const isLevelUp = this.spellManager.canBeLeveledUp();
      log(3, `Level up status during listener setup: ${isLevelUp}`);

      // We need to track original cantrips for level-ups with any rule type
      if (isLevelUp) {
        log(3, 'Setting up cantrip tracking for level-up');

        // Store the initial state of cantrips
        this._cantripTracking = {
          originalChecked: new Set(),
          hasUnlearned: false,
          hasLearned: false,
          unlearned: null,
          learned: null
        };

        // Record initially checked cantrips
        const cantripItems = spellsContainer.querySelectorAll('.spell-item[data-spell-level="0"]');
        cantripItems.forEach((item) => {
          const checkbox = item.querySelector('dnd5e-checkbox[data-uuid]');
          const spellName = item.querySelector('.spell-name .title')?.textContent || 'unknown';

          if (checkbox && checkbox.checked) {
            this._cantripTracking.originalChecked.add(checkbox.dataset.uuid);
            log(3, `Recorded original cantrip: ${spellName}`);
          }
        });

        log(3, `Recorded ${this._cantripTracking.originalChecked.size} initial cantrips`);
      }

      // Use event delegation for all preparation checkboxes
      spellsContainer.addEventListener('change', async (event) => {
        const target = event.target;

        // Check if this is a dnd5e-checkbox for spell preparation
        if (target.matches('dnd5e-checkbox[data-uuid]')) {
          await this._handlePreparationChange(event);
        }
      });
    } catch (error) {
      log(1, 'Error setting up preparation listeners:', error);
    }
  }

  async _handlePreparationChange(event) {
    try {
      // Get checkbox and its data
      const checkbox = event.target;
      const uuid = checkbox.dataset.uuid;
      const spellItem = checkbox.closest('.spell-item');
      const spellLevel = spellItem?.dataset.spellLevel;

      // Handle cantrip-specific logic
      if (spellLevel === '0') {
        await this._handleCantripPreparationChange(event, uuid, spellItem);
      } else {
        // Non-cantrip spell - just update UI
        if (spellItem) {
          if (checkbox.checked) {
            spellItem.classList.add('prepared-spell');
          } else {
            spellItem.classList.remove('prepared-spell');
          }
        }
      }

      // Update tracking and counts
      this._updateSpellPreparationTracking();
      this._updateSpellCounts();
    } catch (error) {
      log(1, 'Error handling preparation change:', error);
    }
  }

  async _handleCantripPreparationChange(event, uuid, spellItem) {
    // Get settings and level-up status
    const isLevelUp = this.spellManager.canBeLeveledUp();
    const settings = this.spellManager.getSettings();
    const isModernRules = settings.rules === CANTRIP_RULES.MODERN;
    const isDefaultRules = settings.rules === CANTRIP_RULES.DEFAULT;

    // Get spell name for logging
    const spellName = spellItem?.querySelector('.spell-name .title')?.textContent || 'unknown';
    const checkState = event.target.checked ? 'checking' : 'unchecking';

    log(3, `======== CANTRIP CHANGE ========`);
    log(3, `Cantrip: ${spellName}, Action: ${checkState}`);
    log(3, `Modern rules: ${isModernRules}, Level up: ${isLevelUp}`);
    log(3, `Current tracking: hasUnlearned=${this._cantripTracking.hasUnlearned}, unlearned=${this._cantripTracking.unlearned}`);

    // Get the source spell
    const sourceSpell = await fromUuid(uuid);
    if (!sourceSpell) return;

    // Check if the cantrip was in our original set
    const wasInOriginalSet = this._cantripTracking.originalChecked.has(uuid);
    log(3, `Was in original set: ${wasInOriginalSet}`);

    // For MODERN rules outside level-up with exceptions
    if (isModernRules && !isLevelUp) {
      // Allow toggling newly checked cantrips (added during current session)
      if (this._newlyCheckedCantrips.has(uuid)) {
        log(3, `Allowing toggle of newly checked cantrip: ${spellName}`);
        // Continue processing - this cantrip can be toggled
      }
      // Block unchecking original cantrips
      else if (wasInOriginalSet && !event.target.checked) {
        event.target.checked = true; // Revert change
        ui.notifications.warn(game.i18n.localize('SPELLBOOK.Cantrips.LockedModern'));
        this._updateCantripCounter();
        return;
      }
      // Allow checking new cantrips
    }

    // MODERN rules during level-up: enforce ONE swap only
    if (isModernRules && isLevelUp) {
      // SPECIAL CASE: If CHECKING a cantrip that was previously UNLEARNED,
      // reset the unlearned tracking since the user changed their mind
      if (event.target.checked && wasInOriginalSet && this._cantripTracking.unlearned === uuid) {
        log(3, `Resetting unlearned tracking - user changed mind about ${spellName}`);
        this._cantripTracking.hasUnlearned = false;
        this._cantripTracking.unlearned = null;
      }
      // If UNCHECKING a cantrip from the original set (unlearning)
      else if (!event.target.checked && wasInOriginalSet) {
        log(3, `Unlearning cantrip: ${spellName}`);

        // If we've already unlearned a different cantrip
        if (this._cantripTracking.hasUnlearned && this._cantripTracking.unlearned !== uuid) {
          log(3, `Blocking unlearn - already unlearned ${this._cantripTracking.unlearned}`);
          event.target.checked = true; // Revert change
          ui.notifications.warn('With modern rules, you can only unlearn one cantrip per level-up.');
          this._updateCantripCounter();
          return;
        }

        // Track this as the unlearned cantrip
        this._cantripTracking.hasUnlearned = true;
        this._cantripTracking.unlearned = uuid;
        log(3, `Tracking unlearned cantrip: ${spellName}`);
      }

      // SPECIAL CASE: If UNCHECKING a cantrip that was previously LEARNED,
      // reset the learned tracking since the user changed their mind
      if (!event.target.checked && !wasInOriginalSet && this._cantripTracking.learned === uuid) {
        log(3, `Resetting learned tracking - user changed mind about ${spellName}`);
        this._cantripTracking.hasLearned = false;
        this._cantripTracking.learned = null;
      }
      // If CHECKING a cantrip that wasn't in the original set (learning new)
      else if (event.target.checked && !wasInOriginalSet) {
        log(3, `Learning new cantrip: ${spellName}`);

        // If already learned a different new cantrip
        if (this._cantripTracking.hasLearned && this._cantripTracking.learned !== uuid) {
          log(3, `Blocking learning - already learned ${this._cantripTracking.learned}`);
          event.target.checked = false; // Revert change
          ui.notifications.warn('With modern rules, you can only learn one new cantrip per level-up.');
          this._updateCantripCounter();
          return;
        }

        // Track this as the learned cantrip
        this._cantripTracking.hasLearned = true;
        this._cantripTracking.learned = uuid;
        log(3, `Tracking learned cantrip: ${spellName}`);
      }
    }

    // DEFAULT rules: can't uncheck original cantrips
    if (isDefaultRules && !event.target.checked && wasInOriginalSet) {
      event.target.checked = true;
      ui.notifications.warn(game.i18n.localize('SPELLBOOK.Cantrips.LockedDefault'));
      this._updateCantripCounter();
      return;
    }

    // Track newly checked/unchecked cantrips for UI
    if (event.target.checked && !wasInOriginalSet) {
      this._newlyCheckedCantrips.add(uuid);
      log(3, `Added to newly checked cantrips: ${spellName}`);
    } else if (!event.target.checked && this._newlyCheckedCantrips.has(uuid)) {
      this._newlyCheckedCantrips.delete(uuid);
      log(3, `Removed from newly checked cantrips: ${spellName}`);
    }

    // Update UI
    this._updateCantripCounter();

    // Check if adding a new cantrip would exceed max
    if (!wasInOriginalSet && event.target.checked) {
      if (this._uiCantripCount > this.spellManager.maxCantrips) {
        event.target.checked = false;
        this._newlyCheckedCantrips.delete(uuid);
        ui.notifications.warn(game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached'));
        this._updateCantripCounter();
        return;
      }
    }

    // Update UI class for spell item
    if (spellItem) {
      if (event.target.checked) {
        spellItem.classList.add('prepared-spell');
      } else {
        spellItem.classList.remove('prepared-spell');
      }
    }

    // Always update locks after changes
    this._setupCantripLocks();

    log(3, `Cantrip change completed successfully`);
  }

  _updateSpellPreparationTracking() {
    try {
      // Find the dnd5e-checkbox elements that are not disabled
      const preparedCheckboxes = this.element.querySelectorAll('dnd5e-checkbox[data-uuid]:not([disabled])');

      const countDisplay = this.element.querySelector('.spell-prep-tracking');
      if (!countDisplay) return;

      // Count checked dnd5e-checkbox elements (excluding cantrips)
      let preparedCount = 0;
      preparedCheckboxes.forEach((checkbox) => {
        // Get the spell item
        const spellItem = checkbox.closest('.spell-item');
        const spellLevel = spellItem?.dataset.spellLevel;

        // Skip cantrips
        if (spellLevel === '0') return;

        // DnD5e checkboxes use the 'checked' property or attribute
        if (checkbox.checked) preparedCount++;
      });

      // Get maximum from context
      const maxPrepared = this?.spellPreparation?.maximum || 0;

      // Update counter elements
      const currentCountEl = countDisplay.querySelector('.current-count');
      const maxCountEl = countDisplay.querySelector('.max-count');

      if (currentCountEl) currentCountEl.textContent = preparedCount;
      if (maxCountEl) maxCountEl.textContent = maxPrepared;

      // Add visual indicator when at/over max
      if (preparedCount >= maxPrepared) {
        countDisplay.classList.add('at-max');
      } else {
        countDisplay.classList.remove('at-max');
      }

      log(3, `Updated spell preparation tracking: ${preparedCount}/${maxPrepared}`);

      // Only apply limits if we have a valid maximum
      if (maxPrepared > 0) {
        if (preparedCount >= maxPrepared) {
          // Add class to form
          this.element.classList.add('at-max-spells');

          // Disable unchecked checkboxes (excluding cantrips)
          const allSpellCheckboxes = this.element.querySelectorAll('dnd5e-checkbox[data-uuid]');
          allSpellCheckboxes.forEach((checkbox) => {
            const spellItem = checkbox.closest('.spell-item');
            const spellLevel = spellItem?.dataset.spellLevel;

            // Don't disable cantrips
            if (spellLevel === '0') return;

            if (!checkbox.checked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Preparation.MaxPrepared');
              spellItem?.classList.add('max-prepared');
            }
          });
        } else {
          // Remove max spells class
          this.element.classList.remove('at-max-spells');

          // Re-enable all preparation checkboxes (excluding cantrips and special cases)
          const allSpellCheckboxes = this.element.querySelectorAll('dnd5e-checkbox[data-uuid]');
          allSpellCheckboxes.forEach((checkbox) => {
            const spellItem = checkbox.closest('.spell-item');
            const spellLevel = spellItem?.dataset.spellLevel;

            // Don't change cantrips
            if (spellLevel === '0') return;

            // Skip items with special always-prepared or granted tags
            if (spellItem.querySelector('.always-prepared-tag') || spellItem.querySelector('.granted-spell-tag')) return;

            checkbox.disabled = false;
            delete checkbox.dataset.tooltip; // Remove the max prepared tooltip
            spellItem?.classList.remove('max-prepared');
          });
        }
      }
    } catch (error) {
      log(1, 'Error updating spell preparation tracking:', error);
    }
  }

  _updateSpellCounts() {
    try {
      const spellLevels = this.element.querySelectorAll('.spell-level');

      spellLevels.forEach((levelContainer) => {
        const levelId = levelContainer.dataset.level;
        const spellItems = levelContainer.querySelectorAll('.spell-item');
        const countDisplay = levelContainer.querySelector('.spell-count');

        // For cantrips (level 0), hide the regular spell count
        if (levelId === '0') {
          if (countDisplay) {
            countDisplay.style.display = 'none';
          }
          return;
        }

        // Count only spells that are not granted or always prepared
        const countableSpells = Array.from(spellItems).filter((item) => !item.querySelector('.granted-spell-tag') && !item.querySelector('.always-prepared-tag'));

        // Count prepared spells among the countable ones
        const preparedCount = countableSpells.filter((item) => item.classList.contains('prepared-spell')).length;
        const totalAvailable = countableSpells.length;

        // Update the count display
        if (countDisplay && totalAvailable > 0) {
          countDisplay.textContent = `(${preparedCount}/${totalAvailable})`;
          countDisplay.style.display = ''; // Ensure it's visible for non-cantrip levels
        } else if (countDisplay) {
          countDisplay.textContent = '';
        }
      });

      log(3, 'Updated spell counts for all levels');
    } catch (error) {
      log(1, 'Error updating spell counts:', error);
    }
  }

  _applyCollapsedLevels() {
    try {
      const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
      log(3, `Applying collapsed states to ${collapsedLevels.length} levels`);

      for (const levelId of collapsedLevels) {
        const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);

        if (levelContainer) {
          levelContainer.classList.add('collapsed');
        }
      }
    } catch (error) {
      log(1, 'Error applying collapsed levels:', error);
    }
  }

  _setupCantripUI() {
    try {
      log(3, 'Setting up cantrip UI');
      const cantripLevel = this.element.querySelector('.spell-level[data-level="0"]');
      if (!cantripLevel) return;

      // Update counters and locks
      this._updateCantripCounter(cantripLevel);
      this._setupCantripLocks();
    } catch (error) {
      log(1, 'Error setting up cantrip UI:', error);
    }
  }

  _updateCantripCounter(cantripLevel) {
    if (!cantripLevel) {
      cantripLevel = this.element.querySelector('.spell-level[data-level="0"]');
    }
    if (!cantripLevel) return;

    try {
      const maxCantrips = this.spellManager.getMaxAllowed();

      // Count prepared cantrips using dnd5e-checkbox elements
      let currentCount = 0;
      const checkedCantrips = [];

      // Get all cantrip spell items
      const cantripItems = cantripLevel.querySelectorAll('.spell-item');
      log(3, `Cantrip counter: found ${cantripItems.length} cantrip items total`);

      // Count manually by examining each item
      cantripItems.forEach((item) => {
        const spellName = item.querySelector('.spell-name .title')?.textContent || 'unknown';

        // Always-prepared or granted spells are already counted by the actor
        if (item.querySelector('.always-prepared-tag') || item.querySelector('.granted-spell-tag')) {
          log(3, `Skipping always-prepared/granted cantrip: ${spellName}`);
          return;
        }

        const checkbox = item.querySelector('dnd5e-checkbox');
        if (checkbox && checkbox.checked) {
          currentCount++;
          checkedCantrips.push(spellName);
          log(3, `Counted checked cantrip: ${spellName}`);
        }
      });

      log(3, `Cantrip counter: total counted=${currentCount}, max=${maxCantrips}`);
      log(3, `Checked cantrips: ${checkedCantrips.join(', ')}`);

      // Store UI count for validation
      this._uiCantripCount = currentCount;

      // Update counter display
      const levelHeading = cantripLevel.querySelector('.spell-level-heading');
      let counterElem = levelHeading.querySelector('.cantrip-counter');

      if (!counterElem) {
        counterElem = document.createElement('span');
        counterElem.className = 'cantrip-counter';
        const spellCount = levelHeading.querySelector('.spell-count');
        if (spellCount) {
          spellCount.after(counterElem);
        } else {
          levelHeading.appendChild(counterElem);
        }
      }

      counterElem.textContent = `[${currentCount}/${maxCantrips}]`;
      counterElem.title = game.i18n.localize('SPELLBOOK.Cantrips.CounterTooltip');
      counterElem.style.display = '';

      if (currentCount >= maxCantrips) {
        counterElem.classList.add('at-max');
      } else {
        counterElem.classList.remove('at-max');
      }

      // Return the current count and max for convenience
      return { current: currentCount, max: maxCantrips };
    } catch (error) {
      log(1, `Error updating cantrip counter: ${error.message}`);
      return { current: 0, max: 0 };
    }
  }

  _setupCantripLocks(currentCount, maxCantrips) {
    try {
      const cantripItems = this.element.querySelectorAll('.spell-item[data-spell-level="0"]');
      if (!cantripItems.length) return;

      // Use passed in values, or get them if not provided
      currentCount = currentCount ?? this._uiCantripCount;
      maxCantrips = maxCantrips ?? this.spellManager.getMaxAllowed();

      // Get settings
      const settings = this.spellManager.getSettings();
      const isModernRules = settings.rules === CANTRIP_RULES.MODERN;
      const isDefaultRules = settings.rules === CANTRIP_RULES.DEFAULT;
      const isLevelUp = this.spellManager.canBeLeveledUp();
      const isAtMax = currentCount >= maxCantrips;

      log(3, `Setting up cantrip locks: ${currentCount}/${maxCantrips}, at max: ${isAtMax}, rules: ${isModernRules ? 'modern' : 'default'}, levelUp: ${isLevelUp}`);
      log(3, `Tracking state: hasUnlearned=${this._cantripTracking.hasUnlearned}, unlearned=${this._cantripTracking.unlearned}`);

      for (const item of cantripItems) {
        // Get the checkbox and check if we should process this item
        const checkbox = item.querySelector('dnd5e-checkbox');
        if (!checkbox || item.querySelector('.always-prepared-tag') || item.querySelector('.granted-spell-tag')) {
          continue; // Skip always prepared or granted spells
        }

        const spellName = item.querySelector('.spell-name .title')?.textContent || 'unknown';
        const isChecked = checkbox.checked;
        const uuid = checkbox.dataset.uuid;
        const isNewlyChecked = this._newlyCheckedCantrips.has(uuid);

        log(3, `Processing lock for cantrip: ${spellName}, checked: ${isChecked}, newly checked: ${isNewlyChecked}`);

        // Clear existing lock state
        checkbox.disabled = false;
        delete checkbox.dataset.tooltip;
        item.classList.remove('cantrip-locked');

        // For DEFAULT rules outside of level-up:
        // Lock only cantrips that were already prepared on the actor, not newly checked ones
        if (isDefaultRules && !isLevelUp && isChecked && !isNewlyChecked) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedDefault');
          item.classList.add('cantrip-locked');
          log(3, `Locking already prepared cantrip with default rules: ${spellName}`);
          continue;
        }

        // For MODERN rules outside of level-up: only lock original checked cantrips
        if (isModernRules && !isLevelUp && isChecked) {
          // Don't lock newly checked cantrips - allow users to change their minds
          const isNewlyChecked = this._newlyCheckedCantrips.has(uuid);
          if (!isNewlyChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedModern');
            item.classList.add('cantrip-locked');
            log(3, `Locking checked cantrip outside level-up with modern rules: ${spellName}`);
            continue;
          } else {
            log(3, `Not locking newly checked cantrip: ${spellName}`);
          }
        }

        // For MODERN rules during level-up, if already swapped, lock everything
        if (isModernRules && isLevelUp && this._cantripTracking.hasUnlearned) {
          const isUnlearnedCantrip = this._cantripTracking.unlearned === uuid;

          // Only allow checking/unchecking the currently unlearned cantrip or learning one new cantrip
          if (!isUnlearnedCantrip && isChecked && this._cantripTracking.hasLearned && this._cantripTracking.learned !== uuid) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
            item.classList.add('cantrip-locked');
            log(3, `Locking checked cantrip, already using swap: ${spellName}`);
            continue;
          }
        }

        // Lock unchecked cantrips if at max
        if (isAtMax && !isChecked) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached');
          item.classList.add('cantrip-locked');
          log(3, `Locking unchecked cantrip at max: ${spellName}`);
        } else {
          log(3, `Cantrip remains unlocked: ${spellName}`);
        }

        // Remove any old lock icons if they exist
        const lockIcon = item.querySelector('.cantrip-lock-icon');
        if (lockIcon) lockIcon.remove();
      }
    } catch (error) {
      log(1, `Error setting up cantrip locks: ${error.message}`);
    }
  }

  _lockAllCantripCheckboxes() {
    try {
      log(3, 'Locking all cantrip checkboxes after swap completion');
      const cantripItems = this.element.querySelectorAll('.spell-item[data-spell-level="0"]');

      for (const item of cantripItems) {
        const checkbox = item.querySelector('dnd5e-checkbox');
        if (!checkbox || checkbox.hasAttribute('data-always-disabled')) continue;

        // Lock everything by setting disabled property and tooltip
        checkbox.disabled = true;
        checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.SwapComplete');
        item.classList.add('cantrip-locked');

        // Remove existing lock icons if present
        const lockIcon = item.querySelector('.cantrip-lock-icon');
        if (lockIcon) lockIcon.remove();
      }
    } catch (error) {
      log(1, 'Error locking cantrip checkboxes:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Filter & Sort Methods                       */
  /* -------------------------------------------- */

  _getFilterState() {
    if (!this.element) {
      return filterUtils.getDefaultFilterState();
    }

    return {
      name: this.element.querySelector('[name="filter-name"]')?.value || '',
      level: this.element.querySelector('[name="filter-level"]')?.value || '',
      school: this.element.querySelector('[name="filter-school"]')?.value || '',
      castingTime: this.element.querySelector('[name="filter-castingTime"]')?.value || '',
      minRange: this.element.querySelector('[name="filter-min-range"]')?.value || '',
      maxRange: this.element.querySelector('[name="filter-max-range"]')?.value || '',
      damageType: this.element.querySelector('[name="filter-damageType"]')?.value || '',
      condition: this.element.querySelector('[name="filter-condition"]')?.value || '',
      requiresSave: this.element.querySelector('[name="filter-requiresSave"]')?.value || '',
      prepared: this.element.querySelector('[name="filter-prepared"]')?.checked || false,
      ritual: this.element.querySelector('[name="filter-ritual"]')?.checked || false,
      concentration: this.element.querySelector('[name="filter-concentration"]')?.value || '',
      sortBy: this.element.querySelector('[name="sort-by"]')?.value || 'level'
    };
  }

  _prepareFilters() {
    try {
      log(3, 'Preparing filters for display');

      // Get the filter configuration
      let filterConfig = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
      if (!Array.isArray(filterConfig) || !filterConfig.length) {
        filterConfig = DEFAULT_FILTER_CONFIG;
      }

      // Get enabled filters in the right order
      const sortedFilters = filterConfig.filter((f) => f.enabled).sort((a, b) => a.order - b.order);

      const filterState = this._getFilterState();

      // Process each filter
      return sortedFilters.map((filter) => {
        const result = {
          id: filter.id,
          type: filter.type,
          name: `filter-${filter.id}`,
          label: game.i18n.localize(filter.label)
        };

        // Create elements based on filter type
        let element;

        // Add type-specific properties
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
            const options = filterUtils.getOptionsForFilter(filter.id, filterState, this.spellLevels);
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
            // For range filters, create a container with two inputs
            const container = document.createElement('div');
            container.className = 'range-inputs';
            container.setAttribute('role', 'group');
            container.setAttribute('aria-labelledby', `${filter.id}-label`);

            // Min input
            const minInput = formElements.createNumberInput({
              name: `filter-min-range`,
              value: filterState.minRange || '',
              placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMin'),
              ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMinLabel')
            });

            // Separator
            const separator = document.createElement('div');
            separator.className = 'range-separator';
            separator.setAttribute('aria-hidden', 'true');
            separator.innerHTML = '<dnd5e-icon src="systems/dnd5e/icons/svg/range-connector.svg"></dnd5e-icon>';

            // Max input
            const maxInput = formElements.createNumberInput({
              name: `filter-max-range`,
              value: filterState.maxRange || '',
              placeholder: game.i18n.localize('SPELLBOOK.Filters.RangeMax'),
              ariaLabel: game.i18n.localize('SPELLBOOK.Filters.RangeMaxLabel')
            });

            container.appendChild(minInput);
            container.appendChild(separator);
            container.appendChild(maxInput);

            element = container;
            result.unit = game.settings.get(MODULE.ID, SETTINGS.DISTANCE_UNIT);
            break;
        }

        // Convert element to HTML string
        result.elementHtml = formElements.elementToHtml(element);

        return result;
      });
    } catch (error) {
      log(1, 'Error preparing filters:', error);
      return [];
    }
  }

  _applyFilters() {
    try {
      const filters = this._getFilterState();
      log(3, 'Applying filters to spell list');

      const spellItems = this.element.querySelectorAll('.spell-item');
      let visibleCount = 0;

      // Track visible spells per level
      const levelVisibilityMap = new Map();

      for (const item of spellItems) {
        // Get basic spell metadata
        const nameEl = item.querySelector('.spell-name');
        const name = nameEl?.textContent.toLowerCase() || '';
        const isPrepared = item.classList.contains('prepared-spell');
        const level = item.dataset.spellLevel || '';
        const school = item.dataset.spellSchool || '';

        // Get filter data from dataset
        const castingTimeType = item.dataset.castingTimeType || '';
        const castingTimeValue = item.dataset.castingTimeValue || '';
        const rangeUnits = item.dataset.rangeUnits || '';
        const damageTypes = (item.dataset.damageTypes || '').split(',');
        const isRitual = item.dataset.ritual === 'true';
        const isConcentration = item.dataset.concentration === 'true';
        const requiresSave = item.dataset.requiresSave === 'true';
        const conditions = (item.dataset.conditions || '').split(',');

        // Special preparation statuses
        const isGranted = !!item.querySelector('.granted-spell-tag');
        const isAlwaysPrepared = !!item.querySelector('.always-prepared-tag');
        const isCountable = !isGranted && !isAlwaysPrepared;

        // Apply each filter as a separate condition
        const visible = this._checkSpellVisibility(filters, {
          name,
          isPrepared,
          level,
          school,
          castingTimeType,
          castingTimeValue,
          rangeUnits,
          rangeValue: item.dataset.rangeValue || '0',
          damageTypes,
          isRitual,
          isConcentration,
          requiresSave,
          conditions
        });

        // Update visibility
        item.style.display = visible ? '' : 'none';

        if (visible) {
          visibleCount++;

          // Update level visibility tracker
          if (!levelVisibilityMap.has(level)) {
            levelVisibilityMap.set(level, {
              visible: 0,
              prepared: 0,
              countable: 0,
              countablePrepared: 0
            });
          }

          const levelStats = levelVisibilityMap.get(level);
          levelStats.visible++;

          if (isCountable) {
            levelStats.countable++;
            if (isPrepared) levelStats.countablePrepared++;
          }

          if (isPrepared) levelStats.prepared++;
        }
      }

      // Show/hide no results message
      const noResults = this.element.querySelector('.no-filter-results');
      if (noResults) {
        noResults.style.display = visibleCount > 0 ? 'none' : 'block';
      }

      // Update level container visibility and counts
      this._updateLevelContainers(levelVisibilityMap);

      log(3, `Filter applied: ${visibleCount} spells visible`);
    } catch (error) {
      log(1, 'Error applying filters:', error);
    }
  }

  _checkSpellVisibility(filters, spell) {
    // Text search
    if (filters.name && !spell.name.includes(filters.name.toLowerCase())) {
      return false;
    }

    // Level filter
    if (filters.level && spell.level !== filters.level) {
      return false;
    }

    // School filter
    if (filters.school && spell.school !== filters.school) {
      return false;
    }

    // Casting Time filter
    if (filters.castingTime) {
      const [filterType, filterValue] = filters.castingTime.split(':');
      const itemType = spell.castingTimeType;
      const itemValue = spell.castingTimeValue === '' || spell.castingTimeValue === null ? '1' : spell.castingTimeValue;

      if (itemType !== filterType || itemValue !== filterValue) {
        return false;
      }
    }

    // Range filter
    if ((filters.minRange || filters.maxRange) && spell.rangeUnits) {
      const rangeValue = parseInt(spell.rangeValue, 10);
      const convertedRange = filterUtils.convertRangeToStandardUnit(spell.rangeUnits, rangeValue);

      const minRange = filters.minRange ? parseInt(filters.minRange, 10) : 0;
      const maxRange = filters.maxRange ? parseInt(filters.maxRange, 10) : Infinity;

      if (convertedRange < minRange || convertedRange > maxRange) {
        return false;
      }
    }

    // Damage Type filter
    if (filters.damageType && !spell.damageTypes.includes(filters.damageType)) {
      return false;
    }

    // Condition filter
    if (filters.condition && !spell.conditions.includes(filters.condition)) {
      return false;
    }

    // Requires Save filter
    if (filters.requiresSave) {
      if (filters.requiresSave === 'true' && !spell.requiresSave) {
        return false;
      } else if (filters.requiresSave === 'false' && spell.requiresSave) {
        return false;
      }
    }

    // Prepared only
    if (filters.prepared && !spell.isPrepared) {
      return false;
    }

    // Ritual only
    if (filters.ritual && !spell.isRitual) {
      return false;
    }

    // Concentration filter
    if (filters.concentration) {
      if (filters.concentration === 'true' && !spell.isConcentration) {
        return false;
      } else if (filters.concentration === 'false' && spell.isConcentration) {
        return false;
      }
    }

    return true;
  }

  _sortSpells(spells, sortBy) {
    return [...spells].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);

        case 'school':
          const schoolA = a.system.school || '';
          const schoolB = b.system.school || '';
          return schoolA.localeCompare(schoolB) || a.name.localeCompare(b.name);

        case 'prepared':
          // Sort prepared spells first, then by name
          const prepA = a.preparation.prepared ? 0 : 1;
          const prepB = b.preparation.prepared ? 0 : 1;
          return prepA - prepB || a.name.localeCompare(b.name);

        case 'level':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }

  _applySorting(sortBy) {
    try {
      log(3, `Applying sorting: ${sortBy}`);
      const levelContainers = this.element.querySelectorAll('.spell-level');

      for (const levelContainer of levelContainers) {
        const list = levelContainer.querySelector('.spell-list');
        if (!list) continue;

        const items = Array.from(list.children);

        items.sort((a, b) => {
          switch (sortBy) {
            case 'name':
              return a.querySelector('.spell-name').textContent.localeCompare(b.querySelector('.spell-name').textContent);

            case 'school':
              const schoolA = a.dataset.spellSchool || '';
              const schoolB = b.dataset.spellSchool || '';
              return schoolA.localeCompare(schoolB) || a.querySelector('.spell-name').textContent.localeCompare(b.querySelector('.spell-name').textContent);

            case 'prepared':
              const aPrepared = a.classList.contains('prepared-spell') ? 0 : 1;
              const bPrepared = b.classList.contains('prepared-spell') ? 0 : 1;
              return aPrepared - bPrepared || a.querySelector('.spell-name').textContent.localeCompare(b.querySelector('.spell-name').textContent);

            default:
              return 0; // Keep current order
          }
        });

        // Re-append sorted items
        for (const item of items) {
          list.appendChild(item);
        }
      }
    } catch (error) {
      log(1, 'Error applying sorting:', error);
    }
  }

  _updateLevelContainers(levelVisibilityMap) {
    try {
      const levelContainers = this.element.querySelectorAll('.spell-level');

      for (const container of levelContainers) {
        const levelId = container.dataset.level;
        const levelStats = levelVisibilityMap.get(levelId) || {
          visible: 0,
          prepared: 0,
          countable: 0,
          countablePrepared: 0
        };

        // Update visibility
        container.style.display = levelStats.visible > 0 ? '' : 'none';

        // Update count display
        const countDisplay = container.querySelector('.spell-count');
        if (countDisplay && levelStats.countable > 0) {
          countDisplay.textContent = `(${levelStats.countablePrepared}/${levelStats.countable})`;
        } else if (countDisplay) {
          countDisplay.textContent = '';
        }
      }
    } catch (error) {
      log(1, 'Error updating level containers:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

  static toggleSidebar(event, _form) {
    try {
      log(3, 'Toggling sidebar');
      const isCollapsing = !this.element.classList.contains('sidebar-collapsed');
      this.element.classList.toggle('sidebar-collapsed');

      // Rotate the caret icon
      const caretIcon = event.currentTarget.querySelector('i');
      if (caretIcon) {
        caretIcon.style.transform = isCollapsing ? 'rotate(180deg)' : 'rotate(0)';
      }

      // Reposition footer
      this._positionFooter();

      // Store user preference
      game.user.setFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED, isCollapsing);
    } catch (error) {
      log(1, 'Error toggling sidebar:', error);
    }
  }

  static filterSpells(_event, _form) {
    try {
      log(3, 'Filtering spells');
      this._applyFilters();
    } catch (error) {
      log(1, 'Error filtering spells:', error);
    }
  }

  static sortSpells(event, _form) {
    try {
      log(3, 'Sorting spells');
      const sortBy = event.target.value;
      this._applySorting(sortBy);
    } catch (error) {
      log(1, 'Error sorting spells:', error);
    }
  }

  static handleReset(event, form) {
    try {
      log(3, 'Handling form reset');

      // Check if shift key is pressed for alternative reset
      const isShiftReset = event.shiftKey;

      if (isShiftReset) {
        // Alternative reset: uncheck all boxes
        log(3, 'Performing alternative reset (uncheck all)');

        // Uncheck all non-disabled preparation checkboxes
        const checkboxes = this.element.querySelectorAll('dnd5e-checkbox[data-uuid]:not([disabled])');
        checkboxes.forEach((checkbox) => {
          checkbox.checked = false;
        });

        // Reset filters to default state
        const filters = this.element.querySelectorAll('.spell-filters input, .spell-filters select');
        filters.forEach((filter) => {
          if (filter.type === 'checkbox') {
            filter.checked = false;
          } else if (filter.type === 'text' || filter.type === 'number') {
            filter.value = '';
          } else if (filter.tagName === 'SELECT') {
            filter.selectedIndex = 0;
          }
        });

        // Update UI classes
        const spellItems = this.element.querySelectorAll('.spell-item');
        spellItems.forEach((item) => {
          // Only remove the class from non-disabled items
          const checkbox = item.querySelector('dnd5e-checkbox');
          if (checkbox && !checkbox.disabled) {
            item.classList.remove('prepared-spell');
          }
        });

        // Uncollapse all spell levels
        const collapsedLevels = this.element.querySelectorAll('.spell-level.collapsed');
        collapsedLevels.forEach((level) => {
          level.classList.remove('collapsed');

          // Update the aria-expanded attribute
          const heading = level.querySelector('.spell-level-heading');
          if (heading) {
            heading.setAttribute('aria-expanded', 'true');
          }
        });

        // Clear the collapsed levels in user flags
        game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS, []);

        // Reapply filters and update tracking
        this._applyFilters();
        this._updateSpellPreparationTracking();
        this._updateCantripCounter();

        // Prevent default reset behavior
        event.preventDefault();
      } else {
        // Original reset behavior
        // Give the browser time to reset form elements
        setTimeout(() => {
          // Update spell items to match checkbox state
          const spellItems = this.element.querySelectorAll('.spell-item');
          spellItems.forEach((item) => {
            const checkbox = item.querySelector('dnd5e-checkbox');
            if (checkbox && !checkbox.checked) {
              item.classList.remove('prepared-spell');
            }
          });

          // Uncollapse all spell levels
          const collapsedLevels = this.element.querySelectorAll('.spell-level.collapsed');
          collapsedLevels.forEach((level) => {
            level.classList.remove('collapsed');

            // Update the aria-expanded attribute
            const heading = level.querySelector('.spell-level-heading');
            if (heading) {
              heading.setAttribute('aria-expanded', 'true');
            }
          });

          // Clear the collapsed levels in user flags
          game.user.setFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS, []);

          // Reapply filters and update tracking
          this._applyFilters();
          this._updateSpellPreparationTracking();
          this._updateCantripCounter();
        }, 0);
      }
    } catch (error) {
      log(1, 'Error handling reset:', error);
    }
  }

  static toggleSpellLevel(_event, form) {
    try {
      const levelContainer = form.parentElement;
      if (!levelContainer || !levelContainer.classList.contains('spell-level')) {
        return;
      }

      const levelId = levelContainer.dataset.level;
      log(3, `Toggling spell level: ${levelId}`);

      // Toggle collapsed state
      levelContainer.classList.toggle('collapsed');

      // Save state to user flags
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
      log(3, 'Opening filter configuration');
      const filterConfig = new PlayerFilterConfiguration(this);
      filterConfig.render(true);
    } catch (error) {
      log(1, 'Error configuring filters:', error);
    }
  }

  static configureCantripSettings(_event, _form) {
    try {
      log(3, 'Opening cantrip settings configuration');
      const dialog = new CantripSettingsDialog(this.actor);
      dialog.render(true);
    } catch (error) {
      log(1, 'Error configuring cantrip settings:', error);
    }
  }

  static async formHandler(_event, form, formData) {
    try {
      log(3, 'Processing form submission');
      const actor = this.actor;
      if (!actor) {
        log(3, 'No actor found');
        return null;
      }

      // Create a comprehensive spellData object for ALL checkboxes
      const spellData = {};
      const checkboxes = form.querySelectorAll('dnd5e-checkbox[data-uuid]');

      for (const checkbox of checkboxes) {
        const uuid = checkbox.dataset.uuid;
        const name = checkbox.dataset.name;
        const wasPrepared = checkbox.dataset.wasPrepared === 'true';
        const isPrepared = checkbox.checked;

        // Check if this is an always-prepared spell by examining the parent spell item
        const spellItem = checkbox.closest('.spell-item');
        const isAlwaysPreparedElement = spellItem && (spellItem.querySelector('.always-prepared-tag') || spellItem.querySelector('.granted-spell-tag'));

        // If it's an always-prepared spell or granted spell, don't include it in the updates
        if (isAlwaysPreparedElement) {
          log(3, `Skipping always-prepared or granted spell: ${name}`);
          continue;
        }

        log(3, `Spell ${name} (${uuid}): was ${wasPrepared ? 'prepared' : 'not prepared'}, now ${isPrepared ? 'prepared' : 'not prepared'}`);

        // Add the spell to our update data - note this is NOT always-prepared
        spellData[uuid] = {
          name,
          wasPrepared,
          isPrepared,
          isAlwaysPrepared: false
        };
      }

      // Use SpellManager to save prepared spells
      await this.spellManager.saveActorPreparedSpells(spellData);

      // Check if we need to finalize a cantrip level-up
      if (this.spellManager.canBeLeveledUp()) {
        await this.spellManager.completeCantripsLevelUp();
        log(3, 'Finalized cantrip level-up selection');
      }

      // Use SpellManager to save prepared spells
      await this.spellManager.saveActorPreparedSpells(spellData);

      // Clear tracking of newly checked cantrips
      this._newlyCheckedCantrips.clear();

      // Re-render character sheet if open
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
