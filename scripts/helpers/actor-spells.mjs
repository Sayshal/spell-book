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
  const spellItems = [];
  const errors = [];
  const promises = [];

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

  // Wait for all promises to resolve
  await Promise.allSettled(promises);

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
 * @param {Actor5e|null} actor - The actor to check preparation status against (optional)
 * @returns {Array} - Array of spell levels with formatted data for templates
 */
export async function organizeSpellsByLevel(spellItems, actor = null) {
  log(3, `Organizing ${spellItems.length} spells by level${actor ? ` for ${actor.name}` : ''}`);

  // Organize spells by level
  const spellsByLevel = {};
  const processedSpellIds = new Set(); // Track spells by ID
  const processedSpellNames = new Set(); // Track spells by name (lowercase)

  // First, add all spells from the spell list
  for (const spell of spellItems) {
    if (spell?.system?.level === undefined) continue;

    const level = spell.system.level;
    const spellName = spell.name.toLowerCase();

    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }

    // Prepare the spell data object
    let spellData = { ...spell };

    // Add preparation status information if an actor is provided
    if (actor) {
      const prepStatus = preparationUtils.getSpellPreparationStatus(actor, spell);
      spellData.preparation = prepStatus;
    }

    // Add additional data for filtering
    const filterData = formattingUtils.extractSpellFilterData(spell);
    spellData.filterData = filterData;

    // Add formatted details
    spellData.formattedDetails = formattingUtils.formatSpellDetails(spell);

    spellsByLevel[level].push(spellData);
    processedSpellIds.add(spell.id || spell.compendiumUuid || spell.uuid);
    processedSpellNames.add(spellName);
  }

  // Next, add any additional spells directly from the actor (only if actor is provided)
  if (actor) {
    const actorSpells = await findActorSpells(actor, processedSpellIds, processedSpellNames);

    for (const { spell, source } of actorSpells) {
      if (spell?.system?.level === undefined) continue;

      const level = spell.system.level;

      if (!spellsByLevel[level]) {
        spellsByLevel[level] = [];
      }

      // Pass the actual spell object directly
      const prepStatus = preparationUtils.getSpellPreparationStatus(actor, spell);
      const filterData = formattingUtils.extractSpellFilterData(spell);
      const formattedDetails = formattingUtils.formatSpellDetails(spell);

      const spellData = {
        ...spell,
        preparation: prepStatus,
        filterData,
        formattedDetails
      };

      spellsByLevel[level].push(spellData);
      processedSpellIds.add(spell.id || spell.uuid);
      processedSpellNames.add(spell.name.toLowerCase());
    }
  }

  // Sort spells alphabetically within each level
  for (const level in spellsByLevel) {
    if (spellsByLevel.hasOwnProperty(level)) {
      spellsByLevel[level].sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  // Convert to sorted array for handlebars
  const result = Object.entries(spellsByLevel)
    .sort(([a, b]) => Number(a) - Number(b))
    .map(([level, spells]) => ({
      level: level,
      levelName: CONFIG.DND5E.spellLevels[level],
      spells: spells // These are now pre-sorted alphabetically
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

    newSpells.push({
      spell,
      source
    });
  }

  return newSpells;
}
