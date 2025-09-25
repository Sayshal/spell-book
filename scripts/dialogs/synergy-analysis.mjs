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

import { MODULE, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Synergy Analysis Dialog for displaying party spell analysis.
 *
 * This application provides spell synergy analysis including
 * interactive pie charts, damage type distribution, component analysis,
 * and strategic recommendations for party optimization.
 */
export class SynergyAnalysisDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'synergy-analysis-dialog',
    tag: 'div',
    classes: ['spell-book', 'synergy-analysis-dialog'],
    window: {
      icon: 'fas fa-chart-pie',
      resizable: true,
      minimizable: true,
      positioned: true,
      title: 'SPELLBOOK.Party.SynergyAnalysisTitle'
    },
    position: { width: 700, height: 800 }
  };

  /** @inheritdoc */
  static PARTS = { main: { template: TEMPLATES.PARTY_SPELL_MANAGER.SYNERGY_ANALYSIS } };

  /**
   * Create a new Synergy Analysis Dialog.
   *
   * @param {Object} synergyData - The synergy analysis data to display
   * @param {Object} [options={}] - Additional application options
   */
  constructor(synergyData, options = {}) {
    super(options);

    /** @type {Object} The synergy analysis data */
    this.synergyData = synergyData;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    Object.assign(context, this.synergyData);
    context.componentTooltips = this._prepareComponentTooltips(this.synergyData);
    return context;
  }

  /**
   * Prepare component tooltips with spell lists.
   */
  _prepareComponentTooltips(synergy) {
    const maxSpells = 25;
    return {
      verbal: this._formatSpellList(synergy.memberContributions?.components?.verbal, maxSpells),
      somatic: this._formatSpellList(synergy.memberContributions?.components?.somatic, maxSpells),
      material: this._formatSpellList(synergy.memberContributions?.components?.material, maxSpells),
      materialCost: this._formatSpellList(synergy.memberContributions?.components?.materialCost, maxSpells)
    };
  }

  /**
   * Format spell list for tooltips.
   */
  _formatSpellList(spells, maxSpells) {
    if (!spells || spells.length === 0) return '';
    const displaySpells = spells.slice(0, maxSpells);
    let tooltip = displaySpells.join(', ');
    if (spells.length > maxSpells) tooltip += `... and ${spells.length - maxSpells} more`;
    return tooltip;
  }
}
