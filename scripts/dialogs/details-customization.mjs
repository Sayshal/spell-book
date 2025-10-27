/**
 * Spell Details Customization Dialog
 *
 * Configuration interface for customizing spell detail display and behavior.
 * Allows users to configure which spell information is shown, how it's formatted,
 * and how spell details integrate with character sheets and other interfaces.
 *
 * Key features:
 * - Spell detail display customization
 * - Information formatting preferences
 * - Integration behavior configuration
 * - UI layout and presentation options
 * - Per-actor customization support
 * - Real-time preview capabilities
 *
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
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
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
      useUserColor: DetailsCustomization.useUserColor,
      resetToDefault: DetailsCustomization.resetToDefault
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
    super._onRender(context, options);
    this._setupClickableSettings();
    this._setupSelectAllListeners();
    this._updateSelectAllStates();
  }

  /**
   * Prepare UI elements with generated checkbox form controls.
   * @param {string} type - Setting type ('player' or 'gm')
   * @param {PlayerSettings|GMSettings} settings - Current settings object
   * @returns {UIElementConfig[]} Array of UI element configurations with checkboxes
   * @private
   */
  _prepareUIElementsWithCheckboxes(type, settings) {
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
   * @param {PlayerSettings|GMSettings} settings - Current settings object
   * @returns {MetadataElementConfig[]} Array of metadata element configurations with checkboxes
   * @private
   */
  _prepareMetadataElementsWithCheckboxes(type, settings) {
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
    const clickableSettings = this.element.querySelectorAll('.clickable-setting');
    clickableSettings.forEach((setting) => {
      setting.addEventListener('click', (event) => {
        if (event.target.matches('dnd5e-checkbox, input[type="checkbox"]')) return;
        const checkboxId = setting.dataset.checkboxId;
        const checkbox = this.element.querySelector(`#${checkboxId}`);
        if (checkbox) {
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
    const selectAllCheckboxes = this.element.querySelectorAll('.select-all-checkbox');
    selectAllCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (_event) => {
        const group = checkbox.dataset.group;
        const isChecked = checkbox.checked;
        this._setGroupCheckboxes(group, isChecked);
      });
    });
    const individualCheckboxes = this.element.querySelectorAll('.setting-item dnd5e-checkbox');
    individualCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (_event) => {
        const settingItem = checkbox.closest('.setting-item');
        const group = settingItem?.dataset.group;
        if (group) this._updateSelectAllState(group);
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
    const groupCheckboxes = this.element.querySelectorAll(`[data-group="${group}"].setting-item dnd5e-checkbox`);
    UIUtils.setGroupCheckboxes(groupCheckboxes, checked);
  }

  /**
   * Update the select-all checkbox state based on individual checkbox states.
   * @param {string} group - The group identifier to update
   * @private
   */
  _updateSelectAllState(group) {
    const selectAllCheckbox = this.element.querySelector(`[data-group="${group}"].select-all-checkbox`);
    const groupCheckboxes = this.element.querySelectorAll(`[data-group="${group}"].setting-item dnd5e-checkbox`);
    UIUtils.updateSelectAllState(selectAllCheckbox, groupCheckboxes);
  }

  /**
   * Update all select-all checkbox states for all groups.
   * @private
   */
  _updateSelectAllStates() {
    ['player-ui', 'player-metadata', 'gm-ui', 'gm-metadata'].forEach((group) => {
      this._updateSelectAllState(group);
    });
  }

  /**
   * Retrieve current player UI customization settings from world settings.
   * @returns {PlayerSettings} Object containing all player UI settings
   * @private
   */
  _getPlayerSettings() {
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
   * @returns {GMSettings} Object containing all GM UI settings
   * @private
   */
  _getGMSettings() {
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
   * @returns {UIElementConfig[]} Array of UI element configurations
   * @private
   */
  _getUIElementsConfig(type) {
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
   * @returns {MetadataElementConfig[]} Array of metadata element configurations
   * @private
   */
  _getMetadataElementsConfig() {
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
   * Action handler to set wizard book icon color to current user's color.
   * @param {Event} _event - The triggering event (unused)
   * @param {HTMLElement} target - The target element containing user color data
   * @returns {Promise<void>}
   * @static
   */
  static async useUserColor(_event, target) {
    const userColor = target.dataset.userColor || game.user.color;
    const colorPicker = target.closest('.wizard-book-color-controls').querySelector('color-picker[name="wizardBookIconColor"]');
    if (colorPicker) {
      colorPicker.value = userColor;
    }
  }

  /**
   * Action handler to reset wizard book icon color to default/saved setting.
   * @param {Event} _event - The triggering event (unused)
   * @param {HTMLElement} target - The target element within color controls
   * @returns {Promise<void>}
   * @static
   */
  static async resetToDefault(_event, target) {
    const colorPicker = target.closest('.wizard-book-color-controls').querySelector('color-picker[name="wizardBookIconColor"]');
    if (colorPicker) {
      const savedColor = game.settings.get(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR);
      colorPicker.value = savedColor || '';
    }
  }

  /** @inheritdoc */
  static async formHandler(_event, _form, formData) {
    try {
      const expandedData = foundry.utils.expandObject(formData.object);
      if (expandedData.player) {
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
        const colorValue = expandedData.wizardBookIconColor || null;
        await game.settings.set(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR, colorValue);
      }
      if (expandedData.gm && game.user.isGM) {
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
      const openApplications = Array.from(foundry.applications.instances.values());
      const spellbookApps = openApplications.filter((app) => app.constructor.name === 'SpellBook');
      for (const app of spellbookApps) app.render(false);
      const gmSpellListApps = openApplications.filter((app) => app.constructor.name === 'SpellListManager');
      for (const app of gmSpellListApps) app.render(false);
    } catch (error) {}
  }
}
