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

/**
 * Process favorites from form state and update actor.system.favorites to match journal
 * @param {HTMLFormElement} form - The form element
 * @param {Actor} actor - The actor to update
 * @returns {Promise<void>}
 */
export async function processFavoritesFromForm(form, actor) {
  try {
    const actorSpells = actor.items.filter((item) => item.type === 'spell');
    const favoritesToAdd = [];
    log(3, `Checking ${actorSpells.length} spells on actor for favorite status`);
    for (const spell of actorSpells) {
      const canonicalUuid = getCanonicalSpellUuid(spell.uuid);
      const userData = await spellUserData.getUserDataForSpell(canonicalUuid);
      const isFavoritedInJournal = userData?.favorited || false;
      if (isFavoritedInJournal) {
        favoritesToAdd.push(spell);
        log(3, `Spell ${spell.name} is favorited in journal, adding to actor favorites`);
      }
    }
    if (favoritesToAdd.length > 0) {
      const newFavorites = favoritesToAdd.map((spell, index) => ({ type: 'item', id: `.Item.${spell.id}`, sort: 100000 + index }));
      const existingFavorites = actor.system.favorites || [];
      const nonSpellFavorites = existingFavorites.filter((fav) => fav.type !== 'item' || !fav.id.startsWith('.Item.'));
      const allFavorites = [...nonSpellFavorites, ...newFavorites];
      await actor.update({ 'system.favorites': allFavorites });
      log(3, `Updated actor.system.favorites with ${newFavorites.length} spell favorites`);
    } else {
      const existingFavorites = actor.system.favorites || [];
      const nonSpellFavorites = existingFavorites.filter((fav) => fav.type !== 'item' || !fav.id.startsWith('.Item.'));
      if (nonSpellFavorites.length !== existingFavorites.length) {
        await actor.update({ 'system.favorites': nonSpellFavorites });
        log(3, `Removed all spell favorites from actor.system.favorites`);
      }
    }
    log(3, `Processed favorites: ${favoritesToAdd.length} spells favorited`);
  } catch (error) {
    log(1, 'Error processing favorites in form:', error);
  }
}

/**
 * Update actor.system.favorites based on favorited spell UUIDs
 * @param {Array<string>} favoritedUuids - Array of favorited spell UUIDs
 * @param {Actor} actor - The actor to update
 * @returns {Promise<void>}
 */
export async function updateActorFavorites(favoritedUuids, actor) {
  try {
    const newFavorites = [];
    for (const spellUuid of favoritedUuids) {
      const actorSpell = findActorSpellByUuid(spellUuid, actor);
      if (actorSpell) {
        const favoriteId = `.Item.${actorSpell.id}`;
        newFavorites.push({ type: 'item', id: favoriteId, sort: 100000 + newFavorites.length });
      }
    }
    await actor.update({ 'system.favorites': newFavorites });
    log(3, `Updated actor.system.favorites with ${newFavorites.length} spells`);
  } catch (error) {
    log(1, 'Error updating actor favorites:', error);
  }
}

/**
 * Find actor spell by UUID with enhanced UUID matching
 * @param {string} spellUuid - The spell UUID to find
 * @param {Actor} actor - The actor to search
 * @returns {Item|null} The actor's spell item
 */
export function findActorSpellByUuid(spellUuid, actor) {
  // Direct UUID match
  let spell = actor.items.get(spellUuid);
  if (spell && spell.type === 'spell') return spell;

  // Source ID match - try both directions
  spell = actor.items.find((item) => {
    if (item.type !== 'spell') return false;

    // Check if actor spell's sourceId matches our UUID
    if (item.flags?.core?.sourceId === spellUuid) return true;

    // Check if our UUID matches actor spell's UUID
    if (item.uuid === spellUuid) return true;

    // Check by exact name match as fallback
    // Get the source spell to compare names
    if (spellUuid.startsWith('Compendium.')) {
      // This is a compendium UUID, check by source ID relationship
      const sourceSpell = fromUuidSync(spellUuid);
      if (sourceSpell && sourceSpell.name === item.name) {
        return true;
      }
    }

    return false;
  });

  return spell || null;
}

/**
 * Get canonical UUID for spell favorites (prefers compendium UUID)
 * @param {string|Object} spellOrUuid - Spell object or UUID
 * @returns {string} Canonical UUID for favorites storage
 */
export function getCanonicalSpellUuid(spellOrUuid) {
  if (typeof spellOrUuid === 'string') {
    // If it's already a compendium UUID, use it
    if (spellOrUuid.startsWith('Compendium.')) {
      return spellOrUuid;
    }
    // Otherwise try to get the source
    const spell = fromUuidSync(spellOrUuid);
    if (spell?.flags?.core?.sourceId) {
      return spell.flags.core.sourceId;
    }
    return spellOrUuid;
  }

  // For spell objects, prefer compendium UUID
  if (spellOrUuid?.compendiumUuid) return spellOrUuid.compendiumUuid;
  if (spellOrUuid?.flags?.core?.sourceId) return spellOrUuid.flags.core.sourceId;
  return spellOrUuid?.uuid || '';
}
