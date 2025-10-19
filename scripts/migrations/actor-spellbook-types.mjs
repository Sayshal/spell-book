/**
 * Actor Spellbook Types Migration
 *
 * Migrates actor spellbooks to have type 'actor-spellbook'.
 * This migration ensures all actor spellbook pages have the correct type set.
 *
 * @module Migrations/ActorSpellbookTypes
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Migrate actor spellbooks to have type 'actor-spellbook'.
 * @returns {Promise<Object>} Migration results
 * @property {number} processed - Number of pages updated
 * @property {Array<string>} errors - Array of error messages
 * @property {Array<Object>} updatedPages - Array of updated page information
 */
async function migrateActorSpellbookTypes() {
  const results = { processed: 0, errors: [], updatedPages: [] };
  const customPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!customPack) return results;
  try {
    const journals = await customPack.getDocuments();
    for (const journal of journals) {
      for (const page of journal.pages) {
        if (page.type !== 'spells') continue;
        const flags = page.flags?.[MODULE.ID] || {};
        if (flags.isActorSpellbook && page.system?.type !== 'actor-spellbook') {
          try {
            await page.update({ 'system.type': 'actor-spellbook' });
            log(3, `Set ${page.name} to type 'actor-spellbook'`);
            results.processed++;
            results.updatedPages.push({ name: page.name, id: page.id, journalName: journal.name, journalId: journal.id });
          } catch (error) {
            const errorMessage = `Failed to update ${page.name}: ${error.message}`;
            log(2, errorMessage, error);
            results.errors.push(errorMessage);
          }
        }
      }
    }
  } catch (error) {
    const errorMessage = `Critical error during actor spellbook type migration: ${error.message}`;
    results.errors.push(errorMessage);
    log(1, errorMessage, error);
  }
  return results;
}

export const actorSpellbookTypes = {
  key: 'actorSpellbookTypes',
  version: '1.0.0',
  name: 'Actor Spellbook Types',
  description: 'Migrate actor spellbooks to have type "actor-spellbook"',
  migrate: migrateActorSpellbookTypes
};
