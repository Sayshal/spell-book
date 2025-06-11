import { FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
import * as formattingUtils from '../helpers/spell-formatting.mjs';
import { log } from '../logger.mjs';
import { CantripManager } from './cantrip-manager.mjs';
import { RitualManager } from './ritual-manager.mjs';
import { RuleSetManager } from './rule-set-manager.mjs';
import { WizardSpellbookManager } from './wizard-spellbook-manager.mjs';

/**
 * Manages spell preparation and related functionality
 */
export class SpellManager {
  /**
   * Create a new SpellManager for an actor
   * @param {Actor5e} actor - The actor to manage spells for
   * @param {PlayerSpellBook} [spellbook] - The spellbook application for cached values
   */
  constructor(actor, spellbook = null) {
    this.actor = actor;
    this.spellbook = spellbook;
    this.classItem = genericUtils.findSpellcastingClass(actor);
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
    this.isWizard = genericUtils.isWizard(actor);
    this._wizardSpellbookCache = null;
    this._wizardManager = null;
    this.cantripManager = new CantripManager(actor, this, spellbook);
  }

  /**
   * Get cantrip and spell settings for the actor
   * @param {string} classIdentifier - Class identifier for class-specific rules (required)
   * @returns {Object} Actor's spell settings
   */
  getSettings(classIdentifier) {
    if (!classIdentifier) {
      return {
        cantripSwapping: 'none',
        spellSwapping: 'none',
        ritualCasting: 'none',
        showCantrips: true,
        behavior:
          this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM
      };
    }

    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    return {
      cantripSwapping: classRules.cantripSwapping || 'none',
      spellSwapping: classRules.spellSwapping || 'none',
      ritualCasting: classRules.ritualCasting || 'none',
      showCantrips: classRules.showCantrips !== false,
      behavior:
        this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM
    };
  }

  /**
   * Get maximum allowed cantrips for the actor using cached values when available
   * @param {string} classIdentifier - The class identifier to check
   * @returns {number} Maximum allowed cantrips for this class
   */
  getMaxAllowed(classIdentifier) {
    if (!classIdentifier) return 0;
    return this.cantripManager._getMaxCantripsForClass(classIdentifier);
  }

  /**
   * Calculate maximum prepared spells for the actor
   * @returns {number} Maximum allowed prepared spells
   */
  getMaxPrepared() {
    if (!this.classItem?.system?.spellcasting?.preparation?.max) return 0;
    return this.classItem.system.spellcasting.preparation.max;
  }

  /**
   * Get the current count of prepared cantrips for a specific class
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Currently prepared cantrips count for this class
   */
  getCurrentCount(classIdentifier) {
    if (!classIdentifier) return 0;
    return this.cantripManager.getCurrentCount(classIdentifier);
  }

  /**
   * Save settings to the actor
   * @param {string} rules - The rules type to use
   * @param {string} behavior - The enforcement behavior to use
   * @returns {Promise<boolean>} Success state
   */
  async saveSettings(rules, behavior) {
    await this.actor.update({
      [`flags.${MODULE.ID}.${FLAGS.CANTRIP_RULES}`]: rules,
      [`flags.${MODULE.ID}.${FLAGS.ENFORCEMENT_BEHAVIOR}`]: behavior
    });
    this.settings = this.getSettings();
    return true;
  }

  /**
   * Refresh manager state with latest actor data
   */
  refresh() {
    this.classItem = genericUtils.findSpellcastingClass(this.actor);
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
    this.isWizard = genericUtils.isWizard(this.actor);
    this._wizardSpellbookCache = null;
    this._wizardManager = null;
    this.cantripManager = new CantripManager(this.actor, this);
    this.ritualManager = new RitualManager(this.actor);
  }

  /**
   * Get preparation status for a spell with class-specific awareness
   * @param {Item5e} spell - The spell to check
   * @param {string} classIdentifier - The specific class context
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
    const spellUuid = spell.compendiumUuid || spell.uuid;
    const actualSpell = this.actor.items.find(
      (item) =>
        item.type === 'spell' &&
        (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) &&
        (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier)
    );
    if (actualSpell) return this._getOwnedSpellPreparationStatus(actualSpell, classIdentifier);
    const unassignedSpell = this.actor.items.find(
      (item) => item.type === 'spell' && (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) && !item.system?.sourceClass && !item.sourceClass
    );
    if (unassignedSpell && classIdentifier) {
      const isAlwaysPrepared = unassignedSpell.system.preparation?.mode === 'always';
      const isGranted = !!unassignedSpell.flags?.dnd5e?.cachedFor;
      const isSpecialMode = ['innate', 'pact', 'atwill', 'ritual'].includes(unassignedSpell.system.preparation?.mode);
      if (!isAlwaysPrepared && !isGranted && !isSpecialMode) {
        unassignedSpell.sourceClass = classIdentifier;
        if (unassignedSpell.system) unassignedSpell.system.sourceClass = classIdentifier;
      }
      return this._getOwnedSpellPreparationStatus(unassignedSpell, classIdentifier);
    }
    const otherClassSpell = this.actor.items.find(
      (item) =>
        item.type === 'spell' && (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) && item.system?.sourceClass && item.system.sourceClass !== classIdentifier
    );
    if (otherClassSpell) return defaultStatus;
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];
    const spellKey = this._createClassSpellKey(spellUuid, classIdentifier);
    const isPreparedForClass = classPreparedSpells.includes(spellKey);
    defaultStatus.prepared = isPreparedForClass;
    if (spell.system.level === 0 && classIdentifier) {
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
   * @param {string} spellUuid - The spell UUID
   * @param {string} classIdentifier - The class identifier
   * @returns {string} Unique key for this class-spell combination
   * @private
   */
  _createClassSpellKey(spellUuid, classIdentifier) {
    return `${classIdentifier}:${spellUuid}`;
  }

  /**
   * Parse a class-spell key back into components
   * @param {string} key - The class-spell key
   * @returns {Object} Object with classIdentifier and spellUuid
   * @private
   */
  _parseClassSpellKey(key) {
    const [classIdentifier, ...uuidParts] = key.split(':');
    return { classIdentifier, spellUuid: uuidParts.join(':') };
  }

  /**
   * Get preparation status for a spell that's on the actor
   * @param {Item5e} spell - The spell item
   * @param {string} classIdentifier - The class identifier for context
   * @returns {Object} - Preparation status information
   * @private
   */
  _getOwnedSpellPreparationStatus(spell, classIdentifier) {
    const preparationMode = spell.system.preparation?.mode;
    const alwaysPrepared = preparationMode === 'always';
    const isInnateCasting = preparationMode === 'innate';
    const isAtWill = preparationMode === 'atwill';
    const localizedPreparationMode = formattingUtils.getLocalizedPreparationMode(preparationMode);
    const sourceInfo = this._determineSpellSource(spell);
    const isGranted = !!sourceInfo && !!spell.flags?.dnd5e?.cachedFor;
    const isCantrip = spell.system.level === 0;
    const actuallyPrepared = !!(isGranted || alwaysPrepared || isInnateCasting || isAtWill || spell.system.preparation?.prepared);
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
   * @param {Item5e} spell - The spell item
   * @returns {Object|null} - Source information for the spell
   * @private
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
    const preparationMode = spell.system.preparation?.mode;
    if (preparationMode === 'always') {
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) return { name: subclass.name, type: 'subclass', id: subclass.id };
    } else if (preparationMode === 'pact') {
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) return { name: subclass.name, type: 'subclass', id: subclass.id };
      return { name: game.i18n.localize('SPELLBOOK.SpellSource.PactMagic'), type: 'class' };
    } else {
      const classItem = this.actor.items.find((i) => i.type === 'class');
      if (classItem) return { name: classItem.name, type: 'class', id: classItem.id };
    }
    return null;
  }

  /**
   * Save prepared spells to the actor
   * @param {Object} spellData - Object mapping spell UUIDs to preparation data
   * @returns {Promise<Object>} Object containing cantrip changes and save results
   */
  async saveActorPreparedSpells(spellData) {
    log(3, `Saving prepared spells for ${this.actor.name}`);
    const cantripChanges = { added: [], removed: [], hasChanges: false };
    const preparedByClass = {};
    Object.entries(spellData).forEach(([uuid, data]) => {
      if (data.isPrepared) {
        const sourceClass = data.sourceClass || 'unknown';
        if (!preparedByClass[sourceClass]) preparedByClass[sourceClass] = [];
        preparedByClass[sourceClass].push(uuid);
      }
    });
    await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
    const allPreparedUuids = Object.values(preparedByClass).flat();
    await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
    log(3, `Saved prepared spells to actor flags by class`);
    const spellIdsToRemove = [];
    const spellsToUpdate = [];
    const spellsToCreate = [];
    for (const [uuid, data] of Object.entries(spellData)) {
      if (data.isAlwaysPrepared) continue;
      const isRitual = data.isRitual || false;
      const existingSpell = this.actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid));
      const spellSourceClass = data.sourceClass || '';
      if (!data.isPrepared) {
        if (data.wasPrepared && existingSpell) {
          if (existingSpell.system.preparation?.mode === 'prepared' && !existingSpell.system.preparation?.alwaysPrepared) {
            spellIdsToRemove.push(existingSpell.id);
            if (existingSpell.system.level === 0) {
              cantripChanges.removed.push({ name: existingSpell.name, uuid: uuid });
              cantripChanges.hasChanges = true;
            }
          }
        }
      } else {
        if (existingSpell) {
          const updateData = { '_id': existingSpell.id, 'system.preparation.mode': 'prepared', 'system.preparation.prepared': true };
          if (spellSourceClass && existingSpell.system.sourceClass !== spellSourceClass) updateData['system.sourceClass'] = spellSourceClass;
          spellsToUpdate.push(updateData);
        } else {
          const sourceSpell = await fromUuid(uuid);
          if (sourceSpell) {
            const newSpellData = sourceSpell.toObject();
            if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
            newSpellData.system.preparation.mode = 'prepared';
            newSpellData.system.preparation.prepared = true;
            newSpellData.flags = newSpellData.flags || {};
            newSpellData.flags.core = newSpellData.flags.core || {};
            newSpellData.flags.core.sourceId = uuid;
            if (spellSourceClass) newSpellData.system.sourceClass = spellSourceClass;
            spellsToCreate.push(newSpellData);
            if (sourceSpell.system.level === 0) {
              cantripChanges.added.push({ name: sourceSpell.name, uuid });
              cantripChanges.hasChanges = true;
            }
          }
        }
      }
    }
    if (spellIdsToRemove.length > 0) {
      log(3, `Removing ${spellIdsToRemove.length} spells from actor`);
      await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    }
    if (spellsToUpdate.length > 0) {
      log(3, `Updating ${spellsToUpdate.length} spells on actor`);
      await this.actor.updateEmbeddedDocuments('Item', spellsToUpdate);
    }
    if (spellsToCreate.length > 0) {
      log(3, `Creating ${spellsToCreate.length} spells on actor`);
      await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
    }
    return { cantripChanges };
  }

  /**
   * Get the wizard spellbook manager if the actor is a wizard
   * @returns {WizardSpellbookManager|null} The wizard spellbook manager or null
   */
  getWizardManager() {
    if (!this._wizardManager && this.isWizard) this._wizardManager = new WizardSpellbookManager(this.actor);
    return this._wizardManager;
  }

  /**
   * Check if a spell is in the wizard's spellbook
   * @param {string} uuid - UUID of the spell to check
   * @returns {Promise<boolean>} Whether the spell is in the spellbook
   */
  async isSpellInWizardBook(uuid) {
    const wizardManager = this.getWizardManager();
    if (!wizardManager) return false;
    if (!this._wizardSpellbookCache) this._wizardSpellbookCache = await wizardManager.getSpellbookSpells();
    return this._wizardSpellbookCache.includes(uuid);
  }

  /**
   * Save prepared spells for a specific class
   * @param {string} classIdentifier - The class identifier
   * @param {Object} classSpellData - Object mapping class-spell keys to preparation data
   * @returns {Promise<Object>} Object containing cantrip changes and save results
   */
  async saveClassSpecificPreparedSpells(classIdentifier, classSpellData) {
    log(3, `Saving prepared spells for class ${classIdentifier}`);
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const currentClassPrepared = preparedByClass[classIdentifier] || [];
    const preparationMode = this._getClassPreparationMode(classIdentifier);
    const newClassPrepared = [];
    const spellsToUpdate = [];
    const spellsToCreate = [];
    const spellIdsToRemove = [];
    const cantripChanges = { added: [], removed: [], hasChanges: false };
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    const supportsRitualCasting = classRules.ritualCasting === 'always';
    if (!supportsRitualCasting) await this._cleanupModuleRitualSpells(classIdentifier, spellIdsToRemove);
    for (const [classSpellKey, data] of Object.entries(classSpellData)) {
      const { uuid, isPrepared, wasPrepared, isRitual, sourceClass, name } = data;
      if (isPrepared) {
        newClassPrepared.push(classSpellKey);
        if (!wasPrepared && data.spellLevel === 0) {
          cantripChanges.added.push({ name, uuid });
          cantripChanges.hasChanges = true;
        }
        await this._ensureSpellOnActor(uuid, sourceClass, preparationMode, spellsToCreate, spellsToUpdate);
      } else if (!isPrepared && isRitual && supportsRitualCasting) {
        await this._ensureRitualSpellOnActor(uuid, sourceClass, spellsToCreate, spellsToUpdate);
      } else if (wasPrepared && !isRitual) {
        if (data.spellLevel === 0) {
          cantripChanges.removed.push({ name, uuid });
          cantripChanges.hasChanges = true;
        }
        await this._handleUnpreparingSpell(uuid, sourceClass, spellIdsToRemove, spellsToUpdate);
      }
    }
    preparedByClass[classIdentifier] = newClassPrepared;
    await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
    if (spellIdsToRemove.length > 0) {
      log(3, `Removing ${spellIdsToRemove.length} spells from actor`);
      await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    }
    if (spellsToUpdate.length > 0) {
      log(3, `Updating ${spellsToUpdate.length} spells on actor`);
      await this.actor.updateEmbeddedDocuments('Item', spellsToUpdate);
    }
    if (spellsToCreate.length > 0) {
      log(3, `Creating ${spellsToCreate.length} spells on actor`);
      await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
    }
    await this._updateGlobalPreparedSpellsFlag();
    return { cantripChanges };
  }

  /**
   * Clean up ritual spells created by our module for a specific class
   * @param {string} classIdentifier - The class identifier
   * @param {Array} spellIdsToRemove - Array to add removal IDs to
   * @returns {Promise<void>}
   * @private
   */
  async _cleanupModuleRitualSpells(classIdentifier, spellIdsToRemove) {
    const moduleRitualSpells = this.actor.items.filter(
      (item) =>
        item.type === 'spell' &&
        item.system?.preparation?.mode === 'ritual' &&
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
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {Array} spellsToCreate - Array to add creation data to
   * @param {Array} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   * @private
   */
  async _ensureRitualSpellOnActor(uuid, sourceClass, spellsToCreate, spellsToUpdate) {
    const existingSpell = this.actor.items.find(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );
    if (existingSpell) {
      if (existingSpell.system.preparation?.mode !== 'ritual') {
        const updateData = {
          '_id': existingSpell.id,
          'system.preparation.mode': 'ritual',
          'system.preparation.prepared': false,
          'system.sourceClass': sourceClass,
          [`flags.${MODULE.ID}.isModuleRitual`]: true
        };
        spellsToUpdate.push(updateData);
      }
    } else {
      const sourceSpell = await fromUuid(uuid);
      if (sourceSpell) {
        const newSpellData = sourceSpell.toObject();
        if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
        newSpellData.system.preparation.mode = 'ritual';
        newSpellData.system.preparation.prepared = false;
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
   * @param {string} classIdentifier - The class identifier
   * @returns {string} The preparation mode (prepared, pact, etc.)
   * @private
   */
  _getClassPreparationMode(classIdentifier) {
    const classItem = this.actor.items.find((i) => i.type === 'class' && (i.system.identifier?.toLowerCase() === classIdentifier || i.name.toLowerCase() === classIdentifier));
    if (!classItem) return 'prepared';
    if (classItem.system.spellcasting?.type === 'pact') return 'pact';
    return 'prepared';
  }

  /**
   * Ensure a spell exists on the actor with proper class attribution
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {string} preparationMode - Preparation mode for this class
   * @param {Array} spellsToCreate - Array to add creation data to
   * @param {Array} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   * @private
   */
  async _ensureSpellOnActor(uuid, sourceClass, preparationMode, spellsToCreate, spellsToUpdate) {
    const existingSpell = this.actor.items.find(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );
    if (existingSpell) {
      let targetMode = preparationMode;
      let targetPrepared = true;
      if (existingSpell.system.preparation?.mode === 'ritual') {
        targetMode = 'prepared';
        targetPrepared = true;
      }
      const updateData = { '_id': existingSpell.id, 'system.preparation.mode': targetMode, 'system.preparation.prepared': targetPrepared };
      if (existingSpell.system.sourceClass !== sourceClass) updateData['system.sourceClass'] = sourceClass;
      spellsToUpdate.push(updateData);
    } else {
      const sourceSpell = await fromUuid(uuid);
      if (sourceSpell) {
        const newSpellData = sourceSpell.toObject();
        if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
        newSpellData.system.preparation.mode = preparationMode;
        newSpellData.system.preparation.prepared = true;
        newSpellData.flags = newSpellData.flags || {};
        newSpellData.flags.core = newSpellData.flags.core || {};
        newSpellData.flags.core.sourceId = uuid;
        newSpellData.system.sourceClass = sourceClass;
        spellsToCreate.push(newSpellData);
      }
    }
  }

  /**
   * Update the global prepared spells flag for backward compatibility
   * @returns {Promise<void>}
   * @private
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
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {Array} spellIdsToRemove - Array to add removal IDs to
   * @param {Array} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   * @private
   */
  async _handleUnpreparingSpell(uuid, sourceClass, spellIdsToRemove, spellsToUpdate) {
    const targetSpell = this.actor.items.find(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );
    if (!targetSpell) return;
    const isAlwaysPrepared = targetSpell.system.preparation?.alwaysPrepared;
    const isGranted = !!targetSpell.flags?.dnd5e?.cachedFor;
    const isFromClassFeature = targetSpell.system.preparation?.mode === 'always';
    if (isAlwaysPrepared || isGranted || isFromClassFeature) return;
    const isRitualSpell = targetSpell.system.components?.ritual;
    const isWizard = genericUtils.isWizard(this.actor);
    const ritualCastingEnabled = this.ritualManager?.isRitualCastingEnabled();
    if (isRitualSpell && isWizard && ritualCastingEnabled && targetSpell.system.level > 0) {
      spellsToUpdate.push({ '_id': targetSpell.id, 'system.preparation.mode': 'ritual', 'system.preparation.prepared': false });
      log(3, `Converting wizard spell back to ritual mode: ${targetSpell.name}`);
      return;
    }
    spellIdsToRemove.push(targetSpell.id);
    log(3, `Marking spell for removal: ${targetSpell.name} (${sourceClass})`);
  }

  /**
   * Find other classes that have this spell prepared
   * @param {string} uuid - Spell UUID to check
   * @param {string} excludeClass - Class to exclude from search
   * @returns {Promise<Array<string>>} Array of class identifiers using this spell
   * @private
   */
  async _findOtherClassesUsingSpell(uuid, excludeClass) {
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const usingClasses = [];
    for (const [classIdentifier, preparedSpells] of Object.entries(preparedByClass)) {
      if (classIdentifier === excludeClass) continue;
      const hasSpellPrepared = preparedSpells.some((key) => {
        const parsed = this._parseClassSpellKey(key);
        return parsed.spellUuid === uuid;
      });
      if (hasSpellPrepared) usingClasses.push(classIdentifier);
    }
    return usingClasses;
  }

  /**
   * Clean up cantrip entries from class-specific prepared spells
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
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} wasPrepared - Whether the spell was previously prepared
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {string} classIdentifier - The class identifier
   * @param {number} currentPrepared - Current number of prepared spells for this class
   * @param {number} maxPrepared - Maximum allowed prepared spells for this class
   * @returns {Object} Status object with allowed and message properties
   */
  canChangeSpellStatus(spell, isChecked, wasPrepared, isLevelUp, isLongRest, classIdentifier, currentPrepared, maxPrepared) {
    if (spell.system.level === 0) return { allowed: true };
    if (!classIdentifier) classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    if (!classIdentifier) return { allowed: true };
    const settings = this.getSettings(classIdentifier);
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.UNENFORCED || settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      if (settings.behavior === MODULE.ENFORCEMENT_BEHAVIOR.NOTIFY_GM && isChecked) {
        if (currentPrepared >= maxPrepared) {
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
