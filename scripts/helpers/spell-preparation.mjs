import { CANTRIP_RULES, CLASS_IDENTIFIERS, ENFORCEMENT_BEHAVIOR, FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import { CantripManager } from './cantrip-manager.mjs';
import * as genericUtils from './generic-utils.mjs';
import { RitualManager } from './ritual-manager.mjs';
import * as formattingUtils from './spell-formatting.mjs';
import { WizardSpellbookManager } from './wizard-spellbook.mjs';

/**
 * Manages spell preparation and related functionality
 */
export class SpellManager {
  /**
   * Create a new SpellManager for an actor
   * @param {Actor5e} actor - The actor to manage spells for
   */
  constructor(actor) {
    this.actor = actor;
    this.classItem = genericUtils.findSpellcastingClass(actor);
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
    this.isWizard = genericUtils.isWizard(actor);
    this._wizardSpellbookCache = null;
    this._wizardManager = null;

    // Initialize sub-managers
    this.cantripManager = new CantripManager(actor, this);
    this.ritualManager = new RitualManager(actor);
  }

  /**
   * Get cantrip and spell settings for the actor
   * @returns {Object} Actor's spell settings
   */
  getSettings() {
    return {
      rules: this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_RULES) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_RULES) || CANTRIP_RULES.LEGACY,
      behavior: this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || ENFORCEMENT_BEHAVIOR.NOTIFY_GM
    };
  }

  /**
   * Get maximum allowed cantrips for the actor
   * @returns {number} Maximum allowed cantrips
   */
  getMaxAllowed() {
    if (!this.classItem) return 0;
    if (this.classItem.scaleValues) {
      const cantripsKnown = this.classItem.scaleValues['cantrips-known']?.value;
      if (cantripsKnown !== undefined) return cantripsKnown;
    }

    const classLevel = this.classItem.system.levels || this.actor.system.details.level;
    const className = this.classItem.name.toLowerCase();

    switch (className) {
      case CLASS_IDENTIFIERS.BARD:
      case CLASS_IDENTIFIERS.CLERIC:
      case CLASS_IDENTIFIERS.DRUID:
      case CLASS_IDENTIFIERS.SORCERER:
      case CLASS_IDENTIFIERS.WARLOCK:
      case CLASS_IDENTIFIERS.WIZARD:
        return Math.min(4, Math.max(3, Math.floor(classLevel / 4) + 2));
      case CLASS_IDENTIFIERS.RANGER:
      case CLASS_IDENTIFIERS.ARTIFICER:
        return Math.min(3, Math.max(2, Math.floor(classLevel / 6) + 1));
      default:
        return 0;
    }
  }

  /**
   * Calculate maximum prepared spells for the actor
   * @returns {number} Maximum allowed prepared spells
   */
  getMaxPrepared() {
    if (!this.classItem) return 0;
    if (this.classItem.scaleValues) {
      const maxPrepared = this.classItem.scaleValues['max-prepared']?.value;
      if (maxPrepared !== undefined) return maxPrepared;
    }

    const spellcastingAbility = this.classItem.system.spellcasting?.ability;
    if (!spellcastingAbility) return 0;
    const abilityMod = this.actor.system.abilities[spellcastingAbility]?.mod || 0;
    const classLevel = this.classItem.system.levels || this.actor.system.details.level;
    return Math.max(1, classLevel + abilityMod);
  }

  /**
   * Get the current count of prepared cantrips
   * @returns {number} Currently prepared cantrips count
   */
  getCurrentCount() {
    return this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).length;
  }

  /**
   * Determine if a cantrip can be changed
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {number} uiCantripCount - Number of checked cantrip boxes in the ui currently
   * @returns {Object} Status object with allowed and message properties
   */
  canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount = null) {
    return this.cantripManager.canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount);
  }

  /**
   * Track changes to cantrips for swap management
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   */
  trackCantripChange(spell, isChecked, isLevelUp, isLongRest) {
    this.cantripManager.trackCantripChange(spell, isChecked, isLevelUp, isLongRest);
  }

  /**
   * Lock cantrip checkboxes based on current rules and state
   * @param {NodeList} cantripItems - DOM elements for cantrip items
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {number} currentCount - Current count of prepared cantrips
   */
  lockCantripCheckboxes(cantripItems, isLevelUp, isLongRest, currentCount) {
    this.cantripManager.lockCantripCheckboxes(cantripItems, isLevelUp, isLongRest, currentCount);
  }

  /**
   * Notify GM about cantrip changes (if setting enabled)
   * @param {Object} changes - Information about cantrip changes
   * @returns {Promise<void>}
   */
  async notifyGMOfCantripChanges(changes) {
    return this.cantripManager.notifyGMOfCantripChanges(changes);
  }

  /**
   * Initialize flags on the actor
   * @returns {Promise<Object>} Update data applied, if any
   */
  async initializeFlags() {
    const updateData = {};
    const flags = this.actor.flags?.[MODULE.ID] || {};

    if (flags[FLAGS.CANTRIP_RULES] === undefined) {
      updateData[`flags.${MODULE.ID}.${FLAGS.CANTRIP_RULES}`] = game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_RULES);
    }

    if (flags[FLAGS.ENFORCEMENT_BEHAVIOR] === undefined) {
      updateData[`flags.${MODULE.ID}.${FLAGS.ENFORCEMENT_BEHAVIOR}`] = game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR);
    }

    const isFirstTime = flags[FLAGS.PREVIOUS_LEVEL] === undefined && flags[FLAGS.PREVIOUS_CANTRIP_MAX] === undefined;
    if (isFirstTime) {
      updateData[`flags.${MODULE.ID}.${FLAGS.PREVIOUS_LEVEL}`] = this.actor.system.details.level;
      updateData[`flags.${MODULE.ID}.${FLAGS.PREVIOUS_CANTRIP_MAX}`] = this.getMaxAllowed();
    }

    if (Object.keys(updateData).length > 0) await this.actor.update(updateData);
    return updateData;
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
   * Check if actor has had a level up that affects cantrips
   * @returns {boolean} Whether a level-up cantrip change is detected
   */
  checkForLevelUp() {
    return this.cantripManager.checkForLevelUp();
  }

  /**
   * Check if cantrips can currently be changed (level-up situation)
   * @returns {boolean} Whether cantrips can be changed
   */
  canBeLeveledUp() {
    return this.cantripManager.canBeLeveledUp();
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

    // Refresh sub-managers
    this.cantripManager = new CantripManager(this.actor, this);
    this.ritualManager = new RitualManager(this.actor);
  }

  /**
   * Get preparation status for a spell
   * @param {Item5e} spell - The spell to check
   * @returns {Object} Preparation status information
   */
  getSpellPreparationStatus(spell) {
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

    if (spell.parent === this.actor || spell._id) {
      return this._getOwnedSpellPreparationStatus(spell);
    }

    const actorSpell = this.actor.items.find((item) => item.type === 'spell' && (item.name === spell.name || item.flags?.core?.sourceId === spell.compendiumUuid));

    if (!actorSpell) {
      if (spell.system.level === 0) {
        const { behavior } = this.settings;
        defaultStatus.isCantripLocked = behavior === ENFORCEMENT_BEHAVIOR.ENFORCED;
        defaultStatus.cantripLockReason = 'SPELLBOOK.Cantrips.MaximumReached';
      }
      return defaultStatus;
    }

    return this._getOwnedSpellPreparationStatus(actorSpell);
  }

  /**
   * Get preparation status for a spell that's on the actor
   * @param {Item5e} spell - The spell item
   * @returns {Object} - Preparation status information
   * @private
   */
  _getOwnedSpellPreparationStatus(spell) {
    const preparationMode = spell.system.preparation?.mode;
    const alwaysPrepared = preparationMode === 'always';
    const localizedPreparationMode = formattingUtils.getLocalizedPreparationMode(preparationMode);
    const sourceInfo = this._determineSpellSource(spell);
    const isGranted = !!sourceInfo && !!spell.flags?.dnd5e?.cachedFor;
    const isCantrip = spell.system.level === 0;

    let isCantripLocked = false;
    let cantripLockReason = '';
    let isDisabled = isGranted || alwaysPrepared || ['innate', 'pact', 'atwill', 'ritual'].includes(preparationMode);
    let disabledReason = '';

    if (isGranted) {
      disabledReason = 'SPELLBOOK.SpellSource.GrantedTooltip';
    } else if (alwaysPrepared) {
      disabledReason = 'SPELLBOOK.Preparation.AlwaysTooltip';
    } else if (preparationMode === 'innate') {
      disabledReason = 'SPELLBOOK.Preparation.InnateTooltip';
    } else if (preparationMode === 'pact') {
      disabledReason = 'SPELLBOOK.Preparation.PactTooltip';
    } else if (preparationMode === 'atwill') {
      disabledReason = 'SPELLBOOK.Preparation.AtWillTooltip';
    } else if (preparationMode === 'ritual') {
      disabledReason = 'SPELLBOOK.Preparation.RitualTooltip';
    }

    const result = {
      prepared: !!(isGranted || spell.system.preparation?.prepared || alwaysPrepared),
      isOwned: true,
      preparationMode: preparationMode,
      localizedPreparationMode: localizedPreparationMode,
      disabled: !!isDisabled,
      disabledReason: disabledReason,
      alwaysPrepared: !!alwaysPrepared,
      sourceItem: sourceInfo,
      isGranted: !!isGranted,
      isCantripLocked: !!isCantripLocked,
      cantripLockReason: cantripLockReason
    };

    if (isCantrip && !alwaysPrepared && !isGranted) {
      const { rules, behavior } = this.settings;
      const isPrepared = spell.system.preparation?.prepared;

      if (behavior !== ENFORCEMENT_BEHAVIOR.ENFORCED) return result;

      if (rules === CANTRIP_RULES.LEGACY && isPrepared) {
        result.disabled = true;
        result.isCantripLocked = true;
        result.cantripLockReason = 'SPELLBOOK.Cantrips.LockedLegacy';
        result.disabledReason = 'SPELLBOOK.Cantrips.LockedLegacy';
      } else if (rules === CANTRIP_RULES.MODERN_LEVEL_UP && isPrepared) {
        result.disabled = true;
        result.isCantripLocked = true;
        result.cantripLockReason = 'SPELLBOOK.Cantrips.LockedOutsideLevelUp';
        result.disabledReason = 'SPELLBOOK.Cantrips.LockedOutsideLevelUp';
      } else if (rules === CANTRIP_RULES.MODERN_LONG_REST && isPrepared && this.isWizard) {
        result.disabled = true;
        result.isCantripLocked = true;
        result.cantripLockReason = 'SPELLBOOK.Cantrips.LockedOutsideLongRest';
        result.disabledReason = 'SPELLBOOK.Cantrips.LockedOutsideLongRest';
      }
    }

    if (this.isWizard && spell.system.level > 0 && preparationMode === 'prepared' && !result.disabled) {
      if (!this._wizardManager) this._wizardManager = new WizardSpellbookManager(this.actor);

      const spellUuid = genericUtils.getSpellUuid(spell);

      if (this._wizardSpellbookCache) {
        const inSpellbook = this._wizardSpellbookCache.includes(spellUuid);
        if (!inSpellbook) {
          result.disabled = true;
          result.disabledReason = 'SPELLBOOK.Wizard.NotInSpellbook';
        }
        result.inWizardSpellbook = inSpellbook;
      }
    }

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
      if (sourceItem) {
        return {
          name: sourceItem.name,
          type: sourceItem.type,
          id: sourceItem.id
        };
      }
    }

    const cachedFor = spell.flags?.dnd5e?.cachedFor;
    if (cachedFor && typeof cachedFor === 'string') {
      try {
        const pathParts = cachedFor.split('.');
        if (pathParts.length >= 3 && pathParts[1] === 'Item') {
          const itemId = pathParts[2];
          const item = this.actor.items.get(itemId);
          if (item) {
            return {
              name: item.name,
              type: item.type,
              id: item.id
            };
          }
        }

        const activity = fromUuidSync(cachedFor, { relative: this.actor });
        const item = activity?.item;
        if (item) {
          return {
            name: item.name,
            type: item.type,
            id: item.id
          };
        }
      } catch (error) {
        log(1, `Error resolving cached activity source:`, error);
      }
    }

    const preparationMode = spell.system.preparation?.mode;
    if (preparationMode === 'always') {
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) {
        return {
          name: subclass.name,
          type: 'subclass',
          id: subclass.id
        };
      }
    } else if (preparationMode === 'pact') {
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) {
        return {
          name: subclass.name,
          type: 'subclass',
          id: subclass.id
        };
      }
      return {
        name: 'Pact Magic',
        type: 'class'
      };
    } else {
      const classItem = this.actor.items.find((i) => i.type === 'class');
      if (classItem) {
        return {
          name: classItem.name,
          type: 'class',
          id: classItem.id
        };
      }
    }
    return null;
  }

  /**
   * Save prepared spells to the actor
   * @param {Object} spellData - Object mapping spell UUIDs to preparation data
   * @returns {Promise<void>}
   */
  async saveActorPreparedSpells(spellData) {
    try {
      log(3, `Saving prepared spells for ${this.actor.name}`);
      const cantripChanges = { added: [], removed: [], hasChanges: false };
      const preparedUuids = Object.entries(spellData)
        .filter(([_uuid, data]) => data.isPrepared)
        .map(([uuid]) => uuid);

      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, preparedUuids);
      log(3, `Saved ${preparedUuids.length} prepared spells to actor flags`);

      const spellIdsToRemove = [];
      const spellsToUpdate = [];
      const spellsToCreate = [];

      const isWizard = this.isWizard;
      const ritualCastingEnabled = this.ritualManager.isRitualCastingEnabled();

      for (const [uuid, data] of Object.entries(spellData)) {
        if (data.isAlwaysPrepared) continue;
        const isRitual = data.isRitual || false;
        const existingSpell = this.actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid));

        if (!data.isPrepared) {
          if (data.wasPrepared && existingSpell) {
            if (isRitual && isWizard && ritualCastingEnabled) {
              spellsToUpdate.push({
                '_id': existingSpell.id,
                'system.preparation.mode': 'ritual',
                'system.preparation.prepared': false
              });
            } else if (existingSpell.system.preparation?.mode === 'prepared' && !existingSpell.system.preparation?.alwaysPrepared) {
              spellIdsToRemove.push(existingSpell.id);
              if (existingSpell.system.level === 0) {
                cantripChanges.removed.push({ name: existingSpell.name, uuid: uuid });
                cantripChanges.hasChanges = true;
              }
            }
          } else if (isRitual && isWizard && ritualCastingEnabled && !existingSpell) {
            try {
              const sourceSpell = await fromUuid(uuid);
              if (sourceSpell) {
                const newSpellData = sourceSpell.toObject();
                if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
                newSpellData.system.preparation.mode = 'ritual';
                newSpellData.system.preparation.prepared = false;
                newSpellData.flags = newSpellData.flags || {};
                newSpellData.flags.core = newSpellData.flags.core || {};
                newSpellData.flags.core.sourceId = uuid;
                spellsToCreate.push(newSpellData);
              }
            } catch (error) {
              log(1, `Error fetching ritual spell ${uuid}:`, error);
            }
          }
        } else {
          if (existingSpell) {
            if (!existingSpell.system.preparation?.prepared || existingSpell.system.preparation?.mode !== 'prepared') {
              spellsToUpdate.push({
                '_id': existingSpell.id,
                'system.preparation.mode': 'prepared',
                'system.preparation.prepared': true
              });
            }
          } else {
            try {
              const sourceSpell = await fromUuid(uuid);
              if (sourceSpell) {
                const newSpellData = sourceSpell.toObject();
                if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
                newSpellData.system.preparation.mode = 'prepared';
                newSpellData.system.preparation.prepared = true;
                newSpellData.flags = newSpellData.flags || {};
                newSpellData.flags.core = newSpellData.flags.core || {};
                newSpellData.flags.core.sourceId = uuid;
                spellsToCreate.push(newSpellData);

                if (sourceSpell.system.level === 0) {
                  cantripChanges.added.push({ name: sourceSpell.name, uuid });
                  cantripChanges.hasChanges = true;
                }
              }
            } catch (error) {
              log(1, `Error fetching spell ${uuid}:`, error);
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

      if (cantripChanges.hasChanges) {
        await this.notifyGMOfCantripChanges(cantripChanges);
      }
    } catch (error) {
      log(1, `Error saving prepared spells for ${this.actor?.name || 'unknown actor'}:`, error);
    }
  }

  /**
   * Complete the cantrip level-up process
   * @returns {Promise<boolean>} Success status
   */
  async completeCantripsLevelUp() {
    return this.cantripManager.completeCantripsLevelUp();
  }

  /**
   * Get the wizard spellbook manager if the actor is a wizard
   * @returns {WizardSpellbookManager|null} The wizard spellbook manager or null
   */
  getWizardManager() {
    if (!this._wizardManager) {
      if (this.isWizard) this._wizardManager = new WizardSpellbookManager(this.actor);
      else return null;
    }
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

    if (!this._wizardSpellbookCache) {
      this._wizardSpellbookCache = await wizardManager.getSpellbookSpells();
    }

    return this._wizardSpellbookCache.includes(uuid);
  }

  /**
   * Reset all cantrip swap tracking data
   * @returns {Promise<void>}
   */
  async resetSwapTracking() {
    return this.cantripManager.resetSwapTracking();
  }
}
