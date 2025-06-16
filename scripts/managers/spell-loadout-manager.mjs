import { FLAGS, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Manages spell loadouts for quick preparation switching
 * Handles saving, loading, and applying spell configurations
 */
export class SpellLoadoutManager {
  /**
   * @param {Actor} actor - The actor whose loadouts to manage
   * @param {PlayerSpellBook} spellbook - Optional spellbook reference
   */
  constructor(actor, spellbook = null) {
    this.actor = actor;
    this.spellbook = spellbook;
    this._loadoutsCache = null;
    this._lastCacheTime = 0;
  }

  /**
   * Get all loadouts for the actor, with caching
   * @param {string} classIdentifier - The class identifier to filter by
   * @returns {Array} Array of loadout objects
   */
  getAvailableLoadouts(classIdentifier = null) {
    const cacheTimeout = 30000;
    const now = Date.now();
    if (!this._loadoutsCache || now - this._lastCacheTime > cacheTimeout) {
      this._loadoutsCache = this.actor.getFlag(MODULE.ID, FLAGS.SPELL_LOADOUTS) || {};
      this._lastCacheTime = now;
      log(3, `Loaded loadouts from cache:`, this._loadoutsCache);
    }
    const allLoadouts = Object.values(this._loadoutsCache);
    log(3, `All loadouts:`, allLoadouts);
    if (classIdentifier) {
      const filtered = allLoadouts.filter((loadout) => !loadout.classIdentifier || loadout.classIdentifier === classIdentifier);
      log(3, `Filtered loadouts for ${classIdentifier}:`, filtered);
      return filtered;
    }
    return allLoadouts;
  }

  /**
   * Save a new loadout
   * @param {string} name - The loadout name
   * @param {string} description - The loadout description
   * @param {Array} spellConfiguration - The spell preparation configuration
   * @param {string} classIdentifier - Optional class identifier
   * @returns {Promise<boolean>} Success status
   */
  async saveLoadout(name, description, spellConfiguration, classIdentifier = null) {
    try {
      if (!name || !name.trim()) throw new Error('Loadout name is required');
      const loadoutId = foundry.utils.randomID();
      const loadout = {
        id: loadoutId,
        name: name.trim(),
        description: description?.trim() || '',
        classIdentifier,
        spellConfiguration,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
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
   * Load a loadout by ID
   * @param {string} loadoutId - The loadout ID
   * @returns {Object|null} The loadout object or null if not found
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
   * Apply a loadout to the current spellbook
   * @param {string} loadoutId - The loadout ID to apply
   * @param {string} classIdentifier - The class to apply it to
   * @returns {boolean} Success status
   */
  applyLoadout(loadoutId, classIdentifier) {
    try {
      const loadout = this.loadLoadout(loadoutId);
      if (!loadout) throw new Error('Loadout not found');
      if (!this.spellbook) throw new Error('No spellbook reference available');
      this._applySpellConfiguration(loadout.spellConfiguration, classIdentifier);
      log(3, `Applied loadout: ${loadout.name} to class ${classIdentifier}`);
      ui.notifications.info(game.i18n.format('SPELLBOOK.Loadouts.Applied', { name: loadout.name }));
      return true;
    } catch (error) {
      log(1, 'Error applying loadout:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Loadouts.ApplyFailed'));
      return false;
    }
  }

  /**
   * Delete a loadout
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
      ui.notifications.info(game.i18n.format('SPELLBOOK.Loadouts.Deleted', { name: loadoutName }));
      return true;
    } catch (error) {
      log(1, 'Error deleting loadout:', error);
      return false;
    }
  }

  /**
   * Capture current spell preparation state
   * @param {string} classIdentifier - The class identifier
   * @returns {Array} Array of prepared spell UUIDs
   */
  captureCurrentState(classIdentifier) {
    try {
      if (!this.spellbook) throw new Error('No spellbook reference available');
      const preparedSpells = [];
      const formElement = this.spellbook.element;
      if (!formElement) throw new Error('Spellbook element not found');
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
   * Apply spell configuration to checkboxes
   * @param {Array} spellConfiguration - Array of spell UUIDs to prepare
   * @param {string} classIdentifier - The class identifier
   * @private
   */
  _applySpellConfiguration(spellConfiguration, classIdentifier) {
    if (!this.spellbook) throw new Error('No spellbook reference available');
    const formElement = this.spellbook.element;
    if (!formElement) throw new Error('Spellbook element not found');
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
   * Invalidate the loadouts cache
   * @private
   */
  _invalidateCache() {
    this._loadoutsCache = null;
    this._lastCacheTime = 0;
  }
}
