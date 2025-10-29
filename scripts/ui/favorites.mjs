/**
 * Spell Favorites Management System
 *
 * This module provides management of spell favorites within the Spell Book
 * module, handling synchronization between the journal-based user data system and
 * Foundry VTT's native actor favorites system.
 *
 * @module UIUtils/SpellFavorites
 * @author Tyler
 */

import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Add spell to actor.system.favorites.
 * @param {string} spellUuid - The spell UUID (compendium or actor)
 * @param {Actor5e} actor - The actor to update
 * @returns {Promise<boolean>} Success status of the operation
 */
export async function addSpellToActorFavorites(spellUuid, actor) {
  const actorSpell = findActorSpellByUuid(spellUuid, actor);
  if (!actorSpell) return false;
  const currentFavorites = actor.system.favorites || [];
  const favoriteId = `.Item.${actorSpell.id}`;
  if (currentFavorites.some((fav) => fav.id === favoriteId)) return true;
  const newFavorite = { type: 'item', id: favoriteId, sort: 100000 + currentFavorites.length };
  const updatedFavorites = [...currentFavorites, newFavorite];
  await actor.update({ 'system.favorites': updatedFavorites });
  log(3, 'Added spell to actor favorites.', { spell: actorSpell.name, actor: actor.name });
  return true;
}

/**
 * Remove spell from actor.system.favorites.
 * @param {string} spellUuid - The spell UUID to remove from favorites
 * @param {Actor5e} actor - The actor to update
 * @returns {Promise<boolean>} Success status of the operation
 */
export async function removeSpellFromActorFavorites(spellUuid, actor) {
  const actorSpell = findActorSpellByUuid(spellUuid, actor);
  if (!actorSpell) return true;
  const currentFavorites = actor.system.favorites || [];
  const favoriteId = `.Item.${actorSpell.id}`;
  const updatedFavorites = currentFavorites.filter((fav) => fav.id !== favoriteId);
  if (updatedFavorites.length !== currentFavorites.length) {
    await actor.update({ 'system.favorites': updatedFavorites });
    log(3, 'Removed spell from actor favorites.', { spell: actorSpell.name, actor: actor.name });
  }
  return true;
}

/**
 * Sync favorites on spell preparation save.
 * @param {Actor5e} actor - The actor whose favorites should be synchronized
 * @param {SpellPreparationData} spellData - Spell preparation data containing spell UUIDs
 * @returns {Promise<void>}
 */
export async function syncFavoritesOnSave(actor, spellData) {
  for (const uuid of Object.keys(spellData)) {
    const userData = await DataUtils.UserData.getUserDataForSpell(uuid, null, actor.id);
    if (userData?.favorited) await addSpellToActorFavorites(uuid, actor);
  }
  log(3, 'Favorites synced on save.', { actor: actor.name, spellCount: Object.keys(spellData).length });
}

/**
 * Process favorites from form state and update actor.system.favorites to match journal.
 * @param {HTMLFormElement} _form - The form element (unused but kept for API consistency)
 * @param {Actor5e} actor - The actor to update
 * @returns {Promise<void>}
 */
export async function processFavoritesFromForm(_form, actor) {
  const targetUserId = DataUtils.getTargetUserId(actor);
  const actorSpells = actor.items.filter((item) => item.type === 'spell');
  const favoritesToAdd = [];
  for (const spell of actorSpells) {
    const canonicalUuid = getCanonicalSpellUuid(spell.uuid);
    const userData = await DataUtils.UserData.getUserDataForSpell(canonicalUuid, targetUserId, actor.id);
    const isFavoritedInJournal = userData?.favorited || false;
    if (isFavoritedInJournal) favoritesToAdd.push(spell);
  }
  if (favoritesToAdd.length > 0 || actor.system.favorites?.some((fav) => fav.type === 'item' && fav.id.startsWith('.Item.'))) {
    const newSpellFavorites = favoritesToAdd.map((spell, index) => ({ type: 'item', id: `.Item.${spell.id}`, sort: 100000 + index }));
    const existingFavorites = actor.system.favorites || [];
    const spellItemIds = new Set(actorSpells.map((spell) => spell.id));
    const nonSpellFavorites = existingFavorites.filter((fav) => {
      if (fav.type !== 'item') return true;
      if (!fav.id.startsWith('.Item.')) return true;
      const itemId = fav.id.replace('.Item.', '');
      return !spellItemIds.has(itemId);
    });
    const allFavorites = [...nonSpellFavorites, ...newSpellFavorites];
    await actor.update({ 'system.favorites': allFavorites });
    log(3, 'Favorites processed from form.', { favoritesToAdd: favoritesToAdd.length });
  }
}

/**
 * Find actor spell by UUID with enhanced UUID matching.
 * @param {string} spellUuid - The spell UUID to find
 * @param {Actor5e} actor - The actor to search
 * @returns {Item5e|null} The actor's spell item or null if not found
 */
export function findActorSpellByUuid(spellUuid, actor) {
  let spell = actor.items.get(spellUuid);
  if (spell && spell.type === 'spell') return spell;
  spell = actor.items.find((item) => {
    if (item.type !== 'spell') return false;
    if (item._stats?.compendiumSource === spellUuid) return true;
    if (item.uuid === spellUuid) return true;
    const parsedUuid = foundry.utils.parseUuid(spellUuid);
    if (parsedUuid.collection) {
      const sourceSpell = fromUuidSync(spellUuid);
      if (sourceSpell && sourceSpell.name === item.name) return true;
    }
    return false;
  });
  if (spell) log(3, 'Found actor spell by UUID match.', { spell: spell.name, actor: actor.name });
  else log(1, 'Actor spell not found.', { spellUuid, actor: actor.name });
  return spell || null;
}

/**
 * Get canonical UUID for spell favorites (prefers compendium UUID).
 * @param {string|Object} spellOrUuid - Spell object or UUID string
 * @returns {string} Canonical UUID for favorites storage
 */
export function getCanonicalSpellUuid(spellOrUuid) {
  let result;
  if (typeof spellOrUuid === 'string') {
    const parsedUuid = foundry.utils.parseUuid(spellOrUuid);
    if (parsedUuid.collection?.collection) result = spellOrUuid;
    else {
      const spell = fromUuidSync(spellOrUuid);
      if (spell?._stats?.compendiumSource) result = spell._stats.compendiumSource;
      else result = spellOrUuid;
    }
  } else {
    if (spellOrUuid?.compendiumUuid) result = spellOrUuid.compendiumUuid;
    else if (spellOrUuid?._stats?.compendiumSource) result = spellOrUuid._stats.compendiumSource;
    else result = spellOrUuid?.uuid || '';
  }
  log(3, 'Got canonical spell UUID.', { input: typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.name, result });
  return result;
}
