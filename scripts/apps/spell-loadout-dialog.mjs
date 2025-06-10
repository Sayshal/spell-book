import { FLAGS, MODULE, TEMPLATES } from '../constants.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import { log } from '../logger.mjs';
import { SpellLoadoutManager } from '../managers/spell-loadout-manager.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for managing spell loadouts
 */
export class SpellLoadoutDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'spell-loadout-dialog',
    tag: 'form',
    form: {
      handler: SpellLoadoutDialog.formHandler,
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      saveLoadout: SpellLoadoutDialog.saveLoadout,
      applyLoadout: SpellLoadoutDialog.applyLoadout,
      overwriteLoadout: SpellLoadoutDialog.overwriteLoadout,
      deleteLoadout: SpellLoadoutDialog.deleteLoadout
    },
    classes: ['spell-loadout-dialog'],
    window: {
      icon: 'fas fa-save',
      resizable: true,
      minimizable: false,
      positioned: true
    },
    position: {
      width: 600,
      height: 'auto'
    }
  };

  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.SPELL_LOADOUT }
  };

  /**
   * @param {Actor} actor - The actor whose loadouts to manage
   * @param {PlayerSpellBook} spellbook - The spellbook reference
   * @param {string} classIdentifier - The current class identifier
   * @param {Object} options - Additional options
   */
  constructor(actor, spellbook, classIdentifier, options = {}) {
    super(options);
    this.actor = actor;
    this.spellbook = spellbook;
    this.classIdentifier = classIdentifier;
    this.loadoutManager = new SpellLoadoutManager(actor, spellbook);
  }

  /** @override */
  get title() {
    const className = this.spellbook._stateManager.classSpellData[this.classIdentifier]?.className || this.classIdentifier;
    return game.i18n.format('SPELLBOOK.Loadouts.DialogTitle', { class: className });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const existingLoadouts = this.loadoutManager.getAvailableLoadouts(this.classIdentifier);
    const loadoutsWithCounts = existingLoadouts.map((loadout) => ({
      ...loadout,
      spellCount: Array.isArray(loadout.spellConfiguration) ? loadout.spellConfiguration.length : 0,
      formattedDate: loadout.updatedAt ? foundry.utils.timeSince(loadout.updatedAt) : null
    }));
    const nameInput = formElements.createTextInput({
      name: 'loadout-name',
      placeholder: game.i18n.localize('SPELLBOOK.Loadouts.NamePlaceholder'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Loadouts.LoadoutName')
    });
    const descriptionInput = formElements.createTextInput({
      name: 'loadout-description',
      placeholder: game.i18n.localize('SPELLBOOK.Loadouts.DescriptionPlaceholder'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Loadouts.LoadoutDescription')
    });
    const currentState = this.loadoutManager.captureCurrentState(this.classIdentifier);
    const currentSpellCount = currentState.length;
    context.classIdentifier = this.classIdentifier;
    context.className = this.spellbook._stateManager.classSpellData[this.classIdentifier]?.className || this.classIdentifier;
    context.existingLoadouts = loadoutsWithCounts;
    context.currentSpellCount = currentSpellCount;
    context.nameInputHtml = formElements.elementToHtml(nameInput);
    context.descriptionInputHtml = formElements.elementToHtml(descriptionInput);
    return context;
  }

  /**
   * Save current configuration as a new loadout
   * @param {Event} event - The form event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static saveLoadout(event, target) {
    const form = target.closest('form');
    const formData = new FormData(form);
    const name = formData.get('loadout-name')?.trim();
    const description = formData.get('loadout-description')?.trim() || '';
    if (!name) {
      ui.notifications.warn(game.i18n.localize('SPELLBOOK.Loadouts.NameRequired'));
      return;
    }
    try {
      const spellConfiguration = this.loadoutManager.captureCurrentState(this.classIdentifier);
      if (spellConfiguration.length === 0) {
        ui.notifications.warn(game.i18n.localize('SPELLBOOK.Loadouts.NoSpellsPrepared'));
        return;
      }
      const success = this.loadoutManager.saveLoadout(name, description, spellConfiguration, this.classIdentifier);
      if (success) {
        ui.notifications.info(game.i18n.format('SPELLBOOK.Loadouts.Saved', { name }));
        form.reset();
        this.render(false);
      }
    } catch (error) {
      log(1, 'Error saving loadout:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Loadouts.SaveFailed'));
    }
  }

  /**
   * Overwrite an existing loadout with current configuration
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static overwriteLoadout(event, target) {
    const loadoutId = target.dataset.loadoutId;
    const loadoutName = target.dataset.loadoutName;
    if (!loadoutId) return;
    try {
      const existingLoadout = this.loadoutManager.loadLoadout(loadoutId);
      if (!existingLoadout) return;
      const spellConfiguration = this.loadoutManager.captureCurrentState(this.classIdentifier);
      if (spellConfiguration.length === 0) return;
      const updatedLoadout = { ...existingLoadout, spellConfiguration, updatedAt: Date.now() };
      const existingLoadouts = this.loadoutManager.actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
      existingLoadouts[loadoutId] = updatedLoadout;
      this.loadoutManager.actor.unsetFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS);
      this.loadoutManager.actor.setFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS, existingLoadouts);
      this.loadoutManager._invalidateCache();
      ui.notifications.info(game.i18n.format('SPELLBOOK.Loadouts.Overwritten', { name: loadoutName }));
      this.render(false);
    } catch (error) {
      log(1, 'Error overwriting loadout:', error);
    }
  }

  /**
   * Apply a loadout
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static applyLoadout(event, target) {
    const loadoutId = target.dataset.loadoutId;
    if (!loadoutId) return;
    try {
      const success = this.loadoutManager.applyLoadout(loadoutId, this.classIdentifier);
      if (success) this.close();
    } catch (error) {
      log(1, 'Error applying loadout:', error);
    }
  }

  /**
   * Delete a loadout
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static async deleteLoadout(event, target) {
    const loadoutId = target.dataset.loadoutId;
    const loadoutName = target.dataset.loadoutName;
    if (!loadoutId) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize('SPELLBOOK.Loadouts.ConfirmDelete'),
      content: game.i18n.format('SPELLBOOK.Loadouts.ConfirmDeleteContent', { name: loadoutName })
    });
    if (confirmed) {
      try {
        const success = this.loadoutManager.deleteLoadout(loadoutId);
        if (success) this.render(false);
      } catch (error) {
        log(1, 'Error deleting loadout:', error);
      }
    }
  }

  /**
   * Form handler for the dialog
   * @param {Event} event - The form event
   * @param {HTMLElement} form - The form element
   * @param {Object} formData - The form data
   * @static
   */
  static async formHandler(event, form, formData) {
    return;
  }
}
