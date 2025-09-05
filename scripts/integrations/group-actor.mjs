import { ASSETS } from '../constants/_module.mjs';
import { PartySpells } from '../apps/_module.mjs';
import { PartySpellManager } from '../managers/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Register hooks for group actor sheet integration
 */
export function registerGroupActorIntegration() {
  Hooks.on('renderGroupActorSheet', onGroupActorRender);
  log(3, 'Registered Group Actor sheet integration');
}

/**
 * Handle group actor sheet rendering
 * @param {Application} sheet The group actor sheet
 * @param {HTMLElement} element The sheet HTML element
 * @param {Object} data The sheet data
 */
function onGroupActorRender(sheet, element, data) {
  const actor = data.actor;
  if (!canAddPartySpellButton(actor, data)) return;

  const headerButtons = element.querySelector('.sheet-header-buttons');
  if (!headerButtons) {
    log(2, 'Could not find .sheet-header-buttons in group actor sheet');
    return;
  }

  // Find long rest button to insert after
  const longRestButton = headerButtons.querySelector('.long-rest.gold-button');
  if (!longRestButton) {
    log(2, 'Could not find long rest button in group actor sheet');
    return;
  }

  // Don't add if already exists
  if (headerButtons.querySelector('.party-spell-button')) return;

  const button = createPartySpellButton(actor, data);
  longRestButton.insertAdjacentElement('afterend', button);
  log(3, 'Added party spell button to group actor sheet');
}

/**
 * Check if party spell button can be added
 * @param {Actor} actor The group actor
 * @param {Object} data The sheet data
 * @returns {boolean} True if button should be added
 */
function canAddPartySpellButton(actor, data) {
  if (actor.type !== 'group') return false;

  // Check if there are creatures/members with spellcasting
  const creatures = data.actor.system?.creatures || [];
  const spellcasters = creatures.filter((memberActor) => memberActor && Object.keys(memberActor?.spellcastingClasses || {}).length > 0);

  return spellcasters.length > 0;
}

/**
 * Create party spell button element
 * @param {Actor} groupActor The group actor
 * @param {Object} data The sheet data
 * @returns {HTMLElement} The button element
 */
function createPartySpellButton(groupActor, data) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'party-spell-button gold-button';
  button.setAttribute('data-action', 'openPartySpells');
  button.setAttribute('data-tooltip', '');
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Party.OpenPartySpellPool'));
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt="${game.i18n.localize('SPELLBOOK.Party.OpenPartySpellPool')}" class="spell-book-icon">`;
  button.addEventListener('click', (event) => openPartySpellManager(event, groupActor, data));
  return button;
}

/**
 * Open party spell manager
 * @param {Event} event The click event
 * @param {Actor} groupActor The group actor
 * @param {Object} data The sheet data
 */
function openPartySpellManager(event, groupActor, data) {
  event.preventDefault();

  const creatures = data.actor.system?.creatures || [];
  const partyActors = creatures.filter((memberActor) => memberActor && Object.keys(memberActor?.spellcastingClasses || {}).length > 0);

  if (partyActors.length === 0) {
    ui.notifications.warn('SPELLBOOK.Party.NoSpellcasters', { localize: true });
    return;
  }

  // Pass the groupActor as the third parameter to get the group name
  const manager = new PartySpells(partyActors, null, groupActor);
  manager.render(true);
}
