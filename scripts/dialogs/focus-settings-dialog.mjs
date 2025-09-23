/**
 * Spellcasting Focus Settings Dialog
 *
 * Configuration dialog for managing party spellcasting coordination and focus
 * assignments. Allows players to set their spellcasting priorities and roles
 * within a party context for optimized spell preparation and coordination.
 *
 * Key features:
 * - Individual spellcasting focus assignment
 * - Party role configuration and coordination
 * - Spell preparation priority settings
 * - Multi-character focus management
 * - Integration with party spell coordination
 * - Real-time focus updates and synchronization
 * - Dual-flag system with group and individual actor synchronization
 *
 * @module Dialogs/FocusSettingsDialog
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { PartySpellManager } from '../managers/_module.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/**
 * Spellcasting focus option configuration.
 *
 * @typedef {Object} FocusOption
 * @property {string} id - Unique identifier for the focus option (e.g., 'focus-damage', 'focus-healer')
 * @property {string} name - Display name of the focus option (e.g., 'Offensive Mage', 'Support')
 * @property {string} icon - File path to the focus option icon image
 * @property {string} description - Descriptive text explaining the focus role and strategy
 */

/**
 * Focus selections mapping stored in group actor flags.
 *
 * @typedef {Object} FocusSelections
 * @property {Object<string, string>} selections - Maps user IDs to selected focus option IDs
 */

/**
 * Party member data with focus assignment information.
 *
 * @typedef {Object} PartyMember
 * @property {string} id - User ID
 * @property {string} name - User display name
 * @property {string|null} actorName - Associated actor name (if available)
 * @property {string|null} selectedFocus - Currently selected focus option ID
 */

/**
 * Dialog application for managing spellcasting focus settings.
 *
 * This dialog allows configuration of spellcasting focus options and user selections
 * within a party context. GMs can manage available focus options while users can
 * select their preferred focus from the available choices.
 *
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class FocusSettingsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'focus-settings-dialog',
    tag: 'form',
    classes: ['spell-book', 'focus-settings-dialog'],
    window: { icon: 'fas fa-magic', resizable: true, minimizable: true, positioned: true },
    form: {
      handler: FocusSettingsDialog.formHandler,
      closeOnSubmit: true
    },
    actions: {
      addFocus: FocusSettingsDialog.addFocus,
      deleteFocus: FocusSettingsDialog.deleteFocus,
      selectFocus: FocusSettingsDialog.selectFocus,
      selectIcon: FocusSettingsDialog.selectIcon,
      resetFocuses: FocusSettingsDialog.resetFocuses
    },
    position: { width: 600, height: 'auto' }
  };

  /** @inheritdoc */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.FOCUS_SETTINGS } };

  /**
   * Create a new Focus Settings dialog instance.
   *
   * Initializes the dialog with the specified group actor, target actor,
   * and parent application context. Determines operating mode based on
   * user permissions and target actor presence.
   *
   * @param {Actor} groupActor - The group actor containing focus selections
   * @param {Actor} [targetActor=null] - Specific actor to configure focus for (null for GM mode)
   * @param {PartySpells} [parentApp=null] - The parent PartySpells app instance
   * @param {Object} [options={}] - Additional application options
   */
  constructor(groupActor, targetActor = null, parentApp = null, options = {}) {
    super(options);

    /** @type {Actor} The group actor storing focus selections */
    this.groupActor = groupActor;

    /** @type {Actor|null} The target actor for focus selection */
    this.targetActor = targetActor;

    /** @type {PartySpells|null} The parent app to refresh after changes */
    this.parentApp = parentApp;

    /** @type {boolean} Whether dialog is in GM management mode */
    this.isGMMode = game.user.isGM && !targetActor;
  }

  /** @inheritdoc */
  get title() {
    if (this.isGMMode) return game.i18n.localize('SPELLBOOK.FocusSettings.ManageTitle');
    else return game.i18n.format('SPELLBOOK.FocusSettings.SelectTitle', { actor: this.targetActor?.name || game.user.name });
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const settingData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    let focusData = Array.isArray(settingData) ? settingData[0] : settingData;
    if (!focusData?.focuses || focusData.focuses.length === 0) {
      focusData = { focuses: MODULE.DEFAULT_FOCUSES };
      await game.settings.set(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS, focusData);
    }
    context.availableFocuses = focusData.focuses;
    context.isGMMode = this.isGMMode;
    context.isReadOnly = this.targetActor && !game.user.isGM && !this.targetActor.isOwner;
    if (this.groupActor && this.isGMMode) {
      const userSelections = this.groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
      const partyUsers = PartySpellManager.getPartyUsers(this.groupActor);
      context.partyMembers = partyUsers.map((user) => ({
        id: user.id,
        name: user.name,
        actorName: user.actorName || null,
        selectedFocus: userSelections[user.id] || null
      }));
    } else if (this.groupActor) {
      const userSelections = this.groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
      context.currentSelection = userSelections[game.user.id] || null;
    }
    return context;
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this._addSelectedIconsToPreselectedCards();
  }

  /**
   * Add a new focus option row to the management interface (GM only).
   *
   * Creates a new focus option entry in the GM interface with default
   * values and proper form controls. Does not save to settings until
   * form submission.
   *
   * @param {Event} event - The triggering click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static async addFocus(event, target) {
    if (!game.user.isGM) return;
    const container = target.closest('form').querySelector('.focus-options-list');
    const index = container.children.length;
    const templateData = { index };
    const newFocusHtml = await renderTemplate(TEMPLATES.COMPONENTS.FOCUS_OPTION_ROW, templateData);
    container.insertAdjacentHTML('beforeend', newFocusHtml);
  }

  /**
   * Delete a specific focus option and clean up assignments (GM only).
   *
   * Removes a focus option from the world settings and cleans up any
   * user assignments using that focus. Updates both group actor flags
   * and individual actor flags to maintain consistency.
   *
   * @param {Event} event - The triggering click event
   * @param {HTMLElement} target - The clicked element with data-index attribute
   * @returns {Promise<void>}
   * @static
   */
  static async deleteFocus(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const button = target.closest('[data-index]');
    const index = parseInt(button?.dataset.index);
    if (isNaN(index)) return;
    const settingData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    const focusData = Array.isArray(settingData) ? settingData[0] : settingData;
    const focuses = focusData?.focuses || [];
    if (index < 0 || index >= focuses.length) return;
    const focusToDelete = focuses[index];
    const confirmed = await foundry.applications.api.DialogV2.wait({
      window: { title: 'SPELLBOOK.FocusSettings.DeleteDialog.Title', icon: 'fas fa-trash' },
      content: `<p>${game.i18n.format('SPELLBOOK.FocusSettings.DeleteDialog.Content', { name: focusToDelete.name })}</p>`,
      buttons: [
        { icon: 'fas fa-trash', label: 'SPELLBOOK.FocusSettings.DeleteDialog.Confirm', action: 'delete', className: 'dialog-button danger' },
        { icon: 'fas fa-times', label: 'SPELLBOOK.UI.Cancel', action: 'cancel', className: 'dialog-button' }
      ],
      default: 'cancel'
    });
    if (confirmed !== 'delete') return;
    focuses.splice(index, 1);
    await game.settings.set(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS, { focuses });
    if (this.groupActor) {
      const selections = this.groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
      let changed = false;
      for (const [userId, focusId] of Object.entries(selections)) {
        if (focusId === focusToDelete.id) {
          delete selections[userId];
          changed = true;
        }
      }
      if (changed) await this.groupActor.setFlag(MODULE.ID, FLAGS.SELECTED_FOCUS, selections);
      const partyUsers = PartySpellManager.getPartyUsers(this.groupActor);
      for (const user of partyUsers) {
        const actor = game.actors.get(user.actorId);
        if (!actor) continue;
        const assignedFocusId = selections[user.id];
        let focusName = null;
        if (assignedFocusId) {
          const focusObject = focuses.find((f) => f.id === assignedFocusId);
          focusName = focusObject?.name || null;
        }
        if (focusName) await actor.setFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS, focusName);
        else await actor.unsetFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS);
      }
    }
    if (this.parentApp) this.parentApp.render(true);
  }

  /**
   * Handle focus card selection in player mode.
   *
   * Updates both the visual state of focus cards and the hidden form input
   * to track the currently selected focus option. Only allows editing if user
   * has proper permissions (GM, or Owner of the target actor).
   *
   * @param {Event} event - The triggering click event
   * @param {HTMLElement} target - The clicked focus card element
   * @static
   */
  static async selectFocus(event, target) {
    event.preventDefault();
    const focusId = target.dataset.focusId;
    if (!focusId) return;
    if (this.targetActor && !game.user.isGM && !this.targetActor.isOwner) {
      ui.notifications.warn(game.i18n.localize('SPELLBOOK.FocusSettings.NoEditPermission'));
      return;
    }
    const allCards = target.closest('.focus-grid').querySelectorAll('.focus-card');
    allCards.forEach((card) => {
      card.classList.remove('selected');
      const existingIcon = card.querySelector('.selected-icon');
      if (existingIcon) existingIcon.remove();
    });
    target.classList.add('selected');
    const selectedIcon = document.createElement('i');
    selectedIcon.className = 'fa-solid fa-check selected-icon';
    target.appendChild(selectedIcon);
    const hiddenInput = target.closest('form').querySelector('#selected-focus-input');
    if (hiddenInput) hiddenInput.value = focusId;
  }

  /**
   * Action handler for icon selection via file picker.
   *
   * Opens the Foundry file picker to allow selection of custom icons
   * for focus options during GM configuration.
   *
   * @param {Event} event - The triggering click event
   * @param {HTMLElement} target - The clicked element
   * @returns {Promise<void>}
   * @static
   */
  static async selectIcon(event, target) {
    event.preventDefault();
    const index = target.dataset.index;
    if (index === undefined) return;
    try {
      const currentPath = target.querySelector('img')?.src || '';
      const picker = new foundry.applications.apps.FilePicker.implementation({
        type: 'image',
        current: currentPath,
        callback: (path) => {
          const img = target.querySelector('img');
          if (img) img.src = path;
          const hiddenInput = target.querySelector('input[type="hidden"]');
          if (hiddenInput) hiddenInput.value = path;
        }
      });
      picker.render(true);
    } catch (error) {
      log(1, 'Error opening file picker:', error);
      ui.notifications.error('Failed to open file picker');
    }
  }

  /**
   * Reset focus options to default magical archetypes.
   *
   * Resets all focus options to the predefined MODULE.DEFAULT_FOCUSES set,
   * clears all user focus assignments from group actors, and synchronizes
   * individual actor flags. This action cannot be undone.
   *
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The clicked element
   * @returns {Promise<void>}
   * @static
   */
  static async resetFocuses(event, target) {
    try {
      const content = await renderTemplate(TEMPLATES.COMPONENTS.FOCUS_RESET_DIALOG_CONTENT);
      const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'SPELLBOOK.FocusSettings.ResetDialog.Title', icon: 'fas fa-undo' },
        position: { width: 450, height: 'auto' },
        content,
        buttons: [
          { icon: 'fas fa-undo', label: game.i18n.localize('SPELLBOOK.FocusSettings.ResetConfirm'), action: 'reset', className: 'dialog-button danger' },
          { icon: 'fas fa-times', label: game.i18n.localize('SPELLBOOK.UI.Cancel'), action: 'cancel', className: 'dialog-button' }
        ],
        default: 'cancel',
        rejectClose: false
      });
      if (result !== 'reset') return;
      const defaultFocusData = { focuses: MODULE.DEFAULT_FOCUSES };
      await game.settings.set(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS, defaultFocusData);
      if (this.groupActor) await this.groupActor.unsetFlag(MODULE.ID, FLAGS.SELECTED_FOCUS);
      ui.notifications.info(game.i18n.localize('SPELLBOOK.FocusSettings.ResetSuccess'));
      this.render();
      Object.values(ui.windows).forEach((app) => {
        if (app.constructor.name === 'PartySpellsApp') app.render();
      });
    } catch (error) {
      log(1, 'Failed to reset focus settings:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.FocusSettings.ResetError'));
    }
  }

  /** @inheritdoc */
  static async formHandler(event, form, formData) {
    event.preventDefault();
    const action = formData.object?.action || formData.action;
    if (game.user.isGM && action === 'save-focuses') {
      await FocusSettingsDialog._saveFocusOptions(formData.object || formData, this.groupActor);
      if (this.parentApp) {
        this.parentApp._comparisonData = null;
        this.parentApp.render();
      }
    } else if (action === 'select-focus') {
      await FocusSettingsDialog._saveUserSelection(formData.object || formData, this.groupActor);
      if (this.parentApp) {
        this.parentApp._comparisonData = null;
        this.parentApp.render();
      }
    }
  }

  /**
   * Save focus option configurations to world settings (GM only).
   *
   * Processes form data to extract focus option definitions and saves
   * them to the world settings for use by all users. Also handles
   * member focus assignments and synchronizes dual-flag system.
   *
   * @param {Object} formData - The processed form data containing focus definitions
   * @param {Actor} groupActor - The group actor to update with assignments
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async _saveFocusOptions(formData, groupActor) {
    const focuses = [];
    let index = 0;
    while (formData[`focus-name-${index}`] !== undefined) {
      const name = formData[`focus-name-${index}`];
      const icon = formData[`focus-icon-${index}`] || 'icons/svg/mystery-man.svg';
      const description = formData[`focus-description-${index}`] || '';
      const id = formData[`focus-id-${index}`] || `focus-${index}`;
      if (name && name.trim()) focuses.push({ id: id, name: name.trim(), icon: icon, description: description.trim() });
      index++;
    }
    await game.settings.set(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS, { focuses: focuses });
    if (groupActor) {
      const currentSelections = groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
      const memberAssignments = {};
      for (const [key, value] of Object.entries(formData)) {
        if (key.startsWith('member-focus-')) {
          const userId = key.replace('member-focus-', '');
          memberAssignments[key] = { userId, value };
          if (value && typeof value === 'string' && value.trim() && value !== '' && value !== 'null' && value !== 'undefined') currentSelections[userId] = value;
          else delete currentSelections[userId];
        }
      }
      try {
        await groupActor.setFlag(MODULE.ID, FLAGS.SELECTED_FOCUS, currentSelections);
        const partyUsers = PartySpellManager.getPartyUsers(groupActor);
        for (const user of partyUsers) {
          const actor = game.actors.get(user.actorId);
          if (!actor) continue;
          const assignedFocusId = currentSelections[user.id];
          let focusName = null;
          if (assignedFocusId) {
            const focusObject = focuses.find((f) => f.id === assignedFocusId);
            focusName = focusObject?.name || null;
          }
          if (focusName) await actor.setFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS, focusName);
          else await actor.unsetFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS);
        }
        const verifySelections = groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS);
      } catch (error) {
        log(1, 'Error saving focus selections:', error);
      }
    } else log(2, 'No group actor available for member assignments');
    ui.notifications.info('SPELLBOOK.FocusSettings.OptionsSaved', { localize: true });
  }

  /**
   * Save user focus selection to the group actor.
   *
   * Updates the group actor's flags to store the user's selected focus option,
   * with proper ownership validation and delegation handling. Synchronizes
   * to individual actor flags for backward compatibility.
   *
   * @param {Object} formData - The form data containing selection information
   * @param {Actor} groupActor - The group actor to update
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async _saveUserSelection(formData, groupActor) {
    const selectedFocusId = formData.selectedFocus;
    const targetUserId = formData.targetUserId || game.user.id;
    if (!groupActor) {
      ui.notifications.error('SPELLBOOK.FocusSettings.NoGroupActor', { localize: true });
      return;
    }
    const currentSelections = groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
    if (selectedFocusId) currentSelections[targetUserId] = selectedFocusId;
    else delete currentSelections[targetUserId];
    await groupActor.setFlag(MODULE.ID, FLAGS.SELECTED_FOCUS, currentSelections);
    ui.notifications.info('SPELLBOOK.FocusSettings.SelectionSaved', { localize: true });
  }

  /**
   * Add selected icons to cards that have the selected class on render.
   *
   * Handles the initial state where a focus may already be selected
   * and needs the visual icon indicator.
   *
   * @private
   */
  _addSelectedIconsToPreselectedCards() {
    const selectedCards = this.element.querySelectorAll('.focus-card.selected');
    selectedCards.forEach((card) => {
      if (!card.querySelector('.selected-icon')) {
        const selectedIcon = document.createElement('i');
        selectedIcon.className = 'fa-solid fa-check selected-icon';
        card.appendChild(selectedIcon);
      }
    });
  }
}
