/**
 * Rule Set Management and Class-Specific Configuration
 *
 * Manages spellcasting rule set application and class-specific rule configuration
 * for actors in the Spell Book module. This class provides a centralized system for
 * applying legacy or modern spellcasting rules, managing per-class configurations,
 * and handling spell list changes with proper validation and cleanup.
 *
 * Key features:
 * - Legacy and modern rule set application with class-specific defaults
 * - Dynamic spellcasting class detection and configuration initialization
 * - Per-class rule customization with spell preparation bonuses and swap mechanics
 * - Custom spell list integration with affected spell validation
 * - Automatic cleanup of spells when changing spell lists
 * - Confirmation dialogs for rule changes affecting prepared spells
 * - Integration with actor flag system for persistent rule storage
 * - Support for multiclass characters with individual class rule management
 *
 * The manager distinguishes between legacy rules (more restrictive, closer to PHB)
 * and modern rules (more flexible, incorporating optional rules and house rules)
 * while allowing per-class customization for complex multiclass scenarios.
 *
 * @module Managers/RuleSet
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Rule Set Manager - Centralized spellcasting rule configuration and management.
 */
export class RuleSet {
  /**
   * Apply a rule set to an actor, populating class-specific defaults.
   * @param {Actor5e} actor - The actor to configure
   * @param {string} ruleSet - The rule set to apply ('legacy' or 'modern')
   * @returns {void}
   * @static
   */
  static applyRuleSetToActor(actor, ruleSet) {
    const spellcastingClasses = RuleSet._detectSpellcastingClasses(actor);
    const existingClassRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const classRules = {};
    for (const classId of Object.keys(spellcastingClasses)) {
      const defaults = RuleSet._getClassDefaults(classId, ruleSet);
      const existing = existingClassRules[classId] || {};
      classRules[classId] = { ...defaults, ...existing };
    }
    actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);
    actor.setFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE, ruleSet);
    log(3, `Applied ${ruleSet} rule set to ${actor.name} for ${Object.keys(classRules).length} classes`);
  }

  /**
   * Get the effective rule set for an actor.
   * @param {Actor5e} actor - The actor to check
   * @returns {string} The effective rule set ('legacy' or 'modern')
   * @static
   */
  static getEffectiveRuleSet(actor) {
    const override = actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    if (override) return override;
    return game.settings.get(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET) || MODULE.RULE_SETS.LEGACY;
  }

  /**
   * Get class-specific rules for an actor, with fallback to defaults.
   * @param {Actor5e} actor - The actor to check
   * @param {string} classIdentifier - The class identifier
   * @returns {ClassRules} The class rules object
   * @static
   */
  static getClassRules(actor, classIdentifier) {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const existingRules = classRules[classIdentifier];
    if (existingRules) {
      const classExists = actor.spellcastingClasses?.[classIdentifier] !== undefined;
      if (!classExists) {
        const ruleSet = RuleSet.getEffectiveRuleSet(actor);
        return RuleSet._getClassDefaults(classIdentifier, ruleSet);
      }
      return existingRules;
    }
    const ruleSet = RuleSet.getEffectiveRuleSet(actor);
    return RuleSet._getClassDefaults(classIdentifier, ruleSet);
  }

  /**
   * Update class rules for a specific class on an actor.
   * @param {Actor5e} actor - The actor to update
   * @param {string} classIdentifier - The class identifier
   * @param {Partial<ClassRules>} newRules - The new rules to apply
   * @returns {Promise<boolean>} True if rules were updated, false if cancelled
   * @static
   */
  static async updateClassRules(actor, classIdentifier, newRules) {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const currentRules = classRules[classIdentifier] || {};
    if (newRules.customSpellList !== undefined) {
      const oldList = Array.isArray(currentRules.customSpellList) ? currentRules.customSpellList : currentRules.customSpellList ? [currentRules.customSpellList] : [];
      const newList = Array.isArray(newRules.customSpellList) ? newRules.customSpellList : newRules.customSpellList ? [newRules.customSpellList] : [];
      const isDifferent = JSON.stringify([...oldList].sort()) !== JSON.stringify([...newList].sort());
      if (isDifferent) {
        const affectedSpells = await RuleSet._getAffectedSpellsByListChange(actor, classIdentifier, newRules.customSpellList);
        if (affectedSpells.length > 0) {
          const shouldProceed = await RuleSet._confirmSpellListChange(actor, classIdentifier, affectedSpells);
          if (!shouldProceed) return false;
          await RuleSet._unprepareAffectedSpells(actor, classIdentifier, affectedSpells);
        }
      }
    }
    classRules[classIdentifier] = { ...classRules[classIdentifier], ...newRules };

    actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);

    return true;
  }

  /**
   * Initialize class rules for any newly detected spellcasting classes.
   * @param {Actor5e} actor - The actor to check
   * @returns {void}
   * @static
   */
  static initializeNewClasses(actor) {
    const spellcastingClasses = RuleSet._detectSpellcastingClasses(actor);
    const existingRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const ruleSet = RuleSet.getEffectiveRuleSet(actor);
    let hasNewClasses = false;
    for (const classId of Object.keys(spellcastingClasses)) {
      if (!existingRules[classId]) {
        existingRules[classId] = RuleSet._getClassDefaults(classId, ruleSet);
        hasNewClasses = true;
      }
    }
    if (hasNewClasses) {
      actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, existingRules);
    }
  }

  /**
   * Detect spellcasting classes on an actor.
   * @private
   * @param {Actor5e} actor - The actor to check
   * @returns {Object<string, SpellcastingClassData>} Map of class identifiers to class data
   * @static
   */
  static _detectSpellcastingClasses(actor) {
    const classes = {};
    if (!actor.spellcastingClasses) return classes;
    for (const [identifier, classItem] of Object.entries(actor.spellcastingClasses)) {
      const spellcastingConfig = classItem.spellcasting;
      if (!spellcastingConfig) continue;
      const subclass = classItem.subclass;
      const spellcastingSource = subclass?.system?.spellcasting?.progression && subclass.system.spellcasting.progression !== 'none' ? subclass : classItem;
      classes[identifier] = { name: classItem.name, item: classItem, spellcasting: spellcastingConfig, spellcastingSource: spellcastingSource };
    }
    return classes;
  }

  /**
   * Get default rules for a class based on rule set.
   * @private
   * @param {string} classIdentifier - The class identifier
   * @param {string} ruleSet - The rule set to use ('legacy' or 'modern')
   * @returns {ClassRules} Default rules for the class
   * @static
   */
  static _getClassDefaults(classIdentifier, ruleSet) {
    const defaults = {
      cantripSwapping: MODULE.SWAP_MODES.NONE,
      spellSwapping: MODULE.SWAP_MODES.NONE,
      ritualCasting: MODULE.RITUAL_CASTING_MODES.NONE,
      showCantrips: true,
      customSpellList: [],
      spellPreparationBonus: 0,
      cantripPreparationBonus: 0,
      forceWizardMode: false,
      spellLearningCostMultiplier: 50,
      spellLearningTimeMultiplier: 2
    };
    if (ruleSet === MODULE.RULE_SETS.LEGACY) RuleSet._applyLegacyDefaults(classIdentifier, defaults);
    else if (ruleSet === MODULE.RULE_SETS.MODERN) RuleSet._applyModernDefaults(classIdentifier, defaults);
    return defaults;
  }

  /**
   * Apply legacy rule set defaults for a class.
   * @private
   * @param {string} classIdentifier - The class identifier
   * @param {ClassRules} defaults - The defaults object to modify
   * @returns {void}
   * @static
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
   * Apply modern rule set defaults for a class.
   * @private
   * @param {string} classIdentifier - The class identifier
   * @param {ClassRules} defaults - The defaults object to modify
   * @returns {void}
   * @static
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

  /**
   * Get spells that will be affected by changing a custom spell list.
   * @private
   * @param {Actor5e} actor - The actor to check
   * @param {string} classIdentifier - The class identifier
   * @param {string|Array<string>|null} newSpellListUuid - UUID(s) of the new spell list(s)
   * @returns {Promise<AffectedSpellData[]>} Array of affected spell data
   * @static
   */
  static async _getAffectedSpellsByListChange(actor, classIdentifier, newSpellListUuid) {
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    if (classPreparedSpells.length === 0) return [];
    let newSpellList = new Set();
    if (newSpellListUuid) {
      const spellListUuids = Array.isArray(newSpellListUuid) ? newSpellListUuid : [newSpellListUuid];
      const validUuids = spellListUuids.filter((uuid) => uuid && typeof uuid === 'string');
      if (validUuids.length > 0) {
        log(3, `Loading ${validUuids.length} spell list(s) for affected spells check: ${validUuids.join(', ')}`);
        const spellListPromises = validUuids.map(async (uuid) => {
          const spellListDoc = await fromUuid(uuid);
          if (spellListDoc?.system?.spells?.size > 0) {
            log(3, `Loaded spell list for affected check: ${spellListDoc.name} (${spellListDoc.system.spells.size} spells)`);
            return spellListDoc.system.spells;
          } else {
            return null;
          }
        });
        const spellSets = (await Promise.all(spellListPromises)).filter((set) => set !== null);
        if (spellSets.length > 0) {
          for (const spellSet of spellSets) for (const spell of spellSet) newSpellList.add(spell);
        }
      }
    } else {
      const classItem = actor.spellcastingClasses?.[classIdentifier];
      if (classItem) newSpellList = await DataUtils.getClassSpellList(classItem.name.toLowerCase(), classItem.uuid, actor);
    }
    const affectedSpells = [];
    for (const classSpellKey of classPreparedSpells) {
      const [, ...uuidParts] = classSpellKey.split(':');
      const spellUuid = uuidParts.join(':');
      if (!newSpellList.has(spellUuid)) {
        const spell = await fromUuid(spellUuid);
        if (spell) affectedSpells.push({ name: spell.name, uuid: spellUuid, level: spell.system.level, classSpellKey: classSpellKey });
      }
    }
    return affectedSpells;
  }

  /**
   * Show confirmation dialog for spell list change.
   * @private
   * @param {Actor5e} actor - The actor
   * @param {string} classIdentifier - The class identifier
   * @param {AffectedSpellData[]} affectedSpells - Array of spells that will be unprepared
   * @returns {Promise<boolean>} Whether the user confirmed the change
   * @static
   */
  static async _confirmSpellListChange(actor, classIdentifier, affectedSpells) {
    const classItem = actor.spellcastingClasses?.[classIdentifier];
    const className = classItem?.name || classIdentifier;
    const cantripCount = affectedSpells.filter((s) => s.level === 0).length;
    const spellCount = affectedSpells.filter((s) => s.level > 0).length;
    const context = { className, totalAffected: affectedSpells.length, cantripCount, spellCount, affectedSpells };
    const content = await renderTemplate(TEMPLATES.DIALOGS.SPELL_LIST_CHANGE_CONFIRMATION, context);
    const result = await foundry.applications.api.DialogV2.wait({
      title: game.i18n.localize('SPELLBOOK.SpellListChange.Title'),
      content: content,
      buttons: [
        { icon: 'fas fa-check', label: 'SPELLBOOK.SpellListChange.Proceed', action: 'confirm', className: 'dialog-button' },
        { icon: 'fas fa-times', label: 'SPELLBOOK.UI.Cancel', action: 'cancel', className: 'dialog-button' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    return result === 'confirm';
  }

  /**
   * Unprepare spells that are no longer available in the new spell list.
   * @private
   * @param {Actor5e} actor - The actor
   * @param {string} classIdentifier - The class identifier
   * @param {AffectedSpellData[]} affectedSpells - Array of spells to unprepare
   * @returns {Promise<void>}
   * @static
   */
  static async _unprepareAffectedSpells(actor, classIdentifier, affectedSpells) {
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    const affectedKeys = new Set(affectedSpells.map((s) => s.classSpellKey));
    preparedByClass[classIdentifier] = classPreparedSpells.filter((key) => !affectedKeys.has(key));
    await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
    const allPreparedKeys = Object.values(preparedByClass).flat();
    const allPreparedUuids = allPreparedKeys.map((key) => {
      const [, ...uuidParts] = key.split(':');
      return uuidParts.join(':');
    });
    await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
    const affectedUuids = new Set(affectedSpells.map((s) => s.uuid));
    const spellIdsToRemove = actor.items
      .filter((item) => {
        if (item.type !== 'spell') return false;
        const sourceId = item._stats?.compendiumSource || item.uuid;
        if (!affectedUuids.has(sourceId)) return false;
        const itemClass = item.system?.sourceClass || item.sourceClass;
        if (itemClass !== classIdentifier) return false;
        const isGranted = !!item.flags?.dnd5e?.cachedFor;
        const isAlwaysPrepared = item.system?.prepared === 2;
        const isSpecialMode = ['innate', 'atwill'].includes(item.system?.method);
        return !isGranted && !isAlwaysPrepared && !isSpecialMode;
      })
      .map((item) => item.id);
    if (spellIdsToRemove.length > 0) await actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
  }
}
