/**
 * Tour Registration and Management Functions
 * @module Tours/Registration
 * @author Tyler
 */

import { log } from '../logger.mjs';
import SpellBookTour from './spell-book-tour.mjs';

/**
 * Register all Spell Book tours with Foundry's tour system.
 * @returns {Promise<void>}
 */
export async function registerSpellBookTours() {
  const tours = [
    { id: 'basics', file: 'spellbook-basics.json' },
    { id: 'spell-list-manager', file: 'spell-list-manager.json' },
    { id: 'party-spells', file: 'party-spells.json' },
    { id: 'wizard-spellbook', file: 'wizard-spellbook.json' },
    { id: 'spellbook-settings', file: 'spellbook-settings.json' }
  ];
  for (const { id, file } of tours) {
    try {
      game.tours.register('spell-book', id, await SpellBookTour.fromJSON(`modules/spell-book/tours/${file}`));
    } catch (err) {
      log(2, `SpellBook Tours | Failed to register tour "${id}":`, err);
    }
  }
  log(3, 'SpellBook Tours | Tours Registered.');
}

/**
 * Check if user should be prompted to take the welcome tour.
 * @returns {boolean} Whether to show the welcome tour prompt
 */
export function shouldShowWelcomeTour() {
  const welcomeTour = game.tours.get('spell-book.basics');
  if (!welcomeTour) return false;
  if (welcomeTour.status === foundry.nue.Tour.STATUS.COMPLETED) return false;
  const showWelcomeTour = game.user.getFlag('spell-book', 'showWelcomeTour');
  if (showWelcomeTour === false) return false;
  return true;
}

/**
 * Prompt user to start the welcome tour.
 * @returns {Promise<void>}
 */
export async function promptWelcomeTour() {
  const tour = game.tours.get('spell-book.basics');
  if (!tour) return;
  try {
    const result = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('SPELLBOOK.Tours.WelcomeTitle') },
      content: `<p>${game.i18n.localize('SPELLBOOK.Tours.WelcomePrompt')}</p>`,
      yes: {
        label: game.i18n.localize('SPELLBOOK.Tours.StartTour'),
        icon: 'fas fa-book',
        callback: async () => {
          await tour.start();
        }
      },
      no: {
        label: game.i18n.localize('SPELLBOOK.Tours.MaybeLater'),
        icon: 'fas fa-times',
        callback: async () => {
          await game.user.setFlag('spell-book', 'showWelcomeTour', false);
        }
      },
      rejectClose: false
    });
    log(3, 'SpellBook Tours | Welcome tour prompt result:', result);
  } catch (err) {
    log(2, 'SpellBook Tours | Error showing welcome tour prompt:', err);
  }
}

/**
 * Add tour button to SpellBook interface.
 * @param {object} _app - The application instance (unused)
 * @param {HTMLElement} html - The rendered HTML element
 */
export function addTourButton(_app, html) {
  if (html.querySelector('.spell-book-tour-button')) return;
  const windowHeader = html.querySelector('.window-header .window-controls');
  if (!windowHeader) return;
  const tourButton = document.createElement('a');
  tourButton.className = 'header-control spell-book-tour-button';
  tourButton.dataset.tooltip = game.i18n.localize('SPELLBOOK.Tours.TakeATour');
  tourButton.innerHTML = '<i class="fas fa-question-circle"></i>';
  tourButton.addEventListener('click', (event) => {
    event.preventDefault();
    const tour = game.tours.get('spell-book.basics');
    if (tour) tour.start();
    else ui.notifications.warn('SpellBook tours are not available.');
  });
  windowHeader.prepend(tourButton);
  log(3, 'SpellBook Tours | Added tour button to SpellBook interface');
}
