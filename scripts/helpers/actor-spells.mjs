/**
 * Helper functions for actor spells
 * Retrieves and organizes spells for actors
 * @module spell-book/helpers/actor-spells
 */

import { log } from '../logger.mjs';
import * as formattingUtils from './spell-formatting.mjs';
import * as preparationUtils from './spell-preparation.mjs';

/**
 * Fetch spell documents from UUIDs based on maximum spell level
 * @param {Set<string>} spellUuids - Set of spell UUIDs
 * @param {number} maxSpellLevel - Maximum spell level to include
 * @returns {Promise<Array>} - Array of spell documents
 */
export async function fetchSpellDocuments(spellUuids, maxSpellLevel) {
  const spellItems = [];
  const errors = [];

  // Process each UUID one at a time for simplicity
  for (const uuid of spellUuids) {
    try {
      const spell = await fromUuid(uuid);

      if (spell && spell.type === 'spell') {
        if (spell.system.level <= maxSpellLevel) {
          spellItems.push({
            ...spell,
            compendiumUuid: uuid
          });
        }
      } else if (spell) {
        errors.push({ uuid, reason: 'Not a valid spell document' });
      } else {
        errors.push({ uuid, reason: 'Document not found' });
      }
    } catch (error) {
      errors.push({ uuid, reason: error.message || 'Unknown error' });
    }
  }

  // Log errors
  if (errors.length > 0) {
    log(2, `Failed to fetch ${errors.length} spells out of ${spellUuids.size}`);

    if (errors.length === spellUuids.size) {
      log(1, 'All spells failed to load, possible system or compendium issue');
    }
  }

  log(3, `Successfully fetched ${spellItems.length}/${spellUuids.size} spells`);
  return spellItems;
}

/**
 * Organize spells by level for display with preparation info
 * @param {Array} spellItems - Array of spell documents
 * @param {Actor5e|null} actor - The actor to check preparation status against
 * @returns {Array} - Array of spell levels with formatted data
 */
export async function organizeSpellsByLevel(spellItems, actor = null) {
  log(3, `Organizing ${spellItems.length} spells by level${actor ? ` for ${actor.name}` : ''}`);

  // Organize spells by level
  const spellsByLevel = {};
  const processedSpellIds = new Set();
  const processedSpellNames = new Set();

  // Process all spells from the spell list
  for (const spell of spellItems) {
    if (spell?.system?.level === undefined) continue;

    const level = spell.system.level;
    const spellName = spell.name.toLowerCase();

    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }

    // Prepare the spell data
    const spellData = { ...spell };

    // Add preparation status if an actor is provided
    if (actor) {
      spellData.preparation = preparationUtils.getSpellPreparationStatus(actor, spell);
    }

    // Add filter data and formatted details
    spellData.filterData = formattingUtils.extractSpellFilterData(spell);
    spellData.formattedDetails = formattingUtils.formatSpellDetails(spell);

    spellsByLevel[level].push(spellData);
    processedSpellIds.add(spell.id || spell.compendiumUuid || spell.uuid);
    processedSpellNames.add(spellName);
  }

  // Add actor's spells if an actor is provided
  if (actor) {
    const actorSpells = await findActorSpells(actor, processedSpellIds, processedSpellNames);

    for (const { spell, source } of actorSpells) {
      if (spell?.system?.level === undefined) continue;

      const level = spell.system.level;

      if (!spellsByLevel[level]) {
        spellsByLevel[level] = [];
      }

      // Process actor's spell
      const spellData = {
        ...spell,
        preparation: preparationUtils.getSpellPreparationStatus(actor, spell),
        filterData: formattingUtils.extractSpellFilterData(spell),
        formattedDetails: formattingUtils.formatSpellDetails(spell)
      };

      spellsByLevel[level].push(spellData);
    }
  }

  // Sort spells alphabetically within each level
  for (const level in spellsByLevel) {
    if (spellsByLevel.hasOwnProperty(level)) {
      spellsByLevel[level].sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  // Convert to sorted array for templates
  const result = Object.entries(spellsByLevel)
    .sort(([a, b]) => Number(a) - Number(b))
    .map(([level, spells]) => ({
      level: level,
      levelName: CONFIG.DND5E.spellLevels[level],
      spells: spells
    }));

  log(3, `Final organized spell levels: ${result.length}`);
  return result;
}

/**
 * Find spells on an actor that aren't in the processed lists
 * @param {Actor5e} actor - The actor to check
 * @param {Set<string>} processedSpellIds - Set of already processed spell IDs
 * @param {Set<string>} processedSpellNames - Set of already processed spell names
 * @returns {Promise<Array>} - Array of actor spells with source information
 */
export async function findActorSpells(actor, processedSpellIds, processedSpellNames) {
  const actorSpells = actor.items.filter((item) => item.type === 'spell');
  const newSpells = [];

  for (const spell of actorSpells) {
    const spellId = spell.id || spell.uuid;
    const spellName = spell.name.toLowerCase();

    // Skip if already processed
    if (processedSpellIds.has(spellId) || processedSpellNames.has(spellName)) {
      continue;
    }

    const source = preparationUtils.determineSpellSource(actor, spell);
    newSpells.push({ spell, source });
  }

  return newSpells;
}
