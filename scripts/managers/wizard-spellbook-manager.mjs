import { FLAGS, MODULE } from '../constants/_module.mjs';
import * as genericUtils from '../data/generic-utils.mjs';
import { log } from '../logger.mjs';

/**
 * Manages wizard-specific spellbook functionality for a specific class
 */
export class WizardSpellbookManager {
  static _folderCreationLock = false;
  static _journalCreationLocks = new Map();

  /**
   * Create a new WizardSpellbookManager for an actor and specific class
   * @param {Actor5e} actor - The actor to manage wizard spellbook for
   * @param {string} classIdentifier - The class identifier (e.g., 'wizard', 'cleric')
   */
  constructor(actor, classIdentifier = 'wizard') {
    this.actor = actor;
    this.classIdentifier = classIdentifier;
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
   */
  async _initializeCache() {
    this._maxSpellsCache = this.getMaxSpellsAllowed();
    this._freeSpellsCache = this.getTotalFreeSpells();
    log(3, `Initialized wizard cache for ${this.classIdentifier}: max=${this._maxSpellsCache}, free=${this._freeSpellsCache}`);
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
   * Find the actor's wizard-enabled class for this identifier
   * @returns {Item5e|null} - The wizard-enabled class item or null
   */
  _findWizardClass() {
    if (!this.actor.spellcastingClasses?.[this.classIdentifier]) return null;
    const spellcastingData = this.actor.spellcastingClasses[this.classIdentifier];
    const classItem = this.actor.items.get(spellcastingData.id);
    if (!classItem) return null;
    if (genericUtils.isClassWizardEnabled(this.actor, this.classIdentifier)) return classItem;
    return null;
  }

  /**
   * Initialize wizard flags on the actor for this class
   * @returns {Promise<Object>} Update data applied, if any
   */
  async _initializeFlags() {
    const updateData = {};
    const flags = this.actor.flags?.[MODULE.ID] || {};
    const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${this.classIdentifier}`;
    if (!flags[copiedSpellsFlag]) updateData[`flags.${MODULE.ID}.${copiedSpellsFlag}`] = [];
    if (Object.keys(updateData).length > 0) await this.actor.update(updateData);
    return updateData;
  }

  /**
   * Get all spells in the wizard's spellbook for this class (with caching)
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
   * Calculate cost to copy a spell, accounting for free spells
   * @param {Item5e} spell - The spell to copy
   * @returns {Promise<{cost: number, isFree: boolean}>} Cost in gold pieces and if it's free
   */
  async getCopyingCost(spell) {
    const isFree = await this.isSpellFree(spell);
    if (isFree) return { cost: 0, isFree: true };
    const cost = spell.system.level === 0 ? 0 : spell.system.level * 50;
    return { cost, isFree: false };
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
      const metadataObj = {
        spellUuid,
        dateCopied: Date.now(),
        cost: metadata?.cost || 0,
        timeSpent: metadata?.timeSpent || 0
      };
      const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${this.classIdentifier}`;
      const copiedSpells = this.actor.getFlag(MODULE.ID, copiedSpellsFlag) || [];
      copiedSpells.push(metadataObj);
      await this.actor.setFlag(MODULE.ID, copiedSpellsFlag, copiedSpells);
    }
    log(3, `Added spell ${spellUuid} to ${this.actor.name}'s ${this.classIdentifier} spellbook`);
    this.invalidateCache();
    return true;
  }

  /**
   * Find the actor's spellbook journal for this class
   * @returns {Promise<JournalEntry|null>} The actor's spellbook journal or null if not found
   */
  async findSpellbookJournal() {
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
    const index = await customPack.getIndex({ fields: ['flags'] });
    for (const entry of index) {
      const flags = entry.flags?.[MODULE.ID];
      if (flags?.actorId === this.actor.id && flags?.classIdentifier === this.classIdentifier) {
        const document = await customPack.getDocument(entry._id);
        return document;
      }
    }
    log(2, `No spellbook journal found for actor ${this.actor.id}, class ${this.classIdentifier}`);
    return null;
  }

  /**
   * Create a new spellbook journal for the actor and class
   * @returns {Promise<JournalEntry>} The created journal
   */
  async createSpellbookJournal() {
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
    const folder = this.getSpellbooksFolder();
    const className = this.classItem?.name || this.classIdentifier;
    const journalName = this.classIdentifier === 'wizard' ? this.actor.name : `${this.actor.name} (${className})`;
    const actorOwnership = this.actor.ownership || {};
    const ownerUserIds = Object.keys(actorOwnership).filter((userId) => userId !== 'default' && actorOwnership[userId] === 3);
    const correctOwnership = { default: 0, [game.user.id]: 3 };
    for (const ownerUserId of ownerUserIds) correctOwnership[ownerUserId] = 3;
    const journalData = {
      name: journalName,
      folder: folder ? folder.id : null,
      ownership: correctOwnership,
      flags: {
        [MODULE.ID]: {
          actorId: this.actor.id,
          classIdentifier: this.classIdentifier,
          isActorSpellbook: true,
          creationDate: Date.now()
        }
      },
      pages: [
        {
          name: game.i18n.format('SPELLBOOK.Journal.PageTitle', { name: journalName }),
          type: 'spells',
          ownership: correctOwnership,
          flags: {
            [MODULE.ID]: {
              isActorSpellbook: true,
              actorId: this.actor.id,
              classIdentifier: this.classIdentifier
            }
          },
          system: {
            identifier: `${this.actor.id}-${this.classIdentifier}-${MODULE.ID}`,
            description: game.i18n.format('SPELLBOOK.Journal.SpellbookDescription', { name: journalName }),
            spells: new Set()
          }
        }
      ]
    };
    const journal = await JournalEntry.create(journalData, { pack: customPack.collection });
    log(3, `Created new spellbook journal for ${this.actor.name} ${this.classIdentifier}: ${journal.uuid}`);
    return journal;
  }

  /**
   * Get or create the actor's spellbook journal for this class
   * @returns {Promise<JournalEntry|null>} The actor's spellbook journal
   */
  async getOrCreateSpellbookJournal() {
    const lockKey = `${this.actor.id}-${this.classIdentifier}`;
    while (WizardSpellbookManager._journalCreationLocks.get(lockKey)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    try {
      WizardSpellbookManager._journalCreationLocks.set(lockKey, true);
      const existingJournal = await this.findSpellbookJournal();
      if (existingJournal) return existingJournal;
      const newJournal = await this.createSpellbookJournal();
      return newJournal;
    } catch (error) {
      log(1, `Error getting or creating spellbook journal for ${this.actor.name} ${this.classIdentifier}:`, error);
      return null;
    } finally {
      WizardSpellbookManager._journalCreationLocks.delete(lockKey);
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
    log(3, `Maximum ${this.classIdentifier} wizard spells: ${maxSpells} (level ${wizardLevel})`);
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
    const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${this.classIdentifier}`;
    const copiedSpells = this.actor.getFlag(MODULE.ID, copiedSpellsFlag) || [];
    const paidUuids = new Set(copiedSpells.map((s) => s.spellUuid));
    const freeSpellsUsed = allSpells.filter((uuid) => !paidUuids.has(uuid)).length;
    log(3, `Used free spells for ${this.classIdentifier}: ${freeSpellsUsed} (total: ${allSpells.length}, paid: ${paidUuids.size})`);
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
}
