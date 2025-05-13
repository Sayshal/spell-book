/**
 * Dialog for confirming spell copying to wizard spellbook
 */
export class WizardSpellCopyDialog extends foundry.applications.api.DialogV2 {
  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(foundry.applications.api.DialogV2.DEFAULT_OPTIONS, {
    window: {
      title: 'Copy Spell',
      width: 400
    }
  });

  /** @override */
  constructor(spell, wizardManager) {
    const cost = wizardManager.getCopyingCost(spell);
    const time = wizardManager.getCopyingTime(spell);

    super({
      title: `Copy Spell: ${spell.name}`,
      content: `
        <form class="wizard-copy-form">
          <p>Do you want to copy <strong>${spell.name}</strong> to your spellbook?</p>
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
      `,
      buttons: {
        confirm: {
          icon: 'fas fa-book',
          label: 'Copy Spell',
          callback: () => (this._confirmed = true)
        },
        cancel: {
          icon: 'fas fa-times',
          label: 'Cancel'
        }
      },
      defaultButton: 'confirm'
    });

    this._spell = spell;
    this._wizardManager = wizardManager;
    this._confirmed = false;
  }

  /** @override */
  async getResult() {
    await this.wait();
    return {
      confirmed: this._confirmed,
      spell: this._spell
    };
  }
}
