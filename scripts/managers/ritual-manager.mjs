import { FLAGS, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
import { WizardSpellbookManager } from './wizard-spellbook-manager.mjs';

/**
 * Manages ritual casting from spellbooks
 */
export class RitualManager {
  /**
   * Create a new RitualManager
   * @param {Actor5e} actor - The actor to manage rituals for
   * @param {WizardSpellbookManager|null} wizardManager - Existing wizard manager instance
   */
  constructor(actor, wizardManager = null) {
    this.actor = actor;
    this.isWizard = false;
    this.wizardManager = null;

    // Use provided wizard manager or create new one
    if (wizardManager && wizardManager.isWizard) {
      this.isWizard = true;
      this.wizardManager = wizardManager;
    } else {
      this._initializeWizardManager();
    }
  }

  /**
   * Initialize wizard manager if the actor is a wizard (fallback)
   * @private
   */
  _initializeWizardManager() {
    const wizardManager = new WizardSpellbookManager(this.actor);
    if (wizardManager.isWizard) {
      this.isWizard = true;
      this.wizardManager = wizardManager;
      log(3, `Created new wizard manager for ${this.actor.name}`);
    } else {
      log(1, `Actor ${this.actor.name} is not a wizard`);
    }
  }

  /**
   * Check if ritual casting is enabled for the actor
   * @returns {boolean} Whether ritual casting is enabled
   */
  isRitualCastingEnabled() {
    if (!this.isWizard) return false;
    return this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_RITUAL_CASTING) !== false;
  }

  /**
   * Enable or disable ritual casting
   * @param {boolean} enabled - Whether to enable ritual casting
   * @returns {Promise<boolean>} Success status
   */
  async setRitualCastingEnabled(enabled) {
    //TODO: This is not yet implemented anywhere.
    if (!this.isWizard) return false;
    this.actor.setFlag(MODULE.ID, FLAGS.WIZARD_RITUAL_CASTING, enabled);
    if (enabled) await this.initializeAllRitualSpells();
    else await this.removeAllRitualOnlySpells();
    return true;
  }

  /**
   * Initialize all ritual spells from the wizard's spellbook
   * @returns {Promise<void>}
   */
  async initializeAllRitualSpells() {
    if (!this.isWizard || !this.isRitualCastingEnabled() || !this.wizardManager) return;

    try {
      const spellbookSpells = await this.wizardManager.getSpellbookSpells();
      const spellsToCreate = [];
      log(1, `Starting ritual initialization for ${this.actor.name}, checking ${spellbookSpells.length} spellbook spells`);
      let ritualSpellsFound = 0;
      let ritualSpellsAlreadyExist = 0;
      let ritualSpellsToCreate = 0;

      for (const spellUuid of spellbookSpells) {
        try {
          const existingSpell = this.actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === spellUuid || i.uuid === spellUuid));
          const sourceSpell = await fromUuid(spellUuid);
          if (!sourceSpell) {
            log(2, `Could not load spell ${spellUuid} from wizard spellbook`);
            continue;
          }

          if (!sourceSpell.system.components?.ritual || sourceSpell.system.level === 0) continue;
          ritualSpellsFound++;
          log(3, `Found ritual spell: ${sourceSpell.name} (${spellUuid}), exists on actor: ${!!existingSpell}`);

          if (existingSpell) {
            ritualSpellsAlreadyExist++;
            const isPrepared = existingSpell.system.preparation?.prepared;
            const currentMode = existingSpell.system.preparation?.mode;

            log(3, `Existing spell ${sourceSpell.name} - prepared: ${isPrepared}, mode: ${currentMode}`);

            if (!isPrepared && currentMode !== 'ritual') {
              await existingSpell.update({
                'system.preparation.mode': 'ritual',
                'system.preparation.prepared': false,
                'system.sourceClass': 'wizard'
              });
              log(1, `Updated existing spell ${sourceSpell.name} to ritual mode`);
            }
          } else {
            ritualSpellsToCreate++;
            const newSpellData = sourceSpell.toObject();
            if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
            newSpellData.system.preparation.mode = 'ritual';
            newSpellData.system.preparation.prepared = false;
            newSpellData.flags = newSpellData.flags || {};
            newSpellData.flags.core = newSpellData.flags.core || {};
            newSpellData.flags.core.sourceId = spellUuid;
            newSpellData.system.sourceClass = 'wizard';
            spellsToCreate.push(newSpellData);
            log(3, `Preparing to create ritual spell: ${sourceSpell.name}`);
          }
        } catch (error) {
          log(1, `Error processing ritual spell ${spellUuid}: ${error.message}`);
        }
      }

      log(3, `Ritual summary - Found: ${ritualSpellsFound}, Already exist: ${ritualSpellsAlreadyExist}, To create: ${ritualSpellsToCreate}`);
      if (spellsToCreate.length > 0) await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
    } catch (error) {
      log(1, `ERROR initializing ritual spells for ${this.actor.name}: ${error.message}`);
    }
  }

  /**
   * Remove all ritual-only spells from the actor
   * @returns {Promise<void>}
   */
  async removeAllRitualOnlySpells() {
    if (!this.isWizard) return;

    try {
      const ritualOnlySpells = this.actor.items.filter((i) => i.type === 'spell' && i.system.preparation?.mode === 'ritual' && !i.system.preparation?.prepared);

      if (ritualOnlySpells.length > 0) {
        const idsToRemove = ritualOnlySpells.map((s) => s.id);
        await this.actor.deleteEmbeddedDocuments('Item', idsToRemove);
        log(3, `Removed ${ritualOnlySpells.length} ritual-only spells from ${this.actor.name}`);
      }
    } catch (error) {
      log(1, `Error removing ritual-only spells for ${this.actor.name}:`, error);
    }
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
}
