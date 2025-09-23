/**
 * Spell Favorites Management System
 *
 * This module provides comprehensive management of spell favorites within the Spell Book
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
 *
 * Adds a spell to the actor's native favorites system by creating a properly
 * formatted favorite entry. Checks for existing favorites to prevent duplicates
 * and ensures proper sort ordering for new entries.
 *
 * The favorite entry uses Foundry's standard format with type 'item' and an
 * ID referencing the actor's spell item. Sort values are assigned incrementally
 * starting from 100000 to avoid conflicts with other favorites.
 *
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
 *
 * Removes a spell from the actor's native favorites system by filtering out
 * the corresponding favorite entry. Uses enhanced UUID matching to locate
 * the correct actor spell and its associated favorite entry.
 *
 * The operation is safe and will succeed even if the spell is not currently
 * favorited or if the actor spell cannot be found.
 *
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
 *
 * Ensures that actor favorites are synchronized with journal-stored favorite
 * states when spell preparation data is saved. Iterates through all spells
 * in the preparation data and adds any that are marked as favorited in the
 * user data journal to the actor's favorites.
 *
 * This function maintains consistency between the spell book's internal
 * favorites tracking and Foundry's native favorites display.
 *
 * @param {Actor5e} actor - The actor whose favorites should be synchronized
 * @param {SpellPreparationData} spellData - Spell preparation data containing spell UUIDs
 * @returns {Promise<void>}
 */
export async function syncFavoritesOnSave(actor, spellData) {
  try {
    for (const uuid of Object.keys(spellData)) {
      const userData = await DataHelpers.SpellUserDataJournal.getUserDataForSpell(uuid, null, actor.id);
      if (userData?.favorited) await addSpellToActorFavorites(uuid, actor);
    }
  } catch (error) {
    log(1, 'Error syncing favorites on save:', error);
  }
}

/**
 * Process favorites from form state and update actor.system.favorites to match journal.
 *
 * Performs a comprehensive synchronization of actor favorites based on the current
 * state of the spell user data journal. This function handles owner detection for
 * GM-managed actors and ensures that the actor's favorites accurately reflect the
 * journal-stored favorite states.
 *
 * The process includes:
 * - Determining the correct user ID for data retrieval (owner vs GM)
 * - Checking all actor spells against journal favorite states
 * - Preserving non-spell favorites while updating spell favorites
 * - Bulk updating the actor's favorites array for efficiency
 *
 * @param {HTMLFormElement} _form - The form element (unused but kept for API consistency)
 * @param {Actor5e} actor - The actor to update
 * @returns {Promise<void>}
 */
export async function processFavoritesFromForm(_form, actor) {
  try {
    const targetUserId = DataHelpers._getTargetUserId(actor);
    const actorSpells = actor.items.filter((item) => item.type === 'spell');
    const favoritesToAdd = [];
    log(3, `Checking ${actorSpells.length} spells on actor for favorite status`);
    for (const spell of actorSpells) {
      const canonicalUuid = getCanonicalSpellUuid(spell.uuid);
      const userData = await DataHelpers.SpellUserDataJournal.getUserDataForSpell(canonicalUuid, targetUserId, actor.id);
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
 * Find actor spell by UUID with enhanced UUID matching.
 *
 * Locates a spell item on an actor using flexible UUID matching strategies.
 * This function handles various UUID formats and reference patterns to ensure
 * reliable spell identification across different contexts and data sources.
 *
 * The matching process includes:
 * 1. Direct item ID lookup for actor-native spells
 * 2. Source ID matching for imported spells
 * 3. Direct UUID comparison
 * 4. Compendium name matching as fallback
 *
 * This comprehensive approach ensures spells can be found regardless of how
 * they were added to the actor or what UUID format is provided.
 *
 * @param {string} spellUuid - The spell UUID to find
 * @param {Actor5e} actor - The actor to search
 * @returns {Item5e|null} The actor's spell item or null if not found
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
 * Get canonical UUID for spell favorites (prefers compendium UUID).
 *
 * Resolves a spell reference to its canonical UUID format for consistent
 * storage and retrieval of favorites data. The canonical format prioritizes
 * compendium UUIDs over actor-specific UUIDs to ensure favorites persist
 * across different actor contexts.
 *
 * The resolution process:
 * 1. Returns compendium UUIDs directly if already in that format
 * 2. Checks for source ID flags pointing to compendium entries
 * 3. Extracts compendium UUID from spell objects if available
 * 4. Falls back to the provided UUID if no compendium reference is found
 *
 * This ensures that favorites are tracked consistently regardless of whether
 * the spell is referenced from a compendium or from an actor's item collection.
 *
 * @param {string|Object} spellOrUuid - Spell object or UUID string
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
