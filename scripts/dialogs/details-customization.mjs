import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { log } from '../utils/logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {object[]} Player spell book UI toggles */
const PLAYER_UI = [
  { key: 'favorites', setting: SETTINGS.PLAYER_UI_FAVORITES, label: 'SPELLBOOK.Settings.DetailsCustomization.Favorites', description: 'SPELLBOOK.Settings.DetailsCustomization.FavoritesDesc' },
  { key: 'compare', setting: SETTINGS.PLAYER_UI_COMPARE, label: 'SPELLBOOK.Settings.DetailsCustomization.Compare', description: 'SPELLBOOK.Settings.DetailsCustomization.CompareDesc' },
  { key: 'notes', setting: SETTINGS.PLAYER_UI_NOTES, label: 'SPELLBOOK.Settings.DetailsCustomization.Notes', description: 'SPELLBOOK.Settings.DetailsCustomization.NotesDesc' },
  {
    key: 'sidebarControlsBottom',
    setting: SETTINGS.SIDEBAR_CONTROLS_BOTTOM,
    label: 'SPELLBOOK.Settings.DetailsCustomization.SidebarControlsBottom',
    description: 'SPELLBOOK.Settings.DetailsCustomization.SidebarControlsBottomDesc'
  }
];

/** @type {object[]} Player spell metadata toggles */
const PLAYER_METADATA = [
  { key: 'spellLevel', setting: SETTINGS.PLAYER_UI_SPELL_LEVEL, label: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevel', description: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevelDesc' },
  { key: 'components', setting: SETTINGS.PLAYER_UI_COMPONENTS, label: 'SPELLBOOK.Settings.DetailsCustomization.Components', description: 'SPELLBOOK.Settings.DetailsCustomization.ComponentsDesc' },
  { key: 'school', setting: SETTINGS.PLAYER_UI_SCHOOL, label: 'SPELLBOOK.Settings.DetailsCustomization.School', description: 'SPELLBOOK.Settings.DetailsCustomization.SchoolDesc' },
  {
    key: 'castingTime',
    setting: SETTINGS.PLAYER_UI_CASTING_TIME,
    label: 'SPELLBOOK.Settings.DetailsCustomization.CastingTime',
    description: 'SPELLBOOK.Settings.DetailsCustomization.CastingTimeDesc'
  },
  { key: 'range', setting: SETTINGS.PLAYER_UI_RANGE, label: 'SPELLBOOK.Settings.DetailsCustomization.Range', description: 'SPELLBOOK.Settings.DetailsCustomization.RangeDesc' },
  {
    key: 'damageTypes',
    setting: SETTINGS.PLAYER_UI_DAMAGE_TYPES,
    label: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypes',
    description: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypesDesc'
  },
  { key: 'conditions', setting: SETTINGS.PLAYER_UI_CONDITIONS, label: 'SPELLBOOK.Settings.DetailsCustomization.Conditions', description: 'SPELLBOOK.Settings.DetailsCustomization.ConditionsDesc' },
  { key: 'save', setting: SETTINGS.PLAYER_UI_SAVE, label: 'SPELLBOOK.Settings.DetailsCustomization.Save', description: 'SPELLBOOK.Settings.DetailsCustomization.SaveDesc' },
  {
    key: 'concentration',
    setting: SETTINGS.PLAYER_UI_CONCENTRATION,
    label: 'SPELLBOOK.Settings.DetailsCustomization.Concentration',
    description: 'SPELLBOOK.Settings.DetailsCustomization.ConcentrationDesc'
  },
  {
    key: 'materialComponents',
    setting: SETTINGS.PLAYER_UI_MATERIAL_COMPONENTS,
    label: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponents',
    description: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponentsDesc'
  }
];

/** @type {object[]} GM spell list manager UI toggles */
const GM_UI = [{ key: 'compare', setting: SETTINGS.GM_UI_COMPARE, label: 'SPELLBOOK.Settings.DetailsCustomization.Compare', description: 'SPELLBOOK.Settings.DetailsCustomization.CompareDesc' }];

/** @type {object[]} GM spell metadata toggles */
const GM_METADATA = [
  { key: 'spellLevel', setting: SETTINGS.GM_UI_SPELL_LEVEL, label: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevel', description: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevelDesc' },
  { key: 'components', setting: SETTINGS.GM_UI_COMPONENTS, label: 'SPELLBOOK.Settings.DetailsCustomization.Components', description: 'SPELLBOOK.Settings.DetailsCustomization.ComponentsDesc' },
  { key: 'school', setting: SETTINGS.GM_UI_SCHOOL, label: 'SPELLBOOK.Settings.DetailsCustomization.School', description: 'SPELLBOOK.Settings.DetailsCustomization.SchoolDesc' },
  { key: 'castingTime', setting: SETTINGS.GM_UI_CASTING_TIME, label: 'SPELLBOOK.Settings.DetailsCustomization.CastingTime', description: 'SPELLBOOK.Settings.DetailsCustomization.CastingTimeDesc' },
  { key: 'range', setting: SETTINGS.GM_UI_RANGE, label: 'SPELLBOOK.Settings.DetailsCustomization.Range', description: 'SPELLBOOK.Settings.DetailsCustomization.RangeDesc' },
  { key: 'damageTypes', setting: SETTINGS.GM_UI_DAMAGE_TYPES, label: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypes', description: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypesDesc' },
  { key: 'conditions', setting: SETTINGS.GM_UI_CONDITIONS, label: 'SPELLBOOK.Settings.DetailsCustomization.Conditions', description: 'SPELLBOOK.Settings.DetailsCustomization.ConditionsDesc' },
  { key: 'save', setting: SETTINGS.GM_UI_SAVE, label: 'SPELLBOOK.Settings.DetailsCustomization.Save', description: 'SPELLBOOK.Settings.DetailsCustomization.SaveDesc' },
  {
    key: 'concentration',
    setting: SETTINGS.GM_UI_CONCENTRATION,
    label: 'SPELLBOOK.Settings.DetailsCustomization.Concentration',
    description: 'SPELLBOOK.Settings.DetailsCustomization.ConcentrationDesc'
  },
  {
    key: 'materialComponents',
    setting: SETTINGS.GM_UI_MATERIAL_COMPONENTS,
    label: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponents',
    description: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponentsDesc'
  }
];

/**
 * Build render context for the setting-item.hbs partial.
 * @param {object[]} group - Element definitions for a single group
 * @param {string} prefix - DOM id prefix for generated checkboxes
 * @returns {object[]} Array of partial-compatible items
 */
function buildItems(group, prefix) {
  return group.map((el) => ({ key: el.key, id: `${prefix}-${el.key}`, name: el.setting, checked: game.settings.get(MODULE.ID, el.setting), label: el.label, description: el.description }));
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
    form: { handler: DetailsCustomization.#onSubmit, closeOnSubmit: true },
    actions: {
      useUserColor: DetailsCustomization.#onUseUserColor,
      reset: DetailsCustomization.#onReset
    }
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
    context.playerUI = buildItems(PLAYER_UI, 'player-ui');
    context.playerMetadata = buildItems(PLAYER_METADATA, 'player-metadata');
    context.gmUI = context.isGM ? buildItems(GM_UI, 'gm-ui') : [];
    context.gmMetadata = context.isGM ? buildItems(GM_METADATA, 'gm-metadata') : [];
    context.wizardBookIconColor = game.settings.get(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR);
    context.userColor = game.user.color;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const fieldsets = this.element.querySelectorAll('fieldset[data-group]');
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
   * Set the wizard book color picker to the current user's color.
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} target - Button that triggered the action
   */
  static #onUseUserColor(_event, target) {
    const picker = this.element.querySelector('color-picker[name="wizardBookIconColor"]');
    if (picker) picker.value = target.dataset.userColor || game.user.color;
  }

  /**
   * Reset the wizard book color picker to the saved setting value.
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} _target - Button that triggered the action
   */
  static #onReset(_event, _target) {
    const picker = this.element.querySelector('color-picker[name="wizardBookIconColor"]');
    if (picker) picker.value = game.settings.get(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR) ?? '';
  }

  /**
   * Persist all toggles and refresh open consumers.
   * @param {SubmitEvent} _event - Form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {object} formData - Processed form data
   */
  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;
    const groups = [PLAYER_UI, PLAYER_METADATA];
    if (game.user.isGM) groups.push(GM_UI, GM_METADATA);
    const writes = groups.flatMap((group) => group.map((el) => game.settings.set(MODULE.ID, el.setting, data[el.setting] === true || data[el.setting] === 'true')));
    if ('wizardBookIconColor' in data) writes.push(game.settings.set(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR, data.wizardBookIconColor || null));
    await Promise.all(writes);
    for (const app of foundry.applications.instances.values()) {
      if (typeof app.refreshDisplay === 'function' && (app.constructor.name === 'SpellBook' || app.constructor.name === 'SpellListManager')) app.refreshDisplay();
    }
    log(3, 'Details customization saved.');
  }
}
