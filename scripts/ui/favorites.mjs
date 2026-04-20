import { getTargetUserId } from '../data/helpers.mjs';
import { loadUserSpellData } from '../data/user-data.mjs';
import { log } from '../utils/logger.mjs';
import { getCanonicalSpellUuid } from '../managers/spell-manager.mjs';

/**
 * Add a spell to actor.system.favorites.
 * @param {string} spellUuid - The spell UUID
 * @param {object} actor - The actor to update
 * @returns {Promise<boolean>} Whether the add succeeded
 */
export async function addSpellToActorFavorites(spellUuid, actor) {
  const actorSpell = findActorSpellByUuid(spellUuid, actor);
  if (!actorSpell) return false;
  const currentFavorites = actor.system.favorites || [];
  const favoriteId = `.Item.${actorSpell.id}`;
  if (currentFavorites.some((fav) => fav.id === favoriteId)) return true;
  await actor.update({ 'system.favorites': [...currentFavorites, { type: 'item', id: favoriteId, sort: 100000 + currentFavorites.length }] });
  log(3, 'Added spell to actor favorites.', { spell: actorSpell.name, actor: actor.name });
  return true;
}

/**
 * Remove a spell from actor.system.favorites.
 * @param {string} spellUuid - The spell UUID
 * @param {object} actor - The actor to update
 * @returns {Promise<boolean>} Whether the remove succeeded
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
 * Batch-sync favorites on spell preparation save.
 * @param {object} actor - The actor
 * @param {object} spellData - Spell preparation data keyed by UUID
 * @returns {Promise<void>}
 */
export async function syncFavoritesOnSave(actor, spellData) {
  const targetUserId = getTargetUserId(actor);
  const allUserData = await loadUserSpellData(targetUserId);
  const spellsToFavorite = [];
  for (const uuid of Object.keys(spellData)) {
    const userData = allUserData[uuid];
    if (userData?.actorData?.[actor.id]?.favorited) {
      const actorSpell = findActorSpellByUuid(uuid, actor);
      if (actorSpell) spellsToFavorite.push(actorSpell);
    }
  }
  if (spellsToFavorite.length === 0) return;
  const currentFavorites = actor.system.favorites || [];
  const existingIds = new Set(currentFavorites.map((f) => f.id));
  const newEntries = spellsToFavorite.map((spell) => ({ type: 'item', id: `.Item.${spell.id}`, sort: 100000 + currentFavorites.length })).filter((entry) => !existingIds.has(entry.id));
  if (newEntries.length > 0) {
    await actor.update({ 'system.favorites': [...currentFavorites, ...newEntries] });
    log(3, 'Favorites batch synced on save.', { actor: actor.name, added: newEntries.length });
  }
}

/**
 * Batch-sync all favorites from journal user data to actor.system.favorites.
 * @param {object} actor - The actor to update
 * @returns {Promise<void>}
 */
export async function processFavoritesFromJournal(actor) {
  const targetUserId = getTargetUserId(actor);
  const allUserData = await loadUserSpellData(targetUserId);
  const actorSpells = actor.itemTypes.spell;
  const favoritedSpells = [];
  for (const spell of actorSpells) {
    const canonicalUuid = getCanonicalSpellUuid(spell.uuid);
    const userData = allUserData[canonicalUuid];
    if (userData?.actorData?.[actor.id]?.favorited) favoritedSpells.push(spell);
  }
  const spellItemIds = new Set(actorSpells.map((s) => s.id));
  const existingFavorites = actor.system.favorites || [];
  const nonSpellFavorites = existingFavorites.filter((fav) => {
    if (fav.type !== 'item' || !fav.id.startsWith('.Item.')) return true;
    return !spellItemIds.has(fav.id.replace('.Item.', ''));
  });
  const spellFavorites = favoritedSpells.map((spell, i) => ({ type: 'item', id: `.Item.${spell.id}`, sort: 100000 + i }));
  await actor.update({ 'system.favorites': [...nonSpellFavorites, ...spellFavorites] });
  log(3, 'Favorites synced from journal.', { actor: actor.name, count: spellFavorites.length });
}

/**
 * Find an actor's spell item by UUID with enhanced matching.
 * @param {string} spellUuid - The spell UUID to find
 * @param {object} actor - The actor to search
 * @returns {object|null} The actor's spell item or null
 */
export function findActorSpellByUuid(spellUuid, actor) {
  let spell = actor.items.get(spellUuid);
  if (spell?.type === 'spell') return spell;
  spell = actor.itemTypes.spell.find((s) => {
    if (s._stats?.compendiumSource === spellUuid || s.uuid === spellUuid) return true;
    const parsed = foundry.utils.parseUuid(spellUuid);
    if (parsed.collection) {
      const sourceSpell = fromUuidSync(spellUuid);
      if (sourceSpell?.name === s.name) return true;
    }
    return false;
  });
  return spell || null;
}
