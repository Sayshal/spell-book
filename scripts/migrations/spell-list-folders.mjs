/**
 * Spell List Folders Migration
 *
 * Migrates spell list journals to appropriate folders based on their type.
 * This migration organizes spell lists into Custom, Merged, and Modified folders
 * within the spell lists compendium pack.
 *
 * @module Migrations/SpellListFolders
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Migrate spell list journals to appropriate folders.
 * @returns {Promise<Object>} Migration results
 * @property {number} processed - Number of journals migrated
 * @property {Array<string>} errors - Array of error messages
 * @property {number} customMoved - Number of custom spell lists moved
 * @property {number} mergedMoved - Number of merged spell lists moved
 * @property {number} modifiedMoved - Number of modified spell lists moved
 * @property {Array<string>} foldersCreated - Array of folder names created
 * @property {Array<Object>} migratedJournals - Array of migrated journal information
 */
async function migrateSpellListFolders() {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return { processed: 0, updated: 0, errors: [], customMoved: 0, mergedMoved: 0, modifiedMoved: 0, foldersCreated: [], migratedJournals: [] };
  const results = { processed: 0, updated: 0, errors: [], customMoved: 0, mergedMoved: 0, modifiedMoved: 0, foldersCreated: [], migratedJournals: [] };
  try {
    const allJournals = await customPack.getDocuments();
    const topLevelJournals = allJournals.filter((journal) => !journal.folder);
    results.processed = topLevelJournals.length;
    if (topLevelJournals.length === 0) return results;
    const customFolder = await DataUtils.getOrCreateCustomFolder();
    const mergedFolder = await DataUtils.getOrCreateMergedFolder();
    const modifiedFolder = await DataUtils.getOrCreateModifiedFolder();
    if (customFolder) results.foldersCreated.push('custom');
    if (mergedFolder) results.foldersCreated.push('merged');
    if (modifiedFolder) results.foldersCreated.push('modified');
    for (const journal of topLevelJournals) {
      try {
        const migrationResult = await migrateJournalToFolder(journal, customFolder, mergedFolder, modifiedFolder);
        if (migrationResult.success) {
          results.updated++;
          results.migratedJournals.push({ name: journal.name, id: journal.id, type: migrationResult.type, targetFolder: migrationResult.targetFolder });
          if (migrationResult.type === 'custom') results.customMoved++;
          if (migrationResult.type === 'merged') results.mergedMoved++;
          if (migrationResult.type === 'modified') results.modifiedMoved++;
        } else if (migrationResult.error) {
          results.errors.push(migrationResult.error);
        }
      } catch (error) {
        log(1, `Error migrating journal ${journal.name}:`, error);
        results.errors.push(`${journal.name}: ${error.message}`);
      }
    }
  } catch (error) {
    log(1, 'Error during spell list folder migration:', error);
    results.errors.push(`Migration error: ${error.message}`);
  }
  return results;
}

/**
 * Migrate a journal to its appropriate folder based on flags.
 * @param {JournalEntry} journal - Journal to migrate
 * @param {Folder} customFolder - Custom spell lists folder
 * @param {Folder} mergedFolder - Merged spell lists folder
 * @param {Folder} modifiedFolder - Modified spell lists folder
 * @returns {Promise<Object>} Migration result with success status and type
 */
async function migrateJournalToFolder(journal, customFolder, mergedFolder, modifiedFolder) {
  if (!journal || journal.pages.size === 0) return { success: false };
  const page = journal.pages.contents[0];
  if (page.type !== 'spells') return { success: false };
  const flags = page.flags?.[MODULE.ID] || {};
  const isMerged = !!flags.isMerged;
  const isCustom = !!flags.isCustom || !!flags.isNewList;
  const isDuplicate = !!flags.isDuplicate;
  let targetFolder = null;
  let moveType = null;
  if (isMerged && mergedFolder) {
    targetFolder = mergedFolder;
    moveType = 'merged';
  } else if (isCustom && customFolder) {
    targetFolder = customFolder;
    moveType = 'custom';
  } else if (isDuplicate && modifiedFolder) {
    targetFolder = modifiedFolder;
    moveType = 'modified';
  }
  if (!targetFolder) {
    log(2, `Unknown spell list type for "${journal.name}", skipping migration`);
    return { success: false };
  }
  const newName = journal.name.replace(/^(Custom|Merged|Modified)\s*-\s*/, '');
  const updateData = { folder: targetFolder.id };
  if (newName !== journal.name) updateData.name = newName;
  await journal.update(updateData);
  if (newName !== page.name) await page.update({ name: newName });
  log(3, `Migrated ${moveType} journal "${journal.name}" to folder "${targetFolder.name}"`);
  return { success: true, type: moveType, targetFolder: targetFolder.name };
}

export const spellListFolders = {
  key: 'spellListFolders',
  version: '1.0.0',
  name: 'Spell List Folders',
  description: 'Migrate spell list journals to appropriate folders',
  migrate: migrateSpellListFolders
};
