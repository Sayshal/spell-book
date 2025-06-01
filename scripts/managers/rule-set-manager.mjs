import { FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Manages rule set application and class-specific rule configuration
 */
export class RuleSetManager {
  /**
   * Apply a rule set to an actor, populating class-specific defaults
   * @param {Actor5e} actor - The actor to configure
   * @param {string} ruleSet - The rule set to apply ('legacy' or 'modern')
   * @returns {Promise<void>}
   */
  static applyRuleSetToActor(actor, ruleSet) {
    const spellcastingClasses = RuleSetManager._detectSpellcastingClasses(actor);
    const existingClassRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const classRules = {};
    for (const [classId, classData] of Object.entries(spellcastingClasses)) {
      const defaults = RuleSetManager._getClassDefaults(classId, ruleSet);
      const existing = existingClassRules[classId] || {};
      classRules[classId] = { ...defaults, ...existing };
    }
    actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);
    actor.setFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE, ruleSet);
    log(3, `Applied ${ruleSet} rule set to ${actor.name} for ${Object.keys(classRules).length} classes`);
  }

  /**
   * Get the effective rule set for an actor (checking override, then global)
   * @param {Actor5e} actor - The actor to check
   * @returns {string} The effective rule set
   */
  static getEffectiveRuleSet(actor) {
    const override = actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    if (override) return override;
    return game.settings.get(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET) || MODULE.RULE_SETS.LEGACY;
  }

  /**
   * Get class-specific rules for an actor, with fallback to defaults
   * @param {Actor5e} actor - The actor to check
   * @param {string} classIdentifier - The class identifier
   * @returns {Object} The class rules object
   */
  static getClassRules(actor, classIdentifier) {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const existingRules = classRules[classIdentifier];
    if (existingRules) return existingRules;
    const ruleSet = RuleSetManager.getEffectiveRuleSet(actor);
    return RuleSetManager._getClassDefaults(classIdentifier, ruleSet);
  }

  /**
   * Update class rules for a specific class on an actor
   * @param {Actor5e} actor - The actor to update
   * @param {string} classIdentifier - The class identifier
   * @param {Object} newRules - The new rules to apply
   * @returns {Promise<void>}
   */
  static updateClassRules(actor, classIdentifier, newRules) {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    classRules[classIdentifier] = { ...classRules[classIdentifier], ...newRules };
    log(3, `Updating class rules for ${classIdentifier}:`, classRules[classIdentifier]);
    actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);
    log(3, `Updated class rules for ${classIdentifier} on ${actor.name}`);
  }

  /**
   * Initialize class rules for any newly detected spellcasting classes
   * @param {Actor5e} actor - The actor to check
   * @returns {Promise<void>}
   */
  static initializeNewClasses(actor) {
    const spellcastingClasses = RuleSetManager._detectSpellcastingClasses(actor);
    const existingRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const ruleSet = RuleSetManager.getEffectiveRuleSet(actor);
    let hasNewClasses = false;
    for (const classId of Object.keys(spellcastingClasses)) {
      if (!existingRules[classId]) {
        existingRules[classId] = RuleSetManager._getClassDefaults(classId, ruleSet);
        hasNewClasses = true;
      }
    }
    if (hasNewClasses) {
      actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, existingRules);
      log(3, `Initialized rules for new spellcasting classes on ${actor.name}`);
    }
  }

  /**
   * Detect spellcasting classes on an actor
   * @param {Actor5e} actor - The actor to check
   * @returns {Object} Map of class identifiers to class data
   * @private
   */
  static _detectSpellcastingClasses(actor) {
    const classes = {};
    for (const item of actor.items) {
      if (item.type !== 'class') continue;
      if (!item.system.spellcasting?.progression || item.system.spellcasting.progression === 'none') continue;
      const identifier = item.system.identifier?.toLowerCase() || item.name.toLowerCase();
      classes[identifier] = { name: item.name, item: item, spellcasting: item.system.spellcasting };
    }
    return classes;
  }

  /**
   * Get default rules for a class based on rule set
   * @param {string} classIdentifier - The class identifier
   * @param {string} ruleSet - The rule set to use
   * @returns {Object} Default rules for the class
   * @private
   */
  static _getClassDefaults(classIdentifier, ruleSet) {
    const defaults = {
      cantripSwapping: MODULE.SWAP_MODES.NONE,
      spellSwapping: MODULE.SWAP_MODES.NONE,
      ritualCasting: MODULE.RITUAL_CASTING_MODES.NONE,
      showCantrips: true,
      customSpellList: null,
      preparationBonus: 0
    };
    if (ruleSet === MODULE.RULE_SETS.LEGACY) RuleSetManager._applyLegacyDefaults(classIdentifier, defaults);
    else if (ruleSet === MODULE.RULE_SETS.MODERN) RuleSetManager._applyModernDefaults(classIdentifier, defaults);
    return defaults;
  }

  /**
   * Apply legacy rule set defaults for a class
   * @param {string} classIdentifier - The class identifier
   * @param {Object} defaults - The defaults object to modify
   * @private
   */
  static _applyLegacyDefaults(classIdentifier, defaults) {
    defaults.cantripSwapping = MODULE.SWAP_MODES.NONE;
    defaults.ritualCasting = MODULE.RITUAL_CASTING_MODES.NONE;
    switch (classIdentifier) {
      case MODULE.CLASS_IDENTIFIERS.WIZARD:
        defaults.spellSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.ritualCasting = MODULE.RITUAL_CASTING_MODES.ALWAYS;
        defaults.showCantrips = true;
        break;
      case MODULE.CLASS_IDENTIFIERS.CLERIC:
      case MODULE.CLASS_IDENTIFIERS.DRUID:
        defaults.spellSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.ritualCasting = MODULE.RITUAL_CASTING_MODES.PREPARED;
        defaults.showCantrips = true;
        break;
      case MODULE.CLASS_IDENTIFIERS.PALADIN:
        defaults.spellSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.showCantrips = false;
        break;
      case MODULE.CLASS_IDENTIFIERS.RANGER:
        defaults.spellSwapping = MODULE.SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = false;
        break;
      case MODULE.CLASS_IDENTIFIERS.BARD:
      case MODULE.CLASS_IDENTIFIERS.SORCERER:
      case MODULE.CLASS_IDENTIFIERS.WARLOCK:
        defaults.spellSwapping = MODULE.SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = true;
        if (classIdentifier === MODULE.CLASS_IDENTIFIERS.BARD) defaults.ritualCasting = MODULE.RITUAL_CASTING_MODES.PREPARED;
        break;
      case MODULE.CLASS_IDENTIFIERS.ARTIFICER:
        defaults.spellSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.showCantrips = true;
        break;
      default:
        defaults.spellSwapping = MODULE.SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = true;
        break;
    }
  }

  /**
   * Apply modern rule set defaults for a class
   * @param {string} classIdentifier - The class identifier
   * @param {Object} defaults - The defaults object to modify
   * @private
   */
  static _applyModernDefaults(classIdentifier, defaults) {
    defaults.cantripSwapping = MODULE.SWAP_MODES.LEVEL_UP;
    defaults.ritualCasting = MODULE.RITUAL_CASTING_MODES.NONE;
    switch (classIdentifier) {
      case MODULE.CLASS_IDENTIFIERS.WIZARD:
        defaults.cantripSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.spellSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.ritualCasting = MODULE.RITUAL_CASTING_MODES.ALWAYS;
        defaults.showCantrips = true;
        break;
      case MODULE.CLASS_IDENTIFIERS.CLERIC:
      case MODULE.CLASS_IDENTIFIERS.DRUID:
        defaults.spellSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.showCantrips = true;
        break;
      case MODULE.CLASS_IDENTIFIERS.PALADIN:
        defaults.cantripSwapping = MODULE.SWAP_MODES.NONE;
        defaults.spellSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.showCantrips = false;
        break;
      case MODULE.CLASS_IDENTIFIERS.RANGER:
        defaults.cantripSwapping = MODULE.SWAP_MODES.NONE;
        defaults.spellSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.showCantrips = false;
        break;
      case MODULE.CLASS_IDENTIFIERS.BARD:
      case MODULE.CLASS_IDENTIFIERS.SORCERER:
      case MODULE.CLASS_IDENTIFIERS.WARLOCK:
        defaults.spellSwapping = MODULE.SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = true;
        break;
      case MODULE.CLASS_IDENTIFIERS.ARTIFICER:
        defaults.spellSwapping = MODULE.SWAP_MODES.LONG_REST;
        defaults.showCantrips = true;
        break;
      default:
        defaults.spellSwapping = MODULE.SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = true;
        break;
    }
  }
}
