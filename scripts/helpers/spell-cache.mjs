import { log } from '../logger.mjs';
import * as discoveryUtils from './spell-discovery.mjs';

/**
 * Global spell cache for actors
 * @type {Map<string, Object>}
 */
const SPELL_CACHE = new Map();

/**
 * Check if actor has valid cached spell data
 * @param {string} actorId - Actor ID
 * @returns {boolean}
 */
export function hasCachedSpellData(actorId) {
  return SPELL_CACHE.has(actorId);
}

/**
 * Get cached spells for specific UUIDs and max level
 * @param {string} actorId - Actor ID
 * @param {Set<string>} spellUuids - UUIDs to filter
 * @param {number} maxSpellLevel - Max spell level
 * @returns {Array|null} Cached spells or null if not available
 */
export function getCachedSpells(actorId, spellUuids, maxSpellLevel) {
  if (!SPELL_CACHE.has(actorId)) return null;
  const cached = SPELL_CACHE.get(actorId);
  const cachedSpells = Object.values(cached.spellData)
    .flat()
    .filter((spell) => spellUuids.has(spell.compendiumUuid) && spell.system.level <= maxSpellLevel);
  if (cachedSpells.length > 0) return cachedSpells;
  return null;
}

/**
 * Pre-load spell data for an actor in the background
 * @param {Actor} actor - The actor
 * @returns {Promise<void>}
 */
export async function preloadSpellDataForActor(actor) {
  if (SPELL_CACHE.has(actor.id)) {
    log(3, `Spell cache already exists for ${actor.name}`);
    return;
  }
  try {
    const spellcastingClasses = getSpellcastingClasses(actor);
    if (Object.keys(spellcastingClasses).length === 0) {
      log(3, `No spellcasting classes found for ${actor.name}, skipping cache`);
      return;
    }
    const cacheEntry = { actorId: actor.id, timestamp: Date.now(), spellData: {}, allSpellUuids: new Set() };
    const fetchPromises = Object.entries(spellcastingClasses).map(async ([classId, classData]) => {
      try {
        const className = classData.name.toLowerCase();
        const classUuid = classData.uuid;
        const spellList = await discoveryUtils.getClassSpellList(className, classUuid, actor);
        const maxLevel = discoveryUtils.calculateMaxSpellLevel(classData.classItem, actor);
        const spells = await fetchSpellDocumentsOriginal(spellList, maxLevel);
        cacheEntry.spellData[classId] = spells;
        spells.forEach((spell) => cacheEntry.allSpellUuids.add(spell.compendiumUuid));
        return { classId, spellCount: spells.length };
      } catch (error) {
        log(1, `Error preloading spells for class ${classId}:`, error);
        return { classId, spellCount: 0 };
      }
    });
    const results = await Promise.all(fetchPromises);
    SPELL_CACHE.set(actor.id, cacheEntry);
    const totalSpells = Object.values(cacheEntry.spellData).reduce((sum, spells) => sum + spells.length, 0);
  } catch (error) {
    log(1, `Error pre-loading spell data for ${actor.name}:`, error);
  }
}

/**
 * Invalidate cache for an actor
 * @param {string} actorId - Actor ID
 */
export function invalidateSpellCache(actorId) {
  if (SPELL_CACHE.has(actorId)) {
    SPELL_CACHE.delete(actorId);
    log(3, `Invalidated spell cache for actor ${actorId}`);
  }
}

/**
 * Get spellcasting classes for an actor (helper function)
 * @param {Actor} actor - The actor
 * @returns {Object} Spellcasting classes
 */
function getSpellcastingClasses(actor) {
  const spellcastingClasses = {};
  const classItems = actor.items.filter((i) => i.type === 'class');

  for (const classItem of classItems) {
    if (!classItem.system.spellcasting?.progression || classItem.system.spellcasting.progression === 'none') continue;

    const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
    spellcastingClasses[identifier] = {
      name: classItem.name,
      uuid: classItem.uuid,
      id: classItem.id,
      spellcasting: classItem.system.spellcasting,
      img: classItem.img,
      classItem: classItem
    };
  }

  return spellcastingClasses;
}

/**
 * Original fetchSpellDocuments for cache population
 * This avoids circular dependency during cache preloading
 */
async function fetchSpellDocumentsOriginal(spellUuids, maxSpellLevel) {
  const compendiumGroups = new Map();
  const nonCompendiumUuids = [];
  for (const uuid of spellUuids) {
    const parsed = foundry.utils.parseUuid(uuid);
    if (parsed.collection && parsed.id) {
      const packId = parsed.collection.collection;
      if (!compendiumGroups.has(packId)) compendiumGroups.set(packId, []);
      compendiumGroups.get(packId).push({ uuid, id: parsed.id });
    } else nonCompendiumUuids.push(uuid);
  }
  const spellItems = [];
  const errors = [];
  const filteredOut = [];
  log(3, `Fetching spell documents: ${spellUuids.size} spells, max level ${maxSpellLevel}`);
  log(3, `Grouped into ${compendiumGroups.size} compendiums + ${nonCompendiumUuids.length} non-compendium UUIDs`);
  for (const [packId, uuidData] of compendiumGroups) {
    try {
      const pack = game.packs.get(packId);
      if (!pack) {
        for (const { uuid } of uuidData) errors.push({ uuid, reason: `Compendium ${packId} not found` });
        continue;
      }
      const fetchPromises = uuidData.map(async ({ uuid, id }) => {
        try {
          const spell = await pack.getDocument(id);
          return { uuid, id, spell, success: true };
        } catch (error) {
          return { uuid, id, error, success: false };
        }
      });
      const results = await Promise.all(fetchPromises);
      for (const result of results) {
        if (!result.success) {
          errors.push({ uuid: result.uuid, reason: result.error?.message || 'Failed to fetch from compendium' });
          continue;
        }
        const { uuid, spell } = result;
        if (!spell || spell.type !== 'spell') {
          errors.push({ uuid, reason: 'Not a valid spell document' });
          continue;
        }
        const sourceUuid = spell.parent && spell.flags?.core?.sourceId ? spell.flags.core.sourceId : uuid;
        if (spell.system.level <= maxSpellLevel) {
          spellItems.push({ ...spell, compendiumUuid: sourceUuid });
        } else {
          filteredOut.push({ ...spell, compendiumUuid: sourceUuid });
        }
      }
    } catch (error) {
      for (const { uuid } of uuidData) {
        errors.push({ uuid, reason: error.message || 'Compendium batch fetch error' });
      }
    }
  }
  if (nonCompendiumUuids.length > 0) {
    const fallbackPromises = nonCompendiumUuids.map(async (uuid) => {
      try {
        const spell = await fromUuid(uuid);
        return { uuid, spell, success: true };
      } catch (error) {
        return { uuid, error, success: false };
      }
    });
    const fallbackResults = await Promise.all(fallbackPromises);
    for (const result of fallbackResults) {
      if (!result.success) {
        errors.push({ uuid: result.uuid, reason: result.error?.message || 'Unknown error' });
        continue;
      }
      const { uuid, spell } = result;
      if (!spell) {
        errors.push({ uuid, reason: 'Document not found' });
        continue;
      }
      if (spell.type !== 'spell') {
        errors.push({ uuid, reason: 'Not a valid spell document' });
        continue;
      }
      const sourceUuid = spell.parent && spell.flags?.core?.sourceId ? spell.flags.core.sourceId : uuid;
      if (spell.system.level <= maxSpellLevel) spellItems.push({ ...spell, compendiumUuid: sourceUuid });
      else filteredOut.push({ ...spell, compendiumUuid: sourceUuid });
    }
  }
  if (filteredOut.length > 0) log(3, `Filtered out ${filteredOut.length} spells above level ${maxSpellLevel}.`);
  if (errors.length > 0) log(2, `Failed to fetch ${errors.length} spells out of ${spellUuids.size}`, { errors });
  log(3, `Successfully fetched ${spellItems.length}/${spellUuids.size} spells`);
  return spellItems;
}
