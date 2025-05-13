import { log } from '../logger.mjs';

/**
 * Dialog for confirming spell copying to wizard spellbook
 */
export class WizardSpellCopyDialog {
  /**
   * Create a dialog for copying a spell to a wizard's spellbook
   * @param {Item5e} spell - The spell to copy
   * @param {WizardSpellbookManager} wizardManager - The wizard spellbook manager
   */
  constructor(spell, wizardManager) {
    this.spell = spell;
    this.wizardManager = wizardManager;
  }

  /**
   * Show the dialog and get the result
   * @returns {Promise<Object>} Dialog result
   */
  async getResult() {
    try {
      const cost = this.wizardManager.getCopyingCost(this.spell);
      const time = this.wizardManager.getCopyingTime(this.spell);

      const content = `
        <form class="wizard-copy-form">
          <p>Do you want to copy <strong>${this.spell.name}</strong> to your spellbook?</p>
          <div class="copy-details">
            <div class="form-group">
              <label>Cost:</label>
              <span>${cost} gp</span>
            </div>
            <div class="form-group">
              <label>Time Required:</label>
              <span>${time} hours</span>
            </div>
          </div>
        </form>
      `;

      const result = await foundry.applications.api.DialogV2.wait({
        title: `Copy Spell: ${this.spell.name}`,
        content: content,
        buttons: [
          {
            icon: 'fas fa-book',
            label: 'Copy Spell',
            action: 'confirm',
            className: 'dialog-button'
          },
          {
            icon: 'fas fa-times',
            label: 'Cancel',
            action: 'cancel',
            className: 'dialog-button'
          }
        ],
        default: 'confirm'
      });

      return {
        confirmed: result === 'confirm',
        spell: this.spell
      };
    } catch (error) {
      log(1, `Error showing spell copy dialog: ${error.message}`);
      return {
        confirmed: false,
        spell: this.spell
      };
    }
  }
}
