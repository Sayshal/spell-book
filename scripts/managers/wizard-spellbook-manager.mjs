import { FLAGS, MODULE } from '../constants.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from './rule-set-manager.mjs';

/**
 * Manages wizard-specific spellbook functionality
 */
export class WizardSpellbookManager {
  static _folderCreationLock = false;
  static _journalCreationLocks = new Map();

  /**
   * Create a new WizardSpellbookManager for an actor
   * @param {Actor5e} actor - The actor to manage wizard spellbook for
   */
  constructor(actor) {
    this.actor = actor;
    this.classItem = this._findWizardClass();
    this.isWizard = this.classItem !== null;
    this._spellbookCache = null;
    this._maxSpellsCache = null;
    this._freeSpellsCache = null;
    if (this.isWizard) {
      this._initializeFlags();
      this._initializeCache();
    }
  }

  /**
   * Initialize cache with pre-calculated values
   * @private
   */
  async _initializeCache() {
    this._maxSpellsCache = this.getMaxSpellsAllowed();
    this._freeSpellsCache = this.getTotalFreeSpells();
    log(3, `Initialized wizard cache: max=${this._maxSpellsCache}, free=${this._freeSpellsCache}`);
  }

  /**
   * Invalidate cache when spells are added/removed
   */
  invalidateCache() {
    this._spellbookCache = null;
    this._maxSpellsCache = null;
    this._freeSpellsCache = null;
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
   * Initialize wizard flags on the actor
   * @returns {Promise<Object>} Update data applied, if any
   * @private
   */
  async _initializeFlags() {
    const updateData = {};
    const flags = this.actor.flags?.[MODULE.ID] || {};
    if (!flags[FLAGS.WIZARD_COPIED_SPELLS]) updateData[`flags.${MODULE.ID}.${FLAGS.WIZARD_COPIED_SPELLS}`] = [];
    if (Object.keys(updateData).length > 0) await this.actor.update(updateData);
    return updateData;
  }

  /**
   * Get the wizard's cantrip swapping rules from class-specific settings
   * @returns {string} The current cantrip swapping mode ('none', 'levelUp', 'longRest')
   */
  getCantripSwappingMode() {
    const classRules = RuleSetManager.getClassRules(this.actor, 'wizard');
    return classRules.cantripSwapping || 'none';
  }

  /**
   * Determine if wizard can swap cantrips on long rest
   * @param {boolean} isLongRest - Whether this is being called during a long rest
   * @returns {boolean} - Whether cantrip swapping is allowed
   */
  canSwapCantripsOnLongRest(isLongRest) {
    if (!isLongRest) return true;
    const cantripSwappingMode = this.getCantripSwappingMode();
    return cantripSwappingMode === 'longRest';
  }

  /**
   * Get all spells in the wizard's spellbook (with caching)
   * @returns {Promise<Array<string>>} Array of spell UUIDs
   */
  async getSpellbookSpells() {
    if (this._spellbookCache) return this._spellbookCache;
    const journal = await this.getOrCreateSpellbookJournal();
    if (!journal) return [];
    const journalPage = journal.pages?.find((p) => p.type === 'spells');
    if (!journalPage) return [];
    this._spellbookCache = Array.from(journalPage.system?.spells || []);
    return this._spellbookCache;
  }

  /**
   * Check if a spell is in the wizard's spellbook
   * @param {string} spellUuid - UUID of the spell
   * @returns {Promise<boolean>} Whether the spell is in the spellbook
   */
  async isSpellInSpellbook(spellUuid) {
    const spells = await this.getSpellbookSpells();
    return spells.includes(spellUuid);
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
    const result =
      !isFree ?
        await this.addSpellToSpellbook(spellUuid, MODULE.WIZARD_SPELL_SOURCE.COPIED, { cost, timeSpent: time })
      : await this.addSpellToSpellbook(spellUuid, MODULE.WIZARD_SPELL_SOURCE.FREE, null);
    if (result) this.invalidateCache();
    return result;
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
    const spellbookSpells = await this.getSpellbookSpells();
    const ritualSpells = [];
    for (const uuid of spellbookSpells) {
      const spell = await fromUuid(uuid);
      if (spell && spell.system.components?.ritual) ritualSpells.push(spell);
    }
    return ritualSpells;
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
    const journal = await this.getOrCreateSpellbookJournal();
    const journalPage = journal.pages.find((p) => p.type === 'spells');
    const spells = journalPage.system.spells || new Set();
    spells.add(spellUuid);
    await journalPage.update({ 'system.spells': spells });
    if (source === MODULE.WIZARD_SPELL_SOURCE.COPIED) {
      const metadataObj = { spellUuid, dateCopied: Date.now(), cost: metadata?.cost || 0, timeSpent: metadata?.timeSpent || 0 };
      const copiedSpells = this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_COPIED_SPELLS) || [];
      copiedSpells.push(metadataObj);
      this.actor.setFlag(MODULE.ID, FLAGS.WIZARD_COPIED_SPELLS, copiedSpells);
    }
    log(3, `Added spell ${spellUuid} to ${this.actor.name}'s spellbook`);
    this.invalidateCache();
    return true;
  }

  /**
   * Find the actor's spellbook journal
   * @returns {Promise<JournalEntry|null>} The actor's spellbook journal or null if not found
   */
  async findSpellbookJournal() {
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
    const index = await customPack.getIndex({ fields: ['flags'] });
    for (const entry of index) {
      if (entry.flags?.[MODULE.ID]?.actorId === this.actor.id) {
        const document = await customPack.getDocument(entry._id);
        return document;
      }
    }
    log(2, `No spellbook journal found for actor ${this.actor.id}`);
    return null;
  }

  /**
   * Create a new spellbook journal for the actor
   * @returns {Promise<JournalEntry>} The created journal
   */
  async createSpellbookJournal() {
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
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
          name: game.i18n.format('SPELLBOOK.Journal.PageTitle', { name: this.actor.name }),
          type: 'spells',
          flags: {
            [MODULE.ID]: {
              isActorSpellbook: true,
              actorId: this.actor.id
            }
          },
          system: {
            identifier: `${this.actor.id}-${MODULE.ID}`,
            description: game.i18n.format('SPELLBOOK.Journal.SpellbookDescription', { name: this.actor.name }),
            spells: new Set()
          }
        }
      ]
    };
    const journal = await JournalEntry.create(journalData, { pack: customPack.collection });
    log(3, `Created new spellbook journal for ${this.actor.name}: ${journal.uuid}`);
    return journal;
  }

  /**
   * Get or create the actor's spellbook journal
   * @returns {Promise<JournalEntry|null>} The actor's spellbook journal
   */
  async getOrCreateSpellbookJournal() {
    while (WizardSpellbookManager._journalCreationLocks.get(this.actor.id)) await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      WizardSpellbookManager._journalCreationLocks.set(this.actor.id, true);
      const existingJournal = await this.findSpellbookJournal();
      if (existingJournal) return existingJournal;
      const newJournal = await this.createSpellbookJournal();
      return newJournal;
    } catch (error) {
      log(1, `Error getting or creating spellbook journal for ${this.actor.name}:`, error);
      return null;
    } finally {
      WizardSpellbookManager._journalCreationLocks.delete(this.actor.id);
    }
  }

  /**
   * Get the Actor Spellbooks folder from the custom spellbooks pack
   * @returns {Folder|null} The folder or null if not found
   */
  getSpellbooksFolder() {
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
    const folder = customPack.folders.find((f) => f.name === 'Actor Spellbooks');
    if (folder) return folder;
    return null;
  }

  /**
   * Calculate the maximum number of spells allowed in the wizard's spellbook (cached)
   * @returns {number} The maximum number of spells allowed
   */
  getMaxSpellsAllowed() {
    if (this._maxSpellsCache !== null) return this._maxSpellsCache;
    if (!this.isWizard) return 0;
    const wizardLevel = this.classItem.system.levels || 1;
    const startingSpells = MODULE.WIZARD_DEFAULTS.STARTING_SPELLS;
    const spellsPerLevel = MODULE.WIZARD_DEFAULTS.SPELLS_PER_LEVEL;
    const maxSpells = startingSpells + Math.max(0, wizardLevel - 1) * spellsPerLevel;
    this._maxSpellsCache = maxSpells;
    log(3, `Maximum wizard spells: ${maxSpells} (level ${wizardLevel})`);
    return maxSpells;
  }

  /**
   * Get the number of free spells the wizard should have at current level (cached)
   * @returns {number} The number of free spells
   */
  getTotalFreeSpells() {
    if (this._freeSpellsCache !== null) return this._freeSpellsCache;
    if (!this.isWizard) return 0;
    const wizardLevel = this.classItem.system.levels || 1;
    const freeSpells = MODULE.WIZARD_DEFAULTS.STARTING_SPELLS + Math.max(0, wizardLevel - 1) * MODULE.WIZARD_DEFAULTS.SPELLS_PER_LEVEL;
    this._freeSpellsCache = freeSpells;
    return freeSpells;
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
