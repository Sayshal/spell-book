/**
 * Spell Loadout Management and Quick Preparation Switching
 *
 * Manages spell loadouts for actors, providing functionality to save, load, and apply
 * spell preparation configurations. This class enables users to create preset spell
 * loadouts for different scenarios (combat, exploration, social, etc.) and quickly
 * switch between them without manually re-selecting each spell.
 *
 * Key features:
 * - Save current spell preparation state as named loadouts
 * - Load and apply saved loadouts to quickly change spell preparation
 * - Class-specific loadouts with optional cross-class compatibility
 * - Caching system for optimal performance when accessing loadouts frequently
 * - Integration with SpellBook UI for seamless checkbox state management
 * - Error handling and user feedback
 * - Persistent storage using actor flags for cross-session availability
 * - Validation and cleanup of loadout data
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
 * Spell loadout data structure for saving and loading configurations.
 *
 * @typedef {Object} SpellLoadout
 * @property {string} id - Unique loadout identifier
 * @property {string} name - User-friendly loadout name
 * @property {string} description - Optional loadout description
 * @property {string|null} classIdentifier - Associated class identifier, or null for all classes
 * @property {string[]} spellConfiguration - Array of spell UUIDs in this loadout
 * @property {number} createdAt - Timestamp when loadout was created
 * @property {number} updatedAt - Timestamp when loadout was last modified
 */

/**
 * Spell Loadout Manager - Quick preparation switching and configuration management.
 */
export class Loadouts {
  /**
   * Create a new Spell Loadout Manager instance.
   * @param {Actor} actor - The actor whose loadouts to manage
   * @param {SpellBook} [spellbook=null] - Optional Spell Book reference for UI integration
   */
  constructor(actor, spellbook = null) {
    /** @type {Actor} The actor whose loadouts are being managed */
    this.actor = actor;

    /** @type {SpellBook|null} Optional SpellBook reference for UI operations */
    this.spellbook = spellbook;

    /** @type {Object<string, SpellLoadout>|null} Cached loadouts data */
    this._loadoutsCache = null;

    /** @type {number} Timestamp of last cache refresh for invalidation */
    this._lastCacheTime = 0;
  }

  /**
   * Get all loadouts for the actor, with caching for performance.
   * @param {string} [classIdentifier=null] - The class identifier to filter by, or null for all loadouts
   * @returns {SpellLoadout[]} Array of loadout objects
   */
  getAvailableLoadouts(classIdentifier = null) {
    const cacheTimeout = 30000;
    const now = Date.now();
    if (!this._loadoutsCache || now - this._lastCacheTime > cacheTimeout) {
      this._loadoutsCache = this.actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
      this._lastCacheTime = now;
      log(3, 'Loaded loadouts from cache:', this._loadoutsCache);
    }
    const allLoadouts = Object.values(this._loadoutsCache);
    if (classIdentifier) {
      const filtered = allLoadouts.filter((loadout) => !loadout.classIdentifier || loadout.classIdentifier === classIdentifier);
      log(3, `Filtered loadouts for ${classIdentifier}:`, filtered);
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
    try {
      if (!name || !name.trim()) throw new Error('Loadout name is required');
      const loadoutId = foundry.utils.randomID();
      const loadout = { id: loadoutId, name: name.trim(), description: description?.trim() || '', classIdentifier, spellConfiguration, createdAt: Date.now(), updatedAt: Date.now() };
      await this.actor.update({ [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.${loadoutId}`]: loadout });
      this._invalidateCache();
      log(3, `Saved loadout: ${name} for ${classIdentifier || 'all classes'}`);
      return true;
    } catch (error) {
      log(1, 'Error saving loadout:', error);
      return false;
    }
  }

  /**
   * Load a loadout by its unique identifier.
   * @param {string} loadoutId - The unique loadout identifier
   * @returns {SpellLoadout|null} The loadout object or null if not found
   */
  loadLoadout(loadoutId) {
    try {
      const loadouts = this.actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
      return loadouts[loadoutId] || null;
    } catch (error) {
      log(1, 'Error loading loadout:', error);
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
    try {
      const loadout = this.loadLoadout(loadoutId);
      if (!loadout) throw new Error('Loadout not found');
      if (!this.spellbook) throw new Error('No Spell Book reference available');
      this._applySpellConfiguration(loadout.spellConfiguration, classIdentifier);
      log(3, `Applied loadout: ${loadout.name} to class ${classIdentifier}`);
      return true;
    } catch (error) {
      log(1, 'Error applying loadout:', error);
      return false;
    }
  }

  /**
   * Delete a loadout by its unique identifier.
   * @param {string} loadoutId - The loadout ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteLoadout(loadoutId) {
    try {
      const existingLoadouts = this.actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
      if (!existingLoadouts[loadoutId]) throw new Error('Loadout not found');
      const loadoutName = existingLoadouts[loadoutId].name;
      await this.actor.update({ [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.-=${loadoutId}`]: null });
      this._invalidateCache();
      log(3, `Deleted loadout: ${loadoutName}`);
      return true;
    } catch (error) {
      log(1, 'Error deleting loadout:', error);
      return false;
    }
  }

  /**
   * Capture current spell preparation state for the specified class.
   * @param {string} classIdentifier - The class identifier to capture state for
   * @returns {string[]} Array of prepared spell UUIDs
   */
  captureCurrentState(classIdentifier) {
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
      log(3, `Captured ${preparedSpells.length} prepared spells for ${classIdentifier}`, { spells: preparedSpells });
      return preparedSpells;
    } catch (error) {
      log(1, 'Error capturing current state:', error);
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
  }

  /**
   * Invalidate the loadouts cache to force refresh on next access.
   * @private
   * @returns {void}
   */
  _invalidateCache() {
    this._loadoutsCache = null;
    this._lastCacheTime = 0;
  }
}
