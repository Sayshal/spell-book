import { log } from '../utils/logger.mjs';
import { buildClassSourceItem } from '../managers/spell-manager.mjs';

/** @type {Map<string, string>} Cache for target user ID lookups keyed by actor ID */
const targetUserIdCache = new Map();

/**
 * Get the appropriate label/name from a CONFIG object.
 * @param {object} configObject - The CONFIG object (e.g., CONFIG.DND5E.spellSchools)
 * @param {string} key - The key to look up
 * @returns {string} The label/name or empty string if not found
 */
export function getConfigLabel(configObject, key) {
  if (!configObject || !configObject[key]) return '';
  const item = configObject[key];
  if (item.label) return item.label;
  if (item.name) return item.name;
  if (typeof item === 'string') return item;
  return '';
}

/**
 * Resolve a spell's sourceItem to the actual class/subclass Item5e on the actor.
 * @param {object} spell - Spell document or plain clone
 * @param {object} [actor] - Optional actor (defaults to spell.parent?.actor)
 * @returns {object|null} The class or subclass Item5e, or null if unresolvable
 */
export function getSpellSourceDocument(spell, actor = null) {
  const resolvedActor = actor ?? spell?.parent?.actor ?? spell?.actor ?? null;
  if (!resolvedActor?.identifiedItems) return null;
  const sourceItem = spell?.system?.sourceItem;
  if (sourceItem) return resolvedActor.identifiedItems.get(sourceItem)?.first() ?? null;
  if (spell?._classContext) return resolvedActor.identifiedItems.get(buildClassSourceItem(spell._classContext))?.first() ?? null;
  return null;
}

/**
 * Check if an item that grants spells is actually active (equipped and attuned if needed).
 * @param {object} item - The item to check
 * @returns {boolean} True if the item is equipped and attuned (if attunement required)
 */
export function isGrantingItemActive(item) {
  if (!item) return false;
  const isEquipped = item.system?.equipped ?? false;
  if (!isEquipped) {
    log(3, `Granting item ${item.name} is not equipped.`, { item });
    return false;
  }
  const requiresAttunement = item.system?.attunement === 'required';
  const isAttuned = item.system?.attuned ?? false;
  if (requiresAttunement && !isAttuned) {
    log(3, `Granting item ${item.name} requires attunement but is not attuned.`, { item });
    return false;
  }
  return true;
}

/**
 * Get the target user ID for spell data operations.
 * @param {object} actor - The actor to determine ownership for
 * @returns {string} The user ID to use for spell data operations
 */
export function getTargetUserId(actor) {
  if (actor?.id && targetUserIdCache.has(actor.id)) return targetUserIdCache.get(actor.id);
  let targetUserId = game.user.id;
  if (game.user.isActiveGM && actor) {
    const characterOwner = game.users.find((user) => user.character?.id === actor.id);
    if (characterOwner) {
      targetUserId = characterOwner.id;
      if (actor.id) targetUserIdCache.set(actor.id, targetUserId);
      return targetUserId;
    }
    const ownershipOwner = game.users.find((user) => actor.ownership[user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    if (ownershipOwner) {
      targetUserId = ownershipOwner.id;
      if (actor.id) targetUserIdCache.set(actor.id, targetUserId);
      return targetUserId;
    }
  }
  if (actor?.id) targetUserIdCache.set(actor.id, targetUserId);
  return targetUserId;
}
