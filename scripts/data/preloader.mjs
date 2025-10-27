/**
 * Spell Data Preloading and Caching System
 *
 * Manages preloading and caching of spell data for performance optimization.
 * This module handles bulk spell loading, cache management, and provides
 * optimized access to frequently used spell data across the application.
 *
 * @module DataUtils/SpellDataPreloader
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { WizardBook } from '../managers/_module.mjs';
import * as UIUtils from '../ui/_module.mjs';
import * as DataUtils from './_module.mjs';

/**
 * Preload spell data based on user role and settings.
 * @param {boolean} [showNotification=false] - Whether to show success notification
 * @returns {Promise<void>}
 * @todo isGM but !setupMode, GM should still load spell/spell lists for each player in a party actor.
 */
export async function preloadData(showNotification = false) {
  log(3, 'Preloading data.');
  const settings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
  const isEmptySettings = !settings || typeof settings !== 'object' || Object.keys(settings).length === 0;
  if (isEmptySettings && game.user.isGM) ui.notifications.warn(game.i18n.localize('SPELLBOOK.Settings.NoCompendiumsConfigured'));
  const isGM = game.user.isGM;
  if (isGM) {
    const setupMode = game.settings.get(MODULE.ID, SETTINGS.SETUP_MODE);
    if (setupMode) return await preloadForGM(showNotification);
  } else return await preloadForPlayer(showNotification);
}

/**
 * Preload all spell data for GM setup mode.
 * @param {boolean} [showNotification=false] - Whether to show success notification
 * @returns {Promise<void>}
 * @private
 */
async function preloadForGM(showNotification = false) {
  log(3, 'Preloading data for GM.');
  const allSpellLists = await DataUtils.findCompendiumSpellLists(true);
  allSpellLists.sort((a, b) => a.name.localeCompare(b.name));
  const allSpells = await DataUtils.fetchAllCompendiumSpells();
  const enrichedSpells = enrichSpellsWithIcons(allSpells);
  cachePreloadedData(allSpellLists, enrichedSpells, 'gm-setup');
  if (showNotification) {
    const message = game.i18n.format('SPELLBOOK.Preload.GMSetupReady', { lists: allSpellLists.length, spells: enrichedSpells.length });
    ui.notifications.success(message, { console: false });
  }
}

/**
 * Preload relevant spell data for player characters.
 * @param {boolean} [showNotification=false] - Whether to show success notification
 * @returns {Promise<void>}
 * @private
 */
async function preloadForPlayer(showNotification = false) {
  log(3, 'Preloading data for player.');
  const playerActor = game?.user?.character;
  if (!playerActor) {
    log(3, 'No player actor found, preloading data with "no-char" mode.');
    cachePreloadedData([], [], 'no-character');
    return;
  }
  const spellUuids = await collectPlayerSpellUuids(playerActor);
  const allSpells = await DataUtils.fetchAllCompendiumSpells();
  const relevantSpells = allSpells.filter((spell) => spellUuids.has(spell.uuid));
  const enrichedSpells = enrichSpellsWithIcons(relevantSpells);
  cachePreloadedData([], enrichedSpells, 'player');
  if (showNotification) {
    const message = game.i18n.format('SPELLBOOK.Preload.PlayerReady', { spells: enrichedSpells.length });
    ui.notifications.success(message, { console: false });
  }
}

/**
 * Collect all relevant spell UUIDs for a player actor.
 * @param {PlayerActor} actor - The player's actor to collect spells for
 * @returns {Promise<Set<string>>} Set of spell UUIDs relevant to this actor
 * @private
 */
async function collectPlayerSpellUuids(actor) {
  log(3, 'Collecting player spells for:', { character: actor.name, actor });
  /** @type {Set<string>} */
  let spellUuids = new Set();
  const assignedListSpells = await getSpellsFromActorSpellLists(actor);
  assignedListSpells.forEach((uuid) => spellUuids.add(uuid));
  if (DataUtils.isWizard(actor)) {
    const spellbookSpells = await getActorSpellbookSpells(actor);
    spellbookSpells.forEach((uuid) => spellUuids.add(uuid));
  }
  return spellUuids;
}

/**
 * Get spell UUIDs from spell lists assigned to actor's classes.
 * @param {PlayerActor} actor - The actor to check for class spell lists
 * @returns {Promise<Array<string>>} Array of spell UUIDs from class lists
 * @private
 */
async function getSpellsFromActorSpellLists(actor) {
  log(3, 'Getting spells from actor spell lists for:', { character: actor.name, actor });
  /** @type {Array<string>} */
  const spellUuids = [];
  if (!actor.spellcastingClasses) return spellUuids;
  for (const [classIdentifier, classData] of Object.entries(actor.spellcastingClasses)) {
    const classItem = actor.items.get(classData.id);
    if (!classItem) continue;
    const spellcastingConfig = DataUtils.getSpellcastingConfigForClass(actor, classIdentifier);
    if (!spellcastingConfig) continue;
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    const spellList = await DataUtils.getClassSpellList(className, classUuid, actor);
    if (spellList && spellList.size > 0) {
      spellList.forEach((spellUuid) => spellUuids.push(spellUuid));
      log(3, `Found ${spellList.size} spells for ${className} class (${classIdentifier})`);
    }
  }
  return spellUuids;
}

/**
 * Get spell UUIDs from actor's wizard spellbooks.
 * @param {PlayerActor} actor - The actor to check for wizard spellbooks
 * @returns {Promise<Array<string>>} Array of spell UUIDs from wizard spellbooks
 * @todo Should we destroy this wizardbook after getting the object we need here?
 * @private
 */
async function getActorSpellbookSpells(actor) {
  log(3, 'Getting actor spellbook spells for:', { character: actor.name, actor });
  /** @type {Array<string>} */
  const spellUuids = [];
  const wizardClasses = DataUtils.getWizardEnabledClasses(actor);
  for (const { identifier } of wizardClasses) {
    const wizardManager = new WizardBook(actor, identifier);
    if (wizardManager.isWizard) {
      const spellbookJournal = await wizardManager.findSpellbookJournal();
      if (spellbookJournal) {
        const journalPage = spellbookJournal.pages.find((p) => p.type === 'spells');
        if (journalPage && journalPage.system.spells) {
          const spellsSet = journalPage.system.spells;
          if (spellsSet instanceof Set) spellsSet.forEach((spellUuid) => spellUuids.push(spellUuid));
          else if (Array.isArray(spellsSet)) spellUuids.push(...spellsSet);
        }
      }
    }
  }
  return spellUuids;
}

/**
 * Check if preloaded data is available and valid.
 * @returns {boolean} True if valid preloaded data exists
 */
function hasValidPreloadedData() {
  const preloadedData = globalThis.SPELLBOOK?.preloadedData;
  const currentVersion = game.modules.get(MODULE.ID).version;
  const validPreloaded = preloadedData?.version === currentVersion;
  log(3, 'Is this valid preload data?', { valid: !!validPreloaded });
  return validPreloaded;
}

/**
 * Get preloaded spell data if valid.
 * @returns {PreloadedSpellData|null} Preloaded data or null if invalid
 * @todo Do we need this 'wrapper' for hasValidPreloadedData? Can we merge?
 */
export function getPreloadedData() {
  return hasValidPreloadedData() ? globalThis.SPELLBOOK.preloadedData : null;
}

/**
 * Cache preloaded data to global scope.
 * @param {Array<SpellListMetadata>} spellLists - Array of spell list objects
 * @param {Array<EnrichedSpellData>} enrichedSpells - Array of enriched spell objects
 * @param {string} mode - The preload mode used ('gm-setup', 'player', 'no-character')
 * @private
 */
function cachePreloadedData(spellLists, enrichedSpells, mode) {
  globalThis.SPELLBOOK.preloadedData = { spellLists, enrichedSpells, timestamp: Date.now(), version: game.modules.get(MODULE.ID).version, mode };
}

/**
 * Invalidate spell cache when relevant compendium content changes.
 */
export function invalidateSpellListCache() {
  log(3, 'Invalidating spell list cache.');
  if (globalThis.SPELLBOOK?.preloadedData) {
    globalThis.SPELLBOOK.preloadedData = null;
    if (game.user.isGM) {
      setTimeout(async () => {
        const setupMode = game.settings.get(MODULE.ID, SETTINGS.SETUP_MODE);
        if (setupMode) await preloadData();
      }, 1000);
    }
  }
}

/**
 * Check if a journal page should trigger cache invalidation.
 * @param {JournalEntryPage} page - The journal page to check
 * @returns {boolean} True if this page affects spell lists and should invalidate cache
 */
export function shouldInvalidateCacheForPage(page) {
  log(3, 'Checking if invalidation required for:', { page });
  if (page.type !== 'spells') return false;
  if (page.system?.type === 'other') return false;
  const journal = page.parent;
  if (!journal?.pack) return false;
  const pack = game.packs.get(journal.pack);
  if (!pack || pack.metadata.type !== 'JournalEntry') return false;
  return DataUtils.shouldIndexCompendium(pack);
}

/**
 * Enrich spells with icon links for UI display.
 * @param {Array<Object>} spells - Array of spell objects to enrich
 * @returns {Array<EnrichedSpellData>} Array of spells with enriched icons
 * @private
 */
function enrichSpellsWithIcons(spells) {
  const enrichedSpells = spells.slice();
  if (spells.length > 0) for (let spell of enrichedSpells) spell.enrichedIcon = UIUtils.createSpellIconLink(spell);
  return enrichedSpells;
}
