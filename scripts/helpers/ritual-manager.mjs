import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
import { WizardSpellbookManager } from './wizard-spellbook.mjs';

/**
 * Manages ritual casting from spellbooks
 */
export class RitualManager {
  /**
   * Create a new RitualManager
   * @param {Actor5e} actor - The actor to manage rituals for
   */
  constructor(actor) {
    this.actor = actor;
    this.isWizard = false;
    this.wizardManager = null;
    this._initializeWizardManager();
  }

  /**
   * Initialize wizard manager if the actor is a wizard
   * @private
   */
  _initializeWizardManager() {
    const wizardManager = new WizardSpellbookManager(this.actor);
    if (wizardManager.isWizard) {
      this.isWizard = true;
      this.wizardManager = wizardManager;
    }
  }

  /**
   * Check if ritual casting is enabled for the actor
   * @returns {boolean} Whether ritual casting is enabled
   */
  isRitualCastingEnabled() {
    if (!this.isWizard) return false;
    return this.actor.getFlag(MODULE.ID, 'wizardRitualCasting') !== false;
  }

  /**
   * Enable or disable ritual casting
   * @param {boolean} enabled - Whether to enable ritual casting
   * @returns {Promise<boolean>} Success status
   */
  async setRitualCastingEnabled(enabled) {
    if (!this.isWizard) return false;
    await this.actor.setFlag(MODULE.ID, 'wizardRitualCasting', enabled);
    return true;
  }

  /**
   * Get all ritual spells available to cast
   * @returns {Promise<Array<Item5e>>} Array of ritual spell items
   */
  async getRitualSpells() {
    if (!this.isWizard || !this.wizardManager) return [];
    if (!this.isRitualCastingEnabled()) return [];

    return await this.wizardManager.getRitualSpells();
  }

  /**
   * Cast a spell as a ritual
   * @param {string} spellUuid - UUID of the spell to cast
   * @returns {Promise<boolean>} Success status
   */
  async castRitual(spellUuid) {
    if (!this.isWizard || !this.isRitualCastingEnabled()) return false;

    try {
      const spell = await fromUuid(spellUuid);
      if (!spell || !spell.system.components?.ritual) {
        log(1, `Spell ${spellUuid} is not a ritual`);
        return false;
      }

      const isInSpellbook = await this.wizardManager.isSpellInSpellbook(spellUuid);
      if (!isInSpellbook) {
        log(1, `Spell ${spellUuid} is not in the wizard's spellbook`);
        return false;
      }

      // Create temporary spell item for casting
      const spellData = spell.toObject();
      if (!spellData.system.preparation) spellData.system.preparation = {};
      spellData.system.preparation.mode = 'ritual';
      spellData.system.preparation.prepared = false;
      spellData.flags = spellData.flags || {};
      spellData.flags.core = spellData.flags.core || {};
      spellData.flags.core.sourceId = spellUuid;

      const tempSpell = await this.actor.createEmbeddedDocuments('Item', [spellData]);
      if (!tempSpell || tempSpell.length === 0) {
        log(1, `Failed to create temporary ritual spell`);
        return false;
      }

      log(3, `Created temporary ritual spell ${spellUuid} for ${this.actor.name}`);
      return true;
    } catch (error) {
      log(1, `Error casting ritual spell: ${error.message}`);
      return false;
    }
  }
}
