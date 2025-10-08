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
 * @module Managers/WizardSpellbookManager
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from './rule-set-manager.mjs';

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
 *
 * This class provides wizard spellbook functionality by creating and
 * managing journal-based spellbooks within Foundry's compendium system. It handles
 * spell copying mechanics, cost calculations, free spell tracking, and maintains
 * persistent storage that survives world migrations and updates.
 *
 * The manager supports both traditional wizards and other classes that have been
 * configured to use wizard-style spell management through the module's rule system.
 * Each class gets its own separate spellbook to prevent cross-contamination of
 * spell lists in multiclass scenarios.
 */
export class WizardSpellbookManager {
  /**
   * Global lock for folder creation to prevent race conditions.
   * @type {boolean}
   * @private
   * @static
   */
  static _folderCreationLock = false;

  /**
   * Map of journal creation locks by actor-class combination.
   * Prevents multiple simultaneous journal creation attempts for the same actor/class.
   * @type {Map<string, boolean>}
   * @private
   * @static
   */
  static _journalCreationLocks = new Map();

  /**
   * Create a new WizardSpellbookManager for an actor and specific class.
   *
   * Initializes the manager with the specified actor and class identifier,
   * determines if the class is wizard-enabled, and sets up caching systems
   * for optimal performance. Only proceeds with full initialization if the
   * class is actually wizard-enabled.
   *
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
   *
   * Pre-calculates and caches expensive calculations like maximum spells
   * allowed and total free spells to avoid repeated computation during
   * normal operations. This significantly improves performance when
   * frequently accessing wizard spellbook information.
   *
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
   *
   * Clears all cached values to force recalculation on next access.
   * Should be called whenever the spellbook contents change to ensure
   * accurate data is returned by subsequent method calls.
   *
   * @returns {void}
   */
  invalidateCache() {
    this._spellbookCache = null;
    this._maxSpellsCache = null;
    this._freeSpellsCache = null;
  }

  /**
   * Find the actor's wizard-enabled class for this identifier.
   *
   * Searches the actor's spellcasting classes to find the class item
   * corresponding to this manager's class identifier. Validates that
   * the class is actually wizard-enabled through the data helpers.
   *
   * @private
   * @returns {Item5e|null} The wizard-enabled class item or null
   */
  _findWizardClass() {
    if (!this.actor.spellcastingClasses?.[this.classIdentifier]) return null;
    const spellcastingData = this.actor.spellcastingClasses[this.classIdentifier];
    const classItem = this.actor.items.get(spellcastingData.id);
    if (!classItem) return null;
    if (DataHelpers.isClassWizardEnabled(this.actor, this.classIdentifier)) return classItem;
    return null;
  }

  /**
   * Initialize wizard flags on the actor for this class.
   *
   * Sets up the necessary actor flags for tracking wizard-specific data
   * like copied spells. Each class gets its own flag namespace to prevent
   * conflicts in multiclass scenarios. Only creates flags that don't
   * already exist to avoid overwriting existing data.
   *
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
   *
   * Retrieves the complete list of spells in the wizard's spellbook from
   * the journal-based storage system. Uses caching to avoid repeated
   * journal access for performance optimization.
   *
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
   *
   * Efficiently checks whether a specific spell is already present in
   * the wizard's spellbook without requiring full spell data loading.
   * Uses the cached spellbook contents for optimal performance.
   *
   * @param {string} spellUuid - UUID of the spell
   * @returns {Promise<boolean>} Whether the spell is in the spellbook
   */
  async isSpellInSpellbook(spellUuid) {
    const spells = await this.getSpellbookSpells();
    return spells.includes(spellUuid);
  }

  /**
   * Copy a spell to the wizard's spellbook with associated cost and time.
   *
   * Handles the complete spell copying process including cost tracking
   * for paid spells and proper source attribution. Automatically determines
   * whether the spell should be free based on the wizard's remaining free
   * spell allowance. Deducts gold cost from actor if world setting is enabled,
   * converting currencies as needed. Supports any currency configuration.
   *
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
        const baseCurrencyLabel = baseCurrency ? currencies[baseCurrency].abbreviation : 'currency';
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
        const deductionSummary = Object.entries(deductions)
          .map(([type, amt]) => `${amt} ${type}`)
          .join(', ');
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
   *
   * Determines the gold cost to copy a spell based on spell level, class-specific
   * cost multiplier, and the wizard's remaining free spell allowance. Free spells
   * are available based on wizard level progression and don't require gold payment.
   *
   * @param {Item5e} spell - The spell to copy
   * @returns {Promise<SpellCopyingCost>} Cost in gold pieces and if it's free
   */
  async getCopyingCost(spell) {
    const isFree = await this.isSpellFree(spell);
    if (isFree) return { cost: 0, isFree: true };
    const classRules = RuleSetManager.getClassRules(this.actor, this.classIdentifier);
    const costMultiplier = classRules?.spellLearningCostMultiplier ?? 50;
    const cost = spell.system.level === 0 ? 0 : spell.system.level * costMultiplier;
    return { cost, isFree: false };
  }

  /**
   * Calculate time to copy a spell.
   *
   * Determines the time requirement to copy a spell based on D&D 5e rules
   * and class-specific time multiplier. Time scales with spell level to
   * represent the complexity of higher-level magic transcription.
   *
   * @param {Item5e} spell - The spell to copy
   * @returns {number} Time in hours
   */
  getCopyingTime(spell) {
    const classRules = RuleSetManager.getClassRules(this.actor, this.classIdentifier);
    const timeMultiplier = classRules?.spellLearningTimeMultiplier ?? 2;
    return spell.system.level === 0 ? 1 : spell.system.level * timeMultiplier;
  }

  /**
   * Add a spell to the wizard's spellbook.
   *
   * Handles the low-level mechanics of adding a spell to the journal-based
   * spellbook storage system. Tracks spell source and metadata for copied
   * spells, maintaining proper records for cost and time tracking.
   *
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
   *
   * Searches the module's compendium pack for an existing spellbook journal
   * associated with this actor and class combination. Uses the compendium
   * index for efficient searching without loading full documents.
   *
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
   *
   * Creates a new journal entry in the module's compendium pack with proper
   * folder organization, permissions, and initial spells page setup. Handles
   * ownership permissions to ensure the journal is accessible to the actor's
   * controlling users.
   *
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
    const cleanActorName = this.actor.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
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
   *
   * Provides thread-safe access to the actor's spellbook journal, creating
   * it if it doesn't exist. Uses locking mechanisms to prevent race conditions
   * when multiple operations attempt to access the same journal simultaneously.
   *
   * @returns {Promise<JournalEntry|null>} The actor's spellbook journal
   */
  async getOrCreateSpellbookJournal() {
    const lockKey = `${this.actor.id}-${this.classIdentifier}`;
    while (WizardSpellbookManager._journalCreationLocks.get(lockKey)) await new Promise((resolve) => setTimeout(resolve, 50));
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
   * Get the Actor Spellbooks folder from the custom spellbooks pack.
   *
   * Retrieves the organizational folder for actor spellbooks within the
   * module's compendium pack. This folder provides structure and organization
   * for individual character spellbook journals.
   *
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
   *
   * Determines the total number of spells the wizard can have in their spellbook
   * based on class level and class-specific configuration. Uses cached values for
   * performance optimization during repeated calculations.
   *
   * @returns {number} The maximum number of spells allowed
   */
  getMaxSpellsAllowed() {
    if (this._maxSpellsCache !== null) return this._maxSpellsCache;
    if (!this.isWizard) return 0;
    const wizardLevel = this.classItem.system.levels || 1;
    const classRules = RuleSetManager.getClassRules(this.actor, this.classIdentifier);
    const startingSpells = classRules?.startingSpells ?? MODULE.WIZARD_DEFAULTS.STARTING_SPELLS;
    const spellsPerLevel = classRules?.spellsPerLevel ?? MODULE.WIZARD_DEFAULTS.SPELLS_PER_LEVEL;
    const maxSpells = startingSpells + Math.max(0, wizardLevel - 1) * spellsPerLevel;
    this._maxSpellsCache = maxSpells;
    log(3, `Maximum ${this.classIdentifier} wizard spells: ${maxSpells} (level ${wizardLevel})`);
    return maxSpells;
  }

  /**
   * Get the number of free spells the wizard should have at current level (cached).
   *
   * Calculates the total number of free spells available to the wizard based
   * on their current level and class-specific configuration. Free spells are gained
   * through level progression and don't require gold payment.
   *
   * @returns {number} The number of free spells
   */
  getTotalFreeSpells() {
    if (this._freeSpellsCache !== null) return this._freeSpellsCache;
    if (!this.isWizard) return 0;
    const wizardLevel = this.classItem.system.levels || 1;
    const classRules = RuleSetManager.getClassRules(this.actor, this.classIdentifier);
    const startingSpells = classRules?.startingSpells ?? MODULE.WIZARD_DEFAULTS.STARTING_SPELLS;
    const spellsPerLevel = classRules?.spellsPerLevel ?? MODULE.WIZARD_DEFAULTS.SPELLS_PER_LEVEL;
    const freeSpells = startingSpells + Math.max(0, wizardLevel - 1) * spellsPerLevel;
    this._freeSpellsCache = freeSpells;
    return freeSpells;
  }

  /**
   * Get the number of free spells the wizard has already used.
   *
   * Calculates how many of the wizard's free spell allowance has been consumed
   * by counting spells in the spellbook that weren't acquired through copying
   * (and thus didn't cost gold). This helps determine remaining free spell slots.
   *
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
   *
   * Calculates how many free spells the wizard can still add to their spellbook
   * without paying gold costs. This is the difference between their total free
   * spell allowance and the number they've already used.
   *
   * @returns {Promise<number>} The number of free spells remaining
   */
  async getRemainingFreeSpells() {
    const totalFree = this.getTotalFreeSpells();
    const usedFree = await this.getUsedFreeSpells();
    return Math.max(0, totalFree - usedFree);
  }

  /**
   * Check if a spell would be free to copy.
   *
   * Determines whether a spell can be copied without gold cost based on
   * the spell level (cantrips are always free) and the wizard's remaining
   * free spell allowance from level progression.
   *
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
   * Determines how a wizard learned this spell (free level-up, purchased, or from scroll).
   *
   * @param {string} spellUuid - UUID of the spell to check
   * @returns {Promise<string>} Source type: 'free', 'copied', 'scroll', or 'free' as default
   */
  async getSpellLearningSource(spellUuid) {
    // Check if it was copied (purchased)
    const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${this.classIdentifier}`;
    const copiedSpells = this.actor.getFlag(MODULE.ID, copiedSpellsFlag) || [];
    const copiedSpell = copiedSpells.find((s) => s.spellUuid === spellUuid);

    if (copiedSpell) {
      // Check if it has scroll metadata (indicating it was from a scroll)
      if (copiedSpell.fromScroll) {
        return MODULE.WIZARD_SPELL_SOURCE.SCROLL;
      }
      return MODULE.WIZARD_SPELL_SOURCE.COPIED;
    }

    // Default to free if not in copied spells list
    return MODULE.WIZARD_SPELL_SOURCE.FREE;
  }
}
