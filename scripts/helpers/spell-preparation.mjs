import { CANTRIP_CHANGE_BEHAVIOR, CANTRIP_RULES, FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as formattingUtils from './spell-formatting.mjs';

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
      const settings = spellManager.getSettings();

      // Send notification to GM if appropriate
      if (settings.behavior === CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM) {
        notifyGMOfCantripChanges(actor, cantripChanges);
      }

      // Update unlearned cantrips counter for modern rules
      if (settings.rules === CANTRIP_RULES.MODERN && cantripChanges.removed.length > 0) {
        await spellManager.recordUnlearnedCantrip();
      }
    }
  } catch (error) {
    log(1, `Error saving prepared spells for ${actor?.name || 'unknown actor'}:`, error);
    ui.notifications.error(game.i18n.localize('SPELLBOOK.Error.SavingFailed'));
  }
}

/**
 * Notify GM about cantrip changes
 * @param {Actor5e} actor - The actor
 * @param {Object} changes - Information about changes
 * @private
 */
function notifyGMOfCantripChanges(actor, changes) {
  log(3, `Notifying GM about cantrip changes for ${actor.name}`);

  // Get original cantrips (before changes)
  const currentCantrips = actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).map((i) => i.name);

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
  let content = `<h3>${game.i18n.format('SPELLBOOK.Cantrips.ChangeNotification', { name: actor.name })}</h3>`;

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

/**
 * Manages cantrip-related functionality including settings, limits, and tracking
 */
export class SpellManager {
  /**
   * Create a new SpellManager for an actor
   * @param {Actor5e} actor - The actor to manage cantrips for
   */
  constructor(actor) {
    this.actor = actor;
    log(3, `Creating SpellManager for ${actor.name}`);
    this.classItem = this._findSpellcastingClass();
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();

    log(3, `SpellManager initialized: max=${this.maxCantrips}, current=${this.currentCount}`);
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
   * Get cantrip settings for the actor
   * @returns {Object} Actor's cantrip settings
   */
  getSettings() {
    return {
      rules: this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_RULES) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_RULES),
      behavior: this.actor.getFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_BEHAVIOR)
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
   * Get the current count of prepared cantrips
   * @returns {number} Currently prepared cantrips count
   */
  getCurrentCount() {
    return this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).length;
  }

  /* -------------------------------------------- */
  /*  Flag Management Methods                     */
  /* -------------------------------------------- */

  /**
   * Initialize cantrip flags on the actor
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

    // Default cantrip behavior
    if (flags[FLAGS.CANTRIP_CHANGE_BEHAVIOR] === undefined) {
      updateData[`flags.${MODULE.ID}.${FLAGS.CANTRIP_CHANGE_BEHAVIOR}`] = game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_BEHAVIOR);
    }

    // First-time setup
    const isFirstTime = flags[FLAGS.PREVIOUS_LEVEL] === undefined && flags[FLAGS.PREVIOUS_CANTRIP_MAX] === undefined;

    if (isFirstTime) {
      log(3, 'First time setup for cantrip flags');
      updateData[`flags.${MODULE.ID}.${FLAGS.CANTRIP_CHANGE_ALLOWED}`] = true;
      updateData[`flags.${MODULE.ID}.${FLAGS.UNLEARNED_CANTRIPS}`] = 0;
    }

    // Apply updates if needed
    if (Object.keys(updateData).length > 0) {
      log(3, 'Applying flag updates:', updateData);
      await this.actor.update(updateData);
    }

    return updateData;
  }

  /**
   * Save cantrip settings to the actor
   * @param {string} rules - The rules type to use
   * @param {string} behavior - The behavior type to use
   * @returns {Promise<boolean>} Success state
   */
  async saveSettings(rules, behavior) {
    log(3, `Saving cantrip settings: rules=${rules}, behavior=${behavior}`);

    await this.actor.update({
      [`flags.${MODULE.ID}.${FLAGS.CANTRIP_RULES}`]: rules,
      [`flags.${MODULE.ID}.${FLAGS.CANTRIP_CHANGE_BEHAVIOR}`]: behavior
    });

    this.settings = this.getSettings();
    log(3, 'Settings saved successfully');
    return true;
  }

  /**
   * Record unlearned cantrip
   * @returns {Promise<void>}
   */
  async recordUnlearnedCantrip() {
    const unlearned = this.actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
    log(3, `Recording unlearned cantrip, count before: ${unlearned}`);
    await this.actor.setFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS, unlearned + 1);
  }

  /* -------------------------------------------- */
  /*  Cantrip State Methods                       */
  /* -------------------------------------------- */

  /**
   * Check if a cantrip can be changed based on current settings
   * @param {Item5e} spell - The spell to check
   * @param {number} [uiCount] - Current count from UI state
   * @returns {Object} Status information about cantrip change
   */
  canChange(spell, uiCount) {
    // Skip non-cantrips
    if (spell.system.level !== 0) return { allowed: true };

    // Get current counts
    const currentCount = uiCount !== undefined ? uiCount : this.getCurrentCount();
    const isChecked = spell.system.preparation?.prepared || false;
    const cantripName = spell.name || 'cantrip';

    log(3, `Checking if cantrip ${cantripName} can change: current=${currentCount}, max=${this.maxCantrips}, isChecked=${isChecked}`);

    // Block if would exceed max (for checking a cantrip)
    if (!isChecked && currentCount >= this.maxCantrips) {
      return {
        allowed: false,
        message: 'SPELLBOOK.Cantrips.MaximumReached'
      };
    }

    // Check lock status based on rules and behavior
    const lockStatus = this.getLockStatus(spell);
    if (lockStatus.locked) {
      return {
        allowed: false,
        message: lockStatus.reason
      };
    }

    // If we got here, allow the change
    return { allowed: true };
  }
  /**
   * Get the lock status for a cantrip based on settings and rules
   * @param {Item5e} spell - The spell to check
   * @returns {Object} Lock status information
   */
  getLockStatus(spell) {
    // Only applicable to cantrips
    if (spell.system.level !== 0) {
      return { locked: false };
    }

    log(3, `Getting lock status for cantrip ${spell.name}`);

    const isAtMax = this.currentCount >= this.maxCantrips;
    const isChecked = spell.system.preparation?.prepared || false;
    const unlearned = this.actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
    const isLevelUp = this.canBeLeveledUp();
    const isDefaultRules = this.settings.rules === CANTRIP_RULES.DEFAULT;

    // Handle based on behavior setting
    switch (this.settings.behavior) {
      case CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED:
      case CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM:
        // Never locked
        return { locked: false };

      case CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX:
        // For DEFAULT rules:
        // - When not in level-up, only lock if at max OR if trying to get status for already prepared cantrip
        if (isDefaultRules) {
          if (isAtMax && !isChecked) {
            return {
              locked: true,
              reason: 'SPELLBOOK.Cantrips.MaximumReached'
            };
          }
          // Don't lock unprepared cantrips when below max
          return { locked: false };
        }

        // For MODERN rules during level-up
        if (!isDefaultRules && isLevelUp) {
          // If checked and already unlearned max
          if (isChecked && unlearned >= 1) {
            return {
              locked: true,
              reason: 'SPELLBOOK.Cantrips.CannotUnlearnMore'
            };
          }

          // If unchecked and at max
          if (!isChecked && isAtMax) {
            return {
              locked: true,
              reason: 'Maximum cantrips reached'
            };
          }

          // Otherwise don't lock
          return { locked: false };
        }

        // If not in level-up with MODERN rules, lock everything
        if (!isDefaultRules && !isLevelUp) {
          return {
            locked: true,
            reason: 'SPELLBOOK.Cantrips.LockedModern'
          };
        }

        // Default case for this behavior
        return { locked: false };
    }

    // Default fallback - lock to be safe
    return { locked: true, reason: 'Cantrip changes not allowed' };
  }

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

      // Check if unlearned cantrips should be reset
      if (currentMax > previousMax && previousLevel > 0) {
        this.actor.setFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS, 0);
      }

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
    log(3, `Refreshed state: max=${this.maxCantrips}, current=${this.currentCount}`);
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
        const cantripStatus = this.getLockStatus(spell);
        defaultStatus.isCantripLocked = cantripStatus.locked;
        defaultStatus.cantripLockReason = cantripStatus.reason;
        log(3, `Cantrip ${spellName} lock status: ${cantripStatus.locked}`);
      }
      return defaultStatus;
    }

    return this._getOwnedSpellPreparationStatus(actorSpell);
  }

  /**
   * Get preparation status for a spell that's on the actor
   * @param {Item5e} spell - The spell item
   * @returns {object} - Preparation status information
   * @private
   */
  _getOwnedSpellPreparationStatus(spell) {
    const spellName = spell.name || 'unnamed spell';
    log(3, `Getting owned spell preparation status for ${spellName}`);

    // Get preparation information
    const preparationMode = spell.system.preparation?.mode || 'prepared';
    const alwaysPrepared = preparationMode === 'always';
    const localizedPreparationMode = formattingUtils.getLocalizedPreparationMode(preparationMode);

    // Get source
    const sourceInfo = this._determineSpellSource(spell);
    const isGranted = !!sourceInfo && spell.flags?.dnd5e?.cachedFor;

    // Check if it's a cantrip
    const isCantrip = spell.system.level === 0;

    // Default values
    let isCantripLocked = false;
    let cantripLockReason = '';

    // Base disabled state - for spells that should always be disabled
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

    // Handle cantrip-specific behavior based on settings
    if (isCantrip && !alwaysPrepared && !isGranted) {
      const settings = this.getSettings();
      const behavior = settings.behavior;
      const isDefaultRules = settings.rules === CANTRIP_RULES.DEFAULT;
      const isPrepared = spell.system.preparation?.prepared;

      log(3, `Handling cantrip-specific behavior for ${spellName}, behavior=${behavior}`);

      switch (behavior) {
        case CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED:
        case CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM:
          // Never disable checkboxes for these behaviors - always allow changes
          break;

        case CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX:
          const isLevelUp = this.canBeLeveledUp();

          // For DEFAULT rules:
          // - Disable already prepared cantrips when not in level-up
          if (isDefaultRules && isPrepared && !isLevelUp) {
            isDisabled = true;
            isCantripLocked = true;
            cantripLockReason = 'SPELLBOOK.Cantrips.LockedDefault';
            log(3, `Cantrip ${spellName} is locked: ${cantripLockReason}`);
          }
          // For MODERN rules, check unlearned limit during level-up
          else if (!isDefaultRules && isLevelUp && isPrepared) {
            const unlearned = this.actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
            if (unlearned >= 1) {
              isDisabled = true;
              isCantripLocked = true;
              cantripLockReason = 'SPELLBOOK.Cantrips.CannotUnlearnMore';
              log(3, `Cantrip ${spellName} is locked due to unlearned limit`);
            }
          }
          // For non-level-up MODERN, lock all prepared cantrips
          else if (!isDefaultRules && !isLevelUp && isPrepared) {
            isDisabled = true;
            isCantripLocked = true;
            cantripLockReason = 'SPELLBOOK.Cantrips.LockedModern';
          }
          break;

        default:
          // Unknown behavior, be safe and lock prepared cantrips
          if (isPrepared) {
            isDisabled = true;
            isCantripLocked = true;
            cantripLockReason = 'SPELLBOOK.Cantrips.LockedDefault';
          }
      }
    }

    // If this cantrip is locked, override the disabled reason
    if (isCantripLocked) {
      disabledReason = cantripLockReason;
    }

    // Return status
    return {
      prepared: isGranted || spell.system.preparation?.prepared || alwaysPrepared,
      isOwned: true,
      preparationMode: preparationMode,
      localizedPreparationMode: localizedPreparationMode,
      disabled: isDisabled,
      disabledReason: disabledReason,
      alwaysPrepared: alwaysPrepared,
      sourceItem: sourceInfo,
      isGranted: isGranted,
      isCantripLocked: isCantripLocked,
      cantripLockReason: cantripLockReason
    };
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
   * Moved from global function to SpellManager method
   * @param {Object} spellData - Object mapping spell UUIDs to preparation data
   * @returns {Promise<void>}
   */
  async saveActorPreparedSpells(spellData) {
    await saveActorPreparedSpells(this.actor, spellData);
  }

  async completeCantripsLevelUp() {
    const currentLevel = this.actor.system.details.level;
    const currentMax = this.getMaxAllowed();

    // Update the flags to complete the level-up process
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
    await this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);
    log(3, `Cantrip level-up complete: updated previous level to ${currentLevel}, previous max to ${currentMax}`);
    return true;
  }
}
