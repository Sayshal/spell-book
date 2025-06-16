import { FLAGS, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';
import { getCachedSpells } from './spell-cache.mjs';
import * as formattingUtils from './spell-formatting.mjs';

/**
 * Fetch spell documents from UUIDs based on maximum spell level
 * @param {Set<string>} spellUuids - Set of spell UUIDs
 * @param {number} maxSpellLevel - Maximum spell level to include
 * @returns {Promise<Array>} - Array of spell documents
 */
export async function fetchSpellDocuments(spellUuids, maxSpellLevel, actorId = null) {
  // Check cache first
  if (actorId) {
    const cachedSpells = getCachedSpells(actorId, spellUuids, maxSpellLevel);
    if (cachedSpells) {
      return cachedSpells;
    }
  }

  // Fallback to your existing optimized fetch logic
  const startTime = performance.now();
  log(1, '🔄 fetchSpellDocuments starting (cache miss)...');

  // Group UUIDs by compendium for batch fetching
  const compendiumGroups = new Map();
  const nonCompendiumUuids = [];

  for (const uuid of spellUuids) {
    const parsed = foundry.utils.parseUuid(uuid);
    if (parsed.collection && parsed.id) {
      const packId = parsed.collection.collection;
      if (!compendiumGroups.has(packId)) {
        compendiumGroups.set(packId, []);
      }
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

  // Batch fetch from each compendium using Promise.all for parallel processing
  for (const [packId, uuidData] of compendiumGroups) {
    try {
      const pack = game.packs.get(packId);
      if (!pack) {
        for (const { uuid } of uuidData) {
          errors.push({ uuid, reason: `Compendium ${packId} not found` });
        }
        continue;
      }

      // Batch fetch all documents from this compendium in parallel
      const fetchPromises = uuidData.map(async ({ uuid, id }) => {
        try {
          const spell = await pack.getDocument(id);
          return { uuid, id, spell, success: true };
        } catch (error) {
          return { uuid, id, error, success: false };
        }
      });

      const results = await Promise.all(fetchPromises);

      // Process results
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

  // Handle non-compendium UUIDs individually (fallback for world items, etc.)
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
      if (spell.system.level <= maxSpellLevel) {
        spellItems.push({ ...spell, compendiumUuid: sourceUuid });
      } else {
        filteredOut.push({ ...spell, compendiumUuid: sourceUuid });
      }
    }
  }

  if (filteredOut.length > 0) log(3, `Filtered out ${filteredOut.length} spells above level ${maxSpellLevel}.`);
  if (errors.length > 0) log(2, `Failed to fetch ${errors.length} spells out of ${spellUuids.size}`, { errors });
  log(3, `Successfully fetched ${spellItems.length}/${spellUuids.size} spells`);

  const elapsed = performance.now() - startTime;
  log(1, `🏁 fetchSpellDocuments total time: ${elapsed.toFixed(2)}ms`);
  return spellItems;
}
/**
 * Organize spells by level for display with preparation info
 * @param {Array} spellItems - Array of spell documents
 * @param {Actor5e|null} actor - The actor to check preparation status against
 * @param {SpellManager|null} spellManager - The spell manager instance
 * @returns {Array} - Array of spell levels with formatted data
 */
export function organizeSpellsByLevel(spellItems, actor = null, spellManager = null) {
  log(3, `Organizing ${spellItems.length} spells by level${actor ? ` for ${actor.name}` : ''}`);
  if (actor && !spellManager) spellManager = new SpellManager(actor);
  const preparedSpells = actor ? actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS) || [] : [];
  const spellsByLevel = {};
  const processedSpellIds = new Set();
  const processedSpellNames = new Set();
  for (const spell of spellItems) {
    if (spell?.system?.level === undefined) continue;
    const level = spell.system.level;
    const spellName = spell.name.toLowerCase();
    if (!spellsByLevel[level]) spellsByLevel[level] = [];
    const spellData = { ...spell };
    if (spellManager) {
      spellData.preparation = spellManager.getSpellPreparationStatus(spell);
      if (preparedSpells.includes(spell.compendiumUuid)) if (!spellData.preparation.alwaysPrepared && !spellData.preparation.isGranted) spellData.preparation.prepared = true;
    }
    if (spell.sourceClass) spellData.sourceClass = spell.sourceClass;
    spellData.filterData = formattingUtils.extractSpellFilterData(spell);
    spellData.formattedDetails = formattingUtils.formatSpellDetails(spell);
    spellsByLevel[level].push(spellData);
    processedSpellIds.add(spell.id || spell.compendiumUuid || spell.uuid);
    processedSpellNames.add(spellName);
  }
  if (actor) {
    const actorSpells = findActorSpells(actor, processedSpellIds, processedSpellNames);
    for (const { spell, source } of actorSpells) {
      if (spell?.system?.level === undefined) continue;
      const level = spell.system.level;
      if (!spellsByLevel[level]) spellsByLevel[level] = [];
      const spellData = {
        ...spell,
        preparation: spellManager.getSpellPreparationStatus(spell),
        filterData: formattingUtils.extractSpellFilterData(spell),
        formattedDetails: formattingUtils.formatSpellDetails(spell)
      };
      if (spell.system?.sourceClass) spellData.sourceClass = spell.system.sourceClass;
      spellsByLevel[level].push(spellData);
    }
  }
  for (const level in spellsByLevel) if (spellsByLevel.hasOwnProperty(level)) spellsByLevel[level].sort((a, b) => a.name.localeCompare(b.name));
  const result = Object.entries(spellsByLevel)
    .sort(([a, b]) => Number(a) - Number(b))
    .map(([level, spells]) => ({ level: level, levelName: CONFIG.DND5E.spellLevels[level], spells: spells }));
  log(3, `Final organized spell levels: ${result.length}`);
  return result;
}

/**
 * Find spells on an actor that aren't in the processed lists
 * @param {Actor5e} actor - The actor to check
 * @param {Set<string>} processedSpellIds - Set of already processed spell IDs
 * @param {Set<string>} processedSpellNames - Set of already processed spell names
 */
export function findActorSpells(actor, processedSpellIds, processedSpellNames) {
  const actorSpells = actor.items.filter((item) => item.type === 'spell');
  const newSpells = [];
  const spellManager = new SpellManager(actor);
  log(3, `Finding actor spells for ${actor.name} - ${actorSpells.length} total spells`);
  for (const spell of actorSpells) {
    const spellId = spell.id || spell.uuid;
    const spellName = spell.name.toLowerCase();
    if (processedSpellIds.has(spellId) || processedSpellNames.has(spellName)) continue;
    const source = spellManager._determineSpellSource(spell);
    newSpells.push({ spell, source });
  }
  log(3, `Found ${newSpells.length} additional spells on actor ${actor.name}`);
  return newSpells;
}
