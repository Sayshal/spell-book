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
import { Cantrips, RuleSet } from './_module.mjs';

/**
 * Spell Manager - Core spell preparation and management system.
 */
export class SpellManager {
  /**
   * Create a new SpellManager for an actor.
   * @param {Actor5e} actor - The actor to manage spells for
   * @param {SpellBook} app - The parent spell book application (optional)
   */
  constructor(actor, app = null) {
    log(3, `Creating SpellManager.`, { actorName: actor.name, actorId: actor.id });
    /** @type {Actor5e} The actor being managed */
    this.actor = actor;

    /** @type {SpellBook|null} The parent spell book application */
    this.app = app;

    /** @type {Map<string, ActorSpellSettings>} Cached settings by class identifier */
    this._settingsCache = new Map();

    /** @type {Cantrips} Integrated cantrip management system */
    this.cantripManager = new Cantrips(actor, this);
    log(3, `SpellManager created.`, { actorName: actor.name, actorId: actor.id });
  }

  /**
   * Clear settings cache. Call this when enforcement behavior or class rules change.
   * @returns {void}
   */
  clearSettingsCache() {
    this._settingsCache.clear();
  }

  /**
   * Get cantrip and spell settings for the actor.
   * @param {string} classIdentifier - Class identifier for class-specific rules (required)
   * @returns {ActorSpellSettings} Actor's spell settings
   */
  getSettings(classIdentifier) {
    if (this._settingsCache.has(classIdentifier)) return this._settingsCache.get(classIdentifier);
    const classRules = RuleSet.getClassRules(this.actor, classIdentifier);
    const settings = {
      cantripSwapping: classRules.cantripSwapping || MODULE.SWAP_MODES.NONE,
      spellSwapping: classRules.spellSwapping || MODULE.SWAP_MODES.NONE,
      ritualCasting: classRules.ritualCasting || MODULE.RITUAL_CASTING_MODES.NONE,
      showCantrips: classRules.showCantrips !== false,
      behavior: this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR)
    };
    this._settingsCache.set(classIdentifier, settings);
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
   * Prepare batch data for efficient spell processing.
   * @param {string} classIdentifier - The class identifier to prepare data for
   * @returns {Object} Batch data containing Maps and cached values for O(1) lookups
   */
  prepareBatchData(classIdentifier) {
    log(3, 'Preparing batch data for spell processing', { actorName: this.actor.name, classIdentifier });
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    const ownedSpellsMap = new Map();
    const unassignedSpellsMap = new Map();
    for (const item of this.actor.items) {
      if (item.type !== 'spell') continue;
      const spellUuid = item._stats?.compendiumSource || item.uuid;
      const sourceClass = item.system?.sourceClass || item.sourceClass;
      if (!ownedSpellsMap.has(spellUuid)) ownedSpellsMap.set(spellUuid, []);
      ownedSpellsMap.get(spellUuid).push({ item, sourceClass, prepared: item.system.prepared, method: item.system.method });
      if (!sourceClass) unassignedSpellsMap.set(spellUuid, item);
    }
    const preparedByOtherClassMap = new Map();
    for (const [otherClass, preparedSpells] of Object.entries(preparedByClass)) {
      if (otherClass === classIdentifier) continue;
      for (const preparedKey of preparedSpells) {
        const parts = preparedKey.split(':');
        const spellUuid = parts.slice(1).join(':');
        preparedByOtherClassMap.set(spellUuid, otherClass);
      }
    }
    const cantripLimits = classIdentifier ? { max: this.cantripManager._getMaxCantripsForClass(classIdentifier), current: this.cantripManager.getCurrentCount(classIdentifier) } : null;
    const cantripSettings = classIdentifier ? this.getSettings(classIdentifier) : null;
    log(3, 'Batch data prepared', {
      actor: this.actor.name,
      classIdentifier,
      ownedSpells: ownedSpellsMap.size,
      unassignedSpells: unassignedSpellsMap.size,
      preparedByOtherClass: preparedByOtherClassMap.size
    });
    return { preparedByClass, classPreparedSpells, ownedSpellsMap, unassignedSpellsMap, preparedByOtherClassMap, cantripLimits, cantripSettings };
  }

  /**
   * Get spell preparation status using pre-fetched batch data.
   * @param {Object} spell - The spell to check
   * @param {string} classIdentifier - The specific class context
   * @param {Object} batchData - Pre-fetched batch data from prepareBatchData()
   * @returns {SpellPreparationStatus} Preparation status information
   */
  getSpellPreparationStatus(spell, classIdentifier, batchData) {
    if (!classIdentifier) classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    const spellUuid = spell.compendiumUuid || spell.uuid;
    if (spell.aggregatedModes) {
      const status = { prepared: spell.aggregatedModes.isPreparedForCheckbox, disabled: false, disabledReason: '' };
      if (spell.system?.level === 0 && batchData.cantripLimits) {
        const { max, current } = batchData.cantripLimits;
        const isAtMax = current >= max;
        if (isAtMax && !status.prepared) {
          const { behavior } = batchData.cantripSettings;
          if (behavior === MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) {
            status.disabled = true;
            status.disabledReason = 'SPELLBOOK.Cantrips.MaximumReached';
          }
        }
      }
      return status;
    }
    const spellKey = this._createClassSpellKey(spellUuid, classIdentifier);
    const isPreparedForClass = batchData.classPreparedSpells.includes(spellKey);
    const status = { prepared: isPreparedForClass, disabled: false, disabledReason: '' };
    if (spell.system?.level === 0 && batchData.cantripLimits) {
      const { max, current } = batchData.cantripLimits;
      const isAtMax = current >= max;
      if (isAtMax && !isPreparedForClass) {
        const { behavior } = batchData.cantripSettings;
        if (behavior === MODULE.ENFORCEMENT_BEHAVIOR.ENFORCED) {
          status.disabled = true;
          status.disabledReason = 'SPELLBOOK.Cantrips.MaximumReached';
        }
      }
    }
    return status;
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
      let actualPreparationMode = MODULE.SPELL_MODE.SPELL;
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
        i.system?.method === MODULE.SPELL_MODE.RITUAL
    );
    if (existingRitualSpell) {
      log(3, `Ritual spell already exists on actor.`, { actorName: this.actor.name, uuid, sourceClass });
      return;
    }
    const sourceSpell = await fromUuid(uuid);
    if (sourceSpell) {
      const newSpellData = await game.items.fromCompendium(sourceSpell);
      newSpellData.system.method = MODULE.SPELL_MODE.RITUAL;
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
    const spellcastingConfig = this.app?._state?.getSpellcastingConfigForClass?.(classIdentifier) ?? DataUtils.getSpellcastingConfigForClass(this.actor, classIdentifier);
    if (spellcastingConfig?.type === MODULE.SPELL_MODE.PACT) return MODULE.SPELL_MODE.PACT;
    return MODULE.SPELL_MODE.SPELL;
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
    const matchingSpells = allMatchingSpells.filter((i) => {
      const spellSourceClass = i.system?.sourceClass || i.sourceClass;
      if (spellSourceClass && spellSourceClass !== sourceClass) return false;
      const isAlwaysPrepared = i.system.prepared === 2;
      const isGranted = !!i.flags?.dnd5e?.cachedFor;
      const isInnateOrAtWill = [MODULE.SPELL_MODE.INNATE, MODULE.SPELL_MODE.AT_WILL].includes(i.system.method);
      return !isAlwaysPrepared && !isGranted && !isInnateOrAtWill;
    });
    const existingPreparedSpell = matchingSpells.find((spell) => spell.system.method !== MODULE.SPELL_MODE.RITUAL && spell.system.prepared === 1);
    const existingRitualSpell = matchingSpells.find((spell) => spell.system.method === MODULE.SPELL_MODE.RITUAL);
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
    if (existingRitualSpell && isAlwaysRitualCasting && preparationMode === MODULE.SPELL_MODE.SPELL) {
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
    const matchingSpells = this.actor.items.filter((i) => {
      if (i.type !== 'spell') return false;
      if (i._stats?.compendiumSource !== uuid && i.uuid !== uuid) return false;
      const spellSourceClass = i.system?.sourceClass || i.sourceClass;
      if (spellSourceClass !== sourceClass) return false;
      const isAlwaysPrepared = i.system.prepared === 2;
      const isGranted = !!i.flags?.dnd5e?.cachedFor;
      const isInnateOrAtWill = [MODULE.SPELL_MODE.INNATE, MODULE.SPELL_MODE.AT_WILL].includes(i.system.method);
      return !isAlwaysPrepared && !isGranted && !isInnateOrAtWill;
    });
    if (matchingSpells.length === 0) return;
    let targetSpell = matchingSpells.find((spell) => spell.system.prepared === 1 && spell.system.method !== MODULE.SPELL_MODE.RITUAL);
    if (!targetSpell) targetSpell = matchingSpells.find((spell) => spell.system.prepared === 1);
    if (!targetSpell) return;
    const isRitualSpell = this._isRitualSpell(targetSpell);
    const classRules = RuleSet.getClassRules(this.actor, sourceClass);
    const ritualCastingEnabled = classRules.ritualCasting === MODULE.RITUAL_CASTING_MODES.ALWAYS;
    const existingRitualSpell = matchingSpells.find((spell) => spell.system?.method === MODULE.SPELL_MODE.RITUAL && spell.id !== targetSpell.id);
    if (isRitualSpell && ritualCastingEnabled && targetSpell.system.level > 0) {
      if (targetSpell.system.method === MODULE.SPELL_MODE.RITUAL) {
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
    const unpreparedSpells = this.actor.items.filter((item) => {
      if (item.type !== 'spell') return false;
      if (item.system.method !== MODULE.SPELL_MODE.SPELL) return false;
      if (item.system.prepared !== 0) return false;
      if (item.flags?.dnd5e?.cachedFor) return false;
      return true;
    });
    if (unpreparedSpells.length === 0) return;
    log(3, `Auto-cleanup: Removing ${unpreparedSpells.length} unprepared spell(s)`, { actorName: this.actor.name });
    const spellIds = unpreparedSpells.map((spell) => spell.id);
    await this.actor.deleteEmbeddedDocuments('Item', spellIds);
  }

  /**
   * Apply all queued source class fixes to the actor in a single batch update.
   * @returns {Promise<void>}
   */
  async applySourceClassFixes() {
    if (!this.app?._sourceClassFixQueue?.length) return;
    log(3, `Applying ${this.app._sourceClassFixQueue.length} source class fix${this.app._sourceClassFixQueue.length !== 1 ? 'es' : ''}.`);
    const updates = this.app._sourceClassFixQueue.map((fix) => ({ _id: fix.spellId, 'system.sourceClass': fix.sourceClass }));
    this.app._sourceClassFixQueue = [];
    await this.actor.updateEmbeddedDocuments('Item', updates);
    log(3, `Successfully fixed source class for ${updates.length} spell${updates.length !== 1 ? 's' : ''}.`);
  }

  /**
   * Attempt to automatically determine the correct source class for a prepared spell.
   * @param {Object} spell - The spell to analyze
   * @returns {string|null} The determined source class identifier, or null if couldn't be determined
   */
  attemptToFixSourceClass(spell) {
    log(3, `Detecting source class for ${spell.name}.`, { spell });
    const spellcastingClasses = this.actor.spellcastingClasses || {};
    const classIdentifiers = Object.keys(spellcastingClasses);
    if (classIdentifiers.length === 0) return null;
    if (classIdentifiers.length === 1) return classIdentifiers[0];
    if (this.app?._state?.classSpellData) {
      const spellUuid = spell.compendiumUuid || spell.uuid;
      for (const classIdentifier of classIdentifiers) {
        const classData = this.app._state.classSpellData[classIdentifier];
        if (classData?.spells?.some((s) => s.compendiumUuid === spellUuid || s.uuid === spellUuid)) return classIdentifier;
      }
    }
    return null;
  }

  /**
   * Prepare class-specific preparation data for footer display.
   * @returns {Array<Object>} Array of class preparation data
   */
  prepareClassPreparationData() {
    log(3, 'Preparing class preparation data (for footer).');
    if (!this.app?._state?.classSpellData) return [];
    const activeTab = this.app.tabGroups?.['spellbook-tabs'];
    const classPreparationData = [];
    const activeClassMatch = activeTab?.match(/^([^T]+)Tab$/);
    const activeClassIdentifier = activeClassMatch ? activeClassMatch[1] : null;
    for (const [identifier, classData] of Object.entries(this.app._state.classSpellData)) {
      const isActive = identifier === activeClassIdentifier;
      classPreparationData.push({
        identifier: identifier,
        className: classData.className,
        current: classData.spellPreparation?.current || 0,
        maximum: classData.spellPreparation?.maximum || 0,
        isActive: isActive
      });
    }
    classPreparationData.sort((a, b) => a.className.localeCompare(b.className));
    return classPreparationData;
  }
}
