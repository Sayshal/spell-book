/**
 * Spell Loadout Management Dialog
 *
 * Interface for saving, loading, and managing spell preparation configurations.
 * Provides loadout management capabilities for quickly switching between
 * different spell preparation setups and tactical configurations.
 *
 * Key features:
 * - Spell preparation loadout management
 * - Quick-switch preparation configurations
 * - Loadout saving and restoration
 * - Tactical preparation templates
 * - Multi-class loadout support
 * - Integration with spell preparation systems
 *
 * @module Dialogs/LoadoutSelector
 * @author Tyler
 */

import { FLAGS, MODULE, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { Loadouts } from '../managers/_module.mjs';
import * as UIUtils from '../ui/_module.mjs';
import * as ValidationUtils from '../validation/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef {Object} LoadoutData
 * @property {string} id - Unique identifier for the loadout
 * @property {string} name - Display name of the loadout
 * @property {string} description - Optional description text
 * @property {string[]} spellConfiguration - Array of spell UUIDs in the loadout
 * @property {string} classIdentifier - Class this loadout is associated with
 * @property {number} createdAt - Timestamp when loadout was created
 * @property {number} updatedAt - Timestamp when loadout was last modified
 */

/**
 * @typedef {Object} LoadoutWithMetadata
 * @property {string} id - Unique identifier for the loadout
 * @property {string} name - Display name of the loadout
 * @property {string} description - Optional description text
 * @property {string[]} spellConfiguration - Array of spell UUIDs in the loadout
 * @property {string} classIdentifier - Class this loadout is associated with
 * @property {number} createdAt - Timestamp when loadout was created
 * @property {number} updatedAt - Timestamp when loadout was last modified
 * @property {number} spellCount - Number of spells in the loadout
 * @property {string|null} formattedDate - Human-readable time since last update
 */

/**
 * @typedef {Object} SpellPreviewData
 * @property {string} name - Spell name
 * @property {string} img - Spell icon path
 * @property {number} level - Spell level (0 for cantrips)
 * @property {string} uuid - Spell UUID
 */

/**
 * Dialog application for managing spell loadouts.
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class LoadoutSelector extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {ApplicationOptions} */
  static DEFAULT_OPTIONS = {
    id: 'spell-loadout-dialog',
    tag: 'form',
    actions: {
      saveLoadout: LoadoutSelector.saveLoadout,
      applyLoadout: LoadoutSelector.applyLoadout,
      overwriteLoadout: LoadoutSelector.overwriteLoadout,
      deleteLoadout: LoadoutSelector.deleteLoadout
    },
    classes: ['spell-book', 'spell-loadout-dialog'],
    window: { icon: 'fas fa-toolbox', resizable: true, minimizable: false, positioned: true },
    position: { width: 600, height: 'auto' }
  };

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.SPELL_LOADOUT }
  };

  /**
   * Create a new Spell Loadout dialog instance.
   * @param {Actor} actor - The actor whose loadouts to manage
   * @param {SpellBook} spellbook - The parent Spell Book application reference
   * @param {string} classIdentifier - The current class identifier for loadout scope
   * @param {Object} [options={}] - Additional application options
   */
  constructor(actor, spellbook, classIdentifier, options = {}) {
    super(options);

    /** @type {SpellBook} Reference to the parent spell book application */
    this.spellbook = spellbook;

    /** @type {string} The class identifier for scoping loadouts */
    this.classIdentifier = classIdentifier;

    /** @type {Loadouts} Manager for loadout operations */
    this.loadoutManager = new Loadouts(actor, spellbook);
  }

  /** @override */
  get title() {
    const className = this.spellbook._state.classSpellData[this.classIdentifier]?.className || this.classIdentifier;
    return game.i18n.format('SPELLBOOK.Loadouts.DialogTitle', { class: className });
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.classIdentifier = this.classIdentifier;
    context.className = this.spellbook._state.classSpellData[this.classIdentifier]?.className || this.classIdentifier;
    const existingLoadouts = this.loadoutManager.getAvailableLoadouts(this.classIdentifier);
    context.existingLoadouts = existingLoadouts.map((loadout) => ({
      ...loadout,
      spellCount: Array.isArray(loadout.spellConfiguration) ? loadout.spellConfiguration.length : 0,
      formattedDate: loadout.updatedAt ? foundry.utils.timeSince(loadout.updatedAt) : null
    }));
    const currentState = this.loadoutManager.captureCurrentState(this.classIdentifier);
    context.currentSpellCount = currentState.length;
    const nameInput = ValidationUtils.createTextInput({
      name: 'loadout-name',
      placeholder: game.i18n.localize('SPELLBOOK.Loadouts.NamePlaceholder'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Loadouts.LoadoutName')
    });
    context.nameInputHtml = ValidationUtils.elementToHtml(nameInput);
    const descriptionInput = ValidationUtils.createTextInput({
      name: 'loadout-description',
      placeholder: game.i18n.localize('SPELLBOOK.Loadouts.DescriptionPlaceholder'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Loadouts.LoadoutDescription')
    });
    context.descriptionInputHtml = ValidationUtils.elementToHtml(descriptionInput);
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._setupSpellPreviewHandlers();
  }

  /**
   * Action handler to save current spell configuration as a new loadout.
   * @param {Event} _event - The form event (unused)
   * @param {HTMLElement} target - The clicked element
   * @returns {Promise<void>}
   * @static
   */
  static async saveLoadout(_event, target) {
    const form = target.closest('form');
    const formData = new FormData(form);
    const name = formData.get('loadout-name')?.trim();
    const description = formData.get('loadout-description')?.trim() || '';
    if (!name) {
      ui.notifications.warn(game.i18n.localize('SPELLBOOK.Loadouts.NameRequired'));
      return;
    }
    try {
      const spellConfiguration = this.loadoutManager.captureCurrentState(this.classIdentifier);
      if (spellConfiguration.length === 0) {
        ui.notifications.warn(game.i18n.localize('SPELLBOOK.Loadouts.NoSpellsPrepared'));
        return;
      }
      const success = await this.loadoutManager.saveLoadout(name, description, spellConfiguration, this.classIdentifier);
      if (success) {
        form.reset();
        await this.render({ force: true });
      }
    } catch (error) {}
  }

  /**
   * Action handler to overwrite an existing loadout with current configuration.
   * @param {Event} _event - The click event (unused)
   * @param {HTMLElement} target - The clicked element with loadout data
   * @returns {Promise<void>}
   * @static
   */
  static async overwriteLoadout(_event, target) {
    const loadoutId = target.dataset.loadoutId;
    if (!loadoutId) return;
    try {
      const existingLoadout = this.loadoutManager.loadLoadout(loadoutId);
      if (!existingLoadout) return;
      const spellConfiguration = this.loadoutManager.captureCurrentState(this.classIdentifier);
      if (spellConfiguration.length === 0) return;
      const updatedLoadout = { ...existingLoadout, spellConfiguration, updatedAt: Date.now() };
      await this.loadoutManager.actor.update({ [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.${loadoutId}`]: updatedLoadout });
      this.loadoutManager._invalidateCache();
      await this.render(false);
    } catch (error) {}
  }

  /**
   * Action handler to delete a loadout after user confirmation.
   * @param {Event} _event - The click event (unused)
   * @param {HTMLElement} target - The clicked element with loadout data
   * @returns {Promise<void>}
   * @static
   */
  static async deleteLoadout(_event, target) {
    const loadoutId = target.dataset.loadoutId;
    if (!loadoutId) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize('SPELLBOOK.Loadouts.ConfirmDelete'),
      content: game.i18n.format('SPELLBOOK.Loadouts.ConfirmDeleteContent', { name: target.dataset.loadoutName })
    });
    if (confirmed) {
      try {
        const success = await this.loadoutManager.deleteLoadout(loadoutId);
        if (success) await this.render(false);
      } catch (error) {}
    }
  }

  /**
   * Action handler to apply a saved loadout to current spell configuration.
   * @param {Event} _event - The click event (unused)
   * @param {HTMLElement} target - The clicked element with loadout data
   * @returns {void}
   * @static
   */
  static applyLoadout(_event, target) {
    const loadoutId = target.dataset.loadoutId;
    if (!loadoutId) return;
    try {
      const success = this.loadoutManager.applyLoadout(loadoutId, this.classIdentifier);
      if (success) this.close();
    } catch (error) {}
  }

  /**
   * Set up event handlers for spell preview tooltip functionality.
   * @private
   */
  _setupSpellPreviewHandlers() {
    const previewIcons = this.element.querySelectorAll('.spell-preview-icon');
    previewIcons.forEach((icon) => {
      icon.addEventListener('mouseenter', async (event) => {
        await this._showSpellPreview(event);
      });
      icon.addEventListener('mouseleave', () => {
        UIUtils.hideTooltip('spell-preview-tooltip');
      });
      icon.addEventListener('mousemove', (event) => {
        UIUtils.updateTooltipPosition('spell-preview-tooltip', event, 15);
      });
      icon.addEventListener(
        'wheel',
        (event) => {
          const tooltip = document.getElementById('spell-preview-tooltip');
          if (tooltip && tooltip.style.display !== 'none') {
            const scrollableList = tooltip.querySelector('.spell-preview-list');
            if (scrollableList) {
              event.preventDefault();
              scrollableList.scrollTop += event.deltaY;
            }
          }
        },
        { passive: false }
      );
    });
  }

  /**
   * Display spell preview tooltip for a loadout on mouse hover.
   * @param {Event} event - The mouse event containing loadout information
   * @returns {Promise<void>}
   * @private
   */
  async _showSpellPreview(event) {
    const loadoutId = event.target.dataset.loadoutId;
    const loadout = this.loadoutManager.loadLoadout(loadoutId);
    if (!loadout || !loadout.spellConfiguration) return;
    const loadingContent = `
      <div class="tooltip-content">
        <div class="loading">${game.i18n.localize('SPELLBOOK.Loadouts.LoadingSpells')}</div>
      </div>
    `;
    UIUtils.showTooltip('spell-preview-tooltip', loadingContent, event, 'spell-preview-tooltip');
    try {
      const spellData = await Promise.all(
        loadout.spellConfiguration.map(async (uuid) => {
          const spell = await fromUuid(uuid);
          return spell ? { name: spell.name, img: spell.img, level: spell.system?.level || 0, uuid: uuid } : null;
        })
      );
      const validSpells = spellData
        .filter((spell) => spell !== null)
        .sort((a, b) => {
          if (a.level !== b.level) return a.level - b.level;
          return a.name.localeCompare(b.name);
        });
      if (validSpells.length === 0) {
        const noSpellsContent = `
          <div class="tooltip-content">
            <div class="no-spells">${game.i18n.localize('SPELLBOOK.Loadouts.NoValidSpells')}</div>
          </div>
        `;
        UIUtils.showTooltip('spell-preview-tooltip', noSpellsContent, null, 'spell-preview-tooltip');
        return;
      }
      const spellsHtml = validSpells
        .map(
          (spell) => `
      <div class="spell-preview-item">
        <img src="${spell.img}" alt="${spell.name}" class="spell-icon" />
        <span class="spell-name">${spell.name}</span>
        ${spell.level > 0 ? `<span class="spell-level">${spell.level}</span>` : 'C'}
      </div>
    `
        )
        .join('');
      const content = `
        <div class="tooltip-content">
          <div class="tooltip-header">
            <strong>${loadout.name}</strong> ${game.i18n.format('SPELLBOOK.Loadouts.SpellCountParens', { count: validSpells.length })}
          </div>
          <div class="spell-preview-list">
            ${spellsHtml}
          </div>
        </div>
      `;
      UIUtils.showTooltip('spell-preview-tooltip', content, null, 'spell-preview-tooltip');
    } catch (error) {
      const errorContent = `
        <div class="tooltip-content">
          <div class="error">${game.i18n.localize('SPELLBOOK.Loadouts.ErrorLoadingPreview')}</div>
        </div>
      `;
      UIUtils.showTooltip('spell-preview-tooltip', errorContent, null, 'spell-preview-tooltip');
    }
  }

  /** @override */
  _onClose() {
    UIUtils.removeTooltip('spell-preview-tooltip');
    super._onClose();
  }
}
