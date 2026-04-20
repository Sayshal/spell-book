import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { getTargetUserId, loadUserSpellData, saveUserSpellData } from '../data/_module.mjs';
import { getCanonicalSpellUuid } from '../managers/spell-manager.mjs';
import { DescriptionInjector } from '../ui/description-injector.mjs';
import { log } from '../utils/logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Per-spell user notes editor (writes to the user-data journal page). */
export class SpellNotes extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-spell-notes',
    tag: 'form',
    classes: ['spell-book', 'spell-notes-dialog'],
    position: { width: 400, height: 'auto' },
    window: { icon: 'far fa-sticky-note', resizable: true },
    form: { handler: SpellNotes.#onSubmit, closeOnSubmit: true }
  };

  /** @override */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.SPELL_NOTES } };

  /**
   * @param {object} options - Options including spellUuid and actor
   * @param {string} options.spellUuid - UUID of the spell to edit notes for
   * @param {object} [options.actor] - Owning actor for note ownership resolution
   */
  constructor(options = {}) {
    super(options);
    this.spellUuid = getCanonicalSpellUuid(options.spellUuid);
    this.spellName = fromUuidSync(this.spellUuid)?.name || '';
    this.actor = options.actor || null;
    this.maxLength = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH) || 240;
  }

  /** @override */
  get title() {
    return _loc('SPELLBOOK.UI.EditNotesTitle', { spell: this.spellName });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const targetUserId = getTargetUserId(this.actor);
    const spellData = await loadUserSpellData(targetUserId);
    const notes = spellData[this.spellUuid]?.notes || '';
    context.spellUuid = this.spellUuid;
    context.spellName = this.spellName;
    context.notes = notes;
    context.maxLength = this.maxLength;
    context.rows = Math.max(3, Math.min(8, Math.ceil(notes.length / 50)));
    context.charactersRemaining = this.maxLength - notes.length;
    context.actorId = this.actor?.id || '';
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const textarea = this.element.querySelector('textarea[name="notes"]');
    const counter = this.element.querySelector('.character-counter');
    const saveButton = this.element.querySelector('button.save-notes');
    if (!textarea || !counter || !saveButton) return;
    const update = () => {
      const remaining = this.maxLength - textarea.value.length;
      const hasContent = textarea.value.trim().length > 0;
      counter.textContent = remaining;
      counter.classList.toggle('warning', remaining < 20);
      counter.classList.toggle('error', remaining < 0);
      saveButton.disabled = !hasContent || remaining < 0;
    };
    textarea.addEventListener('input', update);
    update();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    this.#positionNearIcon();
  }

  /** Position dialog adjacent to the icon that opened it (right side preferred). */
  #positionNearIcon() {
    const icon = document.querySelector(`[data-uuid="${this.spellUuid}"][data-action="editNote"]`);
    if (!icon) return;
    const rect = this.element.getBoundingClientRect();
    const triggerRect = icon.getBoundingClientRect();
    const margin = 20;
    const offset = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rightSpace = vw - triggerRect.right;
    const leftSpace = triggerRect.left;
    let left;
    if (rightSpace >= rect.width + margin) left = triggerRect.right + offset;
    else if (leftSpace >= rect.width + margin) left = leftSpace - rect.width - offset;
    else left = (vw - rect.width) / 2;
    let top = Math.max(50, triggerRect.top + (triggerRect.height - rect.height) / 2);
    left = Math.max(margin, Math.min(left, vw - rect.width - margin));
    top = Math.max(50, Math.min(top, vh - 100));
    this.setPosition({ left, top });
  }

  /**
   * Persist notes to the user-data journal page and refresh notes UI.
   * @param {SubmitEvent} _event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {object} formData - Processed form data
   */
  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;
    const notes = (data.notes || '').trim();
    const canonicalUuid = getCanonicalSpellUuid(data.spellUuid);
    const actor = data.actorId ? game.actors.get(data.actorId) : null;
    const targetUserId = getTargetUserId(actor);
    const spellData = await loadUserSpellData(targetUserId);
    if (!spellData[canonicalUuid]) spellData[canonicalUuid] = { notes: '', actorData: {} };
    spellData[canonicalUuid].notes = notes;
    await saveUserSpellData(targetUserId, spellData);
    const hasNotes = notes.length > 0;
    for (const icon of document.querySelectorAll(`[data-uuid="${canonicalUuid}"][data-action="editNote"]`)) {
      const cls = hasNotes ? 'fas fa-sticky-note' : 'far fa-sticky-note';
      const tip = hasNotes ? _loc('SPELLBOOK.UI.HasNotes') : _loc('SPELLBOOK.UI.AddNotes');
      icon.className = `${cls} spell-notes-icon`;
      icon.setAttribute('data-tooltip', tip);
      icon.setAttribute('aria-label', tip);
    }
    await DescriptionInjector.handleNotesChange(canonicalUuid);
    log(3, 'Spell notes saved.', { canonicalUuid, hasNotes });
  }
}
