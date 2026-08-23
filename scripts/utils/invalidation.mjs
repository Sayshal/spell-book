import { ClassManager, RuleSet, SpellDataManager, SpellManager } from '../managers/_module.mjs';
import { refreshOpenSpellBooks } from './copy-approval.mjs';

/**
 * Drop every cached derivation for an actor and refresh any open Spell Book.
 * @param {object} actor - The actor document
 */
export function invalidateActorCaches(actor) {
  if (!actor) return;
  RuleSet.invalidateCache(actor);
  ClassManager.invalidateCache(actor);
  SpellDataManager.invalidateCache(actor);
  SpellManager.invalidateCache(actor);
  refreshOpenSpellBooks(actor);
}
