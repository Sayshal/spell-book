import { CANTRIP_RULES, ENFORCEMENT_BEHAVIOR, FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as genericUtils from './generic-utils.mjs';
import * as formattingUtils from './spell-formatting.mjs';
import { WizardSpellbookManager } from './wizard-spellbook.mjs';

/**
 * Save prepared spells for an actor
 * @param {Actor5e} actor - The actor to save spells for
 * @param {Object} spellData - Object of spell data with preparation info
 * @returns {Promise<void>}
 */
export async function saveActorPreparedSpells(actor, spellData) {
  try {
    log(3, `Saving prepared spells for ${actor.name}`);
    const cantripChanges = { added: [], removed: [], hasChanges: false };
    const preparedUuids = Object.entries(spellData)
      .filter(([_uuid, data]) => data.isPrepared)
      .map(([uuid]) => uuid);

    await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, preparedUuids);
    log(3, `Saved ${preparedUuids.length} prepared spells to actor flags`);

    const spellIdsToRemove = [];
    const spellsToUpdate = [];
    const spellsToCreate = [];

    const isWizard = genericUtils.isWizard(actor);
    const wizardManager = isWizard ? new WizardSpellbookManager(actor) : null;
    const ritualCastingEnabled = wizardManager ? actor.getFlag(MODULE.ID, 'wizardRitualCasting') !== false : false;

    for (const [uuid, data] of Object.entries(spellData)) {
      if (data.isAlwaysPrepared) continue;
      const isRitual = data.isRitual || false;
      const existingSpell = actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid));

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
      await actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
    }

    if (spellsToUpdate.length > 0) {
      log(3, `Updating ${spellsToUpdate.length} spells on actor`);
      await actor.updateEmbeddedDocuments('Item', spellsToUpdate);
    }

    if (spellsToCreate.length > 0) {
      log(3, `Creating ${spellsToCreate.length} spells on actor`);
      await actor.createEmbeddedDocuments('Item', spellsToCreate);
    }

    if (cantripChanges.hasChanges) {
      const spellManager = new SpellManager(actor);
      await spellManager.notifyGMOfCantripChanges(cantripChanges);
    }
  } catch (error) {
    log(1, `Error saving prepared spells for ${actor?.name || 'unknown actor'}:`, error);
    ui.notifications.error(game.i18n.localize('SPELLBOOK.Error.SavingFailed'));
  }
}

/**
 * Manages spell preparation and cantrip functionality
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
    switch (this.classItem.name.toLowerCase()) {
      case 'bard':
      case 'cleric':
      case 'druid':
      case 'sorcerer':
      case 'warlock':
      case 'wizard':
        return Math.min(4, Math.max(3, Math.floor(classLevel / 4) + 2));
      case 'ranger':
      case 'artificer':
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
    if (spell.system.level !== 0) return { allowed: true };

    const spellName = spell.name || 'unknown cantrip';
    const { rules, behavior } = this.settings;

    if (behavior === ENFORCEMENT_BEHAVIOR.UNENFORCED || behavior === ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      if (behavior === ENFORCEMENT_BEHAVIOR.NOTIFY_GM && isChecked) {
        const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount();
        if (currentCount >= this.maxCantrips) {
          ui.notifications.warn(game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached'));
        }
      }
      return { allowed: true };
    }

    if (isChecked) {
      const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount();
      if (currentCount >= this.maxCantrips) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.MaximumReached' };
      }
    }

    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest);

    if (rules === CANTRIP_RULES.MODERN_LONG_REST) {
      if (!this.isWizard) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.WizardRuleOnly' };
      }
      if (!isLongRest && !isChecked) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLongRest' };
      }
      if (isLongRest) {
        if (!isChecked && trackingData.hasUnlearned && trackingData.unlearned !== spell.uuid && trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
        }
        if (isChecked && trackingData.hasLearned && trackingData.learned !== spell.uuid && !trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
        }
        if (isChecked && !trackingData.hasUnlearned && !trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.MustUnlearnFirst' };
        }
      }
    } else if (rules === CANTRIP_RULES.MODERN_LEVEL_UP) {
      if (!isLevelUp && !isChecked) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedOutsideLevelUp' };
      }
      if (isLevelUp) {
        if (!isChecked && trackingData.hasUnlearned && trackingData.unlearned !== spell.uuid && trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
        }
        if (isChecked && trackingData.hasLearned && trackingData.learned !== spell.uuid && !trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.OnlyOneSwap' };
        }
        if (isChecked && !trackingData.hasUnlearned && !trackingData.originalChecked.includes(spell.uuid)) {
          return { allowed: false, message: 'SPELLBOOK.Cantrips.MustUnlearnFirst' };
        }
      }
    } else if (rules === CANTRIP_RULES.LEGACY) {
      if (!isChecked) {
        return { allowed: false, message: 'SPELLBOOK.Cantrips.LockedLegacy' };
      }
    }

    return { allowed: true };
  }

  /**
   * Get the current swap tracking data
   * @param {boolean} isLevelUp - Whether this is a level-up context
   * @param {boolean} isLongRest - Whether this is a long rest context
   * @returns {Object} Tracking data
   * @private
   */
  _getSwapTrackingData(isLevelUp, isLongRest) {
    let flagName;
    if (isLevelUp) {
      flagName = FLAGS.CANTRIP_SWAP_TRACKING + '.levelUp';
    } else if (isLongRest) {
      flagName = FLAGS.CANTRIP_SWAP_TRACKING + '.longRest';
    } else {
      return { hasUnlearned: false, unlearned: null, hasLearned: false, learned: null, originalChecked: [] };
    }

    const data = this.actor.getFlag(MODULE.ID, flagName);
    return (
      data || {
        hasUnlearned: false,
        unlearned: null,
        hasLearned: false,
        learned: null,
        originalChecked: []
      }
    );
  }

  /**
   * Track changes to cantrips for swap management
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   */
  trackCantripChange(spell, isChecked, isLevelUp, isLongRest) {
    if (spell.system.level !== 0) return;

    const { rules } = this.settings;
    const spellUuid = genericUtils.getSpellUuid(spell);

    if (!isLevelUp && !isLongRest) return;
    if (rules === CANTRIP_RULES.LEGACY) return;
    if (rules === CANTRIP_RULES.MODERN_LONG_REST && !this.isWizard) return;

    const flagName = isLevelUp ? FLAGS.CANTRIP_SWAP_TRACKING + '.levelUp' : FLAGS.CANTRIP_SWAP_TRACKING + '.longRest';
    let tracking = this.actor.getFlag(MODULE.ID, flagName);

    if (!tracking) {
      const preparedCantrips = this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared).map((i) => genericUtils.getSpellUuid(i));

      tracking = {
        hasUnlearned: false,
        unlearned: null,
        hasLearned: false,
        learned: null,
        originalChecked: preparedCantrips
      };
      this.actor.setFlag(MODULE.ID, flagName, tracking);
    }

    if (!isChecked && tracking.originalChecked.includes(spellUuid)) {
      if (tracking.unlearned === spellUuid) {
        tracking.hasUnlearned = false;
        tracking.unlearned = null;
      } else {
        tracking.hasUnlearned = true;
        tracking.unlearned = spellUuid;
      }
    } else if (isChecked && !tracking.originalChecked.includes(spellUuid)) {
      if (tracking.learned === spellUuid) {
        tracking.hasLearned = false;
        tracking.learned = null;
      } else {
        tracking.hasLearned = true;
        tracking.learned = spellUuid;
      }
    } else if (!isChecked && tracking.learned === spellUuid) {
      tracking.hasLearned = false;
      tracking.learned = null;
    } else if (isChecked && tracking.unlearned === spellUuid) {
      tracking.hasUnlearned = false;
      tracking.unlearned = null;
    }

    this.actor.setFlag(MODULE.ID, flagName, tracking);
  }

  /**
   * Complete the cantrip swap process and reset tracking
   * @param {boolean} isLevelUp - Whether this is completing a level-up swap
   * @returns {Promise<boolean>} Success status
   */
  async completeCantripSwap(isLevelUp) {
    const flagName = isLevelUp ? FLAGS.CANTRIP_SWAP_TRACKING + '.levelUp' : FLAGS.CANTRIP_SWAP_TRACKING + '.longRest';
    await this.actor.unsetFlag(MODULE.ID, flagName);

    if (isLevelUp) {
      const currentLevel = this.actor.system.details.level;
      const currentMax = this.getMaxAllowed();
      await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
      await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);
    }
    return true;
  }

  /**
   * Lock cantrip checkboxes based on current rules and state
   * @param {NodeList} cantripItems - DOM elements for cantrip items
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {number} currentCount - Current count of prepared cantrips
   */
  lockCantripCheckboxes(cantripItems, isLevelUp, isLongRest, currentCount) {
    const { rules, behavior } = this.settings;
    const isAtMax = currentCount >= this.maxCantrips;
    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest);

    for (const item of cantripItems) {
      const checkbox = item.querySelector('dnd5e-checkbox');
      if (!checkbox) continue;

      if (item.querySelector('.tag.always-prepared') || item.querySelector('.tag.granted')) continue;

      const isChecked = checkbox.checked;
      const uuid = checkbox.dataset.uuid;

      checkbox.disabled = false;
      delete checkbox.dataset.tooltip;
      item.classList.remove('cantrip-locked');

      if (isAtMax && !isChecked) {
        checkbox.disabled = true;
        checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached');
        item.classList.add('cantrip-locked');
        continue;
      }

      if (behavior !== ENFORCEMENT_BEHAVIOR.ENFORCED) continue;

      switch (rules) {
        case CANTRIP_RULES.LEGACY:
          if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedLegacy');
            item.classList.add('cantrip-locked');
          }
          break;

        case CANTRIP_RULES.MODERN_LEVEL_UP:
          if (isLevelUp) {
            if (trackingData.hasUnlearned && uuid !== trackingData.unlearned && isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
            }
            if (trackingData.hasLearned && uuid !== trackingData.learned && !isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
            }
          } else if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLevelUp');
            item.classList.add('cantrip-locked');
          }
          break;

        case CANTRIP_RULES.MODERN_LONG_REST:
          if (!this.isWizard) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.WizardRuleOnly');
            item.classList.add('cantrip-locked');
            continue;
          }

          if (isLongRest) {
            if (trackingData.hasUnlearned && uuid !== trackingData.unlearned && isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
            }
            if (trackingData.hasLearned && uuid !== trackingData.learned && !isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
            }
          } else if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLongRest');
            item.classList.add('cantrip-locked');
          }
          break;
      }
    }
  }

  /**
   * Notify GM about cantrip changes (if setting enabled)
   * @param {Object} changes - Information about cantrip changes
   * @returns {Promise<void>}
   */
  async notifyGMOfCantripChanges(changes) {
    if (changes.added.length === 0 && changes.removed.length === 0) return;
    if (this.settings.behavior !== ENFORCEMENT_BEHAVIOR.NOTIFY_GM) return;

    const currentCantrips = this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).map((i) => i.name);

    const originalCantripsSet = new Set(currentCantrips);
    for (const { name } of changes.removed) originalCantripsSet.add(name);
    for (const { name } of changes.added) originalCantripsSet.delete(name);
    const originalCantrips = Array.from(originalCantripsSet).sort();

    const newCantripsSet = new Set(originalCantrips);
    for (const { name } of changes.removed) newCantripsSet.delete(name);
    for (const { name } of changes.added) newCantripsSet.add(name);
    const newCantrips = Array.from(newCantripsSet).sort();

    let content = `<h3>${game.i18n.format('SPELLBOOK.Cantrips.ChangeNotification', { name: this.actor.name })}</h3>`;
    if (originalCantrips.length > 0) content += `<p><strong>Original Cantrips:</strong> ${originalCantrips.join(', ')}</p>`;
    if (changes.removed.length > 0) content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Removed')}:</strong> ${changes.removed.map((c) => c.name).join(', ')}</p>`;
    if (changes.added.length > 0) content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Added')}:</strong> ${changes.added.map((c) => c.name).join(', ')}</p>`;
    if (newCantrips.length > 0) content += `<p><strong>New Cantrips:</strong> ${newCantrips.join(', ')}</p>`;

    ChatMessage.create({
      content: content,
      whisper: game.users.filter((u) => u.isGM).map((u) => u.id)
    });
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
    try {
      const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
      const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
      const currentLevel = this.actor.system.details.level;
      const currentMax = this.getMaxAllowed();
      return (currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0;
    } catch (error) {
      log(1, 'Error checking for cantrip level up:', error);
      return false;
    }
  }

  /**
   * Check if cantrips can currently be changed (level-up situation)
   * @returns {boolean} Whether cantrips can be changed
   */
  canBeLeveledUp() {
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = this.actor.system.details.level;
    const currentMax = this.getMaxAllowed();
    return (previousLevel === 0 && currentLevel > 0) || ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);
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
    await saveActorPreparedSpells(this.actor, spellData);
  }

  /**
   * Complete the cantrip level-up process
   * @returns {Promise<boolean>} Success status
   */
  async completeCantripsLevelUp() {
    const currentLevel = this.actor.system.details.level;
    const currentMax = this.getMaxAllowed();
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);
    await this.completeCantripSwap(true);
    return true;
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
    const allTracking = this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};

    if (allTracking.longRest) delete allTracking.longRest;

    if (Object.keys(allTracking).length === 0) {
      await this.actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
    } else {
      await this.actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, allTracking);
    }
  }
}
