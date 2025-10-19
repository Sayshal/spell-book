/**
 * Spell Notes Editor Dialog
 *
 * Personal spell notes editing interface for adding user-specific annotations
 * and tactical information to spells. Provides rich text editing capabilities
 * and integration with the spell user data system.
 *
 * Key features:
 * - Rich text spell notes editing
 * - Personal spell annotations
 * - Tactical information management
 * - User-specific spell data storage
 * - Integration with spell display systems
 * - Notes sharing and collaboration
 *
 * @module Dialogs/SpellNotes
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as UIHelpers from '../ui/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog application for editing spell notes.
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class SpellNotes extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'spell-notes-dialog',
    tag: 'form',
    window: { icon: 'far fa-sticky-note', resizable: true, minimizable: true, positioned: true },
    form: {
      handler: SpellNotes.formHandler,
      closeOnSubmit: true
    },
    position: { width: 400, height: 'auto' },
    classes: ['spell-book', 'spell-notes-dialog']
  };

  /** @inheritdoc */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.SPELL_NOTES } };

  /** @inheritdoc */
  get title() {
    return game.i18n.format('SPELLBOOK.UI.EditNotesTitle', { spell: this.spellName });
  }

  /**
   * Create a new Spell Notes dialog instance.
   * @param {Object} [options={}] - Application options including spell and actor data
   * @param {string} options.spellUuid - UUID of the spell to edit notes for
   * @param {Actor} [options.actor] - Associated actor for note ownership
   */
  constructor(options = {}) {
    super(options);

    /** @type {string} Canonical UUID of the spell being edited */
    this.spellUuid = UIHelpers.getCanonicalSpellUuid(options.spellUuid);

    /** @type {string} Display name of the spell */
    this.spellName = fromUuidSync(this.spellUuid).name;

    /** @type {Actor|null} Associated actor for ownership determination */
    this.actor = options.actor;

    /** @type {string} Current notes content */
    this.currentNotes = '';

    /** @type {number} Maximum allowed character length for notes */
    this.maxLength = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH) || 240;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const targetUserId = DataHelpers.getTargetUserId(this.actor);
    const userData = await DataHelpers.UserData.getUserDataForSpell(this.spellUuid, targetUserId, this.actor?.id);
    this.currentNotes = userData?.notes || '';
    context.spellUuid = this.spellUuid;
    context.spellName = this.spellName;
    context.notes = this.currentNotes;
    context.maxLength = this.maxLength;
    context.rows = Math.max(3, Math.min(8, Math.ceil(this.currentNotes.length / 50)));
    context.charactersRemaining = this.maxLength - this.currentNotes.length;
    context.actorId = this.actor?.id;
    return context;
  }

  /** @inheritdoc */
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
   * Position dialog near the notes icon that opened it.
   * @private
   */
  _positionNearIcon() {
    const icon = document.querySelector(`[data-uuid="${this.spellUuid}"][data-action="editNotes"]`);
    if (!icon) return;
    const dialogRect = this.element.getBoundingClientRect();
    const position = UIHelpers.calculateOptimalPosition({
      triggerElement: icon,
      dialogWidth: dialogRect.width,
      dialogHeight: dialogRect.height,
      minMargin: 20,
      minTop: 50,
      maxBottomOffset: 100,
      offset: 10,
      preferredSide: 'right'
    });
    this.setPosition(position);
  }

  /** @inheritdoc */
  static async formHandler(_event, _form, formData) {
    const notes = formData.object.notes || '';
    const spellUuid = formData.object.spellUuid;
    const actorId = formData.object.actorId;
    const canonicalUuid = UIHelpers.getCanonicalSpellUuid(spellUuid);
    try {
      const actor = actorId ? game.actors.get(actorId) : null;
      const targetUserId = DataHelpers.getTargetUserId(actor);
      await DataHelpers.UserData.setSpellNotes(canonicalUuid, notes, targetUserId);
      const cacheKey = `${targetUserId}:${canonicalUuid}`;
      if (DataHelpers.UserData?.cache) DataHelpers.UserData.cache.delete(cacheKey);
      const spellbookApp = Array.from(foundry.applications.instances.values()).find((app) => app.constructor.name === 'SpellBook');
      if (spellbookApp) {
        await spellbookApp._state.refreshSpellEnhancements();
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
      await UIHelpers.DescriptionInjector.handleNotesChange(canonicalUuid);
    } catch (error) {
      log(1, 'Error saving spell notes:', error);
    }
  }
}
