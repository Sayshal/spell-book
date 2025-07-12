// scripts/migrations.mjs
import { DEPRECATED_FLAGS, MODULE, TEMPLATES } from './constants.mjs';
import * as managerHelpers from './helpers/compendium-management.mjs';
import { log } from './logger.mjs';

/**
 * Register migration hook to run all migrations every time
 */
export function registerMigration() {
  Hooks.once('ready', runAllMigrations);
}

async function runAllMigrations() {
  if (!game.user.isActiveGM) return;
  log(2, 'Running all migrations...');
  const deprecatedFlagResults = await migrateDeprecatedFlags();
  const folderResults = await migrateSpellListFolders();
  const totalProcessed = deprecatedFlagResults.processed + folderResults.processed;
  if (totalProcessed > 0) {
    ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.StartNotification'));
    logMigrationResults(deprecatedFlagResults, folderResults);
    ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.CompleteNotification'));
  } else {
    log(3, 'No migrations needed');
  }
}

async function migrateDeprecatedFlags() {
  const results = { processed: 0, invalidFlagRemovals: 0, actors: [] };
  log(3, 'Migrating world actors and compendium for deprecated flags');
  await migrateCollection(game.actors, results);
  const modulePack = game.packs.get(MODULE.PACK.SPELLS);
  if (modulePack) {
    const documents = await modulePack.getDocuments();
    await migrateCollection(documents, results, modulePack.collection);
  }
  return results;
}

async function checkFolderMigrationNeeded() {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return false;
  const allJournals = await customPack.getDocuments();
  const topLevelSpellJournals = allJournals.filter((journal) => {
    if (journal.folder || journal.pages.size === 0) return false;
    const page = journal.pages.contents[0];
    if (page.type !== 'spells') return false;
    const flags = page.flags?.[MODULE.ID] || {};
    if (flags.isDuplicate || flags.originalUuid) return false;
    return flags.isMerged || flags.isCustom || flags.isNewList;
  });
  const migrationNeeded = topLevelSpellJournals.length > 0;
  log(migrationNeeded ? 3 : 3, migrationNeeded ? `Folder migration needed: found ${topLevelSpellJournals.length} top-level spell journals` : 'No folder migration needed');
  return migrationNeeded;
}

async function migrateCollection(documents, results, packName = null) {
  for (const doc of documents) {
    const migrationResult = await migrateDocument(doc, DEPRECATED_FLAGS);
    if (migrationResult.wasUpdated) {
      results.actors.push({ name: doc.name, id: doc.id, pack: packName, hadInvalidFlags: migrationResult.invalidFlags });
      results.processed++;
      if (migrationResult.invalidFlags) results.invalidFlagRemovals++;
    }
  }
}

async function migrateDocument(doc, deprecatedFlags) {
  const flags = doc.flags?.[MODULE.ID];
  if (!flags) return { wasUpdated: false, invalidFlags: false };
  const updates = {};
  let hasRemovals = false;
  for (const [key, value] of Object.entries(flags)) {
    const isDeprecated = deprecatedFlags.some((deprecated) => deprecated.key === key);
    const isInvalid = value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
    if (isDeprecated || isInvalid) {
      updates[`flags.${MODULE.ID}.-=${key}`] = null;
      hasRemovals = true;
      const reason = isDeprecated ? deprecatedFlags.find((d) => d.key === key)?.reason : 'Invalid value (null/undefined/empty object)';
      log(3, `Removing flag "${key}" from ${doc.documentName} "${doc.name}": ${reason}`);
    }
  }
  if (hasRemovals) await doc.update(updates);
  return { wasUpdated: hasRemovals, invalidFlags: hasRemovals };
}

async function migrateSpellListFolders() {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return { processed: 0, errors: [], customMoved: 0, mergedMoved: 0, foldersCreated: [] };
  const results = { processed: 0, errors: [], customMoved: 0, mergedMoved: 0, foldersCreated: [] };
  try {
    const allJournals = await customPack.getDocuments();
    const topLevelJournals = allJournals.filter((journal) => !journal.folder);
    if (topLevelJournals.length === 0) return results;
    log(2, `Found ${topLevelJournals.length} top-level journals to migrate`);
    const customFolder = await managerHelpers.getOrCreateCustomFolder();
    const mergedFolder = await managerHelpers.getOrCreateMergedFolder();
    if (customFolder) results.foldersCreated.push('custom');
    if (mergedFolder) results.foldersCreated.push('merged');
    for (const journal of topLevelJournals) {
      try {
        const migrationResult = await migrateJournalToFolder(journal, customFolder, mergedFolder);
        if (migrationResult.success) {
          results.processed++;
          if (migrationResult.type === 'custom') results.customMoved++;
          if (migrationResult.type === 'merged') results.mergedMoved++;
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

async function migrateJournalToFolder(journal, customFolder, mergedFolder) {
  if (!journal || journal.pages.size === 0) return { success: false };
  const page = journal.pages.contents[0];
  if (page.type !== 'spells') return { success: false };
  const flags = page.flags?.[MODULE.ID] || {};
  const isMerged = !!flags.isMerged;
  const isCustom = !!flags.isCustom || !!flags.isNewList;
  let targetFolder = null;
  let moveType = null;
  if (isMerged && mergedFolder) {
    targetFolder = mergedFolder;
    moveType = 'merged';
  } else if (isCustom && customFolder) {
    targetFolder = customFolder;
    moveType = 'custom';
  }
  if (!targetFolder) return { success: false, error: `Unknown type: ${journal.name}` };
  const newName = journal.name.replace(/^(Custom|Merged)\s*-\s*/, '');
  const updateData = { folder: targetFolder.id };
  if (newName !== journal.name) updateData.name = newName;
  await journal.update(updateData);
  if (newName !== page.name) await page.update({ name: newName });
  log(3, `Migrated ${moveType} journal "${journal.name}" to folder "${targetFolder.name}"`);
  return { success: true, type: moveType };
}

function logMigrationResults(deprecatedResults, folderResults) {
  const totalProcessed = deprecatedResults.processed + folderResults.processed;
  if (totalProcessed === 0) {
    log(2, 'No migration updates needed');
    return;
  }
  let content = buildChatContent(deprecatedResults, folderResults, totalProcessed);
  ChatMessage.create({ content: content, whisper: [game.user.id], user: game.user.id });
  log(2, `Migration complete: ${totalProcessed} documents updated`);
}

async function buildChatContent(deprecatedResults, folderResults, userDataResults, totalProcessed) {
  const renderTemplate = MODULE.ISV13 ? foundry?.applications?.handlebars?.renderTemplate : globalThis.renderTemplate;
  return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_REPORT, {
    deprecatedResults,
    folderResults,
    userDataResults,
    totalProcessed
  });
}

function buildUserDataMigrationContent(userDataResults) {
  const renderTemplate = MODULE.ISV13 ? foundry?.applications?.handlebars?.renderTemplate : globalThis.renderTemplate;
  const visibleUsers = userDataResults.users.slice(0, 5);
  const hasMoreUsers = userDataResults.users.length > 5;
  const remainingUserCount = Math.max(0, userDataResults.users.length - 5);
  const processedResults = { ...userDataResults, visibleUsers, hasMoreUsers, remainingUserCount };
  return renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_USER_DATA, { userDataResults: processedResults });
}

function buildFolderMigrationContent(folderResults) {
  const renderTemplate = MODULE.ISV13 ? foundry?.applications?.handlebars?.renderTemplate : globalThis.renderTemplate;
  const processedResults = { ...folderResults, foldersCreatedNames: folderResults.foldersCreated.length > 0 ? folderResults.foldersCreated.join(', ') : null };
  return renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_FOLDER, { folderResults: processedResults });
}

function buildActorListContent(actors) {
  const renderTemplate = MODULE.ISV13 ? foundry?.applications?.handlebars?.renderTemplate : globalThis.renderTemplate;
  const visibleActors = actors.slice(0, 10);
  const hasMoreActors = actors.length > 10;
  const remainingCount = Math.max(0, actors.length - 10);
  const context = { actors, visibleActors, hasMoreActors, remainingCount };
  return renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_ACTORS, context);
}

export async function forceMigration() {
  log(2, 'Force running migration for testing...');
  await runAllMigrations();
  log(2, 'Migration test complete.');
}
