import { log } from '../logger.mjs';
import { RuleSetManager } from './rule-set-manager.mjs';
import { WizardSpellbookManager } from './wizard-spellbook-manager.mjs';

/**
 * Manages ritual casting from spellbooks using per-class rules
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
    }
  }

  /**
   * Check if ritual casting is enabled for the wizard class
   * @param {string} classIdentifier - The class identifier (defaults to 'wizard')
   * @returns {boolean} Whether ritual casting is enabled
   */
  isRitualCastingEnabled(classIdentifier = 'wizard') {
    if (!this.isWizard) return false;
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    return classRules.ritualCasting !== 'none';
  }

  /**
   * Get the ritual casting mode for the wizard class
   * @param {string} classIdentifier - The class identifier (defaults to 'wizard')
   * @returns {string} The ritual casting mode ('none', 'prepared', 'always')
   */
  getRitualCastingMode(classIdentifier = 'wizard') {
    if (!this.isWizard) return 'none';
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    return classRules.ritualCasting || 'none';
  }

  /**
   * Check if a spell should be available as a ritual based on the current mode
   * @param {Item5e} spell - The spell to check
   * @param {string} classIdentifier - The class identifier (defaults to 'wizard')
   * @returns {boolean} Whether the spell should be available as a ritual
   */
  shouldSpellBeAvailableAsRitual(spell, classIdentifier = 'wizard') {
    if (!this.isWizard || !spell.system.components?.ritual || spell.system.level === 0) {
      return false;
    }
    const mode = this.getRitualCastingMode(classIdentifier);
    switch (mode) {
      case 'always':
        return true;
      case 'prepared':
        return spell.system.preparation?.prepared || spell.system.preparation?.mode === 'prepared';
      case 'none':
      default:
        return false;
    }
  }

  /**
   * Initialize all ritual spells from the wizard's spellbook based on current rules
   * @param {string} classIdentifier - The class identifier (defaults to 'wizard')
   * @returns {Promise<void>}
   */
  async initializeAllRitualSpells(classIdentifier = 'wizard') {
    if (!this.isWizard || !this.wizardManager) return;
    const ritualMode = this.getRitualCastingMode(classIdentifier);
    if (ritualMode === 'none') return;
    const spellbookSpells = await this.wizardManager.getSpellbookSpells();
    const spellsToCreate = [];
    log(3, `Starting ritual initialization for ${this.actor.name} (${ritualMode} mode), checking ${spellbookSpells.length} spellbook spells`);
    let ritualSpellsFound = 0;
    let ritualSpellsAlreadyExist = 0;
    let ritualSpellsToCreate = 0;
    for (const spellUuid of spellbookSpells) {
      const existingSpell = this.actor.items.find(
        (i) =>
          i.type === 'spell' && (i.flags?.core?.sourceId === spellUuid || i.uuid === spellUuid) && (i.system?.sourceClass === classIdentifier || i.sourceClass === classIdentifier)
      );
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
        if (ritualMode === 'always' && currentMode !== 'ritual') {
          await existingSpell.update({
            'system.preparation.mode': 'ritual',
            'system.preparation.prepared': false,
            'system.sourceClass': classIdentifier
          });
          log(1, `Updated existing spell ${sourceSpell.name} to ritual mode`);
        } else if (ritualMode === 'prepared' && !isPrepared && currentMode !== 'ritual') {
          if (currentMode === 'prepared') {
            await existingSpell.update({
              'system.preparation.mode': 'ritual',
              'system.preparation.prepared': false,
              'system.sourceClass': classIdentifier
            });
            log(1, `Updated prepared spell ${sourceSpell.name} to ritual mode`);
          }
        }
      } else {
        if (ritualMode === 'always') {
          ritualSpellsToCreate++;
          const newSpellData = sourceSpell.toObject();
          if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
          newSpellData.system.preparation.mode = 'ritual';
          newSpellData.system.preparation.prepared = false;
          newSpellData.flags = newSpellData.flags || {};
          newSpellData.flags.core = newSpellData.flags.core || {};
          newSpellData.flags.core.sourceId = spellUuid;
          newSpellData.system.sourceClass = classIdentifier;
          spellsToCreate.push(newSpellData);
          log(3, `Preparing to create ritual spell: ${sourceSpell.name}`);
        }
      }
    }
    log(3, `Ritual summary - Found: ${ritualSpellsFound}, Already exist: ${ritualSpellsAlreadyExist}, To create: ${ritualSpellsToCreate}`);
    if (spellsToCreate.length > 0) await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
  }

  /**
   * Remove all ritual-only spells from the actor for a specific class
   * @param {string} classIdentifier - The class identifier (defaults to 'wizard')
   * @returns {Promise<void>}
   */
  async removeAllRitualOnlySpells(classIdentifier = 'wizard') {
    if (!this.isWizard) return;
    const ritualOnlySpells = this.actor.items.filter(
      (i) =>
        i.type === 'spell' &&
        i.system.preparation?.mode === 'ritual' &&
        !i.system.preparation?.prepared &&
        (i.system?.sourceClass === classIdentifier || i.sourceClass === classIdentifier)
    );
    if (ritualOnlySpells.length > 0) {
      const idsToRemove = ritualOnlySpells.map((s) => s.id);
      await this.actor.deleteEmbeddedDocuments('Item', idsToRemove);
      log(3, `Removed ${ritualOnlySpells.length} ritual-only spells for ${classIdentifier} from ${this.actor.name}`);
    }
  }

  /**
   * Update ritual spells based on current class rules
   * @param {string} classIdentifier - The class identifier (defaults to 'wizard')
   * @returns {Promise<void>}
   */
  async updateRitualSpellsForCurrentMode(classIdentifier = 'wizard') {
    if (!this.isWizard || !this.wizardManager) return;
    const ritualMode = this.getRitualCastingMode(classIdentifier);
    switch (ritualMode) {
      case 'none':
        await this.removeAllRitualOnlySpells(classIdentifier);
        break;
      case 'always':
      case 'prepared':
        await this.initializeAllRitualSpells(classIdentifier);
        break;
    }
  }

  /**
   * Get all ritual spells available to cast for a specific class
   * @param {string} classIdentifier - The class identifier (defaults to 'wizard')
   * @returns {Promise<Array<Item5e>>} Array of ritual spell items
   */
  async getRitualSpells(classIdentifier = 'wizard') {
    if (!this.isWizard || !this.wizardManager) return [];
    const ritualMode = this.getRitualCastingMode(classIdentifier);
    if (ritualMode === 'none') return [];
    const ritualSpells = this.actor.items.filter((spell) => {
      if (spell.type !== 'spell') return false;
      if (!spell.system.components?.ritual) return false;
      if (spell.system.level === 0) return false;
      const spellClass = spell.system?.sourceClass || spell.sourceClass;
      if (spellClass && spellClass !== classIdentifier) return false;
      switch (ritualMode) {
        case 'always':
          return spell.system.preparation?.mode === 'ritual' || spell.system.preparation?.prepared;
        case 'prepared':
          return spell.system.preparation?.prepared || spell.system.preparation?.mode === 'ritual';
        default:
          return false;
      }
    });

    return ritualSpells;
  }

  /**
   * Check if a specific spell can be cast as a ritual
   * @param {Item5e|string} spell - The spell item or UUID
   * @param {string} classIdentifier - The class identifier (defaults to 'wizard')
   * @returns {Promise<boolean>} Whether the spell can be cast as a ritual
   */
  async canCastAsRitual(spell, classIdentifier = 'wizard') {
    if (!this.isWizard) return false;
    let spellItem = spell;
    if (typeof spell === 'string') spellItem = await fromUuid(spell);
    if (!spellItem || !spellItem.system.components?.ritual || spellItem.system.level === 0) return false;
    return this.shouldSpellBeAvailableAsRitual(spellItem, classIdentifier);
  }
}
