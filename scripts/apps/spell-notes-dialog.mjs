import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { SpellDescriptionInjection } from '../helpers/spell-description-injection.mjs';
import * as spellFavorites from '../helpers/spell-favorites.mjs';
import { SpellUserDataJournal } from '../helpers/spell-user-data.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for editing spell notes
 */
export class SpellNotesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'spell-notes-dialog',
    tag: 'form',
    window: { icon: 'far fa-sticky-note', resizable: true, minimizable: true, positioned: true },
    form: {
      handler: SpellNotesDialog.formHandler,
      closeOnSubmit: true
    },
    position: { width: 400, height: 'auto' },
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
    this.spellUuid = spellFavorites.getCanonicalSpellUuid(options.spellUuid);
    this.spellName = fromUuidSync(this.spellUuid).name;
    this.currentNotes = '';
    this.maxLength = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH) || 240;
    log(1, 'DEBUG:', { options: options, spelluuid: this.spellUuid });
  }

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    return options;
  }

  /** @override */
  async _prepareContext(_options) {
    const userData = await SpellUserDataJournal.getUserDataForSpell(this.spellUuid);
    this.currentNotes = userData?.notes || '';
    const charactersPerRow = 60;
    const calculatedRows = Math.ceil(this.maxLength / charactersPerRow);
    const rows = Math.max(3, Math.min(20, calculatedRows));
    return {
      spellName: this.spellName,
      spellUuid: this.spellUuid,
      notes: this.currentNotes,
      maxLength: this.maxLength,
      charactersRemaining: this.maxLength - this.currentNotes.length,
      rows: rows
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const textarea = this.element.querySelector('textarea[name="notes"]');
    const counter = this.element.querySelector('.character-counter');
    const saveButton = this.element.querySelector('button.save-notes');
    if (textarea && counter && saveButton) {
      const updateFormState = () => {
        const remaining = this.maxLength - textarea.value.length;
        const hasContent = textarea.value.trim().length > 0;
        counter.textContent = remaining;
        counter.classList.toggle('warning', remaining < 20);
        counter.classList.toggle('error', remaining < 0);
        saveButton.disabled = !hasContent || remaining < 0;
      };
      textarea.addEventListener('input', updateFormState);
      updateFormState();
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
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
    let left = iconRect.right + 10;
    if (left + dialogRect.width > window.innerWidth) left = iconRect.left - dialogRect.width - 10;
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
    const canonicalUuid = spellFavorites.getCanonicalSpellUuid(spellUuid);
    try {
      await SpellUserDataJournal.setSpellNotes(canonicalUuid, notes);
      const targetUserId = game.user.id;
      const cacheKey = `${targetUserId}:${canonicalUuid}`;
      const spellbookApp = Array.from(foundry.applications.instances.values()).find((app) => app.constructor.name === 'PlayerSpellBook');
      if (spellbookApp) {
        await spellbookApp._stateManager.refreshSpellEnhancements();
        spellbookApp.render(false);
      }
      if (SpellUserDataJournal?.cache) SpellUserDataJournal.cache.delete(cacheKey);
      const hasNotes = !!(notes && notes.trim());
      const notesIcons = document.querySelectorAll(`[data-uuid="${canonicalUuid}"][data-action="editNotes"]`);
      notesIcons.forEach((icon) => {
        const newIconClass = hasNotes ? 'fas fa-sticky-note' : 'far fa-sticky-note';
        const newTooltip = hasNotes ? game.i18n.localize('SPELLBOOK.UI.HasNotes') : game.i18n.localize('SPELLBOOK.UI.AddNotes');
        icon.className = `${newIconClass} spell-notes-icon`;
        icon.setAttribute('data-tooltip', newTooltip);
        icon.setAttribute('aria-label', newTooltip);
      });
      await SpellDescriptionInjection.handleNotesChange(canonicalUuid);
      ui.notifications.info(game.i18n.localize('SPELLBOOK.UI.NotesUpdated'));
    } catch (error) {
      log(1, 'Error saving spell notes:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.UI.NotesUpdateFailed'));
    }
  }
}
