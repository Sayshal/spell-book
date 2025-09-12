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
 * This application provides comprehensive spell synergy analysis including
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
    context.pieChartData = this._preparePieChartData(this.synergyData);
    context.levelPieChartData = this._prepareLevelPieChartData(this.synergyData);
    return context;
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    if (context.pieChartData && context.pieChartData.conicGradient) {
      const schoolPieChart = this.element.querySelector('.school-pie-chart');
      if (schoolPieChart) schoolPieChart.style.background = context.pieChartData.conicGradient;
    }
    if (context.levelPieChartData && context.levelPieChartData.conicGradient) {
      const levelPieChart = this.element.querySelector('.level-pie-chart');
      if (levelPieChart) levelPieChart.style.background = context.levelPieChartData.conicGradient;
    }
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

  /**
   * Prepare pie chart CSS data.
   */
  _preparePieChartData(synergy) {
    if (!synergy.spellSchoolDistribution || synergy.spellSchoolDistribution.length === 0) return null;
    let cumulative = 0;
    const segments = synergy.spellSchoolDistribution.map((school, index) => {
      const start = cumulative;
      cumulative += school.percentage;
      return { index, start, end: cumulative, school: school.localizedSchool, percentage: school.percentage, count: school.count };
    });
    const conicGradient = this._generateConicGradient(segments);
    return { segments, conicGradient };
  }

  /**
   * Prepare pie chart CSS data for spell level distribution.
   *
   * Generates the necessary data structure and CSS conic-gradient string
   * for displaying the spell level distribution as a pie chart visualization.
   *
   * @param {Object} synergy - The synergy analysis data
   * @returns {Object|null} Level pie chart data with segments and CSS gradient, or null if no data
   * @private
   */
  _prepareLevelPieChartData(synergy) {
    if (!synergy.spellLevelDistribution || synergy.spellLevelDistribution.length === 0) return null;

    let cumulative = 0;
    const segments = synergy.spellLevelDistribution.map((level, index) => {
      const start = cumulative;
      cumulative += level.percentage;
      return {
        index,
        start,
        end: cumulative,
        level: level.localizedLevel,
        percentage: level.percentage,
        count: level.count
      };
    });

    const conicGradient = this._generateConicGradient(segments, 'level');
    return { segments, conicGradient };
  }

  /**
   * Generate conic-gradient CSS string.
   */
  _generateConicGradient(segments, type) {
    const schoolColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#a55eea', '#fd79a8'];
    const levelColors = ['#808080', '#ff6b6b', '#ff9ff3', '#feca57', '#96ceb4', '#45b7d1', '#a55eea', '#4ecdc4', '#fd79a8', '#ffd700'];
    const colors = type === 'level' ? levelColors : schoolColors;
    if (segments.length === 0) return '';
    if (segments.length === 1) return `conic-gradient(${colors[0]} 0deg 360deg)`;
    const gradientStops = segments
      .map((segment, index) => {
        const color = colors[index % colors.length];
        const startDeg = (segment.start * 3.6).toFixed(1);
        const endDeg = (segment.end * 3.6).toFixed(1);
        return `${color} ${startDeg}deg ${endDeg}deg`;
      })
      .join(', ');
    return `conic-gradient(${gradientStops})`;
  }

  /**
   * Prepare level tooltips.
   */
  _prepareLevelTooltips(synergy) {
    if (!synergy.spellLevelDistribution) return [];
    return synergy.spellLevelDistribution.map((level) => {
      const levelName = level.localizedLevel;
      return `${levelName}: ${level.count} prepared (${level.percentage}% of total)`;
    });
  }
}
