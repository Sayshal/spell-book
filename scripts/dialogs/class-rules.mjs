import { FLAGS, MODULE, RITUAL_CASTING_MODES, RULE_SETS, SETTINGS, SWAP_MODES, TEMPLATES, WIZARD_DEFAULTS } from '../constants.mjs';
import { getJournalDocumentsFromPack } from '../data/custom-lists.mjs';
import { ClassManager } from '../managers/class-manager.mjs';
import { RuleSet } from '../managers/rule-set.mjs';
import { SpellDataManager } from '../managers/spell-data-manager.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';
import { detachedRenderOptions } from '../ui/dialogs.mjs';
import { log } from '../utils/logger.mjs';
import { DetailsCustomization } from './details-customization.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {object[]} Cantrip swap timing options */
const SWAP_OPTIONS = [
  { value: SWAP_MODES.NONE, label: 'SPELLBOOK.Settings.CantripSwapping.None' },
  { value: SWAP_MODES.LEVEL_UP, label: 'SPELLBOOK.Settings.CantripSwapping.LevelUp' },
  { value: SWAP_MODES.LONG_REST, label: 'SPELLBOOK.Settings.CantripSwapping.LongRest' }
];

/** @type {object[]} Spell swap timing options */
const SPELL_SWAP_OPTIONS = [
  { value: SWAP_MODES.NONE, label: 'SPELLBOOK.Settings.SpellSwapping.None' },
  { value: SWAP_MODES.LEVEL_UP, label: 'SPELLBOOK.Settings.SpellSwapping.LevelUp' },
  { value: SWAP_MODES.LONG_REST, label: 'SPELLBOOK.Settings.SpellSwapping.LongRest' }
];

/** @type {object[]} Ritual casting behavior options */
const RITUAL_OPTIONS = [
  { value: RITUAL_CASTING_MODES.NONE, label: 'SPELLBOOK.Settings.RitualCasting.None' },
  { value: RITUAL_CASTING_MODES.PREPARED, label: 'SPELLBOOK.Settings.RitualCasting.Prepared' },
  { value: RITUAL_CASTING_MODES.ALWAYS, label: 'SPELLBOOK.Settings.RitualCasting.Always' }
];

/**
 * Load available spell list options for the custom spell list multi-select.
 * @returns {Promise<object[]>} Array of { value, label, group } option objects
 */
async function loadSpellListOptions() {
  const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
  const allPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
  const options = [];
  for (const pack of allPacks) {
    let folderName = pack.metadata.label;
    if (pack.folder) folderName = pack.folder.depth !== 1 ? pack.folder.getParentFolders().at(-1).name : pack.folder.name;
    const journals = await getJournalDocumentsFromPack(pack);
    for (const journal of journals) {
      for (const page of journal.pages) {
        if (page.type !== 'spells' || page.system?.type === 'other') continue;
        if (hiddenLists.includes(page.uuid)) continue;
        const flags = page.flags?.[MODULE.ID] || {};
        const isActorOwned = !!flags.actorId;
        let label = page.name;
        if (isActorOwned && flags.actorId) {
          const owner = game.actors.get(flags.actorId);
          label = `${page.name} (${owner?.name ?? _loc('SPELLMANAGER.ListSource.Character')})`;
        } else if (!isActorOwned && !flags.isCustom && !flags.isMerged) {
          label = `${page.name} (${folderName})`;
        }
        const type = page.system?.type || 'other';
        const groupKey =
          type === 'class' ? 'SPELLBOOK.Settings.SpellListGroups.Class' : type === 'subclass' ? 'SPELLBOOK.Settings.SpellListGroups.Subclass' : 'SPELLBOOK.Settings.SpellListGroups.Other';
        options.push({ value: page.uuid, label, group: _loc(groupKey) });
      }
    }
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

/**
 * Build per-class context data for the template.
 * @param {object} actor - The actor document
 * @param {object[]} spellListOptions - Available spell list options
 * @returns {object[]} Array of class context objects
 */
function buildClassContexts(actor, spellListOptions) {
  const classes = ClassManager.detectSpellcastingClasses(actor);
  const wizardClasses = new Set(ClassManager.getWizardEnabledClasses(actor).map((w) => w.identifier));
  return Object.entries(classes)
    .map(([identifier, data]) => {
      const rules = RuleSet.getClassRules(actor, identifier);
      const isWizard = wizardClasses.has(identifier);
      const currentCantrips = SpellManager.getCurrentCantripCount(actor, identifier);
      const maxCantrips = SpellManager.getMaxCantrips(actor, identifier);
      const noScaleValue = maxCantrips === 0 && rules.showCantrips;
      const customList = Array.isArray(rules.customSpellList) ? rules.customSpellList : rules.customSpellList ? [rules.customSpellList] : [];
      const customSubclassList = Array.isArray(rules.customSubclassSpellList) ? rules.customSubclassSpellList : rules.customSubclassSpellList ? [rules.customSubclassSpellList] : [];
      const classSpellLists = spellListOptions.map((opt) => ({ ...opt, selected: customList.includes(opt.value) }));
      const subclassSpellLists = spellListOptions.map((opt) => ({ ...opt, selected: customSubclassList.includes(opt.value) }));
      return {
        identifier,
        name: data.name,
        img: data.item?.img,
        isWizard,
        noScaleValue,
        stats: { currentCantrips, maxCantrips },
        rules: {
          showCantrips: rules.showCantrips !== false,
          forceWizardMode: rules.forceWizardMode === true,
          cantripSwapping: rules.cantripSwapping || SWAP_MODES.NONE,
          spellSwapping: rules.spellSwapping || SWAP_MODES.NONE,
          ritualCasting: rules.ritualCasting || RITUAL_CASTING_MODES.NONE,
          spellPreparationBonus: rules.spellPreparationBonus ?? 0,
          cantripPreparationBonus: rules.cantripPreparationBonus ?? 0,
          spellLearningCostMultiplier: rules.spellLearningCostMultiplier ?? WIZARD_DEFAULTS.SPELL_LEARNING_COST_MULTIPLIER,
          spellLearningTimeMultiplier: rules.spellLearningTimeMultiplier ?? WIZARD_DEFAULTS.SPELL_LEARNING_TIME_MULTIPLIER,
          startingSpells: rules.startingSpells ?? WIZARD_DEFAULTS.STARTING_SPELLS,
          spellsPerLevel: rules.spellsPerLevel ?? WIZARD_DEFAULTS.SPELLS_PER_LEVEL
        },
        swapOptions: SWAP_OPTIONS.map((o) => ({ ...o, selected: o.value === (rules.cantripSwapping || SWAP_MODES.NONE) })),
        spellSwapOptions: SPELL_SWAP_OPTIONS.map((o) => ({ ...o, selected: o.value === (rules.spellSwapping || SWAP_MODES.NONE) })),
        ritualOptions: RITUAL_OPTIONS.map((o) => ({ ...o, selected: o.value === (rules.ritualCasting || RITUAL_CASTING_MODES.NONE) })),
        spellListOptions: classSpellLists,
        subclassSpellListOptions: subclassSpellLists
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Per-class spellcasting rule configuration dialog. */
export class ClassRules extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-class-rules',
    classes: ['spell-book', 'class-rules'],
    tag: 'form',
    position: { width: 600, height: 700 },
    window: { icon: 'fas fa-cog', resizable: true },
    form: { handler: ClassRules.#onSubmit, closeOnSubmit: true },
    actions: {
      increase: ClassRules.#onIncrease,
      decrease: ClassRules.#onDecrease,
      openCustomization: ClassRules.#onOpenCustomization
    }
  };

  /** @override */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.CLASS_RULES } };

  /**
   * @param {object} [options] - Application options
   * @param {object} options.actor - The actor to configure
   */
  constructor({ actor, ...options } = {}) {
    super(options);
    this.actor = actor;
  }

  /** @override */
  get title() {
    return _loc('SPELLBOOK.Settings.ClassRules.Title', { name: this.actor.name });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    await RuleSet.initializeNewClasses(this.actor);
    const spellListOptions = await loadSpellListOptions();
    context.classes = buildClassContexts(this.actor, spellListOptions);
    context.swapOptions = SWAP_OPTIONS;
    context.spellSwapOptions = SPELL_SWAP_OPTIONS;
    context.ritualOptions = RITUAL_OPTIONS;
    context.ruleSetOptions = this._buildRuleSetOptions();
    context.notifyGm = this.actor.getFlag(MODULE.ID, FLAGS.NOTIFY_GM) ?? game.settings.get(MODULE.ID, SETTINGS.NOTIFY_GM_ON_SPELL_CHANGES);
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.scrollToClass) return;
    const target = this.element.querySelector(`.class-section[data-class="${this.scrollToClass}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.scrollToClass = null;
  }

  /** Build rule set override select options. */
  _buildRuleSetOptions() {
    const globalValue = game.settings.get(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET);
    const globalLabel = _loc(`SPELLBOOK.Settings.SpellcastingRuleSet.${globalValue.charAt(0).toUpperCase() + globalValue.slice(1)}`);
    const current = this.actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE) ?? 'global';
    return [
      { value: 'global', label: `${_loc('SPELLBOOK.Settings.RuleSetOverride.Global')} (${globalLabel})`, selected: current === 'global' },
      { value: RULE_SETS.LEGACY, label: _loc('SPELLBOOK.Settings.SpellcastingRuleSet.Legacy'), selected: current === RULE_SETS.LEGACY },
      { value: RULE_SETS.MODERN, label: _loc('SPELLBOOK.Settings.SpellcastingRuleSet.Modern'), selected: current === RULE_SETS.MODERN }
    ];
  }

  /**
   * Generic increment handler for number inputs.
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} target - Button with data-field and data-step
   */
  static #onIncrease(_event, target) {
    const input = this.element.querySelector(`input[name="${target.dataset.field}"]`);
    if (!input) return;
    const step = parseInt(target.dataset.step) || 1;
    const max = parseInt(input.dataset.max);
    const current = parseInt(input.value) || 0;
    input.value = isNaN(max) ? current + step : Math.min(current + step, max);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Generic decrement handler for number inputs.
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} target - Button with data-field and data-step
   */
  /**
   * Open the Details Customization dialog.
   * @this ClassRules
   */
  static #onOpenCustomization() {
    new DetailsCustomization().render({ force: true, ...detachedRenderOptions(this) });
  }

  static #onDecrease(_event, target) {
    const input = this.element.querySelector(`input[name="${target.dataset.field}"]`);
    if (!input) return;
    const step = parseInt(target.dataset.step) || 1;
    const min = parseInt(input.dataset.min) ?? 0;
    const current = parseInt(input.value) || 0;
    input.value = Math.max(current - step, min);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Save per-class rules from form data.
   * @param {SubmitEvent} _event - Form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {object} formData - Processed form data
   */
  static async #onSubmit(_event, _form, formData) {
    const { actor } = this;
    const data = foundry.utils.expandObject(formData.object);
    // Build all flag updates into a single actor update
    const flagUpdates = {};
    // Global overrides
    const ruleSetValue = data.ruleSetOverride === 'global' ? null : data.ruleSetOverride;
    if (ruleSetValue !== undefined) flagUpdates[`flags.${MODULE.ID}.${FLAGS.RULE_SET_OVERRIDE}`] = ruleSetValue;
    flagUpdates[`flags.${MODULE.ID}.${FLAGS.NOTIFY_GM}`] = data.notifyGm === true || data.notifyGm === 'true';
    // Per-class rules
    if (data.class) {
      const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
      for (const [classId, raw] of Object.entries(data.class)) {
        const previous = classRules[classId] || {};
        const rules = {};
        rules.showCantrips = raw.showCantrips === true || raw.showCantrips === 'true';
        rules.forceWizardMode = raw.forceWizardMode === true || raw.forceWizardMode === 'true';
        rules.cantripSwapping = raw.cantripSwapping || 'none';
        rules.spellSwapping = raw.spellSwapping || 'none';
        rules.ritualCasting = raw.ritualCasting || 'none';
        rules.spellPreparationBonus = parseInt(raw.spellPreparationBonus) || 0;
        rules.cantripPreparationBonus = parseInt(raw.cantripPreparationBonus) || 0;
        if (raw.spellLearningCostMultiplier !== undefined) rules.spellLearningCostMultiplier = parseInt(raw.spellLearningCostMultiplier) || WIZARD_DEFAULTS.SPELL_LEARNING_COST_MULTIPLIER;
        if (raw.spellLearningTimeMultiplier !== undefined) rules.spellLearningTimeMultiplier = parseFloat(raw.spellLearningTimeMultiplier) || WIZARD_DEFAULTS.SPELL_LEARNING_TIME_MULTIPLIER;
        if (raw.startingSpells !== undefined) rules.startingSpells = parseInt(raw.startingSpells) || WIZARD_DEFAULTS.STARTING_SPELLS;
        if (raw.spellsPerLevel !== undefined) rules.spellsPerLevel = parseInt(raw.spellsPerLevel) || WIZARD_DEFAULTS.SPELLS_PER_LEVEL;
        if (raw.customSpellList !== undefined) {
          if (Array.isArray(raw.customSpellList)) rules.customSpellList = raw.customSpellList.filter((v) => v?.trim());
          else if (raw.customSpellList) rules.customSpellList = [raw.customSpellList];
          else rules.customSpellList = [];
        }
        if (raw.customSubclassSpellList !== undefined) {
          if (Array.isArray(raw.customSubclassSpellList)) rules.customSubclassSpellList = raw.customSubclassSpellList.filter((v) => v?.trim());
          else if (raw.customSubclassSpellList) rules.customSubclassSpellList = [raw.customSubclassSpellList];
          else rules.customSubclassSpellList = [];
        }
        const wasShowing = previous.showCantrips !== false;
        if (wasShowing && !rules.showCantrips) await ClassRules.#removeCantripsForClass(actor, classId);
        classRules[classId] = { ...classRules[classId], ...rules };
      }
      flagUpdates[`flags.${MODULE.ID}.${FLAGS.CLASS_RULES}`] = classRules;
    }
    await actor.update(flagUpdates);
    RuleSet._classRules?.delete?.(actor);
    SpellDataManager.invalidateCache(actor);
    for (const app of foundry.applications.instances.values()) {
      if (app.constructor.name === 'SpellBook' && app.actor === actor) app.reloadAllClasses?.();
    }
    log(3, 'Class rules saved.', { actorName: actor.name });
  }

  /**
   * Remove non-granted, non-always-prepared cantrips for a class.
   * @param {object} actor - The actor
   * @param {string} classId - The class identifier
   */
  static async #removeCantripsForClass(actor, classId) {
    const idsToRemove = actor.items
      .filter((i) => i.type === 'spell' && i.system.level === 0 && ClassManager.getSpellClassIdentifier(i) === classId && i.system.prepared !== 2 && !i.flags?.dnd5e?.cachedFor)
      .map((i) => i.id);
    if (idsToRemove.length > 0) await actor.deleteEmbeddedDocuments('Item', idsToRemove);
  }

  /**
   * Open the dialog for the given actor.
   * @param {object} actor - The actor to configure
   * @returns {ClassRules} The dialog instance
   */
  static open(actor) {
    const existing = foundry.applications.instances.get('spellbook-class-rules');
    if (existing) {
      existing.actor = actor;
      existing.render({ force: true });
      return existing;
    }
    const dialog = new ClassRules({ actor });
    dialog.render({ force: true });
    return dialog;
  }
}
