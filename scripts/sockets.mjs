import { FLAGS, MODULE } from './constants/_module.mjs';
import { log } from './logger.mjs';

/**
 * Socket handler for delegating privileged operations to GM clients.
 */
export class SocketHandler {
  /**
   * Creates a new SocketHandler instance and registers query handlers.
   */
  constructor() {
    this.#registerQueries();
  }

  /**
   * Register query handlers in CONFIG.queries.
   * @private
   * @returns {void}
   */
  #registerQueries() {
    const handler = this;
    CONFIG.queries[MODULE.ID] = async (data, _queryOptions) => {
      try {
        const { type, config } = data;
        if (!type) throw new Error('Query missing type');
        if (!config) throw new Error('Query missing config');
        switch (type) {
          case 'setUserFocus':
            return await handler.#handleSetUserFocus(config);
          case 'setActorFocus':
            return await handler.#handleSetActorFocus(config);
          default:
            throw new Error(`Unknown query type: ${type}`);
        }
      } catch (error) {
        return { success: false, error: error.message };
      }
    };
  }

  /**
   * Set a user's spellcasting focus in the group actor.
   * @param {Actor} groupActor - The group actor to update
   * @param {string} userId - The user ID
   * @param {string|null} focusId - The focus ID to set (or null to clear)
   * @returns {Promise<{success: boolean, error?: string}>} - Success status
   */
  async setUserSelectedFocus(groupActor, userId, focusId) {
    if (game.user.isGM) return await this.#handleSetUserFocus({ groupActorId: groupActor.id, userId, focusId });
    const gm = game.users.activeGM;
    if (!gm) {
      const error = 'No GM is currently online to process this request. Please try again when a GM is available.';
      log(1, error);
      return { success: false, error };
    }
    log(3, `Delegating setUserFocus to GM: ${gm.name}`);
    try {
      const result = await gm.query(MODULE.ID, { type: 'setUserFocus', config: { groupActorId: groupActor.id, userId, focusId } }, { timeout: 10000 });
      log(3, 'Received response from GM:', result);
      return result;
    } catch (error) {
      log(1, 'Failed to set user focus via GM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set an actor's spellcasting focus flag.
   * @param {Actor} actor - The actor to update
   * @param {string} focus - The focus name to set
   * @returns {Promise<{success: boolean, error?: string}>} - Success status
   */
  async setActorSpellcastingFocus(actor, focus) {
    if (actor.isOwner) return await this.#handleSetActorFocus({ actorId: actor.id, focus });
    const gm = game.users.activeGM;
    if (!gm) {
      const error = 'No GM is currently online to process this request. Please try again when a GM is available.';
      return { success: false, error };
    }
    log(3, `Delegating setActorFocus to GM: ${gm.name}`);
    try {
      const result = await gm.query(MODULE.ID, { type: 'setActorFocus', config: { actorId: actor.id, focus } }, { timeout: 10000 });
      log(3, 'Received response from GM:', result);
      return result;
    } catch (error) {
      log(1, 'Failed to set actor focus via GM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle setting user focus on group actor (GM side).
   * @private
   * @param {object} config - Configuration object
   * @param {string} config.groupActorId - The ID of the group actor to update
   * @param {string} config.userId - The user ID whose focus selection is being set
   * @param {string|null} config.focusId - The focus ID to set, or null to clear the selection
   * @returns {Promise<{success: boolean, error?: string}>} Result object indicating success or failure
   */
  async #handleSetUserFocus({ groupActorId, userId, focusId }) {
    const groupActor = game.actors.get(groupActorId);
    if (!groupActor) return { success: false, error: 'Group actor not found' };
    const currentSelections = groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
    if (focusId) currentSelections[userId] = focusId;
    else delete currentSelections[userId];
    await groupActor.setFlag(MODULE.ID, FLAGS.SELECTED_FOCUS, currentSelections);
    return { success: true };
  }

  /**
   * Handle setting actor focus flag (GM side).
   * @private
   * @param {object} config - Configuration object
   * @param {string} config.actorId - The ID of the actor to update
   * @param {string} config.focus - The spellcasting focus name to set on the actor
   * @returns {Promise<{success: boolean, error?: string}>} Result object indicating success or failure
   */
  async #handleSetActorFocus({ actorId, focus }) {
    const actor = game.actors.get(actorId);
    if (!actor) return { success: false, error: 'Actor not found' };
    await actor.setFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS, focus);
    return { success: true };
  }
}
