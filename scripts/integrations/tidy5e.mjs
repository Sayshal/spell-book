import { PartyMode } from '../managers/_module.mjs';
import { createPartyButton, createSpellBookButton, hasSpellcastingClasses, tryAddButton } from '../utils/sheets.mjs';

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
    element,
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
    element,
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
  const spellcasters = PartyMode.getPartyActors(groupActor);
  if (!spellcasters.length) return;
  tryAddButton({
    element,
    anchor: '[data-tidy-sheet-part="sheet-header-actions-container"]',
    position: 'beforeend',
    dedupeSelector: '.party-coordinator-button',
    factory: () => createPartyButton({ groupActor, partyActors: spellcasters, className: 'button button-gold flexshrink party-coordinator-button' })
  });
}
