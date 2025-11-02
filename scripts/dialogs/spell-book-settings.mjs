/**
 * Spellbook Settings Dialog
 *
 * Main configuration dialog for actor-specific spell book behavior and preferences.
 * Provides settings management for individual character spellbooks
 * including display options, preparation modes, and integration preferences.
 *
 * @module Dialogs/SpellBookSettings
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSet, SpellManager } from '../managers/_module.mjs';
import * as ValidationUtils from '../validation/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Enhanced dialog application for configuring Spell Book settings with per-class rules.
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class SpellBookSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-settings-dialog',
    tag: 'form',
    form: {
      handler: SpellBookSettings.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      increaseSpellPrepBonus: this.#increaseSpellPrepBonus,
      decreaseSpellPrepBonus: this.#decreaseSpellPrepBonus,
      increaseCantripPrepBonus: this.#increaseCantripPrepBonus,
      decreaseCantripPrepBonus: this.#decreaseCantripPrepBonus,
      increaseSpellLearningCost: this.#increaseSpellLearningCost,
      decreaseSpellLearningCost: this.#decreaseSpellLearningCost,
      increaseStartingSpells: this.#increaseStartingSpells,
      decreaseStartingSpells: this.#decreaseStartingSpells,
      increaseSpellsPerLevel: this.#increaseSpellsPerLevel,
      decreaseSpellsPerLevel: this.#decreaseSpellsPerLevel
    },
    classes: ['spell-book', 'spellbook-settings-dialog'],
    window: { icon: 'fas fa-book-spells', resizable: false, minimizable: true, positioned: true },
    position: { width: 600, height: 'auto' }
  };

  /** @inheritdoc */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.SPELLBOOK_SETTINGS } };

  /**
   * Create a new Spell Book settings dialog instance.
   * @param {Actor5e} actor - The actor to configure settings for
   * @param {Object} [options={}] - Additional application options
   */
  constructor(actor, options = {}) {
    super(options);
    log(3, 'SpellBookSettings constructor.', { actor, options });

    /** @type {Actor5e} The actor being configured */
    this.actor = actor;

    /** @type {SpellManager} Spell management utility for this actor */
    this.spellManager = new SpellManager(actor);

    this.parentApp = options.parentApp;
  }

  /** @inheritdoc */
  get title() {
    return game.i18n.format('SPELLBOOK.Settings.Title', { name: this.actor.name });
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    RuleSet.initializeNewClasses(this.actor);
    context.globalSettings = this._prepareGlobalSettingsFormData();
    context.spellcastingClasses = await this._prepareClassSettings();
    context.hasNotices = context.spellcastingClasses.some((classData) => classData.rules._noScaleValue || classData.hasCustomSpellList);
    context.availableSpellLists = await this._prepareSpellListOptions();
    context.submitButton = this._prepareSubmitButton();
    context.RULE_SETS = MODULE.RULE_SETS;
    context.RITUAL_CASTING_MODES = MODULE.RITUAL_CASTING_MODES;
    context.ENFORCEMENT_BEHAVIOR = MODULE.ENFORCEMENT_BEHAVIOR;
    context.actor = this.actor;
    log(3, 'SpellBookSettings context prepared.', { context });
    return context;
  }

  /**
   * Prepare form data for global settings configuration.
   * @returns {GlobalSettings} Complete global settings configuration object
   * @private
   */
  _prepareGlobalSettingsFormData() {
    log(3, 'Preparing global settings form data.');
    const ruleSetOverride = this.actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    const enforcementBehavior = this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR);
    const globalRuleSet = game.settings.get(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET);
    const globalEnforcementBehavior = game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR);
    const globalRuleSetLabel = game.i18n.localize(`SPELLBOOK.Settings.SpellcastingRuleSet.${globalRuleSet.charAt(0).toUpperCase() + globalRuleSet.slice(1)}`);
    const globalEnforcementBehaviorLabel = game.i18n.localize(`SPELLBOOK.Settings.EnforcementBehavior.${globalEnforcementBehavior.charAt(0).toUpperCase() + globalEnforcementBehavior.slice(1)}`);
    const ruleSetValue = ruleSetOverride || 'global';
    const enforcementValue = enforcementBehavior || 'global';
    const ruleSetOptions = [
      { value: 'global', label: `${game.i18n.localize('SPELLBOOK.Settings.RuleSetOverride.Global')} (${globalRuleSetLabel})`, selected: ruleSetValue === 'global' },
      { value: 'legacy', label: game.i18n.localize('SPELLBOOK.Settings.SpellcastingRuleSet.Legacy'), selected: ruleSetValue === 'legacy' },
      { value: 'modern', label: game.i18n.localize('SPELLBOOK.Settings.SpellcastingRuleSet.Modern'), selected: ruleSetValue === 'modern' }
    ];
    const enforcementOptions = [
      { value: 'global', label: `${game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.Global')} (${globalEnforcementBehaviorLabel})`, selected: enforcementValue === 'global' },
      { value: 'unenforced', label: game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.Unenforced'), selected: enforcementValue === 'unenforced' },
      { value: 'notifyGM', label: game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.NotifyGM'), selected: enforcementValue === 'notifyGM' },
      { value: 'enforced', label: game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.Enforced'), selected: enforcementValue === 'enforced' }
    ];
    const ruleSetSelect = ValidationUtils.createSelect({
      name: 'ruleSetOverride',
      options: ruleSetOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.RuleSetOverride.Label')
    });
    ruleSetSelect.id = 'rule-set-override';
    const enforcementSelect = ValidationUtils.createSelect({
      name: 'enforcementBehavior',
      options: enforcementOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.Label')
    });
    enforcementSelect.id = 'enforcement-behavior';
    log(3, 'Global settings form data prepared.');
    return {
      currentRuleSet: globalRuleSet,
      ruleSetOverride,
      enforcementBehavior,
      currentRuleSetLabel: globalRuleSetLabel,
      ruleSetSelectHtml: ValidationUtils.elementToHtml(ruleSetSelect),
      enforcementSelectHtml: ValidationUtils.elementToHtml(enforcementSelect)
    };
  }

  /**
   * Prepare all per-class settings data.
   * @returns {Promise<ClassSettingsData[]>} Array of processed class settings data
   * @private
   */
  async _prepareClassSettings() {
    log(3, 'Preparing class settings.');
    const classSettings = [];
    const availableSpellLists = await this._prepareSpellListOptions();
    const currentClassRules = this.actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    if (this.actor.spellcastingClasses) {
      for (const spellcastingData of Object.values(this.actor.spellcastingClasses)) {
        const classItem = spellcastingData;
        let spellcastingConfig = classItem.system?.spellcasting;
        let spellcastingSource = classItem;
        if (!spellcastingConfig?.progression || spellcastingConfig.progression === 'none') {
          const subclassItem = spellcastingData._classLink;
          if (subclassItem?.system?.spellcasting?.progression && subclassItem.system.spellcasting.progression !== 'none') {
            spellcastingConfig = subclassItem.system.spellcasting;
            spellcastingSource = subclassItem;
          } else continue;
        }
        const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
        const processedClassRules = RuleSet.getClassRules(this.actor, identifier);
        const savedRules = currentClassRules[identifier] || {};
        const isWizard = identifier in DataUtils.getWizardData(this.actor);
        const formRules = {
          showCantrips: 'showCantrips' in savedRules ? savedRules.showCantrips : processedClassRules.showCantrips,
          forceWizardMode: 'forceWizardMode' in savedRules ? savedRules.forceWizardMode : processedClassRules.forceWizardMode,
          cantripSwapping: savedRules.cantripSwapping || processedClassRules.cantripSwapping || MODULE.SWAP_MODES.NONE,
          spellSwapping: savedRules.spellSwapping || processedClassRules.spellSwapping || MODULE.SWAP_MODES.NONE,
          ritualCasting: savedRules.ritualCasting || processedClassRules.ritualCasting || MODULE.RITUAL_CASTING_MODES.NONE,
          customSpellList: savedRules.customSpellList || processedClassRules.customSpellList || [],
          spellPreparationBonus:
            'spellPreparationBonus' in savedRules ? savedRules.spellPreparationBonus : processedClassRules.spellPreparationBonus || MODULE.PREPARATION_DEFAULTS.SPELL_PREPARATION_BONUS,
          cantripPreparationBonus:
            'cantripPreparationBonus' in savedRules ? savedRules.cantripPreparationBonus : processedClassRules.cantripPreparationBonus || MODULE.PREPARATION_DEFAULTS.CANTRIP_PREPARATION_BONUS,
          spellLearningCostMultiplier:
            'spellLearningCostMultiplier' in savedRules
              ? savedRules.spellLearningCostMultiplier
              : processedClassRules.spellLearningCostMultiplier || MODULE.WIZARD_DEFAULTS.SPELL_LEARNING_COST_MULTIPLIER,
          spellLearningTimeMultiplier:
            'spellLearningTimeMultiplier' in savedRules
              ? savedRules.spellLearningTimeMultiplier
              : processedClassRules.spellLearningTimeMultiplier || MODULE.WIZARD_DEFAULTS.SPELL_LEARNING_TIME_MULTIPLIER,
          startingSpells: 'startingSpells' in savedRules ? savedRules.startingSpells : processedClassRules.startingSpells || MODULE.WIZARD_DEFAULTS.STARTING_SPELLS,
          spellsPerLevel: 'spellsPerLevel' in savedRules ? savedRules.spellsPerLevel : processedClassRules.spellsPerLevel || MODULE.WIZARD_DEFAULTS.SPELLS_PER_LEVEL,
          _noScaleValue: processedClassRules._noScaleValue
        };
        const spellManager = new SpellManager(this.actor);
        const maxCantrips = spellManager.getMaxAllowed(identifier);
        const currentCantrips = spellManager.getCurrentCount(identifier);
        const customSpellLists = Array.isArray(formRules.customSpellList) ? formRules.customSpellList : formRules.customSpellList ? [formRules.customSpellList] : [];
        const hasCustomSpellList = customSpellLists.length > 0;
        let customSpellListNames = [];
        if (hasCustomSpellList) {
          for (const uuid of customSpellLists) {
            try {
              const customList = await fromUuid(uuid);
              customSpellListNames.push(customList?.name || game.i18n.localize('SPELLBOOK.Settings.UnknownList'));
            } catch (error) {
              log(1, 'Error displaying custom spell lists.', { customSpellListNames, error });
              customSpellListNames.push(game.i18n.localize('SPELLBOOK.Settings.UnknownList'));
            }
          }
        }
        const classValidationUtils = this._prepareClassFormElements(identifier, formRules, availableSpellLists);
        const classData = {
          name: classItem.name,
          identifier: identifier,
          img: classItem.img,
          rules: processedClassRules,
          isWizard: isWizard,
          stats: {
            currentCantrips: currentCantrips,
            maxCantrips: maxCantrips,
            classLevel: classItem.system.levels || 1,
            basePreparationMax: spellcastingConfig?.preparation?.max || 0
          },
          hasCustomSpellList: hasCustomSpellList,
          customSpellListName: customSpellListNames.length > 0 ? customSpellListNames.join(', ') : null,
          customSpellListNames: customSpellListNames,
          customSpellListCount: customSpellLists.length,
          formElements: classValidationUtils,
          spellcastingSource: spellcastingSource
        };
        classSettings.push(classData);
      }
    }
    classSettings.sort((a, b) => a.name.localeCompare(b.name));
    log(3, 'Class settings prepared.', { classSettings });
    return classSettings;
  }

  /**
   * Prepare form elements for a specific class configuration.
   * @param {string} identifier - The class identifier
   * @param {ProcessedClassRules} formRules - Current form rule values
   * @param {Array<{value: string, label: string, type: string}>} availableSpellLists - Available spell list options with type info
   * @returns {ClassFormElements} Object containing all form element HTML for the class
   * @private
   */
  _prepareClassFormElements(identifier, formRules, availableSpellLists) {
    log(3, 'Preparing class form elements.', { identifier, formRules });
    const showCantripsCheckbox = ValidationUtils.createCheckbox({
      name: `class.${identifier}.showCantrips`,
      checked: formRules.showCantrips,
      disabled: formRules._noScaleValue,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.ShowCantrips.Label')
    });
    showCantripsCheckbox.id = `show-cantrips-${identifier}`;
    const forceWizardCheckbox = ValidationUtils.createCheckbox({
      name: `class.${identifier}.forceWizardMode`,
      checked: formRules.forceWizardMode,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.ForceWizardMode.Label')
    });
    forceWizardCheckbox.id = `force-wizard-mode-${identifier}`;
    const cantripSwappingValue = formRules.cantripSwapping;
    const cantripSwappingSelect = ValidationUtils.createLocalizedSelect(
      `class.${identifier}.cantripSwapping`,
      [
        { value: 'none', labelKey: 'SPELLBOOK.Settings.CantripSwapping.None' },
        { value: 'levelUp', labelKey: 'SPELLBOOK.Settings.CantripSwapping.LevelUp' },
        { value: 'longRest', labelKey: 'SPELLBOOK.Settings.CantripSwapping.LongRest' }
      ],
      cantripSwappingValue,
      'SPELLBOOK.Settings.CantripSwapping.Label',
      `cantrip-swapping-${identifier}`
    );
    const spellSwappingValue = formRules.spellSwapping;
    const spellSwappingSelect = ValidationUtils.createLocalizedSelect(
      `class.${identifier}.spellSwapping`,
      [
        { value: 'none', labelKey: 'SPELLBOOK.Settings.SpellSwapping.None' },
        { value: 'levelUp', labelKey: 'SPELLBOOK.Settings.SpellSwapping.LevelUp' },
        { value: 'longRest', labelKey: 'SPELLBOOK.Settings.SpellSwapping.LongRest' }
      ],
      spellSwappingValue,
      'SPELLBOOK.Settings.SpellSwapping.Label',
      `spell-swapping-${identifier}`
    );
    const ritualCastingValue = formRules.ritualCasting;
    const ritualCastingSelect = ValidationUtils.createLocalizedSelect(
      `class.${identifier}.ritualCasting`,
      [
        { value: 'none', labelKey: 'SPELLBOOK.Settings.RitualCasting.None' },
        { value: 'prepared', labelKey: 'SPELLBOOK.Settings.RitualCasting.Prepared' },
        { value: MODULE.SPELL_MODE.ALWAYS, labelKey: 'SPELLBOOK.Settings.RitualCasting.Always' }
      ],
      ritualCastingValue,
      'SPELLBOOK.Settings.RitualCasting.Label',
      `ritual-casting-${identifier}`
    );
    const currentCustomSpellLists = Array.isArray(formRules.customSpellList) ? formRules.customSpellList : formRules.customSpellList ? [formRules.customSpellList] : [];
    const multiSelectOptions = availableSpellLists.map((option) => ({ value: option.value, label: option.label, group: this._getSpellListGroupLabel(option.type) }));
    const allPossibleGroups = ['SPELLBOOK.Settings.SpellListGroups.Class', 'SPELLBOOK.Settings.SpellListGroups.Subclass', 'SPELLBOOK.Settings.SpellListGroups.Other'];
    const groupsWithOptions = allPossibleGroups.filter((groupKey) => {
      return multiSelectOptions.some((option) => option.group === groupKey);
    });
    const customSpellListsMultiSelect = ValidationUtils.createMultiSelect(multiSelectOptions, {
      name: `class.${identifier}.customSpellList`,
      selectedValues: currentCustomSpellLists,
      groups: groupsWithOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.CustomSpellLists.Label'),
      cssClass: 'spell-list-multi-select'
    });
    customSpellListsMultiSelect.id = `custom-spell-lists-${identifier}`;
    const spellPreparationBonusControls = this._createSpellPreparationBonusControls(identifier, formRules.spellPreparationBonus);
    const cantripPreparationBonusControls = this._createCantripPreparationBonusControls(identifier, formRules.cantripPreparationBonus);
    const spellLearningCostControls = this._createSpellLearningCostControls(identifier, formRules.spellLearningCostMultiplier);
    const spellLearningTimeControls = this._createSpellLearningTimeControls(identifier, formRules.spellLearningTimeMultiplier);
    const startingSpellsControls = this._createStartingSpellsControls(identifier, formRules.startingSpells);
    const spellsPerLevelControls = this._createSpellsPerLevelControls(identifier, formRules.spellsPerLevel);
    log(3, 'Class form elements prepared.', { identifier });
    return {
      showCantripsCheckboxHtml: ValidationUtils.elementToHtml(showCantripsCheckbox),
      forceWizardModeCheckboxHtml: ValidationUtils.elementToHtml(forceWizardCheckbox),
      cantripSwappingSelectHtml: ValidationUtils.elementToHtml(cantripSwappingSelect),
      spellSwappingSelectHtml: ValidationUtils.elementToHtml(spellSwappingSelect),
      ritualCastingSelectHtml: ValidationUtils.elementToHtml(ritualCastingSelect),
      customSpellListsSelectHtml: ValidationUtils.elementToHtml(customSpellListsMultiSelect),
      spellPreparationBonusControlsHtml: spellPreparationBonusControls,
      cantripPreparationBonusControlsHtml: cantripPreparationBonusControls,
      spellLearningCostControlsHtml: spellLearningCostControls,
      spellLearningTimeControlsHtml: spellLearningTimeControls,
      startingSpellsControlsHtml: startingSpellsControls,
      spellsPerLevelControlsHtml: spellsPerLevelControls
    };
  }

  /**
   * Get the appropriate group label for a spell list type.
   * @param {string} [type] - The spell list type from system.type
   * @returns {string} The localization key for the appropriate group label
   * @private
   */
  _getSpellListGroupLabel(type) {
    log(3, 'Getting spell list group label.', { type });
    switch (type) {
      case 'class':
        return 'SPELLBOOK.Settings.SpellListGroups.Class';
      case 'subclass':
        return 'SPELLBOOK.Settings.SpellListGroups.Subclass';
      default:
        return 'SPELLBOOK.Settings.SpellListGroups.Other';
    }
  }

  /**
   * Create spell preparation bonus control elements.
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - Current spell preparation bonus value
   * @returns {string} HTML string for the complete control group
   * @private
   */
  _createSpellPreparationBonusControls(identifier, currentValue) {
    log(3, 'Creating spell preparation bonus controls.', { identifier, currentValue });
    const spellcastingConfig = DataUtils.getSpellcastingConfigForClass(this.actor, identifier);
    const baseMaxSpells = spellcastingConfig?.preparation?.max || 0;
    const minValue = -baseMaxSpells;
    return ValidationUtils.createCounterGroup({
      identifier: `spell-preparation-bonus-${identifier}`,
      decreaseAction: 'decreaseSpellPrepBonus',
      increaseAction: 'increaseSpellPrepBonus',
      inputName: `class.${identifier}.spellPreparationBonus`,
      currentValue,
      min: minValue,
      max: 20,
      decreaseLabel: 'SPELLBOOK.Settings.SpellPreparationBonus.Decrease',
      increaseLabel: 'SPELLBOOK.Settings.SpellPreparationBonus.Increase',
      inputLabel: 'SPELLBOOK.Settings.SpellPreparationBonus.Label',
      inputCssClass: 'prep-bonus-input'
    });
  }

  /**
   * Create cantrip preparation bonus control elements.
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - Current cantrip preparation bonus value
   * @returns {string} HTML string for the complete control group
   * @private
   */
  _createCantripPreparationBonusControls(identifier, currentValue) {
    log(3, 'Creating cantrip preparation bonus controls.', { identifier, currentValue });
    let baseMaxCantrips = 0;
    const spellcastingData = this.actor.spellcastingClasses?.[identifier];
    if (spellcastingData) {
      const cantripScaleValuesSetting = game.settings.get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES);
      const cantripScaleKeys = cantripScaleValuesSetting
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      const scaleValues = DataUtils.getScaleValuesForClass(this.actor, identifier);
      if (scaleValues) {
        for (const key of cantripScaleKeys) {
          const cantripValue = scaleValues[key]?.value;
          if (cantripValue !== undefined) {
            baseMaxCantrips = cantripValue;
            break;
          }
        }
      }
    }
    const minValue = -baseMaxCantrips;
    return ValidationUtils.createCounterGroup({
      identifier: `cantrip-preparation-bonus-${identifier}`,
      decreaseAction: 'decreaseCantripPrepBonus',
      increaseAction: 'increaseCantripPrepBonus',
      inputName: `class.${identifier}.cantripPreparationBonus`,
      currentValue,
      min: minValue,
      max: 20,
      decreaseLabel: 'SPELLBOOK.Settings.CantripPreparationBonus.Decrease',
      increaseLabel: 'SPELLBOOK.Settings.CantripPreparationBonus.Increase',
      inputLabel: 'SPELLBOOK.Settings.CantripPreparationBonus.Label',
      inputCssClass: 'prep-bonus-input'
    });
  }

  /**
   * Create spell learning cost multiplier controls for a class.
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - Current cost multiplier value
   * @returns {string} HTML string for the controls
   * @private
   */
  _createSpellLearningCostControls(identifier, currentValue) {
    log(3, 'Creating spell learning cost controls.', { identifier, currentValue });
    return ValidationUtils.createCounterGroup({
      identifier: `spell-learning-cost-${identifier}`,
      decreaseAction: 'decreaseSpellLearningCost',
      increaseAction: 'increaseSpellLearningCost',
      inputName: `class.${identifier}.spellLearningCostMultiplier`,
      currentValue: currentValue ?? 50,
      min: 0,
      step: 5,
      decreaseLabel: 'SPELLBOOK.Settings.SpellLearningCostMultiplier.Decrease',
      increaseLabel: 'SPELLBOOK.Settings.SpellLearningCostMultiplier.Increase',
      inputLabel: 'SPELLBOOK.Settings.SpellLearningCostMultiplier.Label',
      inputCssClass: 'learning-cost-input'
    });
  }

  /**
   * Create spell learning time multiplier controls for a class.
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - Current time multiplier value
   * @returns {string} HTML string for the controls
   * @private
   */
  _createSpellLearningTimeControls(identifier, currentValue) {
    log(3, 'Creating spell learning time controls.', { identifier, currentValue });
    const container = document.createElement('div');
    container.className = 'counter-group';
    const input = ValidationUtils.createNumberInput({
      name: `class.${identifier}.spellLearningTimeMultiplier`,
      value: currentValue ?? 120,
      min: 0,
      step: 1,
      cssClass: 'learning-time-input',
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.SpellLearningTimeMultiplier.Label')
    });
    input.id = `spell-learning-time-${identifier}`;
    container.appendChild(input);
    return ValidationUtils.elementToHtml(container);
  }

  /**
   * Create starting spells controls for a wizard class.
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - Current starting spells value
   * @returns {string} HTML string for the controls
   * @private
   */
  _createStartingSpellsControls(identifier, currentValue) {
    log(3, 'Creating starting spells controls.', { identifier, currentValue });
    return ValidationUtils.createCounterGroup({
      identifier: `starting-spells-${identifier}`,
      decreaseAction: 'decreaseStartingSpells',
      increaseAction: 'increaseStartingSpells',
      inputName: `class.${identifier}.startingSpells`,
      currentValue: currentValue ?? 6,
      min: 0,
      step: 1,
      decreaseLabel: 'SPELLBOOK.Settings.StartingSpells.Decrease',
      increaseLabel: 'SPELLBOOK.Settings.StartingSpells.Increase',
      inputLabel: 'SPELLBOOK.Settings.StartingSpells.Label',
      inputCssClass: 'starting-spells-input'
    });
  }

  /**
   * Create spells per level controls for a wizard class.
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - Current spells per level value
   * @returns {string} HTML string for the controls
   * @private
   */
  _createSpellsPerLevelControls(identifier, currentValue) {
    log(3, 'Creating spells per level controls.', { identifier, currentValue });
    return ValidationUtils.createCounterGroup({
      identifier: `spells-per-level-${identifier}`,
      decreaseAction: 'decreaseSpellsPerLevel',
      increaseAction: 'increaseSpellsPerLevel',
      inputName: `class.${identifier}.spellsPerLevel`,
      currentValue: currentValue ?? 2,
      min: 0,
      step: 1,
      decreaseLabel: 'SPELLBOOK.Settings.SpellsPerLevel.Decrease',
      increaseLabel: 'SPELLBOOK.Settings.SpellsPerLevel.Increase',
      inputLabel: 'SPELLBOOK.Settings.SpellsPerLevel.Label',
      inputCssClass: 'spells-per-level-input'
    });
  }

  /**
   * Prepare options for spell list selection dropdowns.
   * @returns {Promise<Array<{value: string, label: string, type: string}>>} Array of spell list options with type information
   * @private
   */
  async _prepareSpellListOptions() {
    log(3, 'Preparing spell list options.');
    try {
      const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
      const allSpellLists = [];
      const allJournalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
      const journalPacks = [];
      for (const pack of allJournalPacks) {
        const shouldShow = await DataUtils.shouldShowInSettings(pack);
        if (shouldShow) journalPacks.push(pack);
      }
      for (const pack of journalPacks) {
        let topLevelFolderName = pack.metadata.label;
        if (pack.folder) {
          if (pack.folder.depth !== 1) topLevelFolderName = pack.folder.getParentFolders().at(-1).name;
          else topLevelFolderName = pack.folder.name;
        }
        const index = await pack.getIndex({ fields: ['name', 'pages.type'] });
        for (const journalData of index) {
          const hasSpellPages = journalData.pages?.some((page) => page.type === 'spells');
          if (!hasSpellPages) continue;
          const journal = await pack.getDocument(journalData._id);
          for (const page of journal.pages) {
            if (page.type !== 'spells' || page.system?.type === 'other') continue;
            if (hiddenLists.includes(page.uuid)) continue;
            const flags = page.flags?.[MODULE.ID] || {};
            const isActorOwned = !!flags.actorId;
            const isCustom = !!flags.isCustom || !!flags.isNewList;
            const isMerged = !!flags.isMerged;
            allSpellLists.push({ uuid: page.uuid, name: page.name, pack: topLevelFolderName, isActorOwned, isCustom, isMerged, flags, type: page.system?.type || 'other' });
          }
        }
      }
      const spellListOptions = allSpellLists.map((list) => {
        let label = list.name;
        if (list.isActorOwned && list.flags.actorId) {
          const actor = game.actors.get(list.flags.actorId);
          const actorName = actor ? actor.name : game.i18n.localize('SPELLMANAGER.ListSource.Character');
          label = `${list.name} (${actorName})`;
        } else if (!list.isActorOwned && !list.isCustom && !list.isMerged) {
          label = `${list.name} (${list.pack})`;
        }
        return { value: list.uuid, label: label, type: list.type };
      });
      spellListOptions.sort((a, b) => a.label.localeCompare(b.label));
      log(3, 'Spell list options prepared.', { count: spellListOptions.length });
      return spellListOptions;
    } catch (error) {
      log(1, 'Error preparing spell list options.', { error });
      return [];
    }
  }

  /**
   * Handle increasing spell prep bonus.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #increaseSpellPrepBonus(_event, target) {
    log(3, 'Increasing spell prep bonus.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.spellPreparationBonus"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.min(currentValue + 1, 20);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, 'spell', newValue);
  }

  /**
   * Handle decreasing spell prep bonus.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #decreaseSpellPrepBonus(_event, target) {
    log(3, 'Decreasing spell prep bonus.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.spellPreparationBonus"]`);
    if (!input) return;
    const spellcastingConfig = DataUtils.getSpellcastingConfigForClass(this.actor, classIdentifier);
    const baseMax = spellcastingConfig?.preparation?.max || 0;
    const minimumBonus = -baseMax;
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.max(currentValue - 1, minimumBonus);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, 'spell', newValue);
  }

  /**
   * Prepare submit button configuration with localized content.
   * @returns {SubmitButtonConfig} Submit button configuration object
   * @private
   */
  _prepareSubmitButton() {
    log(3, 'Preparing submit button.');
    const submitButton = ValidationUtils.createButton({
      type: 'submit',
      name: 'submit',
      labelKey: 'SPELLBOOK.Settings.SaveButton',
      iconClass: 'fas fa-save',
      cssClass: 'submit-button'
    });
    return { submitButtonHtml: ValidationUtils.elementToHtml(submitButton) };
  }

  /**
   * Handle increasing cantrip prep bonus.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #increaseCantripPrepBonus(_event, target) {
    log(3, 'Increasing cantrip prep bonus.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.cantripPreparationBonus"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.min(currentValue + 1, 20);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, 'cantrip', newValue);
  }

  /**
   * Handle decreasing cantrip prep bonus.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #decreaseCantripPrepBonus(_event, target) {
    log(3, 'Decreasing cantrip prep bonus.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.cantripPreparationBonus"]`);
    if (!input) return;
    let baseMaxCantrips = 0;
    const spellcastingData = this.actor.spellcastingClasses?.[classIdentifier];
    if (spellcastingData) {
      const cantripScaleValuesSetting = game.settings.get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES);
      const cantripScaleKeys = cantripScaleValuesSetting
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      const scaleValues = DataUtils.getScaleValuesForClass(this.actor, classIdentifier);
      if (scaleValues) {
        for (const key of cantripScaleKeys) {
          const cantripValue = scaleValues[key]?.value;
          if (cantripValue !== undefined) {
            baseMaxCantrips = cantripValue;
            break;
          }
        }
      }
    }
    const minimumBonus = -baseMaxCantrips;
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.max(currentValue - 1, minimumBonus);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, 'cantrip', newValue);
  }

  /**
   * Handle increasing learning cost.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #increaseSpellLearningCost(_event, target) {
    log(3, 'Increasing spell learning cost.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.spellLearningCostMultiplier"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 50;
    const newValue = currentValue + 5;
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Handle decreasing learning cost.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #decreaseSpellLearningCost(_event, target) {
    log(3, 'Decreasing spell learning cost.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.spellLearningCostMultiplier"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 50;
    const newValue = Math.max(0, currentValue - 5);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Handle increasing starting spells.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #increaseStartingSpells(_event, target) {
    log(3, 'Increasing starting spells.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.startingSpells"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 6;
    const newValue = currentValue + 1;
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Handle decreasing starting spells.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #decreaseStartingSpells(_event, target) {
    log(3, 'Decreasing starting spells.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.startingSpells"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 6;
    const newValue = Math.max(0, currentValue - 1);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Handle increasing spells per level.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #increaseSpellsPerLevel(_event, target) {
    log(3, 'Increasing spells per level.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.spellsPerLevel"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 2;
    const newValue = currentValue + 1;
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Handle decreasing spells per level.
   * @this SpellBookSettings
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #decreaseSpellsPerLevel(_event, target) {
    log(3, 'Decreasing spells per level.', { target });
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.spellsPerLevel"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 2;
    const newValue = Math.max(0, currentValue - 1);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Update the visual display of class statistics when preparation bonus changes.
   * @param {string} classIdentifier - The class identifier
   * @param {string} bonusType - The type of bonus ('spell' or 'cantrip')
   * @param {number} newBonus - The new bonus value
   * @private
   */
  _updateClassStatsDisplay(classIdentifier, bonusType, newBonus) {
    log(3, 'Updating class stats display.', { classIdentifier, bonusType, newBonus });
    const classSection = this.element.querySelector(`[data-class="${classIdentifier}"]`);
    const selector = bonusType === 'spell' ? '.spell-preparation-bonus' : '.cantrip-preparation-bonus';
    const bonusDisplay = classSection?.querySelector(selector);
    if (bonusDisplay) {
      const labelKey = bonusType === 'spell' ? 'SPELLBOOK.Settings.SpellPreparationBonus.Text' : 'SPELLBOOK.Settings.CantripPreparationBonus.Text';
      if (newBonus > 0) bonusDisplay.textContent = `+${newBonus} ${game.i18n.localize(labelKey)}`;
      else if (newBonus < 0) bonusDisplay.textContent = `${newBonus} ${game.i18n.localize(labelKey)}`;
      else bonusDisplay.textContent = `±0 ${game.i18n.localize(labelKey)}`;
      bonusDisplay.classList.toggle('has-bonus', newBonus !== 0);
    }
  }

  /**
   * Handle cantrip visibility changes - cleanup when disabled, restore when enabled.
   * @param {Actor5e} actor - The actor whose cantrips to manage
   * @param {CantripVisibilityChange} changes - Object mapping class IDs to change types
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async _handleCantripVisibilityChanges(actor, changes) {
    log(3, 'Handling cantrip visibility changes.', { actor, changes });
    const spellManager = new SpellManager(actor);
    for (const [classId, changeType] of Object.entries(changes)) {
      if (changeType === 'disabled') {
        const cantripsToRemove = actor.items
          .filter(
            (item) =>
              item.type === 'spell' && item.system.level === 0 && (item.system.sourceClass === classId || item.sourceClass === classId) && item.system.prepared !== 2 && !item.flags?.dnd5e?.cachedFor
          )
          .map((item) => item.id);
        if (cantripsToRemove.length > 0) await actor.deleteEmbeddedDocuments('Item', cantripsToRemove);
        await spellManager.cleanupCantripsForClass(classId);
      }
    }
  }

  /** @inheritdoc */
  static async formHandler(event, _form, formData) {
    log(3, 'SpellBookSettings form handler triggered.', { event, formData });
    event.preventDefault();
    const actor = this.actor;
    if (!actor) throw new Error('No actor provided to form handler');
    const expandedData = foundry.utils.expandObject(formData.object);
    const currentClassRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const ruleSetOverride = expandedData.ruleSetOverride === 'global' ? null : expandedData.ruleSetOverride;
    const previousRuleSetOverride = actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    actor.setFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE, ruleSetOverride);
    const enforcementBehavior = expandedData.enforcementBehavior === 'global' ? null : expandedData.enforcementBehavior;
    actor.setFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR, enforcementBehavior);
    if (ruleSetOverride && ruleSetOverride !== previousRuleSetOverride) RuleSet.applyRuleSetToActor(actor, ruleSetOverride);
    const cantripVisibilityChanges = {};
    const wizardModeChanges = {};
    if (expandedData.class) {
      for (const [classId, rules] of Object.entries(expandedData.class)) {
        const currentRules = currentClassRules[classId] || {};
        const wasShowingCantrips = currentRules.showCantrips !== false;
        const willShowCantrips = rules.showCantrips !== false;
        if (wasShowingCantrips && !willShowCantrips) cantripVisibilityChanges[classId] = 'disabled';
        else if (!wasShowingCantrips && willShowCantrips) cantripVisibilityChanges[classId] = 'enabled';
        const wasWizardMode = currentRules.forceWizardMode === true;
        const willBeWizardMode = rules.forceWizardMode === true;
        if (!wasWizardMode && willBeWizardMode) wizardModeChanges[classId] = 'enabled';
        else if (wasWizardMode && !willBeWizardMode) wizardModeChanges[classId] = 'disabled';
        const processedRules = {};
        if (rules.spellPreparationBonus !== undefined) processedRules.spellPreparationBonus = parseInt(rules.spellPreparationBonus) || 0;
        if (rules.cantripPreparationBonus !== undefined) processedRules.cantripPreparationBonus = parseInt(rules.cantripPreparationBonus) || 0;
        if (rules.showCantrips !== undefined) processedRules.showCantrips = Boolean(rules.showCantrips);
        if (rules.forceWizardMode !== undefined) processedRules.forceWizardMode = Boolean(rules.forceWizardMode);
        if (rules.spellLearningCostMultiplier !== undefined) processedRules.spellLearningCostMultiplier = parseInt(rules.spellLearningCostMultiplier) || 50;
        if (rules.spellLearningTimeMultiplier !== undefined) processedRules.spellLearningTimeMultiplier = parseFloat(rules.spellLearningTimeMultiplier) || 2;
        if (rules.startingSpells !== undefined) processedRules.startingSpells = parseInt(rules.startingSpells) || 6;
        if (rules.spellsPerLevel !== undefined) processedRules.spellsPerLevel = parseInt(rules.spellsPerLevel) || 2;
        if (rules.customSpellList !== undefined) {
          if (Array.isArray(rules.customSpellList)) processedRules.customSpellList = rules.customSpellList.filter((uuid) => uuid && uuid.trim());
          else if (rules.customSpellList) processedRules.customSpellList = [rules.customSpellList];
          else processedRules.customSpellList = [];
        }
        ['cantripSwapping', 'spellSwapping', 'ritualCasting'].forEach((prop) => {
          if (rules[prop] !== undefined) processedRules[prop] = rules[prop];
        });
        await RuleSet.updateClassRules(actor, classId, processedRules);
      }
    }
    if (Object.keys(cantripVisibilityChanges).length > 0) await this._handleCantripVisibilityChanges(actor, cantripVisibilityChanges);
    if (this.parentApp) {
      await this.parentApp.close();
      SPELLBOOK.openSpellBookForActor(actor);
    }
    log(3, 'SpellBookSettings form handler completed successfully.');
    return actor;
  }
}
