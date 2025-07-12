import { FLAGS, MODULE, SETTINGS } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import { RuleSetManager } from '../../managers/rule-set-manager.mjs';
import * as actorSpellUtils from '../actor-spells.mjs';
import * as genericUtils from '../generic-utils.mjs';
import { ScrollScanner } from '../scroll-scanner.mjs';
import * as discoveryUtils from '../spell-discovery.mjs';
import * as formattingUtils from '../spell-formatting.mjs';
import { SpellUserDataJournal } from '../spell-user-data.mjs';

/**
 * Manages state for the spellbook application with cached calculations
 * Handles loading, processing, and organizing spell data
 */
export class SpellbookState {
  constructor(app) {
    this.app = app;
    this.actor = app.actor;
    this._cantripTracking = { originalChecked: new Set(), hasUnlearned: false, hasLearned: false, unlearned: null, learned: null };
    this._classDetectionCache = new Map();
    this._classesDetected = false;
    this._initialized = false;
    this._newlyCheckedCantrips = new Set();
    this._preparationStatsCache = new Map();
    this._spellsTabNeedsReload = false;
    this._uiCantripCount = 0;
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
    this.wizardSpellbookCache = null;
  }

  /**
   * Initialize state manager and load spell data
   * @returns {Promise<boolean>} Success status
   * @async
   */
  async initialize() {
    if (this._initialized) return true;
    this.isLongRest = !!this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
    if (!this._classesDetected) this.detectSpellcastingClasses();
    await this.app.spellManager.cleanupStalePreparationFlags();
    await this.loadSpellData();
    this._initialized = true;
    return true;
  }

  /**
   * Detect and initialize all spellcasting classes for the actor with cleanup of stale data
   * @returns {Promise<void>}
   */
  detectSpellcastingClasses() {
    if (this._classesDetected) return;
    const currentClassIds = [];
    const classItems = this.actor.items.filter((i) => i.type === 'class');
    this.spellcastingClasses = {};
    this.classSpellData = {};
    this.classPrepModes = {};
    this.classRitualRules = {};
    this.classSwapRules = {};
    this._preparationStatsCache.clear();
    this._classDetectionCache.clear();
    for (const classItem of classItems) {
      if (!classItem.system.spellcasting?.progression || classItem.system.spellcasting.progression === 'none') continue;
      const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
      currentClassIds.push(identifier);
      this.spellcastingClasses[identifier] = {
        name: classItem.name,
        uuid: classItem.uuid,
        id: classItem.id,
        spellcasting: classItem.system.spellcasting,
        img: classItem.img
      };
      this.classSpellData[identifier] = {
        spellLevels: [],
        className: classItem.name,
        spellPreparation: { current: 0, maximum: 0 },
        classItem: classItem,
        type: classItem.system.spellcasting?.type || 'leveled',
        progression: classItem.system.spellcasting?.progression || 'none'
      };
      this.classPrepModes[identifier] = this.getClassPreparationMode(classItem);
      this.classRitualRules[identifier] = this.getClassRitualRules(classItem);
      this.classSwapRules[identifier] = this.getClassSwapRules(classItem);
    }
    this._cleanupStaleClassData(currentClassIds);
    if (Object.keys(this.spellcastingClasses).length > 0 && !this.activeClass) this.activeClass = Object.keys(this.spellcastingClasses)[0];
    this._classesDetected = true;
  }

  /**
   * Clean up all stored data for class identifiers that don't match current actor classes
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @returns {Promise<void>}
   * @private
   */
  _cleanupStaleClassData(currentClassIds) {
    this._cleanupStaleFlags(currentClassIds);
    this._cleanupStaleManagers(currentClassIds);
  }

  /**
   * Clean up all flag-based data for non-existent classes
   * @param {Array<string>} currentClassIds - Array of current valid class identifiers
   * @returns {Promise<void>}
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
        key.startsWith(FLAGS.WIZARD_COPIED_SPELLS + '-') ||
        key.startsWith(FLAGS.WIZARD_COPIED_SPELLS + '_') ||
        key.startsWith(FLAGS.WIZARD_RITUAL_CASTING + '-') ||
        key.startsWith(FLAGS.WIZARD_RITUAL_CASTING + '_')
    );
    for (const flagKey of wizardFlags) {
      const separatorIndex = Math.max(flagKey.lastIndexOf('-'), flagKey.lastIndexOf('_'));
      const classId = flagKey.substring(separatorIndex + 1);
      if (!currentClassIds.includes(classId)) this.actor.unsetFlag(MODULE.ID, flagKey);
    }
  }

  /**
   * Clean up manager caches and maps for non-existent classes
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
    const prepStatsSize = this._preparationStatsCache.size;
    const classDetectionSize = this._classDetectionCache.size;
    this._preparationStatsCache.clear();
    this._classDetectionCache.clear();
  }

  /**
   * Determine the preparation mode for a given class
   * @param {Item} classItem - The class item
   * @returns {string} The preparation mode
   */
  getClassPreparationMode(classItem) {
    let prepMode = 'prepared';
    if (classItem.system.spellcasting?.type === 'pact') prepMode = 'pact';
    return prepMode;
  }

  /**
   * Determine ritual casting rules for a given class
   * @param {Item} classItem - The class item
   * @returns {Object} Ritual casting rules
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
   * Determine spell swapping rules for a given class
   * @param {Item} classItem - The class item
   * @returns {Object} Spell swapping rules
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
   * Load spell data for the actor
   * @returns {Promise<boolean>} Success status
   * @async
   */
  async loadSpellData() {
    RuleSetManager.initializeNewClasses(this.actor);
    const wizardClasses = genericUtils.getWizardEnabledClasses(this.actor);
    for (const { identifier } of wizardClasses) {
      const wizardManager = this.app.wizardManagers.get(identifier);
      if (wizardManager) await this.cacheWizardSpellbook(identifier);
    }
    if (Object.keys(this.spellcastingClasses).length === 0) {
      log(2, 'No spellcasting classes found for actor');
      return false;
    }
    this.handleCantripLevelUp();
    for (const [identifier, classData] of Object.entries(this.spellcastingClasses)) {
      const classItem = this.actor.items.get(classData.id);
      if (!classItem) continue;
      if (genericUtils.isClassWizardEnabled(this.actor, identifier)) await this.loadWizardSpellData(classItem, identifier);
      else await this.loadClassSpellData(identifier, classItem);
    }
    if (this.activeClass && this.classSpellData[this.activeClass]) {
      this.spellLevels = this.classSpellData[this.activeClass].spellLevels || [];
      this.className = this.classSpellData[this.activeClass].className || '';
      this.spellPreparation = this.classSpellData[this.activeClass].spellPreparation || { current: 0, maximum: 0 };
    }
    this.updateGlobalPreparationCount();
    return true;
  }

  /**
   * Load spell data for a specific class
   * @param {string} identifier - Identifier of the class
   * @param {Item} classItem - The class item
   * @returns {Promise<void>}
   * @async
   */
  async loadClassSpellData(identifier, classItem) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    const spellList = await discoveryUtils.getClassSpellList(className, classUuid, this.actor);
    if (!spellList || !spellList.size) return;
    let maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(classItem, this.actor);
    const hideCantrips = this._shouldHideCantrips(identifier);
    if (hideCantrips && maxSpellLevel > 0) maxSpellLevel = Math.max(1, maxSpellLevel);
    const spellItems = await actorSpellUtils.fetchSpellDocuments(spellList, maxSpellLevel, this.actor.id);
    if (!spellItems || !spellItems.length) return;
    await this.processAndOrganizeSpellsForClass(identifier, spellItems, classItem);
  }

  /**
   * Organize spells into flattened array with level metadata for lazy loading
   * @param {Array} spellItems - Array of spell documents
   * @param {string} classIdentifier - The class identifier
   * @param {Item} classItem - The class item
   * @returns {Array} Flattened array of spells with level metadata
   * @private
   */
  async _organizeSpellsByLevelForClass(spellItems, classIdentifier, classItem) {
    const spellsByLevel = {};
    const processedSpellIds = new Set();
    const processedSpellNames = new Set();
    const targetUserId = genericUtils._getTargetUserId(this.actor);
    const actorId = this.actor?.id;
    if (this.actor) {
      const actorSpells = this.actor.items.filter((item) => item.type === 'spell');
      const userDataPromises = actorSpells.map((spell) => {
        const compendiumUuid = spell.flags?.core?.sourceId || spell.uuid;
        return SpellUserDataJournal.getUserDataForSpell(compendiumUuid, targetUserId, actorId);
      });
      await Promise.all(userDataPromises);
      for (const spell of actorSpells) {
        if (spell?.system?.level === undefined) continue;
        const level = spell.system.level;
        const spellName = spell.name.toLowerCase();
        const preparationMode = spell.system.preparation?.mode;
        const isSpecialMode = ['innate', 'pact', 'atwill', 'always'].includes(preparationMode);
        if (!spellsByLevel[level]) spellsByLevel[level] = [];
        const compendiumUuid = spell.flags?.core?.sourceId || spell.uuid;
        const spellData = {
          ...spell,
          compendiumUuid: compendiumUuid,
          preparation: this.app.spellManager.getSpellPreparationStatus(spell, classIdentifier),
          filterData: formattingUtils.extractSpellFilterData(spell),
          enrichedIcon: formattingUtils.createSpellIconLink(spell)
        };
        const enhancedSpell = SpellUserDataJournal.enhanceSpellWithUserData(spellData, targetUserId, actorId);
        Object.assign(spellData, enhancedSpell);
        spellData.formattedDetails = formattingUtils.formatSpellDetails(spellData);
        if (!isSpecialMode) spellData.sourceClass = classIdentifier;
        spellsByLevel[level].push(spellData);
        processedSpellIds.add(spell.id || spell.uuid);
        processedSpellNames.add(spellName);
      }
    }
    const compendiumDataPromises = spellItems.map((spell) => SpellUserDataJournal.getUserDataForSpell(spell.uuid || spell.compendiumUuid, targetUserId, actorId));
    await Promise.all(compendiumDataPromises);
    for (const spell of spellItems) {
      if (spell?.system?.level === undefined) continue;
      const level = spell.system.level;
      const spellName = spell.name.toLowerCase();
      if (processedSpellNames.has(spellName)) continue;
      if (!spellsByLevel[level]) spellsByLevel[level] = [];
      const spellData = { ...spell };
      if (this.app.spellManager) spellData.preparation = this.app.spellManager.getSpellPreparationStatus(spell, classIdentifier);
      spellData.sourceClass = classIdentifier;
      spellData.filterData = formattingUtils.extractSpellFilterData(spell);
      spellData.enrichedIcon = formattingUtils.createSpellIconLink(spell);
      const enhancedSpell = SpellUserDataJournal.enhanceSpellWithUserData(spellData, targetUserId, actorId);
      Object.assign(spellData, enhancedSpell);
      spellData.formattedDetails = formattingUtils.formatSpellDetails(spellData);
      spellsByLevel[level].push(spellData);
      processedSpellIds.add(spell.id || spell.compendiumUuid || spell.uuid);
      processedSpellNames.add(spellName);
    }
    for (const level in spellsByLevel) if (spellsByLevel.hasOwnProperty(level)) spellsByLevel[level].sort((a, b) => a.name.localeCompare(b.name));
    const flattened = [];
    const sortedLevels = Object.entries(spellsByLevel).sort(([a], [b]) => Number(a) - Number(b));
    for (const [level, spells] of sortedLevels) {
      const levelName = CONFIG.DND5E.spellLevels[level];
      for (let i = 0; i < spells.length; i++) {
        const spell = spells[i];
        flattened.push({
          ...spell,
          _levelMetadata: {
            level: level,
            levelName: levelName,
            isFirstInLevel: i === 0,
            levelSpellCount: spells.length,
            levelIndex: i
          }
        });
      }
    }
    return flattened;
  }

  /**
   * Process and organize spells for a specific class with flattened structure
   * @param {string} identifier - Identifier of the class
   * @param {Array} spellItems - Array of spell items
   * @param {Item} classItem - The class item
   * @returns {Promise<void>}
   * @async
   */
  async processAndOrganizeSpellsForClass(identifier, spellItems, classItem) {
    for (const spell of spellItems) {
      const preparationMode = spell.system?.preparation?.mode;
      const isSpecialMode = ['innate', 'pact', 'atwill', 'always'].includes(preparationMode);
      const isGranted = !!spell.flags?.dnd5e?.cachedFor;
      if (!isSpecialMode && !isGranted) {
        spell.sourceClass = identifier;
        if (spell.system && !spell.system.sourceClass) spell.system.sourceClass = identifier;
      }
    }
    const spellLevels = await this._organizeSpellsByLevelForClass(spellItems, identifier, classItem);
    const prepStats = this.calculatePreparationStats(identifier, spellLevels, classItem);
    this.classSpellData[identifier] = {
      spellLevels,
      className: classItem.name,
      spellPreparation: prepStats,
      classItem,
      identifier
    };
    if (this._shouldHideCantrips(identifier)) {
      this.classSpellData[identifier].spellLevels = spellLevels.filter((spell) => spell._levelMetadata.level !== '0' && spell._levelMetadata.level !== 0);
    }
  }

  /**
   * Calculate preparation statistics for a specific class
   * @param {string} classIdentifier - The class identifier
   * @param {Array} spellLevels - Flattened spell array
   * @param {Item} classItem - The spellcasting class item
   * @returns {Object} Preparation stats object
   */
  calculatePreparationStats(classIdentifier, spellLevels, classItem) {
    const cacheKey = `${classIdentifier}-${spellLevels.length}-${classItem.system.levels}`;
    if (this._preparationStatsCache.has(cacheKey)) return this._preparationStatsCache.get(cacheKey);
    let preparedCount = 0;
    const baseMaxPrepared = classItem?.system?.spellcasting?.preparation?.max || 0;
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    const preparationBonus = classRules?.spellPreparationBonus || 0;
    const maxPrepared = baseMaxPrepared + preparationBonus;
    for (const spell of spellLevels) {
      if (spell._levelMetadata.level === '0' || spell._levelMetadata.level === 0) continue;
      if (spell.preparation?.prepared && spell.sourceClass === classIdentifier && !spell.preparation?.alwaysPrepared) preparedCount++;
    }
    const result = { current: preparedCount, maximum: maxPrepared };
    this._preparationStatsCache.set(cacheKey, result);
    return result;
  }

  /**
   * Update the global prepared spell count
   */
  updateGlobalPreparationCount() {
    let totalPrepared = 0;
    let totalMaxPrepared = 0;
    for (const [identifier, classData] of Object.entries(this.classSpellData)) {
      if (classData.spellPreparation) {
        totalPrepared += classData.spellPreparation.current;
        totalMaxPrepared += classData.spellPreparation.maximum;
      }
    }
    this.spellPreparation = { current: totalPrepared, maximum: totalMaxPrepared };
    log(3, `Updated global preparation count: ${totalPrepared}/${totalMaxPrepared}`);
    if (totalMaxPrepared <= 0) {
      log(2, `Global max preparation is ${totalMaxPrepared}, this might indicate a data issue. Note: If on 3.3.1, you must set this manually due to system limitations.`);
    }
  }

  /**
   * Determine if cantrips should be hidden for a class (with caching)
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
   * Set active class and update data
   * @param {string} identifier - The class identifier to set as active
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
   * Enrich spell data with formatted information
   * @param {Array} spellLevels - Spell level groups
   * @returns {Promise<void>}
   * @async
   */
  async enrichSpellData(spellLevels) {
    for (const level of spellLevels) {
      for (const spell of level.spells) {
        spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
        spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
      }
    }
  }

  /**
   * Handle cantrip level-up notification if needed
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
   * Cache wizard spellbook spells for a specific class
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   * @async
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
   * Load wizard spell data for a specific wizard-enabled class
   * @param {Item} classItem - The class item
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   * @async
   */
  async loadWizardSpellData(classItem, classIdentifier) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(classItem, this.actor);
    const fullSpellList = await discoveryUtils.getClassSpellList(className, classUuid, this.actor);
    if (!fullSpellList || !fullSpellList.size) return;
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    if (!wizardManager || !wizardManager.isWizard) return;
    const personalSpellbook = await wizardManager.getSpellbookSpells();
    if (!this._fullWizardSpellLists) this._fullWizardSpellLists = new Map();
    this._fullWizardSpellLists.set(classIdentifier, new Set(fullSpellList));
    const allUuids = new Set([...fullSpellList, ...personalSpellbook]);
    const effectiveMaxLevel = Math.max(1, maxSpellLevel);
    const spellItems = await actorSpellUtils.fetchSpellDocuments(allUuids, effectiveMaxLevel);
    if (!spellItems || !spellItems.length) return;
    await this.processWizardSpells(spellItems, classItem, personalSpellbook, classIdentifier);
  }

  /**
   * Process wizard spells for a specific class
   * @param {Array} allSpellItems - All fetched spell items
   * @param {Item} classItem - The class item
   * @param {Array} personalSpellbook - The personal spellbook spell UUIDs
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   * @async
   */
  async processWizardSpells(allSpellItems, classItem, personalSpellbook, classIdentifier) {
    const spellsTabId = `${classIdentifier}Tab`;
    const wizardTabId = `wizardbook-${classIdentifier}`;
    const shouldHideCantrips = this._shouldHideCantrips(classIdentifier);
    const wizardManager = this.app.wizardManagers.get(classIdentifier);
    const totalFreeSpells = wizardManager.getTotalFreeSpells();
    const usedFreeSpells = await wizardManager.getUsedFreeSpells();
    const remainingFreeSpells = Math.max(0, totalFreeSpells - usedFreeSpells);
    const totalSpells = personalSpellbook.length;
    this.scrollSpells = await ScrollScanner.scanForScrollSpells(this.actor);
    const grantedSpells = this.actor.items
      .filter((i) => i.type === 'spell' && (i.flags?.dnd5e?.cachedFor || (i.system?.preparation?.mode && ['pact', 'innate', 'atwill'].includes(i.system.preparation.mode))))
      .map((i) => i.flags?.core?.sourceId || i.uuid)
      .filter(Boolean);
    for (const spell of allSpellItems) spell.sourceClass = classIdentifier;
    const prepTabSpells = allSpellItems.filter(
      (spell) => (!shouldHideCantrips && spell.system.level === 0) || (spell.system.level !== 0 && (personalSpellbook.includes(spell.compendiumUuid) || grantedSpells.includes(spell.compendiumUuid)))
    );
    const wizardbookSpells = allSpellItems.filter((spell) => this._fullWizardSpellLists.get(classIdentifier).has(spell.compendiumUuid) && spell.system.level !== 0);
    const prepLevelsFlattened = await this._organizeSpellsByLevelForClass(prepTabSpells, classIdentifier, classItem);
    const wizardLevelsFlattened = await this._organizeSpellsByLevelForClass(wizardbookSpells, classIdentifier, classItem);
    const maxSpellsAllowed = wizardManager.getMaxSpellsAllowed();
    const isAtMaxSpells = personalSpellbook.length >= maxSpellsAllowed;
    let finalPrepLevels = prepLevelsFlattened;
    if (shouldHideCantrips) finalPrepLevels = prepLevelsFlattened.filter((spell) => spell._levelMetadata.level !== '0' && spell._levelMetadata.level !== 0);
    this.enrichWizardBookSpells(finalPrepLevels, personalSpellbook, false, false);
    this.enrichWizardBookSpells(wizardLevelsFlattened, personalSpellbook, true, isAtMaxSpells);
    const prepStats = this.calculatePreparationStats(classIdentifier, finalPrepLevels, classItem);
    const tabData = {
      [spellsTabId]: { spellLevels: finalPrepLevels, spellPreparation: prepStats },
      [wizardTabId]: {
        spellLevels: wizardLevelsFlattened,
        spellPreparation: prepStats,
        wizardTotalSpellbookCount: totalSpells,
        wizardFreeSpellbookCount: totalFreeSpells,
        wizardRemainingFreeSpells: remainingFreeSpells,
        wizardHasFreeSpells: remainingFreeSpells > 0,
        wizardMaxSpellbookCount: maxSpellsAllowed,
        wizardIsAtMax: isAtMaxSpells
      }
    };
    this.classSpellData[classIdentifier] = {
      spellLevels: finalPrepLevels,
      className: classItem.name,
      spellPreparation: prepStats,
      classItem,
      tabData,
      identifier: classIdentifier
    };
    Object.assign(this.tabData, tabData);
  }

  /**
   * Enrich wizard tab spells with additional data
   * @param {Array} flattenedSpells - Flattened spell array
   * @param {Array} personalSpellbook - The personal spellbook spell UUIDs
   * @param {boolean} isWizardBook - Whether this is for the wizard tab
   * @param {boolean} isAtMaxSpells - Whether maximum spells are reached
   */
  enrichWizardBookSpells(flattenedSpells, personalSpellbook, isWizardBook = false, isAtMaxSpells = false) {
    for (const spell of flattenedSpells) {
      spell.isWizardClass = true;
      spell.inWizardSpellbook = personalSpellbook.includes(spell.compendiumUuid || spell.spellUuid);
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
      if (!spell.enrichedIcon) spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
      spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
    }
  }

  /**
   * Get tab data for a specific class
   * @param {string} identifier - The class identifier
   * @returns {Object} Tab data for the class
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
   * Set long rest context for the spellbook
   * @param {boolean} isLongRest - Whether in long rest mode
   */
  setLongRestContext(isLongRest) {
    this.isLongRest = !!isLongRest;
    if (this.isLongRest) this.actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
  }

  /**
   * Refresh spell data for a specific class after changes (e.g., learning new spells)
   * @param {string} classIdentifier - The identifier of the class to refresh
   * @returns {Promise<void>}
   * @async
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
    if (genericUtils.isClassWizardEnabled(this.actor, classIdentifier)) {
      await this.cacheWizardSpellbook(classIdentifier);
      await this.loadWizardSpellData(classItem, classIdentifier);
    } else {
      await this.loadClassSpellData(classIdentifier, classItem);
    }
    this.updateGlobalPreparationCount();
  }

  /**
   * Preserve tab state
   * @param {string} tabName - The tab to preserve state for
   */
  preserveTabState(tabName) {
    const tabElement = this.app.element.querySelector(`.tab[data-tab="${tabName}"]`);
    if (!tabElement) return;
    const checkboxes = tabElement.querySelectorAll('dnd5e-checkbox[data-uuid]');
    const tabState = { checkboxStates: new Map(), timestamp: Date.now() };
    checkboxes.forEach((checkbox) => {
      const uuid = checkbox.dataset.uuid;
      const sourceClass = checkbox.dataset.sourceClass;
      const key = `${sourceClass}:${uuid}`;
      tabState.checkboxStates.set(key, { checked: checkbox.checked, disabled: checkbox.disabled, wasPrepared: checkbox.dataset.wasPrepared === 'true' });
    });
    if (!this.app._tabStateCache) this.app._tabStateCache = new Map();
    this.app._tabStateCache.set(tabName, tabState);
    this.preserveFavoriteStates(tabName);
    log(3, `Preserved state for tab ${tabName} with ${tabState.checkboxStates.size} checkboxes`);
  }

  /**
   * Restore tab state
   * @param {string} tabName - The tab to restore state for
   */
  restoreTabState(tabName) {
    if (!this.app._tabStateCache || !this.app._tabStateCache.has(tabName)) return;
    const tabElement = this.app.element.querySelector(`.tab[data-tab="${tabName}"]`);
    if (!tabElement) return;
    const tabState = this.app._tabStateCache.get(tabName);
    const checkboxes = tabElement.querySelectorAll('dnd5e-checkbox[data-uuid]');
    let restoredCount = 0;
    checkboxes.forEach((checkbox) => {
      const uuid = checkbox.dataset.uuid;
      const sourceClass = checkbox.dataset.sourceClass;
      const key = `${sourceClass}:${uuid}`;
      const savedState = tabState.checkboxStates.get(key);
      if (savedState) {
        const currentWasPrepared = checkbox.dataset.wasPrepared === 'true';
        if (savedState.wasPrepared === currentWasPrepared) {
          checkbox.checked = savedState.checked;
          restoredCount++;
        }
      }
    });
    this.restoreFavoriteStates(tabName);
    log(3, `Restored state for tab ${tabName}, ${restoredCount} checkboxes restored`);
  }

  /**
   * Handle post-processing after spell save
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
   * Add missing ritual spells for all classes with ritual casting enabled
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   */
  async addMissingRitualSpells(spellDataByClass) {
    await this._cleanupDisabledRitualSpells();
    for (const [classIdentifier, classData] of Object.entries(this.spellcastingClasses)) {
      const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
      if (classRules.ritualCasting === 'always') {
        if (classIdentifier === 'wizard' && this.app.wizardManager?.isWizard) await this._addWizardRitualSpells(classIdentifier, spellDataByClass);
        else await this._addClassRitualSpells(classIdentifier, classData, spellDataByClass);
      }
    }
  }

  /**
   * Clean up module-created ritual spells for classes that no longer support ritual casting
   * @returns {Promise<void>}
   * @private
   */
  async _cleanupDisabledRitualSpells() {
    const spellIdsToRemove = [];
    for (const [classIdentifier, classData] of Object.entries(this.spellcastingClasses)) {
      const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
      if (classRules.ritualCasting !== 'always') {
        const moduleRitualSpells = this.actor.items.filter(
          (item) =>
            item.type === 'spell' &&
            item.system?.preparation?.mode === 'ritual' &&
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
   * Add missing wizard ritual spells using wizard spellbook
   * @param {string} classIdentifier - The class identifier (should be 'wizard')
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   * @private
   */
  async _addWizardRitualSpells(classIdentifier, spellDataByClass) {
    const ritualManager = this.app.getRitualManager();
    if (!ritualManager?.isWizard) return;
    const spellbookSpells = await this.app.wizardManager.getSpellbookSpells();
    const processedUuids = new Set();
    if (spellDataByClass[classIdentifier]) {
      Object.values(spellDataByClass[classIdentifier]).forEach((spellData) => {
        processedUuids.add(spellData.uuid);
      });
    }
    const isRitualSpell = (spell) => {
      if (spell.system?.properties && spell.system.properties.has) return spell.system.properties.has('ritual');
      if (spell.system?.properties && Array.isArray(spell.system.properties)) return spell.system.properties.some((prop) => prop.value === 'ritual');
      return spell.system?.components?.ritual || false;
    };
    for (const spellUuid of spellbookSpells) {
      if (processedUuids.has(spellUuid)) continue;
      const sourceSpell = await fromUuid(spellUuid);
      if (!sourceSpell || !isRitualSpell(sourceSpell) || sourceSpell.system.level === 0) continue;
      log(3, `Found missing wizard ritual spell: ${sourceSpell.name} (${spellUuid})`);
      if (!spellDataByClass[classIdentifier]) spellDataByClass[classIdentifier] = {};
      const classSpellKey = `${classIdentifier}:${spellUuid}`;
      spellDataByClass[classIdentifier][classSpellKey] = {
        uuid: spellUuid,
        name: sourceSpell.name,
        wasPrepared: false,
        isPrepared: false,
        isRitual: true,
        sourceClass: classIdentifier,
        classSpellKey,
        spellLevel: sourceSpell.system.level
      };
      log(3, `Added missing wizard ritual spell: ${sourceSpell.name} as unprepared`);
    }
  }

  /**
   * Add missing ritual spells for non-wizard classes using class spell lists
   * @param {string} classIdentifier - The class identifier
   * @param {Object} classData - The class data from spellcastingClasses
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @returns {Promise<void>}
   * @private
   */
  async _addClassRitualSpells(classIdentifier, classData, spellDataByClass) {
    const className = classData.name.toLowerCase();
    const classUuid = classData.uuid;
    const spellList = await discoveryUtils.getClassSpellList(className, classUuid, this.actor);
    if (!spellList || !spellList.size) {
      log(1, `No spell list found for class ${classIdentifier} (${className})`);
      return;
    }
    const spellItems = await actorSpellUtils.fetchSpellDocuments(spellList, 9);
    if (!spellItems || !spellItems.length) {
      log(1, `No spell items fetched for class ${classIdentifier} - fetchSpellDocuments returned empty`);
      return;
    }
    const preparedUuids = new Set();
    if (spellDataByClass[classIdentifier]) {
      Object.values(spellDataByClass[classIdentifier]).forEach((spellData) => {
        if (spellData.isPrepared || spellData.wasPrepared) {
          preparedUuids.add(spellData.uuid);
        }
      });
    }
    let addedCount = 0;
    let ritualSpellsFound = 0;
    let skippedReasons = {
      alreadyPrepared: 0,
      notRitual: 0,
      isCantrip: 0,
      alreadyOnActorAsRitual: 0,
      addedAsRitual: 0
    };
    const isRitualSpell = (spell) => {
      if (spell.system?.properties && spell.system.properties.has) return spell.system.properties.has('ritual');
      if (spell.system?.properties && Array.isArray(spell.system.properties)) return spell.system.properties.some((prop) => prop.value === 'ritual');
      return spell.system?.components?.ritual || false;
    };
    for (const spell of spellItems) {
      const spellUuid = spell.compendiumUuid || spell.uuid;
      const spellName = spell.name;
      const spellLevel = spell.system?.level;
      const hasRitual = isRitualSpell(spell);
      if (!hasRitual) continue;
      if (spellLevel === 0) continue;
      if (preparedUuids.has(spellUuid)) continue;
      const existingRitualSpell = this.actor.items.find(
        (item) =>
          item.type === 'spell' &&
          (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) &&
          (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier) &&
          item.system?.preparation?.mode === 'ritual'
      );
      if (existingRitualSpell) continue;
      if (!spellDataByClass[classIdentifier]) spellDataByClass[classIdentifier] = {};
      const classSpellKey = `${classIdentifier}:${spellUuid}`;
      if (spellDataByClass[classIdentifier][classSpellKey]) {
        spellDataByClass[classIdentifier][classSpellKey].isRitual = true;
        spellDataByClass[classIdentifier][classSpellKey].isPrepared = false;
      } else {
        spellDataByClass[classIdentifier][classSpellKey] = {
          uuid: spellUuid,
          name: spellName,
          wasPrepared: false,
          isPrepared: false,
          isRitual: true,
          sourceClass: classIdentifier,
          classSpellKey,
          spellLevel: spellLevel
        };
      }
    }
  }

  /**
   * Send GM notifications if needed
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @param {Object} allCantripChangesByClass - Cantrip changes by class
   * @returns {Promise<void>}
   */
  async sendGMNotifications(spellDataByClass, allCantripChangesByClass) {
    const globalBehavior = this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM;
    if (globalBehavior !== MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM) return;
    const notificationData = { actorName: this.actor.name, classChanges: {} };
    for (const [classIdentifier, classSpellData] of Object.entries(spellDataByClass)) {
      const classData = this.classSpellData[classIdentifier];
      if (!classData) continue;
      const className = classData.className || classIdentifier;
      const cantripChanges = allCantripChangesByClass[classIdentifier] || { added: [], removed: [] };
      const cantripCount = Object.values(classSpellData).filter((spell) => spell.isPrepared && spell.spellLevel === 0).length;
      const spellCount = Object.values(classSpellData).filter((spell) => spell.isPrepared && spell.spellLevel > 0).length;
      const maxCantrips = this.app.spellManager.cantripManager._getMaxCantripsForClass(classIdentifier);
      const maxSpells = classData.spellPreparation?.maximum || 0;
      notificationData.classChanges[classIdentifier] = {
        className,
        cantripChanges,
        overLimits: {
          cantrips: {
            isOver: cantripCount > maxCantrips,
            current: cantripCount,
            max: maxCantrips
          },
          spells: {
            isOver: spellCount > maxSpells,
            current: spellCount,
            max: maxSpells
          }
        }
      };
    }
    await this.app.spellManager.cantripManager.sendComprehensiveGMNotification(notificationData);
  }

  /**
   * Preserve favorite star states for a tab
   * @param {string} tabName - The tab to preserve state for
   */
  preserveFavoriteStates(tabName) {
    const tabElement = this.app.element.querySelector(`.tab[data-tab="${tabName}"]`);
    if (!tabElement) return;
    const favoriteButtons = tabElement.querySelectorAll('.spell-favorite-toggle[data-uuid]');
    const favoriteStates = new Map();
    favoriteButtons.forEach((button) => {
      const uuid = button.dataset.uuid;
      if (uuid) {
        favoriteStates.set(uuid, {
          favorited: button.classList.contains('favorited'),
          timestamp: Date.now()
        });
      }
    });
    if (!this.app._favoriteStateCache) this.app._favoriteStateCache = new Map();
    this.app._favoriteStateCache.set(tabName, favoriteStates);
    log(3, `Preserved favorite states for tab ${tabName} with ${favoriteStates.size} buttons`);
  }

  /**
   * Restore favorite star states for a tab
   * @param {string} tabName - The tab to restore state for
   */
  restoreFavoriteStates(tabName) {
    if (!this.app._favoriteStateCache || !this.app._favoriteStateCache.has(tabName)) return;
    const tabElement = this.app.element.querySelector(`.tab[data-tab="${tabName}"]`);
    if (!tabElement) return;
    const favoriteStates = this.app._favoriteStateCache.get(tabName);
    const favoriteButtons = tabElement.querySelectorAll('.spell-favorite-toggle[data-uuid]');
    let restoredCount = 0;
    favoriteButtons.forEach((button) => {
      const uuid = button.dataset.uuid;
      const savedState = favoriteStates.get(uuid);
      if (savedState) {
        const icon = button.querySelector('i');
        if (savedState.favorited) {
          button.classList.add('favorited');
          if (icon) {
            icon.classList.remove('far');
            icon.classList.add('fas');
          }
          button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
          button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites'));
        } else {
          button.classList.remove('favorited');
          if (icon) {
            icon.classList.remove('fas');
            icon.classList.add('far');
          }
          button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
          button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.AddToFavorites'));
        }
        restoredCount++;
      }
    });
    log(3, `Restored favorite states for tab ${tabName}, ${restoredCount} buttons restored`);
  }

  /**
   * Update favorite session state (like checkboxes)
   * @param {string} spellUuid - The spell UUID
   * @param {boolean} favorited - Favorite status
   */
  updateFavoriteSessionState(spellUuid, favorited) {
    if (!this.app._favoriteSessionState) this.app._favoriteSessionState = new Map();
    this.app._favoriteSessionState.set(spellUuid, favorited);
    log(3, `Updated session favorite state for ${spellUuid}: ${favorited}`);
  }

  /**
   * Get favorite session state
   * @param {string} spellUuid - The spell UUID
   * @returns {boolean|null} Session favorite state or null if not set
   */
  getFavoriteSessionState(spellUuid) {
    return this.app._favoriteSessionState?.get(spellUuid) || null;
  }

  /**
   * Clear favorite session state (called on form submit)
   */
  clearFavoriteSessionState() {
    if (this.app._favoriteSessionState) this.app._favoriteSessionState.clear();
  }

  /**
   * Refresh spell enhancements (notes, favorites) without full reload
   * @returns {Promise<void>}
   */
  async refreshSpellEnhancements() {
    let targetUserId = game.user.id;
    if (game.user.isActiveGM && this.app.actor) {
      const characterOwner = game.users.find((user) => user.character?.id === this.app.actor.id);
      if (characterOwner) targetUserId = characterOwner.id;
      else {
        const ownershipOwner = game.users.find((user) => this.app.actor.ownership[user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
        if (ownershipOwner) targetUserId = ownershipOwner.id;
        else log(2, `No owner found for actor ${this.app.actor.name}, using GM data for enhancements`);
      }
    }
    if (SpellUserDataJournal?.cache) {
      for (const key of SpellUserDataJournal.cache.keys()) {
        if (key.startsWith(`${targetUserId}:`)) SpellUserDataJournal.cache.delete(key);
      }
    }
    for (const [classIdentifier, classData] of Object.entries(this.classSpellData)) {
      if (classData.spellLevels) {
        const userDataPromises = classData.spellLevels.map((spell) => SpellUserDataJournal.getUserDataForSpell(spell.uuid || spell.compendiumUuid, targetUserId, this.app.actor?.id));
        await Promise.all(userDataPromises);
        for (const spell of classData.spellLevels) {
          const enhancedSpell = SpellUserDataJournal.enhanceSpellWithUserData(spell, targetUserId, this.app.actor?.id);
          Object.assign(spell, enhancedSpell);
          spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
        }
      }
    }
  }

  /**
   * Get the current spell list for the active class
   * @returns {Array} Array of spells for the currently active class
   */
  getCurrentSpellList() {
    if (!this.activeClass || !this.classSpellData[this.activeClass]) return [];
    return this.classSpellData[this.activeClass].spellLevels || [];
  }
}
