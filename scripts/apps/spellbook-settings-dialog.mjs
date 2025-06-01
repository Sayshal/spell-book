import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager } from '../managers/rule-set-manager.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Enhanced dialog for configuring spell book settings with per-class rules
 */
export class SpellbookSettingsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'spellbook-settings-dialog',
    tag: 'form',
    form: {
      handler: SpellbookSettingsDialog.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      increasePrepBonus: SpellbookSettingsDialog.increasePrepBonus,
      decreasePrepBonus: SpellbookSettingsDialog.decreasePrepBonus
    },
    classes: ['spellbook-settings-dialog'],
    window: {
      icon: 'fas fa-book-spells',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: {
      width: 600,
      height: 'auto'
    }
  };

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.SPELLBOOK_SETTINGS }
  };

  /**
   * @param {Actor5e} actor - The actor to configure settings for
   * @param {Object} [options={}] - Additional application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.spellManager = new SpellManager(actor);
  }

  /** @override */
  get title() {
    return game.i18n.format('SPELLBOOK.Settings.Title', { name: this.actor.name });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    RuleSetManager.initializeNewClasses(this.actor);
    context.currentRuleSet = RuleSetManager.getEffectiveRuleSet(this.actor);
    context.ruleSetOverride = this.actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    context.enforcementBehavior = this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR);
    context.currentRuleSetLabel = game.i18n.localize(`SPELLBOOK.Settings.SpellcastingRuleSet.${context.currentRuleSet.charAt(0).toUpperCase() + context.currentRuleSet.slice(1)}`);
    context.spellcastingClasses = await this._prepareClassSettings();
    context.hasNotices = context.spellcastingClasses.some((classData) => classData.rules._noScaleValue || classData.hasCustomSpellList);
    context.availableSpellLists = await this._prepareSpellListOptions();
    context.RULE_SETS = MODULE.RULE_SETS;
    context.RITUAL_CASTING_MODES = MODULE.RITUAL_CASTING_MODES;
    context.ENFORCEMENT_BEHAVIOR = MODULE.ENFORCEMENT_BEHAVIOR;
    context.actor = this.actor;
    return context;
  }

  /**
   * Prepare class settings data including rules and stats
   * @returns {Promise<Array>} Array of class settings data
   * @private
   */
  async _prepareClassSettings() {
    const classSettings = [];
    const classItems = this.actor.items.filter((item) => item.type === 'class' && item.system.spellcasting?.progression && item.system.spellcasting.progression !== 'none');
    for (const classItem of classItems) {
      const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
      const classRules = RuleSetManager.getClassRules(this.actor, identifier);
      const spellManager = new SpellManager(this.actor);
      const maxCantrips = spellManager.getMaxAllowed(identifier);
      const currentCantrips = spellManager.getCurrentCount(identifier);
      const hasCustomSpellList = !!classRules.customSpellList;
      let customSpellListName = null;
      if (hasCustomSpellList) {
        const customList = await fromUuid(classRules.customSpellList);
        customSpellListName = customList?.name || game.i18n.localize('SPELLBOOK.Settings.UnknownList');
      }
      const classData = {
        name: classItem.name,
        identifier: identifier,
        img: classItem.img,
        rules: classRules,
        stats: {
          currentCantrips: currentCantrips,
          maxCantrips: maxCantrips,
          classLevel: classItem.system.levels || 1,
          basePreparationMax: classItem.system.spellcasting?.preparation?.max || 0
        },
        hasCustomSpellList: hasCustomSpellList,
        customSpellListName: customSpellListName
      };
      classSettings.push(classData);
    }
    classSettings.sort((a, b) => a.name.localeCompare(b.name));
    return classSettings;
  }

  /**
   * Prepare available spell list options for custom selection
   * @returns {Promise<Array>} Array of spell list options
   * @private
   */
  async _prepareSpellListOptions() {
    try {
      const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Settings.SpellList.AutoDetect') }];
      const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
      for (const pack of journalPacks) {
        let topLevelFolderName = pack.metadata.label;
        if (pack.folder) {
          if (pack.folder.depth !== 1) topLevelFolderName = pack.folder.getParentFolders().at(-1).name;
          else topLevelFolderName = pack.folder.name;
        }
        const index = await pack.getIndex();
        for (const journalData of index) {
          const journal = await pack.getDocument(journalData._id);
          for (const page of journal.pages) {
            if (page.type === 'spells') {
              options.push({ value: page.uuid, label: `${page.name} (${topLevelFolderName})` });
            }
          }
        }
      }
      return options;
    } catch (error) {
      log(1, 'Error preparing spell list options:', error);
      return [{ value: '', label: game.i18n.localize('SPELLBOOK.Settings.SpellList.AutoDetect') }];
    }
  }

  /**
   * Increase preparation bonus for a specific class
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked button
   * @static
   */
  static increasePrepBonus(event, target) {
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.preparationBonus"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.min(currentValue + 1, 20);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, newValue);
    log(3, `Increased preparation bonus for ${classIdentifier} to ${newValue}`);
  }

  /**
   * Decrease preparation bonus for a specific class
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked button
   * @static
   */
  static decreasePrepBonus(event, target) {
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.preparationBonus"]`);
    if (!input) return;
    const classItem = this.actor.items.find(
      (item) => item.type === 'class' && (item.system.identifier?.toLowerCase() === classIdentifier || item.name.toLowerCase() === classIdentifier)
    );
    let minimumBonus = -10;
    if (classItem) {
      const baseMax = classItem.system?.spellcasting?.preparation?.max || 0;
      minimumBonus = -baseMax;
    } else {
      log(2, `Could not find class item for identifier ${classIdentifier}, using fallback minimum`);
    }
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.max(currentValue - 1, minimumBonus);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, newValue);
    if (newValue === minimumBonus && currentValue > minimumBonus) {
      const baseMax = classItem?.system?.spellcasting?.preparation?.max || 0;
      const message =
        baseMax > 0 ?
          game.i18n.format('SPELLBOOK.Settings.PreparationBonus.MinimumReached', {
            class: classItem?.name || classIdentifier,
            total: baseMax + newValue
          })
        : game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.MinimumReachedGeneric');
      ui.notifications.info(message);
    }
    log(3, `Decreased preparation bonus for ${classIdentifier} to ${newValue}`);
  }

  /**
   * Update the visual display of class stats when preparation bonus changes
   * @param {string} classIdentifier - The class identifier
   * @param {number} newBonus - The new bonus value
   * @private
   */
  _updateClassStatsDisplay(classIdentifier, newBonus) {
    const classSection = this.element.querySelector(`[data-class="${classIdentifier}"]`);
    const bonusDisplay = classSection?.querySelector('.preparation-bonus');
    if (bonusDisplay) {
      if (newBonus > 0) bonusDisplay.textContent = `+${newBonus} ${game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.Text')}`;
      else if (newBonus < 0) bonusDisplay.textContent = `${newBonus} ${game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.Text')}`;
      else bonusDisplay.textContent = `±0 ${game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.Text')}`;
      bonusDisplay.classList.toggle('has-bonus', newBonus !== 0);
    }
  }

  /**
   * Form handler for saving spellbook settings
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {Object} formData - The form data
   * @returns {Promise<Actor5e|null>} The actor or null if error
   */
  static async formHandler(_event, _form, formData) {
    const actor = this.actor;
    if (!actor) return null;
    const expandedData = foundry.utils.expandObject(formData.object);
    const currentClassRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const ruleSetOverride = expandedData.ruleSetOverride === 'global' ? null : expandedData.ruleSetOverride;
    const previousRuleSetOverride = actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    actor.setFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE, ruleSetOverride);
    const enforcementBehavior = expandedData.enforcementBehavior === 'global' ? null : expandedData.enforcementBehavior;
    actor.setFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR, enforcementBehavior);
    if (ruleSetOverride && ruleSetOverride !== previousRuleSetOverride) RuleSetManager.applyRuleSetToActor(actor, ruleSetOverride);
    const cantripVisibilityChanges = {};
    if (expandedData.class) {
      for (const [classId, rules] of Object.entries(expandedData.class)) {
        const currentRules = currentClassRules[classId] || {};
        const wasShowingCantrips = currentRules.showCantrips !== false;
        const willShowCantrips = rules.showCantrips !== false;
        if (wasShowingCantrips && !willShowCantrips) cantripVisibilityChanges[classId] = 'disabled';
        else if (!wasShowingCantrips && willShowCantrips) cantripVisibilityChanges[classId] = 'enabled';
        const processedRules = {};
        if (rules.preparationBonus !== undefined) processedRules.preparationBonus = parseInt(rules.preparationBonus) || 0;
        if (rules.showCantrips !== undefined) processedRules.showCantrips = Boolean(rules.showCantrips);
        if (rules.customSpellList !== undefined) processedRules.customSpellList = rules.customSpellList || null;
        ['cantripSwapping', 'spellSwapping', 'ritualCasting'].forEach((prop) => {
          if (rules[prop] !== undefined) processedRules[prop] = rules[prop];
        });
        RuleSetManager.updateClassRules(actor, classId, processedRules);
      }
    }
    if (Object.keys(cantripVisibilityChanges).length > 0) await SpellbookSettingsDialog._handleCantripVisibilityChanges(actor, cantripVisibilityChanges);
    const allInstances = Array.from(foundry.applications.instances.values());
    const openSpellbooks = allInstances.filter((w) => w.constructor.name === 'PlayerSpellBook' && w.actor.id === actor.id);
    for (const spellbook of openSpellbooks) await spellbook.refreshFromSettingsChange();
    ui.notifications.info(game.i18n.format('SPELLBOOK.Settings.Saved', { name: actor.name }));
    return actor;
  }

  /**
   * Handle cantrip visibility changes - cleanup when disabled, restore when enabled
   * @param {Actor5e} actor - The actor
   * @param {Object} changes - Object mapping class IDs to 'enabled'/'disabled'
   * @returns {Promise<void>}
   * @private
   */
  static async _handleCantripVisibilityChanges(actor, changes) {
    const spellManager = new SpellManager(actor);
    for (const [classId, changeType] of Object.entries(changes)) {
      if (changeType === 'disabled') {
        const cantripsToRemove = actor.items
          .filter(
            (item) =>
              item.type === 'spell' &&
              item.system.level === 0 &&
              (item.system.sourceClass === classId || item.sourceClass === classId) &&
              !item.system.preparation?.alwaysPrepared &&
              !item.flags?.dnd5e?.cachedFor
          )
          .map((item) => item.id);
        if (cantripsToRemove.length > 0) await actor.deleteEmbeddedDocuments('Item', cantripsToRemove);
        await spellManager.cleanupCantripsForClass(classId);
      }
    }
  }
}
