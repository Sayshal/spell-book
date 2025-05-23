import {
  CANTRIP_SWAP_TIMING,
  ENFORCEMENT_BEHAVIOR,
  FLAGS,
  MODULE,
  RITUAL_CASTING_MODES,
  RULE_SETS,
  SETTINGS,
  SPELL_SWAP_MODES,
  TEMPLATES
} from '../constants.mjs';
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
    return `${game.i18n.localize('SPELLBOOK.Settings.Title')}: ${this.actor.name}`;
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
      context.enforcementBehavior =
        this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) ||
        game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR);
      context.currentRuleSetLabel = game.i18n.localize(
        `SPELLBOOK.Settings.SpellcastingRuleSet.${context.currentRuleSet.charAt(0).toUpperCase() + context.currentRuleSet.slice(1)}`
      );

      // Detect spellcasting classes and get their current rules
      context.spellcastingClasses = await this._prepareClassSettings();

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
   * Prepare class-specific settings data
   * @returns {Promise<Array>} Array of class setting objects
   * @private
   */
  async _prepareClassSettings() {
    const classSettings = [];

    // Get all spellcasting classes
    const classItems = this.actor.items.filter(
      (item) =>
        item.type === 'class' &&
        item.system.spellcasting?.progression &&
        item.system.spellcasting.progression !== 'none'
    );

    for (const classItem of classItems) {
      const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
      const rules = RuleSetManager.getClassRules(this.actor, identifier);

      // Calculate current cantrip count for this class
      const currentCantrips = this.actor.items.filter(
        (item) =>
          item.type === 'spell' &&
          item.system.level === 0 &&
          item.system.preparation?.prepared &&
          !item.system.preparation?.alwaysPrepared &&
          (item.system.sourceClass === identifier || item.sourceClass === identifier)
      ).length;

      // Calculate max cantrips for this class
      const maxCantrips = this.spellManager.getMaxAllowed(identifier) || 0;

      classSettings.push({
        identifier,
        name: classItem.name,
        img: classItem.img,
        rules,
        stats: {
          currentCantrips,
          maxCantrips
        },
        // Disable cantrip options if cantrips are hidden
        cantripOptionsDisabled: !rules.showCantrips
      });
    }

    return classSettings.sort((a, b) => a.name.localeCompare(b.name));
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
        const index = await pack.getIndex();

        for (const journalData of index) {
          try {
            const journal = await pack.getDocument(journalData._id);

            for (const page of journal.pages) {
              if (page.type === 'spells') {
                options.push({
                  value: page.uuid,
                  label: `${page.name} (${pack.metadata.label})`
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

      log(3, `Saving enhanced spellbook settings for ${actor.name}`, formData);

      // Handle rule set override
      const ruleSetOverride = formData.object.ruleSetOverride === 'global' ? null : formData.object.ruleSetOverride;
      await actor.setFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE, ruleSetOverride);

      // Handle enforcement behavior
      const enforcementBehavior =
        formData.object.enforcementBehavior === 'global' ? null : formData.object.enforcementBehavior;
      await actor.setFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR, enforcementBehavior);

      // Process class-specific rules
      const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};

      // Find all class rule entries in form data
      for (const [key, value] of Object.entries(formData.object)) {
        const classMatch = key.match(/^class\.([^.]+)\.(.+)$/);
        if (classMatch) {
          const [, classId, property] = classMatch;

          if (!classRules[classId]) {
            classRules[classId] = RuleSetManager.getClassRules(actor, classId);
          }

          // Handle different property types
          if (property === 'preparationBonus') {
            classRules[classId][property] = parseInt(value) || 0;
          } else if (property === 'showCantrips') {
            classRules[classId][property] = Boolean(value);
          } else if (property === 'customSpellList') {
            classRules[classId][property] = value || null;
          } else {
            classRules[classId][property] = value;
          }
        }
      }

      // Save updated class rules
      await actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, classRules);

      // If rule set changed, apply new defaults to any classes that don't have custom overrides
      if (ruleSetOverride) {
        await RuleSetManager.applyRuleSetToActor(actor, ruleSetOverride);
      }

      ui.notifications.info(game.i18n.format('SPELLBOOK.Settings.Saved', { name: actor.name }));

      // Refresh any open spell book
      const spellBook = Object.values(foundry.applications.instances).find(
        (w) => w.id === `player-${MODULE.ID}` && w.actor.id === actor.id
      );

      if (spellBook) {
        log(3, 'Refreshing open spell book with new settings');
        spellBook.spellManager.refresh();
        spellBook.render(false);
      }

      return actor;
    } catch (error) {
      log(1, 'Error saving enhanced spellbook settings:', error);
      return null;
    }
  }
}
