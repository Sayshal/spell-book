/**
 * Synergy Analysis Dialog Application
 *
 * A dedicated application for displaying party spell synergy analysis with
 * interactive visualizations including pie charts, damage distribution,
 * and strategic recommendations.
 *
 * @module Dialogs/SynergyAnalysis
 * @author Tyler
 */

import { TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Synergy Analysis Dialog for displaying party spell analysis.
 */
export class SynergyAnalysis extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'synergy-analysis-dialog',
    tag: 'div',
    classes: ['spell-book', 'synergy-analysis-dialog'],
    window: { icon: 'fas fa-chart-pie', resizable: true, minimizable: true, positioned: true, title: 'SPELLBOOK.Party.SynergyAnalysisTitle' },
    position: { width: 700, height: 800 }
  };

  /** @inheritdoc */
  static PARTS = { main: { template: TEMPLATES.PARTY_SPELL_MANAGER.SYNERGY_ANALYSIS } };

  /**
   * Create a new Synergy Analysis Dialog.
   * @param {SynergyAnalysis} synergyData - The synergy analysis data to display
   * @param {Object} [options={}] - Additional application options
   */
  constructor(synergyData, options = {}) {
    super(options);
    log(3, 'SynergyAnalysis constructed.', { synergyData, options });

    /** @type {SynergyAnalysis} The synergy analysis data */
    this.synergyData = synergyData;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    foundry.utils.mergeObject(context, this.synergyData);
    context.componentTooltips = this._prepareComponentTooltips(this.synergyData);
    log(3, 'Context prepared.', { options, context });
    return context;
  }

  /**
   * Prepare component tooltips with spell lists.
   * @param {SynergyAnalysis} synergy - The synergy analysis data
   * @returns {Object} Object containing tooltip strings for each component type (verbal, somatic, material, materialCost)
   * @private
   */
  _prepareComponentTooltips(synergy) {
    log(3, 'Preparing component tooltips.', { synergy });
    const maxSpells = 25;
    const tooltips = {
      verbal: this._formatSpellList(synergy.memberContributions?.components?.verbal, maxSpells),
      somatic: this._formatSpellList(synergy.memberContributions?.components?.somatic, maxSpells),
      material: this._formatSpellList(synergy.memberContributions?.components?.material, maxSpells),
      materialCost: this._formatSpellList(synergy.memberContributions?.components?.materialCost, maxSpells)
    };
    log(3, 'Component tooltips prepared.', { tooltips });
    return tooltips;
  }

  /**
   * Format spell list for tooltips.
   * @param {string[]} spells - Array of spell names
   * @param {number} maxSpells - Maximum number of spells to display before truncating
   * @returns {string} Formatted spell list string, truncated if necessary
   * @private
   */
  _formatSpellList(spells, maxSpells) {
    log(3, 'Formatting spell list.', { spellCount: spells?.length, maxSpells });
    if (!spells?.length) return '';
    const displaySpells = spells.slice(0, maxSpells);
    let tooltip = displaySpells.join(', ');
    if (spells.length > maxSpells) {
      const remaining = spells.length - maxSpells;
      tooltip += game.i18n.format('SPELLBOOK.Party.AndMoreSpells', { count: remaining });
    }
    log(3, 'Spell list formatted.', { tooltip });
    return tooltip;
  }
}
