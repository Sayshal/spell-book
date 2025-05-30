import { CLASS_IDENTIFIERS, FLAGS, MODULE } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import * as actorSpellUtils from '../actor-spells.mjs';
import { RuleSetManager } from '../rule-set-manager.mjs';
import * as discoveryUtils from '../spell-discovery.mjs';
import * as formattingUtils from '../spell-formatting.mjs';

/**
 * Manages state for the spellbook application
 * Handles loading, processing, and organizing spell data
 */
export class SpellbookState {
  constructor(app) {
    this.app = app;
    this.actor = app.actor;
    this._cantripTracking = {
      originalChecked: new Set(),
      hasUnlearned: false,
      hasLearned: false,
      unlearned: null,
      learned: null
    };
    this._classesDetected = false;
    this._initialized = false;
    this._newlyCheckedCantrips = new Set();
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
    try {
      if (this._initialized) return true;
      this.isLongRest = !!this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
      if (!this._classesDetected) await this.detectSpellcastingClasses();
      await this.app.spellManager.cleanupStalePreparationFlags();
      await this.loadSpellData();
      this._initialized = true;
      return true;
    } catch (error) {
      log(1, 'Error initializing spellbook state:', error);
      this.isLoading = false;
      return false;
    }
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
    let prepMode = 'prepared'; // Default to "prepared" for most classes
    if (classItem.system.spellcasting?.type === 'pact') prepMode = 'pact';
    return prepMode;
  }

  /**
   * Determine ritual casting rules for a given class
   * @param {Item} classItem - The class item
   * @returns {Object} Ritual casting rules
   */
  getClassRitualRules(classItem) {
    // Default ritual rules
    const rules = {
      canCastRituals: false,
      mustPrepare: false,
      fromSpellbook: false
    };

    const identifier = classItem.system?.identifier?.toLowerCase() || '';
    // Wizard special case - can cast rituals from spellbook without preparing
    // TODO: Shouldnt this just check if isWizard?
    if (identifier === CLASS_IDENTIFIERS.WIZARD) {
      rules.canCastRituals = true;
      rules.mustPrepare = false;
      rules.fromSpellbook = true;
    }
    // Classes that can cast rituals if prepared
    else if ([CLASS_IDENTIFIERS.CLERIC, CLASS_IDENTIFIERS.DRUID, CLASS_IDENTIFIERS.BARD].includes(identifier)) {
      rules.canCastRituals = true;
      rules.mustPrepare = true;
    }
    // For other classes, the defaults will apply automatically

    return rules;
  }

  /**
   * Determine spell swapping rules for a given class
   * @param {Item} classItem - The class item
   * @returns {Object} Spell swapping rules
   */
  getClassSwapRules(classItem) {
    const identifier = classItem.system?.identifier?.toLowerCase() || '';
    const rules = {
      canSwapCantrips: false,
      cantripSwapMode: 'none',
      canSwapSpells: false,
      spellSwapMode: 'none'
    };

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
    try {
      await RuleSetManager.initializeNewClasses(this.actor);
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

      // Initialize with the active class data
      if (this.activeClass && this.classSpellData[this.activeClass]) {
        this.spellLevels = this.classSpellData[this.activeClass].spellLevels || [];
        this.className = this.classSpellData[this.activeClass].className || '';
        this.spellPreparation = this.classSpellData[this.activeClass].spellPreparation || { current: 0, maximum: 0 };
      }

      this.updateGlobalPreparationCount();
      this.isLoading = false;
      return true;
    } catch (error) {
      log(1, 'Error loading spell data:', error);
      this.isLoading = false;
      return false;
    }
  }

  /**
   * Load spell data for a specific class
   * @param {string} identifier - Identifier of the class
   * @param {Item} classItem - The class item
   * @returns {Promise<void>}
   * @async
   */
  async loadClassSpellData(identifier, classItem) {
    try {
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;
      const spellList = await discoveryUtils.getClassSpellList(className, classUuid, this.actor);
      if (!spellList || !spellList.size) return;
      const classLevel = classItem.system.levels || 0;
      let maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(classLevel, classItem.system.spellcasting);
      const hideCantrips = this._shouldHideCantrips(identifier);
      if (hideCantrips && maxSpellLevel > 0) maxSpellLevel = Math.max(1, maxSpellLevel);
      const spellItems = await actorSpellUtils.fetchSpellDocuments(spellList, maxSpellLevel);
      if (!spellItems || !spellItems.length) return;
      await this.processAndOrganizeSpellsForClass(identifier, spellItems, classItem);
    } catch (error) {
      log(1, `Error loading spell data for class ${identifier}:`, error);
    }
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
    try {
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

      // Store the processed data for this class
      this.classSpellData[identifier] = {
        spellLevels,
        className: classItem.name,
        spellPreparation: prepStats,
        classItem,
        identifier
      };

      // Hide cantrips for classes that don't have them
      if (this._shouldHideCantrips(identifier)) {
        this.classSpellData[identifier].spellLevels = spellLevels.filter((level) => level.level !== '0' && level.level !== 0);
      }

      log(3, `Processed ${spellItems.length} spells for class ${classItem.name}`);
    } catch (error) {
      log(1, `Error processing spells for class ${identifier}:`, error);
    }
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

    // Process actor spells FIRST (especially innate/special spells)
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

    // Process compendium spells (skip if already processed from actor)
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

    // Sort spells within each level
    for (const level in spellsByLevel) {
      if (spellsByLevel.hasOwnProperty(level)) spellsByLevel[level].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Convert to array format
    const result = Object.entries(spellsByLevel)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([level, spells]) => ({
        level: level,
        levelName: CONFIG.DND5E.spellLevels[level],
        spells: spells
      }));

    log(3, `Final organized spell levels for ${classIdentifier}: ${result.length}`);
    return result;
  }

  /**
   * Find actor spells that belong to a specific class
   * @param {string} classIdentifier - The class identifier
   * @param {Set<string>} processedSpellIds - Set of already processed spell IDs
   * @param {Set<string>} processedSpellNames - Set of already processed spell names
   * @returns {Array} Array of class-specific actor spells
   * @private
   */
  _findClassSpecificActorSpells(classIdentifier, processedSpellIds, processedSpellNames) {
    const actorSpells = this.actor.items.filter((item) => item.type === 'spell');
    const newSpells = [];
    const spellManager = this.app.spellManager;

    log(3, `Finding actor spells for class ${classIdentifier} - ${actorSpells.length} total spells`);

    for (const spell of actorSpells) {
      const spellId = spell.id || spell.uuid;
      const spellName = spell.name.toLowerCase();
      if (processedSpellIds.has(spellId) || processedSpellNames.has(spellName)) continue;
      const spellSourceClass = spell.system?.sourceClass || spell.sourceClass;
      if (spellSourceClass && spellSourceClass !== classIdentifier) continue;
      if (!spellSourceClass && spell.system.level === 0 && this._shouldHideCantrips(classIdentifier)) continue;

      // If spell doesn't have a sourceClass and it's not a cantrip, we need to determine if it belongs to this class
      // This is tricky - for now, we'll include unassigned spells for the first class that processes them
      // TODO: Dont set sourceClass for spells not manipulated by spell-book
      if (!spellSourceClass) {
        spell.sourceClass = classIdentifier;
        if (spell.system) spell.system.sourceClass = classIdentifier;
      }

      const source = spellManager._determineSpellSource(spell);
      newSpells.push({ spell, source });
    }

    log(3, `Found ${newSpells.length} additional spells for class ${classIdentifier}`);
    return newSpells;
  }

  /**
   * Calculate preparation statistics for a specific class
   * @param {string} classIdentifier - The class identifier
   * @param {Array} spellLevels - Spell level groups
   * @param {Item} classItem - The spellcasting class item
   * @returns {Object} Preparation stats object
   */
  calculatePreparationStats(classIdentifier, spellLevels, classItem) {
    try {
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

      return { current: preparedCount, maximum: maxPrepared };
    } catch (error) {
      log(1, `Error calculating preparation stats for class ${classIdentifier}:`, error);
      return { current: 0, maximum: 0 };
    }
  }

  /**
   * Update the global prepared spell count with proper error handling and logging
   */
  updateGlobalPreparationCount() {
    try {
      let totalPrepared = 0;
      let totalMaxPrepared = 0;

      for (const [identifier, classData] of Object.entries(this.classSpellData)) {
        if (classData.spellPreparation) {
          totalPrepared += classData.spellPreparation.current;
          totalMaxPrepared += classData.spellPreparation.maximum;
        }
      }

      // Update the global counts
      this.spellPreparation = {
        current: totalPrepared,
        maximum: totalMaxPrepared
      };

      log(3, `Updated global preparation count: ${totalPrepared}/${totalMaxPrepared}`);

      // Validate the numbers make sense
      if (totalMaxPrepared <= 0) {
        log(2, `Global max preparation is ${totalMaxPrepared}, this might indicate a data issue`);
      }
    } catch (error) {
      log(1, 'Error updating global preparation count:', error);
      this.spellPreparation = { current: 0, maximum: 0 };
    }
  }

  /**
   * Determine if cantrips should be hidden for a class
   * @param {string} identifier - Identifier of the class
   * @returns {boolean} Whether cantrips should be hidden
   * @private
   */
  _shouldHideCantrips(identifier) {
    try {
      const classRules = RuleSetManager.getClassRules(this.actor, identifier);
      if (classRules && classRules.showCantrips !== undefined) return !classRules.showCantrips; // invert because we want "hide" cantrips
      return [CLASS_IDENTIFIERS.PALADIN, CLASS_IDENTIFIERS.RANGER].includes(identifier);
    } catch (error) {
      log(1, `Error checking if cantrips should be hidden for ${identifier}:`, error);
      return false;
    }
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
    try {
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
          spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
        }
      }
    } catch (error) {
      log(1, 'Error enriching spell data:', error);
    }
  }

  /**
   * Handle cantrip level-up notification if needed
   */
  handleCantripLevelUp() {
    const cantripLevelUp = this.app.spellManager.checkForLevelUp();
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
    try {
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;
      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(actorLevel, classItem.spellcasting);
      const fullSpellList = await discoveryUtils.getClassSpellList(className, classUuid, null);
      if (!fullSpellList || !fullSpellList.size) return;
      const personalSpellbook = await this.app.wizardManager.getSpellbookSpells();
      this._fullWizardSpellList = new Set(fullSpellList);
      const allUuids = new Set([...fullSpellList, ...personalSpellbook]);
      const effectiveMaxLevel = Math.max(1, maxSpellLevel);
      const spellItems = await actorSpellUtils.fetchSpellDocuments(allUuids, effectiveMaxLevel);
      if (!spellItems || !spellItems.length) return;
      await this.processWizardSpells(spellItems, classItem, personalSpellbook);
    } catch (error) {
      log(1, 'Error loading wizard spell data:', error);
    }
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
    try {
      const activeTab = this.app.tabGroups['spellbook-tabs'];
      const tabData = {
        spellstab: {
          spellLevels: [],
          spellPreparation: { current: 0, maximum: 0 }
        },
        wizardbook: {
          spellLevels: [],
          spellPreparation: { current: 0, maximum: 0 }
        }
      };

      // Get the standard class identifier
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

      // Set sourceClass for each spell using the identifier
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

      // Store data for this wizard class
      this.classSpellData[identifier] = {
        spellLevels: activeTab === 'wizardbook' ? wizardLevels : prepLevels,
        className: classItem.name,
        spellPreparation: prepStats,
        classItem,
        tabData,
        identifier
      };

      // Update class-level tab data
      this.tabData = tabData;
    } catch (error) {
      log(1, 'Error processing wizard spells:', error);
    }
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
    const classItem = this.actor.items.get(classData.id);
    if (!classItem) return;
    const isWizardClass = this.app.wizardManager?.isWizard && this.app.wizardManager.classItem?.id === classItem.id;
    if (isWizardClass) await this.loadWizardSpellData(classItem);
    else await this.loadClassSpellData(classIdentifier, classItem);
    this.updateGlobalPreparationCount();
  }
}
