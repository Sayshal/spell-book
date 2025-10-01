/**
 * Spell Data Preloading and Caching System
 *
 * Manages preloading and caching of spell data for performance optimization.
 * This module handles bulk spell loading, cache management, and provides
 * optimized access to frequently used spell data across the application.
 *
 * Key features:
 * - Bulk spell data preloading
 * - Intelligent caching strategies
 * - Player-specific spell filtering
 * - Performance optimization for large datasets
 * - Memory-efficient data storage
 * - Version-aware cache invalidation
 *
 * @module DataHelpers/SpellDataPreloader
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { WizardSpellbookManager } from '../managers/_module.mjs';
import * as UIHelpers from '../ui/_module.mjs';
import * as DataHelpers from './_module.mjs';

/**
 * @typedef {Object} PreloadedSpellData
 * @property {Array<SpellListMetadata>} spellLists - Array of available spell lists
 * @property {Array<EnrichedSpellData>} enrichedSpells - Array of enriched spell data
 * @property {number} timestamp - Timestamp when data was preloaded
 * @property {string} version - Module version when data was preloaded
 * @property {string} mode - Preload mode used ('gm-setup', 'player', 'no-character')
 */

/**
 * @typedef {Object} EnrichedSpellData
 * @property {string} uuid - Unique identifier for the spell
 * @property {string} name - Display name of the spell
 * @property {string} img - Image path for the spell icon
 * @property {number} level - Spell level (0-9)
 * @property {string} school - School of magic identifier
 * @property {string} sourceId - Source identifier for filtering
 * @property {string} packName - Display name of the source pack
 * @property {Object} system - System-specific spell data
 * @property {Object} labels - Computed labels for display
 * @property {Object} filterData - Extracted filter data for UI
 * @property {string} enrichedIcon - HTML string for spell icon link
 */

/**
 * @typedef {Object} PlayerActor
 * @property {string} _id - Unique actor ID
 * @property {string} name - Actor display name
 * @property {string} type - Actor type (should be 'character')
 * @property {Object} spellcastingClasses - Spellcasting class data
 * @property {Collection} items - Actor's item collection
 */

/**
 * @typedef {Object} SpellbookData
 * @property {JournalEntry} journal - The spellbook journal document
 * @property {JournalEntryPage} page - The spells page within the journal
 * @property {Set<string>|Array<string>} spells - Collection of spell UUIDs
 */

/**
 * @typedef {Object} PreloadResult
 * @property {boolean} success - Whether preloading completed successfully
 * @property {string} mode - The preload mode that was used
 * @property {number} spellListCount - Number of spell lists loaded
 * @property {number} spellCount - Number of spells loaded
 * @property {string} [error] - Error message if preloading failed
 */

/**
 * Preload spell data based on user role and settings.
 * Determines the appropriate preloading strategy based on whether the user
 * is a GM with setup mode enabled or a player with an assigned character.
 *
 * @returns {Promise<void>}
 */
export async function preloadSpellData() {
  const settings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
  const isEmptySettings = !settings || typeof settings !== 'object' || Object.keys(settings).length === 0;
  if (isEmptySettings && game.user.isGM) ui.notifications.warn(game.i18n.localize('SPELLBOOK.Settings.NoCompendiumsConfigured'));
  const isGM = game.user.isGM;
  if (isGM) {
    const setupMode = game.settings.get(MODULE.ID, SETTINGS.SETUP_MODE);
    if (setupMode) return await preloadForGMSetupMode();
    else log(3, 'GM Setup Mode disabled - no preloading');
  } else return await preloadForPlayer();
}

/**
 * Preload all spell data for GM setup mode.
 * Loads all available spell lists and spells from enabled compendiums
 * to provide data for GM configuration interfaces.
 *
 * @returns {Promise<void>}
 * @private
 */
async function preloadForGMSetupMode() {
  log(3, 'Starting GM setup mode preload - loading all spells and lists');
  try {
    const allSpellLists = await DataHelpers.findCompendiumSpellLists(true);
    allSpellLists.sort((a, b) => a.name.localeCompare(b.name));
    const allSpells = await DataHelpers.fetchAllCompendiumSpells();
    const enrichedSpells = enrichSpellsWithIcons(allSpells);
    cachePreloadedData(allSpellLists, enrichedSpells, 'gm-setup');
    const message = game.i18n.format('SPELLBOOK.Preload.GMSetupReady', { lists: allSpellLists.length, spells: enrichedSpells.length });
    ui.notifications.success(message, { console: false });
    log(3, `GM setup preload completed: ${allSpellLists.length} lists, ${enrichedSpells.length} spells`);
  } catch (error) {
    log(1, 'Error during GM setup mode preload', error);
  }
}

/**
 * Preload relevant spell data for player characters.
 * Identifies the player's assigned character and loads spell data
 * from their class spell lists and wizard spellbooks if applicable.
 *
 * @returns {Promise<void>}
 * @private
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
    const spellUuidsSet = new Set(spellUuids);
    const allSpells = await DataHelpers.fetchAllCompendiumSpells();
    const relevantSpells = allSpells.filter((spell) => spellUuidsSet.has(spell.uuid));
    const enrichedSpells = enrichSpellsWithIcons(relevantSpells);
    cachePreloadedData([], enrichedSpells, 'player');
    const message = game.i18n.format('SPELLBOOK.Preload.PlayerReady', { spells: enrichedSpells.length });
    ui.notifications.success(message, { console: false });
    log(3, `Player preload completed: ${enrichedSpells.length} spells loaded for ${playerActor.name}`);
  } catch (error) {
    log(1, 'Error during player preload', error);
  }
}

/**
 * Get the current player's assigned character.
 * Finds the character document assigned to the current user
 * in the game's user configuration.
 *
 * @returns {PlayerActor|null} The player's character or null if none assigned
 * @private
 */
function getCurrentPlayerActor() {
  const currentPlayer = game.users.players.find((player) => player._id === game.user.id);
  return currentPlayer?.character || null;
}

/**
 * Collect all relevant spell UUIDs for a player actor.
 * Gathers spell UUIDs from the actor's class spell lists and wizard
 * spellbooks to determine which spells should be preloaded.
 *
 * @param {PlayerActor} actor - The player's actor to collect spells for
 * @returns {Promise<Set<string>>} Set of spell UUIDs relevant to this actor
 * @private
 */
async function collectPlayerSpellUuids(actor) {
  /** @type {Set<string>} */
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
 * Get spell UUIDs from spell lists assigned to actor's classes.
 * Iterates through the actor's spellcasting classes and retrieves
 * spell UUIDs from their associated spell lists.
 *
 * @param {PlayerActor} actor - The actor to check for class spell lists
 * @returns {Promise<Array<string>>} Array of spell UUIDs from class lists
 * @private
 */
async function getSpellsFromActorSpellLists(actor) {
  /** @type {Array<string>} */
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
 * Get spell UUIDs from actor's wizard spellbooks.
 * Retrieves spells from all wizard-enabled classes' spellbook journals
 * for characters with wizard capabilities.
 *
 * @param {PlayerActor} actor - The actor to check for wizard spellbooks
 * @returns {Promise<Array<string>>} Array of spell UUIDs from wizard spellbooks
 * @private
 */
async function getActorSpellbookSpells(actor) {
  /** @type {Array<string>} */
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
 * Check if preloaded data is available and valid.
 * Validates that cached preloaded data exists and matches the current
 * module version to ensure compatibility.
 *
 * @returns {boolean} True if valid preloaded data exists
 */
export function hasValidPreloadedData() {
  const preloadedData = globalThis.SPELLBOOK?.preloadedData;
  if (!preloadedData) return false;
  const currentVersion = game.modules.get(MODULE.ID).version;
  return preloadedData.version === currentVersion;
}

/**
 * Get preloaded spell data if valid.
 * Retrieves cached preloaded data after validating its existence
 * and version compatibility.
 *
 * @returns {PreloadedSpellData|null} Preloaded data or null if invalid
 */
export function getPreloadedData() {
  return hasValidPreloadedData() ? globalThis.SPELLBOOK.preloadedData : null;
}

/**
 * Cache preloaded data to global scope.
 * Stores preloaded spell and spell list data in the global SPELLBOOK
 * namespace for access by other module components.
 *
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
 * Clears cached preloaded data and triggers automatic reloading
 * for GMs with setup mode enabled when content changes are detected.
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
 * Check if a journal page should trigger cache invalidation.
 * Determines whether changes to a specific journal page affect
 * spell list data and should invalidate the preloaded cache.
 *
 * @param {JournalEntryPage} page - The journal page to check
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
 * Enrich spells with icon links for UI display.
 * Adds enriched icon HTML to spell objects for consistent
 * display across the module's user interfaces.
 *
 * @param {Array<Object>} spells - Array of spell objects to enrich
 * @returns {Array<EnrichedSpellData>} Array of spells with enriched icons
 * @private
 */
function enrichSpellsWithIcons(spells) {
  const enrichedSpells = spells.slice();
  if (spells.length > 0) for (let spell of enrichedSpells) spell.enrichedIcon = UIHelpers.createSpellIconLink(spell);
  return enrichedSpells;
}
