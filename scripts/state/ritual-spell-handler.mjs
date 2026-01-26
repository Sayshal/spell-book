/**
 * Ritual Spell Management for Spell Book
 *
 * Handles ritual spell creation, cleanup, and management for classes with
 * ritual casting enabled. Extracted from State.mjs to reduce god class complexity.
 * @module State/RitualSpellHandler
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from '../managers/_module.mjs';
import * as UIUtils from '../ui/_module.mjs';

/**
 * Manages ritual spell operations for all spellcasting classes.
 */
export class RitualSpellHandler {
  /**
   * Create a new RitualSpellHandler.
   * @param {object} actor - The actor to manage ritual spells for
   * @param {object} app - The spell book application instance
   */
  constructor(actor, app) {
    this.actor = actor;
    this._app = app;
    this._spellcastingClasses = {};
  }

  /**
   * Get wizard managers from the app (accessed lazily to avoid initialization timing issues).
   * @returns {Map} Map of class identifier to WizardBook manager
   * @private
   */
  get _wizardManagers() {
    return this._app?.wizardManagers;
  }

  /**
   * Update the spellcasting classes reference.
   * @param {object} spellcastingClasses - Object of class identifier to class data
   */
  setSpellcastingClasses(spellcastingClasses) {
    this._spellcastingClasses = spellcastingClasses;
  }

  /**
   * Add missing ritual spells for all classes with ritual casting enabled.
   * @param {object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   */
  async addMissingRitualSpells(spellDataByClass) {
    await this._cleanupDisabledRitualSpells();
    for (const [classIdentifier, classData] of Object.entries(this._spellcastingClasses)) {
      if (RuleSet.getClassRule(this.actor, classIdentifier, 'ritualCasting', MODULE.RITUAL_CASTING_MODES.NONE) === MODULE.SPELL_MODE.ALWAYS) {
        log(3, 'Processing ritual spells for class', { classIdentifier });
        const wizardManager = this._wizardManagers?.get(classIdentifier);
        const isWizard = wizardManager?.isWizard;
        if (isWizard) await this._addWizardRitualSpells(classIdentifier, spellDataByClass);
        else await this._addClassRitualSpells(classIdentifier, classData, spellDataByClass);
      }
    }
    log(3, 'Missing ritual spells added');
  }

  /**
   * Clean up module-created ritual spells for classes that no longer support ritual casting.
   * @returns {Promise<void>}
   * @private
   */
  async _cleanupDisabledRitualSpells() {
    const spellIdsToRemove = [];
    for (const classIdentifier of Object.keys(this._spellcastingClasses)) {
      if (RuleSet.getClassRule(this.actor, classIdentifier, 'ritualCasting', MODULE.RITUAL_CASTING_MODES.NONE) !== MODULE.SPELL_MODE.ALWAYS) {
        const moduleRitualSpells = this.actor.itemTypes.spell.filter(
          (s) => s.system?.method === MODULE.SPELL_MODE.RITUAL && (s.system?.sourceClass === classIdentifier || s.sourceClass === classIdentifier) && s.flags?.[MODULE.ID]?.isModuleRitual === true
        );
        if (moduleRitualSpells.length > 0) {
          log(3, 'Found ritual spells to remove for class', { classIdentifier, count: moduleRitualSpells.length });
          moduleRitualSpells.forEach((spell) => {
            spellIdsToRemove.push(spell.id);
          });
        }
      }
    }
    if (spellIdsToRemove.length > 0) {
      log(3, 'Removing disabled ritual spells', { count: spellIdsToRemove.length });
      await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    } else {
      log(3, 'No disabled ritual spells to remove');
    }
  }

  /**
   * Add missing wizard ritual spells using wizard spellbook.
   * @param {string} classIdentifier - The class identifier (should be 'wizard')
   * @param {object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   * @private
   */
  async _addWizardRitualSpells(classIdentifier, spellDataByClass) {
    const wizardManager = this._wizardManagers?.get(classIdentifier);
    if (!wizardManager || !wizardManager.isWizard) {
      log(2, 'No wizard manager found for adding ritual spells', { classIdentifier });
      return;
    }
    if (!spellDataByClass[classIdentifier]) return;
    const spellbookSpells = await wizardManager.getSpellbookSpells();
    for (const spellUuid of spellbookSpells) {
      const sourceSpell = await fromUuid(spellUuid);
      if (!sourceSpell || !UIUtils.hasSpellProperty(sourceSpell, 'ritual') || sourceSpell.system.level === 0) continue;
      const classSpellKey = `${classIdentifier}:${spellUuid}`;
      if (spellDataByClass[classIdentifier][classSpellKey]) spellDataByClass[classIdentifier][classSpellKey].isRitual = true;
    }

    log(3, 'Wizard ritual spells added', { classIdentifier });
  }

  /**
   * Add missing ritual spells for non-wizard classes using class spell lists.
   * @param {string} classIdentifier - The class identifier
   * @param {object} classData - The class data from spellcastingClasses
   * @param {object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   * @private
   */
  async _addClassRitualSpells(classIdentifier, classData, spellDataByClass) {
    if (!spellDataByClass[classIdentifier]) return;
    const spellList = await DataUtils.getClassSpellList(classData.name.toLowerCase(), classData.uuid, this.actor);
    if (!spellList?.size) return;
    const spellItems = await DataUtils.fetchSpellDocuments(spellList, 9);
    if (!spellItems?.length) return;
    for (const spell of spellItems) {
      if (!UIUtils.hasSpellProperty(spell, 'ritual') || spell.system?.level === 0) continue;
      const classSpellKey = `${classIdentifier}:${spell.compendiumUuid || spell.uuid}`;
      if (spellDataByClass[classIdentifier][classSpellKey]) spellDataByClass[classIdentifier][classSpellKey].isRitual = true;
    }
    log(3, 'Class ritual spells added', { classIdentifier });
  }
}
