/**
 * Pack Sorting Migration
 *
 * Migrates pack sorting and folder sorting for Spell Book packs.
 * Ensures packs have correct sort values and folders use manual sorting.
 *
 * @module Migrations/PackSorting
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Migrate pack sorting and folder sorting for Spell Book packs.
 * @returns {Promise<Object>} Migration results
 * @property {number} processed - Total items processed
 * @property {number} foldersUpdated - Number of folders updated
 * @property {number} packsUpdated - Number of packs updated
 * @property {Array<Object>} errors - Array of error objects with type and details
 */
async function migratePackSorting() {
  const results = { processed: 0, updated: 0, foldersUpdated: 0, packsUpdated: 0, errors: [] };
  try {
    const packSortingConfig = { [MODULE.PACK.SPELLS]: 10000, [MODULE.PACK.USERDATA]: 20000, [MODULE.PACK.MACROS]: 30000 };
    for (const [packId, sortValue] of Object.entries(packSortingConfig)) {
      try {
        const pack = game.packs.get(packId);
        results.processed++;
        if (pack.sort !== sortValue) {
          await pack.configure({ sort: sortValue });

          results.packsUpdated++;
          results.updated++;
        }
      } catch (error) {
        results.errors.push({
          type: 'pack',
          packId,
          error: error.message
        });
      }
    }
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
    if (customPack?.folder) {
      results.processed++;
      if (customPack.folder.sorting !== 'm') {
        try {
          await customPack.folder.update({ sorting: 'm' });
          log(3, `Updated "${customPack.folder.name}" folder sorting to manual ("m")`);
          results.foldersUpdated++;
          results.updated++;
        } catch (error) {
          results.errors.push({
            type: 'folder',
            name: customPack.folder.name,
            error: error.message
          });
        }
      }
    }
    if (results.packsUpdated > 0) log(3, `Updated ${results.packsUpdated} pack sort values`);
    if (results.foldersUpdated > 0) log(3, `Updated ${results.foldersUpdated} pack folders to use manual sorting`);
  } catch (error) {
    results.errors.push({ type: 'generalMigration', error: error.message });
  }
  return results;
}

export const packSorting = {
  key: 'packSorting',
  version: '1.0.0',
  name: 'Pack Sorting',
  description: 'Migrate pack sorting and folder sorting for Spell Book packs',
  migrate: migratePackSorting
};
