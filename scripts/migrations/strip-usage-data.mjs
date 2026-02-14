/**
 * Strip Usage Data Migration
 *
 * Removes legacy spell usage tracking data from user data journal pages.
 * Strips usage HTML tables from journal display content and removes usageStats
 * from flag-based spell data storage. Also regenerates the intro page to
 * reflect the removal of usage/analytics features.
 * @module Migrations/StripUsageData
 * @author Tyler
 */

import { MODULE, FLAGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Strip usage tracking data from all user data journal pages.
 * @returns {Promise<object>} Migration results
 */
async function migrateStripUsageData() {
  const results = { processed: 0, updated: 0, errors: [] };
  if (!game.user.isGM) return results;

  try {
    const pack = game.packs.get(MODULE.PACK.USERDATA);
    if (!pack) return results;

    const documents = await pack.getDocuments();
    const journal = documents.find((doc) => doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);
    if (!journal) return results;

    for (const page of journal.pages) {
      const flags = page.flags?.[MODULE.ID];
      if (!flags?.isUserSpellData && !flags?.isIntroPage) continue;

      results.processed++;

      try {
        const updates = {};
        let changed = false;

        // Strip usage tables from display HTML
        const html = page.text?.content;
        if (html && html.includes('spell-usage')) {
          updates['text.content'] = stripUsageTablesFromHTML(html);
          changed = true;
        }

        // Strip usageStats from flag-based spell data
        const flagData = flags[FLAGS.USER_SPELL_DATA];
        if (flagData) {
          const { cleaned, hadUsageStats } = stripUsageStatsFromFlags(flagData);
          if (hadUsageStats) {
            updates[`flags.${MODULE.ID}.${FLAGS.USER_SPELL_DATA}`] = cleaned;
            changed = true;
          }
        }

        if (changed) {
          await page.update(updates);
          results.updated++;
        }
      } catch (error) {
        results.errors.push(`Failed to strip usage data for page ${page.name}: ${error.message}`);
      }
    }
  } catch (error) {
    results.errors.push(`Critical error during strip usage data migration: ${error.message}`);
  }

  log(3, 'Strip Usage Data Migration Completed:', { results });
  return results;
}

/**
 * Remove spell-usage tables and their headings from HTML content.
 * @param {string} html - Journal page HTML content
 * @returns {string} Cleaned HTML with usage tables removed
 */
function stripUsageTablesFromHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  for (const table of doc.querySelectorAll('table[data-table-type="spell-usage"]')) {
    // Remove preceding h2 heading if it exists
    const prev = table.previousElementSibling;
    if (prev?.tagName === 'H2') prev.remove();
    table.remove();
  }

  return doc.body.innerHTML;
}

/**
 * Remove usageStats from flag-based spell data entries.
 * @param {object} flagData - Encoded spell data from page flags
 * @returns {{ cleaned: object, hadUsageStats: boolean }}
 */
function stripUsageStatsFromFlags(flagData) {
  let hadUsageStats = false;
  const cleaned = {};

  for (const [key, spellEntry] of Object.entries(flagData)) {
    if (!spellEntry?.actorData) {
      cleaned[key] = spellEntry;
      continue;
    }

    const cleanedActorData = {};
    for (const [actorId, actorEntry] of Object.entries(spellEntry.actorData)) {
      if (actorEntry?.usageStats !== undefined) {
        hadUsageStats = true;
        const { usageStats, ...rest } = actorEntry;
        cleanedActorData[actorId] = rest;
      } else {
        cleanedActorData[actorId] = actorEntry;
      }
    }

    cleaned[key] = { ...spellEntry, actorData: cleanedActorData };
  }

  return { cleaned, hadUsageStats };
}

export const stripUsageData = {
  key: 'stripUsageData',
  version: '1.0.0',
  name: 'Strip Usage Data',
  description: 'Remove legacy spell usage tracking data from user data journals',
  migrate: migrateStripUsageData
};
