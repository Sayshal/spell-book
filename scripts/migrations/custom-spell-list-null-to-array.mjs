/**
 * Custom Spell List Null to Array Migration
 * @module Migrations/CustomSpellListNullToArray
 * @author Tyler
 */

import { MODULE, FLAGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Migrate null customSpellList values to empty arrays.
 * @returns {Promise<object>} Migration results
 * @property {number} processed - Number of actors processed
 * @property {number} updated - Number of actors updated with new format
 * @property {Array<object>} migratedActors - Array of migrated actor information
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
        }
      } catch (error) {
        const errorMessage = `Failed to migrate null customSpellList for actor ${actor.name}: ${error.message}`;
        results.errors.push(errorMessage);
      }
    }
  } catch (error) {
    const errorMessage = `Critical error during null customSpellList migration: ${error.message}`;
    results.errors.push(errorMessage);
  }
  log(3, 'Custom Spell List Null->Array Migration Completed:', { results });
  return results;
}

export const customSpellListNullToArray = {
  key: 'customSpellListNullToArray',
  version: '1.0.0',
  name: 'Custom Spell List Null to Array',
  description: 'Migrate null customSpellList values to empty arrays',
  migrate: migrateCustomSpellListNullToArray
};
