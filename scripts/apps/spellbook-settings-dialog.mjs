import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as formElements from '../helpers/form-elements.mjs';
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
      increaseSpellPrepBonus: SpellbookSettingsDialog.increaseSpellPrepBonus,
      decreaseSpellPrepBonus: SpellbookSettingsDialog.decreaseSpellPrepBonus,
      increaseCantripPrepBonus: SpellbookSettingsDialog.increaseCantripPrepBonus,
      decreaseCantripPrepBonus: SpellbookSettingsDialog.decreaseCantripPrepBonus
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

  _prepareGlobalSettingsFormData() {
    const ruleSetOverride = this.actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    const enforcementBehavior = this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR);
    const globalRuleSet = game.settings.get(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET);
    const globalEnforcementBehavior = game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR);
    const globalRuleSetLabel = game.i18n.localize(`SPELLBOOK.Settings.SpellcastingRuleSet.${globalRuleSet.charAt(0).toUpperCase() + globalRuleSet.slice(1)}`);
    const globalEnforcementBehaviorLabel = game.i18n.localize(
      `SPELLBOOK.Settings.EnforcementBehavior.${globalEnforcementBehavior.charAt(0).toUpperCase() + globalEnforcementBehavior.slice(1)}`
    );
    const ruleSetValue = ruleSetOverride || 'global';
    const enforcementValue = enforcementBehavior || 'global';
    const ruleSetOptions = [
      {
        value: 'global',
        label: `${game.i18n.localize('SPELLBOOK.Settings.RuleSetOverride.Global')} (${globalRuleSetLabel})`,
        selected: ruleSetValue === 'global'
      },
      {
        value: 'legacy',
        label: game.i18n.localize('SPELLBOOK.Settings.SpellcastingRuleSet.Legacy'),
        selected: ruleSetValue === 'legacy'
      },
      {
        value: 'modern',
        label: game.i18n.localize('SPELLBOOK.Settings.SpellcastingRuleSet.Modern'),
        selected: ruleSetValue === 'modern'
      }
    ];
    const enforcementOptions = [
      {
        value: 'global',
        label: `${game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.Global')} (${globalEnforcementBehaviorLabel})`,
        selected: enforcementValue === 'global'
      },
      {
        value: 'unenforced',
        label: game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.Unenforced'),
        selected: enforcementValue === 'unenforced'
      },
      {
        value: 'notifyGM',
        label: game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.NotifyGM'),
        selected: enforcementValue === 'notifyGM'
      },
      {
        value: 'enforced',
        label: game.i18n.localize('SPELLBOOK.Settings.EnforcementBehavior.Enforced'),
        selected: enforcementValue === 'enforced'
      }
    ];
    const ruleSetSelect = formElements.createSelect({
      name: 'ruleSetOverride',
      options: ruleSetOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.RuleSetOverride.Label')
    });
    ruleSetSelect.id = 'rule-set-override';
    const enforcementSelect = formElements.createSelect({
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
      ruleSetSelectHtml: formElements.elementToHtml(ruleSetSelect),
      enforcementSelectHtml: formElements.elementToHtml(enforcementSelect)
    };
  }

  /**
   * Prepare class settings data including rules and stats
   * @returns {Promise<Array>} Array of class settings data
   * @private
   */
  async _prepareClassSettings() {
    const classSettings = [];
    const classItems = this.actor.items.filter((item) => item.type === 'class' && item.system.spellcasting?.progression && item.system.spellcasting.progression !== 'none');
    const availableSpellLists = await this._prepareSpellListOptions();
    const currentClassRules = this.actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    for (const classItem of classItems) {
      const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
      const processedClassRules = RuleSetManager.getClassRules(this.actor, identifier);
      const savedRules = currentClassRules[identifier] || {};
      const spellManager = new SpellManager(this.actor);
      const maxCantrips = spellManager.getMaxAllowed(identifier);
      const currentCantrips = spellManager.getCurrentCount(identifier);
      const formRules = {
        showCantrips: savedRules.hasOwnProperty('showCantrips') ? savedRules.showCantrips : processedClassRules.showCantrips,
        forceWizardMode: savedRules.hasOwnProperty('forceWizardMode') ? savedRules.forceWizardMode : processedClassRules.forceWizardMode,
        cantripSwapping: savedRules.cantripSwapping || processedClassRules.cantripSwapping || 'none',
        spellSwapping: savedRules.spellSwapping || processedClassRules.spellSwapping || 'none',
        ritualCasting: savedRules.ritualCasting || processedClassRules.ritualCasting || 'none',
        customSpellList: savedRules.customSpellList || processedClassRules.customSpellList || '',
        spellPreparationBonus: savedRules.hasOwnProperty('spellPreparationBonus') ? savedRules.spellPreparationBonus : processedClassRules.spellPreparationBonus || 0,
        cantripPreparationBonus: savedRules.hasOwnProperty('cantripPreparationBonus') ? savedRules.cantripPreparationBonus : processedClassRules.cantripPreparationBonus || 0,
        _noScaleValue: processedClassRules._noScaleValue
      };
      const hasCustomSpellList = !!formRules.customSpellList;
      let customSpellListName = null;
      if (hasCustomSpellList) {
        const customList = await fromUuid(formRules.customSpellList);
        customSpellListName = customList?.name || game.i18n.localize('SPELLBOOK.Settings.UnknownList');
      }
      const classFormElements = this._prepareClassFormElements(identifier, formRules, availableSpellLists);
      const classData = {
        name: classItem.name,
        identifier: identifier,
        img: classItem.img,
        rules: processedClassRules,
        stats: {
          currentCantrips: currentCantrips,
          maxCantrips: maxCantrips,
          classLevel: classItem.system.levels || 1,
          basePreparationMax: classItem.system.spellcasting?.preparation?.max || 0
        },
        hasCustomSpellList: hasCustomSpellList,
        customSpellListName: customSpellListName,
        formElements: classFormElements
      };
      classSettings.push(classData);
    }
    classSettings.sort((a, b) => a.name.localeCompare(b.name));
    return classSettings;
  }

  /**
   * Prepare form elements for a specific class
   * @param {string} identifier - The class identifier
   * @param {Object} formRules - The form rules configuration (with actual saved values)
   * @param {Array} availableSpellLists - Available spell list options
   * @returns {Object} Object containing all form element HTML for the class
   * @private
   */
  _prepareClassFormElements(identifier, formRules, availableSpellLists) {
    const showCantripsCheckbox = formElements.createCheckbox({
      name: `class.${identifier}.showCantrips`,
      checked: formRules.showCantrips,
      disabled: formRules._noScaleValue,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.ShowCantrips.Label')
    });
    showCantripsCheckbox.id = `show-cantrips-${identifier}`;
    const forceWizardCheckbox = formElements.createCheckbox({
      name: `class.${identifier}.forceWizardMode`,
      checked: formRules.forceWizardMode,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.ForceWizardMode.Label')
    });
    forceWizardCheckbox.id = `force-wizard-mode-${identifier}`;
    const cantripSwappingValue = formRules.cantripSwapping;
    const cantripSwappingOptions = [
      {
        value: 'none',
        label: game.i18n.localize('SPELLBOOK.Settings.CantripSwapping.None'),
        selected: cantripSwappingValue === 'none'
      },
      {
        value: 'levelUp',
        label: game.i18n.localize('SPELLBOOK.Settings.CantripSwapping.LevelUp'),
        selected: cantripSwappingValue === 'levelUp'
      },
      {
        value: 'longRest',
        label: game.i18n.localize('SPELLBOOK.Settings.CantripSwapping.LongRest'),
        selected: cantripSwappingValue === 'longRest'
      }
    ];
    const cantripSwappingSelect = formElements.createSelect({
      name: `class.${identifier}.cantripSwapping`,
      options: cantripSwappingOptions,
      disabled: !formRules.showCantrips,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.CantripSwapping.Label')
    });
    cantripSwappingSelect.id = `cantrip-swapping-${identifier}`;
    const spellSwappingValue = formRules.spellSwapping;
    const spellSwappingOptions = [
      {
        value: 'none',
        label: game.i18n.localize('SPELLBOOK.Settings.SpellSwapping.None'),
        selected: spellSwappingValue === 'none'
      },
      {
        value: 'levelUp',
        label: game.i18n.localize('SPELLBOOK.Settings.SpellSwapping.LevelUp'),
        selected: spellSwappingValue === 'levelUp'
      },
      {
        value: 'longRest',
        label: game.i18n.localize('SPELLBOOK.Settings.SpellSwapping.LongRest'),
        selected: spellSwappingValue === 'longRest'
      }
    ];
    const spellSwappingSelect = formElements.createSelect({
      name: `class.${identifier}.spellSwapping`,
      options: spellSwappingOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.SpellSwapping.Label')
    });
    spellSwappingSelect.id = `spell-swapping-${identifier}`;
    const ritualCastingValue = formRules.ritualCasting;
    const ritualCastingOptions = [
      {
        value: 'none',
        label: game.i18n.localize('SPELLBOOK.Settings.RitualCasting.None'),
        selected: ritualCastingValue === 'none'
      },
      {
        value: 'prepared',
        label: game.i18n.localize('SPELLBOOK.Settings.RitualCasting.Prepared'),
        selected: ritualCastingValue === 'prepared'
      },
      {
        value: 'always',
        label: game.i18n.localize('SPELLBOOK.Settings.RitualCasting.Always'),
        selected: ritualCastingValue === 'always'
      }
    ];
    const ritualCastingSelect = formElements.createSelect({
      name: `class.${identifier}.ritualCasting`,
      options: ritualCastingOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.RitualCasting.Label')
    });
    ritualCastingSelect.id = `ritual-casting-${identifier}`;
    const customSpellListValue = formRules.customSpellList;
    const customSpellListOptions = availableSpellLists.map((option) => ({
      ...option,
      selected: option.value === customSpellListValue
    }));
    const customSpellListSelect = formElements.createSelect({
      name: `class.${identifier}.customSpellList`,
      options: customSpellListOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.CustomSpellList.Label')
    });
    customSpellListSelect.id = `custom-spell-list-${identifier}`;
    const spellPreparationBonusControls = this._createSpellPreparationBonusControls(identifier, formRules.spellPreparationBonus);
    const cantripPreparationBonusControls = this._createCantripPreparationBonusControls(identifier, formRules.cantripPreparationBonus);
    return {
      showCantripsCheckboxHtml: formElements.elementToHtml(showCantripsCheckbox),
      forceWizardModeCheckboxHtml: formElements.elementToHtml(forceWizardCheckbox),
      cantripSwappingSelectHtml: formElements.elementToHtml(cantripSwappingSelect),
      spellSwappingSelectHtml: formElements.elementToHtml(spellSwappingSelect),
      ritualCastingSelectHtml: formElements.elementToHtml(ritualCastingSelect),
      customSpellListSelectHtml: formElements.elementToHtml(customSpellListSelect),
      spellPreparationBonusControlsHtml: spellPreparationBonusControls,
      cantripPreparationBonusControlsHtml: cantripPreparationBonusControls
    };
  }

  /**
   * Create spell preparation bonus controls (decrease button, input, increase button)
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - The current spell preparation bonus value
   * @returns {string} HTML string for the spell preparation bonus controls
   * @private
   */
  _createSpellPreparationBonusControls(identifier, currentValue) {
    const container = document.createElement('div');
    container.className = 'preparation-bonus-controls';
    const classItem = this.actor.items.find((item) => item.type === 'class' && (item.system.identifier?.toLowerCase() === identifier || item.name.toLowerCase() === identifier));
    const baseMaxSpells = classItem?.system?.spellcasting?.preparation?.max || 0;
    const minValue = -baseMaxSpells;
    const decreaseButton = document.createElement('button');
    decreaseButton.type = 'button';
    decreaseButton.className = 'prep-bonus-decrease';
    decreaseButton.dataset.class = identifier;
    decreaseButton.dataset.action = 'decreaseSpellPrepBonus';
    decreaseButton.textContent = '−';
    decreaseButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Settings.SpellPreparationBonus.Decrease'));
    const input = formElements.createNumberInput({
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
    return formElements.elementToHtml(container);
  }

  /**
   * Create cantrip preparation bonus controls (decrease button, input, increase button)
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - The current cantrip preparation bonus value
   * @returns {string} HTML string for the cantrip preparation bonus controls
   * @private
   */
  _createCantripPreparationBonusControls(identifier, currentValue) {
    const container = document.createElement('div');
    container.className = 'preparation-bonus-controls';
    const classItem = this.actor.items.find((item) => item.type === 'class' && (item.system.identifier?.toLowerCase() === identifier || item.name.toLowerCase() === identifier));
    let baseMaxCantrips = 0;
    if (classItem) {
      const cantripScaleValuesSetting = game.settings.get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES);
      const cantripScaleKeys = cantripScaleValuesSetting
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      if (classItem.scaleValues) {
        for (const key of cantripScaleKeys) {
          const cantripValue = classItem.scaleValues[key]?.value;
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
    const input = formElements.createNumberInput({
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
    return formElements.elementToHtml(container);
  }

  /**
   * Prepare available spell list options for custom selection
   * @returns {Promise<Array>} Array of spell list options
   * @private
   */
  async _prepareSpellListOptions() {
    try {
      const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Settings.SpellList.AutoDetect') }];
      const hiddenLists = game.settings.get(MODULE.ID, SETTINGS.HIDDEN_SPELL_LISTS) || [];
      const allSpellLists = [];
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
            if (page.type !== 'spells' || page.system?.type === 'other') continue;
            if (hiddenLists.includes(page.uuid)) continue;
            const flags = page.flags?.[MODULE.ID] || {};
            const isActorOwned = !!flags.actorId;
            const isCustom = !!flags.isCustom || !!flags.isNewList;
            const isMerged = !!flags.isMerged;
            allSpellLists.push({ uuid: page.uuid, name: page.name, pack: topLevelFolderName, isActorOwned, isCustom, isMerged, flags });
          }
        }
      }
      const actorOwnedLists = allSpellLists.filter((list) => list.isActorOwned);
      const customLists = allSpellLists.filter((list) => !list.isActorOwned && list.isCustom && !list.isMerged);
      const mergedLists = allSpellLists.filter((list) => !list.isActorOwned && list.isMerged);
      const standardLists = allSpellLists.filter((list) => !list.isActorOwned && !list.isCustom && !list.isMerged);
      if (actorOwnedLists.length > 0) {
        options.push({ value: '', label: game.i18n.localize('SPELLMANAGER.Folders.PlayerSpellbooks'), optgroup: 'start' });
        actorOwnedLists.forEach((list) => {
          let actorName = game.i18n.localize('SPELLMANAGER.ListSource.Character');
          if (list.flags.actorId) {
            const actor = game.actors.get(list.flags.actorId);
            if (actor) actorName = actor.name;
          }
          const label = `${list.name} (${actorName})`;
          options.push({ value: list.uuid, label: label, selected: false });
        });
        options.push({ value: '', label: '', optgroup: 'end' });
      }
      if (customLists.length > 0) {
        options.push({ value: '', label: game.i18n.localize('SPELLMANAGER.Folders.CustomLists'), optgroup: 'start' });
        customLists.forEach((list) => {
          options.push({ value: list.uuid, label: list.name, selected: false });
        });
        options.push({ value: '', label: '', optgroup: 'end' });
      }
      if (mergedLists.length > 0) {
        options.push({ value: '', label: game.i18n.localize('SPELLMANAGER.Folders.MergedLists'), optgroup: 'start' });
        mergedLists.forEach((list) => {
          options.push({ value: list.uuid, label: list.name, selected: false });
        });
        options.push({ value: '', label: '', optgroup: 'end' });
      }
      if (standardLists.length > 0) {
        options.push({ value: '', label: game.i18n.localize('SPELLMANAGER.Folders.SpellLists'), optgroup: 'start' });
        standardLists.forEach((list) => {
          options.push({ value: list.uuid, label: `${list.name} (${list.pack})`, selected: false });
        });
        options.push({ value: '', label: '', optgroup: 'end' });
      }
      return options;
    } catch (error) {
      log(1, 'Error preparing spell list options:', error);
      return [{ value: '', label: game.i18n.localize('SPELLBOOK.Settings.SpellList.AutoDetect') }];
    }
  }

  /**
   * Prepare submit button configuration
   * @returns {Object} Submit button configuration
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
    return { submitButtonHtml: formElements.elementToHtml(submitButton) };
  }

  /** @override */
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
   * Increase spell preparation bonus for a specific class
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked button
   * @static
   */
  static increaseSpellPrepBonus(event, target) {
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
   * Decrease spell preparation bonus for a specific class
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked button
   * @static
   */
  static decreaseSpellPrepBonus(event, target) {
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.spellPreparationBonus"]`);
    if (!input) return;
    const classItem = this.actor.items.find(
      (item) => item.type === 'class' && (item.system.identifier?.toLowerCase() === classIdentifier || item.name.toLowerCase() === classIdentifier)
    );
    const baseMax = classItem?.system?.spellcasting?.preparation?.max || 0;
    const minimumBonus = -baseMax;
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.max(currentValue - 1, minimumBonus);
    input.value = newValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this._updateClassStatsDisplay(classIdentifier, 'spell', newValue);
    if (newValue === minimumBonus && currentValue > minimumBonus) {
      const message =
        baseMax > 0 ?
          game.i18n.format('SPELLBOOK.Settings.SpellPreparationBonus.MinimumReached', {
            class: classItem?.name || classIdentifier,
            total: baseMax + newValue
          })
        : game.i18n.localize('SPELLBOOK.Settings.SpellPreparationBonus.MinimumReachedGeneric');
      ui.notifications.info(message);
    }
    log(3, `Decreased spell preparation bonus for ${classIdentifier} to ${newValue}`);
  }

  /**
   * Increase cantrip preparation bonus for a specific class
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked button
   * @static
   */
  static increaseCantripPrepBonus(event, target) {
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
   * Decrease cantrip preparation bonus for a specific class
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked button
   * @static
   */
  static decreaseCantripPrepBonus(event, target) {
    const classIdentifier = target.dataset.class;
    if (!classIdentifier) return;
    const input = this.element.querySelector(`input[name="class.${classIdentifier}.cantripPreparationBonus"]`);
    if (!input) return;
    const classItem = this.actor.items.find(
      (item) => item.type === 'class' && (item.system.identifier?.toLowerCase() === classIdentifier || item.name.toLowerCase() === classIdentifier)
    );
    let baseMaxCantrips = 0;
    if (classItem) {
      const cantripScaleValuesSetting = game.settings.get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES);
      const cantripScaleKeys = cantripScaleValuesSetting
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      if (classItem.scaleValues) {
        for (const key of cantripScaleKeys) {
          const cantripValue = classItem.scaleValues[key]?.value;
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
      const message =
        baseMaxCantrips > 0 ?
          game.i18n.format('SPELLBOOK.Settings.CantripPreparationBonus.MinimumReached', {
            class: classItem?.name || classIdentifier,
            total: baseMaxCantrips + newValue
          })
        : game.i18n.localize('SPELLBOOK.Settings.CantripPreparationBonus.MinimumReachedGeneric');
      ui.notifications.info(message);
    }
    log(3, `Decreased cantrip preparation bonus for ${classIdentifier} to ${newValue}`);
  }

  /**
   * Update the visual display of class stats when preparation bonus changes
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
        if (rules.customSpellList !== undefined) processedRules.customSpellList = rules.customSpellList || null;
        ['cantripSwapping', 'spellSwapping', 'ritualCasting'].forEach((prop) => {
          if (rules[prop] !== undefined) processedRules[prop] = rules[prop];
        });
        const success = await RuleSetManager.updateClassRules(actor, classId, processedRules);
        if (!success) throw new Error('FORM_CANCELLED');
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
