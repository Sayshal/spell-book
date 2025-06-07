import { FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from './rule-set-manager.mjs';

/**
 * Manages cantrip-specific functionality - Single source of truth for cantrip calculations
 */
export class CantripManager {
  /**
   * Create a new CantripManager
   * @param {Actor5e} actor - The actor to manage cantrips for
   * @param {SpellManager} spellManager - The associated SpellManager
   * @param {PlayerSpellBook} [spellbook] - The spellbook application for cached values
   */
  constructor(actor, spellManager, spellbook = null) {
    this.actor = actor;
    this.spellManager = spellManager;
    this.spellbook = spellbook;
    this.isWizard = genericUtils.isWizard(actor);
    this._maxCantripsByClass = new Map();
    this._totalMaxCantrips = 0;
    this._cacheInitialized = false;
    this._initializeCache();
  }

  /**
   * Initialize cantrip calculation cache
   * @private
   */
  _initializeCache() {
    if (this._cacheInitialized) return;
    this._maxCantripsByClass.clear();
    this._totalMaxCantrips = 0;
    const classItems = this.actor.items.filter((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
    for (const classItem of classItems) {
      const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
      const maxCantrips = this._calculateMaxCantripsForClass(classItem, identifier);
      this._maxCantripsByClass.set(identifier, maxCantrips);
      this._totalMaxCantrips += maxCantrips;
      log(3, `Cached max cantrips for ${identifier}: ${maxCantrips}`);
    }
    this._cacheInitialized = true;
    log(3, `Total max cantrips across all classes: ${this._totalMaxCantrips}`);
  }

  /**
   * Clear cantrip calculation cache (call when class rules change)
   */
  clearCache() {
    this._maxCantripsByClass.clear();
    this._totalMaxCantrips = 0;
    this._cacheInitialized = false;
  }

  /**
   * Get max cantrips for a class using cached values when available
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Max cantrips for this class
   */
  _getMaxCantripsForClass(classIdentifier) {
    if (!this._cacheInitialized) this._initializeCache();
    return this._maxCantripsByClass.get(classIdentifier) || 0;
  }

  /**
   * Get total max cantrips across all classes using cached values when available
   * @returns {number} Total max cantrips
   */
  _getTotalMaxCantrips() {
    if (!this._cacheInitialized) this._initializeCache();
    return this._totalMaxCantrips;
  }

  /**
   * Calculate max cantrips for a specific class (extracted from SpellManager.getMaxAllowed)
   * @param {Item5e} classItem - The class item
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Maximum cantrips for this class
   * @private
   */
  _calculateMaxCantripsForClass(classItem, classIdentifier) {
    const cantripScaleValuesSetting = game.settings.get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES);
    const cantripScaleKeys = cantripScaleValuesSetting
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    let baseCantrips = 0;
    if (classItem.scaleValues) {
      for (const key of cantripScaleKeys) {
        const cantripValue = classItem.scaleValues[key]?.value;
        if (cantripValue !== undefined) {
          baseCantrips = cantripValue;
          log(3, `Found cantrip scale value '${key}' = ${baseCantrips} for class ${classIdentifier}`);
          break;
        }
      }
    }
    if (baseCantrips === 0) return 0;
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    if (classRules && classRules.showCantrips === false) return 0;
    const cantripBonus = classRules?.cantripPreparationBonus || 0;
    return Math.max(0, baseCantrips + cantripBonus);
  }

  /**
   * Get settings for a specific class
   * @param {string} classIdentifier - The class identifier
   * @returns {Object} Class-specific settings
   * @private
   */
  _getClassSettings(classIdentifier) {
    return this.spellManager.getSettings(classIdentifier);
  }

  /**
   * Get the current count of prepared cantrips for a specific class
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Currently prepared cantrips count for this class
   */
  getCurrentCount(classIdentifier = null) {
    if (!classIdentifier) {
      return this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).length;
    }
    return this.actor.items.filter(
      (i) =>
        i.type === 'spell' &&
        i.system.level === 0 &&
        i.system.preparation?.prepared &&
        !i.system.preparation?.alwaysPrepared &&
        (i.system.sourceClass === classIdentifier || i.sourceClass === classIdentifier)
    ).length;
  }

  /**
   * Check if cantrips can be changed during level-up
   * @returns {boolean} Whether cantrips can be changed
   */
  canBeLeveledUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = this.actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips();
    return (previousLevel === 0 && currentLevel > 0) || ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);
  }

  /**
   * Check for level-up that affects cantrips
   * @returns {boolean} Whether a level-up cantrip change is detected
   */
  checkForLevelUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = this.actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips();
    return (currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0;
  }

  /**
   * Determine if a cantrip can be changed
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {number} uiCantripCount - Number of checked cantrip boxes in the UI currently
   * @param {string} classIdentifier - The current class identifier
   * @returns {Object} Status object with allowed and message properties
   */
  canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount, classIdentifier) {
    if (spell.system.level !== 0) return { allowed: true };
    if (!classIdentifier) classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    if (!classIdentifier) {
      log(2, `No class identifier for cantrip ${spell.name}, allowing change but may cause issues`);
      return { allowed: true };
    }
    const settings = this._getClassSettings(classIdentifier);
    const spellName = spell.name;
    if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.UNENFORCED || settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM && isChecked) {
        const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount(classIdentifier);
        const maxCantrips = this._getMaxCantripsForClass(classIdentifier);
        if (currentCount >= maxCantrips) {
          ui.notifications.info(game.i18n.format('SPELLBOOK.Notifications.OverLimitWarning', { type: 'cantrips', current: currentCount + 1, max: maxCantrips }));
        }
      }
      return { allowed: true };
    }
    if (isChecked) {
      const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount(classIdentifier);
      const maxCantrips = this._getMaxCantripsForClass(classIdentifier);
      log(3, `Cantrip check: ${spell.name} for class ${classIdentifier}, current: ${currentCount}, max: ${maxCantrips}`);
      if (currentCount >= maxCantrips) return { allowed: false, message: 'SPELLBOOK.Cantrips.MaximumReached' };
      return { allowed: true };
    }
    const cantripSwapping = settings.cantripSwapping || 'none';
    switch (cantripSwapping) {
      case 'none':
        return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedLegacy' };
      case 'levelUp':
        if (!isLevelUp) return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLevelUp' };
        break;
      case 'longRest':
        const isWizard = classIdentifier === MODULE.CLASS_IDENTIFIERS.WIZARD;
        if (!isWizard) return { allowed: false, message: 'SPELLBOOK.Cantrips.WizardRuleOnly' };
        if (!isLongRest) return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLongRest' };
        break;
    }
    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest, classIdentifier);
    const spellUuid = genericUtils.getSpellUuid(spell);
    if ((isLevelUp && cantripSwapping === 'levelUp') || (isLongRest && cantripSwapping === 'longRest')) {
      if (!isChecked && trackingData.hasUnlearned && trackingData.unlearned !== spellUuid && trackingData.originalChecked.includes(spellUuid)) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
      }
      if (isChecked && trackingData.hasLearned && trackingData.learned !== spellUuid && !trackingData.originalChecked.includes(spellUuid)) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
      }
      if (isChecked && !trackingData.hasUnlearned && !trackingData.originalChecked.includes(spellUuid)) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.MustUnlearnFirst' };
      }
    }
    return { allowed: true };
  }

  /**
   * Get the current swap tracking data
   * @param {boolean} isLevelUp - Whether this is a level-up context
   * @param {boolean} isLongRest - Whether this is a long rest context
   * @param {string} classIdentifier - The class identifier
   * @returns {Object} Tracking data
   * @private
   */
  _getSwapTrackingData(isLevelUp, isLongRest, classIdentifier) {
    if (!isLevelUp && !isLongRest) return { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    const data = this.actor.getFlag(MODULE.ID, flagName);
    return data || { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
  }

  /**
   * Track changes to cantrips for swap management
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {string} classIdentifier - The class identifier
   */
  trackCantripChange(spell, isChecked, isLevelUp, isLongRest, classIdentifier) {
    if (spell.system.level !== 0) return;
    if (!classIdentifier) {
      classIdentifier = spell.sourceClass || spell.system?.sourceClass;
      if (!classIdentifier) {
        log(2, `No class identifier for cantrip ${spell.name}, tracking may be inaccurate`);
        return;
      }
    }
    const settings = this._getClassSettings(classIdentifier);
    const cantripSwapping = settings.cantripSwapping || 'none';
    const spellUuid = genericUtils.getSpellUuid(spell);
    if (!isLevelUp && !isLongRest) return;
    if (cantripSwapping === 'none') return;
    if (cantripSwapping === 'longRest' && classIdentifier !== MODULE.CLASS_IDENTIFIERS.WIZARD) return;
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    let tracking = this.actor.getFlag(MODULE.ID, flagName);
    if (!tracking) {
      const preparedCantrips = this.actor.items
        .filter(
          (i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && (i.sourceClass === classIdentifier || i.system.sourceClass === classIdentifier)
        )
        .map((i) => genericUtils.getSpellUuid(i));
      tracking = { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: preparedCantrips };
      this.actor.setFlag(MODULE.ID, flagName, tracking);
    }
    if (!isChecked && tracking.originalChecked.includes(spellUuid)) {
      if (tracking.unlearned === spellUuid) {
        tracking.hasUnlearned = false;
        tracking.unlearned = null;
      } else {
        tracking.hasUnlearned = true;
        tracking.unlearned = spellUuid;
      }
    } else if (isChecked && !tracking.originalChecked.includes(spellUuid)) {
      if (tracking.learned === spellUuid) {
        tracking.hasLearned = false;
        tracking.learned = null;
      } else {
        tracking.hasLearned = true;
        tracking.learned = spellUuid;
      }
    } else if (!isChecked && tracking.learned === spellUuid) {
      tracking.hasLearned = false;
      tracking.learned = null;
    } else if (isChecked && tracking.unlearned === spellUuid) {
      tracking.hasUnlearned = false;
      tracking.unlearned = null;
    }
    this.actor.setFlag(MODULE.ID, flagName, tracking);
  }

  /**
   * Complete the cantrip swap process and reset tracking
   * @param {boolean} isLevelUp - Whether this is completing a level-up swap
   * @returns {Promise<boolean>} Success status
   */
  async completeCantripSwap(isLevelUp) {
    const allTracking = this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};
    const contextKey = isLevelUp ? 'levelUp' : 'longRest';
    for (const classId of Object.keys(allTracking)) {
      if (allTracking[classId] && allTracking[classId][contextKey]) {
        delete allTracking[classId][contextKey];
        if (Object.keys(allTracking[classId]).length === 0) delete allTracking[classId];
      }
    }
    if (Object.keys(allTracking).length === 0) await this.actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
    else await this.actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, allTracking);
    if (isLevelUp) {
      const currentLevel = this.actor.system.details.level;
      const currentMax = this._getTotalMaxCantrips();
      await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
      await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);
    }
    return true;
  }

  /**
   * Complete the cantrip level-up process
   * @returns {Promise<boolean>} Success status
   */
  async completeCantripsLevelUp() {
    const currentLevel = this.actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips();
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);
    await this.completeCantripSwap(true);
    return true;
  }

  /**
   * Lock cantrip checkboxes based on current rules and state
   * @param {NodeList} cantripItems - DOM elements for cantrip items
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {number} currentCount - Current count of prepared cantrips
   * @param {string} classIdentifier - The class identifier
   */
  lockCantripCheckboxes(cantripItems, isLevelUp, isLongRest, currentCount, classIdentifier) {
    if (!classIdentifier) {
      log(2, 'No class identifier provided to lockCantripCheckboxes');
      return;
    }
    const settings = this._getClassSettings(classIdentifier);
    const maxCantrips = this._getMaxCantripsForClass(classIdentifier);
    const isAtMax = currentCount >= maxCantrips;
    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest, classIdentifier);
    for (const item of cantripItems) {
      const checkbox = item.querySelector('dnd5e-checkbox');
      if (!checkbox) continue;
      if (item.querySelector('.tag.always-prepared') || item.querySelector('.tag.granted') || item.querySelector('.tag.innate') || item.querySelector('.tag.atwill')) continue;
      const isChecked = checkbox.checked;
      const uuid = checkbox.dataset.uuid;
      checkbox.disabled = false;
      delete checkbox.dataset.tooltip;
      item.classList.remove('cantrip-locked');
      if (isAtMax && !isChecked) {
        checkbox.disabled = true;
        checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached');
        item.classList.add('cantrip-locked');
        continue;
      }

      if (settings.behavior !== MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) continue;
      const cantripSwapping = settings.cantripSwapping || 'none';
      switch (cantripSwapping) {
        case 'none':
          if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedLegacy');
            item.classList.add('cantrip-locked');
          }
          break;
        case 'levelUp':
          if (isLevelUp) {
            if (trackingData.hasUnlearned && uuid !== trackingData.unlearned && isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
            }
            if (trackingData.hasLearned && uuid !== trackingData.learned && !isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
            }
          } else if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLevelUp');
            item.classList.add('cantrip-locked');
          }
          break;
        case 'longRest':
          const isWizard = classIdentifier === MODULE.CLASS_IDENTIFIERS.WIZARD;
          if (!isWizard) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.WizardRuleOnly');
            item.classList.add('cantrip-locked');
            continue;
          }
          if (isLongRest) {
            if (trackingData.hasUnlearned && uuid !== trackingData.unlearned && isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
            }
            if (trackingData.hasLearned && uuid !== trackingData.learned && !isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
            }
          } else if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLongRest');
            item.classList.add('cantrip-locked');
          }
          break;
      }
    }
  }

  /**
   * Reset all cantrip swap tracking data
   */
  resetSwapTracking() {
    const allTracking = this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};
    for (const classId of Object.keys(allTracking)) {
      if (allTracking[classId] && allTracking[classId].longRest) {
        delete allTracking[classId].longRest;
        if (Object.keys(allTracking[classId]).length === 0) delete allTracking[classId];
      }
    }
    if (Object.keys(allTracking).length === 0) this.actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
    else this.actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, allTracking);
  }

  /**
   * Send comprehensive GM notification with all spell changes and over-limit warnings
   * @param {Object} notificationData - Combined notification data
   * @returns {Promise<void>}
   */
  async sendComprehensiveGMNotification(notificationData) {
    const { actorName, classChanges } = notificationData;
    const hasChanges = Object.values(classChanges).some(
      (classData) =>
        classData.cantripChanges.added.length > 0 || classData.cantripChanges.removed.length > 0 || classData.overLimits.cantrips.isOver || classData.overLimits.spells.isOver
    );
    if (!hasChanges) return;
    let content = `<h2>${game.i18n.format('SPELLBOOK.Notifications.ComprehensiveTitle', { name: actorName })}</h2>`;
    for (const [classIdentifier, classData] of Object.entries(classChanges)) {
      const { className, cantripChanges, overLimits } = classData;
      if (cantripChanges.added.length === 0 && cantripChanges.removed.length === 0 && !overLimits.cantrips.isOver && !overLimits.spells.isOver) continue;
      content += `<h3>${className}</h3>`;
      if (cantripChanges.added.length > 0 || cantripChanges.removed.length > 0) {
        content += `<p><strong>${game.i18n.localize('SPELLBOOK.Notifications.CantripChanges')}:</strong></p><ul>`;
        if (cantripChanges.removed.length > 0) {
          content += `<li><strong>${game.i18n.localize('SPELLBOOK.Notifications.Removed')}:</strong> ${cantripChanges.removed.map((c) => c.name).join(', ')}</li>`;
        }
        if (cantripChanges.added.length > 0) {
          content += `<li><strong>${game.i18n.localize('SPELLBOOK.Notifications.Added')}:</strong> ${cantripChanges.added.map((c) => c.name).join(', ')}</li>`;
        }
        content += `</ul>`;
      }
      if (overLimits.cantrips.isOver) {
        content += `<p><strong>${game.i18n.localize('SPELLBOOK.Notifications.CantripOverLimit')}:</strong> ${overLimits.cantrips.current}/${overLimits.cantrips.max} (${overLimits.cantrips.current - overLimits.cantrips.max} over)</p>`;
      }
      if (overLimits.spells.isOver) {
        content += `<p><strong>${game.i18n.localize('SPELLBOOK.Notifications.SpellOverLimit')}:</strong> ${overLimits.spells.current}/${overLimits.spells.max} (${overLimits.spells.current - overLimits.spells.max} over)</p>`;
      }
      content += `<hr>`;
    }
    await ChatMessage.create({ content: content, whisper: game.users.filter((u) => u.isGM).map((u) => u.id) });
  }
}
