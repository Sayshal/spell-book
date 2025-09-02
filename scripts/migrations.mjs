import { DEPRECATED_FLAGS, MODULE, TEMPLATES } from './constants/_module.mjs';
import * as DataHelpers from './data/_module.mjs';
import { log } from './logger.mjs';

const { renderTemplate } = foundry.applications.handlebars;

Hooks.on('ready', runAllMigrations);

/**
 * Run all migration functions in sequence
 */
async function runAllMigrations() {
  if (!game.user.isGM) return;
  log(3, 'Running all migrations...');
  try {
    const deprecatedFlagResults = await migrateDeprecatedFlags();
    const folderResults = await migrateSpellListFolders();
    const ownershipResults = await validateOwnershipLevels();
    const packSortingResults = await migratePackSorting();
    const totalProcessed = deprecatedFlagResults.processed + folderResults.processed + ownershipResults.processed + packSortingResults.processed;
    log(3, `Migration results: deprecated=${deprecatedFlagResults.processed}, folders=${folderResults.processed}, ownership=${ownershipResults.processed}, sorting=${packSortingResults.processed}`);
    if (totalProcessed > 0) {
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.StartNotification'));
      await logMigrationResults(deprecatedFlagResults, folderResults, ownershipResults, packSortingResults);
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.CompleteNotification'));
    } else {
      log(3, 'No migrations needed');
    }
  } catch (error) {
    log(1, 'Error during migrations:', error);
  }
}

/**
 * Migrate deprecated flags from world actors and compendium documents
 * @returns {Promise<Object>} Migration results with processed count and affected documents
 */
async function migrateDeprecatedFlags() {
  const results = { processed: 0, invalidFlagRemovals: 0, actors: [], affectedDocuments: [] };
  log(3, 'Migrating world actors and compendium for deprecated flags');
  await migrateCollection(game.actors, results);
  const modulePack = game.packs.get(MODULE.PACK.SPELLS);
  if (modulePack) {
    const documents = await modulePack.getDocuments();
    await migrateCollection(documents, results, modulePack.collection);
  }
  return results;
}

/**
 * Migrate a collection of documents for deprecated flags
 * @param {Collection|Array} documents Documents to migrate
 * @param {Object} results Results object to update
 * @param {string|null} packName Pack name if migrating compendium
 */
async function migrateCollection(documents, results, packName = null) {
  for (const doc of documents) {
    const migrationResult = await migrateDocument(doc, DEPRECATED_FLAGS);
    if (migrationResult.wasUpdated) {
      const docInfo = { name: doc.name, id: doc.id, pack: packName, hadInvalidFlags: migrationResult.invalidFlags, removedFlags: migrationResult.removedFlags };
      results.actors.push(docInfo);
      results.affectedDocuments.push(docInfo);
      results.processed++;
      if (migrationResult.invalidFlags) results.invalidFlagRemovals++;
    }
  }
}

/**
 * Migrate a single document for deprecated flags
 * @param {Document} doc Document to migrate
 * @param {Array} deprecatedFlags Array of deprecated flag definitions
 * @returns {Promise<Object>} Migration result with update status and removed flags
 */
async function migrateDocument(doc, deprecatedFlags) {
  const flags = doc.flags?.[MODULE.ID];
  if (!flags) return { wasUpdated: false, invalidFlags: false, removedFlags: [] };
  const updates = {};
  const removedFlags = [];
  let hasRemovals = false;
  const nullValidFlags = ['ruleSetOverride', 'enforcementBehavior'];
  for (const [key, value] of Object.entries(flags)) {
    const isDeprecated = deprecatedFlags.some((deprecated) => deprecated.key === key);
    const isInvalid = nullValidFlags.includes(key)
      ? value === undefined || (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0)
      : value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
    if (isDeprecated || isInvalid) {
      updates[`flags.${MODULE.ID}.-=${key}`] = null;
      hasRemovals = true;
      const reason = isDeprecated ? `Deprecated flag (removed in ${deprecatedFlags.find((d) => d.key === key)?.removedInVersion || 'unknown version'})` : 'Invalid value (null/undefined/empty object)';
      removedFlags.push({ key, value, reason });
    }
  }

  if (hasRemovals) {
    try {
      await doc.update(updates);
      return { wasUpdated: true, invalidFlags: true, removedFlags };
    } catch (error) {
      log(1, `Failed to migrate document ${doc.name}:`, error);
      return { wasUpdated: false, invalidFlags: false, removedFlags: [] };
    }
  }

  return { wasUpdated: false, invalidFlags: false, removedFlags: [] };
}

/**
 * Migrate spell list journals to appropriate folders
 * @returns {Promise<Object>} Migration results with processed count and moved journals
 */
async function migrateSpellListFolders() {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return { processed: 0, errors: [], customMoved: 0, mergedMoved: 0, foldersCreated: [], migratedJournals: [] };
  const results = { processed: 0, errors: [], customMoved: 0, mergedMoved: 0, foldersCreated: [], migratedJournals: [] };
  try {
    const allJournals = await customPack.getDocuments();
    const topLevelJournals = allJournals.filter((journal) => !journal.folder);
    if (topLevelJournals.length === 0) return results;
    log(2, `Found ${topLevelJournals.length} top-level journals to migrate`);
    const customFolder = await DataHelpers.getOrCreateCustomFolder();
    const mergedFolder = await DataHelpers.getOrCreateMergedFolder();
    if (customFolder) results.foldersCreated.push('custom');
    if (mergedFolder) results.foldersCreated.push('merged');
    for (const journal of topLevelJournals) {
      try {
        const migrationResult = await migrateJournalToFolder(journal, customFolder, mergedFolder);
        if (migrationResult.success) {
          results.processed++;
          results.migratedJournals.push({ name: journal.name, id: journal.id, type: migrationResult.type, targetFolder: migrationResult.targetFolder });
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

/**
 * Validate and fix ownership levels for all Spell Book documents
 * @returns {Promise<Object>} Validation results with fixed counts and details
 */
async function validateOwnershipLevels() {
  const results = { processed: 0, errors: [], userDataFixed: 0, spellListsFixed: 0, actorSpellbooksFixed: 0, packsFixed: 0, details: [], fixedDocuments: [] };
  log(3, 'Validating ownership levels for Spell Book documents...');
  try {
    const userDataResults = await validateUserDataOwnership();
    results.userDataFixed = userDataResults.fixed;
    results.processed += userDataResults.fixed;
    results.errors.push(...userDataResults.errors);
    results.details.push(...userDataResults.details);
    results.fixedDocuments.push(...userDataResults.fixedDocuments);
    const spellListResults = await validateSpellListOwnership();
    results.spellListsFixed = spellListResults.fixed;
    results.processed += spellListResults.fixed;
    results.errors.push(...spellListResults.errors);
    results.details.push(...spellListResults.details);
    results.fixedDocuments.push(...spellListResults.fixedDocuments);
    const actorSpellbookResults = await validateActorSpellbookOwnership();
    results.actorSpellbooksFixed = actorSpellbookResults.fixed;
    results.processed += actorSpellbookResults.fixed;
    results.errors.push(...actorSpellbookResults.errors);
    results.details.push(...actorSpellbookResults.details);
    results.fixedDocuments.push(...actorSpellbookResults.fixedDocuments);
    const packResults = await validatePackOwnership();
    results.packsFixed = packResults.fixed;
    results.processed += packResults.fixed;
    results.errors.push(...packResults.errors);
    results.details.push(...packResults.details);
    results.fixedDocuments.push(...packResults.fixedDocuments);
    log(3, `Ownership validation complete: ${results.processed} documents fixed`);
  } catch (error) {
    log(1, 'Error during ownership validation:', error);
    results.errors.push(`Ownership validation error: ${error.message}`);
  }
  return results;
}

/**
 * Validate and fix user data journal and page ownership
 * @returns {Promise<Object>} Validation results for user data
 */
async function validateUserDataOwnership() {
  const results = { fixed: 0, errors: [], details: [], fixedDocuments: [] };
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
      const currentOwnership = userDataJournal.ownership || {};
      const correctJournalOwnership = { ...currentOwnership, default: 0, [game.user.id]: 3 };
      if (!isOwnershipEqual(userDataJournal.ownership, correctJournalOwnership)) {
        await userDataJournal.update({ ownership: correctJournalOwnership });
        results.fixed++;
        results.details.push('Fixed user data journal');
        results.fixedDocuments.push({ type: 'journal', name: userDataJournal.name, id: userDataJournal.id, oldOwnership: currentOwnership, newOwnership: correctJournalOwnership });
      }
      for (const page of userDataJournal.pages) {
        const userId = page.flags?.[MODULE.ID]?.userId;
        if (userId && page.flags?.[MODULE.ID]?.isUserSpellData) {
          const user = game.users.get(userId);
          if (!user) continue;
          const currentPageOwnership = page.ownership || {};
          const correctPageOwnership = { ...currentPageOwnership, default: 0, [userId]: 3, [game.user.id]: 3 };
          if (!isOwnershipEqual(page.ownership, correctPageOwnership)) {
            await page.update({ ownership: correctPageOwnership });
            results.fixed++;
            results.details.push(`Fixed user page: ${user.name}`);
            results.fixedDocuments.push({ type: 'page', name: page.name, id: page.id, userId: userId, userName: user.name, oldOwnership: currentPageOwnership, newOwnership: correctPageOwnership });
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

/**
 * Validate and fix spell list journal ownership
 * @returns {Promise<Object>} Validation results for spell lists
 */
async function validateSpellListOwnership() {
  const results = { fixed: 0, errors: [], details: [], fixedDocuments: [] };
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
        const currentOwnership = journal.ownership || {};
        const correctOwnership = { ...currentOwnership, default: 1, [game.user.id]: 3 };
        if (!isOwnershipEqual(journal.ownership, correctOwnership)) {
          await journal.update({ ownership: correctOwnership });
          results.fixed++;
          results.details.push(`Fixed spell list: ${journal.name}`);
          results.fixedDocuments.push({ type: 'spellList', name: journal.name, id: journal.id, flags: flags, oldOwnership: currentOwnership, newOwnership: correctOwnership });
        }
      }
    }
  } catch (error) {
    log(1, 'Error validating spell list ownership:', error);
    results.errors.push(`Spell list ownership error: ${error.message}`);
  }
  return results;
}

/**
 * Validate and fix actor Spell Book journal and page ownership
 * @returns {Promise<Object>} Validation results for actor spellbooks
 */
async function validateActorSpellbookOwnership() {
  const results = { fixed: 0, errors: [], details: [], fixedDocuments: [] };
  const pack = game.packs.get(MODULE.PACK.SPELLS);
  if (!pack) {
    results.errors.push('Spells pack not found');
    return results;
  }
  try {
    const actorSpellbooksFolderName = game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks');
    const actorSpellbooksFolder = pack.folders.find((f) => f.name === actorSpellbooksFolderName);
    if (!actorSpellbooksFolder) return results;
    const documents = await pack.getDocuments();
    const folderDocuments = documents.filter((doc) => doc.folder?.id === actorSpellbooksFolder.id);
    for (const doc of folderDocuments) {
      if (!doc.pages) continue;
      for (const page of doc.pages) {
        const flags = page.flags?.[MODULE.ID];
        if (!flags?.isActorSpellbook || !flags?.actorId) continue;
        const actorId = flags.actorId;
        const classIdentifier = flags.classIdentifier || 'unknown';
        const actor = game.actors.get(actorId);
        if (!actor) continue;
        const actorOwnership = actor.ownership || {};
        const ownerUserIds = Object.keys(actorOwnership).filter((userId) => userId !== 'default' && actorOwnership[userId] === 3);
        if (ownerUserIds.length === 0) continue;
        const correctPageOwnership = { default: 0, [game.user.id]: 3 };
        for (const ownerUserId of ownerUserIds) correctPageOwnership[ownerUserId] = 3;
        const currentPageOwnership = page.ownership || {};
        if (!isOwnershipEqual(currentPageOwnership, correctPageOwnership)) {
          try {
            await page.update({ ownership: correctPageOwnership });
            results.fixed++;
            const ownerNames = ownerUserIds.map((id) => game.users.get(id)?.name || id).join(', ');
            results.details.push(`Fixed actor Spell Book page: ${actor.name} (${classIdentifier}) for user(s) ${ownerNames}`);
            results.fixedDocuments.push({
              type: 'actorSpellbookPage',
              name: page.name,
              id: page.id,
              actorId: actorId,
              actorName: actor.name,
              classIdentifier: classIdentifier,
              ownerUserIds: ownerUserIds,
              ownerNames: ownerNames,
              oldOwnership: currentPageOwnership,
              newOwnership: correctPageOwnership
            });
          } catch (updateError) {
            results.errors.push(`Failed to fix ${page.name}: ${updateError.message}`);
          }
        }
        const currentJournalOwnership = doc.ownership || {};
        if (!isOwnershipEqual(currentJournalOwnership, correctPageOwnership)) {
          try {
            await doc.update({ ownership: correctPageOwnership });
            results.fixed++;
            results.details.push(`Fixed actor Spell Book journal: ${doc.name}`);
            results.fixedDocuments.push({
              type: 'actorSpellbookJournal',
              name: doc.name,
              id: doc.id,
              actorId: actorId,
              actorName: actor.name,
              classIdentifier: classIdentifier,
              ownerUserIds: ownerUserIds,
              oldOwnership: currentJournalOwnership,
              newOwnership: correctPageOwnership
            });
          } catch (updateError) {
            results.errors.push(`Failed to fix journal ${doc.name}: ${updateError.message}`);
          }
        }
      }
    }
  } catch (error) {
    results.errors.push(`Actor Spell Book ownership error: ${error.message}`);
  }
  return results;
}

/**
 * Validate and fix compendium pack ownership and visibility
 * @returns {Promise<Object>} Validation results for packs
 */
async function validatePackOwnership() {
  const results = { fixed: 0, errors: [], details: [], fixedDocuments: [] };
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
      const needsOwnershipUpdate = !isRoleOwnershipEqual(pack.ownership, config.expectedOwnership);
      const needsVisibilityUpdate = !pack.visible || pack.getUserLevel(game.user) < 1;
      if (needsOwnershipUpdate || needsVisibilityUpdate) {
        const updateReasons = [];
        const oldState = { ownership: { ...pack.ownership }, visible: pack.visible, locked: pack.locked };
        if (needsOwnershipUpdate) updateReasons.push('ownership');
        if (needsVisibilityUpdate) updateReasons.push('visibility');
        await pack.configure({ ownership: config.expectedOwnership, locked: false, visible: true });
        results.fixed++;
        results.details.push(`Fixed ${config.name} pack ${updateReasons.join(' and ')}`);
        results.fixedDocuments.push({
          type: 'pack',
          name: config.name,
          id: pack.collection,
          updateReasons: updateReasons,
          oldState: oldState,
          newState: { ownership: config.expectedOwnership, visible: true, locked: false }
        });
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

/**
 * Compare two ownership objects for equality
 * @param {Object} ownership1 First ownership object
 * @param {Object} ownership2 Second ownership object
 * @returns {boolean} Whether ownership objects are equal
 */
function isOwnershipEqual(ownership1, ownership2) {
  if (!ownership1 || !ownership2) return false;
  const allKeys = new Set([...Object.keys(ownership1), ...Object.keys(ownership2)]);
  for (const key of allKeys) {
    if (ownership1[key] !== ownership2[key]) return false;
  }
  return true;
}

/**
 * Compare two role-based ownership objects for equality
 * @param {Object} ownership1 First ownership object
 * @param {Object} ownership2 Second ownership object
 * @returns {boolean} Whether role ownership objects are equal
 */
function isRoleOwnershipEqual(ownership1, ownership2) {
  if (!ownership1 || !ownership2) return false;
  const allKeys = new Set([...Object.keys(ownership1), ...Object.keys(ownership2)]);
  for (const key of allKeys) {
    if (ownership1[key] !== ownership2[key]) return false;
  }
  return true;
}

/**
 * Migrate a journal to its appropriate folder based on flags
 * @param {JournalEntry} journal Journal to migrate
 * @param {Folder} customFolder Custom spell lists folder
 * @param {Folder} mergedFolder Merged spell lists folder
 * @returns {Promise<Object>} Migration result with success status and type
 */
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
  return { success: true, type: moveType, targetFolder: targetFolder.name };
}

/**
 * Migrate pack sorting and folder sorting for Spell Book packs
 * @returns {Promise<Object>} Migration results with processed count and updated items
 */
async function migratePackSorting() {
  const results = { processed: 0, foldersUpdated: 0, packsUpdated: 0, errors: [] };
  try {
    const packSortingConfig = {
      [MODULE.PACK.SPELLS]: 10000,
      [MODULE.PACK.USERDATA]: 20000,
      [MODULE.PACK.MACROS]: 30000
    };
    for (const [packId, sortValue] of Object.entries(packSortingConfig)) {
      try {
        const pack = game.packs.get(packId);
        if (pack.sort !== sortValue) {
          await pack.configure({ sort: sortValue });
          log(3, `Updated pack ${packId} sort from ${pack.sort} to ${sortValue}`);
          results.packsUpdated++;
          results.processed++;
        }
      } catch (error) {
        log(1, `Error updating pack ${packId}:`, error);
        results.errors.push({
          type: 'pack',
          packId,
          error: error.message
        });
      }
    }
    const customPack = game.packs.get(MODULE.PACK.SPELLS);
    if (customPack?.folder && customPack.folder.sorting !== 'm') {
      try {
        await customPack.folder.update({ sorting: 'm' });
        log(3, `Updated "${customPack.folder.name}" folder sorting to manual ("m")`);
        results.foldersUpdated++;
        results.processed++;
      } catch (error) {
        log(1, `Failed to update folder ${customPack.folder.name}:`, error);
        results.errors.push({
          type: 'folder',
          name: customPack.folder.name,
          error: error.message
        });
      }
    }
    if (results.packsUpdated > 0) log(3, `Updated ${results.packsUpdated} pack sort values`);
    if (results.foldersUpdated > 0) log(3, `Updated ${results.foldersUpdated} pack folders to use manual sorting`);
  } catch (error) {
    log(1, 'Error during pack sorting migration:', error);
    results.errors.push({ type: 'generalMigration', error: error.message });
  }
  return results;
}

/**
 * Log detailed migration results to console and create chat message
 * @param {Object} deprecatedResults Results from deprecated flag migration
 * @param {Object} folderResults Results from folder migration
 * @param {Object} ownershipResults Results from ownership validation
 * @param {Object} packSortingResults Results from pack sorting validation
 */
async function logMigrationResults(deprecatedResults, folderResults, ownershipResults, packSortingResults) {
  const totalProcessed = deprecatedResults.processed + folderResults.processed + ownershipResults.processed + packSortingResults.processed;
  if (totalProcessed === 0) {
    log(3, 'No migration updates needed');
    return;
  }
  console.group('Spell Book Migration Results');
  if (deprecatedResults.processed > 0) {
    console.group('Deprecated Flags Migration');
    console.log(`Processed: ${deprecatedResults.processed} documents`);
    console.log(`Invalid flags removed: ${deprecatedResults.invalidFlagRemovals}`);
    console.log('Affected documents:', deprecatedResults.affectedDocuments);
    console.groupEnd();
  }
  if (folderResults.processed > 0) {
    console.group('Folder Migration');
    console.log(`Processed: ${folderResults.processed} journals`);
    console.log(`Custom moved: ${folderResults.customMoved}`);
    console.log(`Merged moved: ${folderResults.mergedMoved}`);
    console.log('Migrated journals:', folderResults.migratedJournals);
    if (folderResults.errors.length > 0) console.log('Errors:', folderResults.errors);
    console.groupEnd();
  }
  if (ownershipResults.processed > 0) {
    console.group('Ownership Validation');
    console.log(`Total fixed: ${ownershipResults.processed} documents`);
    console.log(`User data fixed: ${ownershipResults.userDataFixed}`);
    console.log(`Spell lists fixed: ${ownershipResults.spellListsFixed}`);
    console.log(`Actor spellbooks fixed: ${ownershipResults.actorSpellbooksFixed}`);
    console.log(`Packs fixed: ${ownershipResults.packsFixed}`);
    console.log('All fixed documents:', ownershipResults.fixedDocuments);
    if (ownershipResults.errors.length > 0) console.log('Errors:', ownershipResults.errors);
    console.groupEnd();
  }
  if (packSortingResults.processed > 0) {
    console.group('Pack Sorting Migration');
    console.log(`Packs updated: ${packSortingResults.packsUpdated}`);
    console.log(`Folders updated: ${packSortingResults.foldersUpdated}`);
    if (packSortingResults.errors.length > 0) console.log('Errors:', packSortingResults.errors);
    console.groupEnd();
  }
  console.groupEnd();
  const content = await buildChatContent(deprecatedResults, folderResults, ownershipResults, packSortingResults, totalProcessed);
  ChatMessage.create({ content: content, whisper: [game.user.id], user: game.user.id, flags: { 'spell-book': { messageType: 'migration-report' } } });
  log(3, `Migration complete: ${totalProcessed} documents/folders processed`);
}

/**
 * Build chat message content for migration results
 * @param {Object} deprecatedResults Deprecated flag results
 * @param {Object} folderResults Folder migration results
 * @param {Object} ownershipResults Ownership validation results
 * @param {Object} packSortingResults Pack sorting results
 * @param {number} totalProcessed Total processed documents
 * @returns {Promise<string>} Rendered HTML content
 */
async function buildChatContent(deprecatedResults, folderResults, ownershipResults, packSortingResults, totalProcessed) {
  return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_REPORT, { deprecatedResults, folderResults, ownershipResults, packSortingResults, totalProcessed });
}

/**
 * Force run all migrations for testing purposes
 */
export async function forceMigration() {
  log(2, 'Force running migration for testing...');
  await runAllMigrations();
  log(2, 'Migration test complete.');
}
