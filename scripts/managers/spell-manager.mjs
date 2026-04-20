import { CLASS_IDENTIFIERS, FLAGS, MODULE, RITUAL_CASTING_MODES, SETTINGS, SPELL_MODE, SWAP_MODES, TEMPLATES } from '../constants.mjs';
import { log } from '../utils/logger.mjs';
import { ClassManager } from './class-manager.mjs';
import { RuleSet } from './rule-set.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Resolve the canonical compendium UUID for a spell, handling owned copies.
 * @param {object|string} spellOrUuid - Spell document or UUID string
 * @returns {string|null} Canonical UUID
 */
export function getCanonicalSpellUuid(spellOrUuid) {
  if (!spellOrUuid) return null;
  const uuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid;
  if (!uuid) return null;
  if (typeof spellOrUuid === 'object') {
    if (spellOrUuid.compendiumUuid) return spellOrUuid.compendiumUuid;
    if (spellOrUuid._stats?.compendiumSource) return spellOrUuid._stats.compendiumSource;
    if (spellOrUuid.flags?.core?.sourceId) return spellOrUuid.flags.core.sourceId;
    return spellOrUuid.uuid || null;
  }
  const parsed = foundry.utils.parseUuid(uuid);
  if (parsed.collection?.collection) return uuid;
  const doc = fromUuidSync(uuid);
  return doc?._stats?.compendiumSource || doc?.flags?.core?.sourceId || uuid;
}

/**
 * Build the sourceItem string for class-attributed spells.
 * @param {string} classId - The class identifier
 * @returns {string} Source item string (e.g. "class:wizard")
 */
export function buildClassSourceItem(classId) {
  return classId ? `class:${classId}` : '';
}

/** Spell Manager — static class for spell preparation, cantrip limits, and swap mechanics. */
export class SpellManager {
  /** @type {WeakMap<object, Map<string, object>>} */
  static _settingsCache = new WeakMap();

  /** @type {WeakMap<object, Map<string, number>>} */
  static _cantripMaxCache = new WeakMap();

  /** @type {WeakMap<object, Map<string, number>>} */
  static _cantripCountCache = new WeakMap();

  /**
   * Get cantrip and spell enforcement settings for a class.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {object} Settings including cantripSwapping, spellSwapping, ritualCasting, showCantrips, behavior
   */
  static getSettings(actor, classIdentifier) {
    if (!this._settingsCache.has(actor)) this._settingsCache.set(actor, new Map());
    const cache = this._settingsCache.get(actor);
    if (cache.has(classIdentifier)) return cache.get(classIdentifier);
    const classRules = RuleSet.getClassRules(actor, classIdentifier);
    const settings = {
      cantripSwapping: classRules.cantripSwapping || SWAP_MODES.NONE,
      spellSwapping: classRules.spellSwapping || SWAP_MODES.NONE,
      ritualCasting: classRules.ritualCasting || RITUAL_CASTING_MODES.NONE,
      showCantrips: classRules.showCantrips !== false,
      notifyGm: actor.getFlag(MODULE.ID, FLAGS.NOTIFY_GM) ?? game.settings.get(MODULE.ID, SETTINGS.NOTIFY_GM_ON_SPELL_CHANGES)
    };
    cache.set(classIdentifier, settings);
    return settings;
  }

  /**
   * Invalidate all caches for an actor.
   * @param {object} actor - The actor document
   */
  static invalidateCache(actor) {
    this._settingsCache.delete(actor);
    this._cantripMaxCache.delete(actor);
    this._cantripCountCache.delete(actor);
    log(3, 'SpellManager cache invalidated.', { actorName: actor.name });
  }

  /**
   * Get current count of prepared cantrips for a class.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Currently prepared cantrips for this class
   */
  static getCurrentCantripCount(actor, classIdentifier) {
    if (!this._cantripCountCache.has(actor)) this._cantripCountCache.set(actor, new Map());
    const cache = this._cantripCountCache.get(actor);
    if (cache.has(classIdentifier)) return cache.get(classIdentifier);
    const count = actor.items.reduce((n, i) => {
      return n + (i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1 && ClassManager.getSpellClassIdentifier(i) === classIdentifier ? 1 : 0);
    }, 0);
    cache.set(classIdentifier, count);
    return count;
  }

  /**
   * Get maximum cantrips for a class (cached).
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Maximum allowed cantrips
   */
  static getMaxCantrips(actor, classIdentifier) {
    if (!this._cantripMaxCache.has(actor)) this._cantripMaxCache.set(actor, new Map());
    const cache = this._cantripMaxCache.get(actor);
    if (cache.has(classIdentifier)) return cache.get(classIdentifier);
    const max = this._calculateMaxCantripsForClass(actor, classIdentifier);
    cache.set(classIdentifier, max);
    return max;
  }

  /**
   * Check if a cantrip level-up was detected (new level or increased cantrip max).
   * @param {object} actor - The actor document
   * @returns {boolean} Whether a level-up affects cantrips
   */
  static checkForCantripLevelUp(actor) {
    const previousLevel = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = actor.system.details.level;
    const currentMax = this._getTotalMaxCantrips(actor);
    return (previousLevel === 0 && currentLevel > 0) || ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);
  }

  /**
   * Validate whether a cantrip's preparation status can be changed.
   * @param {object} actor - The actor document
   * @param {object} spell - The cantrip spell
   * @param {boolean} isChecked - Whether preparing (true) or unpreparing (false)
   * @param {boolean} isLevelUp - During level-up
   * @param {boolean} isLongRest - During long rest
   * @param {number|null} uiCantripCount - Current UI count for optimization
   * @param {string} classIdentifier - The class identifier
   * @returns {object} { allowed, message }
   */
  static canChangeCantripStatus(actor, spell, isChecked, _isLevelUp, _isLongRest, uiCantripCount, classIdentifier) {
    if (spell.system.level !== 0) return { allowed: true };
    if (!classIdentifier) classIdentifier = ClassManager.getSpellClassIdentifier(spell);
    if (!classIdentifier) return { allowed: true };
    const settings = this.getSettings(actor, classIdentifier);
    if (settings.notifyGm && isChecked) {
      const currentCount = uiCantripCount ?? this.getCurrentCantripCount(actor, classIdentifier);
      const maxCantrips = this.getMaxCantrips(actor, classIdentifier);
      if (currentCount >= maxCantrips) {
        ui.notifications.clear();
        ui.notifications.info(_loc('SPELLBOOK.Notifications.OverLimitWarning', { type: 'cantrips', current: currentCount + 1, max: maxCantrips }));
      }
    }
    return { allowed: true };
  }

  /**
   * Track a cantrip change for swap management.
   * @param {object} actor - The actor document
   * @param {object} spell - The cantrip being changed
   * @param {boolean} isChecked - Preparing (true) or unpreparing (false)
   * @param {boolean} isLevelUp - During level-up
   * @param {boolean} isLongRest - During long rest
   * @param {string} classIdentifier - The class identifier
   */
  static trackCantripChange(actor, spell, isChecked, isLevelUp, isLongRest, classIdentifier) {
    if (spell.system.level !== 0) return;
    if (!classIdentifier) {
      classIdentifier = ClassManager.getSpellClassIdentifier(spell);
      if (!classIdentifier) return;
    }
    const settings = this.getSettings(actor, classIdentifier);
    const cantripSwapping = settings.cantripSwapping || 'none';
    if (!isLevelUp && !isLongRest) return;
    if (cantripSwapping === 'none') return;
    if (cantripSwapping === 'longRest' && classIdentifier !== CLASS_IDENTIFIERS.WIZARD) return;
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    let tracking = actor.getFlag(MODULE.ID, flagName);
    if (!tracking) {
      const preparedCantrips = actor.items
        .filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.prepared === 1 && ClassManager.getSpellClassIdentifier(i) === classIdentifier)
        .map((i) => i.uuid);
      tracking = { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: preparedCantrips };
      actor.setFlag(MODULE.ID, flagName, tracking);
    }
    const spellUuid = spell.uuid;
    if (!isChecked && tracking.originalChecked.includes(spellUuid)) {
      if (tracking.unlearned === spellUuid) foundry.utils.mergeObject(tracking, { hasUnlearned: false, unlearned: null });
      else foundry.utils.mergeObject(tracking, { hasUnlearned: true, unlearned: spellUuid });
    } else if (isChecked && !tracking.originalChecked.includes(spellUuid)) {
      if (tracking.learned === spellUuid) foundry.utils.mergeObject(tracking, { hasLearned: false, learned: null });
      else foundry.utils.mergeObject(tracking, { hasLearned: true, learned: spellUuid });
    } else if (!isChecked && tracking.learned === spellUuid) {
      foundry.utils.mergeObject(tracking, { hasLearned: false, learned: null });
    } else if (isChecked && tracking.unlearned === spellUuid) {
      foundry.utils.mergeObject(tracking, { hasUnlearned: false, unlearned: null });
    }
    actor.setFlag(MODULE.ID, flagName, tracking);
  }

  /**
   * Complete the cantrip swap process and reset tracking.
   * @param {object} actor - The actor document
   * @param {boolean} isLevelUp - Whether completing a level-up swap
   */
  static async completeCantripSwap(actor, isLevelUp) {
    const allTracking = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};
    const contextKey = isLevelUp ? 'levelUp' : 'longRest';
    for (const classId of Object.keys(allTracking)) {
      if (allTracking[classId]?.[contextKey]) {
        delete allTracking[classId][contextKey];
        if (Object.keys(allTracking[classId]).length === 0) delete allTracking[classId];
      }
    }
    if (Object.keys(allTracking).length === 0) await actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
    else await actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, allTracking);
    if (isLevelUp) {
      await actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, actor.system.details.level);
      await actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, this._getTotalMaxCantrips(actor));
    }
  }

  /**
   * Complete the cantrip level-up process (updates flags and clears swap tracking).
   * @param {object} actor - The actor document
   */
  static async completeCantripsLevelUp(actor) {
    await actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, actor.system.details.level);
    await actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, this._getTotalMaxCantrips(actor));
    await this.completeCantripSwap(actor, true);
  }

  /**
   * Reset long-rest cantrip swap tracking.
   * @param {object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async resetSwapTracking(actor) {
    const allTracking = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};
    for (const classId of Object.keys(allTracking)) {
      if (allTracking[classId]?.longRest) {
        delete allTracking[classId].longRest;
        if (Object.keys(allTracking[classId]).length === 0) delete allTracking[classId];
      }
    }
    if (Object.keys(allTracking).length === 0) await actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
    else await actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, allTracking);
  }

  /**
   * Prepare an actor for a spell book open.
   * @param {object} actor - The actor opening the spell book
   * @returns {Promise<void>}
   */
  static async handleSpellbookOpen(actor) {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const hasLongRestSwapping = Object.values(classRules).some((rules) => rules.cantripSwapping === 'longRest' || rules.spellSwapping === 'longRest');
    if (!hasLongRestSwapping) return;
    const tracking = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};
    const hasCompletedSwaps = Object.values(tracking).some((entry) => entry.longRest?.hasLearned && entry.longRest?.hasUnlearned);
    if (hasCompletedSwaps) await SpellManager.resetSwapTracking(actor);
    const longRestFlag = actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
    if (longRestFlag === undefined || longRestFlag === null) await actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
  }

  /**
   * Build batch lookup data for efficient spell processing.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {object} Batch data with Maps for O(1) lookups
   */
  static prepareBatchData(actor, classIdentifier) {
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    const ownedSpellsMap = new Map();
    const unassignedSpellsMap = new Map();
    for (const item of actor.itemTypes.spell) {
      const spellUuid = getCanonicalSpellUuid(item);
      const itemClassId = ClassManager.getSpellClassIdentifier(item);
      if (!ownedSpellsMap.has(spellUuid)) ownedSpellsMap.set(spellUuid, []);
      ownedSpellsMap.get(spellUuid).push({ item, classIdentifier: itemClassId, prepared: item.system.prepared, method: item.system.method });
      if (!itemClassId) unassignedSpellsMap.set(spellUuid, item);
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
    const cantripLimits = { max: this.getMaxCantrips(actor, classIdentifier), current: this.getCurrentCantripCount(actor, classIdentifier) };
    const cantripSettings = this.getSettings(actor, classIdentifier);
    return { preparedByClass, classPreparedSpells, ownedSpellsMap, unassignedSpellsMap, preparedByOtherClassMap, cantripLimits, cantripSettings };
  }

  /**
   * Get spell preparation status using pre-fetched batch data.
   * @param {object} _actor - The actor document (unused, kept for API consistency)
   * @param {object} spell - The spell to check
   * @param {string} classIdentifier - The class context
   * @param {object} batchData - Pre-fetched batch data from prepareBatchData()
   * @returns {object} { prepared, disabled, disabledReason }
   */
  static getSpellPreparationStatus(_actor, spell, classIdentifier, batchData) {
    if (!classIdentifier) classIdentifier = ClassManager.getSpellClassIdentifier(spell);
    if (spell.aggregatedModes) return { prepared: spell.aggregatedModes.isPreparedForCheckbox, disabled: false, disabledReason: '' };
    const spellUuid = spell.compendiumUuid || spell.uuid;
    const spellKey = this._createClassSpellKey(spellUuid, classIdentifier);
    return { prepared: batchData.classPreparedSpells.includes(spellKey), disabled: false, disabledReason: '' };
  }

  /**
   * Validate whether a spell's preparation status can be changed.
   * @param {object} actor - The actor document
   * @param {object} spell - The spell being modified
   * @param {boolean} isChecked - Preparing (true) or unpreparing (false)
   * @param {boolean} wasPrepared - Whether the spell was previously prepared
   * @param {boolean} isLevelUp - During level-up
   * @param {boolean} isLongRest - During long rest
   * @param {string} classIdentifier - The class identifier
   * @param {number} currentPrepared - Current prepared spell count
   * @param {number} maxPrepared - Maximum allowed prepared spells
   * @returns {object} { allowed, message }
   */
  static canChangeSpellStatus(actor, spell, isChecked, _wasPrepared, _isLevelUp, _isLongRest, classIdentifier, currentPrepared, maxPrepared) {
    if (spell.system.level === 0) return { allowed: true };
    if (!classIdentifier) classIdentifier = ClassManager.getSpellClassIdentifier(spell);
    if (!classIdentifier) return { allowed: true };
    const settings = this.getSettings(actor, classIdentifier);
    if (settings.notifyGm && isChecked && currentPrepared >= maxPrepared) {
      ui.notifications.clear();
      ui.notifications.info(_loc('SPELLBOOK.Notifications.OverLimitWarning', { type: 'spells', current: currentPrepared + 1, max: maxPrepared }));
    }
    return { allowed: true };
  }

  /**
   * Save prepared spells for a specific class.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @param {object} classSpellData - Spell data keyed by classSpellKey
   * @returns {Promise<object>} { cantripChanges, spellChanges }
   */
  static async saveClassSpecificPreparedSpells(actor, classIdentifier, classSpellData) {
    log(3, 'Saving class-specific prepared spells.', { actorName: actor.name, classIdentifier, spellCount: Object.keys(classSpellData).length });
    const classes = ClassManager.detectSpellcastingClasses(actor);
    const defaultPrepMode = classes[classIdentifier]?.preparationMode || SPELL_MODE.SPELL;
    const changes = this._computeChanges(classSpellData);
    const updates = await this._buildSpellUpdates(actor, classIdentifier, classSpellData, defaultPrepMode);
    await this._applyItemChanges(actor, updates.spellsToCreate, updates.spellsToUpdate, updates.spellIdsToRemove);
    await this._updateFlags(actor, classIdentifier, updates.preparedSpellKeys);
    this._cantripCountCache.delete(actor);
    log(3, 'Class-specific prepared spells saved.', { actorName: actor.name, classIdentifier });
    return changes;
  }

  /**
   * Clean up stale preparation flags that don't match actual spells.
   * @param {object} actor - The actor document
   */
  static async cleanupStalePreparationFlags(actor) {
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    let hasChanges = false;
    for (const [classIdentifier, spellKeys] of Object.entries(preparedByClass)) {
      const cleanedKeys = [];
      for (const spellKey of spellKeys) {
        const { spellUuid } = this._parseClassSpellKey(spellKey);
        const actualSpell = actor.itemTypes.spell.find((s) => (s._stats?.compendiumSource === spellUuid || s.uuid === spellUuid) && ClassManager.getSpellClassIdentifier(s) === classIdentifier);
        if (actualSpell) cleanedKeys.push(spellKey);
        else hasChanges = true;
      }
      preparedByClass[classIdentifier] = cleanedKeys;
    }
    if (hasChanges) {
      await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
      await this._updateGlobalPreparedSpellsFlag(actor);
    }
  }

  /**
   * Remove cantrip entries from class-specific prepared spell tracking.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   */
  static async cleanupCantripsForClass(actor, classIdentifier) {
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    if (!preparedByClass[classIdentifier]) return;
    const cleanedSpells = [];
    for (const classSpellKey of preparedByClass[classIdentifier]) {
      const { spellUuid } = this._parseClassSpellKey(classSpellKey);
      const spell = fromUuidSync(spellUuid);
      if (spell && spell.system.level !== 0) cleanedSpells.push(classSpellKey);
    }
    if (cleanedSpells.length !== preparedByClass[classIdentifier].length) {
      preparedByClass[classIdentifier] = cleanedSpells;
      await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
      await this._updateGlobalPreparedSpellsFlag(actor);
    }
  }

  /**
   * Send GM notification with spell/cantrip changes and over-limit warnings.
   * @param {object} notificationData - { actorName, classChanges }
   */
  static async sendNotification(notificationData) {
    const { actorName, classChanges } = notificationData;
    const processedClassChanges = Object.entries(classChanges)
      .map(([key, data]) => {
        const cantripChanges = {
          ...data.cantripChanges,
          removedNames: data.cantripChanges.removed.length > 0 ? data.cantripChanges.removed.join(', ') : null,
          addedNames: data.cantripChanges.added.length > 0 ? data.cantripChanges.added.join(', ') : null,
          hasChanges: data.cantripChanges.added.length > 0 || data.cantripChanges.removed.length > 0
        };
        const spellChanges = {
          ...data.spellChanges,
          removedNames: data.spellChanges.removed.length > 0 ? data.spellChanges.removed.join(', ') : null,
          addedNames: data.spellChanges.added.length > 0 ? data.spellChanges.added.join(', ') : null,
          hasChanges: data.spellChanges.added.length > 0 || data.spellChanges.removed.length > 0
        };
        const overLimits = {
          cantrips: { ...data.overLimits.cantrips, overCount: data.overLimits.cantrips.current - data.overLimits.cantrips.max },
          spells: { ...data.overLimits.spells, overCount: data.overLimits.spells.current - data.overLimits.spells.max }
        };
        const hasChanges = cantripChanges.hasChanges || spellChanges.hasChanges || data.overLimits.cantrips.isOver || data.overLimits.spells.isOver;
        return { classIdentifier: key, ...data, cantripChanges, spellChanges, overLimits, hasChanges };
      })
      .filter((c) => c.hasChanges);
    if (processedClassChanges.length === 0) return;
    const content = await renderTemplate(TEMPLATES.COMPONENTS.CANTRIP_NOTIFICATION, { actorName, classChanges: processedClassChanges });
    await ChatMessage.create({ content, whisper: game.users.filter((u) => u.isGM).map((u) => u.id), flags: { 'spell-book': { messageType: 'update-report' } } });
  }

  /**
   * Attempt to auto-detect the owning class for a spell.
   * @param {object} actor - The actor document
   * @param {object} spell - The spell to analyze
   * @param {object} [classSpellData] - Class spell data for lookup
   * @returns {string|null} The class identifier or null
   */
  static attemptToDetectClassIdentifier(actor, spell, classSpellData = null) {
    const classIdentifiers = Object.keys(actor.spellcastingClasses || {});
    if (classIdentifiers.length === 0) return null;
    if (classIdentifiers.length === 1) return classIdentifiers[0];
    if (classSpellData) {
      const spellUuid = spell.compendiumUuid || spell.uuid;
      for (const classIdentifier of classIdentifiers) {
        const classData = classSpellData[classIdentifier];
        if (classData?.spells?.some((s) => s.compendiumUuid === spellUuid || s.uuid === spellUuid)) return classIdentifier;
      }
    }
    return null;
  }

  /**
   * Compute cantrip/spell change tracking from spell data.
   * @param {object} classSpellData - Spell data keyed by classSpellKey
   * @returns {object} { cantripChanges, spellChanges }
   * @private
   */
  static _computeChanges(classSpellData) {
    const cantripChanges = { added: [], removed: [], hasChanges: false };
    const spellChanges = { added: [], removed: [], hasChanges: false };
    for (const { isPrepared, wasPrepared, spellLevel, name } of Object.values(classSpellData)) {
      if (isPrepared === wasPrepared) continue;
      const target = spellLevel === 0 ? cantripChanges : spellChanges;
      (isPrepared ? target.added : target.removed).push(name);
      target.hasChanges = true;
    }
    return { cantripChanges, spellChanges };
  }

  /**
   * Build arrays of spells to create, update, and remove.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @param {object} classSpellData - Spell data keyed by classSpellKey
   * @param {string} defaultPrepMode - Default preparation mode for this class
   * @returns {Promise<object>} { spellsToCreate, spellsToUpdate, spellIdsToRemove, preparedSpellKeys }
   * @private
   */
  static async _buildSpellUpdates(actor, classIdentifier, classSpellData, defaultPrepMode) {
    const spellsToCreate = [];
    const spellsToUpdate = [];
    const spellIdsToRemove = [];
    const preparedSpellKeys = [];
    const classRules = RuleSet.getClassRules(actor, classIdentifier);
    const ritualCasting = classRules.ritualCasting || RITUAL_CASTING_MODES.NONE;
    for (const [classSpellKey, spellInfo] of Object.entries(classSpellData)) {
      const { uuid, isPrepared, wasPrepared, spellLevel, preparationMode, isRitual } = spellInfo;
      const actualPrepMode = spellLevel > 0 ? preparationMode || defaultPrepMode : SPELL_MODE.SPELL;
      if (isPrepared) {
        preparedSpellKeys.push(classSpellKey);
        await this._ensureSpellOnActor(actor, uuid, classIdentifier, actualPrepMode, spellsToCreate, spellsToUpdate);
        if (isRitual && (ritualCasting === RITUAL_CASTING_MODES.ALWAYS || ritualCasting === RITUAL_CASTING_MODES.PREPARED)) {
          await this._ensureRitualSpellOnActor(actor, uuid, classIdentifier, spellsToCreate);
        }
      } else if (wasPrepared) {
        await this._handleUnpreparingSpell(actor, uuid, classIdentifier, spellIdsToRemove);
        if (isRitual && ritualCasting === RITUAL_CASTING_MODES.ALWAYS) {
          await this._ensureRitualSpellOnActor(actor, uuid, classIdentifier, spellsToCreate);
        } else if (isRitual && ritualCasting !== RITUAL_CASTING_MODES.ALWAYS) {
          // Remove ritual copy when unpreparing and mode isn't 'always'
          const ritualCopy = actor.itemTypes.spell.find(
            (s) => (s._stats?.compendiumSource === uuid || s.uuid === uuid) && ClassManager.getSpellClassIdentifier(s) === classIdentifier && s.system?.method === SPELL_MODE.RITUAL
          );
          if (ritualCopy) spellIdsToRemove.push(ritualCopy.id);
        }
      } else if (isRitual && ritualCasting === RITUAL_CASTING_MODES.ALWAYS) {
        await this._ensureRitualSpellOnActor(actor, uuid, classIdentifier, spellsToCreate);
      }
    }
    return { spellsToCreate, spellsToUpdate, spellIdsToRemove, preparedSpellKeys };
  }

  /**
   * Apply batched embedded document changes.
   * @param {object} actor - The actor document
   * @param {object[]} spellsToCreate - Item data arrays for creation
   * @param {object[]} spellsToUpdate - Update data arrays
   * @param {string[]} spellIdsToRemove - Item IDs to delete
   * @private
   */
  static async _applyItemChanges(actor, spellsToCreate, spellsToUpdate, spellIdsToRemove) {
    if (spellsToCreate.length > 0) await actor.createEmbeddedDocuments('Item', spellsToCreate);
    if (spellsToUpdate.length > 0) await actor.updateEmbeddedDocuments('Item', spellsToUpdate);
    if (spellIdsToRemove.length > 0) await actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
  }

  /**
   * Update preparation flags after saving.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @param {string[]} preparedSpellKeys - Keys of prepared spells
   * @private
   */
  static async _updateFlags(actor, classIdentifier, preparedSpellKeys) {
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const sanitized = Array.isArray(preparedByClass) ? {} : preparedByClass;
    sanitized[classIdentifier] = preparedSpellKeys;
    await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, sanitized);
    await this._updateGlobalPreparedSpellsFlag(actor);
    await this._cleanupUnpreparedSpells(actor);
  }

  /**
   * Ensure a spell exists on the actor with proper class attribution.
   * @param {object} actor - The actor document
   * @param {string} uuid - Spell UUID
   * @param {string} classIdentifier - Owning class identifier
   * @param {string} preparationMode - Preparation mode for this class
   * @param {object[]} spellsToCreate - Array to add creation data to
   * @param {object[]} spellsToUpdate - Array to add update data to
   * @private
   */
  static async _ensureSpellOnActor(actor, uuid, classIdentifier, preparationMode, spellsToCreate, spellsToUpdate) {
    const sourceItem = buildClassSourceItem(classIdentifier);
    const allMatchingSpells = actor.itemTypes.spell.filter((s) => s._stats?.compendiumSource === uuid || s.uuid === uuid);
    const matchingSpells = allMatchingSpells.filter((i) => {
      const spellClassId = ClassManager.getSpellClassIdentifier(i);
      if (spellClassId && spellClassId !== classIdentifier) return false;
      return i.system.prepared !== 2 && !i.flags?.dnd5e?.cachedFor && ![SPELL_MODE.INNATE, SPELL_MODE.AT_WILL].includes(i.system.method);
    });
    const existingPrepared = matchingSpells.find((s) => s.system.method !== SPELL_MODE.RITUAL && s.system.prepared === 1);
    if (existingPrepared) {
      if (existingPrepared.system.method !== preparationMode || existingPrepared.system.prepared !== 1 || existingPrepared.system.sourceItem !== sourceItem) {
        const updateData = { _id: existingPrepared.id, 'system.method': preparationMode, 'system.prepared': 1 };
        if (existingPrepared.system.sourceItem !== sourceItem) updateData['system.sourceItem'] = sourceItem;
        spellsToUpdate.push(updateData);
      }
      return;
    }
    const existingRitual = matchingSpells.find((s) => s.system.method === SPELL_MODE.RITUAL);
    const classRules = RuleSet.getClassRules(actor, classIdentifier);
    if (existingRitual && classRules.ritualCasting === RITUAL_CASTING_MODES.ALWAYS && preparationMode === SPELL_MODE.SPELL) {
      const sourceSpell = await fromUuid(uuid);
      if (sourceSpell) {
        const newSpellData = await game.items.fromCompendium(sourceSpell);
        newSpellData.system.method = preparationMode;
        newSpellData.system.prepared = 1;
        newSpellData.system.sourceItem = sourceItem;
        spellsToCreate.push(newSpellData);
      }
      return;
    }
    const unassigned = allMatchingSpells.find((s) => !ClassManager.getSpellClassIdentifier(s));
    const existingSpell = unassigned || matchingSpells[0];
    if (existingSpell) {
      const updateData = { _id: existingSpell.id, 'system.method': preparationMode, 'system.prepared': 1 };
      if (existingSpell.system.sourceItem !== sourceItem) updateData['system.sourceItem'] = sourceItem;
      spellsToUpdate.push(updateData);
      return;
    }
    const sourceSpell = await fromUuid(uuid);
    if (sourceSpell) {
      const newSpellData = await game.items.fromCompendium(sourceSpell);
      newSpellData.system.method = preparationMode;
      newSpellData.system.prepared = 1;
      newSpellData.system.sourceItem = sourceItem;
      spellsToCreate.push(newSpellData);
    } else {
      log(2, 'Could not find source spell.', { actorName: actor.name, uuid, classIdentifier });
    }
  }

  /**
   * Ensure a ritual copy of a spell exists on the actor.
   * @param {object} actor - The actor document
   * @param {string} uuid - Spell UUID
   * @param {string} classIdentifier - Owning class identifier
   * @param {object[]} spellsToCreate - Array to add creation data to
   * @private
   */
  static async _ensureRitualSpellOnActor(actor, uuid, classIdentifier, spellsToCreate) {
    log(3, 'Ensuring ritual spell on actor.', { actorName: actor.name, uuid, classIdentifier });
    const existingRitual = actor.itemTypes.spell.find(
      (s) => (s._stats?.compendiumSource === uuid || s.uuid === uuid) && ClassManager.getSpellClassIdentifier(s) === classIdentifier && s.system?.method === SPELL_MODE.RITUAL
    );
    if (existingRitual) return;
    const sourceSpell = await fromUuid(uuid);
    if (sourceSpell) {
      const newSpellData = await game.items.fromCompendium(sourceSpell);
      newSpellData.system.method = SPELL_MODE.RITUAL;
      newSpellData.system.prepared = 0;
      newSpellData.system.sourceItem = buildClassSourceItem(classIdentifier);
      newSpellData.flags[MODULE.ID] = newSpellData.flags[MODULE.ID] || {};
      newSpellData.flags[MODULE.ID].isModuleRitual = true;
      spellsToCreate.push(newSpellData);
    } else {
      log(2, 'Could not find source spell for ritual.', { actorName: actor.name, uuid, classIdentifier });
    }
  }

  /**
   * Handle unpreparing a spell — remove or keep as ritual.
   * @param {object} actor - The actor document
   * @param {string} uuid - Spell UUID
   * @param {string} classIdentifier - Owning class identifier
   * @param {string[]} spellIdsToRemove - Array to add removal IDs to
   * @private
   */
  static async _handleUnpreparingSpell(actor, uuid, classIdentifier, spellIdsToRemove) {
    const matchingSpells = actor.itemTypes.spell.filter((s) => {
      if (s._stats?.compendiumSource !== uuid && s.uuid !== uuid) return false;
      if (ClassManager.getSpellClassIdentifier(s) !== classIdentifier) return false;
      return s.system.prepared !== 2 && !s.flags?.dnd5e?.cachedFor && ![SPELL_MODE.INNATE, SPELL_MODE.AT_WILL].includes(s.system.method);
    });
    if (matchingSpells.length === 0) return;
    let targetSpell = matchingSpells.find((s) => s.system.prepared === 1 && s.system.method !== SPELL_MODE.RITUAL);
    if (!targetSpell) targetSpell = matchingSpells.find((s) => s.system.prepared === 1);
    if (!targetSpell) return;
    const isRitual = this._isRitualSpell(targetSpell);
    const classRules = RuleSet.getClassRules(actor, classIdentifier);
    const ritualEnabled = classRules.ritualCasting === RITUAL_CASTING_MODES.ALWAYS;
    if (isRitual && ritualEnabled && targetSpell.system.level > 0) {
      if (targetSpell.system.method === SPELL_MODE.RITUAL) return;
      spellIdsToRemove.push(targetSpell.id);
      return;
    }
    spellIdsToRemove.push(targetSpell.id);
  }

  /**
   * Update the global prepared spells flag (backward compatibility).
   * @param {object} actor - The actor document
   * @private
   */
  static async _updateGlobalPreparedSpellsFlag(actor) {
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const allPreparedUuids = Object.values(preparedByClass)
      .flat()
      .map((key) => {
        const { spellUuid } = this._parseClassSpellKey(key);
        return spellUuid;
      });
    await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
  }

  /**
   * Auto-delete unprepared spells if setting is enabled.
   * @param {object} actor - The actor document
   * @private
   */
  static async _cleanupUnpreparedSpells(actor) {
    if (!game.settings.get(MODULE.ID, SETTINGS.AUTO_DELETE_UNPREPARED_SPELLS)) return;
    const unprepared = actor.itemTypes.spell.filter((s) => s.system.method === SPELL_MODE.SPELL && s.system.prepared === 0 && !s.flags?.dnd5e?.cachedFor);
    if (unprepared.length > 0)
      await actor.deleteEmbeddedDocuments(
        'Item',
        unprepared.map((s) => s.id)
      );
  }

  /**
   * Calculate max cantrips for a class from scale values and rules.
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Maximum cantrips
   * @private
   */
  static _calculateMaxCantripsForClass(actor, classIdentifier) {
    const cantripScaleKeys = game.settings
      .get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES)
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    let baseCantrips = 0;
    const scaleValues = this._getScaleValuesForClass(actor, classIdentifier);
    if (scaleValues) {
      for (const key of cantripScaleKeys) {
        const cantripValue = scaleValues[key]?.value;
        if (cantripValue !== undefined) {
          baseCantrips = Number(cantripValue);
          break;
        }
      }
    }
    if (baseCantrips === 0) return 0;
    if (RuleSet.getClassRule(actor, classIdentifier, 'showCantrips', true) === false) return 0;
    const bonus = RuleSet.getClassRule(actor, classIdentifier, 'cantripPreparationBonus', 0);
    return Math.max(0, baseCantrips + bonus);
  }

  /**
   * Get total max cantrips across all spellcasting classes.
   * @param {object} actor - The actor document
   * @returns {number} Total max cantrips
   * @private
   */
  static _getTotalMaxCantrips(actor) {
    const classes = ClassManager.detectSpellcastingClasses(actor);
    let total = 0;
    for (const identifier of Object.keys(classes)) total += this.getMaxCantrips(actor, identifier);
    return total;
  }

  /**
   * Get swap tracking data from actor flags.
   * @param {object} actor - The actor document
   * @param {boolean} isLevelUp - During level-up
   * @param {boolean} isLongRest - During long rest
   * @param {string} classIdentifier - The class identifier
   * @returns {object} Tracking data with hasUnlearned, unlearned, hasLearned, learned, originalChecked
   * @private
   */
  static _getSwapTrackingData(actor, isLevelUp, isLongRest, classIdentifier) {
    if (!isLevelUp && !isLongRest) return { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
    const flagName = isLevelUp ? `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.levelUp` : `${FLAGS.CANTRIP_SWAP_TRACKING}.${classIdentifier}.longRest`;
    return actor.getFlag(MODULE.ID, flagName) || { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
  }

  /**
   * Get merged scale values for a class (class + subclass).
   * @param {object} actor - The actor document
   * @param {string} classIdentifier - The class identifier
   * @returns {object|null} Merged scale values or null
   * @private
   */
  static _getScaleValuesForClass(actor, classIdentifier) {
    const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
    if (!spellcastingData) return null;
    let merged = {};
    const classItem = actor.items.get(spellcastingData.id);
    if (classItem?.scaleValues) merged = { ...merged, ...classItem.scaleValues };
    if (spellcastingData._classLink?.scaleValues) merged = { ...merged, ...spellcastingData._classLink.scaleValues };
    if (spellcastingData.scaleValues) merged = { ...merged, ...spellcastingData.scaleValues };
    return Object.keys(merged).length > 0 ? merged : null;
  }

  /**
   * @param {string} spellUuid - Spell UUID
   * @param {string} classIdentifier - Class identifier
   * @returns {string} Combined key
   * @private
   */
  static _createClassSpellKey(spellUuid, classIdentifier) {
    return `${classIdentifier}:${spellUuid}`;
  }

  /**
   * @param {string} key - Combined class-spell key
   * @returns {object} { classIdentifier, spellUuid }
   * @private
   */
  static _parseClassSpellKey(key) {
    const [classIdentifier, ...uuidParts] = key.split(':');
    return { classIdentifier, spellUuid: uuidParts.join(':') };
  }

  /**
   * @param {object} spell - The spell item
   * @returns {boolean} Whether spell has ritual property
   * @private
   */
  static _isRitualSpell(spell) {
    if (spell.system?.properties instanceof Set) return spell.system.properties.has('ritual');
    if (Array.isArray(spell.system?.properties)) return spell.system.properties.includes('ritual');
    return spell.system?.components?.ritual || false;
  }
}
