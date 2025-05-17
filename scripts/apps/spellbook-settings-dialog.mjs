import { CANTRIP_RULES, ENFORCEMENT_BEHAVIOR, FLAGS, MODULE, TEMPLATES, WIZARD_DEFAULTS } from '../constants.mjs';
import { SpellManager } from '../helpers/spell-preparation.mjs';
import { WizardSpellbookManager } from '../helpers/wizard-spellbook.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for configuring spell book settings for an actor
 */
export class SpellbookSettingsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

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
      width: 450,
      height: 'auto'
    }
  };

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.SPELLBOOK_SETTINGS }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /** The actor these settings apply to */
  actor = null;

  /**
   * Manager for handling cantrip operations
   * @type {SpellManager}
   */
  spellManager = null;

  /**
   * Manager for handling wizard spellbook operations
   * @type {WizardSpellbookManager}
   */
  wizardManager = null;

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Actor5e} actor - The actor to configure settings for
   * @param {Object} [options={}] - Additional application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.spellManager = new SpellManager(actor);
    const forceWizardMode = actor.getFlag(MODULE.ID, FLAGS.FORCE_WIZARD_MODE);
    const wizardClass = actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === 'wizard');
    if (wizardClass || forceWizardMode) {
      this.wizardManager = new WizardSpellbookManager(actor);
    }
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /** @override */
  get title() {
    return `${game.i18n.localize('SPELLBOOK.Settings.Title')}: ${this.actor.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = super._prepareContext(options);
    try {
      log(3, 'Preparing SpellbookSettingsDialog context');

      // Get cantrip settings
      context.cantripSettings = this.spellManager.getSettings();
      context.stats = {
        maxCantrips: this.spellManager.getMaxAllowed(),
        currentCount: this.spellManager.getCurrentCount()
      };

      log(3, `Current cantrip settings: rules=${context.cantripSettings.rules}, behavior=${context.cantripSettings.behavior}`);
      log(3, `Cantrip stats: ${context.stats.currentCount}/${context.stats.maxCantrips}`);

      // Wizard settings
      context.isWizard = !!this.wizardManager?.isWizard;
      context.forceWizardMode = this.actor.getFlag(MODULE.ID, FLAGS.FORCE_WIZARD_MODE) || false;

      context.wizardSettings = {};

      if (context.isWizard) {
        context.wizardSettings = {
          startingSpells: this.actor.getFlag(MODULE.ID, 'wizardStartingSpells') || WIZARD_DEFAULTS.STARTING_SPELLS,
          spellsPerLevel: this.actor.getFlag(MODULE.ID, 'wizardSpellsPerLevel') || WIZARD_DEFAULTS.SPELLS_PER_LEVEL,
          ritualCasting: this.actor.getFlag(MODULE.ID, 'wizardRitualCasting') !== false
        };
        log(3, `Current wizard settings:`, context.wizardSettings);
      }

      // Include constants
      context.CANTRIP_RULES = CANTRIP_RULES;
      context.ENFORCEMENT_BEHAVIOR = ENFORCEMENT_BEHAVIOR;
      context.actor = this.actor;

      return context;
    } catch (error) {
      log(1, 'Error preparing spellbook settings context:', error);

      context.actor = this.actor;
      context.cantripSettings = {
        rules: CANTRIP_RULES.LEGACY,
        behavior: ENFORCEMENT_BEHAVIOR.NOTIFY_GM
      };
      context.CANTRIP_RULES = CANTRIP_RULES;
      context.ENFORCEMENT_BEHAVIOR = ENFORCEMENT_BEHAVIOR;
      context.stats = { maxCantrips: 0, currentCount: 0 };

      return context;
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
      if (!actor) {
        log(1, 'No actor found');
        return null;
      }

      log(3, `Saving spellbook settings for ${actor.name}`);

      // Extract form data
      const { cantripRules, enforcementBehavior, wizardStartingSpells, wizardSpellsPerLevel, wizardRitualCasting, forceWizardMode } = formData.object;

      log(3, `New cantrip settings: rules=${cantripRules}, behavior=${enforcementBehavior}`);
      log(3, `Force wizard mode: ${forceWizardMode}`);

      // Save cantrip settings
      const spellManager = new SpellManager(actor);
      await spellManager.saveSettings(cantripRules, enforcementBehavior);

      // Save force wizard mode setting
      await actor.setFlag(MODULE.ID, FLAGS.FORCE_WIZARD_MODE, !!forceWizardMode);

      // Check if actor is a wizard or has force wizard mode enabled
      const isWizard = !!actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === 'wizard') || !!forceWizardMode;

      if (isWizard) {
        // Get previous ritual casting setting before updating
        const previousRitualCasting = actor.getFlag(MODULE.ID, 'wizardRitualCasting') !== false; // Default true

        const updateData = {
          [`flags.${MODULE.ID}.wizardStartingSpells`]: parseInt(wizardStartingSpells) || WIZARD_DEFAULTS.STARTING_SPELLS,
          [`flags.${MODULE.ID}.wizardSpellsPerLevel`]: parseInt(wizardSpellsPerLevel) || WIZARD_DEFAULTS.SPELLS_PER_LEVEL,
          [`flags.${MODULE.ID}.wizardRitualCasting`]: !!wizardRitualCasting
        };

        log(3, `New wizard settings:`, updateData);
        await actor.update(updateData);

        // Check if ritual casting is being disabled
        if (previousRitualCasting && !wizardRitualCasting) {
          // Find ritual spells in ritual mode
          const ritualModeSpells = actor.items.filter((i) => i.type === 'spell' && i.system.preparation?.mode === 'ritual');

          if (ritualModeSpells.length > 0) {
            log(3, `Removing ${ritualModeSpells.length} ritual spells due to disabled ritual casting`);
            await actor.deleteEmbeddedDocuments(
              'Item',
              ritualModeSpells.map((s) => s.id)
            );
          }
        }
      }

      // Show success notification
      ui.notifications.info(
        game.i18n.format('SPELLBOOK.Settings.Saved', {
          name: actor.name
        })
      );

      // Find and re-render the actor's spell book if it's open
      const spellBook = Object.values(foundry.applications.instances).find((w) => w.id === `player-${MODULE.ID}` && w.actor.id === actor.id);

      if (spellBook) {
        log(3, 'Refreshing open spell book with new settings');
        spellBook.spellManager.refresh();
        spellBook.render(false);
      }

      return actor;
    } catch (error) {
      log(1, 'Error saving spellbook settings:', error);
      return null;
    }
  }
}
