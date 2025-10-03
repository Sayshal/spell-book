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
 * @module Managers/RuleSetManager
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Spellcasting class data structure for rule management.
 *
 * @typedef {Object} SpellcastingClassData
 * @property {string} name - Display name of the class
 * @property {Item5e} item - The class item document
 * @property {Object} spellcasting - Spellcasting configuration from the class
 * @property {Item5e} spellcastingSource - The item providing spellcasting (class or subclass)
 */

/**
 * Class rule configuration object defining spellcasting behavior.
 *
 * @typedef {Object} ClassRules
 * @property {string} cantripSwapping - When cantrips can be swapped ('none', 'levelUp', 'longRest')
 * @property {string} spellSwapping - When spells can be swapped ('none', 'levelUp', 'longRest')
 * @property {string} ritualCasting - Ritual casting restrictions ('none', 'prepared', 'always')
 * @property {boolean} showCantrips - Whether to show cantrips for this class
 * @property {string|null} customSpellList - UUID of custom spell list document
 * @property {number} spellPreparationBonus - Bonus to spell preparation limit
 * @property {number} cantripPreparationBonus - Bonus to cantrip preparation limit
 * @property {boolean} forceWizardMode - Whether to force wizard-style spell management
 * @property {number} spellLearningCostMultiplier - Gold cost multiplier per spell level (default: 50)
 * @property {number} spellLearningTimeMultiplier - Time multiplier in hours per spell level (default: 2)
 */

/**
 * Affected spell data for spell list change validation.
 *
 * @typedef {Object} AffectedSpellData
 * @property {string} name - Spell name
 * @property {string} uuid - Spell document UUID
 * @property {number} level - Spell level (0 for cantrips)
 * @property {string} classSpellKey - Internal class spell key for tracking
 */

/**
 * Rule Set Manager - Centralized spellcasting rule configuration and management.
 *
 * This static class provides rule set management for spellcasting
 * characters, handling both global rule set application and per-class customization.
 * It manages the complexity of multiclass spellcasters while providing sensible
 * defaults based on established D&D 5e patterns and optional rules.
 *
 * The manager automatically detects spellcasting classes and applies appropriate
 * defaults while allowing fine-grained customization for specific campaign needs
 * or house rules. It integrates with the module's spell preparation tracking
 * system to ensure rule changes are applied safely without data loss.
 */
export class RuleSetManager {
  /**
   * Apply a rule set to an actor, populating class-specific defaults.
   *
   * Applies the specified rule set (legacy or modern) to an actor by detecting
   * their spellcasting classes and configuring appropriate defaults for each class.
   * Preserves any existing class-specific customizations while initializing
   * defaults for newly detected classes.
   *
   * @param {Actor5e} actor - The actor to configure
   * @param {string} ruleSet - The rule set to apply ('legacy' or 'modern')
   * @returns {void}
   * @static
   */
  static applyRuleSetToActor(actor, ruleSet) {
    const spellcastingClasses = RuleSetManager._detectSpellcastingClasses(actor);
    const existingClassRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const classRules = {};
    for (const classId of Object.keys(spellcastingClasses)) {
      const defaults = RuleSetManager._getClassDefaults(classId, ruleSet);
      const existing = existingClassRules[classId] || {};
      classRules[classId] = { ...defaults, ...existing };
    }
    actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);
    actor.setFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE, ruleSet);
    log(3, `Applied ${ruleSet} rule set to ${actor.name} for ${Object.keys(classRules).length} classes`);
  }

  /**
   * Get the effective rule set for an actor.
   *
   * Determines the active rule set for an actor by checking for actor-specific
   * overrides first, then falling back to the global module setting. This
   * allows for per-actor customization while maintaining world-wide defaults.
   *
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
   *
   * Retrieves the configured rules for a specific class on an actor. If no
   * rules exist, generates appropriate defaults based on the actor's effective
   * rule set. Includes validation to ensure rules exist only for valid
   * spellcasting classes.
   *
   * @param {Actor5e} actor - The actor to check
   * @param {string} classIdentifier - The class identifier
   * @returns {ClassRules} The class rules object
   * @static
   */
  static getClassRules(actor, classIdentifier) {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const existingRules = classRules[classIdentifier];
    if (existingRules) {
      let classExists = false;
      if (actor.spellcastingClasses) {
        for (const spellcastingData of Object.values(actor.spellcastingClasses)) {
          const classItem = spellcastingData;
          const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
          if (identifier === classIdentifier) {
            let hasSpellcasting = classItem.system.spellcasting?.progression && classItem.system.spellcasting.progression !== 'none';
            if (!hasSpellcasting && spellcastingData._classLink) {
              const subclassItem = spellcastingData._classLink;
              hasSpellcasting = subclassItem.system.spellcasting?.progression && subclassItem.system.spellcasting.progression !== 'none';
            }
            if (hasSpellcasting) {
              classExists = true;
              break;
            }
          }
        }
      }
      if (!classExists) {
        log(2, `Class rules found for non-existent class: ${classIdentifier}. Will be cleaned up on next Spell Book open.`);
        const ruleSet = RuleSetManager.getEffectiveRuleSet(actor);
        return RuleSetManager._getClassDefaults(classIdentifier, ruleSet);
      }
      return existingRules;
    }
    const ruleSet = RuleSetManager.getEffectiveRuleSet(actor);
    return RuleSetManager._getClassDefaults(classIdentifier, ruleSet);
  }

  /**
   * Update class rules for a specific class on an actor.
   *
   * Updates the rule configuration for a specific class, with special handling
   * for custom spell list changes. When changing spell lists, validates which
   * prepared spells will be affected and provides user confirmation before
   * proceeding with changes that would unprepare spells.
   *
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
        const affectedSpells = await RuleSetManager._getAffectedSpellsByListChange(actor, classIdentifier, newRules.customSpellList);
        if (affectedSpells.length > 0) {
          const shouldProceed = await RuleSetManager._confirmSpellListChange(actor, classIdentifier, affectedSpells);
          if (!shouldProceed) return false;
          await RuleSetManager._unprepareAffectedSpells(actor, classIdentifier, affectedSpells);
        }
      }
    }
    classRules[classIdentifier] = { ...classRules[classIdentifier], ...newRules };
    log(3, `Updating class rules for ${classIdentifier}:`, classRules[classIdentifier]);
    actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);
    log(3, `Updated class rules for ${classIdentifier} on ${actor.name}`);
    return true;
  }

  /**
   * Initialize class rules for any newly detected spellcasting classes.
   *
   * Scans the actor for spellcasting classes and initializes default rules
   * for any classes that don't already have rule configurations. This is
   * typically called when opening the spell book to ensure all classes
   * have proper rule configurations.
   *
   * @param {Actor5e} actor - The actor to check
   * @returns {void}
   * @static
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
   * Detect spellcasting classes on an actor.
   *
   * Analyzes an actor's class items to identify which classes provide
   * spellcasting capabilities. Handles both class-based and subclass-based
   * spellcasting, returning a map of class identifiers to class data.
   *
   * @private
   * @param {Actor5e} actor - The actor to check
   * @returns {Object<string, SpellcastingClassData>} Map of class identifiers to class data
   * @static
   */
  static _detectSpellcastingClasses(actor) {
    const classes = {};
    if (actor.spellcastingClasses) {
      for (const spellcastingData of Object.values(actor.spellcastingClasses)) {
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
        const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
        classes[identifier] = { name: classItem.name, item: classItem, spellcasting: spellcastingConfig, spellcastingSource: spellcastingSource };
      }
    }
    return classes;
  }

  /**
   * Get default rules for a class based on rule set.
   *
   * Generates the default rule configuration for a specific class based on
   * the specified rule set. Provides baseline configurations that can be
   * customized later, with different defaults for legacy vs modern rule sets.
   *
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
    if (ruleSet === MODULE.RULE_SETS.LEGACY) RuleSetManager._applyLegacyDefaults(classIdentifier, defaults);
    else if (ruleSet === MODULE.RULE_SETS.MODERN) RuleSetManager._applyModernDefaults(classIdentifier, defaults);
    return defaults;
  }

  /**
   * Apply legacy rule set defaults for a class.
   *
   * Configures class defaults according to legacy D&D 5e rules, which are
   * more restrictive and closer to the Player's Handbook as written. Legacy
   * rules typically don't allow cantrip swapping and have limited flexibility.
   *
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
   *
   * Configures class defaults according to modern D&D 5e interpretations,
   * including optional rules and common house rules. Modern rules typically
   * allow more flexibility, including cantrip swapping on level-up for most
   * classes and expanded spell swapping options.
   *
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
   *
   * Analyzes the actor's currently prepared spells to determine which ones
   * will no longer be available if the spell list is changed to the specified
   * new list(s). Now supports multiple custom spell lists with proper merging.
   *
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
      if (spellListUuids.length > 0) {
        log(3, `Loading ${spellListUuids.length} spell list(s) for affected spells check: ${spellListUuids.join(', ')}`);
        const spellSets = [];
        for (const uuid of spellListUuids) {
          if (!uuid || typeof uuid !== 'string') {
            log(2, `Invalid spell list UUID in affected spells check: ${uuid}`);
            continue;
          }
          try {
            const spellListDoc = await fromUuid(uuid);
            if (spellListDoc && spellListDoc.system?.spells && spellListDoc.system.spells.size > 0) {
              spellSets.push(spellListDoc.system.spells);
              log(3, `Loaded spell list for affected check: ${spellListDoc.name} (${spellListDoc.system.spells.size} spells)`);
            } else {
              log(2, `Spell list has no spells for affected check: ${uuid}`);
            }
          } catch (error) {
            log(1, `Error loading spell list for affected spells check ${uuid}:`, error);
          }
        }
        if (spellSets.length > 0) {
          for (const spellSet of spellSets) for (const spell of spellSet) newSpellList.add(spell);
          log(3, `Merged ${spellSets.length} spell lists for affected spells check: ${newSpellList.size} total spells`);
        }
      }
    } else {
      const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
      const classItem = spellcastingData ? actor.items.get(spellcastingData.id) : null;
      if (classItem) newSpellList = await DataHelpers.getClassSpellList(classItem.name.toLowerCase(), classItem.uuid, actor);
    }
    const affectedSpells = [];
    for (const classSpellKey of classPreparedSpells) {
      const [, ...uuidParts] = classSpellKey.split(':');
      const spellUuid = uuidParts.join(':');
      if (!newSpellList.has(spellUuid)) {
        try {
          const spell = await fromUuid(spellUuid);
          if (spell) affectedSpells.push({ name: spell.name, uuid: spellUuid, level: spell.system.level, classSpellKey: classSpellKey });
        } catch (error) {
          log(2, `Error loading spell ${spellUuid} for cleanup check:`, error);
          affectedSpells.push({ name: game.i18n.localize('SPELLBOOK.UI.UnknownSpell'), uuid: spellUuid, level: 0, classSpellKey: classSpellKey });
        }
      }
    }
    return affectedSpells;
  }

  /**
   * Show confirmation dialog for spell list change.
   *
   * Displays a confirmation dialog when a spell list change
   * would affect prepared spells. Shows the user exactly which spells will
   * be unprepared and requires explicit confirmation before proceeding.
   *
   * @private
   * @param {Actor5e} actor - The actor
   * @param {string} classIdentifier - The class identifier
   * @param {AffectedSpellData[]} affectedSpells - Array of spells that will be unprepared
   * @returns {Promise<boolean>} Whether the user confirmed the change
   * @static
   */
  static async _confirmSpellListChange(actor, classIdentifier, affectedSpells) {
    const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
    const classItem = spellcastingData ? actor.items.get(spellcastingData.id) : null;
    const className = classItem?.name || classIdentifier;
    const cantripCount = affectedSpells.filter((s) => s.level === 0).length;
    const spellCount = affectedSpells.filter((s) => s.level > 0).length;
    const context = { className, totalAffected: affectedSpells.length, cantripCount, spellCount, affectedSpells };
    try {
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
    } catch (error) {
      log(1, 'Error showing spell list change confirmation dialog:', error);
      return false;
    }
  }

  /**
   * Unprepare spells that are no longer available in the new spell list.
   *
   * Removes affected spells from preparation tracking and cleans up actor
   * spell items as appropriate. Handles both the module's preparation tracking
   * system and the actor's embedded spell items, with proper handling of
   * granted spells and special spell modes.
   *
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
    const newClassPreparedSpells = classPreparedSpells.filter((key) => !affectedKeys.has(key));
    preparedByClass[classIdentifier] = newClassPreparedSpells;
    actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
    const allPreparedKeys = Object.values(preparedByClass).flat();
    const allPreparedUuids = allPreparedKeys.map((key) => {
      const [, ...uuidParts] = key.split(':');
      return uuidParts.join(':');
    });
    actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
    const spellIdsToRemove = [];
    for (const affectedSpell of affectedSpells) {
      const spellItem = actor.items.find(
        (item) =>
          item.type === 'spell' &&
          (item.flags?.core?.sourceId === affectedSpell.uuid || item.uuid === affectedSpell.uuid) &&
          (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier)
      );
      if (spellItem) {
        const isGranted = !!spellItem.flags?.dnd5e?.cachedFor;
        const isAlwaysPrepared = spellItem.system.prepared === 2;
        const isSpecialMode = ['innate', 'pact', 'atwill'].includes(spellItem.system.method);
        if (!isGranted && !isAlwaysPrepared && !isSpecialMode) spellIdsToRemove.push(spellItem.id);
      }
    }
    if (spellIdsToRemove.length > 0) await actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    const cantripCount = affectedSpells.filter((s) => s.level === 0).length;
    const spellCount = affectedSpells.filter((s) => s.level > 0).length;
    log(3, `Unprepared ${affectedSpells.length} spells for ${classIdentifier} due to spell list change`);
  }
}
