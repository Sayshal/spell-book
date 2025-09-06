import { SpellBook } from '../apps/_module.mjs';
import { ASSETS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Tidy5e sheet application instance
 * @typedef {Object} Tidy5eApplication
 * @property {string} id Application ID
 * @property {Object} options Application options
 * @property {HTMLElement} element Application HTML element
 * @property {Actor5e} actor Associated actor
 */

/**
 * Tidy5e sheet rendering data
 * @typedef {Object} Tidy5eRenderData
 * @property {Actor5e} actor The actor being rendered on the Tidy5e sheet
 * @property {Object} [system] Actor system data
 * @property {boolean} [editable] Whether the sheet is editable
 * @property {Object} [options] Sheet-specific options
 */

/**
 * Tidy5e button configuration for different sheet variants
 * @typedef {Object} Tidy5eButtonConfig
 * @property {string} className CSS classes specific to Tidy5e styling
 * @property {string} title Button tooltip text
 * @property {string} innerHTML Button HTML content with Tidy5e-compatible markup
 * @property {Object} [attributes] Additional HTML attributes for Tidy5e integration
 */

/**
 * Register hooks related to Tidy5e system integration.
 * Supports both classic Tidy5e and the newer Quadrone version.
 * @returns {void}
 */
export function registerTidy5eIntegration() {
  Hooks.on('tidy5e-sheet.renderActorSheet', onTidy5eRender);
  Hooks.on('renderTidy5eCharacterSheet', onTidy5eRender);
  Hooks.on('renderTidy5eCharacterSheetQuadrone', onTidy5eQuadroneRender);
  log(3, 'Registered Tidy5e sheet integration');
}

/**
 * Handle Tidy5e classic sheet rendering to add spell book button.
 * Integrates with Tidy5e's utility toolbar in the spellbook tab.
 * @param {Tidy5eApplication} _sheet The Tidy5e sheet application instance
 * @param {HTMLElement} element The sheet HTML element
 * @param {Tidy5eRenderData} data The sheet data object containing actor information
 * @returns {void}
 */
function onTidy5eRender(_sheet, element, data) {
  const actor = data.actor;
  if (!canAddTidySpellbookButton(actor, element)) return;
  const spellsTab = element.querySelector('.spellbook');
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
 * Handle Tidy5e Quadrone (new version) sheet rendering to add spell book button.
 * Integrates with Quadrone's action bar in the spellbook tab.
 * @param {Tidy5eApplication} _sheet The Tidy5e sheet application instance
 * @param {HTMLElement} element The sheet HTML element
 * @param {Tidy5eRenderData} data The sheet data object containing actor information
 * @returns {void}
 */
function onTidy5eQuadroneRender(_sheet, element, data) {
  const actor = data.actor;
  if (!canAddTidySpellbookButton(actor, element)) return;
  const spellsTab = element.querySelector('.tidy-tab.spellbook');
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
 * Check if Tidy5e Spell Book button can be added to this sheet.
 * Verifies the actor has spellcasting and the sheet has appropriate UI elements.
 * @param {Actor5e} actor The actor to check for spellcasting capabilities
 * @param {HTMLElement} element The sheet HTML element
 * @returns {boolean} True if the button can be added to this Tidy5e sheet
 */
function canAddTidySpellbookButton(actor, element) {
  const canCast = Object.keys(actor?.spellcastingClasses || {}).length > 0;
  if (!canCast) return false;
  const hasSpellbook = element.querySelector('.spellbook') || element.querySelector('.tidy-tab.spellbook');
  if (!hasSpellbook) return false;
  return true;
}

/**
 * Create Tidy5e Spell Book button element for classic Tidy5e sheets.
 * Uses Tidy5e's inline-icon-button styling for consistent appearance.
 * @param {Actor5e} actor The actor this button will open a spell book for
 * @returns {HTMLElement} The created button element for Tidy5e classic sheets
 */
function createTidySpellbookButton(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inline-icon-button spell-book-button';
  button.title = game.i18n.localize('SPELLBOOK.UI.OpenSpellBook');
  button.setAttribute('tabindex', '-1');
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt="${game.i18n.localize('SPELLBOOK.UI.OpenSpellBook')}" class="spell-book-icon">`;
  button.addEventListener('click', (event) => openSpellbook(event, actor));
  return button;
}

/**
 * Create Tidy5e Spell Book button element for Quadrone sheets.
 * Uses Quadrone's button styling and tooltip system.
 * @param {Actor5e} actor The actor this button will open a spell book for
 * @returns {HTMLElement} The created button element for Tidy5e Quadrone sheets
 */
function createTidySpellbookButtonQuadrone(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-icon-only spell-book-button';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt="${game.i18n.localize('SPELLBOOK.UI.OpenSpellBook')}" class="spell-book-icon">`;
  button.addEventListener('click', (event) => openSpellbook(event, actor));
  return button;
}

/**
 * Open Spell Book application for the specified actor.
 * Prevents default event behavior and creates new SpellBook instance.
 * @param {Event} event The click event that triggered this action
 * @param {Actor5e} actor The actor whose spell book should be opened
 * @returns {void}
 */
function openSpellbook(event, actor) {
  event.preventDefault();
  const spellBook = new SpellBook(actor);
  spellBook.render(true);
}
