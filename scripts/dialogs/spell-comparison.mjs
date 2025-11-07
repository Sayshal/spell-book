/**
 * Spell Comparison Dialog
 *
 * Side-by-side spell analysis and comparison interface for detailed spell
 * evaluation. Provides spell data comparison including statistics,
 * effects, and tactical analysis for informed spellcasting decisions.
 *
 * @module Dialogs/SpellComparison
 * @author Tyler
 */

import { TEMPLATES } from '../constants/_module.mjs';
import * as UIUtils from '../ui/_module.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog application for comparing multiple spells side-by-side.
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class SpellComparison extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'spell-comparison-dialog',
    tag: 'div',
    window: { icon: 'fas fa-clipboard-question', resizable: false, minimizable: true, positioned: true },
    position: { width: 600, height: 'auto' },
    classes: ['spell-book', 'spell-comparison-dialog']
  };

  /** @inheritdoc */
  static PARTS = { comparison: { template: TEMPLATES.DIALOGS.SPELL_COMPARISON } };

  /**
   * Create a new spell comparison dialog instance.
   * @param {Object} parentApp - Parent Spell Book application instance
   * @param {Object} [options={}] - Additional application options
   */
  constructor(parentApp, options = {}) {
    super(options);
    this.parentApp = parentApp;
    log(3, 'SpellComparison constructed.', { parentApp, options });
  }

  /** @inheritdoc */
  get title() {
    return game.i18n.localize('SPELLBOOK.Comparison.DialogTitle');
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const spellUuids = Array.from(this.parentApp.comparisonSpells);
    const spells = [];
    for (const uuid of spellUuids) {
      const spell = await fromUuid(uuid);
      if (spell) spells.push(this._processSpellForComparison(spell));
    }
    context.spells = spells;
    context.comparisonData = this._buildComparisonTable(spells);
    log(3, 'Spell Comparison Context.', { options, context });
    return context;
  }

  /** @inheritdoc */
  _onFirstRender(context, options) {
    log(3, 'First render.', { context, options });
    super._onFirstRender(context, options);
    this._calculateOptimalSize();
    this._positionRelativeToParent();
  }

  /**
   * Calculate and set optimal dialog size based on content and spell count.
   * @private
   */
  _calculateOptimalSize() {
    if (!this.parentApp?.comparisonSpells) return;
    const spellCount = this.parentApp.comparisonSpells.size;
    const minSpellColumnWidth = 150;
    const propertyColumnWidth = 120;
    const dialogPadding = 40;
    const calculatedWidth = propertyColumnWidth + spellCount * minSpellColumnWidth + dialogPadding;
    const minWidth = 400;
    const maxWidth = Math.min(window.innerWidth * 0.9, 1200);
    const optimalWidth = Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
    this.options.position.width = optimalWidth;
    if (this.element) this.element.style.width = `${optimalWidth}px`;
    log(3, 'Calculated optimal size.', { spellCount, optimalWidth });
  }

  /**
   * Position the dialog intelligently relative to the parent SpellBook application.
   * @private
   */
  _positionRelativeToParent() {
    if (!this.parentApp?.element) return;
    const position = UIUtils.calculateOptimalPosition({
      triggerElement: this.parentApp.element,
      dialogWidth: this.options.position.width,
      dialogHeight: 400,
      minMargin: 20,
      minTop: 50,
      maxBottomOffset: 100,
      offset: 10,
      preferredSide: 'right'
    });
    this.setPosition(position);
    log(3, 'Positioned relative to parent.', { position });
  }

  /**
   * Process a spell document into standardized format for comparison display.
   * @param {Object} spell - The spell document to process
   * @returns {Object} Processed spell data for comparison display
   * @private
   */
  _processSpellForComparison(spell) {
    const processed = {
      uuid: spell.uuid,
      name: spell.name,
      img: spell.img,
      enrichedIcon: UIUtils.createSpellIconLink(spell),
      level: spell.system.level,
      school: UIUtils.formatSpellSchool(spell),
      castingTime: spell.labels?.activation || UIUtils.formatSpellActivation(spell),
      range: spell.labels?.range || `${spell.system.range?.value} ${spell.system.range?.units}`,
      duration: spell.labels?.duration || spell.system.duration?.value,
      components: UIUtils.formatSpellComponents(spell),
      damage: this._extractDamageInfo(spell),
      description: spell.system.description?.value || ''
    };
    log(3, 'Processed spell for comparison.', { spell: spell.name, processed });
    return processed;
  }

  /**
   * Extract damage information from a spell for comparison purposes.
   * @param {Object} spell - The spell document to analyze
   * @returns {Object} Damage information object
   * @private
   */
  _extractDamageInfo(spell) {
    const damageInfo = { formula: '', types: [], maxDice: 0 };
    if (spell.labels?.damages?.length) {
      const damages = spell.labels.damages;
      damageInfo.formula = damages
        .map((d) => d.formula || '')
        .filter(Boolean)
        .join(' + ');
      damageInfo.types = damages.map((d) => d.damageType).filter(Boolean);
    }
    if (!damageInfo.formula && spell.system?.activities) {
      for (const activity of Object.values(spell.system.activities)) {
        if (activity.damage?.parts?.length) {
          const formulas = activity.damage.parts.map((part) => part[0]).filter(Boolean);
          damageInfo.formula = formulas.join(' + ');
          damageInfo.types = activity.damage.parts.map((part) => part[1]).filter(Boolean);
          break;
        }
      }
    }
    if (damageInfo.formula) {
      const diceMatches = damageInfo.formula.match(/(\d+)d(\d+)/g);
      if (diceMatches) {
        for (const match of diceMatches) {
          const [, count, size] = match.match(/(\d+)d(\d+)/);
          const maxPossible = parseInt(count) * parseInt(size);
          damageInfo.maxDice = Math.max(damageInfo.maxDice, maxPossible);
        }
      }
    }
    log(3, 'Extracted damage info.', { spell: spell.name, damageInfo });
    return damageInfo;
  }

  /**
   * Build comparison table data structure from processed spells.
   * @param {Array<{
   *   level: number,
   *   school: string,
   *   castingTime: string,
   *   range: string,
   *   duration: string,
   *   components: string,
   *   damage: { formula: string, maxDice: number }
   * }>} spells - Array of processed spell objects
   * @returns {{
   *   properties: Array<{
   *     name: string,
   *     key: string,
   *     values: Array<{ value: string | number, highlight: boolean }>
   *   }>,
   *   maxDamage: number
   * }} Complete comparison table data structure
   * @private
   */
  _buildComparisonTable(spells) {
    log(3, 'Building comparison table.', { spellCount: spells.length });
    if (!spells.length) return { properties: [] };
    const maxDamage = Math.max(...spells.map((s) => s.damage.maxDice).filter((d) => d > 0));
    const properties = [
      {
        name: game.i18n.localize('SPELLBOOK.Comparison.Level'),
        key: 'level',
        values: spells.map((spell) => ({
          value: CONFIG.DND5E.spellLevels[spell.level] || spell.level,
          highlight: false
        }))
      },
      {
        name: game.i18n.localize('SPELLBOOK.Comparison.School'),
        key: 'school',
        values: spells.map((spell) => ({
          value: spell.school,
          highlight: false
        }))
      },
      {
        name: game.i18n.localize('SPELLBOOK.Comparison.CastingTime'),
        key: 'castingTime',
        values: spells.map((spell) => ({
          value: spell.castingTime,
          highlight: false
        }))
      },
      {
        name: game.i18n.localize('SPELLBOOK.Comparison.Range'),
        key: 'range',
        values: spells.map((spell) => ({
          value: spell.range,
          highlight: false
        }))
      },
      {
        name: game.i18n.localize('SPELLBOOK.Comparison.Duration'),
        key: 'duration',
        values: spells.map((spell) => ({
          value: spell.duration,
          highlight: false
        }))
      },
      {
        name: game.i18n.localize('SPELLBOOK.Comparison.Components'),
        key: 'components',
        values: spells.map((spell) => ({
          value: spell.components,
          highlight: false
        }))
      },
      {
        name: game.i18n.localize('SPELLBOOK.Comparison.Damage'),
        key: 'damage',
        values: spells.map((spell) => ({
          value: spell.damage.formula || '—',
          highlight: spell.damage.maxDice > 0 && spell.damage.maxDice === maxDamage
        }))
      }
    ];
    log(3, 'Built comparison table.', { propertyCount: properties.length, maxDamage });
    return { properties, maxDamage };
  }

  /** @override */
  _onClose(options = {}) {
    super._onClose(options);
    if (this.parentApp) {
      this.parentApp.comparisonSpells.clear();
      this.parentApp.comparisonDialog = null;
      this.parentApp.render(false);
    }
    log(3, 'Spell comparison closed.');
  }
}
