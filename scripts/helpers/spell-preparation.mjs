import { CANTRIP_RULES, ENFORCEMENT_BEHAVIOR, FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
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

    // Track cantrip changes for GM notification
    const cantripChanges = {
      added: [],
      removed: [],
      hasChanges: false
    };

    // Extract prepared spell UUIDs
    const preparedUuids = Object.entries(spellData)
      .filter(([_uuid, data]) => data.isPrepared)
      .map(([uuid]) => uuid);

    // Save to actor flags
    await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, preparedUuids);
    log(3, `Saved ${preparedUuids.length} prepared spells to actor flags`);

    // Collect all spells to remove in one batch
    const spellIdsToRemove = [];
    const spellsToUpdate = [];
    const spellsToCreate = [];

    // First, handle all unprepared spells that were prepared
    for (const [uuid, data] of Object.entries(spellData)) {
      // Skip always prepared spells
      if (data.isAlwaysPrepared) continue;

      // Skip if still prepared
      if (data.isPrepared) continue;

      // Only process if it was previously prepared
      if (!data.wasPrepared) continue;

      // Find existing spell on actor
      const existingSpell = actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid));

      if (!existingSpell) continue;

      // Add to removal list if it's a prepared spell
      if (existingSpell.system.preparation?.mode === 'prepared' && !existingSpell.system.preparation?.alwaysPrepared) {
        spellIdsToRemove.push(existingSpell.id);

        // Track removed cantrip
        if (existingSpell.system.level === 0) {
          cantripChanges.removed.push({
            name: existingSpell.name,
            uuid: uuid
          });
          cantripChanges.hasChanges = true;
          log(3, `Tracking removed cantrip: ${existingSpell.name}`);
        }
      }
    }

    // Now handle all prepared spells
    for (const [uuid, data] of Object.entries(spellData)) {
      // Skip always prepared spells
      if (data.isAlwaysPrepared) continue;

      // Skip if not prepared
      if (!data.isPrepared) continue;

      // Find existing spell on actor
      const existingSpell = actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid));

      if (existingSpell) {
        // Update if needed
        if (!existingSpell.system.preparation?.prepared) {
          spellsToUpdate.push({
            '_id': existingSpell.id,
            'system.preparation.prepared': true
          });
        }
      } else {
        // Queue for creation
        try {
          const sourceSpell = await fromUuid(uuid);
          if (sourceSpell) {
            const newSpellData = sourceSpell.toObject();
            if (!newSpellData.system.preparation) {
              newSpellData.system.preparation = {};
            }

            newSpellData.system.preparation.mode = 'prepared';
            newSpellData.system.preparation.prepared = true;
            newSpellData.flags = newSpellData.flags || {};
            newSpellData.flags.core = newSpellData.flags.core || {};
            newSpellData.flags.core.sourceId = uuid;

            spellsToCreate.push(newSpellData);

            // Track new cantrip
            if (sourceSpell.system.level === 0) {
              cantripChanges.added.push({
                name: sourceSpell.name,
                uuid: uuid
              });
              cantripChanges.hasChanges = true;
              log(3, `Tracking added cantrip: ${sourceSpell.name}`);
            }
          }
        } catch (error) {
          log(1, `Error fetching spell ${uuid}:`, error);
        }
      }
    }

    // Process all changes in batches
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

    // Process cantrip changes if any
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
    log(3, `Creating SpellManager for ${actor.name}`);
    this.classItem = this._findSpellcastingClass();
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
    this.isWizard = this._isWizard();
    this._wizardSpellbookCache = null;
    this._wizardManager = null;

    log(3, `SpellManager initialized: max=${this.maxCantrips}, current=${this.currentCount}, isWizard=${this.isWizard}`);
  }

  /* -------------------------------------------- */
  /*  Core Information Methods                    */
  /* -------------------------------------------- */

  /**
   * Find the actor's spellcasting class
   * @returns {Item5e|null} - The spellcasting class item or null
   * @private
   */
  _findSpellcastingClass() {
    return this.actor.items.find((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
  }

  /**
   * Check if the actor is a wizard
   * @returns {boolean} True if actor has a wizard class or force wizard mode is enabled
   * @private
   */
  _isWizard() {
    // Check for force wizard mode flag first
    if (this.actor.getFlag(MODULE.ID, FLAGS.FORCE_WIZARD_MODE)) {
      log(3, `${this.actor.name} treated as wizard via force wizard mode flag`);
      return true;
    }

    // Regular class check as fallback
    return !!this.actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === 'wizard');
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

    // Check for cantrips-known in scaleValues
    if (this.classItem.scaleValues) {
      const cantripsKnown = this.classItem.scaleValues['cantrips-known']?.value;
      if (cantripsKnown !== undefined) return cantripsKnown;
    }

    // Fallback calculation if no scale value
    const classLevel = this.classItem.system.levels || this.actor.system.details.level;

    // Use level-based scaling based on class
    switch (this.classItem.name.toLowerCase()) {
      case 'bard':
      case 'cleric':
      case 'druid':
      case 'sorcerer':
      case 'warlock':
      case 'wizard':
        return Math.min(4, Math.max(3, Math.floor(classLevel / 4) + 2));

      // Classes with fewer cantrips
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

    // Check for max-prepared in scaleValues
    if (this.classItem.scaleValues) {
      const maxPrepared = this.classItem.scaleValues['max-prepared']?.value;
      if (maxPrepared !== undefined) return maxPrepared;
    }

    // Fallback to standard calculation
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

  /* -------------------------------------------- */
  /*  Cantrip Management Methods                  */
  /* -------------------------------------------- */

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
    // Skip non-cantrips
    if (spell.system.level !== 0) return { allowed: true };

    const spellName = spell.name || 'unknown cantrip';
    const { rules, behavior } = this.settings;

    log(3, `Checking if cantrip ${spellName} can change status:`);
    log(3, `  - isChecked: ${isChecked}, isLevelUp: ${isLevelUp}, isLongRest: ${isLongRest}`);
    log(3, `  - rules: ${rules}, behavior: ${behavior}, isWizard: ${this.isWizard}`);

    // Check enforcement behavior first
    if (behavior === ENFORCEMENT_BEHAVIOR.UNENFORCED || behavior === ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      // For "notify" behavior with checks, we'll still show max warnings but allow the change
      if (behavior === ENFORCEMENT_BEHAVIOR.NOTIFY_GM && isChecked) {
        // Use UI count if provided, otherwise get from actor
        const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount();
        if (currentCount >= this.maxCantrips) {
          // If in notify mode, log the warning but don't block
          log(3, `Warning but allowing - maximum cantrips reached (${currentCount}/${this.maxCantrips})`);
          // We'll still show the notification, but return allowed=true
          ui.notifications.warn(game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached'));
        }
      }

      log(3, `Allowing change - behavior is not enforced`);
      return { allowed: true };
    }

    // For enforced behavior, now check max constraint
    if (isChecked) {
      // Use UI count if provided, otherwise get from actor
      const currentCount = uiCantripCount !== null ? uiCantripCount : this.getCurrentCount();
      if (currentCount >= this.maxCantrips) {
        log(3, `Blocking check - maximum cantrips reached (${currentCount}/${this.maxCantrips})`);
        return {
          allowed: false,
          message: 'SPELLBOOK.Cantrips.MaximumReached'
        };
      }
    }

    // If behavior is unenforced, allow other changes beyond the max constraint
    if (behavior === ENFORCEMENT_BEHAVIOR.UNENFORCED || behavior === ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      log(3, `Allowing change - behavior is not enforced`);
      return { allowed: true };
    }

    // Get current tracking data if needed
    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest);

    // RULE CHECK: Modern Long Rest (wizard-only)
    if (rules === CANTRIP_RULES.MODERN_LONG_REST) {
      // Only wizards can use this rule
      if (!this.isWizard) {
        log(3, `Blocking change - Modern Long Rest rule requires wizard class`);
        return {
          allowed: false,
          message: 'SPELLBOOK.Cantrips.WizardRuleOnly'
        };
      }

      // If not during long rest, can't uncheck (but can check new ones up to max)
      if (!isLongRest && !isChecked) {
        log(3, `Blocking uncheck - Modern Long Rest rule only allows unchecking during long rest`);
        return {
          allowed: false,
          message: 'SPELLBOOK.Cantrips.LockedOutsideLongRest'
        };
      }

      // During long rest with enforcement, check swap limits
      if (isLongRest) {
        // Check if trying to unlearn a different cantrip when one is already unlearned
        if (!isChecked && trackingData.hasUnlearned && trackingData.unlearned !== spell.uuid && trackingData.originalChecked.includes(spell.uuid)) {
          log(3, `Blocking uncheck - already unlearned a different cantrip`);
          return {
            allowed: false,
            message: 'SPELLBOOK.Cantrips.OnlyOneSwap'
          };
        }

        // Check if trying to learn a different cantrip when one is already learned
        if (isChecked && trackingData.hasLearned && trackingData.learned !== spell.uuid && !trackingData.originalChecked.includes(spell.uuid)) {
          log(3, `Blocking check - already learned a different cantrip`);
          return {
            allowed: false,
            message: 'SPELLBOOK.Cantrips.OnlyOneSwap'
          };
        }

        // Can't learn a new one without unlearning first
        if (isChecked && !trackingData.hasUnlearned && !trackingData.originalChecked.includes(spell.uuid)) {
          log(3, `Blocking check - must unlearn a cantrip first`);
          return {
            allowed: false,
            message: 'SPELLBOOK.Cantrips.MustUnlearnFirst'
          };
        }
      }
    }

    // RULE CHECK: Modern Level Up
    else if (rules === CANTRIP_RULES.MODERN_LEVEL_UP) {
      // If not during level up, can't uncheck (but can check new ones up to max)
      if (!isLevelUp && !isChecked) {
        log(3, `Blocking uncheck - Modern Level Up rule only allows unchecking during level up`);
        return {
          allowed: false,
          message: 'SPELLBOOK.Cantrips.LockedOutsideLevelUp'
        };
      }

      // During level up with enforcement, check swap limits
      if (isLevelUp) {
        // Check if trying to unlearn a different cantrip when one is already unlearned
        if (!isChecked && trackingData.hasUnlearned && trackingData.unlearned !== spell.uuid && trackingData.originalChecked.includes(spell.uuid)) {
          log(3, `Blocking uncheck - already unlearned a different cantrip`);
          return {
            allowed: false,
            message: 'SPELLBOOK.Cantrips.OnlyOneSwap'
          };
        }

        // Check if trying to learn a different cantrip when one is already learned
        if (isChecked && trackingData.hasLearned && trackingData.learned !== spell.uuid && !trackingData.originalChecked.includes(spell.uuid)) {
          log(3, `Blocking check - already learned a different cantrip`);
          return {
            allowed: false,
            message: 'SPELLBOOK.Cantrips.OnlyOneSwap'
          };
        }

        // Can't learn a new one without unlearning first
        if (isChecked && !trackingData.hasUnlearned && !trackingData.originalChecked.includes(spell.uuid)) {
          log(3, `Blocking check - must unlearn a cantrip first`);
          return {
            allowed: false,
            message: 'SPELLBOOK.Cantrips.MustUnlearnFirst'
          };
        }
      }
    }

    // RULE CHECK: Legacy
    else if (rules === CANTRIP_RULES.LEGACY) {
      // With legacy rules, can't uncheck prepared cantrips at all
      if (!isChecked) {
        log(3, `Blocking uncheck - Legacy rules don't allow unchecking cantrips`);
        return {
          allowed: false,
          message: 'SPELLBOOK.Cantrips.LockedLegacy'
        };
      }
    }

    // If we got here, the change is allowed
    log(3, `Allowing cantrip status change for ${spellName}`);
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
    // Determine which flag to use
    let flagName;
    if (isLevelUp) {
      flagName = FLAGS.CANTRIP_SWAP_TRACKING + '.levelUp';
    } else if (isLongRest) {
      flagName = FLAGS.CANTRIP_SWAP_TRACKING + '.longRest';
    } else {
      // Return empty data if not in a swap context
      return {
        hasUnlearned: false,
        unlearned: null,
        hasLearned: false,
        learned: null,
        originalChecked: []
      };
    }

    // Get the data
    const data = this.actor.getFlag(MODULE.ID, flagName);

    // Return data or empty default
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
    // Skip non-cantrips
    if (spell.system.level !== 0) return;

    const spellName = spell.name || 'unknown cantrip';
    const { rules, behavior } = this.settings;
    const spellUuid = spell.flags?.core?.sourceId || spell.flags?.dnd5e?.sourceId || spell.system?.parent?._source._stats.compendiumSource || spell.uuid;

    log(3, `Tracking cantrip change: ${spellName}, isChecked=${isChecked}`);

    // Skip tracking if not in level-up or long rest context
    if (!isLevelUp && !isLongRest) {
      log(3, `Skipping swap tracking - not in level-up or long rest context`);
      return;
    }

    // Skip tracking for legacy rules - they don't have swapping
    if (rules === CANTRIP_RULES.LEGACY) {
      log(3, `Skipping swap tracking - legacy rules don't support swapping`);
      return;
    }

    // Skip tracking for modern long rest if not a wizard
    if (rules === CANTRIP_RULES.MODERN_LONG_REST && !this.isWizard) {
      log(3, `Skipping swap tracking - modern long rest requires wizard class`);
      return;
    }

    // Determine which flag to use
    const flagName = isLevelUp ? FLAGS.CANTRIP_SWAP_TRACKING + '.levelUp' : FLAGS.CANTRIP_SWAP_TRACKING + '.longRest';

    // Get current tracking data
    let tracking = this.actor.getFlag(MODULE.ID, flagName);

    // Initialize tracking if it doesn't exist
    if (!tracking) {
      // Get source UUIDs of prepared cantrips using flags.core.sourceId
      const preparedCantrips = this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared).map((i) => i.flags?.core?.sourceId || i.uuid);

      tracking = {
        hasUnlearned: false,
        unlearned: null,
        hasLearned: false,
        learned: null,
        originalChecked: preparedCantrips
      };

      this.actor.setFlag(MODULE.ID, flagName, tracking);
      log(3, `Initialized cantrip swap tracking with ${preparedCantrips.length} original cantrips`);
      log(3, `Original cantrips: ${preparedCantrips.join(', ')}`);
    }

    // Log current state and check details
    log(3, `Current tracking state - hasUnlearned: ${tracking.hasUnlearned}, unlearned: ${tracking.unlearned}, hasLearned: ${tracking.hasLearned}, learned: ${tracking.learned}`);
    log(3, `Action: ${isChecked ? 'checking' : 'unchecking'} cantrip ${spellName} (${spellUuid})`);
    log(3, `Is in original cantrips: ${tracking.originalChecked.includes(spellUuid)}`);

    // CASE 1: Unchecking a cantrip that was originally checked (unlearning)
    if (!isChecked && tracking.originalChecked.includes(spellUuid)) {
      // If this is the already unlearned cantrip, reset the tracking
      if (tracking.unlearned === spellUuid) {
        tracking.hasUnlearned = false;
        tracking.unlearned = null;
        log(3, `Reverting unlearn of cantrip: ${spellName}`);
      }
      // Otherwise track this as the unlearned cantrip
      else {
        tracking.hasUnlearned = true;
        tracking.unlearned = spellUuid;
        log(3, `Tracking unlearned cantrip: ${spellName}`);
      }
    }

    // CASE 2: Checking a cantrip that wasn't originally checked (learning)
    else if (isChecked && !tracking.originalChecked.includes(spellUuid)) {
      // If this is the already learned cantrip, reset the tracking
      if (tracking.learned === spellUuid) {
        tracking.hasLearned = false;
        tracking.learned = null;
        log(3, `Reverting learn of cantrip: ${spellName}`);
      }
      // Otherwise track this as the learned cantrip
      else {
        tracking.hasLearned = true;
        tracking.learned = spellUuid;
        log(3, `Tracking learned cantrip: ${spellName}`);
      }
    }

    // CASE 3: Unchecking a newly learned cantrip (changing your mind)
    else if (!isChecked && tracking.learned === spellUuid) {
      tracking.hasLearned = false;
      tracking.learned = null;
      log(3, `Cantrip ${spellName} was newly learned but is being unchecked`);
    }

    // CASE 4: Re-checking a cantrip that was unlearned (changing your mind)
    else if (isChecked && tracking.unlearned === spellUuid) {
      tracking.hasUnlearned = false;
      tracking.unlearned = null;
      log(3, `Cantrip ${spellName} was unlearned but is being re-checked`);
    }

    // Save the updated tracking
    this.actor.setFlag(MODULE.ID, flagName, tracking);

    // Log updated state
    log(3, `Updated tracking: hasUnlearned=${tracking.hasUnlearned}, unlearned=${tracking.unlearned}, hasLearned=${tracking.hasLearned}, learned=${tracking.learned}`);
  }

  /**
   * Complete the cantrip swap process and reset tracking
   * @param {boolean} isLevelUp - Whether this is completing a level-up swap
   * @returns {Promise<boolean>} Success status
   */
  async completeCantripSwap(isLevelUp) {
    const flagName = isLevelUp ? FLAGS.CANTRIP_SWAP_TRACKING + '.levelUp' : FLAGS.CANTRIP_SWAP_TRACKING + '.longRest';

    // Clear the tracking data
    await this.actor.unsetFlag(MODULE.ID, flagName);
    log(3, `Cleared cantrip swap tracking for ${isLevelUp ? 'level-up' : 'long rest'}`);

    // If it was a level-up, update level tracking for future level-up detection
    if (isLevelUp) {
      const currentLevel = this.actor.system.details.level;
      const currentMax = this.getMaxAllowed();

      await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
      await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);

      log(3, `Updated level tracking: level=${currentLevel}, maxCantrips=${currentMax}`);
    }

    return true;
  }

  /**
   * Lock cantrip checkboxes based on current rules and state
   * @param {NodeList} cantripItems - DOM elements for cantrip items
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {number} currentCount - Current count of prepared cantrips
   * @returns {void}
   */
  lockCantripCheckboxes(cantripItems, isLevelUp, isLongRest, currentCount) {
    const { rules, behavior } = this.settings;
    const isAtMax = currentCount >= this.maxCantrips;

    log(3, `Locking cantrips based on rules=${rules}, behavior=${behavior}`);
    log(3, `Context: isLevelUp=${isLevelUp}, isLongRest=${isLongRest}, count=${currentCount}/${this.maxCantrips}, isAtMax=${isAtMax}`);

    // Get tracking data if in a swap context
    const trackingData = this._getSwapTrackingData(isLevelUp, isLongRest);

    // Process each cantrip item
    for (const item of cantripItems) {
      const checkbox = item.querySelector('dnd5e-checkbox');
      if (!checkbox) continue;

      // Skip always prepared or granted spells
      if (item.querySelector('.tag.always-prepared') || item.querySelector('.tag.granted')) {
        continue;
      }

      const spellName = item.querySelector('.spell-name .title')?.textContent || 'unknown';
      const isChecked = checkbox.checked;
      const uuid = checkbox.dataset.uuid;

      // Clear existing lock state
      checkbox.disabled = false;
      delete checkbox.dataset.tooltip;
      item.classList.remove('cantrip-locked');

      log(3, `Processing cantrip lock for ${spellName}, isChecked=${isChecked}`);

      // GLOBAL MAX CHECK: Always lock unchecked cantrips if at maximum
      // This applies regardless of behavior setting - it's a hard constraint
      if (isAtMax && !isChecked) {
        checkbox.disabled = true;
        checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.MaximumReached');
        item.classList.add('cantrip-locked');
        log(3, `Locking unchecked cantrip ${spellName} - at maximum count (${currentCount}/${this.maxCantrips})`);
        continue; // Skip remaining checks since we've already locked this
      }

      // Skip rule-based locks if not enforced
      if (behavior !== ENFORCEMENT_BEHAVIOR.ENFORCED) {
        log(3, `Skipping rule-based locks - behavior is ${behavior}`);
        continue;
      }

      // Handle based on rules and context - only apply these if enforced
      switch (rules) {
        case CANTRIP_RULES.LEGACY:
          // Always lock checked cantrips
          if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedLegacy');
            item.classList.add('cantrip-locked');
            log(3, `Locking checked cantrip ${spellName} - legacy rules`);
          }
          break;

        case CANTRIP_RULES.MODERN_LEVEL_UP:
          // During level-up
          if (isLevelUp) {
            // If unlearned a cantrip, lock all other checked cantrips
            if (trackingData.hasUnlearned && uuid !== trackingData.unlearned && isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
              log(3, `Locking checked cantrip ${spellName} - already unlearned another`);
            }

            // If learned a cantrip, lock all other unchecked cantrips
            if (trackingData.hasLearned && uuid !== trackingData.learned && !isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
              log(3, `Locking unchecked cantrip ${spellName} - already learned another`);
            }
          }
          // Outside level-up: lock all checked cantrips
          else if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLevelUp');
            item.classList.add('cantrip-locked');
            log(3, `Locking checked cantrip ${spellName} - outside level-up`);
          }
          break;

        case CANTRIP_RULES.MODERN_LONG_REST:
          // Only wizards can use this rule
          if (!this.isWizard) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.WizardRuleOnly');
            item.classList.add('cantrip-locked');
            log(3, `Locking cantrip ${spellName} - modern long rest rule requires wizard`);
            continue;
          }

          // During long rest
          if (isLongRest) {
            // If unlearned a cantrip, lock all other checked cantrips
            if (trackingData.hasUnlearned && uuid !== trackingData.unlearned && isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
              log(3, `Locking checked cantrip ${spellName} - already unlearned another`);
            }

            // If learned a cantrip, lock all other unchecked cantrips
            if (trackingData.hasLearned && uuid !== trackingData.learned && !isChecked) {
              checkbox.disabled = true;
              checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.OnlyOneSwap');
              item.classList.add('cantrip-locked');
              log(3, `Locking unchecked cantrip ${spellName} - already learned another`);
            }
          }
          // Outside long rest: lock all checked cantrips
          else if (isChecked) {
            checkbox.disabled = true;
            checkbox.dataset.tooltip = game.i18n.localize('SPELLBOOK.Cantrips.LockedOutsideLongRest');
            item.classList.add('cantrip-locked');
            log(3, `Locking checked cantrip ${spellName} - outside long rest`);
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
    if (changes.added.length === 0 && changes.removed.length === 0) {
      log(3, 'No cantrip changes to notify GM about');
      return;
    }

    const { behavior } = this.settings;

    if (behavior !== ENFORCEMENT_BEHAVIOR.NOTIFY_GM) {
      log(3, 'Skipping GM notification - behavior is not set to notify GM');
      return;
    }

    log(3, `Notifying GM about cantrip changes for ${this.actor.name}`);

    // Get original cantrips (before changes)
    const currentCantrips = this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).map((i) => i.name);

    // Create a set of cantrip names to avoid duplicates
    const originalCantripsSet = new Set(currentCantrips);

    // Add back any removed cantrips and remove any newly added ones
    // to reconstruct the original state
    for (const { name } of changes.removed) {
      originalCantripsSet.add(name);
    }

    for (const { name } of changes.added) {
      originalCantripsSet.delete(name);
    }

    // Convert to sorted array
    const originalCantrips = Array.from(originalCantripsSet).sort();

    // Calculate new cantrips list
    const newCantripsSet = new Set(originalCantrips);

    // Remove the removed cantrips
    for (const { name } of changes.removed) {
      newCantripsSet.delete(name);
    }

    // Add the new cantrips
    for (const { name } of changes.added) {
      newCantripsSet.add(name);
    }

    // Convert to sorted array
    const newCantrips = Array.from(newCantripsSet).sort();

    // Build the message content
    let content = `<h3>${game.i18n.format('SPELLBOOK.Cantrips.ChangeNotification', { name: this.actor.name })}</h3>`;

    // Display original cantrips
    if (originalCantrips.length > 0) {
      content += `<p><strong>Original Cantrips:</strong> ${originalCantrips.join(', ')}</p>`;
    }

    // Display changes
    if (changes.removed.length > 0) {
      content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Removed')}:</strong> ${changes.removed.map((c) => c.name).join(', ')}</p>`;
    }

    if (changes.added.length > 0) {
      content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Added')}:</strong> ${changes.added.map((c) => c.name).join(', ')}</p>`;
    }

    // Display new cantrip list
    if (newCantrips.length > 0) {
      content += `<p><strong>New Cantrips:</strong> ${newCantrips.join(', ')}</p>`;
    }

    // Send to GM only
    ChatMessage.create({
      content: content,
      whisper: game.users.filter((u) => u.isGM).map((u) => u.id)
    });

    log(3, 'GM notification sent for cantrip changes');
  }

  /* -------------------------------------------- */
  /*  Flag Management Methods                     */
  /* -------------------------------------------- */

  /**
   * Initialize flags on the actor
   * @returns {Promise<Object>} Update data applied, if any
   */
  async initializeFlags() {
    const updateData = {};
    const flags = this.actor.flags?.[MODULE.ID] || {};

    log(3, 'Initializing cantrip flags');

    // Default cantrip rules
    if (flags[FLAGS.CANTRIP_RULES] === undefined) {
      updateData[`flags.${MODULE.ID}.${FLAGS.CANTRIP_RULES}`] = game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_RULES);
    }

    // Default enforcement behavior
    if (flags[FLAGS.ENFORCEMENT_BEHAVIOR] === undefined) {
      updateData[`flags.${MODULE.ID}.${FLAGS.ENFORCEMENT_BEHAVIOR}`] = game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR);
    }

    // First-time setup
    const isFirstTime = flags[FLAGS.PREVIOUS_LEVEL] === undefined && flags[FLAGS.PREVIOUS_CANTRIP_MAX] === undefined;

    if (isFirstTime) {
      log(3, 'First time setup for cantrip flags');
      updateData[`flags.${MODULE.ID}.${FLAGS.PREVIOUS_LEVEL}`] = this.actor.system.details.level;
      updateData[`flags.${MODULE.ID}.${FLAGS.PREVIOUS_CANTRIP_MAX}`] = this.getMaxAllowed();
    }

    // Apply updates if needed
    if (Object.keys(updateData).length > 0) {
      log(3, 'Applying flag updates:', updateData);
      await this.actor.update(updateData);
    }

    return updateData;
  }

  /**
   * Save settings to the actor
   * @param {string} rules - The rules type to use
   * @param {string} behavior - The enforcement behavior to use
   * @returns {Promise<boolean>} Success state
   */
  async saveSettings(rules, behavior) {
    log(3, `Saving cantrip settings: rules=${rules}, behavior=${behavior}`);

    await this.actor.update({
      [`flags.${MODULE.ID}.${FLAGS.CANTRIP_RULES}`]: rules,
      [`flags.${MODULE.ID}.${FLAGS.ENFORCEMENT_BEHAVIOR}`]: behavior
    });

    this.settings = this.getSettings();
    log(3, 'Settings saved successfully');
    return true;
  }

  /* -------------------------------------------- */
  /*  Level-up Detection Methods                  */
  /* -------------------------------------------- */

  /**
   * Check if actor has had a level up that affects cantrips
   * @returns {boolean} Whether a level-up cantrip change is detected
   */
  checkForLevelUp() {
    try {
      // Get previous values
      const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
      const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;

      // Get current values
      const currentLevel = this.actor.system.details.level;
      const currentMax = this.getMaxAllowed();

      // Check if this is a level-up situation
      const isLevelUp = (currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0;
      log(3, `Level up status: ${isLevelUp}`);
      return isLevelUp;
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

    // Allow level-up for both new characters and regular level-ups
    const canLevelUp =
      // New character starting with cantrips
      (previousLevel === 0 && currentLevel > 0) ||
      // Regular level-up cases
      ((currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0);

    log(3, `Can be leveled up: ${canLevelUp} (currentLevel=${currentLevel}, previousLevel=${previousLevel}, currentMax=${currentMax}, previousMax=${previousMax})`);

    return canLevelUp;
  }

  /**
   * Refresh manager state with latest actor data
   */
  refresh() {
    log(3, `Refreshing SpellManager for ${this.actor.name}`);
    this.classItem = this._findSpellcastingClass();
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
    this.isWizard = this._isWizard();
    this._wizardSpellbookCache = null;
    this._wizardManager = null;
    log(3, `Refreshed state: max=${this.maxCantrips}, current=${this.currentCount}, isWizard=${this.isWizard}`);
  }

  /**
   * Get preparation status for a spell
   * @param {Item5e} spell - The spell to check
   * @returns {Object} Preparation status information
   */
  getSpellPreparationStatus(spell) {
    const spellName = spell.name || 'unnamed spell';
    log(3, `Getting preparation status for ${spellName}`);

    // Default status
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

    // If it's already an actor item
    if (spell.parent === this.actor || spell._id) {
      log(3, `Spell ${spellName} is owned by actor`);
      return this._getOwnedSpellPreparationStatus(spell);
    }

    // Look for it on the actor
    const actorSpell = this.actor.items.find((item) => item.type === 'spell' && (item.name === spell.name || item.flags?.core?.sourceId === spell.compendiumUuid));

    if (!actorSpell) {
      // If it's a cantrip, check if it should be locked
      if (spell.system.level === 0) {
        const { rules, behavior } = this.settings;
        defaultStatus.isCantripLocked = behavior === ENFORCEMENT_BEHAVIOR.ENFORCED;
        defaultStatus.cantripLockReason = 'SPELLBOOK.Cantrips.MaximumReached';
        log(3, `Cantrip ${spellName} lock status: ${defaultStatus.isCantripLocked}`);
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
    const spellName = spell.name || 'unnamed spell';
    log(3, `Getting owned spell preparation status for ${spellName}`);

    const preparationMode = spell.system.preparation?.mode;
    const alwaysPrepared = preparationMode === 'always';
    const localizedPreparationMode = formattingUtils.getLocalizedPreparationMode(preparationMode);
    const sourceInfo = this._determineSpellSource(spell);
    const isGranted = !!sourceInfo && !!spell.flags?.dnd5e?.cachedFor;
    const isCantrip = spell.system.level === 0;

    // Default values
    let isCantripLocked = false;
    let cantripLockReason = '';
    let isDisabled = isGranted || alwaysPrepared || ['innate', 'pact', 'atwill', 'ritual'].includes(preparationMode);
    let disabledReason = '';

    // Set reason for standard disabled spells
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

    // Create the base result object early so we can return it
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

    // Handle cantrip-specific locking based on settings
    if (isCantrip && !alwaysPrepared && !isGranted) {
      const { rules, behavior } = this.settings;
      const isPrepared = spell.system.preparation?.prepared;

      // Skip locking if behavior is not enforced
      if (behavior !== ENFORCEMENT_BEHAVIOR.ENFORCED) {
        return result;
      }

      // Check rules variants
      if (rules === CANTRIP_RULES.LEGACY && isPrepared) {
        result.disabled = true;
        result.isCantripLocked = true;
        result.cantripLockReason = 'SPELLBOOK.Cantrips.LockedLegacy';
        result.disabledReason = 'SPELLBOOK.Cantrips.LockedLegacy';
        log(3, `Cantrip ${spellName} is locked: Legacy rules`);
      } else if (rules === CANTRIP_RULES.MODERN_LEVEL_UP && isPrepared) {
        result.disabled = true;
        result.isCantripLocked = true;
        result.cantripLockReason = 'SPELLBOOK.Cantrips.LockedOutsideLevelUp';
        result.disabledReason = 'SPELLBOOK.Cantrips.LockedOutsideLevelUp';
        log(3, `Cantrip ${spellName} is locked: Modern Level-Up rules`);
      } else if (rules === CANTRIP_RULES.MODERN_LONG_REST && isPrepared) {
        // Only apply this rule to wizards
        if (this.isWizard) {
          result.disabled = true;
          result.isCantripLocked = true;
          result.cantripLockReason = 'SPELLBOOK.Cantrips.LockedOutsideLongRest';
          result.disabledReason = 'SPELLBOOK.Cantrips.LockedOutsideLongRest';
          log(3, `Cantrip ${spellName} is locked: Modern Long Rest rules`);
        }
      }
    }

    // For wizards, check if spell is in spellbook
    if (this.isWizard && spell.system.level > 0 && preparationMode === 'prepared' && !result.disabled) {
      // Get wizard manager if needed - should be cached
      if (!this._wizardManager) {
        this._wizardManager = new WizardSpellbookManager(this.actor);
      }

      // Get the spell's UUID
      const spellUuid = spell.flags?.core?.sourceId || spell.flags?.dnd5e?.sourceId || spell.system?.parent?._source._stats.compendiumSource || spell.uuid;

      // We should already have the cache from earlier in the process flow
      if (this._wizardSpellbookCache) {
        const inSpellbook = this._wizardSpellbookCache.includes(spellUuid);
        if (!inSpellbook) {
          result.disabled = true;
          result.disabledReason = 'SPELLBOOK.Wizard.NotInSpellbook';
          log(3, `Spell ${spellName} disabled: not in wizard's spellbook`);
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
    const spellName = spell.name || 'unnamed spell';
    log(3, `Determining source for spell ${spellName}`);

    // Check advancement origin
    const advancementOrigin = spell.flags?.dnd5e?.advancementOrigin;
    if (advancementOrigin) {
      const sourceItemId = advancementOrigin.split('.')[0];
      const sourceItem = this.actor.items.get(sourceItemId);

      if (sourceItem) {
        log(3, `Found advancement origin source: ${sourceItem.name}`);
        return {
          name: sourceItem.name,
          type: sourceItem.type,
          id: sourceItem.id
        };
      }
    }

    // Check cached activity source
    const cachedFor = spell.flags?.dnd5e?.cachedFor;
    if (cachedFor && typeof cachedFor === 'string') {
      try {
        // Try manual parsing
        const pathParts = cachedFor.split('.');
        if (pathParts.length >= 3 && pathParts[1] === 'Item') {
          const itemId = pathParts[2];
          const item = this.actor.items.get(itemId);

          if (item) {
            log(3, `Found cached activity source via parsing: ${item.name}`);
            return {
              name: item.name,
              type: item.type,
              id: item.id
            };
          }
        }

        // Try resolving normally
        const activity = fromUuidSync(cachedFor, { relative: this.actor });
        const item = activity?.item;

        if (item) {
          log(3, `Found cached activity source via UUID: ${item.name}`);
          return {
            name: item.name,
            type: item.type,
            id: item.id
          };
        }
      } catch (error) {
        log(1, `Error resolving cached activity source for ${spellName}:`, error);
      }
    }

    // Check based on preparation mode
    const preparationMode = spell.system.preparation?.mode;

    if (preparationMode === 'always') {
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) {
        log(3, `Found always-prepared source: ${subclass.name}`);
        return {
          name: subclass.name,
          type: 'subclass',
          id: subclass.id
        };
      }
    } else if (preparationMode === 'pact') {
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) {
        log(3, `Found pact magic source: ${subclass.name}`);
        return {
          name: subclass.name,
          type: 'subclass',
          id: subclass.id
        };
      }
      log(3, 'Using generic Pact Magic source');
      return {
        name: 'Pact Magic',
        type: 'class'
      };
    } else {
      const classItem = this.actor.items.find((i) => i.type === 'class');
      if (classItem) {
        log(3, `Using class as source: ${classItem.name}`);
        return {
          name: classItem.name,
          type: 'class',
          id: classItem.id
        };
      }
    }

    log(1, `No source found for spell ${spellName}`);
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

    // Update the flags to complete the level-up process
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);

    // Clear any swap tracking data
    await this.completeCantripSwap(true);

    log(3, `Cantrip level-up complete: updated previous level to ${currentLevel}, previous max to ${currentMax}`);
    return true;
  }

  /**
   * Get the wizard spellbook manager if the actor is a wizard
   * @returns {WizardSpellbookManager|null} The wizard spellbook manager or null
   */
  getWizardManager() {
    if (!this._wizardManager) {
      if (this.isWizard) {
        this._wizardManager = new WizardSpellbookManager(this.actor);
      } else {
        return null;
      }
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

    // Cache wizard spellbook to avoid repeated async calls
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
    log(3, `Resetting all cantrip swap tracking data for ${this.actor.name}`);

    // Get current tracking data
    const allTracking = this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};

    // Clear longRest tracking if it exists
    if (allTracking.longRest) {
      delete allTracking.longRest;
      log(3, 'Cleared long rest cantrip swap tracking');
    }

    // Save updated tracking (or empty object if all was cleared)
    if (Object.keys(allTracking).length === 0) {
      await this.actor.unsetFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING);
      log(3, 'Removed empty cantrip swap tracking flag');
    } else {
      await this.actor.setFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING, allTracking);
      log(3, 'Updated cantrip swap tracking with cleared data');
    }
  }
}
