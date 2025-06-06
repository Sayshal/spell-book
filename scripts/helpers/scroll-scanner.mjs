import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as genericUtils from './generic-utils.mjs';
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
    log(3, `Found ${scrollItems.length} scroll items in ${actor.name}'s inventory`);
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
    if (!scroll.system?.activities) return null;
    for (const [activityId, activity] of Object.entries(scroll.system.activities)) {
      if (activity.type === 'cast' && activity.spell?.uuid) {
        const spellUuid = activity.spell.uuid;
        try {
          const spell = await fromUuid(spellUuid);
          if (!spell || spell.type !== 'spell') continue;
          const wizardClass = genericUtils.findSpellcastingClass(actor);
          if (!wizardClass) continue;
          const wizardLevel = wizardClass.system.levels || 1;
          const maxSpellLevel = Math.ceil(wizardLevel / 2); // We calculate this elsewhere - why aren't we importing and using that logic?
          if (spell.system.level > maxSpellLevel && spell.system.level > 0) continue;
          return {
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
            scrollName: scroll.name
          };
        } catch (error) {
          log(1, `Error processing spell from scroll ${scroll.name}:`, error);
          continue;
        }
      }
    }
    return null;
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
    let content = `<p>${game.i18n.format('SPELLBOOK.Scrolls.LearnFromScroll', { name: spell.name })}</p>`;
    if (isAlreadyInSpellbook) content += `<p class="notification warning">${game.i18n.localize('SPELLBOOK.Wizard.SpellAlreadyKnown')}</p>`;
    content += '<div class="copy-details">';
    if (isFree) {
      content += `<div class="form-group"><label>${game.i18n.localize('SPELLBOOK.Wizard.CostLabel')}:</label><span class="free-spell">${game.i18n.localize('SPELLBOOK.Wizard.FreeSpell')}</span></div>`;
    } else {
      content += `<div class="form-group"><label>${game.i18n.localize('SPELLBOOK.Wizard.CostLabel')}:</label><span>${cost} ${game.i18n.localize('SPELLBOOK.Currency.GoldPieces')}</span></div>`;
    }
    content += `<div class="form-group"><label>${game.i18n.localize('SPELLBOOK.Wizard.TimeLabel')}:</label><span>${time} ${game.i18n.localize('SPELLBOOK.Units.Hours')}</span></div>`;
    content += '</div>';
    const shouldConsume = game.settings.get(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING);
    if (shouldConsume) content += `<p class="notification info">${game.i18n.localize('SPELLBOOK.Scrolls.ScrollConsumed')}</p>`;
    try {
      const result = await foundry.applications.api.DialogV2.wait({
        window: {
          title: game.i18n.format('SPELLBOOK.Scrolls.LearnFromScroll', { name: spell.name }),
          icon: 'fas fa-scroll'
        },
        content: content,
        buttons: [
          {
            label: game.i18n.localize('SPELLBOOK.Wizard.LearnSpell'),
            icon: 'fas fa-check',
            action: 'learn'
          },
          {
            label: game.i18n.localize('SPELLBOOK.Confirm.Cancel'),
            icon: 'fas fa-times',
            action: 'cancel'
          }
        ],
        default: 'learn',
        rejectClose: false
      });
      return result === 'learn';
    } catch (error) {
      log(1, 'Error showing learn from scroll dialog:', error);
      return false;
    }
  }
}
