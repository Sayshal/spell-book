/**
 * Wizard Spellbook Management and Journal Integration
 * @module Managers/WizardBook
 * @author Tyler
 */

import { FLAGS, MODULE, PACK, SETTINGS, WIZARD_DEFAULTS, WIZARD_SPELL_SOURCE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';
import { RuleSet } from './rule-set.mjs';

/** Wizard Spellbook Manager — journal-based wizard spell management. */
export class WizardBook {
  /** @type {WeakMap<object, Map<string, object>>} */
  static _journalCache = new WeakMap();

  /** @type {WeakMap<object, Map<string, string[]>>} */
  static _spellbookCache = new WeakMap();

  /** @type {WeakMap<object, Set<string>>} */
  static _flagsInitialized = new WeakMap();

  /**
   * Get all spell UUIDs in a wizard's spellbook for a class.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @returns {Promise<string[]>} Array of spell UUIDs
   */
  static async getWizardSpellbook(actor, classId) {
    const cached = this._spellbookCache.get(actor)?.get(classId);
    if (cached) return cached;
    const journal = await this._getOrCreateSpellbookJournal(actor, classId);
    if (!journal) return [];
    const page = journal.pages?.find((p) => p.type === 'spells');
    if (!page) return [];
    const spells = Array.from(page.system?.spells || []);
    if (!this._spellbookCache.has(actor)) this._spellbookCache.set(actor, new Map());
    this._spellbookCache.get(actor).set(classId, spells);
    return spells;
  }

  /**
   * Check if a spell is in the wizard's spellbook.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @param {string} spellUuid - UUID of the spell
   * @returns {Promise<boolean>} Whether the spell is in the spellbook
   */
  static async isSpellInSpellbook(actor, classId, spellUuid) {
    const spells = await this.getWizardSpellbook(actor, classId);
    return spells.includes(spellUuid);
  }

  /**
   * Add a spell to the wizard's spellbook journal.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @param {string} spellUuid - UUID of the spell to add
   * @param {string} [source] - Source type (free, copied, scroll)
   * @param {object} [metadata] - Additional metadata (cost, timeSpent)
   * @returns {Promise<boolean>} Success state
   */
  static async addSpellToSpellbook(actor, classId, spellUuid, source = WIZARD_SPELL_SOURCE.FREE, metadata = null) {
    log(3, 'Adding spell to spellbook.', { actorName: actor.name, classId, spellUuid, source });
    await this._ensureFlagsInitialized(actor, classId);
    const journal = await this._getOrCreateSpellbookJournal(actor, classId);
    const page = journal?.pages?.find((p) => p.type === 'spells');
    if (!page) return false;
    const spells = page.system.spells || new Set();
    spells.add(spellUuid);
    await page.update({ 'system.spells': spells });
    if (source === WIZARD_SPELL_SOURCE.COPIED || source === WIZARD_SPELL_SOURCE.SCROLL) {
      const entry = { spellUuid, dateCopied: Date.now(), cost: metadata?.cost || 0, timeSpent: metadata?.timeSpent || 0, fromScroll: source === WIZARD_SPELL_SOURCE.SCROLL };
      const flag = `${FLAGS.WIZARD_COPIED_SPELLS}_${classId}`;
      const copiedSpells = actor.getFlag(MODULE.ID, flag) || [];
      copiedSpells.push(entry);
      await actor.setFlag(MODULE.ID, flag, copiedSpells);
    }
    this._invalidateSpellbookCache(actor, classId);
    return true;
  }

  /**
   * Remove a spell from the wizard's spellbook journal.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @param {string} spellUuid - UUID of the spell to remove
   * @returns {Promise<boolean>} Success state
   */
  static async removeSpellFromSpellbook(actor, classId, spellUuid) {
    log(3, 'Removing spell from spellbook.', { actorName: actor.name, classId, spellUuid });
    await this._ensureFlagsInitialized(actor, classId);
    const journal = await this._findSpellbookJournal(actor, classId);
    if (!journal) return false;
    const page = journal.pages?.find((p) => p.type === 'spells');
    if (!page) return false;
    const spells = page.system.spells || new Set();
    if (!spells.has(spellUuid)) return false;
    spells.delete(spellUuid);
    await page.update({ 'system.spells': spells });
    const flag = `${FLAGS.WIZARD_COPIED_SPELLS}_${classId}`;
    const copiedSpells = actor.getFlag(MODULE.ID, flag) || [];
    const filtered = copiedSpells.filter((s) => s.spellUuid !== spellUuid);
    if (filtered.length !== copiedSpells.length) await actor.setFlag(MODULE.ID, flag, filtered);
    this._invalidateSpellbookCache(actor, classId);
    return true;
  }

  /**
   * Copy a spell to the spellbook, optionally deducting currency.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @param {string} spellUuid - UUID of the spell to copy
   * @param {number} cost - Cost in base currency
   * @param {number} time - Time in hours
   * @param {boolean} [isFree] - Whether this is a free spell
   * @returns {Promise<boolean>} Success state
   */
  static async copySpell(actor, classId, spellUuid, cost, time, isFree = false) {
    log(3, 'Copying spell to spellbook.', { actorName: actor.name, classId, spellUuid, cost, time, isFree });
    if (!isFree && game.settings.get(MODULE.ID, SETTINGS.DEDUCT_SPELL_LEARNING_COST) && cost > 0) {
      const success = await this._deductCurrency(actor, cost);
      if (!success) return false;
    }
    const source = isFree ? WIZARD_SPELL_SOURCE.FREE : WIZARD_SPELL_SOURCE.COPIED;
    const metadata = isFree ? null : { cost, timeSpent: time };
    return this.addSpellToSpellbook(actor, classId, spellUuid, source, metadata);
  }

  /**
   * Calculate the cost to copy a spell, accounting for free spells.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @param {object} spell - The spell document
   * @returns {Promise<object>} { cost, isFree }
   */
  static async getCopyingCost(actor, classId, spell) {
    const isFree = await this.isSpellFree(actor, classId, spell);
    if (isFree) return { cost: 0, isFree: true };
    const multiplier = RuleSet.getClassRule(actor, classId, 'spellLearningCostMultiplier', WIZARD_DEFAULTS.SPELL_LEARNING_COST_MULTIPLIER);
    const cost = spell.system.level === 0 ? 0 : spell.system.level * multiplier;
    return { cost, isFree: false };
  }

  /**
   * Calculate and format time to copy a spell.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @param {object} spell - The spell document
   * @returns {string} Formatted time string
   */
  static getCopyingTime(actor, classId, spell) {
    const multiplier = RuleSet.getClassRule(actor, classId, 'spellLearningTimeMultiplier', WIZARD_DEFAULTS.SPELL_LEARNING_TIME_MULTIPLIER);
    const totalMinutes = spell.system.level === 0 ? 1 : spell.system.level * multiplier;
    return dnd5e.utils.formatTime(totalMinutes, 'minute');
  }

  /**
   * Get the maximum number of spells allowed in the spellbook.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @returns {number} Maximum spells allowed
   */
  static getMaxSpellsAllowed(actor, classId) {
    const classData = actor.spellcastingClasses?.[classId];
    if (!classData) return 0;
    const wizardLevel = classData.system?.levels || 1;
    const startingSpells = RuleSet.getClassRule(actor, classId, 'startingSpells', WIZARD_DEFAULTS.STARTING_SPELLS);
    const spellsPerLevel = RuleSet.getClassRule(actor, classId, 'spellsPerLevel', WIZARD_DEFAULTS.SPELLS_PER_LEVEL);
    return startingSpells + Math.max(0, wizardLevel - 1) * spellsPerLevel;
  }

  /**
   * Get the number of free spells already used.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @returns {Promise<number>} Number of free spells used
   */
  static async getUsedFreeSpells(actor, classId) {
    const allSpells = await this.getWizardSpellbook(actor, classId);
    const flag = `${FLAGS.WIZARD_COPIED_SPELLS}_${classId}`;
    const copiedSpells = actor.getFlag(MODULE.ID, flag) || [];
    const paidUuids = new Set(copiedSpells.map((s) => s.spellUuid));
    return allSpells.filter((uuid) => !paidUuids.has(uuid)).length;
  }

  /**
   * Get the number of free spells remaining.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @returns {Promise<number>} Number of free spells remaining
   */
  static async getRemainingFreeSpells(actor, classId) {
    const max = this.getMaxSpellsAllowed(actor, classId);
    const used = await this.getUsedFreeSpells(actor, classId);
    return Math.max(0, max - used);
  }

  /**
   * Check if a spell would be free to copy.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @param {object} spell - The spell document
   * @returns {Promise<boolean>} Whether the spell would be free
   */
  static async isSpellFree(actor, classId, spell) {
    if (spell.system.level === 0) return true;
    return (await this.getRemainingFreeSpells(actor, classId)) > 0;
  }

  /**
   * Get the learning source for a spell in the spellbook.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @param {string} spellUuid - UUID of the spell
   * @returns {string} Source type (free, copied, scroll)
   */
  static getSpellLearningSource(actor, classId, spellUuid) {
    const flag = `${FLAGS.WIZARD_COPIED_SPELLS}_${classId}`;
    const copiedSpells = actor.getFlag(MODULE.ID, flag) || [];
    const entry = copiedSpells.find((s) => s.spellUuid === spellUuid);
    if (!entry) return WIZARD_SPELL_SOURCE.FREE;
    return entry.fromScroll ? WIZARD_SPELL_SOURCE.SCROLL : WIZARD_SPELL_SOURCE.COPIED;
  }

  /**
   * Get the localization key for a learning source label.
   * @todo this seems so overkill for 4 localization keys? nearly 20 lines of code?
   * @param {string} source - The learning source
   * @returns {string} Localization key
   */
  static getLearnedLabelKey(source) {
    switch (source) {
      case WIZARD_SPELL_SOURCE.FREE:
        return 'SPELLBOOK.Wizard.LearnedFree';
      case WIZARD_SPELL_SOURCE.COPIED:
        return 'SPELLBOOK.Wizard.LearnedPurchased';
      case WIZARD_SPELL_SOURCE.SCROLL:
        return 'SPELLBOOK.Wizard.LearnedFromScroll';
      default:
        return 'SPELLBOOK.Wizard.LearnedFree';
    }
  }

  /**
   * Invalidate all caches for an actor.
   * @param {object} actor - The actor document
   */
  static invalidateCache(actor) {
    this._journalCache.delete(actor);
    this._spellbookCache.delete(actor);
    log(3, 'WizardBook cache invalidated.', { actorName: actor.name });
  }

  /**
   * Find the actor's spellbook journal for a class in the custom pack.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @returns {Promise<object|null>} The journal document or null
   * @private
   */
  static async _findSpellbookJournal(actor, classId) {
    const cached = this._journalCache.get(actor)?.get(classId);
    if (cached) return cached;
    const pack = game.packs.get(PACK.SPELLS);
    const index = await pack.getIndex({ fields: ['flags'] });
    for (const entry of index) {
      const flags = entry.flags?.[MODULE.ID];
      if (flags?.actorId === actor.id && flags?.classIdentifier === classId) {
        const doc = await pack.getDocument(entry._id);
        if (!this._journalCache.has(actor)) this._journalCache.set(actor, new Map());
        this._journalCache.get(actor).set(classId, doc);
        return doc;
      }
    }
    return null;
  }

  /**
   * Create a new spellbook journal for the actor and class.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @returns {Promise<object>} The created journal
   * @private
   */
  static async _createSpellbookJournal(actor, classId) {
    log(3, 'Creating spellbook journal.', { actorName: actor.name, classId });
    const pack = game.packs.get(PACK.SPELLS);
    const folder = pack.folders.find((f) => f.name === 'Actor Spellbooks') || null;
    const classData = actor.spellcastingClasses?.[classId];
    const className = classData?.name || classId;
    const journalName = classId === 'wizard' ? actor.name : `${actor.name} (${className})`;
    const actorOwnership = actor.ownership || {};
    const ownerUserIds = Object.keys(actorOwnership).filter((id) => id !== 'default' && actorOwnership[id] === 3);
    const ownership = { default: 0, [game.user.id]: 3 };
    for (const id of ownerUserIds) ownership[id] = 3;
    const cleanName = actor.name.toLowerCase().replace(/[^\da-z]/g, '-');
    const identifier = `${cleanName}-${classId}-spellbook`;
    const journal = await JournalEntry.create(
      {
        name: journalName,
        folder: folder?.id || null,
        ownership,
        flags: { [MODULE.ID]: { actorId: actor.id, classIdentifier: classId, isActorSpellbook: true, creationDate: Date.now() } },
        pages: [
          {
            name: _loc('SPELLBOOK.Journal.PageTitle', { name: journalName }),
            type: 'spells',
            ownership,
            flags: { [MODULE.ID]: { isActorSpellbook: true, actorId: actor.id, classIdentifier: classId } },
            system: { identifier, type: 'actor-spellbook', description: _loc('SPELLBOOK.Journal.SpellbookDescription', { name: journalName }), spells: new Set() }
          }
        ]
      },
      { pack: pack.collection }
    );
    if (!this._journalCache.has(actor)) this._journalCache.set(actor, new Map());
    this._journalCache.get(actor).set(classId, journal);
    return journal;
  }

  /**
   * Get or create the actor's spellbook journal for a class.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @returns {Promise<object|null>} The journal document
   * @private
   */
  static async _getOrCreateSpellbookJournal(actor, classId) {
    const existing = await this._findSpellbookJournal(actor, classId);
    if (existing) return existing;
    return this._createSpellbookJournal(actor, classId);
  }

  /**
   * Ensure wizard flags are initialized on the actor for a class.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @private
   */
  static async _ensureFlagsInitialized(actor, classId) {
    if (!this._flagsInitialized.has(actor)) this._flagsInitialized.set(actor, new Set());
    const initialized = this._flagsInitialized.get(actor);
    if (initialized.has(classId)) return;
    const flag = `${FLAGS.WIZARD_COPIED_SPELLS}_${classId}`;
    if (!actor.flags?.[MODULE.ID]?.[flag]) await actor.update({ [`flags.${MODULE.ID}.${flag}`]: [] });
    initialized.add(classId);
  }

  /**
   * Deduct currency from the actor for spell copying costs.
   * @param {object} actor - The actor document
   * @param {number} cost - Cost in base currency units
   * @returns {Promise<boolean>} Whether deduction succeeded
   * @private
   */
  static async _deductCurrency(actor, cost) {
    const currencies = CONFIG.DND5E.currencies;
    const actorCurrency = actor.system.currency || {};
    let baseCurrency = null;
    const otherCurrencies = [];
    for (const [type, config] of Object.entries(currencies)) {
      if (config.conversion === 1) baseCurrency = type;
      else otherCurrencies.push({ type, conversion: config.conversion });
    }
    otherCurrencies.sort((a, b) => a.conversion - b.conversion);
    const deductionOrder = baseCurrency ? [baseCurrency, ...otherCurrencies.map((c) => c.type)] : otherCurrencies.map((c) => c.type);
    let totalWealth = 0;
    for (const [type, config] of Object.entries(currencies)) totalWealth += (actorCurrency[type] || 0) / config.conversion;
    if (totalWealth < cost) {
      ui.notifications.warn(_loc('SPELLBOOK.Wizard.InsufficientGold', { cost, current: totalWealth.toFixed(2) }));
      return false;
    }
    let remaining = cost;
    const updateData = {};
    for (const type of deductionOrder) {
      if (remaining <= 0.001) break;
      const available = actorCurrency[type] || 0;
      if (available <= 0) continue;
      const basePerUnit = 1 / currencies[type].conversion;
      const needed = Math.ceil(remaining / basePerUnit);
      const toDeduct = Math.min(available, needed);
      if (toDeduct > 0) {
        updateData[`system.currency.${type}`] = available - toDeduct;
        remaining -= toDeduct * basePerUnit;
      }
    }
    await actor.update(updateData);
    return true;
  }

  /**
   * Invalidate spellbook cache for a specific class.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @private
   */
  static _invalidateSpellbookCache(actor, classId) {
    if (this._spellbookCache.has(actor)) this._spellbookCache.get(actor).delete(classId);
  }
}
