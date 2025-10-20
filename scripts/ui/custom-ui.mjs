/**
 * UI Customization and Theme Management System
 *
 * This module provides UI customization capabilities for the Spell Book
 * application, managing user preferences for spell metadata display and interface
 * elements. It handles different customization contexts for player and GM interfaces
 * while maintaining consistent formatting and localization.
 *
 * The customization system operates on two primary contexts:
 * 1. Player Interface: Spell book application with user-focused elements
 * 2. GM Interface: Spell list manager with administrative-focused elements
 *
 * Key features include:
 * - Granular control over spell metadata display elements
 * - Setting-based visibility management for UI components
 * - Context-aware metadata building for different user roles
 * - Consistent spell property formatting with D&D 5e integration
 * - Automatic localization and configuration data integration
 * - Flexible metadata composition with customizable element ordering
 *
 * The system integrates with Foundry VTT's settings system to provide persistent
 * user preferences while ensuring appropriate element availability based on context.
 * GM interfaces exclude player-specific elements like favorites and notes while
 * maintaining all relevant spell information displays.
 *
 * @module UIUtils/UICustomization
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import * as UIUtils from './_module.mjs';

/**
 * Available UI elements that can be toggled in player interfaces.
 *
 * @typedef {'favorites'|'compare'|'notes'|'spellLevel'|'components'|'school'|'castingTime'|'range'|'damageTypes'|'conditions'|'save'|'concentration'|'materialComponents'} PlayerUIElement
 */

/**
 * Available UI elements that can be toggled in GM interfaces (excludes player-specific elements).
 *
 * @typedef {'compare'|'spellLevel'|'components'|'school'|'castingTime'|'range'|'damageTypes'|'conditions'|'save'|'concentration'|'materialComponents'} GMUIElement
 */

/**
 * Spell metadata structure used for building display strings.
 *
 * @typedef {Object} SpellMetadata
 * @property {Object} system - Core D&D 5e spell system data
 * @property {number} system.level - Spell level (0-9)
 * @property {Object} [system.save] - Saving throw information
 * @property {string} [system.save.ability] - Ability score for saving throw
 * @property {Object} [system.range] - Spell range information
 * @property {number} [system.range.value] - Numeric range value
 * @property {string} [system.range.units] - Range measurement units
 * @property {Object} [system.properties] - Spell properties (concentration, ritual, etc.)
 * @property {Object} [filterData] - Processed filter data for the spell
 * @property {Array<string>} [filterData.damageTypes] - Damage types the spell can inflict
 * @property {Array<string>} [filterData.conditions] - Conditions the spell can impose
 * @property {Object} [labels] - Pre-computed display labels for the spell
 */

/**
 * Setting key mapping for UI element visibility controls.
 *
 * @typedef {Object} SettingKeyMap
 * @property {string} favorites - FAVORITES setting key
 * @property {string} compare - COMPARE setting key
 * @property {string} notes - NOTES setting key
 * @property {string} spellLevel - SPELL_LEVEL setting key
 * @property {string} components - COMPONENTS setting key
 * @property {string} school - SCHOOL setting key
 * @property {string} castingTime - CASTING_TIME setting key
 * @property {string} range - RANGE setting key
 * @property {string} damageTypes - DAMAGE_TYPES setting key
 * @property {string} conditions - CONDITIONS setting key
 * @property {string} save - SAVE setting key
 * @property {string} concentration - CONCENTRATION setting key
 * @property {string} materialComponents - MATERIAL_COMPONENTS setting key
 */

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
    return settingKeyMap[element] || element.toUpperCase();
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
    return game.settings.get(MODULE.ID, SETTINGS[settingKey]) ?? true;
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
    return game.settings.get(MODULE.ID, SETTINGS[settingKey]) ?? true;
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
    if (Array.isArray(properties)) return properties.includes(property);
    else if (properties instanceof Set) return properties.has(property);
    else if (typeof properties === 'object') return !!properties[property];
    return false;
  }

  /**
   * Build custom metadata subtitle for SpellBook player interface.
   * @param {SpellMetadata} spell - The spell object with processed data
   * @returns {string} Formatted metadata string for player display
   * @static
   */
  static buildPlayerMetadata(spell) {
    const metadata = [];
    if (this.isPlayerElementEnabled('spellLevel')) {
      const levelText = UIUtils.formatSpellLevel(spell);
      if (levelText) metadata.push(levelText);
    }
    if (this.isPlayerElementEnabled('components')) {
      const componentsText = UIUtils.formatSpellComponents(spell);
      if (componentsText) metadata.push(componentsText);
    }
    if (this.isPlayerElementEnabled('school')) {
      const schoolText = UIUtils.formatSpellSchool(spell);
      if (schoolText) metadata.push(schoolText);
    }
    if (this.isPlayerElementEnabled('castingTime')) {
      const castingTimeText = UIUtils.formatSpellActivation(spell);
      if (castingTimeText) metadata.push(castingTimeText);
    }
    if (this.isPlayerElementEnabled('range')) {
      const rangeText = UIUtils.formatSpellRange(spell);
      if (rangeText) metadata.push(rangeText);
    }
    if (this.isPlayerElementEnabled('damageTypes') && spell.filterData?.damageTypes?.length) {
      const damageTypes = spell.filterData.damageTypes.map((type) => foundry.utils.getProperty(CONFIG.DND5E, `damageTypes.${type}.label`) || type).join(', ');
      metadata.push(damageTypes);
    }
    if (this.isPlayerElementEnabled('conditions') && spell.filterData?.conditions?.length) {
      const conditions = spell.filterData.conditions.map((condition) => foundry.utils.getProperty(CONFIG.DND5E, `conditionTypes.${condition}.label`) || condition).join(', ');
      metadata.push(conditions);
    }
    if (this.isPlayerElementEnabled('save')) {
      const saveAbility = foundry.utils.getProperty(spell, 'system.save.ability');
      if (saveAbility) {
        const saveLabel = foundry.utils.getProperty(CONFIG.DND5E, `abilities.${saveAbility}.label`) || saveAbility;
        metadata.push(`${saveLabel} Save`);
      }
    }
    if (this.isPlayerElementEnabled('concentration') && this._spellHasProperty(spell, 'concentration')) metadata.push(game.i18n.localize('DND5E.Concentration'));
    if (this.isPlayerElementEnabled('materialComponents')) {
      const materialText = UIUtils.formatMaterialComponents(spell);
      if (materialText) metadata.push(materialText);
    }
    return metadata.join(' • ');
  }

  /**
   * Build custom metadata subtitle for GMSpellListManager interface.
   * @param {SpellMetadata} spell - The spell object with processed data
   * @returns {string} Formatted metadata string for GM display
   * @static
   */
  static buildGMMetadata(spell) {
    const metadata = [];
    if (this.isGMElementEnabled('spellLevel')) {
      const levelText = UIUtils.formatSpellLevel(spell);
      if (levelText) metadata.push(levelText);
    }
    if (this.isGMElementEnabled('components')) {
      const componentsText = UIUtils.formatSpellComponents(spell);
      if (componentsText) metadata.push(componentsText);
    }
    if (this.isGMElementEnabled('school')) {
      const schoolText = UIUtils.formatSpellSchool(spell);
      if (schoolText) metadata.push(schoolText);
    }
    if (this.isGMElementEnabled('castingTime')) {
      const castingTimeText = UIUtils.formatSpellActivation(spell);
      if (castingTimeText) metadata.push(castingTimeText);
    }
    if (this.isGMElementEnabled('range')) {
      const rangeText = UIUtils.formatSpellRange(spell);
      if (rangeText) metadata.push(rangeText);
    }
    if (this.isGMElementEnabled('damageTypes') && spell.filterData?.damageTypes?.length) {
      const damageTypes = spell.filterData.damageTypes.map((type) => foundry.utils.getProperty(CONFIG.DND5E, `damageTypes.${type}.label`) || type).join(', ');
      metadata.push(damageTypes);
    }
    if (this.isGMElementEnabled('conditions') && spell.filterData?.conditions?.length) {
      const conditions = spell.filterData.conditions.map((condition) => foundry.utils.getProperty(CONFIG.DND5E, `conditionTypes.${condition}.label`) || condition).join(', ');
      metadata.push(conditions);
    }
    if (this.isGMElementEnabled('save')) {
      const saveAbility = foundry.utils.getProperty(spell, 'system.save.ability');
      if (saveAbility) {
        const saveLabel = foundry.utils.getProperty(CONFIG.DND5E, `abilities.${saveAbility}.label`) || saveAbility;
        metadata.push(`${saveLabel} Save`); /** @todo' Localize? */
      }
    }
    if (this.isGMElementEnabled('concentration') && this._spellHasProperty(spell, 'concentration')) metadata.push(game.i18n.localize('DND5E.Concentration'));
    if (this.isGMElementEnabled('materialComponents')) {
      const materialText = UIUtils.formatMaterialComponents(spell);
      if (materialText) metadata.push(materialText);
    }
    return metadata.join(' • ');
  }
}
