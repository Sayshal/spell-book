import { log } from '../logger.mjs';
import { getPreloadedData } from './spell-data-preloader.mjs';

/**
 * Fast spell document fetching using getIndex instead of getDocument
 * @param {Set<string>} spellUuids - Set of spell UUIDs
 * @param {number} maxSpellLevel - Maximum spell level to include
 * @param {string} [actorId=null] - Actor ID for caching
 * @returns {Promise<Array>} - Array of spell documents
 */
export async function fetchSpellDocuments(spellUuids, maxSpellLevel, actorId = null) {
  const preloadedData = getPreloadedData();
  if (preloadedData && preloadedData.enrichedSpells.length > 0) {
    const matchingSpells = preloadedData.enrichedSpells.filter((spell) => spellUuids.has(spell.uuid) && spell.system?.level <= maxSpellLevel);
    if (matchingSpells.length === spellUuids.size) return matchingSpells;
  }
  const compendiumGroups = new Map();
  const nonCompendiumUuids = [];
  for (const uuid of spellUuids) {
    const parsed = foundry.utils.parseUuid(uuid);
    if (parsed.collection && parsed.id) {
      const packId = parsed.collection.collection;
      if (!compendiumGroups.has(packId)) compendiumGroups.set(packId, []);
      compendiumGroups.get(packId).push({ uuid, id: parsed.id });
    } else {
      nonCompendiumUuids.push(uuid);
    }
  }
  const spellItems = [];
  const errors = [];
  const filteredOut = [];
  log(3, `Fetching spell documents: ${spellUuids.size} spells, max level ${maxSpellLevel}`);
  log(3, `Grouped into ${compendiumGroups.size} compendiums + ${nonCompendiumUuids.length} non-compendium UUIDs`);
  for (const [packId, uuidData] of compendiumGroups) {
    const pack = game.packs.get(packId);
    if (!pack) {
      for (const { uuid } of uuidData) {
        errors.push({ uuid, reason: `Compendium ${packId} not found` });
      }
      continue;
    }
    const index = await pack.getIndex({
      fields: [
        'name',
        'img',
        'type',
        'system.level',
        'system.school',
        'system.preparation',
        'system.activation',
        'system.range',
        'system.duration',
        'system.properties',
        'system.materials',
        'system.activities',
        'system.description.value',
        'system.components',
        'labels.activation',
        'labels.range',
        'labels.duration',
        'labels.school',
        'labels.components',
        'labels.damages',
        'flags.core.sourceId',
        'flags.core'
      ]
    });
    const spellMap = new Map();
    for (const entry of index) {
      if (entry.type === 'spell') spellMap.set(entry._id, entry);
    }
    for (const { uuid, id } of uuidData) {
      const spell = spellMap.get(id);
      if (!spell) {
        errors.push({ uuid, reason: 'Spell not found in compendium' });
        continue;
      }
      if (spell.type !== 'spell') {
        errors.push({ uuid, reason: 'Not a valid spell document' });
        continue;
      }
      const sourceUuid = spell.flags?.core?.sourceId || `Compendium.${packId}.${id}`;
      spell.compendiumUuid = sourceUuid;
      if (spell.system?.level <= maxSpellLevel) spellItems.push(spell);
      else filteredOut.push(spell);
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
      spell.compendiumUuid = sourceUuid;
      if (spell.system?.level <= maxSpellLevel) spellItems.push(spell);
      else filteredOut.push(spell);
    }
  }
  if (errors.length > 0) log(2, `Failed to fetch ${errors.length} spells out of ${spellUuids.size}`, { errors });
  if (filteredOut.length > 0) log(3, `Filtered out ${filteredOut.length} spells above level ${maxSpellLevel}`);
  log(3, `Successfully fetched ${spellItems.length}/${spellUuids.size} spells`);
  return spellItems;
}

/**
 * Organize spells by level for display in GM interface
 * @param {Array} spellItems - Array of spell documents
 * @param {Actor|null} actor - The actor (optional, for additional context)
 * @returns {Array} Array of level objects with organized spells
 */
export function organizeSpellsByLevel(spellItems, actor = null) {
  if (!spellItems || !Array.isArray(spellItems)) return [];
  const spellsByLevel = {};
  for (const spell of spellItems) {
    if (spell?.system?.level === undefined) continue;
    const level = spell.system.level;
    if (!spellsByLevel[level]) spellsByLevel[level] = [];
    spellsByLevel[level].push(spell);
  }
  for (const level in spellsByLevel) {
    if (spellsByLevel.hasOwnProperty(level)) spellsByLevel[level].sort((a, b) => a.name.localeCompare(b.name));
  }
  const levelArray = [];
  const sortedLevels = Object.keys(spellsByLevel).sort((a, b) => Number(a) - Number(b));
  for (const level of sortedLevels) {
    const levelName = CONFIG.DND5E.spellLevels[level] || `Level ${level}`;
    levelArray.push({
      level: Number(level),
      levelName: levelName,
      spells: spellsByLevel[level]
    });
  }
  return levelArray;
}
