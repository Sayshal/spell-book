/**
 * Spellbook Settings Dialog
 *
 * Main configuration dialog for actor-specific spell book behavior and preferences.
 * Provides settings management for individual character spellbooks
 * including display options, preparation modes, and integration preferences.
 *
 * Key features:
 * - Actor-specific spellbook configuration
 * - Display and UI preference management
 * - Spell preparation behavior settings
 * - Integration toggle controls
 * - Performance optimization options
 * - User preference persistence
 *
 * @module Dialogs/SpellbookSettingsDialog
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { RuleSetManager, SpellManager } from '../managers/_module.mjs';
import * as ValidationHelpers from '../validation/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef {Object} GlobalSettings
 * @property {string} currentRuleSet - The global rule set identifier
 * @property {string|null} ruleSetOverride - Actor-specific rule set override (null for global)
 * @property {string|null} enforcementBehavior - Actor-specific enforcement behavior (null for global)
 * @property {string} currentRuleSetLabel - Localized label for current global rule set
 * @property {string} ruleSetSelectHtml - HTML for rule set selection dropdown
 * @property {string} enforcementSelectHtml - HTML for enforcement behavior dropdown
 */

/**
 * @typedef {Object} RuleSetOption
 * @property {string} value - The option value
 * @property {string} label - Localized display label
 * @property {boolean} selected - Whether this option is currently selected
 */

/**
 * @typedef {Object} ClassStats
 * @property {number} currentCantrips - Number of currently prepared cantrips
 * @property {number} maxCantrips - Maximum allowed cantrips for this class
 * @property {number} classLevel - Current level of this class
 * @property {number} basePreparationMax - Base spell preparation maximum from class features
 */

/**
 * @typedef {Object} ProcessedClassRules
 * @property {boolean} showCantrips - Whether to show cantrip management
 * @property {boolean} forceWizardMode - Whether to force wizard-style spell management
 * @property {string} cantripSwapping - Cantrip swapping rule ('none', 'levelUp', 'longRest')
 * @property {string} spellSwapping - Spell swapping rule ('none', 'levelUp', 'longRest')
 * @property {string} ritualCasting - Ritual casting rule ('none', 'prepared', 'always')
 * @property {string} customSpellList - UUID of custom spell list (empty for auto-detect)
 * @property {number} spellPreparationBonus - Bonus to spell preparation count
 * @property {number} cantripPreparationBonus - Bonus to cantrip preparation count
 * @property {boolean} _noScaleValue - Whether class lacks scale value data
 */

/**
 * @typedef {Object} ClassFormElements
 * @property {string} showCantripsCheckboxHtml - HTML for show cantrips checkbox
 * @property {string} forceWizardModeCheckboxHtml - HTML for force wizard mode checkbox
 * @property {string} cantripSwappingSelectHtml - HTML for cantrip swapping dropdown
 * @property {string} spellSwappingSelectHtml - HTML for spell swapping dropdown
 * @property {string} ritualCastingSelectHtml - HTML for ritual casting dropdown
 * @property {string} customSpellListSelectHtml - HTML for custom spell list dropdown
 * @property {string} spellPreparationBonusControlsHtml - HTML for spell preparation bonus controls
 * @property {string} cantripPreparationBonusControlsHtml - HTML for cantrip preparation bonus controls
 */

/**
 * @typedef {Object} ClassSettingsData
 * @property {string} name - Class display name
 * @property {string} identifier - Class identifier
 * @property {string} img - Class icon path
 * @property {ProcessedClassRules} rules - Processed class rules configuration
 * @property {ClassStats} stats - Class statistics and limits
 * @property {boolean} hasCustomSpellList - Whether class uses a custom spell list
 * @property {string|null} customSpellListName - Name of custom spell list if applicable
 * @property {ClassFormElements} formElements - Generated form elements for this class
 * @property {Object} spellcastingSource - Source item providing spellcasting configuration
 */

/**
 * @typedef {Object} SpellListOption
 * @property {string} value - The option value (UUID or empty string)
 * @property {string} label - Display label for the option
 * @property {boolean} selected - Whether this option is currently selected
 * @property {string} [optgroup] - Optgroup directive ('start' or 'end')
 */

/**
 * @typedef {Object} CantripVisibilityChange
 * @property {string} [classId] - 'enabled' or 'disabled' status change
 */

/**
 * @typedef {Object} WizardModeChange
 * @property {string} [classId] - 'enabled' or 'disabled' status change
 */

/**
 * Enhanced dialog application for configuring Spell Book settings with per-class rules.
 *
 * This dialog provides configuration options for spell book behavior,
 * including global settings (rule sets, enforcement) and per-class configurations
 * (preparation bonuses, swapping rules, custom spell lists, etc.).
 *
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class SpellbookSettingsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'spellbook-settings-dialog',
    tag: 'form',
    form: {
      handler: SpellbookSettingsDialog.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      increaseSpellPrepBonus: SpellbookSettingsDialog.increaseSpellPrepBonus,
      decreaseSpellPrepBonus: SpellbookSettingsDialog.decreaseSpellPrepBonus,
      increaseCantripPrepBonus: SpellbookSettingsDialog.increaseCantripPrepBonus,
      decreaseCantripPrepBonus: SpellbookSettingsDialog.decreaseCantripPrepBonus
    },
    classes: ['spell-book', 'spellbook-settings-dialog'],
    window: { icon: 'fas fa-book-spells', resizable: false, minimizable: true, positioned: true },
    position: { width: 600, height: 'auto' }
  };

  /** @inheritdoc */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.SPELLBOOK_SETTINGS } };

  /**
   * Create a new Spell Book settings dialog instance.
   *
   * @param {Actor5e} actor - The actor to configure settings for
   * @param {Object} [options={}] - Additional application options
   */
  constructor(actor, options = {}) {
    super(options);

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
    RuleSetManager.initializeNewClasses(this.actor);
    const globalSettings = this._prepareGlobalSettingsFormData();
    const spellcastingClasses = await this._prepareClassSettings();
    const submitButton = this._prepareSubmitButton();
    const availableSpellLists = await this._prepareSpellListOptions();
    context.globalSettings = globalSettings;
    context.spellcastingClasses = spellcastingClasses;
    context.hasNotices = spellcastingClasses.some((classData) => classData.rules._noScaleValue || classData.hasCustomSpellList);
    context.availableSpellLists = availableSpellLists;
    context.submitButton = submitButton;
    context.RULE_SETS = MODULE.RULE_SETS;
    context.RITUAL_CASTING_MODES = MODULE.RITUAL_CASTING_MODES;
    context.ENFORCEMENT_BEHAVIOR = MODULE.ENFORCEMENT_BEHAVIOR;
    context.actor = this.actor;
    return context;
  }

  /**
   * Prepare form data for global settings configuration.
   *
   * Creates form elements and data for rule set override and enforcement behavior
   * settings, including current values and available options with localized labels.
   *
   * @returns {GlobalSettings} Complete global settings configuration object
   * @private
   */
  _prepareGlobalSettingsFormData() {
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
    const ruleSetSelect = ValidationHelpers.createSelect({
      name: 'ruleSetOverride',
      options: ruleSetOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.RuleSetOverride.Label')
    });
    ruleSetSelect.id = 'rule-set-override';
    const enforcementSelect = ValidationHelpers.createSelect({
      name: 'enforcementBehavior',
      options: enforcementOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.Label')
    });
    enforcementSelect.id = 'enforcement-behavior';
    return {
      currentRuleSet: globalRuleSet,
      ruleSetOverride,
      enforcementBehavior,
      currentRuleSetLabel: globalRuleSetLabel,
      ruleSetSelectHtml: ValidationHelpers.elementToHtml(ruleSetSelect),
      enforcementSelectHtml: ValidationHelpers.elementToHtml(enforcementSelect)
    };
  }

  /**
   * Prepare all per-class settings data.
   *
   * Processes all spellcasting classes for the actor, gathering their current
   * rule configurations, statistics, and generating form elements for each class.
   * Now supports multiple custom spell lists per class.
   *
   * @returns {Promise<ClassSettingsData[]>} Array of processed class settings data
   * @private
   */
  async _prepareClassSettings() {
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
        const processedClassRules = RuleSetManager.getClassRules(this.actor, identifier);
        const savedRules = currentClassRules[identifier] || {};
        const formRules = {
          showCantrips: 'showCantrips' in savedRules ? savedRules.showCantrips : processedClassRules.showCantrips,
          forceWizardMode: 'forceWizardMode' in savedRules ? savedRules.forceWizardMode : processedClassRules.forceWizardMode,
          cantripSwapping: savedRules.cantripSwapping || processedClassRules.cantripSwapping || 'none',
          spellSwapping: savedRules.spellSwapping || processedClassRules.spellSwapping || 'none',
          ritualCasting: savedRules.ritualCasting || processedClassRules.ritualCasting || 'none',
          customSpellList: savedRules.customSpellList || processedClassRules.customSpellList || [],
          spellPreparationBonus: 'spellPreparationBonus' in savedRules ? savedRules.spellPreparationBonus : processedClassRules.spellPreparationBonus || 0,
          cantripPreparationBonus: 'cantripPreparationBonus' in savedRules ? savedRules.cantripPreparationBonus : processedClassRules.cantripPreparationBonus || 0,
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
              log(2, `Error loading custom spell list ${uuid}:`, error);
              customSpellListNames.push(game.i18n.localize('SPELLBOOK.Settings.UnknownList'));
            }
          }
        }
        const classValidationHelpers = this._prepareClassFormElements(identifier, formRules, availableSpellLists);
        const classData = {
          name: classItem.name,
          identifier: identifier,
          img: classItem.img,
          rules: processedClassRules,
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
          formElements: classValidationHelpers,
          spellcastingSource: spellcastingSource
        };
        classSettings.push(classData);
      }
    }
    classSettings.sort((a, b) => a.name.localeCompare(b.name));
    return classSettings;
  }

  /**
   * Prepare form elements for a specific class configuration.
   *
   * Generates all necessary form elements (checkboxes, selects, controls) for
   * configuring a specific class's spell management rules and bonuses. Now
   * supports multi-select for custom spell lists with optgroup organization.
   *
   * @param {string} identifier - The class identifier
   * @param {ProcessedClassRules} formRules - Current form rule values
   * @param {Array<{value: string, label: string, type: string}>} availableSpellLists - Available spell list options with type info
   * @returns {ClassFormElements} Object containing all form element HTML for the class
   * @private
   */
  _prepareClassFormElements(identifier, formRules, availableSpellLists) {
    const showCantripsCheckbox = ValidationHelpers.createCheckbox({
      name: `class.${identifier}.showCantrips`,
      checked: formRules.showCantrips,
      disabled: formRules._noScaleValue,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.ShowCantrips.Label')
    });
    showCantripsCheckbox.id = `show-cantrips-${identifier}`;
    const forceWizardCheckbox = ValidationHelpers.createCheckbox({
      name: `class.${identifier}.forceWizardMode`,
      checked: formRules.forceWizardMode,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.ForceWizardMode.Label')
    });
    forceWizardCheckbox.id = `force-wizard-mode-${identifier}`;
    const cantripSwappingValue = formRules.cantripSwapping;
    const cantripSwappingOptions = [
      { value: 'none', label: game.i18n.localize('SPELLBOOK.Settings.CantripSwapping.None'), selected: cantripSwappingValue === 'none' },
      { value: 'levelUp', label: game.i18n.localize('SPELLBOOK.Settings.CantripSwapping.LevelUp'), selected: cantripSwappingValue === 'levelUp' },
      { value: 'longRest', label: game.i18n.localize('SPELLBOOK.Settings.CantripSwapping.LongRest'), selected: cantripSwappingValue === 'longRest' }
    ];
    const cantripSwappingSelect = ValidationHelpers.createSelect({
      name: `class.${identifier}.cantripSwapping`,
      options: cantripSwappingOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.CantripSwapping.Label')
    });
    cantripSwappingSelect.id = `cantrip-swapping-${identifier}`;
    const spellSwappingValue = formRules.spellSwapping;
    const spellSwappingOptions = [
      { value: 'none', label: game.i18n.localize('SPELLBOOK.Settings.SpellSwapping.None'), selected: spellSwappingValue === 'none' },
      { value: 'levelUp', label: game.i18n.localize('SPELLBOOK.Settings.SpellSwapping.LevelUp'), selected: spellSwappingValue === 'levelUp' },
      { value: 'longRest', label: game.i18n.localize('SPELLBOOK.Settings.SpellSwapping.LongRest'), selected: spellSwappingValue === 'longRest' }
    ];
    const spellSwappingSelect = ValidationHelpers.createSelect({
      name: `class.${identifier}.spellSwapping`,
      options: spellSwappingOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.SpellSwapping.Label')
    });
    spellSwappingSelect.id = `spell-swapping-${identifier}`;
    const ritualCastingValue = formRules.ritualCasting;
    const ritualCastingOptions = [
      { value: 'none', label: game.i18n.localize('SPELLBOOK.Settings.RitualCasting.None'), selected: ritualCastingValue === 'none' },
      { value: 'prepared', label: game.i18n.localize('SPELLBOOK.Settings.RitualCasting.Prepared'), selected: ritualCastingValue === 'prepared' },
      { value: 'always', label: game.i18n.localize('SPELLBOOK.Settings.RitualCasting.Always'), selected: ritualCastingValue === 'always' }
    ];
    const ritualCastingSelect = ValidationHelpers.createSelect({
      name: `class.${identifier}.ritualCasting`,
      options: ritualCastingOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.RitualCasting.Label')
    });
    ritualCastingSelect.id = `ritual-casting-${identifier}`;
    const currentCustomSpellLists = Array.isArray(formRules.customSpellList) ? formRules.customSpellList : formRules.customSpellList ? [formRules.customSpellList] : [];
    const multiSelectOptions = availableSpellLists.map((option) => ({ value: option.value, label: option.label, group: this._getSpellListGroupLabel(option.type) }));
    const allPossibleGroups = ['SPELLBOOK.Settings.SpellListGroups.Class', 'SPELLBOOK.Settings.SpellListGroups.Subclass', 'SPELLBOOK.Settings.SpellListGroups.Other'];
    const groupsWithOptions = allPossibleGroups.filter((groupKey) => {
      return multiSelectOptions.some((option) => option.group === groupKey);
    });
    const customSpellListsMultiSelect = ValidationHelpers.createMultiSelect(multiSelectOptions, {
      name: `class.${identifier}.customSpellList`,
      selectedValues: currentCustomSpellLists,
      groups: groupsWithOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.CustomSpellLists.Label'),
      cssClass: 'spell-list-multi-select'
    });
    customSpellListsMultiSelect.id = `custom-spell-lists-${identifier}`;
    const spellPreparationBonusControls = this._createSpellPreparationBonusControls(identifier, formRules.spellPreparationBonus);
    const cantripPreparationBonusControls = this._createCantripPreparationBonusControls(identifier, formRules.cantripPreparationBonus);
    return {
      showCantripsCheckboxHtml: ValidationHelpers.elementToHtml(showCantripsCheckbox),
      forceWizardModeCheckboxHtml: ValidationHelpers.elementToHtml(forceWizardCheckbox),
      cantripSwappingSelectHtml: ValidationHelpers.elementToHtml(cantripSwappingSelect),
      spellSwappingSelectHtml: ValidationHelpers.elementToHtml(spellSwappingSelect),
      ritualCastingSelectHtml: ValidationHelpers.elementToHtml(ritualCastingSelect),
      customSpellListsSelectHtml: ValidationHelpers.elementToHtml(customSpellListsMultiSelect),
      spellPreparationBonusControlsHtml: spellPreparationBonusControls,
      cantripPreparationBonusControlsHtml: cantripPreparationBonusControls
    };
  }

  /**
   * Get the appropriate group label for a spell list type.
   *
   * Maps spell list system types to localized group labels for use in
   * optgroup organization. Follows the priority order: Class > Subclass > Other.
   *
   * @param {string} [type] - The spell list type from system.type
   * @returns {string} The localization key for the appropriate group label
   * @private
   */
  _getSpellListGroupLabel(type) {
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
   *
   * Generates decrease button, number input, and increase button for managing
   * spell preparation bonuses with appropriate bounds checking.
   *
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - Current spell preparation bonus value
   * @returns {string} HTML string for the complete control group
   * @private
   */
  _createSpellPreparationBonusControls(identifier, currentValue) {
    const container = document.createElement('div');
    container.className = 'preparation-bonus-controls';
    const spellcastingConfig = DataHelpers.getSpellcastingConfigForClass(this.actor, identifier);
    const baseMaxSpells = spellcastingConfig?.preparation?.max || 0;
    const minValue = -baseMaxSpells;
    const decreaseButton = document.createElement('button');
    decreaseButton.type = 'button';
    decreaseButton.className = 'prep-bonus-decrease';
    decreaseButton.dataset.class = identifier;
    decreaseButton.dataset.action = 'decreaseSpellPrepBonus';
    decreaseButton.textContent = '−';
    decreaseButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Settings.SpellPreparationBonus.Decrease'));
    const input = ValidationHelpers.createNumberInput({
      name: `class.${identifier}.spellPreparationBonus`,
      value: currentValue,
      min: minValue,
      max: 20,
      cssClass: 'prep-bonus-input',
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.SpellPreparationBonus.Label')
    });
    input.id = `spell-preparation-bonus-${identifier}`;
    const increaseButton = document.createElement('button');
    increaseButton.type = 'button';
    increaseButton.className = 'prep-bonus-increase';
    increaseButton.dataset.class = identifier;
    increaseButton.dataset.action = 'increaseSpellPrepBonus';
    increaseButton.textContent = '+';
    increaseButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Settings.SpellPreparationBonus.Increase'));
    container.appendChild(decreaseButton);
    container.appendChild(input);
    container.appendChild(increaseButton);
    return ValidationHelpers.elementToHtml(container);
  }

  /**
   * Create cantrip preparation bonus control elements.
   *
   * Generates decrease button, number input, and increase button for managing
   * cantrip preparation bonuses with appropriate bounds checking.
   *
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - Current cantrip preparation bonus value
   * @returns {string} HTML string for the complete control group
   * @private
   */
  _createCantripPreparationBonusControls(identifier, currentValue) {
    const container = document.createElement('div');
    container.className = 'preparation-bonus-controls';
    let baseMaxCantrips = 0;
    const spellcastingData = this.actor.spellcastingClasses?.[identifier];
    if (spellcastingData) {
      const cantripScaleValuesSetting = game.settings.get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES);
      const cantripScaleKeys = cantripScaleValuesSetting
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      const scaleValues = DataHelpers.getScaleValuesForClass(this.actor, identifier);
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
    const decreaseButton = document.createElement('button');
    decreaseButton.type = 'button';
    decreaseButton.className = 'prep-bonus-decrease';
    decreaseButton.dataset.class = identifier;
    decreaseButton.dataset.action = 'decreaseCantripPrepBonus';
    decreaseButton.textContent = '−';
    decreaseButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Settings.CantripPreparationBonus.Decrease'));
    const input = ValidationHelpers.createNumberInput({
      name: `class.${identifier}.cantripPreparationBonus`,
      value: currentValue,
      min: minValue,
      max: 20,
      cssClass: 'prep-bonus-input',
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.CantripPreparationBonus.Label')
    });
    input.id = `cantrip-preparation-bonus-${identifier}`;
    const increaseButton = document.createElement('button');
    increaseButton.type = 'button';
    increaseButton.className = 'prep-bonus-increase';
    increaseButton.dataset.class = identifier;
    increaseButton.dataset.action = 'increaseCantripPrepBonus';
    increaseButton.textContent = '+';
    increaseButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Settings.CantripPreparationBonus.Increase'));
    container.appendChild(decreaseButton);
    container.appendChild(input);
    container.appendChild(increaseButton);
    return ValidationHelpers.elementToHtml(container);
  }

  /**
   * Prepare options for spell list selection dropdowns.
   *
   * Loads and organizes all available spell lists from compendiums, categorizing
   * them by type (class, subclass, other) for optgroup organization. Extracts
   * system.type information needed for proper grouping in multi-select components.
   *
   * @returns {Promise<Array<{value: string, label: string, type: string}>>} Array of spell list options with type information
   * @private
   */
  async _prepareSpellListOptions() {
    try {
      const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
      const allSpellLists = [];
      const allJournalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
      const journalPacks = [];
      for (const pack of allJournalPacks) {
        const shouldShow = await DataHelpers.shouldShowInSettings(pack);
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
            allSpellLists.push({
              uuid: page.uuid,
              name: page.name,
              pack: topLevelFolderName,
              isActorOwned,
              isCustom,
              isMerged,
              flags,
              type: page.system?.type || 'other'
            });
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
      log(3, `Prepared ${spellListOptions.length} spell list options for settings dialog`);
      return spellListOptions;
    } catch (error) {
      log(1, 'Error preparing spell list options:', error);
      return [];
    }
  }

  /**
   * Action handler to increase spell preparation bonus for a specific class.
   *
   * Increments the spell preparation bonus value with bounds checking and
   * updates the visual display to reflect the change.
   *
   * @param {Event} _event - The click event (unused)
   * @param {HTMLElement} target - The clicked button element
   * @static
   */
  static increaseSpellPrepBonus(_event, target) {
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.spellPreparationBonus"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.min(currentValue + 1, 20);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, 'spell', newValue);
    log(3, `Increased spell preparation bonus for ${classIdentifier} to ${newValue}`);
  }

  /**
   * Action handler to decrease spell preparation bonus for a specific class.
   *
   * Decrements the spell preparation bonus value with bounds checking based on
   * the class's base preparation maximum to prevent negative totals.
   *
   * @param {Event} _event - The click event (unused)
   * @param {HTMLElement} target - The clicked button element
   * @static
   */
  static decreaseSpellPrepBonus(_event, target) {
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.spellPreparationBonus"]`);
    if (!input) return;
    const spellcastingConfig = DataHelpers.getSpellcastingConfigForClass(this.actor, classIdentifier);
    const baseMax = spellcastingConfig?.preparation?.max || 0;
    const minimumBonus = -baseMax;
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.max(currentValue - 1, minimumBonus);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, 'spell', newValue);
    if (newValue === minimumBonus && currentValue > minimumBonus) {
      const spellcastingData = this.actor.spellcastingClasses?.[classIdentifier];
      const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
      const message =
        baseMax > 0
          ? game.i18n.format('SPELLBOOK.Settings.SpellPreparationBonus.MinimumReached', {
              class: classItem?.name || classIdentifier,
              total: baseMax + newValue
            })
          : game.i18n.localize('SPELLBOOK.Settings.SpellPreparationBonus.MinimumReachedGeneric');
      ui.notifications.info(message);
    }
    log(3, `Decreased spell preparation bonus for ${classIdentifier} to ${newValue}`);
  }

  /**
   * Prepare submit button configuration with localized content.
   *
   * Creates a properly configured submit button element with icon and
   * appropriate accessibility attributes.
   *
   * @returns {Object} Submit button configuration object
   * @private
   */
  _prepareSubmitButton() {
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.name = 'submit';
    submitButton.className = 'submit-button';
    submitButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Settings.SaveButton'));
    const icon = document.createElement('i');
    icon.className = 'fas fa-save';
    icon.setAttribute('aria-hidden', 'true');
    submitButton.appendChild(icon);
    submitButton.appendChild(document.createTextNode(` ${game.i18n.localize('SPELLBOOK.Settings.SaveButton')}`));
    return { submitButtonHtml: ValidationHelpers.elementToHtml(submitButton) };
  }

  /**
   * Action handler to increase cantrip preparation bonus for a specific class.
   *
   * Increments the cantrip preparation bonus value with bounds checking and
   * updates the visual display to reflect the change.
   *
   * @param {Event} _event - The click event (unused)
   * @param {HTMLElement} target - The clicked button element
   * @static
   */
  static increaseCantripPrepBonus(_event, target) {
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.cantripPreparationBonus"]`);
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.min(currentValue + 1, 20);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, 'cantrip', newValue);
    log(3, `Increased cantrip preparation bonus for ${classIdentifier} to ${newValue}`);
  }

  /**
   * Action handler to decrease cantrip preparation bonus for a specific class.
   *
   * Decrements the cantrip preparation bonus value with bounds checking based on
   * the class's base cantrip maximum from scale values.
   *
   * @param {Event} _event - The click event (unused)
   * @param {HTMLElement} target - The clicked button element
   * @static
   */
  static decreaseCantripPrepBonus(_event, target) {
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
      const scaleValues = DataHelpers.getScaleValuesForClass(this.actor, classIdentifier);
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
    if (newValue === minimumBonus && currentValue > minimumBonus) {
      const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
      const message =
        baseMaxCantrips > 0
          ? game.i18n.format('SPELLBOOK.Settings.CantripPreparationBonus.MinimumReached', {
              class: classItem?.name || classIdentifier,
              total: baseMaxCantrips + newValue
            })
          : game.i18n.localize('SPELLBOOK.Settings.CantripPreparationBonus.MinimumReachedGeneric');
      ui.notifications.info(message);
    }
    log(3, `Decreased cantrip preparation bonus for ${classIdentifier} to ${newValue}`);
  }

  /**
   * Update the visual display of class statistics when preparation bonus changes.
   *
   * Updates bonus display elements to reflect current bonus values with
   * appropriate styling and formatting.
   *
   * @param {string} classIdentifier - The class identifier
   * @param {string} bonusType - The type of bonus ('spell' or 'cantrip')
   * @param {number} newBonus - The new bonus value
   * @private
   */
  _updateClassStatsDisplay(classIdentifier, bonusType, newBonus) {
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
   *
   * Manages cantrip spell items when cantrip visibility is toggled, removing
   * unprepared cantrips when disabled and cleaning up class associations.
   *
   * @param {Actor5e} actor - The actor whose cantrips to manage
   * @param {CantripVisibilityChange} changes - Object mapping class IDs to change types
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async _handleCantripVisibilityChanges(actor, changes) {
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
  static async formHandler(event, form, formData) {
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
    if (ruleSetOverride && ruleSetOverride !== previousRuleSetOverride) RuleSetManager.applyRuleSetToActor(actor, ruleSetOverride);
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
        if (rules.customSpellList !== undefined) {
          if (Array.isArray(rules.customSpellList)) processedRules.customSpellList = rules.customSpellList.filter((uuid) => uuid && uuid.trim());
          else if (rules.customSpellList) processedRules.customSpellList = [rules.customSpellList];
          else processedRules.customSpellList = [];
        }
        ['cantripSwapping', 'spellSwapping', 'ritualCasting'].forEach((prop) => {
          if (rules[prop] !== undefined) processedRules[prop] = rules[prop];
        });
        const success = await RuleSetManager.updateClassRules(actor, classId, processedRules);
      }
    }
    if (Object.keys(cantripVisibilityChanges).length > 0) await SpellbookSettingsDialog._handleCantripVisibilityChanges(actor, cantripVisibilityChanges);
    if (this.parentApp) {
      const currentState = { activeTab: this.parentApp.tabGroups['spellbook-tabs'], position: foundry.utils.deepClone(this.parentApp.position) };
      await this.parentApp.close();
      const newSpellbook = SPELLBOOK.openSpellBookForActor(actor).render({ force: true });
    }
    ui.notifications.info(game.i18n.format('SPELLBOOK.Settings.Saved', { name: actor.name }));
    return actor;
  }
}
