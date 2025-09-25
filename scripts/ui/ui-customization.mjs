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
 * @module UIHelpers/UICustomization
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import * as UIHelpers from './_module.mjs';

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
 *
 * This static utility class provides UI customization management for
 * the Spell Book application. It handles setting-based visibility controls for
 * various UI elements, builds customized metadata displays, and ensures appropriate
 * element availability based on user context (player vs GM).
 *
 * The class integrates with Foundry VTT's settings system to provide persistent
 * user preferences while maintaining proper context separation between player
 * and administrative interfaces. It provides both element visibility checking
 * and metadata building for spell display customization.
 */
export class UICustomizationHelper {
  /**
   * Convert element name to setting key format.
   *
   * Translates UI element names into their corresponding setting key suffixes
   * for consistent setting lookups. This mapping ensures proper setting
   * resolution across different UI contexts and element types.
   *
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
   *
   * Determines element visibility based on player-specific settings. All elements
   * are available for player interfaces, including user-specific features like
   * favorites and notes. Returns true by default for backwards compatibility.
   *
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
   *
   * Determines element visibility based on GM-specific settings. Excludes
   * player-specific elements (favorites, notes) that are not relevant for
   * administrative spell list management. Returns true by default for
   * applicable elements.
   *
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
   *
   * Provides robust checking for spell properties across different data structure
   * formats. Handles Array, Set, and Object-based property storage to ensure
   * consistent property detection regardless of spell data source or format.
   *
   * @param {SpellMetadata} spell - The spell object to check
   * @param {string} property - The property identifier to check for
   * @returns {boolean} Whether the spell has the specified property
   * @static
   * @private
   */
  static _spellHasProperty(spell, property) {
    if (!spell?.system?.properties) return false;
    if (Array.isArray(spell.system.properties)) return spell.system.properties.includes(property);
    else if (spell.system.properties instanceof Set) return spell.system.properties.has(property);
    else if (typeof spell.system.properties === 'object') return !!spell.system.properties[property];
    return false;
  }

  /**
   * Build custom metadata subtitle for SpellBook player interface.
   *
   * Constructs a metadata string for spell display in player
   * interfaces based on enabled UI elements. Combines various spell properties
   * into a formatted, localized string using bullet separators for readability.
   *
   * The metadata includes spell level, components, school, casting time, range,
   * damage types, conditions, saving throws, concentration requirements, and
   * material components based on user preferences and spell data availability.
   *
   * @param {SpellMetadata} spell - The spell object with processed data
   * @returns {string} Formatted metadata string for player display
   * @static
   */
  static buildPlayerMetadata(spell) {
    const metadata = [];
    if (this.isPlayerElementEnabled('spellLevel')) {
      const levelText = this._formatSpellLevel(spell);
      if (levelText) metadata.push(levelText);
    }
    if (this.isPlayerElementEnabled('components')) {
      const componentsText = UIHelpers.formatSpellComponents(spell);
      if (componentsText) metadata.push(componentsText);
    }
    if (this.isPlayerElementEnabled('school')) {
      const schoolText = UIHelpers.formatSpellSchool(spell);
      if (schoolText) metadata.push(schoolText);
    }
    if (this.isPlayerElementEnabled('castingTime')) {
      const castingTimeText = UIHelpers.formatSpellActivation(spell);
      if (castingTimeText) metadata.push(castingTimeText);
    }
    if (this.isPlayerElementEnabled('range')) {
      const rangeText = this._formatSpellRange(spell);
      if (rangeText) metadata.push(rangeText);
    }
    if (this.isPlayerElementEnabled('damageTypes') && spell.filterData?.damageTypes?.length) {
      const damageTypes = spell.filterData.damageTypes.map((type) => CONFIG.DND5E?.damageTypes?.[type]?.label || type).join(', ');
      metadata.push(damageTypes);
    }
    if (this.isPlayerElementEnabled('conditions') && spell.filterData?.conditions?.length) {
      const conditions = spell.filterData.conditions.map((condition) => CONFIG.DND5E?.conditionTypes?.[condition]?.label || condition).join(', ');
      metadata.push(conditions);
    }
    if (this.isPlayerElementEnabled('save') && spell.system?.save?.ability) {
      const saveLabel = CONFIG.DND5E?.abilities?.[spell.system.save.ability]?.label || spell.system.save.ability;
      metadata.push(`${saveLabel} Save`);
    }
    if (this.isPlayerElementEnabled('concentration') && this._spellHasProperty(spell, 'concentration')) metadata.push(game.i18n.localize('DND5E.Concentration'));
    if (this.isPlayerElementEnabled('materialComponents')) {
      const materialText = UIHelpers.formatMaterialComponents(spell);
      if (materialText) metadata.push(materialText);
    }
    return metadata.join(' • ');
  }

  /**
   * Build custom metadata subtitle for GMSpellListManager interface.
   *
   * Constructs a metadata string for spell display in GM
   * interfaces based on enabled UI elements. Similar to player metadata
   * but excludes player-specific elements and focuses on administrative
   * information relevant to spell list management.
   *
   * The metadata composition is identical to player metadata except for
   * the exclusion of favorites and notes elements, ensuring consistent
   * spell information display across different interface contexts.
   *
   * @param {SpellMetadata} spell - The spell object with processed data
   * @returns {string} Formatted metadata string for GM display
   * @static
   */
  static buildGMMetadata(spell) {
    const metadata = [];
    if (this.isGMElementEnabled('spellLevel')) {
      const levelText = this._formatSpellLevel(spell);
      if (levelText) metadata.push(levelText);
    }
    if (this.isGMElementEnabled('components')) {
      const componentsText = UIHelpers.formatSpellComponents(spell);
      if (componentsText) metadata.push(componentsText);
    }
    if (this.isGMElementEnabled('school')) {
      const schoolText = UIHelpers.formatSpellSchool(spell);
      if (schoolText) metadata.push(schoolText);
    }
    if (this.isGMElementEnabled('castingTime')) {
      const castingTimeText = UIHelpers.formatSpellActivation(spell);
      if (castingTimeText) metadata.push(castingTimeText);
    }
    if (this.isGMElementEnabled('range')) {
      const rangeText = this._formatSpellRange(spell);
      if (rangeText) metadata.push(rangeText);
    }
    if (this.isGMElementEnabled('damageTypes') && spell.filterData?.damageTypes?.length) {
      const damageTypes = spell.filterData.damageTypes.map((type) => CONFIG.DND5E?.damageTypes?.[type]?.label || type).join(', ');
      metadata.push(damageTypes);
    }
    if (this.isGMElementEnabled('conditions') && spell.filterData?.conditions?.length) {
      const conditions = spell.filterData.conditions.map((condition) => CONFIG.DND5E?.conditionTypes?.[condition]?.label || condition).join(', ');
      metadata.push(conditions);
    }
    if (this.isGMElementEnabled('save') && spell.system?.save?.ability) {
      const saveLabel = CONFIG.DND5E?.abilities?.[spell.system.save.ability]?.label || spell.system.save.ability;
      metadata.push(`${saveLabel} Save`);
    }
    if (this.isGMElementEnabled('concentration') && this._spellHasProperty(spell, 'concentration')) metadata.push(game.i18n.localize('DND5E.Concentration'));
    if (this.isGMElementEnabled('materialComponents')) {
      const materialText = UIHelpers.formatMaterialComponents(spell);
      if (materialText) metadata.push(materialText);
    }
    return metadata.join(' • ');
  }

  /**
   * Format spell level for display.
   *
   * Converts numeric spell levels into localized display strings using D&D 5e
   * configuration data. Handles the special case of cantrips (level 0) with
   * appropriate localization and provides fallback formatting for unknown levels.
   *
   * @param {SpellMetadata} spell - The spell object containing level information
   * @returns {string} Formatted spell level string (e.g., "Cantrip", "1st Level")
   * @static
   * @private
   */
  static _formatSpellLevel(spell) {
    if (spell.system?.level === undefined) return '';
    const level = spell.system.level;
    if (level === 0) return game.i18n.localize('DND5E.SpellCantrip');
    else return CONFIG.DND5E?.spellLevels?.[level] || `${level}`;
  }

  /**
   * Format spell range for display.
   *
   * Converts spell range data into human-readable strings with proper localization
   * and unit handling. Handles special range types (self, touch, special) as well
   * as numeric ranges with appropriate unit labels from D&D 5e configuration.
   *
   * @param {SpellMetadata} spell - The spell object containing range information
   * @returns {string} Formatted range string (e.g., "Touch", "30 feet", "Self")
   * @static
   * @private
   */
  static _formatSpellRange(spell) {
    if (!spell.system?.range) return '';
    const range = spell.system.range;
    if (range.units === 'self') return game.i18n.localize('DND5E.DistSelf');
    else if (range.units === 'touch') return game.i18n.localize('DND5E.DistTouch');
    else if (range.units === 'spec') return game.i18n.localize('DND5E.Special');
    else if (range.value && range.units) {
      const unitLabel = CONFIG.DND5E?.movementUnits?.[range.units]?.label || range.units;
      return `${range.value} ${unitLabel}`;
    }
    return '';
  }
}
