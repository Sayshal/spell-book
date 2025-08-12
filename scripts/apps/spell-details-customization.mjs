import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { UICustomizationHelper } from '../helpers/ui-customization.mjs';
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
    return {
      ...context,
      isGM,
      playerSettings,
      gmSettings,
      playerUIElements: this._getUIElementsConfig('player'),
      gmUIElements: isGM ? this._getUIElementsConfig('gm') : null,
      playerMetadataElements: this._getMetadataElementsConfig('player'),
      gmMetadataElements: isGM ? this._getMetadataElementsConfig('gm') : null
    };
  }

  /**
   * Get player UI settings
   * @returns {object} Player settings object
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
   * Get GM UI settings
   * @returns {object} GM settings object
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
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Processes form submission for customization settings
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<boolean|void>} Returns false if validation fails
   * @static
   */
  static async formHandler(_event, _form, formData) {
    try {
      const changedSettings = {};
      const isGM = game.user.isGM;
      const playerKeys = ['favorites', 'compare', 'notes', 'spellLevel', 'school', 'castingTime', 'range', 'damageTypes', 'conditions', 'save', 'concentration', 'materialComponents'];
      for (const key of playerKeys) {
        const settingKeySuffix = UICustomizationHelper._convertToSettingKey ? UICustomizationHelper._convertToSettingKey(key) : key.toUpperCase().replace(/([a-z])([A-Z])/g, '$1_$2');
        const settingKey = `PLAYER_UI_${settingKeySuffix}`;
        if (!SETTINGS[settingKey]) continue;
        const currentValue = game.settings.get(MODULE.ID, SETTINGS[settingKey]);
        const newValue = formData.object[`player_${key}`] ?? false;
        if (currentValue !== newValue) {
          await game.settings.set(MODULE.ID, SETTINGS[settingKey], newValue);
          changedSettings[settingKey] = true;
        }
      }
      if (isGM) {
        const gmKeys = ['compare', 'spellLevel', 'school', 'castingTime', 'range', 'damageTypes', 'conditions', 'save', 'concentration', 'materialComponents'];
        for (const key of gmKeys) {
          const settingKeySuffix = UICustomizationHelper._convertToSettingKey ? UICustomizationHelper._convertToSettingKey(key) : key.toUpperCase().replace(/([a-z])([A-Z])/g, '$1_$2');
          const settingKey = `GM_UI_${settingKeySuffix}`;
          if (!SETTINGS[settingKey]) continue;
          const currentValue = game.settings.get(MODULE.ID, SETTINGS[settingKey]);
          const newValue = formData.object[`gm_${key}`] ?? false;
          if (currentValue !== newValue) {
            await game.settings.set(MODULE.ID, SETTINGS[settingKey], newValue);
            changedSettings[settingKey] = true;
          }
        }
      }
      if (Object.keys(changedSettings).length > 0) {
        for (const app of foundry.applications.instances.values()) if (app.constructor.name === 'PlayerSpellBook' || app.constructor.name === 'GMSpellListManager') app.render(false);
        ui.notifications.info(game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.Saved'));
      }
    } catch (error) {
      log(1, `Error in spell details customization formHandler: ${error.message}`);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Settings.DetailsCustomization.ErrorSaving'));
      return false;
    }
  }
}
