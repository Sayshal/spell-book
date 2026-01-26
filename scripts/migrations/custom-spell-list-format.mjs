/**
 * Custom Spell List Format Migration
 * @module Migrations/CustomSpellListFormat
 * @author Tyler
 */

import { MODULE, FLAGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Migrate custom spell list format from string to array.
 * @returns {Promise<object>} Migration results
 * @property {number} processed - Number of actors processed
 * @property {number} updated - Number of actors updated with new format
 * @property {Array<object>} migratedActors - Array of migrated actor information
 * @property {Array<string>} errors - Array of error messages
 */
async function migrateCustomSpellListFormat() {
  const results = { processed: 0, updated: 0, migratedActors: [], errors: [] };
  try {
    const actors = game.actors.contents;
    results.processed = actors.length;
    for (const actor of actors) {
      try {
        const currentRules = actor.getFlag(MODULE.ID, FLAGS.SPELLCASTING_RULES) || {};
        if (foundry.utils.isEmpty(currentRules)) continue;
        let hasUpdates = false;
        const updatedRules = { ...currentRules };
        const migratedClasses = [];
        for (const [classId, rules] of Object.entries(currentRules)) {
          if (rules && rules.customSpellList && typeof rules.customSpellList === 'string') {
            updatedRules[classId] = { ...rules, customSpellList: [rules.customSpellList] };
            migratedClasses.push({ classId: classId, oldValue: rules.customSpellList, newValue: [rules.customSpellList] });
            hasUpdates = true;
          }
        }
        if (hasUpdates) {
          await actor.setFlag(MODULE.ID, FLAGS.SPELLCASTING_RULES, updatedRules);
          results.updated++;
          results.migratedActors.push({ id: actor.id, name: actor.name, migratedClasses: migratedClasses });
        }
      } catch (error) {
        const errorMessage = `Failed to migrate custom spell list format for actor ${actor.name}: ${error.message}`;
        results.errors.push(errorMessage);
      }
    }
  } catch (error) {
    const errorMessage = `Critical error during custom spell list format migration: ${error.message}`;
    results.errors.push(errorMessage);
  }
  log(3, 'Custom Spell List Format Migration Completed:', { results });
  return results;
}

export const customSpellListFormat = {
  key: 'customSpellListFormat',
  version: '1.0.0',
  name: 'Custom Spell List Format',
  description: 'Migrate custom spell list format from string to array',
  migrate: migrateCustomSpellListFormat
};
