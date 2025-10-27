/**
 * Actor Spell Management Utilities
 *
 * Provides utilities for managing spells on actors including
 * spell retrieval, preparation status management, spellcasting class analysis,
 * and spell slot calculations. This module handles the complex interactions
 * between actors, their classes, and their spell collections.
 *
 * @module DataUtils/ActorSpells
 * @author Tyler
 */

import { log } from '../logger.mjs';
import * as DataUtils from './_module.mjs';

/**
 * @typedef {Object} SpellDocument
 * @property {string} uuid - Unique identifier for the spell
 * @property {string} name - Display name of the spell
 * @property {string} img - Image path for the spell icon
 * @property {string} type - Document type (should be 'spell')
 * @property {SpellSystemData} system - System-specific spell data
 * @property {Object} labels - Computed labels for display
 * @property {Object} flags - Document flags and metadata
 * @property {string} [compendiumUuid] - UUID of the source compendium document
 */

/**
 * @typedef {Object} SpellSystemData
 * @property {number} level - Spell level (0-9, where 0 is cantrip)
 * @property {string} school - School of magic identifier
 * @property {Object} preparation - Spell preparation configuration
 * @property {Object} activation - Spell activation requirements
 * @property {Object} range - Spell range information
 * @property {Object} duration - Spell duration data
 * @property {Array} properties - Array of spell property flags
 * @property {Object} materials - Material component requirements
 * @property {Map} activities - Map of spell activities
 * @property {Object} description - Spell description content
 * @property {Object} components - Spell component requirements
 */

/**
 * @typedef {Object} CompendiumGroupData
 * @property {string} uuid - Full UUID of the spell
 * @property {string} id - Document ID within the compendium
 */

/**
 * @typedef {Object} SpellFetchError
 * @property {string} uuid - UUID that failed to fetch
 * @property {string} reason - Human-readable error reason
 */

/**
 * @typedef {Object} LevelGroup
 * @property {number} level - Numeric spell level
 * @property {string} levelName - Localized display name for the level
 * @property {Array<SpellDocument>} spells - Array of spells at this level
 */

/**
 * Fast spell document fetching.
 * @param {Set<string>} spellUuids - Set of spell UUIDs to fetch
 * @param {number} maxSpellLevel - Maximum spell level to include in results
 * @returns {Promise<Array<SpellDocument>>} Array of spell documents
 */
export async function fetchSpellDocuments(spellUuids, maxSpellLevel) {
  log(3, 'Fetching spell documents!', { spellUuids, maxSpellLevel });
  const preloadedData = DataUtils.getPreloadedData();
  if (preloadedData && preloadedData.enrichedSpells.length > 0) {
    const matchingSpells = preloadedData.enrichedSpells.filter((spell) => spellUuids.has(spell.uuid) && spell.system?.level <= maxSpellLevel);
    if (matchingSpells.length === spellUuids.size) return matchingSpells;
  }

  /** @type {Map<string, Array<CompendiumGroupData>>} */
  const compendiumGroups = new Map();

  /** @type {Array<string>} */
  const worldUuids = [];
  for (const uuid of spellUuids) {
    const parsed = foundry.utils.parseUuid(uuid);
    if (parsed.collection && parsed.id) {
      const packId = parsed.collection.collection;
      if (!compendiumGroups.has(packId)) compendiumGroups.set(packId, []);
      compendiumGroups.get(packId).push({ uuid, id: parsed.id });
    } else {
      worldUuids.push(uuid);
    }
  }

  /** @type {Array<SpellDocument>} */
  const spellItems = [];

  /** @type {Array<SpellFetchError>} */
  const errors = [];

  /** @type {Array<SpellDocument>} */
  const filteredOut = [];

  for (const [packId, uuidData] of compendiumGroups) {
    const pack = game.packs.get(packId);
    if (!pack) {
      for (const { uuid } of uuidData) errors.push({ uuid, reason: `Compendium ${packId} not found` });
      continue;
    }
    const index = await pack.getIndex({
      fields: [
        'img',
        'name',
        'type',
        'flags.core.sourceId',
        'labels.activation',
        'labels.components',
        'labels.damages',
        'labels.range',
        'labels.school',
        'system.activation.type',
        'system.activation.value',
        'system.activities',
        'system.components.ritual',
        'system.description.value',
        'system.duration.concentration',
        'system.level',
        'system.materials.consumed',
        'system.materials.cost',
        'system.materials.value',
        'system.preparation',
        'system.properties',
        'system.range.units',
        'system.range.value',
        'system.school',
        'system.source.book',
        'system.source.custom'
      ]
    });

    /** @type {Map<string, Object>} */
    const spellMap = new Map();
    for (const entry of index) if (entry.type === 'spell') spellMap.set(entry._id, entry);
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
      const sourceUuid = spell._stats?.compendiumSource || foundry.utils.parseUuid(uuid).uuid;
      spell.compendiumUuid = sourceUuid;
      if (spell.system?.level <= maxSpellLevel) spellItems.push(spell);
      else filteredOut.push(spell);
    }
  }
  if (worldUuids.length > 0) {
    const semaphore = new foundry.utils.Semaphore(5);
    const fallbackResults = [];
    for (const uuid of worldUuids) {
      fallbackResults.push(
        semaphore.add(() => {
          const spell = fromUuidSync(uuid);
          return { uuid, spell, success: true };
        })
      );
    }
    const resolvedResults = await Promise.all(fallbackResults);
    for (const result of resolvedResults) {
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
      const sourceUuid = spell._stats?.compendiumSource || foundry.utils.parseUuid(uuid).uuid;
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
 * Organize spells by level for display in GM interface.
 * @param {Array<SpellDocument>} spellItems - Array of spell documents to organize
 * @returns {Array<LevelGroup>} Array of level objects with organized spells
 */
export function organizeSpellsByLevel(spellItems) {
  log(3, 'Organizing spells by level!', { spellItems });
  if (!spellItems || !Array.isArray(spellItems)) return [];

  /** @type {Object<number, Array<SpellDocument>>} */
  const spellsByLevel = {};
  for (const spell of spellItems) {
    if (spell?.system?.level === undefined) continue;
    const level = spell.system.level;
    if (!spellsByLevel[level]) spellsByLevel[level] = [];
    spellsByLevel[level].push(spell);
  }
  for (const level in spellsByLevel) if (level in spellsByLevel) spellsByLevel[level].sort((a, b) => a.name.localeCompare(b.name));

  /** @type {Array<LevelGroup>} */
  const levelArray = [];
  const sortedLevels = Object.keys(spellsByLevel).sort((a, b) => Number(a) - Number(b));
  for (const level of sortedLevels) levelArray.push({ level: Number(level), levelName: CONFIG.DND5E.spellLevels[level], spells: spellsByLevel[level] });
  return levelArray;
}
