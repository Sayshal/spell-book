import { PlayerSpellBook } from '../apps/player-spell-book.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import { log } from '../logger.mjs';

/**
 * Register hooks related to DnD5e system integration
 * This function handles all system-specific hooks and integration points
 */
export function registerDnD5eIntegration() {
  try {
    // Set up character sheet button integration for standard 5e sheets
    Hooks.on('renderActorSheet5e', addSpellbookButton);

    log(3, 'Registering DnD5e system integration');
  } catch (error) {
    log(1, 'Error registering DnD5e integration:', error);
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
