import { FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
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
    if (existingRules) {
      const classExists = actor.items.some(
        (item) =>
          item.type === 'class' &&
          (item.system.identifier?.toLowerCase() === classIdentifier || item.name.toLowerCase() === classIdentifier) &&
          item.system.spellcasting?.progression &&
          item.system.spellcasting.progression !== 'none'
      );
      if (!classExists) {
        log(2, `Class rules found for non-existent class: ${classIdentifier}. Will be cleaned up on next spellbook open.`);
        const ruleSet = RuleSetManager.getEffectiveRuleSet(actor);
        return RuleSetManager._getClassDefaults(classIdentifier, ruleSet);
      }
      return existingRules;
    }
    const ruleSet = RuleSetManager.getEffectiveRuleSet(actor);
    return RuleSetManager._getClassDefaults(classIdentifier, ruleSet);
  }

  /**
   * Update class rules for a specific class on an actor
   * @param {Actor5e} actor - The actor to update
   * @param {string} classIdentifier - The class identifier
   * @param {Object} newRules - The new rules to apply
   * @returns {Promise<boolean>} True if rules were updated, false if cancelled
   */
  static async updateClassRules(actor, classIdentifier, newRules) {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const currentRules = classRules[classIdentifier] || {};
    if (newRules.customSpellList !== undefined && newRules.customSpellList !== currentRules.customSpellList) {
      const affectedSpells = await RuleSetManager._getAffectedSpellsByListChange(actor, classIdentifier, currentRules.customSpellList, newRules.customSpellList);
      if (affectedSpells.length > 0) {
        const shouldProceed = await RuleSetManager._confirmSpellListChange(actor, classIdentifier, affectedSpells);
        if (!shouldProceed) return false;
        await RuleSetManager._unprepareAffectedSpells(actor, classIdentifier, affectedSpells);
      }
    }
    classRules[classIdentifier] = { ...classRules[classIdentifier], ...newRules };
    log(3, `Updating class rules for ${classIdentifier}:`, classRules[classIdentifier]);
    actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);
    log(3, `Updated class rules for ${classIdentifier} on ${actor.name}`);
    return true;
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
      spellPreparationBonus: 0,
      cantripPreparationBonus: 0,
      forceWizardMode: false
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

  /**
   * Get spells that will be affected by a spell list change
   * @param {Actor5e} actor - The actor to check
   * @param {string} classIdentifier - The class identifier
   * @param {string} oldSpellListUuid - UUID of the old spell list
   * @param {string} newSpellListUuid - UUID of the new spell list
   * @returns {Promise<Array>} Array of affected spell data
   * @private
   */
  static async _getAffectedSpellsByListChange(actor, classIdentifier, oldSpellListUuid, newSpellListUuid) {
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    if (classPreparedSpells.length === 0) return [];
    let newSpellList = new Set();
    if (newSpellListUuid) {
      try {
        const newSpellListDoc = await fromUuid(newSpellListUuid);
        if (newSpellListDoc && newSpellListDoc.system?.spells) newSpellList = newSpellListDoc.system.spells;
      } catch (error) {
        log(1, `Error loading new spell list ${newSpellListUuid}:`, error);
      }
    } else {
      const classItem = actor.items.find((i) => i.type === 'class' && (i.system.identifier?.toLowerCase() === classIdentifier || i.name.toLowerCase() === classIdentifier));
      if (classItem) newSpellList = await discoveryUtils.getClassSpellList(classItem.name.toLowerCase(), classItem.uuid, null);
    }
    const affectedSpells = [];
    for (const classSpellKey of classPreparedSpells) {
      const [, ...uuidParts] = classSpellKey.split(':');
      const spellUuid = uuidParts.join(':');
      if (!newSpellList.has(spellUuid)) {
        try {
          const spell = await fromUuid(spellUuid);
          if (spell) {
            affectedSpells.push({
              name: spell.name,
              uuid: spellUuid,
              level: spell.system.level,
              classSpellKey: classSpellKey
            });
          }
        } catch (error) {
          log(2, `Error loading spell ${spellUuid} for cleanup check:`, error);
          affectedSpells.push({
            name: 'Unknown Spell',
            uuid: spellUuid,
            level: 0,
            classSpellKey: classSpellKey
          });
        }
      }
    }
    return affectedSpells;
  }

  /**
   * Show confirmation dialog for spell list change
   * @param {Actor5e} actor - The actor
   * @param {string} classIdentifier - The class identifier
   * @param {Array} affectedSpells - Array of spells that will be unprepared
   * @returns {Promise<boolean>} Whether the user confirmed the change
   * @private
   */
  static async _confirmSpellListChange(actor, classIdentifier, affectedSpells) {
    const className =
      actor.items.find((i) => i.type === 'class' && (i.system.identifier?.toLowerCase() === classIdentifier || i.name.toLowerCase() === classIdentifier))?.name || classIdentifier;
    const cantripCount = affectedSpells.filter((s) => s.level === 0).length;
    const spellCount = affectedSpells.filter((s) => s.level > 0).length;
    let content = `<div class="spell-list-change-warning">
    <p><strong>${game.i18n.localize('SPELLBOOK.SpellListChange.Warning')}</strong></p>
    <p>${game.i18n.format('SPELLBOOK.SpellListChange.Explanation', {
      className: className,
      total: affectedSpells.length
    })}</p>`;
    if (cantripCount > 0) content += `<p><strong>${game.i18n.localize('SPELLBOOK.SpellListChange.CantripsAffected')}:</strong> ${cantripCount}</p>`;
    if (spellCount > 0) content += `<p><strong>${game.i18n.localize('SPELLBOOK.SpellListChange.SpellsAffected')}:</strong> ${spellCount}</p>`;
    content += `<details>
    <summary>${game.i18n.localize('SPELLBOOK.SpellListChange.ShowAffectedSpells')}</summary>
    <ul class="affected-spells-list">`;
    for (const spell of affectedSpells) {
      const levelText = spell.level === 0 ? game.i18n.localize('SPELLBOOK.SpellLevel.Cantrip') : game.i18n.format('SPELLBOOK.SpellLevel.Numbered', { level: spell.level });
      content += `<li>${spell.name} (${levelText})</li>`;
    }
    content += `</ul></details>
    <p><strong>${game.i18n.localize('SPELLBOOK.SpellListChange.Confirmation')}</strong></p>
  </div>`;
    try {
      const result = await foundry.applications.api.DialogV2.wait({
        title: game.i18n.localize('SPELLBOOK.SpellListChange.Title'),
        content: content,
        buttons: [
          { icon: 'fas fa-check', label: game.i18n.localize('SPELLBOOK.SpellListChange.Proceed'), action: 'confirm', className: 'dialog-button' },
          { icon: 'fas fa-times', label: game.i18n.localize('SPELLBOOK.UI.Cancel'), action: 'cancel', className: 'dialog-button' }
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
   * Unprepare spells that are no longer available in the new spell list
   * @param {Actor5e} actor - The actor
   * @param {string} classIdentifier - The class identifier
   * @param {Array} affectedSpells - Array of spells to unprepare
   * @returns {Promise<void>}
   * @private
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
        const isAlwaysPrepared = spellItem.system.preparation?.mode === 'always';
        const isSpecialMode = ['innate', 'pact', 'atwill'].includes(spellItem.system.preparation?.mode);
        if (!isGranted && !isAlwaysPrepared && !isSpecialMode) spellIdsToRemove.push(spellItem.id);
      }
    }
    if (spellIdsToRemove.length > 0) await actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    const cantripCount = affectedSpells.filter((s) => s.level === 0).length;
    const spellCount = affectedSpells.filter((s) => s.level > 0).length;
    let message = game.i18n.format('SPELLBOOK.SpellListChange.Completed', { total: affectedSpells.length });
    if (cantripCount > 0 && spellCount > 0) {
      message += ` (${cantripCount} ${game.i18n.localize('SPELLBOOK.SpellListChange.Cantrips')}, ${spellCount} ${game.i18n.localize('SPELLBOOK.SpellListChange.Spells')})`;
    } else if (cantripCount > 0) message += ` (${cantripCount} ${game.i18n.localize('SPELLBOOK.SpellListChange.Cantrips')})`;
    else if (spellCount > 0) message += ` (${spellCount} ${game.i18n.localize('SPELLBOOK.SpellListChange.Spells')})`;
    ui.notifications.info(message);
    log(3, `Unprepared ${affectedSpells.length} spells for ${classIdentifier} due to spell list change`);
  }
}
