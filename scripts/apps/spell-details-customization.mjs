import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SpellDetailsCustomization extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static DEFAULT_OPTIONS = {
    id: 'spell-details-customization',
    classes: ['spell-book', 'spell-details-customization'],
    tag: 'form',
    form: {
      handler: SpellDetailsCustomization.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: { height: 'auto', width: 'auto' },
    window: { icon: 'fa-solid fa-palette', resizable: false }
  };

  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.SPELL_CUSTOMIZATION_BODY, id: 'body', classes: ['spell-details-customization-popup'] },
    footer: { template: TEMPLATES.DIALOGS.SPELL_CUSTOMIZATION_FOOTER, id: 'footer', classes: ['spell-details-customization-footer'] }
  };

  get title() {
    return game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.Title');
  }

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  /**
   * Prepares context data for the customization settings application
   * @param {object} _options - Application render options
   * @returns {object} Context data for template rendering
   * @protected
   */
  async _prepareContext(_options) {
    const context = await super._prepareContext(_options);
    const isGM = game.user.isGM;
    const playerSettings = this._getPlayerSettings();
    const gmSettings = isGM ? this._getGMSettings() : null;

    // Generate form elements for player sections
    const playerUIElements = this._prepareUIElementsWithCheckboxes('player', playerSettings);
    const playerMetadataElements = this._prepareMetadataElementsWithCheckboxes('player', playerSettings);

    // Generate form elements for GM sections (if GM)
    let gmUIElements = null;
    let gmMetadataElements = null;
    if (isGM) {
      gmUIElements = this._prepareUIElementsWithCheckboxes('gm', gmSettings);
      gmMetadataElements = this._prepareMetadataElementsWithCheckboxes('gm', gmSettings);
    }

    return {
      ...context,
      isGM,
      playerSettings,
      gmSettings,
      playerUIElements,
      gmUIElements,
      playerMetadataElements,
      gmMetadataElements
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
      const checkbox = formElements.createCheckbox({
        name: `${type}_${element.key}`,
        checked: settings[element.key] || false,
        ariaLabel: game.i18n.localize(element.label)
      });
      checkbox.id = `${type}-${element.key}`;

      return {
        ...element,
        checkboxHtml: formElements.elementToHtml(checkbox)
      };
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
      const checkbox = formElements.createCheckbox({
        name: `${type}_${element.key}`,
        checked: settings[element.key] || false,
        ariaLabel: game.i18n.localize(element.label)
      });
      checkbox.id = `${type}-${element.key}`;

      return {
        ...element,
        checkboxHtml: formElements.elementToHtml(checkbox)
      };
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
      materialComponents: game.settings.get(MODULE.ID, SETTINGS.PLAYER_UI_MATERIAL_COMPONENTS)
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
        { key: 'favorites', label: 'SPELLBOOK.Settings.DetailsCustomization.Favorites', description: 'SPELLBOOK.Settings.DetailsCustomization.FavoritesDesc' },
        { key: 'compare', label: 'SPELLBOOK.Settings.DetailsCustomization.Compare', description: 'SPELLBOOK.Settings.DetailsCustomization.CompareDesc' },
        { key: 'notes', label: 'SPELLBOOK.Settings.DetailsCustomization.Notes', description: 'SPELLBOOK.Settings.DetailsCustomization.NotesDesc' }
      ];
    } else {
      return [{ key: 'compare', label: 'SPELLBOOK.Settings.DetailsCustomization.Compare', description: 'SPELLBOOK.Settings.DetailsCustomization.CompareDesc' }];
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

      // Handle player settings
      if (expandedData.player) {
        await Promise.all([
          // UI Elements
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_FAVORITES, expandedData.player.favorites || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_COMPARE, expandedData.player.compare || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_NOTES, expandedData.player.notes || false),
          // Metadata Elements
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_SPELL_LEVEL, expandedData.player.spellLevel || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_SCHOOL, expandedData.player.school || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_CASTING_TIME, expandedData.player.castingTime || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_RANGE, expandedData.player.range || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_DAMAGE_TYPES, expandedData.player.damageTypes || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_CONDITIONS, expandedData.player.conditions || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_SAVE, expandedData.player.save || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_CONCENTRATION, expandedData.player.concentration || false),
          game.settings.set(MODULE.ID, SETTINGS.PLAYER_UI_MATERIAL_COMPONENTS, expandedData.player.materialComponents || false)
        ]);
      }

      // Handle GM settings (only if user is GM)
      if (game.user.isGM && expandedData.gm) {
        await Promise.all([
          // UI Elements
          game.settings.set(MODULE.ID, SETTINGS.GM_UI_COMPARE, expandedData.gm.compare || false),
          // Metadata Elements
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
      log(3, 'Spell details customization settings saved successfully');
    } catch (error) {
      log(1, 'Error saving spell details customization settings:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.ErrorSaving'));
    }
  }
}
