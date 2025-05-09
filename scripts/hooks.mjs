import { TEMPLATES } from './constants.mjs';
import { registerDnD5eIntegration } from './integrations/dnd5e.mjs';
import { registerTidy5eIntegration } from './integrations/tidy5e.mjs';
import { log } from './logger.mjs';

/**
 * Register all module hooks
 * Sets up UI elements and system integrations
 */
export async function registerHooks() {
  try {
    // Register hooks by category
    registerSystemIntegrations();
    registerUIHooks();
    await preloadTemplates();

    log(3, 'All module hooks registered');
  } catch (error) {
    log(1, 'Error registering hooks:', error);
  }
}

function registerSystemIntegrations() {
  try {
    // 5e System Hook
    registerDnD5eIntegration();

    // Tidy5e Classic Hook
    if (game.modules.get('tidy5e-sheet')?.active) {
      registerTidy5eIntegration();
    }
    log(3, 'System integration hooks registered');
  } catch (error) {
    log(1, 'Error registering system integration hooks:', error);
  }
}

function registerUIHooks() {
  try {
    // UI hooks are now registered in their respective system integration files
    log(3, 'UI hooks registered');
  } catch (error) {
    log(1, 'Error registering UI hooks:', error);
  }
}

async function preloadTemplates() {
  // Helper function to flatten the templates object into an array of paths
  function flattenTemplateObject(obj, result = []) {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        result.push(obj[key]);
      } else if (typeof obj[key] === 'object') {
        flattenTemplateObject(obj[key], result);
      }
    }
    return result;
  }

  // Get all template paths as an array
  const templatePaths = flattenTemplateObject(TEMPLATES);

  log(3, `Preloading ${templatePaths.length} templates`);

  // Load all templates
  return loadTemplates(templatePaths);
}
