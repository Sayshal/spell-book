/**
 * Spell Book Module Migrations
 *
 * Handles data migration and maintenance tasks for the Spell Book module.
 * This module provides automated migration functionality that runs on world
 * startup to ensure data integrity, update deprecated configurations, and
 * maintain proper ownership and organization of module data.
 *
 * Migration areas:
 * - Deprecated flag cleanup from actors and documents
 * - Spell list folder organization and migration
 * - Ownership validation and correction
 * - Compendium pack configuration and sorting
 *
 * @module Migrations
 * @author Tyler
 */

import { DEPRECATED_FLAGS, MODULE, TEMPLATES, FLAGS } from './constants/_module.mjs';
import * as DataHelpers from './data/_module.mjs';
import { log } from './logger.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Results from deprecated flag migration operations.
 *
 * @typedef {Object} DeprecatedFlagResults
 * @property {number} processed - Number of documents processed
 * @property {number} invalidFlagRemovals - Number of documents with invalid flags removed
 * @property {Array<Object>} actors - Array of actor migration information
 * @property {Array<Object>} affectedDocuments - Array of all affected document information
 */

/**
 * Results from folder migration operations.
 *
 * @typedef {Object} FolderMigrationResults
 * @property {number} processed - Number of journals migrated
 * @property {Array<string>} errors - Array of error messages
 * @property {number} customMoved - Number of custom spell lists moved
 * @property {number} mergedMoved - Number of merged spell lists moved
 * @property {Array<string>} foldersCreated - Array of folder names created
 * @property {Array<Object>} migratedJournals - Array of migrated journal information
 */

/**
 * Results from ownership validation operations.
 *
 * @typedef {Object} OwnershipValidationResults
 * @property {number} processed - Total number of documents fixed
 * @property {Array<string>} errors - Array of error messages
 * @property {number} userDataFixed - Number of user data documents fixed
 * @property {number} spellListsFixed - Number of spell list documents fixed
 * @property {number} actorSpellbooksFixed - Number of actor spellbook documents fixed
 * @property {number} packsFixed - Number of compendium packs fixed
 * @property {Array<string>} details - Array of detailed fix descriptions
 * @property {Array<Object>} fixedDocuments - Array of fixed document information
 */

/**
 * Results from pack sorting migration operations.
 *
 * @typedef {Object} PackSortingResults
 * @property {number} processed - Total items processed
 * @property {number} foldersUpdated - Number of folders updated
 * @property {number} packsUpdated - Number of packs updated
 * @property {Array<Object>} errors - Array of error objects with type and details
 */

/**
 * Document migration result for individual documents.
 *
 * @typedef {Object} DocumentMigrationResult
 * @property {boolean} wasUpdated - Whether the document was updated
 * @property {boolean} invalidFlags - Whether invalid flags were found
 * @property {Array<Object>} removedFlags - Array of removed flag information
 */

/**
 * Journal folder migration result for individual journals.
 *
 * @typedef {Object} JournalMigrationResult
 * @property {boolean} success - Whether migration was successful
 * @property {string} [type] - Type of migration performed ('custom' or 'merged')
 * @property {string} [targetFolder] - Name of target folder
 * @property {string} [error] - Error message if migration failed
 */

/**
 * Results from custom spell list format migration operations.
 *
 * @typedef {Object} CustomSpellListMigrationResults
 * @property {number} processed - Number of actors processed
 * @property {number} updated - Number of actors updated with new format
 * @property {Array<Object>} migratedActors - Array of migrated actor information
 * @property {Array<string>} errors - Array of error messages
 */

/**
 * Run all migration functions in sequence.
 *
 * This function orchestrates all migration operations, collecting results
 * and providing comprehensive reporting. Only runs for GM users to prevent
 * conflicts. Migrations include deprecated flag cleanup, folder organization,
 * ownership validation, pack sorting updates, and custom spell list format updates.
 *
 * @returns {Promise<void>}
 */
export async function runAllMigrations() {
  if (!game.user.isGM) return;

  log(3, 'Running all migrations...');
  try {
    const deprecatedFlagResults = await migrateDeprecatedFlags();
    const folderResults = await migrateSpellListFolders();
    const ownershipResults = await validateOwnershipLevels();
    const packSortingResults = await migratePackSorting();
    const customSpellListResults = await migrateCustomSpellListFormat();
    const totalProcessed = deprecatedFlagResults.processed + folderResults.processed + ownershipResults.processed + packSortingResults.processed + customSpellListResults.processed;
    log(
      3,
      `Migration results: deprecated=${deprecatedFlagResults.processed}, folders=${folderResults.processed}, ownership=${ownershipResults.processed}, sorting=${packSortingResults.processed}, customSpellList=${customSpellListResults.processed}`
    );
    if (totalProcessed > 0) {
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.StartNotification'));
      await logMigrationResults(deprecatedFlagResults, folderResults, ownershipResults, packSortingResults, customSpellListResults);
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.CompleteNotification'));
    } else {
      log(3, 'No migrations needed');
    }
  } catch (error) {
    log(1, 'Error during migrations:', error);
  }
}

/**
 * Migrate deprecated flags from world actors and compendium documents.
 *
 * Scans all world actors and module compendium documents for deprecated
 * flags and invalid values, removing them to maintain data cleanliness.
 *
 * @returns {Promise<DeprecatedFlagResults>} Migration results with processed count and affected documents
 */
async function migrateDeprecatedFlags() {
  /** @type {DeprecatedFlagResults} */
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
 * Migrate a collection of documents for deprecated flags.
 *
 * Processes each document in the collection, checking for and removing
 * deprecated or invalid flags. Updates the results object with migration
 * information for reporting.
 *
 * @param {Collection|Array} documents - Documents to migrate
 * @param {DeprecatedFlagResults} results - Results object to update
 * @param {string|null} [packName=null] - Pack name if migrating compendium
 * @returns {Promise<void>}
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
 * Migrate a single document for deprecated flags.
 *
 * Examines document flags for deprecated or invalid values and removes them.
 * Returns detailed information about what was changed for reporting purposes.
 *
 * @param {Document} doc - Document to migrate
 * @param {Array} deprecatedFlags - Array of deprecated flag definitions
 * @returns {Promise<DocumentMigrationResult>} Migration result with update status and removed flags
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
 * Migrate spell list journals to appropriate folders.
 *
 * Organizes spell list journals into proper folder structure based on their
 * flags and types. Creates necessary folders if they don't exist and moves
 * journals from the root level into appropriate categorized folders.
 *
 * @returns {Promise<FolderMigrationResults>} Migration results with processed count and moved journals
 */
async function migrateSpellListFolders() {
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return { processed: 0, errors: [], customMoved: 0, mergedMoved: 0, foldersCreated: [], migratedJournals: [] };

  /** @type {FolderMigrationResults} */
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
 * Validate and fix ownership levels for all Spell Book documents.
 *
 * Ensures proper ownership configuration for user data, spell lists,
 * actor spellbooks, and compendium packs. Corrects ownership levels
 * to maintain security and access control.
 *
 * @returns {Promise<OwnershipValidationResults>} Validation results with fixed counts and details
 */
async function validateOwnershipLevels() {
  /** @type {OwnershipValidationResults} */
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
 * Validate and fix user data journal and page ownership.
 *
 * Ensures user spell data journals and pages have correct ownership
 * settings for proper access control and data security.
 *
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
      const correctJournalOwnership = { ...currentOwnership, default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
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
          const correctPageOwnership = {
            ...currentPageOwnership,
            default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
            [userId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
            [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
          };
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
 * Validate and fix spell list journal ownership.
 *
 * Ensures spell list journals have appropriate ownership levels for
 * proper access by players and GMs.
 *
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
        const correctOwnership = { ...currentOwnership, default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
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
 * Validate and fix actor Spell Book journal and page ownership.
 *
 * Ensures actor spellbook journals and pages have ownership that matches
 * the associated actor's ownership for proper access control.
 *
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
        const ownerUserIds = Object.keys(actorOwnership).filter((userId) => userId !== 'default' && actorOwnership[userId] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
        if (ownerUserIds.length === 0) continue;
        const correctPageOwnership = { default: 0, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
        for (const ownerUserId of ownerUserIds) correctPageOwnership[ownerUserId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
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
 * Validate and fix compendium pack ownership and visibility.
 *
 * Ensures all module compendium packs have correct ownership levels
 * and visibility settings for proper user access.
 *
 * @returns {Promise<Object>} Validation results for packs
 */
async function validatePackOwnership() {
  const results = { fixed: 0, errors: [], details: [], fixedDocuments: [] };
  const userDataPack = game.packs.get(MODULE.PACK.USERDATA);
  const spellsPack = game.packs.get(MODULE.PACK.SPELLS);
  const macrosPack = game.packs.get(MODULE.PACK.MACROS);

  /** @type {Array<{pack: CompendiumCollection, name: string, expectedOwnership: Object}>} */
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
 * Compare two ownership objects for equality.
 *
 * Performs deep comparison of ownership objects to determine if they
 * have identical access levels for all users.
 *
 * @param {Object} ownership1 - First ownership object
 * @param {Object} ownership2 - Second ownership object
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
 * Compare two role-based ownership objects for equality.
 *
 * Compares role-based ownership configurations used by compendium packs
 * to determine if access levels are correctly configured.
 *
 * @param {Object} ownership1 - First ownership object
 * @param {Object} ownership2 - Second ownership object
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
 * Migrate a journal to its appropriate folder based on flags.
 *
 * Analyzes journal page flags to determine the correct target folder
 * and moves the journal accordingly. Also handles name cleanup.
 *
 * @param {JournalEntry} journal - Journal to migrate
 * @param {Folder} customFolder - Custom spell lists folder
 * @param {Folder} mergedFolder - Merged spell lists folder
 * @returns {Promise<JournalMigrationResult>} Migration result with success status and type
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
 * Migrate pack sorting and folder sorting for Spell Book packs.
 *
 * Updates compendium pack sort orders and folder sorting modes to ensure
 * consistent organization and display order.
 *
 * @returns {Promise<PackSortingResults>} Migration results with processed count and updated items
 */
async function migratePackSorting() {
  /** @type {PackSortingResults} */
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
 * Migrate custom spell list format from string to array.
 *
 * Converts legacy single customSpellList string values to array format
 * to support multiple spell list selection. Scans all world actors for
 * spellcasting rules and updates the customSpellList format.
 *
 * @returns {Promise<CustomSpellListMigrationResults>}
 */
export async function migrateCustomSpellListFormat() {
  log(3, 'Starting custom spell list format migration...');
  const results = { processed: 0, updated: 0, migratedActors: [], errors: [] };
  try {
    const actors = game.actors.contents;
    for (const actor of actors) {
      results.processed++;
      try {
        const currentRules = actor.getFlag(MODULE.ID, FLAGS.SPELLCASTING_RULES) || {};
        let hasUpdates = false;
        const updatedRules = { ...currentRules };
        const migratedClasses = [];
        for (const [classId, rules] of Object.entries(currentRules)) {
          if (rules && rules.customSpellList && typeof rules.customSpellList === 'string') {
            log(3, `Migrating custom spell list for ${actor.name} class ${classId}: "${rules.customSpellList}" -> ["${rules.customSpellList}"]`);
            updatedRules[classId] = { ...rules, customSpellList: [rules.customSpellList] };
            migratedClasses.push({ classId: classId, oldValue: rules.customSpellList, newValue: [rules.customSpellList] });
            hasUpdates = true;
          }
        }
        if (hasUpdates) {
          await actor.setFlag(MODULE.ID, FLAGS.SPELLCASTING_RULES, updatedRules);
          results.updated++;
          results.migratedActors.push({ id: actor.id, name: actor.name, migratedClasses: migratedClasses });
          log(3, `Migrated custom spell list format for ${actor.name} (${migratedClasses.length} classes)`);
        }
      } catch (error) {
        const errorMessage = `Failed to migrate custom spell list format for actor ${actor.name}: ${error.message}`;
        results.errors.push(errorMessage);
        log(1, errorMessage, error);
      }
    }
    if (results.updated > 0) log(2, `Custom spell list format migration completed: ${results.updated}/${results.processed} actors updated`);
    else log(3, `No custom spell list format migration needed (${results.processed} actors checked)`);
  } catch (error) {
    const errorMessage = `Critical error during custom spell list format migration: ${error.message}`;
    results.errors.push(errorMessage);
    log(1, errorMessage, error);
  }
  return results;
}

/**
 * Log migration results to console and chat.
 *
 * Provides comprehensive reporting of all migration operations with detailed
 * console logging and a formatted chat message for the GM.
 *
 * @param {DeprecatedFlagResults} deprecatedResults - Results from deprecated flag migration
 * @param {FolderMigrationResults} folderResults - Results from folder migration
 * @param {OwnershipValidationResults} ownershipResults - Results from ownership validation
 * @param {PackSortingResults} packSortingResults - Results from pack sorting validation
 * @param {CustomSpellListMigrationResults} customSpellListResults - Results from custom spell list format migration
 * @returns {Promise<void>}
 */
async function logMigrationResults(deprecatedResults, folderResults, ownershipResults, packSortingResults, customSpellListResults) {
  const totalProcessed = deprecatedResults.processed + folderResults.processed + ownershipResults.processed + packSortingResults.processed + customSpellListResults.processed;
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
  if (customSpellListResults.processed > 0) {
    console.group('Custom Spell List Format Migration');
    console.log(`Processed: ${customSpellListResults.processed} actors`);
    console.log(`Updated: ${customSpellListResults.updated} actors`);
    console.log('Migrated actors:', customSpellListResults.migratedActors);
    if (customSpellListResults.errors.length > 0) console.log('Errors:', customSpellListResults.errors);
    console.groupEnd();
  }
  console.groupEnd();
  const content = await buildChatContent(deprecatedResults, folderResults, ownershipResults, packSortingResults, customSpellListResults);
  ChatMessage.create({ content: content, whisper: [game.user.id], user: game.user.id, flags: { 'spell-book': { messageType: 'migration-report' } } });
  log(3, `Migration complete: ${totalProcessed} documents/folders processed`);
}

/**
 * Build chat message content for migration results.
 *
 * Renders a formatted HTML template containing migration results for
 * display in the chat log.
 *
 * @param {DeprecatedFlagResults} deprecatedResults - Deprecated flag results
 * @param {FolderMigrationResults} folderResults - Folder migration results
 * @param {OwnershipValidationResults} ownershipResults - Ownership validation results
 * @param {PackSortingResults} packSortingResults - Pack sorting results
 * @param {CustomSpellListMigrationResults} customSpellListResults - Custom spell list format results
 * @returns {Promise<string>} Rendered HTML content
 */
async function buildChatContent(deprecatedResults, folderResults, ownershipResults, packSortingResults, customSpellListResults) {
  return await renderTemplate(TEMPLATES.COMPONENTS.MIGRATION_REPORT, {
    deprecatedResults,
    folderResults,
    ownershipResults,
    packSortingResults,
    customSpellListResults,
    totalProcessed: deprecatedResults.processed + folderResults.processed + ownershipResults.processed + packSortingResults.processed + customSpellListResults.processed
  });
}

/**
 * Force run all migrations for testing purposes.
 *
 * Manually triggers all migration operations for development and testing.
 * This function bypasses normal conditions and forces migration execution.
 *
 * @returns {Promise<void>}
 */
export async function forceMigration() {
  log(2, 'Force running migration for testing...');
  await runAllMigrations();
  log(2, 'Migration test complete.');
}
