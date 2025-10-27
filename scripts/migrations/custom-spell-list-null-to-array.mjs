/**
 * Custom Spell List Null to Array Migration
 *
 * Migrates null customSpellList values to empty arrays.
 * This migration ensures all custom spell list fields are properly initialized
 * as arrays instead of null values.
 *
 * @module Migrations/CustomSpellListNullToArray
 * @author Tyler
 */

import { MODULE, FLAGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Migrate null customSpellList values to empty arrays.
 * @returns {Promise<Object>} Migration results
 * @property {number} processed - Number of actors processed
 * @property {number} updated - Number of actors updated with new format
 * @property {Array<Object>} migratedActors - Array of migrated actor information
 * @property {Array<string>} errors - Array of error messages
 */
async function migrateCustomSpellListNullToArray() {
  const results = { processed: 0, updated: 0, migratedActors: [], errors: [] };
  try {
    const actors = game.actors.contents;
    for (const actor of actors) {
      try {
        const currentRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
        if (foundry.utils.isEmpty(currentRules)) continue;
        results.processed++;
        let hasUpdates = false;
        const updatedRules = { ...currentRules };
        const migratedClasses = [];
        for (const [classId, rules] of Object.entries(currentRules)) {
          if (rules && rules.customSpellList === null) {
            updatedRules[classId] = { ...rules, customSpellList: [] };
            migratedClasses.push({ classId: classId, oldValue: null, newValue: [] });
            hasUpdates = true;
          }
        }
        if (hasUpdates) {
          await actor.setFlag(MODULE.ID, FLAGS.CLASS_RULES, updatedRules);
          results.updated++;
          results.migratedActors.push({ id: actor.id, name: actor.name, migratedClasses: migratedClasses });
          log(3, `Migrated null customSpellList to [] for ${actor.name} (${migratedClasses.length} classes)`);
        }
      } catch (error) {
        const errorMessage = `Failed to migrate null customSpellList for actor ${actor.name}: ${error.message}`;
        results.errors.push(errorMessage);
      }
    }
    if (results.updated > 0) log(2, `Null customSpellList migration completed: ${results.updated}/${results.processed} actors updated`);
    else log(3, `No null customSpellList migration needed (${results.processed} actors checked)`);
  } catch (error) {
    const errorMessage = `Critical error during null customSpellList migration: ${error.message}`;
    results.errors.push(errorMessage);
  }
  return results;
}

export const customSpellListNullToArray = {
  key: 'customSpellListNullToArray',
  version: '1.0.0',
  name: 'Custom Spell List Null to Array',
  description: 'Migrate null customSpellList values to empty arrays',
  migrate: migrateCustomSpellListNullToArray
};
