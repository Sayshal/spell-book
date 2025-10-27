/**
 * Cantrip Management and Swap Mechanics
 *
 * Manages cantrip-specific functionality including preparation limits, swap mechanics,
 * level-up detection, and long rest processing. This class serves as the single source
 * of truth for all cantrip calculations and state management within the Spell Book module.
 *
 * @module Managers/Cantrips
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from './_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;
const { BooleanField, StringField, ArrayField } = foundry.data.fields;
const { DataModel } = foundry.abstract;

/**
 * Cantrip swap tracking data structure for managing changes during level-up or long rest.
 */
class CantripSwapTrackingData extends DataModel {
  /** @inheritdoc */
  static defineSchema() {
    return {
      hasUnlearned: new BooleanField({ initial: false }),
      unlearned: new StringField({ nullable: true, initial: null }),
      hasLearned: new BooleanField({ initial: false }),
      learned: new StringField({ nullable: true, initial: null }),
      originalChecked: new ArrayField(new StringField(), { initial: [] })
    };
  }
}

/**
 * Cantrip validation result for preparation attempts.
 */
class CantripValidationResult extends DataModel {
  /** @inheritdoc */
  static defineSchema() {
    return {
      allowed: new BooleanField({ initial: false }),
      message: new StringField({ nullable: true, initial: null })
    };
  }
}

/**
 * Cantrip Manager - Single source of truth for cantrip calculations and swap mechanics.
 */
export class Cantrips {
  /**
   * Create a new Cantrips instance.
   * @param {Actor5e} actor - The actor to manage cantrips for
   * @param {SpellManager} spellManager - The associated SpellManager instance
   */
  constructor(actor, spellManager) {
    /** @type {Actor5e} The actor being managed */
    this.actor = actor;

    /** @type {SpellManager} The associated spell manager */
    this.spellManager = spellManager;

    /** @type {boolean} Whether this actor has wizard levels */
    this.isWizard = DataUtils.isWizard(actor);

    /** @type {Map<string, number>} Cached maximum cantrips by class identifier */
    this._maxCantripsByClass = new Map();

    /** @type {number} Cached total maximum cantrips across all classes */
    this._totalMaxCantrips = 0;

    /** @type {boolean} Whether the cache has been initialized */
    this._cacheInitialized = false;

    // Initialize cache on construction
    this._initializeCache();
    log(3, 'Cantrips instance created.', { actorId: actor.id, isWizard: this.isWizard });
  }

  /**
   * Initialize the cantrip calculation cache.
   * @private
   * @returns {void}
   */
  _initializeCache() {
    log(3, 'Initializing cantrip cache.', { actorId: this.actor.id });
    if (this._cacheInitialized) return;
    this._maxCantripsByClass.clear();
    this._totalMaxCantrips = 0;
    if (!this.actor.spellcastingClasses) {
      this._cacheInitialized = true;
      return;
    }
    for (const identifier of Object.keys(this.actor.spellcastingClasses)) {
      const spellcastingConfig = DataUtils.getSpellcastingConfigForClass(this.actor, identifier);
      if (!spellcastingConfig) continue;
      const maxCantrips = this._calculateMaxCantripsForClass(identifier);
      this._maxCantripsByClass.set(identifier, maxCantrips);
      this._totalMaxCantrips += maxCantrips;
    }
    this._cacheInitialized = true;
    log(3, 'Cantrip cache initialized.', { actorId: this.actor.id, totalMaxCantrips: this._totalMaxCantrips });
  }

  /**
   * Clear the cantrip calculation cache.
   * @returns {void}
   */
  clearCache() {
    log(3, 'Clearing cantrip cache.', { actorId: this.actor.id });
    this._maxCantripsByClass.clear();
    this._totalMaxCantrips = 0;
    this._cacheInitialized = false;
  }

  /**
   * Get maximum cantrips for a specific class using cached values.
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Maximum cantrips allowed for this class
   */
  _getMaxCantripsForClass(classIdentifier) {
    if (!this._cacheInitialized) this._initializeCache();
    const result = this._maxCantripsByClass.get(classIdentifier) || 0;
    log(3, 'Getting max cantrips for class.', { actorId: this.actor.id, classIdentifier, maxCantrips: result });
    return result;
  }

  /**
   * Get total maximum cantrips across all classes using cached values.
   * @returns {number} Total maximum cantrips across all classes
   */
  _getTotalMaxCantrips() {
    if (!this._cacheInitialized) this._initializeCache();
    log(3, 'Getting total max cantrips.', { actorId: this.actor.id, totalMaxCantrips: this._totalMaxCantrips });
    return this._totalMaxCantrips;
  }

  /**
   * Calculate maximum cantrips for a specific class.
   * @private
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Maximum cantrips for this class
   */
  _calculateMaxCantripsForClass(classIdentifier) {
    log(3, 'Calculating max cantrips for class.', { actorId: this.actor.id, classIdentifier });
    const cantripScaleValuesSetting = game.settings.get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES);
    const cantripScaleKeys = cantripScaleValuesSetting
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    let baseCantrips = 0;
    const scaleValues = DataUtils.getScaleValuesForClass(this.actor, classIdentifier);
    if (scaleValues) {
      for (const key of cantripScaleKeys) {
        const cantripValue = scaleValues[key]?.value;
        if (cantripValue !== undefined) {
          baseCantrips = cantripValue;

          break;
        }
      }
    }
    if (baseCantrips === 0) return 0;
    const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
    if (classRules && classRules.showCantrips === false) return 0;
    const preparationBonus = classRules?.cantripPreparationBonus || 0;
    const totalMaxCantrips = Math.max(0, baseCantrips + preparationBonus);
    log(3, 'Calculated max cantrips for class.', { actorId: this.actor.id, classIdentifier, baseCantrips, preparationBonus, totalMaxCantrips });
    return totalMaxCantrips;
  }

  /**
   * Get the current count of prepared cantrips for a specific class.
   * @param {string|null} [classIdentifier=null] - The class identifier, or null for all classes
   * @returns {number} Currently prepared cantrips count
   */
  getCurrentCount(classIdentifier = null) {
    if (!classIdentifier) {
      const count = this.actor.items.reduce((count, i) => {
        return count + (i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1 ? 1 : 0);
      }, 0);
      log(3, 'Getting current cantrip count (all classes).', { actorId: this.actor.id, count });
      return count;
    }
    const count = this.actor.items.reduce((count, i) => {
      return count + (i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1 && (i.system.sourceClass === classIdentifier || i.sourceClass === classIdentifier) ? 1 : 0);
    }, 0);
    log(3, 'Getting current cantrip count for class.', { actorId: this.actor.id, classIdentifier, count });
    return count;
  }

  /**
   * Check if cantrips can be changed during level-up.
   * @returns {boolean} Whether cantrips can be changed due to level-up
   */
  canBeLeveledUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = this.actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips();
    const result = (previousLevel === 0 && currentLevel > 0) || ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);
    log(3, 'Checking if cantrips can be leveled up.', { actorId: this.actor.id, previousLevel, previousMax, currentLevel, currentMax, result });
    return result;
  }

  /**
   * Check for level-up that affects cantrips.
   * @returns {boolean} Whether a level-up cantrip change is detected
   */
  checkForLevelUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = this.actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips();
    const result = (previousLevel === 0 && currentLevel > 0) || ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);
    log(3, 'Checking for level-up.', { actorId: this.actor.id, previousLevel, previousMax, currentLevel, currentMax, result });
    return result;
  }

  /**
   * Validate cantrip preparation based on current rules and limits.
   * @param {Item5e} spell - The cantrip being validated
   * @param {boolean} isChecked - Whether attempting to prepare (true) or unprepare (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during long rest
   * @param {number|null} [uiCantripCount=null] - Current UI cantrip count for optimization
   * @param {string} classIdentifier - The class identifier
   * @returns {CantripValidationResult} Validation result with allowed status and error message
   */
  canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount, classIdentifier) {
    log(3, 'Validating cantrip status change.', { actorId: this.actor.id, spellId: spell.id, isChecked, isLevelUp, isLongRest, classIdentifier });
    if (spell.system.level !== 0) return new CantripValidationResult({ allowed: true });
    if (!classIdentifier) classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    if (!classIdentifier) {
      return new CantripValidationResult({ allowed: true });
    }
    const settings = this.spellManager.getSettings(classIdentifier);
    if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.UNENFORCED || settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM && isChecked) {
        const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount(classIdentifier);
        const maxCantrips = this._getMaxCantripsForClass(classIdentifier);
        if (currentCount >= maxCantrips) {
          ui.notifications.clear();
          ui.notifications.info(game.i18n.format('SPELLBOOK.Notifications.OverLimitWarning', { type: 'cantrips', current: currentCount + 1, max: maxCantrips }));
        }
      }
      return new CantripValidationResult({ allowed: true });
    }
    if (isChecked) {
      const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount(classIdentifier);
      const maxCantrips = this._getMaxCantripsForClass(classIdentifier);
      if (currentCount >= maxCantrips) {
        log(3, 'Cantrip maximum reached.', { actorId: this.actor.id, classIdentifier, currentCount, maxCantrips });
        return new CantripValidationResult({ allowed: false, message: 'SPELLBOOK.Cantrips.MaximumReached' });
      }
    }
    const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
    const cantripSwapping = classRules.cantripSwapping || 'none';
    log(3, 'Checking cantrip swapping rules.', { actorId: this.actor.id, classIdentifier, cantripSwapping });
    switch (cantripSwapping) {
      case 'none':
        return new CantripValidationResult({ allowed: false, message: 'SPELLBOOK.Cantrips.LockedLegacy' });
      case 'levelUp':
        if (!isLevelUp) return new CantripValidationResult({ allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLevelUp' });
        break;
      case 'longRest':
        const isWizard = classIdentifier === MODULE.CLASS_IDENTIFIERS.WIZARD;
        if (!isWizard) return new CantripValidationResult({ allowed: false, message: 'SPELLBOOK.Cantrips.WizardRuleOnly' });
        if (!isLongRest) return new CantripValidationResult({ allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLongRest' });
        break;
    }
    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest, classIdentifier);
    const spellUuid = spell.uuid;
    if ((isLevelUp && cantripSwapping === 'levelUp') || (isLongRest && cantripSwapping === 'longRest')) {
      if (!isChecked && trackingData.hasUnlearned && trackingData.unlearned !== spellUuid && trackingData.originalChecked.includes(spellUuid)) {
        return new CantripValidationResult({ allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' });
      }
      if (isChecked && trackingData.hasLearned && trackingData.learned !== spellUuid && !trackingData.originalChecked.includes(spellUuid)) {
        return new CantripValidationResult({ allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' });
      }
      if (isChecked && !trackingData.hasUnlearned && !trackingData.originalChecked.includes(spellUuid)) {
        return new CantripValidationResult({ allowed: false, message: 'SPELLBOOK.Cantrips.MustUnlearnFirst' });
      }
    }
    log(3, 'Cantrip status change allowed.', { actorId: this.actor.id, spellId: spell.id });
    return new CantripValidationResult({ allowed: true });
  }

  /**
   * Get the current swap tracking data for the specified context.
   * @private
   * @param {boolean} isLevelUp - Whether this is a level-up context
   * @param {boolean} isLongRest - Whether this is a long rest context
   * @param {string} classIdentifier - The class identifier
   * @returns {CantripSwapTrackingData} Current tracking data
   */
  _getSwapTrackingData(isLevelUp, isLongRest, classIdentifier) {
    log(3, 'Getting swap tracking data.', { actorId: this.actor.id, isLevelUp, isLongRest, classIdentifier });
    if (!isLevelUp && !isLongRest) return new CantripSwapTrackingData();
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    const data = this.actor.getFlag(MODULE.ID, flagName);
    return data ? new CantripSwapTrackingData(data) : new CantripSwapTrackingData();
  }

  /**
   * Track changes to cantrips for swap management.
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being prepared (true) or unprepared (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {string} classIdentifier - The class identifier
   * @returns {void}
   */
  trackCantripChange(spell, isChecked, isLevelUp, isLongRest, classIdentifier) {
    log(3, 'Tracking cantrip change.', { actorId: this.actor.id, spellId: spell.id, isChecked, isLevelUp, isLongRest, classIdentifier });
    if (spell.system.level !== 0) return;
    if (!classIdentifier) {
      classIdentifier = spell.sourceClass || spell.system?.sourceClass;
      if (!classIdentifier) {
        return;
      }
    }
    const settings = this.spellManager.getSettings(classIdentifier);
    const cantripSwapping = settings.cantripSwapping || 'none';
    const spellUuid = spell.uuid;
    if (!isLevelUp && !isLongRest) return;
    if (cantripSwapping === 'none') return;
    if (cantripSwapping === 'longRest' && classIdentifier !== MODULE.CLASS_IDENTIFIERS.WIZARD) return;
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    let trackingData = this.actor.getFlag(MODULE.ID, flagName);
    let tracking = trackingData ? new CantripSwapTrackingData(trackingData) : null;
    if (!tracking) {
      const preparedCantrips = this.actor.items
        .filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1 && (i.sourceClass === classIdentifier || i.system.sourceClass === classIdentifier))
        .map((i) => i.uuid);
      tracking = new CantripSwapTrackingData({ originalChecked: preparedCantrips });
      this.actor.setFlag(MODULE.ID, flagName, tracking.toObject());
    }
    if (!isChecked && tracking.originalChecked.includes(spellUuid)) {
      if (tracking.unlearned === spellUuid) foundry.utils.mergeObject(tracking, { hasUnlearned: false, unlearned: null });
      else foundry.utils.mergeObject(tracking, { hasUnlearned: true, unlearned: spellUuid });
    } else if (isChecked && !tracking.originalChecked.includes(spellUuid)) {
      if (tracking.learned === spellUuid) foundry.utils.mergeObject(tracking, { hasLearned: false, learned: null });
      else foundry.utils.mergeObject(tracking, { hasLearned: true, learned: spellUuid });
    } else if (!isChecked && tracking.learned === spellUuid) foundry.utils.mergeObject(tracking, { hasLearned: false, learned: null });
    else if (isChecked && tracking.unlearned === spellUuid) foundry.utils.mergeObject(tracking, { hasUnlearned: false, unlearned: null });
    this.actor.setFlag(MODULE.ID, flagName, tracking.toObject());
    log(3, 'Cantrip change tracked.', { actorId: this.actor.id, spellUuid });
  }

  /**
   * Complete the cantrip swap process and reset tracking.
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
    log(3, 'Cantrip swap completed.', { actorId: this.actor.id, isLevelUp });
    return true;
  }

  /**
   * Complete the cantrip level-up process.
   * @returns {Promise<boolean>} Success status
   */
  async completeCantripsLevelUp() {
    log(3, 'Completing cantrips level-up.', { actorId: this.actor.id });
    const currentLevel = this.actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips();
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);
    await this.completeCantripSwap(true);
    return true;
  }

  /**
   * Reset all cantrip swap tracking data.
   * @returns {void}
   */
  resetSwapTracking() {
    log(3, 'Resetting swap tracking.', { actorId: this.actor.id });
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
   * Send GM notification with all spell changes and over-limit warnings.
   * @param {NotificationData} notificationData - Combined notification data
   * @returns {Promise<void>}
   */
  async sendNotification(notificationData) {
    const { actorName, classChanges } = notificationData;
    const processedClassChanges = Object.entries(classChanges)
      .map(([key, data]) => {
        const cantripChanges = {
          ...data.cantripChanges,
          removedNames: data.cantripChanges.removed.length > 0 ? data.cantripChanges.removed.join(', ') : null,
          addedNames: data.cantripChanges.added.length > 0 ? data.cantripChanges.added.join(', ') : null,
          hasChanges: data.cantripChanges.added.length > 0 || data.cantripChanges.removed.length > 0
        };
        const spellChanges = {
          ...data.spellChanges,
          removedNames: data.spellChanges.removed.length > 0 ? data.spellChanges.removed.join(', ') : null,
          addedNames: data.spellChanges.added.length > 0 ? data.spellChanges.added.join(', ') : null,
          hasChanges: data.spellChanges.added.length > 0 || data.spellChanges.removed.length > 0
        };
        const overLimits = {
          cantrips: { ...data.overLimits.cantrips, overCount: data.overLimits.cantrips.current - data.overLimits.cantrips.max },
          spells: { ...data.overLimits.spells, overCount: data.overLimits.spells.current - data.overLimits.spells.max }
        };
        const hasChanges = cantripChanges.hasChanges || spellChanges.hasChanges || data.overLimits.cantrips.isOver || data.overLimits.spells.isOver;
        return { classIdentifier: key, ...data, cantripChanges, spellChanges, overLimits, hasChanges };
      })
      .filter((classChange) => classChange.hasChanges);
    if (processedClassChanges.length === 0) return;
    const content = await renderTemplate(TEMPLATES.COMPONENTS.CANTRIP_NOTIFICATION, { actorName, classChanges: processedClassChanges });
    await ChatMessage.create({ content, whisper: game.users.filter((u) => u.isGM).map((u) => u.id), flags: { 'spell-book': { messageType: 'update-report' } } });
    log(3, 'GM notification sent.', { actorId: this.actor.id, changeCount: processedClassChanges.length });
  }
}
