import { CANTRIP_RULES, ENFORCEMENT_BEHAVIOR, FLAGS, MODULE, TEMPLATES, WIZARD_DEFAULTS } from '../constants.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
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

  /** @type {SpellManager} Manager for handling cantrip operations */
  spellManager = null;

  /** @type {WizardSpellbookManager} Manager for handling wizard spellbook operations */
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

    if (genericUtils.isWizard(actor)) {
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
    const context = await super._prepareContext(options);
    try {
      context.cantripSettings = this.spellManager.getSettings();
      context.stats = { maxCantrips: this.spellManager.getMaxAllowed(), currentCount: this.spellManager.getCurrentCount() };
      log(3, `Current cantrip settings: rules=${context.cantripSettings.rules}, behavior=${context.cantripSettings.behavior}`);
      context.isWizard = !!this.wizardManager?.isWizard;
      log(1, 'Wizard?', context.isWizard);
      context.forceWizardMode = this.actor.getFlag(MODULE.ID, FLAGS.FORCE_WIZARD_MODE) || false;
      context.CANTRIP_RULES = CANTRIP_RULES;
      context.ENFORCEMENT_BEHAVIOR = ENFORCEMENT_BEHAVIOR;
      context.actor = this.actor;
      if (context.isWizard) {
        context.wizardSettings = {
          startingSpells: this.actor.getFlag(MODULE.ID, 'wizardStartingSpells') || WIZARD_DEFAULTS.STARTING_SPELLS,
          spellsPerLevel: this.actor.getFlag(MODULE.ID, 'wizardSpellsPerLevel') || WIZARD_DEFAULTS.SPELLS_PER_LEVEL,
          ritualCasting: this.actor.getFlag(MODULE.ID, 'wizardRitualCasting') !== false
        };
        log(3, `Current wizard settings:`, context.wizardSettings);
      }
      log(1, 'Context', context);
      return context;
    } catch (error) {
      log(1, 'Error preparing spellbook settings context:', error);
      return context;
    }
  }

  /**
   * Handle disabling ritual casting and remove affected spells
   * @param {Actor5e} actor - The actor to process
   * @param {boolean} previousRitualCasting - Previous ritual casting setting
   * @param {boolean} newRitualCasting - New ritual casting setting
   * @returns {Promise<void>}
   * @private
   */
  static async _handleRitualCastingChange(actor, previousRitualCasting, newRitualCasting) {
    if (previousRitualCasting && !newRitualCasting) {
      const ritualModeSpells = actor.items.filter((i) => i.type === 'spell' && i.system.preparation?.mode === 'ritual');
      if (ritualModeSpells.length > 0) {
        await actor.deleteEmbeddedDocuments(
          'Item',
          ritualModeSpells.map((s) => s.id)
        );
      }
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
      log(3, `Saving spellbook settings for ${actor.name}`);
      const { cantripRules, enforcementBehavior, wizardStartingSpells, wizardSpellsPerLevel, wizardRitualCasting, forceWizardMode } = formData.object;
      log(3, `New cantrip settings: rules=${cantripRules}, behavior=${enforcementBehavior}, Force wizard mode: ${forceWizardMode}`);
      const spellManager = new SpellManager(actor);
      await spellManager.saveSettings(cantripRules, enforcementBehavior);
      actor.setFlag(MODULE.ID, FLAGS.FORCE_WIZARD_MODE, !!forceWizardMode);
      const isWizard = genericUtils.isWizard(actor);

      if (isWizard) {
        const previousRitualCasting = actor.getFlag(MODULE.ID, 'wizardRitualCasting') !== false; // Default true
        const updateData = {
          [`flags.${MODULE.ID}.wizardStartingSpells`]: parseInt(wizardStartingSpells) || WIZARD_DEFAULTS.STARTING_SPELLS,
          [`flags.${MODULE.ID}.wizardSpellsPerLevel`]: parseInt(wizardSpellsPerLevel) || WIZARD_DEFAULTS.SPELLS_PER_LEVEL,
          [`flags.${MODULE.ID}.wizardRitualCasting`]: !!wizardRitualCasting
        };

        log(3, `New wizard settings:`, updateData);
        await actor.update(updateData);
        await SpellbookSettingsDialog._handleRitualCastingChange(actor, previousRitualCasting, !!wizardRitualCasting);
      }

      ui.notifications.info(game.i18n.format('SPELLBOOK.Settings.Saved', { name: actor.name }));
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
