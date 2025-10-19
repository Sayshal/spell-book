/**
 * Chat Message Button Handlers
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Handle chat message creation and wire up button event listeners
 * @param {ChatMessage} message - The created chat message
 * @param {object} _options - Creation options
 * @param {string} _userId - ID of the creating user
 */
export async function createChatMessage(message, _options, _userId) {
  const spellBookFlags = message.flags?.['spell-book'];
  if (!spellBookFlags) return;
  await new Promise((resolve) => setTimeout(resolve, 100));
  const messageElements = document.querySelectorAll(`[data-message-id="${message.id}"]`);
  if (!messageElements.length) return;
  messageElements.forEach((element) => {
    switch (spellBookFlags.messageType) {
      case 'migration-report': {
        handleMigrationReportButtons(element, message);
        break;
      }
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
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'SPELLBOOK.Migrations.SuppressButton', icon: 'fas fa-eye-slash' },
      content: `<div class="suppression-warning">
                  <p>${game.i18n.localize('SPELLBOOK.Settings.SuppressMigrationWarnings.Hint')}</p>
                  <p><strong>${game.i18n.localize('SPELLBOOK.Migrations.SuppressConfirm')}</strong></p>
                </div>`,
      yes: { icon: '<i class="fas fa-eye-slash"></i>', label: 'SPELLBOOK.Migrations.SuppressButton' },
      no: { icon: '<i class="fas fa-times"></i>', label: 'SPELLBOOK.UI.Cancel' },
      rejectClose: false
    });
    if (confirmed) {
      await game.settings.set(MODULE.ID, SETTINGS.SUPPRESS_MIGRATION_WARNINGS, true);
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Settings.SuppressMigrationWarnings.Enabled'));
      await message.delete();
      log(3, 'Migration warnings suppressed by user');
    }
  });
}
