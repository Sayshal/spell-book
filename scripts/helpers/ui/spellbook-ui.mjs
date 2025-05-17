import { FLAGS, MODULE } from '../../constants.mjs';
import { log } from '../../logger.mjs';

/**
 * Helper class for UI-related functionality in the spellbook application
 */
export class SpellbookUI {
  /**
   * Create a new UI helper
   * @param {PlayerSpellBook} app - The parent application
   */
  constructor(app) {
    this.app = app;
    this.actor = app.actor;
  }

  /**
   * Get the application's element
   * @returns {HTMLElement|null} The application element
   */
  get element() {
    return this.app.element;
  }

  /**
   * Set up all UI components
   */
  setupUI() {
    this.setSidebarState();
    this.positionFooter();
    this.setupFilterListeners();
    this.setupPreparationListeners();
    this.applyCollapsedLevels();
    this.setupCantripUI();
  }

  /**
   * Disable inputs while the application is loading
   */
  disableInputsWhileLoading() {
    const inputs = this.element.querySelectorAll('.spell-filters input, .spell-filters select, .spell-filters button');
    inputs.forEach((input) => (input.disabled = true));
  }

  /**
   * Set sidebar expanded/collapsed state from user flags
   */
  setSidebarState() {
    try {
      const sidebarCollapsed = game.user.getFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED);
      if (sidebarCollapsed) this.element.classList.add('sidebar-collapsed');
    } catch (error) {
      log(1, 'Error setting sidebar state:', error);
    }
  }

  /**
   * Position the footer based on sidebar state
   */
  positionFooter() {
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

  /**
   * Set up event listeners for filter controls
   */
  setupFilterListeners() {
    try {
      const filtersContainer = this.element.querySelector('.spell-filters');
      if (!filtersContainer) return;

      filtersContainer.addEventListener('change', (event) => {
        const target = event.target;
        if (target.matches('dnd5e-checkbox') || target.matches('select')) {
          this.app._applyFilters();
          if (target.name === 'sort-by') this.app._applySorting(target.value);
        }
      });

      filtersContainer.addEventListener('input', (event) => {
        const target = event.target;
        if (target.matches('input[type="text"]')) {
          clearTimeout(this.app._searchTimer);
          this.app._searchTimer = setTimeout(() => this.app._applyFilters(), 200);
        } else if (target.matches('input[type="number"]')) {
          clearTimeout(this.app._rangeTimer);
          this.app._rangeTimer = setTimeout(() => this.app._applyFilters(), 200);
        }
      });
    } catch (error) {
      log(1, 'Error setting up filter listeners:', error);
    }
  }

  /**
   * Set up event listeners for spell preparation checkboxes
   */
  setupPreparationListeners() {
    try {
      const spellsContainer = this.element.querySelector('.spells-container');
      if (!spellsContainer) return;
      const isLevelUp = this.app.spellManager.canBeLeveledUp();
      if (isLevelUp) {
        this.app._cantripTracking = {
          originalChecked: new Set(),
          hasUnlearned: false,
          hasLearned: false,
          unlearned: null,
          learned: null
        };

        const cantripItems = spellsContainer.querySelectorAll('.spell-item[data-spell-level="0"]');
        cantripItems.forEach((item) => {
          const checkbox = item.querySelector('dnd5e-checkbox[data-uuid]');
          if (checkbox && checkbox.checked) {
            this.app._cantripTracking.originalChecked.add(checkbox.dataset.uuid);
          }
        });
      }

      spellsContainer.addEventListener('change', async (event) => {
        const target = event.target;
        if (target.matches('dnd5e-checkbox[data-uuid]')) {
          await this.app._handlePreparationChange(event);
        }
      });
    } catch (error) {
      log(1, 'Error setting up preparation listeners:', error);
    }
  }

  /**
   * Update spell preparation tracking display
   */
  updateSpellPreparationTracking() {
    try {
      const preparedCheckboxes = this.element.querySelectorAll('dnd5e-checkbox[data-uuid]:not([disabled])');
      const countDisplay = this.element.querySelector('.spell-prep-tracking');
      if (!countDisplay) return;
      let preparedCount = 0;
      preparedCheckboxes.forEach((checkbox) => {
        const spellItem = checkbox.closest('.spell-item');
        const spellLevel = spellItem?.dataset.spellLevel;
        if (spellLevel === '0') return;
        if (checkbox.checked) preparedCount++;
      });

      const maxPrepared = this.app.spellPreparation?.maximum || 0;
      const currentCountEl = countDisplay.querySelector('.current-count');
      const maxCountEl = countDisplay.querySelector('.max-count');
      if (currentCountEl) currentCountEl.textContent = preparedCount;
      if (maxCountEl) maxCountEl.textContent = maxPrepared;
      if (preparedCount >= maxPrepared) {
        countDisplay.classList.add('at-max');
      } else {
        countDisplay.classList.remove('at-max');
      }

      if (maxPrepared > 0) {
        if (preparedCount >= maxPrepared) {
          this.element.classList.add('at-max-spells');
          this._disableUnpreparedSpells();
        } else {
          this.element.classList.remove('at-max-spells');
          this._enableAllSpells();
        }
      }
    } catch (error) {
      log(1, 'Error updating spell preparation tracking:', error);
    }
  }

  /**
   * Disable unprepared spell checkboxes when at max prepared spells
   * @private
   */
  _disableUnpreparedSpells() {
    const allSpellCheckboxes = this.element.querySelectorAll('dnd5e-checkbox[data-uuid]');
    allSpellCheckboxes.forEach((checkbox) => {
      const spellItem = checkbox.closest('.spell-item');
      const spellLevel = spellItem?.dataset.spellLevel;
      if (spellLevel === '0') return;
      if (!checkbox.checked) {
        checkbox.disabled = true;
        checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Preparation.AtMaximum');
        spellItem?.classList.add('max-prepared');
      }
    });
  }

  /**
   * Enable all spell checkboxes when not at max prepared spells
   * @private
   */
  _enableAllSpells() {
    const allSpellCheckboxes = this.element.querySelectorAll('dnd5e-checkbox[data-uuid]');
    allSpellCheckboxes.forEach((checkbox) => {
      const spellItem = checkbox.closest('.spell-item');
      const spellLevel = spellItem?.dataset.spellLevel;
      if (spellLevel === '0') return;
      if (spellItem.querySelector('.tag.always-prepared') || spellItem.querySelector('.tag.granted')) return;
      checkbox.disabled = false;
      delete checkbox.dataset.tooltip;
      spellItem?.classList.remove('max-prepared');
    });
  }

  /**
   * Update spell counts in level headings
   */
  updateSpellCounts() {
    try {
      const activeTab = this.app.tabGroups['spellbook-tabs'];
      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      if (!activeTabContent) return;
      if (activeTab === 'wizardtab') {
        const countDisplays = activeTabContent.querySelectorAll('.spell-count');
        countDisplays.forEach((countDisplay) => countDisplay.remove());
        return;
      }

      const spellLevels = activeTabContent.querySelectorAll('.spell-level');
      spellLevels.forEach((levelContainer) => {
        const levelId = levelContainer.dataset.level;
        if (levelId === '0') {
          const countDisplay = levelContainer.querySelector('.spell-count');
          if (countDisplay) countDisplay.remove();
          return;
        }

        const spellItems = levelContainer.querySelectorAll('.spell-item');
        const countableSpells = [];
        const preparedSpells = [];
        spellItems.forEach((item) => {
          const hasAlwaysPrepared = !!item.querySelector('.tag.always-prepared');
          const hasGranted = !!item.querySelector('.tag.granted');
          const isPrepared = item.classList.contains('prepared-spell');

          if (!hasAlwaysPrepared && !hasGranted) {
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
          const newCount = document.createElement('span');
          newCount.className = 'spell-count';
          newCount.setAttribute('aria-label', 'SPELLBOOK.UI.SpellCount');
          newCount.textContent = `(${preparedCount}/${totalAvailable})`;
          const levelHeading = levelContainer.querySelector('.spell-level-heading');
          if (levelHeading) {
            const cantripCounter = levelHeading.querySelector('.cantrip-counter');
            if (cantripCounter) {
              levelHeading.insertBefore(newCount, cantripCounter);
            } else {
              levelHeading.appendChild(newCount);
            }
          }
        }
      });
    } catch (error) {
      log(1, 'Error updating spell counts:', error);
    }
  }

  /**
   * Apply collapsed state to spell levels from user flags
   */
  applyCollapsedLevels() {
    try {
      const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];

      for (const levelId of collapsedLevels) {
        const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
        if (levelContainer) levelContainer.classList.add('collapsed');
      }
    } catch (error) {
      log(1, 'Error applying collapsed levels:', error);
    }
  }

  /**
   * Set up cantrip-specific UI elements
   */
  setupCantripUI() {
    try {
      const cantripLevel = this.element.querySelector('.spell-level[data-level="0"]');
      if (!cantripLevel) return;

      this.updateCantripCounter(cantripLevel);
      this.setupCantripLocks();

      if (this.app.wizardManager?.isWizard && this.app._isLongRest) {
        const cantripRules = this.app.spellManager.getSettings().rules;
        const existingInfo = cantripLevel.querySelector('.wizard-rules-info');
        if (existingInfo) existingInfo.remove();

        const infoElement = document.createElement('div');
        infoElement.className = 'wizard-rules-info';
        const ruleKey = cantripRules === CANTRIP_RULES.MODERN_LONG_REST ? 'SPELLBOOK.Wizard.ModernCantripRules' : 'SPELLBOOK.Wizard.LegacyCantripRules';
        infoElement.innerHTML = `<i class="fas fa-info-circle"></i> ${game.i18n.localize(ruleKey)}`;
        const levelHeading = cantripLevel.querySelector('.spell-level-heading');
        if (levelHeading) levelHeading.appendChild(infoElement);
      }
    } catch (error) {
      log(1, 'Error setting up cantrip UI:', error);
    }
  }

  /**
   * Update cantrip counter display
   * @param {HTMLElement} [cantripLevel] - The cantrip level container
   * @returns {Object} Counter state with current and max values
   */
  updateCantripCounter(cantripLevel) {
    if (!cantripLevel) {
      cantripLevel = this.element.querySelector('.spell-level[data-level="0"]');
    }
    if (!cantripLevel) return;

    try {
      const maxCantrips = this.app.spellManager.getMaxAllowed();
      let currentCount = 0;
      const cantripItems = cantripLevel.querySelectorAll('.spell-item');
      cantripItems.forEach((item) => {
        if (item.querySelector('.tag.always-prepared') || item.querySelector('.tag.granted')) return;
        const checkbox = item.querySelector('dnd5e-checkbox');
        if (checkbox && checkbox.checked) currentCount++;
      });
      this.app._uiCantripCount = currentCount;
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
      counterElem.classList.toggle('at-max', currentCount >= maxCantrips);
      return { current: currentCount, max: maxCantrips };
    } catch (error) {
      log(1, 'Error updating cantrip counter:', error);
      return { current: 0, max: 0 };
    }
  }

  /**
   * Set up cantrip lock states based on selection rules
   */
  setupCantripLocks() {
    try {
      const cantripItems = this.element.querySelectorAll('.spell-item[data-spell-level="0"]');
      if (!cantripItems.length) return;
      const isLevelUp = this.app.spellManager.canBeLeveledUp();
      const isLongRest = this.app._isLongRest;
      const currentCount = this.app._uiCantripCount;
      this.app.spellManager.lockCantripCheckboxes(cantripItems, isLevelUp, isLongRest, currentCount);
    } catch (error) {
      log(1, 'Error setting up cantrip locks:', error);
    }
  }

  /**
   * Lock all cantrip checkboxes (e.g., after swap completed)
   */
  //TODO: dataset.tooltip should use `.format` and mention event for this action (levelup or longrest, etc.)
  lockAllCantripCheckboxes() {
    try {
      const cantripItems = this.element.querySelectorAll('.spell-item[data-spell-level="0"]');

      for (const item of cantripItems) {
        const checkbox = item.querySelector('dnd5e-checkbox');
        if (!checkbox || checkbox.hasAttribute('data-always-disabled')) continue;
        checkbox.disabled = true;
        checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.SwapComplete');
        item.classList.add('cantrip-locked');
        const lockIcon = item.querySelector('.cantrip-lock-icon');
        if (lockIcon) lockIcon.remove();
      }
    } catch (error) {
      log(1, 'Error locking cantrip checkboxes:', error);
    }
  }
}
