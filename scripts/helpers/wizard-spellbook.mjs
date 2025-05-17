import { CANTRIP_RULES, FLAGS, MODULE, WIZARD_DEFAULTS, WIZARD_SPELL_SOURCE } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as genericUtils from './generic-utils.mjs';

/**
 * Manages wizard-specific spellbook functionality
 */
export class WizardSpellbookManager {
  /**
   * Create a new WizardSpellbookManager for an actor
   * @param {Actor5e} actor - The actor to manage wizard spellbook for
   */
  static _folderCreationLock = false;
  static _journalCreationLocks = new Map();

  constructor(actor) {
    this.actor = actor;
    log(3, `Creating WizardSpellbookManager for ${actor.name}`);
    this.classItem = this._findWizardClass();
    this.isWizard = this.classItem !== null;

    if (this.isWizard) {
      this._initializeFlags();
    }
  }

  /**
   * Find the actor's wizard class
   * @returns {Item5e|null} - The wizard class item or null
   * @private
   */
  _findWizardClass() {
    if (genericUtils.isWizard(this.actor)) {
      const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
      const wizardClass = this.actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === localizedWizardName);
      if (wizardClass) return wizardClass;
      if (this.actor.getFlag(MODULE.ID, FLAGS.FORCE_WIZARD_MODE)) return genericUtils.findSpellcastingClass(this.actor);
    }

    return null;
  }

  /**
   * Get the rules for this wizard from cantrip settings
   * @returns {string} The current cantrip rules setting
   */
  getCantripRules() {
    return this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_RULES) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_RULES) || CANTRIP_RULES.LEGACY;
  }

  /**
   * Initialize wizard flags on the actor
   * @returns {Promise<Object>} Update data applied, if any
   * @private
   */
  async _initializeFlags() {
    try {
      const updateData = {};
      const flags = this.actor.flags?.[MODULE.ID] || {};

      if (!flags[FLAGS.WIZARD_COPIED_SPELLS]) {
        updateData[`flags.${MODULE.ID}.${FLAGS.WIZARD_COPIED_SPELLS}`] = [];
      }

      if (Object.keys(updateData).length > 0) {
        log(3, 'Initializing wizard flags', updateData);
        await this.actor.update(updateData);
      }

      return updateData;
    } catch (error) {
      log(1, 'Error initializing wizard flags:', error);
      return {};
    }
  }

  /**
   * Determine if wizard can swap cantrips on long rest
   * @param {boolean} isLongRest - Whether this is being called during a long rest
   * @returns {boolean} - Whether cantrip swapping is allowed
   */
  canSwapCantripsOnLongRest(isLongRest) {
    if (!isLongRest) return true;
    const rules = this.getCantripRules();
    return rules === CANTRIP_RULES.MODERN_LONG_REST;
  }

  /**
   * Get all spells in the wizard's spellbook
   * @returns {Promise<Array<string>>} Array of spell UUIDs
   */
  async getSpellbookSpells() {
    const journal = await this.getOrCreateSpellbookJournal();
    const journalPage = journal.pages.find((p) => p.type === 'spells');
    return Array.from(journalPage.system.spells || []);
  }

  /**
   * Check if a spell is in the wizard's spellbook
   * @param {string} spellUuid - UUID of the spell
   * @returns {Promise<boolean>} Whether the spell is in the spellbook
   */
  async isSpellInSpellbook(spellUuid) {
    const journal = await this.getOrCreateSpellbookJournal();
    const journalPage = journal.pages.find((p) => p.type === 'spells');
    return journalPage.system.spells.has(spellUuid);
  }

  /**
   * Copy a spell to the wizard's spellbook with associated cost and time
   * @param {string} spellUuid - UUID of the spell to copy
   * @param {number} cost - Cost in gold to copy the spell
   * @param {number} time - Time in hours to copy the spell
   * @param {boolean} isFree - Whether this is a free spell
   * @returns {Promise<boolean>} Success state
   */
  async copySpell(spellUuid, cost, time, isFree = false) {
    if (!isFree) {
      return this.addSpellToSpellbook(spellUuid, WIZARD_SPELL_SOURCE.COPIED, { cost, timeSpent: time });
    } else {
      return this.addSpellToSpellbook(spellUuid, WIZARD_SPELL_SOURCE.FREE, null);
    }
  }

  /**
   * Check if a spell can be prepared by the wizard
   * @param {string} spellUuid - UUID of the spell
   * @returns {Promise<boolean>} Whether the spell can be prepared
   */
  async canPrepareSpell(spellUuid) {
    return this.isSpellInSpellbook(spellUuid);
  }

  /**
   * Get all ritual spells that can be cast from the spellbook
   * @returns {Promise<Array<Item5e>>} Array of ritual spell items
   */
  async getRitualSpells() {
    try {
      const spellbookSpells = await this.getSpellbookSpells();
      const ritualSpells = [];
      for (const uuid of spellbookSpells) {
        try {
          const spell = await fromUuid(uuid);
          if (spell && spell.system.components?.ritual) {
            ritualSpells.push(spell);
          }
        } catch (error) {
          log(1, `Error loading ritual spell ${uuid}: ${error.message}`);
        }
      }

      return ritualSpells;
    } catch (error) {
      log(1, `Error getting ritual spells: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate cost to copy a spell
   * @param {Item5e} spell - The spell to copy
   * @returns {number} Cost in gold pieces
   */
  getCopyingCost(spell) {
    return spell.system.level === 0 ? 0 : spell.system.level * 50;
  }

  /**
   * Calculate time to copy a spell
   * @param {Item5e} spell - The spell to copy
   * @returns {number} Time in hours
   */
  getCopyingTime(spell) {
    return spell.system.level === 0 ? 1 : spell.system.level * 2;
  }

  /**
   * Add a spell to the wizard's spellbook
   * @param {string} spellUuid - UUID of the spell to add
   * @param {string} source - Source of the spell (levelUp, copied, initial)
   * @param {Object} metadata - Additional metadata for the spell
   * @returns {Promise<boolean>} Success state
   */
  async addSpellToSpellbook(spellUuid, source, metadata) {
    try {
      const journal = await this.getOrCreateSpellbookJournal();
      const journalPage = journal.pages.find((p) => p.type === 'spells');
      const spells = journalPage.system.spells || new Set();
      spells.add(spellUuid);
      await journalPage.update({ 'system.spells': spells });
      if (source === WIZARD_SPELL_SOURCE.COPIED) {
        const metadataObj = {
          spellUuid,
          dateCopied: Date.now(),
          cost: metadata?.cost || 0,
          timeSpent: metadata?.timeSpent || 0
        };

        const copiedSpells = this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_COPIED_SPELLS) || [];
        copiedSpells.push(metadataObj);
        this.actor.setFlag(MODULE.ID, FLAGS.WIZARD_COPIED_SPELLS, copiedSpells);
      }

      log(3, `Added spell ${spellUuid} to ${this.actor.name}'s spellbook`);
      return true;
    } catch (error) {
      log(1, `Error adding spell to spellbook: ${error.message}`);
      return false;
    }
  }

  /**
   * Find the actor's spellbook journal
   * @returns {Promise<JournalEntry|null>} The actor's spellbook journal or null if not found
   */
  async findSpellbookJournal() {
    try {
      const customPack = game.packs.get(MODULE.PACK);
      const index = await customPack.getIndex({ fields: ['flags'] });
      for (const entry of index) {
        if (entry.flags?.[MODULE.ID]?.actorId === this.actor.id) {
          const document = await customPack.getDocument(entry._id);
          return document;
        }
      }

      log(2, `No spellbook journal found for actor ${this.actor.id}`);
      return null;
    } catch (error) {
      log(1, `Error finding spellbook journal: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a new spellbook journal for the actor
   * @returns {Promise<JournalEntry>} The created journal
   */
  async createSpellbookJournal() {
    try {
      const customPack = game.packs.get(MODULE.PACK);
      const folder = this.getSpellbooksFolder();
      const journalData = {
        name: this.actor.name,
        folder: folder ? folder.id : null,
        flags: {
          [MODULE.ID]: {
            actorId: this.actor.id,
            isActorSpellbook: true,
            creationDate: Date.now()
          }
        },
        pages: [
          {
            name: `${this.actor.name}'s Spell Book`,
            type: 'spells',
            flags: {
              [MODULE.ID]: {
                isActorSpellbook: true,
                actorId: this.actor.id
              }
            },
            system: {
              identifier: `${this.actor.id}-${MODULE.ID}`,
              description: `Spellbook for ${this.actor.name}`,
              spells: new Set()
            }
          }
        ]
      };
      const journal = await JournalEntry.create(journalData, { pack: customPack.collection });
      log(3, `Created new spellbook journal for ${this.actor.name}: ${journal.uuid}`);
      return journal;
    } catch (error) {
      log(1, `Error creating spellbook journal:`, error);
    }
  }

  /**
   * Get or create the actor's spellbook journal
   * @returns {Promise<JournalEntry>} The actor's spellbook journal
   */
  async getOrCreateSpellbookJournal() {
    const actorLock = WizardSpellbookManager._journalCreationLocks.get(this.actor.id);
    if (actorLock) return null;
    try {
      WizardSpellbookManager._journalCreationLocks.set(this.actor.id, true);
      const existingJournal = await this.findSpellbookJournal();
      if (existingJournal) return existingJournal;
      return await this.createSpellbookJournal();
    } catch (error) {
      log(1, `Error getting or creating spellbook journal:`, error);
    } finally {
      WizardSpellbookManager._journalCreationLocks.delete(this.actor.id);
    }
  }

  /**
   * Get the Actor Spellbooks folder from the custom spellbooks pack
   * @returns {Folder|null} The folder or null if not found
   */
  getSpellbooksFolder() {
    const customPack = game.packs.get(MODULE.PACK);
    const folder = customPack.folders.find((f) => f.name === 'Actor Spellbooks');
    if (folder) return folder;
    return null;
  }

  /**
   * Calculate the maximum number of spells allowed in the wizard's spellbook
   * @returns {number} The maximum number of spells allowed
   */
  getMaxSpellsAllowed() {
    if (!this.isWizard) return 0;
    const wizardLevel = this.classItem.system.levels || 1;
    const startingSpells = WIZARD_DEFAULTS.STARTING_SPELLS;
    const spellsPerLevel = WIZARD_DEFAULTS.SPELLS_PER_LEVEL;
    const maxSpells = startingSpells + Math.max(0, wizardLevel - 1) * spellsPerLevel;
    log(3, `Maximum wizard spells: ${maxSpells} (level ${wizardLevel})`);
    return maxSpells;
  }

  /**
   * Get the number of free spells the wizard should have at current level
   * @returns {number} The number of free spells
   */
  getTotalFreeSpells() {
    if (!this.isWizard) return 0;
    const wizardLevel = this.classItem.system.levels || 1;
    return WIZARD_DEFAULTS.STARTING_SPELLS + Math.max(0, wizardLevel - 1) * WIZARD_DEFAULTS.SPELLS_PER_LEVEL;
  }

  /**
   * Get the number of free spells the wizard has already used
   * @returns {Promise<number>} The number of free spells used
   */
  async getUsedFreeSpells() {
    const allSpells = await this.getSpellbookSpells();
    const copiedSpells = this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_COPIED_SPELLS) || [];
    const paidUuids = new Set(copiedSpells.map((s) => s.spellUuid));
    const freeSpellsUsed = allSpells.filter((uuid) => !paidUuids.has(uuid)).length;
    log(3, `Used free spells: ${freeSpellsUsed} (total: ${allSpells.length}, paid: ${paidUuids.size})`);
    return freeSpellsUsed;
  }

  /**
   * Get the number of free spells the wizard has remaining
   * @returns {Promise<number>} The number of free spells remaining
   */
  async getRemainingFreeSpells() {
    const totalFree = this.getTotalFreeSpells();
    const usedFree = await this.getUsedFreeSpells();
    return Math.max(0, totalFree - usedFree);
  }

  /**
   * Check if a spell would be free to copy
   * @param {Item5e} spell - The spell to check
   * @returns {Promise<boolean>} Whether the spell would be free
   */
  async isSpellFree(spell) {
    if (spell.system.level === 0) return true;
    const remainingFree = await this.getRemainingFreeSpells();
    return remainingFree > 0;
  }

  /**
   * Calculate cost to copy a spell, accounting for free spells
   * @param {Item5e} spell - The spell to copy
   * @returns {Promise<{cost: number, isFree: boolean}>} Cost in gold pieces and if it's free
   */
  async getCopyingCostWithFree(spell) {
    const isFree = await this.isSpellFree(spell);
    if (isFree) return { cost: 0, isFree: true };

    const cost = this.getCopyingCost(spell);
    return { cost, isFree: false };
  }
}
