/**
 * Spell Book State Management
 *
 * State management system for the Spell Book application. This class handles
 * all aspects of spell data loading, organization, caching, and state management including
 * spellcasting class detection, spell preparation tracking, wizard spellbook management,
 * and ritual casting functionality.
 *
 * @module State/State
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet } from '../managers/_module.mjs';
import * as UIUtils from '../ui/_module.mjs';

/**
 * Manages state for the Spell Book application with cached calculations.
 */
export class State {
  /**
   * Create a new State manager for a Spell Book application.
   * @param {SpellBook} app - Spell Book application instance
   */
  constructor(app) {
    log(3, 'Constructing State manager', { actorName: app.actor?.name, actorId: app.actor?.id });

    /** @type {SpellBook} The parent Spell Book application */
    this.app = app;

    /** @type {Actor5e} The actor this state manager is for */
    this.actor = app.actor;

    /** @type {Map<string, boolean>} Cache for class detection results */
    this._classDetectionCache = new Map();

    /** @type {boolean} Whether spellcasting classes have been detected */
    this._classesDetected = false;

    /** @type {boolean} Whether the state manager has been initialized */
    this._initialized = false;

    /** @type {Map<string, PreparationStats>} Cache for preparation statistics */
    this._preparationStatsCache = new Map();

    /** @type {Array<WizardClassData>|null} Cache for wizard-enabled classes */
    this._wizardClassesCache = null;

    /** @type {Map<string, Object>} Cache for spellcasting configurations per class */
    this._spellcastingConfigCache = new Map();

    /** @type {Map<string, Object>} Cache for spellcasting source items per class */
    this._spellcastingSourceCache = new Map();

    /** @type {Map<string, number>} Cache for spellcasting levels per class */
    this._spellcastingLevelsCache = new Map();

    /** @type {string|null} Currently active class identifier */
    this.activeClass = null;

    /** @type {string} Display name of the currently active class */
    this.className = '';

    /** @type {Object<string, string>} Preparation modes by class identifier */
    this.classPrepModes = {};

    /** @type {Object<string, RitualRules>} Ritual casting rules by class identifier */
    this.classRitualRules = {};

    /** @type {Object<string, ClassSpellData>} Spell data organized by class identifier */
    this.classSpellData = {};

    /** @type {Object<string, SwapRules>} Spell swapping rules by class identifier */
    this.classSwapRules = {};

    /** @type {boolean} Whether actor has completed a long rest */
    this.isLongRest = false;

    /** @type {Array<EnhancedSpell>} Available scroll spells for learning */
    this.scrollSpells = [];

    /** @type {Object<string, SpellcastingClassData>} Detected spellcasting classes */
    this.spellcastingClasses = {};

    /** @type {Array<SpellLevel>} Spell levels for the currently active class */
    this.spellLevels = [];

    /** @type {PreparationStats} Global preparation statistics across all classes */
    this.spellPreparation = { current: 0, maximum: 0 };

    /** @type {Object<string, Object>} Tab-specific data for wizard classes */
    this.tabData = {};

    /** @type {Map<string, Array<string>>|null} Cache for wizard spellbook contents */
    this.wizardbookCache = null;
  }

  /**
   * Get wizard-enabled classes with caching.
   * @returns {Array<WizardClassData>} Array of wizard-enabled class data objects
   */
  getWizardEnabledClasses() {
    if (this._wizardClassesCache === null) {
      this._wizardClassesCache = DataUtils.getWizardEnabledClasses(this.actor);
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
   * @returns {Object|null} Spellcasting configuration or null
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
   * @returns {Object|null} Source item or null
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
   * @todo: Consider using dnd5e.utils.formatIdentifier() when it becomes available
   * @returns {void}
   */
  detectSpellcastingClasses() {
    if (this._classesDetected) return;
    const currentClassIds = [];
    this.spellcastingClasses = {};
    this.classSpellData = {};
    this.classPrepModes = {};
    this.classRitualRules = {};
    this.classSwapRules = {};
    this._preparationStatsCache.clear();
    this._classDetectionCache.clear();
    if (this.actor.spellcastingClasses) {
      for (const spellcastingData of Object.values(this.actor.spellcastingClasses)) {
        const classItem = spellcastingData;
        let spellcastingConfig = classItem.system?.spellcasting;
        let spellcastingSource = classItem;
        if (!spellcastingConfig?.progression || spellcastingConfig.progression === 'none') {
          const subclassItem = spellcastingData._classLink;
          if (subclassItem?.system?.spellcasting?.progression && subclassItem.system.spellcasting.progression !== 'none') {
            spellcastingConfig = subclassItem.system.spellcasting;
            spellcastingSource = subclassItem;
          } else continue;
        }
        const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
        currentClassIds.push(identifier);
        this.spellcastingClasses[identifier] = {
          name: classItem.name,
          uuid: classItem.uuid,
          id: classItem.id,
          spellcasting: spellcastingConfig,
          img: classItem.img
        };
        this.classSpellData[identifier] = {
          spellLevels: [],
          className: classItem.name,
          spellPreparation: { current: 0, maximum: 0 },
          classItem: classItem,
          spellcastingSource: spellcastingSource,
          type: spellcastingConfig?.type || 'leveled',
          progression: spellcastingConfig?.progression || 'none'
        };
        this.classPrepModes[identifier] = this.getClassPreparationMode(spellcastingSource);
        this.classRitualRules[identifier] = this.getClassRitualRules(spellcastingSource);
        this.classSwapRules[identifier] = this.getClassSwapRules(spellcastingSource);
      }
    }
    this._cleanupStaleClassData(currentClassIds);
    if (Object.keys(this.spellcastingClasses).length > 0 && !this.activeClass) this.activeClass = Object.keys(this.spellcastingClasses)[0];
    this._classesDetected = true;
    log(3, 'Spellcasting classes detected', { classCount: Object.keys(this.spellcastingClasses).length, classIds: Object.keys(this.spellcastingClasses), activeClass: this.activeClass });
  }

  /**
   * Clean up all stored data for class identifiers that don't match current actor classes.
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @private
   */
  _cleanupStaleClassData(currentClassIds) {
    this._cleanupStaleFlags(currentClassIds);
    this._cleanupStaleManagers(currentClassIds);
    log(3, 'Stale class data cleanup completed');
  }

  /**
   * Clean up all flag-based data for non-existent classes.
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @private
   */
  _cleanupStaleFlags(currentClassIds) {
    const actorFlags = this.actor.flags?.[MODULE.ID] || {};
    const classRules = actorFlags[FLAGS.CLASS_RULES] || {};
    const validClassRules = {};
    for (const [classId, rules] of Object.entries(classRules)) if (currentClassIds.includes(classId)) validClassRules[classId] = rules;
    if (Object.keys(validClassRules).length !== Object.keys(classRules).length) {
      this.actor.unsetFlag(MODULE.ID, FLAGS.CLASS_RULES);
      this.actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, validClassRules);
    }
    const preparedByClass = actorFlags[FLAGS.PREPARED_SPELLS_BY_CLASS] || {};
    const validPreparedByClass = {};
    for (const [classId, spells] of Object.entries(preparedByClass)) if (currentClassIds.includes(classId)) validPreparedByClass[classId] = spells;
    if (Object.keys(validPreparedByClass).length !== Object.keys(preparedByClass).length) {
      this.actor.unsetFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS);
      this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, validPreparedByClass);
      const allPreparedKeys = Object.values(validPreparedByClass).flat();
      const allPreparedUuids = allPreparedKeys.map((key) => {
        const [, ...uuidParts] = key.split(':');
        return uuidParts.join(':');
      });
      this.actor.unsetFlag(MODULE.ID, FLAGS.PREPARED_SPELLS);
      this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
    }
    const cantripTracking = actorFlags[FLAGS.CANTRIP_SWAP_TRACKING] || {};
    const validCantripTracking = {};
    for (const [classId, tracking] of Object.entries(cantripTracking)) if (currentClassIds.includes(classId)) validCantripTracking[classId] = tracking;
    if (Object.keys(validCantripTracking).length !== Object.keys(cantripTracking).length) {
      this.actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
      this.actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, validCantripTracking);
    }
    const swapTracking = actorFlags[FLAGS.SWAP_TRACKING] || {};
    const validSwapTracking = {};
    for (const [classId, tracking] of Object.entries(swapTracking)) if (currentClassIds.includes(classId)) validSwapTracking[classId] = tracking;
    if (Object.keys(validSwapTracking).length !== Object.keys(swapTracking).length) {
      this.actor.unsetFlag(MODULE.ID, FLAGS.SWAP_TRACKING);
      this.actor.setFlag(MODULE.ID, FLAGS.SWAP_TRACKING, validSwapTracking);
    }
    const wizardFlags = Object.keys(actorFlags).filter(
      (key) =>
        key.startsWith(`${FLAGS.WIZARD_COPIED_SPELLS}-`) ||
        key.startsWith(`${FLAGS.WIZARD_COPIED_SPELLS}_`) ||
        key.startsWith(`${FLAGS.WIZARD_RITUAL_CASTING}-`) ||
        key.startsWith(`${FLAGS.WIZARD_RITUAL_CASTING}_`)
    );
    for (const flagKey of wizardFlags) {
      const separatorIndex = Math.max(flagKey.lastIndexOf('-'), flagKey.lastIndexOf('_'));
      const classId = flagKey.substring(separatorIndex + 1);
      if (!currentClassIds.includes(classId)) this.actor.unsetFlag(MODULE.ID, flagKey);
    }
    log(3, 'Stale flags cleanup completed');
  }

  /**
   * Clean up manager caches and maps for non-existent classes.
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @private
   */
  _cleanupStaleManagers(currentClassIds) {
    if (this.app.wizardManagers) {
      const wizardManagerKeys = [...this.app.wizardManagers.keys()];
      for (const classId of wizardManagerKeys) if (!currentClassIds.includes(classId)) this.app.wizardManagers.delete(classId);
      log(3, 'Cleaned wizard managers', { before: wizardManagerKeys.length, after: this.app.wizardManagers.size });
    }
    if (this.app.ritualManagers) {
      const ritualManagerKeys = [...this.app.ritualManagers.keys()];
      for (const classId of ritualManagerKeys) if (!currentClassIds.includes(classId)) this.app.ritualManagers.delete(classId);
      log(3, 'Cleaned ritual managers', { before: ritualManagerKeys.length, after: this.app.ritualManagers.size });
    }
    if (this.wizardbookCache) {
      const wizardCacheKeys = [...this.wizardbookCache.keys()];
      for (const classId of wizardCacheKeys) if (!currentClassIds.includes(classId)) this.wizardbookCache.delete(classId);
      log(3, 'Cleaned wizardbook cache', { before: wizardCacheKeys.length, after: this.wizardbookCache.size });
    }
    if (this.app._wizardBookImages) {
      const wizardImageKeys = [...this.app._wizardBookImages.keys()];
      for (const classId of wizardImageKeys) if (!currentClassIds.includes(classId)) this.app._wizardBookImages.delete(classId);
      log(3, 'Cleaned wizard book images', { before: wizardImageKeys.length, after: this.app._wizardBookImages.size });
    }
    this._preparationStatsCache.clear();
    this._classDetectionCache.clear();
    log(3, 'Stale managers cleanup completed');
  }

  /**
   * Determine the preparation mode for a given class.
   * @param {Item} classItem - The class item to analyze
   * @todo: Consider using dnd5e.utils.formatIdentifier() when it becomes available
   * @returns {string} The preparation mode ('spell', 'pact', etc.)
   */
  getClassPreparationMode(classItem) {
    let prepMode = 'spell';
    if (classItem.system.spellcasting?.type === 'pact') prepMode = 'pact';
    log(3, 'Preparation mode determined', { className: classItem.name, prepMode });
    return prepMode;
  }

  /**
   * Determine ritual casting rules for a given class.
   * @param {Item} classItem - The class item to analyze
   * @returns {RitualRules} Ritual casting rules for the class
   */
  getClassRitualRules(classItem) {
    const rules = { canCastRituals: false, mustPrepare: false, fromSpellbook: false };
    const identifier = classItem.system?.identifier;
    if (identifier === MODULE.CLASS_IDENTIFIERS.WIZARD) {
      rules.canCastRituals = true;
      rules.mustPrepare = false;
      rules.fromSpellbook = true;
    } else if ([MODULE.CLASS_IDENTIFIERS.CLERIC, MODULE.CLASS_IDENTIFIERS.DRUID, MODULE.CLASS_IDENTIFIERS.BARD].includes(identifier)) {
      rules.canCastRituals = true;
      rules.mustPrepare = true;
    }
    log(3, 'Ritual rules determined', { className: classItem.name, rules });
    return rules;
  }

  /**
   * Determine spell swapping rules for a given class.
   * @param {Item} classItem - The class item to analyze
   * @todo: Consider using dnd5e.utils.formatIdentifier() when it becomes available
   * @returns {SwapRules} Spell swapping rules for the class
   */
  getClassSwapRules(classItem) {
    const identifier = classItem.system?.identifier;
    const rules = { canSwapCantrips: false, cantripSwapMode: 'none', canSwapSpells: false, spellSwapMode: 'none' };
    const classRules = RuleSet.getClassRules(this.actor, identifier);
    rules.canSwapCantrips = classRules.cantripSwapping !== 'none';
    rules.cantripSwapMode = classRules.cantripSwapping || 'none';
    rules.canSwapSpells = classRules.spellSwapping !== 'none';
    rules.spellSwapMode = classRules.spellSwapping || 'none';
    log(3, 'Swap rules determined', { className: classItem.name, rules });
    return rules;
  }

  /**
   * Load spell data for all detected spellcasting classes.
   * @returns {Promise<boolean>} True if spell data loaded successfully, false otherwise
   */
  async loadSpellData() {
    RuleSet.initializeNewClasses(this.actor);
    const wizardClasses = this.getWizardEnabledClasses();
    for (const { identifier } of wizardClasses) {
      const wizardManager = this.app.wizardManagers.get(identifier);
      if (wizardManager) await this.cacheWizardSpellbook(identifier);
    }
    if (Object.keys(this.spellcastingClasses).length === 0) {
      log(2, 'No spellcasting classes found for actor');
      return false;
    }
    this.handleCantripLevelUp();
    log(3, `Loading spell data for ${Object.keys(this.spellcastingClasses).length} spellcasting classes:`, Object.keys(this.spellcastingClasses));
    for (const [identifier, classData] of Object.entries(this.spellcastingClasses)) {
      const classItem = this.actor.items.get(classData.id);
      if (!classItem) {
        log(2, `Could not find class item for ${identifier} with id ${classData.id}`);
        continue;
      }
      log(3, `Processing class ${identifier} (${classItem.name})`);
      if (DataUtils.isClassWizardEnabled(this.actor, identifier)) {
        log(3, `Loading wizard spell data for ${identifier}`);
        await this.loadWizardSpellData(classItem, identifier);
      } else {
        log(3, `Loading regular spell data for ${identifier}`);
        await this.loadClassSpellData(identifier, classItem);
      }
      if (this.classSpellData[identifier]) {
        log(3, `Successfully loaded spell data for ${identifier}: ${this.classSpellData[identifier].spellPreparation.current}/${this.classSpellData[identifier].spellPreparation.maximum}`);
      } else {
        log(2, `FAILED to load spell data for ${identifier} - not in classSpellData!`);
      }
    }
    log(3, 'Final classSpellData keys:', Object.keys(this.classSpellData));
    if (this.activeClass && this.classSpellData[this.activeClass]) {
      this.spellLevels = this.classSpellData[this.activeClass].spellLevels || [];
      this.className = this.classSpellData[this.activeClass].className || '';
      this.spellPreparation = this.classSpellData[this.activeClass].spellPreparation || { current: 0, maximum: 0 };
    }
    this.updateGlobalPreparationCount();
    return true;
  }

  /**
   * Load spell data for a specific regular (non-wizard) class.
   * @param {string} identifier - Identifier of the class
   * @param {Item} classItem - The class item
   * @returns {Promise<void>}
   */
  async loadClassSpellData(identifier, classItem) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    log(3, `Getting spell list for class ${identifier} (${className})`);
    const spellList = await DataUtils.getClassSpellList(className, classUuid, this.actor);
    if (!spellList || !spellList.size) {
      log(2, `No spell list found for class ${identifier} (${className}) - spell list size: ${spellList?.size || 0}`);
      const prepStats = this.calculatePreparationStats(identifier, [], classItem);
      this.classSpellData[identifier] = { spellLevels: [], className: classItem.name, spellPreparation: prepStats, classItem, identifier };
      log(3, `Created empty spell data for ${identifier} with prep stats: ${prepStats.current}/${prepStats.maximum}`);
      return;
    }
    log(3, `Found spell list with ${spellList.size} spells for ${identifier}`);
    let maxSpellLevel = DataUtils.calculateMaxSpellLevel(classItem, this.actor);
    const hideCantrips = this._shouldHideCantrips(identifier);
    if (hideCantrips && maxSpellLevel > 0) maxSpellLevel = Math.max(1, maxSpellLevel);
    const preloadedData = DataUtils.getPreloadedData();
    let spellItems = [];
    if (preloadedData && preloadedData.enrichedSpells.length > 0) {
      log(3, `Using preloaded spell data for ${identifier} class`);
      const preloadedUuidsMap = new Map();
      for (const spell of preloadedData.enrichedSpells) if (spell.system.level <= maxSpellLevel) preloadedUuidsMap.set(spell.uuid, spell);
      const preloadedSpells = [];
      const actuallyMissingSpells = [];
      for (const uuid of spellList) {
        const preloaded = preloadedUuidsMap.get(uuid);
        if (preloaded) preloadedSpells.push(preloaded);
        else actuallyMissingSpells.push(uuid);
      }
      const spellsFilteredByLevel = spellList.size - preloadedSpells.length - actuallyMissingSpells.length;
      if (actuallyMissingSpells.length > 0) {
        log(3, `Found ${preloadedSpells.length} preloaded spells for ${identifier}, loading ${actuallyMissingSpells.length} missing spells (${spellsFilteredByLevel} filtered by level cap)`);
        const additionalSpells = await DataUtils.fetchSpellDocuments(new Set(actuallyMissingSpells), maxSpellLevel);
        spellItems = [...preloadedSpells, ...additionalSpells];
      } else {
        log(3, `All ${preloadedSpells.length} spells for ${identifier} found in preloaded data (${spellsFilteredByLevel} filtered by level cap)`);
        spellItems = preloadedSpells;
      }
    } else spellItems = await DataUtils.fetchSpellDocuments(spellList, maxSpellLevel);
    if (!spellItems || !spellItems.length) return;
    await this.processAndOrganizeSpellsForClass(identifier, spellItems, classItem);
  }

  /**
   * Takes an array of spell items and organizes them by spell level, enriching
   * @param {Array<Object>} spellItems - Array of spell documents
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<Array<SpellLevel>>} Array of level objects, each containing its spells
   * @private
   */
  async _organizeSpellsByLevelForClass(spellItems, classIdentifier) {
    const spellsByLevel = {};
    const processedSpellIds = new Set();
    const targetUserId = DataUtils.getTargetUserId(this.actor);
    const actorId = this.actor?.id;
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const preparableSpells = [];
    const specialModeSpells = [];
    if (this.actor) {
      const actorSpells = this.actor.items.filter((item) => item.type === 'spell');
      const spellDeduplicationMap = new Map();
      for (const spell of actorSpells) {
        if (spell?.system?.level === undefined) continue;
        const spellKey = spell._stats?.compendiumSource || spell.flags?.core?.sourceId || spell.uuid;
        const normalizedKey = UIUtils.getCanonicalSpellUuid(spellKey);
        const sourceClass = spell.system?.sourceClass || spell.sourceClass || classIdentifier;
        const fullKey = `${sourceClass}:${normalizedKey}`;
        if (!spellDeduplicationMap.has(fullKey)) spellDeduplicationMap.set(fullKey, spell);
        else {
          const existing = spellDeduplicationMap.get(fullKey);
          const currentPriority = this._getSpellDisplayPriority(spell);
          const existingPriority = this._getSpellDisplayPriority(existing);
          if (currentPriority > existingPriority) spellDeduplicationMap.set(fullKey, spell);
        }
      }
      for (const spell of spellDeduplicationMap.values()) {
        if (spell?.system?.level === undefined) continue;
        const spellSourceClass = spell.system?.sourceClass || spell.sourceClass;
        if (spellSourceClass && spellSourceClass !== classIdentifier) continue;
        const preparationMode = spell.system.method;
        const isSpecialMode = ['innate', 'atwill'].includes(preparationMode);
        const isAlwaysPrepared = spell.system.prepared === 2;
        const isGranted = !!spell.flags?.dnd5e?.cachedFor;
        const isOnlySpecial = isSpecialMode || isAlwaysPrepared || isGranted;
        if (isOnlySpecial) specialModeSpells.push(spell);
        else preparableSpells.push(spell);
      }
    }
    const batchData = this.app.spellManager.prepareBatchData(classIdentifier);
    const processedPreparableSpells = new Set();
    for (const spell of preparableSpells) {
      const level = spell.system.level;
      const spellKey = spell._stats?.compendiumSource || spell.flags?.core?.sourceId || spell.uuid;
      const normalizedKey = UIUtils.getCanonicalSpellUuid(spellKey);
      if (!processedPreparableSpells.has(normalizedKey)) {
        if (!spellsByLevel[level]) spellsByLevel[level] = { level: level, name: CONFIG.DND5E.spellLevels[level], spells: [] };
        const compendiumUuid = spell._stats?.compendiumSource || spell.flags?.core?.sourceId || spell.uuid;
        const spellData = { ...spell, compendiumUuid: compendiumUuid };
        spellData.sourceClass = classIdentifier;
        spellData.system = spellData.system || {};
        spellData.system.sourceClass = classIdentifier;
        if (spell.system?.method !== 'ritual' && spell.system?.components?.ritual) spellData.canCastAsRitual = true;
        spellData.preparation = this.app.spellManager.getSpellPreparationStatusFromBatch(spellData, classIdentifier, batchData);
        spellData.filterData = UIUtils.extractSpellFilterData(spell);
        spellData.enrichedIcon = UIUtils.createSpellIconLink(spell);
        const enhancedSpell = DataUtils.UserData.enhanceSpellWithUserData(spellData, targetUserId, actorId);
        Object.assign(spellData, enhancedSpell);
        spellsByLevel[level].spells.push(spellData);
        processedPreparableSpells.add(normalizedKey);
        processedSpellIds.add(spell.id || spell.uuid);
      }
    }
    let parsedSpellData = null;
    if (SPELLBOOK?.preloadedData?.enrichedSpells) {
      parsedSpellData = {};
      // eslint-disable-next-line no-unused-vars
      for (const [key, enrichedSpell] of Object.entries(SPELLBOOK.preloadedData.enrichedSpells)) {
        const uuid = enrichedSpell.uuid;
        if (!uuid) continue;
        parsedSpellData[uuid] = {
          notes: enrichedSpell.notes || enrichedSpell.filterData?.notes || '',
          favorited: enrichedSpell.filterData?.favorited || enrichedSpell.favorited || false,
          usageStats: enrichedSpell.usageStats || null,
          actorData: enrichedSpell.actorData || {}
        };
      }
    } else {
      await DataUtils.UserData._ensureUserDataInfrastructure(targetUserId);
      const userPage = await DataUtils.UserData._getUserPage(targetUserId);
      if (userPage) parsedSpellData = DataUtils.UserData._parseSpellDataFromHTML(userPage.text.content);
    }
    const allSpellsToCache = [
      ...preparableSpells.map((s) => s._stats?.compendiumSource || s.flags?.core?.sourceId || s.uuid),
      ...specialModeSpells.map((s) => s._stats?.compendiumSource || s.flags?.core?.sourceId || s.uuid),
      ...spellItems.map((s) => s.uuid || s.compendiumUuid)
    ].filter(Boolean);
    for (const spellUuid of allSpellsToCache) {
      let canonicalUuid = spellUuid;
      if (foundry.utils.parseUuid(spellUuid).primaryType === 'Actor') {
        const spellDoc = fromUuidSync(spellUuid);
        if (spellDoc?._stats?.compendiumSource || spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
      }
      const quickCacheKey = actorId ? `${targetUserId}:${actorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      const originalCacheKey = actorId ? `${targetUserId}:${actorId}:${spellUuid}` : `${targetUserId}:${spellUuid}`;
      if (DataUtils.UserData.cache.has(quickCacheKey) || DataUtils.UserData.cache.has(originalCacheKey)) continue;
      let userData = parsedSpellData?.[canonicalUuid];
      if (!userData && canonicalUuid !== spellUuid) userData = parsedSpellData?.[spellUuid];
      const result = !userData
        ? { notes: '', favorited: false, usageStats: null }
        : actorId && userData.actorData?.[actorId]
          ? { ...userData.actorData[actorId], notes: userData.notes }
          : { notes: userData.notes || '', favorited: false, usageStats: null };
      DataUtils.UserData.cache.set(quickCacheKey, result);
      if (canonicalUuid !== spellUuid) DataUtils.UserData.cache.set(originalCacheKey, result);
    }
    for (const spell of spellItems) {
      if (spell?.system?.level === undefined) continue;
      const level = spell.system.level;
      const spellUuid = spell.uuid || spell.compendiumUuid;
      const normalizedUuid = UIUtils.getCanonicalSpellUuid(spellUuid);
      if (processedPreparableSpells.has(normalizedUuid)) continue;
      if (!spellsByLevel[level]) spellsByLevel[level] = { level: level, name: CONFIG.DND5E.spellLevels[level], spells: [] };
      const spellData = foundry.utils.deepClone(spell);
      let preparedByOtherClass = null;
      for (const [otherClass, preparedSpells] of Object.entries(preparedByClass)) {
        if (otherClass === classIdentifier) continue;
        const otherClassKey = `${otherClass}:${spellUuid}`;
        if (preparedSpells.includes(otherClassKey)) {
          preparedByOtherClass = otherClass;
          break;
        }
      }
      spellData.sourceClass = classIdentifier;
      spellData.system = spellData.system || {};
      spellData.system.sourceClass = classIdentifier;
      if (preparedByOtherClass) {
        spellData.preparation = spellData.preparation || {};
        spellData.preparation.preparedByOtherClass = preparedByOtherClass;
      }
      spellData._preparationContext = 'preparable';
      if (this.app.spellManager) spellData.preparation = this.app.spellManager.getSpellPreparationStatusFromBatch(spellData, classIdentifier, batchData);
      spellData.filterData = UIUtils.extractSpellFilterData(spell);
      spellData.enrichedIcon = UIUtils.createSpellIconLink(spell);
      const enhancedSpell = DataUtils.UserData.enhanceSpellWithUserData(spellData, targetUserId, actorId);
      Object.assign(spellData, enhancedSpell);
      spellsByLevel[level].spells.push(spellData);
      processedSpellIds.add(spell.id || spell.compendiumUuid || spell.uuid);
    }
    for (const spell of specialModeSpells) {
      const level = spell.system.level;
      if (!spellsByLevel[level]) spellsByLevel[level] = { level: level, name: CONFIG.DND5E.spellLevels[level], spells: [] };
      const compendiumUuid = spell._stats?.compendiumSource || spell.flags?.core?.sourceId || spell.uuid;
      const spellData = { ...spell, compendiumUuid: compendiumUuid };
      const sourceClass = spell.system?.sourceClass || spell.sourceClass;
      if (sourceClass) {
        spellData.sourceClass = sourceClass;
        spellData.system = spellData.system || {};
        spellData.system.sourceClass = sourceClass;
      }
      spellData._preparationContext = 'special';
      if (spell.system?.method !== 'ritual' && spell.system?.components?.ritual) spellData.canCastAsRitual = true;
      spellData.preparation = this.app.spellManager.getSpellPreparationStatusFromBatch(spellData, sourceClass || classIdentifier, batchData);
      spellData.filterData = UIUtils.extractSpellFilterData(spell);
      spellData.enrichedIcon = UIUtils.createSpellIconLink(spell);
      const enhancedSpell = DataUtils.UserData.enhanceSpellWithUserData(spellData, targetUserId, actorId);
      Object.assign(spellData, enhancedSpell);
      spellsByLevel[level].spells.push(spellData);
    }
    for (const level in spellsByLevel) if (level in spellsByLevel) spellsByLevel[level].spells.sort((a, b) => a.name.localeCompare(b.name));
    const sortedLevels = Object.entries(spellsByLevel)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([level, data]) => {
        if (!data.spells) {
          log(2, `Missing spells array for level ${level}`, data);
          return {
            level: level,
            name: CONFIG.DND5E.spellLevels[level] || `Level ${level}`,
            spells: []
          };
        }
        return data;
      });
    log(3, `Returning ${sortedLevels.length} levels for ${classIdentifier} with multiple preparation contexts supported`);
    return sortedLevels;
  }

  /**
   * Organize spells specifically for wizard spellbook learning tab.
   * @param {Array<Object>} spellItems - Array of class spell list items ONLY
   * @param {string} classIdentifier - The class identifier
   * @param {Array<string>} personalSpellbook - Spells already learned by wizard
   * @returns {Promise<Array<SpellLevel>>} Array of level objects for wizard spellbook
   * @private
   */
  async _organizeWizardSpellsForLearning(spellItems, classIdentifier, personalSpellbook) {
    const spellsByLevel = {};
    const processedSpellUuids = new Set();
    const targetUserId = DataUtils.getTargetUserId(this.actor);
    const actorId = this.actor?.id;
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    for (const spell of spellItems) {
      if (spell?.system?.level === undefined) continue;
      const spellUuid = spell.uuid || spell.compendiumUuid;
      const level = spell.system.level;
      if (processedSpellUuids.has(spellUuid) || level === 0) continue;
      if (!spellsByLevel[level]) spellsByLevel[level] = { level: level, name: CONFIG.DND5E.spellLevels[level], spells: [] };
      const spellData = foundry.utils.deepClone(spell);
      spellData.compendiumUuid = spellUuid;
      spellData.sourceClass = classIdentifier;
      spellData.isWizardClass = true;
      spellData.inWizardSpellbook = personalSpellbook.includes(spellUuid);
      spellData.canAddToSpellbook = !spellData.inWizardSpellbook && level > 0;
      if (spellData.inWizardSpellbook && wizardManager) spellData.learningSource = await wizardManager.getSpellLearningSource(spellUuid);
      spellData.preparation = {
        prepared: false,
        isOwned: false,
        preparationMode: null,
        disabled: true,
        alwaysPrepared: false,
        sourceItem: null,
        isGranted: false,
        localizedPreparationMode: '',
        isCantripLocked: false,
        disabledReason: '',
        _isWizardLearning: true
      };
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
   * Get display priority for spell deduplication.
   * @param {Object} spell - The spell item
   * @returns {number} Priority value (higher = more important to display)
   * @private
   */
  _getSpellDisplayPriority(spell) {
    const method = spell.system?.method;
    const prepared = spell.system?.prepared;
    let priority = 30;
    if (prepared === 1) priority = 100;
    else if (prepared === 2) priority = 90;
    else if (['innate', 'pact', 'atwill'].includes(method)) priority = 50;
    else if (method === 'ritual') priority = 10;
    log(3, 'Spell display priority calculated', { spellName: spell.name, method, prepared, priority });
    return priority;
  }

  /**
   * Process and organize spells for a specific class with preparation statistics.
   * @param {string} identifier - Identifier of the class
   * @param {Array<Object>} spellItems - Array of spell items
   * @param {Item} classItem - The class item
   * @returns {Promise<void>}
   */
  async processAndOrganizeSpellsForClass(identifier, spellItems, classItem) {
    for (const spell of spellItems) {
      const preparationMode = spell.system.method;
      const isSpecialMode = ['innate', 'pact', 'atwill', 'always'].includes(preparationMode);
      const isGranted = !!spell.flags?.dnd5e?.cachedFor;
      if (!isSpecialMode && !isGranted) {
        spell.sourceClass = identifier;
        if (spell.system && !spell.system.sourceClass) spell.system.sourceClass = identifier;
      }
    }
    const spellLevels = await this._organizeSpellsByLevelForClass(spellItems, identifier);
    const allSpells = spellLevels.flatMap((level) => level.spells);
    const prepStats = this.calculatePreparationStats(identifier, allSpells, classItem);
    this.classSpellData[identifier] = { spellLevels, className: classItem.name, spellPreparation: prepStats, classItem, identifier };
    if (this._shouldHideCantrips(identifier)) this.classSpellData[identifier].spellLevels = spellLevels.filter((levelData) => levelData.level !== '0' && levelData.level !== 0);
    log(3, 'Spells processed and organized', { identifier, levelCount: this.classSpellData[identifier].spellLevels.length, prepStats });
  }

  /**
   * Calculate preparation statistics for a specific class.
   * @param {string} classIdentifier - The class identifier
   * @param {Array} spellLevels - Array of level objects with grouped spells or flat spell array
   * @param {Item} classItem - The spellcasting class item
   * @returns {PreparationStats} Preparation stats object with current and maximum counts
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
          const prepared = spell.system?.prepared;
          const method = spell.system?.method;
          const sourceClass = spell.sourceClass;
          const cachedFor = spell.flags?.dnd5e?.cachedFor;
          if (prepared === 2) continue;
          if (['innate', 'atwill', 'pact'].includes(method)) continue;
          if (cachedFor) continue;
          if (prepared === 1 && sourceClass === classIdentifier) preparedCount++;
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
        const prepared = spell.system?.prepared;
        const method = spell.system?.method;
        const sourceClass = spell.sourceClass;
        const cachedFor = spell.flags?.dnd5e?.cachedFor;
        if (prepared === 2) continue;
        if (['innate', 'atwill', 'pact'].includes(method)) continue;
        if (cachedFor) continue;
        if (prepared === 1 && sourceClass === classIdentifier) preparedCount++;
      }
    } else log(1, 'calculatePreparationStats: Unknown structure for spellLevels', spellLevels);
    let baseMaxPrepared = 0;
    const spellcastingConfig = this.getSpellcastingConfigForClass(classIdentifier);
    if (spellcastingConfig?.preparation?.max) baseMaxPrepared = spellcastingConfig.preparation.max;
    else baseMaxPrepared = classItem?.system?.spellcasting?.preparation?.max || 0;
    const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
    const preparationBonus = classRules?.spellPreparationBonus || 0;
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
        const classRules = RuleSet.getClassRules(this.actor, classId);
        return classRules.cantripSwapping === 'levelUp';
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
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (wizardManager && wizardManager.isWizard) {
      if (!this.wizardbookCache) this.wizardbookCache = new Map();
      const spells = await wizardManager.getSpellbookSpells();
      this.wizardbookCache.set(classIdentifier, spells);
      log(3, 'Wizard spellbook cached', { classIdentifier, spellCount: spells.length });
    } else log(2, `No wizard manager found for class ${classIdentifier} during cache`);
  }

  /**
   * Load wizard spell data for a specific wizard-enabled class.
   * @param {Item} classItem - The class item
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async loadWizardSpellData(classItem, classIdentifier) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    const maxSpellLevel = DataUtils.calculateMaxSpellLevel(classItem, this.actor);
    const fullSpellList = await DataUtils.getClassSpellList(className, classUuid, this.actor);
    if (!fullSpellList || !fullSpellList.size) return;
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (!wizardManager || !wizardManager.isWizard) return;
    const personalSpellbook = await wizardManager.getSpellbookSpells();
    if (!this._fullWizardSpellLists) this._fullWizardSpellLists = new Map();
    this._fullWizardSpellLists.set(classIdentifier, new Set(fullSpellList));
    const allUuids = new Set([...fullSpellList, ...personalSpellbook]);
    const effectiveMaxLevel = Math.max(1, maxSpellLevel);
    const preloadedData = DataUtils.getPreloadedData();
    let spellItems = [];
    if (preloadedData && preloadedData.enrichedSpells.length > 0) {
      log(3, `Using preloaded spell data for ${classIdentifier} wizard spells`);
      // Build a map of preloaded spells that are within the level cap
      const preloadedUuidsMap = new Map();
      for (const spell of preloadedData.enrichedSpells) {
        if (spell.system.level <= effectiveMaxLevel) {
          preloadedUuidsMap.set(spell.uuid, spell);
        }
      }
      // Collect preloaded spells and identify actually missing ones
      const preloadedSpells = [];
      const actuallyMissingSpells = [];
      for (const uuid of allUuids) {
        const preloaded = preloadedUuidsMap.get(uuid);
        if (preloaded) preloadedSpells.push(preloaded);
        else actuallyMissingSpells.push(uuid);
      }
      const spellsFilteredByLevel = allUuids.size - preloadedSpells.length - actuallyMissingSpells.length;
      if (actuallyMissingSpells.length > 0) {
        log(
          3,
          `Found ${preloadedSpells.length} preloaded wizard spells for ${classIdentifier}, loading ${actuallyMissingSpells.length} missing spells (${spellsFilteredByLevel} filtered by level cap)`
        );
        const additionalSpells = await DataUtils.fetchSpellDocuments(new Set(actuallyMissingSpells), effectiveMaxLevel);
        spellItems = [...preloadedSpells, ...additionalSpells];
      } else {
        log(3, `All ${preloadedSpells.length} wizard spells for ${classIdentifier} found in preloaded data (${spellsFilteredByLevel} filtered by level cap)`);
        spellItems = preloadedSpells;
      }
    } else spellItems = await DataUtils.fetchSpellDocuments(allUuids, effectiveMaxLevel);
    if (!spellItems || !spellItems.length) {
      log(1, `No spell items found for wizard ${classIdentifier}`);
      return;
    }
    await this.processWizardSpells(spellItems, classItem, personalSpellbook, classIdentifier);
    const wizardTabId = `wizardbook-${classIdentifier}`;
    if (!this.tabData[wizardTabId]) {
      log(1, `Failed to create wizard tab data for ${classIdentifier}.`);
    } else {
      const tabData = this.tabData[wizardTabId];
      log(3, `Wizard tab data successfully created for ${classIdentifier}: ${tabData.spellLevels?.length || 0} spell levels`);
    }
  }

  /**
   * Process wizard spells for a specific class into preparation and spellbook tabs.
   * @param {Array<Object>} allSpellItems - All fetched spell items
   * @param {Item} classItem - The class item
   * @param {Array<string>} personalSpellbook - The personal spellbook spell UUIDs
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async processWizardSpells(allSpellItems, classItem, personalSpellbook, classIdentifier) {
    const spellsTabId = `${classIdentifier}Tab`;
    const wizardTabId = `wizardbook-${classIdentifier}`;
    const shouldHideCantrips = this._shouldHideCantrips(classIdentifier);
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (!wizardManager) return;
    const getSpellUuids = (spell) => {
      const uuids = [];
      if (spell?.compendiumUuid) uuids.push(spell.compendiumUuid);
      if (spell?.spellUuid) uuids.push(spell.spellUuid);
      if (spell?.uuid) uuids.push(spell.uuid);
      if (spell?._stats?.compendiumSource) uuids.push(spell._stats.compendiumSource);
      if (spell?.flags?.core?.sourceId) uuids.push(spell.flags.core.sourceId);
      return uuids;
    };
    const isSpellInCollection = (spell, collection) => {
      const spellUuids = getSpellUuids(spell);
      return spellUuids.some((uuid) => {
        if (Array.isArray(collection)) return collection.includes(uuid);
        else if (collection && collection.has) return collection.has(uuid);
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
    this.scrollSpells = await DataUtils.ScrollProcessor.scanForScrollSpells(this.actor);
    const grantedSpells = this.actor.items
      .filter((i) => i.type === 'spell' && (i.flags?.dnd5e?.cachedFor || (i.system?.method && ['pact', 'innate', 'atwill'].includes(i.system.method))))
      .flatMap((i) => {
        const uuids = [];
        if (i?._stats?.compendiumSource) uuids.push(i._stats.compendiumSource);
        if (i?.flags?.core?.sourceId) uuids.push(i.flags.core.sourceId);
        if (i?.uuid) uuids.push(i.uuid);
        if (i?.compendiumUuid) uuids.push(i.compendiumUuid);
        if (i?.spellUuid) uuids.push(i.spellUuid);
        return uuids;
      })
      .filter(Boolean);
    const prepTabSpells = allSpellItems.filter((spell) => {
      const isCantrip = spell.system.level === 0;
      const isNonCantrip = spell.system.level !== 0;
      const inPersonalSpellbook = isSpellInCollection(spell, personalSpellbook);
      const inGrantedSpells = isSpellInCollection(spell, grantedSpells);
      const shouldInclude = (!shouldHideCantrips && isCantrip) || (isNonCantrip && (inPersonalSpellbook || inGrantedSpells));
      return shouldInclude;
    });
    for (const spell of prepTabSpells) spell.sourceClass = classIdentifier;
    const prepLevelsGrouped = await this._organizeSpellsByLevelForClass(prepTabSpells, classIdentifier);
    let finalPrepLevels = prepLevelsGrouped;
    if (shouldHideCantrips) finalPrepLevels = prepLevelsGrouped.filter((levelData) => levelData.level !== '0' && levelData.level !== 0);
    const fullWizardSpellList = this._fullWizardSpellLists.get(classIdentifier);
    const classSpellsOnly = allSpellItems.filter((spell) => {
      const isNonCantrip = spell.system.level !== 0;
      const inFullWizardList = fullWizardSpellList && isSpellInCollection(spell, fullWizardSpellList);
      return isNonCantrip && inFullWizardList;
    });
    const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${classIdentifier}`;
    const copiedSpellsMetadata = this.actor.getFlag(MODULE.ID, copiedSpellsFlag) || [];
    const scrollLearnedEntries = copiedSpellsMetadata.filter((metadata) => metadata.fromScroll === true);
    const scrollLearnedUuids = scrollLearnedEntries.map((metadata) => metadata.spellUuid);
    let scrollLearnedSpells = [];
    if (scrollLearnedUuids.length > 0) {
      log(3, `Fetching ${scrollLearnedUuids.length} scroll-learned spells for ${classIdentifier} (max level: ${maxSpellLevel})`);
      scrollLearnedSpells = await DataUtils.fetchSpellDocuments(new Set(scrollLearnedUuids), maxSpellLevel);
      log(
        3,
        `Fetched ${scrollLearnedSpells.length} scroll-learned spell documents:`,
        scrollLearnedSpells.map((s) => s.name)
      );
      for (const spell of scrollLearnedSpells) {
        const spellUuids = getSpellUuids(spell);
        for (const entry of scrollLearnedEntries) {
          if (spellUuids.includes(entry.spellUuid)) {
            spell.learnedFromScroll = true;
            spell.scrollLearningMetadata = {
              dateCopied: entry.dateCopied,
              cost: entry.cost,
              timeSpent: entry.timeSpent
            };
            log(3, `Matched scroll-learned spell: ${spell.name}`);
            break;
          }
        }
      }
    }
    const allWizardbookSpells = [...classSpellsOnly, ...scrollLearnedSpells];
    log(3, `Total wizardbook spells for ${classIdentifier}: ${allWizardbookSpells.length} (${classSpellsOnly.length} class + ${scrollLearnedSpells.length} scroll)`);
    const wizardLevelsGrouped = await this._organizeWizardSpellsForLearning(allWizardbookSpells, classIdentifier, personalSpellbook);
    const scrollSpellsForLevel = [];
    for (const scrollSpell of this.scrollSpells) {
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
        if (this.app && this.app.comparisonSpells) {
          const comparisonMax = game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX);
          if (this.app.comparisonSpells.size < comparisonMax) {
            spell.showCompareLink = true;
            spell.isInComparison = this.app.comparisonSpells.has(spell.compendiumUuid || spell.spellUuid);
          }
        }
      }
    }
    const prepStats = this.calculatePreparationStats(classIdentifier, finalPrepLevels, classItem);
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
    this.classSpellData[classIdentifier] = { spellLevels: finalPrepLevels, className: classItem.name, spellPreparation: prepStats, classItem, tabData, identifier: classIdentifier };
    Object.assign(this.tabData, tabData);
    log(3, `Processed wizard spells for ${classIdentifier}: Prep tab has ${finalPrepLevels.length} levels, Wizard tab has ${filteredWizardLevelsGrouped.length} levels`);
  }

  /**
   * Enrich wizard tab spells with additional wizard-specific data.
   * @param {Array<SpellLevel>} spellLevelsGrouped - Grouped spell levels array
   * @param {Array<string>} personalSpellbook - The personal spellbook spell UUIDs
   * @param {boolean} [isWizardBook=false] - Whether this is for the wizard spellbook tab
   * @param {boolean} [isAtMaxSpells=false] - Whether maximum spells are reached
   * @returns {void}
   */
  enrichWizardBookSpells(spellLevelsGrouped, personalSpellbook, isWizardBook = false, isAtMaxSpells = false) {
    for (const levelData of spellLevelsGrouped) {
      for (const spell of levelData.spells) {
        spell.isWizardClass = true;
        spell.inWizardSpellbook = personalSpellbook.includes(spell.compendiumUuid || spell.spellUuid);
        if (this.app && this.app.comparisonSpells) {
          const comparisonMax = game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX);
          if (this.app.comparisonSpells.size < comparisonMax) {
            spell.showCompareLink = true;
            spell.isInComparison = this.app.comparisonSpells.has(spell.compendiumUuid || spell.spellUuid);
          }
        }
        if (isWizardBook) {
          spell.canAddToSpellbook = !spell.inWizardSpellbook && spell.system.level > 0;
          spell.isAtMaxSpells = isAtMaxSpells;
          if (spell.learnedFromScroll && spell.scrollLearningMetadata) {
            spell.wasLearnedFromScroll = true;
            spell.scrollLearningInfo = spell.scrollLearningMetadata;
            spell.canLearnFromScroll = false;
            spell.canAddToSpellbook = false;
          }
          if (spell.isFromScroll) {
            spell.canLearnFromScroll = !spell.inWizardSpellbook;
            spell.scrollMetadata = {
              scrollId: spell.scrollId,
              scrollName: spell.scrollName
            };
          }
        }
        if (!spell.enrichedIcon) spell.enrichedIcon = UIUtils.createSpellIconLink(spell);
      }
    }
    log(3, 'Wizard book spells enriched', { levelCount: spellLevelsGrouped.length, isWizardBook, isAtMaxSpells });
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
   * @returns {Object|null} Tab data for the class, or null if not found
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
    if (DataUtils.isClassWizardEnabled(this.actor, classIdentifier)) {
      log(3, 'Refreshing wizard spell data', { classIdentifier });
      await this.cacheWizardSpellbook(classIdentifier);
      await this.loadWizardSpellData(classItem, classIdentifier);
    } else {
      log(3, 'Refreshing regular spell data', { classIdentifier });
      await this.loadClassSpellData(classIdentifier, classItem);
    }
    this.updateGlobalPreparationCount();
  }

  /**
   * Handle post-processing after spell save operations.
   * @param {Actor} actor - The actor
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
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   */
  async addMissingRitualSpells(spellDataByClass) {
    await this._cleanupDisabledRitualSpells();
    for (const [classIdentifier, classData] of Object.entries(this.spellcastingClasses)) {
      const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
      if (classRules.ritualCasting === 'always') {
        log(3, 'Processing ritual spells for class', { classIdentifier });
        const wizardManager = this.app.wizardManagers.get(classIdentifier);
        const isWizard = wizardManager?.isWizard;
        if (isWizard) await this._addWizardRitualSpells(classIdentifier, spellDataByClass);
        else await this._addClassRitualSpells(classIdentifier, classData, spellDataByClass);
      }
    }
    log(3, 'Missing ritual spells added');
  }

  /**
   * Clean up module-created ritual spells for classes that no longer support ritual casting.
   * @returns {Promise<void>}
   * @private
   */
  async _cleanupDisabledRitualSpells() {
    const spellIdsToRemove = [];
    for (const classIdentifier of Object.keys(this.spellcastingClasses)) {
      const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
      if (classRules.ritualCasting !== 'always') {
        const moduleRitualSpells = this.actor.items.filter(
          (item) =>
            item.type === 'spell' &&
            item.system?.method === 'ritual' &&
            (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier) &&
            item.flags?.[MODULE.ID]?.isModuleRitual === true
        );
        if (moduleRitualSpells.length > 0) {
          log(3, 'Found ritual spells to remove for class', { classIdentifier, count: moduleRitualSpells.length });
          moduleRitualSpells.forEach((spell) => {
            spellIdsToRemove.push(spell.id);
          });
        }
      }
    }
    if (spellIdsToRemove.length > 0) {
      log(3, 'Removing disabled ritual spells', { count: spellIdsToRemove.length });
      await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    } else log(3, 'No disabled ritual spells to remove');
  }

  /**
   * Add missing wizard ritual spells using wizard spellbook.
   * @param {string} classIdentifier - The class identifier (should be 'wizard')
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   * @private
   */
  async _addWizardRitualSpells(classIdentifier, spellDataByClass) {
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (!wizardManager || !wizardManager.isWizard) {
      log(2, 'No wizard manager found for adding ritual spells', { classIdentifier });
      return;
    }
    const spellbookSpells = await wizardManager.getSpellbookSpells();
    const isRitualSpell = (spell) => {
      if (spell.system?.properties && spell.system.properties.has) return spell.system.properties.has('ritual');
      if (spell.system?.properties && Array.isArray(spell.system.properties)) return spell.system.properties.some((prop) => prop.value === 'ritual');
      return spell.system?.components?.ritual || false;
    };
    for (const spellUuid of spellbookSpells) {
      const sourceSpell = await fromUuid(spellUuid);
      if (!sourceSpell || !isRitualSpell(sourceSpell) || sourceSpell.system.level === 0) continue;
      if (!spellDataByClass[classIdentifier]) continue;
      const classSpellKey = `${classIdentifier}:${spellUuid}`;
      if (spellDataByClass[classIdentifier][classSpellKey]) {
        spellDataByClass[classIdentifier][classSpellKey].isRitual = true;
      }
    }
    log(3, 'Wizard ritual spells added', { classIdentifier });
  }

  /**
   * Add missing ritual spells for non-wizard classes using class spell lists.
   * @param {string} classIdentifier - The class identifier
   * @param {SpellcastingClassData} classData - The class data from spellcastingClasses
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   * @todo Simplify this logic here.
   * @private
   */
  async _addClassRitualSpells(classIdentifier, classData, spellDataByClass) {
    const className = classData.name.toLowerCase();
    const classUuid = classData.uuid;
    const spellList = await DataUtils.getClassSpellList(className, classUuid, this.actor);
    if (!spellList || !spellList.size) return;
    const spellItems = await DataUtils.fetchSpellDocuments(spellList, 9);
    if (!spellItems || !spellItems.length) return;
    const isRitualSpell = (spell) => {
      if (spell.system?.properties && spell.system.properties.has) return spell.system.properties.has('ritual');
      if (spell.system?.properties && Array.isArray(spell.system.properties)) return spell.system.properties.some((prop) => prop.value === 'ritual');
      return spell.system?.components?.ritual || false;
    };
    for (const spell of spellItems) {
      const spellUuid = spell.compendiumUuid || spell.uuid;
      const hasRitual = isRitualSpell(spell);
      if (!hasRitual || spell.system?.level === 0) continue;
      if (!spellDataByClass[classIdentifier]) continue;
      const classSpellKey = `${classIdentifier}:${spellUuid}`;
      if (spellDataByClass[classIdentifier][classSpellKey]) spellDataByClass[classIdentifier][classSpellKey].isRitual = true;
    }
    log(3, 'Class ritual spells added', { classIdentifier });
  }

  /**
   * Get scroll-learned spells that aren't in the class spell list.
   * @param {string} classIdentifier - The class identifier
   * @param {Array<string>} personalSpellbook - UUIDs of spells in personal spellbook
   * @param {Set<string>} classSpellListUuids - UUIDs of spells in the class list
   * @returns {Promise<Array<Item5e>>} Array of scroll-learned spell documents
   * @private
   */
  async _getScrollLearnedSpellsNotInClassList(classIdentifier, personalSpellbook, classSpellListUuids) {
    const copiedSpellsFlag = `${FLAGS.WIZARD_COPIED_SPELLS}_${classIdentifier}`;
    const copiedSpells = this.actor.getFlag(MODULE.ID, copiedSpellsFlag) || [];
    const scrollLearnedUuids = copiedSpells.map((metadata) => metadata.spellUuid).filter((uuid) => personalSpellbook.includes(uuid) && !classSpellListUuids.has(uuid));
    if (scrollLearnedUuids.length === 0) return [];
    log(3, 'Found scroll-learned spells not in class list', { classIdentifier, count: scrollLearnedUuids.length });
    const spellDocuments = await DataUtils.fetchSpellDocuments(new Set(scrollLearnedUuids));
    for (const spell of spellDocuments) {
      const metadata = copiedSpells.find((m) => m.spellUuid === spell.uuid);
      if (metadata) {
        spell.learnedFromScroll = true;
        spell.scrollLearningMetadata = {
          dateCopied: metadata.dateCopied,
          cost: metadata.cost,
          timeSpent: metadata.timeSpent
        };
      }
    }
    log(3, 'Scroll-learned spells retrieved', { classIdentifier, count: spellDocuments.length });
    return spellDocuments;
  }

  /**
   * Send GM notifications if needed for rule violations.
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @param {Object} allChangesByClass - All spell and cantrip changes by class
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
        const userDataPromises = classData.spellLevels.map((spell) => DataUtils.UserData.getUserDataForSpell(spell.uuid || spell.compendiumUuid, targetUserId, this.app.actor?.id));
        await Promise.all(userDataPromises);
        for (const spell of classData.spellLevels) {
          const enhancedSpell = DataUtils.UserData.enhanceSpellWithUserData(spell, targetUserId, this.app.actor?.id);
          Object.assign(spell, enhancedSpell);
        }
      }
    }
    log(3, 'Spell enhancements refreshed');
  }

  /**
   * Get the current spell list for the active class.
   * @returns {Array<SpellLevel>} Array of spells for the currently active class
   */
  getCurrentSpellList() {
    if (!this.activeClass || !this.classSpellData[this.activeClass]) return [];
    const spellLevels = this.classSpellData[this.activeClass].spellLevels;
    log(3, 'Current spell list retrieved', { activeClass: this.activeClass, levelCount: spellLevels.length });
    return spellLevels;
  }
}
