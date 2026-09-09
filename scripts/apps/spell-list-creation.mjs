import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { createMergedSpellList, createNewSpellList, findSpellListsByType, isSourceHiddenSpellList } from '../data/_module.mjs';
import { detachedRenderOptions } from '../ui/_module.mjs';

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** @typedef {foundry.applications.api.ApplicationV2} SpellListManager The parent Spell List Manager application these handlers act on */

/** Sub-controller for list creation and merging. Internal to this module. */
export class CreationController {
  /**
   * Open the "create new list" dialog and create the list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async createList(app) {
    const identifierOptions = await this.#getClassIdentifierOptions();
    const content = await renderTemplate(TEMPLATES.DIALOGS.CREATE_SPELL_LIST, { identifierOptions });
    let formData = null;
    const result = await DialogV2.wait({
      window: { title: 'SPELLBOOK.Manager.Buttons.CreateNew', icon: 'fas fa-plus', resizable: false, minimizable: false },
      classes: ['spell-book', 'create-spell-list-dialog'],
      position: { width: 650, height: 'auto' },
      content,
      renderOptions: detachedRenderOptions(app),
      render: (_event, dialog) => {
        const identifierSelect = dialog.element.querySelector('[name="identifier"]');
        const customInput = dialog.element.querySelector('[name="customIdentifier"]');
        if (!identifierSelect || !customInput) return;
        const sync = () => {
          customInput.disabled = identifierSelect.value !== 'custom';
        };
        identifierSelect.addEventListener('change', sync);
        sync();
      },
      buttons: [
        {
          label: 'SPELLBOOK.Manager.Buttons.CreateNew',
          icon: 'fas fa-check',
          action: 'create',
          callback: (_event, _target, form) => {
            const el = form?.querySelector ? form : form.element;
            const name = el.querySelector('[name="name"]')?.value?.trim();
            const identifierSelect = el.querySelector('[name="identifier"]');
            const customInput = el.querySelector('[name="customIdentifier"]');
            const isSubclass = !!el.querySelector('[name="is-subclass"]')?.checked;
            if (!identifierSelect) return false;
            let identifier = identifierSelect.value;
            let defaultName = '';
            if (identifier === 'custom') {
              identifier = customInput?.value || '';
              if (!/^[\d_a-z-]+$/.test(identifier)) return false;
              defaultName = identifier.charAt(0).toUpperCase() + identifier.slice(1);
            } else {
              const opt = identifierOptions.find((o) => o.id === identifier);
              if (opt) defaultName = opt.name;
            }
            const finalName = name || defaultName;
            if (!finalName || !identifier) return false;
            formData = { name: finalName, identifier, isSubclass };
            return 'create';
          }
        },
        { label: 'ATLAS.Common.Cancel', icon: 'fas fa-times', action: 'cancel' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    if (result !== 'create' || !formData) return;
    const newList = await createNewSpellList(formData.name, formData.identifier, formData.isSubclass ? 'subclass' : 'class');
    if (!newList) return;
    await app._refreshLists();
    await app.selectSpellList(newList.uuid);
  }

  /**
   * Open the "merge lists" dialog and create a merged list.
   * @param {SpellListManager} app - The parent spell-list-manager app
   */
  static async mergeLists(app) {
    if (app.availableLists.length < 2) return;
    const content = await renderTemplate(TEMPLATES.DIALOGS.MERGE_SPELL_LISTS, { lists: this.getSpellListCandidates(app) });
    let formData = null;
    const result = await DialogV2.wait({
      window: { title: 'SPELLBOOK.Manager.MergeLists.DialogTitle', icon: 'fas fa-code-merge', resizable: false, minimizable: false },
      classes: ['spell-book', 'merge-spell-lists-dialog'],
      position: { width: 650, height: 'auto' },
      content,
      renderOptions: detachedRenderOptions(app),
      buttons: [
        {
          label: 'SPELLBOOK.Manager.Buttons.MergeLists',
          icon: 'fas fa-code-merge',
          action: 'merge',
          callback: (_event, _target, form) => {
            const el = form?.querySelector ? form : form.element;
            const multi = el.querySelector('[name="spellListsToMerge"]');
            const nameInput = el.querySelector('[name="mergedListName"]');
            const hideSource = !!el.querySelector('[name="hideSourceLists"]')?.checked;
            const uuids = Array.isArray(multi?.value) ? multi.value : [];
            const name = nameInput?.value?.trim();
            if (uuids.length < 2 || !name) return false;
            formData = { spellListUuids: uuids, mergedListName: name, hideSourceLists: hideSource };
            return 'merge';
          }
        },
        { label: 'ATLAS.Common.Cancel', icon: 'fas fa-times', action: 'cancel' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    if (result !== 'merge' || !formData) return;
    const merged = await createMergedSpellList(formData.spellListUuids, formData.mergedListName);
    if (!merged) return;
    if (formData.hideSourceLists) {
      const hidden = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
      const toHide = formData.spellListUuids.filter((uuid) => {
        const src = app.availableLists.find((l) => l.uuid === uuid);
        return src && !src.isActorOwned && !hidden.includes(uuid);
      });
      if (toHide.length) await game.settings.set(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS, [...hidden, ...toHide]);
    }
    await app._refreshLists();
    await app.selectSpellList(merged.uuid);
  }

  /**
   * Produce class identifier options for the create-list dialog.
   * @returns {Promise<object[]>} [{ id, name }]
   * @private
   */
  static async #getClassIdentifierOptions() {
    const options = [];
    const seen = new Set();
    const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');
    for (const pack of itemPacks) {
      try {
        const index = await pack.getIndex({ fields: ['type', 'system.identifier'] });
        for (const entry of index) {
          if (entry.type !== 'class' || !entry.system?.identifier) continue;
          const id = entry.system.identifier.toLowerCase();
          if (seen.has(id)) continue;
          seen.add(id);
          options.push({ id, name: entry.name });
        }
      } catch (err) {
        ATLAS.log(2, `Error indexing ${pack.collection}`, err);
      }
    }
    for (const opt of findSpellListsByType('class')) {
      const id = opt.value?.split(':')[1]?.toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const label = opt.label || id;
      options.push({ id, name: label });
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Build grouped merge candidates for the merge dialog.
   * @param {SpellListManager} app - The parent spell-list-manager app
   * @returns {object} { standard, custom, merged, actorOwned }
   * @private
   */
  static getSpellListCandidates(app) {
    const hidden = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
    const visible = (list) => !hidden.includes(list.uuid);
    const sourceConfig = game.settings.get('dnd5e', 'packSourceConfiguration') ?? {};
    return {
      standard: app.availableLists.filter((l) => !l.isActorOwned && !l.isCustom && !l.isMerged && visible(l) && !isSourceHiddenSpellList(l.system?.spells, false, sourceConfig)),
      custom: app.availableLists.filter((l) => !l.isActorOwned && !l.isMerged && l.isCustom && visible(l)),
      merged: app.availableLists.filter((l) => !l.isActorOwned && l.isMerged && visible(l)),
      actorOwned: app.availableLists.filter((l) => l.isActorOwned && visible(l))
    };
  }
}
