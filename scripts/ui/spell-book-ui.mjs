/**
 * Spell Book User Interface Management System
 *
 * This module provides UI management for the Spell Book application,
 * handling interface state, user interactions, dynamic content updates, and visual
 * enhancements. It serves as the central coordinator for all UI-related functionality
 * including layout management, search integration, and spell interaction controls.
 * @module UIUtils/SpellBookUI
 * @author Tyler
 */

import { FLAGS, MODULE } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from '../managers/_module.mjs';
import * as UIUtils from './_module.mjs';

const { getProperty, setProperty, debounce } = foundry.utils;
const { formatNumber } = dnd5e.utils;

/**
 * Helper class for UI-related functionality in the Spell Book application.
 */
export class SpellBookUI {
  /**
   * Create a new UI helper.
   * @param {object} app - The parent application instance
   */
  constructor(app) {
    this.app = app;
    this._colorApplicationCount = 0;
    this.search = new UIUtils.SearchEngine(app);
    this._cantripUIInitialized = false;
    log(3, 'SpellBookUI initialized.', { actor: app.actor?.name });
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
    log(3, 'Sidebar state set.', { collapsed: sidebarCollapsed });
  }

  /**
   * Position the footer based on sidebar state.
   * @returns {void}
   */
  positionFooter() {
    const footer = this.element.querySelector('footer');
    if (!footer) return;
    const isSidebarCollapsed = this.element.classList.contains('sidebar-collapsed');
    log(3, 'Positioning footer.', { sidebarCollapsed: isSidebarCollapsed });
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
    log(3, 'Setting up collapsed footer search.');
    const searchInput = searchElement.querySelector('.advanced-search-input');
    const clearButton = searchElement.querySelector('.search-input-clear');
    if (searchInput) {
      const originalInput = this.element.querySelector('.sidebar .advanced-search-input');
      if (originalInput) searchInput.value = originalInput.value;
      const debouncedInputHandler = debounce((event) => {
        if (originalInput) {
          originalInput.value = event.target.value;
          originalInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 150);
      searchInput.addEventListener('input', debouncedInputHandler);
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
    log(3, 'Setting up filter listeners.', { filterCount: filterInputs.length });
    filterInputs.forEach((input) => {
      const eventType = input.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(eventType, () => {
        this.app.filterHelper.invalidateFilterCache();
        this.app.filterHelper.applyFilters();
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
    log(3, 'Updating spell preparation tracking.', { classIdentifier });
    const classRules = RuleSet.getClassRules(this.app.actor, classIdentifier);
    let baseMaxPrepared = 0;
    const spellcastingConfig = this.app._state.getSpellcastingConfigForClass(classIdentifier);
    baseMaxPrepared = getProperty(spellcastingConfig, 'preparation.max') || getProperty(classData, 'classItem.system.spellcasting.preparation.max') || 0;
    const preparationBonus = getProperty(classRules, 'spellPreparationBonus') || 0;
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
    setProperty(classData, 'spellPreparation.current', classPreparedCount);
    setProperty(classData, 'spellPreparation.maximum', classMaxPrepared);
    const isClassAtMax = classPreparedCount >= classMaxPrepared;
    const settings = this.app.spellManager.getSettings(classIdentifier);
    if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) this._enforcePerClassSpellLimits(activeTabContent, classIdentifier, isClassAtMax);
    this.app._state.updateGlobalPreparationCount();
    const globalPrepared = this.app._state.spellPreparation;
    this._updateFooterPreparationDisplay(globalPrepared);
    log(3, 'Spell preparation tracking updated.', { classPreparedCount, classMaxPrepared });
  }

  /**
   * Update the footer preparation display with granular at-max styling.
   * @param {{ current: number, maximum: number }} globalPrepared - Global preparation counts
   * @returns {void}
   * @private
   */
  _updateFooterPreparationDisplay(globalPrepared) {
    const prepTrackingContainer = this.element.querySelector('.spell-prep-tracking');
    if (!prepTrackingContainer) return;
    log(3, 'Updating footer preparation display.', { current: globalPrepared.current, max: globalPrepared.maximum });
    const globalCurrentEl = prepTrackingContainer.querySelector('.global-current-count');
    if (globalCurrentEl) globalCurrentEl.textContent = formatNumber(globalPrepared.current);
    const isGloballyAtMax = globalPrepared.current >= globalPrepared.maximum;
    const globalPrepCount = prepTrackingContainer.querySelector('.global-prep-count');
    if (globalPrepCount) globalPrepCount.classList.toggle('at-max', isGloballyAtMax);
    const classPreps = prepTrackingContainer.querySelectorAll('.class-prep-count');
    classPreps.forEach((classPrepEl) => {
      const classId = classPrepEl.dataset.classIdentifier;
      if (!classId) return;
      const classSpellData = this.app._state.classSpellData[classId];
      const current = getProperty(classSpellData, 'spellPreparation.current') || 0;
      const maximum = getProperty(classSpellData, 'spellPreparation.maximum') || 0;
      const isThisClassAtMax = current >= maximum;
      classPrepEl.classList.toggle('at-max', isThisClassAtMax);
      const classCurrentEl = classPrepEl.querySelector('.class-current');
      if (classCurrentEl && classSpellData) classCurrentEl.textContent = formatNumber(getProperty(classSpellData, 'spellPreparation.current') || 0);
    });
    this.element.classList.toggle('at-max-spells', isGloballyAtMax);
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
    log(3, 'Enforcing per-class spell limits.', { classIdentifier, isClassAtMax, checkboxCount: spellCheckboxes.length });
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
    log(3, 'Updating spell counts.', { activeTab });
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
      if (countDisplay) countDisplay.textContent = totalAvailable > 0 ? `(${formatNumber(preparedCount)}/${formatNumber(totalAvailable)})` : '';
      else if (totalAvailable > 0) {
        const levelHeading = levelContainer.querySelector('.spell-level-heading');
        if (levelHeading) {
          const newCount = document.createElement('span');
          newCount.className = 'spell-count';
          newCount.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.SpellCount'));
          newCount.textContent = `(${formatNumber(preparedCount)}/${formatNumber(totalAvailable)})`;
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
    const collapsedLevels = DataUtils.CollapsedStateManager.get(FLAGS.COLLAPSED_LEVELS);
    log(3, 'Applying collapsed levels.', { collapsedCount: collapsedLevels.length });
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
    log(3, 'Setting up cantrip UI.', { activeTab });
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
    log(3, 'Setting up advanced search.');
    this.search.initialize();
  }

  /**
   * Update cantrip counter display using cached max values.
   * @param {HTMLElement} [cantripLevel] - The cantrip level container
   * @param {boolean} [skipLockSetup] - Whether to skip calling setupCantripLocks
   * @returns {object} Counter state with current and max values
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
    log(3, 'Updating cantrip counter.', { classIdentifier });
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
    counterElem.textContent = `[${formatNumber(currentCount)}/${formatNumber(maxCantrips)}]`;
    counterElem.title = game.i18n.localize('SPELLBOOK.Cantrips.CounterTooltip');
    counterElem.style.display = '';
    counterElem.classList.toggle('at-max', currentCount >= maxCantrips);
    if (!skipLockSetup) this.setupCantripLocks();
    log(3, 'Cantrip counter updated.', { current: currentCount, max: maxCantrips });
    return { current: currentCount, max: maxCantrips };
  }

  /**
   * Set up cantrip lock states based on selection rules using cached max values.
   * @param {boolean} [applyRuleLocks] - Whether to apply rule-based locks (vs count-only)
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
    log(3, 'Setting up cantrip locks.', { classIdentifier, applyRuleLocks, cantripCount: cantripItems.length });
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
   * @param {object} settings - The class-specific settings
   * @returns {void}
   * @private
   */
  _applyRuleBasedCantripLocks(item, checkbox, classIdentifier, settings) {
    if (settings.behavior !== MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) return;
    const isLevelUp = this.app.spellManager.cantripManager.canBeLeveledUp();
    const isLongRest = this.app._isLongRest;
    const uuid = checkbox.dataset.uuid;
    log(3, 'Applying rule-based cantrip locks.', { classIdentifier, isLevelUp, isLongRest, swapMode: settings.cantripSwapping });
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
    log(3, 'Applying class styling.', { classCount: this.app._state.spellcastingClasses?.length || 0 });
    if (this.app._state.spellcastingClasses) {
      await UIUtils.applyClassColors(this.app._state.spellcastingClasses);
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
    log(3, 'Setting up spell locks.', { classIdentifier, behavior: settings.behavior });
    const currentPrepared = getProperty(classData, 'spellPreparation.current') || 0;
    const maxPrepared = getProperty(classData, 'spellPreparation.maximum') || 0;
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
  }

  /**
   * Apply favorite states with actor state validation.
   * @param {NodeList} buttons - The buttons to update
   * @returns {Promise<void>}
   */
  async applyFavoriteStatesToButtons(buttons) {
    const targetUserId = DataUtils.getTargetUserId(this.app.actor);
    let updatedCount = 0;
    for (const button of buttons) {
      const spellUuid = button.dataset.uuid;
      if (!spellUuid) continue;
      let isFavorited = this.app._state.getFavoriteSessionState(spellUuid);
      if (isFavorited === null) {
        const userData = await DataUtils.UserData.getUserDataForSpell(spellUuid, targetUserId, this.app.actor.id);
        const journalFavorited = userData?.favorited || false;
        const isOnActor = this.app.actor.items.some((item) => item.type === 'spell' && (item._stats?.compendiumSource === spellUuid || item.uuid === spellUuid));
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
   * Immediately apply favorite changes to UI without waiting for next render.
   * @param {Array<{uuid: string, newState: boolean}>} changedSpells - Array of changed spell states
   * @returns {void}
   */
  applyImmediateFavoriteChanges(changedSpells) {
    if (!this.element) return;
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

  /**
   * Apply pre-calculated class styling to the DOM.
   * @returns {Promise<void>}
   */
  async applyPreCalculatedClassStyling() {
    log(3, 'Applying pre-calculated class stylings.');
    if (!this.app._classStylingCache || this.app._classStylingCache.size === 0) {
      await this.applyClassStyling();
      return;
    }
    if (this.app.wizardManagers.size > 0) {
      for (const [identifier, wizardManager] of this.app.wizardManagers) {
        if (wizardManager.isWizard) {
          const color = this.app._classStylingCache.get(identifier);
          if (color) {
            const wizardTab = this.element.querySelector(`[data-tab="wizardbook-${identifier}"]`);
            if (wizardTab) wizardTab.style.setProperty('--wizard-book-color', color);
          }
        }
      }
    }
    await this.applyClassStyling();
  }

  /**
   * Prepare class styling data for wizard tabs.
   * @async
   */
  async prepareClassStylingData() {
    if (!this.app._classStylingCache) this.app._classStylingCache = new Map();
    if (this.app.wizardManagers.size > 0) {
      for (const [identifier, wizardManager] of this.app.wizardManagers) {
        if (wizardManager.isWizard) {
          const classSpellData = this.app._state.classSpellData[identifier];
          if (classSpellData?.classItem) {
            const color = await UIUtils.getClassColorForWizardTab(classSpellData.classItem);
            this.app._classStylingCache.set(identifier, color);
          }
        }
      }
    }
    log(3, 'PSB Class Styling Data created', { stylingCache: this.app._classStylingCache });
  }

  /**
   * Setup non-critical UI elements after the window is visible.
   * @returns {Promise<void>}
   */
  async setupDeferredUI() {
    log(3, 'Setting up deferred UI.');
    this.setupFilterListeners();
    this.applyCollapsedLevels();
    this.setupCantripUI();
    this.updateSpellCounts();
    this.updateSpellPreparationTracking();
    if (!this.app._classColorsApplied || this.app._classesChanged) {
      await this.applyPreCalculatedClassStyling();
      this.app._classColorsApplied = true;
      this.app._classesChanged = false;
    }
    this.setupAdvancedSearch();
    const favoriteButtons = this.app.element.querySelectorAll('.spell-favorite-toggle[data-uuid]');
    if (favoriteButtons.length > 0) {
      await this.applyFavoriteStatesToButtons(favoriteButtons);
      favoriteButtons.forEach((button) => button.setAttribute('data-favorites-applied', 'true'));
    }
  }

  /**
   * Update favorite button state immediately.
   * @param {HTMLElement} button - The favorite button element
   * @param {boolean} isFavorited - Whether the spell is favorited
   */
  updateFavoriteButtonState(button, isFavorited) {
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
  log(3, 'Updating select-all state.', { total: checkboxArray.length, checked: checkedCount });
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
 * @param {boolean} [skipDisabled] - Whether to skip disabled checkboxes
 */
export function setGroupCheckboxes(checkboxes, checked, skipDisabled = true) {
  log(3, 'Setting group checkboxes.', { count: checkboxes.length, checked, skipDisabled });
  Array.from(checkboxes).forEach((checkbox) => {
    if (skipDisabled && checkbox.disabled) return;
    checkbox.checked = checked;
  });
}

/**
 * Calculate optimal position for a dialog/tooltip relative to a trigger element.
 * @param {object} config - Positioning configuration options
 * @returns {object} Calculated position coordinates in pixels
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
 * @param {number} [offset] - Offset from cursor in pixels
 */
function positionTooltipAtCursor(event, tooltip, offset = 15) {
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
 * @param {string} [className] - CSS class for the tooltip
 * @returns {HTMLElement} The tooltip element
 */
function getOrCreateTooltip(id, className = 'tooltip') {
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
 * @param {MouseEvent} [event] - Optional mouse event for cursor positioning
 * @param {string} [className] - CSS class for the tooltip
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
  log(3, 'Showing tooltip.', { tooltipId, hasEvent: !!event });
  return tooltip;
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
 * @param {number} [offset] - Offset from cursor in pixels
 */
export function updateTooltipPosition(tooltipId, event, offset = 15) {
  const tooltip = document.getElementById(tooltipId);
  if (!tooltip || tooltip.style.display === 'none') return;
  positionTooltipAtCursor(event, tooltip, offset);
}
