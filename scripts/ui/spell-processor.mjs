/**
 * Spell Processor for SpellBook Application
 *
 * Handles processing and formatting of spell data for template rendering.
 * Extracts spell processing logic from the main SpellBook application.
 * @module UI/SpellProcessor
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { PartyMode, WizardBook } from '../managers/_module.mjs';
import * as ValidationUtils from '../validation/_module.mjs';
import * as UIUtils from './_module.mjs';

/**
 * Processes spell data for template rendering.
 */
export class SpellProcessor {
  /**
   * Create a new SpellProcessor instance.
   * @param {object} app - The parent SpellBook application
   */
  constructor(app) {
    this.app = app;
  }

  /**
   * Get the actor from the parent app.
   * @returns {object} The actor
   */
  get actor() {
    return this.app.actor;
  }

  /**
   * Process spell levels for context preparation.
   * @param {Array<object>} spellLevels - Raw spell level data
   * @returns {Promise<Array<object>>} Processed spell levels ready for template
   */
  async processSpellsByLevel(spellLevels) {
    log(3, 'Processing spell levels for context:', { spellLevels });
    const collapsedLevels = DataUtils.CollapsedStateManager.get(FLAGS.COLLAPSED_LEVELS);
    const enabledElements = this.app.enabledElements;
    const processedLevels = [];
    for (const levelData of spellLevels) {
      const level = String(levelData.level);
      const spells = levelData.spells || [];
      const isCollapsed = collapsedLevels.includes(level);
      log(3, 'Beginning spells for level processing:', { spells });
      const processedSpells = [];
      for (const spell of spells) {
        const processedSpell = await this._processSpell(spell, enabledElements);
        processedSpells.push(processedSpell);
      }
      await this.app.spellManager.applySourceClassFixes();
      log(3, 'Finishing spells for level processing:', { spells, processedSpells });
      let preparedCount = 0;
      if (level !== '0') preparedCount = spells.filter((spell) => spell.preparation?.prepared).length;
      const cantripCounter = { enabled: level === '0', current: 0, maximum: 0 };
      processedLevels.push({ level, levelName: levelData.name, spells: processedSpells, isCollapsed, preparedCount, cantripCounter });
    }
    return processedLevels;
  }

  /**
   * Process a single spell for template rendering.
   * @param {object} spell - The spell to process
   * @param {Set<string>} enabledElements - Enabled UI elements
   * @returns {Promise<object>} Processed spell data
   * @private
   */
  async _processSpell(spell, enabledElements) {
    const processedSpell = DataUtils.shallowCloneSpell(spell);
    if (!spell.compendiumUuid) spell.compendiumUuid = spell.uuid;
    const classes = ['spell-item'];
    if (spell.preparation?.prepared) classes.push('prepared-spell');
    if (this.app._state.wizardbookCache && spell.sourceClass) {
      const classSpellbook = this.app._state.wizardbookCache.get(spell.sourceClass);
      if (classSpellbook?.includes(spell.compendiumUuid)) classes.push('in-wizard-spellbook');
    }
    processedSpell.cssClasses = classes.join(' ');
    processedSpell.dataAttributes = UIUtils.getSpellDataAttributes(spell);
    if (!spell.tags) spell.tags = UIUtils.getSpellPreparationTags(spell, this.actor);
    processedSpell.tags = spell.tags;
    processedSpell.preparationCheckboxHtml = this._buildPreparationCheckbox(spell);
    if (spell.sourceClass && this.app._state.wizardbookCache) {
      const classSpellbook = this.app._state.wizardbookCache.get(spell.sourceClass);
      processedSpell.inWizardSpellbook = classSpellbook ? classSpellbook.includes(spell.compendiumUuid) : false;
    } else {
      processedSpell.inWizardSpellbook = false;
    }
    if (this.app.comparisonSpells.size < game.settings.get(MODULE.ID, SETTINGS.SPELL_COMPARISON_MAX)) {
      processedSpell.showCompareLink = true;
      processedSpell.isInComparison = this.app.comparisonSpells.has(spell.compendiumUuid);
    }
    const spellUuid = processedSpell.uuid || processedSpell.compendiumUuid;
    const comparisonIcon = this._buildComparisonIcon(processedSpell, enabledElements);
    const favoriteButton = this._buildFavoriteButton(processedSpell, enabledElements, spellUuid);
    const notesIcon = this._buildNotesIcon(processedSpell, enabledElements, spellUuid);
    const wizardAction = this._buildWizardAction(processedSpell);
    const partyIcons = this._buildPartyIcons(processedSpell);
    const formattedDetails = UIUtils.CustomUI.buildPlayerMetadata(processedSpell, enabledElements, this.actor);
    let materialComponentsTooltip = '';
    const hasMaterialComponents = processedSpell.filterData?.materialComponents?.hasConsumedMaterials === true;
    if (hasMaterialComponents && formattedDetails) {
      const lastIconIndex = formattedDetails.lastIndexOf('</i>');
      materialComponentsTooltip = lastIconIndex !== -1 ? formattedDetails.substring(lastIconIndex + 4).trim() : formattedDetails;
    }
    return {
      ...processedSpell,
      name: processedSpell.name,
      cssClasses: processedSpell.cssClasses || 'spell-item',
      comparisonIcon,
      favoriteButton,
      notesIcon,
      wizardAction,
      partyIcons,
      formattedDetails,
      materialComponentsTooltip,
      preparationCheckboxHtml: processedSpell.preparationCheckboxHtml
    };
  }

  /**
   * Build the preparation checkbox HTML for a spell.
   * @param {object} spell - The original spell
   * @returns {string} HTML string for the checkbox
   * @private
   */
  _buildPreparationCheckbox(spell) {
    const ariaLabel = spell.preparation.prepared ? game.i18n.format('SPELLBOOK.Preparation.Unprepare', { name: spell.name }) : game.i18n.format('SPELLBOOK.Preparation.Prepare', { name: spell.name });
    const checkbox = ValidationUtils.createCheckbox({ name: `spell-${spell.system.identifier}`, checked: spell.preparation.prepared, disabled: spell.preparation.disabled, ariaLabel: ariaLabel });
    checkbox.id = `prep-${spell.system.identifier}`;
    checkbox.dataset.uuid = spell.compendiumUuid;
    checkbox.dataset.name = spell.name;
    checkbox.dataset.ritual = spell.filterData?.isRitual || false;
    checkbox.dataset.wasPrepared = spell.preparation.prepared;
    let sourceClass = null;
    if (spell.system?.sourceClass) sourceClass = spell.system.sourceClass;
    else if (spell.sourceClass) sourceClass = spell.sourceClass;
    else if (spell.preparation?.preparedByOtherClass) sourceClass = spell.preparation.preparedByOtherClass;
    if (sourceClass) {
      checkbox.dataset.sourceClass = sourceClass;
    } else {
      log(3, `Checking if ${spell.name} should have source class set.`, { spell });
      const shouldHaveSourceClass = spell.preparation?.prepared && spell.system?.prepared !== 2 && !spell.flags?.dnd5e?.cachedFor;
      if (shouldHaveSourceClass) {
        const fixedSourceClass = this.app.spellManager.attemptToFixSourceClass(spell);
        if (fixedSourceClass) {
          checkbox.dataset.sourceClass = fixedSourceClass;
          if (!this.app._sourceClassFixQueue) this.app._sourceClassFixQueue = [];
          this.app._sourceClassFixQueue.push({ spellId: spell._id, spellName: spell.name, sourceClass: fixedSourceClass });
        } else {
          log(2, `No source class found for prepared spell: ${spell.name}`, {
            spell,
            preparation: spell.preparation,
            spellcastingClasses: Object.keys(this.actor.spellcastingClasses || {})
          });
        }
      }
    }
    if (spell.preparation?.preparedByOtherClass) checkbox.dataset.crossClass = 'true';
    if (spell.preparation?.disabled && spell.preparation?.disabledReason) checkbox.dataset.tooltip = game.i18n.localize(spell.preparation.disabledReason);
    return ValidationUtils.elementToHtml(checkbox);
  }

  /**
   * Build comparison icon data.
   * @param {object} processedSpell - The processed spell
   * @param {Set<string>} enabledElements - Enabled UI elements
   * @returns {object} Comparison icon configuration
   * @private
   */
  _buildComparisonIcon(processedSpell, enabledElements) {
    return {
      enabled: enabledElements.has('compare') && processedSpell.showCompareLink,
      active: processedSpell.isInComparison,
      uuid: processedSpell.compendiumUuid,
      tooltip: game.i18n.localize('SPELLBOOK.Comparison.Compare'),
      ariaLabel: game.i18n.format('SPELLBOOK.Comparison.CompareSpell', { name: processedSpell.name })
    };
  }

  /**
   * Build favorite button data.
   * @param {object} processedSpell - The processed spell
   * @param {Set<string>} enabledElements - Enabled UI elements
   * @param {string} spellUuid - The spell UUID
   * @returns {object} Favorite button configuration
   * @private
   */
  _buildFavoriteButton(processedSpell, enabledElements, spellUuid) {
    return {
      enabled: enabledElements.has('favorites') && spellUuid,
      favorited: processedSpell.favorited,
      uuid: spellUuid,
      tooltip: processedSpell.favorited ? game.i18n.localize('SPELLBOOK.UI.RemoveFromFavorites') : game.i18n.localize('SPELLBOOK.UI.AddToFavorites'),
      iconClass: processedSpell.favorited ? 'fas' : 'far'
    };
  }

  /**
   * Build notes icon data.
   * @param {object} processedSpell - The processed spell
   * @param {Set<string>} enabledElements - Enabled UI elements
   * @param {string} spellUuid - The spell UUID
   * @returns {object} Notes icon configuration
   * @private
   */
  _buildNotesIcon(processedSpell, enabledElements, spellUuid) {
    return {
      enabled: enabledElements.has('notes') && spellUuid,
      hasNotes: processedSpell.hasNotes,
      uuid: spellUuid,
      tooltip: processedSpell.hasNotes ? game.i18n.localize('SPELLBOOK.UI.HasNotes') : game.i18n.localize('SPELLBOOK.UI.AddNotes'),
      iconClass: processedSpell.hasNotes ? 'fas fa-sticky-note' : 'far fa-sticky-note'
    };
  }

  /**
   * Build wizard action data.
   * @param {object} processedSpell - The processed spell
   * @returns {object} Wizard action configuration
   * @private
   */
  _buildWizardAction(processedSpell) {
    let learningSource = null;
    let learningSourceLabel = null;
    if (processedSpell.inWizardSpellbook && processedSpell.sourceClass) {
      const wizardManager = this.app.wizardManagers.get(processedSpell.sourceClass);
      if (wizardManager) {
        const spellUuid = processedSpell.spellUuid || processedSpell.compendiumUuid;
        learningSource = wizardManager.getSpellLearningSource(spellUuid);
        learningSourceLabel = game.i18n.localize(WizardBook.getLearnedLabelKey(learningSource));
      }
    }
    return {
      isFromScroll: processedSpell.isFromScroll,
      inSpellbook: processedSpell.inWizardSpellbook,
      canLearn: processedSpell.system?.level > 0 && !processedSpell.inWizardSpellbook && !processedSpell.isFromScroll,
      uuid: processedSpell.spellUuid || processedSpell.compendiumUuid,
      scrollId: processedSpell.scrollId,
      ariaLabel: game.i18n.format('SPELLBOOK.Scrolls.LearnFromScroll', { name: processedSpell.name }),
      learningSource: learningSource,
      learningSourceLabel: learningSourceLabel
    };
  }

  /**
   * Build party icons data.
   * @param {object} processedSpell - The processed spell
   * @returns {object} Party icons configuration
   * @private
   */
  _buildPartyIcons(processedSpell) {
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    if (!isPartyMode) return { enabled: false, icons: [] };
    const partyActors = PartyMode.getPartyActors();
    const tokenLimit = game.settings.get(MODULE.ID, SETTINGS.PARTY_MODE_TOKEN_LIMIT);
    const spellUuid = processedSpell.sourceUuid || processedSpell.compendiumUuid || processedSpell.uuid;
    const icons = [];
    let iconCount = 0;
    for (const actor of partyActors) {
      if (iconCount >= tokenLimit) break;
      if (actor.id === this.actor.id) continue;
      if (PartyMode.actorHasSpell(actor, spellUuid)) {
        const associatedUser = game.users.find((user) => user.character?.id === actor.id);
        const userColor = associatedUser?.color?.css || game.user.color.css || 'transparent';
        icons.push({ src: actor.img, name: actor.name, actorId: actor.id, userColor: userColor });
        iconCount++;
      }
    }
    return { enabled: icons.length > 0, icons: icons };
  }
}
