import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { PartySpellManager } from '../managers/_module.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for managing spellcasting focus settings
 */
export class FocusSettingsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'focus-settings-dialog',
    tag: 'form',
    classes: ['spell-book', 'focus-settings-dialog'],
    window: {
      icon: 'fas fa-magic',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    form: {
      handler: FocusSettingsDialog.formHandler,
      closeOnSubmit: true
    },
    actions: {
      addFocus: FocusSettingsDialog.addFocus,
      deleteFocus: FocusSettingsDialog.deleteFocus,
      selectFocus: FocusSettingsDialog.selectFocus,
      selectIcon: FocusSettingsDialog.selectIcon
    },
    position: { width: 600, height: 'auto' }
  };

  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.FOCUS_SETTINGS }
  };

  /**
   * Create a new Focus Settings dialog
   * @param {Actor} groupActor The group actor
   * @param {Actor} targetActor The actor to set focus for (or null for GM managing)
   * @param {Object} options Additional options
   */
  constructor(groupActor, targetActor = null, options = {}) {
    super(options);
    this.groupActor = groupActor;
    this.targetActor = targetActor;
    this.isGMMode = game.user.isGM && !targetActor;
  }

  get title() {
    if (this.isGMMode) {
      return game.i18n.localize('SPELLBOOK.FocusSettings.ManageTitle');
    } else {
      const actorName = this.targetActor?.name || game.user.name;
      return game.i18n.format('SPELLBOOK.FocusSettings.SelectTitle', { actor: actorName });
    }
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get available focus options from world setting
    const focusData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    context.availableFocuses = focusData.focuses || [];

    // Get current selections for all users
    if (this.groupActor) {
      const userSelections = this.groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
      context.userSelections = userSelections;

      // Get party members for GM mode
      if (this.isGMMode) {
        const partyUsers = PartySpellManager.getPartyUsers(this.groupActor);
        log(1, 'DEBUG:', { partyUsers });
        context.partyMembers = partyUsers.map((userInfo) => ({
          id: userInfo.id,
          name: userInfo.name,
          actorName: userInfo.actorName,
          selectedFocus: userSelections[userInfo.id] || null
        }));
      } else {
        context.currentSelection = userSelections[game.user.id] || null;
      }
    }

    context.isGM = game.user.isGM;
    context.isGMMode = this.isGMMode;

    return context;
  }

  /**
   * Add a new focus option (GM only)
   * @param {Event} event The click event
   * @param {HTMLElement} target The clicked element
   */
  static async addFocus(event, target) {
    if (!game.user.isGM) return;

    const container = target.closest('form').querySelector('.focus-options-list');
    const index = container.children.length;

    const newFocusHtml = `
    <div class="focus-option-row" data-index="${index}">
      <input type="hidden" name="focus-id-${index}" value="focus-${index}" />

      <div class="focus-icon-picker" data-action="selectIcon" data-index="${index}"
           data-tooltip="${game.i18n.localize('SPELLBOOK.FocusSettings.ClickToChangeIcon')}">
        <img src="icons/svg/mystery-man.svg" alt="Focus Icon" class="focus-icon-preview" />
        <input type="hidden" name="focus-icon-${index}" value="icons/svg/mystery-man.svg" />
      </div>

      <input type="text" name="focus-name-${index}" placeholder="${game.i18n.localize('SPELLBOOK.FocusSettings.NamePlaceholder')}"
             data-tooltip="${game.i18n.localize('SPELLBOOK.FocusSettings.NameTooltip')}" />

      <input type="text" name="focus-description-${index}" placeholder="${game.i18n.localize('SPELLBOOK.FocusSettings.DescriptionPlaceholder')}"
             data-tooltip="${game.i18n.localize('SPELLBOOK.FocusSettings.DescriptionTooltip')}" />

      <button type="button" data-action="deleteFocus" data-index="${index}"
              data-tooltip="${game.i18n.localize('SPELLBOOK.FocusSettings.DeleteFocus')}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;

    container.insertAdjacentHTML('beforeend', newFocusHtml);
  }

  /**
   * Delete a focus option (GM only)
   * @param {Event} event The click event
   * @param {HTMLElement} target The clicked element
   */
  static async deleteFocus(event, target) {
    if (!game.user.isGM) return;

    const row = target.closest('.focus-option-row');
    if (row) {
      row.remove();
    }
  }

  /**
   * Handle focus selection for a user
   * @param {Event} event The click event
   * @param {HTMLElement} target The clicked element
   */
  static async selectFocus(event, target) {
    const focusId = target.dataset.focusId;
    const userId = target.dataset.userId || game.user.id;

    // Check permissions
    if (!game.user.isGM && userId !== game.user.id) {
      ui.notifications.error('SPELLBOOK.FocusSettings.NoPermission', { localize: true });
      return;
    }

    await this._saveUserSelection({
      selectedFocus: focusId,
      targetUserId: userId,
      action: 'select-focus'
    });

    this.render();
  }

  /**
   * Handle icon selection via file picker
   * @param {Event} event The click event
   * @param {HTMLElement} target The clicked element
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
          // Update the preview image
          const img = target.querySelector('img');
          if (img) {
            img.src = path;
          }

          // Update the hidden input
          const hiddenInput = target.querySelector('input[type="hidden"]');
          if (hiddenInput) {
            hiddenInput.value = path;
          }
        }
      });

      picker.render(true);
    } catch (error) {
      log(1, 'Error opening file picker:', error);
      ui.notifications.error('Failed to open file picker');
    }
  }

  /**
   * Handle form submission
   * @param {Event} event The form submission event
   * @param {HTMLFormElement} form The submitted form
   * @param {Object} formData The form data
   */
  static async formHandler(event, form, formData) {
    event.preventDefault();

    const action = formData.object?.action || formData.action;
    log(1, 'DEBUG', { event, form, formData, action });
    // Handle saving focus option configurations (GM only)
    if (game.user.isGM && action === 'save-focuses') {
      await FocusSettingsDialog._saveFocusOptions(formData.object || formData);
    }
    // Handle user focus selection
    else if (action === 'select-focus') {
      await FocusSettingsDialog._saveUserSelection(formData.object || formData, this.groupActor);
    }
  }

  /**
   * Save focus options configuration (GM only)
   * @param {Object} formData The form data
   * @private
   */
  static async _saveFocusOptions(formData) {
    const focuses = [];
    let index = 0;

    // Extract focus data from form
    while (formData[`focus-name-${index}`] !== undefined) {
      const name = formData[`focus-name-${index}`];
      const icon = formData[`focus-icon-${index}`] || 'icons/svg/mystery-man.svg';
      const description = formData[`focus-description-${index}`] || '';
      const id = formData[`focus-id-${index}`] || `focus-${index}`;

      if (name && name.trim()) {
        focuses.push({
          id: id,
          name: name.trim(),
          icon: icon,
          description: description.trim()
        });
      }
      index++;
    }

    await game.settings.set(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS, {
      focuses: focuses
    });

    ui.notifications.info('SPELLBOOK.FocusSettings.OptionsSaved', { localize: true });
  }

  /**
   * Save user focus selection
   * @param {Object} formData The form data
   * @param {Actor} groupActor The group actor
   * @private
   */
  static async _saveUserSelection(formData, groupActor) {
    const selectedFocusId = formData.selectedFocus;
    const targetUserId = formData.targetUserId || game.user.id;

    if (!groupActor) {
      ui.notifications.error('SPELLBOOK.FocusSettings.NoGroupActor', { localize: true });
      return;
    }

    // Get current selections
    const currentSelections = groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};

    // Update for target user
    if (selectedFocusId) {
      currentSelections[targetUserId] = selectedFocusId;
    } else {
      delete currentSelections[targetUserId];
    }

    // Save back to group actor
    await groupActor.setFlag(MODULE.ID, FLAGS.SELECTED_FOCUS, currentSelections);

    ui.notifications.info('SPELLBOOK.FocusSettings.SelectionSaved', { localize: true });
  }
}
