import { DEPRECATED_FLAGS, MODULE, TEMPLATES } from './constants.mjs';
import * as managerHelpers from './helpers/compendium-management.mjs';
import { log } from './logger.mjs';

Hooks.on('ready', runAllMigrations);

async function runAllMigrations() {
  if (!game.user.isGM) return;
  log(3, 'Running all migrations...');
  try {
    const deprecatedFlagResults = await migrateDeprecatedFlags();
    const folderResults = await migrateSpellListFolders();
    const ownershipResults = await validateOwnershipLevels();
    const totalProcessed = deprecatedFlagResults.processed + folderResults.processed + ownershipResults.processed;
    log(3, `Migration results: deprecated=${deprecatedFlagResults.processed}, folders=${folderResults.processed}, ownership=${ownershipResults.processed}`);
    if (totalProcessed > 0) {
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.StartNotification'));
      await logMigrationResults(deprecatedFlagResults, folderResults, ownershipResults);
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.CompleteNotification'));
    } else {
      log(3, 'No migrations needed');
    }
  } catch (error) {
    log(1, 'Error during migrations:', error);
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
  const results = { processed: 0, errors: [], userDataFixed: 0, spellListsFixed: 0, actorSpellbooksFixed: 0, packsFixed: 0, details: [] };
  log(3, 'Validating ownership levels for spell book documents...');
  try {
    const userDataResults = await validateUserDataOwnership();
    results.userDataFixed = userDataResults.fixed;
    results.processed += userDataResults.fixed;
    results.errors.push(...userDataResults.errors);
    results.details.push(...userDataResults.details);
    const spellListResults = await validateSpellListOwnership();
    results.spellListsFixed = spellListResults.fixed;
    results.processed += spellListResults.fixed;
    results.errors.push(...spellListResults.errors);
    results.details.push(...spellListResults.details);
    const actorSpellbookResults = await validateActorSpellbookOwnership();
    results.actorSpellbooksFixed = actorSpellbookResults.fixed;
    results.processed += actorSpellbookResults.fixed;
    results.errors.push(...actorSpellbookResults.errors);
    results.details.push(...actorSpellbookResults.details);
    const packResults = await validatePackOwnership();
    results.packsFixed = packResults.fixed;
    results.processed += packResults.fixed;
    results.errors.push(...packResults.errors);
    results.details.push(...packResults.details);
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
    const folderName = game.i18n.localize('SPELLBOOK.UserData.FolderName');
    const userDataJournal = documents.find((doc) => doc.name === folderName && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);
    if (userDataJournal) {
      const journalIdentifier = 'User Data Journal';
      const currentOwnership = userDataJournal.ownership || {};
      const correctJournalOwnership = { ...currentOwnership, default: 0, [game.user.id]: 3 };
      if (!isOwnershipEqual(userDataJournal.ownership, correctJournalOwnership, journalIdentifier)) {
        await userDataJournal.update({ ownership: correctJournalOwnership });
        results.fixed++;
        results.details.push(`Fixed user data journal`);
      }
      for (const page of userDataJournal.pages) {
        const userId = page.flags?.[MODULE.ID]?.userId;
        if (userId && page.flags?.[MODULE.ID]?.isUserSpellData) {
          const user = game.users.get(userId);
          if (!user) continue;
          const pageIdentifier = `User Page: ${user.name}`;
          const currentPageOwnership = page.ownership || {};
          const correctPageOwnership = { ...currentPageOwnership, default: 0, [userId]: 3, [game.user.id]: 3 };
          if (!isOwnershipEqual(page.ownership, correctPageOwnership, pageIdentifier)) {
            await page.update({ ownership: correctPageOwnership });
            results.fixed++;
            results.details.push(`Fixed user page: ${user.name}`);
          }
        }
      }
    } else {
      log(3, 'No user data journal found');
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
      if (journal.pages.size === 0) continue;
      const page = journal.pages.contents[0];
      if (page.type !== 'spells') continue;
      const flags = page.flags?.[MODULE.ID] || {};
      const isSpellList = flags.isMerged || flags.isCustom || flags.isNewList;
      if (isSpellList) {
        const journalIdentifier = `Spell List: ${journal.name}`;
        const currentOwnership = journal.ownership || {};
        const correctOwnership = { ...currentOwnership, default: 1, [game.user.id]: 3 };
        if (!isOwnershipEqual(journal.ownership, correctOwnership, journalIdentifier)) {
          await journal.update({ ownership: correctOwnership });
          results.fixed++;
          results.details.push(`Fixed spell list: ${journal.name}`);
        }
      }
    }
  } catch (error) {
    log(1, 'Error validating spell list ownership:', error);
    results.errors.push(`Spell list ownership error: ${error.message}`);
  }
  return results;
}

async function validateActorSpellbookOwnership() {
  const results = { fixed: 0, errors: [], details: [] };
  const pack = game.packs.get(MODULE.PACK.SPELLS);
  if (!pack) {
    results.errors.push('Spells pack not found');
    return results;
  }

  try {
    // Find the "Actor Spellbooks" folder using localization
    const actorSpellbooksFolderName = game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks');
    const actorSpellbooksFolder = pack.folders.find((f) => f.name === actorSpellbooksFolderName);

    if (!actorSpellbooksFolder) {
      return results;
    }

    // Get all documents in the pack and filter to Actor Spellbooks folder
    const documents = await pack.getDocuments();
    const folderDocuments = documents.filter((doc) => doc.folder?.id === actorSpellbooksFolder.id);

    for (const doc of folderDocuments) {
      // Check if it has pages property (journal entries)
      if (!doc.pages) continue;

      for (const page of doc.pages) {
        const flags = page.flags?.[MODULE.ID];

        // Check if this is an actor spellbook page
        if (!flags?.isActorSpellbook || !flags?.actorId) continue;

        const actorId = flags.actorId;
        const classIdentifier = flags.classIdentifier || 'unknown';

        // Find the actor
        const actor = game.actors.get(actorId);
        if (!actor) continue;

        // Find the actor's owners (users with ownership level 3)
        const actorOwnership = actor.ownership || {};
        const ownerUserIds = Object.keys(actorOwnership).filter((userId) => userId !== 'default' && actorOwnership[userId] === 3);

        if (ownerUserIds.length === 0) continue;

        // Build the correct ownership object
        const currentPageOwnership = page.ownership || {};
        const correctPageOwnership = {
          default: 0,
          [game.user.id]: 3 // GM always gets access
        };

        // Add all actor owners
        for (const ownerUserId of ownerUserIds) {
          correctPageOwnership[ownerUserId] = 3;
        }

        // Update if ownership doesn't match
        if (!isOwnershipEqual(currentPageOwnership, correctPageOwnership)) {
          try {
            await page.update({ ownership: correctPageOwnership });
            results.fixed++;
            const ownerNames = ownerUserIds.map((id) => game.users.get(id)?.name || id).join(', ');
            results.details.push(`Fixed actor spellbook: ${actor.name} (${classIdentifier}) for user(s) ${ownerNames}`);
          } catch (updateError) {
            results.errors.push(`Failed to fix ${page.name}: ${updateError.message}`);
          }
        }
      }
    }
  } catch (error) {
    results.errors.push(`Actor spellbook ownership error: ${error.message}`);
  }

  return results;
}

async function validatePackOwnership() {
  const results = { fixed: 0, errors: [], details: [] };
  const userDataPack = game.packs.get(MODULE.PACK.USERDATA);
  const spellsPack = game.packs.get(MODULE.PACK.SPELLS);
  const macrosPack = game.packs.get(MODULE.PACK.MACROS);
  const packConfigurations = [
    { pack: userDataPack, name: 'User Data', expectedOwnership: { PLAYER: 'OWNER', ASSISTANT: 'OWNER' } },
    { pack: spellsPack, name: 'Spells', expectedOwnership: { PLAYER: 'OWNER', ASSISTANT: 'OWNER' } },
    { pack: macrosPack, name: 'Macros', expectedOwnership: { PLAYER: 'NONE', ASSISTANT: 'OWNER' } }
  ];
  for (const config of packConfigurations) {
    if (!config.pack) continue;
    const pack = config.pack;
    try {
      const needsOwnershipUpdate = !isRoleOwnershipEqual(pack.ownership, config.expectedOwnership, `${config.name} Pack`);
      const needsVisibilityUpdate = !pack.visible || pack.getUserLevel(game.user) < 1;
      if (needsOwnershipUpdate || needsVisibilityUpdate) {
        const updateReasons = [];
        if (needsOwnershipUpdate) updateReasons.push('ownership');
        if (needsVisibilityUpdate) updateReasons.push('visibility');
        await pack.configure({ ownership: config.expectedOwnership, locked: false, visible: true });
        results.fixed++;
        results.details.push(`Fixed ${config.name} pack ${updateReasons.join(' and ')}`);
      } else {
        log(3, `${config.name} pack ownership and visibility are correct`);
      }
    } catch (error) {
      log(1, `Error validating ${config.name} pack ownership:`, error);
      results.errors.push(`${config.name} pack error: ${error.message}`);
    }
  }
  return results;
}

function isOwnershipEqual(ownership1, ownership2, documentName = 'unknown') {
  if (!ownership1 || !ownership2) return false;
  const allKeys = new Set([...Object.keys(ownership1), ...Object.keys(ownership2)]);
  for (const key of allKeys) {
    if (ownership1[key] !== ownership2[key]) return false;
  }
  return true;
}

function isRoleOwnershipEqual(ownership1, ownership2, documentName = 'unknown') {
  if (!ownership1 || !ownership2) return false;
  const allKeys = new Set([...Object.keys(ownership1), ...Object.keys(ownership2)]);
  for (const key of allKeys) {
    if (ownership1[key] !== ownership2[key]) return false;
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
    log(3, 'No migration updates needed');
    return;
  }
  const content = await buildChatContent(deprecatedResults, folderResults, ownershipResults, totalProcessed);
  ChatMessage.create({ content: content, whisper: [game.user.id], user: game.user.id });
  log(3, `Migration complete: ${totalProcessed} documents updated`);
}

async function buildChatContent(deprecatedResults, folderResults, ownershipResults, totalProcessed) {
  return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_REPORT, { deprecatedResults, folderResults, ownershipResults, totalProcessed });
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
