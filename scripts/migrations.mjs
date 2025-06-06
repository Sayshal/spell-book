import { FLAGS, MODULE, SETTINGS } from './constants.mjs';
import * as managerHelpers from './helpers/compendium-management.mjs';
import { log } from './logger.mjs';

/**
 * Register migration setting and hook
 */
export function registerMigration() {
  game.settings.register(MODULE.ID, SETTINGS.RUN_MIGRATIONS, {
    name: 'SPELLBOOK.Settings.Migration.Name',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true
  });
  Hooks.once('ready', checkAndRunMigration);
}

/**
 * Check if migration is needed and run if necessary
 */
async function checkAndRunMigration() {
  if (game.user.isGM && game.settings.get(MODULE.ID, SETTINGS.RUN_MIGRATIONS)) {
    log(2, 'Running data migration...');
    ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.StartNotification'));
    await runMigration();
    await game.settings.set(MODULE.ID, SETTINGS.RUN_MIGRATIONS, false);
    ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.CompleteNotification'));
  }
}

/**
 * Run the migration process
 */
async function runMigration() {
  const validFlags = Object.values(FLAGS);
  const migrationResults = { actors: [], processed: 0, cantripMigrations: 0, invalidFlagRemovals: 0 };
  log(3, 'Migrating world actors');
  for (const actor of game.actors) {
    const result = await migrateDocument(actor, validFlags);
    if (result.wasUpdated) {
      migrationResults.actors.push({ name: actor.name, id: actor.id, hadCantripMigration: result.cantripMigration, hadInvalidFlags: result.invalidFlags });
      migrationResults.processed++;
      if (result.cantripMigration) migrationResults.cantripMigrations++;
      if (result.invalidFlags) migrationResults.invalidFlagRemovals++;
    }
  }
  const modulePack = game.packs.get(MODULE.PACK.SPELLS);
  if (modulePack) {
    log(3, `Migrating module compendium: ${modulePack.metadata.label}`);
    const documents = await modulePack.getDocuments();
    for (const doc of documents) {
      const result = await migrateDocument(doc, validFlags);
      if (result.wasUpdated) {
        migrationResults.actors.push({
          name: doc.name,
          id: doc.id,
          pack: modulePack.collection,
          hadCantripMigration: result.cantripMigration,
          hadInvalidFlags: result.invalidFlags
        });
        migrationResults.processed++;
        if (result.cantripMigration) migrationResults.cantripMigrations++;
        if (result.invalidFlags) migrationResults.invalidFlagRemovals++;
      }
    }
  }
  log(3, 'Running spell list folder migration');
  const folderResults = await migrateSpellListFolders();
  logMigrationResults(migrationResults, folderResults);
}

/**
 * Migrate a single document
 * @param {Document} doc - The document to migrate
 * @param {Array} validFlags - Array of valid flag names
 * @returns {Object} Migration result with wasUpdated, cantripMigration, and invalidFlags flags
 */
async function migrateDocument(doc, validFlags) {
  const flags = doc.flags?.[MODULE.ID];
  if (!flags) return { wasUpdated: false, cantripMigration: false, invalidFlags: false };
  let wasUpdated = false;
  let cantripMigration = false;
  let invalidFlags = false;
  const updates = {};
  for (const [key, value] of Object.entries(flags)) {
    if (!validFlags.includes(key) || value === null || value === undefined || (typeof value === 'object' && Object.keys(value).length === 0)) {
      updates[`flags.${MODULE.ID}.-=${key}`] = null;
      invalidFlags = true;
      wasUpdated = true;
      log(3, `Removing invalid flag "${key}" from ${doc.documentName} "${doc.name}"`);
    }
  }
  if (wasUpdated) {
    await doc.update(updates);
    log(3, `Updated ${doc.documentName} "${doc.name}"`);
  }
  return { wasUpdated, cantripMigration, invalidFlags };
}

/**
 * Log migration results to chat
 */
function logMigrationResults(results, folderResults = null) {
  const actorCount = results.actors.length;
  let totalProcessed = results.processed + (folderResults?.processed || 0);
  if (totalProcessed === 0) {
    log(2, game.i18n.localize('SPELLBOOK.Migrations.NoUpdatesNeeded'));
    return;
  }
  let content = `
  <h2>${game.i18n.localize('SPELLBOOK.Migrations.ChatTitle')}</h2>
  <p>${game.i18n.localize('SPELLBOOK.Migrations.ChatDescription')}</p>
  <p>${game.i18n.format('SPELLBOOK.Migrations.TotalUpdated', { count: totalProcessed })}</p>`;
  if (results.cantripMigrations > 0) {
    content += `<p><strong>${game.i18n.localize('SPELLBOOK.Migrations.CantripRulesMigration')}:</strong> ${game.i18n.format('SPELLBOOK.Migrations.CantripRulesMigrationCount', { count: results.cantripMigrations })}</p>`;
  }
  if (results.invalidFlagRemovals > 0) {
    content += `<p><strong>${game.i18n.localize('SPELLBOOK.Migrations.InvalidFlagsRemoved')}:</strong> ${game.i18n.format('SPELLBOOK.Migrations.InvalidFlagsRemovedCount', { count: results.invalidFlagRemovals })}</p>`;
  }
  if (folderResults && folderResults.processed > 0) {
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
        .map((folder) => {
          if (folder === 'custom') return game.i18n.localize('SPELLMANAGER.Folders.CustomSpellListsFolder');
          if (folder === 'merged') return game.i18n.localize('SPELLMANAGER.Folders.MergedSpellListsFolder');
          return folder;
        })
        .join(', ');
      content += `<p><strong>${game.i18n.localize('SPELLBOOK.Migrations.FoldersCreated')}:</strong> ${folderNames}</p>`;
    }
    if (folderResults.errors.length > 0) {
      content += `<p><strong>${game.i18n.localize('SPELLBOOK.Migrations.MigrationErrors')}:</strong> ${game.i18n.format('SPELLBOOK.Migrations.MigrationErrorsCount', { count: folderResults.errors.length })}</p>`;
    }
  }
  if (actorCount > 0) {
    content += `<h3>${game.i18n.format('SPELLBOOK.Migrations.UpdatedActors', { count: actorCount })}</h3><ul>`;
    results.actors.slice(0, 10).forEach((actor) => {
      let actorLine = actor.name;
      let details = [];
      if (actor.hadCantripMigration) details.push(game.i18n.localize('SPELLBOOK.Migrations.CantripRulesDetail'));
      if (actor.hadInvalidFlags) details.push(game.i18n.localize('SPELLBOOK.Migrations.InvalidFlagsDetail'));
      if (details.length > 0) actorLine += ` (${details.join(', ')})`;
      if (actor.pack) actorLine += ` - ${game.i18n.format('SPELLBOOK.Migrations.Compendium', { name: actor.pack })}`;
      content += `<li>${actorLine}</li>`;
    });
    if (actorCount > 10) content += `<li>${game.i18n.format('SPELLBOOK.Migrations.AndMore', { count: actorCount - 10 })}</li>`;
    content += `</ul>`;
  }
  content += `<p>${game.i18n.localize('SPELLBOOK.Migrations.Apology')}</p>`;
  ChatMessage.create({ content: content, whisper: [game.user.id], user: game.user.id });
  log(2, game.i18n.format('SPELLBOOK.Migrations.LogComplete', { count: totalProcessed }));
}

/**
 * Force run migration for testing - remove this after testing
 * Call this from the browser console: game.modules.get('spell-book').api.forceMigration()
 */
export async function forceMigration() {
  log(2, 'Force running migration for testing...');
  await runMigration();
  log(2, 'Migration test complete.');
}

/**
 * Run spell list folder migration
 * @returns {Promise<Object>} Migration results
 */
async function migrateSpellListFolders() {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return { processed: 0, errors: [] };
  const results = { processed: 0, errors: [], customMoved: 0, mergedMoved: 0, foldersCreated: [] };
  try {
    const topLevelJournals = customPack.index.filter((entry) => !entry.folder);
    if (topLevelJournals.length === 0) return results;
    log(2, `Found ${topLevelJournals.length} top-level journals to migrate`);
    const customFolder = await managerHelpers.getOrCreateCustomFolder();
    const mergedFolder = await managerHelpers.getOrCreateMergedFolder();
    if (customFolder && !results.foldersCreated.includes('custom')) results.foldersCreated.push('custom');
    if (mergedFolder && !results.foldersCreated.includes('merged')) results.foldersCreated.push('merged');
    for (const journalIndex of topLevelJournals) {
      try {
        const journal = await customPack.getDocument(journalIndex._id);
        if (!journal || journal.pages.size === 0) continue;
        const page = journal.pages.contents[0];
        if (page.type !== 'spells') continue;
        const flags = page.flags?.[MODULE.ID] || {};
        const isMerged = !!flags.isMerged;
        const isCustom = !!flags.isCustom || !!flags.isNewList;
        let targetFolder = null;
        let newName = journal.name;
        let moveType = 'unknown';
        if (isMerged && mergedFolder) {
          targetFolder = mergedFolder;
          moveType = 'merged';
          newName = newName.replace(/^(Custom|Merged)\s*-\s*/, '');
          results.mergedMoved++;
        } else if (isCustom && customFolder) {
          targetFolder = customFolder;
          moveType = 'custom';
          newName = newName.replace(/^Custom\s*-\s*/, '');
          results.customMoved++;
        }
        if (targetFolder) {
          const updateData = { folder: targetFolder.id };
          if (newName !== journal.name) updateData.name = newName;
          await journal.update(updateData);
          results.processed++;
          log(3, `Migrated ${moveType} journal "${journal.name}" to folder "${targetFolder.name}"`);
        } else {
          log(2, `Could not determine folder for journal "${journal.name}"`);
          results.errors.push(`Unknown type: ${journal.name}`);
        }
      } catch (error) {
        log(1, `Error migrating journal ${journalIndex.name}:`, error);
        results.errors.push(`${journalIndex.name}: ${error.message}`);
      }
    }
  } catch (error) {
    log(1, 'Error during spell list folder migration:', error);
    results.errors.push(`Migration error: ${error.message}`);
  }
  return results;
}
