import { TEMPLATES } from '../constants.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Display dialog for party spell synergy analysis. */
export class SynergyAnalysis extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-synergy-analysis',
    tag: 'div',
    classes: ['spell-book', 'synergy-analysis-dialog'],
    position: { width: 700, height: 'auto' },
    window: { icon: 'fas fa-chart-pie', resizable: true, title: 'SPELLBOOK.Party.SynergyAnalysisTitle' }
  };

  /** @override */
  static PARTS = { main: { template: TEMPLATES.APPS.PARTY.SYNERGY_ANALYSIS } };

  /**
   * @param {object} synergyData - Pre-computed synergy analysis from PartyMode
   * @param {object} [options] - Application options
   */
  constructor(synergyData, options = {}) {
    super(options);
    this.synergyData = synergyData;
  }

  /** @type {number} Members listed before the tooltip truncates. */
  static #MAX_MEMBERS = 8;

  /** @type {number} Spells listed per member before that line truncates. */
  static #MAX_SPELLS = 6;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    foundry.utils.mergeObject(context, this.synergyData);
    const tip = SynergyAnalysis.#groupMembersTooltip;
    for (const item of context.spellSchoolDistribution || []) item.tooltipHtml = tip(item.localizedSchool, item.members);
    for (const item of context.damageDistribution || []) item.tooltipHtml = tip(item.localizedType, item.members);
    for (const item of context.savingThrowDistribution || []) item.tooltipHtml = tip(item.localizedSave, item.members);
    for (const item of context.spellLevelDistribution || []) item.tooltipHtml = tip(item.localizedLevel, item.members);
    for (const item of context.duplicateSpells || []) item.tooltipHtml = tip(item.name, item.actors);
    const components = this.synergyData.memberContributions?.components || {};
    context.componentTooltips = {
      verbal: tip(_loc('DND5E.ComponentVerbal'), components.verbal),
      somatic: tip(_loc('DND5E.ComponentSomatic'), components.somatic),
      material: tip(_loc('DND5E.ComponentMaterial'), components.material),
      materialCost: tip(_loc('SPELLBOOK.Party.Analysis.MaterialCostly'), components.materialCost)
    };
    return context;
  }

  /**
   * Group "Name: Spell" entries by member and build a truncated HTML tooltip.
   * @param {string} title - Tooltip heading
   * @param {string[]} entries - Flat list like ["Akra: Light", "Akra: Sacred Flame", "Zanna: Fire Bolt"]
   * @returns {string} HTML with one line per member
   */
  static #groupMembersTooltip(title, entries) {
    const esc = Handlebars.escapeExpression;
    if (!entries?.length) return `<strong>${esc(title)}</strong>`;
    const grouped = new Map();
    for (const entry of entries) {
      const sep = entry.indexOf(':');
      const name = sep > -1 ? entry.slice(0, sep).trim() : entry;
      const spell = sep > -1 ? entry.slice(sep + 1).trim() : null;
      if (!grouped.has(name)) grouped.set(name, []);
      if (spell) grouped.get(name).push(spell);
    }
    const sorted = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
    const lines = sorted.slice(0, SynergyAnalysis.#MAX_MEMBERS).map(([name, spells]) => {
      if (!spells.length) return `<div>${esc(name)}</div>`;
      spells.sort((a, b) => a.localeCompare(b));
      const shown = spells.slice(0, SynergyAnalysis.#MAX_SPELLS).map(esc).join(', ');
      const rest = spells.length > SynergyAnalysis.#MAX_SPELLS ? esc(_loc('SPELLBOOK.Party.AndMoreSpells', { count: spells.length - SynergyAnalysis.#MAX_SPELLS })) : '';
      return `<div><strong>${esc(name)}</strong> (${spells.length}): ${shown}${rest}</div>`;
    });
    if (grouped.size > SynergyAnalysis.#MAX_MEMBERS) lines.push(`<div>${esc(_loc('SPELLBOOK.Party.AndMoreMembers', { count: grouped.size - SynergyAnalysis.#MAX_MEMBERS }))}</div>`);
    return `<strong>${esc(title)}</strong><hr>${lines.join('')}`;
  }
}
