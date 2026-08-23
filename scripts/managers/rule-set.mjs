import { CLASS_IDENTIFIERS, FLAGS, MODULE, RITUAL_CASTING_MODES, RULE_SETS, SETTINGS, SPELL_MODE, SWAP_MODES, TEMPLATES, WIZARD_DEFAULTS } from '../constants.mjs';
import { parseClassSpellKey } from '../data/class-spell-key.mjs';
import { getClassSpellList } from '../data/spell-list-resolver.mjs';
import { ClassManager } from './class-manager.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/** Rule Set Manager - Centralized spellcasting rule configuration and management. */
export class RuleSet {
  /**
   * Cache for class rules by actor. Uses WeakMap for automatic cleanup when actors are deleted.
   * @type {WeakMap<object, Map<string, object>>}
   * @private
   */
  static #classRules = new WeakMap();

  /**
   * Drop cached class rules for one actor.
   * @param {object} actor - The actor document
   * @returns {void}
   */
  static invalidateCache(actor) {
    this.#classRules.delete(actor);
  }

  /**
   * Drop every actor's cached class rules. Used when the world rule set changes.
   * @returns {void}
   */
  static invalidateAllCaches() {
    this.#classRules = new WeakMap();
    ATLAS.log(3, 'RuleSet caches cleared');
  }

  /**
   * Get the effective rule set for an actor.
   * @param {object} actor - The actor to check
   * @returns {string} The effective rule set ('legacy' or 'modern')
   */
  static getEffectiveRuleSet(actor) {
    const override = actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    if (override) return override;
    const effectiveRuleSet = game.settings.get(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET) || RULE_SETS.LEGACY;
    return effectiveRuleSet;
  }

  /**
   * Get a single class rule property with a default fallback.
   * @param {object} actor - The actor to check
   * @param {string} classIdentifier - The class identifier
   * @param {string} property - The rule property to retrieve
   * @param {*} [defaultValue] - Default value if property is undefined
   * @returns {*} The rule property value or default
   */
  static getClassRule(actor, classIdentifier, property, defaultValue = null) {
    return this.getClassRules(actor, classIdentifier)?.[property] ?? defaultValue;
  }

  /**
   * Get class-specific rules for an actor, with fallback to defaults.
   * @param {object} actor - The actor to check
   * @param {string} classIdentifier - The class identifier
   * @returns {object} The class rules object
   */
  static getClassRules(actor, classIdentifier) {
    if (!this.#classRules.has(actor)) this.#classRules.set(actor, new Map());
    const actorCache = this.#classRules.get(actor);
    if (actorCache.has(classIdentifier)) return actorCache.get(classIdentifier);
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const existingRules = classRules[classIdentifier];
    let rules;
    if (existingRules) {
      const classExists = actor.spellcastingClasses?.[classIdentifier] !== undefined;
      if (!classExists) {
        const ruleSet = RuleSet.getEffectiveRuleSet(actor);
        rules = RuleSet.#getClassDefaults(classIdentifier, ruleSet);
      } else rules = existingRules;
    } else {
      const ruleSet = RuleSet.getEffectiveRuleSet(actor);
      rules = RuleSet.#getClassDefaults(classIdentifier, ruleSet);
    }
    actorCache.set(classIdentifier, rules);
    return rules;
  }

  /**
   * Update class rules for a specific class on an actor.
   * @param {object} actor - The actor to update
   * @param {string} classIdentifier - The class identifier
   * @param {object} newRules - The new rules to apply
   * @returns {Promise<boolean>} True if rules were updated, false if cancelled
   */
  static async updateClassRules(actor, classIdentifier, newRules) {
    ATLAS.log(3, `Updating class rules`, { actorName: actor.name, actorId: actor.id, classIdentifier, newRules });
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const currentRules = classRules[classIdentifier] || {};
    if (newRules.customSpellList !== undefined) {
      const oldList = currentRules.customSpellList || [];
      const newList = newRules.customSpellList || [];
      const isDifferent = JSON.stringify([...oldList].sort()) !== JSON.stringify([...newList].sort());
      if (isDifferent) {
        ATLAS.log(3, `Custom spell list changed, checking for affected spells`, { actorName: actor.name, classIdentifier });
        const affectedSpells = await RuleSet.#getAffectedSpellsByListChange(actor, classIdentifier, newRules.customSpellList);
        if (affectedSpells.length > 0) {
          ATLAS.log(3, `Found affected spells, requesting confirmation`, { actorName: actor.name, classIdentifier, affectedCount: affectedSpells.length });
          const shouldProceed = await RuleSet.#confirmSpellListChange(actor, classIdentifier, affectedSpells);
          if (!shouldProceed) {
            ATLAS.log(3, `User cancelled spell list change`, { actorName: actor.name, classIdentifier });
            return false;
          }
          await RuleSet.#unprepareAffectedSpells(actor, classIdentifier, affectedSpells);
        }
      }
    }
    classRules[classIdentifier] = { ...classRules[classIdentifier], ...newRules };
    await actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);
    if (this.#classRules.has(actor)) this.#classRules.delete(actor);
    ATLAS.log(3, `Class rules updated successfully`, { actorName: actor.name, classIdentifier });
    return true;
  }

  /**
   * Initialize class rules for any newly detected spellcasting classes.
   * @param {object} actor - The actor to check
   * @returns {void}
   */
  static async initializeNewClasses(actor) {
    const spellcastingClasses = ClassManager.detectSpellcastingClasses(actor);
    const existingRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const ruleSet = RuleSet.getEffectiveRuleSet(actor);
    let hasNewClasses = false;
    for (const classId of Object.keys(spellcastingClasses)) {
      if (!existingRules[classId]) {
        existingRules[classId] = RuleSet.#getClassDefaults(classId, ruleSet);
        hasNewClasses = true;
      }
    }
    if (hasNewClasses) {
      await actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, existingRules);
      if (this.#classRules.has(actor)) this.#classRules.delete(actor);
      ATLAS.log(3, `New classes initialized`, { actorName: actor.name, classCount: Object.keys(spellcastingClasses).length });
    } else ATLAS.log(3, `No new classes to initialize`, { actorName: actor.name });
  }

  /**
   * Get default rules for a class based on rule set.
   * @private
   * @param {string} classIdentifier - The class identifier
   * @param {string} ruleSet - The rule set to use ('legacy' or 'modern')
   * @returns {object} Default rules for the class
   */
  static #getClassDefaults(classIdentifier, ruleSet) {
    const defaults = {
      cantripSwapping: SWAP_MODES.NONE,
      spellSwapping: SWAP_MODES.NONE,
      ritualCasting: RITUAL_CASTING_MODES.NONE,
      showCantrips: true,
      customSpellList: [],
      customSubclassSpellList: [],
      spellPreparationBonus: 0,
      cantripPreparationBonus: 0,
      forceWizardMode: false,
      spellLearningCostMultiplier: WIZARD_DEFAULTS.SPELL_LEARNING_COST_MULTIPLIER,
      spellLearningTimeMultiplier: WIZARD_DEFAULTS.SPELL_LEARNING_TIME_MULTIPLIER
    };
    if (ruleSet === RULE_SETS.LEGACY) RuleSet.#applyLegacyDefaults(classIdentifier, defaults);
    else if (ruleSet === RULE_SETS.MODERN) RuleSet.#applyModernDefaults(classIdentifier, defaults);
    return defaults;
  }

  /**
   * Apply legacy rule set defaults for a class.
   * @private
   * @param {string} classIdentifier - The class identifier
   * @param {object} defaults - The defaults object to modify
   * @returns {void}
   */
  static #applyLegacyDefaults(classIdentifier, defaults) {
    defaults.cantripSwapping = SWAP_MODES.NONE;
    defaults.ritualCasting = RITUAL_CASTING_MODES.NONE;
    switch (classIdentifier) {
      case CLASS_IDENTIFIERS.WIZARD:
        defaults.spellSwapping = SWAP_MODES.LONG_REST;
        defaults.ritualCasting = RITUAL_CASTING_MODES.ALWAYS;
        defaults.showCantrips = true;
        break;
      case CLASS_IDENTIFIERS.CLERIC:
      case CLASS_IDENTIFIERS.DRUID:
        defaults.spellSwapping = SWAP_MODES.LONG_REST;
        defaults.ritualCasting = RITUAL_CASTING_MODES.PREPARED;
        defaults.showCantrips = true;
        break;
      case CLASS_IDENTIFIERS.PALADIN:
        defaults.spellSwapping = SWAP_MODES.LONG_REST;
        defaults.showCantrips = false;
        break;
      case CLASS_IDENTIFIERS.RANGER:
        defaults.spellSwapping = SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = false;
        break;
      case CLASS_IDENTIFIERS.BARD:
      case CLASS_IDENTIFIERS.SORCERER:
      case CLASS_IDENTIFIERS.WARLOCK:
        defaults.spellSwapping = SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = true;
        if (classIdentifier === CLASS_IDENTIFIERS.BARD) defaults.ritualCasting = RITUAL_CASTING_MODES.PREPARED;
        break;
      case CLASS_IDENTIFIERS.ARTIFICER:
        defaults.spellSwapping = SWAP_MODES.LONG_REST;
        defaults.showCantrips = true;
        break;
      default:
        defaults.spellSwapping = SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = true;
        break;
    }
  }

  /**
   * Apply modern rule set defaults for a class.
   * @private
   * @param {string} classIdentifier - The class identifier
   * @param {object} defaults - The defaults object to modify
   * @returns {void}
   */
  static #applyModernDefaults(classIdentifier, defaults) {
    defaults.cantripSwapping = SWAP_MODES.LEVEL_UP;
    defaults.ritualCasting = RITUAL_CASTING_MODES.NONE;
    switch (classIdentifier) {
      case CLASS_IDENTIFIERS.WIZARD:
        defaults.cantripSwapping = SWAP_MODES.LONG_REST;
        defaults.spellSwapping = SWAP_MODES.LONG_REST;
        defaults.ritualCasting = RITUAL_CASTING_MODES.ALWAYS;
        defaults.showCantrips = true;
        break;
      case CLASS_IDENTIFIERS.CLERIC:
      case CLASS_IDENTIFIERS.DRUID:
        defaults.spellSwapping = SWAP_MODES.LONG_REST;
        defaults.showCantrips = true;
        break;
      case CLASS_IDENTIFIERS.PALADIN:
        defaults.cantripSwapping = SWAP_MODES.NONE;
        defaults.spellSwapping = SWAP_MODES.LONG_REST;
        defaults.showCantrips = false;
        break;
      case CLASS_IDENTIFIERS.RANGER:
        defaults.cantripSwapping = SWAP_MODES.NONE;
        defaults.spellSwapping = SWAP_MODES.LONG_REST;
        defaults.showCantrips = false;
        break;
      case CLASS_IDENTIFIERS.BARD:
      case CLASS_IDENTIFIERS.SORCERER:
      case CLASS_IDENTIFIERS.WARLOCK:
        defaults.spellSwapping = SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = true;
        break;
      case CLASS_IDENTIFIERS.ARTIFICER:
        defaults.spellSwapping = SWAP_MODES.LONG_REST;
        defaults.showCantrips = true;
        break;
      default:
        defaults.spellSwapping = SWAP_MODES.LEVEL_UP;
        defaults.showCantrips = true;
        break;
    }
  }

  /**
   * Get spells that will be affected by changing a custom spell list.
   * @private
   * @param {object} actor - The actor to check
   * @param {string} classIdentifier - The class identifier
   * @param {string[]|null} newSpellListUuid - UUIDs of the new spell list(s)
   * @returns {Promise<object[]>} Array of affected spell data
   */
  static async #getAffectedSpellsByListChange(actor, classIdentifier, newSpellListUuid) {
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    if (classPreparedSpells.length === 0) {
      ATLAS.log(3, `No prepared spells for class, no affected spells`, { actorName: actor.name, classIdentifier });
      return [];
    }
    let newSpellList = new Set();
    if (newSpellListUuid) {
      const validUuids = newSpellListUuid.filter((uuid) => uuid && typeof uuid === 'string');
      if (validUuids.length > 0) {
        ATLAS.log(3, `Loading ${validUuids.length} spell list(s) for affected spells check: ${validUuids.join(', ')}`);
        const spellListPromises = validUuids.map(async (uuid) => {
          const spellListDoc = await fromUuid(uuid);
          if (spellListDoc?.system?.spells?.size > 0) {
            ATLAS.log(3, `Loaded spell list for affected check: ${spellListDoc.name} (${spellListDoc.system.spells.size} spells)`);
            return spellListDoc.system.spells;
          } else return null;
        });
        const spellSets = (await Promise.all(spellListPromises)).filter((set) => set !== null);
        if (spellSets.length > 0) for (const spellSet of spellSets) for (const spell of spellSet) newSpellList.add(spell);
      }
    } else {
      newSpellList = await getClassSpellList(classIdentifier, actor);
    }
    const affectedSpells = [];
    for (const classSpellKey of classPreparedSpells) {
      const { spellUuid } = parseClassSpellKey(classSpellKey);
      if (!newSpellList.has(spellUuid)) {
        const spell = await fromUuid(spellUuid);
        if (spell) affectedSpells.push({ name: spell.name, uuid: spellUuid, level: spell.system.level, classSpellKey: classSpellKey });
      }
    }
    ATLAS.log(3, `Affected spells determined`, { actorName: actor.name, classIdentifier, affectedCount: affectedSpells.length });
    return affectedSpells;
  }

  /**
   * Show confirmation dialog for spell list change.
   * @private
   * @param {object} actor - The actor
   * @param {string} classIdentifier - The class identifier
   * @param {object[]} affectedSpells - Array of spells that will be unprepared
   * @returns {Promise<boolean>} Whether the user confirmed the change
   */
  static async #confirmSpellListChange(actor, classIdentifier, affectedSpells) {
    ATLAS.log(3, `Showing spell list change confirmation dialog`, { actorName: actor.name, classIdentifier, affectedCount: affectedSpells.length });
    const classItem = actor.spellcastingClasses?.[classIdentifier];
    const className = classItem?.name || classIdentifier;
    const cantripCount = affectedSpells.filter((s) => s.level === 0).length;
    const spellCount = affectedSpells.filter((s) => s.level > 0).length;
    const context = { className, totalAffected: affectedSpells.length, cantripCount, spellCount, affectedSpells };
    const content = await renderTemplate(TEMPLATES.DIALOGS.SPELL_LIST_CHANGE_CONFIRMATION, context);
    const result = await foundry.applications.api.DialogV2.wait({
      classes: ['spell-book'],
      window: { title: _loc('SPELLBOOK.SpellListChange.Title') },
      content: content,
      buttons: [
        { icon: 'fas fa-check', label: 'SPELLBOOK.SpellListChange.Proceed', action: 'confirm', className: 'dialog-button' },
        { icon: 'fas fa-times', label: 'ATLAS.Common.Cancel', action: 'cancel', className: 'dialog-button' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    ATLAS.log(3, `User responded to spell list change confirmation`, { actorName: actor.name, classIdentifier, confirmed: result === 'confirm' });
    return result === 'confirm';
  }

  /**
   * Unprepare spells that are no longer available in the new spell list.
   * @private
   * @param {object} actor - The actor
   * @param {string} classIdentifier - The class identifier
   * @param {object[]} affectedSpells - Array of spells to unprepare
   * @returns {Promise<void>}
   */
  static async #unprepareAffectedSpells(actor, classIdentifier, affectedSpells) {
    ATLAS.log(3, `Unpreparing affected spells`, { actorName: actor.name, actorId: actor.id, classIdentifier, affectedCount: affectedSpells.length });
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    const affectedKeys = new Set(affectedSpells.map((s) => s.classSpellKey));
    preparedByClass[classIdentifier] = classPreparedSpells.filter((key) => !affectedKeys.has(key));
    await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
    const affectedUuids = new Set(affectedSpells.map((s) => s.uuid));
    const spellIdsToRemove = actor.items
      .filter((item) => {
        if (item.type !== 'spell') return false;
        const sourceId = item._stats?.compendiumSource || item.uuid;
        if (!affectedUuids.has(sourceId)) return false;
        if (ClassManager.getSpellClassIdentifier(item) !== classIdentifier) return false;
        const isGranted = !!item.flags?.dnd5e?.cachedFor;
        const isAlwaysPrepared = item.system?.prepared === 2;
        const isSpecialMode = [SPELL_MODE.INNATE, SPELL_MODE.AT_WILL].includes(item.system?.method);
        return !isGranted && !isAlwaysPrepared && !isSpecialMode;
      })
      .map((item) => item.id);
    if (spellIdsToRemove.length > 0) {
      ATLAS.log(3, `Removing ${spellIdsToRemove.length} spell items from actor`, { actorName: actor.name, classIdentifier });
      await actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    }
    ATLAS.log(3, `Affected spells unprepared successfully`, { actorName: actor.name, classIdentifier, spellsRemoved: spellIdsToRemove.length });
  }
}
