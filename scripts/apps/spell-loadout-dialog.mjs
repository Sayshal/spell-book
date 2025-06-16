import { FLAGS, MODULE, TEMPLATES } from '../constants.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import { log } from '../logger.mjs';
import { SpellLoadoutManager } from '../managers/spell-loadout-manager.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for managing spell loadouts
 */
export class SpellLoadoutDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'spell-loadout-dialog',
    tag: 'form',
    form: {
      handler: SpellLoadoutDialog.formHandler,
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      saveLoadout: SpellLoadoutDialog.saveLoadout,
      applyLoadout: SpellLoadoutDialog.applyLoadout,
      overwriteLoadout: SpellLoadoutDialog.overwriteLoadout,
      deleteLoadout: SpellLoadoutDialog.deleteLoadout
    },
    classes: ['spell-loadout-dialog'],
    window: { icon: 'fas fa-toolbox', resizable: true, minimizable: false, positioned: true },
    position: { width: 600, height: 'auto' }
  };

  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.SPELL_LOADOUT }
  };

  /**
   * @param {Actor} actor - The actor whose loadouts to manage
   * @param {PlayerSpellBook} spellbook - The spellbook reference
   * @param {string} classIdentifier - The current class identifier
   * @param {Object} options - Additional options
   */
  constructor(actor, spellbook, classIdentifier, options = {}) {
    super(options);
    this.actor = actor;
    this.spellbook = spellbook;
    this.classIdentifier = classIdentifier;
    this.loadoutManager = new SpellLoadoutManager(actor, spellbook);
  }

  /** @override */
  get title() {
    const className = this.spellbook._stateManager.classSpellData[this.classIdentifier]?.className || this.classIdentifier;
    return game.i18n.format('SPELLBOOK.Loadouts.DialogTitle', { class: className });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const existingLoadouts = this.loadoutManager.getAvailableLoadouts(this.classIdentifier);
    const loadoutsWithCounts = existingLoadouts.map((loadout) => ({
      ...loadout,
      spellCount: Array.isArray(loadout.spellConfiguration) ? loadout.spellConfiguration.length : 0,
      formattedDate: loadout.updatedAt ? foundry.utils.timeSince(loadout.updatedAt) : null
    }));
    const nameInput = formElements.createTextInput({
      name: 'loadout-name',
      placeholder: game.i18n.localize('SPELLBOOK.Loadouts.NamePlaceholder'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Loadouts.LoadoutName')
    });
    const descriptionInput = formElements.createTextInput({
      name: 'loadout-description',
      placeholder: game.i18n.localize('SPELLBOOK.Loadouts.DescriptionPlaceholder'),
      ariaLabel: game.i18n.localize('SPELLBOOK.Loadouts.LoadoutDescription')
    });
    const currentState = this.loadoutManager.captureCurrentState(this.classIdentifier);
    const currentSpellCount = currentState.length;
    context.classIdentifier = this.classIdentifier;
    context.className = this.spellbook._stateManager.classSpellData[this.classIdentifier]?.className || this.classIdentifier;
    context.existingLoadouts = loadoutsWithCounts;
    context.currentSpellCount = currentSpellCount;
    context.nameInputHtml = formElements.elementToHtml(nameInput);
    context.descriptionInputHtml = formElements.elementToHtml(descriptionInput);
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._setupSpellPreviewHandlers();
  }

  /**
   * Save current configuration as a new loadout
   * @param {Event} event - The form event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static async saveLoadout(event, target) {
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
   * Overwrite an existing loadout with current configuration
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static async overwriteLoadout(event, target) {
    const loadoutId = target.dataset.loadoutId;
    const loadoutName = target.dataset.loadoutName;
    if (!loadoutId) return;
    try {
      const existingLoadout = this.loadoutManager.loadLoadout(loadoutId);
      if (!existingLoadout) return;
      const spellConfiguration = this.loadoutManager.captureCurrentState(this.classIdentifier);
      if (spellConfiguration.length === 0) return;
      const updatedLoadout = { ...existingLoadout, spellConfiguration, updatedAt: Date.now() };
      await this.loadoutManager.actor.update({ [`flags.${MODULE.ID}.${FLAGS.SPELL_LOADOUTS}.${loadoutId}`]: updatedLoadout });
      this.loadoutManager._invalidateCache();
      ui.notifications.info(game.i18n.format('SPELLBOOK.Loadouts.Overwritten', { name: loadoutName }));
      await this.render(false);
    } catch (error) {
      log(1, 'Error overwriting loadout:', error);
    }
  }

  /**
   * Delete a loadout
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static async deleteLoadout(event, target) {
    const loadoutId = target.dataset.loadoutId;
    const loadoutName = target.dataset.loadoutName;
    if (!loadoutId) return;
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
   * Apply a loadout
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static applyLoadout(event, target) {
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
   * Set up spell preview hover handlers
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
   * Show spell preview tooltip
   * @param {Event} event - The mouse event
   * @private
   */
  async _showSpellPreview(event) {
    const loadoutId = event.target.dataset.loadoutId;
    const loadout = this.loadoutManager.loadLoadout(loadoutId);
    if (!loadout || !loadout.spellConfiguration) return;
    let tooltip = document.getElementById('spell-preview-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'spell-preview-tooltip';
      tooltip.className = 'spell-preview-tooltip';
      document.body.appendChild(tooltip);
    }
    try {
      tooltip.innerHTML = `
      <div class="tooltip-content">
        <div class="loading">${game.i18n.localize('SPELLBOOK.Loadouts.LoadingSpells')}</div>
      </div>
    `;
      tooltip.style.display = 'block';
      this._positionTooltip(event, tooltip);
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
        tooltip.innerHTML = `
        <div class="tooltip-content">
          <div class="no-spells">${game.i18n.localize('SPELLBOOK.Loadouts.NoValidSpells')}</div>
        </div>
      `;
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
   * Hide spell preview tooltip
   * @private
   */
  _hideSpellPreview() {
    const tooltip = document.getElementById('spell-preview-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  /**
   * Position tooltip near cursor
   * @param {Event} event - The mouse event
   * @param {HTMLElement} tooltip - Optional tooltip element
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
    if (x + rect.width > viewportWidth) finalX = event.clientX - rect.width - offset;
    if (y + rect.height > viewportHeight) finalY = event.clientY - rect.height - offset;
    tooltip.style.left = `${finalX}px`;
    tooltip.style.top = `${finalY}px`;
  }

  /** @override */
  _onClose() {
    const tooltip = document.getElementById('spell-preview-tooltip');
    if (tooltip) tooltip.remove();
    super._onClose();
  }

  /**
   * Form handler for the dialog
   * @param {Event} event - The form event
   * @param {HTMLElement} form - The form element
   * @param {Object} formData - The form data
   * @static
   */
  static async formHandler(event, form, formData) {
    return;
  }
}
