import { MODULE, SETTINGS } from '../constants.mjs';
import * as formattingUtils from './spell-formatting.mjs';

/**
 * Helper class for managing UI customization settings
 */
export class UICustomizationHelper {
  /**
   * Convert element name to setting key format
   * @param {string} element - The element name
   * @returns {string} The setting key suffix
   * @private
   */
  static _convertToSettingKey(element) {
    const settingKeyMap = {
      favorites: 'FAVORITES',
      compare: 'COMPARE',
      notes: 'NOTES',
      spellLevel: 'SPELL_LEVEL',
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
   * Check if a UI element should be shown for PlayerSpellBook
   * @param {string} element - The element to check ('favorites', 'compare', 'notes', etc.)
   * @returns {boolean} Whether the element should be shown
   */
  static isPlayerElementEnabled(element) {
    const settingKeySuffix = this._convertToSettingKey(element);
    const settingKey = `PLAYER_UI_${settingKeySuffix}`;
    return game.settings.get(MODULE.ID, SETTINGS[settingKey]) ?? true;
  }

  /**
   * Check if a UI element should be shown for GMSpellListManager
   * @param {string} element - The element to check ('compare', 'spellLevel', etc.)
   * @returns {boolean} Whether the element should be shown
   */
  static isGMElementEnabled(element) {
    if (element === 'favorites' || element === 'notes') return false;
    const settingKeySuffix = this._convertToSettingKey(element);
    const settingKey = `GM_UI_${settingKeySuffix}`;
    return game.settings.get(MODULE.ID, SETTINGS[settingKey]) ?? true;
  }

  /**
   * Check if spell has a specific property
   * @param {Object} spell - The spell object
   * @param {string} property - The property to check for
   * @returns {boolean} Whether the spell has the property
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
   * Build custom metadata subtitle for PlayerSpellBook
   * @param {Object} spell - The spell object with processed data
   * @returns {string} Formatted metadata string
   */
  static buildPlayerMetadata(spell) {
    const metadata = [];
    if (this.isPlayerElementEnabled('spellLevel')) {
      const levelText = this._formatSpellLevel(spell);
      if (levelText) metadata.push(levelText);
    }
    if (this.isPlayerElementEnabled('school')) {
      const schoolText = formattingUtils.formatSpellSchool(spell);
      if (schoolText) metadata.push(schoolText);
    }
    if (this.isPlayerElementEnabled('castingTime')) {
      const castingTimeText = formattingUtils.formatSpellActivation(spell);
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
      const materialText = formattingUtils.formatMaterialComponents(spell);
      if (materialText) metadata.push(materialText);
    }
    return metadata.join(' • ');
  }

  /**
   * Build custom metadata subtitle for GMSpellListManager
   * @param {Object} spell - The spell object with processed data
   * @returns {string} Formatted metadata string
   */
  static buildGMMetadata(spell) {
    const metadata = [];
    if (this.isGMElementEnabled('spellLevel')) {
      const levelText = this._formatSpellLevel(spell);
      if (levelText) metadata.push(levelText);
    }
    if (this.isGMElementEnabled('school')) {
      const schoolText = formattingUtils.formatSpellSchool(spell);
      if (schoolText) metadata.push(schoolText);
    }
    if (this.isGMElementEnabled('castingTime')) {
      const castingTimeText = formattingUtils.formatSpellActivation(spell);
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
      const materialText = formattingUtils.formatMaterialComponents(spell);
      if (materialText) metadata.push(materialText);
    }
    return metadata.join(' • ');
  }

  /**
   * Format spell level for display
   * @param {Object} spell - The spell object
   * @returns {string} Formatted spell level
   * @private
   */
  static _formatSpellLevel(spell) {
    if (spell.system?.level === undefined) return '';
    const level = spell.system.level;
    if (level === 0) return game.i18n.localize('DND5E.SpellCantrip');
    else return CONFIG.DND5E?.spellLevels?.[level] || `${level}`;
  }

  /**
   * Format spell range for display
   * @param {Object} spell - The spell object
   * @returns {string} Formatted range
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
