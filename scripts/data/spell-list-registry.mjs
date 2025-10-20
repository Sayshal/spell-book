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
  log(3, 'Registering spell lists with D&D 5e SpellListRegistry');
  const result = { total: 0, registered: 0, skipped: 0, failed: 0, errors: [] };
  const enabledUuids = game.settings.get(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS) || [];
  if (enabledUuids.length === 0) {
    log(3, 'No spell lists enabled for registry integration');
    return result;
  }
  log(3, `Registering ${enabledUuids.length} enabled spell lists`);
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
      validUuids.push(uuid); // Keep this UUID
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
  log(3, `Registry complete: ${result.registered} registered, ${result.skipped} skipped, ${result.failed} failed`);
  return result;
}

/**
 * Check if a spell list is enabled for registry integration.
 * @param {string} uuid - UUID of the spell list
 * @returns {boolean} True if enabled
 */
export function isListEnabledForRegistry(uuid) {
  const enabledLists = game.settings.get(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS);
  return enabledLists.includes(uuid);
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
    log(3, `Disabled registry for: ${uuid}`);
    return false;
  } else {
    enabledLists.push(uuid);
    await game.settings.set(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS, enabledLists);
    log(3, `Enabled registry for: ${uuid}`);
    return true;
  }
}

/**
 * Get custom spell list by type and identifier.
 * @param {string} type - Spell list type ('class', 'subclass', etc.)
 * @param {string} identifier - Spell list identifier
 * @returns {Promise<Set<string>|null>} Set of spell UUIDs or null
 */
export async function getCustomSpellList(type, identifier) {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return null;
  const journals = await customPack.getDocuments();
  for (const journal of journals) {
    for (const page of journal.pages) {
      if (page.type !== 'spells') continue;
      const pageType = page.system?.type;
      const pageIdentifier = page.system?.identifier?.toLowerCase();
      if (pageType === type && pageIdentifier === identifier) {
        const flags = page.flags?.[MODULE.ID] || {};
        const isCustom = flags.isCustom || flags.isNewList || flags.isDuplicate;
        if (isCustom) {
          log(3, `Found custom spell list: ${type}:${identifier} (${page.name})`);
          return page.system.spells || new Set();
        }
      }
    }
  }
  return null;
}
