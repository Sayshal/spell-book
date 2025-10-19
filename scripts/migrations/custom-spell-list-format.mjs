/**
 * Custom Spell List Format Migration
 *
 * Migrates custom spell list format from string to array.
 * This migration ensures all custom spell list references are stored as arrays
 * rather than strings for consistent data handling.
 *
 * @module Migrations/CustomSpellListFormat
 * @author Tyler
 */

import { MODULE, FLAGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Migrate custom spell list format from string to array.
 * @returns {Promise<Object>} Migration results
 * @property {number} processed - Number of actors processed
 * @property {number} updated - Number of actors updated with new format
 * @property {Array<Object>} migratedActors - Array of migrated actor information
 * @property {Array<string>} errors - Array of error messages
 */
async function migrateCustomSpellListFormat() {
  log(3, 'Starting custom spell list format migration...');
  const results = { processed: 0, updated: 0, migratedActors: [], errors: [] };
  try {
    const actors = game.actors.contents;
    for (const actor of actors) {
      try {
        const currentRules = actor.getFlag(MODULE.ID, FLAGS.SPELLCASTING_RULES) || {};
        if (Object.keys(currentRules).length === 0) continue;
        results.processed++;
        let hasUpdates = false;
        const updatedRules = { ...currentRules };
        const migratedClasses = [];
        for (const [classId, rules] of Object.entries(currentRules)) {
          if (rules && rules.customSpellList && typeof rules.customSpellList === 'string') {
            log(3, `Migrating custom spell list for ${actor.name} class ${classId}: "${rules.customSpellList}" -> ["${rules.customSpellList}"]`);
            updatedRules[classId] = { ...rules, customSpellList: [rules.customSpellList] };
            migratedClasses.push({ classId: classId, oldValue: rules.customSpellList, newValue: [rules.customSpellList] });
            hasUpdates = true;
          }
        }
        if (hasUpdates) {
          await actor.setFlag(MODULE.ID, FLAGS.SPELLCASTING_RULES, updatedRules);
          results.updated++;
          results.migratedActors.push({ id: actor.id, name: actor.name, migratedClasses: migratedClasses });
          log(3, `Migrated custom spell list format for ${actor.name} (${migratedClasses.length} classes)`);
        }
      } catch (error) {
        const errorMessage = `Failed to migrate custom spell list format for actor ${actor.name}: ${error.message}`;
        results.errors.push(errorMessage);
        log(1, errorMessage, error);
      }
    }
    if (results.updated > 0) log(2, `Custom spell list format migration completed: ${results.updated}/${results.processed} actors updated`);
    else log(3, `No custom spell list format migration needed (${results.processed} actors checked)`);
  } catch (error) {
    const errorMessage = `Critical error during custom spell list format migration: ${error.message}`;
    results.errors.push(errorMessage);
    log(1, errorMessage, error);
  }
  return results;
}

export const customSpellListFormat = {
  key: 'customSpellListFormat',
  version: '1.0.0',
  name: 'Custom Spell List Format',
  description: 'Migrate custom spell list format from string to array',
  migrate: migrateCustomSpellListFormat
};
