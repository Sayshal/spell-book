/**
 * Chat Message Button Handlers
 *
 * Handles click events for buttons in chat messages, following the pattern
 * used by chris-premades and other modules.
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Handle chat message creation and wire up button event listeners
 * @param {ChatMessage} message - The created chat message
 * @param {object} options - Creation options
 * @param {string} userId - ID of the creating user
 */
export async function createChatMessage(message, options, userId) {
  // Check if this is a spell-book message that needs button handling
  const spellBookFlags = message.flags?.['spell-book'];
  if (!spellBookFlags) return;

  // Small delay to ensure DOM elements are rendered
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Find all DOM elements for this specific message
  const messageElements = document.querySelectorAll(`[data-message-id="${message.id}"]`);
  if (!messageElements.length) return;

  // Handle different message types
  messageElements.forEach((element) => {
    switch (spellBookFlags.messageType) {
      case 'migration-report': {
        handleMigrationReportButtons(element, message);
        break;
      }
      // Add other message types here as needed
    }
  });
}

/**
 * Handle migration report button interactions
 * @param {HTMLElement} element - The message DOM element
 * @param {ChatMessage} message - The chat message document
 */
function handleMigrationReportButtons(element, message) {
  const suppressButton = element.querySelector('.suppress-migration-warnings');
  if (!suppressButton) return;

  suppressButton.addEventListener('click', async (event) => {
    event.preventDefault();

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize('SPELLBOOK.Migrations.SuppressButton'),
      content: `<p>${game.i18n.localize('SPELLBOOK.Settings.SuppressMigrationWarnings.Hint')}</p>
                      <p><strong>${game.i18n.localize('SPELLBOOK.Migrations.SuppressConfirm')}</strong></p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      try {
        await game.settings.set(MODULE.ID, SETTINGS.SUPPRESS_MIGRATION_WARNINGS, true);
        ui.notifications.info(game.i18n.localize('SPELLBOOK.Settings.SuppressMigrationWarnings.Enabled'));

        // Fade out and delete the message
        element.style.transition = 'opacity 0.5s';
        element.style.opacity = '0';
        setTimeout(async () => {
          await message.delete();
        }, 500);

        log(3, 'Migration warnings suppressed by user');
      } catch (error) {
        log(1, 'Error suppressing migration warnings:', error);
        ui.notifications.error('Failed to suppress migration warnings');
      }
    }
  });
}
