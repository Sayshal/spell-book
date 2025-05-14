import { CANTRIP_CHANGE_BEHAVIOR, CANTRIP_RULES, FLAGS, MODULE, TEMPLATES, WIZARD_DEFAULTS, WIZARD_RULES } from '../constants.mjs';
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

    if (!actor) {
      throw new Error('Actor is required for SpellbookSettingsDialog');
    }

    log(3, `Initializing SpellbookSettingsDialog for ${actor.name}`);
    this.actor = actor;
    this.spellManager = new SpellManager(actor);

    // Check if actor is a wizard
    const wizardClass = actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === 'wizard');
    if (wizardClass) {
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
    try {
      log(3, 'Preparing SpellbookSettingsDialog context');

      // Get cantrip settings
      const cantripSettings = this.spellManager.getSettings();
      const maxCantrips = this.spellManager.getMaxAllowed();
      const currentCount = this.spellManager.getCurrentCount();

      log(3, `Current cantrip settings: rules=${cantripSettings.rules}, behavior=${cantripSettings.behavior}`);
      log(3, `Cantrip stats: ${currentCount}/${maxCantrips}`);

      // Get wizard settings if applicable
      const isWizard = !!this.wizardManager?.isWizard;
      let wizardSettings = {};

      if (isWizard) {
        wizardSettings = {
          rulesVersion: this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_RULES_VERSION) || (game.settings.get('dnd5e', 'rulesVersion') === 'modern' ? WIZARD_RULES.MODERN : WIZARD_RULES.LEGACY),
          startingSpells: this.actor.getFlag(MODULE.ID, 'wizardStartingSpells') || WIZARD_DEFAULTS.STARTING_SPELLS,
          spellsPerLevel: this.actor.getFlag(MODULE.ID, 'wizardSpellsPerLevel') || WIZARD_DEFAULTS.SPELLS_PER_LEVEL,
          ritualCasting: this.actor.getFlag(MODULE.ID, 'wizardRitualCasting') !== false // Default to true if not set
        };
        log(3, `Current wizard settings:`, wizardSettings);
      }

      return {
        actor: this.actor,
        isWizard,
        stats: {
          maxCantrips,
          currentCount
        },
        cantripOptions: {
          rules: {
            default: {
              value: CANTRIP_RULES.DEFAULT,
              label: game.i18n.localize('SPELLBOOK.Cantrips.RulesDefault'),
              selected: cantripSettings.rules === CANTRIP_RULES.DEFAULT
            },
            modern: {
              value: CANTRIP_RULES.MODERN,
              label: game.i18n.localize('SPELLBOOK.Cantrips.RulesModern'),
              selected: cantripSettings.rules === CANTRIP_RULES.MODERN
            }
          },
          behavior: {
            unrestricted: {
              value: CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED,
              label: game.i18n.localize('SPELLBOOK.Cantrips.BehaviorUnrestricted'),
              selected: cantripSettings.behavior === CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED
            },
            notifyGM: {
              value: CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM,
              label: game.i18n.localize('SPELLBOOK.Cantrips.BehaviorNotifyGM'),
              selected: cantripSettings.behavior === CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM
            },
            lockAfterMax: {
              value: CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX,
              label: game.i18n.localize('SPELLBOOK.Cantrips.BehaviorLockAfterMax'),
              selected: cantripSettings.behavior === CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX
            }
          }
        },
        wizardSettings,
        wizardOptions:
          isWizard ?
            {
              rules: {
                modern: {
                  value: WIZARD_RULES.MODERN,
                  label: game.i18n.localize('SPELLBOOK.Wizard.RulesModern'),
                  selected: wizardSettings.rulesVersion === WIZARD_RULES.MODERN
                },
                legacy: {
                  value: WIZARD_RULES.LEGACY,
                  label: game.i18n.localize('SPELLBOOK.Wizard.RulesLegacy'),
                  selected: wizardSettings.rulesVersion === WIZARD_RULES.LEGACY
                }
              }
            }
          : {}
      };
    } catch (error) {
      log(1, 'Error preparing spellbook settings context:', error);
      return {
        actor: this.actor,
        cantripOptions: {},
        wizardOptions: {},
        stats: { maxCantrips: 0, currentCount: 0 }
      };
    }
  }

  /**
   * Form handler for saving spellbook settings
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {Object} formData - The form data
   * @returns {Promise<Actor5e|null>} The actor or null if error
   */
  static async formHandler(_event, form, formData) {
    try {
      const actor = this.actor;
      if (!actor) {
        log(1, 'No actor found');
        return null;
      }

      log(3, `Saving spellbook settings for ${actor.name}`);

      // Extract form data
      const { cantripRules, cantripBehavior, wizardRulesVersion, wizardStartingSpells, wizardSpellsPerLevel, wizardRitualCasting } = formData.object;

      log(3, `New cantrip settings: rules=${cantripRules}, behavior=${cantripBehavior}`);

      // Save cantrip settings
      const spellManager = new SpellManager(actor);
      await spellManager.saveSettings(cantripRules, cantripBehavior);

      // Save wizard settings if applicable
      if (wizardRulesVersion) {
        const updateData = {
          [`flags.${MODULE.ID}.${FLAGS.WIZARD_RULES_VERSION}`]: wizardRulesVersion,
          [`flags.${MODULE.ID}.wizardStartingSpells`]: parseInt(wizardStartingSpells) || WIZARD_DEFAULTS.STARTING_SPELLS,
          [`flags.${MODULE.ID}.wizardSpellsPerLevel`]: parseInt(wizardSpellsPerLevel) || WIZARD_DEFAULTS.SPELLS_PER_LEVEL,
          [`flags.${MODULE.ID}.wizardRitualCasting`]: !!wizardRitualCasting
        };

        log(3, `New wizard settings:`, updateData);
        await actor.update(updateData);
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
        // Update managers and re-render
        spellBook.spellManager.refresh();
        if (spellBook.wizardManager) {
          // No need to refresh the wizard manager, as it just reads flags directly
        }
        spellBook.render(false);
      }

      return actor;
    } catch (error) {
      log(1, 'Error saving spellbook settings:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Error.SettingsNotSaved'));
      return null;
    }
  }
}
