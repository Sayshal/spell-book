import { createAPI } from './api.mjs';
import { MODULE, TEMPLATES } from './constants.mjs';
import { registerDnD5eIntegration } from './integrations/dnd5e.mjs';
import { registerTidy5eIntegration } from './integrations/tidy5e.mjs';
import { initializeLogger, log } from './logger.mjs';
import { registerMigration } from './migrations.mjs';
import { registerSettings } from './settings.mjs';

Hooks.once('init', async function () {
  log(3, `Initializing ${MODULE.NAME}!`);
  initializeFoundryConfiguration();
  await initializeModuleComponents();
  await preloadTemplates();
  createAPI();
  registerMigration();
  log(3, `${MODULE.NAME} initialized!`);
});

Hooks.once('ready', async function () {
  await unlockModuleCompendium();
});

/**
 * Initialize Foundry configuration for the module
 */
function initializeFoundryConfiguration() {
  CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
  CONFIG.Item.compendiumIndexFields = ['system.spellcasting.progression', 'system.spellcasting.preparation.mode'];
}

/**
 * Initialize all module components
 * @returns {Promise<void>}
 */
async function initializeModuleComponents() {
  registerSettings();
  initializeLogger();
  registerDnD5eIntegration();
  if (game.modules.get('tidy5e-sheet')?.active) registerTidy5eIntegration();
}

/**
 * Unlock module compendium and create necessary folders
 * @returns {Promise<void>}
 */
async function unlockModuleCompendium() {
  try {
    const pack = game.packs.find((p) => p.collection === MODULE.PACK);
    if (pack && pack.locked) await pack.configure({ locked: false });
    await createActorSpellbooksFolder(pack);
  } catch (error) {
    log(1, 'Error unlocking module compendium:', error);
  }
}

/**
 * Create Actor Spellbooks folder in the module compendium
 * @param {CompendiumCollection} pack - The module's compendium pack
 * @returns {Promise<void>}
 */
async function createActorSpellbooksFolder(pack) {
  try {
    if (!pack) return;
    const folder = pack.folders.find((f) => f.name === 'Actor Spellbooks');
    if (!folder) {
      log(3, 'Creating Actor Spellbooks folder at module initialization');
      await Folder.create(
        {
          name: 'Actor Spellbooks', // TODO: Localize this
          type: 'JournalEntry'
        },
        { pack: pack.collection }
      );
      log(3, 'Created Actor Spellbooks folder');
    }
  } catch (error) {
    log(1, 'Error creating Actor Spellbooks folder:', error);
  }
}

async function preloadTemplates() {
  try {
    function flattenTemplateObject(obj, result = []) {
      for (const key in obj) {
        if (typeof obj[key] === 'string') result.push(obj[key]);
        else if (typeof obj[key] === 'object') flattenTemplateObject(obj[key], result);
      }
      return result;
    }

    const templatePaths = flattenTemplateObject(TEMPLATES);
    return loadTemplates(templatePaths);
  } catch (error) {
    log(1, 'Error preloading templates:', error);
  }
}
