import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as genericUtils from './generic-utils.mjs';
import * as discoveryUtils from './spell-discovery.mjs';
import * as formattingUtils from './spell-formatting.mjs';

/**
 * Scanner for spell scrolls in actor inventory
 */
export class ScrollScanner {
  /**
   * Scan actor inventory for spell scrolls and extract learnable spells
   * @param {Actor5e} actor - The actor to scan
   * @returns {Promise<Array>} Array of scroll spell data
   */
  static async scanForScrollSpells(actor) {
    const scrollSpells = [];
    if (!genericUtils.isWizard(actor)) return scrollSpells;
    const scrollItems = actor.items.filter((item) => item.type === 'consumable' && item.system?.type?.value === 'scroll');
    for (const scroll of scrollItems) {
      const spellData = await this._extractSpellFromScroll(scroll, actor);
      if (spellData) scrollSpells.push(spellData);
    }
    return scrollSpells;
  }

  /**
   * Extract spell data from a scroll item
   * @param {Item5e} scroll - The scroll item
   * @param {Actor5e} actor - The actor who owns the scroll
   * @returns {Promise<Object|null>} Spell data or null if no valid spell found
   * @private
   */
  static async _extractSpellFromScroll(scroll, actor) {
    const wizardClass = genericUtils.findWizardClass(actor);
    if (!wizardClass) return null;
    const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(wizardClass, actor);
    if (scroll.system?.activities?.contents) {
      for (const [index, activity] of scroll.system.activities.contents.entries()) {
        if (activity.type === 'cast' && activity.spell?.uuid) {
          const spellUuid = activity.spell.uuid;
          const result = await this._processScrollSpell(scroll, spellUuid, maxSpellLevel);
          if (result) return result;
        }
      }
    } else {
      // Backwards compatibility: check description for UUID (v3.3.1 and earlier)
      const description = scroll.system?.description?.value;
      if (description) {
        const uuidMatch = description.match(/@UUID\[([^\]]+)\]/);
        if (uuidMatch) {
          const spellUuid = uuidMatch[1];
          const result = await this._processScrollSpell(scroll, spellUuid, maxSpellLevel);
          if (result) return result;
        }
      }
    }
    return null;
  }

  /**
   * Process a spell UUID from a scroll and create spell data
   * @param {Item5e} scroll - The scroll item
   * @param {string} spellUuid - The spell UUID
   * @param {number} maxSpellLevel - Maximum spell level the actor can cast
   * @returns {Promise<Object|null>} Processed spell data or null
   * @private
   */
  static async _processScrollSpell(scroll, spellUuid, maxSpellLevel) {
    try {
      const spell = await fromUuid(spellUuid);
      if (!spell || spell.type !== 'spell') {
        return null;
      }
      if (spell.system.level > maxSpellLevel && spell.system.level > 0) return null;
      let processedResult = {
        scrollItem: scroll,
        spell: spell,
        spellUuid: spellUuid,
        name: spell.name,
        level: spell.system.level,
        img: spell.img,
        system: spell.system,
        enrichedIcon: formattingUtils.createSpellIconLink(spell),
        formattedDetails: formattingUtils.formatSpellDetails(spell),
        isFromScroll: true,
        scrollId: scroll.id,
        scrollName: scroll.name,
        preparation: {
          prepared: false,
          disabled: true,
          preparationMode: 'scroll',
          isOwned: false,
          alwaysPrepared: false,
          sourceItem: null,
          isGranted: false,
          localizedPreparationMode: '',
          disabledReason: 'SPELLBOOK.Scrolls.NotPreparable'
        }
      };
      return processedResult;
    } catch (error) {
      log(1, `Error processing spell from scroll ${scroll.name}:`, error);
      return null;
    }
  }

  /**
   * Learn a spell from a scroll and optionally consume it
   * @param {Actor5e} actor - The actor learning the spell
   * @param {Object} scrollSpellData - The scroll spell data
   * @param {WizardSpellbookManager} wizardManager - The wizard manager
   * @returns {Promise<boolean>} Success status
   */
  static async learnSpellFromScroll(actor, scrollSpellData, wizardManager) {
    const { spell, scrollItem, spellUuid } = scrollSpellData;
    const isAlreadyInSpellbook = await wizardManager.isSpellInSpellbook(spellUuid);
    const { cost, isFree } = await wizardManager.getCopyingCostWithFree(spell);
    const time = wizardManager.getCopyingTime(spell);
    const shouldProceed = await this._showLearnFromScrollDialog(spell, cost, time, isFree, isAlreadyInSpellbook);
    if (!shouldProceed) return false;
    const success = await wizardManager.copySpell(spellUuid, cost, time, isFree);
    if (success) {
      const shouldConsume = game.settings.get(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING);
      if (shouldConsume) {
        await actor.deleteEmbeddedDocuments('Item', [scrollItem.id]);
        ui.notifications.info(
          game.i18n.format('SPELLBOOK.Scrolls.ScrollConsumed', {
            scroll: scrollItem.name,
            spell: spell.name
          })
        );
      }
      ui.notifications.info(game.i18n.format('SPELLBOOK.Wizard.SpellLearned', { name: spell.name }));
    }
    return success;
  }

  /**
   * Show dialog for learning spell from scroll
   * @param {Item5e} spell - The spell to learn
   * @param {number} cost - Cost to learn
   * @param {number} time - Time to learn
   * @param {boolean} isFree - Whether the spell is free
   * @param {boolean} isAlreadyInSpellbook - Whether spell is already known
   * @returns {Promise<boolean>} Whether to proceed
   * @private
   */
  static async _showLearnFromScrollDialog(spell, cost, time, isFree, isAlreadyInSpellbook) {
    const costText = isFree ? game.i18n.localize('SPELLBOOK.Wizard.SpellCopyFree') : game.i18n.format('SPELLBOOK.Wizard.SpellCopyCost', { cost: cost });
    const shouldConsume = game.settings.get(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING);
    let content = `
    <form class="wizard-copy-form">
      <p>${game.i18n.format('SPELLBOOK.Wizard.LearnSpellPrompt', { name: spell.name })}</p>`;
    if (isAlreadyInSpellbook) content += `<p class="notification warning">${game.i18n.localize('SPELLBOOK.Wizard.SpellAlreadyKnown')}</p>`;
    content += `
      <div class="copy-details">
        <div class="form-group">
          <label>${game.i18n.localize('SPELLBOOK.Wizard.CostLabel')}:</label>
          <span>${costText}</span>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('SPELLBOOK.Wizard.TimeLabel')}:</label>
          <span>${game.i18n.format('SPELLBOOK.Wizard.SpellCopyTime', { hours: time })}</span>
        </div>
      </div>`;
    if (shouldConsume) content += `<p class="notification info">${game.i18n.localize('SPELLBOOK.Scrolls.ScrollWillBeConsumed')}</p>`;
    content += `</form>`;
    try {
      const result = await foundry.applications.api.DialogV2.wait({
        title: game.i18n.format('SPELLBOOK.Wizard.LearnSpellTitle', { name: spell.name }),
        content: content,
        buttons: [
          { icon: 'fas fa-book', label: game.i18n.localize('SPELLBOOK.Wizard.LearnSpellButton'), action: 'confirm', className: 'dialog-button' },
          { icon: 'fas fa-times', label: game.i18n.localize('SPELLBOOK.UI.Cancel'), action: 'cancel', className: 'dialog-button' }
        ],
        default: 'confirm',
        rejectClose: false
      });
      return result === 'confirm';
    } catch (error) {
      log(1, 'Error showing learn from scroll dialog:', error);
      return false;
    }
  }
}
