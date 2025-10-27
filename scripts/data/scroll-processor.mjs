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

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from '../ui/_module.mjs';
import * as DataUtils from './_module.mjs';

/**
 * Scanner for spell scrolls in actor inventory.
 */
export class ScrollProcessor {
  /**
   * Scan actor inventory for spell scrolls and extract learnable spells.
   * @param {Actor5e} actor - The actor to scan for spell scrolls
   * @returns {Promise<Array<ScrollSpellData>>} Array of scroll spell data objects
   */
  static async scanForScrollSpells(actor) {
    log(3, `Checking ${actor.name} for spell scrolls.`);
    /** @type {Array<ScrollSpellData>} */
    const scrollSpells = [];
    if (!DataUtils.isWizard(actor)) return scrollSpells;
    const scrollItems = actor.items.filter((item) => item.type === 'consumable' && item.system?.type?.value === 'scroll');
    for (const scroll of scrollItems) {
      const spellData = await this._extractSpellFromScroll(scroll, actor);
      if (spellData) scrollSpells.push(spellData);
    }
    return scrollSpells;
  }

  /**
   * Extract spell data from a scroll item.
   * @param {Item5e} scroll - The scroll item to extract spell data from
   * @param {Actor5e} actor - The actor who owns the scroll
   * @returns {Promise<ScrollSpellData|null>} Processed spell data or null if no valid spell found
   * @private
   */
  static async _extractSpellFromScroll(scroll, actor) {
    log(3, `Extracting ${scroll.name} from ${actor.name}'s inventory.`, { scroll, actor });
    const wizardClass = DataUtils.findWizardClass(actor);
    if (!wizardClass) return null;
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

    /** @type {ScrollSpellData} */
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
   * @todo isAlreadyInSpellbook isn't used here... But I think it should be?
   */
  static async learnSpellFromScroll(actor, scrollSpellData, wizardManager) {
    log(3, 'Learning spell from scroll.', { actor, scrollSpellData, wizardManager });
    const { spell, scrollItem, spellUuid } = scrollSpellData;
    const isAlreadyInSpellbook = await wizardManager.isSpellInSpellbook(spellUuid);
    const { cost, isFree } = await wizardManager.getCopyingCost(spell);
    const time = wizardManager.getCopyingTime(spell);
    const shouldProceed = await this._showLearnFromScrollDia;
    if (!shouldProceed) return false;
    const success = await wizardManager.addSpellToSpellbook(spellUuid, MODULE.WIZARD_SPELL_SOURCE.SCROLL, { cost, timeSpent: time });
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
   * Deduct spell learning cost from actor's currency.
   * @param {Actor5e} actor - The actor to deduct currency from
   * @param {number} cost - Cost in base currency
   * @returns {Promise<boolean>} Success state
   * @private
   */
  static async _deductSpellLearningCost(actor, cost) {
    log(3, 'Deducting money for scroll learning.', { actor, cost });
    const currencies = CONFIG.DND5E.currencies;
    const actorCurrency = actor.system.currency || {};
    let baseCurrency = null;
    const otherCurrencies = [];
    for (const [currencyType, config] of Object.entries(currencies)) {
      if (config.conversion === 1) baseCurrency = currencyType;
      else otherCurrencies.push({ type: currencyType, conversion: config.conversion });
    }
    otherCurrencies.sort((a, b) => a.conversion - b.conversion);
    const deductionOrder = baseCurrency ? [baseCurrency, ...otherCurrencies.map((c) => c.type)] : otherCurrencies.map((c) => c.type);
    let totalWealthInBase = 0;
    for (const [currencyType, config] of Object.entries(currencies)) {
      const amount = actorCurrency[currencyType] || 0;
      const baseValue = amount / config.conversion;
      totalWealthInBase += baseValue;
    }
    if (totalWealthInBase < cost) {
      ui.notifications.warn(game.i18n.format('SPELLBOOK.Wizard.InsufficientGold', { cost: cost, current: totalWealthInBase.toFixed(2) }));
      return false;
    }
    let remainingCost = cost;
    const deductions = {};
    for (const currencyType of deductionOrder) {
      if (remainingCost <= 0.001) break;
      if (!currencies[currencyType]) continue;
      const available = actorCurrency[currencyType] || 0;
      if (available <= 0) continue;
      const config = currencies[currencyType];
      const baseValuePerUnit = 1 / config.conversion;
      const neededUnits = Math.ceil(remainingCost / baseValuePerUnit);
      const toDeduct = Math.min(available, neededUnits);
      if (toDeduct > 0) {
        deductions[currencyType] = toDeduct;
        const baseValueDeducted = toDeduct * baseValuePerUnit;
        remainingCost -= baseValueDeducted;
      }
    }
    const updateData = {};
    for (const [currencyType, deductAmount] of Object.entries(deductions)) {
      const currentAmount = actorCurrency[currencyType] || 0;
      const newAmount = currentAmount - deductAmount;
      updateData[`system.currency.${currencyType}`] = newAmount;
    }
    await actor.update(updateData);
    return true;
  }
}
