import { FLAGS, MODULE } from '../constants.mjs';

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
