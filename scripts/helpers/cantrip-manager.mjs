import { CANTRIP_RULES, ENFORCEMENT_BEHAVIOR, FLAGS, MODULE } from '../constants.mjs';
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
    this.settings = spellManager.getSettings();
    this.maxCantrips = spellManager.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
    this.isWizard = genericUtils.isWizard(actor);
  }

  /**
   * Get the current count of prepared cantrips
   * @returns {number} Currently prepared cantrips count
   */
  getCurrentCount() {
    return this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).length;
  }

  /**
   * Check if cantrips can be changed during level-up
   * @returns {boolean} Whether cantrips can be changed
   */
  canBeLeveledUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = this.actor.system.details.level;
    const currentMax = this.spellManager.getMaxAllowed();
    return (previousLevel === 0 && currentLevel > 0) || ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);
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
      const currentMax = this.spellManager.getMaxAllowed();
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
   * @returns {Object} Status object with allowed and message properties
   */
  canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount = null) {
    if (spell.system.level !== 0) return { allowed: true };

    const spellName = spell.name || 'unknown cantrip';
    const { rules, behavior } = this.settings;

    if (behavior === ENFORCEMENT_BEHAVIOR.UNENFORCED || behavior === ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      if (behavior === ENFORCEMENT_BEHAVIOR.NOTIFY_GM && isChecked) {
        const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount();
        if (currentCount >= this.maxCantrips) {
          ui.notifications.warn(game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached'));
        }
      }
      return { allowed: true };
    }

    if (isChecked) {
      const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount();
      if (currentCount >= this.maxCantrips) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.MaximumReached' };
      }
    }

    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest);

    if (rules === CANTRIP_RULES.MODERN_LONG_REST) {
      if (!this.isWizard) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.WizardRuleOnly' };
      }
      if (!isLongRest && !isChecked) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLongRest' };
      }
      if (isLongRest) {
        if (!isChecked && trackingData.hasUnlearned && trackingData.unlearned !== spell.uuid && trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
        }
        if (isChecked && trackingData.hasLearned && trackingData.learned !== spell.uuid && !trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
        }
        if (isChecked && !trackingData.hasUnlearned && !trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.MustUnlearnFirst' };
        }
      }
    } else if (rules === CANTRIP_RULES.MODERN_LEVEL_UP) {
      if (!isLevelUp && !isChecked) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLevelUp' };
      }
      if (isLevelUp) {
        if (!isChecked && trackingData.hasUnlearned && trackingData.unlearned !== spell.uuid && trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
        }
        if (isChecked && trackingData.hasLearned && trackingData.learned !== spell.uuid && !trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
        }
        if (isChecked && !trackingData.hasUnlearned && !trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.MustUnlearnFirst' };
        }
      }
    } else if (rules === CANTRIP_RULES.LEGACY) {
      if (!isChecked) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedLegacy' };
      }
    }

    return { allowed: true };
  }

  /**
   * Get the current swap tracking data
   * @param {boolean} isLevelUp - Whether this is a level-up context
   * @param {boolean} isLongRest - Whether this is a long rest context
   * @returns {Object} Tracking data
   * @private
   */
  _getSwapTrackingData(isLevelUp, isLongRest) {
    let flagName;
    if (isLevelUp) {
      flagName = FLAGS.CANTRIP_SWAP_TRACKING + '.levelUp';
    } else if (isLongRest) {
      flagName = FLAGS.CANTRIP_SWAP_TRACKING + '.longRest';
    } else {
      return { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
    }

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
   */
  trackCantripChange(spell, isChecked, isLevelUp, isLongRest) {
    if (spell.system.level !== 0) return;

    const { rules } = this.settings;
    const spellUuid = genericUtils.getSpellUuid(spell);

    if (!isLevelUp && !isLongRest) return;
    if (rules === CANTRIP_RULES.LEGACY) return;
    if (rules === CANTRIP_RULES.MODERN_LONG_REST && !this.isWizard) return;

    const flagName = isLevelUp ? FLAGS.CANTRIP_SWAP_TRACKING + '.levelUp' : FLAGS.CANTRIP_SWAP_TRACKING + '.longRest';
    let tracking = this.actor.getFlag(MODULE.ID, flagName);

    if (!tracking) {
      const preparedCantrips = this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared).map((i) => genericUtils.getSpellUuid(i));

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
    const flagName = isLevelUp ? FLAGS.CANTRIP_SWAP_TRACKING + '.levelUp' : FLAGS.CANTRIP_SWAP_TRACKING + '.longRest';
    await this.actor.unsetFlag(MODULE.ID, flagName);

    if (isLevelUp) {
      const currentLevel = this.actor.system.details.level;
      const currentMax = this.spellManager.getMaxAllowed();
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
    const currentMax = this.spellManager.getMaxAllowed();
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
   */
  lockCantripCheckboxes(cantripItems, isLevelUp, isLongRest, currentCount) {
    const { rules, behavior } = this.settings;
    const isAtMax = currentCount >= this.maxCantrips;
    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest);

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

      if (behavior !== ENFORCEMENT_BEHAVIOR.ENFORCED) continue;

      switch (rules) {
        case CANTRIP_RULES.LEGACY:
          if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedLegacy');
            item.classList.add('cantrip-locked');
          }
          break;

        case CANTRIP_RULES.MODERN_LEVEL_UP:
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

        case CANTRIP_RULES.MODERN_LONG_REST:
          if (!this.isWizard) {
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
    if (this.settings.behavior !== ENFORCEMENT_BEHAVIOR.NOTIFY_GM) return;

    const currentCantrips = this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).map((i) => i.name);

    const originalCantripsSet = new Set(currentCantrips);
    for (const { name } of changes.removed) originalCantripsSet.add(name);
    for (const { name } of changes.added) originalCantripsSet.delete(name);
    const originalCantrips = Array.from(originalCantripsSet).sort();

    const newCantripsSet = new Set(originalCantrips);
    for (const { name } of changes.removed) newCantripsSet.delete(name);
    for (const { name } of changes.added) newCantripsSet.add(name);
    const newCantrips = Array.from(newCantripsSet).sort();

    let content = `<h3>${game.i18n.format('SPELLBOOK.Cantrips.ChangeNotification', { name: this.actor.name })}</h3>`;
    if (originalCantrips.length > 0) content += `<p><strong>Original Cantrips:</strong> ${originalCantrips.join(', ')}</p>`;
    if (changes.removed.length > 0) content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Removed')}:</strong> ${changes.removed.map((c) => c.name).join(', ')}</p>`;
    if (changes.added.length > 0) content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Added')}:</strong> ${changes.added.map((c) => c.name).join(', ')}</p>`;
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

    if (allTracking.longRest) delete allTracking.longRest;

    if (Object.keys(allTracking).length === 0) {
      await this.actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
    } else {
      await this.actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, allTracking);
    }
  }
}
