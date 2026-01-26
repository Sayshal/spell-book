/**
 * Spell Details Customization Dialog
 *
 * Configuration interface for customizing spell detail display and behavior.
 * Allows users to configure which spell information is shown, how it's formatted,
 * and how spell details integrate with character sheets and other interfaces.
 * @module Dialogs/DetailsCustomization
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from '../ui/_module.mjs';
import * as ValidationUtils from '../validation/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog application for customizing spell detail display settings and preferences.
 */
export class DetailsCustomization extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'spell-details-customization',
    classes: ['spell-book', 'spell-details-customization'],
    tag: 'form',
    form: {
      handler: DetailsCustomization.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      useUserColor: this.#useUserColor,
      reset: this.#reset
    },
    position: { height: 600, width: 800 },
    window: { title: 'SPELLBOOK.Settings.DetailsCustomization.Title', icon: 'fa-solid fa-palette', resizable: true }
  };

  /** @inheritdoc */
  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.SPELL_CUSTOMIZATION_BODY, id: 'body', classes: ['spell-details-customization-popup'] },
    footer: { template: TEMPLATES.DIALOGS.SPELL_CUSTOMIZATION_FOOTER, id: 'footer', classes: ['spell-details-customization-footer'] }
  };

  /** @inheritdoc */
  async _prepareContext(_options) {
    log(3, 'Preparing context for details customization.', { options: _options });
    const context = await super._prepareContext(_options);
    context.isGM = game.user.isGM;
    context.playerSettings = this._getPlayerSettings();
    context.gmSettings = context.isGM ? this._getGMSettings() : null;
    context.playerUIElements = this._prepareUIElementsWithCheckboxes('player', context.playerSettings);
    context.playerMetadataElements = this._prepareMetadataElementsWithCheckboxes('player', context.playerSettings);
    context.gmUIElements = null;
    context.gmMetadataElements = null;
    if (context.isGM) {
      context.gmUIElements = this._prepareUIElementsWithCheckboxes('gm', context.gmSettings);
      context.gmMetadataElements = this._prepareMetadataElementsWithCheckboxes('gm', context.gmSettings);
    }
    context.selectAllPlayerUICheckbox = this._createSelectAllCheckbox('select-all-player-ui', 'player-ui');
    context.selectAllPlayerMetadataCheckbox = this._createSelectAllCheckbox('select-all-player-metadata', 'player-metadata');
    context.selectAllGMUICheckbox = context.isGM ? this._createSelectAllCheckbox('select-all-gm-ui', 'gm-ui') : null;
    context.selectAllGMMetadataCheckbox = context.isGM ? this._createSelectAllCheckbox('select-all-gm-metadata', 'gm-metadata') : null;
    context.wizardBookIconColor = game.settings.get(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR);
    context.userColor = game.user.color;
    return context;
  }

  /** @inheritdoc */
  _onRender(context, options) {
    log(3, 'Rendering details customization dialog.', { context, options });
    super._onRender(context, options);
    this._setupClickableSettings();
    this._setupSelectAllListeners();
    this._updateSelectAllStates();
  }

  /**
   * Prepare UI elements with generated checkbox form controls.
   * @param {string} type - Setting type ('player' or 'gm')
   * @param {object} settings - Current settings object
   * @returns {Array<{ key: string, label: string, description: string, checkboxHtml: string }>} Array of UI element configurations with checkboxes
   * @private
   */
  _prepareUIElementsWithCheckboxes(type, settings) {
    log(3, 'Preparing UI elements with checkboxes.', { type, settingsKeys: Object.keys(settings) });
    const elements = this._getUIElementsConfig(type);
    return elements.map((element) => {
      const checkbox = ValidationUtils.createCheckbox({ name: `${type}.${element.key}`, checked: settings[element.key] || false, ariaLabel: game.i18n.localize(element.label) });
      checkbox.id = `${type}-${element.key}`;
      return { ...element, checkboxHtml: ValidationUtils.elementToHtml(checkbox) };
    });
  }

  /**
   * Prepare metadata elements with generated checkbox form controls.
   * @param {string} type - Setting type ('player' or 'gm')
   * @param {object} settings - Current settings object
   * @returns {Array<{ key: string, label: string, description: string, checkboxHtml: string }>} Array of metadata element configurations with checkboxes
   * @private
   */
  _prepareMetadataElementsWithCheckboxes(type, settings) {
    log(3, 'Preparing metadata elements with checkboxes.', { type, settingsKeys: Object.keys(settings) });
    const elements = this._getMetadataElementsConfig();
    return elements.map((element) => {
      const checkbox = ValidationUtils.createCheckbox({ name: `${type}.${element.key}`, checked: settings[element.key] || false, ariaLabel: game.i18n.localize(element.label) });
      checkbox.id = `${type}-${element.key}`;
      return { ...element, checkboxHtml: ValidationUtils.elementToHtml(checkbox) };
    });
  }

  /**
   * Create a select-all checkbox for bulk group operations.
   * @param {string} id - Unique checkbox ID
   * @param {string} group - Group identifier for related checkboxes
   * @returns {string} HTML string for the select-all checkbox
   * @private
   */
  _createSelectAllCheckbox(id, group) {
    log(3, 'Creating select-all checkbox.', { id, group });
    const checkbox = ValidationUtils.createCheckbox({ name: id, checked: false, ariaLabel: game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.SelectAll') });
    checkbox.id = id;
    checkbox.dataset.action = 'selectAll';
    checkbox.dataset.group = group;
    checkbox.classList.add('select-all-checkbox');
    return ValidationUtils.elementToHtml(checkbox);
  }

  /**
   * Set up clickable setting item interactions.
   * @private
   */
  _setupClickableSettings() {
    log(3, 'Setting up clickable settings.');
    const clickableSettings = this.element.querySelectorAll('.clickable-setting');
    clickableSettings.forEach((setting) => {
      setting.addEventListener('click', (event) => {
        if (event.target.matches('dnd5e-checkbox, input[type="checkbox"]')) return;
        const checkboxId = setting.dataset.checkboxId;
        const checkbox = this.element.querySelector(`#${checkboxId}`);
        if (checkbox) {
          log(3, 'Clickable setting toggled.', { checkboxId, checked: !checkbox.checked });
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          this._updateSelectAllState(setting.dataset.group);
        }
      });
      setting.addEventListener('mouseenter', () => {
        setting.classList.add('setting-hover');
      });
      setting.addEventListener('mouseleave', () => {
        setting.classList.remove('setting-hover');
      });
    });
  }

  /**
   * Set up event listeners for select-all checkbox functionality.
   * @private
   */
  _setupSelectAllListeners() {
    log(3, 'Setting up select-all listeners.');
    const selectAllCheckboxes = this.element.querySelectorAll('.select-all-checkbox');
    selectAllCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (_event) => {
        const group = checkbox.dataset.group;
        const isChecked = checkbox.checked;
        log(3, 'Select-all checkbox changed.', { group, isChecked });
        this._setGroupCheckboxes(group, isChecked);
      });
    });
    const individualCheckboxes = this.element.querySelectorAll('.setting-item dnd5e-checkbox');
    individualCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (_event) => {
        const settingItem = checkbox.closest('.setting-item');
        const group = settingItem?.dataset.group;
        if (group) {
          log(3, 'Individual checkbox changed.', { group, checkboxId: checkbox.id });
          this._updateSelectAllState(group);
        }
      });
    });
  }

  /**
   * Set all checkboxes in a group to a specific checked state.
   * @param {string} group - The group identifier
   * @param {boolean} checked - Whether to check or uncheck the group
   * @private
   */
  _setGroupCheckboxes(group, checked) {
    log(3, 'Setting group checkboxes.', { group, checked });
    const groupCheckboxes = this.element.querySelectorAll(`[data-group="${group}"].setting-item dnd5e-checkbox`);
    UIUtils.setGroupCheckboxes(groupCheckboxes, checked);
  }

  /**
   * Update the select-all checkbox state based on individual checkbox states.
   * @param {string} group - The group identifier to update
   * @private
   */
  _updateSelectAllState(group) {
    log(3, 'Updating select-all state.', { group });
    const selectAllCheckbox = this.element.querySelector(`[data-group="${group}"].select-all-checkbox`);
    const groupCheckboxes = this.element.querySelectorAll(`[data-group="${group}"].setting-item dnd5e-checkbox`);
    UIUtils.updateSelectAllState(selectAllCheckbox, groupCheckboxes);
  }

  /**
   * Update all select-all checkbox states for all groups.
   * @private
   */
  _updateSelectAllStates() {
    log(3, 'Updating all select-all states.');
    ['player-ui', 'player-metadata', 'gm-ui', 'gm-metadata'].forEach((group) => {
      this._updateSelectAllState(group);
    });
  }

  /**
   * Retrieve current player UI customization settings from world settings.
   * @returns {object} Object containing all player UI settings
   * @private
   */
  _getPlayerSettings() {
    log(3, 'Getting player settings.');
    return {
      favorites: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES),
      compare: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_COMPARE),
      notes: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_NOTES),
      spellLevel: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_SPELL_LEVEL),
      components: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_COMPONENTS),
      school: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_SCHOOL),
      castingTime: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_CASTING_TIME),
      range: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_RANGE),
      damageTypes: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_DAMAGE_TYPES),
      conditions: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_CONDITIONS),
      save: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_SAVE),
      concentration: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_CONCENTRATION),
      materialComponents: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_MATERIAL_COMPONENTS),
      sidebarControlsBottom: game.settings.get(MODULE.ID, SETTINGS.SIDEBAR_CONTROLS_BOTTOM)
    };
  }

  /**
   * Retrieve current GM UI customization settings from world settings.
   * @returns {object} Object containing all GM UI settings
   * @private
   */
  _getGMSettings() {
    log(3, 'Getting GM settings.');
    return {
      compare: game.settings.get(MODULE.ID, SETTINGS.GM_UI_COMPARE),
      spellLevel: game.settings.get(MODULE.ID, SETTINGS.GM_UI_SPELL_LEVEL),
      components: game.settings.get(MODULE.ID, SETTINGS.GM_UI_COMPONENTS),
      school: game.settings.get(MODULE.ID, SETTINGS.GM_UI_SCHOOL),
      castingTime: game.settings.get(MODULE.ID, SETTINGS.GM_UI_CASTING_TIME),
      range: game.settings.get(MODULE.ID, SETTINGS.GM_UI_RANGE),
      damageTypes: game.settings.get(MODULE.ID, SETTINGS.GM_UI_DAMAGE_TYPES),
      conditions: game.settings.get(MODULE.ID, SETTINGS.GM_UI_CONDITIONS),
      save: game.settings.get(MODULE.ID, SETTINGS.GM_UI_SAVE),
      concentration: game.settings.get(MODULE.ID, SETTINGS.GM_UI_CONCENTRATION),
      materialComponents: game.settings.get(MODULE.ID, SETTINGS.GM_UI_MATERIAL_COMPONENTS)
    };
  }

  /**
   * Get UI elements configuration for a specific user type.
   * @param {string} type - User type ('player' or 'gm')
   * @returns {Array<{ key: string, label: string, description: string }>} Array of UI element configurations
   * @private
   */
  _getUIElementsConfig(type) {
    log(3, 'Getting UI elements config.', { type });
    if (type === 'player') {
      return [
        {
          key: 'favorites',
          label: 'SPELLBOOK.Settings.DetailsCustomization.Favorites',
          description: `<i class="fas fa-star"></i> ${game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.FavoritesDesc')}`
        },
        {
          key: 'compare',
          label: 'SPELLBOOK.Settings.DetailsCustomization.Compare',
          description: game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.CompareDesc')
        },
        {
          key: 'notes',
          label: 'SPELLBOOK.Settings.DetailsCustomization.Notes',
          description: `<i class="fas fa-sticky-note"></i> ${game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.NotesDesc')}`
        },
        {
          key: 'sidebarControlsBottom',
          label: 'SPELLBOOK.Settings.DetailsCustomization.SidebarControlsBottom',
          description: game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.SidebarControlsBottomDesc')
        }
      ];
    } else {
      return [
        {
          key: 'compare',
          label: 'SPELLBOOK.Settings.DetailsCustomization.Compare',
          description: 'SPELLBOOK.Settings.DetailsCustomization.CompareDesc'
        }
      ];
    }
  }

  /**
   * Get metadata elements configuration for spell detail display.
   * @returns {Array<{ key: string, label: string, description: string }>} Array of metadata element configurations
   * @private
   */
  _getMetadataElementsConfig() {
    log(3, 'Getting metadata elements config.');
    return [
      { key: 'spellLevel', label: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevel', description: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevelDesc' },
      { key: 'components', label: 'SPELLBOOK.Settings.DetailsCustomization.Components', description: 'SPELLBOOK.Settings.DetailsCustomization.ComponentsDesc' },
      { key: 'school', label: 'SPELLBOOK.Settings.DetailsCustomization.School', description: 'SPELLBOOK.Settings.DetailsCustomization.SchoolDesc' },
      { key: 'castingTime', label: 'SPELLBOOK.Settings.DetailsCustomization.CastingTime', description: 'SPELLBOOK.Settings.DetailsCustomization.CastingTimeDesc' },
      { key: 'range', label: 'SPELLBOOK.Settings.DetailsCustomization.Range', description: 'SPELLBOOK.Settings.DetailsCustomization.RangeDesc' },
      { key: 'damageTypes', label: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypes', description: 'SPELLBOOK.Settings.DetailsCustomization.DamageTypesDesc' },
      { key: 'conditions', label: 'SPELLBOOK.Settings.DetailsCustomization.Conditions', description: 'SPELLBOOK.Settings.DetailsCustomization.ConditionsDesc' },
      { key: 'save', label: 'SPELLBOOK.Settings.DetailsCustomization.Save', description: 'SPELLBOOK.Settings.DetailsCustomization.SaveDesc' },
      { key: 'concentration', label: 'SPELLBOOK.Settings.DetailsCustomization.Concentration', description: 'SPELLBOOK.Settings.DetailsCustomization.ConcentrationDesc' },
      { key: 'materialComponents', label: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponents', description: 'SPELLBOOK.Settings.DetailsCustomization.MaterialComponentsDesc' }
    ];
  }

  /**
   * Handle using user color.
   * @this DetailsCustomization
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static async #useUserColor(_event, target) {
    log(3, 'Using user color for wizard book icon.');
    const userColor = target.dataset.userColor || game.user.color;
    const colorPicker = target.closest('.wizard-book-color-controls').querySelector('color-picker[name="wizardBookIconColor"]');
    if (colorPicker) colorPicker.value = userColor;
  }

  /**
   * Handle resetting color.
   * @this DetailsCustomization
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static async #reset(_event, target) {
    log(3, 'Resetting wizard book icon color to default.');
    const colorPicker = target.closest('.wizard-book-color-controls').querySelector('color-picker[name="wizardBookIconColor"]');
    if (colorPicker) {
      const savedColor = game.settings.get(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR);
      colorPicker.value = savedColor || '';
    }
  }

  /** @inheritdoc */
  static async formHandler(_event, _form, formData) {
    log(3, 'Handling form submission for details customization.');
    try {
      const expandedData = foundry.utils.expandObject(formData.object);
      if (expandedData.player) {
        log(3, 'Saving player settings.');
        await Promise.all([
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES, expandedData.player.favorites || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_COMPARE, expandedData.player.compare || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_NOTES, expandedData.player.notes || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_SPELL_LEVEL, expandedData.player.spellLevel || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_COMPONENTS, expandedData.player.components || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_SCHOOL, expandedData.player.school || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_CASTING_TIME, expandedData.player.castingTime || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_RANGE, expandedData.player.range || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_DAMAGE_TYPES, expandedData.player.damageTypes || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_CONDITIONS, expandedData.player.conditions || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_SAVE, expandedData.player.save || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_CONCENTRATION, expandedData.player.concentration || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_MATERIAL_COMPONENTS, expandedData.player.materialComponents || false),
          game.settings.set(MODULE.ID, SETTINGS.SIDEBAR_CONTROLS_BOTTOM, expandedData.player.sidebarControlsBottom || false)
        ]);
      }
      if (expandedData.wizardBookIconColor !== undefined) {
        log(3, 'Saving wizard book icon color.', { color: expandedData.wizardBookIconColor });
        const colorValue = expandedData.wizardBookIconColor || null;
        await game.settings.set(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR, colorValue);
      }
      if (expandedData.gm && game.user.isGM) {
        log(3, 'Saving GM settings.');
        await Promise.all([
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_COMPARE, expandedData.gm.compare || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_SPELL_LEVEL, expandedData.gm.spellLevel || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_COMPONENTS, expandedData.gm.components || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_SCHOOL, expandedData.gm.school || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_CASTING_TIME, expandedData.gm.castingTime || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_RANGE, expandedData.gm.range || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_DAMAGE_TYPES, expandedData.gm.damageTypes || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_CONDITIONS, expandedData.gm.conditions || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_SAVE, expandedData.gm.save || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_CONCENTRATION, expandedData.gm.concentration || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_MATERIAL_COMPONENTS, expandedData.gm.materialComponents || false)
        ]);
      }
      log(3, 'Re-rendering open Spell Book applications.');
      const openApplications = Array.from(foundry.applications.instances.values());
      const spellbookApps = openApplications.filter((app) => app.constructor.name === 'SpellBook');
      for (const app of spellbookApps) app.render(false);
      const gmSpellListApps = openApplications.filter((app) => app.constructor.name === 'SpellListManager');
      for (const app of gmSpellListApps) app.render(false);
    } catch (error) {
      log(1, 'Error saving details customization settings.', { error });
    }
  }
}
