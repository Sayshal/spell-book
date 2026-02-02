/**
 * Spell Data Loader for Spell Book
 *
 * Handles loading spell data from compendiums, preloaded data, and actor flags.
 * Extracted from State.mjs to reduce god class complexity.
 * @module State/SpellDataLoader
 * @author Tyler
 */

import { FLAGS, MODULE } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from '../managers/_module.mjs';

/**
 * Manages spell data loading from various sources.
 */
export class SpellDataLoader {
  /**
   * Create a new SpellDataLoader.
   * @param {object} actor - The actor to load spells for
   * @param {object} app - The spell book application instance
   */
  constructor(actor, app) {
    this.actor = actor;
    this._app = app;
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
   * Load spell data for all detected spellcasting classes.
   * @param {object} state - The State instance
   * @returns {Promise<boolean>} True if spell data loaded successfully
   */
  async loadSpellData(state) {
    RuleSet.initializeNewClasses(this.actor);
    const wizardClasses = state.getWizardEnabledClasses();
    for (const { identifier } of wizardClasses) {
      const wizardManager = this._wizardManagers.get(identifier);
      if (wizardManager) await this.cacheWizardSpellbook(identifier, state);
    }
    if (Object.keys(state.spellcastingClasses).length === 0) {
      log(2, 'No spellcasting classes found for actor');
      return false;
    }
    state.handleCantripLevelUp();
    log(3, `Loading spell data for ${Object.keys(state.spellcastingClasses).length} spellcasting classes:`, Object.keys(state.spellcastingClasses));
    for (const [identifier, classData] of Object.entries(state.spellcastingClasses)) {
      const classItem = this.actor.items.get(classData.id);
      if (!classItem) {
        log(2, `Could not find class item for ${identifier} with id ${classData.id}`);
        continue;
      }
      log(3, `Processing class ${identifier} (${classItem.name})`);
      if (identifier in DataUtils.getWizardData(this.actor)) {
        log(3, `Loading wizard spell data for ${identifier}`);
        await this.loadWizardSpellData(classItem, identifier, state);
      } else {
        log(3, `Loading regular spell data for ${identifier}`);
        await this.loadClassSpellData(identifier, classItem, state);
      }
      if (state.classSpellData[identifier]) {
        log(3, `Successfully loaded spell data for ${identifier}: ${state.classSpellData[identifier].spellPreparation.current}/${state.classSpellData[identifier].spellPreparation.maximum}`);
      } else {
        log(2, `FAILED to load spell data for ${identifier} - not in classSpellData!`);
      }
    }
    log(3, 'Final classSpellData keys:', Object.keys(state.classSpellData));
    if (state.activeClass && state.classSpellData[state.activeClass]) {
      state.spellLevels = state.classSpellData[state.activeClass].spellLevels || [];
      state.className = state.classSpellData[state.activeClass].className || '';
      state.spellPreparation = state.classSpellData[state.activeClass].spellPreparation || { current: 0, maximum: 0 };
    }
    state.updateGlobalPreparationCount();
    return true;
  }

  /**
   * Load spell data for a specific regular (non-wizard) class.
   * @param {string} identifier - Identifier of the class
   * @param {object} classItem - The class item
   * @param {object} state - The State instance
   * @returns {Promise<void>}
   */
  async loadClassSpellData(identifier, classItem, state) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    log(3, `Getting spell list for class ${identifier} (${className})`);
    const spellList = await DataUtils.getClassSpellList(className, classUuid, this.actor);
    if (!spellList || !spellList.size) {
      log(2, `No spell list found for class ${identifier} (${className}) - spell list size: ${spellList?.size || 0}`);
      const prepStats = state.calculatePreparationStats(identifier, [], classItem);
      state.classSpellData[identifier] = { spellLevels: [], className: classItem.name, spellPreparation: prepStats, classItem, identifier };
      log(3, `Created empty spell data for ${identifier} with prep stats: ${prepStats.current}/${prepStats.maximum}`);
      return;
    }
    log(3, `Found spell list with ${spellList.size} spells for ${identifier}`);
    let maxSpellLevel = DataUtils.calculateMaxSpellLevel(classItem, this.actor);
    const hideCantrips = state._shouldHideCantrips(identifier);
    if (hideCantrips && maxSpellLevel > 0) maxSpellLevel = Math.max(1, maxSpellLevel);
    const spellItems = await this._fetchSpellsFromPreloadedOrCompendium(spellList, maxSpellLevel, identifier);
    if (!spellItems || !spellItems.length) return;
    await state.processAndOrganizeSpellsForClass(identifier, spellItems, classItem);
  }

  /**
   * Load wizard spell data for a specific wizard-enabled class.
   * @param {object} classItem - The class item
   * @param {string} classIdentifier - The class identifier
   * @param {object} state - The State instance
   * @returns {Promise<void>}
   */
  async loadWizardSpellData(classItem, classIdentifier, state) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    const maxSpellLevel = DataUtils.calculateMaxSpellLevel(classItem, this.actor);
    const fullSpellList = await DataUtils.getClassSpellList(className, classUuid, this.actor);
    if (!fullSpellList || !fullSpellList.size) return;
    const wizardManager = this._wizardManagers.get(classIdentifier);
    if (!wizardManager || !wizardManager.isWizard) return;
    const personalSpellbook = await wizardManager.getSpellbookSpells();
    if (!state._fullWizardSpellLists) state._fullWizardSpellLists = new Map();
    state._fullWizardSpellLists.set(classIdentifier, new Set(fullSpellList));
    const allUuids = new Set([...fullSpellList, ...personalSpellbook]);
    const effectiveMaxLevel = Math.max(1, maxSpellLevel);
    const spellItems = await this._fetchSpellsFromPreloadedOrCompendium(allUuids, effectiveMaxLevel, `${classIdentifier} wizard`);
    if (!spellItems || !spellItems.length) {
      log(1, `No spell items found for wizard ${classIdentifier}`);
      return;
    }
    await state.processWizardSpells(spellItems, classItem, personalSpellbook, classIdentifier);
    const wizardTabId = `wizardbook-${classIdentifier}`;
    if (!state.tabData[wizardTabId]) {
      log(1, `Failed to create wizard tab data for ${classIdentifier}.`);
    } else {
      const tabData = state.tabData[wizardTabId];
      log(3, `Wizard tab data successfully created for ${classIdentifier}: ${tabData.spellLevels?.length || 0} spell levels`);
    }
  }

  /**
   * Cache wizard spellbook spells for a specific class.
   * @param {string} classIdentifier - The class identifier
   * @param {object} state - The State instance
   * @returns {Promise<void>}
   */
  async cacheWizardSpellbook(classIdentifier, state) {
    const wizardManager = this._wizardManagers.get(classIdentifier);
    if (wizardManager && wizardManager.isWizard) {
      if (!state.wizardbookCache) state.wizardbookCache = new Map();
      const spells = await wizardManager.getSpellbookSpells();
      state.wizardbookCache.set(classIdentifier, spells);
      log(3, 'Wizard spellbook cached', { classIdentifier, spellCount: spells.length });
    } else {
      log(2, `No wizard manager found for class ${classIdentifier} during cache`);
    }
  }

  /**
   * Get scroll-learned spells that aren't in the class spell list.
   * @param {string} classIdentifier - The class identifier
   * @param {Array<string>} personalSpellbook - UUIDs of spells in personal spellbook
   * @param {Set<string>} classSpellListUuids - UUIDs of spells in the class list
   * @param {number} maxSpellLevel - Maximum spell level to fetch
   * @returns {Promise<Array<object>>} Array of scroll-learned spell documents
   */
  async getScrollLearnedSpellsNotInClassList(classIdentifier, personalSpellbook, classSpellListUuids, maxSpellLevel) {
    const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${classIdentifier}`;
    const copiedSpells = this.actor.getFlag(MODULE.ID, copiedSpellsFlag) || [];
    const scrollLearnedUuids = copiedSpells.map((metadata) => metadata.spellUuid).filter((uuid) => personalSpellbook.includes(uuid) && !classSpellListUuids.has(uuid));
    if (scrollLearnedUuids.length === 0) return [];
    log(3, 'Found scroll-learned spells not in class list', { classIdentifier, count: scrollLearnedUuids.length });
    const spellDocuments = await DataUtils.fetchSpellDocuments(new Set(scrollLearnedUuids), maxSpellLevel);
    for (const spell of spellDocuments) {
      const metadata = copiedSpells.find((m) => m.spellUuid === spell.uuid);
      if (metadata) {
        spell.learnedFromScroll = true;
        spell.scrollLearningMetadata = { dateCopied: metadata.dateCopied, cost: metadata.cost, timeSpent: metadata.timeSpent };
      }
    }
    log(3, 'Scroll-learned spells retrieved', { classIdentifier, count: spellDocuments.length });
    return spellDocuments;
  }

  /**
   * Fetch spells from preloaded data or compendium.
   * @param {Set<string>} spellUuids - Set of spell UUIDs to fetch
   * @param {number} maxSpellLevel - Maximum spell level to include
   * @param {string} logContext - Context string for logging
   * @returns {Promise<Array<object>>} Array of spell documents
   * @private
   */
  async _fetchSpellsFromPreloadedOrCompendium(spellUuids, maxSpellLevel, logContext) {
    const preloadedData = DataUtils.getPreloadedData();
    let spellItems = [];
    if (preloadedData && preloadedData.enrichedSpells.size > 0) {
      log(3, `Using preloaded spell data for ${logContext}`);
      const preloadedUuidsMap = new Map();
      for (const spell of preloadedData.enrichedSpells.values()) if (spell.system.level <= maxSpellLevel) preloadedUuidsMap.set(spell.uuid, spell);
      const preloadedSpells = [];
      const actuallyMissingSpells = [];
      for (const uuid of spellUuids) {
        const preloaded = preloadedUuidsMap.get(uuid);
        if (preloaded) preloadedSpells.push(preloaded);
        else actuallyMissingSpells.push(uuid);
      }
      const spellsFilteredByLevel = spellUuids.size - preloadedSpells.length - actuallyMissingSpells.length;
      if (actuallyMissingSpells.length > 0) {
        log(3, `Found ${preloadedSpells.length} preloaded spells for ${logContext}, loading ${actuallyMissingSpells.length} missing spells (${spellsFilteredByLevel} filtered by level cap)`);
        const additionalSpells = await DataUtils.fetchSpellDocuments(new Set(actuallyMissingSpells), maxSpellLevel);
        spellItems = [...preloadedSpells, ...additionalSpells];
      } else {
        log(3, `All ${preloadedSpells.length} spells for ${logContext} found in preloaded data (${spellsFilteredByLevel} filtered by level cap)`);
        spellItems = preloadedSpells;
      }
    } else {
      spellItems = await DataUtils.fetchSpellDocuments(spellUuids, maxSpellLevel);
    }
    return spellItems;
  }
}
