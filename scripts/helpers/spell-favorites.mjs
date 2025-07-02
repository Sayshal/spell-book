import { log } from '../logger.mjs';
import * as spellUserData from './spell-user-data.mjs';

/**
 * Utilities for managing spell favorites integration with D&D5e system
 */

/**
 * Toggle favorite status for a spell
 * @param {string} spellUuid - The spell UUID
 * @param {Actor} actor - The actor who owns the spell
 * @returns {Promise<boolean>} Success status
 */
export async function toggleSpellFavorite(spellUuid, actor) {
  try {
    const userData = spellUserData.getUserDataForSpell(spellUuid);
    const currentlyFavorited = userData?.favorited || false;
    const newFavoriteStatus = !currentlyFavorited;

    // Update user data
    await spellUserData.setSpellFavorite(spellUuid, newFavoriteStatus);

    // Update actor favorites if favoriting
    if (newFavoriteStatus) {
      await addSpellToActorFavorites(spellUuid, actor);
    } else {
      await removeSpellFromActorFavorites(spellUuid, actor);
    }

    return true;
  } catch (error) {
    log(1, 'Error toggling spell favorite:', error);
    return false;
  }
}

/**
 * Add spell to actor.system.favorites
 * @param {string} spellUuid - The spell UUID (compendium or actor)
 * @param {Actor} actor - The actor
 * @returns {Promise<boolean>} Success status
 */
async function addSpellToActorFavorites(spellUuid, actor) {
  try {
    // Find the actor's version of this spell
    const actorSpell = findActorSpellByUuid(spellUuid, actor);
    if (!actorSpell) {
      log(2, 'Cannot add to favorites: spell not found on actor');
      return false;
    }

    const currentFavorites = actor.system.favorites || [];
    const favoriteId = `.Item.${actorSpell.id}`;

    // Check if already in favorites
    if (currentFavorites.some((fav) => fav.id === favoriteId)) {
      return true; // Already favorited
    }

    // Add to favorites
    const newFavorite = {
      type: 'item',
      id: favoriteId,
      sort: 100000 + currentFavorites.length
    };

    const updatedFavorites = [...currentFavorites, newFavorite];
    await actor.update({ 'system.favorites': updatedFavorites });

    log(3, `Added spell ${actorSpell.name} to actor favorites`);
    return true;
  } catch (error) {
    log(1, 'Error adding spell to actor favorites:', error);
    return false;
  }
}

/**
 * Remove spell from actor.system.favorites
 * @param {string} spellUuid - The spell UUID
 * @param {Actor} actor - The actor
 * @returns {Promise<boolean>} Success status
 */
async function removeSpellFromActorFavorites(spellUuid, actor) {
  try {
    const actorSpell = findActorSpellByUuid(spellUuid, actor);
    if (!actorSpell) {
      return true; // Not on actor, nothing to remove
    }

    const currentFavorites = actor.system.favorites || [];
    const favoriteId = `.Item.${actorSpell.id}`;

    const updatedFavorites = currentFavorites.filter((fav) => fav.id !== favoriteId);

    if (updatedFavorites.length !== currentFavorites.length) {
      await actor.update({ 'system.favorites': updatedFavorites });
      log(3, `Removed spell ${actorSpell.name} from actor favorites`);
    }

    return true;
  } catch (error) {
    log(1, 'Error removing spell from actor favorites:', error);
    return false;
  }
}

/**
 * Find actor spell item by compendium UUID or actor UUID
 * @param {string} spellUuid - The spell UUID to find
 * @param {Actor} actor - The actor to search
 * @returns {Item|null} The actor's spell item or null
 */
function findActorSpellByUuid(spellUuid, actor) {
  // First try direct UUID match (for actor items)
  let spell = actor.items.get(spellUuid);
  if (spell && spell.type === 'spell') return spell;

  // Try by source ID (for compendium-sourced items)
  spell = actor.items.find((item) => item.type === 'spell' && (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid));

  return spell || null;
}

/**
 * Sync favorites on spell preparation save
 * @param {Actor} actor - The actor
 * @param {Object} spellData - Spell preparation data
 * @returns {Promise<void>}
 */
export async function syncFavoritesOnSave(actor, spellData) {
  try {
    for (const [uuid, data] of Object.entries(spellData)) {
      const userData = spellUserData.getUserDataForSpell(uuid);
      if (userData?.favorited) {
        await addSpellToActorFavorites(uuid, actor);
      }
    }
  } catch (error) {
    log(1, 'Error syncing favorites on save:', error);
  }
}
