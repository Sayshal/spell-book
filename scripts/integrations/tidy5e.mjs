/**
 * Tidy5e Sheet Integration
 *
 * Provides integration with the Tidy5e character sheet module, supporting both
 * classic and Quadrone (new) sheet variants. This module handles UI button
 * injection for accessing the Spell Book application directly from Tidy5e
 * character sheets.
 * @module Integrations/Tidy5e
 * @author Tyler
 */

import { SpellBook, PartyCoordinator } from '../apps/_module.mjs';
import { SpellManager, PartyMode } from '../managers/_module.mjs';
import { ASSETS, MODULE, FLAGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Register hooks related to Tidy5e sheet integration.
 * @returns {void}
 */
export function registerTidy5eIntegration() {
  log(3, 'Registering Tidy5e integration hooks.');
  Hooks.on('tidy5e-sheet.renderActorSheet', onTidy5eRender);
  Hooks.on('renderTidy5eCharacterSheet', onTidy5eRender);
  Hooks.on('renderTidy5eCharacterSheetQuadrone', onTidy5eQuadroneRender);
  Hooks.on('renderTidy5eGroupSheetQuadrone', onTidy5eGroupSheetRender);
}

/**
 * Handle Tidy5e classic sheet rendering.
 * @param {object} _sheet - The Tidy5e sheet application instance
 * @param {HTMLElement} element - The sheet HTML element
 * @param {object} data - The sheet data object containing actor information
 * @returns {void}
 */
function onTidy5eRender(_sheet, element, data) {
  log(3, 'Tidy5e classic sheet rendering.', { actorId: data.actor?.id });
  const actor = data.actor;
  if (!canAddTidySpellbookButton(actor, element)) return;
  const spellsTab = element.querySelector('.spellbook');
  if (!spellsTab) {
    log(3, 'No spellbook tab found in Tidy5e classic sheet.', { actorId: actor.id });
    return;
  }
  const utilityToolbar = spellsTab.querySelector('[data-tidy-sheet-part="utility-toolbar"]');
  if (!utilityToolbar) {
    log(3, 'No utility toolbar found in Tidy5e classic sheet.', { actorId: actor.id });
    return;
  }
  const searchContainer = utilityToolbar.querySelector('[data-tidy-sheet-part="search-container"]');
  if (!searchContainer) {
    log(3, 'No search container found in Tidy5e classic sheet.', { actorId: actor.id });
    return;
  }
  if (utilityToolbar.querySelector('.spell-book-button')) {
    log(3, 'Spell book button already exists in Tidy5e classic sheet.', { actorId: actor.id });
    return;
  }
  const button = createTidySpellbookButton(actor);
  searchContainer.insertAdjacentElement('afterend', button);
  log(3, 'Spell book button added to Tidy5e classic sheet.', { actorId: actor.id });
}

/**
 * Handle Tidy5e Quadrone (new) sheet rendering.
 * @param {object} _sheet - The Tidy5e sheet application instance
 * @param {HTMLElement} element - The sheet HTML element
 * @param {object} data - The sheet data object containing actor information
 * @returns {void}
 */
function onTidy5eQuadroneRender(_sheet, element, data) {
  log(3, 'Tidy5e Quadrone sheet rendering.', { actorId: data.actor?.id });
  const actor = data.actor;
  if (!canAddTidySpellbookButton(actor, element)) return;
  const spellsTab = element.querySelector('.tidy-tab.spellbook');
  if (!spellsTab) {
    log(3, 'No spellbook tab found in Tidy5e Quadrone sheet.', { actorId: actor.id });
    return;
  }
  const actionBar = spellsTab.querySelector('[data-tidy-sheet-part="action-bar"]');
  if (!actionBar) {
    log(3, 'No action bar found in Tidy5e Quadrone sheet.', { actorId: actor.id });
    return;
  }
  const buttonGroup = actionBar.querySelector('.button-group');
  if (!buttonGroup) {
    log(3, 'No button group found in Tidy5e Quadrone sheet.', { actorId: actor.id });
    return;
  }
  if (actionBar.querySelector('.spell-book-button')) {
    log(3, 'Spell book button already exists in Tidy5e Quadrone sheet.', { actorId: actor.id });
    return;
  }
  const button = createTidySpellbookButtonQuadrone(actor);
  buttonGroup.insertAdjacentElement('beforebegin', button);
  log(3, 'Spell book button added to Tidy5e Quadrone sheet.', { actorId: actor.id });
}

/**
 * Check if Tidy5e Spell Book button can be added.
 * @param {object} actor - The actor to check for spellcasting capabilities
 * @param {HTMLElement} element - The sheet HTML element
 * @returns {boolean} True if the button can be added to this Tidy5e sheet
 */
function canAddTidySpellbookButton(actor, element) {
  const canCast = Object.keys(actor?.spellcastingClasses || {}).length > 0;
  if (!canCast) {
    log(3, 'Cannot add Tidy5e spellbook button: actor has no spellcasting classes.', { actorId: actor?.id });
    return false;
  }
  const hasSpellbook = element.querySelector('.spellbook') || element.querySelector('.tidy-tab.spellbook');
  if (!hasSpellbook) {
    log(3, 'Cannot add Tidy5e spellbook button: no spellbook section found.', { actorId: actor?.id });
    return false;
  }
  log(3, 'Can add Tidy5e spellbook button.', { actorId: actor.id });
  return true;
}

/**
 * Create Tidy5e Spell Book button element for classic sheets.
 * @param {object} actor - The actor this button will open a spell book for
 * @returns {HTMLElement} The created button element for Tidy5e classic sheets
 */
function createTidySpellbookButton(actor) {
  log(3, 'Creating Tidy5e classic spellbook button.', { actorId: actor.id });
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
 * @param {object} actor - The actor this button will open a spell book for
 * @returns {HTMLElement} The created button element for Tidy5e Quadrone sheets
 */
function createTidySpellbookButtonQuadrone(actor) {
  log(3, 'Creating Tidy5e Quadrone spellbook button.', { actorId: actor.id });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-icon-only spell-book-button';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt=${game.i18n.localize('SPELLBOOK.LongRest.SwapConfirm')} class="spell-book-icon">`;
  button.addEventListener('click', (event) => openSpellbook(event, actor));
  return button;
}

/**
 * Handle Tidy5e Group Sheet Quadrone rendering.
 * @param {object} _sheet - The Tidy5e sheet application instance
 * @param {HTMLElement} element - The sheet HTML element
 * @param {object} data - The sheet data object containing actor information
 * @returns {void}
 */
function onTidy5eGroupSheetRender(_sheet, element, data) {
  log(3, 'Tidy5e Group Sheet Quadrone rendering.', { groupActorId: data.actor?.id });
  const groupActor = data.actor;
  if (!groupActor || groupActor.type !== 'group') return;
  const partyActors = PartyMode.getPartyActors(groupActor);
  const spellcasters = partyActors.filter((actor) => actor && Object.keys(actor?.spellcastingClasses || {}).length > 0);
  if (spellcasters.length === 0) return;
  const headerActionsContainer = element.querySelector('[data-tidy-sheet-part="sheet-header-actions-container"]');
  if (!headerActionsContainer) return;
  if (headerActionsContainer.querySelector('.party-coordinator-button')) return;
  const button = createTidy5ePartyCoordinatorButton(groupActor, partyActors);
  headerActionsContainer.appendChild(button);
  log(3, 'Party Coordinator button added to Tidy5e Group Sheet.', { groupActorId: groupActor.id });
}

/**
 * Create Tidy5e Party Coordinator button element for group sheets.
 * @param {object} groupActor - The group actor
 * @param {Array<object>} partyActors - Array of party member actors
 * @returns {HTMLElement} The created button element for Tidy5e group sheets
 */
function createTidy5ePartyCoordinatorButton(groupActor, partyActors) {
  log(3, 'Creating Tidy5e Party Coordinator button.', { groupActorId: groupActor.id });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-gold flexshrink party-coordinator-button';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.Party.OpenPartySpellPool'));
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Party.OpenPartySpellPool'));
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt="${game.i18n.localize('SPELLBOOK.Party.OpenPartySpellPool')}" class="spell-book-icon">`;
  button.addEventListener('click', (event) => openPartyCoordinator(event, groupActor, partyActors));
  return button;
}

/**
 * Open Party Coordinator application for Tidy5e group sheet integration.
 * @param {Event} event - The click event
 * @param {object} groupActor - The group actor
 * @param {Array<object>} partyActors - Array of party member actors
 * @returns {Promise<void>}
 */
async function openPartyCoordinator(event, groupActor, partyActors) {
  log(3, 'Tidy5e Party Coordinator button clicked.', { groupActorId: groupActor.id });
  event.preventDefault();
  const button = event.currentTarget;
  const icon = button.querySelector('img.spell-book-icon');
  if (icon) {
    icon.classList.add('fa-spin');
    button.disabled = true;
  }
  try {
    const coordinator = new PartyCoordinator(partyActors, null, groupActor);
    coordinator.render(true);
    log(3, 'Party Coordinator rendered successfully from Tidy5e Group Sheet.', { groupActorId: groupActor.id });
  } catch (error) {
    log(1, 'Error opening Party Coordinator from Tidy5e Group Sheet.', { groupActorId: groupActor.id, error });
  } finally {
    if (icon) {
      icon.classList.remove('fa-spin');
      button.disabled = false;
    }
  }
}

/**
 * Open Spell Book application for Tidy5e integration.
 * @param {Event} event - The click event
 * @param {object} actor - The actor whose spell book should be opened
 * @returns {Promise<void>}
 */
async function openSpellbook(event, actor) {
  log(3, 'Tidy5e spellbook button clicked.', { actorId: actor.id });
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
    log(3, 'Checking long rest swapping mechanics for Tidy5e.', { actorId: actor.id, hasLongRestSwapping });
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
        log(3, 'Resetting cantrip swap tracking for Tidy5e.', { actorId: actor.id });
        const spellManager = new SpellManager(actor);
        await spellManager.cantripManager.resetSwapTracking();
      }
      if (longRestFlagValue === undefined || longRestFlagValue === null) {
        log(3, 'Setting long rest completed flag for Tidy5e.', { actorId: actor.id });
        actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
      }
    }
    const spellBook = new SpellBook(actor);
    await spellBook._preInitialize();
    spellBook.render(true);
    log(3, 'Spellbook rendered successfully from Tidy5e.', { actorId: actor.id });
  } catch (error) {
    log(1, 'Error opening spellbook from Tidy5e.', { actorId: actor.id, error });
  } finally {
    if (icon) {
      icon.classList.remove('fa-spin');
      button.disabled = false;
    }
  }
}
