import { PlayerSpellBook } from '../apps/player-spell-book.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
import { preloadSpellDataForActor } from '../helpers/spell-cache.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import { log } from '../logger.mjs';

/**
 * Register hooks related to Tidy5e system integration
 */
export function registerTidy5eIntegration() {
  Hooks.on('tidy5e-sheet.renderActorSheet', onTidy5eRender);
  Hooks.on('renderTidy5eCharacterSheet', onTidy5eRender);
  Hooks.on('renderTidy5eCharacterSheetQuadrone', onTidy5eQuadroneRender);
  log(3, 'Registered Tidy5e sheet integration');
}

/**
 * Handle Tidy5e classic sheet rendering
 */
function onTidy5eRender(sheet, element, data) {
  const actor = data.actor;
  if (!canAddTidySpellbookButton(actor, element)) return;
  preloadSpellDataForActor(actor).catch((error) => {
    log(1, `Failed to preload spell data for ${actor.name}:`, error);
  });
  const htmlElement = genericUtils.getHtmlElement(element);
  const spellsTab = htmlElement.querySelector('.spellbook');
  if (!spellsTab) return;
  const utilityToolbar = spellsTab.querySelector('[data-tidy-sheet-part="utility-toolbar"]');
  if (!utilityToolbar) return;
  const searchContainer = utilityToolbar.querySelector('[data-tidy-sheet-part="search-container"]');
  if (!searchContainer) return;
  if (utilityToolbar.querySelector('.spell-book-button')) return;
  const button = createTidySpellbookButton(actor);
  searchContainer.insertAdjacentElement('afterend', button);
}

/**
 * Handle Tidy5e new (Quadrone) sheet rendering
 */
function onTidy5eQuadroneRender(sheet, element, data) {
  const actor = data.actor;
  if (!canAddTidySpellbookButton(actor, element)) return;
  preloadSpellDataForActor(actor).catch((error) => {
    log(1, `Failed to preload spell data for ${actor.name}:`, error);
  });
  const htmlElement = genericUtils.getHtmlElement(element);
  const spellsTab = htmlElement.querySelector('.tidy-tab.spellbook');
  if (!spellsTab) return;
  const actionBar = spellsTab.querySelector('[data-tidy-sheet-part="action-bar"]');
  if (!actionBar) return;
  const buttonGroup = actionBar.querySelector('.button-group');
  if (!buttonGroup) return;
  if (actionBar.querySelector('.spell-book-button')) return;
  const button = createTidySpellbookButtonQuadrone(actor);
  buttonGroup.insertAdjacentElement('beforebegin', button);
}

/**
 * Check if Tidy5e spellbook button can be added
 */
function canAddTidySpellbookButton(actor, element) {
  const canCast = discoveryUtils.canCastSpells(actor);
  if (!canCast) return false;
  const htmlElement = genericUtils.getHtmlElement(element);
  const hasSpellbook = htmlElement.querySelector('.spellbook') || htmlElement.querySelector('.tidy-tab.spellbook');
  if (!hasSpellbook) return false;
  return true;
}

/**
 * Create Tidy5e spellbook button element
 */
function createTidySpellbookButton(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inline-icon-button spell-book-button';
  button.title = game.i18n.localize('SPELLBOOK.UI.OpenSpellBook');
  button.setAttribute('tabindex', '-1');
  button.innerHTML = '<i class="fas fa-book-open"></i>';
  button.addEventListener('click', (event) => openSpellbook(event, actor));
  return button;
}

/**
 * Create Tidy5e spellbook button element for Quadrone sheet
 */
function createTidySpellbookButtonQuadrone(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-icon-only spell-book-button';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = '<i class="fas fa-book-open"></i>';
  button.addEventListener('click', (event) => openSpellbook(event, actor));
  return button;
}

/**
 * Open spellbook application
 */
function openSpellbook(event, actor) {
  event.preventDefault();
  const spellBook = new PlayerSpellBook(actor);
  spellBook.render(true);
}
