/**
 * Spellcasting Class Detection and Cleanup
 *
 * Handles detection of spellcasting classes on an actor and cleanup
 * of stale data when classes are removed or changed.
 * @module State/SpellcastingClassDetector
 * @author Tyler
 */

import { FLAGS, MODULE } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from '../managers/_module.mjs';

/**
 * Detects spellcasting classes and cleans up stale class data.
 */
export class SpellcastingClassDetector {
  /**
   * Create a new SpellcastingClassDetector.
   * @param {object} actor - The actor to detect classes for
   * @param {object} app - The spell book application instance
   */
  constructor(actor, app) {
    this.actor = actor;
    this.app = app;
  }

  /**
   * Detect and initialize all spellcasting classes for the actor.
   * @param {object} state - The State instance to populate with detected classes
   * @returns {void}
   */
  detectSpellcastingClasses(state) {
    if (state._classesDetected) return;
    const currentClassIds = [];
    state.spellcastingClasses = {};
    state.classSpellData = {};
    state.classPrepModes = {};
    state.classRitualRules = {};
    state.classSwapRules = {};
    state._preparationStatsCache.clear();
    state._classDetectionCache.clear();
    if (this.actor.spellcastingClasses) {
      for (const spellcastingData of Object.values(this.actor.spellcastingClasses)) {
        const classItem = spellcastingData;
        let spellcastingConfig = classItem.system?.spellcasting;
        let spellcastingSource = classItem;
        if (!spellcastingConfig?.progression || spellcastingConfig.progression === 'none') {
          const subclassItem = spellcastingData._classLink;
          if (subclassItem?.system?.spellcasting?.progression && subclassItem.system.spellcasting.progression !== 'none') {
            spellcastingConfig = subclassItem.system.spellcasting;
            spellcastingSource = subclassItem;
          } else continue;
        }
        const identifier = classItem.identifier;
        currentClassIds.push(identifier);
        state.spellcastingClasses[identifier] = { name: classItem.name, uuid: classItem.uuid, id: classItem.id, spellcasting: spellcastingConfig, img: classItem.img };
        state.classSpellData[identifier] = {
          spellLevels: [],
          className: classItem.name,
          spellPreparation: { current: 0, maximum: 0 },
          classItem: classItem,
          spellcastingSource: spellcastingSource,
          type: spellcastingConfig?.type || 'leveled',
          progression: spellcastingConfig?.progression || 'none'
        };
        state.classPrepModes[identifier] = this.getClassPreparationMode(spellcastingSource);
        state.classRitualRules[identifier] = this.getClassRitualRules(spellcastingSource);
        state.classSwapRules[identifier] = this.getClassSwapRules(spellcastingSource);
        state.getSpellcastingConfigForClass(identifier);
        state.getSpellcastingLevelsForClass(identifier);
        state.getSpellcastingSourceItem(identifier);
      }
    }
    this._cleanupStaleClassData(currentClassIds, state);
    if (Object.keys(state.spellcastingClasses).length > 0 && !state.activeClass) state.activeClass = Object.keys(state.spellcastingClasses)[0];
    state._ritualHandler.setSpellcastingClasses(state.spellcastingClasses);
    state._classesDetected = true;
    log(3, 'Spellcasting classes detected', { classCount: Object.keys(state.spellcastingClasses).length, classIds: Object.keys(state.spellcastingClasses), activeClass: state.activeClass });
  }

  /**
   * Determine the preparation mode for a given class.
   * @param {object} classItem - The class item to analyze
   * @returns {string} The preparation mode ('spell', 'pact', etc.)
   */
  getClassPreparationMode(classItem) {
    let prepMode = MODULE.SPELL_MODE.SPELL;
    if (classItem.system.spellcasting?.type === MODULE.SPELL_MODE.PACT) prepMode = MODULE.SPELL_MODE.PACT;
    log(3, 'Preparation mode determined', { className: classItem.name, prepMode });
    return prepMode;
  }

  /**
   * Determine ritual casting rules for a given class.
   * @param {object} classItem - The class item to analyze
   * @returns {object} Ritual casting rules for the class
   */
  getClassRitualRules(classItem) {
    const rules = { canCastRituals: false, mustPrepare: false, fromSpellbook: false };
    const identifier = classItem.system?.identifier;
    if (identifier === MODULE.CLASS_IDENTIFIERS.WIZARD) {
      rules.canCastRituals = true;
      rules.mustPrepare = false;
      rules.fromSpellbook = true;
    } else if ([MODULE.CLASS_IDENTIFIERS.CLERIC, MODULE.CLASS_IDENTIFIERS.DRUID, MODULE.CLASS_IDENTIFIERS.BARD].includes(identifier)) {
      rules.canCastRituals = true;
      rules.mustPrepare = true;
    }
    log(3, 'Ritual rules determined', { className: classItem.name, rules });
    return rules;
  }

  /**
   * Determine spell swapping rules for a given class.
   * @param {object} classItem - The class item to analyze
   * @returns {object} Spell swapping rules for the class
   */
  getClassSwapRules(classItem) {
    const identifier = classItem.identifier;
    const rules = { canSwapCantrips: false, cantripSwapMode: 'none', canSwapSpells: false, spellSwapMode: 'none' };
    const classRules = RuleSet.getClassRules(this.actor, identifier);
    rules.canSwapCantrips = classRules.cantripSwapping !== 'none';
    rules.cantripSwapMode = classRules.cantripSwapping || 'none';
    rules.canSwapSpells = classRules.spellSwapping !== 'none';
    rules.spellSwapMode = classRules.spellSwapping || 'none';
    log(3, 'Swap rules determined', { className: classItem.name, rules });
    return rules;
  }

  /**
   * Clean up all stored data for class identifiers that don't match current actor classes.
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @param {object} state - The State instance
   * @private
   */
  _cleanupStaleClassData(currentClassIds, state) {
    this._cleanupStaleFlags(currentClassIds);
    this._cleanupStaleManagers(currentClassIds, state);
    log(3, 'Stale class data cleanup completed');
  }

  /**
   * Clean up all flag-based data for non-existent classes.
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @private
   */
  _cleanupStaleFlags(currentClassIds) {
    const actorFlags = this.actor.flags?.[MODULE.ID] || {};
    const classRules = actorFlags[FLAGS.CLASS_RULES] || {};
    const validClassRules = {};
    for (const [classId, rules] of Object.entries(classRules)) if (currentClassIds.includes(classId)) validClassRules[classId] = rules;
    if (Object.keys(validClassRules).length !== Object.keys(classRules).length) {
      this.actor.unsetFlag(MODULE.ID, FLAGS.CLASS_RULES);
      this.actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, validClassRules);
    }
    const preparedByClass = actorFlags[FLAGS.PREPARED_SPELLS_BY_CLASS] || {};
    const validPreparedByClass = {};
    for (const [classId, spells] of Object.entries(preparedByClass)) if (currentClassIds.includes(classId)) validPreparedByClass[classId] = spells;
    if (Object.keys(validPreparedByClass).length !== Object.keys(preparedByClass).length) {
      this.actor.unsetFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS);
      this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, validPreparedByClass);
      const allPreparedKeys = Object.values(validPreparedByClass).flat();
      const allPreparedUuids = allPreparedKeys.map((key) => {
        const [, ...uuidParts] = key.split(':');
        return uuidParts.join(':');
      });
      this.actor.unsetFlag(MODULE.ID, FLAGS.PREPARED_SPELLS);
      this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
    }
    const cantripTracking = actorFlags[FLAGS.CANTRIP_SWAP_TRACKING] || {};
    const validCantripTracking = {};
    for (const [classId, tracking] of Object.entries(cantripTracking)) if (currentClassIds.includes(classId)) validCantripTracking[classId] = tracking;
    if (Object.keys(validCantripTracking).length !== Object.keys(cantripTracking).length) {
      this.actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
      this.actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, validCantripTracking);
    }
    const swapTracking = actorFlags[FLAGS.SWAP_TRACKING] || {};
    const validSwapTracking = {};
    for (const [classId, tracking] of Object.entries(swapTracking)) if (currentClassIds.includes(classId)) validSwapTracking[classId] = tracking;
    if (Object.keys(validSwapTracking).length !== Object.keys(swapTracking).length) {
      this.actor.unsetFlag(MODULE.ID, FLAGS.SWAP_TRACKING);
      this.actor.setFlag(MODULE.ID, FLAGS.SWAP_TRACKING, validSwapTracking);
    }
    const wizardFlags = Object.keys(actorFlags).filter(
      (key) =>
        key.startsWith(`${FLAGS.WIZARD_COPIED_SPELLS}-`) ||
        key.startsWith(`${FLAGS.WIZARD_COPIED_SPELLS}_`) ||
        key.startsWith(`${FLAGS.WIZARD_RITUAL_CASTING}-`) ||
        key.startsWith(`${FLAGS.WIZARD_RITUAL_CASTING}_`)
    );
    for (const flagKey of wizardFlags) {
      const separatorIndex = Math.max(flagKey.lastIndexOf('-'), flagKey.lastIndexOf('_'));
      const classId = flagKey.substring(separatorIndex + 1);
      if (!currentClassIds.includes(classId)) this.actor.unsetFlag(MODULE.ID, flagKey);
    }
    log(3, 'Stale flags cleanup completed');
  }

  /**
   * Clean up manager caches and maps for non-existent classes.
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @param {object} state - The State instance
   * @private
   */
  _cleanupStaleManagers(currentClassIds, state) {
    if (this.app.wizardManagers) {
      const wizardManagerKeys = [...this.app.wizardManagers.keys()];
      for (const classId of wizardManagerKeys) if (!currentClassIds.includes(classId)) this.app.wizardManagers.delete(classId);
      log(3, 'Cleaned wizard managers', { before: wizardManagerKeys.length, after: this.app.wizardManagers.size });
    }
    if (this.app.ritualManagers) {
      const ritualManagerKeys = [...this.app.ritualManagers.keys()];
      for (const classId of ritualManagerKeys) if (!currentClassIds.includes(classId)) this.app.ritualManagers.delete(classId);
      log(3, 'Cleaned ritual managers', { before: ritualManagerKeys.length, after: this.app.ritualManagers.size });
    }
    if (state.wizardbookCache) {
      const wizardCacheKeys = [...state.wizardbookCache.keys()];
      for (const classId of wizardCacheKeys) if (!currentClassIds.includes(classId)) state.wizardbookCache.delete(classId);
      log(3, 'Cleaned wizardbook cache', { before: wizardCacheKeys.length, after: state.wizardbookCache.size });
    }

    if (this.app._wizardBookImages) {
      const wizardImageKeys = [...this.app._wizardBookImages.keys()];
      for (const classId of wizardImageKeys) if (!currentClassIds.includes(classId)) this.app._wizardBookImages.delete(classId);
      log(3, 'Cleaned wizard book images', { before: wizardImageKeys.length, after: this.app._wizardBookImages.size });
    }
    state._preparationStatsCache.clear();
    state._classDetectionCache.clear();
    log(3, 'Stale managers cleanup completed');
  }
}
