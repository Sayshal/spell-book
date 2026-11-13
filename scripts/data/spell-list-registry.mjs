import { MODULE, SETTINGS } from '../constants.mjs';

/**
 * Register every registry-enabled spell list with the system's SpellListRegistry.
 * @returns {Promise<object>} Registration result statistics
 */
export async function registerEnabledSpellLists() {
  const result = { total: 0, registered: 0, skipped: 0, failed: 0, errors: [] };
  const enabledUuids = game.settings.get(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS) || [];
  if (enabledUuids.length === 0) return result;
  const validUuids = [];
  for (const uuid of enabledUuids) {
    result.total++;
    try {
      const page = await fromUuid(uuid);
      if (!page || page.type !== 'spells') {
        ATLAS.log(2, `Invalid spell list (will be removed from settings): ${uuid}`);
        result.skipped++;
        continue;
      }
      if (!page.system?.type || !page.system?.identifier) {
        ATLAS.log(2, `Missing required fields (will be removed from settings): ${page.name}`);
        result.skipped++;
        continue;
      }
      await dnd5e.registry.spellLists.register(uuid);
      validUuids.push(uuid);
      result.registered++;
      ATLAS.log(3, `Registered: ${page.name} (${page.system.type}:${page.system.identifier})`);
    } catch (error) {
      ATLAS.log(2, `Failed to register ${uuid} (will be removed from settings):`, error);
      result.failed++;
      result.errors.push({ uuid, error: error.message });
    }
  }
  if (validUuids.length !== enabledUuids.length) {
    const removedCount = enabledUuids.length - validUuids.length;
    ATLAS.log(3, `Removing ${removedCount} invalid spell list(s) from settings`);
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
  if (enabledLists.includes(uuid)) {
    await game.settings.set(
      MODULE.ID,
      SETTINGS.REGISTRY_ENABLED_LISTS,
      enabledLists.filter((entry) => entry !== uuid)
    );
    ui.notifications.info('SPELLBOOK.Registry.DisableReloadHint', { localize: true });
    return false;
  }
  await game.settings.set(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS, [...enabledLists, uuid]);
  try {
    await dnd5e.registry.spellLists.register(uuid);
  } catch (err) {
    ATLAS.log(1, 'Failed to live-register spell list, will apply on next reload', err);
  }
  return true;
}

/**
 * Register a spell list with dnd5e immediately.
 * @param {string} uuid - UUID of the spell list
 * @returns {Promise<void>}
 */
export async function ensureListRegistered(uuid) {
  const enabled = game.settings.get(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS) || [];
  if (!enabled.includes(uuid)) {
    enabled.push(uuid);
    await game.settings.set(MODULE.ID, SETTINGS.REGISTRY_ENABLED_LISTS, enabled);
  }
  try {
    await dnd5e.registry.spellLists.register(uuid);
  } catch (err) {
    ATLAS.log(1, 'ensureListRegistered failed', err);
  }
}

/**
 * Spell list UUIDs set as defaults for new characters of a class or subclass.
 * @param {string} type - List type, `class` or `subclass`
 * @param {string} identifier - Class or subclass identifier
 * @returns {string[]} Default spell list UUIDs
 */
export function getDefaultClassLists(type, identifier) {
  if (!identifier) return [];
  return [...(game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CLASS_LISTS)[`${type}:${identifier}`] ?? [])];
}

/**
 * Whether a spell list page is a default for new characters of its class or subclass.
 * @param {object} page - The spell list page
 * @returns {boolean} Whether the list is a default
 */
export function isDefaultClassList(page) {
  return getDefaultClassLists(page.system.type, page.system.identifier).includes(page.uuid);
}

/**
 * Add or remove a spell list page from the defaults for new characters of its class or subclass.
 * @param {object} page - The spell list page
 * @returns {Promise<boolean>} Whether the list is now a default
 */
export async function toggleDefaultClassList(page) {
  const key = `${page.system.type}:${page.system.identifier}`;
  const defaults = foundry.utils.deepClone(game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CLASS_LISTS));
  const lists = new Set(defaults[key] ?? []);
  const enabled = !lists.delete(page.uuid);
  if (enabled) lists.add(page.uuid);
  if (lists.size) defaults[key] = [...lists];
  else delete defaults[key];
  await game.settings.set(MODULE.ID, SETTINGS.DEFAULT_CLASS_LISTS, defaults);
  return enabled;
}
