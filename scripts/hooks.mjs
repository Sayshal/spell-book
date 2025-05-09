import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { TEMPLATES } from './constants.mjs';
import * as discoveryUtils from './helpers/spell-discovery.mjs';
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
    // Set up character sheet button integration
    Hooks.on('renderActorSheet5e', addSpellbookButton);
    log(3, 'UI hooks registered');
  } catch (error) {
    log(1, 'Error registering UI hooks:', error);
  }
}

function addSpellbookButton(app, html, data) {
  try {
    const actor = data.actor;

    // Only add button for characters that can cast spells
    if (!canAddSpellbookButton(actor, html)) {
      return;
    }

    // Find the spells tab and controls list
    const spellsTab = html.find('.tab.spells');
    const controlsList = spellsTab.find('ul.controls');
    if (!controlsList.length) {
      log(2, `No controls list found in ${actor.name}'s character sheet`);
      return;
    }

    // Create button element
    const button = createSpellBookButton(actor);

    // Create list item and add button
    const listItem = document.createElement('li');
    listItem.appendChild(button);

    // Append to the sheet controls
    controlsList.append(listItem);

    log(3, `Added spell book button to ${actor.name}'s character sheet`);
  } catch (error) {
    log(1, `Error adding spell book button to character sheet: ${error.message}`);
  }
}

function canAddSpellbookButton(actor, html) {
  // Only add button for characters that can cast spells
  if (!discoveryUtils.canCastSpells(actor)) {
    return false;
  }

  // Only target sheets with a spells tab
  const spellsTab = html.find('.tab.spells');
  if (!spellsTab.length) {
    return false;
  }

  return true;
}

function createSpellBookButton(actor) {
  // Create the button
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'unbutton spell-book-button interface-only';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = '<i class="fas fa-book-open"></i>';

  // Add click event listener
  button.addEventListener('click', onSpellBookButtonClick.bind(null, actor));

  return button;
}

function onSpellBookButtonClick(actor, ev) {
  ev.preventDefault();
  try {
    const spellBook = new PlayerSpellBook(actor);
    spellBook.render(true);
  } catch (error) {
    log(1, `Error opening spell book: ${error.message}`);
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
