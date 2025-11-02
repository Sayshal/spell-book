/**
 * UI Customization and Theme Management System
 *
 * This module provides UI customization capabilities for the Spell Book
 * application, managing user preferences for spell metadata display and interface
 * elements. It handles different customization contexts for player and GM interfaces
 * while maintaining consistent formatting and localization.
 *
 * @module UIUtils/UICustomization
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from './_module.mjs';

/**
 * Helper class for managing UI customization settings.
 */
export class CustomUI {
  /**
   * Convert element name to setting key format.
   * @param {string} element - The element name to convert
   * @returns {string} The setting key suffix for the element
   * @static
   * @private
   */
  static _convertToSettingKey(element) {
    const settingKeyMap = {
      favorites: 'FAVORITES',
      compare: 'COMPARE',
      notes: 'NOTES',
      spellLevel: 'SPELL_LEVEL',
      components: 'COMPONENTS',
      school: 'SCHOOL',
      castingTime: 'CASTING_TIME',
      range: 'RANGE',
      damageTypes: 'DAMAGE_TYPES',
      conditions: 'CONDITIONS',
      save: 'SAVE',
      concentration: 'CONCENTRATION',
      materialComponents: 'MATERIAL_COMPONENTS'
    };
    const result = settingKeyMap[element] || element.toUpperCase();
    log(3, 'Converting element to setting key.', { element, result });
    return result;
  }

  /**
   * Check if a UI element should be shown for SpellBook player interface.
   * @param {PlayerUIElement} element - The element to check visibility for
   * @returns {boolean} Whether the element should be displayed in player interface
   * @static
   */
  static isPlayerElementEnabled(element) {
    const settingKeySuffix = this._convertToSettingKey(element);
    const settingKey = `PLAYER_UI_${settingKeySuffix}`;
    const enabled = game.settings.get(MODULE.ID, SETTINGS[settingKey]) ?? true;
    log(3, 'Checking if player element enabled.', { element, settingKey, enabled });
    return enabled;
  }

  /**
   * Check if a UI element should be shown for GMSpellListManager interface.
   * @param {GMUIElement} element - The element to check visibility for
   * @returns {boolean} Whether the element should be displayed in GM interface
   * @static
   */
  static isGMElementEnabled(element) {
    if (element === 'favorites' || element === 'notes') return false;
    const settingKeySuffix = this._convertToSettingKey(element);
    const settingKey = `GM_UI_${settingKeySuffix}`;
    const enabled = game.settings.get(MODULE.ID, SETTINGS[settingKey]) ?? true;
    log(3, 'Checking if GM element enabled.', { element, settingKey, enabled });
    return enabled;
  }

  /**
   * Get all enabled UI elements for player interface in a single call.
   * @returns {Set<string>} Set of enabled element names
   * @static
   */
  static getEnabledPlayerElements() {
    const elements = ['compare', 'favorites', 'notes', 'spellLevel', 'components', 'school', 'castingTime', 'range', 'damageTypes', 'conditions', 'save', 'concentration', 'materialComponents'];
    const enabled = new Set();
    for (const element of elements) if (this.isPlayerElementEnabled(element)) enabled.add(element);
    log(3, 'Retrieved enabled player elements.', { count: enabled.size, elements: Array.from(enabled) });
    return enabled;
  }

  /**
   * Get all enabled UI elements for GM interface in a single call.
   * @returns {Set<string>} Set of enabled element names
   * @static
   */
  static getEnabledGMElements() {
    const elements = ['compare', 'spellLevel', 'components', 'school', 'castingTime', 'range', 'damageTypes', 'conditions', 'save', 'concentration', 'materialComponents'];
    const enabled = new Set();
    for (const element of elements) if (this.isGMElementEnabled(element)) enabled.add(element);
    log(3, 'Retrieved enabled GM elements.', { count: enabled.size, elements: Array.from(enabled) });
    return enabled;
  }

  /**
   * Check if spell has a specific property.
   * @param {SpellMetadata} spell - The spell object to check
   * @param {string} property - The property identifier to check for
   * @returns {boolean} Whether the spell has the specified property
   * @static
   * @private
   */
  static _spellHasProperty(spell, property) {
    if (!foundry.utils.hasProperty(spell, 'system.properties')) return false;
    const properties = foundry.utils.getProperty(spell, 'system.properties');
    let hasProperty = false;
    if (Array.isArray(properties)) hasProperty = properties.includes(property);
    else if (properties instanceof Set) hasProperty = properties.has(property);
    else if (typeof properties === 'object') hasProperty = !!properties[property];
    return hasProperty;
  }

  /**
   * Build custom metadata subtitle for SpellBook player interface.
   * @param {SpellMetadata} spell - The spell object with processed data
   * @param {Set<string>} [enabledElements] - Set of enabled element names. If not provided, will check settings for each element.
   * @param actor Current actor
   * @returns {string} Formatted metadata string for player display
   * @static
   */
  static buildPlayerMetadata(spell, enabledElements = null, actor) {
    const metadata = [];
    const elements = ['spellLevel', 'components', 'school', 'castingTime', 'range', 'damageTypes', 'conditions', 'save', 'concentration', 'materialComponents'];
    for (const element of elements) {
      const isEnabled = enabledElements ? enabledElements.has(element) : this.isPlayerElementEnabled(element);
      if (!isEnabled) continue;
      switch (element) {
        case 'spellLevel': {
          const levelText = UIUtils.formatSpellLevel(spell);
          if (levelText) metadata.push(levelText);
          break;
        }
        case 'components': {
          const componentsText = UIUtils.formatSpellComponents(spell);
          if (componentsText) metadata.push(componentsText);
          break;
        }
        case 'school': {
          const schoolText = UIUtils.formatSpellSchool(spell);
          if (schoolText) metadata.push(schoolText);
          break;
        }
        case 'castingTime': {
          const castingTimeText = UIUtils.formatSpellActivation(spell);
          if (castingTimeText) metadata.push(castingTimeText);
          break;
        }
        case 'range': {
          const rangeText = UIUtils.formatSpellRange(spell, actor);
          if (rangeText) metadata.push(rangeText);
          break;
        }
        case 'damageTypes': {
          if (spell.filterData?.damageTypes?.length) {
            const damageTypes = spell.filterData.damageTypes.map((type) => foundry.utils.getProperty(CONFIG.DND5E, `damageTypes.${type}.label`) || type).join(', ');
            metadata.push(damageTypes);
          }
          break;
        }
        case 'conditions': {
          if (spell.filterData?.conditions?.length) {
            const conditions = spell.filterData.conditions.map((condition) => foundry.utils.getProperty(CONFIG.DND5E, `conditionTypes.${condition}.label`) || condition).join(', ');
            metadata.push(conditions);
          }
          break;
        }
        case 'save': {
          const saveAbility = foundry.utils.getProperty(spell, 'system.save.ability');
          if (saveAbility) {
            const saveLabel = foundry.utils.getProperty(CONFIG.DND5E, `abilities.${saveAbility}.label`) || saveAbility;
            const saveText = game.i18n.localize('DND5E.SavingThrowShort');
            metadata.push(`${saveLabel} ${saveText}`);
          }
          break;
        }
        case 'concentration': {
          if (this._spellHasProperty(spell, 'concentration')) {
            metadata.push(game.i18n.localize('DND5E.Concentration'));
          }
          break;
        }
        case 'materialComponents': {
          const materialText = UIUtils.formatMaterialComponents(spell);
          if (materialText) metadata.push(materialText);
          break;
        }
      }
    }
    const result = metadata.join(' • ');
    return result;
  }

  /**
   * Build custom metadata subtitle for GMSpellListManager interface.
   * @param {SpellMetadata} spell - The spell object with processed data
   * @param {Set<string>} [enabledElements] - Set of enabled element names. If not provided, will check settings for each element.
   * @returns {string} Formatted metadata string for GM display
   * @static
   */
  static buildGMMetadata(spell, enabledElements = null) {
    const metadata = [];
    const elements = ['spellLevel', 'components', 'school', 'castingTime', 'range', 'damageTypes', 'conditions', 'save', 'concentration', 'materialComponents'];
    for (const element of elements) {
      const isEnabled = enabledElements ? enabledElements.has(element) : this.isGMElementEnabled(element);
      if (!isEnabled) continue;
      switch (element) {
        case 'spellLevel': {
          const levelText = UIUtils.formatSpellLevel(spell);
          if (levelText) metadata.push(levelText);
          break;
        }
        case 'components': {
          const componentsText = UIUtils.formatSpellComponents(spell);
          if (componentsText) metadata.push(componentsText);
          break;
        }
        case 'school': {
          const schoolText = UIUtils.formatSpellSchool(spell);
          if (schoolText) metadata.push(schoolText);
          break;
        }
        case 'castingTime': {
          const castingTimeText = UIUtils.formatSpellActivation(spell);
          if (castingTimeText) metadata.push(castingTimeText);
          break;
        }
        case 'range': {
          const rangeText = UIUtils.formatSpellRange(spell);
          if (rangeText) metadata.push(rangeText);
          break;
        }
        case 'damageTypes': {
          if (spell.filterData?.damageTypes?.length) {
            const damageTypes = spell.filterData.damageTypes.map((type) => foundry.utils.getProperty(CONFIG.DND5E, `damageTypes.${type}.label`) || type).join(', ');
            metadata.push(damageTypes);
          }
          break;
        }
        case 'conditions': {
          if (spell.filterData?.conditions?.length) {
            const conditions = spell.filterData.conditions.map((condition) => foundry.utils.getProperty(CONFIG.DND5E, `conditionTypes.${condition}.label`) || condition).join(', ');
            metadata.push(conditions);
          }
          break;
        }
        case 'save': {
          const saveAbility = foundry.utils.getProperty(spell, 'system.save.ability');
          if (saveAbility) {
            const saveLabel = foundry.utils.getProperty(CONFIG.DND5E, `abilities.${saveAbility}.label`) || saveAbility;
            const saveText = game.i18n.localize('DND5E.SavingThrowShort');
            metadata.push(`${saveLabel} ${saveText}`);
          }
          break;
        }
        case 'concentration': {
          if (this._spellHasProperty(spell, 'concentration')) {
            metadata.push(game.i18n.localize('DND5E.Concentration'));
          }
          break;
        }
        case 'materialComponents': {
          const materialText = UIUtils.formatMaterialComponents(spell);
          if (materialText) metadata.push(materialText);
          break;
        }
      }
    }
    const result = metadata.join(' • ');
    return result;
  }
}
