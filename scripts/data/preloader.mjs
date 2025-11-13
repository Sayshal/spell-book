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

const { Collection, duplicate } = foundry.utils;

/**
 * Preload spell data based on user role and settings.
 * @param {boolean} [showNotification=false] - Whether to show success notification
 * @returns {Promise<void>}
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
    else return await preloadForGMPartyMode(showNotification);
  } else return await preloadForPlayer(showNotification);
}

/**
 * Preload all spell data for GM setup mode.
 * @param {boolean} [showNotification=false] - Whether to show success notification
 * @returns {Promise<void>}
 * @private
 */
async function preloadForGM(showNotification = false) {
  log(3, 'Preloading data for GM in setup mode.');
  const allSpellLists = await DataUtils.findCompendiumSpellLists(true);
  allSpellLists.sort((a, b) => a.name.localeCompare(b.name));
  const allSpells = await DataUtils.fetchAllCompendiumSpells();
  const enrichedSpells = await enrichSpellsWithIcons(allSpells);
  cachePreloadedData(allSpellLists, enrichedSpells, 'gm-setup');
  if (showNotification) {
    const message = game.i18n.format('SPELLBOOK.Preload.GMSetupReady', { lists: allSpellLists.length, spells: enrichedSpells.size });
    ui.notifications.success(message, { console: false });
  }
}

/**
 * Preload spell data for GM in party mode (non-setup).
 * Loads spells for all player characters in party actors.
 * @param {boolean} [showNotification=false] - Whether to show success notification
 * @returns {Promise<void>}
 * @private
 */
async function preloadForGMPartyMode(showNotification = false) {
  log(3, 'Preloading data for GM in party mode.');
  const playerActors = new Set();
  for (const actor of game.actors) {
    if (actor.type === 'group') {
      const members = actor.system?.members || [];
      for (const member of members) {
        const memberActor = member?.actor;
        if (memberActor && memberActor.hasPlayerOwner) playerActors.add(memberActor);
      }
    }
  }
  for (const user of game.users) if (!user.isGM && user.character) playerActors.add(user.character);
  if (playerActors.size === 0) {
    log(3, 'No player actors found for GM party mode.');
    cachePreloadedData([], new Collection(), 'gm-party');
    return;
  }
  const allSpellUuids = new Set();
  const allSpellLevels = new Set();
  for (const actor of playerActors) {
    const { spellUuids, spellLevels } = await collectPlayerSpellUuids(actor);
    spellUuids.forEach((uuid) => allSpellUuids.add(uuid));
    spellLevels.forEach((level) => allSpellLevels.add(level));
  }
  const allSpells = await DataUtils.fetchAllCompendiumSpells();
  const filters = [{ k: 'uuid', v: Array.from(allSpellUuids), o: 'in' }];
  // Filter by spell levels just like preloadForPlayer does
  if (allSpellLevels.size > 0) filters.push({ k: 'system.level', v: Array.from(allSpellLevels), o: 'in' });
  const relevantSpells = allSpells.filter((spell) => dnd5e.Filter.performCheck(spell, filters));
  const enrichedSpells = await enrichSpellsWithIcons(relevantSpells);
  cachePreloadedData([], enrichedSpells, 'gm-party');
  if (showNotification) {
    const message = game.i18n.format('SPELLBOOK.Preload.GMPartyReady', { actors: playerActors.size, spells: enrichedSpells.size });
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
    cachePreloadedData([], new Collection(), 'no-character');
    return;
  }
  const { spellUuids, spellLevels } = await collectPlayerSpellUuids(playerActor);
  const allSpells = await DataUtils.fetchAllCompendiumSpells();
  const filters = [{ k: 'uuid', v: Array.from(spellUuids), o: 'in' }];
  if (spellLevels.size > 0) filters.push({ k: 'system.level', v: Array.from(spellLevels), o: 'in' });
  const relevantSpells = allSpells.filter((spell) => dnd5e.Filter.performCheck(spell, filters));
  const enrichedSpells = await enrichSpellsWithIcons(relevantSpells);
  cachePreloadedData([], enrichedSpells, 'player');
  if (showNotification) {
    const message = game.i18n.format('SPELLBOOK.Preload.PlayerReady', { spells: enrichedSpells.size });
    ui.notifications.success(message, { console: false });
  }
}

/**
 * Collect all relevant spell UUIDs and spell levels for a player actor.
 * @param {Object} actor - The player's actor to collect spells for
 * @returns {Promise<{spellUuids: Set<string>, spellLevels: Set<number>}>} Spell UUIDs and levels relevant to this actor
 * @private
 */
async function collectPlayerSpellUuids(actor) {
  log(3, 'Collecting player spells for:', { character: actor.name, actor });
  const spellUuids = new Set();
  const spellLevels = new Set();
  const assignedListSpells = await getSpellsFromActorSpellLists(actor);
  assignedListSpells.forEach(({ uuid, level }) => {
    spellUuids.add(uuid);
    if (level !== undefined) spellLevels.add(level);
  });
  if (Object.keys(DataUtils.getWizardData(actor)).length) {
    const spellbookSpells = await getActorSpellbookSpells(actor);
    spellbookSpells.forEach(({ uuid, level }) => {
      spellUuids.add(uuid);
      if (level !== undefined) spellLevels.add(level);
    });
  }
  return { spellUuids, spellLevels };
}

/**
 * Get spell UUIDs and levels from spell lists assigned to actor's classes.
 * @param {Object} actor - The actor to check for class spell lists
 * @returns {Promise<Array<{uuid: string, level?: number}>>} Array of spell data from class lists
 * @private
 */
async function getSpellsFromActorSpellLists(actor) {
  log(3, 'Getting spells from actor spell lists for:', { character: actor.name, actor });
  const spellData = [];
  if (!actor.spellcastingClasses) return spellData;
  for (const [classIdentifier, classData] of Object.entries(actor.spellcastingClasses)) {
    const classItem = actor.items.get(classData.id);
    if (!classItem) continue;
    const spellcastingConfig = DataUtils.getSpellcastingConfigForClass(actor, classIdentifier);
    if (!spellcastingConfig) continue;
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    const spellList = await DataUtils.getClassSpellList(className, classUuid, actor);
    if (spellList && spellList.size > 0) {
      for (const spellUuid of spellList) {
        const spellIndex = dnd5e.utils.indexFromUuid(spellUuid);
        const level = spellIndex?.system?.level;
        spellData.push({ uuid: spellUuid, level });
      }
      log(3, `Found ${spellList.size} spells for ${className} class (${classIdentifier})`);
    }
  }
  return spellData;
}

/**
 * Get spell UUIDs and levels from actor's wizard spellbooks.
 * @param {Object} actor - The actor to check for wizard spellbooks
 * @returns {Promise<Array<{uuid: string, level?: number}>>} Array of spell data from wizard spellbooks
 * @private
 */
async function getActorSpellbookSpells(actor) {
  log(3, 'Getting actor spellbook spells for:', { character: actor.name, actor });
  const spellData = [];
  const wizardData = DataUtils.getWizardData(actor);
  for (const identifier of Object.keys(wizardData)) {
    const wizardManager = new WizardBook(actor, identifier);
    try {
      if (wizardManager.isWizard) {
        const spellbookJournal = await wizardManager.findSpellbookJournal();
        if (spellbookJournal) {
          const journalPage = spellbookJournal.pages.find((p) => p.type === 'spells');
          if (journalPage && journalPage.system.spells) {
            const spellsSet = journalPage.system.spells;
            const spellUuids = spellsSet instanceof Set ? Array.from(spellsSet) : Array.isArray(spellsSet) ? spellsSet : [];
            for (const spellUuid of spellUuids) {
              const spellIndex = dnd5e.utils.indexFromUuid(spellUuid);
              const level = spellIndex?.system?.level;
              spellData.push({ uuid: spellUuid, level });
            }
          }
        }
      }
    } finally {
      wizardManager.invalidateCache();
    }
  }
  return spellData;
}

/**
 * Get preloaded spell data if valid.
 * @returns {Object|null} Preloaded data or null if invalid
 */
export function getPreloadedData() {
  const preloadedData = globalThis.SPELLBOOK?.preloadedData;
  const currentVersion = game.modules.get(MODULE.ID)?.version;
  const validPreloaded = preloadedData?.version === currentVersion;
  log(3, 'Is this valid preload data?', { valid: !!validPreloaded });
  return validPreloaded ? preloadedData : null;
}

/**
 * Cache preloaded data to global scope.
 * @param {Array<Object>} spellLists - Array of spell list objects
 * @param {Collection<string, Object>} enrichedSpells - Collection of enriched spell objects
 * @param {string} mode - The preload mode used ('gm-setup', 'gm-party', 'player', 'no-character')
 * @private
 */
function cachePreloadedData(spellLists, enrichedSpells, mode) {
  // Store Collection directly for better performance
  const spellsCollection = enrichedSpells instanceof Collection ? enrichedSpells : new Collection(enrichedSpells.map((s) => [s.uuid || s._id, s]));
  globalThis.SPELLBOOK.preloadedData = { spellLists, enrichedSpells: spellsCollection, timestamp: Date.now(), version: game.modules.get(MODULE.ID).version, mode };
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
 * @param {Object} page - The journal page to check
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
 * Enrich spells with icon links for UI display using custom implementation.
 * @param {Collection<Object>|Array<Object>} spells - Collection or array of spell objects to enrich
 * @returns {Promise<Collection<string, Object>>} Collection of spells with enriched icons
 * @private
 */
async function enrichSpellsWithIcons(spells) {
  const spellCollection = spells instanceof Collection ? spells : new Collection();
  if (!(spells instanceof Collection)) for (const spell of spells) spellCollection.set(spell.uuid || spell._id, spell);
  const enrichedSpells = new Collection();
  for (const [key, spell] of spellCollection.entries()) {
    const enrichedSpell = duplicate(spell);
    enrichedSpell.enrichedIcon = UIUtils.createSpellIconLink(spell);
    enrichedSpells.set(key, enrichedSpell);
  }
  return enrichedSpells;
}
