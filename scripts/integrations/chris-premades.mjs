import { MODULE, SETTINGS } from '../constants.mjs';

/**
 * Ask chris-premades to re-apply its automation to an actor.
 * @param {object} actor - The actor whose prepared spells just changed
 * @returns {Promise<void>}
 */
export async function refreshChrisPremades(actor) {
  if (!game.modules.get('chris-premades')?.active) return;
  if (!game.settings.get(MODULE.ID, SETTINGS.CPR_COMPATIBILITY)) return;
  await chrisPremades.utils.actorUtils.updateAll(actor);
}
