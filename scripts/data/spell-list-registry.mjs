/**
 * Spell List Registry Integration
 *
 * Provides integration with the D&D 5e system's SpellListRegistry API.
 * Handles opt-in registration of custom spell lists.
 *
 * @module DataUtils/Registry
 * @author Tyler
 */

/**
 * Registration result structure.
 *
 * @typedef {Object} RegistrationResult
 * @property {number} total - Total lists processed
 * @property {number} registered - Successfully registered
 * @property {number} skipped - Skipped (invalid or duplicate)
 * @property {number} failed - Failed to register
 * @property {Array<{uuid: string, error: string}>} errors - Error details
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Register custom spell lists with the D&D 5e SpellListRegistry.
 * @returns {Promise<Object>} Registration result statistics
 */
export async function registerCustomSpellLists() {
  const result = { total: 0, registered: 0, skipped: 0, failed: 0, errors: [] };
  const enabledUuids = game.settings.get(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS) || [];
  if (enabledUuids.length === 0) return result;
  const validUuids = [];
  for (const uuid of enabledUuids) {
    result.total++;
    try {
      const page = await fromUuid(uuid);
      if (!page || page.type !== 'spells') {
        log(2, `Invalid spell list (will be removed from settings): ${uuid}`);
        result.skipped++;
        continue;
      }
      if (!page.system?.type || !page.system?.identifier) {
        log(2, `Missing required fields (will be removed from settings): ${page.name}`);
        result.skipped++;
        continue;
      }
      await dnd5e.registry.spellLists.register(uuid);
      validUuids.push(uuid);
      result.registered++;
      log(3, `Registered: ${page.name} (${page.system.type}:${page.system.identifier})`);
    } catch (error) {
      log(2, `Failed to register ${uuid} (will be removed from settings):`, error);
      result.failed++;
      result.errors.push({ uuid, error: error.message });
    }
  }
  if (validUuids.length !== enabledUuids.length) {
    const removedCount = enabledUuids.length - validUuids.length;
    log(3, `Removing ${removedCount} invalid spell list(s) from settings`);
    await game.settings.set(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS, validUuids);
  }
  return result;
}

/**
 * Check if a spell list is enabled for registry integration.
 * @param {string} uuid - UUID of the spell list
 * @returns {boolean} True if enabled
 */
export function isListEnabledForRegistry(uuid) {
  return game.settings.get(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS).includes(uuid);
}

/**
 * Toggle registry integration for a spell list.
 * @param {string} uuid - UUID of the spell list
 * @returns {Promise<boolean>} New enabled state
 */
export async function toggleListForRegistry(uuid) {
  const enabledLists = game.settings.get(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS);
  const isEnabled = enabledLists.includes(uuid);
  if (isEnabled) {
    const index = enabledLists.indexOf(uuid);
    enabledLists.splice(index, 1);
    await game.settings.set(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS, enabledLists);
    return false;
  } else {
    enabledLists.push(uuid);
    await game.settings.set(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS, enabledLists);
    return true;
  }
}
