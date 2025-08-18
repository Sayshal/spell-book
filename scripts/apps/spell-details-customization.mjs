import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SpellDetailsCustomization extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'spell-details-customization',
    classes: ['spell-book', 'spell-details-customization'],
    tag: 'form',
    form: {
      handler: SpellDetailsCustomization.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      useUserColor: SpellDetailsCustomization.useUserColor,
      resetToDefault: SpellDetailsCustomization.resetToDefault
    },
    position: { height: 'auto', width: 800 },
    window: { icon: 'fa-solid fa-palette', resizable: false }
  };

  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.SPELL_CUSTOMIZATION_BODY, id: 'body', classes: ['spell-details-customization-popup'] },
    footer: { template: TEMPLATES.DIALOGS.SPELL_CUSTOMIZATION_FOOTER, id: 'footer', classes: ['spell-details-customization-footer'] }
  };

  get title() {
    return game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.Title');
  }

  /** @inheritdoc */
  async _prepareContext(_options) {
    const context = await super._prepareContext(_options);
    const isGM = game.user.isGM;
    const playerSettings = this._getPlayerSettings();
    const gmSettings = isGM ? this._getGMSettings() : null;
    const playerUIElements = this._prepareUIElementsWithCheckboxes('player', playerSettings);
    const playerMetadataElements = this._prepareMetadataElementsWithCheckboxes('player', playerSettings);
    let gmUIElements = null;
    let gmMetadataElements = null;
    if (isGM) {
      gmUIElements = this._prepareUIElementsWithCheckboxes('gm', gmSettings);
      gmMetadataElements = this._prepareMetadataElementsWithCheckboxes('gm', gmSettings);
    }
    const selectAllPlayerUICheckbox = this._createSelectAllCheckbox('select-all-player-ui', 'player-ui');
    const selectAllPlayerMetadataCheckbox = this._createSelectAllCheckbox('select-all-player-metadata', 'player-metadata');
    const selectAllGMUICheckbox = isGM ? this._createSelectAllCheckbox('select-all-gm-ui', 'gm-ui') : null;
    const selectAllGMMetadataCheckbox = isGM ? this._createSelectAllCheckbox('select-all-gm-metadata', 'gm-metadata') : null;
    const wizardBookIconColor = game.settings.get(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR);

    return {
      ...context,
      isGM,
      playerSettings,
      gmSettings,
      playerUIElements,
      gmUIElements,
      playerMetadataElements,
      gmMetadataElements,
      selectAllPlayerUICheckbox,
      selectAllPlayerMetadataCheckbox,
      selectAllGMUICheckbox,
      selectAllGMMetadataCheckbox,
      wizardBookIconColor: wizardBookIconColor || '',
      userColor: game.user.color
    };
  }

  /**
   * Prepare UI elements with generated checkboxes
   * @param {string} type - 'player' or 'gm'
   * @param {Object} settings - Current settings object
   * @returns {Array} Array of UI element configurations with checkboxes
   * @private
   */
  _prepareUIElementsWithCheckboxes(type, settings) {
    const elements = this._getUIElementsConfig(type);
    return elements.map((element) => {
      const checkbox = formElements.createCheckbox({ name: `${type}.${element.key}`, checked: settings[element.key] || false, ariaLabel: game.i18n.localize(element.label) });
      checkbox.id = `${type}-${element.key}`;
      return { ...element, checkboxHtml: formElements.elementToHtml(checkbox) };
    });
  }

  /**
   * Prepare metadata elements with generated checkboxes
   * @param {string} type - 'player' or 'gm'
   * @param {Object} settings - Current settings object
   * @returns {Array} Array of metadata element configurations with checkboxes
   * @private
   */
  _prepareMetadataElementsWithCheckboxes(type, settings) {
    const elements = this._getMetadataElementsConfig(type);
    return elements.map((element) => {
      const checkbox = formElements.createCheckbox({ name: `${type}.${element.key}`, checked: settings[element.key] || false, ariaLabel: game.i18n.localize(element.label) });
      checkbox.id = `${type}-${element.key}`;
      return { ...element, checkboxHtml: formElements.elementToHtml(checkbox) };
    });
  }

  /**
   * Create a select-all checkbox for a group
   * @param {string} id - The checkbox ID
   * @param {string} group - The group identifier
   * @returns {string} HTML for the select-all checkbox
   * @private
   */
  _createSelectAllCheckbox(id, group) {
    const checkbox = formElements.createCheckbox({ name: id, checked: false, ariaLabel: game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.SelectAll') });
    checkbox.id = id;
    checkbox.dataset.action = 'selectAll';
    checkbox.dataset.group = group;
    checkbox.classList.add('select-all-checkbox');
    return formElements.elementToHtml(checkbox);
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this._setupClickableSettings();
    this._setupSelectAllListeners();
    this._updateSelectAllStates();
  }

  /**
   * Setup clickable setting items
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
   * Setup select-all checkbox listeners
   * @private
   */
  _setupSelectAllListeners() {
    const selectAllCheckboxes = this.element.querySelectorAll('.select-all-checkbox');
    selectAllCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const group = checkbox.dataset.group;
        const isChecked = checkbox.checked;
        this._setGroupCheckboxes(group, isChecked);
      });
    });
    const individualCheckboxes = this.element.querySelectorAll('.setting-item dnd5e-checkbox');
    individualCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const settingItem = checkbox.closest('.setting-item');
        const group = settingItem?.dataset.group;
        if (group) this._updateSelectAllState(group);
      });
    });
  }

  /**
   * Set all checkboxes in a group to checked/unchecked
   * @param {string} group - The group identifier
   * @param {boolean} checked - Whether to check or uncheck
   * @private
   */
  _setGroupCheckboxes(group, checked) {
    const groupItems = this.element.querySelectorAll(`[data-group="${group}"]`);
    groupItems.forEach((item) => {
      if (item.classList.contains('setting-item')) {
        const checkbox = item.querySelector('dnd5e-checkbox');
        if (checkbox) checkbox.checked = checked;
      }
    });
  }

  /**
   * Update the select-all checkbox state based on group items
   * @param {string} group - The group identifier
   * @private
   */
  _updateSelectAllState(group) {
    const selectAllCheckbox = this.element.querySelector(`[data-group="${group}"].select-all-checkbox`);
    const groupCheckboxes = this.element.querySelectorAll(`[data-group="${group}"].setting-item dnd5e-checkbox`);
    if (!selectAllCheckbox || groupCheckboxes.length === 0) return;
    const checkedCount = Array.from(groupCheckboxes).filter((cb) => cb.checked).length;
    if (checkedCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === groupCheckboxes.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }

  /**
   * Update all select-all checkbox states
   * @private
   */
  _updateSelectAllStates() {
    ['player-ui', 'player-metadata', 'gm-ui', 'gm-metadata'].forEach((group) => {
      this._updateSelectAllState(group);
    });
  }

  /**
   * Get player UI customization settings
   * @returns {Object} Player settings object
   * @private
   */
  _getPlayerSettings() {
    return {
      favorites: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES),
      compare: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_COMPARE),
      notes: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_NOTES),
      spellLevel: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_SPELL_LEVEL),
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
   * Get GM UI customization settings
   * @returns {Object} GM settings object
   * @private
   */
  _getGMSettings() {
    return {
      compare: game.settings.get(MODULE.ID, SETTINGS.GM_UI_COMPARE),
      spellLevel: game.settings.get(MODULE.ID, SETTINGS.GM_UI_SPELL_LEVEL),
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
   * Get UI elements configuration
   * @param {string} type - 'player' or 'gm'
   * @returns {Array} Array of UI element configurations
   * @private
   */
  _getUIElementsConfig(type) {
    if (type === 'player') {
      return [
        {
          key: 'favorites',
          label: 'SPELLBOOK.Settings.DetailsCustomization.Favorites',
          description: '<i class="fas fa-star"></i> ' + game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.FavoritesDesc')
        },
        {
          key: 'compare',
          label: 'SPELLBOOK.Settings.DetailsCustomization.Compare',
          description: game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.CompareDesc')
        },
        {
          key: 'notes',
          label: 'SPELLBOOK.Settings.DetailsCustomization.Notes',
          description: '<i class="fas fa-sticky-note"></i> ' + game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.NotesDesc')
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
   * Get metadata elements configuration
   * @param {string} type - 'player' or 'gm'
   * @returns {Array} Array of metadata element configurations
   * @private
   */
  _getMetadataElementsConfig(type) {
    return [
      { key: 'spellLevel', label: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevel', description: 'SPELLBOOK.Settings.DetailsCustomization.SpellLevelDesc' },
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

  /* -------------------------------------------- */
  /*  Event Handlers                             */
  /* -------------------------------------------- */

  /**
   * Handle form submission to save settings
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {Object} formData - The submitted form data
   * @returns {Promise<void>}
   * @static
   */
  static async formHandler(_event, _form, formData) {
    try {
      const expandedData = foundry.utils.expandObject(formData.object);

      if (expandedData.player) {
        await Promise.all([
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES, expandedData.player.favorites || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_COMPARE, expandedData.player.compare || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_NOTES, expandedData.player.notes || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_SPELL_LEVEL, expandedData.player.spellLevel || false),
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

      // Handle wizard book icon color with proper null handling
      if (expandedData.wizardBookIconColor !== undefined) {
        const colorValue = expandedData.wizardBookIconColor || null;
        await game.settings.set(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR, colorValue);
      }

      // ... existing GM settings handling ...
      if (expandedData.gm && game.user.isGM) {
        await Promise.all([
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_COMPARE, expandedData.gm.compare || false),
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_SPELL_LEVEL, expandedData.gm.spellLevel || false),
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

      ui.notifications.info(game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.Saved'));
    } catch (error) {
      log(1, 'Error saving spell customization settings:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.ErrorSaving'));
    }
  }

  /**
   * Action handler to set wizard book color to user color
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   * @static
   */
  static async useUserColor(event, target) {
    const userColor = target.dataset.userColor || game.user.color;
    const colorPicker = target.closest('.wizard-book-color-controls').querySelector('color-picker[name="wizardBookIconColor"]');
    if (colorPicker) {
      colorPicker.value = userColor;
      log(3, `Set wizard book color to user color: ${userColor}`);
    }
  }

  /**
   * Action handler to reset wizard book color to default/saved setting
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   * @static
   */
  static async resetToDefault(event, target) {
    const colorPicker = target.closest('.wizard-book-color-controls').querySelector('color-picker[name="wizardBookIconColor"]');
    if (colorPicker) {
      // Get the last saved setting value
      const savedColor = game.settings.get(MODULE.ID, SETTINGS.WIZARD_BOOK_ICON_COLOR);
      colorPicker.value = savedColor || '';
      log(3, `Reset wizard book color to default: ${savedColor || 'empty'}`);
    }
  }
}
