/**
 * Common utility functions
 */

import { FLAGS, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Check if an actor is considered a wizard
 * @param {Actor5e} actor - The actor to check
 * @returns {boolean} True if actor has a wizard class or force wizard mode is enabled
 */
export function isWizard(actor) {
  if (actor.getFlag(MODULE.ID, FLAGS.FORCE_WIZARD_MODE)) return true;
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  return !!actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === localizedWizardName);
}

/**
 * Get the canonical UUID for a spell
 * @param {Item5e} spell - The spell item
 * @returns {string} The spell's UUID
 */
export function getSpellUuid(spell) {
  return spell.flags?.core?.sourceId || spell.flags?.dnd5e?.sourceId || spell.system?.parent?._source._stats.compendiumSource || spell.uuid;
}

/**
 * Parse a spell UUID to get its components
 * @param {string} uuid - The spell UUID to parse
 * @returns {Object} UUID components including pack, id, and type
 */
export function parseSpellUuid(uuid) {
  try {
    // Handle basic UUIDs like "Actor.abcdefgh"
    if (!uuid.includes('.')) {
      return {
        id: uuid,
        type: null,
        pack: null,
        isValid: false
      };
    }

    // Handle compendium UUIDs like "Compendium.dnd5e.spells.Item.abcdefgh"
    const parts = uuid.split('.');

    if (parts[0] === 'Compendium') {
      return {
        pack: `${parts[1]}.${parts[2]}`,
        type: parts[3],
        id: parts[4],
        isValid: parts.length >= 5
      };
    }

    // Handle simple UUIDs like "Actor.abcdefgh.Item.ijklmnop"
    return {
      type: parts[0],
      id: parts[1],
      itemType: parts.length > 2 ? parts[2] : null,
      itemId: parts.length > 3 ? parts[3] : null,
      isValid: parts.length >= 2
    };
  } catch (error) {
    log(1, `Error parsing UUID: ${uuid}`, error);
    return { isValid: false };
  }
}

/**
 * Find a spellcasting class for an actor
 * @param {Actor5e} actor - The actor to check
 * @returns {Item5e|null} - The spellcasting class item or null
 */
export function findSpellcastingClass(actor) {
  return actor.items.find((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
}

/**
 * Check if an item is a granted spell (from class features, etc.)
 * @param {Item5e} spell - The spell to check
 * @returns {boolean} Whether the spell is granted
 */
export function isGrantedSpell(spell) {
  return !!spell.flags?.dnd5e?.cachedFor;
}
