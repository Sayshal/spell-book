/**
 * Wizard-Specific Spellbook Management and Journal Integration
 *
 * Manages wizard-specific spellbook functionality including spell copying mechanics,
 * cost calculations, journal-based spellbook storage, and free spell tracking. This
 * class provides wizard spellbook management that integrates with
 * Foundry's journal system to create persistent, shareable spellbooks for wizard
 * characters and wizard-enabled classes.
 *
 * Key features:
 * - Journal-based spellbook storage in compendium packs for persistence
 * - Spell copying mechanics with gold cost and time requirements
 * - Free spell tracking based on wizard level progression
 * - Multi-class wizard support with class-specific spellbooks
 * - Race condition prevention through locking mechanisms
 * - Performance optimization through caching systems
 * - Automatic journal and folder creation with proper permissions
 * - Integration with module spell discovery and data management
 * - Spell metadata tracking for copied spells (cost, time, date)
 * - Wizard defaults configuration for starting spells and progression
 *
 * The manager creates individual journal entries for each wizard character within
 * the module's compendium pack, organized in an "Actor Spellbooks" folder. Each
 * journal contains a spells page that tracks all spells in the wizard's spellbook
 * along with metadata about how they were acquired.
 *
 * Spell acquisition methods:
 * - Level-up spells (free based on wizard progression)
 * - Copied spells (paid with gold and time investment)
 * - Initial/starting spells (granted at character creation)
 *
 * @module Managers/WizardBook
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from './rule-set.mjs';

/**
 * Spell copying cost calculation result.
 *
 * @typedef {Object} SpellCopyingCost
 * @property {number} cost - Cost in gold pieces to copy the spell
 * @property {boolean} isFree - Whether the spell can be copied for free
 */

/**
 * Spell metadata for copied spells tracking.
 *
 * @typedef {Object} CopiedSpellMetadata
 * @property {string} spellUuid - UUID of the copied spell
 * @property {number} dateCopied - Timestamp when the spell was copied
 * @property {number} cost - Gold cost paid to copy the spell
 * @property {number} timeSpent - Time in hours spent copying the spell
 */

/**
 * Journal ownership configuration for spellbook access.
 *
 * @typedef {Object} JournalOwnership
 * @property {number} default - Default permission level (0 for none)
 * @property {number} [userId] - Permission level for specific users (3 for owner)
 */

/**
 * Spellbook journal data structure for creation.
 *
 * @typedef {Object} SpellbookJournalData
 * @property {string} name - Name of the journal (actor name or actor + class)
 * @property {string|null} folder - Folder ID for organization
 * @property {JournalOwnership} ownership - Ownership and permission configuration
 * @property {Object} flags - Module-specific flags and metadata
 * @property {Array<SpellbookPageData>} pages - Array of journal pages
 */

/**
 * Spellbook page data for spell storage.
 *
 * @typedef {Object} SpellbookPageData
 * @property {string} name - Page name
 * @property {string} type - Page type ('spells')
 * @property {JournalOwnership} ownership - Page-specific permissions
 * @property {Object} flags - Page-specific flags
 * @property {Object} system - System data including spell collection
 */

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
   * @param {Actor5e} actor - The actor to manage wizard spellbook for
   * @param {string} [classIdentifier='wizard'] - The class identifier (e.g., 'wizard', 'cleric')
   */
  constructor(actor, classIdentifier = 'wizard') {
    /** @type {Actor5e} The actor being managed */
    this.actor = actor;

    /** @type {string} The class identifier for this spellbook */
    this.classIdentifier = classIdentifier;

    /** @type {Item5e|null} The wizard-enabled class item */
    this.classItem = this._findWizardClass();

    /** @type {boolean} Whether this class is wizard-enabled */
    this.isWizard = this.classItem !== null;

    /** @type {string[]|null} Cached array of spellbook spell UUIDs */
    this._spellbookCache = null;

    /** @type {number|null} Cached maximum spells allowed */
    this._maxSpellsCache = null;

    /** @type {number|null} Cached total free spells available */
    this._freeSpellsCache = null;

    // Initialize flags and cache if this is a wizard-enabled class
    if (this.isWizard) {
      this._initializeFlags();
      this._initializeCache();
    }
  }

  /**
   * Initialize cache with pre-calculated values.
   * @private
   * @returns {Promise<void>}
   */
  async _initializeCache() {
    this._maxSpellsCache = this.getMaxSpellsAllowed();
    this._freeSpellsCache = this.getTotalFreeSpells();
    log(3, `Initialized wizard cache for ${this.classIdentifier}: max=${this._maxSpellsCache}, free=${this._freeSpellsCache}`);
  }

  /**
   * Invalidate cache when spells are added/removed.
   * @returns {void}
   */
  invalidateCache() {
    this._spellbookCache = null;
    this._maxSpellsCache = null;
    this._freeSpellsCache = null;
  }

  /**
   * Find the actor's wizard-enabled class for this identifier.
   * @private
   * @returns {Item5e|null} The wizard-enabled class item or null
   */
  _findWizardClass() {
    if (!this.actor.spellcastingClasses?.[this.classIdentifier]) return null;
    const spellcastingData = this.actor.spellcastingClasses[this.classIdentifier];
    const classItem = this.actor.items.get(spellcastingData.id);
    if (!classItem) return null;
    if (DataUtils.isClassWizardEnabled(this.actor, this.classIdentifier)) return classItem;
    return null;
  }

  /**
   * Initialize wizard flags on the actor for this class.
   * @private
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
   * Get all spells in the wizard's spellbook for this class (with caching).
   * @returns {Promise<string[]>} Array of spell UUIDs
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
   * Check if a spell is in the wizard's spellbook.
   * @param {string} spellUuid - UUID of the spell
   * @returns {Promise<boolean>} Whether the spell is in the spellbook
   */
  async isSpellInSpellbook(spellUuid) {
    const spells = await this.getSpellbookSpells();
    return spells.includes(spellUuid);
  }

  /**
   * Copy a spell to the wizard's spellbook with associated cost and time.
   * @param {string} spellUuid - UUID of the spell to copy
   * @param {number} cost - Cost in base currency to copy the spell
   * @param {number} time - Time in hours to copy the spell
   * @param {boolean} [isFree=false] - Whether this is a free spell
   * @returns {Promise<boolean>} Success state
   */
  async copySpell(spellUuid, cost, time, isFree = false) {
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
      try {
        const updateData = {};
        for (const [currencyType, deductAmount] of Object.entries(deductions)) {
          const currentAmount = actorCurrency[currencyType] || 0;
          const newAmount = currentAmount - deductAmount;
          updateData[`system.currency.${currencyType}`] = newAmount;
          log(1, `${currencyType.toUpperCase()}: ${currentAmount} - ${deductAmount} = ${newAmount}`);
        }
        await this.actor.update(updateData);
      } catch (error) {
        log(1, `Failed to deduct currency from ${this.actor.name}:`, error);
        return false;
      }
    }
    const result = !isFree
      ? await this.addSpellToSpellbook(spellUuid, MODULE.WIZARD_SPELL_SOURCE.COPIED, { cost, timeSpent: time })
      : await this.addSpellToSpellbook(spellUuid, MODULE.WIZARD_SPELL_SOURCE.FREE, null);
    if (result) this.invalidateCache();
    return result;
  }

  /**
   * Calculate cost to copy a spell, accounting for free spells.
   * @param {Item5e} spell - The spell to copy
   * @returns {Promise<SpellCopyingCost>} Cost in gold pieces and if it's free
   */
  async getCopyingCost(spell) {
    const isFree = await this.isSpellFree(spell);
    if (isFree) return { cost: 0, isFree: true };
    const classRules = RuleSet.getClassRules(this.actor, this.classIdentifier);
    const costMultiplier = classRules?.spellLearningCostMultiplier ?? 50;
    const cost = spell.system.level === 0 ? 0 : spell.system.level * costMultiplier;
    return { cost, isFree: false };
  }

  /**
   * Calculate and format time to copy a spell.
   * @param {Item5e} spell - The spell to copy
   * @returns {string} Formatted time string (e.g., "2 hours", "1 hour, 30 minutes")
   */
  getCopyingTime(spell) {
    const classRules = RuleSet.getClassRules(this.actor, this.classIdentifier);
    const timeMultiplier = classRules?.spellLearningTimeMultiplier ?? 120;
    const totalMinutes = spell.system.level === 0 ? 1 : spell.system.level * timeMultiplier;
    return dnd5e.utils.formatTime(totalMinutes, 'minute');
  }

  /**
   * Add a spell to the wizard's spellbook.
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
    if (source === MODULE.WIZARD_SPELL_SOURCE.COPIED || source === MODULE.WIZARD_SPELL_SOURCE.SCROLL) {
      const metadataObj = { spellUuid, dateCopied: Date.now(), cost: metadata?.cost || 0, timeSpent: metadata?.timeSpent || 0, fromScroll: source === MODULE.WIZARD_SPELL_SOURCE.SCROLL };
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
   * Find the actor's spellbook journal for this class.
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
   * Create a new spellbook journal for the actor and class.
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
          system: {
            identifier: identifier,
            type: 'actor-spellbook',
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
   * Get or create the actor's spellbook journal for this class.
   * @returns {Promise<JournalEntry|null>} The actor's spellbook journal
   */
  async getOrCreateSpellbookJournal() {
    const lockKey = `${this.actor.id}-${this.classIdentifier}`;
    while (WizardBook._journalCreationLocks.get(lockKey)) await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      WizardBook._journalCreationLocks.set(lockKey, true);
      const existingJournal = await this.findSpellbookJournal();
      if (existingJournal) return existingJournal;
      const newJournal = await this.createSpellbookJournal();
      return newJournal;
    } catch (error) {
      log(1, `Error getting or creating spellbook journal for ${this.actor.name} ${this.classIdentifier}:`, error);
      return null;
    } finally {
      WizardBook._journalCreationLocks.delete(lockKey);
    }
  }

  /**
   * Get the Actor Spellbooks folder from the custom spellbooks pack.
   * @returns {Folder|null} The folder or null if not found
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
    const classRules = RuleSet.getClassRules(this.actor, this.classIdentifier);
    const startingSpells = classRules?.startingSpells ?? MODULE.WIZARD_DEFAULTS.STARTING_SPELLS;
    const spellsPerLevel = classRules?.spellsPerLevel ?? MODULE.WIZARD_DEFAULTS.SPELLS_PER_LEVEL;
    const maxSpells = startingSpells + Math.max(0, wizardLevel - 1) * spellsPerLevel;
    this._maxSpellsCache = maxSpells;
    log(3, `Maximum ${this.classIdentifier} wizard spells: ${maxSpells} (level ${wizardLevel})`);
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
    const classRules = RuleSet.getClassRules(this.actor, this.classIdentifier);
    const startingSpells = classRules?.startingSpells ?? MODULE.WIZARD_DEFAULTS.STARTING_SPELLS;
    const spellsPerLevel = classRules?.spellsPerLevel ?? MODULE.WIZARD_DEFAULTS.SPELLS_PER_LEVEL;
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
   * @param {Item5e} spell - The spell to check
   * @returns {Promise<boolean>} Whether the spell would be free
   */
  async isSpellFree(spell) {
    if (spell.system.level === 0) return true;
    const remainingFree = await this.getRemainingFreeSpells();
    return remainingFree > 0;
  }

  /**
   * Get the learning source for a spell in the spellbook.
   * @param {string} spellUuid - UUID of the spell to check
   * @returns {Promise<string>} Source type: 'free', 'copied', 'scroll', or 'free' as default
   */
  async getSpellLearningSource(spellUuid) {
    const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${this.classIdentifier}`;
    const copiedSpells = this.actor.getFlag(MODULE.ID, copiedSpellsFlag) || [];
    const copiedSpell = copiedSpells.find((s) => s.spellUuid === spellUuid);
    if (copiedSpell) {
      if (copiedSpell.fromScroll) return MODULE.WIZARD_SPELL_SOURCE.SCROLL;
      return MODULE.WIZARD_SPELL_SOURCE.COPIED;
    }
    return MODULE.WIZARD_SPELL_SOURCE.FREE;
  }
}
