import { CANTRIP_RULES, ENFORCEMENT_BEHAVIOR, FLAGS, MODULE } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import * as colorUtils from '../color-utils.mjs';
import { RuleSetManager } from '../rule-set-manager.mjs';

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
      const filtersContainer = this.element?.querySelector('.spell-filters');
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
   * Enhanced spell preparation tracking that enforces per-class limits
   */
  updateSpellPreparationTracking() {
    try {
      // Early return if element not ready
      if (!this.element) {
        log(2, 'Element not ready for spell preparation tracking update');
        return;
      }

      const activeTab = this.app.tabGroups['spellbook-tabs'];
      if (!activeTab) {
        log(2, 'No active tab found when updating spell preparation tracking');
        return;
      }

      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      if (!activeTabContent) {
        log(2, `No tab content found for tab "${activeTab}"`);
        return;
      }

      // Get class identifier from the active tab
      const classIdentifier = activeTabContent.dataset.classIdentifier;
      if (!classIdentifier) {
        log(2, `No class identifier found in tab "${activeTab}"`);
        return;
      }

      // Get the class data for this tab
      const classData = this.app._stateManager.classSpellData[classIdentifier];
      if (!classData) {
        log(2, `No class data found for identifier "${classIdentifier}"`);
        return;
      }

      // Get class rules for preparation limits
      const classRules = RuleSetManager.getClassRules(this.app.actor, classIdentifier);
      const baseMaxPrepared = classData.classItem?.system?.spellcasting?.preparation?.max || 0;
      const preparationBonus = classRules?.preparationBonus || 0;
      const classMaxPrepared = baseMaxPrepared + preparationBonus;

      // Count prepared spells for this specific class (excluding cantrips)
      let classPreparedCount = 0;
      const preparedCheckboxes = activeTabContent.querySelectorAll('dnd5e-checkbox[data-uuid]:not([disabled])');

      preparedCheckboxes.forEach((checkbox) => {
        const spellItem = checkbox.closest('.spell-item');
        if (!spellItem) return;

        const spellLevel = spellItem.dataset.spellLevel;
        const spellSourceClass = checkbox.dataset.sourceClass;

        // Skip cantrips and spells from other classes
        if (spellLevel === '0' || (spellSourceClass && spellSourceClass !== classIdentifier)) return;

        if (checkbox.checked) {
          classPreparedCount++;
        }
      });

      // Update class data object with current count
      classData.spellPreparation.current = classPreparedCount;
      classData.spellPreparation.maximum = classMaxPrepared; // Update with bonus

      // Check if this class is at its limit
      const isClassAtMax = classPreparedCount >= classMaxPrepared;

      // Apply per-class enforcement if using enforced behavior
      const settings = this.app.spellManager.getSettings();
      if (settings.behavior === ENFORCEMENT_BEHAVIOR.ENFORCED) {
        this._enforcePerClassSpellLimits(activeTabContent, classIdentifier, isClassAtMax);
      }

      // Update global counts using the state manager method
      this.app._stateManager.updateGlobalPreparationCount();
      const globalPrepared = this.app._stateManager.spellPreparation;

      // Update global count in the UI
      const countDisplay = this.element.querySelector('.spell-prep-tracking');
      if (countDisplay) {
        const globalCurrentEl = countDisplay.querySelector('.global-current-count');
        if (globalCurrentEl) globalCurrentEl.textContent = globalPrepared.current;

        // Check if globally at max
        const isGloballyAtMax = globalPrepared.current >= globalPrepared.maximum;

        // Set the at-max class based on either class or global limits
        if (isClassAtMax || isGloballyAtMax) {
          countDisplay.classList.add('at-max');
          this.element.classList.add('at-max-spells');
        } else {
          countDisplay.classList.remove('at-max');
          this.element.classList.remove('at-max-spells');
        }
      }
    } catch (error) {
      log(1, 'Error updating spell preparation tracking:', error);
    }
  }

  /**
   * Enforce per-class spell limits for non-cantrip spells
   * @param {HTMLElement} tabContent - The active tab content element
   * @param {string} classIdentifier - The class identifier
   * @param {boolean} isClassAtMax - Whether this class is at its spell limit
   * @private
   */
  _enforcePerClassSpellLimits(tabContent, classIdentifier, isClassAtMax) {
    try {
      const spellCheckboxes = tabContent.querySelectorAll('dnd5e-checkbox[data-uuid]');

      spellCheckboxes.forEach((checkbox) => {
        const spellItem = checkbox.closest('.spell-item');
        if (!spellItem) return;

        const spellLevel = spellItem.dataset.spellLevel;
        const spellSourceClass = checkbox.dataset.sourceClass;

        // Skip cantrips and spells from other classes
        if (spellLevel === '0' || (spellSourceClass && spellSourceClass !== classIdentifier)) return;

        // Skip always prepared and granted spells
        if (spellItem.querySelector('.tag.always-prepared') || spellItem.querySelector('.tag.granted')) return;

        // If class is at max and this spell isn't prepared, disable it
        if (isClassAtMax && !checkbox.checked) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.format('SPELLBOOK.Preparation.ClassAtMaximum', {
            class: this.app._stateManager.classSpellData[classIdentifier]?.className || classIdentifier
          });
          spellItem.classList.add('class-max-prepared');
        } else {
          // Re-enable if not at max
          checkbox.disabled = false;
          delete checkbox.dataset.tooltip;
          spellItem.classList.remove('class-max-prepared');
        }
      });

      log(3, `Applied per-class spell limits for ${classIdentifier}, at max: ${isClassAtMax}`);
    } catch (error) {
      log(1, `Error enforcing per-class spell limits for ${classIdentifier}:`, error);
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

      // Skip cantrips
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

      // Skip cantrips
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
      // Early return if element not ready
      if (!this.element) {
        log(2, 'Element not ready for spell counts update');
        return;
      }

      const activeTab = this.app.tabGroups['spellbook-tabs'];
      if (!activeTab) {
        log(2, 'No active tab found when updating spell counts');
        return;
      }

      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      if (!activeTabContent) {
        log(2, `No tab content found for tab "${activeTab}"`);
        return;
      }

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
          const levelHeading = levelContainer.querySelector('.spell-level-heading');
          if (levelHeading) {
            const newCount = document.createElement('span');
            newCount.className = 'spell-count';
            newCount.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.SpellCount'));
            newCount.textContent = `(${preparedCount}/${totalAvailable})`;

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
      const activeTab = this.app.tabGroups['spellbook-tabs'];
      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      if (!activeTabContent) return;

      const cantripLevel = activeTabContent.querySelector('.spell-level[data-level="0"]');
      if (!cantripLevel) return;

      // Apply rule-based locks on initial setup (based on saved state)
      this.setupCantripLocks(false, true);

      if (this.app.wizardManager?.isWizard && this.app._isLongRest) {
        const cantripRules = this.app.spellManager.getSettings().rules;
        const existingInfo = cantripLevel.querySelector('.wizard-rules-info');
        if (existingInfo) existingInfo.remove();

        const infoElement = document.createElement('div');
        infoElement.className = 'wizard-rules-info';
        const ruleKey =
          cantripRules === CANTRIP_RULES.MODERN_LONG_REST ?
            'SPELLBOOK.Wizard.ModernCantripRules'
          : 'SPELLBOOK.Wizard.LegacyCantripRules';
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
   * @param {boolean} [skipLockSetup=false] - Whether to skip calling setupCantripLocks
   * @returns {Object} Counter state with current and max values
   */
  updateCantripCounter(cantripLevel, skipLockSetup = false) {
    try {
      // Early return if element not ready
      if (!this.element) {
        log(2, 'Element not ready for cantrip counter update');
        return { current: 0, max: 0 };
      }

      if (!cantripLevel) {
        const activeTab = this.app.tabGroups['spellbook-tabs'];
        if (!activeTab) {
          log(2, 'No active tab found when updating cantrip counter');
          return { current: 0, max: 0 };
        }

        const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
        if (!activeTabContent) {
          log(2, `No tab content found for tab "${activeTab}"`);
          return { current: 0, max: 0 };
        }

        cantripLevel = activeTabContent.querySelector('.spell-level[data-level="0"]');
        if (!cantripLevel) {
          log(3, 'No cantrip level container found in active tab');
          return { current: 0, max: 0 };
        }
      }

      // Get class identifier for the active tab
      const activeTab = this.app.tabGroups['spellbook-tabs'];
      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      const classIdentifier = activeTabContent?.dataset.classIdentifier;

      if (!classIdentifier) {
        log(2, 'No class identifier found for cantrip counter');
        return { current: 0, max: 0 };
      }

      // Get max cantrips for this specific class
      const maxCantrips = this.app.spellManager.getMaxAllowed(classIdentifier);

      // Count cantrips for this specific class
      let currentCount = 0;
      const cantripItems = cantripLevel.querySelectorAll('.spell-item');
      cantripItems.forEach((item) => {
        if (item.querySelector('.tag.always-prepared') || item.querySelector('.tag.granted')) return;

        const checkbox = item.querySelector('dnd5e-checkbox');
        if (!checkbox) return;

        const spellSourceClass = checkbox.dataset.sourceClass;

        // Only count cantrips for this class
        if (spellSourceClass && spellSourceClass !== classIdentifier) return;

        if (checkbox.checked) {
          currentCount++;
        }
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

      // Only call setupCantripLocks if not explicitly skipped
      if (!skipLockSetup) {
        try {
          this.setupCantripLocks();
        } catch (err) {
          log(2, 'Error in setupCantripLocks called from updateCantripCounter:', err);
        }
      }

      return { current: currentCount, max: maxCantrips };
    } catch (error) {
      log(1, 'Error updating cantrip counter:', error);
      return { current: 0, max: 0 };
    }
  }

  /**
   * Set up cantrip lock states based on selection rules
   * @param {boolean} [force=false] - Force update even if no active tab is found
   * @param {boolean} [applyRuleLocks=false] - Whether to apply rule-based locks (vs count-only)
   */
  setupCantripLocks(force = false, applyRuleLocks = false) {
    try {
      const activeTab = this.app.tabGroups['spellbook-tabs'];
      if (!activeTab && !force) return;

      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      if (!activeTabContent && !force) return;

      const classIdentifier = activeTabContent?.dataset.classIdentifier;
      if (!classIdentifier && !force) return;

      const cantripItems = activeTabContent.querySelectorAll('.spell-item[data-spell-level="0"]');
      if (!cantripItems.length) return;

      // Get class-specific settings
      const settings = this.app.spellManager.getSettings(classIdentifier);

      // Get class-specific cantrip count
      let currentCount = 0;
      let maxCantrips = 0;

      try {
        const cantripCounter = this.updateCantripCounter(null, true);
        currentCount = cantripCounter ? cantripCounter.current : 0;
        maxCantrips = cantripCounter ? cantripCounter.max : 0;
      } catch (err) {
        log(2, 'Error getting cantrip counts:', err);
        if (classIdentifier) {
          maxCantrips = this.app.spellManager.getMaxAllowed(classIdentifier);
        }
      }

      // Apply locks to cantrip items
      for (const item of cantripItems) {
        const checkbox = item.querySelector('dnd5e-checkbox');
        if (!checkbox) continue;

        const spellSourceClass = checkbox.dataset.sourceClass;

        // Only process cantrips for this class
        if (spellSourceClass && spellSourceClass !== classIdentifier) continue;

        // Skip always prepared/granted cantrips
        if (item.querySelector('.tag.always-prepared') || item.querySelector('.tag.granted')) continue;

        const isChecked = checkbox.checked;

        // Reset lock state
        checkbox.disabled = false;
        delete checkbox.dataset.tooltip;
        item.classList.remove('cantrip-locked');

        // ALWAYS apply count-based limits
        if (currentCount >= maxCantrips && !isChecked) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached');
          item.classList.add('cantrip-locked');
          continue;
        }

        // Only apply rule-based locks if explicitly requested
        if (applyRuleLocks) {
          this._applyRuleBasedCantripLocks(item, checkbox, isChecked, classIdentifier, settings);
        }
      }
    } catch (error) {
      log(1, 'Error setting up cantrip locks:', error);
    }
  }

  /**
   * Apply rule-based locks to a cantrip (legacy/modern restrictions)
   * @param {HTMLElement} item - The spell item element
   * @param {HTMLElement} checkbox - The checkbox element
   * @param {boolean} isChecked - Whether the checkbox is checked
   * @param {string} classIdentifier - The class identifier
   * @param {Object} settings - The class-specific settings
   * @private
   */
  _applyRuleBasedCantripLocks(item, checkbox, isChecked, classIdentifier, settings) {
    if (settings.behavior !== ENFORCEMENT_BEHAVIOR.ENFORCED) return;

    const isLevelUp = this.app.spellManager.canBeLeveledUp();
    const isLongRest = this.app._isLongRest;

    // Use the class-specific cantrip swapping rules
    switch (settings.cantripSwapping) {
      case 'none': // Legacy behavior - can't change once set
        if (isChecked) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedLegacy');
          item.classList.add('cantrip-locked');
        }
        break;

      case 'levelUp': // Modern level-up rules
        if (!isLevelUp && isChecked) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLevelUp');
          item.classList.add('cantrip-locked');
        }
        break;

      case 'longRest': // Modern long-rest rules (wizard only)
        const isWizard = classIdentifier === 'wizard';
        if (!isWizard) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.WizardRuleOnly');
          item.classList.add('cantrip-locked');
        } else if (!isLongRest && isChecked) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLongRest');
          item.classList.add('cantrip-locked');
        }
        break;
    }
  }

  /**
   * Lock all cantrip checkboxes (e.g., after swap completed)
   */
  //TODO: dataset.tooltip should use `.format` and mention event for this action (levelup or longrest, etc.)
  lockAllCantripCheckboxes() {
    try {
      const activeTab = this.app.tabGroups['spellbook-tabs'];
      const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
      if (!activeTabContent) return;
      const cantripItems = activeTabContent.querySelectorAll('.spell-item[data-spell-level="0"]');
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

  /**
   * Apply class-specific colors and styling
   * @returns {Promise<void>}
   */
  async applyClassStyling() {
    try {
      if (this.app._stateManager.spellcastingClasses) {
        await colorUtils.applyClassColors(this.app._stateManager.spellcastingClasses);
      }
    } catch (error) {
      log(1, 'Error applying class styling:', error);
    }
  }
}
