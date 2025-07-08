import { TEMPLATES } from '../constants.mjs';
import * as spellFormatting from '../helpers/spell-formatting.mjs';
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
    position: { width: 800, height: 600 },
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
      level: spell.system.level,
      school: spellFormatting.formatSpellSchool(spell),
      castingTime: spell.labels?.activation || spellFormatting.formatSpellActivation(spell),
      range: spell.labels?.range || spell.system.range?.value + ' ' + spell.system.range?.units,
      duration: spell.labels?.duration || spell.system.duration?.value,
      components: spellFormatting.formatSpellComponents(spell),
      damage: this._extractDamageInfo(spell),
      description: spell.system.description?.value || ''
    };
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
