import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
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
    this.actor = options.actor;
    this.currentNotes = '';
    this.maxLength = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH) || 240;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const targetUserId = genericUtils._getTargetUserId(this.actor);
    try {
      const userData = await SpellUserDataJournal.getUserDataForSpell(this.spellUuid, targetUserId, this.actor?.id);
      this.currentNotes = userData?.notes || '';
    } catch (error) {
      this.currentNotes = '';
    }
    const rows = Math.max(3, Math.min(8, Math.ceil(this.currentNotes.length / 50)));
    const charactersRemaining = this.maxLength - this.currentNotes.length;
    return foundry.utils.mergeObject(context, {
      spellUuid: this.spellUuid,
      spellName: this.spellName,
      notes: this.currentNotes,
      maxLength: this.maxLength,
      rows,
      charactersRemaining,
      actorId: this.actor?.id
    });
  }

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    return options;
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
   * Handle form submission with GM-to-player delegation
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The form data
   * @static
   */
  static async formHandler(event, form, formData) {
    const notes = formData.object.notes || '';
    const spellUuid = formData.object.spellUuid;
    const actorId = formData.object.actorId;
    const canonicalUuid = spellFavorites.getCanonicalSpellUuid(spellUuid);
    try {
      let targetUserId = game.user.id;
      if (game.user.isActiveGM && actorId) {
        const actor = game.actors.get(actorId);
        if (actor) {
          const characterOwner = game.users.find((user) => user.character?.id === actor.id);
          if (characterOwner) targetUserId = characterOwner.id;
          else {
            const ownershipOwner = game.users.find((user) => actor.ownership[user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
            if (ownershipOwner) targetUserId = ownershipOwner.id;
            else log(2, `No owner found via ownership levels, using GM`);
          }
        }
      }
      await SpellUserDataJournal.setSpellNotes(canonicalUuid, notes, targetUserId);
      const cacheKey = `${targetUserId}:${canonicalUuid}`;
      if (SpellUserDataJournal?.cache) SpellUserDataJournal.cache.delete(cacheKey);
      const spellbookApp = Array.from(foundry.applications.instances.values()).find((app) => app.constructor.name === 'PlayerSpellBook');
      if (spellbookApp) {
        await spellbookApp._stateManager.refreshSpellEnhancements();
        spellbookApp.render(false);
      }
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
