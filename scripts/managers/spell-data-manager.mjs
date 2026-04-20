import { CLASS_IDENTIFIERS, SPELL_MODE } from '../constants.mjs';
import { fetchSpellsByUuids } from '../data/spell-fetcher.mjs';
import { getClassSpellList } from '../data/spell-list-resolver.mjs';
import { log } from '../utils/logger.mjs';
import { ClassManager } from './class-manager.mjs';
import { RuleSet } from './rule-set.mjs';
import { WizardBook } from './wizard-book.mjs';

/** Manages per-class spell list caching, fetching, and level organization. */
export class SpellDataManager {
  /** @type {WeakMap<object, Map<string, object[]>>} Cached full-class spell documents per actor per class */
  static _cache = new WeakMap();

  /**
   * Get the preparable spell list for a class tab.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<object[]>} Filtered spell documents
   */
  static async getPreparableSpellsForClass(actor, classIdentifier) {
    const allClassSpells = await this._getFullClassList(actor, classIdentifier);
    const wizardClasses = ClassManager.getWizardEnabledClasses(actor);
    const isWizard = wizardClasses.some((w) => w.identifier === classIdentifier);
    if (!isWizard) return allClassSpells;
    const journal = await WizardBook.getWizardSpellbook(actor, classIdentifier);
    const journalSet = new Set(journal.map((uuid) => foundry.utils.parseUuid(uuid).uuid));
    const grantedSet = this._collectGrantedSpellUuids(actor);
    const hideCantrips = this._shouldHideCantrips(actor, classIdentifier);
    return allClassSpells.filter((spell) => {
      const isCantrip = spell.system.level === 0;
      if (isCantrip) return !hideCantrips;
      const canonical = foundry.utils.parseUuid(spell.uuid).uuid;
      return journalSet.has(canonical) || grantedSet.has(canonical);
    });
  }

  /**
   * Get the learnable spell list for a wizard.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<object[]>} Spell documents (non-cantrips only)
   */
  static async getLearnableSpellsForClass(actor, classIdentifier) {
    const allClassSpells = await this._getFullClassList(actor, classIdentifier);
    return allClassSpells.filter((spell) => spell.system.level !== 0);
  }

  /**
   * Compute wizard spellbook counters for the learn tab header.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<{total: number, max: number, freeRemaining: number, hasFree: boolean, atMax: boolean}>} Journal total, spell cap, free spells remaining, and at-max flag
   */
  static async getWizardCounters(actor, classIdentifier) {
    const journal = await WizardBook.getWizardSpellbook(actor, classIdentifier);
    const max = WizardBook.getMaxSpellsAllowed(actor, classIdentifier);
    const usedFree = await WizardBook.getUsedFreeSpells(actor, classIdentifier);
    const freeRemaining = Math.max(0, max - usedFree);
    return { total: journal.length, max, freeRemaining, hasFree: freeRemaining > 0, atMax: journal.length >= max };
  }

  /**
   * Get the full class spell list (all levels within the actor's max) with per-actor-per-class caching.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<object[]>} Array of spell documents
   * @private
   */
  static async _getFullClassList(actor, classIdentifier) {
    const cached = this._getFromCache(actor, classIdentifier);
    if (cached) return cached;
    const spellUuids = await getClassSpellList(classIdentifier, actor);
    if (!spellUuids?.size) {
      log(3, 'No spell list assigned for class.', { actorName: actor.name, classIdentifier });
      this._setCache(actor, classIdentifier, []);
      return [];
    }
    const maxLevel = this._calculateMaxSpellLevel(actor, classIdentifier);
    const spells = await fetchSpellsByUuids(spellUuids, maxLevel);
    this._setCache(actor, classIdentifier, spells);
    log(3, 'Class spell list loaded.', { actorName: actor.name, classIdentifier, count: spells.length, maxLevel });
    return spells;
  }

  /**
   * Determine whether cantrips should be hidden for a class.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {boolean} True if cantrips should be hidden
   * @private
   */
  static _shouldHideCantrips(actor, classIdentifier) {
    const rules = RuleSet.getClassRules(actor, classIdentifier);
    if (rules && rules.showCantrips !== undefined) return !rules.showCantrips;
    return [CLASS_IDENTIFIERS.PALADIN, CLASS_IDENTIFIERS.RANGER].includes(classIdentifier);
  }

  /**
   * Collect canonical UUIDs of all spells granted to the actor by non-class sources.
   * @param {object} actor - The actor document
   * @returns {Set<string>} Canonical UUIDs
   * @private
   */
  static _collectGrantedSpellUuids(actor) {
    const granted = new Set();
    for (const item of actor.itemTypes.spell) {
      const method = item.system?.method;
      const isGrantedMethod = method && [SPELL_MODE.PACT, SPELL_MODE.INNATE, SPELL_MODE.AT_WILL].includes(method);
      const isCachedFor = !!item.flags?.dnd5e?.cachedFor;
      if (!isGrantedMethod && !isCachedFor) continue;
      const source = item._stats?.compendiumSource || item.flags?.core?.sourceId || item.uuid;
      if (source) granted.add(foundry.utils.parseUuid(source).uuid);
    }
    return granted;
  }

  /**
   * Invalidate all cached spell data for an actor.
   * @param {object} actor - The actor document
   */
  static invalidateCache(actor) {
    this._cache.delete(actor);
    log(3, 'SpellDataManager cache invalidated.', { actorName: actor.name });
  }

  /** Invalidate all cached spell data for every actor (e.g. when spell list definitions change). */
  static invalidateAllCaches() {
    this._cache = new WeakMap();
    log(3, 'SpellDataManager: all caches invalidated.');
  }

  /**
   * Invalidate cached spell data for a specific class.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   */
  static invalidateClassCache(actor, classIdentifier) {
    if (this._cache.has(actor)) this._cache.get(actor).delete(classIdentifier);
  }

  /**
   * Calculate the maximum spell level a class can cast at the actor's current level.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Maximum spell level (0 if no spellcasting)
   * @private
   */
  static _calculateMaxSpellLevel(actor, classIdentifier) {
    const spellcastingConfig = ClassManager.getSpellcastingConfig(actor, classIdentifier);
    if (!spellcastingConfig) return 0;
    const spellcastingType = spellcastingConfig.type;
    const spellcastingModel = CONFIG.DND5E.spellcasting[spellcastingType];
    if (!spellcastingModel?.table) return 0;
    const spellSlotTable = spellcastingModel.table;
    if (!spellSlotTable?.length) return 0;
    const classLevels = ClassManager.getSpellcastingLevels(actor, classIdentifier);
    const spellcastingSource = ClassManager.getSpellcastingSourceItem(actor, classIdentifier);
    const classKey = spellcastingSource?.identifier || spellcastingSource?.name?.slugify() || 'class';
    const progression = { [spellcastingType]: 0, [classKey]: classLevels };
    actor.constructor.computeClassProgression(progression, spellcastingSource, { spellcasting: spellcastingConfig });
    if (spellcastingModel.isSingleLevel) {
      const spells = { [spellcastingType]: {} };
      actor.constructor.prepareSpellcastingSlots(spells, spellcastingType, progression, { actor });
      return spells[spellcastingType]?.level || 0;
    }
    const maxPossibleLevel = spellSlotTable[spellSlotTable.length - 1].length;
    const spells = {};
    for (let i = 1; i <= maxPossibleLevel; i++) spells[`${spellcastingType}${i}`] = { level: i };
    actor.constructor.prepareSpellcastingSlots(spells, spellcastingType, progression, { actor });
    return Object.values(spells).reduce((max, s) => (s.max ? Math.max(max, s.level || 0) : max), 0);
  }

  /**
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {object[]|null} Cached spells or null
   * @private
   */
  static _getFromCache(actor, classIdentifier) {
    return this._cache.get(actor)?.get(classIdentifier) ?? null;
  }

  /**
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @param {object[]} spells - Spell documents to cache
   * @private
   */
  static _setCache(actor, classIdentifier, spells) {
    if (!this._cache.has(actor)) this._cache.set(actor, new Map());
    this._cache.get(actor).set(classIdentifier, spells);
  }
}
