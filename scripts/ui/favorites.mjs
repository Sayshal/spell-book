/**
 * Spell Favorites Management System
 *
 * This module provides management of spell favorites within the Spell Book
 * module, handling synchronization between the journal-based user data system and
 * Foundry VTT's native actor favorites system.
 *
 * The favorites system operates on two levels:
 * 1. Journal Storage: User-specific favorites stored in spell user data journals
 * 2. Actor Integration: Synchronization with actor.system.favorites for native UI support
 *
 * Key features include:
 * - Automatic synchronization between journal and actor favorites
 * - Enhanced UUID matching for spell identification across different contexts
 * - Owner-aware favorites processing for GM-managed actors
 * - Form-based favorites processing with bulk operations
 * - Canonical UUID resolution for consistent favorites storage
 * - Integration with native Foundry VTT favorites system
 *
 * The system ensures that spell favorites are consistently maintained across
 * different UI contexts while respecting user ownership and providing seamless
 * integration with Foundry's existing favorites functionality.
 *
 * @module UIHelpers/SpellFavorites
 * @author Tyler
 */

import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Foundry VTT favorite item structure for actor.system.favorites.
 *
 * @typedef {Object} ActorFavorite
 * @property {string} type - Type of favorite, typically 'item' for spells
 * @property {string} id - Reference ID in format '.Item.{itemId}' for actor items
 * @property {number} sort - Sort order for favorites display (higher = later)
 */

/**
 * Spell preparation data structure containing spell UUIDs and their states.
 *
 * @typedef {Object<string, Object>} SpellPreparationData
 * @description Object mapping spell UUIDs to their preparation data
 */

/**
 * Enhanced spell user data from journal storage.
 *
 * @typedef {Object} SpellUserData
 * @property {boolean} [favorited] - Whether the spell is marked as favorite
 * @property {string} [notes] - User's personal notes for the spell
 * @property {Object} [customizations] - User-specific spell customizations
 */

/**
 * Add spell to actor.system.favorites.
 * @param {string} spellUuid - The spell UUID (compendium or actor)
 * @param {Actor5e} actor - The actor to update
 * @returns {Promise<boolean>} Success status of the operation
 */
export async function addSpellToActorFavorites(spellUuid, actor) {
  try {
    const actorSpell = findActorSpellByUuid(spellUuid, actor);
    if (!actorSpell) return false;
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
 * Remove spell from actor.system.favorites.
 * @param {string} spellUuid - The spell UUID to remove from favorites
 * @param {Actor5e} actor - The actor to update
 * @returns {Promise<boolean>} Success status of the operation
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
 * Sync favorites on spell preparation save.
 * @param {Actor5e} actor - The actor whose favorites should be synchronized
 * @param {SpellPreparationData} spellData - Spell preparation data containing spell UUIDs
 * @returns {Promise<void>}
 */
export async function syncFavoritesOnSave(actor, spellData) {
  try {
    for (const uuid of Object.keys(spellData)) {
      const userData = await DataHelpers.UserData.getUserDataForSpell(uuid, null, actor.id);
      if (userData?.favorited) await addSpellToActorFavorites(uuid, actor);
    }
  } catch (error) {
    log(1, 'Error syncing favorites on save:', error);
  }
}

/**
 * Process favorites from form state and update actor.system.favorites to match journal.
 * @param {HTMLFormElement} _form - The form element (unused but kept for API consistency)
 * @param {Actor5e} actor - The actor to update
 * @returns {Promise<void>}
 */
export async function processFavoritesFromForm(_form, actor) {
  try {
    const targetUserId = DataHelpers.getTargetUserId(actor);
    const actorSpells = actor.items.filter((item) => item.type === 'spell');
    const favoritesToAdd = [];
    log(3, `Checking ${actorSpells.length} spells on actor for favorite status`);
    for (const spell of actorSpells) {
      const canonicalUuid = getCanonicalSpellUuid(spell.uuid);
      const userData = await DataHelpers.UserData.getUserDataForSpell(canonicalUuid, targetUserId, actor.id);
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
      log(3, `Updated actor.system.favorites with ${newSpellFavorites.length} spell favorites, preserved ${nonSpellFavorites.length} non-spell favorites`);
    }
    log(3, `Processed favorites: ${favoritesToAdd.length} spells favorited`);
  } catch (error) {
    log(1, 'Error processing favorites in form:', error);
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
    if (item.flags?.core?.sourceId === spellUuid) return true;
    if (item.uuid === spellUuid) return true;
    const parsedUuid = foundry.utils.parseUuid(spellUuid);
    if (parsedUuid.collection) {
      const sourceSpell = fromUuidSync(spellUuid);
      if (sourceSpell && sourceSpell.name === item.name) return true;
    }
    return false;
  });
  return spell || null;
}

/**
 * Get canonical UUID for spell favorites (prefers compendium UUID).
 * @param {string|Object} spellOrUuid - Spell object or UUID string
 * @returns {string} Canonical UUID for favorites storage
 */
export function getCanonicalSpellUuid(spellOrUuid) {
  if (typeof spellOrUuid === 'string') {
    const parsedUuid = foundry.utils.parseUuid(spellOrUuid);
    if (parsedUuid.collection?.collection) return spellOrUuid;
    const spell = fromUuidSync(spellOrUuid);
    if (spell?._stats?.compendiumSource) return spell._stats.compendiumSource;
    if (spell?.flags?.core?.sourceId) return spell.flags.core.sourceId;
    return spellOrUuid;
  }
  if (spellOrUuid?.compendiumUuid) return spellOrUuid.compendiumUuid;
  if (spellOrUuid?._stats?.compendiumSource) return spellOrUuid._stats.compendiumSource;
  if (spellOrUuid?.flags?.core?.sourceId) return spellOrUuid.flags.core.sourceId;
  return spellOrUuid?.uuid || '';
}
