import { FLAGS, MODULE, SETTINGS } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import { RuleSetManager } from '../../managers/rule-set-manager.mjs';
import * as actorSpellUtils from '../actor-spells.mjs';
import * as discoveryUtils from '../spell-discovery.mjs';
import * as formattingUtils from '../spell-formatting.mjs';

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
    this.isLoading = true;
    this.isLongRest = false;
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
    if (!this._classesDetected) await this.detectSpellcastingClasses();
    await this.app.spellManager.cleanupStalePreparationFlags();
    await this.loadSpellData();
    this._initialized = true;
    return true;
  }

  /**
   * Detect and initialize all spellcasting classes for the actor
   * @returns {Promise<void>}
   * @async
   */
  async detectSpellcastingClasses() {
    if (this._classesDetected) return;
    this.spellcastingClasses = {};
    this.classSpellData = {};
    this.classPrepModes = {};
    this.classRitualRules = {};
    this.classSwapRules = {};
    this._preparationStatsCache.clear();
    this._classDetectionCache.clear();
    const classItems = this.actor.items.filter((i) => i.type === 'class');
    for (const classItem of classItems) {
      if (!classItem.system.spellcasting?.progression || classItem.system.spellcasting.progression === 'none') continue;
      const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
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
    if (Object.keys(this.spellcastingClasses).length > 0 && !this.activeClass) this.activeClass = Object.keys(this.spellcastingClasses)[0];
    this._classesDetected = true;
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
    if (this.app.wizardManager?.isWizard) await this.cacheWizardSpellbook();
    if (Object.keys(this.spellcastingClasses).length === 0) {
      log(2, 'No spellcasting classes found for actor');
      this.isLoading = false;
      return false;
    }
    this.handleCantripLevelUp();
    for (const [identifier, classData] of Object.entries(this.spellcastingClasses)) {
      const classItem = this.actor.items.get(classData.id);
      if (!classItem) continue;
      if (this.app.wizardManager?.isWizard && identifier === 'wizard') await this.loadWizardSpellData(classItem);
      else await this.loadClassSpellData(identifier, classItem);
    }
    if (this.activeClass && this.classSpellData[this.activeClass]) {
      this.spellLevels = this.classSpellData[this.activeClass].spellLevels || [];
      this.className = this.classSpellData[this.activeClass].className || '';
      this.spellPreparation = this.classSpellData[this.activeClass].spellPreparation || { current: 0, maximum: 0 };
    }
    this.updateGlobalPreparationCount();
    this.isLoading = false;
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
    const spellItems = await actorSpellUtils.fetchSpellDocuments(spellList, maxSpellLevel);
    if (!spellItems || !spellItems.length) return;
    await this.processAndOrganizeSpellsForClass(identifier, spellItems, classItem);
  }

  /**
   * Process and organize spells for a specific class with class-aware preparation
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
    const spellLevels = this._organizeSpellsByLevelForClass(spellItems, identifier, classItem);
    const sortBy = this.app.filterHelper?.getFilterState()?.sortBy || 'level';
    for (const level of spellLevels) level.spells = this.app.filterHelper?.sortSpells(level.spells, sortBy) || level.spells;
    await this.enrichSpellData(spellLevels);
    const prepStats = this.calculatePreparationStats(identifier, spellLevels, classItem);
    this.classSpellData[identifier] = { spellLevels, className: classItem.name, spellPreparation: prepStats, classItem, identifier };
    if (this._shouldHideCantrips(identifier)) this.classSpellData[identifier].spellLevels = spellLevels.filter((level) => level.level !== '0' && level.level !== 0);
    log(3, `Processed ${spellItems.length} spells for class ${classItem.name}`);
  }

  /**
   * Organize spells by level with class-specific preparation awareness
   * @param {Array} spellItems - Array of spell documents
   * @param {string} classIdentifier - The class identifier
   * @param {Item} classItem - The class item
   * @returns {Array} Array of spell levels with formatted data
   * @private
   */
  _organizeSpellsByLevelForClass(spellItems, classIdentifier, classItem) {
    log(3, `Organizing ${spellItems.length} spells by level for class ${classIdentifier}`);
    const spellsByLevel = {};
    const processedSpellIds = new Set();
    const processedSpellNames = new Set();
    if (this.actor) {
      const actorSpells = this.actor.items.filter((item) => item.type === 'spell');
      for (const spell of actorSpells) {
        if (spell?.system?.level === undefined) continue;
        const level = spell.system.level;
        const spellName = spell.name.toLowerCase();
        const preparationMode = spell.system.preparation?.mode;
        const isSpecialMode = ['innate', 'pact', 'atwill', 'always'].includes(preparationMode);
        if (!spellsByLevel[level]) spellsByLevel[level] = [];
        const spellData = {
          ...spell,
          preparation: this.app.spellManager.getSpellPreparationStatus(spell, classIdentifier),
          filterData: formattingUtils.extractSpellFilterData(spell),
          formattedDetails: formattingUtils.formatSpellDetails(spell)
        };
        if (!isSpecialMode) spellData.sourceClass = classIdentifier;
        spellsByLevel[level].push(spellData);
        processedSpellIds.add(spell.id || spell.uuid);
        processedSpellNames.add(spellName);
      }
    }
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
      spellData.formattedDetails = formattingUtils.formatSpellDetails(spell);
      spellsByLevel[level].push(spellData);
      processedSpellIds.add(spell.id || spell.compendiumUuid || spell.uuid);
      processedSpellNames.add(spellName);
    }
    for (const level in spellsByLevel) if (spellsByLevel.hasOwnProperty(level)) spellsByLevel[level].sort((a, b) => a.name.localeCompare(b.name));
    const result = Object.entries(spellsByLevel)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([level, spells]) => ({ level: level, levelName: CONFIG.DND5E.spellLevels[level], spells: spells }));
    log(3, `Final organized spell levels for ${classIdentifier}: ${result.length}`);
    return result;
  }

  /**
   * Calculate preparation statistics for a specific class (with caching)
   * @param {string} classIdentifier - The class identifier
   * @param {Array} spellLevels - Spell level groups
   * @param {Item} classItem - The spellcasting class item
   * @returns {Object} Preparation stats object
   */
  calculatePreparationStats(classIdentifier, spellLevels, classItem) {
    const cacheKey = `${classIdentifier}-${spellLevels.length}-${classItem.system.levels}`;
    if (this._preparationStatsCache.has(cacheKey)) return this._preparationStatsCache.get(cacheKey);
    let preparedCount = 0;
    const baseMaxPrepared = classItem?.system?.spellcasting?.preparation?.max || 0;
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    const preparationBonus = classRules?.preparationBonus || 0;
    const maxPrepared = baseMaxPrepared + preparationBonus;
    if (!Array.isArray(spellLevels)) spellLevels = [];
    for (const level of spellLevels) {
      if (level.level === '0' || level.level === 0) continue;
      if (Array.isArray(level.spells)) {
        for (const spell of level.spells) {
          if (spell.preparation?.prepared && spell.sourceClass === classIdentifier && !spell.preparation?.alwaysPrepared) preparedCount++;
        }
      }
    }
    const result = { current: preparedCount, maximum: maxPrepared };
    this._preparationStatsCache.set(cacheKey, result);
    return result;
  }

  /**
   * Invalidate preparation stats cache (call when class data changes)
   */
  invalidatePreparationStatsCache() {
    this._preparationStatsCache.clear();
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
    if (totalMaxPrepared <= 0) log(2, `Global max preparation is ${totalMaxPrepared}, this might indicate a data issue`);
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
   * Cache wizard spellbook spells
   * @returns {Promise<void>}
   * @async
   */
  async cacheWizardSpellbook() {
    if (this.app.wizardManager && this.app.wizardManager.isWizard) this.wizardSpellbookCache = await this.app.wizardManager.getSpellbookSpells();
  }

  /**
   * Load wizard spell data for the wizard class
   * @param {Item} classItem - The wizard class item
   * @returns {Promise<void>}
   * @async
   */
  async loadWizardSpellData(classItem) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(classItem, this.actor);
    const fullSpellList = await discoveryUtils.getClassSpellList(className, classUuid, null);
    if (!fullSpellList || !fullSpellList.size) return;
    const personalSpellbook = await this.app.wizardManager.getSpellbookSpells();
    this._fullWizardSpellList = new Set(fullSpellList);
    const allUuids = new Set([...fullSpellList, ...personalSpellbook]);
    const effectiveMaxLevel = Math.max(1, maxSpellLevel);
    const spellItems = await actorSpellUtils.fetchSpellDocuments(allUuids, effectiveMaxLevel);
    if (!spellItems || !spellItems.length) return;
    await this.processWizardSpells(spellItems, classItem, personalSpellbook);
  }

  /**
   * Process wizard spells
   * @param {Array} allSpellItems - All fetched spell items
   * @param {Item} classItem - The wizard class item
   * @param {Array} personalSpellbook - The personal spellbook spell UUIDs
   * @returns {Promise<void>}
   * @async
   */
  async processWizardSpells(allSpellItems, classItem, personalSpellbook) {
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    const tabData = {
      spellstab: { spellLevels: [], spellPreparation: { current: 0, maximum: 0 } },
      wizardbook: { spellLevels: [], spellPreparation: { current: 0, maximum: 0 } }
    };
    const identifier = classItem.system?.identifier?.toLowerCase() || 'wizard';
    const totalFreeSpells = this.app.wizardManager.getTotalFreeSpells();
    const usedFreeSpells = await this.app.wizardManager.getUsedFreeSpells();
    const remainingFreeSpells = Math.max(0, totalFreeSpells - usedFreeSpells);
    const totalSpells = personalSpellbook.length;
    tabData.wizardbook.wizardTotalSpellbookCount = totalSpells;
    tabData.wizardbook.wizardFreeSpellbookCount = totalFreeSpells;
    tabData.wizardbook.wizardRemainingFreeSpells = remainingFreeSpells;
    tabData.wizardbook.wizardHasFreeSpells = remainingFreeSpells > 0;
    const grantedSpells = this.actor.items
      .filter((i) => i.type === 'spell' && (i.flags?.dnd5e?.cachedFor || (i.system?.preparation?.mode && ['pact', 'innate', 'atwill'].includes(i.system.preparation.mode))))
      .map((i) => i.flags?.core?.sourceId || i.uuid)
      .filter(Boolean);
    for (const spell of allSpellItems) spell.sourceClass = identifier;
    const prepTabSpells = allSpellItems.filter(
      (spell) => spell.system.level === 0 || personalSpellbook.includes(spell.compendiumUuid) || grantedSpells.includes(spell.compendiumUuid)
    );
    const wizardbookSpells = allSpellItems.filter((spell) => this._fullWizardSpellList.has(spell.compendiumUuid) && spell.system.level !== 0);
    const prepLevels = actorSpellUtils.organizeSpellsByLevel(prepTabSpells, this.actor, this.app.spellManager);
    const wizardLevels = actorSpellUtils.organizeSpellsByLevel(wizardbookSpells, null, this.app.spellManager);
    const maxSpellsAllowed = this.app.wizardManager.getMaxSpellsAllowed();
    const isAtMaxSpells = personalSpellbook.length >= maxSpellsAllowed;
    tabData.wizardbook.wizardMaxSpellbookCount = maxSpellsAllowed;
    tabData.wizardbook.wizardIsAtMax = isAtMaxSpells;
    const sortBy = this.app.filterHelper?.getFilterState()?.sortBy || 'level';
    this.enrichwizardbookSpells(prepLevels, personalSpellbook, sortBy);
    this.enrichwizardbookSpells(wizardLevels, personalSpellbook, sortBy, true, isAtMaxSpells);
    const prepStats = this.calculatePreparationStats(identifier, prepLevels, classItem);
    tabData.spellstab.spellLevels = prepLevels;
    tabData.spellstab.spellPreparation = prepStats;
    tabData.wizardbook.spellLevels = wizardLevels;
    tabData.wizardbook.spellPreparation = prepStats;
    this.classSpellData[identifier] = {
      spellLevels: activeTab === 'wizardbook' ? wizardLevels : prepLevels,
      className: classItem.name,
      spellPreparation: prepStats,
      classItem,
      tabData,
      identifier
    };
    this.tabData = tabData;
  }

  /**
   * Enrich wizard tab spells with additional data
   * @param {Array} levels - Spell level groups
   * @param {Array} personalSpellbook - The personal spellbook spell UUIDs
   * @param {string} sortBy - Sort criteria
   * @param {boolean} iswizardbook - Whether this is for the wizard tab
   * @param {boolean} isAtMaxSpells - Whether maximum spells are reached
   */
  enrichwizardbookSpells(levels, personalSpellbook, sortBy, iswizardbook = false, isAtMaxSpells = false) {
    for (const level of levels) {
      level.spells = this.app.filterHelper?.sortSpells(level.spells, sortBy) || level.spells;
      for (const spell of level.spells) {
        spell.isWizardClass = true;
        spell.inWizardSpellbook = personalSpellbook.includes(spell.compendiumUuid);
        if (iswizardbook) {
          spell.canAddToSpellbook = !spell.inWizardSpellbook && spell.system.level > 0;
          spell.isAtMaxSpells = isAtMaxSpells;
        }
        spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
        spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
      }
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
    this.invalidatePreparationStatsCache();
    const classItem = this.actor.items.get(classData.id);
    if (!classItem) return;
    const isWizardClass = this.app.wizardManager?.isWizard && this.app.wizardManager.classItem?.id === classItem.id;
    if (isWizardClass) await this.loadWizardSpellData(classItem);
    else await this.loadClassSpellData(classIdentifier, classItem);
    this.updateGlobalPreparationCount();
  }

  /**
   * Preserve tab state (moved from PlayerSpellBook)
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
    log(3, `Preserved state for tab ${tabName} with ${tabState.checkboxStates.size} checkboxes`);
  }

  /**
   * Restore tab state (moved from PlayerSpellBook)
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
    log(3, `Restored state for tab ${tabName}, ${restoredCount} checkboxes restored`);
  }

  /**
   * Handle post-processing after spell save (moved from PlayerSpellBook)
   * @param {Actor} actor - The actor
   * @returns {Promise<void>}
   */
  async handlePostProcessing(actor) {
    if (this.app.spellManager.cantripManager.canBeLeveledUp()) await this.app.spellManager.cantripManager.completeCantripsLevelUp();
    if (this.isLongRest) {
      await this.app.spellManager.cantripManager.resetSwapTracking();
      await actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, false);
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
   * Send GM notifications if needed (moved from PlayerSpellBook)
   * @param {Object} spellDataByClass - The spell data grouped by class
   * @param {Object} allCantripChangesByClass - Cantrip changes by class
   * @returns {Promise<void>}
   */
  async sendGMNotifications(spellDataByClass, allCantripChangesByClass) {
    const globalBehavior =
      this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM;
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
}
