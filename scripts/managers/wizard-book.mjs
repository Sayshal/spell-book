/**
 * Wizard-Specific Spellbook Management and Journal Integration
 *
 * Manages wizard-specific spellbook functionality including spell copying mechanics,
 * cost calculations, journal-based spellbook storage, and free spell tracking. This
 * class provides wizard spellbook management that integrates with
 * Foundry's journal system to create persistent, shareable spellbooks for wizard
 * characters and wizard-enabled classes.
 * @module Managers/WizardBook
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from './rule-set.mjs';

/**
 * Wizard Spellbook Manager - Journal-based wizard spell management system.
 */
export class WizardBook {
  /**
   * Map of journal creation locks by actor-class combination.
   * @type {Map<string, boolean>}
   * @private
   * @static
   */
  static _journalCreationLocks = new Map();

  /**
   * Create a new WizardBook for an actor and specific class.
   * Use WizardBook.create() for async initialization when possible.
   * @param {object} actor - The actor to manage wizard spellbook for
   * @param {string} [classIdentifier] - The class identifier (e.g., 'wizard', 'cleric')
   */
  constructor(actor, classIdentifier = 'wizard') {
    log(3, 'Creating WizardBook.', { actor: actor.name, classIdentifier });
    this.actor = actor;
    this.classIdentifier = classIdentifier;
    this.classItem = this._findWizardClass();
    this.isWizard = this.classItem !== null;
    this._spellbookCache = null;
    this._maxSpellsCache = null;
    this._freeSpellsCache = null;
    this._flagsInitialized = false;
    if (this.isWizard) this._initializeCache();
  }

  /**
   * Factory method for async initialization of WizardBook.
   * Preferred over constructor when called from async context.
   * @param {object} actor - The actor to manage wizard spellbook for
   * @param {string} [classIdentifier] - The class identifier (e.g., 'wizard', 'cleric')
   * @returns {Promise<WizardBook>} Fully initialized WizardBook instance
   * @static
   */
  static async create(actor, classIdentifier = 'wizard') {
    const instance = new WizardBook(actor, classIdentifier);
    if (instance.isWizard) await instance._ensureFlagsInitialized();
    return instance;
  }

  /**
   * Initialize cache with pre-calculated values.
   * @private
   * @returns {void}
   */
  _initializeCache() {
    log(3, 'Initializing WizardBook cache.', { classIdentifier: this.classIdentifier });
    this._maxSpellsCache = this.getMaxSpellsAllowed();
    this._freeSpellsCache = this.getTotalFreeSpells();
  }

  /**
   * Invalidate cache when spells are added/removed.
   * @returns {void}
   */
  invalidateCache() {
    log(3, 'Invalidating WizardBook cache.', { classIdentifier: this.classIdentifier });
    this._spellbookCache = null;
    this._maxSpellsCache = null;
    this._freeSpellsCache = null;
  }

  /**
   * Find the actor's wizard-enabled class for this identifier.
   * @private
   * @returns {object | null} The wizard-enabled class item or null
   */
  _findWizardClass() {
    log(3, 'Finding wizard-enabled class.', { classIdentifier: this.classIdentifier, actorId: this.actor?.id });
    if (!this.actor.spellcastingClasses?.[this.classIdentifier]) return null;
    const spellcastingData = this.actor.spellcastingClasses[this.classIdentifier];
    const classItem = this.actor.items.get(spellcastingData.id);
    if (!classItem) return null;
    if (this.classIdentifier in DataUtils.getWizardData(this.actor)) return classItem;
    return null;
  }

  /**
   * Ensure wizard flags are initialized on the actor for this class.
   * Called lazily before flag operations to avoid constructor async issues.
   * @private
   * @returns {Promise<void>}
   */
  async _ensureFlagsInitialized() {
    if (this._flagsInitialized) return;
    log(3, 'Ensuring wizard flags initialized.', { actorId: this.actor.id, classIdentifier: this.classIdentifier });
    const flags = this.actor.flags?.[MODULE.ID] || {};
    const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${this.classIdentifier}`;
    if (!flags[copiedSpellsFlag]) {
      await this.actor.update({ [`flags.${MODULE.ID}.${copiedSpellsFlag}`]: [] });
    }
    this._flagsInitialized = true;
  }

  /**
   * Get all spells in the wizard's spellbook for this class (with caching).
   * @returns {Promise<string[]>} Array of spell UUIDs
   */
  async getSpellbookSpells() {
    log(3, 'Getting spellbook spells.', { classIdentifier: this.classIdentifier, cached: !!this._spellbookCache });
    if (this._spellbookCache) return this._spellbookCache;
    const journal = await this.getOrCreateSpellbookJournal();
    if (!journal) return [];
    const journalPage = journal.pages?.find((p) => p.type === 'spells');
    if (!journalPage) return [];
    this._spellbookCache = Array.from(journalPage.system?.spells || []);
    return this._spellbookCache;
  }

  /**
   * Check if a spell is in the wizard's spellbook.
   * @param {string} spellUuid - UUID of the spell
   * @returns {Promise<boolean>} Whether the spell is in the spellbook
   */
  async isSpellInSpellbook(spellUuid) {
    log(3, 'Checking if spell is in spellbook.', { spellUuid, classIdentifier: this.classIdentifier });
    const spells = await this.getSpellbookSpells();
    return spells.includes(spellUuid);
  }

  /**
   * Copy a spell to the wizard's spellbook with associated cost and time.
   * @param {string} spellUuid - UUID of the spell to copy
   * @param {number} cost - Cost in base currency to copy the spell
   * @param {number} time - Time in hours to copy the spell
   * @param {boolean} [isFree] - Whether this is a free spell
   * @returns {Promise<boolean>} Success state
   */
  async copySpell(spellUuid, cost, time, isFree = false) {
    log(3, 'Copying spell to spellbook.', { spellUuid, cost, time, isFree, classIdentifier: this.classIdentifier });
    const shouldDeductCurrency = game.settings.get(MODULE.ID, SETTINGS.DEDUCT_SPELL_LEARNING_COST);
    if (!isFree && shouldDeductCurrency && cost > 0) {
      const currencies = CONFIG.DND5E.currencies;
      const actorCurrency = this.actor.system.currency || {};
      let baseCurrency = null;
      const otherCurrencies = [];
      for (const [currencyType, config] of Object.entries(currencies)) {
        if (config.conversion === 1) baseCurrency = currencyType;
        else otherCurrencies.push({ type: currencyType, conversion: config.conversion });
      }
      otherCurrencies.sort((a, b) => a.conversion - b.conversion);
      const deductionOrder = baseCurrency ? [baseCurrency, ...otherCurrencies.map((c) => c.type)] : otherCurrencies.map((c) => c.type);
      let totalWealthInBase = 0;
      for (const [currencyType, config] of Object.entries(currencies)) {
        const amount = actorCurrency[currencyType] || 0;
        const baseValue = amount / config.conversion;
        totalWealthInBase += baseValue;
      }
      if (totalWealthInBase < cost) {
        ui.notifications.warn(game.i18n.format('SPELLBOOK.Wizard.InsufficientGold', { cost: cost, current: totalWealthInBase.toFixed(2) }));
        return false;
      }
      let remainingCost = cost;
      const deductions = {};
      for (const currencyType of deductionOrder) {
        if (remainingCost <= 0.001) break;
        if (!currencies[currencyType]) continue;
        const available = actorCurrency[currencyType] || 0;
        if (available <= 0) continue;
        const config = currencies[currencyType];
        const baseValuePerUnit = 1 / config.conversion;
        const neededUnits = Math.ceil(remainingCost / baseValuePerUnit);
        const toDeduct = Math.min(available, neededUnits);
        if (toDeduct > 0) {
          deductions[currencyType] = toDeduct;
          const baseValueDeducted = toDeduct * baseValuePerUnit;
          remainingCost -= baseValueDeducted;
        }
      }
      const updateData = {};
      for (const [currencyType, deductAmount] of Object.entries(deductions)) {
        const currentAmount = actorCurrency[currencyType] || 0;
        const newAmount = currentAmount - deductAmount;
        updateData[`system.currency.${currencyType}`] = newAmount;
        log(1, `${currencyType.toUpperCase()}: ${currentAmount} - ${deductAmount} = ${newAmount}`);
      }
      await this.actor.update(updateData);
    }
    const result = !isFree
      ? await this.addSpellToSpellbook(spellUuid, MODULE.WIZARD_SPELL_SOURCE.COPIED, { cost, timeSpent: time })
      : await this.addSpellToSpellbook(spellUuid, MODULE.WIZARD_SPELL_SOURCE.FREE, null);
    if (result) this.invalidateCache();
    return result;
  }

  /**
   * Calculate cost to copy a spell, accounting for free spells.
   * @param {object} spell - The spell to copy
   * @returns {Promise<object>} Cost in gold pieces and if it's free
   */
  async getCopyingCost(spell) {
    log(3, 'Calculating copying cost.', { spellId: spell?.id, spellLevel: spell?.system?.level });
    const isFree = await this.isSpellFree(spell);
    if (isFree) return { cost: 0, isFree: true };
    const costMultiplier = RuleSet.getClassRule(this.actor, this.classIdentifier, 'spellLearningCostMultiplier', 50);
    const cost = spell.system.level === 0 ? 0 : spell.system.level * costMultiplier;
    return { cost, isFree: false };
  }

  /**
   * Calculate and format time to copy a spell.
   * @param {object} spell - The spell to copy
   * @returns {string} Formatted time string (e.g., "2 hours", "1 hour, 30 minutes")
   */
  getCopyingTime(spell) {
    log(3, 'Calculating copying time.', { spellId: spell?.id, spellLevel: spell?.system?.level });
    const timeMultiplier = RuleSet.getClassRule(this.actor, this.classIdentifier, 'spellLearningTimeMultiplier', 120);
    const totalMinutes = spell.system.level === 0 ? 1 : spell.system.level * timeMultiplier;
    return dnd5e.utils.formatTime(totalMinutes, 'minute');
  }

  /**
   * Add a spell to the wizard's spellbook.
   * @param {string} spellUuid - UUID of the spell to add
   * @param {string} source - Source of the spell (levelUp, copied, initial)
   * @param {object} metadata - Additional metadata for the spell
   * @returns {Promise<boolean>} Success state
   */
  async addSpellToSpellbook(spellUuid, source, metadata) {
    log(3, 'Adding spell to spellbook.', { spellUuid, source, classIdentifier: this.classIdentifier });
    await this._ensureFlagsInitialized();
    const journal = await this.getOrCreateSpellbookJournal();
    const journalPage = journal.pages.find((p) => p.type === 'spells');
    const spells = journalPage.system.spells || new Set();
    spells.add(spellUuid);
    await journalPage.update({ 'system.spells': spells });
    if (source === MODULE.WIZARD_SPELL_SOURCE.COPIED || source === MODULE.WIZARD_SPELL_SOURCE.SCROLL) {
      const metadataObj = { spellUuid, dateCopied: Date.now(), cost: metadata?.cost || 0, timeSpent: metadata?.timeSpent || 0, fromScroll: source === MODULE.WIZARD_SPELL_SOURCE.SCROLL };
      const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${this.classIdentifier}`;
      const copiedSpells = this.actor.getFlag(MODULE.ID, copiedSpellsFlag) || [];
      copiedSpells.push(metadataObj);
      await this.actor.setFlag(MODULE.ID, copiedSpellsFlag, copiedSpells);
    }
    this.invalidateCache();
    return true;
  }

  /**
   * Find the actor's spellbook journal for this class.
   * @returns {Promise<object | null>} The actor's spellbook journal or null if not found
   */
  async findSpellbookJournal() {
    log(3, 'Finding spellbook journal.', { actorId: this.actor.id, classIdentifier: this.classIdentifier });
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
    const index = await customPack.getIndex({ fields: ['flags'] });
    for (const entry of index) {
      const flags = entry.flags?.[MODULE.ID];
      if (flags?.actorId === this.actor.id && flags?.classIdentifier === this.classIdentifier) {
        const document = await customPack.getDocument(entry._id);
        return document;
      }
    }
    return null;
  }

  /**
   * Create a new spellbook journal for the actor and class.
   * @returns {Promise<object>} The created journal
   */
  async createSpellbookJournal() {
    log(3, 'Creating spellbook journal.', { actorId: this.actor.id, classIdentifier: this.classIdentifier });
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
    const folder = this.getSpellbooksFolder();
    const className = this.classItem?.name || this.classIdentifier;
    const journalName = this.classIdentifier === 'wizard' ? this.actor.name : `${this.actor.name} (${className})`;
    const actorOwnership = this.actor.ownership || {};
    const ownerUserIds = Object.keys(actorOwnership).filter((userId) => userId !== 'default' && actorOwnership[userId] === 3);
    const correctOwnership = { default: 0, [game.user.id]: 3 };
    for (const ownerUserId of ownerUserIds) correctOwnership[ownerUserId] = 3;
    const cleanActorName = this.actor.name.toLowerCase().replace(/[^\da-z]/g, '-');
    const identifier = `${cleanActorName}-${this.classIdentifier}-spellbook`;
    const journalData = {
      name: journalName,
      folder: folder ? folder.id : null,
      ownership: correctOwnership,
      flags: { [MODULE.ID]: { actorId: this.actor.id, classIdentifier: this.classIdentifier, isActorSpellbook: true, creationDate: Date.now() } },
      pages: [
        {
          name: game.i18n.format('SPELLBOOK.Journal.PageTitle', { name: journalName }),
          type: 'spells',
          ownership: correctOwnership,
          flags: { [MODULE.ID]: { isActorSpellbook: true, actorId: this.actor.id, classIdentifier: this.classIdentifier } },
          system: { identifier: identifier, type: 'actor-spellbook', description: game.i18n.format('SPELLBOOK.Journal.SpellbookDescription', { name: journalName }), spells: new Set() }
        }
      ]
    };
    const journal = await JournalEntry.create(journalData, { pack: customPack.collection });
    return journal;
  }

  /**
   * Get or create the actor's spellbook journal for this class.
   * @returns {Promise<object | null>} The actor's spellbook journal
   */
  async getOrCreateSpellbookJournal() {
    log(3, 'Getting or creating spellbook journal.', { actorId: this.actor.id, classIdentifier: this.classIdentifier });
    const lockKey = `${this.actor.id}-${this.classIdentifier}`;
    while (WizardBook._journalCreationLocks.get(lockKey)) await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      WizardBook._journalCreationLocks.set(lockKey, true);
      const existingJournal = await this.findSpellbookJournal();
      if (existingJournal) return existingJournal;
      const newJournal = await this.createSpellbookJournal();
      return newJournal;
    } catch (error) {
      log(1, 'Error getting or creating spellbook journal:', error);
      return null;
    } finally {
      WizardBook._journalCreationLocks.delete(lockKey);
    }
  }

  /**
   * Get the Actor Spellbooks folder from the custom spellbooks pack.
   * @returns {object | null} The folder or null if not found
   */
  getSpellbooksFolder() {
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
    const folder = customPack.folders.find((f) => f.name === 'Actor Spellbooks');
    if (folder) return folder;
    return null;
  }

  /**
   * Calculate the maximum number of spells allowed in the wizard's spellbook (cached).
   * @returns {number} The maximum number of spells allowed
   */
  getMaxSpellsAllowed() {
    if (this._maxSpellsCache !== null) return this._maxSpellsCache;
    if (!this.isWizard) return 0;
    const wizardLevel = this.classItem.system.levels || 1;
    const startingSpells = RuleSet.getClassRule(this.actor, this.classIdentifier, 'startingSpells', MODULE.WIZARD_DEFAULTS.STARTING_SPELLS);
    const spellsPerLevel = RuleSet.getClassRule(this.actor, this.classIdentifier, 'spellsPerLevel', MODULE.WIZARD_DEFAULTS.SPELLS_PER_LEVEL);
    const maxSpells = startingSpells + Math.max(0, wizardLevel - 1) * spellsPerLevel;
    this._maxSpellsCache = maxSpells;
    log(3, `Maximum wizard spells: ${maxSpells} (level ${wizardLevel})`);
    return maxSpells;
  }

  /**
   * Get the number of free spells the wizard should have at current level (cached).
   * @returns {number} The number of free spells
   */
  getTotalFreeSpells() {
    if (this._freeSpellsCache !== null) return this._freeSpellsCache;
    if (!this.isWizard) return 0;
    const wizardLevel = this.classItem.system.levels || 1;
    const startingSpells = RuleSet.getClassRule(this.actor, this.classIdentifier, 'startingSpells', MODULE.WIZARD_DEFAULTS.STARTING_SPELLS);
    const spellsPerLevel = RuleSet.getClassRule(this.actor, this.classIdentifier, 'spellsPerLevel', MODULE.WIZARD_DEFAULTS.SPELLS_PER_LEVEL);
    const freeSpells = startingSpells + Math.max(0, wizardLevel - 1) * spellsPerLevel;
    this._freeSpellsCache = freeSpells;
    return freeSpells;
  }

  /**
   * Get the number of free spells the wizard has already used.
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
   * Get the number of free spells the wizard has remaining.
   * @returns {Promise<number>} The number of free spells remaining
   */
  async getRemainingFreeSpells() {
    const totalFree = this.getTotalFreeSpells();
    const usedFree = await this.getUsedFreeSpells();
    return Math.max(0, totalFree - usedFree);
  }

  /**
   * Check if a spell would be free to copy.
   * @param {object} spell - The spell to check
   * @returns {Promise<boolean>} Whether the spell would be free
   */
  async isSpellFree(spell) {
    log(3, 'Checking if spell is free.', { spellId: spell?.id, spellLevel: spell?.system?.level });
    if (spell.system.level === 0) return true;
    const remainingFree = await this.getRemainingFreeSpells();
    return remainingFree > 0;
  }

  /**
   * Get the learning source for a spell in the spellbook.
   * @param {string} spellUuid - UUID of the spell to check
   * @returns {string} Source type: 'free', 'copied', 'scroll', or 'free' as default
   */
  getSpellLearningSource(spellUuid) {
    log(3, 'Getting spell learning source.', { spellUuid, classIdentifier: this.classIdentifier });
    const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${this.classIdentifier}`;
    const copiedSpells = this.actor.getFlag(MODULE.ID, copiedSpellsFlag) || [];
    const copiedSpell = copiedSpells.find((s) => s.spellUuid === spellUuid);
    if (copiedSpell) {
      if (copiedSpell.fromScroll) return MODULE.WIZARD_SPELL_SOURCE.SCROLL;
      return MODULE.WIZARD_SPELL_SOURCE.COPIED;
    }
    return MODULE.WIZARD_SPELL_SOURCE.FREE;
  }

  /**
   * Get the appropriate localization key for a learned spell based on its source.
   * @param {string} source - The learning source (free, copied, scroll)
   * @returns {string} Localization key
   * @static
   */
  static getLearnedLabelKey(source) {
    log(3, 'Getting learned label key!', { source });
    switch (source) {
      case MODULE.WIZARD_SPELL_SOURCE.FREE:
        return 'SPELLBOOK.Wizard.LearnedFree';
      case MODULE.WIZARD_SPELL_SOURCE.COPIED:
        return 'SPELLBOOK.Wizard.LearnedPurchased';
      case MODULE.WIZARD_SPELL_SOURCE.SCROLL:
        return 'SPELLBOOK.Wizard.LearnedFromScroll';
      default:
        return 'SPELLBOOK.Wizard.LearnedFree';
    }
  }
}
