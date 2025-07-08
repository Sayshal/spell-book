import { TEMPLATES } from '../constants.mjs';
import { formatSpellActivation, formatSpellComponents, formatSpellSchool } from '../helpers/spell-formatting.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SpellComparisonDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'spell-comparison-dialog',
    tag: 'div',
    window: {
      icon: 'fas fa-balance-scale',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: { width: 'auto', height: 'auto' },
    classes: ['spell-comparison-dialog']
  };

  static PARTS = {
    comparison: { template: TEMPLATES.DIALOGS.SPELL_COMPARISON }
  };

  constructor(parentApp, options = {}) {
    super(options);
    this.parentApp = parentApp;
  }

  get title() {
    return game.i18n.localize('SPELLBOOK.Comparison.DialogTitle');
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this._positionRelativeToParent();
  }

  /**
   * Position the dialog smartly relative to the parent PlayerSpellBook
   * @private
   */
  _positionRelativeToParent() {
    if (!this.parentApp?.element) return;

    // Get number of spells to calculate optimal width
    const spellCount = this.parentApp.comparisonSpells.size;
    const estimatedWidth = Math.min(800, 200 + spellCount * 150); // Base width + column width per spell

    const parentRect = this.parentApp.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left, top;

    // Try to position to the right of parent
    const rightSpace = viewportWidth - parentRect.right;
    if (rightSpace >= estimatedWidth + 20) {
      left = parentRect.right + 10;
    } else {
      // Try to position to the left of parent
      const leftSpace = parentRect.left;
      if (leftSpace >= estimatedWidth + 20) {
        left = parentRect.left - estimatedWidth - 10;
      } else {
        // Fallback: center in viewport
        left = Math.max(10, (viewportWidth - estimatedWidth) / 2);
      }
    }

    // Vertical positioning - try to align with top of parent
    top = parentRect.top;

    // Make sure it doesn't go off-screen
    const estimatedHeight = 400; // Rough estimate
    if (top + estimatedHeight > viewportHeight) {
      top = viewportHeight - estimatedHeight - 20;
    }
    if (top < 20) {
      top = 20;
    }

    this.setPosition({
      left,
      top,
      width: estimatedWidth,
      height: 'auto'
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const spellUuids = Array.from(this.parentApp.comparisonSpells);
    const spells = [];
    for (const uuid of spellUuids) {
      try {
        const spell = fromUuidSync(uuid);
        if (spell) spells.push(this._processSpellForComparison(spell));
      } catch (error) {
        log(1, `Error loading spell for comparison: ${uuid}`, error);
      }
    }
    context.spells = spells;
    context.comparisonData = this._buildComparisonTable(spells);
    return context;
  }

  _processSpellForComparison(spell) {
    return {
      uuid: spell.uuid,
      name: spell.name,
      img: spell.img,
      enrichedIcon: this._createEnrichedSpellIcon(spell),
      level: spell.system.level,
      school: formatSpellSchool(spell),
      castingTime: spell.labels?.activation || formatSpellActivation(spell),
      range: spell.labels?.range || spell.system.range?.value + ' ' + spell.system.range?.units,
      duration: spell.labels?.duration || spell.system.duration?.value,
      components: formatSpellComponents(spell),
      damage: this._extractDamageInfo(spell),
      description: spell.system.description?.value || ''
    };
  }

  /**
   * Create enriched spell icon link
   * @param {Object} spell - The spell document
   * @returns {string} HTML for enriched icon
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
