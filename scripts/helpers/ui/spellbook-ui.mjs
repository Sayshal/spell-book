import { FLAGS, MODULE } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import { RuleSetManager } from '../../managers/rule-set-manager.mjs';
import * as colorUtils from '../color-utils.mjs';

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
    this._colorApplicationCount = 0;
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
    const sidebarCollapsed = game.user.getFlag(MODULE.ID, FLAGS.SIDEBAR_COLLAPSED);
    if (sidebarCollapsed) this.element.classList.add('sidebar-collapsed');
  }

  /**
   * Position the footer based on sidebar state
   */
  positionFooter() {
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
  }

  /**
   * Set up event listeners for filter controls
   */
  setupFilterListeners() {
    const filtersContainer = this.element?.querySelector('.spell-filters');
    if (!filtersContainer) return;
    filtersContainer.addEventListener('change', (event) => {
      const target = event.target;
      if (target.matches('dnd5e-checkbox') || target.matches('select')) {
        this.app._applyFilters();
        this.app.filterHelper.invalidateFilterCache();
      }
    });

    filtersContainer.addEventListener('input', (event) => {
      const target = event.target;
      if (target.matches('input[type="text"]')) {
        clearTimeout(this.app._searchTimer);
        this.app._searchTimer = setTimeout(() => {
          this.app.filterHelper.invalidateFilterCache();
          this.app._applyFilters();
        }, 200);
      } else if (target.matches('input[type="number"]')) {
        clearTimeout(this.app._rangeTimer);
        this.app._rangeTimer = setTimeout(() => {
          this.app.filterHelper.invalidateFilterCache();
          this.app._applyFilters();
        }, 200);
      }
    });
  }

  /**
   * Get a random wizard book image
   * @returns {Promise<string>} Path to a random book image
   */
  async getRandomWizardBookImage() {
    try {
      const folderPath = 'icons/sundries/books';
      const browseResult = await FilePicker.browse('public', folderPath);
      if (!browseResult || !browseResult.files) {
        log(2, `Could not browse folder ${folderPath}, using fallback`);
        return 'icons/svg/book.svg';
      }
      const webpFiles = browseResult.files.filter((filePath) => filePath.toLowerCase().endsWith('.webp'));
      if (webpFiles.length === 0) {
        log(2, `No .webp files found in ${folderPath}, using fallback`);
        return 'icons/svg/book.svg';
      }
      const randomIndex = Math.floor(Math.random() * webpFiles.length);
      const selectedFile = webpFiles[randomIndex];
      log(3, `Selected random wizard book image: ${selectedFile} (${randomIndex + 1} of ${webpFiles.length})`);
      return selectedFile;
    } catch (error) {
      log(1, `Error selecting random wizard book image:`, error);
      return 'icons/svg/book.svg';
    }
  }

  /**
   * Enhanced spell preparation tracking that enforces per-class limits
   */
  updateSpellPreparationTracking() {
    if (!this.element) return;
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    if (!activeTab) return;
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent) return;
    const classIdentifier = activeTabContent.dataset.classIdentifier;
    if (!classIdentifier) return;
    const classData = this.app._stateManager.classSpellData[classIdentifier];
    if (!classData) return;
    const classRules = RuleSetManager.getClassRules(this.app.actor, classIdentifier);
    const baseMaxPrepared = classData.classItem?.system?.spellcasting?.preparation?.max || 0;
    const preparationBonus = classRules?.spellPreparationBonus || 0;
    const classMaxPrepared = baseMaxPrepared + preparationBonus;
    let classPreparedCount = 0;
    const preparedCheckboxes = activeTabContent.querySelectorAll('dnd5e-checkbox[data-uuid]:not([disabled])');
    preparedCheckboxes.forEach((checkbox) => {
      const spellItem = checkbox.closest('.spell-item');
      if (!spellItem) return;
      const spellLevel = spellItem.dataset.spellLevel;
      const spellSourceClass = checkbox.dataset.sourceClass;
      if (spellLevel === '0' || (spellSourceClass && spellSourceClass !== classIdentifier)) return;
      if (checkbox.checked) classPreparedCount++;
    });
    classData.spellPreparation.current = classPreparedCount;
    classData.spellPreparation.maximum = classMaxPrepared;
    const isClassAtMax = classPreparedCount >= classMaxPrepared;
    const settings = this.app.spellManager.getSettings(classIdentifier);
    if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) this._enforcePerClassSpellLimits(activeTabContent, classIdentifier, isClassAtMax);
    this.app._stateManager.updateGlobalPreparationCount();
    const globalPrepared = this.app._stateManager.spellPreparation;
    this._updateFooterPreparationDisplay(classIdentifier, isClassAtMax, globalPrepared);
  }

  /**
   * Update the footer preparation display with granular at-max styling
   * @param {string} activeClassIdentifier - The currently active class identifier
   * @param {boolean} isActiveClassAtMax - Whether the active class is at maximum
   * @param {Object} globalPrepared - Global preparation counts {current, maximum}
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
      const classSpellData = this.app._stateManager.classSpellData[classId];
      const isThisClassAtMax = classSpellData ? classSpellData.spellPreparation.current >= classSpellData.spellPreparation.maximum : false;
      classPrepEl.classList.toggle('at-max', isThisClassAtMax);
      const classCurrentEl = classPrepEl.querySelector('.class-current');
      if (classCurrentEl && classSpellData) classCurrentEl.textContent = classSpellData.spellPreparation.current;
    });
    this.element.classList.toggle('at-max-spells', isGloballyAtMax);
    log(3, `Updated footer: active class ${activeClassIdentifier} at max: ${isActiveClassAtMax}, global at max: ${isGloballyAtMax}`);
  }

  /**
   * Enforce per-class spell limits for non-cantrip spells
   * @param {HTMLElement} tabContent - The active tab content element
   * @param {string} classIdentifier - The class identifier
   * @param {boolean} isClassAtMax - Whether this class is at its spell limit
   * @private
   */
  _enforcePerClassSpellLimits(tabContent, classIdentifier, isClassAtMax) {
    const spellCheckboxes = tabContent.querySelectorAll('dnd5e-checkbox[data-uuid]');
    const classData = this.app._stateManager.classSpellData[classIdentifier];
    spellCheckboxes.forEach((checkbox) => {
      const spellItem = checkbox.closest('.spell-item');
      if (!spellItem) return;
      const spellLevel = spellItem.dataset.spellLevel;
      const spellSourceClass = checkbox.dataset.sourceClass;
      if (spellLevel === '0' || (spellSourceClass && spellSourceClass !== classIdentifier)) return;
      if (
        spellItem.querySelector('.tag.always-prepared') ||
        spellItem.querySelector('.tag.granted') ||
        spellItem.querySelector('.tag.innate') ||
        spellItem.querySelector('.tag.atwill')
      )
        return;
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
   * Update spell counts in level headings
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
   * Apply collapsed state to spell levels from user flags
   */
  applyCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, FLAGS.COLLAPSED_LEVELS) || [];
    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) levelContainer.classList.add('collapsed');
    }
  }

  /**
   * Set up cantrip-specific UI elements
   */
  setupCantripUI() {
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent) return;
    const cantripLevel = activeTabContent.querySelector('.spell-level[data-level="0"]');
    if (cantripLevel) {
      this.setupCantripLocks(false, true);
      if (this.app.wizardManager?.isWizard && this.app._isLongRest) {
        const classRules = RuleSetManager.getClassRules(this.app.actor, 'wizard');
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
      this.setupSpellLocks(true);
      this._cantripUIInitialized = true;
    }
  }

  /**
   * Update cantrip counter display using cached max values
   * @param {HTMLElement} [cantripLevel] - The cantrip level container
   * @param {boolean} [skipLockSetup=false] - Whether to skip calling setupCantripLocks
   * @returns {Object} Counter state with current and max values
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
   * Set up cantrip lock states based on selection rules using cached max values
   * @param {boolean} [force=false] - Force update even if no active tab is found
   * @param {boolean} [applyRuleLocks=false] - Whether to apply rule-based locks (vs count-only)
   */
  setupCantripLocks(force = false, applyRuleLocks = false) {
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    if (!activeTab && !force) return;
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent && !force) return;
    const classIdentifier = activeTabContent?.dataset.classIdentifier;
    if (!classIdentifier && !force) return;
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
        if (applyRuleLocks) this._applyRuleBasedCantripLocks(item, checkbox, isChecked, classIdentifier, settings);
      }
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
    if (settings.behavior !== MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) return;
    const isLevelUp = this.app.spellManager.cantripManager.canBeLeveledUp();
    const isLongRest = this.app._isLongRest;
    const uuid = checkbox.dataset.uuid;
    const preparedByClass = this.app.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    const classSpellKey = `${classIdentifier}:${uuid}`;
    const isSavedAsPrepared = classPreparedSpells.includes(classSpellKey);
    switch (settings.cantripSwapping) {
      case 'none':
        if (isSavedAsPrepared) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedLegacy');
          item.classList.add('cantrip-locked');
        }
        break;
      case 'levelUp':
        if (!isLevelUp && isSavedAsPrepared) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLevelUp');
          item.classList.add('cantrip-locked');
        }
        break;
      case 'longRest':
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
   * Apply class-specific colors and styling (only once during application lifecycle)
   * @returns {Promise<void>}
   */
  async applyClassStyling() {
    if (this._colorApplicationCount > 0) return;
    if (this.app._stateManager.spellcastingClasses) {
      await colorUtils.applyClassColors(this.app._stateManager.spellcastingClasses);
      this._colorApplicationCount++;
    }
  }

  /**
   * Set up spell lock states based on class swapping rules and max limits
   * @param {boolean} [applyRuleLocks=false] - Whether to apply rule-based locks (vs count-only)
   */
  setupSpellLocks(applyRuleLocks = false) {
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    if (!activeTab) return;
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    if (!activeTabContent) return;
    const classIdentifier = activeTabContent?.dataset.classIdentifier;
    if (!classIdentifier) return;
    const settings = this.app.spellManager.getSettings(classIdentifier);
    const classRules = RuleSetManager.getClassRules(this.app.actor, classIdentifier);
    const classData = this.app._stateManager.classSpellData[classIdentifier];
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
      const spellName = checkbox.dataset.name || 'Unknown Spell';
      const spell = { name: spellName, system: { level: parseInt(spellLevel) || 1 }, sourceClass: spellSourceClass, uuid: spellUuid };
      const canChange = this.app.spellManager.canChangeSpellStatus(spell, isChecked, wasPrepared, isLevelUp, isLongRest, classIdentifier, currentPrepared, maxPrepared);
      if (!canChange.allowed) {
        checkbox.disabled = true;
        if (canChange.message) {
          let tooltipText = game.i18n.localize(canChange.message);
          if (canChange.message === 'SPELLBOOK.Preparation.ClassAtMaximum') {
            tooltipText = game.i18n.format('SPELLBOOK.Preparation.ClassAtMaximum', {
              class: classData.className || classIdentifier
            });
          }
          checkbox.dataset.tooltip = tooltipText;
        }
        item.classList.add('spell-locked');
        if (canChange.message === 'SPELLBOOK.Preparation.ClassAtMaximum') item.classList.add('max-prepared');
      }
      if (applyRuleLocks && isChecked && wasPrepared) {
        const ruleLockCheck = this.app.spellManager.canChangeSpellStatus(spell, false, wasPrepared, isLevelUp, isLongRest, classIdentifier, currentPrepared, maxPrepared);
        if (!ruleLockCheck.allowed) {
          checkbox.disabled = true;
          if (ruleLockCheck.message) checkbox.dataset.tooltip = game.i18n.localize(ruleLockCheck.message);
          item.classList.add('spell-locked');
        }
      }
    }
    log(3, `Applied spell locks for ${classIdentifier}, prepared: ${currentPrepared}/${maxPrepared}`);
  }

  /**
   * Apply rule-based locks to a spell based on class swapping rules
   * @param {HTMLElement} item - The spell item element
   * @param {HTMLElement} checkbox - The checkbox element
   * @param {string} classIdentifier - The class identifier
   * @param {Object} classRules - The class-specific rules
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during long rest
   * @private
   */
  _applyRuleBasedSpellLocks(item, checkbox, classIdentifier, classRules, isLevelUp, isLongRest) {
    const spellSwapping = classRules.spellSwapping || 'none';
    switch (spellSwapping) {
      case 'levelUp':
        if (!isLevelUp) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Spells.LockedOutsideLevelUp');
          item.classList.add('spell-locked');
        }
        break;
      case 'longRest':
        if (!isLongRest) {
          checkbox.disabled = true;
          checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Spells.LockedOutsideLongRest');
          item.classList.add('spell-locked');
        }
        break;
      case 'none':
        checkbox.disabled = true;
        checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Spells.LockedNoSwapping');
        item.classList.add('spell-locked');
        break;
    }
  }
}
