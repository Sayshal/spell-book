/**
 * Dialog Utilities
 * @module UIUtils/Dialogs
 * @author Tyler
 */

const { DialogV2 } = foundry.applications.api;

/**
 * Display a confirmation dialog with customizable options.
 * @param {object} options - Dialog configuration options
 * @param {string} [options.title] - The dialog title text
 * @param {string} [options.content] - The dialog message content
 * @param {string} [options.confirmLabel] - Text label for the confirm button
 * @param {string} [options.confirmIcon] - FontAwesome icon class for the confirm button
 * @param {string} [options.cancelLabel] - Text label for the cancel button
 * @param {string} [options.cancelIcon] - FontAwesome icon class for the cancel button
 * @param {string} [options.confirmCssClass] - Additional CSS class for the confirm button styling
 * @returns {Promise<boolean>} Whether the user confirmed (true) or cancelled (false)
 */
export async function confirmDialog({
  title = game.i18n.localize('SPELLMANAGER.Confirm.Title'),
  content = game.i18n.localize('SPELLMANAGER.Confirm.Content'),
  confirmLabel = game.i18n.localize('SPELLMANAGER.Confirm.Confirm'),
  confirmIcon = 'fas fa-check',
  cancelLabel = game.i18n.localize('SPELLBOOK.UI.Cancel'),
  cancelIcon = 'fas fa-times',
  confirmCssClass = ''
}) {
  const result = await DialogV2.wait({
    window: { title: title },
    content: `<p>${content}</p>`,
    buttons: [
      { icon: `${confirmIcon}`, label: confirmLabel, action: 'confirm', className: `dialog-button ${confirmCssClass}` },
      { icon: `${cancelIcon}`, label: cancelLabel, action: 'cancel', className: 'dialog-button' }
    ],
    default: 'cancel',
    rejectClose: false
  });
  return result === 'confirm';
}
