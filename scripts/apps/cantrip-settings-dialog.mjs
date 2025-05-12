import { CANTRIP_CHANGE_BEHAVIOR, CANTRIP_RULES, TEMPLATES } from '../constants.mjs';
import { SpellManager } from '../helpers/spell-preparation.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for configuring cantrip settings for an actor
 */
export class CantripSettingsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'cantrip-settings-dialog',
    tag: 'form',
    form: {
      handler: CantripSettingsDialog.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    classes: ['cantrip-settings-dialog'],
    window: {
      icon: 'fas fa-magic',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: {
      width: 400,
      height: 'auto'
    }
  };

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.CANTRIP_SETTINGS }
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
      throw new Error('Actor is required for CantripSettingsDialog');
    }

    log(3, `Initializing CantripSettingsDialog for ${actor.name}`);
    this.actor = actor;
    this.spellManager = new SpellManager(actor);
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /** @override */
  get title() {
    return `${game.i18n.localize('SPELLBOOK.Cantrips.ConfigTitle')}: ${this.actor.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    try {
      log(3, 'Preparing CantripSettingsDialog context');

      const settings = this.spellManager.getSettings();
      const maxCantrips = this.spellManager.getMaxAllowed();
      const currentCount = this.spellManager.getCurrentCount();

      log(3, `Current cantrip settings: rules=${settings.rules}, behavior=${settings.behavior}`);
      log(3, `Cantrip stats: ${currentCount}/${maxCantrips}`);

      return {
        actor: this.actor,
        ruleOptions: {
          default: {
            value: CANTRIP_RULES.DEFAULT,
            label: game.i18n.localize('SPELLBOOK.Cantrips.RulesDefault'),
            selected: settings.rules === CANTRIP_RULES.DEFAULT
          },
          modern: {
            value: CANTRIP_RULES.MODERN,
            label: game.i18n.localize('SPELLBOOK.Cantrips.RulesModern'),
            selected: settings.rules === CANTRIP_RULES.MODERN
          }
        },
        behaviorOptions: {
          unrestricted: {
            value: CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED,
            label: game.i18n.localize('SPELLBOOK.Cantrips.BehaviorUnrestricted'),
            selected: settings.behavior === CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED
          },
          notifyGM: {
            value: CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM,
            label: game.i18n.localize('SPELLBOOK.Cantrips.BehaviorNotifyGM'),
            selected: settings.behavior === CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM
          },
          lockAfterMax: {
            value: CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX,
            label: game.i18n.localize('SPELLBOOK.Cantrips.BehaviorLockAfterMax'),
            selected: settings.behavior === CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX
          }
        },
        stats: {
          maxCantrips,
          currentCount
        }
      };
    } catch (error) {
      log(1, 'Error preparing cantrip settings context:', error);
      return {
        actor: this.actor,
        ruleOptions: {},
        behaviorOptions: {},
        stats: { maxCantrips: 0, currentCount: 0 }
      };
    }
  }

  /**
   * Form handler for saving cantrip settings
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

      log(3, `Saving cantrip settings for ${actor.name}`);
      log(3, `New settings: rules=${formData.object.cantripRules}, behavior=${formData.object.cantripBehavior}`);

      // Initialize cantrip manager and save settings
      const spellManager = new SpellManager(actor);
      await spellManager.saveSettings(formData.object.cantripRules, formData.object.cantripBehavior);

      // Show success notification
      ui.notifications.info(
        game.i18n.format('SPELLBOOK.Cantrips.SettingsSaved', {
          name: actor.name
        })
      );

      // Find and re-render the actor's spell book if it's open
      const spellBook = Object.values(foundry.applications.instances).find((w) => w instanceof PlayerSpellBook && w.actor.id === actor.id);

      if (spellBook) {
        log(3, 'Refreshing open spell book with new settings');
        // Update cantrip manager and re-render
        spellBook.spellManager.refresh();
        spellBook.render(false);
      }

      return actor;
    } catch (error) {
      log(1, 'Error saving cantrip settings:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Error.SettingsNotSaved'));
      return null;
    }
  }
}
