import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as managerHelpers from './compendium-management.mjs';
import * as discoveryUtils from './spell-discovery.mjs';
import * as formattingUtils from './spell-formatting.mjs';

/**
 * Preload spell data based on user settings
 * @returns {Promise<void>}
 */
export async function preloadSpellData() {
  const preloadMode = game.settings.get(MODULE.ID, SETTINGS.SPELL_PRELOADING_MODE);
  if (preloadMode === 'off') {
    log(3, 'Spell preloading disabled by user setting');
    return;
  }
  const hasProgressNotifications = foundry.utils.isNewerVersion(game.version, '12.999');
  let progress = null;
  if (hasProgressNotifications) {
    const modeText = preloadMode === 'smart' ? 'character spells' : 'all spells';
    progress = ui.notifications.info(`Loading Spell Book data (${modeText})...`, {
      progress: true,
      permanent: true
    });
  }
  try {
    log(3, `Starting spell data preload in '${preloadMode}' mode...`);
    if (progress) progress.update({ pct: 0.05, message: 'Initializing...' });
    managerHelpers.getValidCustomListMappings();
    if (progress) progress.update({ pct: 0.1, message: 'Discovering spell lists...' });
    const allSpellLists = await managerHelpers.findCompendiumSpellLists(true);
    allSpellLists.sort((a, b) => a.name.localeCompare(b.name));
    if (progress) progress.update({ pct: 0.3, message: `Found ${allSpellLists.length} spell lists` });
    let spellLists, allSpells;
    if (preloadMode === 'smart') ({ spellLists, allSpells } = await loadSmartSpells(allSpellLists, progress));
    else ({ spellLists, allSpells } = await loadAllSpells(allSpellLists, progress));
    if (progress) progress.update({ pct: 0.85, message: 'Enriching spell icons...' });
    const enrichedSpells = allSpells.slice();
    if (allSpells.length) {
      for (let spell of enrichedSpells) spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
    }
    if (progress) progress.update({ pct: 0.95, message: 'Caching spell data...' });
    globalThis.SPELLBOOK.preloadedData = { spellLists, enrichedSpells, timestamp: Date.now(), version: game.modules.get(MODULE.ID).version, mode: preloadMode };
    if (progress) {
      ui.notifications.remove(progress);
      const modeText = preloadMode === 'smart' ? ' (smart mode)' : '';
      if (ui.notifications.success) {
        ui.notifications.success(`Spell Book ready! (${spellLists.length} lists, ${enrichedSpells.length} spells)${modeText}`, { console: false });
      } else {
        ui.notifications.info(`Spell Book ready! (${spellLists.length} lists, ${enrichedSpells.length} spells)${modeText}`, { console: false });
      }
    }
    log(3, `Spell data preload completed (${preloadMode} mode)`);
  } catch (error) {
    log(1, 'Error during spell data preload:', error);
    if (progress) {
      progress.update({ pct: 1.0, message: 'Spell Book loading failed - will load on demand' });
      setTimeout(() => {
        if (ui.notifications.has(progress)) ui.notifications.remove(progress);
      }, 3000);
    }
    globalThis.SPELLBOOK.preloadedData = null;
  }
}

/**
 * Load all spells (original behavior)
 * @param {Array} allSpellLists - All available spell lists
 * @param {Object} progress - Progress notification
 * @returns {Promise<{spellLists: Array, allSpells: Array}>}
 */
async function loadAllSpells(allSpellLists, progress) {
  if (progress) progress.update({ pct: 0.4, message: 'Fetching all compendium spells...' });
  const allSpells = await managerHelpers.fetchAllCompendiumSpells();
  if (progress) progress.update({ pct: 0.8, message: `Loaded ${allSpells.length} spells` });
  log(3, `Preloaded ${allSpells.length} compendium spells (all mode)`);
  return { spellLists: allSpellLists, allSpells };
}

/**
 * Load only spells relevant to player characters (smart mode)
 * @param {Array} allSpellLists - All available spell lists
 * @param {Object} progress - Progress notification
 * @returns {Promise<{spellLists: Array, allSpells: Array}>}
 */
async function loadSmartSpells(allSpellLists, progress) {
  if (progress) progress.update({ pct: 0.35, message: 'Analyzing player characters...' });

  // Find player-owned characters
  const allActors = Array.from(game.actors);
  const playerCharacters = allActors.filter((a) => a.hasPlayerOwner && a.type === 'character');

  log(3, `Smart preloading: Found ${playerCharacters.length} player characters`);

  if (playerCharacters.length === 0) {
    log(3, 'No player characters found - loading all lists but no spells (smart mode)');
    if (progress) progress.update({ pct: 0.8, message: 'No players - loading lists only' });
    return { spellLists: allSpellLists, allSpells: [] };
  }

  // Step 1: Get spell UUIDs that would be used by player characters
  const playerSpellUuids = await getPlayerCharacterSpellUuids(playerCharacters);

  // Step 2: Get spell UUIDs from Actor Spellbooks folder
  const actorSpellbookUuids = await getActorSpellbookSpellUuids();

  // Step 3: Combine and deduplicate
  const allRelevantUuids = new Set([...playerSpellUuids, ...actorSpellbookUuids]);

  // Remove ".Item" from UUIDs to match compendium spell format
  const normalizedUuids = new Set();
  allRelevantUuids.forEach((uuid) => {
    const normalizedUuid = uuid.replace('.Item.', '.');
    normalizedUuids.add(normalizedUuid);
  });

  log(3, `Total unique spell UUIDs (normalized): ${normalizedUuids.size}`);

  if (normalizedUuids.size === 0) {
    log(3, 'No relevant spells found - loading all lists but no spells (smart mode)');
    if (progress) progress.update({ pct: 0.8, message: 'No relevant spells found - loading lists only' });
    return { spellLists: allSpellLists, allSpells: [] };
  }

  if (progress) progress.update({ pct: 0.5, message: `Loading ${normalizedUuids.size} relevant spells...` });

  // Step 4: Load all spells and filter to only relevant ones
  const allSpells = await managerHelpers.fetchAllCompendiumSpells();
  const relevantSpells = allSpells.filter((spell) => normalizedUuids.has(spell.uuid));

  if (progress) progress.update({ pct: 0.8, message: `Loaded ${relevantSpells.length} relevant spells` });
  log(3, `Smart preloading completed: ${relevantSpells.length} spells from ${allRelevantUuids.size} spell UUIDs`);

  // Return ALL spell lists (for GM manager) but only relevant spells (for memory)
  return { spellLists: allSpellLists, allSpells: relevantSpells };
}

/**
 * Fetch spells for specific spell lists
 * @param {Array} spellLists - Spell lists to fetch spells for
 * @returns {Promise<Array>} Array of spell objects
 */
async function fetchSpellsForLists(spellLists) {
  log(3, `Fetching spells for ${spellLists.length} spell lists`);

  // If no lists provided, return nothing
  if (spellLists.length === 0) {
    log(3, 'No spell lists provided - returning empty array');
    return [];
  }

  const allSpellUuids = new Set();

  // Collect all spell UUIDs from the relevant lists
  for (const list of spellLists) {
    log(3, `Processing spell list: ${list.name}`);

    if (list.spellUuids && Array.isArray(list.spellUuids)) {
      log(3, `  - Found ${list.spellUuids.length} spell UUIDs`);
      list.spellUuids.forEach((uuid) => allSpellUuids.add(uuid));
    } else {
      log(3, `  - No spellUuids array found, list structure:`, Object.keys(list));
    }
  }

  log(3, `Total unique spell UUIDs collected: ${allSpellUuids.size}`);

  if (allSpellUuids.size === 0) {
    log(3, 'No spell UUIDs found in lists - returning empty array (no fallback)');
    return [];
  }

  // Load all spells and filter to our UUIDs
  const allSpells = await managerHelpers.fetchAllCompendiumSpells();
  const filteredSpells = allSpells.filter((spell) => allSpellUuids.has(spell.uuid));

  log(3, `Filtered ${filteredSpells.length} spells from ${allSpells.length} total based on spell list UUIDs`);
  return filteredSpells;
}

/**
 * Get spell UUIDs from Actor Spellbooks folder in module pack
 * @returns {Set<string>} Set of actor spellbook spell UUIDs
 */
async function getActorSpellbookSpellUuids() {
  const actorSpellbookSpellUuids = new Set();

  const spellsPack = game.packs.get(MODULE.PACK.SPELLS);
  if (!spellsPack) {
    log(2, 'Module spells pack not found');
    return actorSpellbookSpellUuids;
  }

  // Find Actor Spellbooks folder
  const actorSpellbooksFolderName = game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks');
  const actorSpellbooksFolder = spellsPack.folders.find((f) => f.name === actorSpellbooksFolderName);

  if (!actorSpellbooksFolder) {
    log(3, 'Actor Spellbooks folder not found in module pack');
    return actorSpellbookSpellUuids;
  }

  // Get all documents in the Actor Spellbooks folder
  const documents = await spellsPack.getDocuments();
  const folderDocuments = documents.filter((doc) => doc.folder?.id === actorSpellbooksFolder.id);

  for (const doc of folderDocuments) {
    if (!doc.pages) continue;

    for (const page of doc.pages) {
      if (page.type === 'spells' && page.system?.spells) {
        log(3, `Found actor spellbook: ${page.name} with ${page.system.spells.size} spells`);
        // Add all spell UUIDs from this spellbook
        page.system.spells.forEach((uuid) => actorSpellbookSpellUuids.add(uuid));
      }
    }
  }

  log(3, `Found ${actorSpellbookSpellUuids.size} spell UUIDs in Actor Spellbooks folder`);
  return actorSpellbookSpellUuids;
}

/**
 * Find spell UUIDs that would be used by player characters - NO FALLBACKS
 * @param {Array} playerCharacters - Player characters to analyze
 * @returns {Promise<Set<string>>} Set of relevant spell UUIDs
 */
async function getPlayerCharacterSpellUuids(playerCharacters) {
  const relevantSpellUuids = new Set();

  for (const actor of playerCharacters) {
    log(3, `Analyzing ${actor.name} for spell UUIDs:`);

    // Check actor.classes for spell lists (NO FALLBACKS)
    if (actor.classes) {
      for (const [key, cls] of Object.entries(actor.classes)) {
        const identifier = cls.identifier || cls.system?.identifier || key;
        const className = cls.name || key;
        const classUuid = cls.uuid || cls.system?.uuid;

        if (identifier && classUuid) {
          try {
            // Use existing getClassSpellList - it returns spell UUIDs!
            const spellUuids = await discoveryUtils.getClassSpellList(className, classUuid, actor);

            log(3, `  - Found ${spellUuids.size} spells for ${identifier}`);

            // Add all spell UUIDs to our set (Set automatically handles duplicates)
            spellUuids.forEach((uuid) => relevantSpellUuids.add(uuid));
          } catch (error) {
            log(2, `Error getting spells for ${identifier}:`, error);
          }
        }
      }
    }
  }

  log(3, `Found ${relevantSpellUuids.size} total unique spell UUIDs from player characters`);
  return relevantSpellUuids;
}

/**
 * Check if preloaded data is available and valid
 * @returns {boolean}
 */
export function hasValidPreloadedData() {
  const preloadedData = globalThis.SPELLBOOK?.preloadedData;
  if (!preloadedData) return false;

  const currentVersion = game.modules.get(MODULE.ID).version;
  const currentMode = game.settings.get(MODULE.ID, SETTINGS.SPELL_PRELOADING_MODE);

  return preloadedData.version === currentVersion && preloadedData.mode === currentMode;
}

/**
 * Get preloaded spell data
 * @returns {Object|null} Preloaded data or null
 */
export function getPreloadedData() {
  return hasValidPreloadedData() ? globalThis.SPELLBOOK.preloadedData : null;
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
        const preloadMode = game.settings.get(MODULE.ID, SETTINGS.SPELL_PRELOADING_MODE);
        if (preloadMode !== 'off') await preloadSpellData();
      }, 1000);
    }
  }
}

/**
 * Check if a journal entry contains spell lists that would affect our cache
 * @param {JournalEntry} journal - The journal to check
 * @returns {boolean} Whether this journal affects spell lists
 */
export function hasRelevantSpellContent(journal) {
  if (!journal.pages) return false;
  return journal.pages.some((page) => {
    if (page.type !== 'spells') return false;
    if (page.system?.type === 'other') return false;
    return true;
  });
}

/**
 * Check if a journal page should trigger cache invalidation
 * @param {JournalEntryPage} page - The journal page
 * @returns {boolean} Whether this page affects our spell lists
 */
export function shouldInvalidateCacheForPage(page) {
  if (page.type !== 'spells') return false;
  if (page.system?.type === 'other') return false;
  const journal = page.parent;
  if (!journal?.pack) return false;
  const pack = game.packs.get(journal.pack);
  if (!pack || pack.metadata.type !== 'JournalEntry') return false;
  return managerHelpers.shouldIndexCompendium(pack);
}
