/**
 * Spell Loadout Data Management
 * @module Managers/Loadouts
 * @author Tyler
 */

import { FLAGS, MODULE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';

/** Loadout Manager — data layer for spell preparation presets. No DOM querying. */
export class Loadouts {
  /** @type {WeakMap<object, object>} */
  static _cache = new WeakMap();

  /**
   * Get all loadouts for an actor, optionally filtered by class.
   * @param {object} actor - The actor document
   * @param {string} [classIdentifier] - Class identifier to filter by, or null for all
   * @returns {object[]} Array of loadout objects
   */
  static getLoadouts(actor, classIdentifier = null) {
    if (!this._cache.has(actor)) {
      this._cache.set(actor, actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {});
    }
    const all = Object.values(this._cache.get(actor));
    if (!classIdentifier) return all;
    return all.filter((l) => !l.classIdentifier || l.classIdentifier === classIdentifier);
  }

  /**
   * Get a single loadout by ID.
   * @param {object} actor - The actor document
   * @param {string} loadoutId - The loadout ID
   * @returns {object|null} The loadout object or null
   */
  static getLoadout(actor, loadoutId) {
    const loadouts = actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
    return loadouts[loadoutId] || null;
  }

  /**
   * Save a new loadout with the given spell configuration.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @param {string} name - Loadout name
   * @param {string} description - Loadout description
   * @param {string[]} spellConfig - Array of prepared spell UUIDs
   * @returns {Promise<string|null>} The created loadout ID, or null on failure
   */
  static async saveLoadout(actor, classIdentifier, name, description, spellConfig) {
    if (!name?.trim()) {
      log(2, 'Loadout name is required.', { actorName: actor.name });
      return null;
    }
    const loadoutId = foundry.utils.randomID();
    const loadout = {
      id: loadoutId,
      name: name.trim(),
      description: description?.trim() || '',
      classIdentifier,
      spellConfiguration: spellConfig,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await actor.update({ [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.${loadoutId}`]: loadout });
    this._cache.delete(actor);
    log(3, 'Loadout saved.', { actorName: actor.name, loadoutId, name: loadout.name });
    return loadoutId;
  }

  /**
   * Delete a loadout by ID.
   * @param {object} actor - The actor document
   * @param {string} loadoutId - The loadout ID to delete
   * @returns {Promise<boolean>} Whether deletion succeeded
   */
  static async deleteLoadout(actor, loadoutId) {
    const loadouts = actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
    if (!loadouts[loadoutId]) {
      log(2, 'Loadout not found.', { actorName: actor.name, loadoutId });
      return false;
    }
    await actor.update({ [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.-=${loadoutId}`]: null });
    this._cache.delete(actor);
    log(3, 'Loadout deleted.', { actorName: actor.name, loadoutId });
    return true;
  }

  /**
   * Invalidate cached loadouts for an actor.
   * @param {object} actor - The actor document
   */
  static invalidateCache(actor) {
    this._cache.delete(actor);
  }
}
