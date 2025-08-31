import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { WizardSpellbookManager } from '../managers/_module.mjs';
import * as UIHelpers from '../ui/_module.mjs';
import * as DataHelpers from './_module.mjs';

/**
 * Preload spell data based on user role and settings
 * @returns {Promise<void>}
 */
export async function preloadSpellData() {
  const isGM = game.user.isGM;
  if (isGM) {
    const setupMode = game.settings.get(MODULE.ID, SETTINGS.SETUP_MODE);
    if (setupMode) {
      return await preloadForGMSetupMode();
    } else {
      log(3, 'GM Setup Mode disabled - no preloading');
    }
  } else {
    return await preloadForPlayer();
  }
}

/**
 * Preload all spell data for GM setup mode
 * @returns {Promise<void>}
 */
async function preloadForGMSetupMode() {
  log(3, 'Starting GM setup mode preload - loading all spells and lists');
  try {
    const allSpellLists = await DataHelpers.findCompendiumSpellLists(true);
    allSpellLists.sort((a, b) => a.name.localeCompare(b.name));
    const allSpells = await DataHelpers.fetchAllCompendiumSpells();
    const enrichedSpells = enrichSpellsWithIcons(allSpells);
    cachePreloadedData(allSpellLists, enrichedSpells, 'gm-setup');
    const message = `Spell Book ready for GM setup! (${allSpellLists.length} lists, ${enrichedSpells.length} spells)`; // Localize
    if (ui.notifications.success) ui.notifications.success(message, { console: false });
    else ui.notifications.info(message, { console: false });
    log(3, `GM setup preload completed: ${allSpellLists.length} lists, ${enrichedSpells.length} spells`);
  } catch (error) {
    log(1, 'Error during GM setup mode preload', error);
  }
}

/**
 * Preload relevant spell data for player characters
 * @returns {Promise<void>}
 */
async function preloadForPlayer() {
  log(3, 'Starting player preload - loading assigned spell lists and wizard Spell Book');
  try {
    const playerActor = getCurrentPlayerActor();
    if (!playerActor) {
      cachePreloadedData([], [], 'no-character');
      log(3, 'No assigned character found for player - no preloading');
      return;
    }
    const spellUuids = await collectPlayerSpellUuids(playerActor);
    const normalizedUuids = normalizeSpellUuids(spellUuids);
    const allSpells = await DataHelpers.fetchAllCompendiumSpells();
    const relevantSpells = allSpells.filter((spell) => normalizedUuids.has(spell.uuid));
    const enrichedSpells = enrichSpellsWithIcons(relevantSpells);
    cachePreloadedData([], enrichedSpells, 'player');
    const message = `Your Spell Book is ready! (${enrichedSpells.length} spells loaded)`; // Localize
    if (ui.notifications.success) ui.notifications.success(message, { console: false });
    else ui.notifications.info(message, { console: false });
    log(3, `Player preload completed: ${enrichedSpells.length} spells`);
  } catch (error) {
    log(1, 'Error during player preload', error);
  }
}

/**
 * Get the current player's assigned character
 * @returns {Actor5e|null} The player's character or null if none assigned
 */
function getCurrentPlayerActor() {
  const currentPlayer = game.users.players.find((player) => player._id === game.user.id);
  return currentPlayer?.character || null;
}

/**
 * Collect all relevant spell UUIDs for a player actor
 * @param {Actor5e} actor The player's actor
 * @returns {Promise<Set<string>>} Set of spell UUIDs
 */
async function collectPlayerSpellUuids(actor) {
  let spellUuids = new Set();
  const assignedListSpells = await getSpellsFromActorSpellLists(actor);
  assignedListSpells.forEach((uuid) => spellUuids.add(uuid));
  if (DataHelpers.isWizard(actor)) {
    const spellbookSpells = await getActorSpellbookSpells(actor);
    spellbookSpells.forEach((uuid) => spellUuids.add(uuid));
  }
  return spellUuids;
}

/**
 * Get spell UUIDs from spell lists assigned to actor's classes
 * @param {Actor5e} actor The actor to check
 * @returns {Promise<Array<string>>} Array of spell UUIDs
 */
async function getSpellsFromActorSpellLists(actor) {
  const spellUuids = [];
  if (!actor.spellcastingClasses) return spellUuids;
  for (const [classIdentifier, classData] of Object.entries(actor.spellcastingClasses)) {
    const classItem = actor.items.get(classData.id);
    if (!classItem) {
      log(2, `Could not find class item for ${classIdentifier}`);
      continue;
    }
    const spellcastingConfig = DataHelpers.getSpellcastingConfigForClass(actor, classIdentifier);
    if (!spellcastingConfig) continue;
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    const spellList = await DataHelpers.getClassSpellList(className, classUuid, actor);
    if (spellList && spellList.size > 0) {
      spellList.forEach((spellUuid) => spellUuids.push(spellUuid));
      log(3, `Found ${spellList.size} spells for ${className} class (${classIdentifier})`);
    }
  }
  log(3, `Total spell UUIDs from actor spell lists: ${spellUuids.length}`);
  return spellUuids;
}

/**
 * Get spell UUIDs from actor's wizard Spell Book
 * @param {Actor5e} actor The actor to check
 * @returns {Promise<Array<string>>} Array of spell UUIDs
 */
async function getActorSpellbookSpells(actor) {
  const spellUuids = [];
  const wizardClasses = DataHelpers.getWizardEnabledClasses(actor);
  for (const { identifier } of wizardClasses) {
    try {
      const wizardManager = new WizardSpellbookManager(actor, identifier);
      if (wizardManager.isWizard) {
        const spellbookJournal = await wizardManager.findSpellbookJournal();
        if (spellbookJournal) {
          const journalPage = spellbookJournal.pages.find((p) => p.type === 'spells');
          if (journalPage && journalPage.system.spells) {
            const spellsSet = journalPage.system.spells;
            if (spellsSet instanceof Set) spellsSet.forEach((spellUuid) => spellUuids.push(spellUuid));
            else if (Array.isArray(spellsSet)) spellUuids.push(...spellsSet);
            log(3, `Found ${spellsSet.size || spellsSet.length} spells in ${identifier} Spell Book`);
          }
        }
      }
    } catch (error) {
      log(2, `Error getting Spell Book spells for ${identifier}:`, error);
    }
  }
  log(3, `Total spell UUIDs from wizard spellbooks: ${spellUuids.length}`);
  return spellUuids;
}

/**
 * Check if preloaded data is available and valid
 * @returns {boolean} True if valid preloaded data exists
 */
export function hasValidPreloadedData() {
  const preloadedData = globalThis.SPELLBOOK?.preloadedData;
  if (!preloadedData) return false;
  const currentVersion = game.modules.get(MODULE.ID).version;
  return preloadedData.version === currentVersion;
}

/**
 * Get preloaded spell data if valid
 * @returns {Object|null} Preloaded data or null if invalid
 */
export function getPreloadedData() {
  return hasValidPreloadedData() ? globalThis.SPELLBOOK.preloadedData : null;
}

/**
 * Cache preloaded data to global scope
 * @param {Array} spellLists Array of spell list objects
 * @param {Array} enrichedSpells Array of enriched spell objects
 * @param {string} mode The preload mode used
 */
function cachePreloadedData(spellLists, enrichedSpells, mode) {
  globalThis.SPELLBOOK.preloadedData = { spellLists, enrichedSpells, timestamp: Date.now(), version: game.modules.get(MODULE.ID).version, mode };
}

/**
 * Invalidate spell cache when relevant compendium content changes
 */
export function invalidateSpellListCache() {
  if (globalThis.SPELLBOOK?.preloadedData) {
    log(3, 'Invalidating preloaded spell data due to compendium changes');
    globalThis.SPELLBOOK.preloadedData = null;
    if (game.user.isGM) {
      setTimeout(async () => {
        const setupMode = game.settings.get(MODULE.ID, SETTINGS.SETUP_MODE);
        if (setupMode) await preloadSpellData();
      }, 1000);
    }
  }
}

/**
 * Check if a journal page should trigger cache invalidation
 * @param {JournalEntryPage} page The journal page to check
 * @returns {boolean} True if this page affects spell lists and should invalidate cache
 */
export function shouldInvalidateCacheForPage(page) {
  if (page.type !== 'spells') return false;
  if (page.system?.type === 'other') return false;
  const journal = page.parent;
  if (!journal?.pack) return false;
  const pack = game.packs.get(journal.pack);
  if (!pack || pack.metadata.type !== 'JournalEntry') return false;
  return DataHelpers.shouldIndexCompendium(pack);
}

/**
 * Normalize spell UUIDs to match compendium format
 * @param {Set<string>} spellUuids Set of spell UUIDs to normalize
 * @returns {Set<string>} Set of normalized UUIDs
 */
function normalizeSpellUuids(spellUuids) {
  const normalizedUuids = new Set();
  spellUuids.forEach((uuid) => {
    const normalizedUuid = uuid.replace('.Item.', '.');
    normalizedUuids.add(normalizedUuid);
  });
  return normalizedUuids;
}

/**
 * Enrich spells with icon links
 * @param {Array} spells Array of spell objects
 * @returns {Array} Array of spells with enriched icons
 */
function enrichSpellsWithIcons(spells) {
  const enrichedSpells = spells.slice();
  if (spells.length > 0) for (let spell of enrichedSpells) spell.enrichedIcon = UIHelpers.createSpellIconLink(spell);
  return enrichedSpells;
}
