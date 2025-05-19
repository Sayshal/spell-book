import { CANTRIP_RULES, CLASS_IDENTIFIERS, FLAGS, MODULE } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import * as actorSpellUtils from '../actor-spells.mjs';
import * as discoveryUtils from '../spell-discovery.mjs';
import * as formattingUtils from '../spell-formatting.mjs';

/**
 * Manages state for the spellbook application
 * Handles loading, processing, and organizing spell data
 */
export class SpellbookState {
  /**
   * Create a new spellbook state manager
   * @param {PlayerSpellBook} app - The parent application
   */
  constructor(app) {
    this.app = app;
    this.actor = app.actor;
    this.isLoading = true;
    this.spellLevels = [];
    this.className = '';
    this.spellPreparation = { current: 0, maximum: 0 };
    this.isLongRest = false;
    this.tabData = {};
    this.wizardSpellbookCache = null;

    // Multi-class spellcasting support
    this.spellcastingClasses = {};
    this.activeClass = null;
    this.classSpellData = {};
    this.classPrepModes = {};
    this.classRitualRules = {};
    this.classSwapRules = {};

    this._uiCantripCount = 0;
    this._cantripTracking = {
      originalChecked: new Set(),
      hasUnlearned: false,
      hasLearned: false,
      unlearned: null,
      learned: null
    };
    this._newlyCheckedCantrips = new Set();
    this._spellsTabNeedsReload = false;
  }

  /**
   * Initialize state manager and load spell data
   * @returns {Promise<boolean>} Success status
   * @async
   */
  async initialize() {
    try {
      this.isLongRest = !!this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING);
      await this.detectSpellcastingClasses();
      await this.loadSpellData();
      return true;
    } catch (error) {
      log(1, 'Error initializing spellbook state:', error);
      return false;
    }
  }

  /**
   * Detect and initialize all spellcasting classes for the actor
   * @returns {Promise<void>}
   * @async
   */
  async detectSpellcastingClasses() {
    try {
      // First check if actor has spellcastingClasses property
      if (this.actor.spellcastingClasses) {
        // For each spellcasting class, initialize data structures
        for (const [identifier, spellClass] of Object.entries(this.actor.spellcastingClasses)) {
          log(3, `Found spellcasting class: ${spellClass.name} (${identifier})`);

          this.spellcastingClasses[identifier] = spellClass;
          this.classSpellData[identifier] = {
            spellLevels: [],
            className: spellClass.name,
            spellPreparation: { current: 0, maximum: 0 },
            classItem: spellClass,
            type: spellClass.spellcasting?.type || 'leveled',
            progression: spellClass.spellcasting?.progression || 'none'
          };

          // Initialize preparation modes for this class
          this.classPrepModes[identifier] = this.getClassPreparationMode(spellClass);

          // Initialize ritual rules for this class
          this.classRitualRules[identifier] = this.getClassRitualRules(spellClass);

          // Initialize spell swap rules for this class
          this.classSwapRules[identifier] = this.getClassSwapRules(spellClass);
        }

        // Set the active class to the first one
        if (Object.keys(this.spellcastingClasses).length > 0) {
          this.activeClass = Object.keys(this.spellcastingClasses)[0];
        }

        // Log detected classes
        log(2, `Detected ${Object.keys(this.spellcastingClasses).length} spellcasting classes for ${this.actor.name}`);
      } else log(1, 'No spellcasting classes found for:', this.actor);
    } catch (error) {
      log(1, 'Error detecting spellcasting classes:', error);
    }
  }

  /**
   * Determine the preparation mode for a given class
   * @param {Item} classItem - The class item
   * @returns {string} The preparation mode
   */
  getClassPreparationMode(classItem) {
    // Default to "prepared" for most classes
    let prepMode = 'prepared';

    // Check if this is a pact magic caster
    if (classItem.spellcasting?.type === 'pact') {
      prepMode = 'pact';
    }

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

    // Get the class identifier
    const identifier = classItem.system?.identifier?.toLowerCase() || '';

    // Wizard special case - can cast rituals from spellbook without preparing
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
    // Get the class identifier
    const identifier = classItem.system?.identifier?.toLowerCase() || '';

    const rules = {
      canSwapCantrips: false,
      cantripSwapMode: 'none', // none, levelUp, longRest
      canSwapSpells: false,
      spellSwapMode: 'none' // none, levelUp, longRest, daily
    };

    // Set up default rules based on class
    switch (identifier) {
      case CLASS_IDENTIFIERS.BARD:
      case CLASS_IDENTIFIERS.SORCERER:
      case CLASS_IDENTIFIERS.WARLOCK:
        rules.canSwapSpells = true;
        rules.spellSwapMode = 'levelUp'; // Can swap 1 spell on level up
        break;
      case CLASS_IDENTIFIERS.CLERIC:
      case CLASS_IDENTIFIERS.DRUID:
        rules.canSwapSpells = true;
        rules.spellSwapMode = 'daily'; // Can prepare fresh set each day
        break;
      case CLASS_IDENTIFIERS.PALADIN:
        rules.canSwapSpells = true;
        rules.spellSwapMode = 'daily'; // Can prepare fresh set each day
        break;
      case CLASS_IDENTIFIERS.RANGER:
        rules.canSwapSpells = true;
        rules.spellSwapMode = 'levelUp'; // Can swap 1 spell on level up
        break;
      case CLASS_IDENTIFIERS.WIZARD:
        rules.canSwapSpells = true;
        rules.spellSwapMode = 'daily'; // Can prepare fresh set each day from spellbook
        rules.canSwapCantrips = true;
        rules.cantripSwapMode = 'longRest'; // Modern rules: can swap 1 cantrip on long rest
        break;
    }

    // Override with user settings
    const cantripRules = this.app.spellManager.getSettings().rules;
    if (cantripRules === CANTRIP_RULES.LEGACY) {
      rules.canSwapCantrips = false;
      rules.cantripSwapMode = 'none';
    } else if (cantripRules === CANTRIP_RULES.MODERN_LEVEL_UP) {
      rules.canSwapCantrips = true;
      rules.cantripSwapMode = 'levelUp';
    } else if (cantripRules === CANTRIP_RULES.MODERN_LONG_REST && identifier === CLASS_IDENTIFIERS.WIZARD) {
      rules.canSwapCantrips = true;
      rules.cantripSwapMode = 'longRest';
    }

    return rules;
  }

  /**
   * Load spell data for the actor
   * @returns {Promise<boolean>} Success status
   * @async
   */
  async loadSpellData() {
    try {
      await this.app.spellManager.initializeFlags();

      if (this.app.wizardManager?.isWizard) {
        await this.cacheWizardSpellbook();
      }

      if (Object.keys(this.spellcastingClasses).length === 0) {
        log(2, 'No spellcasting classes found for actor');
        this.isLoading = false;
        return false;
      }

      this.handleCantripLevelUp();

      // Process each spellcasting class
      for (const [identifier, classData] of Object.entries(this.spellcastingClasses)) {
        if (this.app.wizardManager?.isWizard) {
          await this.loadWizardSpellData(classData);
        } else {
          await this.loadClassSpellData(identifier, classData);
        }
      }

      // If we have an active class, use its data for the current view
      if (this.activeClass && this.classSpellData[this.activeClass]) {
        this.spellLevels = this.classSpellData[this.activeClass].spellLevels || [];
        this.className = this.classSpellData[this.activeClass].className || '';
        this.spellPreparation = this.classSpellData[this.activeClass].spellPreparation || { current: 0, maximum: 0 };
      } else if (Object.keys(this.classSpellData).length > 0) {
        // Fallback to first class if no active class
        const firstClassId = Object.keys(this.classSpellData)[0];
        this.spellLevels = this.classSpellData[firstClassId].spellLevels || [];
        this.className = this.classSpellData[firstClassId].className || '';
        this.spellPreparation = this.classSpellData[firstClassId].spellPreparation || { current: 0, maximum: 0 };
        this.activeClass = firstClassId;
      }

      this.isLoading = false;
      return true;
    } catch (error) {
      log(1, 'Error loading spell data:', error);
      this.isLoading = false;
      return false;
    }
  }

  /**
   * Handle cantrip level-up notification if needed
   */
  handleCantripLevelUp() {
    const cantripLevelUp = this.app.spellManager.checkForLevelUp();
    if (cantripLevelUp) {
      const settings = this.app.spellManager.getSettings();
      const message = settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LevelUpDefault' : 'SPELLBOOK.Cantrips.LevelUpModern';
      ui.notifications.info(game.i18n.localize(message));
    }
  }

  /**
   * Cache wizard spellbook spells
   * @returns {Promise<void>}
   * @async
   */
  async cacheWizardSpellbook() {
    if (this.app.wizardManager && this.app.wizardManager.isWizard) {
      this.wizardSpellbookCache = await this.app.wizardManager.getSpellbookSpells();
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

      const actorLevel = this.actor.system.details.level;
      let maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(actorLevel, classItem.spellcasting);

      // Check if this class should hide cantrips
      const hideCantrips = this._shouldHideCantrips(identifier);

      // For classes that don't have cantrips, ensure min level 1
      if (hideCantrips && maxSpellLevel > 0) {
        maxSpellLevel = Math.max(1, maxSpellLevel);
      }

      const spellItems = await actorSpellUtils.fetchSpellDocuments(spellList, maxSpellLevel);

      if (!spellItems || !spellItems.length) return;

      // Store spell data for this class
      await this.processAndOrganizeSpellsForClass(identifier, spellItems, classItem);
    } catch (error) {
      log(1, `Error loading spell data for class ${identifier}:`, error);
    }
  }

  /**
   * Process and organize spells for a specific class
   * @param {string} identifier - Identifier of the class
   * @param {Array} spellItems - Array of spell items
   * @param {Item} classItem - The class item
   * @returns {Promise<void>}
   * @async
   */
  async processAndOrganizeSpellsForClass(identifier, spellItems, classItem) {
    try {
      const spellLevels = actorSpellUtils.organizeSpellsByLevel(spellItems, this.actor, this.app.spellManager);
      const sortBy = this.app.filterHelper?.getFilterState()?.sortBy || 'level';

      for (const level of spellLevels) {
        level.spells = this.app.filterHelper?.sortSpells(level.spells, sortBy) || level.spells;

        // Set the sourceClass for each spell using the identifier
        for (const spell of level.spells) {
          spell.sourceClass = identifier;
        }
      }

      await this.enrichSpellData(spellLevels);

      const prepStats = this.calculatePreparationStats(spellLevels, classItem);

      this.classSpellData[identifier] = {
        spellLevels,
        className: classItem.name,
        spellPreparation: prepStats,
        classItem,
        identifier
      };
    } catch (error) {
      log(1, `Error processing spells for class ${identifier}:`, error);
    }
  }

  /**
   * Determine if cantrips should be hidden for a class
   * @param {string} identifier - Identifier of the class
   * @returns {boolean} Whether cantrips should be hidden
   * @private
   */
  _shouldHideCantrips(identifier) {
    // Check for class-specific flag using the identifier instead of ID
    const classCantripsFlag = this.actor.getFlag(MODULE.ID, `class.${identifier}.hideCantrips`);
    if (classCantripsFlag !== undefined) return !!classCantripsFlag;

    // Check global actor setting
    const actorCantripsFlag = this.actor.getFlag(MODULE.ID, 'hideCantrips');
    if (actorCantripsFlag !== undefined) {
      // If this is an object mapping class identifiers to settings, check it
      if (typeof actorCantripsFlag === 'object') {
        const setting = actorCantripsFlag[identifier];
        if (setting !== undefined) return !!setting;
      }
    }

    // Default behavior based on class identifiers
    return [CLASS_IDENTIFIERS.PALADIN, CLASS_IDENTIFIERS.RANGER].includes(identifier);
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
      const identifier = classItem.system?.identifier?.toLowerCase() || '';
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
      for (const spell of allSpellItems) {
        spell.sourceClass = identifier; // Use identifier instead of ID
      }

      const prepTabSpells = allSpellItems.filter((spell) => spell.system.level === 0 || personalSpellbook.includes(spell.compendiumUuid) || grantedSpells.includes(spell.compendiumUuid));
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

      const prepStats = this.calculatePreparationStats(prepLevels, classItem);
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
   * Calculate preparation statistics
   * @param {Array} spellLevels - Spell level groups
   * @param {Item} classItem - The spellcasting class item
   * @returns {Object} Preparation stats object
   */
  calculatePreparationStats(spellLevels, classItem) {
    try {
      let preparedCount = 0;
      let maxPrepared = 0;

      if (this.app.spellManager) {
        maxPrepared = this.app.spellManager.getMaxPrepared();
      } else if (classItem) {
        const spellcastingAbility = classItem.spellcasting?.ability;
        if (spellcastingAbility) {
          const abilityMod = this.actor.system.abilities[spellcastingAbility]?.mod || 0;
          const classLevel = classItem.system.levels || this.actor.system.details.level;
          maxPrepared = Math.max(1, classLevel + abilityMod);
        }
      }

      for (const level of spellLevels) {
        if (level.level === '0' || level.level === 0) continue;

        for (const spell of level.spells) {
          if (spell.preparation?.prepared && !spell.preparation?.alwaysPrepared) {
            preparedCount++;
          }
        }
      }

      return { current: preparedCount, maximum: maxPrepared };
    } catch (error) {
      log(1, 'Error calculating preparation stats:', error);
      return { current: 0, maximum: 0 };
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
          try {
            spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
            spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
          } catch (error) {
            log(1, `Failed to enrich spell: ${spell.name}`, error);
          }
        }
      }
    } catch (error) {
      log(1, 'Error enriching spell data:', error);
    }
  }

  /**
   * Set active class and update data
   * @param {string} identifier - The class identifer to set as active
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
   * Set long rest context for the spellbook
   * @param {boolean} isLongRest - Whether in long rest mode
   */
  setLongRestContext(isLongRest) {
    this.isLongRest = !!isLongRest;
    if (this.isLongRest) {
      this.actor.setFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING, true);
    }
  }
}
