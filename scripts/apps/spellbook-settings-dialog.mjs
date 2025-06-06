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

  _prepareGlobalSettingsFormData() {
    // Get the raw flag values (null means "use global")
    const ruleSetOverride = this.actor.getFlag(MODULE.ID, FLAGS.RULE_SET_OVERRIDE);
    const enforcementBehavior = this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR);

    // Get the actual global game settings (not actor-specific)
    const globalRuleSet = game.settings.get(MODULE.ID, SETTINGS.SPELLCASTING_RULE_SET);
    const globalEnforcementBehavior = game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR);

    const globalRuleSetLabel = game.i18n.localize(`SPELLBOOK.Settings.SpellcastingRuleSet.${globalRuleSet.charAt(0).toUpperCase() + globalRuleSet.slice(1)}`);
    const globalEnforcementBehaviorLabel = game.i18n.localize(
      `SPELLBOOK.Settings.EnforcementBehavior.${globalEnforcementBehavior.charAt(0).toUpperCase() + globalEnforcementBehavior.slice(1)}`
    );

    // For form display: null/undefined means 'global' was selected
    const ruleSetValue = ruleSetOverride || 'global';
    const enforcementValue = enforcementBehavior || 'global';

    log(3, 'Global settings - raw flags - ruleSetOverride:', ruleSetOverride, 'enforcementBehavior:', enforcementBehavior);
    log(3, 'Global settings - form values:', ruleSetValue, enforcementValue);
    log(3, 'Global game settings - ruleSet:', globalRuleSet, 'enforcement:', globalEnforcementBehavior);

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

    log(3, 'Rule set options:', ruleSetOptions);
    log(3, 'Enforcement options:', enforcementOptions);

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

    // Get the raw class rules from actor flags (this is what was actually saved)
    const currentClassRules = this.actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};

    for (const classItem of classItems) {
      const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();

      // Get the processed class rules (includes defaults and rule set applications)
      const processedClassRules = RuleSetManager.getClassRules(this.actor, identifier);

      // Get the raw saved values for this specific class
      const savedClassRules = currentClassRules[identifier] || {};

      log(3, `Class ${identifier} - processedClassRules:`, processedClassRules);
      log(3, `Class ${identifier} - savedClassRules:`, savedClassRules);

      const spellManager = new SpellManager(this.actor);
      const maxCantrips = spellManager.getMaxAllowed(identifier);
      const currentCantrips = spellManager.getCurrentCount(identifier);

      // For display purposes, use saved values if they exist, otherwise use processed defaults
      const formRules = {
        showCantrips: savedClassRules.hasOwnProperty('showCantrips') ? savedClassRules.showCantrips : processedClassRules.showCantrips,
        cantripSwapping: savedClassRules.cantripSwapping || processedClassRules.cantripSwapping || 'none',
        spellSwapping: savedClassRules.spellSwapping || processedClassRules.spellSwapping || 'none',
        ritualCasting: savedClassRules.ritualCasting || processedClassRules.ritualCasting || 'none',
        customSpellList: savedClassRules.customSpellList || processedClassRules.customSpellList || '',
        preparationBonus: savedClassRules.hasOwnProperty('preparationBonus') ? savedClassRules.preparationBonus : processedClassRules.preparationBonus || 0,
        _noScaleValue: processedClassRules._noScaleValue
      };

      log(3, `Class ${identifier} - formRules for display:`, formRules);

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
        rules: processedClassRules, // Keep processed rules for display logic
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
    log(3, `Preparing form elements for ${identifier} with rules:`, formRules);

    const showCantripsCheckbox = formElements.createCheckbox({
      name: `class.${identifier}.showCantrips`,
      checked: formRules.showCantrips,
      disabled: formRules._noScaleValue,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.ShowCantrips.Label')
    });
    showCantripsCheckbox.id = `show-cantrips-${identifier}`;

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

    log(3, `Cantrip swapping for ${identifier}: value=${cantripSwappingValue}, options:`, cantripSwappingOptions);

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

    log(3, `Custom spell list for ${identifier}: value=${customSpellListValue}`);

    const customSpellListSelect = formElements.createSelect({
      name: `class.${identifier}.customSpellList`,
      options: customSpellListOptions,
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.CustomSpellList.Label')
    });
    customSpellListSelect.id = `custom-spell-list-${identifier}`;

    const preparationBonusControls = this._createPreparationBonusControls(identifier, formRules.preparationBonus);

    return {
      showCantripsCheckboxHtml: formElements.elementToHtml(showCantripsCheckbox),
      cantripSwappingSelectHtml: formElements.elementToHtml(cantripSwappingSelect),
      spellSwappingSelectHtml: formElements.elementToHtml(spellSwappingSelect),
      ritualCastingSelectHtml: formElements.elementToHtml(ritualCastingSelect),
      customSpellListSelectHtml: formElements.elementToHtml(customSpellListSelect),
      preparationBonusControlsHtml: preparationBonusControls
    };
  }

  /**
   * Create preparation bonus controls (decrease button, input, increase button)
   * @param {string} identifier - The class identifier
   * @param {number} currentValue - The current preparation bonus value
   * @returns {string} HTML string for the preparation bonus controls
   * @private
   */
  _createPreparationBonusControls(identifier, currentValue) {
    const container = document.createElement('div');
    container.className = 'preparation-bonus-controls';

    const decreaseButton = document.createElement('button');
    decreaseButton.type = 'button';
    decreaseButton.className = 'prep-bonus-decrease';
    decreaseButton.dataset.class = identifier;
    decreaseButton.dataset.action = 'decreasePrepBonus';
    decreaseButton.textContent = '−';
    decreaseButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.Decrease'));

    const input = formElements.createNumberInput({
      name: `class.${identifier}.preparationBonus`,
      value: currentValue,
      min: -10,
      max: 20,
      cssClass: 'prep-bonus-input',
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.Label')
    });
    input.id = `preparation-bonus-${identifier}`;

    const increaseButton = document.createElement('button');
    increaseButton.type = 'button';
    increaseButton.className = 'prep-bonus-increase';
    increaseButton.dataset.class = identifier;
    increaseButton.dataset.action = 'increasePrepBonus';
    increaseButton.textContent = '+';
    increaseButton.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Settings.PreparationBonus.Increase'));

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

    return {
      submitButtonHtml: formElements.elementToHtml(submitButton)
    };
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
