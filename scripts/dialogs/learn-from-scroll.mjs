import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { log } from '../utils/logger.mjs';

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/**
 * Show the learn-from-scroll confirmation dialog and return the user's choice.
 * @param {object} options - Dialog data
 * @param {object} options.spell - The spell to learn
 * @param {number} options.cost - Gold cost to copy the spell
 * @param {string} options.time - Formatted time to copy the spell
 * @param {boolean} options.isFree - Whether learning is free for this actor
 * @param {boolean} options.isAlreadyInSpellbook - Whether the spell is already known
 * @returns {Promise<boolean>} Whether the user confirmed the learning action
 */
export async function showLearnFromScrollDialog({ spell, cost, time, isFree, isAlreadyInSpellbook }) {
  const costText = isFree ? _loc('SPELLBOOK.Wizard.SpellCopyFree') : _loc('SPELLBOOK.Wizard.SpellCopyCost', { cost });
  const shouldConsume = game.settings.get(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING);
  const content = await renderTemplate(TEMPLATES.DIALOGS.LEARN_FROM_SCROLL, { spell, costText, time, isAlreadyInSpellbook, shouldConsume });
  try {
    const result = await DialogV2.wait({
      window: { icon: 'fas fa-scroll', title: _loc('SPELLBOOK.Wizard.LearnSpellTitle', { name: spell.name }) },
      content,
      buttons: [
        { icon: 'fas fa-book', label: _loc('SPELLBOOK.Wizard.LearnSpellButton'), action: 'confirm', className: 'dialog-button' },
        { icon: 'fas fa-times', label: _loc('COMMON.Cancel'), action: 'cancel', className: 'dialog-button' }
      ],
      default: 'confirm',
      rejectClose: false
    });
    return result === 'confirm';
  } catch (error) {
    log(1, 'Error showing learn-from-scroll dialog.', { error });
    return false;
  }
}
