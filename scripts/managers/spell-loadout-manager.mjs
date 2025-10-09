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
 * @module Managers/SpellLoadoutManager
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
 *
 * This class provides spell loadout management for actors, enabling
 * users to save current spell preparation states and quickly switch between different
 * configurations. It integrates with the SpellBook UI to provide seamless transitions
 * between loadouts while maintaining proper spell preparation tracking.
 *
 * The manager uses caching to optimize performance when frequently accessing loadouts
 * and provides both class-specific and cross-class loadout functionality. All loadouts
 * are persistently stored using Foundry's actor flag system.
 */
export class SpellLoadoutManager {
  /**
   * Create a new Spell Loadout Manager instance.
   *
   * Initializes the manager with the specified actor and optional SpellBook reference.
   * The SpellBook reference is required for applying loadouts and capturing current
   * preparation state, but loadout data access can function without it.
   *
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
   *
   * Retrieves all available loadouts for the actor, optionally filtered by class
   * identifier. Uses caching to avoid repeated flag access and improve performance
   * when loadouts are accessed frequently. Cache automatically expires after 30 seconds.
   *
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
   *
   * Creates and saves a new spell loadout with the provided name, description,
   * and spell configuration. Validates input data and generates unique identifiers
   * for tracking. Updates the actor's flag data and invalidates cache for
   * immediate availability.
   *
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
   *
   * Retrieves a specific loadout from the actor's stored loadouts using the
   * loadout ID. This method accesses the current flag data directly rather
   * than using cache to ensure the most up-to-date information.
   *
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
   *
   * Loads the specified loadout and applies its spell configuration to the
   * current SpellBook UI. Updates checkbox states, visual indicators, and
   * spell preparation tracking to match the loadout configuration. Requires
   * a valid SpellBook reference to function.
   *
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
   *
   * Removes the specified loadout from the actor's stored loadouts. Uses
   * Foundry's flag deletion syntax to properly remove the loadout data
   * and invalidates cache to reflect the changes immediately.
   *
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
   *
   * Analyzes the current SpellBook UI to determine which spells are currently
   * prepared for the specified class. This creates a snapshot of the current
   * preparation state that can be saved as a loadout. Requires a valid
   * SpellBook reference and rendered UI elements.
   *
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
        if (isPrepared) preparedSpells.push(uuid);
      });
      log(3, `Captured ${preparedSpells.length} prepared spells for ${classIdentifier}`);
      return preparedSpells;
    } catch (error) {
      log(1, 'Error capturing current state:', error);
      return [];
    }
  }

  /**
   * Apply spell configuration to SpellBook UI checkboxes.
   *
   * Updates the SpellBook interface to reflect the specified spell configuration
   * by setting checkbox states and visual indicators. First clears all current
   * preparations for the class, then applies the new configuration. Updates
   * spell preparation tracking and counts to maintain UI consistency.
   *
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
   *
   * Clears the cached loadouts data and resets the cache timestamp. This
   * ensures that the next call to getAvailableLoadouts will fetch fresh
   * data from the actor flags. Called automatically after save and delete
   * operations to maintain data consistency.
   *
   * @private
   * @returns {void}
   */
  _invalidateCache() {
    this._loadoutsCache = null;
    this._lastCacheTime = 0;
  }
}
