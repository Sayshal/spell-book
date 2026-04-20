import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../utils/logger.mjs';
import { formatMaterialComponents, formatSpellActivation, formatSpellComponents, formatSpellLevel, formatSpellRange, formatSpellSchool, hasSpellProperty } from './formatting.mjs';

const PLAYER_ELEMENTS = ['compare', 'favorites', 'notes', 'spellLevel', 'components', 'school', 'castingTime', 'range', 'damageTypes', 'conditions', 'save', 'concentration', 'materialComponents'];
const GM_ELEMENTS = ['compare', 'spellLevel', 'components', 'school', 'castingTime', 'range', 'damageTypes', 'conditions', 'save', 'concentration', 'materialComponents'];
const METADATA_ELEMENTS = ['spellLevel', 'components', 'school', 'castingTime', 'range', 'damageTypes', 'conditions', 'save', 'concentration', 'materialComponents'];

const SETTING_KEY_MAP = {
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

/**
 * Convert element name to the SETTINGS constant key.
 * @param {string} element - Element name
 * @returns {string} Setting key suffix
 */
function toSettingKey(element) {
  return SETTING_KEY_MAP[element] || element.toUpperCase();
}

/**
 * Check if a player UI element is enabled.
 * @param {string} element - Element name
 * @returns {boolean} Whether the element is enabled
 */
export function isPlayerElementEnabled(element) {
  const settingKey = `PLAYER_UI_${toSettingKey(element)}`;
  return game.settings.get(MODULE.ID, SETTINGS[settingKey]) ?? true;
}

/**
 * Check if a GM UI element is enabled.
 * @param {string} element - Element name
 * @returns {boolean} Whether the element is enabled
 */
export function isGMElementEnabled(element) {
  if (element === 'favorites' || element === 'notes') return false;
  const settingKey = `GM_UI_${toSettingKey(element)}`;
  return game.settings.get(MODULE.ID, SETTINGS[settingKey]) ?? true;
}

/**
 * Get all enabled elements for the player interface.
 * @returns {Set<string>} Set of enabled element names
 */
export function getEnabledPlayerElements() {
  const enabled = new Set();
  for (const element of PLAYER_ELEMENTS) if (isPlayerElementEnabled(element)) enabled.add(element);
  log(3, 'Retrieved enabled player elements.', { count: enabled.size });
  return enabled;
}

/**
 * Get all enabled elements for the GM interface.
 * @returns {Set<string>} Set of enabled element names
 */
export function getEnabledGMElements() {
  const enabled = new Set();
  for (const element of GM_ELEMENTS) if (isGMElementEnabled(element)) enabled.add(element);
  log(3, 'Retrieved enabled GM elements.', { count: enabled.size });
  return enabled;
}

/**
 * Build metadata subtitle string for spell display.
 * @param {object} spell - The spell object with processed data
 * @param {object} [options] - Options
 * @param {string} [options.context] - 'player' or 'gm' (default 'gm')
 * @param {Set<string>} [options.enabledElements] - Pre-computed enabled elements set
 * @param {object} [options.actor] - Actor (needed for range formatting in player context)
 * @returns {string} Formatted metadata string joined with bullet separators
 */
export function buildMetadata(spell, { context = 'gm', enabledElements = null, actor = null } = {}) {
  const isEnabled = (el) => {
    if (enabledElements) return enabledElements.has(el);
    return context === 'player' ? isPlayerElementEnabled(el) : isGMElementEnabled(el);
  };
  const metadata = [];
  for (const element of METADATA_ELEMENTS) {
    if (!isEnabled(element)) continue;
    const value = getElementValue(spell, element, actor);
    if (value) metadata.push(value);
  }
  return metadata.join(' \u2022 ');
}

/**
 * Build metadata for the player interface.
 * @param {object} spell - Spell object
 * @param {Set<string>} [enabledElements] - Pre-computed enabled elements
 * @param {object} [actor] - Current actor
 * @returns {string} Formatted metadata string
 */
export function buildPlayerMetadata(spell, enabledElements = null, actor = null) {
  return buildMetadata(spell, { context: 'player', enabledElements, actor });
}

/**
 * Build metadata for the GM interface.
 * @param {object} spell - Spell object
 * @param {Set<string>} [enabledElements] - Pre-computed enabled elements
 * @returns {string} Formatted metadata string
 */
export function buildGMMetadata(spell, enabledElements = null) {
  return buildMetadata(spell, { context: 'gm', enabledElements });
}

/**
 * Get the display value for a single metadata element.
 * @param {object} spell - Spell object
 * @param {string} element - Element name
 * @param {object} [actor] - Actor for range formatting
 * @returns {string} Display value or empty string
 * @private
 */
function getElementValue(spell, element, actor) {
  switch (element) {
    case 'spellLevel':
      return formatSpellLevel(spell);
    case 'components':
      return formatSpellComponents(spell);
    case 'school':
      return formatSpellSchool(spell);
    case 'castingTime':
      return formatSpellActivation(spell);
    case 'range':
      return formatSpellRange(spell, actor);
    case 'damageTypes':
      if (spell.filterData?.damageTypes?.length) return spell.filterData.damageTypes.map((type) => foundry.utils.getProperty(CONFIG.DND5E, `damageTypes.${type}.label`) || type).join(', ');
      return '';
    case 'conditions':
      if (spell.filterData?.conditions?.length) return spell.filterData.conditions.map((c) => foundry.utils.getProperty(CONFIG.DND5E, `conditionTypes.${c}.label`) || c).join(', ');
      return '';
    case 'save': {
      const saveAbility = foundry.utils.getProperty(spell, 'system.save.ability');
      if (saveAbility) {
        const label = foundry.utils.getProperty(CONFIG.DND5E, `abilities.${saveAbility}.label`) || saveAbility;
        return `${label} ${_loc('DND5E.SavingThrowShort')}`;
      }
      return '';
    }
    case 'concentration':
      return hasSpellProperty(spell, 'concentration') ? _loc('DND5E.Concentration') : '';
    case 'materialComponents':
      return formatMaterialComponents(spell);
    default:
      return '';
  }
}
