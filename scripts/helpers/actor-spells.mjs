import { FLAGS, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';
import * as formattingUtils from './spell-formatting.mjs';

/**
 * Fetch spell documents from UUIDs based on maximum spell level
 * @param {Set<string>} spellUuids - Set of spell UUIDs
 * @param {number} maxSpellLevel - Maximum spell level to include
 * @returns {Promise<Array>} - Array of spell documents
 */
export async function fetchSpellDocuments(spellUuids, maxSpellLevel) {
  const spellItems = [];
  const errors = [];
  const filteredOut = [];
  log(3, `Fetching spell documents: ${spellUuids.size} spells, max level ${maxSpellLevel}`);
  for (const uuid of spellUuids) {
    try {
      const spell = await fromUuid(uuid);
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
    } catch (error) {
      errors.push({ uuid, reason: error.message || 'Unknown error' });
    }
  }
  if (filteredOut.length > 0) log(3, `Filtered out ${filteredOut.length} spells above level ${maxSpellLevel}.`);
  if (errors.length > 0) log(2, `Failed to fetch ${errors.length} spells out of ${spellUuids.size}`, { errors });
  log(3, `Successfully fetched ${spellItems.length}/${spellUuids.size} spells`);
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
