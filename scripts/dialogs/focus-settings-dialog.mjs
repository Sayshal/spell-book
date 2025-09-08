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
 *
 * @module Dialogs/FocusSettingsDialog
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { PartySpellManager } from '../managers/_module.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef {Object} FocusOption
 * @property {string} id - Unique identifier for the focus option
 * @property {string} name - Display name of the focus option
 * @property {string} icon - Path to the focus option icon
 * @property {string} description - Descriptive text for the focus option
 */

/**
 * @typedef {Object} FocusSelections
 * @property {Object<string, string>} [userId] - Maps user IDs to selected focus option IDs
 */

/**
 * @typedef {Object} PartyMember
 * @property {string} id - User ID
 * @property {string} name - User display name
 * @property {string} actorName - Associated actor name
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
    const focusData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);

    // Ensure we always have valid focus data, fallback to defaults
    let availableFocuses = focusData.focuses || [];
    if (!availableFocuses || !Array.isArray(availableFocuses) || availableFocuses.length === 0) {
      log(1, 'No valid focuses found, using defaults');
      availableFocuses = MODULE.DEFAULT_FOCUSES;
    }

    context.availableFocuses = availableFocuses;

    log(1, '=== FOCUS DIALOG CONTEXT DEBUG ===');
    log(1, 'Available focuses:', context.availableFocuses);
    log(1, 'Group Actor:', this.groupActor);
    log(1, 'Is GM Mode:', this.isGMMode);

    if (this.groupActor) {
      const userSelections = this.groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
      context.userSelections = userSelections;
      log(1, 'Current user selections from flags:', userSelections);

      if (this.isGMMode) {
        const partyUsers = PartySpellManager.getPartyUsers(this.groupActor);
        log(1, 'Party users:', partyUsers);
        context.partyMembers = partyUsers.map((userInfo) => {
          const selectedFocus = userSelections[userInfo.id] || null;
          return {
            id: userInfo.id,
            name: userInfo.name,
            actorName: userInfo.actorName,
            selectedFocus: selectedFocus
          };
        });
        log(1, 'Party members with selections:', context.partyMembers);

        // Debug each member's selection
        context.partyMembers.forEach((member) => {
          log(1, `Member ${member.name} (${member.id}): selectedFocus = ${member.selectedFocus}`);
        });
      } else {
        context.currentSelection = userSelections[game.user.id] || null;
        log(1, 'Current user selection:', context.currentSelection);
      }
    }

    context.isGM = game.user.isGM;
    context.isGMMode = this.isGMMode;

    log(1, 'Final context:', context);
    log(1, '=== END FOCUS DIALOG CONTEXT DEBUG ===');

    return context;
  }

  /**
   * Action handler to add a new focus option (GM only).
   *
   * Creates a new focus option row in the management interface with
   * default values and appropriate form controls.
   *
   * @param {Event} event - The triggering click event
   * @param {HTMLElement} target - The clicked element
   * @returns {Promise<void>}
   * @todo Move to template and localize alt text
   * @static
   */
  static async addFocus(event, target) {
    if (!game.user.isGM) return;
    const container = target.closest('form').querySelector('.focus-options-list');
    const index = container.children.length;
    const newFocusHtml = `
    <div class="focus-option-row" data-index="${index}">
      <input type="hidden" name="focus-id-${index}" value="focus-${index}" />
      <div class="focus-icon-picker" data-action="selectIcon" data-index="${index}" data-tooltip="${game.i18n.localize('SPELLBOOK.FocusSettings.ClickToChangeIcon')}">
        <img src="icons/svg/mystery-man.svg" alt="Focus Icon" class="focus-icon-preview" />
        <input type="hidden" name="focus-icon-${index}" value="icons/svg/mystery-man.svg" />
      </div>
      <input type="text" name="focus-name-${index}" placeholder="${game.i18n.localize('SPELLBOOK.FocusSettings.NamePlaceholder')}"
        data-tooltip="${game.i18n.localize('SPELLBOOK.FocusSettings.NameTooltip')}" />
      <input type="text" name="focus-description-${index}" placeholder="${game.i18n.localize('SPELLBOOK.FocusSettings.DescriptionPlaceholder')}"
        data-tooltip="${game.i18n.localize('SPELLBOOK.FocusSettings.DescriptionTooltip')}" />
      <button type="button" data-action="deleteFocus" data-index="${index}" data-tooltip="${game.i18n.localize('SPELLBOOK.FocusSettings.DeleteFocus')}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
    container.insertAdjacentHTML('beforeend', newFocusHtml);
  }

  /**
   * Action handler to delete a focus option (GM only).
   *
   * Removes a focus option row from the management interface.
   * Note: This only removes from the UI; actual deletion occurs on form submission.
   *
   * @param {Event} event - The triggering click event
   * @param {HTMLElement} target - The clicked element
   * @returns {Promise<void>}
   * @static
   */
  static async deleteFocus(event, target) {
    if (!game.user.isGM) return;
    const row = target.closest('.focus-option-row');
    if (row) row.remove();
  }

  /**
   * Action handler for focus selection by users.
   *
   * Handles user selection of a focus option, with permission checking
   * to ensure users can only select for themselves unless they're a GM.
   *
   * @param {Event} event - The triggering click event
   * @param {HTMLElement} target - The clicked element
   * @returns {Promise<void>}
   * @static
   */
  static async selectFocus(event, target) {
    const focusId = target.dataset.focusId;
    const userId = target.dataset.userId || game.user.id;
    if (!game.user.isGM && userId !== game.user.id) {
      ui.notifications.error('SPELLBOOK.FocusSettings.NoPermission', { localize: true });
      return;
    }
    await this._saveUserSelection({ selectedFocus: focusId, targetUserId: userId, action: 'select-focus' });
    this.render();
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

  static async resetFocuses(event, target) {
    try {
      const result = await foundry.applications.api.DialogV2.wait({
        window: {
          title: game.i18n.localize('SPELLBOOK.FocusSettings.ResetDialog.Title'),
          icon: 'fas fa-undo',
          resizable: false,
          minimizable: false,
          positioned: true
        },
        position: { width: 450, height: 'auto' },
        content: `
        <p>${game.i18n.localize('SPELLBOOK.FocusSettings.ResetDialog.Content')}</p>
        <p><strong>${game.i18n.localize('SPELLBOOK.FocusSettings.ResetDialog.Warning')}</strong></p>
      `,
        buttons: [
          {
            icon: 'fas fa-undo',
            label: game.i18n.localize('SPELLBOOK.FocusSettings.ResetConfirm'),
            action: 'reset',
            className: 'dialog-button danger'
          },
          {
            icon: 'fas fa-times',
            label: game.i18n.localize('SPELLBOOK.UI.Cancel'),
            action: 'cancel',
            className: 'dialog-button'
          }
        ],
        default: 'cancel',
        rejectClose: false
      });

      if (result !== 'reset') return;

      // Reset focuses to defaults
      const defaultFocusData = { focuses: DEFAULT_FOCUSES };
      await game.settings.set(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS, defaultFocusData);

      // Clear all member focus assignments
      if (this.groupActor) {
        await this.groupActor.unsetFlag(MODULE.ID, FLAGS.SELECTED_FOCUS);
      }

      ui.notifications.info(game.i18n.localize('SPELLBOOK.FocusSettings.ResetSuccess'));

      // Re-render
      this.render();
      Object.values(ui.windows).forEach((app) => {
        if (app.constructor.name === 'PartySpellsApp') {
          app.render();
        }
      });
    } catch (error) {
      console.error('Failed to reset focus settings:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.FocusSettings.ResetError'));
    }
  }

  /** @inheritdoc */
  static async formHandler(event, form, formData) {
    event.preventDefault();
    const action = formData.object?.action || formData.action;

    log(1, '=== FOCUS SETTINGS DEBUG ===');
    log(1, 'Action:', action);
    log(1, 'Form Data Object:', formData.object);
    log(1, 'Form Data:', formData);
    log(1, 'Group Actor:', this.groupActor);
    log(1, 'Has Group Actor:', !!this.groupActor);
    log(1, 'Group Actor ID:', this.groupActor?.id);
    log(1, '================================');

    if (game.user.isGM && action === 'save-focuses') {
      // Pass this.groupActor as second parameter
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
   * them to the world settings for use by all users.
   *
   * @param {Object} formData - The processed form data containing focus definitions
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async _saveFocusOptions(formData, groupActor) {
    log(1, '=== SAVE FOCUS OPTIONS DEBUG ===');
    log(1, 'Received formData:', formData);
    log(1, 'Received groupActor:', groupActor);

    // Save focus options (existing code)
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

    log(1, 'Processed focuses:', focuses);
    await game.settings.set(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS, { focuses: focuses });
    log(1, 'Focus options saved to settings');

    // Process member focus assignments
    log(1, 'Group Actor for member assignments:', groupActor);

    if (groupActor) {
      const currentSelections = groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
      log(1, 'Current focus selections before update:', currentSelections);

      // Process all member-focus-* fields
      const memberAssignments = {};
      for (const [key, value] of Object.entries(formData)) {
        if (key.startsWith('member-focus-')) {
          const userId = key.replace('member-focus-', '');
          memberAssignments[key] = { userId, value };
          log(1, `Found member assignment: ${key} = "${value}" (type: ${typeof value}) (userId: ${userId})`);

          // Handle different cases for value - check type first
          if (value && typeof value === 'string' && value.trim() && value !== '' && value !== 'null' && value !== 'undefined') {
            log(1, `  Setting focus for ${userId}: ${value}`);
            currentSelections[userId] = value;
          } else {
            log(1, `  Removing focus for ${userId} (value was: "${value}", type: ${typeof value})`);
            delete currentSelections[userId];
          }
        }
      }

      log(1, 'Member assignments found:', memberAssignments);
      log(1, 'Updated focus selections:', currentSelections);

      try {
        await groupActor.setFlag(MODULE.ID, FLAGS.SELECTED_FOCUS, currentSelections);
        log(1, 'Successfully saved focus selections to group actor');

        // Verify the save
        const verifySelections = groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS);
        log(1, 'Verification - selections after save:', verifySelections);
      } catch (error) {
        log(1, 'Error saving focus selections:', error);
      }
    } else {
      log(1, 'No group actor available for member assignments');
    }

    ui.notifications.info('SPELLBOOK.FocusSettings.OptionsSaved', { localize: true });
    log(1, '=== END SAVE FOCUS OPTIONS DEBUG ===');
  }

  /**
   * Save user focus selection to the group actor.
   *
   * Updates the group actor's flags to store the user's selected focus option,
   * with proper ownership validation and delegation handling.
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
}
