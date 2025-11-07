/**
 * Tour Registration and Management Functions
 *
 * Handles registration of Spell Book tours with Foundry's tour system,
 * welcome prompts, and tour UI integration.
 *
 * @module Tours/Registration
 * @author Tyler
 */

import { log } from '../logger.mjs';
import SpellBookTour from './spell-book-tour.mjs';

/**
 * Register all Spell Book tours with Foundry's tour system.
 *
 * This function is called during module initialization (typically in the 'ready' hook)
 * and registers all tour configurations from the tours/ directory. Each tour is
 * registered with the namespace 'spell-book' and its unique identifier.
 *
 * Tours are loaded from JSON files that define:
 * - Tour metadata (title, description, display settings)
 * - Step configurations (selectors, content, actions)
 * - Localization strings
 * - Suggested next tours for chaining
 *
 * @returns {Promise<void>}
 *
 * @example
 * // Typical usage in main module file:
 * Hooks.once('ready', async () => {
 *   await registerSpellBookTours();
 * });
 */
export async function registerSpellBookTours() {
  try {
    log(3, 'SpellBook Tours | Beginning tour registration');

    // Register SpellBook Basics Tour
    try {
      const basicsTour = await SpellBookTour.fromJSON('modules/spell-book/tours/spellbook-basics.json');
      game.tours.register('spell-book', 'basics', basicsTour);
      log(3, 'SpellBook Tours | Registered: basics');
    } catch (err) {
      log(2, 'SpellBook Tours | Failed to load basics tour:', err);
    }

    // Register Spell List Manager Tour
    try {
      const spellListTour = await SpellBookTour.fromJSON('modules/spell-book/tours/spell-list-manager.json');
      game.tours.register('spell-book', 'spell-list-manager', spellListTour);
      log(3, 'SpellBook Tours | Registered: spell-list-manager');
    } catch (err) {
      log(2, 'SpellBook Tours | Failed to load spell-list-manager tour:', err);
    }

    // Register Party Spells Tour
    try {
      const partyTour = await SpellBookTour.fromJSON('modules/spell-book/tours/party-spells.json');
      game.tours.register('spell-book', 'party-spells', partyTour);
      log(3, 'SpellBook Tours | Registered: party-spells');
    } catch (err) {
      log(2, 'SpellBook Tours | Failed to load party-spells tour:', err);
    }

    // Register Wizard Spellbook Tour
    try {
      const wizardTour = await SpellBookTour.fromJSON('modules/spell-book/tours/wizard-spellbook.json');
      game.tours.register('spell-book', 'wizard-spellbook', wizardTour);
      log(3, 'SpellBook Tours | Registered: wizard-spellbook');
    } catch (err) {
      log(2, 'SpellBook Tours | Failed to load wizard-spellbook tour:', err);
    }

    // Register Multiclass Setup Tour
    try {
      const multiclassTour = await SpellBookTour.fromJSON('modules/spell-book/tours/multiclass-setup.json');
      game.tours.register('spell-book', 'multiclass-setup', multiclassTour);
      log(3, 'SpellBook Tours | Registered: multiclass-setup');
    } catch (err) {
      log(2, 'SpellBook Tours | Failed to load multiclass-setup tour:', err);
    }

    // Count successfully registered tours
    const registeredCount = Array.from(game.tours.keys()).filter(key => key.startsWith('spell-book.')).length;
    log(2, `SpellBook Tours | Successfully registered ${registeredCount} tour(s)`);

  } catch (err) {
    log(1, 'SpellBook Tours | Critical error during tour registration:', err);
  }
}

/**
 * Check if user should be prompted to take the welcome tour.
 *
 * This helper function checks various conditions to determine if it's
 * appropriate to show the welcome tour prompt to the user. It considers:
 * - Whether the tour has already been completed
 * - User preferences for showing tours
 * - First-time module usage
 *
 * @returns {boolean} Whether to show the welcome tour prompt
 *
 * @example
 * if (shouldShowWelcomeTour()) {
 *   promptWelcomeTour();
 * }
 */
export function shouldShowWelcomeTour() {
  // Check if tours are available
  const welcomeTour = game.tours.get('spell-book.basics');
  if (!welcomeTour) return false;

  // Check if already completed
  if (welcomeTour.status === foundry.nue.Tour.STATUS.COMPLETED) {
    return false;
  }

  // Check user preference
  const showWelcomeTour = game.user.getFlag('spell-book', 'showWelcomeTour');
  if (showWelcomeTour === false) return false;

  // Default to showing if not explicitly disabled
  return true;
}

/**
 * Prompt user to start the welcome tour.
 *
 * Displays a dialog asking the user if they'd like to take the SpellBook
 * basics tour. If they decline, sets a flag to not prompt again.
 *
 * @returns {Promise<void>}
 *
 * @example
 * Hooks.once('ready', async () => {
 *   if (shouldShowWelcomeTour()) {
 *     await promptWelcomeTour();
 *   }
 * });
 */
export async function promptWelcomeTour() {
  const tour = game.tours.get('spell-book.basics');
  if (!tour) return;

  try {
    const result = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize('SPELLBOOK.Tours.WelcomeTitle')
      },
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
 *
 * This helper can be called from the SpellBook render hook to inject
 * a "Take Tour" button into the application header.
 *
 * @param {SpellBook} app - The SpellBook application instance
 * @param {HTMLElement} html - The rendered HTML element
 *
 * @example
 * Hooks.on('renderSpellBook', (app, html) => {
 *   addTourButton(app, html);
 * });
 */
export function addTourButton(app, html) {
  // Check if button already exists
  if (html.querySelector('.spell-book-tour-button')) return;

  // Find the window header controls
  const windowHeader = html.querySelector('.window-header .window-controls');
  if (!windowHeader) return;

  // Create tour button
  const tourButton = document.createElement('a');
  tourButton.className = 'header-control spell-book-tour-button';
  tourButton.dataset.tooltip = game.i18n.localize('SPELLBOOK.Tours.TakeATour');
  tourButton.innerHTML = '<i class="fas fa-question-circle"></i>';

  // Add click handler
  tourButton.addEventListener('click', (event) => {
    event.preventDefault();
    const tour = game.tours.get('spell-book.basics');
    if (tour) {
      tour.start();
    } else {
      ui.notifications.warn('SpellBook tours are not available.');
    }
  });

  // Prepend to controls (appears on left side)
  windowHeader.prepend(tourButton);

  log(3, 'SpellBook Tours | Added tour button to SpellBook interface');
}
