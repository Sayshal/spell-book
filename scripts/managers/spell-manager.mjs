/**
 * Core Spell Management and Preparation System
 *
 * Manages spell preparation, validation, and related functionality for actors in the
 * Spell Book module. This class serves as the central coordination point for all
 * spell-related operations including preparation tracking, spell status determination,
 * class-specific spell management, and integration with various spell casting systems.
 *
 * Key features:
 * - Spell preparation tracking with class-specific organization
 * - Multi-class spellcaster support with individual class rule application
 * - Dynamic spell status determination based on preparation mode and source
 * - Integration with cantrip management and swap mechanics
 * - Wizard spellbook and ritual casting support
 * - Spell validation and enforcement based on class rules and limits
 * - Automatic spell item creation, updating, and cleanup on actors
 * - Backward compatibility with legacy preparation tracking systems
 * - Support for special spell modes (innate, pact, at-will, ritual, always prepared)
 * - Error handling and logging for troubleshooting
 *
 * The manager coordinates with other system components including CantripManager for
 * cantrip-specific functionality, RuleSetManager for class rule application, and
 * various UI helpers for status display and user interaction.
 *
 * @module Managers/SpellManager
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as UIHelpers from '../ui/_module.mjs';
import { CantripManager, RuleSetManager } from './_module.mjs';

/**
 * Spell preparation status information for UI display and validation.
 *
 * @typedef {Object} SpellPreparationStatus
 * @property {boolean} prepared - Whether the spell is currently prepared
 * @property {boolean} isOwned - Whether the spell exists as an item on the actor
 * @property {string|null} preparationMode - The spell's preparation mode ('spell', 'pact', 'innate', etc.)
 * @property {boolean} disabled - Whether the preparation checkbox should be disabled
 * @property {boolean} alwaysPrepared - Whether the spell is always prepared (preparation mode 2)
 * @property {Object|null} sourceItem - Information about the item granting this spell
 * @property {boolean} isGranted - Whether the spell is granted by another item/feature
 * @property {string} localizedPreparationMode - Localized display name for preparation mode
 * @property {boolean} isCantripLocked - Whether cantrip is locked due to limits (cantrips only)
 * @property {string} [disabledReason] - Localization key for why preparation is disabled
 * @property {string} [cantripLockReason] - Localization key for cantrip lock reason
 */

/**
 * Actor spell settings configuration for a specific class.
 *
 * @typedef {Object} ActorSpellSettings
 * @property {string} cantripSwapping - When cantrips can be swapped ('none', 'levelUp', 'longRest')
 * @property {string} spellSwapping - When spells can be swapped ('none', 'levelUp', 'longRest')
 * @property {string} ritualCasting - Ritual casting restrictions ('none', 'prepared', 'always')
 * @property {boolean} showCantrips - Whether to display cantrips for this class
 * @property {string} behavior - Enforcement behavior ('enforced', 'unenforced', 'notifyGM')
 */

/**
 * Spell information for class-specific preparation tracking.
 *
 * @typedef {Object} SpellInfo
 * @property {string} uuid - Spell document UUID
 * @property {boolean} isPrepared - Whether the spell should be prepared
 * @property {boolean} wasPrepared - Whether the spell was previously prepared
 * @property {number} spellLevel - Spell level (0 for cantrips)
 * @property {string} [preparationMode] - Preparation mode for this spell
 * @property {string} [name] - Spell name for tracking and logging
 */

/**
 * Class spell key parsing result.
 *
 * @typedef {Object} ClassSpellKeyParsed
 * @property {string} classIdentifier - The class identifier portion
 * @property {string} spellUuid - The spell UUID portion
 */

/**
 * Spell source information for tracking spell origins.
 *
 * @typedef {Object} SpellSourceInfo
 * @property {string} name - Name of the source item/feature
 * @property {string} type - Type of source ('class', 'subclass', 'feat', etc.)
 * @property {string} [id] - Item ID of the source (if applicable)
 */

/**
 * Spell change validation result.
 *
 * @typedef {Object} SpellChangeValidation
 * @property {boolean} allowed - Whether the spell change is allowed
 * @property {string} [message] - Localization key for error message if not allowed
 */

/**
 * Cantrip change tracking for notifications.
 *
 * @typedef {Object} CantripChangeTracking
 * @property {string[]} added - Names of cantrips that were added
 * @property {string[]} removed - Names of cantrips that were removed
 * @property {boolean} hasChanges - Whether any cantrip changes occurred
 */

/**
 * Class spell save result containing change information.
 *
 * @typedef {Object} ClassSpellSaveResult
 * @property {CantripChangeTracking} cantripChanges - Information about cantrip changes
 */

/**
 * Spell Manager - Core spell preparation and management system.
 *
 * This class provides spell management functionality for actors,
 * handling preparation tracking, validation, spell item management, and integration
 * with various spellcasting systems. It coordinates with other managers to provide
 * a complete spellcasting experience while maintaining data integrity and proper
 * rule enforcement.
 *
 * The manager supports complex scenarios including multiclass characters, wizard
 * spellbooks, ritual casting, and various special spell modes while providing
 * appropriate validation and user feedback for all spell management operations.
 */
export class SpellManager {
  /**
   * Create a new SpellManager for an actor.
   *
   * Initializes the spell manager with the specified actor and sets up integration
   * with the cantrip management system. Determines if the actor is a wizard for
   * specialized wizard functionality and prepares caching systems for optimal
   * performance.
   *
   * @param {Actor5e} actor - The actor to manage spells for
   */
  constructor(actor) {
    /** @type {Actor5e} The actor being managed */
    this.actor = actor;

    /** @type {boolean} Whether this actor has wizard levels */
    this.isWizard = DataHelpers.isWizard(actor);

    /** @type {Object|null} Cached wizard spellbook data */
    this._wizardSpellbookCache = null;

    /** @type {Object|null} Wizard-specific manager instance */
    this._wizardManager = null;

    /** @type {CantripManager} Integrated cantrip management system */
    this.cantripManager = new CantripManager(actor, this);
  }

  /**
   * Get cantrip and spell settings for the actor.
   *
   * Retrieves the spell configuration settings for the specified class, including
   * swap timing, ritual casting rules, display preferences, and enforcement behavior.
   * If no class identifier is provided, returns default fallback settings.
   *
   * @param {string} classIdentifier - Class identifier for class-specific rules (required)
   * @returns {ActorSpellSettings} Actor's spell settings
   */
  getSettings(classIdentifier) {
    const behavior = this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM;
    if (!classIdentifier) {
      return {
        cantripSwapping: 'none',
        spellSwapping: 'none',
        ritualCasting: 'none',
        showCantrips: true,
        behavior: behavior
      };
    }
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    return {
      cantripSwapping: classRules.cantripSwapping || 'none',
      spellSwapping: classRules.spellSwapping || 'none',
      ritualCasting: classRules.ritualCasting || 'none',
      showCantrips: classRules.showCantrips !== false,
      behavior: behavior
    };
  }

  /**
   * Get maximum allowed cantrips for the actor using cached values.
   *
   * Delegates to the cantrip manager to retrieve the maximum number of cantrips
   * allowed for the specified class. Uses cached calculations for optimal performance.
   *
   * @param {string} classIdentifier - The class identifier to check
   * @returns {number} Maximum allowed cantrips for this class
   */
  getMaxAllowed(classIdentifier) {
    if (!classIdentifier) return 0;
    return this.cantripManager._getMaxCantripsForClass(classIdentifier);
  }

  /**
   * Get the current count of prepared cantrips for a specific class.
   *
   * Delegates to the cantrip manager to count currently prepared cantrips for
   * the specified class. Used for limit validation and UI display.
   *
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Currently prepared cantrips count for this class
   */
  getCurrentCount(classIdentifier) {
    if (!classIdentifier) return 0;
    return this.cantripManager.getCurrentCount(classIdentifier);
  }

  /**
   * Get the preparation status for a given spell.
   *
   * Performs analysis of a spell's preparation status including
   * whether it's prepared, owned by the actor, its preparation mode, disability
   * status, and source information. Now supports preparation context to allow
   * same spell with multiple preparation methods.
   *
   * @param {Object} spell - The spell to check
   * @param {string} [classIdentifier=null] - The specific class context
   * @returns {SpellPreparationStatus} Preparation status information
   */
  getSpellPreparationStatus(spell, classIdentifier = null) {
    const defaultStatus = {
      prepared: false,
      isOwned: false,
      preparationMode: null,
      disabled: false,
      alwaysPrepared: false,
      sourceItem: null,
      isGranted: false,
      localizedPreparationMode: '',
      isCantripLocked: false
    };
    if (!classIdentifier) classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    const spellUuid = spell.compendiumUuid || spell.uuid;
    const isPreparableContext = spell._preparationContext === 'preparable';
    if (isPreparableContext) {
      const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
      const classPreparedSpells = preparedByClass[classIdentifier] || [];
      const spellKey = this._createClassSpellKey(spellUuid, classIdentifier);
      let isPreparedForClass = classPreparedSpells.includes(spellKey);
      if (!isPreparedForClass) {
        const actualPreparedSpell = this.actor.items.find(
          (i) =>
            i.type === 'spell' &&
            (i.flags?.core?.sourceId === spellUuid || i.uuid === spellUuid) &&
            (i.system.sourceClass === classIdentifier || i.sourceClass === classIdentifier) &&
            i.system.prepared === 1 &&
            i.system.method !== 'ritual'
        );
        if (actualPreparedSpell) isPreparedForClass = true;
      }
      for (const [otherClass, preparedSpells] of Object.entries(preparedByClass)) {
        if (otherClass === classIdentifier) continue;
        const otherClassKey = `${otherClass}:${spellUuid}`;
        if (preparedSpells.includes(otherClassKey)) {
          const spellcastingData = this.actor.spellcastingClasses?.[otherClass];
          const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
          return {
            prepared: false,
            isOwned: false,
            preparationMode: 'spell',
            localizedPreparationMode: game.i18n.localize('SPELLBOOK.Preparation.Prepared'),
            disabled: false,
            disabledReason: game.i18n.format('SPELLBOOK.Preparation.PreparedByOtherClass', { class: classItem?.name || otherClass }),
            alwaysPrepared: false,
            isGranted: false,
            sourceItem: null,
            isCantripLocked: false,
            preparedByOtherClass: otherClass
          };
        }
      }
      defaultStatus.prepared = isPreparedForClass;
      if (spell.system?.level === 0 && classIdentifier) {
        const maxCantrips = this.cantripManager._getMaxCantripsForClass(classIdentifier);
        const currentCount = this.cantripManager.getCurrentCount(classIdentifier);
        const isAtMax = currentCount >= maxCantrips;
        if (isAtMax && !isPreparedForClass) {
          const settings = this.getSettings(classIdentifier);
          const { behavior } = settings;
          defaultStatus.isCantripLocked = behavior === MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED;
          defaultStatus.cantripLockReason = 'SPELLBOOK.Cantrips.MaximumReached';
        }
      }
      return defaultStatus;
    }
    let actualSpell = this.actor.items.find(
      (item) =>
        item.type === 'spell' &&
        (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) &&
        (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier) &&
        item.system.prepared === 1 &&
        item.system.method !== 'ritual'
    );
    if (!actualSpell) {
      actualSpell = this.actor.items.find(
        (item) =>
          item.type === 'spell' && (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) && (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier)
      );
    }
    if (actualSpell) return this._getOwnedSpellPreparationStatus(actualSpell);
    const unassignedSpell = this.actor.items.find(
      (item) => item.type === 'spell' && (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) && !item.system?.sourceClass && !item.sourceClass
    );
    if (unassignedSpell && classIdentifier) {
      const isAlwaysPrepared = unassignedSpell.system.prepared === 2;
      const isGranted = !!unassignedSpell.flags?.dnd5e?.cachedFor;
      const isSpecialMode = ['innate', 'pact', 'atwill', 'ritual'].includes(unassignedSpell.system.method);
      if (!isAlwaysPrepared && !isGranted && !isSpecialMode) {
        unassignedSpell.sourceClass = classIdentifier;
        if (unassignedSpell.system) unassignedSpell.system.sourceClass = classIdentifier;
      }
      return this._getOwnedSpellPreparationStatus(unassignedSpell);
    }
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    for (const [otherClass, preparedSpells] of Object.entries(preparedByClass)) {
      if (otherClass === classIdentifier) continue;
      const otherClassKey = `${otherClass}:${spellUuid}`;
      if (preparedSpells.includes(otherClassKey)) {
        const spellcastingData = this.actor.spellcastingClasses?.[otherClass];
        const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
        return {
          prepared: true,
          isOwned: false,
          preparationMode: 'spell',
          localizedPreparationMode: game.i18n.localize('SPELLBOOK.Preparation.Prepared'),
          disabled: true,
          disabledReason: game.i18n.format('SPELLBOOK.Preparation.PreparedByOtherClass', { class: classItem?.name || otherClass }),
          alwaysPrepared: false,
          isGranted: false,
          sourceItem: null,
          isCantripLocked: false
        };
      }
    }
    const specialSpell = this.actor.items.find((item) => item.type === 'spell' && (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid));
    if (specialSpell) {
      if (specialSpell.system.prepared === 2) {
        const sourceClass = specialSpell.system?.sourceClass || specialSpell.sourceClass;
        const spellcastingData = sourceClass ? this.actor.spellcastingClasses?.[sourceClass] : null;
        const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
        return {
          prepared: true,
          isOwned: false,
          preparationMode: 'always',
          disabled: true,
          alwaysPrepared: true,
          disabledReason: game.i18n.format('SPELLBOOK.Preparation.AlwaysPreparedByClass', { class: classItem?.name || sourceClass || 'Feature' }),
          localizedPreparationMode: game.i18n.localize('SPELLBOOK.Preparation.Always'),
          sourceItem: this._determineSpellSource(specialSpell),
          isGranted: false,
          isCantripLocked: false
        };
      }
      if (specialSpell.flags?.dnd5e?.cachedFor) {
        const grantingItem = this.actor.items.get(specialSpell.flags.dnd5e.cachedFor);
        return {
          prepared: true,
          isOwned: false,
          preparationMode: 'granted',
          disabled: true,
          isGranted: true,
          disabledReason: game.i18n.format('SPELLBOOK.SpellSource.GrantedByItem', { item: grantingItem?.name || 'Feature' }),
          localizedPreparationMode: game.i18n.localize('SPELLBOOK.SpellSource.Granted'),
          sourceItem: grantingItem,
          alwaysPrepared: false,
          isCantripLocked: false
        };
      }
      const specialModes = ['innate', 'pact', 'atwill', 'ritual'];
      if (specialModes.includes(specialSpell.system.method)) {
        const sourceClass = specialSpell.system?.sourceClass || specialSpell.sourceClass;
        const spellcastingData = sourceClass ? this.actor.spellcastingClasses?.[sourceClass] : null;
        const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
        const localizedMode = UIHelpers.getLocalizedPreparationMode(specialSpell.system.method);
        return {
          prepared: true,
          isOwned: false,
          preparationMode: specialSpell.system.method,
          disabled: true,
          disabledReason: game.i18n.format('SPELLBOOK.Preparation.SpecialModeByClass', { mode: localizedMode, class: classItem?.name || sourceClass || classIdentifier }),
          localizedPreparationMode: localizedMode,
          alwaysPrepared: false,
          isGranted: false,
          sourceItem: this._determineSpellSource(specialSpell),
          isCantripLocked: false
        };
      }
    }
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    const spellKey = this._createClassSpellKey(spellUuid, classIdentifier);
    const isPreparedForClass = classPreparedSpells.includes(spellKey);
    defaultStatus.prepared = isPreparedForClass;
    if (spell.system?.level === 0 && classIdentifier) {
      const maxCantrips = this.cantripManager._getMaxCantripsForClass(classIdentifier);
      const currentCount = this.cantripManager.getCurrentCount(classIdentifier);
      const isAtMax = currentCount >= maxCantrips;
      if (isAtMax && !isPreparedForClass) {
        const settings = this.getSettings(classIdentifier);
        const { behavior } = settings;
        defaultStatus.isCantripLocked = behavior === MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED;
        defaultStatus.cantripLockReason = 'SPELLBOOK.Cantrips.MaximumReached';
      }
    }
    return defaultStatus;
  }

  /**
   * Create a unique key for class-spell combinations.
   *
   * Generates a standardized key format for tracking spell preparation by class.
   * This key format enables efficient lookup and management of class-specific
   * spell preparations in the actor flag system.
   *
   * @param {string} spellUuid - The spell UUID
   * @param {string} classIdentifier - The class identifier
   * @returns {string} Unique key for this class-spell combination
   */
  _createClassSpellKey(spellUuid, classIdentifier) {
    return `${classIdentifier}:${spellUuid}`;
  }

  /**
   * Parse a class-spell key back into components.
   *
   * Splits a class-spell key created by _createClassSpellKey back into its
   * component parts. Handles UUIDs that may contain colons by only splitting
   * on the first colon to separate the class identifier.
   *
   * @param {string} key - The class-spell key
   * @returns {ClassSpellKeyParsed} Object with classIdentifier and spellUuid
   */
  _parseClassSpellKey(key) {
    const [classIdentifier, ...uuidParts] = key.split(':');
    return { classIdentifier, spellUuid: uuidParts.join(':') };
  }

  /**
   * Get preparation status for a spell that's owned by the actor.
   *
   * Analyzes an actor-owned spell item to determine its preparation status,
   * including preparation mode, disability reasons, source information, and
   * localized display strings. Handles all special preparation modes and
   * provides status information for UI display.
   *
   * @private
   * @param {Item5e} spell - The spell item
   * @returns {SpellPreparationStatus} Preparation status information
   */
  _getOwnedSpellPreparationStatus(spell) {
    const preparationMode = spell.system.method;
    const alwaysPrepared = spell.system.prepared === 2;
    const isInnateCasting = preparationMode === 'innate';
    const isAtWill = preparationMode === 'atwill';
    const localizedPreparationMode = UIHelpers.getLocalizedPreparationMode(preparationMode);
    const sourceInfo = this._determineSpellSource(spell);
    const isGranted = !!sourceInfo && !!spell.flags?.dnd5e?.cachedFor;
    const actuallyPrepared = !!(isGranted || alwaysPrepared || isInnateCasting || isAtWill || spell.system.prepared === 1);
    let isDisabled = isGranted || alwaysPrepared || isInnateCasting || isAtWill;
    let disabledReason = '';
    if (isGranted) disabledReason = 'SPELLBOOK.SpellSource.GrantedTooltip';
    else if (alwaysPrepared) disabledReason = 'SPELLBOOK.Preparation.AlwaysTooltip';
    else if (isInnateCasting) disabledReason = 'SPELLBOOK.Preparation.InnateTooltip';
    else if (isAtWill) disabledReason = 'SPELLBOOK.Preparation.AtWillTooltip';
    const result = {
      prepared: actuallyPrepared,
      isOwned: true,
      preparationMode: preparationMode,
      localizedPreparationMode: localizedPreparationMode,
      disabled: !!isDisabled,
      disabledReason: disabledReason,
      alwaysPrepared: !!alwaysPrepared,
      sourceItem: sourceInfo,
      isGranted: !!isGranted,
      isCantripLocked: false,
      cantripLockReason: ''
    };
    return result;
  }

  /**
   * Determine the source of a spell on the actor.
   *
   * Analyzes a spell item to determine what feature, class, or item granted it
   * to the actor. Checks various flag sources including advancement origins,
   * cached grants, and class associations to provide source
   * information for display and management purposes.
   *
   * @private
   * @param {Item5e} spell - The spell item
   * @returns {SpellSourceInfo|null} Source information for the spell
   */
  _determineSpellSource(spell) {
    const advancementOrigin = spell.flags?.dnd5e?.advancementOrigin;
    if (advancementOrigin) {
      const sourceItemId = advancementOrigin.split('.')[0];
      const sourceItem = this.actor.items.get(sourceItemId);
      if (sourceItem) return { name: sourceItem.name, type: sourceItem.type, id: sourceItem.id };
    }
    const cachedFor = spell.flags?.dnd5e?.cachedFor;
    if (cachedFor && typeof cachedFor === 'string') {
      const pathParts = cachedFor.split('.');
      if (pathParts.length >= 3 && pathParts[1] === 'Item') {
        const itemId = pathParts[2];
        const item = this.actor.items.get(itemId);
        if (item) return { name: item.name, type: item.type, id: item.id };
      }
      const activity = fromUuidSync(cachedFor, { relative: this.actor });
      const item = activity?.item;
      if (item) return { name: item.name, type: item.type, id: item.id };
    }
    const preparationMode = spell.system.method;
    const sourceClassId = spell.system?.sourceClass || spell.sourceClass;
    if (preparationMode === 'always') {
      if (sourceClassId && this.actor.spellcastingClasses?.[sourceClassId]) {
        const spellcastingSource = DataHelpers.getSpellcastingSourceItem(this.actor, sourceClassId);
        if (spellcastingSource && spellcastingSource.type === 'subclass') return { name: spellcastingSource.name, type: 'subclass', id: spellcastingSource.id };
      }
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) return { name: subclass.name, type: 'subclass', id: subclass.id };
    } else if (preparationMode === 'pact') {
      if (sourceClassId && this.actor.spellcastingClasses?.[sourceClassId]) {
        const spellcastingSource = DataHelpers.getSpellcastingSourceItem(this.actor, sourceClassId);
        if (spellcastingSource && spellcastingSource.type === 'subclass') return { name: spellcastingSource.name, type: 'subclass', id: spellcastingSource.id };
      }
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) return { name: subclass.name, type: 'subclass', id: subclass.id };
      return { name: game.i18n.localize('SPELLBOOK.SpellSource.PactMagic'), type: 'class' };
    } else {
      if (sourceClassId && this.actor.spellcastingClasses?.[sourceClassId]) {
        const spellcastingSource = DataHelpers.getSpellcastingSourceItem(this.actor, sourceClassId);
        if (spellcastingSource) return { name: spellcastingSource.name, type: spellcastingSource.type, id: spellcastingSource.id };
      }
      const classItem = this.actor.items.find((i) => i.type === 'class');
      if (classItem) return { name: classItem.name, type: 'class', id: classItem.id };
    }
    return null;
  }

  /**
   * Save prepared spells for a specific class.
   *
   * Processes spell preparation changes for a specific class, handling spell
   * creation, updates, and removal as needed. Manages the preparation tracking
   * flags and maintains synchronization between the UI state and actor data.
   * Returns information about cantrip and spell changes for notification purposes.
   *
   * @param {string} classIdentifier - The class identifier
   * @param {Object<string, SpellInfo>} classSpellData - Object with spell data keyed by classSpellKey
   * @returns {Promise<ClassSpellSaveResult|null>} Result object with cantrip and spell changes
   */
  async saveClassSpecificPreparedSpells(classIdentifier, classSpellData) {
    if (!classIdentifier || !classSpellData) return null;
    const spellsToCreate = [];
    const spellsToUpdate = [];
    const spellIdsToRemove = [];
    const preparedSpellKeys = [];
    const defaultPreparationMode = this._getClassPreparationMode(classIdentifier);
    const cantripChanges = { added: [], removed: [], hasChanges: false };
    const spellChanges = { added: [], removed: [], hasChanges: false };
    for (const [classSpellKey, spellInfo] of Object.entries(classSpellData)) {
      const { uuid, isPrepared, wasPrepared, spellLevel, preparationMode, name, isRitual } = spellInfo;
      if (spellLevel === 0) {
        if (isPrepared && !wasPrepared) {
          cantripChanges.added.push(name);
          cantripChanges.hasChanges = true;
        } else if (!isPrepared && wasPrepared) {
          cantripChanges.removed.push(name);
          cantripChanges.hasChanges = true;
        }
      } else if (spellLevel > 0) {
        if (isPrepared && !wasPrepared) {
          spellChanges.added.push(name);
          spellChanges.hasChanges = true;
        } else if (!isPrepared && wasPrepared) {
          spellChanges.removed.push(name);
          spellChanges.hasChanges = true;
        }
      }
      let actualPreparationMode = 'spell';
      if (spellLevel > 0) actualPreparationMode = preparationMode || defaultPreparationMode;
      if (isPrepared) {
        preparedSpellKeys.push(classSpellKey);
        await this._ensureSpellOnActor(uuid, classIdentifier, actualPreparationMode, spellsToCreate, spellsToUpdate);
        if (isRitual) {
          const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
          if (classRules.ritualCasting === 'always' || classRules.ritualCasting === 'prepared') await this._ensureRitualSpellOnActor(uuid, classIdentifier, spellsToCreate, spellsToUpdate);
        }
      } else if (wasPrepared) {
        await this._handleUnpreparingSpell(uuid, classIdentifier, spellIdsToRemove, spellsToUpdate);
        if (isRitual) {
          const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
          if (classRules.ritualCasting === 'always') await this._ensureRitualSpellOnActor(uuid, classIdentifier, spellsToCreate, spellsToUpdate);
        }
      } else if (isRitual) {
        const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
        if (classRules.ritualCasting === 'always') await this._ensureRitualSpellOnActor(uuid, classIdentifier, spellsToCreate, spellsToUpdate);
      }
    }
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    if (Array.isArray(preparedByClass)) {
      const newPreparedByClass = {};
      newPreparedByClass[classIdentifier] = preparedSpellKeys;
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, newPreparedByClass);
    } else {
      preparedByClass[classIdentifier] = preparedSpellKeys;
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
    }
    if (spellsToCreate.length > 0) await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
    if (spellsToUpdate.length > 0) await this.actor.updateEmbeddedDocuments('Item', spellsToUpdate);
    if (spellIdsToRemove.length > 0) await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    await this._updateGlobalPreparedSpellsFlag();
    await this._cleanupUnpreparedSpells();
    return { cantripChanges, spellChanges };
  }

  /**
   * Clean up ritual spells created by the module for a specific class.
   *
   * Removes module-created ritual spells for the specified class that are
   * no longer needed. This cleanup prevents accumulation of unused ritual
   * spell items when changing spell preparations or class configurations.
   *
   * @private
   * @param {string} classIdentifier - The class identifier
   * @param {string[]} spellIdsToRemove - Array to add removal IDs to
   * @returns {Promise<void>}
   */
  async _cleanupModuleRitualSpells(classIdentifier, spellIdsToRemove) {
    const moduleRitualSpells = this.actor.items.filter(
      (item) =>
        item.type === 'spell' &&
        item.system?.method === 'ritual' &&
        (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier) &&
        item.flags?.[MODULE.ID]?.isModuleRitual === true
    );
    if (moduleRitualSpells.length > 0) {
      log(2, `Cleaning up ${moduleRitualSpells.length} module-created ritual spells for ${classIdentifier}`);
      moduleRitualSpells.forEach((spell) => {
        spellIdsToRemove.push(spell.id);
        log(3, `  - Marking for removal: ${spell.name}`);
      });
    }
  }

  /**
   * Ensure a ritual spell exists on the actor in ritual mode.
   *
   * Creates or updates a spell to be in ritual casting mode for the specified
   * class. This enables ritual casting functionality while maintaining proper
   * spell tracking and source attribution.
   *
   * @private
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {Object[]} spellsToCreate - Array to add creation data to
   * @param {Object[]} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   */
  async _ensureRitualSpellOnActor(uuid, sourceClass, spellsToCreate, spellsToUpdate) {
    const existingRitualSpell = this.actor.items.find(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass) && i.system?.method === 'ritual'
    );
    if (existingRitualSpell) return;
    const sourceSpell = await fromUuid(uuid);
    if (sourceSpell) {
      const newSpellData = sourceSpell.toObject();
      newSpellData.system.method = 'ritual';
      newSpellData.system.prepared = 0;
      newSpellData.flags = newSpellData.flags || {};
      newSpellData.flags.core = newSpellData.flags.core || {};
      newSpellData.flags.core.sourceId = uuid;
      newSpellData.system.sourceClass = sourceClass;
      newSpellData.flags[MODULE.ID] = newSpellData.flags[MODULE.ID] || {};
      newSpellData.flags[MODULE.ID].isModuleRitual = true;
      spellsToCreate.push(newSpellData);
    } else {
      log(1, 'ERROR: Could not load source spell for ritual creation', { uuid: uuid, sourceClass: sourceClass });
    }
  }

  /**
   * Get the preparation mode for a specific class.
   *
   * Determines the appropriate preparation mode for spells of the specified
   * class based on the class's spellcasting configuration. Returns 'pact'
   * for pact magic classes and 'spell' for standard spellcasters.
   *
   * @private
   * @param {string} classIdentifier - The class identifier
   * @returns {string} The preparation mode ('spell', 'pact', etc.)
   */
  _getClassPreparationMode(classIdentifier) {
    const spellcastingConfig = DataHelpers.getSpellcastingConfigForClass(this.actor, classIdentifier);
    if (spellcastingConfig?.type === 'pact') return 'pact';
    return 'spell';
  }

  /**
   * Ensure a spell exists on the actor with proper class attribution.
   *
   * Creates or updates a spell item on the actor with the specified preparation
   * mode and class association. Handles existing spells that need updates and
   * creates new spells as needed. Maintains proper source attribution and
   * preparation state consistency.
   *
   * @private
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {string} preparationMode - Preparation mode for this class
   * @param {Object[]} spellsToCreate - Array to add creation data to
   * @param {Object[]} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   */
  async _ensureSpellOnActor(uuid, sourceClass, preparationMode, spellsToCreate, spellsToUpdate) {
    const allMatchingSpells = this.actor.items.filter((i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid));
    for (const spell of allMatchingSpells) {
      const spellSourceClass = spell.system?.sourceClass || spell.sourceClass;
      if (spellSourceClass && spellSourceClass !== sourceClass) continue;
      const isAlwaysPrepared = spell.system.prepared === 2;
      const isGranted = !!spell.flags?.dnd5e?.cachedFor;
      const isSpecialMode = ['innate', 'atwill'].includes(spell.system.method);
      if (isAlwaysPrepared || isGranted || isSpecialMode) return;
    }
    const matchingSpells = allMatchingSpells.filter((i) => i.system.sourceClass === sourceClass || i.sourceClass === sourceClass);
    const existingPreparedSpell = matchingSpells.find((spell) => spell.system.method !== 'ritual' && spell.system.prepared === 1);
    const existingRitualSpell = matchingSpells.find((spell) => spell.system.method === 'ritual');
    const classRules = RuleSetManager.getClassRules(this.actor, sourceClass);
    const isAlwaysRitualCasting = classRules.ritualCasting === 'always';
    if (existingPreparedSpell) {
      if (existingPreparedSpell.system.method !== preparationMode || existingPreparedSpell.system.prepared !== 1 || existingPreparedSpell.system.sourceClass !== sourceClass) {
        const updateData = { _id: existingPreparedSpell.id, 'system.method': preparationMode, 'system.prepared': 1 };
        if (existingPreparedSpell.system.sourceClass !== sourceClass) updateData['system.sourceClass'] = sourceClass;
        spellsToUpdate.push(updateData);
      }
      return;
    }
    if (existingRitualSpell && isAlwaysRitualCasting && preparationMode === 'spell') {
      const sourceSpell = await fromUuid(uuid);
      if (sourceSpell) {
        const newSpellData = sourceSpell.toObject();
        newSpellData.system.method = preparationMode;
        newSpellData.system.prepared = 1;
        newSpellData.flags = newSpellData.flags || {};
        newSpellData.flags.core = newSpellData.flags.core || {};
        newSpellData.flags.core.sourceId = uuid;
        newSpellData.system.sourceClass = sourceClass;
        spellsToCreate.push(newSpellData);
      }
      return;
    }
    const unassignedSpell = allMatchingSpells.find((spell) => !spell.system?.sourceClass && !spell.sourceClass);
    const existingSpell = unassignedSpell || matchingSpells[0];
    if (existingSpell) {
      const updateData = { _id: existingSpell.id, 'system.method': preparationMode, 'system.prepared': 1 };
      if (existingSpell.system.sourceClass !== sourceClass) updateData['system.sourceClass'] = sourceClass;
      spellsToUpdate.push(updateData);
      return;
    }
    const sourceSpell = await fromUuid(uuid);
    if (sourceSpell) {
      const newSpellData = sourceSpell.toObject();
      newSpellData.system.method = preparationMode;
      newSpellData.system.prepared = 1;
      newSpellData.flags = newSpellData.flags || {};
      newSpellData.flags.core = newSpellData.flags.core || {};
      newSpellData.flags.core.sourceId = uuid;
      newSpellData.system.sourceClass = sourceClass;
      spellsToCreate.push(newSpellData);
    }
  }

  /**
   * Update the global prepared spells flag for backward compatibility.
   *
   * Maintains the legacy global prepared spells flag by aggregating all
   * class-specific preparations into a single list. This ensures compatibility
   * with older code and provides a unified view of all prepared spells.
   *
   * @private
   * @returns {Promise<void>}
   */
  async _updateGlobalPreparedSpellsFlag() {
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const allPreparedKeys = Object.values(preparedByClass).flat();
    const allPreparedUuids = allPreparedKeys.map((key) => {
      const parsed = this._parseClassSpellKey(key);
      return parsed.spellUuid;
    });
    await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
  }

  /**
   * Handle unpreparing a spell for a specific class.
   *
   * Manages the removal or mode change of spells when they are unprepared.
   * Handles special cases like ritual spells for classes with ritual casting
   * and ensures proper cleanup of spell items while preserving ritual versions.
   *
   * @private
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {string[]} spellIdsToRemove - Array to add removal IDs to
   * @param {Object[]} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   */
  async _handleUnpreparingSpell(uuid, sourceClass, spellIdsToRemove, spellsToUpdate) {
    const matchingSpells = this.actor.items.filter(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );
    if (matchingSpells.length === 0) return;
    let targetSpell = matchingSpells.find((spell) => spell.system.prepared === 1 && spell.system.method !== 'ritual');
    if (!targetSpell) targetSpell = matchingSpells.find((spell) => spell.system.prepared === 1);
    if (!targetSpell) return;
    const isAlwaysPrepared = targetSpell.system.prepared === 2;
    const isGranted = !!targetSpell.flags?.dnd5e?.cachedFor;
    const isFromClassFeature = targetSpell.system.prepared === 2;
    if (isAlwaysPrepared || isGranted || isFromClassFeature) return;
    const isRitualSpell = this._isRitualSpell(targetSpell);
    const classRules = RuleSetManager.getClassRules(this.actor, sourceClass);
    const ritualCastingEnabled = classRules.ritualCasting === 'always';
    const existingRitualSpell = matchingSpells.find((spell) => spell.system?.method === 'ritual' && spell.id !== targetSpell.id);
    if (isRitualSpell && ritualCastingEnabled && targetSpell.system.level > 0) {
      if (targetSpell.system.method === 'ritual') {
        return;
      } else if (existingRitualSpell) {
        spellIdsToRemove.push(targetSpell.id);
        return;
      } else {
        spellIdsToRemove.push(targetSpell.id);
        return;
      }
    }
    spellIdsToRemove.push(targetSpell.id);
  }

  /**
   * Check if a spell can be cast as a ritual.
   * Uses the same logic as other parts of the system.
   *
   * @param {Object} spell - The spell item
   * @returns {boolean} Whether the spell has ritual capability
   * @private
   */
  _isRitualSpell(spell) {
    if (spell.system?.properties && spell.system.properties.has) return spell.system.properties.has('ritual');
    if (spell.system?.properties && Array.isArray(spell.system.properties)) return spell.system.properties.some((prop) => prop.value === 'ritual');
    return spell.system?.components?.ritual || false;
  }

  /**
   * Clean up cantrip entries from class-specific prepared spells.
   *
   * Removes cantrip entries from the prepared spells tracking for the specified
   * class. This is used when cantrip preparation should be handled separately
   * from regular spell preparation or during cleanup operations.
   *
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async cleanupCantripsForClass(classIdentifier) {
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    if (!preparedByClass[classIdentifier]) return;
    const cleanedSpells = [];
    for (const classSpellKey of preparedByClass[classIdentifier]) {
      const parsed = this._parseClassSpellKey(classSpellKey);
      try {
        const spell = await fromUuid(parsed.spellUuid);
        if (spell && spell.system.level !== 0) cleanedSpells.push(classSpellKey);
      } catch (error) {
        log(1, 'Error', error);
        cleanedSpells.push(classSpellKey);
      }
    }
    if (cleanedSpells.length !== preparedByClass[classIdentifier].length) {
      preparedByClass[classIdentifier] = cleanedSpells;
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
      await this._updateGlobalPreparedSpellsFlag();
    }
  }

  /**
   * Clean up stale preparation flags that don't correspond to actual spells.
   *
   * Removes preparation tracking entries for spells that no longer exist on
   * the actor or are no longer associated with their tracked classes. This
   * maintenance operation ensures data integrity and prevents accumulation
   * of obsolete tracking data.
   *
   * @returns {Promise<void>}
   */
  async cleanupStalePreparationFlags() {
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    let hasChanges = false;
    for (const [classIdentifier, spellKeys] of Object.entries(preparedByClass)) {
      const cleanedKeys = [];
      for (const spellKey of spellKeys) {
        const parsed = this._parseClassSpellKey(spellKey);
        const actualSpell = this.actor.items.find(
          (item) =>
            item.type === 'spell' &&
            (item.flags?.core?.sourceId === parsed.spellUuid || item.uuid === parsed.spellUuid) &&
            (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier)
        );
        if (actualSpell) cleanedKeys.push(spellKey);
        else hasChanges = true;
      }
      preparedByClass[classIdentifier] = cleanedKeys;
    }
    if (hasChanges) {
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
      await this._updateGlobalPreparedSpellsFlag();
      log(2, 'Cleaned up stale preparation flags');
    }
  }

  /**
   * Determine if a spell can be changed based on class rules and current state.
   *
   * Validates whether a spell preparation change is allowed based on class
   * rules, enforcement settings, current limits, and context (level-up, long rest).
   * Provides appropriate user feedback for limit violations and rule restrictions.
   *
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} wasPrepared - Whether the spell was previously prepared
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {string} classIdentifier - The class identifier
   * @param {number} currentPrepared - Current number of prepared spells for this class
   * @param {number} maxPrepared - Maximum allowed prepared spells for this class
   * @returns {SpellChangeValidation} Status object with allowed and message properties
   */
  canChangeSpellStatus(spell, isChecked, wasPrepared, isLevelUp, isLongRest, classIdentifier, currentPrepared, maxPrepared) {
    if (spell.system.level === 0) return { allowed: true };
    if (!classIdentifier) classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    if (!classIdentifier) return { allowed: true };
    const settings = this.getSettings(classIdentifier);
    if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.UNENFORCED || settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM && isChecked) {
        if (currentPrepared >= maxPrepared) {
          ui.notifications.clear();
          ui.notifications.info(game.i18n.format('SPELLBOOK.Notifications.OverLimitWarning', { type: 'spells', current: currentPrepared + 1, max: maxPrepared }));
        }
      }
      return { allowed: true };
    }
    if (isChecked && currentPrepared >= maxPrepared) return { allowed: false, message: 'SPELLBOOK.Preparation.ClassAtMaximum' };
    if (!isChecked && wasPrepared) {
      const spellSwapping = settings.spellSwapping || 'none';
      switch (spellSwapping) {
        case 'none':
          return { allowed: false, message: 'SPELLBOOK.Spells.LockedNoSwapping' };
        case 'levelUp':
          if (!isLevelUp) return { allowed: false, message: 'SPELLBOOK.Spells.LockedOutsideLevelUp' };
          break;
        case 'longRest':
          if (!isLongRest) return { allowed: false, message: 'SPELLBOOK.Spells.LockedOutsideLongRest' };
          break;
      }
    }
    return { allowed: true };
  }

  /**
   * Clean up unprepared prepared-casting spells if the setting is enabled.
   *
   * Checks for spells with method='spell' and prepared=0 (unprepared) and removes them.
   * This is called at the end of the save process to clean up manually unprepared spells.
   *
   * @private
   * @returns {Promise<void>}
   */
  async _cleanupUnpreparedSpells() {
    const shouldCleanup = game.settings.get(MODULE.ID, SETTINGS.AUTO_DELETE_UNPREPARED_SPELLS);
    if (!shouldCleanup) return;
    const unpreparedSpells = this.actor.items.filter((item) => item.type === 'spell' && item.system.method === 'spell' && item.system.prepared === 0);
    if (unpreparedSpells.length === 0) return;
    log(3, `Auto-cleanup: Removing ${unpreparedSpells.length} unprepared spell(s)`);
    const spellIds = unpreparedSpells.map((spell) => spell.id);
    await this.actor.deleteEmbeddedDocuments('Item', spellIds);
  }
}
