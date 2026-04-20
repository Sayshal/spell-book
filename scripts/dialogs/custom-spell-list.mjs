import { TEMPLATES } from '../constants.mjs';
import { compareListVersions, createNewSpellList, getValidCustomListMappings, removeCustomSpellList } from '../data/custom-lists.mjs';
import { detachedRenderOptions } from '../ui/dialogs.mjs';
import { log } from '../utils/logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Build context data for each custom spell list mapping.
 * @returns {Promise<object[]>} Array of { originalUuid, customUuid, originalName, customName, drift } objects
 */
async function buildMappingContexts() {
  const mappings = await getValidCustomListMappings();
  const results = [];
  for (const [originalUuid, customUuid] of Object.entries(mappings)) {
    const original = await fromUuid(originalUuid);
    const custom = await fromUuid(customUuid);
    const drift = await compareListVersions(originalUuid, customUuid);
    results.push({
      originalUuid,
      customUuid,
      originalName: original?.name ?? _loc('SPELLBOOK.Settings.UnknownList'),
      customName: custom?.name ?? _loc('SPELLBOOK.Settings.UnknownList'),
      hasOriginalChanged: drift.canCompare && drift.hasOriginalChanged,
      added: drift.added ?? 0,
      removed: drift.removed ?? 0,
      originalSpellCount: drift.originalSpellCount ?? 0,
      customSpellCount: drift.customSpellCount ?? 0
    });
  }
  results.sort((a, b) => a.originalName.localeCompare(b.originalName));
  return results;
}

/** Manage custom spell list mappings (GM-only). */
export class CustomSpellList extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-custom-spell-list',
    classes: ['spell-book', 'custom-spell-list'],
    position: { width: 550, height: 'auto' },
    window: { icon: 'fas fa-list-alt', resizable: true },
    actions: {
      create: CustomSpellList.#onCreate,
      remove: CustomSpellList.#onRemove,
      open: CustomSpellList.#onOpen
    }
  };

  /** @override */
  static PARTS = { content: { template: TEMPLATES.DIALOGS.CUSTOM_SPELL_LIST } };

  /** @override */
  get title() {
    return _loc('SPELLBOOK.CustomSpellList.Title');
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.mappings = await buildMappingContexts();
    context.hasMappings = context.mappings.length > 0;
    return context;
  }

  /**
   * Create a new custom spell list.
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} _target - Button element
   */
  static async #onCreate(_event, _target) {
    const name = await foundry.applications.api.DialogV2.prompt({
      title: _loc('SPELLBOOK.CustomSpellList.CreateTitle'),
      content: `<div class="form-group"><label>${_loc('SPELLBOOK.CustomSpellList.NameLabel')}</label><input type="text" name="name" autofocus></div>`,
      ok: { label: _loc('SPELLBOOK.CustomSpellList.Create'), callback: (_event, button) => button.form.elements.name.value.trim() },
      renderOptions: detachedRenderOptions(this)
    });
    if (!name) return;
    const identifier = name.toLowerCase().replace(/\s+/g, '-');
    await createNewSpellList(name, identifier, 'other');
    log(3, 'Created custom spell list.', { name, identifier });
    this.render({ force: true });
  }

  /**
   * Remove a custom spell list mapping.
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} target - Button with data-uuid
   */
  static async #onRemove(_event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: _loc('SPELLBOOK.CustomSpellList.RemoveTitle'),
      content: `<p>${_loc('SPELLBOOK.CustomSpellList.RemoveConfirm')}</p>`,
      renderOptions: detachedRenderOptions(this)
    });
    if (!confirmed) return;
    await removeCustomSpellList(uuid);
    log(3, 'Removed custom spell list.', { uuid });
    this.render({ force: true });
  }

  /**
   * Open a spell list document in its sheet.
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} target - Button with data-uuid
   */
  static async #onOpen(_event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    doc?.parent?.sheet?.render(true);
  }

  /**
   * Open the dialog, reusing an existing instance.
   * @returns {CustomSpellList} The dialog instance
   */
  static open() {
    const existing = foundry.applications.instances.get('spellbook-custom-spell-list');
    if (existing) {
      existing.render({ force: true });
      return existing;
    }
    const dialog = new CustomSpellList();
    dialog.render({ force: true });
    return dialog;
  }
}
