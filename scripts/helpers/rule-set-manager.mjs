import {
  CANTRIP_SWAP_TIMING,
  CLASS_IDENTIFIERS,
  FLAGS,
  MODULE,
  RITUAL_CASTING_MODES,
  RULE_SETS,
  SETTINGS,
  SPELL_SWAP_MODES
} from '../constants.mjs';
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
  static async applyRuleSetToActor(actor, ruleSet) {
    try {
      // Detect all spellcasting classes on the actor
      const spellcastingClasses = RuleSetManager._detectSpellcastingClasses(actor);
      const classRules = {};

      // Apply rule set defaults for each class
      for (const [classId, classData] of Object.entries(spellcastingClasses)) {
        classRules[classId] = RuleSetManager._getClassDefaults(classId, ruleSet);
      }

      // Save the class rules to the actor
      await actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);
      await actor.setFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE, ruleSet);

      log(3, `Applied ${ruleSet} rule set to ${actor.name} for ${Object.keys(classRules).length} classes`);
    } catch (error) {
      log(1, `Error applying rule set to actor ${actor.name}:`, error);
    }
  }

  /**
   * Get the effective rule set for an actor (checking override, then global)
   * @param {Actor5e} actor - The actor to check
   * @returns {string} The effective rule set
   */
  static getEffectiveRuleSet(actor) {
    const override = actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    if (override) return override;

    return game.settings.get(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET) || RULE_SETS.LEGACY;
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

    // If no existing rules, create defaults from current rule set
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
  static async updateClassRules(actor, classIdentifier, newRules) {
    try {
      const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
      classRules[classIdentifier] = { ...classRules[classIdentifier], ...newRules };
      await actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);

      log(3, `Updated class rules for ${classIdentifier} on ${actor.name}`);
    } catch (error) {
      log(1, `Error updating class rules for ${classIdentifier}:`, error);
    }
  }

  /**
   * Initialize class rules for any newly detected spellcasting classes
   * @param {Actor5e} actor - The actor to check
   * @returns {Promise<void>}
   */
  static async initializeNewClasses(actor) {
    try {
      const spellcastingClasses = RuleSetManager._detectSpellcastingClasses(actor);
      const existingRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
      const ruleSet = RuleSetManager.getEffectiveRuleSet(actor);
      let hasNewClasses = false;

      // Check for any classes that don't have rules yet
      for (const classId of Object.keys(spellcastingClasses)) {
        if (!existingRules[classId]) {
          existingRules[classId] = RuleSetManager._getClassDefaults(classId, ruleSet);
          hasNewClasses = true;
        }
      }

      // Save if we found new classes
      if (hasNewClasses) {
        await actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, existingRules);
        log(3, `Initialized rules for new spellcasting classes on ${actor.name}`);
      }
    } catch (error) {
      log(1, `Error initializing new classes for ${actor.name}:`, error);
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
      classes[identifier] = {
        name: item.name,
        item: item,
        spellcasting: item.system.spellcasting
      };
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
    // Start with base defaults
    const defaults = {
      cantripSwapping: CANTRIP_SWAP_TIMING.NONE,
      spellSwapping: SPELL_SWAP_MODES.NONE,
      ritualCasting: RITUAL_CASTING_MODES.NONE,
      showCantrips: true,
      customSpellList: null,
      preparationBonus: 0
    };

    // Apply rule set specific defaults
    if (ruleSet === RULE_SETS.LEGACY) {
      RuleSetManager._applyLegacyDefaults(classIdentifier, defaults);
    } else if (ruleSet === RULE_SETS.MODERN) {
      RuleSetManager._applyModernDefaults(classIdentifier, defaults);
    }

    return defaults;
  }

  /**
   * Apply legacy rule set defaults for a class
   * @param {string} classIdentifier - The class identifier
   * @param {Object} defaults - The defaults object to modify
   * @private
   */
  static _applyLegacyDefaults(classIdentifier, defaults) {
    switch (classIdentifier) {
      case CLASS_IDENTIFIERS.WIZARD:
        defaults.spellSwapping = SPELL_SWAP_MODES.LONG_REST;
        defaults.ritualCasting = RITUAL_CASTING_MODES.ALWAYS;
        break;

      case CLASS_IDENTIFIERS.CLERIC:
      case CLASS_IDENTIFIERS.DRUID:
        defaults.spellSwapping = SPELL_SWAP_MODES.LONG_REST;
        defaults.ritualCasting = RITUAL_CASTING_MODES.PREPARED;
        break;

      case CLASS_IDENTIFIERS.PALADIN:
        defaults.spellSwapping = SPELL_SWAP_MODES.LONG_REST;
        defaults.showCantrips = false; // Paladins don't get cantrips in legacy
        break;

      case CLASS_IDENTIFIERS.RANGER:
      case CLASS_IDENTIFIERS.BARD:
      case CLASS_IDENTIFIERS.SORCERER:
      case CLASS_IDENTIFIERS.WARLOCK:
        defaults.spellSwapping = SPELL_SWAP_MODES.LEVEL_UP;
        if (classIdentifier === CLASS_IDENTIFIERS.RANGER) {
          defaults.showCantrips = false; // Rangers don't get cantrips in legacy
        }
        break;

      case CLASS_IDENTIFIERS.ARTIFICER:
        defaults.spellSwapping = SPELL_SWAP_MODES.LONG_REST;
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
    // Most classes get cantrip swapping on level up in modern rules
    defaults.cantripSwapping = CANTRIP_SWAP_TIMING.LEVEL_UP;

    switch (classIdentifier) {
      case CLASS_IDENTIFIERS.WIZARD:
        defaults.cantripSwapping = CANTRIP_SWAP_TIMING.LONG_REST; // Special wizard rule
        defaults.spellSwapping = SPELL_SWAP_MODES.LONG_REST;
        defaults.ritualCasting = RITUAL_CASTING_MODES.ALWAYS;
        break;

      case CLASS_IDENTIFIERS.CLERIC:
      case CLASS_IDENTIFIERS.DRUID:
        defaults.spellSwapping = SPELL_SWAP_MODES.LONG_REST;
        defaults.ritualCasting = RITUAL_CASTING_MODES.PREPARED;
        break;

      case CLASS_IDENTIFIERS.PALADIN:
        defaults.cantripSwapping = CANTRIP_SWAP_TIMING.NONE; // Still no cantrips
        defaults.spellSwapping = SPELL_SWAP_MODES.LONG_REST; // Modern paladins can swap 1 per long rest
        defaults.showCantrips = false;
        break;

      case CLASS_IDENTIFIERS.RANGER:
        defaults.cantripSwapping = CANTRIP_SWAP_TIMING.NONE; // Still no cantrips
        defaults.spellSwapping = SPELL_SWAP_MODES.LONG_REST; // Modern rangers can swap 1 per long rest
        defaults.showCantrips = false;
        break;

      case CLASS_IDENTIFIERS.BARD:
      case CLASS_IDENTIFIERS.SORCERER:
      case CLASS_IDENTIFIERS.WARLOCK:
        defaults.spellSwapping = SPELL_SWAP_MODES.LEVEL_UP;
        break;

      case CLASS_IDENTIFIERS.ARTIFICER:
        defaults.spellSwapping = SPELL_SWAP_MODES.LONG_REST;
        break;
    }
  }
}
