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
 * Handle Tidy5e sheet rendering
 */
function onTidy5eRender(sheet, element, data) {
  try {
    const actor = data.actor;
    if (!discoveryUtils.canCastSpells(actor)) return;

    const spellsTab = element.querySelector('.spellbook');
    if (!spellsTab) return;

    const utilityToolbar = spellsTab.querySelector('[data-tidy-sheet-part="utility-toolbar"]');
    if (!utilityToolbar) return;

    const searchContainer = utilityToolbar.querySelector('[data-tidy-sheet-part="search-container"]');
    if (!searchContainer) return;

    if (utilityToolbar.querySelector('.spell-book-button')) return;

    const buttonHtml = createTidySpellbookButtonHtml();
    searchContainer.insertAdjacentHTML('afterend', buttonHtml);

    const button = utilityToolbar.querySelector('.spell-book-button');
    if (button) {
      button.addEventListener('click', (ev) => openSpellbook(ev, actor));
    }

    log(3, `Added spell book button to ${actor.name}'s Tidy5e sheet`);
  } catch (error) {
    log(1, `Error adding spell book button to Tidy5e sheet:`, error);
  }
}

/**
 * Create HTML for Tidy5e spellbook button
 */
function createTidySpellbookButtonHtml() {
  return `
    <button type="button" class="inline-icon-button spell-book-button"
            title="${game.i18n.localize('SPELLBOOK.UI.OpenSpellBook')}" tabindex="-1">
      <i class="fas fa-book-open"></i>
    </button>
  `;
}

/**
 * Open spellbook application
 */
function openSpellbook(ev, actor) {
  ev.preventDefault();
  try {
    const spellBook = new PlayerSpellBook(actor);
    spellBook.render(true);
  } catch (error) {
    log(1, `Error opening spell book:`, error);
  }
}
