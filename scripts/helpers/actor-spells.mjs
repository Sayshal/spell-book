/**
 * Helper functions for actor spells
 * Retrieves and organizes spells for actors
 * @module spell-book/helpers/actor-spells
 */

import { log } from '../logger.mjs';
import * as formattingUtils from './spell-formatting.mjs';
import * as preparationUtils from './spell-preparation.mjs';

/**
 * Fetch and filter spell documents from UUIDs based on maximum spell level
 * @param {Set<string>} spellUuids - Set of spell UUIDs
 * @param {number} maxSpellLevel - Maximum spell level to include
 * @returns {Promise<Array>} - Array of spell documents
 */
export async function fetchSpellDocuments(spellUuids, maxSpellLevel) {
  const start = performance.now();
  const timing = (label) => log(3, `${label}: ${(performance.now() - start).toFixed(2)}ms`);

  const spellItems = [];
  const errors = [];
  const promises = [];

  timing('Start fetchSpellDocuments');

  // Create a batch of promises for parallel fetching
  for (const uuid of spellUuids) {
    const promise = fromUuid(uuid)
      .then((spell) => {
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
      })
      .catch((error) => {
        errors.push({ uuid, reason: error.message || 'Unknown error' });
      });

    promises.push(promise);
  }
  timing('Prepared all spell fetch promises');

  // Wait for all promises to resolve
  await Promise.allSettled(promises);
  timing('Completed all spell fetch promises');

  // Log errors in bulk rather than one by one
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
 * @param {Actor5e} actor - The actor to check preparation status against
 * @returns {Array} - Array of spell levels with formatted data for templates
 */
export async function organizeSpellsByLevel(spellItems, actor) {
  log(3, `Organizing ${spellItems.length} spells by level for ${actor.name}`);

  // Organize spells by level
  const spellsByLevel = {};
  const processedSpellIds = new Set(); // Track spells by ID
  const processedSpellNames = new Set(); // Track spells by name (lowercase)

  // First, add all spells from the class spell list
  log(3, 'Adding spells from class spell list');
  for (const spell of spellItems) {
    if (spell?.system?.level === undefined) continue;

    const level = spell.system.level;
    const spellName = spell.name.toLowerCase();

    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }

    // Add preparation status information to each spell
    const prepStatus = preparationUtils.getSpellPreparationStatus(actor, spell);

    // Add additional data for filtering
    const filterData = formattingUtils.extractSpellFilterData(spell);

    const spellData = {
      ...spell,
      preparation: prepStatus,
      filterData
    };

    spellsByLevel[level].push(spellData);
    processedSpellIds.add(spell.id || spell.compendiumUuid || spell.uuid);
    processedSpellNames.add(spellName);
  }

  // Next, add any additional spells directly from the actor
  log(3, 'Adding additional spells from actor');
  const actorSpells = await findActorSpells(actor, processedSpellIds, processedSpellNames);

  for (const { spell, source } of actorSpells) {
    if (spell?.system?.level === undefined) continue;

    const level = spell.system.level;
    log(3, `Adding actor spell: ${spell.name} (level ${level}, source: ${source?.name || 'unknown'})`);

    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }

    // Pass the actual spell object directly
    const prepStatus = preparationUtils.getSpellPreparationStatus(actor, spell);

    const filterData = formattingUtils.extractSpellFilterData(spell);

    const spellData = {
      ...spell,
      preparation: prepStatus,
      filterData
    };

    spellsByLevel[level].push(spellData);
    processedSpellIds.add(spell.id || spell.uuid);
    processedSpellNames.add(spell.name.toLowerCase());
  }

  // Convert to sorted array for handlebars
  const result = Object.entries(spellsByLevel)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([level, spells]) => ({
      level: level,
      levelName: CONFIG.DND5E.spellLevels[level],
      spells: spells
    }));

  log(3, `Final organized spell levels: ${result.length}`);
  log(3, `Total spells after organization: ${result.reduce((sum, level) => sum + level.spells.length, 0)}`);

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

    newSpells.push({
      spell,
      source
    });
  }

  return newSpells;
}
