/**
 * Spell Book State Management
 *
 * State management system for the Spell Book application. This class handles
 * all aspects of spell data loading, organization, caching, and state management including
 * spellcasting class detection, spell preparation tracking, wizard spellbook management,
 * and ritual casting functionality.
 * @module State/State
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from '../managers/_module.mjs';
import { RitualSpellHandler } from './ritual-spell-handler.mjs';
import { SpellDataLoader } from './spell-data-loader.mjs';
import { SpellOrganizer } from './spell-organizer.mjs';
import { SpellcastingClassDetector } from './spellcasting-class-detector.mjs';

/**
 * Manages state for the Spell Book application with cached calculations.
 */
export class State {
  /**
   * Create a new State manager for a Spell Book application.
   * @param {object} app - Spell Book application instance
   */
  constructor(app) {
    log(3, 'Constructing State manager', { actorName: app.actor?.name, actorId: app.actor?.id });
    this.app = app;
    this.actor = app.actor;
    this._classDetectionCache = new Map();
    this._classesDetected = false;
    this._initialized = false;
    this._preparationStatsCache = new Map();
    this._wizardClassesCache = null;
    this._spellcastingConfigCache = new Map();
    this._spellcastingSourceCache = new Map();
    this._spellcastingLevelsCache = new Map();
    this.activeClass = null;
    this.className = '';
    this.classPrepModes = {};
    this.classRitualRules = {};
    this.classSpellData = {};
    this.classSwapRules = {};
    this.isLongRest = false;
    this.scrollSpells = [];
    this.spellcastingClasses = {};
    this.spellLevels = [];
    this.spellPreparation = { current: 0, maximum: 0 };
    this.tabData = {};
    this.wizardbookCache = null;
    this._ritualHandler = new RitualSpellHandler(this.actor, this.app);
    this._classDetector = new SpellcastingClassDetector(this.actor, this.app);
    this._spellOrganizer = new SpellOrganizer(this.actor, this.app);
    this._dataLoader = new SpellDataLoader(this.actor, this.app);
  }

  /**
   * Get wizard-enabled classes with caching.
   * @returns {Array<object>} Array of wizard-enabled class data objects
   */
  getWizardEnabledClasses() {
    if (this._wizardClassesCache === null) {
      const wizardData = DataUtils.getWizardData(this.actor);
      this._wizardClassesCache = Object.entries(wizardData).map(([identifier, data]) => ({
        identifier,
        classItem: data.classData,
        isNaturalWizard: data.isNaturalWizard,
        isForceWizard: data.isForceWizard
      }));
      log(3, 'Wizard classes cached in State', { count: this._wizardClassesCache.length });
    }
    return this._wizardClassesCache;
  }

  /**
   * Invalidate wizard classes cache (call when actor classes change).
   */
  invalidateWizardClassesCache() {
    log(3, 'Invalidating wizard classes cache');
    this._wizardClassesCache = null;
  }

  /**
   * Get spellcasting config for a class with caching.
   * @param {string} classIdentifier - Class identifier
   * @returns {object | null} Spellcasting configuration or null
   */
  getSpellcastingConfigForClass(classIdentifier) {
    if (!this._spellcastingConfigCache.has(classIdentifier)) {
      const config = DataUtils.getSpellcastingConfigForClass(this.actor, classIdentifier);
      this._spellcastingConfigCache.set(classIdentifier, config);
      log(3, 'Spellcasting config cached in State', { classIdentifier, hasConfig: !!config });
    }
    return this._spellcastingConfigCache.get(classIdentifier);
  }

  /**
   * Get spellcasting source item for a class with caching.
   * @param {string} classIdentifier - Class identifier
   * @returns {object | null} Source item or null
   */
  getSpellcastingSourceItem(classIdentifier) {
    if (!this._spellcastingSourceCache.has(classIdentifier)) {
      const source = DataUtils.getSpellcastingSourceItem(this.actor, classIdentifier);
      this._spellcastingSourceCache.set(classIdentifier, source);
      log(3, 'Spellcasting source item cached in State', { classIdentifier, hasSource: !!source });
    }
    return this._spellcastingSourceCache.get(classIdentifier);
  }

  /**
   * Get spellcasting levels for a class with caching.
   * @param {string} classIdentifier - Class identifier
   * @returns {number} Class levels for spellcasting
   */
  getSpellcastingLevelsForClass(classIdentifier) {
    if (!this._spellcastingLevelsCache.has(classIdentifier)) {
      const levels = DataUtils.getSpellcastingLevelsForClass(this.actor, classIdentifier);
      this._spellcastingLevelsCache.set(classIdentifier, levels);
      log(3, 'Spellcasting levels cached in State', { classIdentifier, levels });
    }
    return this._spellcastingLevelsCache.get(classIdentifier);
  }

  /**
   * Invalidate all spellcasting caches (call when actor classes/levels change).
   */
  invalidateSpellcastingCaches() {
    log(3, 'Invalidating spellcasting caches');
    this._spellcastingConfigCache.clear();
    this._spellcastingSourceCache.clear();
    this._spellcastingLevelsCache.clear();
  }

  /**
   * Initialize state manager and load all spell data.
   * @returns {Promise<boolean>} True if initialization successful, false otherwise
   */
  async initialize() {
    if (this._initialized) return true;
    log(3, 'Starting Spell Book state initialization');
    this.isLongRest = !this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
    if (!this._classesDetected) this.detectSpellcastingClasses();
    await this.app.spellManager.cleanupStalePreparationFlags();
    await this.loadSpellData();
    const wizardClasses = this.getWizardEnabledClasses();
    if (wizardClasses.length > 0) {
      log(3, `Checking wizard data for ${wizardClasses.length} wizard classes`);
      const wizardPromises = wizardClasses
        .filter((wizardClass) => {
          const wizardTabId = `wizardbook-${wizardClass.identifier}`;
          const alreadyLoaded = !!this.tabData[wizardTabId];
          if (alreadyLoaded) log(3, `Wizard data already loaded for ${wizardClass.identifier}`);
          return !alreadyLoaded;
        })
        .map((wizardClass) => {
          log(3, `Loading wizard data for ${wizardClass.identifier}`);
          return this.loadWizardSpellData(wizardClass.classItem, wizardClass.identifier);
        });
      if (wizardPromises.length > 0) await Promise.all(wizardPromises);
      for (const wizardClass of wizardClasses) {
        const wizardTabId = `wizardbook-${wizardClass.identifier}`;
        if (this.tabData[wizardTabId]) log(3, `Verified wizard tab data exists for ${wizardClass.identifier}`);
        else log(1, `Missing wizard tab data for ${wizardClass.identifier} after initialization`);
      }
    }

    this._initialized = true;
    log(3, 'Spell Book state initialization completed');
    return true;
  }

  /**
   * Detect and initialize all spellcasting classes for the actor.
   * @returns {void}
   */
  detectSpellcastingClasses() {
    this._classDetector.detectSpellcastingClasses(this);
  }

  /**
   * Determine the preparation mode for a given class.
   * @param {object} classItem - The class item to analyze
   * @returns {string} The preparation mode ('spell', 'pact', etc.)
   */
  getClassPreparationMode(classItem) {
    return this._classDetector.getClassPreparationMode(classItem);
  }

  /**
   * Determine ritual casting rules for a given class.
   * @param {object} classItem - The class item to analyze
   * @returns {object} Ritual casting rules for the class
   */
  getClassRitualRules(classItem) {
    return this._classDetector.getClassRitualRules(classItem);
  }

  /**
   * Determine spell swapping rules for a given class.
   * @param {object} classItem - The class item to analyze
   * @returns {object} Spell swapping rules for the class
   */
  getClassSwapRules(classItem) {
    return this._classDetector.getClassSwapRules(classItem);
  }

  /**
   * Load spell data for all detected spellcasting classes.
   * @returns {Promise<boolean>} True if spell data loaded successfully, false otherwise
   */
  async loadSpellData() {
    return this._dataLoader.loadSpellData(this);
  }

  /**
   * Load spell data for a specific regular (non-wizard) class.
   * @param {string} identifier - Identifier of the class
   * @param {object} classItem - The class item
   * @returns {Promise<void>}
   */
  async loadClassSpellData(identifier, classItem) {
    return this._dataLoader.loadClassSpellData(identifier, classItem, this);
  }

  /**
   * Organize spells by level for a class.
   * @param {Array<object>} spellItems - Array of spell documents
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<Array<object>>} Array of level objects, each containing its spells
   * @private
   */
  async _organizeSpellsByLevelForClass(spellItems, classIdentifier) {
    return this._spellOrganizer.organizeSpellsByLevelForClass(spellItems, classIdentifier);
  }

  /**
   * Organize spells for wizard spellbook learning tab.
   * @param {Array<object>} spellItems - Array of class spell list items
   * @param {string} classIdentifier - The class identifier
   * @param {Array<string>} personalSpellbook - Spells already learned by wizard
   * @returns {Promise<Array<object>>} Array of level objects for wizard spellbook
   * @private
   */
  async _organizeWizardSpellsForLearning(spellItems, classIdentifier, personalSpellbook) {
    return this._spellOrganizer.organizeWizardSpellsForLearning(spellItems, classIdentifier, personalSpellbook);
  }

  /**
   * Process and organize spells for a regular class.
   * @param {string} identifier - Identifier of the class
   * @param {Array<object>} spellItems - Array of spell items
   * @param {object} classItem - The class item
   * @returns {Promise<void>}
   */
  async processAndOrganizeSpellsForClass(identifier, spellItems, classItem) {
    return this._spellOrganizer.processAndOrganizeSpellsForClass(identifier, spellItems, classItem, this);
  }

  /**
   * Calculate preparation statistics for a specific class.
   * @param {string} classIdentifier - The class identifier
   * @param {Array} spellLevels - Array of level objects with grouped spells or flat spell array
   * @param {object} classItem - The spellcasting class item
   * @returns {object} Preparation stats object with current and maximum counts
   */
  calculatePreparationStats(classIdentifier, spellLevels, classItem) {
    if (!spellLevels || !Array.isArray(spellLevels)) {
      log(2, 'calculatePreparationStats: Invalid spellLevels structure', spellLevels);
      return { current: 0, maximum: 0 };
    }
    const isGroupedStructure = spellLevels.length > 0 && spellLevels[0] && 'spells' in spellLevels[0];
    const isFlatStructure = spellLevels.length > 0 && spellLevels[0] && ('system' in spellLevels[0] || 'level' in spellLevels[0]);
    let totalSpellCount = 0;
    let preparedCount = 0;
    const effectiveLevels = this.getSpellcastingLevelsForClass(classIdentifier);
    if (isGroupedStructure) {
      log(3, 'GROUPED STRUCTURE DETECTED!', { class: classIdentifier, spells: spellLevels, classItem: classItem });
      totalSpellCount = spellLevels.reduce((count, level) => count + (Array.isArray(level.spells) ? level.spells.length : 0), 0);
      const cacheKey = `${classIdentifier}-${totalSpellCount}-${effectiveLevels}`;
      if (this._preparationStatsCache.has(cacheKey)) {
        const cached = this._preparationStatsCache.get(cacheKey);
        return cached;
      }
      for (const levelData of spellLevels) {
        const level = levelData.level;
        if (level === '0' || level === 0) continue;
        if (!Array.isArray(levelData.spells)) continue;
        for (const spell of levelData.spells) {
          const method = spell.system?.method;
          const sourceClass = spell.sourceClass;
          const cachedFor = spell.flags?.dnd5e?.cachedFor;
          const isPrepared = spell.preparation?.prepared;
          if (spell.system?.prepared === 2) continue;
          if ([MODULE.SPELL_MODE.INNATE, MODULE.SPELL_MODE.AT_WILL, MODULE.SPELL_MODE.PACT].includes(method)) continue;
          if (cachedFor) continue;
          if (isPrepared && sourceClass === classIdentifier) preparedCount++;
        }
      }
    } else if (isFlatStructure) {
      log(3, 'FLAT STRUCTURE DETECTED!', { class: classIdentifier, spells: spellLevels, classItem: classItem });
      totalSpellCount = spellLevels.length;
      const cacheKey = `${classIdentifier}-${totalSpellCount}-${effectiveLevels}`;
      if (this._preparationStatsCache.has(cacheKey)) {
        const cached = this._preparationStatsCache.get(cacheKey);
        return cached;
      }
      for (const spell of spellLevels) {
        const spellLevel = spell.system?.level ?? spell.level ?? spell._levelMetadata?.level;
        if (spellLevel === 0 || spellLevel === '0') continue;
        const method = spell.system?.method;
        const sourceClass = spell.sourceClass;
        const cachedFor = spell.flags?.dnd5e?.cachedFor;
        const isPrepared = spell.preparation?.prepared;
        if (spell.system?.prepared === 2) continue;
        if ([MODULE.SPELL_MODE.INNATE, MODULE.SPELL_MODE.AT_WILL, MODULE.SPELL_MODE.PACT].includes(method)) continue;
        if (cachedFor) continue;
        if (isPrepared && sourceClass === classIdentifier) preparedCount++;
      }
    } else log(1, 'calculatePreparationStats: Unknown structure for spellLevels', spellLevels);
    let baseMaxPrepared = 0;
    const spellcastingConfig = this.getSpellcastingConfigForClass(classIdentifier);
    if (spellcastingConfig?.preparation?.max) baseMaxPrepared = spellcastingConfig.preparation.max;
    else baseMaxPrepared = classItem?.system?.spellcasting?.preparation?.max || 0;
    const preparationBonus = RuleSet.getClassRule(this.actor, classIdentifier, 'spellPreparationBonus', 0);
    const maxPrepared = baseMaxPrepared + preparationBonus;
    const result = { current: preparedCount, maximum: maxPrepared };
    const cacheKey = `${classIdentifier}-${totalSpellCount}-${effectiveLevels}`;
    this._preparationStatsCache.set(cacheKey, result);
    return result;
  }

  /**
   * Update the global prepared spell count across all classes.
   * @returns {void}
   */
  updateGlobalPreparationCount() {
    let totalPrepared = 0;
    let totalMaxPrepared = 0;
    for (const classData of Object.values(this.classSpellData)) {
      if (classData.spellPreparation) {
        totalPrepared += classData.spellPreparation.current;
        totalMaxPrepared += classData.spellPreparation.maximum;
      }
    }
    this.spellPreparation = { current: totalPrepared, maximum: totalMaxPrepared };
    log(3, `Updated global preparation count: ${totalPrepared}/${totalMaxPrepared}`);
    if (totalMaxPrepared <= 0) log(2, `Global max preparation is ${totalMaxPrepared}, this might indicate a data issue. `);
  }

  /**
   * Determine if cantrips should be hidden for a class.
   * @param {string} identifier - Identifier of the class
   * @returns {boolean} Whether cantrips should be hidden
   * @private
   */
  _shouldHideCantrips(identifier) {
    if (this._classDetectionCache.has(identifier)) {
      const cached = this._classDetectionCache.get(identifier);
      log(3, 'Using cached cantrip visibility', { identifier, shouldHide: cached });
      return cached;
    }
    const classRules = RuleSet.getClassRules(this.actor, identifier);
    let shouldHide = false;
    if (classRules && classRules.showCantrips !== undefined) shouldHide = !classRules.showCantrips;
    else shouldHide = [MODULE.CLASS_IDENTIFIERS.PALADIN, MODULE.CLASS_IDENTIFIERS.RANGER].includes(identifier);
    this._classDetectionCache.set(identifier, shouldHide);
    log(3, 'Cantrip visibility determined', { identifier, shouldHide });
    return shouldHide;
  }

  /**
   * Set active class and update current state data.
   * @param {string} identifier - The class identifier to set as active
   * @returns {void}
   */
  setActiveClass(identifier) {
    if (this.classSpellData[identifier]) {
      this.activeClass = identifier;
      this.spellLevels = this.classSpellData[identifier].spellLevels || [];
      this.className = this.classSpellData[identifier].className || '';
      this.spellPreparation = this.classSpellData[identifier].spellPreparation || { current: 0, maximum: 0 };
      log(3, 'Active class set', { identifier, className: this.className, spellLevelCount: this.spellLevels.length });
      if (this.app.searchEngine) this.app.searchEngine.invalidateSpellNameTree();
    } else log(2, 'Attempted to set active class that does not exist in classSpellData', { identifier });
  }

  /**
   * Handle cantrip level-up notification if needed.
   * @returns {void}
   */
  handleCantripLevelUp() {
    const cantripLevelUp = this.app.spellManager.cantripManager.checkForLevelUp();
    if (cantripLevelUp) {
      const hasLevelUpSwapping = Object.keys(this.spellcastingClasses).some((classId) => {
        return RuleSet.getClassRule(this.actor, classId, 'cantripSwapping', 'none') === 'levelUp';
      });
      if (hasLevelUpSwapping) ui.notifications.info(game.i18n.localize('SPELLBOOK.Cantrips.LevelUpModern'));
    } else log(3, 'No cantrip level-up detected');
  }

  /**
   * Cache wizard spellbook spells for a specific class.
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async cacheWizardSpellbook(classIdentifier) {
    return this._dataLoader.cacheWizardSpellbook(classIdentifier, this);
  }

  /**
   * Load wizard spell data for a specific wizard-enabled class.
   * @param {object} classItem - The class item
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async loadWizardSpellData(classItem, classIdentifier) {
    return this._dataLoader.loadWizardSpellData(classItem, classIdentifier, this);
  }

  /**
   * Process wizard spells for preparation and spellbook tabs.
   * @param {Array<object>} allSpellItems - All fetched spell items
   * @param {object} classItem - The class item
   * @param {Array<string>} personalSpellbook - The personal spellbook spell UUIDs
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async processWizardSpells(allSpellItems, classItem, personalSpellbook, classIdentifier) {
    return this._spellOrganizer.processWizardSpells(allSpellItems, classItem, personalSpellbook, classIdentifier, this);
  }

  /**
   * Wait for all wizard data to be fully loaded and available.
   * @returns {Promise<void>}
   */
  async waitForWizardDataCompletion() {
    if (this._initialized) {
      const wizardClasses = this.getWizardEnabledClasses();
      for (const { identifier } of wizardClasses) {
        const wizardTabId = `wizardbook-${identifier}`;
        if (!this.tabData[wizardTabId]) {
          log(2, `Wizard tab data missing for ${identifier}, forcing reload`);
          const classData = this.spellcastingClasses[identifier];
          if (classData) {
            const classItem = this.actor.items.get(classData.id);
            if (classItem) await this.loadWizardSpellData(classItem, identifier);
          }
        }
      }
      log(3, 'Wizard data completion check finished');
      return;
    }
    log(3, 'State not initialized, forcing complete initialization');
    await this.initialize();
  }

  /**
   * Get tab data for a specific class.
   * @param {string} identifier - The class identifier
   * @returns {object | null} Tab data for the class, or null if not found
   */
  getClassTabData(identifier) {
    if (this.classSpellData[identifier]) {
      const tabData = {
        spellLevels: this.classSpellData[identifier].spellLevels || [],
        className: this.classSpellData[identifier].className || '',
        spellPreparation: this.classSpellData[identifier].spellPreparation || { current: 0, maximum: 0 },
        identifier: identifier
      };
      log(3, 'Class tab data retrieved', { identifier, levelCount: tabData.spellLevels.length });
      return tabData;
    }
    log(2, 'Class tab data not found', { identifier });
    return null;
  }

  /**
   * Refresh spell data for a specific class after changes.
   * @param {string} classIdentifier - The identifier of the class to refresh
   * @returns {Promise<void>}
   */
  async refreshClassSpellData(classIdentifier) {
    const classData = this.spellcastingClasses[classIdentifier];
    if (!classData) {
      log(2, 'Cannot refresh spell data for unknown class', { classIdentifier });
      return;
    }
    this._preparationStatsCache.clear();
    this.scrollSpells = [];
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (wizardManager) wizardManager.invalidateCache();
    const classItem = this.actor.items.get(classData.id);
    if (!classItem) {
      log(2, 'Class item not found during refresh', { classIdentifier, classDataId: classData.id });
      return;
    }
    if (classIdentifier in DataUtils.getWizardData(this.actor)) {
      log(3, 'Refreshing wizard spell data', { classIdentifier });
      await this.cacheWizardSpellbook(classIdentifier);
      await this.loadWizardSpellData(classItem, classIdentifier);
    } else {
      log(3, 'Refreshing regular spell data', { classIdentifier });
      await this.loadClassSpellData(classIdentifier, classItem);
    }
    this.updateGlobalPreparationCount();
    if (this.app.searchEngine) this.app.searchEngine.invalidateSpellNameTree();
  }

  /**
   * Update wizard tab data after learning a spell.
   * @param {string} classIdentifier - The class identifier
   * @param {boolean} isFree - Whether the spell was learned for free
   */
  updateWizardBook(classIdentifier, isFree) {
    log(3, 'Updating wizardbook tab data after learning a spell.');
    const wizardTabId = `wizardbook-${classIdentifier}`;
    if (this.tabData && this.tabData[wizardTabId]) {
      this.tabData[wizardTabId].wizardTotalSpellbookCount = (this.tabData[wizardTabId].wizardTotalSpellbookCount || 0) + 1;
      if (isFree) {
        this.tabData[wizardTabId].wizardRemainingFreeSpells = Math.max(0, (this.tabData[wizardTabId].wizardRemainingFreeSpells || 0) - 1);
        this.tabData[wizardTabId].wizardHasFreeSpells = this.tabData[wizardTabId].wizardRemainingFreeSpells > 0;
      }
    }
  }

  /**
   * Handle post-processing after spell save operations.
   * @param {object} actor - The actor
   * @returns {Promise<void>}
   */
  async handlePostProcessing(actor) {
    log(3, 'Handling post-processing', { actorName: actor.name, isLongRest: this.isLongRest });
    if (this.app.spellManager.cantripManager.canBeLeveledUp()) await this.app.spellManager.cantripManager.completeCantripsLevelUp();
    if (this.isLongRest) {
      log(3, 'Resetting long rest state and swap tracking');
      await this.app.spellManager.cantripManager.resetSwapTracking();
      actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, false);
      this.isLongRest = false;
    }
  }

  /**
   * Add missing ritual spells for all classes with ritual casting enabled.
   * @param {object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   */
  async addMissingRitualSpells(spellDataByClass) {
    await this._ritualHandler.addMissingRitualSpells(spellDataByClass);
  }

  /**
   * Get scroll-learned spells that aren't in the class spell list.
   * @param {string} classIdentifier - The class identifier
   * @param {Array<string>} personalSpellbook - UUIDs of spells in personal spellbook
   * @param {Set<string>} classSpellListUuids - UUIDs of spells in the class list
   * @param {number} maxSpellLevel - Maximum spell level to fetch
   * @returns {Promise<Array<object>>} Array of scroll-learned spell documents
   * @private
   */
  async _getScrollLearnedSpellsNotInClassList(classIdentifier, personalSpellbook, classSpellListUuids, maxSpellLevel) {
    return this._dataLoader.getScrollLearnedSpellsNotInClassList(classIdentifier, personalSpellbook, classSpellListUuids, maxSpellLevel);
  }

  /**
   * Send GM notifications if needed for rule violations.
   * @param {object} spellDataByClass - The spell data grouped by class
   * @param {object} allChangesByClass - All spell and cantrip changes by class
   * @returns {Promise<void>}
   */
  async sendGMNotifications(spellDataByClass, allChangesByClass) {
    const globalBehavior = this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM;
    if (globalBehavior !== MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM) return;
    const notificationData = { actorName: this.actor.name, classChanges: {} };
    for (const [classIdentifier, classSpellData] of Object.entries(spellDataByClass)) {
      const classData = this.classSpellData[classIdentifier];
      if (!classData) continue;
      const className = classData.className || classIdentifier;
      const changes = allChangesByClass[classIdentifier] || { cantripChanges: { added: [], removed: [] }, spellChanges: { added: [], removed: [] } };
      const cantripCount = Object.values(classSpellData).filter((spell) => spell.isPrepared && spell.spellLevel === 0).length;
      const spellCount = Object.values(classSpellData).filter((spell) => spell.isPrepared && spell.spellLevel > 0).length;
      const maxCantrips = this.app.spellManager.cantripManager._getMaxCantripsForClass(classIdentifier);
      const maxSpells = classData.spellPreparation?.maximum || 0;
      notificationData.classChanges[classIdentifier] = {
        className,
        cantripChanges: changes.cantripChanges || { added: [], removed: [] },
        spellChanges: changes.spellChanges || { added: [], removed: [] },
        overLimits: {
          cantrips: { isOver: cantripCount > maxCantrips, current: cantripCount, max: maxCantrips },
          spells: { isOver: spellCount > maxSpells, current: spellCount, max: maxSpells }
        }
      };
    }
    log(3, 'Sending GM notifications', { actorName: this.actor.name, classCount: Object.keys(notificationData.classChanges).length });
    await this.app.spellManager.cantripManager.sendNotification(notificationData);
  }

  /**
   * Update favorite session state for spell favorites.
   * @param {string} spellUuid - The spell UUID
   * @param {boolean} favorited - Favorite status
   * @returns {void}
   */
  updateFavoriteSessionState(spellUuid, favorited) {
    if (!this.app._favoriteSessionState) this.app._favoriteSessionState = new Map();
    this.app._favoriteSessionState.set(spellUuid, favorited);
    log(3, 'Updated session favorite state', { spellUuid, favorited });
  }

  /**
   * Get favorite session state for a spell.
   * @param {string} spellUuid - The spell UUID
   * @returns {boolean|null} Session favorite state or null if not set
   */
  getFavoriteSessionState(spellUuid) {
    const state = this.app._favoriteSessionState?.get(spellUuid) || null;
    return state;
  }

  /**
   * Clear favorite session state.
   * @returns {void}
   */
  clearFavoriteSessionState() {
    log(3, 'Clearing favorite session state');
    if (this.app._favoriteSessionState) this.app._favoriteSessionState.clear();
  }

  /**
   * Refresh spell enhancements without full reload.
   * @returns {Promise<void>}
   */
  async refreshSpellEnhancements() {
    const targetUserId = DataUtils.getTargetUserId(this.app.actor);
    if (DataUtils.UserData?.cache) for (const key of DataUtils.UserData.cache.keys()) if (key.startsWith(`${targetUserId}:`)) DataUtils.UserData.cache.delete(key);
    for (const classData of Object.values(this.classSpellData)) {
      if (classData.spellLevels) {
        for (const levelData of classData.spellLevels) {
          if (!levelData.spells) continue;
          const userDataPromises = levelData.spells.map((spell) => DataUtils.UserData.getUserDataForSpell(spell.uuid || spell.compendiumUuid, targetUserId, this.app.actor?.id));
          await Promise.all(userDataPromises);
          for (const spell of levelData.spells) {
            const enhancedSpell = DataUtils.UserData.enhanceSpellWithUserData(spell, targetUserId, this.app.actor?.id);
            Object.assign(spell, enhancedSpell);
          }
        }
      }
    }
    log(3, 'Spell enhancements refreshed');
  }

  /**
   * Get the current spell list for the active class.
   * @returns {Array<object>} Array of spells for the currently active class
   */
  getCurrentSpellList() {
    if (!this.activeClass || !this.classSpellData[this.activeClass]) return [];
    const spellLevels = this.classSpellData[this.activeClass].spellLevels;
    log(3, 'Current spell list retrieved', { activeClass: this.activeClass, levelCount: spellLevels.length, spellLevels });
    return spellLevels;
  }
}
