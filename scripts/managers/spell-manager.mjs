/**
 * Core Spell Management and Preparation System
 *
 * Manages spell preparation, validation, and related functionality for actors in the
 * Spell Book module. This class serves as the central coordination point for all
 * spell-related operations including preparation tracking, spell status determination,
 * class-specific spell management, and integration with various spell casting systems.
 *
 * @module Managers/SpellManager
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from '../ui/_module.mjs';
import { Cantrips, RuleSet } from './_module.mjs';

/**
 * Spell Manager - Core spell preparation and management system.
 */
export class SpellManager {
  /**
   * Create a new SpellManager for an actor.
   * @param {Actor5e} actor - The actor to manage spells for
   */
  constructor(actor) {
    log(3, `Creating SpellManager.`, { actorName: actor.name, actorId: actor.id });
    /** @type {Actor5e} The actor being managed */
    this.actor = actor;

    /** @type {Cantrips} Integrated cantrip management system */
    this.cantripManager = new Cantrips(actor, this);
    log(3, `SpellManager created.`, { actorName: actor.name, actorId: actor.id });
  }

  /**
   * Get cantrip and spell settings for the actor.
   * @param {string} classIdentifier - Class identifier for class-specific rules (required)
   * @returns {ActorSpellSettings} Actor's spell settings
   */
  getSettings(classIdentifier) {
    log(3, `Getting spell settings.`, { actorName: this.actor.name, classIdentifier });
    const behavior = this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM;
    if (!classIdentifier) {
      log(3, `No class identifier provided, returning default settings.`, { actorName: this.actor.name });
      return {
        cantripSwapping: MODULE.SWAP_MODES.NONE,
        spellSwapping: MODULE.SWAP_MODES.NONE,
        ritualCasting: MODULE.RITUAL_CASTING_MODES.NONE,
        showCantrips: true,
        behavior: behavior
      };
    }
    const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
    const settings = {
      cantripSwapping: classRules.cantripSwapping || MODULE.SWAP_MODES.NONE,
      spellSwapping: classRules.spellSwapping || MODULE.SWAP_MODES.NONE,
      ritualCasting: classRules.ritualCasting || MODULE.RITUAL_CASTING_MODES.NONE,
      showCantrips: classRules.showCantrips !== false,
      behavior: behavior
    };
    log(3, `Settings retrieved.`, { actorName: this.actor.name, classIdentifier, settings });
    return settings;
  }

  /**
   * Get maximum allowed cantrips for the actor using cached values.
   * @param {string} classIdentifier - The class identifier to check
   * @returns {number} Maximum allowed cantrips for this class
   */
  getMaxAllowed(classIdentifier) {
    const max = this.cantripManager._getMaxCantripsForClass(classIdentifier);
    log(3, `Max cantrips determined.`, { actorName: this.actor.name, classIdentifier, max });
    return max;
  }

  /**
   * Get the current count of prepared cantrips for a specific class.
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Currently prepared cantrips count for this class
   */
  getCurrentCount(classIdentifier) {
    const count = this.cantripManager.getCurrentCount(classIdentifier);
    log(3, `Current cantrip count determined.`, { actorName: this.actor.name, classIdentifier, count });
    return count;
  }

  /**
   * Get the preparation status for a given spell.
   * @param {Object} spell - The spell to check
   * @param {string} [classIdentifier=null] - The specific class context
   * @returns {SpellPreparationStatus} Preparation status information
   */
  getSpellPreparationStatus(spell, classIdentifier = null) {
    log(3, `Getting spell preparation status.`, { actorName: this.actor.name, spellName: spell.name, classIdentifier });
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
      log(3, `Spell is in preparable context.`, { actorName: this.actor.name, spellName: spell.name, classIdentifier });
      const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
      const classPreparedSpells = preparedByClass[classIdentifier] || [];
      const spellKey = this._createClassSpellKey(spellUuid, classIdentifier);
      let isPreparedForClass = classPreparedSpells.includes(spellKey);
      if (!isPreparedForClass) {
        const actualPreparedSpell = this.actor.items.find(
          (i) =>
            i.type === 'spell' &&
            (i._stats?.compendiumSource === spellUuid || i.uuid === spellUuid) &&
            (i.system.sourceClass === classIdentifier || i.sourceClass === classIdentifier) &&
            i.system.prepared === 1 &&
            i.system.method !== MODULE.PREPARATION_MODES.RITUAL
        );
        if (actualPreparedSpell) isPreparedForClass = true;
      }
      for (const [otherClass, preparedSpells] of Object.entries(preparedByClass)) {
        if (otherClass === classIdentifier) continue;
        const otherClassKey = `${otherClass}:${spellUuid}`;
        if (preparedSpells.includes(otherClassKey)) {
          const spellcastingData = this.actor.spellcastingClasses?.[otherClass];
          const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
          log(3, `Spell prepared by other class.`, { actorName: this.actor.name, spellName: spell.name, otherClass });
          return {
            prepared: false,
            isOwned: false,
            preparationMode: MODULE.PREPARATION_MODES.SPELL,
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
      log(3, `Preparation status for preparable context determined.`, { actorName: this.actor.name, spellName: spell.name, prepared: defaultStatus.prepared });
      return defaultStatus;
    }
    let actualSpell = this.actor.items.find(
      (item) =>
        item.type === 'spell' &&
        (item._stats?.compendiumSource === spellUuid || item.uuid === spellUuid) &&
        (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier) &&
        item.system.prepared === 1 &&
        item.system.method !== MODULE.PREPARATION_MODES.RITUAL
    );
    if (!actualSpell) {
      actualSpell = this.actor.items.find(
        (item) =>
          item.type === 'spell' && (item._stats?.compendiumSource === spellUuid || item.uuid === spellUuid) && (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier)
      );
    }
    if (actualSpell) return this._getOwnedSpellPreparationStatus(actualSpell);
    const unassignedSpell = this.actor.items.find((i) => i.type === 'spell' && (i._stats?.compendiumSource === spellUuid || i.uuid === spellUuid) && !i.system?.sourceClass && !i.sourceClass);
    if (unassignedSpell && classIdentifier) {
      const isAlwaysPrepared = unassignedSpell.system.prepared === 2;
      const isGranted = !!unassignedSpell.flags?.dnd5e?.cachedFor;
      const isSpecialMode = MODULE.SPECIAL_PREPARATION_MODES.includes(unassignedSpell.system.method);
      if (!isAlwaysPrepared && !isGranted && !isSpecialMode) {
        unassignedSpell.sourceClass = classIdentifier;
        if (unassignedSpell.system) unassignedSpell.system.sourceClass = classIdentifier;
      }
      log(3, `Found unassigned spell, assigning to class.`, { actorName: this.actor.name, spellName: spell.name, classIdentifier });
      return this._getOwnedSpellPreparationStatus(unassignedSpell);
    }
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    for (const [otherClass, preparedSpells] of Object.entries(preparedByClass)) {
      if (otherClass === classIdentifier) continue;
      const otherClassKey = `${otherClass}:${spellUuid}`;
      if (preparedSpells.includes(otherClassKey)) {
        const spellcastingData = this.actor.spellcastingClasses?.[otherClass];
        const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
        log(3, `Spell prepared by other class.`, { actorName: this.actor.name, spellName: spell.name, otherClass });
        return {
          prepared: true,
          isOwned: false,
          preparationMode: MODULE.PREPARATION_MODES.SPELL,
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
    const specialSpell = this.actor.items.find((item) => item.type === 'spell' && (item._stats?.compendiumSource === spellUuid || item.uuid === spellUuid));
    if (specialSpell) {
      if (specialSpell.system.prepared === 2) {
        const sourceClass = specialSpell.system?.sourceClass || specialSpell.sourceClass;
        const spellcastingData = sourceClass ? this.actor.spellcastingClasses?.[sourceClass] : null;
        const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
        log(3, `Spell is always prepared.`, { actorName: this.actor.name, spellName: spell.name, sourceClass });
        return {
          prepared: true,
          isOwned: false,
          preparationMode: MODULE.PREPARATION_MODES.ALWAYS,
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
        log(3, `Spell is granted by item.`, { actorName: this.actor.name, spellName: spell.name, grantingItem: grantingItem?.name });
        return {
          prepared: true,
          isOwned: false,
          preparationMode: MODULE.PREPARATION_MODES.GRANTED,
          disabled: true,
          isGranted: true,
          disabledReason: game.i18n.format('SPELLBOOK.SpellSource.GrantedByItem', { item: grantingItem?.name || 'Feature' }),
          localizedPreparationMode: game.i18n.localize('SPELLBOOK.SpellSource.Granted'),
          sourceItem: grantingItem,
          alwaysPrepared: false,
          isCantripLocked: false
        };
      }
      const specialModes = MODULE.SPECIAL_PREPARATION_MODES;
      if (specialModes.includes(specialSpell.system.method)) {
        const sourceClass = specialSpell.system?.sourceClass || specialSpell.sourceClass;
        const spellcastingData = sourceClass ? this.actor.spellcastingClasses?.[sourceClass] : null;
        const classItem = spellcastingData ? this.actor.items.get(spellcastingData.id) : null;
        const localizedMode = UIUtils.getLocalizedPreparationMode(specialSpell.system.method);
        log(3, `Spell has special preparation mode.`, { actorName: this.actor.name, spellName: spell.name, mode: specialSpell.system.method });
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
    log(3, `Default preparation status determined.`, { actorName: this.actor.name, spellName: spell.name, prepared: defaultStatus.prepared });
    return defaultStatus;
  }

  /**
   * Create a unique key for class-spell combinations.
   * @param {string} spellUuid - The spell UUID
   * @param {string} classIdentifier - The class identifier
   * @returns {string} Unique key for this class-spell combination
   */
  _createClassSpellKey(spellUuid, classIdentifier) {
    return `${classIdentifier}:${spellUuid}`;
  }

  /**
   * Parse a class-spell key back into components.
   * @param {string} key - The class-spell key
   * @returns {ClassSpellKeyParsed} Object with classIdentifier and spellUuid
   */
  _parseClassSpellKey(key) {
    const [classIdentifier, ...uuidParts] = key.split(':');
    return { classIdentifier, spellUuid: uuidParts.join(':') };
  }

  /**
   * Get preparation status for a spell that's owned by the actor.
   * @private
   * @param {Item5e} spell - The spell item
   * @returns {SpellPreparationStatus} Preparation status information
   */
  _getOwnedSpellPreparationStatus(spell) {
    log(3, `Getting owned spell preparation status.`, { actorName: this.actor.name, spellName: spell.name });
    const preparationMode = spell.system.method;
    const alwaysPrepared = spell.system.prepared === 2;
    const isInnateCasting = preparationMode === MODULE.PREPARATION_MODES.INNATE;
    const isAtWill = preparationMode === MODULE.PREPARATION_MODES.AT_WILL;
    const localizedPreparationMode = UIUtils.getLocalizedPreparationMode(preparationMode);
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
    log(3, `Owned spell status determined.`, { actorName: this.actor.name, spellName: spell.name, prepared: result.prepared, disabled: result.disabled, result: result });
    return result;
  }

  /**
   * Determine the source of a spell on the actor.
   * @private
   * @param {Item5e} spell - The spell item
   * @returns {SpellSourceInfo|null} Source information for the spell
   */
  _determineSpellSource(spell) {
    log(3, `Determining spell source.`, { actorName: this.actor.name, spellName: spell.name });
    const advancementOrigin = spell.flags?.dnd5e?.advancementOrigin;
    if (advancementOrigin) {
      const sourceItemId = advancementOrigin.split('.')[0];
      const sourceItem = this.actor.items.get(sourceItemId);
      if (sourceItem) {
        log(3, `Spell source determined from advancement origin.`, { actorName: this.actor.name, spellName: spell.name, sourceName: sourceItem.name, sourceType: sourceItem.type });
        return { name: sourceItem.name, type: sourceItem.type, id: sourceItem.id };
      }
    }
    const cachedFor = spell.flags?.dnd5e?.cachedFor;
    if (cachedFor && typeof cachedFor === 'string') {
      const pathParts = cachedFor.split('.');
      if (pathParts.length >= 3 && pathParts[1] === 'Item') {
        const itemId = pathParts[2];
        const item = this.actor.items.get(itemId);
        if (item) {
          log(3, `Spell source determined from cachedFor item path.`, { actorName: this.actor.name, spellName: spell.name, sourceName: item.name, sourceType: item.type });
          return { name: item.name, type: item.type, id: item.id };
        }
      }
      const activity = fromUuidSync(cachedFor, { relative: this.actor });
      const item = activity?.item;
      if (item) {
        log(3, `Spell source determined from cachedFor activity.`, { actorName: this.actor.name, spellName: spell.name, sourceName: item.name, sourceType: item.type });
        return { name: item.name, type: item.type, id: item.id };
      }
    }
    const preparationMode = spell.system.method;
    const sourceClassId = spell.system?.sourceClass || spell.sourceClass;
    if (preparationMode === MODULE.PREPARATION_MODES.ALWAYS) {
      log(3, `Checking always prepared spell source.`, { actorName: this.actor.name, spellName: spell.name, sourceClassId });
      if (sourceClassId && this.actor.spellcastingClasses?.[sourceClassId]) {
        const spellcastingSource = DataUtils.getSpellcastingSourceItem(this.actor, sourceClassId);
        if (spellcastingSource && spellcastingSource.type === 'subclass') {
          log(3, `Spell source determined as subclass (always prepared).`, { actorName: this.actor.name, spellName: spell.name, sourceName: spellcastingSource.name });
          return { name: spellcastingSource.name, type: 'subclass', id: spellcastingSource.id };
        }
      }
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) {
        log(3, `Spell source determined as subclass fallback (always prepared).`, { actorName: this.actor.name, spellName: spell.name, sourceName: subclass.name });
        return { name: subclass.name, type: 'subclass', id: subclass.id };
      }
    } else if (preparationMode === MODULE.PREPARATION_MODES.PACT) {
      log(3, `Checking pact magic spell source.`, { actorName: this.actor.name, spellName: spell.name, sourceClassId });
      if (sourceClassId && this.actor.spellcastingClasses?.[sourceClassId]) {
        const spellcastingSource = DataUtils.getSpellcastingSourceItem(this.actor, sourceClassId);
        if (spellcastingSource && spellcastingSource.type === 'subclass') {
          log(3, `Spell source determined as subclass (pact magic).`, { actorName: this.actor.name, spellName: spell.name, sourceName: spellcastingSource.name });
          return { name: spellcastingSource.name, type: 'subclass', id: spellcastingSource.id };
        }
      }
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) {
        log(3, `Spell source determined as subclass fallback (pact magic).`, { actorName: this.actor.name, spellName: spell.name, sourceName: subclass.name });
        return { name: subclass.name, type: 'subclass', id: subclass.id };
      }
      log(3, `Spell source determined as pact magic (generic).`, { actorName: this.actor.name, spellName: spell.name });
      return { name: game.i18n.localize('SPELLBOOK.SpellSource.PactMagic'), type: 'class' };
    } else {
      log(3, `Checking standard spell source.`, { actorName: this.actor.name, spellName: spell.name, sourceClassId });
      if (sourceClassId && this.actor.spellcastingClasses?.[sourceClassId]) {
        const spellcastingSource = DataUtils.getSpellcastingSourceItem(this.actor, sourceClassId);
        if (spellcastingSource) {
          log(3, `Spell source determined from spellcasting source.`, { actorName: this.actor.name, spellName: spell.name, sourceName: spellcastingSource.name, sourceType: spellcastingSource.type });
          return { name: spellcastingSource.name, type: spellcastingSource.type, id: spellcastingSource.id };
        }
      }
      const classItem = this.actor.items.find((i) => i.type === 'class');
      if (classItem) {
        log(3, `Spell source determined as class fallback.`, { actorName: this.actor.name, spellName: spell.name, sourceName: classItem.name });
        return { name: classItem.name, type: 'class', id: classItem.id };
      }
    }
    log(3, `No spell source determined.`, { actorName: this.actor.name, spellName: spell.name });
    return null;
  }

  /**
   * Save prepared spells for a specific class.
   * @param {string} classIdentifier - The class identifier
   * @param {Object<string, SpellInfo>} classSpellData - Object with spell data keyed by classSpellKey
   * @returns {Promise<ClassSpellSaveResult|null>} Result object with cantrip and spell changes
   */
  async saveClassSpecificPreparedSpells(classIdentifier, classSpellData) {
    log(3, `Saving class-specific prepared spells.`, { actorName: this.actor.name, actorId: this.actor.id, classIdentifier, spellCount: Object.keys(classSpellData).length });
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
      let actualPreparationMode = MODULE.PREPARATION_MODES.SPELL;
      if (spellLevel > 0) actualPreparationMode = preparationMode || defaultPreparationMode;
      if (isPrepared) {
        preparedSpellKeys.push(classSpellKey);
        await this._ensureSpellOnActor(uuid, classIdentifier, actualPreparationMode, spellsToCreate, spellsToUpdate);
        if (isRitual) {
          const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
          if (classRules.ritualCasting === MODULE.RITUAL_CASTING_MODES.ALWAYS || classRules.ritualCasting === MODULE.RITUAL_CASTING_MODES.PREPARED)
            await this._ensureRitualSpellOnActor(uuid, classIdentifier, spellsToCreate);
        }
      } else if (wasPrepared) {
        await this._handleUnpreparingSpell(uuid, classIdentifier, spellIdsToRemove);
        if (isRitual) {
          const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
          if (classRules.ritualCasting === MODULE.RITUAL_CASTING_MODES.ALWAYS) await this._ensureRitualSpellOnActor(uuid, classIdentifier, spellsToCreate);
        }
      } else if (isRitual) {
        const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
        if (classRules.ritualCasting === MODULE.RITUAL_CASTING_MODES.ALWAYS) await this._ensureRitualSpellOnActor(uuid, classIdentifier, spellsToCreate);
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
    if (spellsToCreate.length > 0) {
      log(3, `Creating ${spellsToCreate.length} spell items on actor.`, { actorName: this.actor.name, classIdentifier, created: spellsToCreate });
      await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
    }
    if (spellsToUpdate.length > 0) {
      log(3, `Updating ${spellsToUpdate.length} spell items on actor.`, { actorName: this.actor.name, classIdentifier, updated: spellsToUpdate });
      await this.actor.updateEmbeddedDocuments('Item', spellsToUpdate);
    }
    if (spellIdsToRemove.length > 0) {
      log(3, `Removing ${spellIdsToRemove.length} spell items from actor.`, { actorName: this.actor.name, classIdentifier, removed: spellIdsToRemove });
      await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    }
    await this._updateGlobalPreparedSpellsFlag();
    await this._cleanupUnpreparedSpells();
    this.cantripManager._currentCountByClass.clear();
    this.cantripManager._totalCurrentCount = null;
    log(3, `Class-specific prepared spells saved.`, { actorName: this.actor.name, classIdentifier, cantripChanges, spellChanges });
    return { cantripChanges, spellChanges };
  }

  /**
   * Ensure a ritual spell exists on the actor in ritual mode.
   * @private
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {Object[]} spellsToCreate - Array to add creation data to
   * @returns {Promise<void>}
   */
  async _ensureRitualSpellOnActor(uuid, sourceClass, spellsToCreate) {
    log(3, `Ensuring ritual spell on actor.`, { actorName: this.actor.name, uuid, sourceClass });
    const existingRitualSpell = this.actor.items.find(
      (i) =>
        i.type === 'spell' &&
        (i._stats?.compendiumSource === uuid || i.uuid === uuid) &&
        (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass) &&
        i.system?.method === MODULE.PREPARATION_MODES.RITUAL
    );
    if (existingRitualSpell) {
      log(3, `Ritual spell already exists on actor.`, { actorName: this.actor.name, uuid, sourceClass });
      return;
    }
    const sourceSpell = await fromUuid(uuid);
    if (sourceSpell) {
      const newSpellData = await game.items.fromCompendium(sourceSpell);
      newSpellData.system.method = MODULE.PREPARATION_MODES.RITUAL;
      newSpellData.system.prepared = 0;
      newSpellData.system.sourceClass = sourceClass;
      newSpellData.flags[MODULE.ID] = newSpellData.flags[MODULE.ID] || {};
      newSpellData.flags[MODULE.ID].isModuleRitual = true;
      spellsToCreate.push(newSpellData);
      log(3, `Ritual spell queued for creation.`, { actorName: this.actor.name, spellName: sourceSpell.name, sourceClass });
    } else {
      log(2, `Could not find source spell for ritual.`, { actorName: this.actor.name, uuid, sourceClass });
    }
  }

  /**
   * Get the preparation mode for a specific class.
   * @private
   * @param {string} classIdentifier - The class identifier
   * @returns {string} The preparation mode ('spell', 'pact', etc.)
   */
  _getClassPreparationMode(classIdentifier) {
    log(3, `Getting class preparation mode.`, { actorName: this.actor.name, classIdentifier });
    const spellcastingConfig = DataUtils.getSpellcastingConfigForClass(this.actor, classIdentifier);
    if (spellcastingConfig?.type === MODULE.PREPARATION_MODES.PACT) return MODULE.PREPARATION_MODES.PACT;
    return MODULE.PREPARATION_MODES.SPELL;
  }

  /**
   * Ensure a spell exists on the actor with proper class attribution.
   * @private
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {string} preparationMode - Preparation mode for this class
   * @param {Object[]} spellsToCreate - Array to add creation data to
   * @param {Object[]} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   */
  async _ensureSpellOnActor(uuid, sourceClass, preparationMode, spellsToCreate, spellsToUpdate) {
    log(3, `Ensuring spell on actor.`, { actorName: this.actor.name, uuid, sourceClass, preparationMode });
    const allMatchingSpells = this.actor.items.filter((i) => i.type === 'spell' && (i._stats?.compendiumSource === uuid || i.uuid === uuid));
    for (const spell of allMatchingSpells) {
      const spellSourceClass = spell.system?.sourceClass || spell.sourceClass;
      if (spellSourceClass && spellSourceClass !== sourceClass) continue;
      const isAlwaysPrepared = spell.system.prepared === 2;
      const isGranted = !!spell.flags?.dnd5e?.cachedFor;
      const isSpecialMode = [MODULE.PREPARATION_MODES.INNATE, MODULE.PREPARATION_MODES.AT_WILL].includes(spell.system.method);
      if (isAlwaysPrepared || isGranted || isSpecialMode) {
        log(3, `Spell has special status, skipping.`, { actorName: this.actor.name, spellName: spell.name, sourceClass });
        return;
      }
    }
    const matchingSpells = allMatchingSpells.filter((i) => i.system.sourceClass === sourceClass || i.sourceClass === sourceClass);
    const existingPreparedSpell = matchingSpells.find((spell) => spell.system.method !== MODULE.PREPARATION_MODES.RITUAL && spell.system.prepared === 1);
    const existingRitualSpell = matchingSpells.find((spell) => spell.system.method === MODULE.PREPARATION_MODES.RITUAL);
    const classRules = RuleSet.getClassRules(this.actor, sourceClass);
    const isAlwaysRitualCasting = classRules.ritualCasting === MODULE.RITUAL_CASTING_MODES.ALWAYS;
    if (existingPreparedSpell) {
      if (existingPreparedSpell.system.method !== preparationMode || existingPreparedSpell.system.prepared !== 1 || existingPreparedSpell.system.sourceClass !== sourceClass) {
        const updateData = { _id: existingPreparedSpell.id, 'system.method': preparationMode, 'system.prepared': 1 };
        if (existingPreparedSpell.system.sourceClass !== sourceClass) updateData['system.sourceClass'] = sourceClass;
        spellsToUpdate.push(updateData);
        log(3, `Existing prepared spell queued for update.`, { actorName: this.actor.name, spellId: existingPreparedSpell.id, sourceClass });
      }
      return;
    }
    if (existingRitualSpell && isAlwaysRitualCasting && preparationMode === MODULE.PREPARATION_MODES.SPELL) {
      const sourceSpell = await fromUuid(uuid);
      if (sourceSpell) {
        const newSpellData = await game.items.fromCompendium(sourceSpell);
        newSpellData.system.method = preparationMode;
        newSpellData.system.prepared = 1;
        newSpellData.system.sourceClass = sourceClass;
        spellsToCreate.push(newSpellData);
        log(3, `New prepared spell queued for creation (ritual spell exists).`, { actorName: this.actor.name, spellName: sourceSpell.name, sourceClass });
      }
      return;
    }
    const unassignedSpell = allMatchingSpells.find((spell) => !spell.system?.sourceClass && !spell.sourceClass);
    const existingSpell = unassignedSpell || matchingSpells[0];
    if (existingSpell) {
      const updateData = { _id: existingSpell.id, 'system.method': preparationMode, 'system.prepared': 1 };
      if (existingSpell.system.sourceClass !== sourceClass) updateData['system.sourceClass'] = sourceClass;
      spellsToUpdate.push(updateData);
      log(3, `Existing spell queued for update.`, { actorName: this.actor.name, spellId: existingSpell.id, sourceClass });
      return;
    }
    const sourceSpell = await fromUuid(uuid);
    if (sourceSpell) {
      const newSpellData = await game.items.fromCompendium(sourceSpell);
      newSpellData.system.method = preparationMode;
      newSpellData.system.prepared = 1;
      newSpellData.system.sourceClass = sourceClass;
      spellsToCreate.push(newSpellData);
      log(3, `New spell queued for creation.`, { actorName: this.actor.name, spellName: sourceSpell.name, sourceClass });
    } else {
      log(2, `Could not find source spell.`, { actorName: this.actor.name, uuid, sourceClass });
    }
  }

  /**
   * Update the global prepared spells flag for backward compatibility.
   * @private
   * @returns {Promise<void>}
   */
  async _updateGlobalPreparedSpellsFlag() {
    log(3, `Updating global prepared spells flag.`, { actorName: this.actor.name, actorId: this.actor.id });
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const allPreparedKeys = Object.values(preparedByClass).flat();
    const allPreparedUuids = allPreparedKeys.map((key) => {
      const parsed = this._parseClassSpellKey(key);
      return parsed.spellUuid;
    });
    await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
    log(3, `Global prepared spells flag updated.`, { actorName: this.actor.name, totalPrepared: allPreparedUuids.length });
  }

  /**
   * Handle unpreparing a spell for a specific class.
   * @private
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {string[]} spellIdsToRemove - Array to add removal IDs to
   * @returns {Promise<void>}
   */
  async _handleUnpreparingSpell(uuid, sourceClass, spellIdsToRemove) {
    log(3, `Handling unpreparing spell.`, { actorName: this.actor.name, uuid, sourceClass });
    const matchingSpells = this.actor.items.filter(
      (i) => i.type === 'spell' && (i._stats?.compendiumSource === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );
    if (matchingSpells.length === 0) return;
    let targetSpell = matchingSpells.find((spell) => spell.system.prepared === 1 && spell.system.method !== MODULE.PREPARATION_MODES.RITUAL);
    if (!targetSpell) targetSpell = matchingSpells.find((spell) => spell.system.prepared === 1);
    if (!targetSpell) return;
    const isAlwaysPrepared = targetSpell.system.prepared === 2;
    const isGranted = !!targetSpell.flags?.dnd5e?.cachedFor;
    const isFromClassFeature = targetSpell.system.prepared === 2;
    if (isAlwaysPrepared || isGranted || isFromClassFeature) {
      log(3, `Spell has special status, cannot unprepare.`, { spellName: targetSpell.name, sourceClass, prepared: isAlwaysPrepared, granted: isGranted, feature: isFromClassFeature });
      return;
    }
    const isRitualSpell = this._isRitualSpell(targetSpell);
    const classRules = RuleSet.getClassRules(this.actor, sourceClass);
    const ritualCastingEnabled = classRules.ritualCasting === MODULE.RITUAL_CASTING_MODES.ALWAYS;
    const existingRitualSpell = matchingSpells.find((spell) => spell.system?.method === MODULE.PREPARATION_MODES.RITUAL && spell.id !== targetSpell.id);
    if (isRitualSpell && ritualCastingEnabled && targetSpell.system.level > 0) {
      if (targetSpell.system.method === MODULE.PREPARATION_MODES.RITUAL) {
        log(3, `Target spell is ritual mode, keeping it.`, { actorName: this.actor.name, spellName: targetSpell.name });
        return;
      } else if (existingRitualSpell) {
        spellIdsToRemove.push(targetSpell.id);
        log(3, `Removing prepared spell, ritual version exists.`, { actorName: this.actor.name, spellName: targetSpell.name });
        return;
      } else {
        spellIdsToRemove.push(targetSpell.id);
        log(3, `Removing prepared spell for ritual.`, { actorName: this.actor.name, spellName: targetSpell.name });
        return;
      }
    }
    spellIdsToRemove.push(targetSpell.id);
    log(3, `Spell queued for removal.`, { actorName: this.actor.name, spellId: targetSpell.id, spellName: targetSpell.name });
  }

  /**
   * Check if a spell can be cast as a ritual.
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
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async cleanupCantripsForClass(classIdentifier) {
    log(3, `Cleaning up cantrips for class.`, { actorName: this.actor.name, classIdentifier });
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    if (!preparedByClass[classIdentifier]) return;
    const cleanedSpells = [];
    for (const classSpellKey of preparedByClass[classIdentifier]) {
      const parsed = this._parseClassSpellKey(classSpellKey);
      const spell = await fromUuid(parsed.spellUuid);
      if (spell && spell.system.level !== 0) cleanedSpells.push(classSpellKey);
    }
    if (cleanedSpells.length !== preparedByClass[classIdentifier].length) {
      preparedByClass[classIdentifier] = cleanedSpells;
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
      await this._updateGlobalPreparedSpellsFlag();
      log(3, `Cantrips cleaned up for class.`, { actorName: this.actor.name, classIdentifier, removed: preparedByClass[classIdentifier].length - cleanedSpells.length });
    }
  }

  /**
   * Clean up stale preparation flags that don't correspond to actual spells.
   * @returns {Promise<void>}
   */
  async cleanupStalePreparationFlags() {
    log(3, `Cleaning up stale preparation flags.`, { actorName: this.actor.name, actorId: this.actor.id });
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    let hasChanges = false;
    for (const [classIdentifier, spellKeys] of Object.entries(preparedByClass)) {
      const cleanedKeys = [];
      for (const spellKey of spellKeys) {
        const parsed = this._parseClassSpellKey(spellKey);
        const actualSpell = this.actor.items.find(
          (item) =>
            item.type === 'spell' &&
            (item._stats?.compendiumSource === parsed.spellUuid || item.uuid === parsed.spellUuid) &&
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
      log(3, `Stale preparation flags cleaned up.`, { actorName: this.actor.name });
    }
  }

  /**
   * Determine if a spell can be changed based on class rules and current state.
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
    log(3, 'Can status be changed.', { actorName: this.actor.name, spellName: spell.name, isChecked, wasPrepared, isLevelUp, isLongRest, classIdentifier, currentPrepared, maxPrepared });
    if (spell.system.level === 0) {
      log(3, `Spell is cantrip, allowing change.`, { actorName: this.actor.name, spellName: spell.name });
      return { allowed: true };
    }
    if (!classIdentifier) classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    if (!classIdentifier) {
      log(3, `No class identifier, allowing change.`, { actorName: this.actor.name, spellName: spell.name });
      return { allowed: true };
    }
    const settings = this.getSettings(classIdentifier);
    if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.UNENFORCED || settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM && isChecked) {
        if (currentPrepared >= maxPrepared) {
          ui.notifications.clear();
          ui.notifications.info(game.i18n.format('SPELLBOOK.Notifications.OverLimitWarning', { type: 'spells', current: currentPrepared + 1, max: maxPrepared }));
        }
      }
      log(3, `Spell change allowed (unenforced/notify behavior).`, { actorName: this.actor.name, spellName: spell.name });
      return { allowed: true };
    }
    if (isChecked && currentPrepared >= maxPrepared) {
      log(3, `Spell change not allowed (at maximum).`, { actorName: this.actor.name, spellName: spell.name, currentPrepared, maxPrepared });
      return { allowed: false, message: 'SPELLBOOK.Preparation.ClassAtMaximum' };
    }
    if (!isChecked && wasPrepared) {
      const spellSwapping = settings.spellSwapping || MODULE.SWAP_MODES.NONE;
      switch (spellSwapping) {
        case MODULE.SWAP_MODES.NONE:
          log(3, `Spell change not allowed (no swapping).`, { actorName: this.actor.name, spellName: spell.name });
          return { allowed: false, message: 'SPELLBOOK.Spells.LockedNoSwapping' };
        case MODULE.SWAP_MODES.LEVEL_UP:
          if (!isLevelUp) {
            log(3, `Spell change not allowed (level-up only).`, { actorName: this.actor.name, spellName: spell.name });
            return { allowed: false, message: 'SPELLBOOK.Spells.LockedOutsideLevelUp' };
          }
          break;
        case MODULE.SWAP_MODES.LONG_REST:
          if (!isLongRest) {
            log(3, `Spell change not allowed (long rest only).`, { actorName: this.actor.name, spellName: spell.name });
            return { allowed: false, message: 'SPELLBOOK.Spells.LockedOutsideLongRest' };
          }
          break;
      }
    }
    log(3, `Spell change allowed.`, { actorName: this.actor.name, spellName: spell.name });
    return { allowed: true };
  }

  /**
   * Clean up unprepared prepared-casting spells if the setting is enabled.
   * @private
   * @returns {Promise<void>}
   */
  async _cleanupUnpreparedSpells() {
    const shouldCleanup = game.settings.get(MODULE.ID, SETTINGS.AUTO_DELETE_UNPREPARED_SPELLS);
    if (!shouldCleanup) return;
    const unpreparedSpells = this.actor.items.filter((item) => item.type === 'spell' && item.system.method === MODULE.PREPARATION_MODES.SPELL && item.system.prepared === 0);
    if (unpreparedSpells.length === 0) return;
    log(3, `Auto-cleanup: Removing ${unpreparedSpells.length} unprepared spell(s)`, { actorName: this.actor.name });
    const spellIds = unpreparedSpells.map((spell) => spell.id);
    await this.actor.deleteEmbeddedDocuments('Item', spellIds);
  }
}
