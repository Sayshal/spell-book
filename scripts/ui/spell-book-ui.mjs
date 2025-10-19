/**
 * Spell Book User Interface Management System
 *
 * This module provides UI management for the Spell Book application,
 * handling interface state, user interactions, dynamic content updates, and visual
 * enhancements. It serves as the central coordinator for all UI-related functionality
 * including layout management, search integration, and spell interaction controls.
 *
 * The UI system manages multiple interconnected aspects:
 * - Sidebar and footer layout with responsive positioning
 * - Advanced search integration and collapsed state handling
 * - Spell preparation tracking with per-class enforcement
 * - Cantrip selection with rule-based restrictions
 * - Spell locking based on class rules and limits
 * - Dynamic count displays and visual feedback
 * - Class-specific styling and color theming
 *
 * Key features include:
 * - Real-time spell preparation limit enforcement
 * - Granular per-class spell preparation tracking
 * - Advanced search manager integration
 * - Rule-based cantrip swapping with multiple modes
 * - Dynamic UI state persistence via user flags
 * - Responsive layout management for different view states
 * - Visual feedback for preparation limits and restrictions
 * - Integration with spell management and validation systems
 *
 * The system ensures consistent user experience while enforcing D&D 5e spellcasting
 * rules and providing enhanced functionality for spell management workflows.
 *
 * @module UIHelpers/SpellBookUI
 * @author Tyler
 */

import { FLAGS, MODULE } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from '../managers/_module.mjs';
import * as UIHelpers from './_module.mjs';

/**
 * Spell preparation display data for footer tracking.
 *
 * @typedef {Object} PreparationDisplayData
 * @property {number} current - Current number of prepared spells
 * @property {number} maximum - Maximum number of spells that can be prepared
 * @property {boolean} atMax - Whether the preparation limit has been reached
 */

/**
 * Cantrip counter state information.
 *
 * @typedef {Object} CantripCounterState
 * @property {number} current - Current number of selected cantrips
 * @property {number} max - Maximum number of cantrips allowed
 */

/**
 * Class-specific spell preparation tracking data.
 *
 * @typedef {Object} ClassPreparationData
 * @property {number} current - Current prepared spells for this class
 * @property {number} maximum - Maximum spells allowed for this class
 * @property {string} className - Display name of the spellcasting class
 */

/**
 * Spell lock validation result for rule enforcement.
 *
 * @typedef {Object} SpellLockResult
 * @property {boolean} allowed - Whether the spell state change is permitted
 * @property {string} [message] - Localization key for restriction message
 * @property {string} [reason] - Internal reason code for the restriction
 */

/**
 * Collapsed footer search configuration.
 *
 * @typedef {Object} CollapsedSearchConfig
 * @property {HTMLElement} searchInput - The search input element
 * @property {HTMLElement} [clearButton] - Optional clear button element
 * @property {boolean} syncWithSidebar - Whether to sync with sidebar search
 */

/**
 * Collection statistics for items with enabled/checked states.
 *
 * @typedef {Object} CollectionStats
 * @property {number} enabledCount - Number of enabled/checked items
 * @property {number} totalCount - Total number of items
 * @property {number} disabledCount - Number of disabled items
 * @property {boolean} allEnabled - Whether all items are enabled
 * @property {boolean} allDisabled - Whether all items are disabled
 * @property {boolean} noneEnabled - Whether no items are enabled
 * @property {number} percentage - Percentage of items enabled (0-100)
 */

/**
 * Configuration options for positioning calculations.
 *
 * @typedef {Object} PositioningConfig
 * @property {HTMLElement} triggerElement - The element that triggered the positioning
 * @property {number} dialogWidth - Width of the dialog/tooltip to position
 * @property {number} [dialogHeight] - Height of the dialog/tooltip (for vertical centering)
 * @property {number} [minMargin=20] - Minimum margin from viewport edges in pixels
 * @property {number} [minTop=50] - Minimum top position in pixels
 * @property {number} [maxBottomOffset=100] - Maximum offset from bottom edge in pixels
 * @property {number} [offset=10] - Offset from trigger element in pixels
 * @property {string} [preferredSide='right'] - Preferred side to position ('right', 'left', 'center')
 */

/**
 * Helper class for UI-related functionality in the Spell Book application.
 */
export class SpellBookUI {
  /**
   * Create a new UI helper.
   * @param {SpellBook} app - The parent application instance
   */
  constructor(app) {
    /** @type {SpellBook} - The parent spell book application */
    this.app = app;

    /** @type {number} - Counter to track color application lifecycle */
    this._colorApplicationCount = 0;

    /** @type {UIHelpers.SearchEngine} - Advanced search functionality manager */
    this.search = new UIHelpers.SearchEngine(app);

    /** @type {boolean} - Flag to track cantrip UI initialization state */
    this._cantripUIInitialized = false;
  }

  /**
   * Get the application's element.
   * @returns {HTMLElement|null} The application element or null if not available
   */
  get element() {
    return this.app.element;
  }

  /**
   * Set sidebar expanded/collapsed state from user flags.
   * @returns {void}
   */
  setSidebarState() {
    const sidebarCollapsed = game.user.getFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED);
    if (sidebarCollapsed) this.element.classList.add('sidebar-collapsed');
  }

  /**
   * Position the footer based on sidebar state.
   * @returns {void}
   */
  positionFooter() {
    const footer = this.element.querySelector('footer');
    if (!footer) return;
    const isSidebarCollapsed = this.element.classList.contains('sidebar-collapsed');
    const sidebarFooterContainer = this.element.querySelector('.sidebar-footer-container');
    const collapsedFooter = this.element.querySelector('.collapsed-footer');
    const collapsedFooterSearch = this.element.querySelector('.collapsed-footer-search');
    const sidebarSearchFilter = this.element.querySelector('.sidebar .filter-item.filter-search[data-filter-id="name"]');
    if (isSidebarCollapsed && collapsedFooter) {
      collapsedFooter.appendChild(footer);
      collapsedFooter.classList.remove('hidden');
      if (sidebarFooterContainer) sidebarFooterContainer.classList.add('hidden');
      if (sidebarSearchFilter && collapsedFooterSearch) {
        if (!collapsedFooterSearch.querySelector('.filter-item.filter-search')) {
          const searchClone = sidebarSearchFilter.cloneNode(true);
          collapsedFooterSearch.appendChild(searchClone);
          this.setupCollapsedFooterSearch(searchClone);
        }
      }
    } else {
      if (sidebarFooterContainer) {
        sidebarFooterContainer.appendChild(footer);
        sidebarFooterContainer.classList.remove('hidden');
      }
      if (collapsedFooter) collapsedFooter.classList.add('hidden');
      if (collapsedFooterSearch) collapsedFooterSearch.innerHTML = '';
    }
    if (this.search) this.search.updateDropdownPositioning();
  }

  /**
   * Setup search functionality for collapsed footer search.
   * @param {HTMLElement} searchElement - The cloned search element
   * @returns {void}
   */
  setupCollapsedFooterSearch(searchElement) {
    const searchInput = searchElement.querySelector('.advanced-search-input');
    const clearButton = searchElement.querySelector('.search-input-clear');
    if (searchInput) {
      const originalInput = this.element.querySelector('.sidebar .advanced-search-input');
      if (originalInput) searchInput.value = originalInput.value;
      searchInput.addEventListener('input', (event) => {
        if (originalInput) {
          originalInput.value = event.target.value;
          originalInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      if (this.search) this.search.setupCollapsedFooterSearch(searchInput);
    }
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }
  }

  /**
   * Set up filter change listeners.
   * @returns {void}
   */
  setupFilterListeners() {
    const filterInputs = this.element.querySelectorAll('.spell-filters input, .spell-filters select');
    filterInputs.forEach((input) => {
      const eventType = input.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(eventType, () => {
        this.app.filterHelper.invalidateFilterCache();
        this.app._applyFilters();
      });
    });
  }

  /**
   * Enhanced spell preparation tracking that enforces per-class limits.
   * @returns {void}
   */
  updateSpellPreparationTracking() {
    if (!this.element) return;
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    if (!activeTab) return;
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent) return;
    const classIdentifier = activeTabContent.dataset.classIdentifier;
    if (!classIdentifier) return;
    const classData = this.app._state.classSpellData[classIdentifier];
    if (!classData) return;
    const classRules = RuleSet.getClassRules(this.app.actor, classIdentifier);
    let baseMaxPrepared = 0;
    const spellcastingConfig = DataHelpers.getSpellcastingConfigForClass(this.app.actor, classIdentifier);
    if (spellcastingConfig?.preparation?.max) baseMaxPrepared = spellcastingConfig.preparation.max;
    else baseMaxPrepared = classData.classItem?.system?.spellcasting?.preparation?.max || 0;
    const preparationBonus = classRules?.spellPreparationBonus || 0;
    const classMaxPrepared = baseMaxPrepared + preparationBonus;
    let classPreparedCount = 0;
    const allCheckboxes = activeTabContent.querySelectorAll('dnd5e-checkbox[data-uuid]');
    allCheckboxes.forEach((checkbox) => {
      const spellItem = checkbox.closest('.spell-item');
      if (!spellItem) return;
      const spellLevel = spellItem.dataset.spellLevel;
      const spellSourceClass = checkbox.dataset.sourceClass;
      if (spellLevel === '0' || (spellSourceClass && spellSourceClass !== classIdentifier)) return;
      if (spellItem.querySelector('.tag.always-prepared')) return;
      if (spellItem.querySelector('.tag.granted')) return;
      if (spellItem.querySelector('.tag.innate')) return;
      if (spellItem.querySelector('.tag.atwill')) return;
      if (checkbox.checked) classPreparedCount++;
    });
    classData.spellPreparation.current = classPreparedCount;
    classData.spellPreparation.maximum = classMaxPrepared;
    const isClassAtMax = classPreparedCount >= classMaxPrepared;
    const settings = this.app.spellManager.getSettings(classIdentifier);
    if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) this._enforcePerClassSpellLimits(activeTabContent, classIdentifier, isClassAtMax);
    this.app._state.updateGlobalPreparationCount();
    const globalPrepared = this.app._state.spellPreparation;
    this._updateFooterPreparationDisplay(classIdentifier, isClassAtMax, globalPrepared);
  }

  /**
   * Update the footer preparation display with granular at-max styling.
   * @param {string} activeClassIdentifier - The currently active class identifier
   * @param {boolean} isActiveClassAtMax - Whether the active class is at maximum
   * @param {PreparationDisplayData} globalPrepared - Global preparation counts
   * @returns {void}
   * @private
   */
  _updateFooterPreparationDisplay(activeClassIdentifier, isActiveClassAtMax, globalPrepared) {
    const prepTrackingContainer = this.element.querySelector('.spell-prep-tracking');
    if (!prepTrackingContainer) return;
    const globalCurrentEl = prepTrackingContainer.querySelector('.global-current-count');
    if (globalCurrentEl) globalCurrentEl.textContent = globalPrepared.current;
    const isGloballyAtMax = globalPrepared.current >= globalPrepared.maximum;
    const globalPrepCount = prepTrackingContainer.querySelector('.global-prep-count');
    if (globalPrepCount) globalPrepCount.classList.toggle('at-max', isGloballyAtMax);
    const classPreps = prepTrackingContainer.querySelectorAll('.class-prep-count');
    classPreps.forEach((classPrepEl) => {
      const classId = classPrepEl.dataset.classIdentifier;
      if (!classId) return;
      const classSpellData = this.app._state.classSpellData[classId];
      const isThisClassAtMax = classSpellData ? classSpellData.spellPreparation.current >= classSpellData.spellPreparation.maximum : false;
      classPrepEl.classList.toggle('at-max', isThisClassAtMax);
      const classCurrentEl = classPrepEl.querySelector('.class-current');
      if (classCurrentEl && classSpellData) classCurrentEl.textContent = classSpellData.spellPreparation.current;
    });
    this.element.classList.toggle('at-max-spells', isGloballyAtMax);
    log(3, `Updated footer: active class ${activeClassIdentifier} at max: ${isActiveClassAtMax}, global at max: ${isGloballyAtMax}`);
  }

  /**
   * Enforce per-class spell limits for non-cantrip spells.
   * @param {HTMLElement} tabContent - The active tab content element
   * @param {string} classIdentifier - The class identifier
   * @param {boolean} isClassAtMax - Whether this class is at its spell limit
   * @returns {void}
   * @private
   */
  _enforcePerClassSpellLimits(tabContent, classIdentifier, isClassAtMax) {
    const spellCheckboxes = tabContent.querySelectorAll('dnd5e-checkbox[data-uuid]');
    const classData = this.app._state.classSpellData[classIdentifier];
    spellCheckboxes.forEach((checkbox) => {
      const spellItem = checkbox.closest('.spell-item');
      if (!spellItem) return;
      const spellLevel = spellItem.dataset.spellLevel;
      const spellSourceClass = checkbox.dataset.sourceClass;
      if (spellLevel === '0' || (spellSourceClass && spellSourceClass !== classIdentifier)) return;
      if (spellItem.querySelector('.tag.always-prepared') || spellItem.querySelector('.tag.granted') || spellItem.querySelector('.tag.innate') || spellItem.querySelector('.tag.atwill')) return;
      if (isClassAtMax && !checkbox.checked) {
        checkbox.disabled = true;
        checkbox.dataset.tooltip = game.i18n.format('SPELLBOOK.Preparation.ClassAtMaximum', { class: classData?.className || classIdentifier });
        spellItem.classList.add('spell-locked', 'max-prepared');
      } else {
        if (!spellItem.classList.contains('spell-locked')) {
          checkbox.disabled = false;
          delete checkbox.dataset.tooltip;
        }
        spellItem.classList.remove('max-prepared');
      }
    });
    log(3, `Applied per-class spell limits for ${classIdentifier}, at max: ${isClassAtMax}`);
  }

  /**
   * Update spell counts in level headings.
   * @returns {void}
   */
  updateSpellCounts() {
    if (!this.element) return;
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    if (!activeTab) return;
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent) return;
    if (activeTab === 'wizardbook') {
      const countDisplays = activeTabContent.querySelectorAll('.spell-count');
      countDisplays.forEach((countDisplay) => countDisplay.remove());
      return;
    }
    const spellLevels = activeTabContent.querySelectorAll('.spell-level');
    spellLevels.forEach((levelContainer) => {
      const levelId = levelContainer.dataset.level;
      if (levelId === '0') {
        const countDisplay = levelContainer.querySelector('.spell-count');
        if (countDisplay) {
          countDisplay.remove();
          return;
        }
      }
      const spellItems = levelContainer.querySelectorAll('.spell-item');
      const countableSpells = [];
      const preparedSpells = [];
      spellItems.forEach((item) => {
        const hasAlwaysPrepared = !!item.querySelector('.tag.always-prepared');
        const hasGranted = !!item.querySelector('.tag.granted');
        const hasInnate = !!item.querySelector('.tag.innate');
        const hasAtWill = !!item.querySelector('.tag.atwill');
        const isPrepared = item.classList.contains('prepared-spell');
        if (!hasAlwaysPrepared && !hasGranted && !hasInnate && !hasAtWill) {
          countableSpells.push(item);
          if (isPrepared) preparedSpells.push(item);
        }
      });
      const preparedCount = preparedSpells.length;
      const totalAvailable = countableSpells.length;
      const countDisplay = levelContainer.querySelector('.spell-count');
      if (countDisplay) {
        countDisplay.textContent = totalAvailable > 0 ? `(${preparedCount}/${totalAvailable})` : '';
      } else if (totalAvailable > 0) {
        const levelHeading = levelContainer.querySelector('.spell-level-heading');
        if (levelHeading) {
          const newCount = document.createElement('span');
          newCount.className = 'spell-count';
          newCount.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.SpellCount'));
          newCount.textContent = `(${preparedCount}/${totalAvailable})`;
          const cantripCounter = levelHeading.querySelector('.cantrip-counter');
          if (cantripCounter) levelHeading.insertBefore(newCount, cantripCounter);
          else levelHeading.appendChild(newCount);
        }
      }
    });
  }

  /**
   * Apply collapsed state to spell levels from user flags.
   * @returns {void}
   */
  applyCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) levelContainer.classList.add('collapsed');
    }
  }

  /**
   * Set up cantrip-specific UI elements.
   * @returns {void}
   */
  setupCantripUI() {
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent) return;
    const cantripLevel = activeTabContent.querySelector('.spell-level[data-level="0"]');
    if (cantripLevel) {
      this.setupCantripLocks(true);
      if (this.app.wizardManager?.isWizard && this.app._isLongRest) {
        const classRules = RuleSet.getClassRules(this.app.actor, 'wizard');
        const cantripSwappingMode = classRules.cantripSwapping || 'none';
        const existingInfo = cantripLevel.querySelector('.wizard-rules-info');
        if (existingInfo) existingInfo.remove();
        const infoElement = document.createElement('div');
        infoElement.className = 'wizard-rules-info';
        const ruleKey = cantripSwappingMode === 'longRest' ? 'SPELLBOOK.Wizard.ModernCantripRules' : 'SPELLBOOK.Wizard.LegacyCantripRules';
        infoElement.innerHTML = `<i class="fas fa-info-circle"></i> ${game.i18n.localize(ruleKey)}`;
        const levelHeading = cantripLevel.querySelector('.spell-level-heading');
        if (levelHeading) levelHeading.appendChild(infoElement);
      }
    }
    if (!this._cantripUIInitialized) {
      this.setupSpellLocks();
      this._cantripUIInitialized = true;
    }
  }

  /**
   * Setup advanced search functionality.
   * @returns {void}
   */
  setupAdvancedSearch() {
    if (this.search && this.search.isInitialized) return;
    this.search.initialize();
    log(3, 'Advanced search initialized successfully');
  }

  /**
   * Update cantrip counter display using cached max values.
   * @param {HTMLElement} [cantripLevel] - The cantrip level container
   * @param {boolean} [skipLockSetup=false] - Whether to skip calling setupCantripLocks
   * @returns {CantripCounterState} Counter state with current and max values
   */
  updateCantripCounter(cantripLevel, skipLockSetup = false) {
    if (!this.element) return { current: 0, max: 0 };
    if (!cantripLevel) {
      const activeTab = this.app.tabGroups['spellbook-tabs'];
      if (!activeTab) return { current: 0, max: 0 };
      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      if (!activeTabContent) return { current: 0, max: 0 };
      cantripLevel = activeTabContent.querySelector('.spell-level[data-level="0"]');
      if (!cantripLevel) return { current: 0, max: 0 };
    }
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier;
    if (!classIdentifier) return { current: 0, max: 0 };
    const maxCantrips = this.app.spellManager.cantripManager._getMaxCantripsForClass(classIdentifier);
    let currentCount = 0;
    const cantripItems = cantripLevel.querySelectorAll('.spell-item');
    cantripItems.forEach((item) => {
      if (item.querySelector('.tag.always-prepared') || item.querySelector('.tag.atwill') || item.querySelector('.tag.innate') || item.querySelector('.tag.granted')) return;
      const checkbox = item.querySelector('dnd5e-checkbox');
      if (!checkbox) return;
      const spellSourceClass = checkbox.dataset.sourceClass;
      if (spellSourceClass && spellSourceClass !== classIdentifier) return;
      if (checkbox.checked) currentCount++;
    });
    this.app._uiCantripCount = currentCount;
    const levelHeading = cantripLevel.querySelector('.spell-level-heading');
    if (!levelHeading) return { current: currentCount, max: maxCantrips };
    let counterElem = levelHeading.querySelector('.cantrip-counter');
    if (!counterElem) {
      counterElem = document.createElement('span');
      counterElem.className = 'cantrip-counter';
      const spellCount = levelHeading.querySelector('.spell-count');
      if (spellCount) spellCount.after(counterElem);
      else levelHeading.appendChild(counterElem);
    }
    const newContent = `[${currentCount}/${maxCantrips}]`;
    counterElem.textContent = newContent;
    counterElem.title = game.i18n.localize('SPELLBOOK.Cantrips.CounterTooltip');
    counterElem.style.display = '';
    counterElem.classList.toggle('at-max', currentCount >= maxCantrips);
    if (!skipLockSetup) this.setupCantripLocks();
    return { current: currentCount, max: maxCantrips };
  }

  /**
   * Set up cantrip lock states based on selection rules using cached max values.
   * @param {boolean} [applyRuleLocks=false] - Whether to apply rule-based locks (vs count-only)
   * @returns {void}
   */
  setupCantripLocks(applyRuleLocks = false) {
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    if (!activeTab) return;
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent) return;
    const classIdentifier = activeTabContent?.dataset.classIdentifier;
    if (!classIdentifier) return;
    const cantripItems = activeTabContent.querySelectorAll('.spell-item[data-spell-level="0"]');
    if (!cantripItems.length) return;
    const settings = this.app.spellManager.getSettings(classIdentifier);
    let currentCount = 0;
    let maxCantrips = 0;
    const cantripCounter = this.updateCantripCounter(null, true);
    currentCount = cantripCounter ? cantripCounter.current : 0;
    maxCantrips = cantripCounter ? cantripCounter.max : 0;
    for (const item of cantripItems) {
      const checkbox = item.querySelector('dnd5e-checkbox');
      if (!checkbox) continue;
      const spellSourceClass = checkbox.dataset.sourceClass;
      if (spellSourceClass && spellSourceClass !== classIdentifier) continue;
      const isAlwaysPrepared = item.querySelector('.tag.always-prepared');
      const isGranted = item.querySelector('.tag.granted');
      const isInnate = item.querySelector('.tag.innate');
      const isAtWill = item.querySelector('.tag.atwill');
      if (isAlwaysPrepared || isGranted || isInnate || isAtWill) continue;
      const isChecked = checkbox.checked;
      checkbox.disabled = false;
      delete checkbox.dataset.tooltip;
      item.classList.remove('cantrip-locked');
      if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) {
        if (currentCount >= maxCantrips && !isChecked) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached');
          item.classList.add('cantrip-locked');
          continue;
        }
        if (applyRuleLocks) this._applyRuleBasedCantripLocks(item, checkbox, classIdentifier, settings);
      }
    }
  }

  /**
   * Apply rule-based locks to a cantrip (legacy/modern restrictions).
   * @param {HTMLElement} item - The spell item element
   * @param {HTMLElement} checkbox - The checkbox element
   * @param {string} classIdentifier - The class identifier
   * @param {Object} settings - The class-specific settings
   * @returns {void}
   * @private
   */
  _applyRuleBasedCantripLocks(item, checkbox, classIdentifier, settings) {
    if (settings.behavior !== MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) return;
    const isLevelUp = this.app.spellManager.cantripManager.canBeLeveledUp();
    const isLongRest = this.app._isLongRest;
    const uuid = checkbox.dataset.uuid;
    const preparedByClass = this.app.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    const classSpellKey = `${classIdentifier}:${uuid}`;
    const isSavedAsPrepared = classPreparedSpells.includes(classSpellKey);
    switch (settings.cantripSwapping) {
      case MODULE.SWAP_MODES.NONE:
        if (isSavedAsPrepared) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedLegacy');
          item.classList.add('cantrip-locked');
        }
        break;
      case MODULE.SWAP_MODES.LEVEL_UP:
        if (!isLevelUp && isSavedAsPrepared) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLevelUp');
          item.classList.add('cantrip-locked');
        }
        break;
      case MODULE.SWAP_MODES.LONG_REST:
        const isWizard = classIdentifier === 'wizard';
        if (!isWizard) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.WizardRuleOnly');
          item.classList.add('cantrip-locked');
        } else if (!isLongRest && isSavedAsPrepared) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLongRest');
          item.classList.add('cantrip-locked');
        }
        break;
    }
  }

  /**
   * Apply class-specific colors and styling (only once during application lifecycle).
   * @returns {Promise<void>}
   */
  async applyClassStyling() {
    if (this._colorApplicationCount > 0) return;
    if (this.app._state.spellcastingClasses) {
      await UIHelpers.applyClassColors(this.app._state.spellcastingClasses);
      this._colorApplicationCount++;
    }
  }

  /**
   * Set up spell lock states based on class swapping rules and max limits.
   * @returns {void}
   */
  setupSpellLocks() {
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    if (!activeTab) return;
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent) return;
    if (activeTab === 'wizardbook') return;
    const classIdentifier = activeTabContent?.dataset.classIdentifier;
    if (!classIdentifier) return;
    const settings = this.app.spellManager.getSettings(classIdentifier);
    const classData = this.app._state.classSpellData[classIdentifier];
    if (!classData) return;
    const currentPrepared = classData.spellPreparation.current || 0;
    const maxPrepared = classData.spellPreparation.maximum || 0;
    const spellItems = activeTabContent.querySelectorAll('.spell-item');
    const isLevelUp = this.app.spellManager.cantripManager.canBeLeveledUp();
    const isLongRest = this.app._isLongRest;
    for (const item of spellItems) {
      const spellLevel = item.dataset.spellLevel;
      if (spellLevel === '0') continue;
      const checkbox = item.querySelector('dnd5e-checkbox');
      if (!checkbox) continue;
      const spellSourceClass = checkbox.dataset.sourceClass;
      const isAlwaysPrepared = item.querySelector('.tag.always-prepared');
      const isGranted = item.querySelector('.tag.granted');
      const isInnate = item.querySelector('.tag.innate');
      const isAtWill = item.querySelector('.tag.atwill');
      if (isAlwaysPrepared || isGranted || isInnate || isAtWill) continue;
      if (spellSourceClass && spellSourceClass !== classIdentifier) continue;
      const isChecked = checkbox.checked;
      const wasPrepared = checkbox.dataset.wasPrepared === 'true';
      checkbox.disabled = false;
      delete checkbox.dataset.tooltip;
      item.classList.remove('spell-locked', 'max-prepared');
      if (settings.behavior !== MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) continue;
      const spellUuid = checkbox.dataset.uuid;
      const spellName = checkbox.dataset.name || game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
      const spell = { name: spellName, system: { level: parseInt(spellLevel) || 1 }, sourceClass: spellSourceClass, uuid: spellUuid };
      const canChange = this.app.spellManager.canChangeSpellStatus(spell, isChecked, wasPrepared, isLevelUp, isLongRest, classIdentifier, currentPrepared, maxPrepared);
      if (!canChange.allowed) {
        checkbox.disabled = true;
        if (canChange.message) {
          let tooltipText = game.i18n.localize(canChange.message);
          if (canChange.message === 'SPELLBOOK.Preparation.ClassAtMaximum') {
            tooltipText = game.i18n.format('SPELLBOOK.Preparation.ClassAtMaximum', { class: classData.className || classIdentifier });
          }
          checkbox.dataset.tooltip = tooltipText;
        }
        item.classList.add('spell-locked');
        if (canChange.message === 'SPELLBOOK.Preparation.ClassAtMaximum') item.classList.add('max-prepared');
      }
      if (isChecked && wasPrepared) {
        const ruleLockCheck = this.app.spellManager.canChangeSpellStatus(spell, false, wasPrepared, isLevelUp, isLongRest, classIdentifier, currentPrepared, maxPrepared);
        if (!ruleLockCheck.allowed) {
          checkbox.disabled = true;
          if (ruleLockCheck.message) checkbox.dataset.tooltip = game.i18n.localize(ruleLockCheck.message);
          item.classList.add('spell-locked');
        } else {
          checkbox.disabled = false;
          delete checkbox.dataset.tooltip;
          checkbox.removeAttribute('data-tooltip');
          item.classList.remove('spell-locked', 'max-prepared');
        }
      }
    }
    log(3, `Applied spell locks for ${classIdentifier}, prepared: ${currentPrepared}/${maxPrepared}`);
  }
}

/**
 * Update select-all checkbox state based on individual checkbox states.
 * @param {HTMLElement} selectAllCheckbox - The master select-all checkbox
 * @param {NodeList|Array<HTMLElement>} childCheckboxes - Individual checkboxes in the group
 */
export function updateSelectAllState(selectAllCheckbox, childCheckboxes) {
  if (!selectAllCheckbox || !childCheckboxes || childCheckboxes.length === 0) return;
  const checkboxArray = Array.from(childCheckboxes);
  const checkedCount = checkboxArray.filter((cb) => cb.checked).length;
  if (checkedCount === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedCount === checkboxArray.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

/**
 * Set all checkboxes in a group to a specific checked state.
 * @param {NodeList|Array<HTMLElement>} checkboxes - Checkboxes to update
 * @param {boolean} checked - Whether to check or uncheck the checkboxes
 * @param {boolean} [skipDisabled=true] - Whether to skip disabled checkboxes
 */
export function setGroupCheckboxes(checkboxes, checked, skipDisabled = true) {
  Array.from(checkboxes).forEach((checkbox) => {
    if (skipDisabled && checkbox.disabled) return;
    checkbox.checked = checked;
  });
}

/**
 * Calculate statistics for a collection of items with enabled/checked states.
 * @param {Array|NodeList} items - Array of items or checkboxes to analyze
 * @param {Function|string} [enabledCheck='enabled'] - Function to check if item is enabled, or property name
 * @param {Function|string} [disabledCheck='disabled'] - Function to check if item is disabled, or property name
 * @returns {CollectionStats} Statistics object with counts and flags
 */
export function calculateCollectionStats(items, enabledCheck = 'enabled', disabledCheck = 'disabled') {
  const itemArray = Array.from(items);
  const totalCount = itemArray.length;
  const enabledFn = typeof enabledCheck === 'function' ? enabledCheck : (item) => item[enabledCheck] || item.checked;
  const disabledFn = typeof disabledCheck === 'function' ? disabledCheck : (item) => item[disabledCheck] || item.disabled;
  const enabledCount = itemArray.filter(enabledFn).length;
  const disabledCount = itemArray.filter(disabledFn).length;
  return {
    enabledCount,
    totalCount,
    disabledCount,
    allEnabled: enabledCount === totalCount,
    allDisabled: disabledCount === totalCount,
    noneEnabled: enabledCount === 0,
    percentage: totalCount > 0 ? Math.round((enabledCount / totalCount) * 100) : 0
  };
}

/**
 * Calculate optimal position for a dialog/tooltip relative to a trigger element.
 * @param {PositioningConfig} config - Positioning configuration options
 * @returns {{left: number, top: number}} Calculated position coordinates in pixels
 */
export function calculateOptimalPosition(config) {
  const { triggerElement, dialogWidth, dialogHeight, minMargin = 20, minTop = 50, maxBottomOffset = 100, offset = 10, preferredSide = 'right' } = config;
  const triggerRect = triggerElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left, top;
  const rightSpace = viewportWidth - triggerRect.right;
  const leftSpace = triggerRect.left;
  if (preferredSide === 'right' && rightSpace >= dialogWidth + minMargin) left = triggerRect.right + offset;
  else if (preferredSide === 'left' && leftSpace >= dialogWidth + minMargin) left = leftSpace - dialogWidth - offset;
  else if (leftSpace >= dialogWidth + minMargin) left = leftSpace - dialogWidth - offset;
  else if (rightSpace >= dialogWidth + minMargin) left = triggerRect.right + offset;
  else left = (viewportWidth - dialogWidth) / 2;
  if (dialogHeight) top = Math.max(minTop, triggerRect.top + (triggerRect.height - dialogHeight) / 2);
  else top = Math.max(minTop, triggerRect.top);
  left = Math.max(minMargin, Math.min(left, viewportWidth - dialogWidth - minMargin));
  top = Math.max(minTop, Math.min(top, viewportHeight - maxBottomOffset));
  return { left, top };
}

/**
 * Position a tooltip near mouse cursor with viewport boundary checking.
 * @param {MouseEvent} event - The mouse event containing cursor position
 * @param {HTMLElement} tooltip - The tooltip element to position
 * @param {number} [offset=15] - Offset from cursor in pixels
 */
export function positionTooltipAtCursor(event, tooltip, offset = 15) {
  const rect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let x = event.clientX + offset;
  let y = event.clientY + offset;
  if (x + rect.width > viewportWidth) x = event.clientX - rect.width - offset;
  if (y + rect.height > viewportHeight) y = event.clientY - rect.height - offset;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

/**
 * Get or create a tooltip element.
 * @param {string} id - Unique ID for the tooltip
 * @param {string} [className='tooltip'] - CSS class for the tooltip
 * @returns {HTMLElement} The tooltip element
 */
export function getOrCreateTooltip(id, className = 'tooltip') {
  let tooltip = document.getElementById(id);
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = id;
    tooltip.className = className;
    tooltip.style.display = 'none';
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '10000';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

/**
 * Show tooltip with content and optional positioning.
 * @param {string} tooltipId - Unique tooltip ID
 * @param {string|HTMLElement} content - Content to display in the tooltip
 * @param {MouseEvent} [event=null] - Optional mouse event for cursor positioning
 * @param {string} [className='tooltip'] - CSS class for the tooltip
 * @returns {HTMLElement} The tooltip element
 */
export function showTooltip(tooltipId, content, event = null, className = 'tooltip') {
  const tooltip = getOrCreateTooltip(tooltipId, className);
  if (typeof content === 'string') tooltip.innerHTML = content;
  else {
    tooltip.innerHTML = '';
    tooltip.appendChild(content);
  }
  tooltip.style.display = 'block';
  if (event) positionTooltipAtCursor(event, tooltip);
  return tooltip;
}

/**
 * Show a loading state in the tooltip.
 * @param {string} tooltipId - Unique tooltip ID
 * @param {MouseEvent} [event=null] - Optional mouse event for cursor positioning
 * @param {string} [className='tooltip'] - CSS class for the tooltip
 * @returns {HTMLElement} The tooltip element
 */
export function showLoadingTooltip(tooltipId, event = null, className = 'tooltip') {
  const loadingContent = `
    <div class="tooltip-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <span>${game.i18n.localize('SPELLBOOK.UI.Loading')}</span>
    </div>
  `;
  return showTooltip(tooltipId, loadingContent, event, className);
}

/**
 * Hide a tooltip without removing it from the DOM.
 * @param {string} tooltipId - Unique tooltip ID to hide
 */
export function hideTooltip(tooltipId) {
  const tooltip = document.getElementById(tooltipId);
  if (tooltip) tooltip.style.display = 'none';
}

/**
 * Remove a tooltip from the DOM completely.
 * @param {string} tooltipId - Unique tooltip ID to remove
 */
export function removeTooltip(tooltipId) {
  const tooltip = document.getElementById(tooltipId);
  if (tooltip) tooltip.remove();
}

/**
 * Update tooltip position at cursor.
 * @param {string} tooltipId - Unique tooltip ID to reposition
 * @param {MouseEvent} event - Mouse event with cursor position
 * @param {number} [offset=15] - Offset from cursor in pixels
 */
export function updateTooltipPosition(tooltipId, event, offset = 15) {
  const tooltip = document.getElementById(tooltipId);
  if (!tooltip || tooltip.style.display === 'none') return;
  positionTooltipAtCursor(event, tooltip, offset);
}
