import { MODULE, UI_ELEMENTS } from '../constants.mjs';
import { formatMaterialComponents, formatSpellActivation, formatSpellComponents, formatSpellLevel, formatSpellRange, formatSpellSchool, hasSpellProperty } from './formatting.mjs';

const PLAYER_ELEMENTS = UI_ELEMENTS.map((element) => element.key);
const GM_ELEMENTS = UI_ELEMENTS.filter((element) => element.gm).map((element) => element.key);
const METADATA_ELEMENTS = UI_ELEMENTS.filter((element) => element.metadata).map((element) => element.key);
const BY_KEY = new Map(UI_ELEMENTS.map((element) => [element.key, element]));

/**
 * Check if a player UI element is enabled.
 * @param {string} element - Element name
 * @returns {boolean} Whether the element is enabled
 */
export function isPlayerElementEnabled(element) {
  const setting = BY_KEY.get(element)?.player;
  return setting ? (game.settings.get(MODULE.ID, setting) ?? true) : true;
}

/**
 * Check if a GM UI element is enabled.
 * @param {string} element - Element name
 * @returns {boolean} Whether the element is enabled
 */
export function isGMElementEnabled(element) {
  const setting = BY_KEY.get(element)?.gm;
  return setting ? (game.settings.get(MODULE.ID, setting) ?? true) : false;
}

/**
 * Get all enabled elements for the player interface.
 * @returns {Set<string>} Set of enabled element names
 */
export function getEnabledPlayerElements() {
  const enabled = new Set();
  for (const element of PLAYER_ELEMENTS) if (isPlayerElementEnabled(element)) enabled.add(element);
  ATLAS.log(3, 'Retrieved enabled player elements', { count: enabled.size });
  return enabled;
}

/**
 * Get all enabled elements for the GM interface.
 * @returns {Set<string>} Set of enabled element names
 */
export function getEnabledGMElements() {
  const enabled = new Set();
  for (const element of GM_ELEMENTS) if (isGMElementEnabled(element)) enabled.add(element);
  ATLAS.log(3, 'Retrieved enabled GM elements', { count: enabled.size });
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
