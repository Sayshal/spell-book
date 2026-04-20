import { TEMPLATES } from '../constants.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Display dialog for party spell synergy analysis. */
export class SynergyAnalysis extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-synergy-analysis',
    tag: 'div',
    classes: ['spell-book', 'synergy-analysis-dialog'],
    position: { width: 700, height: 800 },
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

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    foundry.utils.mergeObject(context, this.synergyData);
    context.componentTooltips = this.#buildComponentTooltips(this.synergyData);
    for (const item of (context.spellSchoolDistribution || [])) item.tooltipHtml = SynergyAnalysis.#groupMembersTooltip(item.localizedSchool, item.members);
    for (const item of (context.damageDistribution || [])) item.tooltipHtml = SynergyAnalysis.#groupMembersTooltip(item.localizedType, item.members);
    for (const item of (context.duplicateSpells || [])) item.tooltipHtml = SynergyAnalysis.#groupMembersTooltip(item.name, item.actors);
    return context;
  }

  /**
   * Group "Name: Spell" entries by name and build an HTML tooltip.
   * @param {string} title - Tooltip heading
   * @param {string[]} entries - Flat list like ["Akra: Light", "Akra: Sacred Flame", "Zanna: Fire Bolt"]
   * @returns {string} HTML with one line per member
   */
  static #groupMembersTooltip(title, entries) {
    if (!entries?.length) return title;
    const grouped = new Map();
    for (const entry of entries) {
      const sep = entry.indexOf(':');
      const name = sep > -1 ? entry.slice(0, sep).trim() : entry;
      const spell = sep > -1 ? entry.slice(sep + 1).trim() : null;
      if (!grouped.has(name)) grouped.set(name, []);
      if (spell) grouped.get(name).push(spell);
    }
    const lines = [...grouped.entries()].map(([name, spells]) => spells.length ? `<div><strong>${name}:</strong> ${spells.join(', ')}</div>` : `<div>${name}</div>`).join('');
    return `<strong>${title}</strong><hr>${lines}`;
  }

  /**
   * Build truncated component spell-list tooltips for hover details.
   * @param {object} synergy - The synergy analysis data
   * @returns {object} Tooltip strings keyed by component type
   */
  #buildComponentTooltips(synergy) {
    const max = 25;
    const components = synergy.memberContributions?.components || {};
    return {
      verbal: this.#formatSpellList(components.verbal, max),
      somatic: this.#formatSpellList(components.somatic, max),
      material: this.#formatSpellList(components.material, max),
      materialCost: this.#formatSpellList(components.materialCost, max)
    };
  }

  /**
   * Format a list of spell names into a truncated tooltip string.
   * @param {string[]} spells - Spell names
   * @param {number} max - Maximum spells to include before truncating
   * @returns {string} Formatted comma-separated list
   */
  #formatSpellList(spells, max) {
    if (!spells?.length) return '';
    let tooltip = spells.slice(0, max).join(', ');
    if (spells.length > max) tooltip += _loc('SPELLBOOK.Party.AndMoreSpells', { count: spells.length - max });
    return tooltip;
  }
}
