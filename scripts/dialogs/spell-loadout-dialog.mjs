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
 * @module Dialogs/SpellLoadoutDialog
 * @author Tyler
 */

import { FLAGS, MODULE, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { SpellLoadoutManager } from '../managers/_module.mjs';
import * as ValidationHelpers from '../validation/_module.mjs';

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
 *
 * This dialog allows users to save, load, and manage different spell configurations
 * for specific classes. It provides functionality to capture current spell preparations,
 * save them as named loadouts, and apply previously saved configurations.
 *
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class SpellLoadoutDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {ApplicationOptions} */
  static DEFAULT_OPTIONS = {
    id: 'spell-loadout-dialog',
    tag: 'form',
    actions: {
      saveLoadout: SpellLoadoutDialog.saveLoadout,
      applyLoadout: SpellLoadoutDialog.applyLoadout,
      overwriteLoadout: SpellLoadoutDialog.overwriteLoadout,
      deleteLoadout: SpellLoadoutDialog.deleteLoadout
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
   *
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

    /** @type {SpellLoadoutManager} Manager for loadout operations */
    this.loadoutManager = new SpellLoadoutManager(actor, spellbook);
  }

  /** @override */
  get title() {
    const className = this.spellbook._stateManager.classSpellData[this.classIdentifier]?.className || this.classIdentifier;
    return game.i18n.format('SPELLBOOK.Loadouts.DialogTitle', { class: className });
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Load existing loadouts with metadata
    const existingLoadouts = this.loadoutManager.getAvailableLoadouts(this.classIdentifier);
    const loadoutsWithCounts = existingLoadouts.map((loadout) => ({
      ...loadout,
      spellCount: Array.isArray(loadout.spellConfiguration) ? loadout.spellConfiguration.length : 0,
      formattedDate: loadout.updatedAt ? foundry.utils.timeSince(loadout.updatedAt) : null
    }));

    // Create form input elements
    const nameInput = ValidationHelpers.createTextInput({
      name: 'loadout-name',
      placeholder: game.i18n.localize('SPELLBOOK.Loadouts.NamePlaceholder'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Loadouts.LoadoutName')
    });

    const descriptionInput = ValidationHelpers.createTextInput({
      name: 'loadout-description',
      placeholder: game.i18n.localize('SPELLBOOK.Loadouts.DescriptionPlaceholder'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Loadouts.LoadoutDescription')
    });

    // Get current spell configuration info
    const currentState = this.loadoutManager.captureCurrentState(this.classIdentifier);
    const currentSpellCount = currentState.length;

    return {
      ...context,
      classIdentifier: this.classIdentifier,
      className: this.spellbook._stateManager.classSpellData[this.classIdentifier]?.className || this.classIdentifier,
      existingLoadouts: loadoutsWithCounts,
      currentSpellCount: currentSpellCount,
      nameInputHtml: ValidationHelpers.elementToHtml(nameInput),
      descriptionInputHtml: ValidationHelpers.elementToHtml(descriptionInput)
    };
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._setupSpellPreviewHandlers();
  }

  /**
   * Action handler to save current spell configuration as a new loadout.
   *
   * Validates input, captures current spell state, and saves it as a named loadout
   * with optional description. Provides user feedback and refreshes the dialog.
   *
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

    // Validate required fields
    if (!name) {
      ui.notifications.warn(game.i18n.localize('SPELLBOOK.Loadouts.NameRequired'));
      return;
    }

    try {
      // Capture current spell configuration
      const spellConfiguration = this.loadoutManager.captureCurrentState(this.classIdentifier);

      if (spellConfiguration.length === 0) {
        ui.notifications.warn(game.i18n.localize('SPELLBOOK.Loadouts.NoSpellsPrepared'));
        return;
      }

      // Save the loadout
      const success = await this.loadoutManager.saveLoadout(name, description, spellConfiguration, this.classIdentifier);

      if (success) {
        ui.notifications.info(game.i18n.format('SPELLBOOK.Loadouts.Saved', { name }));
        form.reset();
        await this.render({ force: true });
      }
    } catch (error) {
      log(1, 'Error saving loadout:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Loadouts.SaveFailed'));
    }
  }

  /**
   * Action handler to overwrite an existing loadout with current configuration.
   *
   * Updates an existing loadout with the current spell preparation state,
   * preserving the original name and description while updating spell data.
   *
   * @param {Event} _event - The click event (unused)
   * @param {HTMLElement} target - The clicked element with loadout data
   * @returns {Promise<void>}
   * @static
   */
  static async overwriteLoadout(_event, target) {
    const loadoutId = target.dataset.loadoutId;
    const loadoutName = target.dataset.loadoutName;

    if (!loadoutId) return;

    try {
      // Load existing loadout data
      const existingLoadout = this.loadoutManager.loadLoadout(loadoutId);
      if (!existingLoadout) return;

      // Capture current spell configuration
      const spellConfiguration = this.loadoutManager.captureCurrentState(this.classIdentifier);
      if (spellConfiguration.length === 0) return;

      // Update loadout with new configuration
      const updatedLoadout = {
        ...existingLoadout,
        spellConfiguration,
        updatedAt: Date.now()
      };

      await this.loadoutManager.actor.update({
        [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.${loadoutId}`]: updatedLoadout
      });

      this.loadoutManager._invalidateCache();
      ui.notifications.info(game.i18n.format('SPELLBOOK.Loadouts.Overwritten', { name: loadoutName }));
      await this.render(false);
    } catch (error) {
      log(1, 'Error overwriting loadout:', error);
    }
  }

  /**
   * Action handler to delete a loadout after user confirmation.
   *
   * Prompts for confirmation before permanently deleting a saved loadout
   * from the actor's stored configurations.
   *
   * @param {Event} _event - The click event (unused)
   * @param {HTMLElement} target - The clicked element with loadout data
   * @returns {Promise<void>}
   * @static
   */
  static async deleteLoadout(_event, target) {
    const loadoutId = target.dataset.loadoutId;
    const loadoutName = target.dataset.loadoutName;

    if (!loadoutId) return;

    // Confirm deletion with user
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize('SPELLBOOK.Loadouts.ConfirmDelete'),
      content: game.i18n.format('SPELLBOOK.Loadouts.ConfirmDeleteContent', { name: loadoutName })
    });

    if (confirmed) {
      try {
        const success = await this.loadoutManager.deleteLoadout(loadoutId);
        if (success) await this.render(false);
      } catch (error) {
        log(1, 'Error deleting loadout:', error);
      }
    }
  }

  /**
   * Action handler to apply a saved loadout to current spell configuration.
   *
   * Loads a previously saved spell configuration and applies it to the current
   * character's spell preparation state. Closes dialog on successful application.
   *
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
    } catch (error) {
      log(1, 'Error applying loadout:', error);
    }
  }

  /**
   * Set up event handlers for spell preview tooltip functionality.
   *
   * Establishes mouse event listeners for loadout spell preview icons to show
   * detailed spell information on hover with proper positioning.
   *
   * @private
   */
  _setupSpellPreviewHandlers() {
    const previewIcons = this.element.querySelectorAll('.spell-preview-icon');

    previewIcons.forEach((icon) => {
      icon.addEventListener('mouseenter', async (event) => {
        await this._showSpellPreview(event);
      });

      icon.addEventListener('mouseleave', () => {
        this._hideSpellPreview();
      });

      icon.addEventListener('mousemove', (event) => {
        this._positionTooltip(event);
      });
    });
  }

  /**
   * Display spell preview tooltip for a loadout on mouse hover.
   *
   * Loads and displays detailed information about all spells in a loadout,
   * including icons, names, and levels, organized by spell level.
   *
   * @param {Event} event - The mouse event containing loadout information
   * @returns {Promise<void>}
   * @private
   */
  async _showSpellPreview(event) {
    const loadoutId = event.target.dataset.loadoutId;
    const loadout = this.loadoutManager.loadLoadout(loadoutId);

    if (!loadout || !loadout.spellConfiguration) return;

    // Create or get existing tooltip element
    let tooltip = document.getElementById('spell-preview-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'spell-preview-tooltip';
      tooltip.className = 'spell-preview-tooltip';
      document.body.appendChild(tooltip);
    }

    try {
      // Show loading state
      tooltip.innerHTML = `
      <div class="tooltip-content">
        <div class="loading">${game.i18n.localize('SPELLBOOK.Loadouts.LoadingSpells')}</div>
      </div>
    `;
      tooltip.style.display = 'block';
      this._positionTooltip(event, tooltip);

      // Load spell data for all spells in loadout
      const spellData = await Promise.all(
        loadout.spellConfiguration.map(async (uuid) => {
          const spell = await fromUuid(uuid);
          return spell
            ? {
                name: spell.name,
                img: spell.img,
                level: spell.system?.level || 0,
                uuid: uuid
              }
            : null;
        })
      );

      // Filter and sort valid spells
      const validSpells = spellData
        .filter((spell) => spell !== null)
        .sort((a, b) => {
          if (a.level !== b.level) return a.level - b.level;
          return a.name.localeCompare(b.name);
        });

      if (validSpells.length === 0) {
        tooltip.innerHTML = `
        <div class="tooltip-content">
          <div class="no-spells">${game.i18n.localize('SPELLBOOK.Loadouts.NoValidSpells')}</div>
        </div>
      `;
        return;
      }

      // Generate spell list HTML
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

      // Update tooltip with spell data
      tooltip.innerHTML = `
      <div class="tooltip-content">
        <div class="tooltip-header">
          <strong>${loadout.name}</strong> ${game.i18n.format('SPELLBOOK.Loadouts.SpellCountParens', { count: validSpells.length })}
        </div>
        <div class="spell-preview-list">
          ${spellsHtml}
        </div>
      </div>
    `;
    } catch (error) {
      log(1, 'Error showing spell preview:', error);
      tooltip.innerHTML = `
      <div class="tooltip-content">
        <div class="error">${game.i18n.localize('SPELLBOOK.Loadouts.ErrorLoadingPreview')}</div>
      </div>
    `;
    }
  }

  /**
   * Hide the spell preview tooltip.
   *
   * Removes the preview tooltip from display when mouse leaves the preview area.
   *
   * @private
   */
  _hideSpellPreview() {
    const tooltip = document.getElementById('spell-preview-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  /**
   * Position tooltip near cursor with viewport boundary checking.
   *
   * Dynamically positions the preview tooltip near the mouse cursor while
   * ensuring it remains within viewport boundaries.
   *
   * @param {Event} event - The mouse event with cursor position
   * @param {HTMLElement} [tooltip=null] - Optional tooltip element reference
   * @private
   */
  _positionTooltip(event, tooltip = null) {
    if (!tooltip) tooltip = document.getElementById('spell-preview-tooltip');
    if (!tooltip) return;

    const offset = 15;
    const x = event.clientX + offset;
    const y = event.clientY + offset;
    const rect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    // Adjust position to keep tooltip in viewport
    if (x + rect.width > viewportWidth) finalX = event.clientX - rect.width - offset;
    if (y + rect.height > viewportHeight) finalY = event.clientY - rect.height - offset;

    tooltip.style.left = `${finalX}px`;
    tooltip.style.top = `${finalY}px`;
  }

  /** @override */
  _onClose() {
    // Clean up tooltip when dialog closes
    const tooltip = document.getElementById('spell-preview-tooltip');
    if (tooltip) tooltip.remove();
    super._onClose();
  }
}
