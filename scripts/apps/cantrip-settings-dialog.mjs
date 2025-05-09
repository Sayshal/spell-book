/**
 * Dialog for configuring cantrip settings
 * @module spell-book/apps/cantrip-settings-dialog
 */

import { CANTRIP_CHANGE_BEHAVIOR, CANTRIP_RULES, TEMPLATES } from '../constants.mjs';
import * as preparationUtils from '../helpers/spell-preparation.mjs';

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

  /** Window title getter */
  get title() {
    return game.i18n.localize('SPELLBOOK.Cantrips.ConfigTitle');
  }

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Actor5e} actor - The actor to configure settings for
   * @param {object} options - Application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /**
   * Get window title - include actor name
   */
  get title() {
    return `${game.i18n.localize('SPELLBOOK.Cantrips.ConfigTitle')}: ${this.actor.name}`;
  }

  /**
   * Prepare the application context data
   * @override
   */
  async _prepareContext(options) {
    const cantripManager = new preparationUtils.CantripManager(this.actor);
    const settings = cantripManager.getSettings();
    const maxCantrips = cantripManager.getMaxAllowed();
    const currentCount = cantripManager.getCurrentCount();

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
  }

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

  /**
   * Handle form submission
   * @static
   */
  static async formHandler(_event, form, formData) {
    try {
      const actor = this.actor;
      const cantripManager = new preparationUtils.CantripManager(actor);

      await cantripManager.saveSettings(formData.object.cantripRules, formData.object.cantripBehavior);

      ui.notifications.info(
        game.i18n.format('SPELLBOOK.Cantrips.SettingsSaved', {
          name: actor.name
        })
      );

      // Find and re-render the actor's spell book if it's open
      const spellBook = Object.values(foundry.applications.instances).find((w) => w instanceof PlayerSpellBook && w.actor.id === actor.id);

      if (spellBook) {
        // Update cantrip manager and re-render
        spellBook.cantripManager.refresh();
        spellBook.render(false);
      }

      return actor;
    } catch (error) {
      console.error('Error saving cantrip settings:', error);
      return null;
    }
  }
}
