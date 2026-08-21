import { removeCustomSpellList } from '../data/_module.mjs';
import { confirmDialog } from '../ui/_module.mjs';
import { DEFAULT_FILTER_STATE } from './spell-list-filters.mjs';

/** @typedef {foundry.applications.api.ApplicationV2} SpellListManager The parent Spell List Manager application these handlers act on */

/** Sub-controller for list deletion. Internal to this module. */
export class DeletionController {
  /**
   * Confirm and delete the currently selected custom list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async deleteList(app) {
    if (!app.selectedList) return;
    const uuid = app.selectedList.uuid;
    const name = app.selectedList.name;
    const confirmed = await confirmDialog({
      title: 'SPELLBOOK.Manager.Confirm.DeleteTitle',
      content: _loc('SPELLBOOK.Manager.Confirm.DeleteContent', { name: `<strong>${name}</strong>` }),
      confirmLabel: 'ATLAS.Common.Delete',
      confirmIcon: 'fas fa-trash',
      confirmCssClass: 'dialog-button-danger',
      parent: app
    });
    if (!confirmed) return;
    await removeCustomSpellList(uuid);
    app.selectedList = null;
    app.sidebarMode = 'lists';
    app.filterState = { ...DEFAULT_FILTER_STATE };
    app._filteredAll = [];
    app._batchIndex = 0;
    await app._refreshLists();
    app.render(false, { parts: ['sidebar', 'content', 'footer'] });
  }
}
