import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
import { WizardSpellbookManager } from './wizard-spellbook.mjs';

/**
 * Manages ritual casting from spellbooks
 */
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
      log(1, `RitualManager: Created new wizard manager for ${this.actor.name}`);
    } else {
      log(1, `RitualManager: Actor ${this.actor.name} is not a wizard`);
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

    // Update ritual spells on the actor based on the new setting
    if (enabled) {
      await this.initializeAllRitualSpells();
    } else {
      await this.removeAllRitualOnlySpells();
    }

    return true;
  }

  /**
   * Initialize all ritual spells from the wizard's spellbook
   * @returns {Promise<void>}
   */
  async initializeAllRitualSpells() {
    if (!this.isWizard || !this.isRitualCastingEnabled() || !this.wizardManager) {
      log(1, `Ritual initialization skipped - isWizard: ${this.isWizard}, enabled: ${this.isRitualCastingEnabled()}, hasManager: ${!!this.wizardManager}`);
      return;
    }

    try {
      const spellbookSpells = await this.wizardManager.getSpellbookSpells();
      const spellsToCreate = [];

      log(1, `Starting ritual initialization for ${this.actor.name}, checking ${spellbookSpells.length} spellbook spells`);

      let ritualSpellsFound = 0;
      let ritualSpellsAlreadyExist = 0;
      let ritualSpellsToCreate = 0;

      for (const spellUuid of spellbookSpells) {
        try {
          // Check if this spell already exists on the actor
          const existingSpell = this.actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === spellUuid || i.uuid === spellUuid));

          // Get the source spell to check if it's a ritual
          const sourceSpell = await fromUuid(spellUuid);
          if (!sourceSpell) {
            log(2, `Could not load spell ${spellUuid} from wizard spellbook`);
            continue;
          }

          // Skip non-ritual spells and cantrips
          if (!sourceSpell.system.components?.ritual || sourceSpell.system.level === 0) {
            continue;
          }

          ritualSpellsFound++;
          log(1, `Found ritual spell: ${sourceSpell.name} (${spellUuid}), exists on actor: ${!!existingSpell}`);

          // If spell exists, ensure it has proper ritual mode if it's ritual-only
          if (existingSpell) {
            ritualSpellsAlreadyExist++;
            const isPrepared = existingSpell.system.preparation?.prepared;
            const currentMode = existingSpell.system.preparation?.mode;

            log(1, `Existing spell ${sourceSpell.name} - prepared: ${isPrepared}, mode: ${currentMode}`);

            // If it's not actively prepared and not already in ritual mode, update it
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
            // Create new ritual spell
            const newSpellData = sourceSpell.toObject();
            if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
            newSpellData.system.preparation.mode = 'ritual';
            newSpellData.system.preparation.prepared = false;
            newSpellData.flags = newSpellData.flags || {};
            newSpellData.flags.core = newSpellData.flags.core || {};
            newSpellData.flags.core.sourceId = spellUuid;
            newSpellData.system.sourceClass = 'wizard';

            spellsToCreate.push(newSpellData);
            log(1, `Preparing to create ritual spell: ${sourceSpell.name}`);
          }
        } catch (error) {
          log(1, `Error processing ritual spell ${spellUuid}: ${error.message}`);
        }
      }

      log(1, `Ritual summary - Found: ${ritualSpellsFound}, Already exist: ${ritualSpellsAlreadyExist}, To create: ${ritualSpellsToCreate}`);

      // Create all new ritual spells at once
      if (spellsToCreate.length > 0) {
        await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
        log(1, `SUCCESS: Created ${spellsToCreate.length} ritual spells for wizard ${this.actor.name}`);
      } else {
        log(1, `No new ritual spells needed for ${this.actor.name}`);
      }
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
        log(2, `Removed ${ritualOnlySpells.length} ritual-only spells from ${this.actor.name}`);
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

      log(3, `Cast ritual spell ${spellUuid} for ${this.actor.name}`);
      return true;
    } catch (error) {
      log(1, `Error casting ritual spell: ${error.message}`);
      return false;
    }
  }
}
