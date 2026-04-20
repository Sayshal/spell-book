/**
 * Dialog Utilities
 */

const { DialogV2 } = foundry.applications.api;

/**
 * Display a confirmation dialog with customizable options.
 * @todo I'm pretty sure we don't need to use localize here, it'll be done by the DialogV2 class.
 * @param {object} options - Dialog configuration options
 * @param {string} [options.title] - The dialog title text
 * @param {string} [options.content] - The dialog message content
 * @param {string} [options.confirmLabel] - Text label for the confirm button
 * @param {string} [options.confirmIcon] - FontAwesome icon class for the confirm button
 * @param {string} [options.cancelLabel] - Text label for the cancel button
 * @param {string} [options.cancelIcon] - FontAwesome icon class for the cancel button
 * @param {string} [options.confirmCssClass] - Additional CSS class for the confirm button
 * @param {object|null} [options.parent] - Parent application for detached-window routing
 * @returns {Promise<boolean>} Whether the user confirmed
 */
export async function confirmDialog({
  title = _loc('SPELLMANAGER.Confirm.Title'),
  content = _loc('SPELLMANAGER.Confirm.Content'),
  confirmLabel = _loc('SPELLMANAGER.Confirm.Confirm'),
  confirmIcon = 'fas fa-check',
  cancelLabel = _loc('COMMON.Cancel'),
  cancelIcon = 'fas fa-times',
  confirmCssClass = '',
  parent = null
}) {
  const result = await DialogV2.wait({
    window: { title: title },
    content: `<p>${content}</p>`,
    buttons: [
      { icon: `${confirmIcon}`, label: confirmLabel, action: 'confirm', className: `dialog-button ${confirmCssClass}` },
      { icon: `${cancelIcon}`, label: cancelLabel, action: 'cancel', className: 'dialog-button' }
    ],
    default: 'cancel',
    rejectClose: false,
    renderOptions: detachedRenderOptions(parent)
  });
  return result === 'confirm';
}

/**
 * Build renderOptions that route a child dialog into the same detached window as the parent app.
 * @param {object|null} parent - Parent application to inherit window context from
 * @returns {object} renderOptions payload for DialogV2.wait
 */
export function detachedRenderOptions(parent) {
  const windowId = parent?.window?.windowId;
  return windowId ? { window: { windowId } } : {};
}
