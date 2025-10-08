/**
 * Spell Book State Management
 *
 * State management system for the Spell Book application. This class handles
 * all aspects of spell data loading, organization, caching, and state management including
 * spellcasting class detection, spell preparation tracking, wizard spellbook management,
 * and ritual casting functionality.
 *
 * Key responsibilities:
 * - Spellcasting class detection and initialization
 * - Spell data loading and organization by class and level
 * - Preparation statistics calculation and caching
 * - Wizard spellbook management and integration
 * - Ritual spell handling and automatic addition
 * - Long rest mechanics and swap tracking
 * - State synchronization and cache management
 *
 * @module State/SpellbookState
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from '../managers/_module.mjs';
import * as UIHelpers from '../ui/_module.mjs';

/**
 * Spell preparation statistics for a class.
 *
 * @typedef {Object} PreparationStats
 * @property {number} current - Number of currently prepared spells
 * @property {number} maximum - Maximum number of spells that can be prepared
 */

/**
 * Spellcasting class data structure.
 *
 * @typedef {Object} SpellcastingClassData
 * @property {string} name - Display name of the class
 * @property {string} uuid - UUID of the class item
 * @property {string} id - ID of the class item
 * @property {Object} spellcasting - Spellcasting configuration from class
 * @property {string} img - Image path for the class
 */

/**
 * Organized spell data for a class.
 *
 * @typedef {Object} ClassSpellData
 * @property {Array<SpellLevel>} spellLevels - Array of spell levels with organized spells
 * @property {string} className - Display name of the class
 * @property {PreparationStats} spellPreparation - Preparation statistics
 * @property {Item} classItem - The class item reference
 * @property {string} [identifier] - Class identifier
 * @property {Object} [tabData] - Additional tab data for wizard classes
 */

/**
 * Spell level organization structure.
 *
 * @typedef {Object} SpellLevel
 * @property {number|string} level - Spell level (0-9, or 'scroll' for scrolls)
 * @property {string} name - Display name for the spell level
 * @property {Array<EnhancedSpell>} spells - Array of spells for this level
 */

/**
 * Enhanced spell data with preparation and UI information.
 *
 * @typedef {Object} EnhancedSpell
 * @property {string} uuid - Spell UUID
 * @property {string} name - Spell name
 * @property {Object} system - D&D 5e system data
 * @property {string} sourceClass - Identifier of the source class
 * @property {Object} preparation - Preparation status information
 * @property {Object} filterData - Extracted filter data for UI
 * @property {string} enrichedIcon - HTML icon link
 * @property {boolean} [isWizardClass] - Whether this is from a wizard class
 * @property {boolean} [inWizardSpellbook] - Whether spell is in wizard's personal spellbook
 * @property {boolean} [canAddToSpellbook] - Whether spell can be added to spellbook
 * @property {boolean} [isFromScroll] - Whether spell comes from a scroll
 * @property {Object} [scrollMetadata] - Scroll-specific metadata
 */

/**
 * Ritual casting rules for a class.
 *
 * @typedef {Object} RitualRules
 * @property {boolean} canCastRituals - Whether the class can cast ritual spells
 * @property {boolean} mustPrepare - Whether rituals must be prepared to cast
 * @property {boolean} fromSpellbook - Whether rituals can be cast from spellbook (wizard)
 */

/**
 * Spell swapping rules for a class.
 *
 * @typedef {Object} SwapRules
 * @property {boolean} canSwapCantrips - Whether cantrips can be swapped
 * @property {string} cantripSwapMode - When cantrips can be swapped ('none', 'levelUp', 'longRest')
 * @property {boolean} canSwapSpells - Whether spells can be swapped
 * @property {string} spellSwapMode - When spells can be swapped ('none', 'levelUp', 'longRest')
 */

/**
 * Wizard tab data structure for wizard-enabled classes.
 *
 * @typedef {Object} WizardTabData
 * @property {Array<SpellLevel>} spellLevels - Organized spell levels for wizard tab
 * @property {PreparationStats} spellPreparation - Preparation statistics
 * @property {number} wizardTotalSpellbookCount - Total spells in personal spellbook
 * @property {number} wizardFreeSpellbookCount - Total free spells available
 * @property {number} wizardRemainingFreeSpells - Remaining free spells to learn
 * @property {boolean} wizardHasFreeSpells - Whether free spells are available
 * @property {number} wizardMaxSpellbookCount - Maximum spells allowed in spellbook
 * @property {boolean} wizardIsAtMax - Whether spellbook is at maximum capacity
 */

/**
 * Manages state for the Spell Book application with cached calculations.
 *
 * This class provides state management for the Spell Book application,
 * handling spell data loading, organization, caching, and synchronization. It manages
 * spellcasting classes, preparation tracking, wizard mechanics, and provides optimized
 * access to spell information through intelligent caching.
 *
 * The state manager automatically detects spellcasting classes, loads appropriate spell
 * lists, handles wizard spellbook integration, manages preparation statistics, and
 * provides enhanced spell data with UI-ready information.
 */
export class SpellbookState {
  /**
   * Create a new State manager for a Spell Book application.
   *
   * Initializes the state management system with empty caches and default values.
   * The state manager will be populated during the initialization process.
   *
   * @param {SpellBook} app - Spell Book application instance
   */
  constructor(app) {
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
    this.wizardSpellbookCache = null;
  }

  /**
   * Initialize state manager and load all spell data.
   *
   * Performs complete initialization of the state management system including
   * spellcasting class detection, spell data loading, wizard integration,
   * and cache population. This method is idempotent and can be called multiple times.
   *
   * @returns {Promise<boolean>} True if initialization successful, false otherwise
   */
  async initialize() {
    if (this._initialized) return true;
    log(3, 'Starting Spell Book state initialization');
    this.isLongRest = !this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
    if (!this._classesDetected) this.detectSpellcastingClasses();
    await this.app.spellManager.cleanupStalePreparationFlags();
    await this.loadSpellData();
    const wizardClasses = DataHelpers.getWizardEnabledClasses(this.actor);
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
   *
   * Scans the actor's class items to identify spellcasting capabilities and
   * initializes the corresponding data structures. Also performs cleanup of
   * stale data from classes that no longer exist on the actor.
   *
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
  }

  /**
   * Clean up all stored data for class identifiers that don't match current actor classes.
   *
   * Removes flags, manager caches, and other stored data for classes that no longer
   * exist on the actor to prevent data corruption and memory leaks.
   *
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @private
   */
  _cleanupStaleClassData(currentClassIds) {
    this._cleanupStaleFlags(currentClassIds);
    this._cleanupStaleManagers(currentClassIds);
  }

  /**
   * Clean up all flag-based data for non-existent classes.
   *
   * Removes actor flags related to classes that are no longer present on the actor.
   * This includes class rules, prepared spells, swap tracking, and wizard-specific flags.
   *
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
  }

  /**
   * Clean up manager caches and maps for non-existent classes.
   *
   * Removes cached data from various manager instances and application caches
   * for classes that no longer exist on the actor.
   *
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @private
   */
  _cleanupStaleManagers(currentClassIds) {
    if (this.app.wizardManagers) {
      const wizardManagerKeys = [...this.app.wizardManagers.keys()];
      for (const classId of wizardManagerKeys) if (!currentClassIds.includes(classId)) this.app.wizardManagers.delete(classId);
    }
    if (this.app.ritualManagers) {
      const ritualManagerKeys = [...this.app.ritualManagers.keys()];
      for (const classId of ritualManagerKeys) if (!currentClassIds.includes(classId)) this.app.ritualManagers.delete(classId);
    }
    if (this.wizardSpellbookCache) {
      const wizardCacheKeys = [...this.wizardSpellbookCache.keys()];
      for (const classId of wizardCacheKeys) if (!currentClassIds.includes(classId)) this.wizardSpellbookCache.delete(classId);
    }
    if (this.app._wizardBookImages) {
      const wizardImageKeys = [...this.app._wizardBookImages.keys()];
      for (const classId of wizardImageKeys) if (!currentClassIds.includes(classId)) this.app._wizardBookImages.delete(classId);
    }
    this._preparationStatsCache.clear();
    this._classDetectionCache.clear();
  }

  /**
   * Determine the preparation mode for a given class.
   *
   * Analyzes the class configuration to determine how spells are prepared
   * or managed for this class type.
   *
   * @param {Item} classItem - The class item to analyze
   * @returns {string} The preparation mode ('spell', 'pact', etc.)
   */
  getClassPreparationMode(classItem) {
    let prepMode = 'spell';
    if (classItem.system.spellcasting?.type === 'pact') prepMode = 'pact';
    return prepMode;
  }

  /**
   * Determine ritual casting rules for a given class.
   *
   * Analyzes the class to determine what ritual casting capabilities it has,
   * including whether rituals must be prepared and if they can be cast from
   * a spellbook (wizard-specific).
   *
   * @param {Item} classItem - The class item to analyze
   * @returns {RitualRules} Ritual casting rules for the class
   */
  getClassRitualRules(classItem) {
    const rules = { canCastRituals: false, mustPrepare: false, fromSpellbook: false };
    const identifier = classItem.system?.identifier?.toLowerCase() || '';
    if (identifier === MODULE.CLASS_IDENTIFIERS.WIZARD) {
      rules.canCastRituals = true;
      rules.mustPrepare = false;
      rules.fromSpellbook = true;
    } else if ([MODULE.CLASS_IDENTIFIERS.CLERIC, MODULE.CLASS_IDENTIFIERS.DRUID, MODULE.CLASS_IDENTIFIERS.BARD].includes(identifier)) {
      rules.canCastRituals = true;
      rules.mustPrepare = true;
    }
    return rules;
  }

  /**
   * Determine spell swapping rules for a given class.
   *
   * Analyzes the class and current rule set to determine when and how
   * spells and cantrips can be swapped for this class.
   *
   * @param {Item} classItem - The class item to analyze
   * @returns {SwapRules} Spell swapping rules for the class
   */
  getClassSwapRules(classItem) {
    const identifier = classItem.system?.identifier?.toLowerCase() || '';
    const rules = { canSwapCantrips: false, cantripSwapMode: 'none', canSwapSpells: false, spellSwapMode: 'none' };
    const classRules = RuleSetManager.getClassRules(this.actor, identifier);
    rules.canSwapCantrips = classRules.cantripSwapping !== 'none';
    rules.cantripSwapMode = classRules.cantripSwapping || 'none';
    rules.canSwapSpells = classRules.spellSwapping !== 'none';
    rules.spellSwapMode = classRules.spellSwapping || 'none';
    return rules;
  }

  /**
   * Load spell data for all detected spellcasting classes.
   *
   * Orchestrates the loading of spell data for all spellcasting classes on the actor.
   * Handles both regular classes and wizard-enabled classes with their special mechanics.
   * Updates global preparation counts and handles cantrip level-up notifications.
   *
   * @returns {Promise<boolean>} True if spell data loaded successfully, false otherwise
   */
  async loadSpellData() {
    RuleSetManager.initializeNewClasses(this.actor);
    const wizardClasses = DataHelpers.getWizardEnabledClasses(this.actor);
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
      if (DataHelpers.isClassWizardEnabled(this.actor, identifier)) {
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
   *
   * Loads the spell list for a class, fetches spell documents, and organizes
   * them into the appropriate data structure with preparation statistics.
   *
   * @param {string} identifier - Identifier of the class
   * @param {Item} classItem - The class item
   * @returns {Promise<void>}
   */
  async loadClassSpellData(identifier, classItem) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    log(3, `Getting spell list for class ${identifier} (${className})`);
    const spellList = await DataHelpers.getClassSpellList(className, classUuid, this.actor);
    if (!spellList || !spellList.size) {
      log(2, `No spell list found for class ${identifier} (${className}) - spell list size: ${spellList?.size || 0}`);
      const prepStats = this.calculatePreparationStats(identifier, [], classItem);
      this.classSpellData[identifier] = {
        spellLevels: [],
        className: classItem.name,
        spellPreparation: prepStats,
        classItem,
        identifier
      };
      log(3, `Created empty spell data for ${identifier} with prep stats: ${prepStats.current}/${prepStats.maximum}`);
      return;
    }
    log(3, `Found spell list with ${spellList.size} spells for ${identifier}`);
    let maxSpellLevel = DataHelpers.calculateMaxSpellLevel(classItem, this.actor);
    const hideCantrips = this._shouldHideCantrips(identifier);
    if (hideCantrips && maxSpellLevel > 0) maxSpellLevel = Math.max(1, maxSpellLevel);
    const preloadedData = DataHelpers.getPreloadedData();
    let spellItems = [];
    if (preloadedData && preloadedData.enrichedSpells.length > 0) {
      log(3, `Using preloaded spell data for ${identifier} class`);
      const spellUuidsSet = new Set(Array.from(spellList));
      const preloadedSpells = preloadedData.enrichedSpells.filter((spell) => spellUuidsSet.has(spell.uuid) && spell.system.level <= maxSpellLevel);
      const missingSpells = Array.from(spellList).filter((uuid) => !preloadedSpells.some((spell) => spell.uuid === uuid));
      if (missingSpells.length > 0) {
        log(3, `Loading ${missingSpells.length} missing spells for ${identifier}`);
        const additionalSpells = await DataHelpers.fetchSpellDocuments(new Set(missingSpells), maxSpellLevel);
        spellItems = [...preloadedSpells, ...additionalSpells];
      } else spellItems = preloadedSpells;
    } else spellItems = await DataHelpers.fetchSpellDocuments(spellList, maxSpellLevel);
    if (!spellItems || !spellItems.length) return;
    await this.processAndOrganizeSpellsForClass(identifier, spellItems, classItem);
  }

  /**
   * Takes an array of spell items and organizes them by spell level, enriching
   * each spell with preparation status, user data, and UI-ready information.
   * Handles both actor spells and compendium spells with support for multiple
   * preparation contexts (allows same spell with different preparation methods).
   *
   * @param {Array<Object>} spellItems - Array of spell documents
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<Array<SpellLevel>>} Array of level objects, each containing its spells
   * @private
   */
  async _organizeSpellsByLevelForClass(spellItems, classIdentifier) {
    const spellsByLevel = {};
    const processedSpellIds = new Set();
    const targetUserId = DataHelpers._getTargetUserId(this.actor);
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
        const sourceClass = spell.system?.sourceClass || spell.sourceClass || classIdentifier;
        const fullKey = `${sourceClass}:${spellKey}`;
        if (!spellDeduplicationMap.has(fullKey)) {
          spellDeduplicationMap.set(fullKey, spell);
        } else {
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
        const isSpecialMode = ['innate', 'pact', 'atwill'].includes(preparationMode);
        const isAlwaysPrepared = spell.system.prepared === 2;
        const isGranted = !!spell.flags?.dnd5e?.cachedFor;
        const isOnlySpecial = isSpecialMode || isAlwaysPrepared || isGranted;
        if (isOnlySpecial) specialModeSpells.push(spell);
        else preparableSpells.push(spell);
      }
    }
    const processedPreparableSpells = new Set();
    for (const spell of preparableSpells) {
      const level = spell.system.level;
      const spellName = spell.name.toLowerCase();
      const spellKey = spell._stats?.compendiumSource || spell.flags?.core?.sourceId || spell.uuid;
      if (!processedPreparableSpells.has(spellKey)) {
        if (!spellsByLevel[level]) spellsByLevel[level] = { level: level, name: CONFIG.DND5E.spellLevels[level], spells: [] };
        const compendiumUuid = spell.flags?.core?.sourceId || spell.uuid;
        const spellData = { ...spell, compendiumUuid: compendiumUuid };
        spellData.sourceClass = classIdentifier;
        spellData.system = spellData.system || {};
        spellData.system.sourceClass = classIdentifier;
        if (spell.system?.method !== 'ritual' && spell.system?.components?.ritual) spellData.canCastAsRitual = true;
        spellData.preparation = this.app.spellManager.getSpellPreparationStatus(spellData, classIdentifier);
        spellData.filterData = UIHelpers.extractSpellFilterData(spell);
        spellData.enrichedIcon = UIHelpers.createSpellIconLink(spell);
        const enhancedSpell = DataHelpers.SpellUserDataJournal.enhanceSpellWithUserData(spellData, targetUserId, actorId);
        Object.assign(spellData, enhancedSpell);
        spellsByLevel[level].spells.push(spellData);
        processedPreparableSpells.add(spellKey);
        processedSpellIds.add(spell.id || spell.uuid);
      }
    }
    const compendiumDataPromises = spellItems.map((spell) => DataHelpers.SpellUserDataJournal.getUserDataForSpell(spell.uuid || spell.compendiumUuid, targetUserId, actorId));
    await Promise.all(compendiumDataPromises);
    for (const spell of spellItems) {
      if (spell?.system?.level === undefined) continue;
      const level = spell.system.level;
      const spellUuid = spell.uuid || spell.compendiumUuid;
      if (processedPreparableSpells.has(spellUuid)) continue;
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
      if (this.app.spellManager) spellData.preparation = this.app.spellManager.getSpellPreparationStatus(spellData, classIdentifier);
      spellData.filterData = UIHelpers.extractSpellFilterData(spell);
      spellData.enrichedIcon = UIHelpers.createSpellIconLink(spell);
      const enhancedSpell = DataHelpers.SpellUserDataJournal.enhanceSpellWithUserData(spellData, targetUserId, actorId);
      Object.assign(spellData, enhancedSpell);
      spellsByLevel[level].spells.push(spellData);
      processedSpellIds.add(spell.id || spell.compendiumUuid || spell.uuid);
    }
    for (const spell of specialModeSpells) {
      const level = spell.system.level;
      if (!spellsByLevel[level]) spellsByLevel[level] = { level: level, name: CONFIG.DND5E.spellLevels[level], spells: [] };
      const compendiumUuid = spell.flags?.core?.sourceId || spell.uuid;
      const spellData = { ...spell, compendiumUuid: compendiumUuid };
      const sourceClass = spell.system?.sourceClass || spell.sourceClass;
      if (sourceClass) {
        spellData.sourceClass = sourceClass;
        spellData.system = spellData.system || {};
        spellData.system.sourceClass = sourceClass;
      }
      spellData._preparationContext = 'special';
      if (spell.system?.method !== 'ritual' && spell.system?.components?.ritual) spellData.canCastAsRitual = true;
      spellData.preparation = this.app.spellManager.getSpellPreparationStatus(spellData, sourceClass || classIdentifier);
      spellData.filterData = UIHelpers.extractSpellFilterData(spell);
      spellData.enrichedIcon = UIHelpers.createSpellIconLink(spell);
      const enhancedSpell = DataHelpers.SpellUserDataJournal.enhanceSpellWithUserData(spellData, targetUserId, actorId);
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
   * This method is completely isolated from the preparation system and only
   * handles spell learning logic (Already Learned vs Learn Spell buttons).
   *
   * @param {Array<Object>} spellItems - Array of class spell list items ONLY
   * @param {string} classIdentifier - The class identifier
   * @param {Array<string>} personalSpellbook - Spells already learned by wizard
   * @returns {Promise<Array<SpellLevel>>} Array of level objects for wizard spellbook
   * @private
   */
  async _organizeWizardSpellsForLearning(spellItems, classIdentifier, personalSpellbook) {
    const spellsByLevel = {};
    const processedSpellUuids = new Set();
    const targetUserId = DataHelpers._getTargetUserId(this.actor);
    const actorId = this.actor?.id;
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
      spellData.filterData = UIHelpers.extractSpellFilterData(spell);
      spellData.enrichedIcon = UIHelpers.createSpellIconLink(spell);
      const enhancedSpell = DataHelpers.SpellUserDataJournal.enhanceSpellWithUserData(spellData, targetUserId, actorId);
      Object.assign(spellData, enhancedSpell);
      spellsByLevel[level].spells.push(spellData);
      processedSpellUuids.add(spellUuid);
    }
    for (const level in spellsByLevel) if (level in spellsByLevel) spellsByLevel[level].spells.sort((a, b) => a.name.localeCompare(b.name));
    const sortedLevels = Object.entries(spellsByLevel)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([level, data]) => data);
    log(3, `Organized ${sortedLevels.length} spell levels for wizard spellbook (${classIdentifier})`);
    return sortedLevels;
  }

  /**
   * Get display priority for spell deduplication.
   * Higher number = higher priority for display.
   *
   * @param {Object} spell - The spell item
   * @returns {number} Priority value (higher = more important to display)
   * @private
   */
  _getSpellDisplayPriority(spell) {
    const method = spell.system?.method;
    const prepared = spell.system?.prepared;
    if (prepared === 1) return 100;
    if (prepared === 2) return 90;
    if (['innate', 'pact', 'atwill'].includes(method)) return 50;
    if (method === 'ritual') return 10;
    return 30;
  }

  /**
   * Process and organize spells for a specific class with preparation statistics.
   *
   * Takes spell items and organizes them into level-based structure, then
   * calculates preparation statistics and stores the result in classSpellData.
   * Optionally filters out cantrips based on class configuration.
   *
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
  }

  /**
   * Calculate preparation statistics for a specific class.
   *
   * Analyzes spell data to determine how many spells are currently prepared
   * versus the maximum allowed for the class. Supports both grouped spell
   * level structure and flat spell arrays with intelligent caching.
   *
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
    const effectiveLevels = DataHelpers.getSpellcastingLevelsForClass(this.actor, classIdentifier);
    if (isGroupedStructure) {
      log(3, 'GROUPED STRUCTURE DETECTED!', { class: classIdentifier, spells: spellLevels, classItem: classItem });
      totalSpellCount = spellLevels.reduce((count, level) => count + (Array.isArray(level.spells) ? level.spells.length : 0), 0);
      const cacheKey = `${classIdentifier}-${totalSpellCount}-${effectiveLevels}`;
      if (this._preparationStatsCache.has(cacheKey)) return this._preparationStatsCache.get(cacheKey);
      for (const levelData of spellLevels) {
        if (levelData.level === '0' || levelData.level === 0) continue;
        if (!Array.isArray(levelData.spells)) continue;
        for (const spell of levelData.spells) {
          if (spell.system.prepared === 1 && spell.sourceClass === classIdentifier && spell.system.prepared !== 2) preparedCount++;
        }
      }
    } else if (isFlatStructure) {
      log(3, 'FLAT STRUCTURE DETECTED!', { class: classIdentifier, spells: spellLevels, classItem: classItem });
      totalSpellCount = spellLevels.length;
      const cacheKey = `${classIdentifier}-${totalSpellCount}-${effectiveLevels}`;
      if (this._preparationStatsCache.has(cacheKey)) return this._preparationStatsCache.get(cacheKey);
      for (const spell of spellLevels) {
        const spellLevel = spell.system?.level ?? spell.level ?? spell._levelMetadata?.level;
        if (spellLevel === 0 || spellLevel === '0') continue;
        if (spell.system.prepared === 1 && spell.sourceClass === classIdentifier && spell.system.prepared !== 2) preparedCount++;
      }
    } else {
      log(1, 'calculatePreparationStats: Unknown structure for spellLevels', spellLevels);
    }
    let baseMaxPrepared = 0;
    const spellcastingConfig = DataHelpers.getSpellcastingConfigForClass(this.actor, classIdentifier);
    if (spellcastingConfig?.preparation?.max) baseMaxPrepared = spellcastingConfig.preparation.max;
    else baseMaxPrepared = classItem?.system?.spellcasting?.preparation?.max || 0;
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    const preparationBonus = classRules?.spellPreparationBonus || 0;
    const maxPrepared = baseMaxPrepared + preparationBonus;
    const result = { current: preparedCount, maximum: maxPrepared };
    const cacheKey = `${classIdentifier}-${totalSpellCount}-${effectiveLevels}`;
    this._preparationStatsCache.set(cacheKey, result);
    return result;
  }

  /**
   * Update the global prepared spell count across all classes.
   *
   * Aggregates preparation statistics from all spellcasting classes to
   * provide a unified view of total prepared spells versus total maximum.
   *
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
   *
   * Checks class rules and default behavior to determine whether cantrips
   * should be displayed in the spell list for this class. Uses caching
   * for performance optimization.
   *
   * @param {string} identifier - Identifier of the class
   * @returns {boolean} Whether cantrips should be hidden
   * @private
   */
  _shouldHideCantrips(identifier) {
    if (this._classDetectionCache.has(identifier)) return this._classDetectionCache.get(identifier);
    const classRules = RuleSetManager.getClassRules(this.actor, identifier);
    let shouldHide = false;
    if (classRules && classRules.showCantrips !== undefined) shouldHide = !classRules.showCantrips;
    else shouldHide = [MODULE.CLASS_IDENTIFIERS.PALADIN, MODULE.CLASS_IDENTIFIERS.RANGER].includes(identifier);
    this._classDetectionCache.set(identifier, shouldHide);
    return shouldHide;
  }

  /**
   * Set active class and update current state data.
   *
   * Changes the currently active class and updates the state manager's
   * current spell levels, class name, and preparation statistics to
   * reflect the newly active class.
   *
   * @param {string} identifier - The class identifier to set as active
   * @returns {void}
   */
  setActiveClass(identifier) {
    if (this.classSpellData[identifier]) {
      this.activeClass = identifier;
      this.spellLevels = this.classSpellData[identifier].spellLevels || [];
      this.className = this.classSpellData[identifier].className || '';
      this.spellPreparation = this.classSpellData[identifier].spellPreparation || { current: 0, maximum: 0 };
    }
  }

  /**
   * Handle cantrip level-up notification if needed.
   *
   * Checks if the actor has leveled up and gained access to new cantrip
   * swapping opportunities, displaying appropriate notifications for
   * classes with level-up cantrip swapping rules.
   *
   * @returns {void}
   */
  handleCantripLevelUp() {
    const cantripLevelUp = this.app.spellManager.cantripManager.checkForLevelUp();
    if (cantripLevelUp) {
      const hasLevelUpSwapping = Object.keys(this.spellcastingClasses).some((classId) => {
        const classRules = RuleSetManager.getClassRules(this.actor, classId);
        return classRules.cantripSwapping === 'levelUp';
      });
      if (hasLevelUpSwapping) ui.notifications.info(game.i18n.localize('SPELLBOOK.Cantrips.LevelUpModern'));
    }
  }

  /**
   * Cache wizard spellbook spells for a specific class.
   *
   * Retrieves and caches the personal spellbook contents for a wizard class
   * to optimize subsequent access. The cache is used during spell loading
   * and organization operations.
   *
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async cacheWizardSpellbook(classIdentifier) {
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (wizardManager && wizardManager.isWizard) {
      if (!this.wizardSpellbookCache) this.wizardSpellbookCache = new Map();
      this.wizardSpellbookCache.set(classIdentifier, await wizardManager.getSpellbookSpells());
    } else {
      log(2, `No wizard manager found for class ${classIdentifier} during cache`);
    }
  }

  /**
   * Load wizard spell data for a specific wizard-enabled class.
   *
   * Loads both the class spell list and personal spellbook for a wizard class,
   * organizing them into preparation and spellbook tabs with appropriate
   * statistics and metadata. Handles scroll learning integration.
   *
   * @param {Item} classItem - The class item
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async loadWizardSpellData(classItem, classIdentifier) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    const maxSpellLevel = DataHelpers.calculateMaxSpellLevel(classItem, this.actor);
    const fullSpellList = await DataHelpers.getClassSpellList(className, classUuid, this.actor);
    if (!fullSpellList || !fullSpellList.size) return;
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (!wizardManager || !wizardManager.isWizard) return;
    const personalSpellbook = await wizardManager.getSpellbookSpells();
    if (!this._fullWizardSpellLists) this._fullWizardSpellLists = new Map();
    this._fullWizardSpellLists.set(classIdentifier, new Set(fullSpellList));
    const allUuids = new Set([...fullSpellList, ...personalSpellbook]);
    const effectiveMaxLevel = Math.max(1, maxSpellLevel);
    const preloadedData = DataHelpers.getPreloadedData();
    let spellItems = [];
    if (preloadedData && preloadedData.enrichedSpells.length > 0) {
      log(3, `Using preloaded spell data for ${classIdentifier} wizard spells`);
      const allUuidsArray = Array.from(allUuids);
      const preloadedSpells = preloadedData.enrichedSpells.filter((spell) => allUuidsArray.includes(spell.uuid) && spell.system.level <= effectiveMaxLevel);
      const missingSpells = allUuidsArray.filter((uuid) => !preloadedSpells.some((spell) => spell.uuid === uuid));
      if (missingSpells.length > 0) {
        log(3, `Loading ${missingSpells.length} missing wizard spells for ${classIdentifier}`);
        const additionalSpells = await DataHelpers.fetchSpellDocuments(new Set(missingSpells), effectiveMaxLevel);
        spellItems = [...preloadedSpells, ...additionalSpells];
      } else spellItems = preloadedSpells;
    } else spellItems = await DataHelpers.fetchSpellDocuments(allUuids, effectiveMaxLevel);
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
   *
   * Completely separates preparation tab (with preparation logic) from wizard spellbook tab
   * (with only learning logic). This prevents UI interference and duplicate entries.
   *
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
    this.scrollSpells = await DataHelpers.ScrollScanner.scanForScrollSpells(this.actor);
    const grantedSpells = this.actor.items
      .filter((i) => i.type === 'spell' && (i.flags?.dnd5e?.cachedFor || (i.system?.method && ['pact', 'innate', 'atwill'].includes(i.system.method))))
      .flatMap((i) => {
        const uuids = [];
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
    const wizardLevelsGrouped = await this._organizeWizardSpellsForLearning(classSpellsOnly, classIdentifier, personalSpellbook);
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
      const learnFromScrollLevel = {
        level: 'scroll',
        name: game.i18n.localize('SPELLBOOK.Scrolls.LearnFromScroll'),
        spells: scrollSpellsForLevel
      };
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
   *
   * Adds wizard-specific metadata to spells including spellbook status,
   * learning capabilities, comparison features, and scroll information.
   *
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
          if (spell.isFromScroll) {
            spell.canLearnFromScroll = !spell.inWizardSpellbook;
            spell.scrollMetadata = {
              scrollId: spell.scrollId,
              scrollName: spell.scrollName
            };
          }
        }
        if (!spell.enrichedIcon) spell.enrichedIcon = UIHelpers.createSpellIconLink(spell);
      }
    }
  }

  /**
   * Wait for all wizard data to be fully loaded and available.
   *
   * Ensures all wizard classes have their tab data properly loaded and
   * available. If any wizard data is missing, forces a reload of that
   * specific class data.
   *
   * @returns {Promise<void>}
   */
  async waitForWizardDataCompletion() {
    if (this._initialized) {
      const wizardClasses = DataHelpers.getWizardEnabledClasses(this.actor);
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
      return;
    }
    log(3, 'State not initialized, forcing complete initialization');
    await this.initialize();
  }

  /**
   * Get tab data for a specific class.
   *
   * Returns the organized spell data for a specific class in a format
   * suitable for tab rendering and UI display.
   *
   * @param {string} identifier - The class identifier
   * @returns {Object|null} Tab data for the class, or null if not found
   */
  getClassTabData(identifier) {
    if (this.classSpellData[identifier]) {
      return {
        spellLevels: this.classSpellData[identifier].spellLevels || [],
        className: this.classSpellData[identifier].className || '',
        spellPreparation: this.classSpellData[identifier].spellPreparation || { current: 0, maximum: 0 },
        identifier: identifier
      };
    }
    return null;
  }

  /**
   * Refresh spell data for a specific class after changes.
   *
   * Reloads and reorganizes spell data for a specific class, typically
   * called after learning new spells, changing preparations, or other
   * modifications that affect the class's spell data.
   *
   * @param {string} classIdentifier - The identifier of the class to refresh
   * @returns {Promise<void>}
   */
  async refreshClassSpellData(classIdentifier) {
    const classData = this.spellcastingClasses[classIdentifier];
    if (!classData) return;
    this._preparationStatsCache.clear();
    this.scrollSpells = [];
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (wizardManager) wizardManager.invalidateCache();
    const classItem = this.actor.items.get(classData.id);
    if (!classItem) return;
    if (DataHelpers.isClassWizardEnabled(this.actor, classIdentifier)) {
      await this.cacheWizardSpellbook(classIdentifier);
      await this.loadWizardSpellData(classItem, classIdentifier);
    } else {
      await this.loadClassSpellData(classIdentifier, classItem);
    }
    this.updateGlobalPreparationCount();
  }

  /**
   * Handle post-processing after spell save operations.
   *
   * Performs cleanup and state updates after spell changes have been saved,
   * including cantrip level-up completion and long rest flag management.
   *
   * @param {Actor} actor - The actor
   * @returns {Promise<void>}
   */
  async handlePostProcessing(actor) {
    if (this.app.spellManager.cantripManager.canBeLeveledUp()) await this.app.spellManager.cantripManager.completeCantripsLevelUp();
    if (this.isLongRest) {
      await this.app.spellManager.cantripManager.resetSwapTracking();
      actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, false);
      this.isLongRest = false;
    }
  }

  /**
   * Add missing ritual spells for all classes with ritual casting enabled.
   *
   * Automatically adds ritual spells that should be available to classes
   * with "always" ritual casting rules but aren't currently in the spell data.
   *
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   */
  async addMissingRitualSpells(spellDataByClass) {
    await this._cleanupDisabledRitualSpells();
    for (const [classIdentifier, classData] of Object.entries(this.spellcastingClasses)) {
      const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
      if (classRules.ritualCasting === 'always') {
        const wizardManager = this.app.wizardManagers.get(classIdentifier);
        const isWizard = wizardManager?.isWizard;
        if (isWizard) await this._addWizardRitualSpells(classIdentifier, spellDataByClass);
        else await this._addClassRitualSpells(classIdentifier, classData, spellDataByClass);
      }
    }
  }

  /**
   * Clean up module-created ritual spells for classes that no longer support ritual casting.
   *
   * Removes ritual spells that were automatically added by the module for classes
   * that no longer have "always" ritual casting enabled.
   *
   * @returns {Promise<void>}
   * @private
   */
  async _cleanupDisabledRitualSpells() {
    const spellIdsToRemove = [];
    for (const classIdentifier of Object.keys(this.spellcastingClasses)) {
      const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
      if (classRules.ritualCasting !== 'always') {
        const moduleRitualSpells = this.actor.items.filter(
          (item) =>
            item.type === 'spell' &&
            item.system?.method === 'ritual' &&
            (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier) &&
            item.flags?.[MODULE.ID]?.isModuleRitual === true
        );
        if (moduleRitualSpells.length > 0) {
          moduleRitualSpells.forEach((spell) => {
            spellIdsToRemove.push(spell.id);
          });
        }
      }
    }
    if (spellIdsToRemove.length > 0) await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
  }

  /**
   * Add missing wizard ritual spells using wizard spellbook.
   *
   * Checks the wizard's personal spellbook for ritual spells that aren't
   * in the spell data and adds them as unprepared ritual spells.
   *
   * @param {string} classIdentifier - The class identifier (should be 'wizard')
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   * @private
   */
  async _addWizardRitualSpells(classIdentifier, spellDataByClass) {
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (!wizardManager || !wizardManager.isWizard) return;
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
  }

  /**
   * Add missing ritual spells for non-wizard classes using class spell lists.
   *
   * Checks the class spell list for ritual spells that aren't in the spell data
   * and adds them as unprepared ritual spells for classes with "always" ritual casting.
   *
   * @param {string} classIdentifier - The class identifier
   * @param {SpellcastingClassData} classData - The class data from spellcastingClasses
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   * @private
   */
  async _addClassRitualSpells(classIdentifier, classData, spellDataByClass) {
    const className = classData.name.toLowerCase();
    const classUuid = classData.uuid;
    const spellList = await DataHelpers.getClassSpellList(className, classUuid, this.actor);
    if (!spellList || !spellList.size) return;
    const spellItems = await DataHelpers.fetchSpellDocuments(spellList, 9);
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
      if (spellDataByClass[classIdentifier][classSpellKey]) {
        spellDataByClass[classIdentifier][classSpellKey].isRitual = true;
      }
    }
  }

  /**
   * Send GM notifications if needed for rule violations.
   *
   * Analyzes spell changes and preparation limits to determine if GM
   * notifications should be sent for rule violations or preparation
   * limit violations when enforcement is set to "notify GM" mode.
   *
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
    await this.app.spellManager.cantripManager.sendNotification(notificationData);
  }

  /**
   * Update favorite session state for spell favorites.
   *
   * Tracks temporary favorite state changes during a session that haven't
   * been saved yet. This allows the UI to reflect favorite changes before
   * the form is submitted.
   *
   * @param {string} spellUuid - The spell UUID
   * @param {boolean} favorited - Favorite status
   * @returns {void}
   */
  updateFavoriteSessionState(spellUuid, favorited) {
    if (!this.app._favoriteSessionState) this.app._favoriteSessionState = new Map();
    this.app._favoriteSessionState.set(spellUuid, favorited);
    log(3, `Updated session favorite state for ${spellUuid}: ${favorited}`);
  }

  /**
   * Get favorite session state for a spell.
   *
   * Retrieves the temporary favorite state for a spell that may have
   * been changed during the current session but not yet saved.
   *
   * @param {string} spellUuid - The spell UUID
   * @returns {boolean|null} Session favorite state or null if not set
   */
  getFavoriteSessionState(spellUuid) {
    return this.app._favoriteSessionState?.get(spellUuid) || null;
  }

  /**
   * Clear favorite session state.
   *
   * Clears all temporary favorite state changes, typically called
   * after form submission when session state is no longer needed.
   *
   * @returns {void}
   */
  clearFavoriteSessionState() {
    if (this.app._favoriteSessionState) this.app._favoriteSessionState.clear();
  }

  /**
   * Refresh spell enhancements without full reload.
   *
   * Updates spell notes, favorites, and other user data enhancements
   * for all loaded spells without reloading the entire spell data.
   * Useful for refreshing UI after user data changes.
   *
   * @returns {Promise<void>}
   */
  async refreshSpellEnhancements() {
    const targetUserId = DataHelpers._getTargetUserId(this.app.actor);
    if (DataHelpers.SpellUserDataJournal?.cache) {
      for (const key of DataHelpers.SpellUserDataJournal.cache.keys()) {
        if (key.startsWith(`${targetUserId}:`)) DataHelpers.SpellUserDataJournal.cache.delete(key);
      }
    }
    for (const classData of Object.values(this.classSpellData)) {
      if (classData.spellLevels) {
        const userDataPromises = classData.spellLevels.map((spell) => DataHelpers.SpellUserDataJournal.getUserDataForSpell(spell.uuid || spell.compendiumUuid, targetUserId, this.app.actor?.id));
        await Promise.all(userDataPromises);
        for (const spell of classData.spellLevels) {
          const enhancedSpell = DataHelpers.SpellUserDataJournal.enhanceSpellWithUserData(spell, targetUserId, this.app.actor?.id);
          Object.assign(spell, enhancedSpell);
        }
      }
    }
  }

  /**
   * Get the current spell list for the active class.
   *
   * Returns the spell levels array for the currently active class,
   * which contains all organized spell data for UI rendering.
   *
   * @returns {Array<SpellLevel>} Array of spells for the currently active class
   */
  getCurrentSpellList() {
    if (!this.activeClass || !this.classSpellData[this.activeClass]) return [];
    return this.classSpellData[this.activeClass].spellLevels || [];
  }
}
