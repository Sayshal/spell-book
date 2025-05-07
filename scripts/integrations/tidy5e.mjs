/**
 * Integration with the Tidy5e Sheet system
 * @module spell-book/integrations/tidy5e
 */

import { PlayerSpellBook } from '../apps/player-spell-book.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import { log } from '../logger.mjs';

/**
 * Register hooks related to Tidy5e system integration
 */
export function registerTidy5eIntegration() {
  try {
    Hooks.on('tidy5e-sheet.renderActorSheet', onTidy5eRender);

    log(3, 'Registered Tidy5e sheet integration');
  } catch (error) {
    log(1, 'Error registering Tidy5e integration:', error);
  }
}

/**
 * Handler for Tidy5e sheet render
 * @param {ActorSheet5e} sheet - The rendered Tidy5e actor sheet
 * @param {HTMLElement} element - The HTML of the actor sheet
 * @param {Object} data - The data used to render the sheet
 */
function onTidy5eRender(sheet, element, data) {
  try {
    const actor = data.actor;

    // Only add button for characters that can cast spells
    if (!discoveryUtils.canCastSpells(actor)) {
      log(3, `Skipping spell book button for ${actor.name} (not a spellcaster)`);
      return;
    }

    // Find the spells tab section
    const spellsTab = element.querySelector('.spellbook');
    if (!spellsTab) {
      log(2, `Spells tab not found in ${actor.name}'s sheet`);
      return;
    }

    // Find the utility toolbar within the spells tab
    const utilityToolbar = spellsTab.querySelector('[data-tidy-sheet-part="utility-toolbar"]');
    if (!utilityToolbar) {
      log(2, `Utility toolbar not found in ${actor.name}'s spells tab`);
      return;
    }

    // Find the search container within the utility toolbar
    const searchContainer = utilityToolbar.querySelector('[data-tidy-sheet-part="search-container"]');
    if (!searchContainer) {
      log(2, `Search container not found in ${actor.name}'s utility toolbar`);
      return;
    }

    // Check if our button already exists to avoid duplicates
    if (utilityToolbar.querySelector('.spell-book-button')) {
      return;
    }

    // Create our button in the style of other toolbar buttons
    const buttonHtml = `
      <button type="button" class="inline-icon-button spell-book-button"
              title="${game.i18n.localize('SPELLBOOK.UI.OpenSpellBook')}" tabindex="-1">
        <i class="fas fa-book-open"></i>
      </button>
    `;

    // Insert after the search container
    searchContainer.insertAdjacentHTML('afterend', buttonHtml);

    // Add click event listener to open the spell book
    const button = utilityToolbar.querySelector('.spell-book-button');
    if (button) {
      button.addEventListener('click', function (ev) {
        ev.preventDefault();
        try {
          const spellBook = new PlayerSpellBook(actor);
          spellBook.render(true);
        } catch (error) {
          log(1, `Error opening spell book: ${error.message}`);
        }
      });
    }

    log(3, `Added spell book button to ${actor.name}'s Tidy5e character sheet utility toolbar`);
  } catch (error) {
    log(1, `Error adding spell book button to Tidy5e character sheet: ${error.message}`);
  }
}
