
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
  ATLAS.log(3, 'Added spell to actor favorites.', { spell: actorSpell.name, actor: actor.name });
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
    ATLAS.log(3, 'Removed spell from actor favorites.', { spell: actorSpell.name, actor: actor.name });
  }
  return true;
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
