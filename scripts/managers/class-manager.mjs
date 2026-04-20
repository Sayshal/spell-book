/**
 * Class Detection and Configuration Manager
 * @module Managers/ClassManager
 * @author Tyler
 */

import { CLASS_IDENTIFIERS, FLAGS, MODULE, SPELL_MODE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';
import { RuleSet } from './rule-set.mjs';

/** Manages spellcasting class detection, configuration, and identifier resolution. */
export class ClassManager {
  /** @type {WeakMap<object, Object<string, object>>} */
  static _classCache = new WeakMap();

  /** @type {WeakMap<object, object[]>} */
  static _wizardCache = new WeakMap();

  /**
   * Detect spellcasting classes on an actor. Cached per actor reference.
   * @param {object} actor - The actor document
   * @returns {Object<string, object>} Map of identifier → class info
   */
  static detectSpellcastingClasses(actor) {
    if (this._classCache.has(actor)) return this._classCache.get(actor);
    log(3, 'Detecting spellcasting classes.', { actorName: actor.name });
    const classes = {};
    if (!actor.spellcastingClasses) {
      this._classCache.set(actor, classes);
      return classes;
    }
    for (const [identifier, classItem] of Object.entries(actor.spellcastingClasses)) {
      const spellcastingConfig = classItem.spellcasting;
      if (!spellcastingConfig) continue;
      const spellcastingSource = this._resolveSpellcastingSource(classItem);
      classes[identifier] = {
        name: classItem.name,
        uuid: classItem.uuid,
        id: classItem.id,
        img: classItem.img,
        spellcasting: spellcastingConfig,
        spellcastingSource,
        type: spellcastingConfig?.type || 'leveled',
        progression: spellcastingConfig?.progression || 'none',
        preparationMode: this.getClassPreparationMode(spellcastingConfig),
        ritualRules: this.getClassRitualRules(identifier)
      };
    }
    this._classCache.set(actor, classes);
    log(3, 'Spellcasting classes detected.', { actorName: actor.name, classCount: Object.keys(classes).length, classIds: Object.keys(classes) });
    return classes;
  }

  /**
   * Get wizard-enabled classes for an actor. Cached per actor reference.
   * @param {object} actor - The actor document
   * @returns {object[]} Array of { identifier, classItem, isNaturalWizard, isForceWizard }
   */
  static getWizardEnabledClasses(actor) {
    if (this._wizardCache.has(actor)) return this._wizardCache.get(actor);
    const result = [];
    const localizedWizardName = _loc('SPELLBOOK.Classes.Wizard').toLowerCase();
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    if (actor.spellcastingClasses) {
      for (const [identifier, classData] of Object.entries(actor.spellcastingClasses)) {
        const isNaturalWizard = classData.name.toLowerCase() === localizedWizardName;
        const isForceWizard = classRules[identifier]?.forceWizardMode === true;
        if (isNaturalWizard || isForceWizard) result.push({ identifier, classItem: classData, isNaturalWizard, isForceWizard });
      }
    }
    this._wizardCache.set(actor, result);
    log(3, 'Wizard classes detected.', { actorName: actor.name, count: result.length });
    return result;
  }

  /**
   * Get spellcasting configuration for a class.
   * @todo this seems stupid.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {object|null} Spellcasting configuration or null
   */
  static getSpellcastingConfig(actor, classIdentifier) {
    return this.detectSpellcastingClasses(actor)[classIdentifier]?.spellcasting ?? null;
  }

  /**
   * Get the item that provides spellcasting for a class (main class or subclass).
   * @todo this seems stupid.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {object|null} The source item or null
   */
  static getSpellcastingSourceItem(actor, classIdentifier) {
    return this.detectSpellcastingClasses(actor)[classIdentifier]?.spellcastingSource ?? null;
  }

  /**
   * Get effective class levels for spellcasting.
   * @todo this seems stupid.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Class levels or 0
   */
  static getSpellcastingLevels(actor, classIdentifier) {
    return actor.spellcastingClasses?.[classIdentifier]?.system?.levels ?? 0;
  }

  /**
   * Determine the preparation mode from a spellcasting configuration.
   * @todo this seems stupid.
   * @param {object} spellcastingConfig - The spellcasting configuration object
   * @returns {string} 'pact' or 'spell'
   */
  static getClassPreparationMode(spellcastingConfig) {
    return spellcastingConfig?.type === SPELL_MODE.PACT ? SPELL_MODE.PACT : SPELL_MODE.SPELL;
  }

  /**
   * Determine ritual casting rules for a class.
   * @param {string} classIdentifier - The class identifier
   * @returns {object} { canCastRituals, mustPrepare, fromSpellbook }
   */
  static getClassRitualRules(classIdentifier) {
    const rules = { canCastRituals: false, mustPrepare: false, fromSpellbook: false };
    if (classIdentifier === CLASS_IDENTIFIERS.WIZARD) {
      rules.canCastRituals = true;
      rules.fromSpellbook = true;
    } else if ([CLASS_IDENTIFIERS.CLERIC, CLASS_IDENTIFIERS.DRUID, CLASS_IDENTIFIERS.BARD].includes(classIdentifier)) {
      rules.canCastRituals = true;
      rules.mustPrepare = true;
    }
    return rules;
  }

  /**
   * Determine spell swapping rules for a class. Delegates to RuleSet.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {object} { canSwapCantrips, cantripSwapMode, canSwapSpells, spellSwapMode }
   */
  static getClassSwapRules(actor, classIdentifier) {
    const classRules = RuleSet.getClassRules(actor, classIdentifier);
    return {
      canSwapCantrips: classRules.cantripSwapping !== 'none',
      cantripSwapMode: classRules.cantripSwapping || 'none',
      canSwapSpells: classRules.spellSwapping !== 'none',
      spellSwapMode: classRules.spellSwapping || 'none'
    };
  }

  /**
   * Get the class identifier for a spell.
   * @param {object} spell - Spell document or plain clone
   * @returns {string} The class identifier or empty string
   */
  static getSpellClassIdentifier(spell) {
    if (!spell) return '';
    const sourceItem = spell.system?.sourceItem;
    if (typeof sourceItem === 'string' && sourceItem.startsWith('class:')) return sourceItem.slice(6);
    if (typeof spell.system?.classIdentifier === 'string' && spell.system.classIdentifier) return spell.system.classIdentifier;
    if (typeof spell._classContext === 'string' && spell._classContext) return spell._classContext;
    return '';
  }

  /**
   * Invalidate all cached data for an actor.
   * @param {object} actor - The actor document
   */
  static invalidateCache(actor) {
    this._classCache.delete(actor);
    this._wizardCache.delete(actor);
    log(3, 'ClassManager cache invalidated.', { actorName: actor.name });
  }

  /**
   * Remove flags for classes no longer present on an actor.
   * @param {object} actor - The actor document
   * @param {string[]} currentClassIds - Currently valid class identifiers
   */
  static async cleanupStaleFlags(actor, currentClassIds) {
    const actorFlags = actor.flags?.[MODULE.ID] || {};
    const classRules = actorFlags[FLAGS.CLASS_RULES] || {};
    const validClassRules = {};
    for (const [classId, rules] of Object.entries(classRules)) if (currentClassIds.includes(classId)) validClassRules[classId] = rules;
    if (Object.keys(validClassRules).length !== Object.keys(classRules).length) {
      await actor.unsetFlag(MODULE.ID, FLAGS.CLASS_RULES);
      await actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, validClassRules);
    }
    const preparedByClass = actorFlags[FLAGS.PREPARED_SPELLS_BY_CLASS] || {};
    const validPrepared = {};
    for (const [classId, spells] of Object.entries(preparedByClass)) if (currentClassIds.includes(classId)) validPrepared[classId] = spells;
    if (Object.keys(validPrepared).length !== Object.keys(preparedByClass).length) {
      await actor.unsetFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS);
      await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, validPrepared);
      const allPreparedUuids = Object.values(validPrepared)
        .flat()
        .map((key) => {
          const [, ...uuidParts] = key.split(':');
          return uuidParts.join(':');
        });
      await actor.unsetFlag(MODULE.ID, FLAGS.PREPARED_SPELLS);
      await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
    }
    const cantripTracking = actorFlags[FLAGS.CANTRIP_SWAP_TRACKING] || {};
    const validCantrip = {};
    for (const [classId, tracking] of Object.entries(cantripTracking)) if (currentClassIds.includes(classId)) validCantrip[classId] = tracking;
    if (Object.keys(validCantrip).length !== Object.keys(cantripTracking).length) {
      await actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
      await actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, validCantrip);
    }
    const swapTracking = actorFlags[FLAGS.SWAP_TRACKING] || {};
    const validSwap = {};
    for (const [classId, tracking] of Object.entries(swapTracking)) if (currentClassIds.includes(classId)) validSwap[classId] = tracking;
    if (Object.keys(validSwap).length !== Object.keys(swapTracking).length) {
      await actor.unsetFlag(MODULE.ID, FLAGS.SWAP_TRACKING);
      await actor.setFlag(MODULE.ID, FLAGS.SWAP_TRACKING, validSwap);
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
      if (!currentClassIds.includes(classId)) await actor.unsetFlag(MODULE.ID, flagKey);
    }
    log(3, 'Stale flags cleanup completed.', { actorName: actor.name });
  }

  /**
   * Resolve which item provides spellcasting for a class entry.
   * @param {object} classItem - Class entry from actor.spellcastingClasses
   * @returns {object} The class or subclass item that provides spellcasting
   * @private
   */
  static _resolveSpellcastingSource(classItem) {
    const subclass = classItem.subclass ?? classItem._classLink;
    if (subclass?.system?.spellcasting?.progression && subclass.system.spellcasting.progression !== 'none') return subclass;
    return classItem;
  }
}
