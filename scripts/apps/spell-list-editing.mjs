import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { duplicateSpellList, ensureListRegistered, findAllSpellLists, toggleListForRegistry } from '../data/_module.mjs';
import { SpellComparison } from '../dialogs/_module.mjs';
import { confirmDialog, createSpellIconLink, detachedRenderOptions } from '../ui/_module.mjs';

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** @typedef {foundry.applications.api.ApplicationV2} SpellListManager The parent Spell List Manager application these handlers act on */

/** Sub-controller for editing-mode actions. Internal to this module. */
export class EditingController {
  /**
   * Enter edit mode for the selected list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async enterEditMode(app) {
    if (!app.selectedList) return;
    app.pendingChanges = { added: new Set(), removed: new Set() };
    const flags = app.selectedList.document.flags?.[MODULE.ID] || {};
    const isActorSpellbook = !!flags.actorId;
    if (!flags.kind && !isActorSpellbook) await this.#duplicateForEditing(app);
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Save pending edits to the selected list document.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async saveEdits(app) {
    if (!app.selectedList) return;
    let doc = app.selectedList.document;
    const flags = doc.flags?.[MODULE.ID] || {};
    const isActorSpellbook = !!flags.actorId;
    if (!flags.kind && !isActorSpellbook) {
      const originalUuid = doc.uuid;
      await this.#duplicateForEditing(app);
      doc = app.selectedList.document;
      const hidden = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
      if (!hidden.includes(originalUuid)) await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, [...hidden, originalUuid]);
    }
    const current = new Set(Array.from(doc.system.spells || []));
    for (const uuid of app.pendingChanges.added) current.add(uuid);
    for (const uuid of app.pendingChanges.removed) current.delete(uuid);
    await doc.update({ 'system.spells': Array.from(current) });
    await ensureListRegistered(doc.uuid);
    app.pendingChanges = { added: new Set(), removed: new Set() };
    app.availableLists = await findAllSpellLists();
    await app.selectSpellList(doc.uuid);
  }

  /**
   * Add a single spell to the editing list (from the [data-action=addSpell] row).
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event|string} eventOrUuid - Triggering event when invoked from the row, or a direct UUID string
   * @param {HTMLElement} target - The capturing element
   */
  static addSpell(app, eventOrUuid, target) {
    const uuid = typeof eventOrUuid === 'string' ? eventOrUuid : target?.closest('[data-uuid]')?.dataset?.uuid;
    if (!uuid || !app.selectedList) return;
    if (app.selectionMode) {
      const event = typeof eventOrUuid === 'object' ? eventOrUuid : null;
      EditingController.#toggleSelection(app, 'add', uuid, target, event);
      app.render(false, { parts: ['content', 'footer'] });
      return;
    }
    if (app.selectedList.spellUuids.includes(uuid)) return;
    app.pendingChanges.added.add(uuid);
    app.pendingChanges.removed.delete(uuid);
    const spell = app.availableSpells.find((s) => s.uuid === uuid);
    if (!spell) return;
    const clone = foundry.utils.deepClone(spell);
    clone.compendiumUuid = uuid;
    if (!clone.enrichedIcon) clone.enrichedIcon = createSpellIconLink(clone);
    app.selectedList.spellUuids.push(uuid);
    app.selectedList.spells.push(clone);
    app.selectedList.spellsByLevel = app._organizeSpellsByLevel(app.selectedList.spells);
    app.render(false, { parts: ['content'] });
  }

  /**
   * Remove a single spell from the editing list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event|string} eventOrUuid - Triggering event when invoked from the row, or a direct UUID string
   * @param {HTMLElement} target - The capturing element
   */
  static removeSpell(app, eventOrUuid, target) {
    const uuid = typeof eventOrUuid === 'string' ? eventOrUuid : target?.closest('[data-uuid]')?.dataset?.uuid;
    if (!uuid || !app.selectedList) return;
    if (app.selectionMode) {
      const event = typeof eventOrUuid === 'object' ? eventOrUuid : null;
      EditingController.#toggleSelection(app, 'remove', uuid, target, event);
      app.render(false, { parts: ['content', 'footer'] });
      return;
    }
    app.pendingChanges.removed.add(uuid);
    app.pendingChanges.added.delete(uuid);
    app.selectedList.spellUuids = app.selectedList.spellUuids.filter((u) => u !== uuid);
    app.selectedList.spells = app.selectedList.spells.filter((s) => s.uuid !== uuid && s.compendiumUuid !== uuid);
    app.selectedList.spellsByLevel = app._organizeSpellsByLevel(app.selectedList.spells);
    app.render(false, { parts: ['content'] });
  }

  /**
   * Restore a custom list to its original state.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async restoreOriginal(app) {
    if (!app.selectedList) return;
    const originalUuid = app.selectedList.document.flags?.[MODULE.ID]?.originalUuid;
    if (!originalUuid) return;
    const confirmed = await confirmDialog({
      title: 'SPELLBOOK.Manager.Confirm.RestoreTitle',
      content: _loc('SPELLBOOK.Manager.Confirm.RestoreContent', { name: `<strong>${app.selectedList.name}</strong>` }),
      confirmLabel: 'ATLAS.Common.Restore',
      confirmIcon: 'fas fa-sync',
      confirmCssClass: 'dialog-button-warning',
      parent: app
    });
    if (!confirmed) return;
    const original = await fromUuid(originalUuid);
    if (!original) return;
    const originalSpells = Array.from(original.system.spells || []);
    await app.selectedList.document.update({
      'system.spells': originalSpells,
      [`flags.${MODULE.ID}.originalModTime`]: original._stats?.modifiedTime || 0,
      [`flags.${MODULE.ID}.originalVersion`]: original._stats?.systemVersion || game.system.version
    });
    app.selectedList.spellUuids = originalSpells;
    await app._loadSelectedSpellDetails(originalSpells);
  }

  /**
   * Rename a custom/merged spell list via dialog.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async renameList(app) {
    if (!app.selectedList) return;
    const flags = app.selectedList.document.flags?.[MODULE.ID] || {};
    if (!flags.kind) return;
    const currentName = app.selectedList.name;
    const content = await renderTemplate(TEMPLATES.DIALOGS.RENAME_SPELL_LIST, { currentName });
    let newName = null;
    const result = await DialogV2.wait({
      window: { title: _loc('SPELLBOOK.Manager.Rename.Title', { currentName }), icon: 'fas fa-pen' },
      classes: ['spell-book', 'rename-spell-list-dialog'],
      content,
      position: { width: 'auto', height: 'auto' },
      renderOptions: detachedRenderOptions(app),
      buttons: [
        {
          label: 'ATLAS.Common.Rename',
          icon: 'fas fa-check',
          action: 'rename',
          callback: (_event, _target, form) => {
            const el = form?.querySelector ? form : form.element;
            const value = el.querySelector('[name="newName"]')?.value?.trim();
            if (!value || value === currentName || this.#isDuplicateName(app, value)) return false;
            newName = value;
            return 'rename';
          }
        },
        { label: 'ATLAS.Common.Cancel', icon: 'fas fa-times', action: 'cancel' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    if (result !== 'rename' || !newName) return;
    const doc = app.selectedList.document;
    if (doc.parent && doc.parent.pages.size === 1) await doc.parent.update({ name: newName });
    await doc.update({ name: newName });
    app.selectedList.name = newName;
    await app._refreshLists();
    await app.selectSpellList(doc.uuid);
  }

  /**
   * Check whether a proposed name already exists (excluding the current list).
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {string} name - Proposed name to check
   * @returns {boolean} True if another list already has this name
   * @private
   */
  static #isDuplicateName(app, name) {
    const lower = name.toLowerCase();
    return app.availableLists.some((l) => l.name.toLowerCase() === lower && l.uuid !== app.selectedList?.uuid);
  }

  /**
   * Toggle the selected list's registry enrollment.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The registry checkbox element
   */
  static async toggleRegistry(app, event, target) {
    event.preventDefault();
    event.stopPropagation();
    if (!app.selectedList) return;
    const newState = await toggleListForRegistry(app.selectedList.uuid);
    target.checked = newState;
  }

  /**
   * Toggle a spell into/out of the comparison set.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The capturing element
   */
  static async compareSpell(app, _event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    if (app.comparisonSet.has(uuid)) app.comparisonSet.delete(uuid);
    else app.comparisonSet.add(uuid);
    ATLAS.log(3, 'Comparison set toggled', { uuid, size: app.comparisonSet.size, dialogOpen: !!app.comparisonDialog });
    try {
      if (app.comparisonSet.size >= 2) {
        if (!app.comparisonDialog) {
          ATLAS.log(3, 'Opening spell comparison dialog');
          app.comparisonDialog = new SpellComparison({
            spellUuids: Array.from(app.comparisonSet),
            onClose: () => {
              app.comparisonDialog = null;
              app.comparisonSet.clear();
              app.render(false, { parts: ['content'] });
            }
          });
          await app.comparisonDialog.render({ force: true, ...detachedRenderOptions(app) });
          ATLAS.log(3, 'Spell comparison dialog rendered');
        } else {
          app.comparisonDialog.spellUuids = Array.from(app.comparisonSet);
          await app.comparisonDialog.render({ force: false, ...detachedRenderOptions(app) });
          app.comparisonDialog.bringToFront();
        }
      } else if (app.comparisonDialog && app.comparisonSet.size < 2) {
        await app.comparisonDialog.close();
        app.comparisonDialog = null;
      }
    } catch (err) {
      ATLAS.log(1, 'Spell comparison failed', err);
      ui.notifications.error(_loc('SPELLBOOK.Comparison.Failed', { error: err.message }));
    }
    app.render(false, { parts: ['content'] });
  }

  /**
   * Toggle bulk selection mode.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static toggleSelectionMode(app) {
    app.selectionMode = !app.selectionMode;
    if (!app.selectionMode) app._clearSelections();
    else {
      app.selectedToAdd.clear();
      app.selectedToRemove.clear();
      app.lastSelectedIndex = { add: -1, remove: -1 };
    }
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Toggle a spell's selection, with shift-click range support against the last clicked item.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {'add'|'remove'} type - Which selection set to operate on
   * @param {string} uuid - Clicked spell uuid
   * @param {HTMLElement} [target] - Clicked DOM element (button or item)
   * @param {Event} [event] - Originating click event (for shiftKey detection)
   * @private
   */
  static #toggleSelection(app, type, uuid, target, event) {
    const set = type === 'add' ? app.selectedToAdd : app.selectedToRemove;
    const panel = target?.closest(type === 'add' ? '.available-spells-panel' : '.current-list-panel');
    const items = panel ? Array.from(panel.querySelectorAll('.spell-item[data-uuid]')) : [];
    const clickedIdx = items.findIndex((li) => li.dataset.uuid === uuid);
    const lastIdx = app.lastSelectedIndex?.[type] ?? -1;
    if (event?.shiftKey && lastIdx >= 0 && clickedIdx >= 0 && lastIdx < items.length) {
      const shouldSelect = !set.has(uuid);
      const [lo, hi] = clickedIdx < lastIdx ? [clickedIdx, lastIdx] : [lastIdx, clickedIdx];
      for (let i = lo; i <= hi; i++) {
        const id = items[i]?.dataset?.uuid;
        if (!id) continue;
        if (shouldSelect) set.add(id);
        else set.delete(id);
      }
    } else if (set.has(uuid)) set.delete(uuid);
    else set.add(uuid);
    if (clickedIdx >= 0) app.lastSelectedIndex[type] = clickedIdx;
  }

  /**
   * Bulk select all visible spells of a given type.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The capturing element
   */
  static selectAll(app, _event, target) {
    if (app.isSelectingAll) return;
    app.isSelectingAll = true;
    const type = target.dataset.type;
    if (type === 'add') {
      const visible = app._filterAvailableSpells().spells;
      for (const spell of visible) {
        if (target.checked) app.selectedToAdd.add(spell.uuid);
        else app.selectedToAdd.delete(spell.uuid);
      }
    } else if (type === 'remove') {
      const current = app.selectedList?.spells || [];
      for (const spell of current) {
        const uuid = spell.uuid || spell.compendiumUuid;
        if (target.checked) app.selectedToRemove.add(uuid);
        else app.selectedToRemove.delete(uuid);
      }
    }
    app.isSelectingAll = false;
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Apply all pending bulk additions/removals at once.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async bulkSave(app) {
    const addCount = app.selectedToAdd.size;
    const removeCount = app.selectedToRemove.size;
    const total = addCount + removeCount;
    if (total === 0 || !app.selectedList || !app.selectedList) return;
    let msg = '';
    if (addCount > 0 && removeCount > 0) msg = _loc('SPELLBOOK.Manager.BulkOps.ConfirmAddAndRemove', { addCount, removeCount });
    else if (addCount > 0) msg = _loc('SPELLBOOK.Manager.BulkOps.ConfirmAdd', { count: addCount });
    else msg = _loc('SPELLBOOK.Manager.BulkOps.ConfirmRemove', { count: removeCount });
    const confirmed = await confirmDialog({
      title: 'SPELLBOOK.Manager.BulkOps.ConfirmSave',
      content: msg,
      confirmLabel: 'SPELLBOOK.Manager.BulkOps.SaveChanges',
      confirmIcon: 'fas fa-save',
      confirmCssClass: 'dialog-button-success',
      parent: app
    });
    if (!confirmed) return;
    for (const uuid of app.selectedToRemove) {
      app.pendingChanges.removed.add(uuid);
      app.pendingChanges.added.delete(uuid);
      app.selectedList.spellUuids = app.selectedList.spellUuids.filter((u) => u !== uuid);
      app.selectedList.spells = app.selectedList.spells.filter((s) => s.uuid !== uuid && s.compendiumUuid !== uuid);
    }
    for (const uuid of app.selectedToAdd) {
      app.pendingChanges.added.add(uuid);
      app.pendingChanges.removed.delete(uuid);
      const spell = app.availableSpells.find((s) => s.uuid === uuid);
      if (!spell) continue;
      const clone = foundry.utils.deepClone(spell);
      clone.compendiumUuid = uuid;
      if (!clone.enrichedIcon) clone.enrichedIcon = createSpellIconLink(clone);
      app.selectedList.spellUuids.push(uuid);
      app.selectedList.spells.push(clone);
    }
    app.selectedList.spellsByLevel = app._organizeSpellsByLevel(app.selectedList.spells);
    app._clearSelections();
    ui.notifications.info(_loc('SPELLBOOK.Manager.BulkOps.Completed', { count: total }));
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Apply the selected spells' membership across every eligible list in one pass.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @param {string[]} spellUuids - The spells being assigned
   * @param {string[]} targetUuids - List UUIDs the spells should end up on
   */
  static async applySpellToLists(app, spellUuids, targetUuids) {
    if (!spellUuids.length) return;
    const target = new Set(targetUuids);
    const membership = app.spellListMembership;
    const isStock = (list) => !list.isCustom && !list.isMerged && !list.isActorOwned;
    const plans = [];
    for (const list of app.availableLists) {
      const wanted = target.has(list.uuid);
      const adds = wanted ? spellUuids.filter((uuid) => !membership.get(uuid)?.has(list.uuid)) : [];
      const removes = wanted ? [] : spellUuids.filter((uuid) => membership.get(uuid)?.has(list.uuid));
      if (adds.length || removes.length) plans.push({ list, adds, removes });
    }
    if (!plans.length) return;
    const addCount = plans.reduce((total, plan) => total + plan.adds.length, 0);
    const removeCount = plans.reduce((total, plan) => total + plan.removes.length, 0);
    const duplicating = plans.filter((plan) => isStock(plan.list)).length;
    let msg = '';
    if (addCount && removeCount) msg = _loc('SPELLBOOK.Manager.SpellFirst.ConfirmAddAndRemove', { addCount, removeCount });
    else if (addCount) msg = _loc('SPELLBOOK.Manager.SpellFirst.ConfirmAdd', { count: addCount });
    else msg = _loc('SPELLBOOK.Manager.SpellFirst.ConfirmRemove', { count: removeCount });
    if (duplicating) msg += ` ${_loc('SPELLBOOK.Manager.SpellFirst.ConfirmDuplicate', { count: duplicating })}`;
    const confirmed = await confirmDialog({
      title: 'SPELLBOOK.Manager.SpellFirst.ConfirmTitle',
      content: msg,
      confirmLabel: 'SPELLBOOK.Manager.BulkOps.SaveChanges',
      confirmIcon: 'fas fa-save',
      confirmCssClass: 'dialog-button-success',
      parent: app
    });
    if (!confirmed) return;
    const hiddenAdditions = [];
    const failed = [];
    let applied = 0;
    for (const { list, adds, removes } of plans) {
      let doc = await fromUuid(list.uuid);
      if (!doc) {
        failed.push(list.name);
        continue;
      }
      const flags = doc.flags?.[MODULE.ID] || {};
      if (!flags.kind && !flags.actorId) {
        const originalUuid = doc.uuid;
        const duplicate = await duplicateSpellList(doc);
        if (!duplicate) {
          failed.push(list.name);
          continue;
        }
        doc = duplicate;
        hiddenAdditions.push(originalUuid);
      }
      const spells = new Set(Array.from(doc.system.spells || []));
      for (const uuid of adds) spells.add(uuid);
      for (const uuid of removes) spells.delete(uuid);
      await doc.update({ 'system.spells': Array.from(spells) });
      await ensureListRegistered(doc.uuid);
      applied++;
    }
    if (hiddenAdditions.length) {
      const hidden = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
      const merged = [...new Set([...hidden, ...hiddenAdditions])];
      if (merged.length !== hidden.length) await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, merged);
    }
    app.availableLists = await findAllSpellLists();
    app.buildSpellListMembership();
    app.seedSpellListTargets();
    if (failed.length) ui.notifications.warn(_loc('SPELLBOOK.Manager.SpellFirst.PartialFailure', { count: failed.length, names: failed.join(', ') }));
    if (applied) ui.notifications.info(_loc('SPELLBOOK.Manager.SpellFirst.Completed', { count: applied }));
    app.render(false, { parts: ['sidebar', 'content', 'footer'] });
  }

  /**
   * Cancel the current bulk selection without applying.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static cancelSelection(app) {
    app._clearSelections();
    app.render(false, { parts: ['content', 'footer'] });
  }

  /**
   * Duplicate the currently-selected standard list so it can be edited.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @private
   */
  static async #duplicateForEditing(app) {
    app._clearSelections();
    let originalSource = '';
    if (app.selectedList.document.pack) originalSource = app.selectedList.document.pack.split('.')[0];
    const duplicate = await duplicateSpellList(app.selectedList.document);
    if (!duplicate) return;
    const { spells, spellsByLevel, spellUuids } = app.selectedList;
    app.selectedList = { document: duplicate, uuid: duplicate.uuid, name: duplicate.name, spellUuids, spells, spellsByLevel, isLoadingSpells: false };
    if (originalSource) app.filterState.source = originalSource;
  }
}
