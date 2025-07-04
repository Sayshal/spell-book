// scripts/migrations.mjs
import { DEPRECATED_FLAGS, MODULE } from './constants.mjs';
import * as managerHelpers from './helpers/compendium-management.mjs';
import { log } from './logger.mjs';

/**
 * Register migration hook to run all migrations every time
 */
export function registerMigration() {
  Hooks.once('ready', runAllMigrations);
}

/**
 * Run all migration processes every time
 */
async function runAllMigrations() {
  if (!game.user.isGM) return;

  log(2, 'Running all migrations...');

  // Run all migration types
  const deprecatedFlagResults = await migrateDeprecatedFlags();
  const folderResults = await migrateSpellListFolders();

  // Calculate totals
  const totalProcessed = deprecatedFlagResults.processed + folderResults.processed;

  if (totalProcessed > 0) {
    ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.StartNotification'));
    logMigrationResults(deprecatedFlagResults, folderResults);
    ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.CompleteNotification'));
  } else {
    log(3, 'No migrations needed');
  }
}

/**
 * Migrate deprecated flags from actors and compendiums
 */
async function migrateDeprecatedFlags() {
  const results = { processed: 0, invalidFlagRemovals: 0, actors: [] };

  log(3, 'Migrating world actors and compendium for deprecated flags');

  // Migrate world actors
  await migrateCollection(game.actors, results);

  // Migrate module compendium
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
    const isInvalid = value === null || value === undefined || (typeof value === 'object' && Object.keys(value).length === 0);
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

function buildChatContent(deprecatedResults, folderResults, userDataResults, totalProcessed) {
  let content = `
    <h2>${game.i18n.localize('SPELLBOOK.Migrations.ChatTitle')}</h2>
    <p>${game.i18n.localize('SPELLBOOK.Migrations.ChatDescription')}</p>
    <p>${game.i18n.format('SPELLBOOK.Migrations.TotalUpdated', { count: totalProcessed })}</p>`;

  // Deprecated flags results
  if (deprecatedResults.invalidFlagRemovals > 0) {
    content += `<p><strong>${game.i18n.localize('SPELLBOOK.Migrations.InvalidFlagsRemoved')}:</strong> ${game.i18n.format('SPELLBOOK.Migrations.InvalidFlagsRemovedCount', { count: deprecatedResults.invalidFlagRemovals })}</p>`;
  }

  // Folder migration results
  if (folderResults && folderResults.processed > 0) {
    content += buildFolderMigrationContent(folderResults);
  }

  // User data migration results
  if (userDataResults && userDataResults.processed > 0) {
    content += buildUserDataMigrationContent(userDataResults);
  }

  // Actor list
  if (deprecatedResults.actors.length > 0) {
    content += buildActorListContent(deprecatedResults.actors);
  }

  content += `<p>${game.i18n.localize('SPELLBOOK.Migrations.Apology')}</p>`;
  return content;
}

function buildUserDataMigrationContent(userDataResults) {
  let content = `<p><strong>User Spell Data Migration:</strong> Updated data for ${userDataResults.processed} users</p>`;

  if (userDataResults.users.length > 0) {
    content += '<ul>';
    for (const user of userDataResults.users.slice(0, 5)) {
      // Show max 5 users
      content += `<li>${user.name}`;
      if (user.cleaned > 0) {
        content += ` (${user.cleaned} entries cleaned)`;
      }
      if (user.errors.length > 0) {
        content += ` (${user.errors.length} errors)`;
      }
      content += '</li>';
    }
    if (userDataResults.users.length > 5) {
      content += `<li>... and ${userDataResults.users.length - 5} more users</li>`;
    }
    content += '</ul>';
  }

  return content;
}

function buildFolderMigrationContent(folderResults) {
  let content = '';
  let folderMigrationText = game.i18n.format('SPELLBOOK.Migrations.SpellListFolderMigrationCount', { count: folderResults.processed });
  if (folderResults.customMoved > 0 && folderResults.mergedMoved > 0) {
    folderMigrationText += ` ${game.i18n.format('SPELLBOOK.Migrations.FolderMigrationBothTypes', {
      customCount: folderResults.customMoved,
      mergedCount: folderResults.mergedMoved
    })}`;
  } else if (folderResults.customMoved > 0) {
    folderMigrationText += ` ${game.i18n.format('SPELLBOOK.Migrations.FolderMigrationCustomOnly', {
      customCount: folderResults.customMoved
    })}`;
  } else if (folderResults.mergedMoved > 0) {
    folderMigrationText += ` ${game.i18n.format('SPELLBOOK.Migrations.FolderMigrationMergedOnly', {
      mergedCount: folderResults.mergedMoved
    })}`;
  }
  content += `<p><strong>${game.i18n.localize('SPELLBOOK.Migrations.SpellListFolderMigration')}:</strong> ${folderMigrationText}</p>`;
  if (folderResults.foldersCreated.length > 0) {
    const folderNames = folderResults.foldersCreated
      .map((folder) => (folder === 'custom' ? game.i18n.localize('SPELLMANAGER.Folders.CustomSpellListsFolder') : game.i18n.localize('SPELLMANAGER.Folders.MergedSpellListsFolder')))
      .join(', ');
    content += `<p><strong>${game.i18n.localize('SPELLBOOK.Migrations.FoldersCreated')}:</strong> ${folderNames}</p>`;
  }
  if (folderResults.errors.length > 0) {
    content += `<p><strong>${game.i18n.localize('SPELLBOOK.Migrations.MigrationErrors')}:</strong> ${game.i18n.format('SPELLBOOK.Migrations.MigrationErrorsCount', { count: folderResults.errors.length })}</p>`;
  }
  return content;
}

function buildActorListContent(actors) {
  let content = `<h3>${game.i18n.format('SPELLBOOK.Migrations.UpdatedActors', { count: actors.length })}</h3><ul>`;
  actors.slice(0, 10).forEach((actor) => {
    let actorLine = actor.name;
    if (actor.hadInvalidFlags) actorLine += ` (${game.i18n.localize('SPELLBOOK.Migrations.InvalidFlagsDetail')})`;
    if (actor.pack) actorLine += ` - ${game.i18n.format('SPELLBOOK.Migrations.Compendium', { name: actor.pack })}`;
    content += `<li>${actorLine}</li>`;
  });
  if (actors.length > 10) content += `<li>${game.i18n.format('SPELLBOOK.Migrations.AndMore', { count: actors.length - 10 })}</li>`;
  content += `</ul>`;
  return content;
}

/**
 * Force run migration for testing
 */
export async function forceMigration() {
  log(2, 'Force running migration for testing...');
  await runAllMigrations();
  log(2, 'Migration test complete.');
}
