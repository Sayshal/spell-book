/**
 * Spell Scroll Detection and Learning System
 *
 * Provides functionality for detecting spell scrolls in actor inventories,
 * extracting learnable spells, and handling the wizard spell learning process.
 * This module supports the complete workflow from scroll detection to spell
 * acquisition with proper cost calculation and validation.
 *
 * @module DataUtils/ScrollProcessor
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from '../ui/_module.mjs';
import * as DataUtils from './_module.mjs';

/**
 * Scanner for spell scrolls in actor inventory.
 */
export class ScrollProcessor {
  /**
   * Scan actor inventory for spell scrolls and extract learnable spells.
   * @todo Resolve parameters
   * @param {Actor5e} actor - The actor to scan for spell scrolls
   * @returns {Promise<Array<ScrollSpellData>>} Array of scroll spell data objects
   */
  static async scanForScrollSpells(actor) {
    const scrollSpells = [];
    if (!Object.keys(DataUtils.getWizardData(actor)).length) return scrollSpells;
    const scrollItems = actor.items.filter((item) => item.type === 'consumable' && item.system?.type?.value === 'scroll');
    for (const scroll of scrollItems) {
      const spellData = await this._extractSpellFromScroll(scroll, actor);
      if (spellData) scrollSpells.push(spellData);
    }
    log(3, `Checking ${actor.name} for spell scrolls.`, { scrollItems, scrollSpells });
    return scrollSpells;
  }

  /**
   * Extract spell data from a scroll item.
   * @todo Resolve parameters
   * @param {Item5e} scroll - The scroll item to extract spell data from
   * @param {Actor5e} actor - The actor who owns the scroll
   * @returns {Promise<ScrollSpellData|null>} Processed spell data or null if no valid spell found
   * @private
   */
  static async _extractSpellFromScroll(scroll, actor) {
    log(3, `Extracting ${scroll.name} from ${actor.name}'s inventory.`, { scroll, actor });
    const wizardData = DataUtils.getWizardData(actor);
    const entries = Object.entries(wizardData);
    if (!entries.length) return null;
    const wizardClass =
      entries.find(([_, d]) => d.isForceWizard)?.[1]?.classData || wizardData.wizard?.classData || entries.find(([_, d]) => d.isNaturalWizard)?.[1]?.classData || entries[0][1].classData;
    const maxSpellLevel = DataUtils.calculateMaxSpellLevel(wizardClass, actor);
    if (scroll.system?.activities) {
      const activitiesArray = Array.from(scroll.system.activities.values());
      for (const activity of activitiesArray) {
        if (activity?.spell?.uuid) {
          const spellUuid = activity.spell.uuid;
          const result = await this._processScrollSpell(scroll, spellUuid, maxSpellLevel);
          if (result) return result;
        }
        if (activity?.effects && Array.isArray(activity.effects)) {
          for (const effectRef of activity.effects) {
            if (effectRef._id && scroll.effects) {
              const matchingEffect = scroll.effects.find((effect) => effect._id === effectRef._id);
              if (matchingEffect?.origin) {
                const spellUuid = matchingEffect.origin;
                const result = await this._processScrollSpell(scroll, spellUuid, maxSpellLevel);
                if (result) return result;
              }
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Process a spell UUID from a scroll and create spell data.
   * @param {Item5e} scroll - The scroll item containing the spell
   * @param {string} spellUuid - The UUID of the spell to process
   * @param {number} maxSpellLevel - Maximum spell level the actor can cast
   * @returns {Promise<ScrollSpellData|null>} Processed spell data or null if invalid
   * @private
   */
  static async _processScrollSpell(scroll, spellUuid, maxSpellLevel) {
    log(3, 'Processing scroll spell.', { scroll, spellUuid, maxSpellLevel });
    const spell = await fromUuid(spellUuid);
    if (!spell || spell.type !== 'spell') return null;
    if (spell.system.level > maxSpellLevel && spell.system.level > 0) return null;
    const filterData = UIUtils.extractSpellFilterData(spell);
    let processedResult = {
      scrollItem: scroll,
      spell: spell,
      spellUuid: spellUuid,
      name: spell.name,
      level: spell.system.level,
      img: spell.img,
      system: spell.system,
      filterData: filterData,
      enrichedIcon: UIUtils.createSpellIconLink(spell),
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
  }

  /**
   * Learn a spell from a scroll and optionally consume it.
   * @param {Actor5e} actor - The actor learning the spell
   * @param {ScrollSpellData} scrollSpellData - The scroll spell data to learn from
   * @param {WizardBook} wizardManager - The wizard manager instance
   * @returns {Promise<boolean>} Whether the learning process was successful
   */
  static async learnSpellFromScroll(actor, scrollSpellData, wizardManager) {
    log(3, 'Learning spell from scroll.', { actor, scrollSpellData, wizardManager });
    const { spell, scrollItem, spellUuid } = scrollSpellData;
    const isAlreadyInSpellbook = await wizardManager.isSpellInSpellbook(spellUuid);
    const { cost, isFree } = await wizardManager.getCopyingCost(spell);
    const time = wizardManager.getCopyingTime(spell);
    if (!isFree && cost > 0) {
      const deductGold = game.settings.get(MODULE.ID, SETTINGS.DEDUCT_SPELL_LEARNING_COST);
      if (deductGold) {
        const canAfford = this._checkCanAffordSpell(actor, cost);
        if (!canAfford) {
          ui.notifications.warn(game.i18n.localize('SPELLBOOK.Wizard.InsufficientGold'));
          return false;
        }
      }
    }
    const shouldProceed = await this._showLearnFromScrollDialog(spell, cost, time, isFree, isAlreadyInSpellbook);
    if (!shouldProceed) return false;
    const success = await wizardManager.addSpellToSpellbook(spellUuid, MODULE.WIZARD_SPELL_SOURCE.SCROLL, { cost, timeSpent: time });
    log(3, 'Spell added to spellbook?', { success });
    if (success) {
      if (!isFree && cost > 0) {
        const deductGold = game.settings.get(MODULE.ID, SETTINGS.DEDUCT_SPELL_LEARNING_COST);
        if (deductGold) await this._deductSpellLearningCost(actor, cost);
      }
      const shouldConsume = game.settings.get(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING);
      if (shouldConsume) await actor.deleteEmbeddedDocuments('Item', [scrollItem.id]);
      wizardManager.invalidateCache();
      ui.notifications.info(game.i18n.format('SPELLBOOK.Wizard.SpellLearned', { name: spell.name }));
    }
    return success;
  }

  /**
   * Show dialog for learning spell from scroll.
   * @param {Item5e} spell - The spell to learn from the scroll
   * @param {number} cost - Gold cost to learn the spell
   * @param {string} time - Formatted time string required to learn the spell
   * @param {boolean} isFree - Whether the spell learning is free
   * @param {boolean} isAlreadyInSpellbook - Whether spell is already known
   * @returns {Promise<boolean>} Whether the user chose to proceed with learning
   * @private
   */
  static async _showLearnFromScrollDialog(spell, cost, time, isFree, isAlreadyInSpellbook) {
    const costText = isFree ? game.i18n.localize('SPELLBOOK.Wizard.SpellCopyFree') : game.i18n.format('SPELLBOOK.Wizard.SpellCopyCost', { cost });
    const shouldConsume = game.settings.get(MODULE.ID, SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING);
    const content = await foundry.applications.handlebars.renderTemplate(TEMPLATES.DIALOGS.LEARN_FROM_SCROLL, { spell, costText, time, isAlreadyInSpellbook, shouldConsume });
    try {
      const result = await foundry.applications.api.DialogV2.wait({
        window: { icon: 'fas fa-scroll', title: game.i18n.format('SPELLBOOK.Wizard.LearnSpellTitle', { name: spell.name }) },
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

  /**
   * Check if actor can afford the spell learning cost without actually deducting.
   * @param {Actor5e} actor - The actor to check
   * @param {number} cost - Cost in gold pieces
   * @returns {boolean} Whether the actor can afford the cost
   * @private
   */
  static _checkCanAffordSpell(actor, cost) {
    const updates = dnd5e.applications.CurrencyManager.getActorCurrencyUpdates(actor, cost, 'gp', { priority: 'low', exact: false });
    return !updates.remainder;
  }

  /**
   * Deduct spell learning cost from actor's currency using the DND5e system's currency manager.
   * @param {Actor5e} actor - The actor to deduct currency from
   * @param {number} cost - Cost in gold pieces
   * @returns {Promise<void>}
   * @private
   */
  static async _deductSpellLearningCost(actor, cost) {
    log(3, 'Deducting money for scroll learning.', { actor, cost });
    await dnd5e.applications.CurrencyManager.deductActorCurrency(actor, cost, 'gp', { priority: 'low', exact: false });
  }
}
