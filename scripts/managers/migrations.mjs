/**
 * Migration Management and Execution
 *
 * Manages data migration and maintenance tasks for the Spell Book module.
 * This module provides automated migration functionality that runs on world
 * startup to ensure data integrity, update deprecated configurations, and
 * maintain proper ownership and organization of module data.
 *
 * Key features:
 * - Automatic migration initialization and version management
 * - Modular migration system with individual migration modules
 * - Version tracking to prevent redundant migrations
 * - Migration result logging and reporting
 * - Chat message reporting for migration results
 *
 * The manager operates on migration configurations defined in the migrations module,
 * ensuring all required migrations are executed in sequence and results are properly
 * logged and reported to the user.
 *
 * @module Managers/Migrations
 * @author Tyler
 */

import { MODULE, TEMPLATES, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as m from '../migrations/_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/** @type {MigrationConfiguration[]} Array of all module migration configurations */
const MIGRATIONS = Object.values(m);

/**
 * Migration configuration object defining migration properties and metadata.
 *
 * @typedef {Object} MigrationConfiguration
 * @property {string} key - Unique key identifier for the migration
 * @property {string} version - Version string for tracking
 * @property {string} name - Display name of the migration
 * @property {string} description - Description of what the migration does
 * @property {Function} migrate - Migration function that returns results
 */

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

    try {
      const results = {};
      let totalUpdated = 0;
      for (const migration of MIGRATIONS) {
        try {
          const result = await migration.migrate();
          results[migration.key] = result;
          totalUpdated += result.updated || 0;
        } catch (error) {
          results[migration.key] = { processed: 0, errors: [error.message] };
        }
      }
      const resultSummary = MIGRATIONS.map((m) => {
        const result = results[m.key] || {};
        return `${m.key}={processed: ${result.processed || 0}, updated: ${result.updated || 0}}`;
      }).join(', ');

      if (totalUpdated > 0) await this.logMigrationResults(results);
      else log(3, 'No migrations needed');
    } catch (error) {}
  }

  /**
   * Log migration results to console and chat.
   * @param {Object} results - Object containing all migration results keyed by migration key
   * @returns {Promise<void>}
   * @static
   */
  static async logMigrationResults(results) {
    const totalUpdated = Object.values(results).reduce((sum, r) => sum + (r.updated || 0), 0);
    if (totalUpdated === 0) {
      return;
    }
    console.group('Spell Book Migration Results');
    for (const migration of MIGRATIONS) {
      const result = results[migration.key];
      if (result && result.updated > 0) {
        console.group(migration.name);
        console.console.groupEnd();
      }
    }
    console.groupEnd();

    const suppressWarnings = game.settings.get(MODULE.ID, SETTINGS.SUPPRESS_MIGRATION_WARNINGS);
    if (suppressWarnings) return;
    const content = await this.buildChatContent(results);
    ChatMessage.create({ content: content, whisper: [game.user.id], user: game.user.id, flags: { 'spell-book': { messageType: 'migration-report' } } });
  }

  /**
   * Build chat message content for migration results.
   * @param {Object} results - Object containing all migration results
   * @returns {Promise<string>} Rendered HTML content
   * @static
   */
  static async buildChatContent(results) {
    const folderResults = results.spellListFolders || { processed: 0 };
    const ownershipResults = results.ownershipValidation || { processed: 0 };
    const packSortingResults = results.packSorting || { processed: 0 };
    const customSpellListResults = results.customSpellListFormat || { processed: 0 };
    const totalProcessed = Object.values(results).reduce((sum, r) => sum + (r.processed || 0), 0);
    return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_REPORT, { folderResults, ownershipResults, packSortingResults, customSpellListResults, totalProcessed });
  }

  /**
   * Force run all migrations for testing purposes.
   * @returns {Promise<void>}
   * @static
   */
  static async forceMigration() {
    await this.runAllMigrations();
  }
}
