/**
 * Migration Management and Execution
 *
 * Manages data migration and maintenance tasks for the Spell Book module.
 * This module provides automated migration functionality that runs on world
 * startup to ensure data integrity, update deprecated configurations, and
 * maintain proper ownership and organization of module data.
 *
 * The manager operates on migration configurations defined in the migrations module,
 * ensuring all required migrations are executed in sequence and results are properly
 * logged and reported to the user.
 * @module Managers/Migrations
 * @author Tyler
 */

import { MODULE, TEMPLATES, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as m from '../migrations/_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;
const MIGRATIONS = Object.values(m);

/**
 * Migration Manager - Centralized migration execution and reporting system.
 */
export class Migrations {
  /**
   * Run all migration functions in sequence.
   * @returns {Promise<void>}
   * @static
   */
  static async runAllMigrations() {
    if (!game.user.isGM) return;
    log(3, 'Starting migration process.', { migrationCount: MIGRATIONS.length });
    try {
      const results = {};
      let totalUpdated = 0;
      for (const migration of MIGRATIONS) {
        try {
          const result = await migration.migrate();
          results[migration.key] = result;
          totalUpdated += result.updated || 0;
        } catch (error) {
          log(1, 'Migration failed.', { key: migration.key, error });
          results[migration.key] = { processed: 0, errors: [error.message] };
        }
      }
      const resultSummary = MIGRATIONS.map((m) => {
        const result = results[m.key] || {};
        return `${m.key}={processed: ${result.processed || 0}, updated: ${result.updated || 0}}`;
      }).join(', ');
      log(3, 'All migrations completed.', { totalUpdated, results: resultSummary });
      if (totalUpdated > 0) await this.logMigrationResults(results);
      else log(3, 'No migrations needed');
    } catch (error) {
      log(1, 'Error during migration process.', { error });
    }
  }

  /**
   * Log migration results to console and chat.
   * @param {object} results - Object containing all migration results keyed by migration key
   * @returns {Promise<void>}
   * @static
   */
  static async logMigrationResults(results) {
    log(3, 'Logging migration results.');
    const totalUpdated = Object.values(results).reduce((sum, r) => sum + (r.updated || 0), 0);
    if (totalUpdated === 0) {
      log(3, 'No updates to log.');
      return;
    }
    console.group('Spell Book Migration Results');
    for (const migration of MIGRATIONS) {
      const result = results[migration.key];
      if (result && result.updated > 0) {
        console.group(migration.name);
        console.log(`Processed: ${result.processed || 0}`);
        console.log(`Updated: ${result.updated || 0}`);
        if (result.errors && result.errors.length > 0) console.warn('Errors:', result.errors);
        console.groupEnd();
      }
    }
    console.groupEnd();

    const suppressWarnings = game.settings.get(MODULE.ID, SETTINGS.SUPPRESS_MIGRATION_WARNINGS);
    if (suppressWarnings) {
      log(3, 'Migration warnings suppressed by user setting.');
      return;
    }
    log(3, 'Creating migration report chat message.');
    const content = await this.buildChatContent(results);
    ChatMessage.create({ content: content, whisper: [game.user.id], user: game.user.id, flags: { 'spell-book': { messageType: 'migration-report' } } });
  }

  /**
   * Build chat message content for migration results.
   * @param {object} results - Object containing all migration results
   * @returns {Promise<string>} Rendered HTML content
   * @static
   */
  static async buildChatContent(results) {
    log(3, 'Building migration chat content.');
    const folderResults = results.spellListFolders || { processed: 0 };
    const ownershipResults = results.ownershipValidation || { processed: 0 };
    const packSortingResults = results.packSorting || { processed: 0 };
    const customSpellListResults = results.customSpellListFormat || { processed: 0 };
    const totalProcessed = Object.values(results).reduce((sum, r) => sum + (r.processed || 0), 0);
    log(3, 'Migration chat content prepared.', { totalProcessed });
    return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_REPORT, { folderResults, ownershipResults, packSortingResults, customSpellListResults, totalProcessed });
  }

  /**
   * Force run all migrations for testing purposes.
   * @returns {Promise<void>}
   * @static
   */
  static async forceMigration() {
    log(2, 'Force running migrations.');
    await this.runAllMigrations();
  }
}
