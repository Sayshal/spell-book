/**
 * Spell Comparison Dialog
 *
 * Side-by-side spell analysis and comparison interface for detailed spell
 * evaluation. Provides comprehensive spell data comparison including statistics,
 * effects, and tactical analysis for informed spellcasting decisions.
 *
 * Key features:
 * - Side-by-side spell comparison interface
 * - Detailed statistics and effect analysis
 * - Visual difference highlighting
 * - Tactical comparison metrics
 * - Export and sharing capabilities
 * - Integration with spell selection workflows
 *
 * @module Dialogs/SpellComparisonDialog
 * @author Tyler
 */

import { TEMPLATES } from '../constants/_module.mjs';
import * as UIHelpers from '../ui/_module.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef {Object} ProcessedSpell
 * @property {string} uuid - The spell's UUID
 * @property {string} name - Spell name
 * @property {string} img - Spell icon path
 * @property {string} enrichedIcon - HTML for enriched spell icon link
 * @property {number} level - Spell level (0 for cantrips)
 * @property {string} school - Formatted spell school
 * @property {string} castingTime - Formatted casting time/activation
 * @property {string} range - Formatted spell range
 * @property {string} duration - Formatted spell duration
 * @property {string} components - Formatted spell components
 * @property {DamageInfo} damage - Extracted damage information
 * @property {string} description - Spell description HTML
 */

/**
 * @typedef {Object} DamageInfo
 * @property {string} formula - Damage formula string (e.g., "1d8 + 2d6")
 * @property {string[]} types - Array of damage type identifiers
 * @property {number} maxDice - Maximum possible dice damage value
 */

/**
 * @typedef {Object} ComparisonProperty
 * @property {string} name - Localized property name for display
 * @property {string} key - Property key identifier
 * @property {PropertyValue[]} values - Array of values for each compared spell
 */

/**
 * @typedef {Object} PropertyValue
 * @property {string} value - Formatted value to display
 * @property {boolean} highlight - Whether this value should be visually highlighted
 */

/**
 * @typedef {Object} ComparisonTableData
 * @property {ComparisonProperty[]} properties - Array of property comparisons
 * @property {number} maxDamage - Maximum damage value across all spells for highlighting
 */

/**
 * Dialog application for comparing multiple spells side-by-side.
 *
 * Allows users to view and analyze spell differences and similarities in a
 * tabular format, with intelligent positioning and responsive sizing based
 * on the number of spells being compared.
 *
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class SpellComparisonDialog extends HandlebarsApplicationMixin(ApplicationV2) {
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
   *
   * @param {Object} parentApp - Parent Spell Book application instance
   * @param {Object} [options={}] - Additional application options
   */
  constructor(parentApp, options = {}) {
    super(options);

    /** @type {Object} Reference to the parent Spell Book application */
    this.parentApp = parentApp;
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
      const spell = fromUuidSync(uuid);
      if (spell) spells.push(this._processSpellForComparison(spell));
    }
    context.spells = spells;
    context.comparisonData = this._buildComparisonTable(spells);
    return context;
  }

  /** @inheritdoc */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this._calculateOptimalSize();
    this._positionRelativeToParent();
  }

  /**
   * Calculate and set optimal dialog size based on content and spell count.
   *
   * Dynamically sizes the dialog to accommodate the comparison table based on
   * the number of spells being compared, with reasonable minimum and maximum bounds.
   *
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
  }

  /**
   * Position the dialog intelligently relative to the parent SpellBook application.
   *
   * Attempts to position the dialog near the parent application without overlapping,
   * falling back to centered positioning if insufficient space is available.
   *
   * @private
   */
  _positionRelativeToParent() {
    if (!this.parentApp?.element) return;
    const dialogWidth = this.options.position.width;
    const parentRect = this.parentApp.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left, top;
    const rightSpace = viewportWidth - parentRect.right;
    if (rightSpace >= dialogWidth + 20) left = parentRect.right + 10;
    else {
      const leftSpace = parentRect.left;
      if (leftSpace >= dialogWidth + 20) left = leftSpace - dialogWidth - 10;
      else left = (viewportWidth - dialogWidth) / 2;
    }
    top = Math.max(50, parentRect.top + (parentRect.height - 400) / 2);
    if (left < 20) left = 20;
    if (left + dialogWidth > viewportWidth - 20) left = viewportWidth - dialogWidth - 20;
    if (top < 50) top = 50;
    if (top > viewportHeight - 100) top = viewportHeight - 100;
    this.setPosition({ left, top });
  }

  /**
   * Process a spell document into standardized format for comparison display.
   *
   * Extracts and formats all relevant spell properties for tabular comparison,
   * including damage analysis and enriched content links.
   *
   * @param {Object} spell - The spell document to process
   * @returns {ProcessedSpell} Processed spell data for comparison display
   * @private
   */
  _processSpellForComparison(spell) {
    return {
      uuid: spell.uuid,
      name: spell.name,
      img: spell.img,
      enrichedIcon: this._createEnrichedSpellIcon(spell),
      level: spell.system.level,
      school: UIHelpers.formatSpellSchool(spell),
      castingTime: spell.labels?.activation || UIHelpers.formatSpellActivation(spell),
      range: spell.labels?.range || `${spell.system.range?.value} ${spell.system.range?.units}`,
      duration: spell.labels?.duration || spell.system.duration?.value,
      components: UIHelpers.formatSpellComponents(spell),
      damage: this._extractDamageInfo(spell),
      description: spell.system.description?.value || ''
    };
  }

  /**
   * Create an enriched content link for a spell icon.
   *
   * Generates a properly formatted content link that integrates with Foundry's
   * enriched content system for tooltips and drag-drop functionality.
   *
   * @param {Object} spell - The spell document
   * @returns {string} HTML string for the enriched icon link
   * @private
   */
  _createEnrichedSpellIcon(spell) {
    const uuid = spell.uuid;
    const parsed = foundry.utils.parseUuid(uuid);
    const itemId = parsed.id || '';
    const entityType = parsed.type || 'Item';
    let packId = '';
    if (parsed.collection) packId = parsed.collection.collection || '';
    return `<a class="content-link" draggable="true" data-link="" data-uuid="${uuid}" data-id="${itemId}" data-type="${entityType}" data-pack="${packId}" data-tooltip="${spell.name}">
      <img src="${spell.img}" class="spell-icon" alt="${spell.name} icon">
    </a>`;
  }

  /**
   * Extract comprehensive damage information from a spell for comparison purposes.
   *
   * Analyzes both legacy and modern spell damage systems to extract damage formulas,
   * types, and maximum potential damage values for highlighting purposes.
   *
   * @param {Object} spell - The spell document to analyze
   * @returns {DamageInfo} Comprehensive damage information object
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
    return damageInfo;
  }

  /**
   * Build comparison table data structure from processed spells.
   *
   * Creates a structured comparison table with property rows and spell columns,
   * including highlighting logic for significant values like maximum damage.
   *
   * @param {ProcessedSpell[]} spells - Array of processed spell objects
   * @returns {ComparisonTableData} Complete comparison table data structure
   * @private
   */
  _buildComparisonTable(spells) {
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
  }
}
