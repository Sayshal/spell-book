import { log } from '../logger.mjs';

/**
 * Dialog for confirming spell copying to wizard spellbook
 */
export class WizardSpellCopyDialog {
  /**
   * Create a dialog for copying a spell to a wizard's spellbook
   * @param {Item5e} spell - The spell to copy
   * @param {WizardSpellbookManager} wizardManager - The wizard spellbook manager
   * @param {Object} costInfo - Cost information including if it's free
   * @param {number} time - Time required to copy
   */
  constructor(spell, wizardManager, costInfo, time) {
    this.spell = spell;
    this.wizardManager = wizardManager;
    this.costInfo = costInfo;
    this.time = time;
  }

  /**
   * Show the dialog and get the result
   * @returns {Promise<Object>} Dialog result
   */
  async getResult() {
    try {
      const content = `
        <form class="wizard-copy-form">
          <p>Do you want to learn <strong>${this.spell.name}</strong> and add it to your spellbook?</p>
          <div class="copy-details">
            <div class="form-group">
              <label>Cost:</label>
              <span>${this.costInfo.isFree ? 'Free' : `${this.costInfo.cost} gp`}</span>
            </div>
            <div class="form-group">
              <label>Time Required:</label>
              <span>${this.time} hours</span>
            </div>
          </div>
        </form>
      `;

      const result = await foundry.applications.api.DialogV2.wait({
        title: `Learn Spell: ${this.spell.name}`,
        content: content,
        buttons: [
          {
            icon: 'fas fa-book',
            label: 'Learn Spell',
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
      log(1, `Error showing spell learn dialog: ${error.message}`);
      return {
        confirmed: false,
        spell: this.spell
      };
    }
  }
}
