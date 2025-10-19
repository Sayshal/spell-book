/**
 * Tidy5e Sheet Integration
 *
 * Provides integration with the Tidy5e character sheet module, supporting both
 * classic and Quadrone (new) sheet variants. This module handles UI button
 * injection for accessing the Spell Book application directly from Tidy5e
 * character sheets.
 *
 * Integration features:
 * - Classic Tidy5e sheet button injection
 * - Quadrone Tidy5e sheet button injection
 * - Spellcasting capability detection
 * - Consistent styling and placement
 *
 * @module Integrations/Tidy5e
 * @author Tyler
 */

import { SpellBook } from '../apps/_module.mjs';
import { SpellManager } from '../managers/_module.mjs';
import { ASSETS, MODULE, FLAGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Tidy5e sheet data object passed to render hooks.
 *
 * @typedef {Object} Tidy5eSheetData
 * @property {Actor5e} actor - The actor being rendered
 * @property {Object} system - The actor's system data
 * @property {Object} [spellcastingClasses] - Available spellcasting classes
 */

/**
 * Register hooks related to Tidy5e sheet integration.
 * @returns {void}
 */
export function registerTidy5eIntegration() {
  Hooks.on('tidy5e-sheet.renderActorSheet', onTidy5eRender);
  Hooks.on('renderTidy5eCharacterSheet', onTidy5eRender);
  Hooks.on('renderTidy5eCharacterSheetQuadrone', onTidy5eQuadroneRender);
  log(3, 'Registered Tidy5e sheet integration');
}

/**
 * Handle Tidy5e classic sheet rendering.
 * @param {Application} _sheet - The Tidy5e sheet application instance
 * @param {HTMLElement} element - The sheet HTML element
 * @param {Tidy5eSheetData} data - The sheet data object containing actor information
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
 * Handle Tidy5e Quadrone (new) sheet rendering.
 * @param {Application} _sheet - The Tidy5e sheet application instance
 * @param {HTMLElement} element - The sheet HTML element
 * @param {Tidy5eSheetData} data - The sheet data object containing actor information
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
 * Check if Tidy5e Spell Book button can be added.
 * @param {Actor5e} actor - The actor to check for spellcasting capabilities
 * @param {HTMLElement} element - The sheet HTML element
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
 * Create Tidy5e Spell Book button element for classic sheets.
 * @param {Actor5e} actor - The actor this button will open a spell book for
 * @returns {HTMLElement} The created button element for Tidy5e classic sheets
 */
function createTidySpellbookButton(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inline-icon-button spell-book-button';
  button.title = game.i18n.localize('SPELLBOOK.UI.OpenSpellBook');
  button.setAttribute('tabindex', '-1');
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt=${game.i18n.localize('SPELLBOOK.LongRest.SwapConfirm')} class="spell-book-icon">`;
  button.addEventListener('click', (event) => openSpellbook(event, actor));
  return button;
}

/**
 * Create Tidy5e Spell Book button element for Quadrone sheets.
 * @param {Actor5e} actor - The actor this button will open a spell book for
 * @returns {HTMLElement} The created button element for Tidy5e Quadrone sheets
 */
function createTidySpellbookButtonQuadrone(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-icon-only spell-book-button';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt=${game.i18n.localize('SPELLBOOK.LongRest.SwapConfirm')} class="spell-book-icon">`;
  button.addEventListener('click', (event) => openSpellbook(event, actor));
  return button;
}

/**
 * Open Spell Book application for Tidy5e integration.
 * @param {Event} event - The click event
 * @param {Actor5e} actor - The actor whose spell book should be opened
 * @returns {Promise<void>}
 */
async function openSpellbook(event, actor) {
  event.preventDefault();
  const button = event.currentTarget;
  const icon = button.querySelector('img.spell-book-icon');
  if (icon) {
    icon.classList.add('fa-spin');
    button.disabled = true;
  }
  try {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const hasLongRestSwapping = Object.values(classRules).some((rules) => rules.cantripSwapping === 'longRest' || rules.spellSwapping === 'longRest');
    if (hasLongRestSwapping) {
      const longRestFlagValue = actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
      const cantripSwapTracking = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};
      let hasCompletedSwaps = false;
      for (const tracking of Object.values(cantripSwapTracking)) {
        if (tracking.longRest?.hasLearned && tracking.longRest?.hasUnlearned) {
          hasCompletedSwaps = true;
          break;
        }
      }
      if (hasCompletedSwaps) {
        const spellManager = new SpellManager(actor);
        await spellManager.cantripManager.resetSwapTracking();
      }
      if (longRestFlagValue === undefined || longRestFlagValue === null) actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
    }
    const spellBook = new SpellBook(actor);
    await spellBook._preInitialize();
    spellBook.render(true);
  } catch (error) {
    log(1, 'Error opening Tidy5e spell book:', error);
  } finally {
    if (icon) {
      icon.classList.remove('fa-spin');
      button.disabled = false;
    }
  }
}
