import { PartyCoordinator, SpellBook, SpellListManager } from '../apps/_module.mjs';
import { ASSETS, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { PartyMode } from '../managers/party-mode.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';
import { log } from './logger.mjs';

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/**
 * Check whether an actor has any spellcasting classes.
 * @todo Might be an easier way to do this.
 * @param {object} actor - The actor to check
 * @returns {boolean} True if the actor has at least one spellcasting class
 */
const hasSpellcastingClasses = (actor) => !!actor?.spellcastingClasses && Object.keys(actor.spellcastingClasses).length > 0;

/**
 * Inject a button into a rendered sheet, guarded by anchor resolution and duplicate detection.
 * @param {object} config - Button injection configuration
 * @param {HTMLElement} config.html - The sheet root element
 * @param {string} config.anchor - CSS selector for the element the button is inserted relative to
 * @param {'afterend'|'beforebegin'|'afterbegin'|'beforeend'} [config.position] - Insertion position (default 'afterend')
 * @param {string} [config.dedupeSelector] - CSS selector used to detect a pre-existing button
 * @param {Function} config.factory - Factory that builds the button element
 * @returns {boolean} Whether the button was added
 */
function tryAddButton({ html, anchor, position = 'afterend', dedupeSelector, factory }) {
  const anchorElement = html.querySelector(anchor);
  if (!anchorElement) return false;
  if (dedupeSelector && html.querySelector(dedupeSelector)) return false;
  const button = factory();
  anchorElement.insertAdjacentElement(position, button);
  return true;
}

/**
 * Shared click handler that opens the Spell Book for an actor with long-rest state management.
 * @param {Event} event - The click event
 * @param {object} actor - The actor whose spell book should open
 * @returns {Promise<void>}
 */
async function openSpellBook(event, actor) {
  event.preventDefault();
  const button = event.currentTarget;
  const icon = button.querySelector('img.spell-book-icon');
  icon?.classList.add('fa-spin');
  button.disabled = true;
  try {
    await SpellManager.handleSpellbookOpen(actor);
    const windowId = actor.sheet?.window?.windowId;
    const renderOptions = windowId ? { force: true, window: { windowId } } : { force: true };
    new SpellBook({ actor }).render(renderOptions);
  } catch (error) {
    log(1, 'Failed to open spell book from sheet button.', error);
  } finally {
    icon?.classList.remove('fa-spin');
    button.disabled = false;
  }
}

/**
 * Build a Spell Book button for a character sheet.
 * @param {object} actor - The owning actor
 * @param {object} config - Button configuration
 * @param {string} config.className - CSS classes (sheet-specific)
 * @param {boolean} [config.classicTooltip] - Use `title` + `tabindex=-1` instead of `data-tooltip`/`aria-label`
 * @returns {HTMLElement} The button element
 */
function createSpellBookButton(actor, { className, classicTooltip = false }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  const label = _loc('SPELLBOOK.UI.OpenSpellBook');
  if (classicTooltip) {
    button.title = label;
    button.setAttribute('tabindex', '-1');
  } else {
    button.setAttribute('data-tooltip', label);
    button.setAttribute('aria-label', label);
  }
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt="${label}" class="spell-book-icon">`;
  button.addEventListener('click', (event) => openSpellBook(event, actor));
  return button;
}

/**
 * Build a Party Coordinator button for a group sheet.
 * @param {object} config - Button configuration
 * @param {object} config.groupActor - The group actor
 * @param {object[]} config.partyActors - Spellcaster members
 * @param {string} config.className - CSS classes (sheet-specific)
 * @returns {HTMLElement} The button element
 */
function createPartyButton({ groupActor, partyActors, className }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  const label = _loc('SPELLBOOK.Party.OpenPartySpellPool');
  button.setAttribute('data-tooltip', label);
  button.setAttribute('aria-label', label);
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt="${label}" class="spell-book-icon">`;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    new PartyCoordinator({ groupActor, partyActors }).render({ force: true });
  });
  return button;
}

/**
 * Prompt the user to open the spell book for long-rest swaps, or notify silently when the prompt is disabled.
 * @param {object} actor - The resting actor
 * @param {{ cantripSwapping: Array<{identifier:string,name:string}>, spellSwapping: Array<{identifier:string,name:string}> }} longRestClasses - Classes needing swaps
 * @returns {Promise<void>}
 */
async function promptLongRestSwap(actor, longRestClasses) {
  if (game.settings.get(MODULE.ID, SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT)) {
    const names = [...new Set([...longRestClasses.cantripSwapping, ...longRestClasses.spellSwapping].map((c) => c.name))];
    ui.notifications.info(_loc('SPELLBOOK.LongRest.SwapAvailableNotification', { name: actor.name, classes: names.join(', ') }));
    return;
  }
  const content = await renderTemplate(TEMPLATES.DIALOGS.LONG_REST_SWAP, { longRestClasses });
  const result = await DialogV2.wait({
    content,
    window: { icon: 'fas fa-bed', title: _loc('SPELLBOOK.LongRest.SwapTitle'), resizable: false },
    position: { width: 450, height: 'auto' },
    buttons: [
      { icon: 'fas fa-book', label: _loc('SPELLBOOK.LongRest.SwapConfirm'), action: 'confirm' },
      { icon: 'fas fa-times', label: _loc('SPELLBOOK.LongRest.SwapCancel'), action: 'cancel' }
    ],
    default: 'cancel',
    rejectClose: false
  });
  if (result !== 'confirm') return;
  await SpellManager.handleSpellbookOpen(actor);
  new SpellBook({ actor }).render({ force: true });
}

/**
 * Add the Spell Book button to a rendered dnd5e character sheet.
 * @param {object} _app - The character sheet application
 * @param {HTMLElement} html - The sheet root element
 * @param {object} data - The sheet data
 */
export function addSpellbookButton(_app, html, data) {
  const actor = data.actor;
  if (!hasSpellcastingClasses(actor)) return;
  if (!html.querySelector('section.tab[data-tab="spells"]')) return;
  tryAddButton({
    html,
    anchor: 'section.tab[data-tab="spells"] item-list-controls search ul.controls li:has(button[data-action="filter"])',
    dedupeSelector: '.spell-book-button',
    factory: () => {
      const li = document.createElement('li');
      li.appendChild(createSpellBookButton(actor, { className: 'unbutton filter-control always-interactive spell-book-button' }));
      return li;
    }
  });
}

/**
 * Add the Party Spells button to a rendered dnd5e group actor sheet.
 * @param {object} _sheet - The group actor sheet
 * @param {HTMLElement} element - The sheet root element
 * @param {object} data - The sheet data
 */
export function onGroupActorRender(_sheet, element, data) {
  const actor = data.actor;
  if (actor?.type !== 'group') return;
  const spellcasters = (actor.system?.creatures || []).filter(hasSpellcastingClasses);
  if (!spellcasters.length) return;
  tryAddButton({
    html: element,
    anchor: '.sheet-header-buttons .long-rest.gold-button',
    dedupeSelector: '.party-spell-button',
    factory: () => createPartyButton({ groupActor: actor, partyActors: spellcasters, className: 'party-spell-button gold-button' })
  });
}

/**
 * Add a Spell List Manager button to the journal sidebar footer (GM only).
 * @param {object} app - The journal sidebar application
 */
export function addJournalSpellBookButton(app) {
  if (!game.user.isGM) return;
  const footer = app.element?.querySelector('.directory-footer');
  if (!footer) return;
  if (footer.querySelector('.spell-book-buttons-container')) return;
  const container = document.createElement('div');
  container.classList.add('spell-book-buttons-container');
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('spell-book-journal-button');
  button.innerHTML = `<i class="fas fa-bars-progress"></i> ${_loc('SPELLBOOK.UI.JournalButton')}`;
  button.addEventListener('click', () => new SpellListManager().render({ force: true }));
  container.appendChild(button);
  footer.appendChild(container);
}

/**
 * Handle the `dnd5e.restCompleted` hook.
 * @param {object} actor - The resting actor
 * @param {object} result - The rest result
 * @param {object} _config - The rest configuration
 * @returns {Promise<void>}
 */
export async function handleRestCompleted(actor, result, _config) {
  if (!result.longRest) return;
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  const longRestClasses = { cantripSwapping: [], spellSwapping: [] };
  let hasAnyLongRestMechanics = false;
  for (const [classIdentifier, rules] of Object.entries(classRules)) {
    const needsSpellSwap = rules.spellSwapping === 'longRest';
    const needsCantripSwap = rules.cantripSwapping === 'longRest';
    if (!needsSpellSwap && !needsCantripSwap) continue;
    hasAnyLongRestMechanics = true;
    const classData = actor.spellcastingClasses?.[classIdentifier];
    const className = actor.items.get(classData?.id)?.name || classIdentifier;
    if (needsCantripSwap) longRestClasses.cantripSwapping.push({ identifier: classIdentifier, name: className });
    if (needsSpellSwap) {
      longRestClasses.spellSwapping.push({ identifier: classIdentifier, name: className });
      const swapTracking = actor.getFlag(MODULE.ID, FLAGS.SWAP_TRACKING) || {};
      if (!swapTracking[classIdentifier]) swapTracking[classIdentifier] = {};
      swapTracking[classIdentifier].longRest = true;
      await actor.setFlag(MODULE.ID, FLAGS.SWAP_TRACKING, swapTracking);
    }
  }
  if (!hasAnyLongRestMechanics) return;
  await actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
  await promptLongRestSwap(actor, longRestClasses);
}

/**
 * Add the Spell Book button to a Tidy5e classic character sheet.
 * @param {object} _sheet - The sheet application
 * @param {HTMLElement} element - The sheet root element
 * @param {object} data - The sheet data
 */
export function onTidy5eRender(_sheet, element, data) {
  const actor = data.actor;
  if (!hasSpellcastingClasses(actor)) return;
  tryAddButton({
    html: element,
    anchor: '.spellbook [data-tidy-sheet-part="utility-toolbar"] [data-tidy-sheet-part="search-container"]',
    dedupeSelector: '.spellbook [data-tidy-sheet-part="utility-toolbar"] .spell-book-button',
    factory: () => createSpellBookButton(actor, { className: 'inline-icon-button spell-book-button', classicTooltip: true })
  });
}

/**
 * Add the Spell Book button to a Tidy5e Quadrone character sheet.
 * @param {object} _sheet - The sheet application
 * @param {HTMLElement} element - The sheet root element
 * @param {object} data - The sheet data
 */
export function onTidy5eQuadroneRender(_sheet, element, data) {
  const actor = data.actor;
  if (!hasSpellcastingClasses(actor)) return;
  tryAddButton({
    html: element,
    anchor: '.tidy-tab.spellbook [data-tidy-sheet-part="action-bar"] .button-group',
    position: 'beforebegin',
    dedupeSelector: '.tidy-tab.spellbook [data-tidy-sheet-part="action-bar"] .spell-book-button',
    factory: () => createSpellBookButton(actor, { className: 'button button-icon-only spell-book-button' })
  });
}

/**
 * Add the Party Coordinator button to a Tidy5e Quadrone group sheet.
 * @param {object} _sheet - The sheet application
 * @param {HTMLElement} element - The sheet root element
 * @param {object} data - The sheet data
 */
export function onTidy5eGroupSheetRender(_sheet, element, data) {
  const groupActor = data.actor;
  if (groupActor?.type !== 'group') return;
  const spellcasters = PartyMode.getPartyActors(groupActor).filter(hasSpellcastingClasses);
  if (!spellcasters.length) return;
  tryAddButton({
    html: element,
    anchor: '[data-tidy-sheet-part="sheet-header-actions-container"]',
    position: 'beforeend',
    dedupeSelector: '.party-coordinator-button',
    factory: () => createPartyButton({ groupActor, partyActors: spellcasters, className: 'button button-gold flexshrink party-coordinator-button' })
  });
}
