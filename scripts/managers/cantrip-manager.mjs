import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from './_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Cantrip enforcement behaviors
 * @typedef {"none" | "levelUp" | "longRest"} CantripSwappingMode
 */

/**
 * Result of checking whether a cantrip change is allowed
 * @typedef {Object} CantripChangeResult
 * @property {boolean} allowed Whether the change is allowed
 * @property {string} [message] Optional i18n message key for rejections
 */

/**
 * Data tracked for a single cantrip swap session
 * @typedef {Object} SwapTrackingData
 * @property {boolean} hasUnlearned Whether a cantrip was unlearned
 * @property {string|null} unlearned The UUID of the unlearned spell
 * @property {boolean} hasLearned Whether a cantrip was learned
 * @property {string|null} learned The UUID of the learned spell
 * @property {string[]} originalChecked UUIDs of spells originally prepared
 */

/**
 * Shape of notification data passed to GM notifications
 * @typedef {Object} GMNotificationData
 * @property {string} actorName Actor's name
 * @property {Object.<string, GMClassChange>} classChanges Per-class change data
 */

/**
 * Per-class notification change data
 * @typedef {Object} GMClassChange
 * @property {string} className The display name of the class
 * @property {CantripChangeDetails} cantripChanges Added/removed cantrip data
 * @property {OverLimitData} overLimits Cantrip/spell over-limit data
 * @property {boolean} hasChanges Whether this class has any changes to report
 */

/**
 * Detailed cantrip change information for notifications
 * @typedef {Object} CantripChangeDetails
 * @property {SpellChangeItem[]} added Array of added cantrips
 * @property {SpellChangeItem[]} removed Array of removed cantrips
 * @property {string|null} addedNames Comma-separated names of added cantrips
 * @property {string|null} removedNames Comma-separated names of removed cantrips
 * @property {boolean} hasChanges Whether there are any cantrip changes
 */

/**
 * Spell change item for notifications
 * @typedef {Object} SpellChangeItem
 * @property {string} name The spell name
 * @property {string} uuid The spell UUID
 */

/**
 * Over-limit tracking data for spells and cantrips
 * @typedef {Object} OverLimitData
 * @property {LimitInfo} cantrips Cantrip limit information
 * @property {LimitInfo} spells Spell limit information
 */

/**
 * Limit information for a specific spell type
 * @typedef {Object} LimitInfo
 * @property {boolean} isOver Whether the limit is exceeded
 * @property {number} current Current count
 * @property {number} max Maximum allowed
 * @property {number} overCount How many over the limit (current - max)
 */

/**
 * Foundry VTT scale values for a class
 * @typedef {Object} ClassScaleValues
 * @property {Object.<string, ScaleValueEntry>} [key] Scale value entries by key
 */

/**
 * Individual scale value entry
 * @typedef {Object} ScaleValueEntry
 * @property {number} value The numeric scale value
 */

/**
 * Class-specific spell rules configuration
 * @typedef {Object} ClassRules
 * @property {boolean} [showCantrips] Whether to show cantrips for this class
 * @property {number} [cantripPreparationBonus] Bonus cantrips that can be prepared
 * @property {CantripSwappingMode} [cantripSwapping] When cantrips can be swapped
 */

/**
 * Foundry VTT Item5e spell object
 * @typedef {Object} Item5e
 * @property {string} name The spell name
 * @property {string} type The item type ('spell')
 * @property {SpellSystemData} system The spell's system data
 * @property {string} [sourceClass] The source class identifier
 * @property {string} uuid The spell's UUID
 */

/**
 * Spell system data structure
 * @typedef {Object} SpellSystemData
 * @property {number} level The spell level (0 for cantrips)
 * @property {number} prepared Preparation status (0=unprepared, 1=prepared)
 * @property {string} [sourceClass] The source class identifier
 */

/**
 * Foundry VTT Actor5e object
 * @typedef {Object} Actor5e
 * @property {ActorSystemData} system The actor's system data
 * @property {Collection} items The actor's items collection
 * @property {Object} spellcastingClasses Spellcasting class data
 * @property {Function} getFlag Get actor flag data
 * @property {Function} setFlag Set actor flag data
 * @property {Function} unsetFlag Remove actor flag data
 */

/**
 * Actor system data structure
 * @typedef {Object} ActorSystemData
 * @property {ActorDetails} details Actor details including level
 */

/**
 * Actor details structure
 * @typedef {Object} ActorDetails
 * @property {number} level The actor's character level
 */

/**
 * SpellManager reference for type checking
 * @typedef {Object} SpellManager
 * @property {Function} getSettings Get spell settings for a class
 */

/**
 * Manages cantrip-specific functionality - Single source of truth for cantrip calculations
 */
export class CantripManager {
  /**
   * Create a new CantripManager
   * @param {Actor5e} actor The D&D 5e actor this manager handles
   * @param {SpellManager} spellManager Reference to the spell manager instance
   * @todo - Replace `isWizard` checks with `this.isWizard` wherever possible.
   */
  constructor(actor, spellManager) {
    /** @type {Actor5e} The actor this manager handles */
    this.actor = actor;
    /** @type {SpellManager} The associated SpellManager */
    this.spellManager = spellManager;
    /** @type {boolean} Whether this actor has wizard capabilities */
    this.isWizard = DataHelpers.isWizard(actor);
    /** @type {Map<string, number>} Cached max cantrips by class identifier */
    this._maxCantripsByClass = new Map();
    /** @type {number} Cached total max cantrips across all classes */
    this._totalMaxCantrips = 0;
    /** @type {boolean} Whether the cache has been initialized */
    this._cacheInitialized = false;
    this._initializeCache();
  }

  /**
   * Check if a cantrip status change is allowed
   * @param {Item5e} spell The spell being modified
   * @param {boolean} isChecked Whether the spell is being checked (prepared)
   * @param {boolean} isLevelUp Whether this is during level-up
   * @param {boolean} isLongRest Whether this is during a long rest
   * @param {number|null} uiCantripCount Current UI cantrip count (for efficiency)
   * @param {string} classIdentifier The class identifier
   * @returns {CantripChangeResult} Result indicating if change is allowed
   */
  canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount, classIdentifier) {
    if (!classIdentifier) {
      log(2, `No class identifier provided for cantrip change check: ${spell.name}`);
      return { allowed: false, message: 'SPELLBOOK.Errors.NoClassIdentifier' };
    }
    const settings = this.spellManager.getSettings(classIdentifier);
    if (game.settings.get(MODULE.ID, SETTINGS.OVER_LIMIT_ENFORCEMENT) === MODULE.OVER_LIMIT_ENFORCEMENT_BEHAVIOR.WARN) {
      if (isChecked) {
        const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount(classIdentifier);
        const maxCantrips = this._getMaxCantripsForClass(classIdentifier);
        if (currentCount >= maxCantrips) {
          ui.notifications.clear();
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
    const spellUuid = DataHelpers.getSpellUuid(spell);
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
   * Track changes to cantrips for swap management
   * @param {Item5e} spell The spell being modified
   * @param {boolean} isChecked Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} isLevelUp Whether this is during level-up
   * @param {boolean} isLongRest Whether this is during a long rest
   * @param {string} classIdentifier The class identifier
   * @returns {void}
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
    const settings = this.spellManager.getSettings(classIdentifier);
    const cantripSwapping = settings.cantripSwapping || 'none';
    const spellUuid = DataHelpers.getSpellUuid(spell);
    if (!isLevelUp && !isLongRest) return;
    if (cantripSwapping === 'none') return;
    if (cantripSwapping === 'longRest' && classIdentifier !== MODULE.CLASS_IDENTIFIERS.WIZARD) return;
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    let tracking = this.actor.getFlag(MODULE.ID, flagName);
    if (!tracking) {
      const preparedCantrips = this.actor.items
        .filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1 && (i.sourceClass === classIdentifier || i.system.sourceClass === classIdentifier))
        .map((i) => DataHelpers.getSpellUuid(i));
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
   * @param {boolean} isLevelUp Whether this is completing a level-up swap
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
   * Complete cantrips level-up process
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
   * Reset all cantrip swap tracking data for long rests
   * @returns {void}
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
   * Get the current count of prepared cantrips for a specific class
   * @param {string|null} [classIdentifier] The class identifier (optional, all classes if omitted)
   * @returns {number} Currently prepared cantrips count for this class
   */
  getCurrentCount(classIdentifier = null) {
    if (!classIdentifier) return this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1).length;
    return this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1 && (i.system.sourceClass === classIdentifier || i.sourceClass === classIdentifier))
      .length;
  }

  /**
   * Check whether cantrips can be changed during level-up
   * @returns {boolean} Whether cantrips can be changed during level-up
   */
  canBeLeveledUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = this.actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips();
    return (previousLevel === 0 && currentLevel > 0) || ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);
  }

  /**
   * Check whether a level-up cantrip change is detected
   * @returns {boolean} Whether a level-up cantrip change is detected
   */
  checkForLevelUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const currentLevel = this.actor.system.details.level;
    return currentLevel > previousLevel;
  }

  /**
   * Send comprehensive GM notification with all spell changes and over-limit warnings
   * @param {GMNotificationData} notificationData Combined notification data
   * @returns {Promise<void>}
   */
  async sendComprehensiveGMNotification(notificationData) {
    const { actorName, classChanges } = notificationData;
    const processedClassChanges = Object.entries(classChanges)
      .map(([key, data]) => {
        const cantripChanges = {
          ...data.cantripChanges,
          removedNames: data.cantripChanges.removed.length > 0 ? data.cantripChanges.removed.map((item) => item.name).join(', ') : null,
          addedNames: data.cantripChanges.added.length > 0 ? data.cantripChanges.added.map((item) => item.name).join(', ') : null,
          hasChanges: data.cantripChanges.added.length > 0 || data.cantripChanges.removed.length > 0
        };
        const overLimits = {
          cantrips: { ...data.overLimits.cantrips, overCount: data.overLimits.cantrips.current - data.overLimits.cantrips.max },
          spells: { ...data.overLimits.spells, overCount: data.overLimits.spells.current - data.overLimits.spells.max }
        };
        const hasChanges = cantripChanges.hasChanges || data.overLimits.cantrips.isOver || data.overLimits.spells.isOver;
        return { classIdentifier: key, ...data, cantripChanges, overLimits, hasChanges };
      })
      .filter((classChange) => classChange.hasChanges);
    if (processedClassChanges.length === 0) return;
    const content = await renderTemplate(TEMPLATES.COMPONENTS.CANTRIP_NOTIFICATION, { actorName, classChanges: processedClassChanges });
    await ChatMessage.create({ content, whisper: game.users.filter((u) => u.isGM).map((u) => u.id), flags: { 'spell-book': { messageType: 'update-report' } } });
  }

  /**
   * Clear cantrip calculation cache (call when class rules change)
   * @returns {void}
   */
  clearCache() {
    this._maxCantripsByClass.clear();
    this._totalMaxCantrips = 0;
    this._cacheInitialized = false;
  }

  /**
   * Initialize cantrip calculation cache
   * @returns {void}
   * @private
   */
  _initializeCache() {
    if (this._cacheInitialized) return;
    this._maxCantripsByClass.clear();
    this._totalMaxCantrips = 0;
    if (!this.actor.spellcastingClasses) {
      log(2, 'No spellcastingClasses found on actor');
      this._cacheInitialized = true;
      return;
    }
    for (const identifier of Object.keys(this.actor.spellcastingClasses)) {
      const spellcastingConfig = DataHelpers.getSpellcastingConfigForClass(this.actor, identifier);
      if (!spellcastingConfig) continue;
      const maxCantrips = this._calculateMaxCantripsForClass(identifier);
      this._maxCantripsByClass.set(identifier, maxCantrips);
      this._totalMaxCantrips += maxCantrips;
      log(3, `Cached max cantrips for ${identifier}: ${maxCantrips}`);
    }
    this._cacheInitialized = true;
    log(3, `Total max cantrips across all classes: ${this._totalMaxCantrips}`);
  }

  /**
   * Get max cantrips for a class using cached values when available
   * @param {string} classIdentifier The class identifier
   * @returns {number} Max cantrips for this class
   * @private
   */
  _getMaxCantripsForClass(classIdentifier) {
    if (!this._cacheInitialized) this._initializeCache();
    return this._maxCantripsByClass.get(classIdentifier) || 0;
  }

  /**
   * Get total max cantrips across all classes using cached values when available
   * @returns {number} Total max cantrips
   * @private
   */
  _getTotalMaxCantrips() {
    if (!this._cacheInitialized) this._initializeCache();
    return this._totalMaxCantrips;
  }

  /**
   * Calculate max cantrips for a specific class
   * @param {string} classIdentifier The class identifier
   * @returns {number} Maximum cantrips for this class
   * @private
   */
  _calculateMaxCantripsForClass(classIdentifier) {
    const cantripScaleValuesSetting = game.settings.get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES);
    const cantripScaleKeys = cantripScaleValuesSetting
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    let baseCantrips = 0;
    const scaleValues = DataHelpers.getScaleValuesForClass(this.actor, classIdentifier);
    if (scaleValues) {
      for (const key of cantripScaleKeys) {
        const cantripValue = scaleValues[key]?.value;
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
    const preparationBonus = classRules?.cantripPreparationBonus || 0;
    const totalMaxCantrips = Math.max(0, baseCantrips + preparationBonus);
    log(3, `Max cantrips for ${classIdentifier}: ${baseCantrips} base + ${preparationBonus} bonus = ${totalMaxCantrips}`);
    return totalMaxCantrips;
  }

  /**
   * Get the current swap tracking data
   * @param {boolean} isLevelUp Whether this is a level-up context
   * @param {boolean} isLongRest Whether this is a long rest context
   * @param {string} classIdentifier The class identifier
   * @returns {SwapTrackingData} The current swap tracking data
   * @private
   */
  _getSwapTrackingData(isLevelUp, isLongRest, classIdentifier) {
    if (!isLevelUp && !isLongRest) return { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    const data = this.actor.getFlag(MODULE.ID, flagName);
    return data || { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
  }
}
