/**
 * Spell Loadout Management Dialog
 * @module Dialogs/LoadoutSelector
 * @author Tyler
 */

import { FLAGS, MODULE, TEMPLATES } from '../constants.mjs';
import { Loadouts } from '../managers/loadouts.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';
import { detachedRenderOptions } from '../ui/dialogs.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Dialog for managing spell loadouts (save/apply/overwrite/delete). */
export class LoadoutSelector extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-loadout-selector',
    tag: 'form',
    classes: ['spell-book', 'spell-loadout-dialog'],
    position: { width: 520, height: 'auto' },
    window: { icon: 'fas fa-toolbox', resizable: false, contentClasses: ['standard-form'] },
    actions: {
      save: LoadoutSelector.#onSave,
      apply: LoadoutSelector.#onApply,
      overwrite: LoadoutSelector.#onOverwrite,
      delete: LoadoutSelector.#onDelete
    }
  };

  /** @override */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.LOADOUT_SELECTOR } };

  /**
   * @param {object} options - Options including actor and classIdentifier
   * @param {object} options.actor - The actor whose loadouts to manage
   * @param {string} options.classIdentifier - The class identifier
   * @param {object} [options.parent] - Parent SpellBook (used to read live checkbox state)
   */
  constructor(options = {}) {
    super(options);
    this.actor = options.actor;
    this.classIdentifier = options.classIdentifier;
    this.parentApp = options.parent || null;
  }

  /** Pull UUIDs from the parent SpellBook's live checkboxes, or the actor flag as fallback. */
  #captureCurrentSpellUuids() {
    if (this.parentApp?.getCurrentPreparedUuids) return this.parentApp.getCurrentPreparedUuids(this.classIdentifier);
    const flag = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const keys = Array.isArray(flag) ? [] : flag[this.classIdentifier] || [];
    return keys.map((k) => k.split(':').slice(1).join(':'));
  }

  /** @override */
  get title() {
    const className = this.actor?.spellcastingClasses?.[this.classIdentifier]?.name || this.classIdentifier;
    return _loc('SPELLBOOK.Loadouts.DialogTitle', { class: className });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const loadouts = Loadouts.getLoadouts(this.actor, this.classIdentifier);
    context.existingLoadouts = loadouts.map((l) => ({
      ...l,
      spellCount: Array.isArray(l.spellConfiguration) ? l.spellConfiguration.length : 0,
      formattedDate: l.updatedAt ? foundry.utils.timeSince(l.updatedAt) : null,
      spellList: LoadoutSelector.#buildSpellListTooltip(l.spellConfiguration)
    }));
    return context;
  }

  /**
   * Resolve UUIDs to spell docs and build an HTML tooltip grouped by spell level.
   * @param {string[]} uuids - Spell UUIDs
   * @returns {string} HTML string for data-tooltip-html
   */
  static #buildSpellListTooltip(uuids) {
    if (!Array.isArray(uuids) || !uuids.length) return '';
    const spells = uuids.map((u) => fromUuidSync(u)).filter(Boolean);
    if (!spells.length) return '';
    spells.sort((a, b) => (a.system?.level ?? 0) - (b.system?.level ?? 0) || a.name.localeCompare(b.name));
    const rowStyle = 'display:flex;align-items:center;gap:0.4rem;white-space:nowrap;';
    const imgStyle = 'flex-shrink:0;width:1.25rem;height:1.25rem;border-radius:50%;object-fit:cover;border:0.0625rem solid rgba(255,255,255,0.15);';
    return spells
      .map((s) => {
        const img = foundry.utils.escapeHTML(s.img || 'icons/svg/book.svg');
        return `<div style="${rowStyle}"><img src="${img}" alt="" style="${imgStyle}"><span>${foundry.utils.escapeHTML(s.name)}</span></div>`;
      })
      .join('');
  }

  /**
   * Apply a list of spell UUIDs as the new prepared set for a class.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @param {string[]} loadoutUuids - UUIDs to mark prepared
   */
  static async applySpellConfiguration(actor, classIdentifier, loadoutUuids) {
    const flag = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const currentKeys = Array.isArray(flag) ? [] : flag[classIdentifier] || [];
    const current = new Set(currentKeys.map((k) => k.split(':').slice(1).join(':')));
    const target = new Set(loadoutUuids);
    const allUuids = new Set([...current, ...target]);
    const classSpellData = {};
    for (const uuid of allUuids) {
      const spell = fromUuidSync(uuid);
      if (!spell) continue;
      const key = `${classIdentifier}:${uuid}`;
      classSpellData[key] = {
        uuid,
        isPrepared: target.has(uuid),
        wasPrepared: current.has(uuid),
        spellLevel: spell.system?.level ?? 0,
        name: spell.name || '',
        isRitual: spell.system?.components?.ritual ?? false
      };
    }
    await SpellManager.saveClassSpecificPreparedSpells(actor, classIdentifier, classSpellData);
  }

  /**
   * Save the actor's currently-prepared spells as a new named loadout.
   * @this LoadoutSelector
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} target - The save button
   */
  static async #onSave(_event, target) {
    const form = target.closest('form');
    const name = form.querySelector('input[name="loadout-name"]')?.value?.trim();
    const description = form.querySelector('input[name="loadout-description"]')?.value?.trim() || '';
    if (!name) {
      ui.notifications.warn('SPELLBOOK.Loadouts.NameRequired', { localize: true });
      return;
    }
    const spellConfig = this.#captureCurrentSpellUuids();
    if (spellConfig.length === 0) {
      ui.notifications.warn('SPELLBOOK.Loadouts.NoSpellsPrepared', { localize: true });
      return;
    }
    const id = await Loadouts.saveLoadout(this.actor, this.classIdentifier, name, description, spellConfig);
    if (id) {
      form.reset();
      this.render(false);
    }
  }

  /**
   * Replace an existing loadout's spell configuration with the current prepared set.
   * @this LoadoutSelector
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} target - The overwrite button
   */
  static async #onOverwrite(_event, target) {
    const loadoutId = target.dataset.loadoutId;
    if (!loadoutId) return;
    const existing = Loadouts.getLoadout(this.actor, loadoutId);
    if (!existing) return;
    const spellConfig = this.#captureCurrentSpellUuids();
    if (spellConfig.length === 0) return;
    const updated = { ...existing, spellConfiguration: spellConfig, updatedAt: Date.now() };
    await this.actor.update({ [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.${loadoutId}`]: updated });
    Loadouts.invalidateCache(this.actor);
    this.render(false);
  }

  /**
   * Delete a loadout after a confirmation prompt.
   * @this LoadoutSelector
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} target - The delete button
   */
  static async #onDelete(_event, target) {
    const loadoutId = target.dataset.loadoutId;
    if (!loadoutId) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: _loc('SPELLBOOK.Loadouts.ConfirmDelete'),
      content: _loc('SPELLBOOK.Loadouts.ConfirmDeleteContent', { name: target.dataset.loadoutName }),
      renderOptions: detachedRenderOptions(this)
    });
    if (!confirmed) return;
    const ok = await Loadouts.deleteLoadout(this.actor, loadoutId);
    if (ok) this.render(false);
  }

  /**
   * Apply a saved loadout to the actor's prepared spells and close the dialog.
   * @this LoadoutSelector
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} target - The apply button
   */
  static async #onApply(_event, target) {
    const loadoutId = target.dataset.loadoutId;
    if (!loadoutId) return;
    const loadout = Loadouts.getLoadout(this.actor, loadoutId);
    if (!loadout?.spellConfiguration) return;
    await LoadoutSelector.applySpellConfiguration(this.actor, this.classIdentifier, loadout.spellConfiguration);
    await this.parentApp?.refreshClassTab?.(this.classIdentifier);
    this.close();
  }
}
