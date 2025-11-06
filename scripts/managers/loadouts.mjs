/**
 * Spell Loadout Management and Quick Preparation Switching
 *
 * Manages spell loadouts for actors, providing functionality to save, load, and apply
 * spell preparation configurations. This class enables users to create preset spell
 * loadouts for different scenarios (combat, exploration, social, etc.) and quickly
 * switch between them without manually re-selecting each spell.
 *
 * Loadouts are stored as actor flags and include metadata such as creation timestamps,
 * descriptions, and class associations. The manager handles both UI state updates
 * and underlying data synchronization when applying loadouts.
 *
 * @module Managers/Loadouts
 * @author Tyler
 */

import { FLAGS, MODULE } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Spell Loadout Manager - Quick preparation switching and configuration management.
 */
export class Loadouts {
  /**
   * Create a new Spell Loadout Manager instance.
   * @todo Resolve parameters
   * @param {Object} actor - The actor whose loadouts to manage
   * @param {Object} [spellbook=null] - Optional Spell Book reference for UI integration
   */
  constructor(actor, spellbook = null) {
    log(3, 'Creating Loadouts instance.', { actorId: actor.id, hasSpellbook: !!spellbook });
    this.actor = actor;
    this.spellbook = spellbook;
    this._loadoutsCache = null;
    this._lastCacheTime = 0;
  }

  /**
   * Get all loadouts for the actor, with caching for performance.
   * @param {string} [classIdentifier=null] - The class identifier to filter by, or null for all loadouts
   * @returns {{ id: string, name: string, classIdentifier?: string, spells: Array<{ uuid: string, name: string, level: number, prepared: boolean, [key: string]: any }> }[]} Array of loadout objects
   */
  getAvailableLoadouts(classIdentifier = null) {
    log(3, 'Getting available loadouts.', { actorId: this.actor.id, classIdentifier });
    const cacheTimeout = 30000;
    const now = Date.now();
    if (!this._loadoutsCache || now - this._lastCacheTime > cacheTimeout) {
      this._loadoutsCache = this.actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
      this._lastCacheTime = now;
      log(3, 'Loadouts cache refreshed.', { actorId: this.actor.id, loadoutCount: Object.keys(this._loadoutsCache).length });
    }
    const allLoadouts = Object.values(this._loadoutsCache);
    if (classIdentifier) {
      const filtered = allLoadouts.filter((loadout) => !loadout.classIdentifier || loadout.classIdentifier === classIdentifier);
      log(3, 'Filtered loadouts for class.', { actorId: this.actor.id, classIdentifier, filteredCount: filtered.length });
      return filtered;
    }
    return allLoadouts;
  }

  /**
   * Save a new loadout with the specified configuration.
   * @param {string} name - The loadout name (required, will be trimmed)
   * @param {string} description - The loadout description (optional, will be trimmed)
   * @param {string[]} spellConfiguration - The spell preparation configuration (array of UUIDs)
   * @param {string} [classIdentifier=null] - Optional class identifier for class-specific loadouts
   * @returns {Promise<boolean>} Success status
   */
  async saveLoadout(name, description, spellConfiguration, classIdentifier = null) {
    log(3, 'Saving loadout.', { actorId: this.actor.id, name, classIdentifier, spellCount: spellConfiguration.length });
    try {
      if (!name || !name.trim()) throw new Error('Loadout name is required');
      const loadoutId = foundry.utils.randomID();
      const loadout = { id: loadoutId, name: name.trim(), description: description?.trim() || '', classIdentifier, spellConfiguration, createdAt: Date.now(), updatedAt: Date.now() };
      await this.actor.update({ [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.${loadoutId}`]: loadout });
      this._invalidateCache();
      log(3, 'Loadout saved successfully.', { actorId: this.actor.id, loadoutId, name });
      return true;
    } catch (error) {
      log(1, 'Error saving loadout.', { actorId: this.actor.id, name, error });
      return false;
    }
  }

  /**
   * Load a loadout by its unique identifier.
   * @param {string} loadoutId - The unique loadout identifier
   * @returns {{ id: string, name: string, classIdentifier?: string, spells: Array<{ uuid: string, name: string, level: number, prepared: boolean,[key: string]: any}> }|null} A loadout object or null
   */
  loadLoadout(loadoutId) {
    log(3, 'Loading loadout.', { actorId: this.actor.id, loadoutId });
    try {
      const loadouts = this.actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
      const loadout = loadouts[loadoutId] || null;
      if (loadout) log(3, 'Loadout loaded successfully.', { actorId: this.actor.id, loadoutId, name: loadout.name });
      else log(2, 'Loadout not found.', { actorId: this.actor.id, loadoutId });
      return loadout;
    } catch (error) {
      log(1, 'Error loading loadout.', { actorId: this.actor.id, loadoutId, error });
      return null;
    }
  }

  /**
   * Apply a loadout to the current Spell Book interface.
   * @param {string} loadoutId - The loadout ID to apply
   * @param {string} classIdentifier - The class to apply the loadout to
   * @returns {boolean} Success status
   */
  applyLoadout(loadoutId, classIdentifier) {
    log(3, 'Applying loadout.', { actorId: this.actor.id, loadoutId, classIdentifier });
    try {
      const loadout = this.loadLoadout(loadoutId);
      if (!loadout) throw new Error('Loadout not found');
      if (!this.spellbook) throw new Error('No Spell Book reference available');
      this._applySpellConfiguration(loadout.spellConfiguration, classIdentifier);
      log(3, 'Loadout applied successfully.', { actorId: this.actor.id, loadoutId, classIdentifier });
      return true;
    } catch (error) {
      log(1, 'Error applying loadout.', { actorId: this.actor.id, loadoutId, classIdentifier, error });
      return false;
    }
  }

  /**
   * Delete a loadout by its unique identifier.
   * @param {string} loadoutId - The loadout ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteLoadout(loadoutId) {
    log(3, 'Deleting loadout.', { actorId: this.actor.id, loadoutId });
    try {
      const existingLoadouts = this.actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
      if (!existingLoadouts[loadoutId]) throw new Error('Loadout not found');
      const loadoutName = existingLoadouts[loadoutId].name;
      await this.actor.update({ [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.-=${loadoutId}`]: null });
      this._invalidateCache();
      log(3, 'Loadout deleted successfully.', { actorId: this.actor.id, loadoutId, loadoutName });
      return true;
    } catch (error) {
      log(1, 'Error deleting loadout.', { actorId: this.actor.id, loadoutId, error });
      return false;
    }
  }

  /**
   * Capture current spell preparation state for the specified class.
   * @param {string} classIdentifier - The class identifier to capture state for
   * @returns {string[]} Array of prepared spell UUIDs
   */
  captureCurrentState(classIdentifier) {
    log(3, 'Capturing current state.', { actorId: this.actor.id, classIdentifier });
    try {
      if (!this.spellbook) throw new Error('No Spell Book reference available');
      const preparedSpells = [];
      const formElement = this.spellbook.element;
      if (!formElement) throw new Error('Spell Book element not found');
      const checkboxes = formElement.querySelectorAll(`dnd5e-checkbox[data-uuid][data-source-class="${classIdentifier}"]`);
      checkboxes.forEach((checkbox) => {
        const uuid = checkbox.dataset.uuid;
        const isPrepared = checkbox.checked;
        if (!isPrepared) return;
        const spellItem = checkbox.closest('.spell-item');
        if (!spellItem) return;
        if (spellItem.querySelector('.tag.always-prepared')) return;
        if (spellItem.querySelector('.tag.granted')) return;
        if (spellItem.querySelector('.tag.innate')) return;
        if (spellItem.querySelector('.tag.atwill')) return;
        if (checkbox.disabled) return;
        preparedSpells.push(uuid);
      });
      log(3, 'Current state captured.', { actorId: this.actor.id, classIdentifier, spellCount: preparedSpells.length });
      return preparedSpells;
    } catch (error) {
      log(1, 'Error capturing current state.', { actorId: this.actor.id, classIdentifier, error });
      return [];
    }
  }

  /**
   * Apply spell configuration to SpellBook UI checkboxes.
   * @private
   * @param {string[]} spellConfiguration - Array of spell UUIDs to prepare
   * @param {string} classIdentifier - The class identifier to apply configuration to
   * @returns {void}
   */
  _applySpellConfiguration(spellConfiguration, classIdentifier) {
    log(3, 'Applying spell configuration.', { actorId: this.actor.id, classIdentifier, spellCount: spellConfiguration.length });
    if (!this.spellbook) throw new Error('No Spell Book reference available');
    const formElement = this.spellbook.element;
    if (!formElement) throw new Error('Spell Book element not found');
    const allCheckboxes = formElement.querySelectorAll(`dnd5e-checkbox[data-uuid][data-source-class="${classIdentifier}"]`);
    allCheckboxes.forEach((checkbox) => {
      if (!checkbox.disabled) {
        checkbox.checked = false;
        const spellItem = checkbox.closest('.spell-item');
        if (spellItem) spellItem.classList.remove('prepared-spell');
      }
    });
    spellConfiguration.forEach((uuid) => {
      const checkbox = formElement.querySelector(`dnd5e-checkbox[data-uuid="${uuid}"][data-source-class="${classIdentifier}"]`);
      if (checkbox && !checkbox.disabled) {
        checkbox.checked = true;
        const spellItem = checkbox.closest('.spell-item');
        if (spellItem) spellItem.classList.add('prepared-spell');
      }
    });
    if (this.spellbook.ui) {
      this.spellbook.ui.updateSpellPreparationTracking();
      this.spellbook.ui.updateSpellCounts();
    }
    log(3, 'Spell configuration applied.', { actorId: this.actor.id, classIdentifier });
  }

  /**
   * Invalidate the loadouts cache to force refresh on next access.
   * @private
   * @returns {void}
   */
  _invalidateCache() {
    log(3, 'Invalidating loadouts cache.', { actorId: this.actor.id });
    this._loadoutsCache = null;
    this._lastCacheTime = 0;
  }
}
