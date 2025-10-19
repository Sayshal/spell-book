/**
 * Ownership Validation Migration
 *
 * Validates and fixes ownership levels for all Spell Book documents including
 * user data, spell lists, actor spellbooks, and compendium packs.
 *
 * @module Migrations/OwnershipValidation
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Validate and fix ownership levels for all Spell Book documents.
 *
 * @returns {Promise<Object>} Validation results
 * @property {number} processed - Total number of documents fixed
 * @property {Array<string>} errors - Array of error messages
 * @property {number} userDataFixed - Number of user data documents fixed
 * @property {number} spellListsFixed - Number of spell list documents fixed
 * @property {number} actorSpellbooksFixed - Number of actor spellbook documents fixed
 * @property {number} packsFixed - Number of compendium packs fixed
 * @property {Array<string>} details - Array of detailed fix descriptions
 * @property {Array<Object>} fixedDocuments - Array of fixed document information
 */
async function validateOwnershipLevels() {
  const results = { processed: 0, updated: 0, errors: [], userDataFixed: 0, spellListsFixed: 0, actorSpellbooksFixed: 0, packsFixed: 0, details: [], fixedDocuments: [] };
  log(3, 'Validating ownership levels for Spell Book documents...');
  try {
    const userDataResults = await validateUserDataOwnership();
    results.userDataFixed = userDataResults.fixed;
    results.processed += userDataResults.checked;
    results.updated += userDataResults.fixed;
    results.errors.push(...userDataResults.errors);
    results.details.push(...userDataResults.details);
    results.fixedDocuments.push(...userDataResults.fixedDocuments);
    const spellListResults = await validateSpellListOwnership();
    results.spellListsFixed = spellListResults.fixed;
    results.processed += spellListResults.checked;
    results.updated += spellListResults.fixed;
    results.errors.push(...spellListResults.errors);
    results.details.push(...spellListResults.details);
    results.fixedDocuments.push(...spellListResults.fixedDocuments);
    const actorSpellbookResults = await validateActorSpellbookOwnership();
    results.actorSpellbooksFixed = actorSpellbookResults.fixed;
    results.processed += actorSpellbookResults.checked;
    results.updated += actorSpellbookResults.fixed;
    results.errors.push(...actorSpellbookResults.errors);
    results.details.push(...actorSpellbookResults.details);
    results.fixedDocuments.push(...actorSpellbookResults.fixedDocuments);
    const packResults = await validatePackOwnership();
    results.packsFixed = packResults.fixed;
    results.processed += packResults.checked;
    results.updated += packResults.fixed;
    results.errors.push(...packResults.errors);
    results.details.push(...packResults.details);
    results.fixedDocuments.push(...packResults.fixedDocuments);
    log(3, `Ownership validation complete: ${results.updated} documents fixed (${results.processed} checked)`);
  } catch (error) {
    log(1, 'Error during ownership validation:', error);
    results.errors.push(`Ownership validation error: ${error.message}`);
  }
  return results;
}

/**
 * Validate and fix user data journal and page ownership.
 *
 * @returns {Promise<Object>} Validation results for user data
 */
async function validateUserDataOwnership() {
  const results = { checked: 0, fixed: 0, errors: [], details: [], fixedDocuments: [] };
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
      results.checked++;
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
          results.checked++;
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
    } else log(3, 'No user data journal found');
  } catch (error) {
    log(1, 'Error validating user data ownership:', error);
    results.errors.push(`User data ownership error: ${error.message}`);
  }
  return results;
}

/**
 * Validate and fix spell list journal ownership.
 * @returns {Promise<Object>} Validation results for spell lists
 */
async function validateSpellListOwnership() {
  const results = { checked: 0, fixed: 0, errors: [], details: [], fixedDocuments: [] };
  const pack = game.packs.get(MODULE.PACK.SPELLS);
  if (!pack) {
    results.errors.push('Spell lists pack not found');
    return results;
  }
  try {
    const index = await pack.getIndex({ fields: ['name', 'ownership', 'pages.type'] });
    for (const journalData of index) {
      const hasSpellPages = journalData.pages?.some((page) => page.type === 'spells');
      if (!hasSpellPages) continue;
      const journal = await pack.getDocument(journalData._id);
      if (journal.pages.size === 0) continue;
      const page = journal.pages.contents[0];
      if (page.type !== 'spells') continue;
      const flags = page.flags?.[MODULE.ID] || {};
      const isSpellList = flags.isMerged || flags.isCustom || flags.isNewList;
      if (isSpellList) {
        results.checked++;
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
 * @returns {Promise<Object>} Validation results for actor spellbooks
 */
async function validateActorSpellbookOwnership() {
  const results = { checked: 0, fixed: 0, errors: [], details: [], fixedDocuments: [] };
  const pack = game.packs.get(MODULE.PACK.SPELLS);
  if (!pack) {
    results.errors.push('Spells pack not found');
    return results;
  }
  try {
    const actorSpellbooksFolderName = game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks');
    const actorSpellbooksFolder = pack.folders.find((f) => f.name === actorSpellbooksFolderName);
    if (!actorSpellbooksFolder) return results;
    const index = await pack.getIndex({ fields: ['name', 'folder', 'pages.type'] });
    const folderJournals = index.filter((doc) => doc.folder === actorSpellbooksFolder.id);
    for (const journalData of folderJournals) {
      const hasSpellPages = journalData.pages?.some((page) => page.type === 'spells');
      if (!hasSpellPages) continue;
      const doc = await pack.getDocument(journalData._id);
      if (!doc.pages) continue;
      for (const page of doc.pages) {
        const flags = page.flags?.[MODULE.ID] || {};
        if (!flags?.isActorSpellbook || !flags?.actorId) continue;
        results.checked++;
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
 * @returns {Promise<Object>} Validation results for packs
 */
async function validatePackOwnership() {
  const results = { checked: 0, fixed: 0, errors: [], details: [], fixedDocuments: [] };
  try {
    const spellsPack = game.packs.get(MODULE.PACK.SPELLS);
    const userDataPack = game.packs.get(MODULE.PACK.USERDATA);
    const macrosPack = game.packs.get(MODULE.PACK.MACROS);
    const packsToValidate = [
      { pack: spellsPack, name: 'Spells', expectedOwnership: { PLAYER: 'OWNER', ASSISTANT: 'OWNER', GAMEMASTER: 'OWNER', TRUSTED: 'INHERIT' } },
      { pack: userDataPack, name: 'User Data', expectedOwnership: { PLAYER: 'OWNER', ASSISTANT: 'OWNER', GAMEMASTER: 'OWNER', TRUSTED: 'INHERIT' } },
      { pack: macrosPack, name: 'Macros', expectedOwnership: { PLAYER: 'NONE', ASSISTANT: 'OWNER', GAMEMASTER: 'OWNER', TRUSTED: 'INHERIT' } }
    ];
    for (const { pack, name, expectedOwnership } of packsToValidate) {
      if (!pack) {
        results.errors.push(`${name} pack not found`);
        continue;
      }
      results.checked++;
      const currentOwnership = pack.ownership || {};
      const normalizeOwnership = (ownership) => {
        const normalized = {};
        const sortedKeys = Object.keys(ownership).sort();
        for (const key of sortedKeys) normalized[key] = ownership[key];
        return normalized;
      };
      const normalizedCurrent = normalizeOwnership(currentOwnership);
      const normalizedExpected = normalizeOwnership(expectedOwnership);
      const currentString = JSON.stringify(normalizedCurrent);
      const expectedString = JSON.stringify(normalizedExpected);
      if (currentString !== expectedString) {
        try {
          await pack.configure({ ownership: expectedOwnership });
          results.fixed++;
          results.details.push(`Fixed ${name} pack permissions`);
          results.fixedDocuments.push({
            type: 'pack',
            name: name,
            id: pack.metadata.id,
            updateReasons: ['ownership'],
            oldState: { ownership: currentOwnership, visible: pack.visible, locked: pack.locked },
            newState: { ownership: expectedOwnership, visible: pack.visible, locked: pack.locked }
          });
        } catch (error) {
          results.errors.push(`Failed to fix ${name} pack: ${error.message}`);
        }
      }
    }
  } catch (error) {
    log(1, 'Error validating pack ownership:', error);
    results.errors.push(`Pack ownership validation error: ${error.message}`);
  }
  return results;
}

/**
 * Compare two ownership objects for equality.
 * @param {Object} ownership1 - First ownership object
 * @param {Object} ownership2 - Second ownership object
 * @returns {boolean} Whether ownership objects are equal
 */
function isOwnershipEqual(ownership1, ownership2) {
  if (!ownership1 || !ownership2) return false;
  const allKeys = new Set([...Object.keys(ownership1), ...Object.keys(ownership2)]);
  for (const key of allKeys) if (ownership1[key] !== ownership2[key]) return false;
  return true;
}

export const ownershipValidation = {
  key: 'ownershipValidation',
  version: '1.0.0',
  name: 'Ownership Validation',
  description: 'Validate and fix ownership levels for all Spell Book documents',
  migrate: validateOwnershipLevels
};
