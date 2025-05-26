import { CLASS_IDENTIFIERS, ENFORCEMENT_BEHAVIOR, FLAGS, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as genericUtils from './generic-utils.mjs';

/**
 * Manages cantrip-specific functionality
 */
export class CantripManager {
  /**
   * Create a new CantripManager
   * @param {Actor5e} actor - The actor to manage cantrips for
   * @param {SpellManager} spellManager - The associated SpellManager
   */
  constructor(actor, spellManager) {
    this.actor = actor;
    this.spellManager = spellManager;
    this.isWizard = genericUtils.isWizard(actor);
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
      // Fallback to total count if no class specified
      return this.actor.items.filter(
        (i) =>
          i.type === 'spell' &&
          i.system.level === 0 &&
          i.system.preparation?.prepared &&
          !i.system.preparation?.alwaysPrepared
      ).length;
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
    // Note: getMaxAllowed needs classIdentifier now, but for backwards compatibility we'll use total
    const currentMax = this._getTotalMaxCantrips();
    return (
      (previousLevel === 0 && currentLevel > 0) ||
      ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0)
    );
  }

  /**
   * Get total max cantrips across all classes (for backwards compatibility)
   * @returns {number} Total max cantrips
   * @private
   */
  _getTotalMaxCantrips() {
    // Get all spellcasting classes and sum their cantrip maxes
    const classItems = this.actor.items.filter(
      (i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none'
    );

    let total = 0;
    for (const classItem of classItems) {
      const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
      total += this.spellManager.getMaxAllowed(identifier);
    }
    return total;
  }

  /**
   * Check for level-up that affects cantrips
   * @returns {boolean} Whether a level-up cantrip change is detected
   */
  checkForLevelUp() {
    try {
      const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
      const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
      const currentLevel = this.actor.system.details.level;
      const currentMax = this._getTotalMaxCantrips();
      return (currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0;
    } catch (error) {
      log(1, 'Error checking for cantrip level up:', error);
      return false;
    }
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
  canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount = null, classIdentifier = null) {
    if (spell.system.level !== 0) return { allowed: true };

    // If no class identifier provided, use spell's source class
    if (!classIdentifier) {
      classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    }

    // If still no class identifier, allow the change but warn
    if (!classIdentifier) {
      log(2, `No class identifier for cantrip ${spell.name}, allowing change but may cause issues`);
      return { allowed: true };
    }

    // Get class-specific settings
    const settings = this._getClassSettings(classIdentifier);
    const spellName = spell.name || 'unknown cantrip';

    if (settings.behavior === ENFORCEMENT_BEHAVIOR.UNENFORCED || settings.behavior === ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      if (settings.behavior === ENFORCEMENT_BEHAVIOR.NOTIFY_GM && isChecked) {
        const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount(classIdentifier);
        const maxCantrips = this.spellManager.getMaxAllowed(classIdentifier);
        if (currentCount >= maxCantrips) {
          ui.notifications.warn(game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached'));
        }
      }
      return { allowed: true };
    }

    // Always check count limits when trying to check a cantrip
    if (isChecked) {
      const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount(classIdentifier);
      const maxCantrips = this.spellManager.getMaxAllowed(classIdentifier);

      log(
        3,
        `Cantrip check: ${spell.name} for class ${classIdentifier}, current: ${currentCount}, max: ${maxCantrips}`
      );

      if (currentCount >= maxCantrips) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.MaximumReached' };
      }
      // For checking cantrips during UI interaction, only apply count limits
      // Rule-based restrictions will be applied after saving
      return { allowed: true };
    }

    // For unchecking, apply class-specific cantrip swapping rules
    const cantripSwapping = settings.cantripSwapping || 'none';

    switch (cantripSwapping) {
      case 'none': // Legacy - can't uncheck once checked
        return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedLegacy' };

      case 'levelUp': // Can only change during level up
        if (!isLevelUp) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLevelUp' };
        }
        break;

      case 'longRest': // Can only change during long rest (wizard only)
        const isWizard = classIdentifier === CLASS_IDENTIFIERS.WIZARD;
        if (!isWizard) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.WizardRuleOnly' };
        }
        if (!isLongRest) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLongRest' };
        }
        break;
    }

    // Apply swap tracking restrictions if in the right context
    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest, classIdentifier);
    const spellUuid = genericUtils.getSpellUuid(spell);

    if ((isLevelUp && cantripSwapping === 'levelUp') || (isLongRest && cantripSwapping === 'longRest')) {
      if (
        !isChecked &&
        trackingData.hasUnlearned &&
        trackingData.unlearned !== spellUuid &&
        trackingData.originalChecked.includes(spellUuid)
      ) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
      }
      if (
        isChecked &&
        trackingData.hasLearned &&
        trackingData.learned !== spellUuid &&
        !trackingData.originalChecked.includes(spellUuid)
      ) {
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
    if (!isLevelUp && !isLongRest) {
      return { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
    }

    const flagName =
      isLevelUp ?
        `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp`
      : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;

    const data = this.actor.getFlag(MODULE.ID, flagName);
    return (
      data || {
        hasUnlearned: false,
        unlearned: null,
        hasLearned: false,
        learned: null,
        originalChecked: []
      }
    );
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

    // Default to spell's source class if not provided
    if (!classIdentifier) {
      classIdentifier = spell.sourceClass || spell.system?.sourceClass;
      if (!classIdentifier) {
        log(2, `No class identifier for cantrip ${spell.name}, tracking may be inaccurate`);
        return;
      }
    }

    // Get class-specific settings
    const settings = this._getClassSettings(classIdentifier);
    const cantripSwapping = settings.cantripSwapping || 'none';
    const spellUuid = genericUtils.getSpellUuid(spell);

    if (!isLevelUp && !isLongRest) return;
    if (cantripSwapping === 'none') return;
    if (cantripSwapping === 'longRest' && classIdentifier !== CLASS_IDENTIFIERS.WIZARD) return;

    // Use class-specific tracking flag
    const flagName =
      isLevelUp ?
        `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp`
      : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;

    let tracking = this.actor.getFlag(MODULE.ID, flagName);

    if (!tracking) {
      // Get cantrips prepared for this specific class
      const preparedCantrips = this.actor.items
        .filter(
          (i) =>
            i.type === 'spell' &&
            i.system.level === 0 &&
            i.system.preparation?.prepared &&
            (i.sourceClass === classIdentifier || i.system.sourceClass === classIdentifier)
        )
        .map((i) => genericUtils.getSpellUuid(i));

      tracking = {
        hasUnlearned: false,
        unlearned: null,
        hasLearned: false,
        learned: null,
        originalChecked: preparedCantrips
      };
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
    // Clear tracking for all classes
    const allTracking = this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};
    const contextKey = isLevelUp ? 'levelUp' : 'longRest';

    // Remove the specific context tracking for all classes
    for (const classId of Object.keys(allTracking)) {
      if (allTracking[classId] && allTracking[classId][contextKey]) {
        delete allTracking[classId][contextKey];
        if (Object.keys(allTracking[classId]).length === 0) {
          delete allTracking[classId];
        }
      }
    }

    if (Object.keys(allTracking).length === 0) {
      await this.actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
    } else {
      await this.actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, allTracking);
    }

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
    const maxCantrips = this.spellManager.getMaxAllowed(classIdentifier);
    const isAtMax = currentCount >= maxCantrips;
    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest, classIdentifier);

    for (const item of cantripItems) {
      const checkbox = item.querySelector('dnd5e-checkbox');
      if (!checkbox) continue;

      if (item.querySelector('.tag.always-prepared') || item.querySelector('.tag.granted')) continue;

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

      if (settings.behavior !== ENFORCEMENT_BEHAVIOR.ENFORCED) continue;

      // Apply class-specific cantrip swapping rules
      const cantripSwapping = settings.cantripSwapping || 'none';

      switch (cantripSwapping) {
        case 'none': // Legacy
          if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedLegacy');
            item.classList.add('cantrip-locked');
          }
          break;

        case 'levelUp': // Modern level-up rules
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

        case 'longRest': // Modern long-rest rules (wizard only)
          const isWizard = classIdentifier === CLASS_IDENTIFIERS.WIZARD;
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
   * Notify GM about cantrip changes (if setting enabled)
   * @param {Object} changes - Information about cantrip changes
   * @returns {Promise<void>}
   */
  async notifyGMOfCantripChanges(changes) {
    if (changes.added.length === 0 && changes.removed.length === 0) return;

    // Use global behavior setting for notifications
    const globalBehavior =
      this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) ||
      game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) ||
      ENFORCEMENT_BEHAVIOR.NOTIFY_GM;

    if (globalBehavior !== ENFORCEMENT_BEHAVIOR.NOTIFY_GM) return;

    const currentCantrips = this.actor.items
      .filter(
        (i) =>
          i.type === 'spell' &&
          i.system.level === 0 &&
          i.system.preparation?.prepared &&
          !i.system.preparation?.alwaysPrepared
      )
      .map((i) => i.name);

    const originalCantripsSet = new Set(currentCantrips);
    for (const { name } of changes.removed) originalCantripsSet.add(name);
    for (const { name } of changes.added) originalCantripsSet.delete(name);
    const originalCantrips = Array.from(originalCantripsSet).sort();

    const newCantripsSet = new Set(originalCantrips);
    for (const { name } of changes.removed) newCantripsSet.delete(name);
    for (const { name } of changes.added) newCantripsSet.add(name);
    const newCantrips = Array.from(newCantripsSet).sort();

    let content = `<h3>${game.i18n.format('SPELLBOOK.Cantrips.ChangeNotification', { name: this.actor.name })}</h3>`;
    if (originalCantrips.length > 0)
      content += `<p><strong>Original Cantrips:</strong> ${originalCantrips.join(', ')}</p>`;
    if (changes.removed.length > 0)
      content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Removed')}:</strong> ${changes.removed.map((c) => c.name).join(', ')}</p>`;
    if (changes.added.length > 0)
      content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Added')}:</strong> ${changes.added.map((c) => c.name).join(', ')}</p>`;
    if (newCantrips.length > 0) content += `<p><strong>New Cantrips:</strong> ${newCantrips.join(', ')}</p>`;

    ChatMessage.create({
      content: content,
      whisper: game.users.filter((u) => u.isGM).map((u) => u.id)
    });
  }

  /**
   * Reset all cantrip swap tracking data
   * @returns {Promise<void>}
   */
  async resetSwapTracking() {
    const allTracking = this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};

    // Clear longRest tracking for all classes
    for (const classId of Object.keys(allTracking)) {
      if (allTracking[classId] && allTracking[classId].longRest) {
        delete allTracking[classId].longRest;
        if (Object.keys(allTracking[classId]).length === 0) {
          delete allTracking[classId];
        }
      }
    }

    if (Object.keys(allTracking).length === 0) {
      await this.actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
    } else {
      await this.actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, allTracking);
    }
  }
}
