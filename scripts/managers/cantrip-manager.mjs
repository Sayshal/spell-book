/**
 * Cantrip Management and Swap Mechanics
 *
 * Manages cantrip-specific functionality including preparation limits, swap mechanics,
 * level-up detection, and long rest processing. This class serves as the single source
 * of truth for all cantrip calculations and state management within the Spell Book module.
 *
 * Key features:
 * - Cached cantrip limit calculations for performance optimization
 * - Level-up detection and cantrip swap enablement
 * - Long rest cantrip swap mechanics for wizards
 * - Comprehensive swap tracking with undo functionality
 * - GM notification system for cantrip changes and over-limit warnings
 * - Multi-class cantrip management with per-class rule support
 * - Validation and enforcement of cantrip preparation rules
 *
 * @module Managers/CantripManager
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from './_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Cantrip swap tracking data structure for managing changes during level-up or long rest.
 *
 * @typedef {Object} CantripSwapTrackingData
 * @property {boolean} hasUnlearned - Whether a cantrip has been unlearned
 * @property {string|null} unlearned - UUID of the unlearned cantrip
 * @property {boolean} hasLearned - Whether a new cantrip has been learned
 * @property {string|null} learned - UUID of the newly learned cantrip
 * @property {string[]} originalChecked - Array of originally prepared cantrip UUIDs
 */

/**
 * Cantrip change notification data for GM reports.
 *
 * @typedef {Object} CantripChangeData
 * @property {Array<{name: string}>} removed - Array of removed cantrip objects
 * @property {Array<{name: string}>} added - Array of added cantrip objects
 * @property {string|null} removedNames - Comma-separated names of removed cantrips
 * @property {string|null} addedNames - Comma-separated names of added cantrips
 * @property {boolean} hasChanges - Whether any cantrip changes occurred
 */

/**
 * Over-limit warning data for cantrips and spells.
 *
 * @typedef {Object} OverLimitData
 * @property {OverLimitInfo} cantrips - Cantrip over-limit information
 * @property {OverLimitInfo} spells - Spell over-limit information
 */

/**
 * Individual over-limit information for a specific spell type.
 *
 * @typedef {Object} OverLimitInfo
 * @property {number} current - Current number of prepared spells/cantrips
 * @property {number} max - Maximum allowed spells/cantrips
 * @property {boolean} isOver - Whether currently over the limit
 * @property {number} overCount - Number of spells/cantrips over the limit
 */

/**
 * Comprehensive notification data for GM reports.
 *
 * @typedef {Object} NotificationData
 * @property {string} actorName - Name of the actor with changes
 * @property {Object<string, ClassChangeData>} classChanges - Changes organized by class identifier
 */

/**
 * Class-specific change data for notification processing.
 *
 * @typedef {Object} ClassChangeData
 * @property {string} classIdentifier - The class identifier
 * @property {CantripChangeData} cantripChanges - Cantrip change information
 * @property {OverLimitData} overLimits - Over-limit warning data
 * @property {boolean} hasChanges - Whether any changes occurred for this class
 */

/**
 * Cantrip validation result for preparation attempts.
 *
 * @typedef {Object} CantripValidationResult
 * @property {boolean} allowed - Whether the cantrip preparation is allowed
 * @property {string} [message] - Localization key for error message if not allowed
 */

/**
 * Cantrip Manager - Single source of truth for cantrip calculations and swap mechanics.
 *
 * This class manages all cantrip-related functionality including preparation limits,
 * swap mechanics during level-up and long rest, tracking state changes, and providing
 * validation for cantrip preparation attempts. It maintains cached calculations for
 * optimal performance and integrates with the module's rule system.
 *
 * The manager supports multi-class characters with per-class cantrip limits and rules,
 * wizard-specific long rest swap mechanics, and comprehensive change tracking with
 * GM notification capabilities.
 */
export class CantripManager {
  /**
   * Create a new CantripManager instance.
   *
   * Initializes the manager with the specified actor and associated spell manager.
   * Sets up caching system for optimal performance and determines wizard status
   * for specialized cantrip mechanics.
   *
   * @param {Actor5e} actor - The actor to manage cantrips for
   * @param {SpellManager} spellManager - The associated SpellManager instance
   */
  constructor(actor, spellManager) {
    /** @type {Actor5e} The actor being managed */
    this.actor = actor;

    /** @type {SpellManager} The associated spell manager */
    this.spellManager = spellManager;

    /** @type {boolean} Whether this actor has wizard levels */
    this.isWizard = DataHelpers.isWizard(actor);

    /** @type {Map<string, number>} Cached maximum cantrips by class identifier */
    this._maxCantripsByClass = new Map();

    /** @type {number} Cached total maximum cantrips across all classes */
    this._totalMaxCantrips = 0;

    /** @type {boolean} Whether the cache has been initialized */
    this._cacheInitialized = false;

    // Initialize cache on construction
    this._initializeCache();
  }

  /**
   * Initialize the cantrip calculation cache.
   *
   * Calculates and caches maximum cantrip values for all spellcasting classes
   * to avoid repeated expensive calculations. This method is called automatically
   * during construction and should be called whenever class rules change.
   *
   * @private
   * @returns {void}
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
   * Clear the cantrip calculation cache.
   *
   * Forces recalculation of cantrip limits on next access. Call this method
   * whenever class rules change or when cache invalidation is needed.
   *
   * @returns {void}
   */
  clearCache() {
    this._maxCantripsByClass.clear();
    this._totalMaxCantrips = 0;
    this._cacheInitialized = false;
  }

  /**
   * Get maximum cantrips for a specific class using cached values.
   *
   * Returns the cached maximum cantrip value for the specified class.
   * Initializes cache if not already done. This is the primary method
   * for retrieving cantrip limits in performance-critical contexts.
   *
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Maximum cantrips allowed for this class
   */
  _getMaxCantripsForClass(classIdentifier) {
    if (!this._cacheInitialized) this._initializeCache();
    return this._maxCantripsByClass.get(classIdentifier) || 0;
  }

  /**
   * Get total maximum cantrips across all classes using cached values.
   *
   * Returns the cached total of maximum cantrips across all spellcasting
   * classes. Useful for overall cantrip limit validation and UI display.
   *
   * @returns {number} Total maximum cantrips across all classes
   */
  _getTotalMaxCantrips() {
    if (!this._cacheInitialized) this._initializeCache();
    return this._totalMaxCantrips;
  }

  /**
   * Calculate maximum cantrips for a specific class.
   *
   * Performs the actual calculation of maximum cantrips based on scale values,
   * class rules, and preparation bonuses. This method handles the complex logic
   * of determining cantrip limits from various game system sources.
   *
   * @private
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Maximum cantrips for this class
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
   * Get the current count of prepared cantrips for a specific class.
   *
   * Counts the number of currently prepared cantrips (level 0 spells) for
   * the specified class. If no class identifier is provided, returns the
   * total count across all classes.
   *
   * @param {string|null} [classIdentifier=null] - The class identifier, or null for all classes
   * @returns {number} Currently prepared cantrips count
   */
  getCurrentCount(classIdentifier = null) {
    if (!classIdentifier) return this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1).length;
    return this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1 && (i.system.sourceClass === classIdentifier || i.sourceClass === classIdentifier))
      .length;
  }

  /**
   * Check if cantrips can be changed during level-up.
   *
   * Determines whether the character has leveled up and gained additional
   * cantrip capacity, enabling cantrip swap mechanics. Compares current
   * level and cantrip maximum with previously cached values.
   *
   * @returns {boolean} Whether cantrips can be changed due to level-up
   */
  canBeLeveledUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = this.actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips();
    return (previousLevel === 0 && currentLevel > 0) || ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);
  }

  /**
   * Check for level-up that affects cantrips.
   *
   * Performs a more detailed check for level-up conditions that would
   * enable cantrip swapping. This method is used for detecting when
   * cantrip swap mechanics should be activated.
   *
   * @returns {boolean} Whether a level-up cantrip change is detected
   */
  checkForLevelUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = this.actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips();
    log(3, `Level-up check: previous level=${previousLevel}, current level=${currentLevel}, previous max=${previousMax}, current max=${currentMax}`);
    return (previousLevel === 0 && currentLevel > 0) || ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);
  }

  /**
   * Validate cantrip preparation based on current rules and limits.
   *
   * Comprehensive validation method that checks cantrip preparation attempts
   * against current limits, swap rules, and tracking state. Handles both
   * preparation and unpreparation attempts with appropriate rule enforcement.
   *
   * @param {Item5e} spell - The cantrip being validated
   * @param {boolean} isChecked - Whether attempting to prepare (true) or unprepare (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during long rest
   * @param {string} classIdentifier - The class identifier
   * @param {number|null} [uiCantripCount=null] - Current UI cantrip count for optimization
   * @returns {CantripValidationResult} Validation result with allowed status and error message
   */
  canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount, classIdentifier) {
    if (spell.system.level !== 0) return { allowed: true };
    if (!classIdentifier) classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    if (!classIdentifier) {
      log(2, `No class identifier for cantrip ${spell.name}, allowing change but may cause issues`);
      return { allowed: true };
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
    const spellUuid = spell.uuid;
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
   * Get the current swap tracking data for the specified context.
   *
   * Retrieves the current swap tracking state for cantrip changes during
   * level-up or long rest periods. Returns default empty tracking data
   * if no tracking is active.
   *
   * @private
   * @param {boolean} isLevelUp - Whether this is a level-up context
   * @param {boolean} isLongRest - Whether this is a long rest context
   * @param {string} classIdentifier - The class identifier
   * @returns {CantripSwapTrackingData} Current tracking data
   */
  _getSwapTrackingData(isLevelUp, isLongRest, classIdentifier) {
    if (!isLevelUp && !isLongRest) return { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    const data = this.actor.getFlag(MODULE.ID, flagName);
    return data || { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
  }

  /**
   * Track changes to cantrips for swap management.
   *
   * Records cantrip preparation changes during level-up or long rest periods
   * to enable proper swap mechanics and validation. Maintains state for
   * learned/unlearned cantrips and enforces swap limitations.
   *
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being prepared (true) or unprepared (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {string} classIdentifier - The class identifier
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
    const spellUuid = spell.uuid;
    if (!isLevelUp && !isLongRest) return;
    if (cantripSwapping === 'none') return;
    if (cantripSwapping === 'longRest' && classIdentifier !== MODULE.CLASS_IDENTIFIERS.WIZARD) return;
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    let tracking = this.actor.getFlag(MODULE.ID, flagName);
    if (!tracking) {
      const preparedCantrips = this.actor.items
        .filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1 && (i.sourceClass === classIdentifier || i.system.sourceClass === classIdentifier))
        .map((i) => i.uuid);
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
   * Complete the cantrip swap process and reset tracking.
   *
   * Finalizes cantrip swap mechanics by clearing tracking data and updating
   * level/maximum caches for future swap detection. This method is called
   * when swap periods are completed.
   *
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
   * Complete the cantrip level-up process.
   *
   * Specialized completion method for level-up scenarios that updates
   * both current level tracking and maximum cantrip caches before
   * completing the swap process.
   *
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
   * Reset all cantrip swap tracking data.
   *
   * Clears all long rest cantrip swap tracking without affecting level-up
   * tracking. This method is used when long rest periods are cancelled
   * or need to be reset.
   *
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
   * Send comprehensive GM notification with all spell changes and over-limit warnings.
   *
   * Creates and sends a detailed chat message to GMs containing information
   * about cantrip changes, over-limit warnings, and class-specific modifications.
   * This provides GMs with visibility into player spell management activities.
   *
   * @param {NotificationData} notificationData - Combined notification data
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
}
