import { DEPRECATED_FLAGS, MODULE, TEMPLATES } from './constants.mjs';
import * as managerHelpers from './helpers/compendium-management.mjs';
import { log } from './logger.mjs';

Hooks.on('ready', runAllMigrations);

async function runAllMigrations() {
  if (!game.user.isGM) {
    log(3, 'User is not active GM, skipping migrations');
    return;
  }
  log(2, 'Running all migrations...');
  try {
    const deprecatedFlagResults = await migrateDeprecatedFlags();
    const folderResults = await migrateSpellListFolders();
    const ownershipResults = await validateOwnershipLevels();
    const totalProcessed = deprecatedFlagResults.processed + folderResults.processed + ownershipResults.processed;
    log(2, `Migration results: deprecated=${deprecatedFlagResults.processed}, folders=${folderResults.processed}, ownership=${ownershipResults.processed}`);
    if (totalProcessed > 0) {
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.StartNotification'));
      await logMigrationResults(deprecatedFlagResults, folderResults, ownershipResults); // FIX: Add await and ownership
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.CompleteNotification'));
    } else {
      log(3, 'No migrations needed');
    }
  } catch (error) {
    log(1, 'Error during migrations:', error);
    ui.notifications.error(`Migration error: ${error.message}`);
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

async function validateOwnershipLevels() {
  const results = {
    processed: 0,
    errors: [],
    userDataFixed: 0,
    spellListsFixed: 0,
    foldersFixed: 0,
    details: []
  };

  log(3, 'Validating ownership levels for spell book documents...');

  try {
    // Fix user data documents
    const userDataResults = await validateUserDataOwnership();
    results.userDataFixed = userDataResults.fixed;
    results.processed += userDataResults.fixed;
    results.errors.push(...userDataResults.errors);
    results.details.push(...userDataResults.details);

    // Fix spell list documents
    const spellListResults = await validateSpellListOwnership();
    results.spellListsFixed = spellListResults.fixed;
    results.processed += spellListResults.fixed;
    results.errors.push(...spellListResults.errors);
    results.details.push(...spellListResults.details);

    // Fix folder ownership
    const folderResults = await validateFolderOwnership();
    results.foldersFixed = folderResults.fixed;
    results.processed += folderResults.fixed;
    results.errors.push(...folderResults.errors);
    results.details.push(...folderResults.details);

    log(3, `Ownership validation complete: ${results.processed} documents fixed`);
  } catch (error) {
    log(1, 'Error during ownership validation:', error);
    results.errors.push(`Ownership validation error: ${error.message}`);
  }

  return results;
}

async function validateUserDataOwnership() {
  const results = { fixed: 0, errors: [], details: [] };

  const pack = game.packs.get(MODULE.PACK.USERDATA);
  if (!pack) {
    results.errors.push('User data pack not found');
    return results;
  }

  try {
    const documents = await pack.getDocuments();
    const userDataJournal = documents.find((doc) => doc.name === 'User Spell Data' && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);

    if (userDataJournal) {
      // Validate journal ownership
      const correctJournalOwnership = { default: 0, [game.user.id]: 3 };
      if (!isOwnershipEqual(userDataJournal.ownership, correctJournalOwnership)) {
        await userDataJournal.update({ ownership: correctJournalOwnership });
        results.fixed++;
        results.details.push(`Fixed user data journal ownership`);
        log(3, `Fixed ownership for user data journal`);
      }

      // Validate user page ownership
      for (const page of userDataJournal.pages) {
        const userId = page.flags?.[MODULE.ID]?.userId;
        if (userId && page.flags?.[MODULE.ID]?.isUserSpellData) {
          const user = game.users.get(userId);
          if (!user) continue; // Skip if user no longer exists

          const correctPageOwnership = {
            default: 0,
            [userId]: 3,
            [game.user.id]: 3
          };

          if (!isOwnershipEqual(page.ownership, correctPageOwnership)) {
            await page.update({ ownership: correctPageOwnership });
            results.fixed++;
            results.details.push(`Fixed user page ownership for ${user.name}`);
            log(3, `Fixed ownership for user page: ${user.name}`);
          }
        }
      }
    }
  } catch (error) {
    log(1, 'Error validating user data ownership:', error);
    results.errors.push(`User data ownership error: ${error.message}`);
  }

  return results;
}

async function validateSpellListOwnership() {
  const results = { fixed: 0, errors: [], details: [] };

  const pack = game.packs.get(MODULE.PACK.SPELLS);
  if (!pack) {
    results.errors.push('Spell lists pack not found');
    return results;
  }

  try {
    const documents = await pack.getDocuments();

    for (const journal of documents) {
      // Skip non-spell list journals
      if (journal.pages.size === 0) continue;
      const page = journal.pages.contents[0];
      if (page.type !== 'spells') continue;

      const flags = page.flags?.[MODULE.ID] || {};
      const isSpellList = flags.isMerged || flags.isCustom || flags.isNewList;

      if (isSpellList) {
        // Custom/merged spell lists should be GM-owned with player observer access
        const correctOwnership = {
          default: 1, // Observer for all players
          [game.user.id]: 3 // Owner for GM
        };

        if (!isOwnershipEqual(journal.ownership, correctOwnership)) {
          await journal.update({ ownership: correctOwnership });
          results.fixed++;
          results.details.push(`Fixed spell list ownership: ${journal.name}`);
          log(3, `Fixed ownership for spell list: ${journal.name}`);
        }
      }
    }
  } catch (error) {
    log(1, 'Error validating spell list ownership:', error);
    results.errors.push(`Spell list ownership error: ${error.message}`);
  }

  return results;
}

async function validateFolderOwnership() {
  const results = { fixed: 0, errors: [], details: [] };

  const userDataPack = game.packs.get(MODULE.PACK.USERDATA);
  const spellsPack = game.packs.get(MODULE.PACK.SPELLS);

  const packs = [userDataPack, spellsPack].filter(Boolean);

  for (const pack of packs) {
    try {
      for (const folder of pack.folders) {
        // Folders should be GM-owned with player observer access
        const correctOwnership = {
          default: 1, // Observer for all players
          [game.user.id]: 3 // Owner for GM
        };

        if (!isOwnershipEqual(folder.ownership, correctOwnership)) {
          await folder.update({ ownership: correctOwnership });
          results.fixed++;
          results.details.push(`Fixed folder ownership: ${folder.name}`);
          log(3, `Fixed ownership for folder: ${folder.name} in ${pack.metadata.label}`);
        }
      }
    } catch (error) {
      log(1, `Error validating folder ownership in ${pack.metadata.label}:`, error);
      results.errors.push(`Folder ownership error in ${pack.metadata.label}: ${error.message}`);
    }
  }

  return results;
}

function isOwnershipEqual(ownership1, ownership2) {
  if (!ownership1 || !ownership2) return false;

  // Get all unique keys from both objects
  const allKeys = new Set([...Object.keys(ownership1), ...Object.keys(ownership2)]);

  for (const key of allKeys) {
    if (ownership1[key] !== ownership2[key]) {
      return false;
    }
  }

  return true;
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

async function logMigrationResults(deprecatedResults, folderResults, ownershipResults) {
  const totalProcessed = deprecatedResults.processed + folderResults.processed + ownershipResults.processed;
  if (totalProcessed === 0) {
    log(2, 'No migration updates needed');
    return;
  }
  const content = await buildChatContent(deprecatedResults, folderResults, ownershipResults, totalProcessed);
  ChatMessage.create({ content: content, whisper: [game.user.id], user: game.user.id });
  log(2, `Migration complete: ${totalProcessed} documents updated`);
}

async function buildChatContent(deprecatedResults, folderResults, ownershipResults, totalProcessed) {
  return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_REPORT, {
    deprecatedResults,
    folderResults,
    ownershipResults,
    totalProcessed
  });
}

async function buildUserDataMigrationContent(userDataResults) {
  const visibleUsers = userDataResults.users.slice(0, 5);
  const hasMoreUsers = userDataResults.users.length > 5;
  const remainingUserCount = Math.max(0, userDataResults.users.length - 5);
  const processedResults = { ...userDataResults, visibleUsers, hasMoreUsers, remainingUserCount };
  return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_USER_DATA, { userDataResults: processedResults });
}

async function buildFolderMigrationContent(folderResults) {
  const processedResults = { ...folderResults, foldersCreatedNames: folderResults.foldersCreated.length > 0 ? folderResults.foldersCreated.join(', ') : null };
  return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_FOLDER, { folderResults: processedResults });
}

async function buildActorListContent(actors) {
  const visibleActors = actors.slice(0, 10);
  const hasMoreActors = actors.length > 10;
  const remainingCount = Math.max(0, actors.length - 10);
  const context = { actors, visibleActors, hasMoreActors, remainingCount };
  return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_ACTORS, context);
}

export async function forceMigration() {
  log(2, 'Force running migration for testing...');
  await runAllMigrations();
  log(2, 'Migration test complete.');
}
