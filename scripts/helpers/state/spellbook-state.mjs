import { FLAGS, MODULE } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import * as actorSpellUtils from '../actor-spells.mjs';
import * as genericUtils from '../generic-utils.mjs';
import * as discoveryUtils from '../spell-discovery.mjs';
import * as formattingUtils from '../spell-formatting.mjs';

export class SpellbookState {
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

  async initialize() {
    try {
      this.isLongRest = !!this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING);
      await this.loadSpellData();
      return true;
    } catch (error) {
      log(1, 'Error initializing spellbook state:', error);
      return false;
    }
  }

  async loadSpellData() {
    try {
      // Initialize flags
      await this.app.spellManager.initializeFlags();

      // Cache wizard spellbook if needed
      if (this.app.wizardManager?.isWizard) {
        await this.cacheWizardSpellbook();
      }

      // Load spellcasting class
      const classItem = await this.loadSpellcastingClass();
      if (!classItem) {
        log(1, 'No spellcasting class found for actor');
        this.isLoading = false;
        return false;
      }

      // Check for cantrip level-up
      this.handleCantripLevelUp();

      // Load appropriate spell data
      if (this.app.wizardManager?.isWizard) {
        await this.loadWizardSpellData(classItem);
      } else {
        await this.loadRegularSpellData(classItem);
      }

      this.isLoading = false;
      return true;
    } catch (error) {
      log(1, 'Error loading spell data:', error);
      this.isLoading = false;
      return false;
    }
  }

  async loadSpellcastingClass() {
    try {
      return genericUtils.findSpellcastingClass(this.actor);
    } catch (error) {
      log(1, 'Error finding spellcasting class:', error);
      return null;
    }
  }

  handleCantripLevelUp() {
    const cantripLevelUp = this.app.spellManager.checkForLevelUp();
    if (cantripLevelUp) {
      const settings = this.app.spellManager.getSettings();
      const message = settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LevelUpDefault' : 'SPELLBOOK.Cantrips.LevelUpModern';

      ui.notifications.info(game.i18n.localize(message));
    }
  }

  async cacheWizardSpellbook() {
    if (this.app.wizardManager && this.app.wizardManager.isWizard) {
      this.wizardSpellbookCache = await this.app.wizardManager.getSpellbookSpells();
    }
  }

  async loadRegularSpellData(classItem) {
    try {
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;

      const spellList = await discoveryUtils.getClassSpellList(className, classUuid, this.actor);
      if (!spellList || !spellList.size) return;

      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);

      const spellItems = await actorSpellUtils.fetchSpellDocuments(spellList, maxSpellLevel);
      if (!spellItems || !spellItems.length) return;

      await this.processAndOrganizeSpells(spellItems, classItem);
    } catch (error) {
      log(1, 'Error loading regular spell data:', error);
    }
  }

  async loadWizardSpellData(classItem) {
    try {
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;
      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);

      // 1. Get full class spell list
      const fullSpellList = await discoveryUtils.getClassSpellList(className, classUuid, null);
      if (!fullSpellList || !fullSpellList.size) return;

      // 2. Get personal spellbook
      const personalSpellbook = await this.app.wizardManager.getSpellbookSpells();

      // Store for filtering
      this._fullWizardSpellList = new Set(fullSpellList);

      // 3. Load all spells from both sources
      const allUuids = new Set([...fullSpellList, ...personalSpellbook]);
      const effectiveMaxLevel = Math.max(1, maxSpellLevel);
      const spellItems = await actorSpellUtils.fetchSpellDocuments(allUuids, effectiveMaxLevel);

      if (!spellItems || !spellItems.length) return;

      // 4. Process spells for both tabs
      await this.processWizardSpells(spellItems, classItem, personalSpellbook);
    } catch (error) {
      log(1, 'Error loading wizard spell data:', error);
    }
  }

  async processWizardSpells(allSpellItems, classItem, personalSpellbook) {
    try {
      const activeTab = this.app.tabGroups['spellbook-tabs'];

      // Create tab data structure
      const tabData = {
        spellstab: {
          spellLevels: [],
          spellPreparation: { current: 0, maximum: 0 }
        },
        wizardtab: {
          spellLevels: [],
          spellPreparation: { current: 0, maximum: 0 }
        }
      };

      // Calculate wizard spellbook info
      const totalFreeSpells = this.app.wizardManager.getTotalFreeSpells();
      const usedFreeSpells = await this.app.wizardManager.getUsedFreeSpells();
      const remainingFreeSpells = Math.max(0, totalFreeSpells - usedFreeSpells);
      const totalSpells = personalSpellbook.length;

      // Add to wizard tab data
      tabData.wizardtab.wizardTotalSpellbookCount = totalSpells;
      tabData.wizardtab.wizardFreeSpellbookCount = totalFreeSpells;
      tabData.wizardtab.wizardRemainingFreeSpells = remainingFreeSpells;
      tabData.wizardtab.wizardHasFreeSpells = remainingFreeSpells > 0;

      // Find granted spells
      const grantedSpells = this.actor.items
        .filter((i) => i.type === 'spell' && (i.flags?.dnd5e?.cachedFor || (i.system?.preparation?.mode && ['pact', 'innate', 'atwill'].includes(i.system.preparation.mode))))
        .map((i) => i.flags?.core?.sourceId || i.uuid)
        .filter(Boolean);

      // Filter spells for each tab
      const prepTabSpells = allSpellItems.filter((spell) => spell.system.level === 0 || personalSpellbook.includes(spell.compendiumUuid) || grantedSpells.includes(spell.compendiumUuid));

      const wizardTabSpells = allSpellItems.filter((spell) => this._fullWizardSpellList.has(spell.compendiumUuid) && spell.system.level !== 0);

      // Organize spells into levels
      const prepLevels = actorSpellUtils.organizeSpellsByLevel(prepTabSpells, this.actor, this.app.spellManager);
      const wizardLevels = actorSpellUtils.organizeSpellsByLevel(wizardTabSpells, null, this.app.spellManager);

      // Calculate wizard limits
      const maxSpellsAllowed = this.app.wizardManager.getMaxSpellsAllowed();
      const isAtMaxSpells = personalSpellbook.length >= maxSpellsAllowed;

      // Add to wizard tab data
      tabData.wizardtab.wizardMaxSpellbookCount = maxSpellsAllowed;
      tabData.wizardtab.wizardIsAtMax = isAtMaxSpells;

      // Sort and enrich spell data
      const sortBy = this.app.filterHelper.getFilterState().sortBy || 'level';

      // Process and enrich spells for both tabs
      this.enrichWizardTabSpells(prepLevels, personalSpellbook, sortBy);
      this.enrichWizardTabSpells(wizardLevels, personalSpellbook, sortBy, true, isAtMaxSpells);

      // Calculate preparation stats
      const prepStats = this.calculatePreparationStats(prepLevels, classItem);

      // Store data for each tab
      tabData.spellstab.spellLevels = prepLevels;
      tabData.spellstab.spellPreparation = prepStats;
      tabData.wizardtab.spellLevels = wizardLevels;
      tabData.wizardtab.spellPreparation = prepStats; // Same stats for both tabs

      // Set current active tab data
      this.spellLevels = tabData[activeTab].spellLevels;
      this.spellPreparation = tabData[activeTab].spellPreparation;
      this.className = classItem.name;

      // Store tab data for quick switching
      this.tabData = tabData;
    } catch (error) {
      log(1, 'Error processing wizard spells:', error);
    }
  }

  enrichWizardTabSpells(levels, personalSpellbook, sortBy, isWizardTab = false, isAtMaxSpells = false) {
    // Sort spells within each level
    for (const level of levels) {
      level.spells = this.app.filterHelper.sortSpells(level.spells, sortBy);

      // Add wizard-specific data
      for (const spell of level.spells) {
        spell.isWizardClass = true;
        spell.inWizardSpellbook = personalSpellbook.includes(spell.compendiumUuid);

        // Only add canAddToSpellbook if this is the wizard tab
        if (isWizardTab) {
          spell.canAddToSpellbook = !spell.inWizardSpellbook && spell.system.level > 0;
          spell.isAtMaxSpells = isAtMaxSpells;
        }

        spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
        spell.formattedDetails = formattingUtils.formatSpellDetails(spell);
      }
    }
  }

  calculatePreparationStats(spellLevels, classItem) {
    try {
      let preparedCount = 0;
      let maxPrepared = 0;

      if (this.app.spellManager) {
        maxPrepared = this.app.spellManager.getMaxPrepared();
      } else if (classItem) {
        const spellcastingAbility = classItem.system.spellcasting?.ability;
        if (spellcastingAbility) {
          const abilityMod = this.actor.system.abilities[spellcastingAbility]?.mod || 0;
          const classLevel = classItem.system.levels || this.actor.system.details.level;
          maxPrepared = Math.max(1, classLevel + abilityMod);
        }
      }

      // Count prepared spells (excluding cantrips)
      for (const level of spellLevels) {
        if (level.level === '0' || level.level === 0) continue;

        for (const spell of level.spells) {
          if (spell.preparation.prepared && !spell.preparation.alwaysPrepared) {
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

  async processAndOrganizeSpells(spellItems, classItem) {
    try {
      let filteredSpellItems = [...spellItems];

      if (this.app.wizardManager?.isWizard) {
        const activeTab = this.app.tabGroups['spellbook-tabs'];
        const spellbookSpells = await this.app.wizardManager.getSpellbookSpells();

        if (activeTab === 'spellstab') {
          filteredSpellItems = spellItems.filter((spell) => spell.system.level === 0 || spellbookSpells.includes(spell.compendiumUuid));
        }
      }

      // Organize spells by level
      const spellLevels = actorSpellUtils.organizeSpellsByLevel(filteredSpellItems, this.actor, this.app.spellManager);

      // Sort spells
      const sortBy = this.app.filterHelper.getFilterState().sortBy || 'level';
      for (const level of spellLevels) {
        level.spells = this.app.filterHelper.sortSpells(level.spells, sortBy);
      }

      // Add wizard-specific data if needed
      if (this.app.wizardManager?.isWizard) {
        const spellbookSpells = await this.app.wizardManager.getSpellbookSpells();

        for (const level of spellLevels) {
          for (const spell of level.spells) {
            spell.isWizardClass = true;
            spell.inWizardSpellbook = spellbookSpells.includes(spell.compendiumUuid);
            spell.canAddToSpellbook = !spell.inWizardSpellbook && spell.system.level > 0;

            if (this.app.tabGroups['spellbook-tabs'] === 'spellstab' && spell.system.level > 0 && !spell.inWizardSpellbook) {
              if (spell.preparation) {
                spell.preparation.disabled = true;
                spell.preparation.disabledReason = 'SPELLBOOK.Wizard.NotInSpellbook';
              }
            }
          }
        }
      }

      // Enrich spell data
      await this.enrichSpellData(spellLevels);

      // Calculate preparation stats
      const prepStats = this.calculatePreparationStats(spellLevels, classItem);

      // Update state
      this.spellLevels = spellLevels;
      this.className = classItem.name;
      this.spellPreparation = prepStats;
    } catch (error) {
      log(1, 'Error processing spell data:', error);
    }
  }

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

  setLongRestContext(isLongRest) {
    this.isLongRest = !!isLongRest;

    if (this.isLongRest) {
      this.actor.setFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING, true);
    }
  }
}
