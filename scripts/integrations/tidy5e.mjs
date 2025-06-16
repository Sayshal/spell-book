import { PlayerSpellBook } from '../apps/player-spell-book.mjs';
import { preloadSpellDataForActor } from '../helpers/spell-cache.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import { log } from '../logger.mjs';

/**
 * Register hooks related to Tidy5e system integration
 */
export function registerTidy5eIntegration() {
  Hooks.on('tidy5e-sheet.renderActorSheet', onTidy5eRender);
  log(3, 'Registered Tidy5e sheet integration');
}

/**
 * Handle Tidy5e sheet rendering
 */
function onTidy5eRender(sheet, element, data) {
  const actor = data.actor;
  if (!discoveryUtils.canCastSpells(actor)) return;
  preloadSpellDataForActor(actor).catch((error) => {
    log(1, `Failed to preload spell data for ${actor.name}:`, error);
  });
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
  if (button) button.addEventListener('click', (event) => openSpellbook(event, actor));
}

/**
 * Create HTML for Tidy5e spellbook button
 */
function createTidySpellbookButtonHtml() {
  return `<button
  type="button"
  class="inline-icon-button spell-book-button"
  title="${game.i18n.localize('SPELLBOOK.UI.OpenSpellBook')}"
  tabindex="-1">
  <i class="fas fa-book-open"></i>
  </button>
  `;
}

/**
 * Open spellbook application
 */
function openSpellbook(event, actor) {
  event.preventDefault();
  const spellBook = new PlayerSpellBook(actor);
  spellBook.render(true);
}
