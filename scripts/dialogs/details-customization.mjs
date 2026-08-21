import { MODULE, TEMPLATES, UI_ELEMENTS } from '../constants.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {object[]} Player spell book UI toggles */
const PLAYER_UI = UI_ELEMENTS.filter((element) => !element.metadata);

/** @type {object[]} Player spell metadata toggles */
const PLAYER_METADATA = UI_ELEMENTS.filter((element) => element.metadata);

/** @type {object[]} GM spell list manager UI toggles */
const GM_UI = PLAYER_UI.filter((element) => element.gm);

/** @type {object[]} GM spell metadata toggles */
const GM_METADATA = PLAYER_METADATA.filter((element) => element.gm);

/**
 * Build render context for the setting-item.hbs partial.
 * @param {object[]} group - Element definitions for a single group
 * @param {string} prefix - DOM id prefix for generated checkboxes
 * @param {'player'|'gm'} audience - Which of the element's two settings the group edits
 * @returns {object[]} Array of partial-compatible items
 */
function buildItems(group, prefix, audience) {
  return group.map((element) => {
    const setting = element[audience];
    return { key: element.key, id: `${prefix}-${element.key}`, name: setting, checked: game.settings.get(MODULE.ID, setting), label: element.label, description: element.description };
  });
}

/** Spell detail display configuration dialog. */
export class DetailsCustomization extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-details-customization',
    classes: ['spell-book', 'details-customization'],
    tag: 'form',
    position: { width: 560, height: 700 },
    window: { icon: 'fas fa-palette', resizable: true, contentClasses: ['standard-form'] },
    form: { handler: DetailsCustomization.#onSubmit, closeOnSubmit: true }
  };

  /** @override */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.DETAILS_CUSTOMIZATION } };

  /** @override */
  get title() {
    return _loc('SPELLBOOK.Settings.DetailsCustomization.Title');
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user.isGM;
    context.playerUI = buildItems(PLAYER_UI, 'player-ui', 'player');
    context.playerMetadata = buildItems(PLAYER_METADATA, 'player-metadata', 'player');
    context.gmUI = context.isGM ? buildItems(GM_UI, 'gm-ui', 'gm') : [];
    context.gmMetadata = context.isGM ? buildItems(GM_METADATA, 'gm-metadata', 'gm') : [];
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const fieldsets = this.element.querySelectorAll('fieldset[data-section]');
    fieldsets.forEach((fs) => {
      const selectAll = fs.querySelector('input.select-all');
      const members = fs.querySelectorAll('input[type="checkbox"][name]');
      if (selectAll) selectAll.addEventListener('change', () => members.forEach((m) => (m.checked = selectAll.checked)));
      members.forEach((cb) => cb.addEventListener('change', () => DetailsCustomization.#syncSelectAll(fs)));
      DetailsCustomization.#syncSelectAll(fs);
    });
  }

  /**
   * Update a group's select-all checkbox state from its member checkboxes.
   * @param {HTMLFieldSetElement} fieldset - Group fieldset
   */
  static #syncSelectAll(fieldset) {
    const selectAll = fieldset.querySelector('input.select-all');
    const members = fieldset.querySelectorAll('input[type="checkbox"][name]');
    if (!selectAll || !members.length) return;
    const checked = Array.from(members).filter((m) => m.checked).length;
    selectAll.checked = checked === members.length;
    selectAll.indeterminate = checked > 0 && checked < members.length;
  }

  /**
   * Persist all toggles and refresh open consumers.
   * @param {SubmitEvent} _event - Form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {object} formData - Processed form data
   */
  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;
    const settingKeys = UI_ELEMENTS.flatMap((element) => (game.user.isGM && element.gm ? [element.player, element.gm] : [element.player]));
    const writes = settingKeys.filter((key) => key in data).map((key) => game.settings.set(MODULE.ID, key, data[key] === true || data[key] === 'true'));
    await Promise.all(writes);
    for (const id of ['player-spell-book', `spell-list-manager-${MODULE.ID}`]) {
      const app = foundry.applications.instances.get(id);
      app?.refreshDisplay?.();
    }
    ATLAS.log(3, 'Details customization saved');
  }
}
