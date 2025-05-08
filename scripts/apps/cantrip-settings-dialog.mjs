/**
 * Dialog for configuring cantrip settings
 * @module spell-book/apps/cantrip-settings-dialog
 */

import { CANTRIP_CHANGE_BEHAVIOR, CANTRIP_RULES, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as preparationUtils from '../helpers/spell-preparation.mjs';
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
   * Prepare the application context data
   * @override
   */
  async _prepareContext(options) {
    // Get current settings from actor flags, falling back to module defaults
    const cantripRules = this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_RULES) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_RULES);

    const behaviorSetting = this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_BEHAVIOR);

    // Find the spellcasting class
    const classItem = this.actor.items.find((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');

    // Get cantrip limits and counts
    const maxCantrips = preparationUtils.getMaxCantripsAllowed(this.actor, classItem);
    const currentCount = preparationUtils.getCurrentCantripsCount(this.actor);
    const changeAllowed = this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_ALLOWED) || false;
    const unlearned = this.actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;

    return {
      actor: this.actor,
      ruleOptions: {
        default: {
          value: CANTRIP_RULES.DEFAULT,
          label: game.i18n.localize('SPELLBOOK.Cantrips.RulesDefault'),
          selected: cantripRules === CANTRIP_RULES.DEFAULT
        },
        modern: {
          value: CANTRIP_RULES.MODERN,
          label: game.i18n.localize('SPELLBOOK.Cantrips.RulesModern'),
          selected: cantripRules === CANTRIP_RULES.MODERN
        }
      },
      behaviorOptions: {
        unrestricted: {
          value: CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED,
          label: game.i18n.localize('SPELLBOOK.Cantrips.BehaviorUnrestricted'),
          selected: behaviorSetting === CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED
        },
        notifyGM: {
          value: CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM,
          label: game.i18n.localize('SPELLBOOK.Cantrips.BehaviorNotifyGM'),
          selected: behaviorSetting === CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM
        },
        lockAfterMax: {
          value: CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX,
          label: game.i18n.localize('SPELLBOOK.Cantrips.BehaviorLockAfterMax'),
          selected: behaviorSetting === CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX
        }
      },
      stats: {
        maxCantrips,
        currentCount,
        changeAllowed,
        unlearned
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
      log(3, 'Processing cantrip settings form submission');

      const actor = this.actor;

      // Update actor flags with form data
      await actor.setFlag(MODULE.ID, FLAGS.CANTRIP_RULES, formData.cantripRules);
      await actor.setFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_BEHAVIOR, formData.cantripBehavior);

      // Handle unlock override
      if (formData.overrideUnlock) {
        await actor.setFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_ALLOWED, true);
        await actor.setFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS, 0);

        ui.notifications.info(
          game.i18n.format('SPELLBOOK.Cantrips.UnlockedInfo', {
            name: actor.name
          })
        );
      }

      // Handle lock override
      if (formData.overrideLock) {
        await actor.setFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_ALLOWED, false);

        ui.notifications.info(
          game.i18n.format('SPELLBOOK.Cantrips.LockedInfo', {
            name: actor.name
          })
        );
      }

      return actor;
    } catch (error) {
      log(1, 'Error saving cantrip settings:', error);
      return null;
    }
  }
}
