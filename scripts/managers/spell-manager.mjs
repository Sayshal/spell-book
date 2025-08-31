import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as UIHelpers from '../ui/_module.mjs';
import { CantripManager, RuleSetManager } from './_module.mjs';

/**
 * Manages spell preparation and related functionality
 */
export class SpellManager {
  /**
   * Create a new SpellManager for an actor
   * @param {Actor5e} actor The actor to manage spells for
   */
  constructor(actor) {
    this.actor = actor;
    this.isWizard = DataHelpers.isWizard(actor);
    this._wizardSpellbookCache = null;
    this._wizardManager = null;
    this.cantripManager = new CantripManager(actor, this);
  }

  /**
   * Get cantrip and spell settings for the actor
   * @param {string} classIdentifier Class identifier for class-specific rules (required)
   * @returns {Object} Actor's spell settings
   */
  getSettings(classIdentifier) {
    if (!classIdentifier) {
      return {
        cantripSwapping: 'none',
        spellSwapping: 'none',
        ritualCasting: 'none',
        showCantrips: true,
        behavior: this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM
      };
    }

    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    return {
      cantripSwapping: classRules.cantripSwapping || 'none',
      spellSwapping: classRules.spellSwapping || 'none',
      ritualCasting: classRules.ritualCasting || 'none',
      showCantrips: classRules.showCantrips !== false,
      behavior: this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM
    };
  }

  /**
   * Get maximum allowed cantrips for the actor using cached values when available
   * @param {string} classIdentifier The class identifier to check
   * @returns {number} Maximum allowed cantrips for this class
   */
  getMaxAllowed(classIdentifier) {
    if (!classIdentifier) return 0;
    return this.cantripManager._getMaxCantripsForClass(classIdentifier);
  }

  /**
   * Get the current count of prepared cantrips for a specific class
   * @param {string} classIdentifier The class identifier
   * @returns {number} Currently prepared cantrips count for this class
   */
  getCurrentCount(classIdentifier) {
    if (!classIdentifier) return 0;
    return this.cantripManager.getCurrentCount(classIdentifier);
  }

  /**
   * Get the preparation status for a given spell
   * @param {Object} spell The spell to check
   * @param {string} classIdentifier The specific class context
   * @returns {Object} Preparation status information
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
    const spellUuid = spell.compendiumUuid || spell.uuid || DataHelpers.getSpellUuid(spell);
    const actualSpell = this.actor.items.find(
      (item) => item.type === 'spell' && (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) && (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier)
    );
    if (actualSpell) return this._getOwnedSpellPreparationStatus(actualSpell, classIdentifier);
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
      return this._getOwnedSpellPreparationStatus(unassignedSpell, classIdentifier);
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
          disabledReason: game.i18n.format('SPELLBOOK.Preparation.PreparedByOtherClass', {
            class: classItem?.name || otherClass
          }),
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
          disabledReason: game.i18n.format('SPELLBOOK.Preparation.AlwaysPreparedByClass', {
            class: classItem?.name || sourceClass || 'Feature'
          }),
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
          disabledReason: game.i18n.format('SPELLBOOK.SpellSource.GrantedByItem', {
            item: grantingItem?.name || 'Feature'
          }),
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
          disabledReason: game.i18n.format('SPELLBOOK.Preparation.SpecialModeByClass', {
            mode: localizedMode,
            class: classItem?.name || sourceClass || classIdentifier
          }),
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
   * Create a unique key for class-spell combinations
   * @param {string} spellUuid The spell UUID
   * @param {string} classIdentifier The class identifier
   * @returns {string} Unique key for this class-spell combination
   */
  _createClassSpellKey(spellUuid, classIdentifier) {
    return `${classIdentifier}:${spellUuid}`;
  }

  /**
   * Parse a class-spell key back into components
   * @param {string} key The class-spell key
   * @returns {Object} Object with classIdentifier and spellUuid
   */
  _parseClassSpellKey(key) {
    const [classIdentifier, ...uuidParts] = key.split(':');
    return { classIdentifier, spellUuid: uuidParts.join(':') };
  }

  /**
   * Get preparation status for a spell that's on the actor
   * @param {Item5e} spell The spell item
   * @param {string} classIdentifier The class identifier for context
   * @returns {Object} - Preparation status information
   */
  _getOwnedSpellPreparationStatus(spell, classIdentifier) {
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
   * Determine the source of a spell on the actor
   * @param {Item5e} spell The spell item
   * @returns {Object|null} - Source information for the spell
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
   * Save prepared spells for a specific class
   * @param {string} classIdentifier The class identifier
   * @param {Object} classSpellData Object with spell data keyed by classSpellKey
   * @returns {Promise<Object>} Result object with cantrip changes
   */
  async saveClassSpecificPreparedSpells(classIdentifier, classSpellData) {
    if (!classIdentifier || !classSpellData) return null;

    const spellsToCreate = [];
    const spellsToUpdate = [];
    const spellIdsToRemove = [];
    const preparedSpellKeys = [];

    // Get the DEFAULT preparation mode for this class
    const defaultPreparationMode = this._getClassPreparationMode(classIdentifier);

    // Track cantrip changes for notification purposes
    const cantripChanges = { added: [], removed: [], hasChanges: false };

    // Process each spell in the class data
    for (const [classSpellKey, spellInfo] of Object.entries(classSpellData)) {
      const { uuid, isPrepared, wasPrepared, spellLevel, preparationMode, name } = spellInfo;

      // Track cantrip changes for notifications
      if (spellLevel === 0) {
        if (isPrepared && !wasPrepared) {
          cantripChanges.added.push(name || 'Unknown Cantrip');
          cantripChanges.hasChanges = true;
        } else if (!isPrepared && wasPrepared) {
          cantripChanges.removed.push(name || 'Unknown Cantrip');
          cantripChanges.hasChanges = true;
        }
      }

      // Use the spell-specific preparation mode from form data
      // For cantrips (level 0), always use 'spell' mode regardless of class
      // For leveled spells, use the mode from the form data OR default to class mode
      let actualPreparationMode = 'spell';
      if (spellLevel > 0) {
        actualPreparationMode = preparationMode || defaultPreparationMode;
      }

      if (isPrepared) {
        // Add to prepared list
        preparedSpellKeys.push(classSpellKey);

        // Ensure spell exists on actor with correct mode
        await this._ensureSpellOnActor(uuid, classIdentifier, actualPreparationMode, spellsToCreate, spellsToUpdate);
      } else if (wasPrepared) {
        // Handle unpreparing
        await this._handleUnpreparingSpell(uuid, classIdentifier, spellIdsToRemove, spellsToUpdate);
      }
    }

    // Update the prepared spells flag for this class
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};

    // Ensure preparedByClass is an object, not an array
    if (Array.isArray(preparedByClass)) {
      const newPreparedByClass = {};
      newPreparedByClass[classIdentifier] = preparedSpellKeys;
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, newPreparedByClass);
    } else {
      preparedByClass[classIdentifier] = preparedSpellKeys;
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
    }

    // Apply updates
    if (spellsToCreate.length > 0) {
      await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
    }

    if (spellsToUpdate.length > 0) {
      await this.actor.updateEmbeddedDocuments('Item', spellsToUpdate);
    }

    if (spellIdsToRemove.length > 0) {
      await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    }

    // Update global prepared spells flag
    await this._updateGlobalPreparedSpellsFlag();

    // Return cantrip changes for GM notification purposes
    return { cantripChanges };
  }

  /**
   * Clean up ritual spells created by our module for a specific class
   * @param {string} classIdentifier The class identifier
   * @param {Array} spellIdsToRemove Array to add removal IDs to
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
   * Ensure a ritual spell exists on the actor in ritual mode
   * @param {string} uuid Spell UUID
   * @param {string} sourceClass Source class identifier
   * @param {Array} spellsToCreate Array to add creation data to
   * @param {Array} spellsToUpdate Array to add update data to
   * @returns {Promise<void>}
   */
  async _ensureRitualSpellOnActor(uuid, sourceClass, spellsToCreate, spellsToUpdate) {
    const existingSpell = this.actor.items.find(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );
    if (existingSpell) {
      if (existingSpell.system.method !== 'ritual') {
        const updateData = {
          _id: existingSpell.id,
          'system.method': 'ritual',
          'system.prepared': 0,
          'system.sourceClass': sourceClass,
          [`flags.${MODULE.ID}.isModuleRitual`]: true
        };
        spellsToUpdate.push(updateData);
      }
    } else {
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
      }
    }
  }

  /**
   * Get the preparation mode for a specific class
   * @param {string} classIdentifier The class identifier
   * @returns {string} The preparation mode (prepared, pact, etc.)
   */
  _getClassPreparationMode(classIdentifier) {
    const spellcastingConfig = DataHelpers.getSpellcastingConfigForClass(this.actor, classIdentifier);
    if (spellcastingConfig?.type === 'pact') return 'pact';
    return 'spell';
  }

  /**
   * Ensure a spell exists on the actor with proper class attribution
   * @param {string} uuid Spell UUID
   * @param {string} sourceClass Source class identifier
   * @param {string} preparationMode Preparation mode for this class
   * @param {Array} spellsToCreate Array to add creation data to
   * @param {Array} spellsToUpdate Array to add update data to
   * @returns {Promise<void>}
   */
  async _ensureSpellOnActor(uuid, sourceClass, preparationMode, spellsToCreate, spellsToUpdate) {
    // Find ANY existing spell with this UUID and sourceClass, regardless of method
    const existingSpell = this.actor.items.find(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );

    if (existingSpell) {
      // Special handling for ritual spells
      let targetMode = preparationMode;
      let targetPrepared = 1;

      if (existingSpell.system.method === 'ritual') {
        targetMode = 'spell'; // Rituals should stay as 'spell' method
        targetPrepared = 1;
      }

      // Check if we need to update the existing spell
      if (existingSpell.system.method !== targetMode || existingSpell.system.prepared !== targetPrepared || existingSpell.system.sourceClass !== sourceClass) {
        const updateData = {
          _id: existingSpell.id,
          'system.method': targetMode,
          'system.prepared': targetPrepared
        };

        if (existingSpell.system.sourceClass !== sourceClass) {
          updateData['system.sourceClass'] = sourceClass;
        }

        spellsToUpdate.push(updateData);
      }
      // If everything matches, do nothing
      return;
    }

    // No existing spell found, create new one
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
   * Update the global prepared spells flag for backward compatibility
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
   * Handle unpreparing a spell for a specific class
   * @todo - Make sure classRules is set to actual identifier
   * @param {string} uuid Spell UUID
   * @param {string} sourceClass Source class identifier
   * @param {Array} spellIdsToRemove Array to add removal IDs to
   * @param {Array} spellsToUpdate Array to add update data to
   * @returns {Promise<void>}
   */
  async _handleUnpreparingSpell(uuid, sourceClass, spellIdsToRemove, spellsToUpdate) {
    const targetSpell = this.actor.items.find(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );
    if (!targetSpell) return;
    const isAlwaysPrepared = targetSpell.system.prepared === 2;
    const isGranted = !!targetSpell.flags?.dnd5e?.cachedFor;
    const isFromClassFeature = targetSpell.system.prepared === 2;
    if (isAlwaysPrepared || isGranted || isFromClassFeature) return;
    const isRitualSpell = targetSpell.system.components?.ritual;
    const isWizard = DataHelpers.isWizard(this.actor);
    const classRules = RuleSetManager.getClassRules(this.actor, 'wizard');
    const ritualCastingEnabled = classRules.ritualCasting !== 'none';
    if (isRitualSpell && isWizard && ritualCastingEnabled && targetSpell.system.level > 0) {
      spellsToUpdate.push({ _id: targetSpell.id, 'system.method': 'ritual', 'system.prepared': 0 });
      log(3, `Converting wizard spell back to ritual mode: ${targetSpell.name}`);
      return;
    }
    spellIdsToRemove.push(targetSpell.id);
    log(3, `Marking spell for removal: ${targetSpell.name} (${sourceClass})`);
  }

  /**
   * Clean up cantrip entries from class-specific prepared spells
   * @param {string} classIdentifier The class identifier
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
   * Clean up stale preparation flags that don't correspond to actual spells
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
   * Determine if a spell can be changed based on class rules and current state
   * @param {Item5e} spell The spell being modified
   * @param {boolean} isChecked Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} wasPrepared Whether the spell was previously prepared
   * @param {boolean} isLevelUp Whether this is during level-up
   * @param {boolean} isLongRest Whether this is during a long rest
   * @param {string} classIdentifier The class identifier
   * @param {number} currentPrepared Current number of prepared spells for this class
   * @param {number} maxPrepared Maximum allowed prepared spells for this class
   * @returns {Object} Status object with allowed and message properties
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
}
