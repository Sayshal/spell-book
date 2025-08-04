import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as managerHelpers from './compendium-management.mjs';
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

  // Check if we're on V13 for progress notifications
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
    const startTime = performance.now();

    // Step 1: Load valid custom list mappings (0% -> 10%)
    if (progress) progress.update({ pct: 0.05, message: 'Initializing...' });

    await log(4, 'Preload Custom List Mappings', () => managerHelpers.getValidCustomListMappings());

    // Step 2: Load spell lists (10% -> 30%)
    if (progress) progress.update({ pct: 0.1, message: 'Discovering spell lists...' });

    const allSpellLists = await log(4, 'Preload Spell Lists Discovery', async () => {
      const lists = await managerHelpers.findCompendiumSpellLists(true);
      lists.sort((a, b) => a.name.localeCompare(b.name));
      return lists;
    });

    if (progress) progress.update({ pct: 0.3, message: `Found ${allSpellLists.length} spell lists` });

    // Step 3: Determine what spells to load based on mode
    let spellLists, allSpells;

    if (preloadMode === 'smart') {
      ({ spellLists, allSpells } = await loadSmartSpells(allSpellLists, progress));
    } else {
      ({ spellLists, allSpells } = await loadAllSpells(allSpellLists, progress));
    }

    // Step 4: Enrich with icons (80% -> 95%)
    if (progress) progress.update({ pct: 0.85, message: 'Enriching spell icons...' });

    const enrichedSpells = await log(4, 'Preload Spell Icon Enrichment', async () => {
      if (!allSpells.length) return allSpells;

      for (let spell of allSpells) {
        spell.enrichedIcon = formattingUtils.createSpellIconLink(spell);
      }
      return allSpells;
    });

    if (progress) progress.update({ pct: 0.95, message: 'Caching spell data...' });

    // Step 5: Store in API nested data (95% -> 100%)
    globalThis.SPELLBOOK.preloadedData = {
      spellLists,
      enrichedSpells,
      timestamp: Date.now(),
      version: game.modules.get(MODULE.ID).version,
      mode: preloadMode
    };

    const totalTime = performance.now() - startTime;
    if (progress) {
      // Kill the progress notification immediately
      ui.notifications.remove(progress);

      // Show completion notification
      const modeText = preloadMode === 'smart' ? ' (smart mode)' : '';
      if (ui.notifications.success) {
        ui.notifications.success(`Spell Book ready! (${spellLists.length} lists, ${enrichedSpells.length} spells, ${Math.round(totalTime)}ms)${modeText}`, { console: false });
      } else {
        ui.notifications.info(`Spell Book ready! (${spellLists.length} lists, ${enrichedSpells.length} spells, ${Math.round(totalTime)}ms)${modeText}`, { console: false });
      }
    }

    log(3, `Spell data preload completed in ${Math.round(totalTime)}ms (${preloadMode} mode)`);
  } catch (error) {
    log(1, 'Error during spell data preload:', error);

    if (progress) {
      progress.update({
        pct: 1.0,
        message: 'Spell Book loading failed - will load on demand'
      });
      setTimeout(() => {
        if (ui.notifications.has(progress)) {
          ui.notifications.remove(progress);
        }
      }, 3000);
    }

    // Clear any partial data
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

  const allSpells = await log(4, 'Preload All Compendium Spells', async () => {
    return await managerHelpers.fetchAllCompendiumSpells();
  });

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

  // Find player-owned characters with better logging
  const allActors = Array.from(game.actors);
  const playerCharacters = allActors.filter((a) => {
    const hasOwner = a.hasPlayerOwner;
    const isCharacter = a.type === 'character';
    const result = hasOwner && isCharacter;

    if (result) {
      log(
        3,
        `Found player character: ${a.name} (owners: ${
          a.ownership ?
            Object.keys(a.ownership)
              .filter((k) => k !== 'default' && a.ownership[k] >= 3)
              .join(', ')
          : 'none'
        })`
      );
    }

    return result;
  });

  log(3, `Smart preloading: Found ${playerCharacters.length} player characters out of ${allActors.length} total actors`);
  playerCharacters.forEach((char) => {
    log(3, `- ${char.name}: ${char.classes ? Object.keys(char.classes).join(', ') : 'no classes detected'}`);
  });

  if (playerCharacters.length === 0) {
    log(3, 'No player characters found - loading nothing (smart mode)');
    if (progress) progress.update({ pct: 0.8, message: 'No players - loading nothing' });
    return { spellLists: [], allSpells: [] };
  }

  // Determine relevant spell lists for player characters
  const relevantSpellLists = new Set();

  for (const actor of playerCharacters) {
    log(3, `Analyzing ${actor.name}:`);

    // Check actor.classes (v12/v13 format)
    if (actor.classes) {
      for (const [key, cls] of Object.entries(actor.classes)) {
        const identifier = cls.identifier || cls.system?.identifier || key;
        log(3, `  - Class: ${cls.name || key} (identifier: ${identifier})`);

        if (identifier) {
          // Find spell lists for this class
          const classLists = allSpellLists.filter((list) => {
            const match = list.identifier === identifier || list.name.toLowerCase().includes(identifier.toLowerCase());
            if (match) {
              log(3, `    -> Found spell list: ${list.name}`);
            }
            return match;
          });
          classLists.forEach((list) => relevantSpellLists.add(list));
        }
      }
    }

    // Fallback: check actor.items for class items
    if (relevantSpellLists.size === 0) {
      const classItems = actor.items.filter((i) => i.type === 'class');
      log(3, `  - Checking ${classItems.length} class items`);

      for (const classItem of classItems) {
        const identifier = classItem.system?.identifier || classItem.identifier;
        if (identifier) {
          log(3, `    - Class item: ${classItem.name} (${identifier})`);
          const classLists = allSpellLists.filter((list) => list.identifier === identifier || list.name.toLowerCase().includes(identifier.toLowerCase()));
          classLists.forEach((list) => {
            log(3, `      -> Found spell list: ${list.name}`);
            relevantSpellLists.add(list);
          });
        }
      }
    }
  }

  const relevantListsArray = Array.from(relevantSpellLists);
  log(3, `Smart preloading identified ${relevantListsArray.length} relevant spell lists:`);
  relevantListsArray.forEach((list) => log(3, `  - ${list.name} (${list.identifier || 'no identifier'})`));

  if (relevantListsArray.length === 0) {
    log(3, 'No relevant spell lists found for player characters - loading nothing (smart mode)');
    if (progress) progress.update({ pct: 0.8, message: 'No relevant spells - loading nothing' });
    return { spellLists: [], allSpells: [] };
  }

  if (progress) progress.update({ pct: 0.5, message: `Loading spells for ${playerCharacters.length} characters...` });

  const relevantSpells = await log(4, 'Preload Smart Compendium Spells', async () => {
    return await fetchSpellsForLists(relevantListsArray);
  });

  if (progress) progress.update({ pct: 0.8, message: `Loaded ${relevantSpells.length} relevant spells` });
  log(3, `Smart preloading completed: ${relevantSpells.length} spells for ${playerCharacters.length} player characters`);

  return { spellLists: relevantListsArray, allSpells: relevantSpells };
}

/**
 * Fetch spells for specific spell lists - NO FALLBACK VERSION
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
