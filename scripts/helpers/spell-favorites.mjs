import { log } from '../logger.mjs';
import { SpellUserDataJournal } from './spell-user-data.mjs';

/**
 * Toggle favorite status for a spell
 * @param {string} spellUuid - The spell UUID
 * @param {Actor} actor - The actor who owns the spell
 * @param {string} userId - Target user ID (optional)
 * @param {string} actorId - Target actor ID (optional)
 * @returns {Promise<boolean>} Success status
 */
export async function toggleSpellFavorite(spellUuid, actor, userId = null, actorId = null) {
  try {
    const userData = await SpellUserDataJournal.getUserDataForSpell(spellUuid, userId, actorId);
    const currentlyFavorited = userData?.favorited || false;
    const newFavoriteStatus = !currentlyFavorited;
    await SpellUserDataJournal.setSpellFavorite(spellUuid, newFavoriteStatus, userId, actorId);
    if (newFavoriteStatus) await addSpellToActorFavorites(spellUuid, actor);
    else await removeSpellFromActorFavorites(spellUuid, actor);
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
export async function addSpellToActorFavorites(spellUuid, actor) {
  try {
    const actorSpell = findActorSpellByUuid(spellUuid, actor);
    if (!actorSpell) {
      log(2, 'Cannot add to favorites: spell not found on actor');
      return false;
    }
    const currentFavorites = actor.system.favorites || [];
    const favoriteId = `.Item.${actorSpell.id}`;
    if (currentFavorites.some((fav) => fav.id === favoriteId)) return true;
    const newFavorite = { type: 'item', id: favoriteId, sort: 100000 + currentFavorites.length };
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
export async function removeSpellFromActorFavorites(spellUuid, actor) {
  try {
    const actorSpell = findActorSpellByUuid(spellUuid, actor);
    if (!actorSpell) return true;
    const currentFavorites = actor.system.favorites || [];
    const favoriteId = `.Item.${actorSpell.id}`;
    const updatedFavorites = currentFavorites.filter((fav) => fav.id !== favoriteId);
    if (updatedFavorites.length !== currentFavorites.length) await actor.update({ 'system.favorites': updatedFavorites });
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
      const userData = await SpellUserDataJournal.getUserDataForSpell(uuid, null, actor.id);
      if (userData?.favorited) await addSpellToActorFavorites(uuid, actor);
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
    let targetUserId = game.user.id;
    if (game.user.isActiveGM) {
      const actorOwner = game.users.find((user) => user.character?.id === actor.id);
      if (actorOwner) targetUserId = actorOwner.id;
    }
    const actorSpells = actor.items.filter((item) => item.type === 'spell');
    const favoritesToAdd = [];
    log(3, `Checking ${actorSpells.length} spells on actor for favorite status`);
    for (const spell of actorSpells) {
      const canonicalUuid = getCanonicalSpellUuid(spell.uuid);
      const userData = await SpellUserDataJournal.getUserDataForSpell(canonicalUuid, targetUserId, actor.id);
      const isFavoritedInJournal = userData?.favorited || false;
      if (isFavoritedInJournal) favoritesToAdd.push(spell);
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
      if (nonSpellFavorites.length !== existingFavorites.length) await actor.update({ 'system.favorites': nonSpellFavorites });
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
  let spell = actor.items.get(spellUuid);
  if (spell && spell.type === 'spell') return spell;
  spell = actor.items.find((item) => {
    if (item.type !== 'spell') return false;
    if (item.flags?.core?.sourceId === spellUuid) return true;
    if (item.uuid === spellUuid) return true;
    if (spellUuid.startsWith('Compendium.')) {
      const sourceSpell = fromUuidSync(spellUuid);
      if (sourceSpell && sourceSpell.name === item.name) return true;
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
    if (spellOrUuid.startsWith('Compendium.')) return spellOrUuid;
    const spell = fromUuidSync(spellOrUuid);
    if (spell?.flags?.core?.sourceId) return spell.flags.core.sourceId;
    return spellOrUuid;
  }
  if (spellOrUuid?.compendiumUuid) return spellOrUuid.compendiumUuid;
  if (spellOrUuid?.flags?.core?.sourceId) return spellOrUuid.flags.core.sourceId;
  return spellOrUuid?.uuid || '';
}
