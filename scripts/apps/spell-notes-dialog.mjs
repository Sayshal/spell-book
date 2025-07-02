// Create scripts/apps/spell-notes-dialog.mjs
import { MODULE, TEMPLATES } from '../constants.mjs';
import * as spellUserData from '../helpers/spell-user-data.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for editing spell notes
 */
export class SpellNotesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'spell-notes-dialog',
    tag: 'form',
    window: {
      frame: false,
      positioned: true
    },
    form: {
      handler: SpellNotesDialog.formHandler,
      closeOnSubmit: true
    },
    position: {
      width: 400,
      height: 'auto'
    },
    classes: ['application', 'spell-book', 'spell-notes-dialog']
  };

  static PARTS = {
    form: {
      template: TEMPLATES.DIALOGS.SPELL_NOTES
    }
  };

  /**
   * Get the window title for this application
   * @returns {string} The formatted title including actor name
   */
  get title() {
    return game.i18n.format('SPELLBOOK.UI.EditNotesTitle', { spell: this.spellName });
  }

  constructor(options = {}) {
    super(options);
    this.spellUuid = options.spellUuid;
    this.spellName = options.spellName || 'Unknown Spell'; //TODO: Localize
    this.currentNotes = '';
    this.maxLength = game.settings.get(MODULE.ID, 'spellNotesMaxLength') || 240;
  }

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    return options;
  }

  /** @override */
  async _prepareContext(_options) {
    // Load current notes
    const userData = spellUserData.getUserDataForSpell(this.spellUuid);
    this.currentNotes = userData?.notes || '';

    return {
      spellName: this.spellName,
      spellUuid: this.spellUuid,
      notes: this.currentNotes,
      maxLength: this.maxLength,
      charactersRemaining: this.maxLength - this.currentNotes.length
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    const textarea = this.element.querySelector('textarea[name="notes"]');
    const counter = this.element.querySelector('.character-counter');

    if (textarea && counter) {
      // Update character counter on input
      textarea.addEventListener('input', (event) => {
        const remaining = this.maxLength - event.target.value.length;
        counter.textContent = remaining;
        counter.classList.toggle('warning', remaining < 20);
        counter.classList.toggle('error', remaining < 0);
      });

      // Focus the textarea
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    // Position dialog near the notes icon if possible
    this._positionNearIcon();
  }

  /**
   * Position dialog near the notes icon that opened it
   * @private
   */
  _positionNearIcon() {
    const icon = document.querySelector(`[data-uuid="${this.spellUuid}"][data-action="editNotes"]`);
    if (!icon) return;

    const iconRect = icon.getBoundingClientRect();
    const dialogRect = this.element.getBoundingClientRect();

    // Position to the right of the icon, or left if not enough space
    let left = iconRect.right + 10;
    if (left + dialogRect.width > window.innerWidth) {
      left = iconRect.left - dialogRect.width - 10;
    }

    // Center vertically on the icon
    const top = iconRect.top + iconRect.height / 2 - dialogRect.height / 2;

    this.setPosition({ left, top });
  }

  /**
   * Handle form submission
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The form data
   * @static
   */
  static async formHandler(event, form, formData) {
    const notes = formData.object.notes || '';
    const spellUuid = formData.object.spellUuid;

    try {
      await spellUserData.setSpellNotes(spellUuid, notes);

      // Refresh the spellbook if it's open
      const spellbook = Object.values(ui.windows).find((app) => app.constructor.name === 'PlayerSpellBook');
      if (spellbook) {
        spellbook.render(false);
      }

      ui.notifications.info(game.i18n.localize('SPELLBOOK.UI.NotesUpdated'));
    } catch (error) {
      log(1, 'Error saving spell notes:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.UI.NotesUpdateFailed'));
    }
  }
}
