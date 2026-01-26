/**
 * Spell Organization for Spell Book
 *
 * Handles organizing spells by level, enriching spell data with preparation status,
 * user data, and filter data. Extracted from State.mjs to reduce god class complexity.
 * @module State/SpellOrganizer
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from '../ui/_module.mjs';

/**
 * Manages spell organization and processing for display.
 */
export class SpellOrganizer {
  /**
   * Create a new SpellOrganizer.
   * @param {object} actor - The actor to organize spells for
   * @param {object} app - The spell book application instance
   */
  constructor(actor, app) {
    this.actor = actor;
    this._app = app;
  }

  /**
   * Get the spell manager from the app.
   * @returns {object|null} The spell manager
   * @private
   */
  get _spellManager() {
    return this._app?.spellManager;
  }

  /**
   * Get wizard managers from the app.
   * @returns {Map} Map of class identifier to WizardBook manager
   * @private
   */
  get _wizardManagers() {
    return this._app?.wizardManagers;
  }

  /**
   * Organize spells by level for a class, enriching with preparation and user data.
   * @param {Array<object>} spellItems - Array of spell documents
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<Array<object>>} Array of level objects, each containing its spells
   */
  async organizeSpellsByLevelForClass(spellItems, classIdentifier) {
    const spellsByLevel = {};
    const processedSpellIds = new Set();
    const targetUserId = DataUtils.getTargetUserId(this.actor);
    const actorId = this.actor?.id;
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const batchData = this._spellManager.prepareBatchData(classIdentifier);
    await DataUtils.UserData._ensureUserDataInfrastructure(targetUserId);
    const spellData = await DataUtils.UserData._getSpellData(targetUserId);
    const allSpellsToCache = spellItems.map((s) => s.uuid || s.compendiumUuid).filter(Boolean);
    const now = Date.now();
    for (const spellUuid of allSpellsToCache) {
      const canonicalUuid = DataUtils.getCanonicalSpellUuid(spellUuid) || spellUuid;
      const quickCacheKey = actorId ? `${targetUserId}:${actorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      const originalCacheKey = actorId ? `${targetUserId}:${actorId}:${spellUuid}` : `${targetUserId}:${spellUuid}`;
      if (DataUtils.UserData.cache.has(quickCacheKey) || DataUtils.UserData.cache.has(originalCacheKey)) continue;
      let userData = spellData?.[canonicalUuid];
      if (!userData && canonicalUuid !== spellUuid) userData = spellData?.[spellUuid];
      const result = !userData
        ? { notes: '', favorited: false, usageStats: null }
        : actorId && userData.actorData?.[actorId]
          ? { ...userData.actorData[actorId], notes: userData.notes }
          : { notes: userData.notes || '', favorited: false, usageStats: null };
      DataUtils.UserData.cache.set(quickCacheKey, { data: result, timestamp: now });
      if (canonicalUuid !== spellUuid) DataUtils.UserData.cache.set(originalCacheKey, { data: result, timestamp: now });
    }
    for (const spell of spellItems) {
      if (spell?.system?.level === undefined) continue;
      const level = spell.system.level;
      const spellUuid = spell.uuid || spell.compendiumUuid;
      const normalizedUuid = DataUtils.getCanonicalSpellUuid(spellUuid);
      const spellId = spell.id || spell.compendiumUuid || spell.uuid;
      if (processedSpellIds.has(spellId)) continue;
      processedSpellIds.add(spellId);
      const spellDataClone = DataUtils.shallowCloneSpell(spell);
      const ownedVersions = batchData.ownedSpellsMap?.get(normalizedUuid);
      if (ownedVersions) {
        spellDataClone.aggregatedModes = this._createAggregatedModes();
        for (const version of ownedVersions) this._processOwnedVersion(spellDataClone, version, classIdentifier);
      }
      const preparedByOtherClass = this._findPreparedByOtherClass(preparedByClass, classIdentifier, spellUuid);
      spellDataClone.sourceClass = classIdentifier;
      spellDataClone.system = spellDataClone.system || {};
      spellDataClone.system.sourceClass = classIdentifier;
      if (preparedByOtherClass) {
        spellDataClone.preparation = spellDataClone.preparation || {};
        spellDataClone.preparation.preparedByOtherClass = preparedByOtherClass;
      }
      if (spell.system?.method !== MODULE.SPELL_MODE.RITUAL && spell.system?.components?.ritual) spellDataClone.canCastAsRitual = true;
      if (this._spellManager) spellDataClone.preparation = this._spellManager.getSpellPreparationStatus(spellDataClone, classIdentifier, batchData);
      spellDataClone.filterData = UIUtils.extractSpellFilterData(spell);
      spellDataClone.enrichedIcon = UIUtils.createSpellIconLink(spell);
      const enhancedSpell = DataUtils.UserData.enhanceSpellWithUserData(spellDataClone, targetUserId, actorId);
      Object.assign(spellDataClone, enhancedSpell);
      spellsByLevel[level].spells.push(spellDataClone);
    }
    for (const level in spellsByLevel) if (level in spellsByLevel) spellsByLevel[level].spells.sort((a, b) => a.name.localeCompare(b.name));
    const sortedLevels = Object.entries(spellsByLevel)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([level, data]) => {
        if (!data.spells) {
          log(2, `Missing spells array for level ${level}`, data);
          return { level: level, name: CONFIG.DND5E.spellLevels[level] || `Level ${level}`, spells: [] };
        }
        return data;
      });
    log(3, `Returning ${sortedLevels.length} levels for ${classIdentifier}`);
    return sortedLevels;
  }

  /**
   * Organize spells for wizard spellbook learning tab.
   * @param {Array<object>} spellItems - Array of class spell list items
   * @param {string} classIdentifier - The class identifier
   * @param {Array<string>} personalSpellbook - Spells already learned by wizard
   * @returns {Promise<Array<object>>} Array of level objects for wizard spellbook
   */
  async organizeWizardSpellsForLearning(spellItems, classIdentifier, personalSpellbook) {
    const spellsByLevel = {};
    const processedSpellUuids = new Set();
    const targetUserId = DataUtils.getTargetUserId(this.actor);
    const actorId = this.actor?.id;
    const wizardManager = this._wizardManagers.get(classIdentifier);
    for (const spell of spellItems) {
      if (spell?.system?.level === undefined) continue;
      const spellUuid = spell.uuid || spell.compendiumUuid;
      const level = spell.system.level;
      if (processedSpellUuids.has(spellUuid) || level === 0) continue;
      if (!spellsByLevel[level]) spellsByLevel[level] = { level: level, name: CONFIG.DND5E.spellLevels[level], spells: [] };
      const spellData = DataUtils.shallowCloneSpell(spell);
      spellData.compendiumUuid = spellUuid;
      spellData.sourceClass = classIdentifier;
      spellData.isWizardClass = true;
      spellData.inWizardSpellbook = personalSpellbook.includes(spellUuid);
      spellData.canAddToSpellbook = !spellData.inWizardSpellbook && level > 0;
      if (spellData.inWizardSpellbook && wizardManager) spellData.learningSource = wizardManager.getSpellLearningSource(spellUuid);
      spellData.preparation = { prepared: false, disabled: true, disabledReason: '', _isWizardLearning: true };
      spellData.filterData = UIUtils.extractSpellFilterData(spell);
      spellData.enrichedIcon = UIUtils.createSpellIconLink(spell);
      const enhancedSpell = DataUtils.UserData.enhanceSpellWithUserData(spellData, targetUserId, actorId);
      Object.assign(spellData, enhancedSpell);
      spellsByLevel[level].spells.push(spellData);
      processedSpellUuids.add(spellUuid);
    }

    for (const level in spellsByLevel) if (level in spellsByLevel) spellsByLevel[level].spells.sort((a, b) => a.name.localeCompare(b.name));
    const sortedLevels = Object.entries(spellsByLevel)
      .sort(([a], [b]) => Number(a) - Number(b))
      // eslint-disable-next-line no-unused-vars
      .map(([level, data]) => data);
    log(3, `Organized ${sortedLevels.length} spell levels for wizard spellbook (${classIdentifier})`);
    return sortedLevels;
  }

  /**
   * Process and organize spells for a regular class with preparation statistics.
   * @param {string} identifier - Identifier of the class
   * @param {Array<object>} spellItems - Array of spell items
   * @param {object} classItem - The class item
   * @param {object} state - The State instance
   * @returns {Promise<void>}
   */
  async processAndOrganizeSpellsForClass(identifier, spellItems, classItem, state) {
    for (const spell of spellItems) {
      const preparationMode = spell.system.method;
      const isSpecialMode = [MODULE.SPELL_MODE.INNATE, MODULE.SPELL_MODE.PACT, MODULE.SPELL_MODE.AT_WILL, MODULE.SPELL_MODE.ALWAYS].includes(preparationMode);
      const isGranted = !!spell.flags?.dnd5e?.cachedFor;
      if (!isSpecialMode && !isGranted) {
        spell.sourceClass = identifier;
        if (spell.system && !spell.system.sourceClass) spell.system.sourceClass = identifier;
      }
    }
    const spellLevels = await this.organizeSpellsByLevelForClass(spellItems, identifier);
    const allSpells = spellLevels.flatMap((level) => level.spells);
    const prepStats = state.calculatePreparationStats(identifier, allSpells, classItem);
    state.classSpellData[identifier] = { spellLevels, className: classItem.name, spellPreparation: prepStats, classItem, identifier };
    if (state._shouldHideCantrips(identifier)) state.classSpellData[identifier].spellLevels = spellLevels.filter((levelData) => levelData.level !== '0' && levelData.level !== 0);
    log(3, 'Spells processed and organized', { identifier, levelCount: state.classSpellData[identifier].spellLevels.length, prepStats });
  }

  /**
   * Process wizard spells for preparation and spellbook tabs.
   * @param {Array<object>} allSpellItems - All fetched spell items
   * @param {object} classItem - The class item
   * @param {Array<string>} personalSpellbook - The personal spellbook spell UUIDs
   * @param {string} classIdentifier - The class identifier
   * @param {object} state - The State instance
   * @returns {Promise<void>}
   */
  async processWizardSpells(allSpellItems, classItem, personalSpellbook, classIdentifier, state) {
    const spellsTabId = `${classIdentifier}Tab`;
    const wizardTabId = `wizardbook-${classIdentifier}`;
    const shouldHideCantrips = state._shouldHideCantrips(classIdentifier);
    const wizardManager = this._wizardManagers.get(classIdentifier);
    if (!wizardManager) return;
    const isSpellInCollection = (spell, collection) => {
      const spellUuids = DataUtils.getAllSpellUuids(spell);
      return spellUuids.some((uuid) => {
        if (Array.isArray(collection)) return collection.some((collectionUuid) => foundry.utils.parseUuid(collectionUuid).uuid === uuid);
        else if (collection?.has) for (const collectionUuid of collection) if (foundry.utils.parseUuid(collectionUuid).uuid === uuid) return true;
        return false;
      });
    };
    const totalFreeSpells = wizardManager.getTotalFreeSpells();
    const usedFreeSpells = await wizardManager.getUsedFreeSpells();
    const remainingFreeSpells = Math.max(0, totalFreeSpells - usedFreeSpells);
    const totalSpells = personalSpellbook.length;
    const maxSpellsAllowed = wizardManager.getMaxSpellsAllowed();
    const isAtMaxSpells = personalSpellbook.length >= maxSpellsAllowed;
    const maxSpellLevel = DataUtils.calculateMaxSpellLevel(classItem, this.actor);
    state.scrollSpells = await DataUtils.ScrollProcessor.scanForScrollSpells(this.actor);
    const grantedSpells = this.actor.itemTypes.spell
      .filter((s) => s.flags?.dnd5e?.cachedFor || (s.system?.method && [MODULE.SPELL_MODE.PACT, MODULE.SPELL_MODE.INNATE, MODULE.SPELL_MODE.AT_WILL].includes(s.system.method)))
      .flatMap((s) => {
        const uuids = [];
        if (s?._stats?.compendiumSource) uuids.push(s._stats.compendiumSource);
        if (s?.flags?.core?.sourceId) uuids.push(s.flags.core.sourceId);
        if (s?.uuid) uuids.push(s.uuid);
        if (s?.compendiumUuid) uuids.push(s.compendiumUuid);
        if (s?.spellUuid) uuids.push(s.spellUuid);
        return uuids;
      })
      .filter(Boolean);
    const prepTabSpells = allSpellItems.filter((spell) => {
      const isCantrip = spell.system.level === 0;
      const isNonCantrip = spell.system.level !== 0;
      const inPersonalSpellbook = isSpellInCollection(spell, personalSpellbook);
      const inGrantedSpells = isSpellInCollection(spell, grantedSpells);
      return (!shouldHideCantrips && isCantrip) || (isNonCantrip && (inPersonalSpellbook || inGrantedSpells));
    });
    for (const spell of prepTabSpells) spell.sourceClass = classIdentifier;
    const prepLevelsGrouped = await this.organizeSpellsByLevelForClass(prepTabSpells, classIdentifier);
    let finalPrepLevels = prepLevelsGrouped;
    if (shouldHideCantrips) finalPrepLevels = prepLevelsGrouped.filter((levelData) => levelData.level !== '0' && levelData.level !== 0);
    const fullWizardSpellList = state._fullWizardSpellLists.get(classIdentifier);
    const classSpellsOnly = allSpellItems.filter((spell) => {
      const isNonCantrip = spell.system.level !== 0;
      const inFullWizardList = fullWizardSpellList && isSpellInCollection(spell, fullWizardSpellList);
      return isNonCantrip && inFullWizardList;
    });
    const scrollLearnedSpells = await state._getScrollLearnedSpellsNotInClassList(classIdentifier, personalSpellbook, fullWizardSpellList, maxSpellLevel);
    const allWizardbookSpells = [...classSpellsOnly, ...scrollLearnedSpells];
    log(3, `Total wizardbook spells for ${classIdentifier}: ${allWizardbookSpells.length} (${classSpellsOnly.length} class + ${scrollLearnedSpells.length} scroll)`);
    const wizardLevelsGrouped = await this.organizeWizardSpellsForLearning(allWizardbookSpells, classIdentifier, personalSpellbook);
    const scrollSpellsForLevel = [];
    for (const scrollSpell of state.scrollSpells) {
      scrollSpell.sourceClass = classIdentifier;
      scrollSpell.isWizardClass = true;
      scrollSpell.inWizardSpellbook = personalSpellbook.includes(scrollSpell.compendiumUuid || scrollSpell.spellUuid);
      scrollSpell.canLearnFromScroll = !scrollSpell.inWizardSpellbook;
      if (scrollSpell.isFromScroll) scrollSpell.scrollMetadata = { scrollId: scrollSpell.scrollId, scrollName: scrollSpell.scrollName };
      scrollSpellsForLevel.push(scrollSpell);
    }
    if (scrollSpellsForLevel.length > 0) {
      const learnFromScrollLevel = { level: 'scroll', name: game.i18n.localize('SPELLBOOK.Scrolls.LearnFromScroll'), spells: scrollSpellsForLevel };
      wizardLevelsGrouped.unshift(learnFromScrollLevel);
    }
    const filteredWizardLevelsGrouped = wizardLevelsGrouped.filter((levelData) => {
      return levelData.level === 'scroll' || (levelData.level !== '0' && levelData.level !== 0);
    });
    for (const levelData of filteredWizardLevelsGrouped) {
      for (const spell of levelData.spells) {
        spell.isAtMaxSpells = isAtMaxSpells;
        if (this._app && this._app.comparisonSpells) {
          const comparisonMax = game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX);
          if (this._app.comparisonSpells.size < comparisonMax) {
            spell.showCompareLink = true;
            spell.isInComparison = this._app.comparisonSpells.has(spell.compendiumUuid || spell.spellUuid);
          }
        }
      }
    }

    const prepStats = state.calculatePreparationStats(classIdentifier, finalPrepLevels, classItem);
    const tabData = {
      [spellsTabId]: { spellLevels: finalPrepLevels, spellPreparation: prepStats },
      [wizardTabId]: {
        spellLevels: filteredWizardLevelsGrouped,
        spellPreparation: prepStats,
        wizardTotalSpellbookCount: totalSpells,
        wizardFreeSpellbookCount: totalFreeSpells,
        wizardRemainingFreeSpells: remainingFreeSpells,
        wizardHasFreeSpells: remainingFreeSpells > 0,
        wizardMaxSpellbookCount: maxSpellsAllowed,
        wizardIsAtMax: isAtMaxSpells
      }
    };
    state.classSpellData[classIdentifier] = { spellLevels: finalPrepLevels, className: classItem.name, spellPreparation: prepStats, classItem, tabData, identifier: classIdentifier };
    Object.assign(state.tabData, tabData);
    log(3, `Processed wizard spells for ${classIdentifier}: Prep tab has ${finalPrepLevels.length} levels, Wizard tab has ${filteredWizardLevelsGrouped.length} levels`);
  }

  /**
   * Create default aggregated modes object.
   * @returns {object} Default aggregated modes
   * @private
   */
  _createAggregatedModes() {
    return { hasGranted: false, hasAlwaysPrepared: false, hasInnate: false, hasAtWill: false, hasRitual: false, hasPact: false, hasPrepared: false, isPreparedForCheckbox: false };
  }

  /**
   * Process an owned spell version and update aggregated modes.
   * @param {object} spellData - The spell data to update
   * @param {object} version - The owned spell version
   * @param {string} classIdentifier - The class identifier
   * @private
   */
  _processOwnedVersion(spellData, version, classIdentifier) {
    const ownedSpell = version.item;
    const isCurrentClass = version.sourceClass === classIdentifier;
    if (ownedSpell.flags?.dnd5e?.cachedFor) {
      const cachedFor = ownedSpell.flags.dnd5e.cachedFor;
      const itemId = foundry.utils.parseUuid(cachedFor, { relative: this.actor }).embedded?.[1];
      const grantingItem = this.actor?.items.get(itemId);
      const isItemActive = DataUtils.isGrantingItemActive(grantingItem);
      if (isItemActive) {
        spellData.aggregatedModes.hasGranted = true;
        if (!spellData.flags?.dnd5e?.cachedFor) {
          if (!spellData.flags) spellData.flags = {};
          foundry.utils.mergeObject(spellData.flags, ownedSpell.flags, { inplace: true });
        }
      }
    }
    if (ownedSpell.system.prepared === 2) {
      spellData.aggregatedModes.hasAlwaysPrepared = true;
      if (isCurrentClass && (!spellData.system.prepared || spellData.system.prepared < 2)) spellData.system.prepared = 2;
    }
    const isStoredSpell = DataUtils.isCPRROSS(ownedSpell);
    if (!isStoredSpell && ownedSpell.system.method === MODULE.SPELL_MODE.INNATE) spellData.aggregatedModes.hasInnate = true;
    if (!isStoredSpell && ownedSpell.system.method === MODULE.SPELL_MODE.AT_WILL) spellData.aggregatedModes.hasAtWill = true;
    if (!isStoredSpell && ownedSpell.system.method === MODULE.SPELL_MODE.RITUAL) spellData.aggregatedModes.hasRitual = true;
    if (ownedSpell.system.method === MODULE.SPELL_MODE.PACT) {
      spellData.aggregatedModes.hasPact = true;
      if (isCurrentClass && ownedSpell.system.prepared === 1) spellData.aggregatedModes.isPreparedForCheckbox = true;
    }
    if (ownedSpell.system.method === MODULE.SPELL_MODE.SPELL && ownedSpell.system.prepared === 1) {
      spellData.aggregatedModes.hasPrepared = true;
      if (isCurrentClass) spellData.aggregatedModes.isPreparedForCheckbox = true;
    }
  }

  /**
   * Find if a spell is prepared by another class.
   * @param {object} preparedByClass - Prepared spells by class
   * @param {string} classIdentifier - Current class identifier
   * @param {string} spellUuid - The spell UUID
   * @returns {string|null} Other class identifier or null
   * @private
   */
  _findPreparedByOtherClass(preparedByClass, classIdentifier, spellUuid) {
    for (const [otherClass, preparedSpells] of Object.entries(preparedByClass)) {
      if (otherClass === classIdentifier) continue;
      const otherClassKey = `${otherClass}:${spellUuid}`;
      if (preparedSpells.includes(otherClassKey)) return otherClass;
    }
    return null;
  }
}
