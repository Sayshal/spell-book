/**
 * Spell Scroll Detection and Learning System
 *
 * Provides functionality for detecting spell scrolls in actor inventories,
 * extracting learnable spells, and handling the wizard spell learning process.
 * This module supports the complete workflow from scroll detection to spell
 * acquisition with proper cost calculation and validation.
 *
 * Key features:
 * - Spell scroll inventory scanning
 * - Learnable spell extraction and validation
 * - Wizard spell learning workflow
 * - Cost calculation for spell copying
 * - Scroll consumption management
 * - Level-based learning restrictions
 *
 * @module DataHelpers/ScrollProcessor
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as UIHelpers from '../ui/_module.mjs';
import * as DataHelpers from './_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * @typedef {Object} ScrollSpellData
 * @property {Item5e} scrollItem - The original scroll item from actor inventory
 * @property {Item5e} spell - The extracted spell document
 * @property {string} spellUuid - UUID of the spell for identification
 * @property {string} name - Display name of the spell
 * @property {number} level - Spell level (0-9)
 * @property {string} img - Image path for the spell icon
 * @property {Object} system - System-specific spell data
 * @property {Object} filterData - Extracted filter data for UI display
 * @property {string} enrichedIcon - HTML string for spell icon link
 * @property {boolean} isFromScroll - Flag indicating this spell comes from a scroll
 * @property {string} scrollId - ID of the source scroll item
 * @property {string} scrollName - Display name of the source scroll
 * @property {SpellPreparationData} preparation - Preparation state information
 */

/**
 * @typedef {Object} SpellPreparationData
 * @property {boolean} prepared - Whether the spell is currently prepared
 * @property {boolean} disabled - Whether preparation controls are disabled
 * @property {string} preparationMode - Mode of preparation ('scroll' for scroll spells)
 * @property {boolean} isOwned - Whether the spell is owned by the actor
 * @property {boolean} alwaysPrepared - Whether the spell is always prepared
 * @property {Item5e|null} sourceItem - Source item providing the spell
 * @property {boolean} isGranted - Whether the spell is granted by features
 * @property {string} localizedPreparationMode - Localized preparation mode string
 * @property {string} disabledReason - Localization key for why preparation is disabled
 */

/**
 * @typedef {Object} ScrollActivityData
 * @property {string} [uuid] - UUID of the spell referenced by the activity
 * @property {Array<EffectReference>} [effects] - Array of effect references
 * @property {Object} spell - Spell reference data
 */

/**
 * @typedef {Object} EffectReference
 * @property {string} _id - ID of the effect within the scroll item
 * @property {string} [origin] - Origin UUID of the effect (may be spell UUID)
 */

/**
 * @typedef {Object} SpellLearningCost
 * @property {number} cost - Gold cost to learn the spell
 * @property {boolean} isFree - Whether learning is free due to wizard features
 */

/**
 * @typedef {Object} DialogButtonConfig
 * @property {string} icon - Font Awesome icon class
 * @property {string} label - Localized button label
 * @property {string} action - Action identifier for the button
 * @property {string} className - CSS class for styling
 */

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
    /** @type {Array<ScrollSpellData>} */
    const scrollSpells = [];
    if (!DataHelpers.isWizard(actor)) return scrollSpells;
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
    const wizardClass = DataHelpers.findWizardClass(actor);
    if (!wizardClass) return null;
    const maxSpellLevel = DataHelpers.calculateMaxSpellLevel(wizardClass, actor);
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
    try {
      const spell = await fromUuid(spellUuid);
      if (!spell || spell.type !== 'spell') return null;
      if (spell.system.level > maxSpellLevel && spell.system.level > 0) return null;
      const filterData = UIHelpers.extractSpellFilterData(spell);

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
        enrichedIcon: UIHelpers.createSpellIconLink(spell),
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
   * Learn a spell from a scroll and optionally consume it.
   * @param {Actor5e} actor - The actor learning the spell
   * @param {ScrollSpellData} scrollSpellData - The scroll spell data to learn from
   * @param {WizardBook} wizardManager - The wizard manager instance
   * @returns {Promise<boolean>} Whether the learning process was successful
   */
  static async learnSpellFromScroll(actor, scrollSpellData, wizardManager) {
    const { spell, scrollItem, spellUuid } = scrollSpellData;
    const isAlreadyInSpellbook = await wizardManager.isSpellInSpellbook(spellUuid);
    const { cost, isFree } = await wizardManager.getCopyingCost(spell);
    const time = wizardManager.getCopyingTime(spell);
    const shouldProceed = await this._showLearnFromScrollDialog(spell, cost, time, isFree, isAlreadyInSpellbook);
    if (!shouldProceed) return false;
    const success = await wizardManager.addSpellToSpellbook(spellUuid, MODULE.WIZARD_SPELL_SOURCE.SCROLL, { cost, timeSpent: time });
    if (success) {
      if (!isFree && cost > 0) {
        const shouldDeductCurrency = game.settings.get(MODULE.ID, SETTINGS.DEDUCT_SPELL_LEARNING_COST);
        if (shouldDeductCurrency) await this._deductSpellLearningCost(actor, cost);
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
    const content = await renderTemplate(TEMPLATES.DIALOGS.LEARN_FROM_SCROLL, { spell, costText, time, isAlreadyInSpellbook, shouldConsume });
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
   * Deduct spell learning cost from actor's currency.
   * @param {Actor5e} actor - The actor to deduct currency from
   * @param {number} cost - Cost in base currency
   * @returns {Promise<boolean>} Success state
   * @private
   */
  static async _deductSpellLearningCost(actor, cost) {
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
    try {
      const updateData = {};
      for (const [currencyType, deductAmount] of Object.entries(deductions)) {
        const currentAmount = actorCurrency[currencyType] || 0;
        const newAmount = currentAmount - deductAmount;
        updateData[`system.currency.${currencyType}`] = newAmount;
      }
      await actor.update(updateData);
      return true;
    } catch (error) {
      log(1, `Failed to deduct currency from ${actor.name}:`, error);
      return false;
    }
  }
}
