import { CANTRIP_SWAP_TIMING, ENFORCEMENT_BEHAVIOR, FLAGS, MODULE, RITUAL_CASTING_MODES, RULE_SETS, SETTINGS, SPELL_SWAP_MODES, TEMPLATES } from '../constants.mjs';
import { RuleSetManager } from '../helpers/rule-set-manager.mjs';
import { SpellManager } from '../helpers/spell-preparation.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Enhanced dialog for configuring spell book settings with per-class rules
 */
export class SpellbookSettingsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-settings-dialog',
    tag: 'form',
    form: {
      handler: SpellbookSettingsDialog.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      increasePrepBonus: SpellbookSettingsDialog.increasePrepBonus,
      decreasePrepBonus: SpellbookSettingsDialog.decreasePrepBonus
    },
    classes: ['spellbook-settings-dialog'],
    window: {
      icon: 'fas fa-book-spells',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: {
      width: 600,
      height: 'auto'
    }
  };

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.SPELLBOOK_SETTINGS }
  };

  /**
   * @param {Actor5e} actor - The actor to configure settings for
   * @param {Object} [options={}] - Additional application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.spellManager = new SpellManager(actor);
  }

  /** @override */
  get title() {
    return game.i18n.format('SPELLBOOK.Settings.Title', { name: this.actor.name });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    try {
      // Initialize any new classes that might have been added
      await RuleSetManager.initializeNewClasses(this.actor);

      // Get current settings
      context.currentRuleSet = RuleSetManager.getEffectiveRuleSet(this.actor);
      context.ruleSetOverride = this.actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
      context.enforcementBehavior = this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR);
      context.currentRuleSetLabel = game.i18n.localize(
        `SPELLBOOK.Settings.SpellcastingRuleSet.${context.currentRuleSet.charAt(0).toUpperCase() + context.currentRuleSet.slice(1)}`
      );

      // Detect spellcasting classes and get their current rules
      context.spellcastingClasses = await this._prepareClassSettings();

      // Check if we have any notices to show
      context.hasNotices = context.spellcastingClasses.some((classData) => classData.rules._noScaleValue || classData.hasCustomSpellList);

      // Prepare available spell lists for custom selection
      context.availableSpellLists = await this._prepareSpellListOptions();

      // Add constants for template use
      context.RULE_SETS = RULE_SETS;
      context.CANTRIP_SWAP_TIMING = CANTRIP_SWAP_TIMING;
      context.SPELL_SWAP_MODES = SPELL_SWAP_MODES;
      context.RITUAL_CASTING_MODES = RITUAL_CASTING_MODES;
      context.ENFORCEMENT_BEHAVIOR = ENFORCEMENT_BEHAVIOR;

      context.actor = this.actor;

      log(3, 'Prepared spellbook settings context', context);
      return context;
    } catch (error) {
      log(1, 'Error preparing spellbook settings context:', error);
      return context;
    }
  }

  /**
   * Prepare class settings data including rules and stats
   * @returns {Promise<Array>} Array of class settings data
   * @private
   */
  async _prepareClassSettings() {
    try {
      const classSettings = [];

      // Get all spellcasting classes
      const classItems = this.actor.items.filter((item) => item.type === 'class' && item.system.spellcasting?.progression && item.system.spellcasting.progression !== 'none');

      for (const classItem of classItems) {
        const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
        const classRules = RuleSetManager.getClassRules(this.actor, identifier);

        // Get spell manager for this actor to check cantrip stats
        const spellManager = new SpellManager(this.actor);
        const maxCantrips = spellManager.getMaxAllowed(identifier);
        const currentCantrips = spellManager.getCurrentCount(identifier);

        // Check if using custom spell list
        const hasCustomSpellList = !!classRules.customSpellList;
        let customSpellListName = null;
        if (hasCustomSpellList) {
          try {
            const customList = await fromUuid(classRules.customSpellList);
            customSpellListName = customList?.name || 'Unknown List';
          } catch (error) {
            log(2, `Error loading custom spell list name: ${error.message}`);
          }
        }

        const classData = {
          name: classItem.name,
          identifier: identifier,
          img: classItem.img,
          rules: classRules,
          stats: {
            currentCantrips: currentCantrips,
            maxCantrips: maxCantrips,
            classLevel: classItem.system.levels || 1,
            basePreparationMax: classItem.system.spellcasting?.preparation?.max || 0
          },
          hasCustomSpellList: hasCustomSpellList,
          customSpellListName: customSpellListName
        };

        classSettings.push(classData);
      }

      // Sort by class name for consistent display
      classSettings.sort((a, b) => a.name.localeCompare(b.name));

      return classSettings;
    } catch (error) {
      log(1, 'Error preparing class settings:', error);
      return [];
    }
  }

  /**
   * Prepare available spell list options for custom selection
   * @returns {Promise<Array>} Array of spell list options
   * @private
   */
  async _prepareSpellListOptions() {
    try {
      const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Settings.SpellList.AutoDetect') }];

      // Get all available spell lists from compendiums
      const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');

      for (const pack of journalPacks) {
        let topLevelFolderName = pack.metadata.label;
        try {
          if (pack.folder) {
            if (pack.folder.depth !== 1) {
              topLevelFolderName = pack.folder.getParentFolders().at(-1).name;
            } else {
              topLevelFolderName = pack.folder.name;
            }
          }
        } catch (error) {
          log(1, `Error getting parent folders for pack ${pack.metadata.label}:`, error);
        }

        const index = await pack.getIndex();

        for (const journalData of index) {
          try {
            const journal = await pack.getDocument(journalData._id);

            for (const page of journal.pages) {
              if (page.type === 'spells') {
                options.push({
                  value: page.uuid,
                  label: `${page.name} (${topLevelFolderName})`
                });
              }
            }
          } catch (error) {
            // Skip inaccessible documents
            continue;
          }
        }
      }

      return options;
    } catch (error) {
      log(1, 'Error preparing spell list options:', error);
      return [{ value: '', label: game.i18n.localize('SPELLBOOK.Settings.SpellList.AutoDetect') }];
    }
  }

  /**
   * Increase preparation bonus for a specific class
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked button
   * @static
   */
  static increasePrepBonus(event, target) {
    try {
      // Get the class identifier from the button's data attribute
      const classIdentifier = target.dataset.class;
      if (!classIdentifier) {
        log(2, 'No class identifier found on preparation bonus button');
        return;
      }

      // Find the corresponding input field
      const input = this.element.querySelector(`input[name="class.${classIdentifier}.preparationBonus"]`);
      if (!input) {
        log(2, `Could not find preparation bonus input for class ${classIdentifier}`);
        return;
      }

      // Get current value and increment (with bounds checking)
      const currentValue = parseInt(input.value) || 0;
      const newValue = Math.min(currentValue + 1, 20); // Cap at +20 bonus

      // Update the input and trigger any change events
      input.value = newValue;
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Update the class stats display to reflect the change immediately
      this._updateClassStatsDisplay(classIdentifier, newValue);

      log(3, `Increased preparation bonus for ${classIdentifier} to ${newValue}`);
    } catch (error) {
      log(1, 'Error increasing preparation bonus:', error);
    }
  }

  /**
   * Decrease preparation bonus for a specific class
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked button
   * @static
   */
  static decreasePrepBonus(event, target) {
    try {
      // Get the class identifier from the button's data attribute
      const classIdentifier = target.dataset.class;
      if (!classIdentifier) {
        log(2, 'No class identifier found on preparation bonus button');
        return;
      }

      // Find the corresponding input field
      const input = this.element.querySelector(`input[name="class.${classIdentifier}.preparationBonus"]`);
      if (!input) {
        log(2, `Could not find preparation bonus input for class ${classIdentifier}`);
        return;
      }

      // Find the class item to get the base preparation maximum
      const classItem = this.actor.items.find(
        (item) => item.type === 'class' && (item.system.identifier?.toLowerCase() === classIdentifier || item.name.toLowerCase() === classIdentifier)
      );

      let minimumBonus = -10; // Fallback to old behavior if we can't find the class

      if (classItem) {
        const baseMax = classItem.system?.spellcasting?.preparation?.max || 0;
        // Allow decreasing until total preparation slots would be 0
        // So if base max is 6, minimum bonus is -6 (6 + (-6) = 0)
        minimumBonus = -baseMax;

        log(3, `Class ${classIdentifier} has base max ${baseMax}, allowing bonus down to ${minimumBonus}`);
      } else {
        log(2, `Could not find class item for identifier ${classIdentifier}, using fallback minimum`);
      }

      // Get current value and decrement (with dynamic bounds checking)
      const currentValue = parseInt(input.value) || 0;
      const newValue = Math.max(currentValue - 1, minimumBonus);

      // Update the input and trigger any change events
      input.value = newValue;
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Update the class stats display to reflect the change immediately
      this._updateClassStatsDisplay(classIdentifier, newValue);

      // Provide user feedback if they hit the minimum
      if (newValue === minimumBonus && currentValue > minimumBonus) {
        const baseMax = classItem?.system?.spellcasting?.preparation?.max || 0;
        const message =
          baseMax > 0 ?
            game.i18n.format('SPELLBOOK.Settings.PreparationBonus.MinimumReached', {
              class: classItem?.name || classIdentifier,
              total: baseMax + newValue
            })
          : game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.MinimumReachedGeneric');

        ui.notifications.info(message);
      }

      log(3, `Decreased preparation bonus for ${classIdentifier} to ${newValue}`);
    } catch (error) {
      log(1, 'Error decreasing preparation bonus:', error);
    }
  }

  /**
   * Update the visual display of class stats when preparation bonus changes
   * @param {string} classIdentifier - The class identifier
   * @param {number} newBonus - The new bonus value
   * @private
   */
  _updateClassStatsDisplay(classIdentifier, newBonus) {
    try {
      // Find the class stats display element
      const classSection = this.element.querySelector(`[data-class="${classIdentifier}"]`);
      const bonusDisplay = classSection?.querySelector('.preparation-bonus');

      if (bonusDisplay) {
        // Update the text content
        if (newBonus > 0) {
          bonusDisplay.textContent = `+${newBonus} ${game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.Text')}`;
        } else if (newBonus < 0) {
          bonusDisplay.textContent = `${newBonus} ${game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.Text')}`;
        } else {
          bonusDisplay.textContent = `±0 ${game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.Text')}`;
        }

        // Update the CSS class to show visual distinction for non-zero bonuses
        bonusDisplay.classList.toggle('has-bonus', newBonus !== 0);
      }
    } catch (error) {
      log(2, 'Error updating class stats display:', error);
    }
  }

  /**
   * Form handler for saving spellbook settings
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {Object} formData - The form data
   * @returns {Promise<Actor5e|null>} The actor or null if error
   */
  static async formHandler(_event, _form, formData) {
    try {
      const actor = this.actor;
      if (!actor) return null;

      const expandedData = foundry.utils.expandObject(formData.object);
      const currentClassRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};

      // Handle rule set override
      const ruleSetOverride = expandedData.ruleSetOverride === 'global' ? null : expandedData.ruleSetOverride;
      const previousRuleSetOverride = actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);

      await actor.setFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE, ruleSetOverride);

      // Handle enforcement behavior
      const enforcementBehavior = expandedData.enforcementBehavior === 'global' ? null : expandedData.enforcementBehavior;
      await actor.setFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR, enforcementBehavior);

      // If rule set changed, apply new defaults first
      if (ruleSetOverride && ruleSetOverride !== previousRuleSetOverride) {
        await RuleSetManager.applyRuleSetToActor(actor, ruleSetOverride);
      }

      // Track cantrip visibility changes for cleanup
      const cantripVisibilityChanges = {};

      // Apply class rule changes
      if (expandedData.class) {
        for (const [classId, rules] of Object.entries(expandedData.class)) {
          // Check if showCantrips changed
          const currentRules = currentClassRules[classId] || {};
          const wasShowingCantrips = currentRules.showCantrips !== false;
          const willShowCantrips = rules.showCantrips !== false;

          if (wasShowingCantrips && !willShowCantrips) {
            cantripVisibilityChanges[classId] = 'disabled';
          } else if (!wasShowingCantrips && willShowCantrips) {
            cantripVisibilityChanges[classId] = 'enabled';
          }

          // Process the rules
          const processedRules = {};

          if (rules.preparationBonus !== undefined) {
            processedRules.preparationBonus = parseInt(rules.preparationBonus) || 0;
          }

          if (rules.showCantrips !== undefined) {
            processedRules.showCantrips = Boolean(rules.showCantrips);
          }

          if (rules.customSpellList !== undefined) {
            processedRules.customSpellList = rules.customSpellList || null;
          }

          ['cantripSwapping', 'spellSwapping', 'ritualCasting'].forEach((prop) => {
            if (rules[prop] !== undefined) {
              processedRules[prop] = rules[prop];
            }
          });

          await RuleSetManager.updateClassRules(actor, classId, processedRules);
        }
      }

      // Handle cantrip cleanup/restoration
      if (Object.keys(cantripVisibilityChanges).length > 0) {
        await SpellbookSettingsDialog._handleCantripVisibilityChanges(actor, cantripVisibilityChanges);
      }

      // Find and refresh open spellbooks
      const allInstances = Array.from(foundry.applications.instances.values());
      const openSpellbooks = allInstances.filter((w) => w.constructor.name === 'PlayerSpellBook' && w.actor.id === actor.id);

      for (const spellbook of openSpellbooks) {
        await spellbook.refreshFromSettingsChange();
      }

      ui.notifications.info(game.i18n.format('SPELLBOOK.Settings.Saved', { name: actor.name }));
      return actor;
    } catch (error) {
      log(1, 'Error saving spellbook settings:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Settings.SaveError'));
      return null;
    }
  }

  /**
   * Handle cantrip visibility changes - cleanup when disabled, restore when enabled
   * @param {Actor5e} actor - The actor
   * @param {Object} changes - Object mapping class IDs to 'enabled'/'disabled'
   * @returns {Promise<void>}
   * @private
   */
  static async _handleCantripVisibilityChanges(actor, changes) {
    const spellManager = new SpellManager(actor);

    for (const [classId, changeType] of Object.entries(changes)) {
      if (changeType === 'disabled') {
        // Remove cantrips from actor items
        const cantripsToRemove = actor.items
          .filter(
            (item) =>
              item.type === 'spell' &&
              item.system.level === 0 &&
              (item.system.sourceClass === classId || item.sourceClass === classId) &&
              !item.system.preparation?.alwaysPrepared &&
              !item.flags?.dnd5e?.cachedFor
          )
          .map((item) => item.id);

        if (cantripsToRemove.length > 0) {
          await actor.deleteEmbeddedDocuments('Item', cantripsToRemove);
        }

        // Clean up prepared spells flags
        await spellManager.cleanupCantripsForClass(classId);
      }
    }
  }
}
