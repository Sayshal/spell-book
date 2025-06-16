import { log } from '../logger.mjs';
import { getCachedSpells } from './spell-cache.mjs';

/**
 * Fetch spell documents from UUIDs based on maximum spell level
 * @param {Set<string>} spellUuids - Set of spell UUIDs
 * @param {number} maxSpellLevel - Maximum spell level to include
 * @param {string} [actorId=null] - Actor ID for caching
 * @returns {Promise<Array>} - Array of spell documents
 */
export async function fetchSpellDocuments(spellUuids, maxSpellLevel, actorId = null) {
  if (actorId) {
    const cachedSpells = getCachedSpells(actorId, spellUuids, maxSpellLevel);
    if (cachedSpells) return cachedSpells;
  }
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
        if (spell.system.level <= maxSpellLevel) spellItems.push({ ...spell, compendiumUuid: sourceUuid });
        else filteredOut.push({ ...spell, compendiumUuid: sourceUuid });
      }
    } catch (error) {
      for (const { uuid } of uuidData) errors.push({ uuid, reason: error.message || 'Compendium batch fetch error' });
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
