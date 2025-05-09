/**
 * Helper functions for spell preparation
 * Manages checking and saving prepared spells
 * @module spell-book/helpers/spell-preparation
 */

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
          }
        }
      } catch (error) {
        log(1, `Error fetching spell ${uuid}:`, error);
      }
    }
  }

  // Process all changes in batches
  if (spellIdsToRemove.length > 0) {
    await actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
  }

  if (spellsToUpdate.length > 0) {
    await actor.updateEmbeddedDocuments('Item', spellsToUpdate);
  }

  if (spellsToCreate.length > 0) {
    await actor.createEmbeddedDocuments('Item', spellsToCreate);
  }

  // Process cantrip changes if any
  if (cantripChanges.hasChanges) {
    const cantripManager = new CantripManager(actor);
    const settings = cantripManager.getSettings();

    // Send notification to GM if appropriate
    if (settings.behavior === CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM) {
      notifyGMOfCantripChanges(actor, cantripChanges);
    }

    // Update unlearned cantrips counter for modern rules
    if (settings.rules === CANTRIP_RULES.MODERN && cantripChanges.removed.length > 0) {
      await cantripManager.recordUnlearnedCantrip();
    }
  }
}

/**
 * Notify GM about cantrip changes
 * @param {Actor5e} actor - The actor
 * @param {Object} changes - Information about changes
 */
function notifyGMOfCantripChanges(actor, changes) {
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
}

/**
 * Get cantrip settings for an actor
 * @param {Actor5e} actor - The actor to get settings for
 * @returns {Object} Actor's cantrip settings
 */
export function getCantripSettings(actor) {
  return {
    rules: actor.getFlag(MODULE.ID, FLAGS.CANTRIP_RULES) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_RULES),
    behavior: actor.getFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_CANTRIP_BEHAVIOR)
  };
}

/**
 * Check if a cantrip can be changed
 * @param {Actor5e} actor - The actor
 * @param {Item5e} spell - The spell item
 * @param {number} [uiCount] - Current cantrip count from UI
 * @returns {Object} Status information about cantrip change
 */
export function canChangeCantrip(actor, spell, uiCount) {
  if (spell.system.level !== 0) return { allowed: true };

  const classItem = actor.items.find((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
  const currentCount = uiCount !== undefined ? uiCount : getCurrentCantripsCount(actor);
  const maxCantrips = getMaxCantripsAllowed(actor, classItem);
  const isChecked = spell.system.preparation?.prepared || false;

  if (!isChecked && currentCount >= maxCantrips) {
    return {
      allowed: false,
      message: 'Maximum cantrips reached'
    };
  }

  return { allowed: true };
}

/**
 * Get cantrip lock status
 * @param {Actor5e} actor - The actor
 * @param {Item5e} spell - The spell item
 * @returns {Object} Lock status
 */
export function getCantripLockStatus(actor, spell) {
  if (spell.system.level !== 0) {
    return { locked: false };
  }

  const settings = getCantripSettings(actor);
  const classItem = actor.items.find((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
  const currentCount = getCurrentCantripsCount(actor);
  const maxCantrips = getMaxCantripsAllowed(actor, classItem);
  const isAtMax = currentCount >= maxCantrips;
  const isChecked = spell.system.preparation?.prepared || false;
  const unlearned = actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
  const isLevelUp = canCantripsBeLeveledUp(actor);

  switch (settings.behavior) {
    case CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED:
    case CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM:
      return { locked: false };

    case CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX:
      if (!isLevelUp) {
        return {
          locked: true,
          reason: settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LockedDefault' : 'SPELLBOOK.Cantrips.LockedModern'
        };
      }

      if (settings.rules === CANTRIP_RULES.DEFAULT) {
        if (isChecked) {
          return {
            locked: true,
            reason: 'SPELLBOOK.Cantrips.LockedDefault'
          };
        }
        if (!isChecked && isAtMax) {
          return {
            locked: true,
            reason: 'Maximum cantrips reached'
          };
        }
        return { locked: false };
      }

      if (settings.rules === CANTRIP_RULES.MODERN) {
        if (isChecked && unlearned >= 1) {
          return {
            locked: true,
            reason: 'SPELLBOOK.Cantrips.CannotUnlearnMore'
          };
        }
        if (!isChecked && isAtMax) {
          return {
            locked: true,
            reason: 'Maximum cantrips reached'
          };
        }
        return { locked: false };
      }
      break;
  }

  return { locked: true, reason: 'Cantrip changes not allowed' };
}

/**
 * Calculate the maximum number of cantrips allowed for an actor
 * @param {Actor5e} actor - The actor
 * @param {Item5e} classItem - The spellcasting class item
 * @returns {number} Maximum allowed cantrips
 */
export function getMaxCantripsAllowed(actor, classItem) {
  if (!classItem) return 0;

  if (classItem.scaleValues) {
    const cantripsKnown = classItem.scaleValues['cantrips-known']?.value;
    if (cantripsKnown !== undefined) return cantripsKnown;
  }

  return 0;
}

/**
 * Count the number of currently prepared cantrips
 * @param {Actor5e} actor - The actor
 * @returns {number} Currently prepared cantrips
 */
export function getCurrentCantripsCount(actor) {
  return actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).length;
}

/**
 * Check if actor has had a level up that affects cantrips
 * @param {Actor5e} actor - The actor to check
 * @param {Item5e} classItem - The spellcasting class
 * @returns {boolean} Whether a level-up cantrip change is allowed
 */
export function checkForCantripLevelUp(actor, classItem) {
  try {
    const previousLevel = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
    const currentLevel = actor.system.details.level;
    const currentMax = getMaxCantripsAllowed(actor, classItem);

    if (previousLevel !== currentLevel || previousMax !== currentMax) {
      actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
      actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);

      if (currentMax > previousMax && previousLevel > 0) {
        actor.setFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS, 0);
        return true;
      }
    }

    return (currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0;
  } catch (error) {
    log(1, 'Error checking for cantrip level up:', error);
    return false;
  }
}

/**
 * Check if a spell is already prepared on an actor
 * @param {Actor5e} actor - The actor to check
 * @param {Item5e} spell - The spell document
 * @returns {object} - Status information about spell preparation
 */
export function getSpellPreparationStatus(actor, spell) {
  log(3, `Checking preparation status for ${spell.name}`);

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
  if (spell.parent === actor || spell._id) {
    log(3, 'Using actor-owned spell directly');
    return getOwnedSpellPreparationStatus(actor, spell);
  }

  // Look for it on the actor
  const actorSpell = actor.items.find((item) => item.type === 'spell' && (item.name === spell.name || item.flags?.core?.sourceId === spell.compendiumUuid));

  if (!actorSpell) {
    // If it's a cantrip, check if it should be locked
    if (spell.system.level === 0) {
      const cantripStatus = getCantripLockStatus(actor, spell);
      defaultStatus.isCantripLocked = cantripStatus.locked;
      defaultStatus.cantripLockReason = cantripStatus.reason;
    }
    return defaultStatus;
  }

  return getOwnedSpellPreparationStatus(actor, actorSpell);
}

/**
 * Get preparation status for a spell that's on the actor
 * @param {Actor5e} actor - The actor that owns the spell
 * @param {Item5e} spell - The spell item
 * @returns {object} - Preparation status information
 */
export function getOwnedSpellPreparationStatus(actor, spell) {
  // Get preparation information
  const preparationMode = spell.system.preparation?.mode || 'prepared';
  const alwaysPrepared = preparationMode === 'always';
  const localizedPreparationMode = formattingUtils.getLocalizedPreparationMode(preparationMode);

  // Get source
  const sourceInfo = determineSpellSource(actor, spell);
  const isGranted = !!sourceInfo && spell.flags?.dnd5e?.cachedFor;

  // Check if it's a cantrip
  const isCantrip = spell.system.level === 0;

  // Default values
  let hideCheckbox = false;
  let isCantripLocked = false;
  let cantripLockReason = '';

  // Handle cantrip-specific behavior based on settings
  if (isCantrip && !alwaysPrepared && !isGranted) {
    const settings = getCantripSettings(actor);
    const behavior = settings.behavior;
    log(1, { settings: settings, behavior: behavior });

    switch (behavior) {
      case CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED:
      case CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM:
        // Never hide checkboxes for these behaviors - always allow changes
        // (max limit enforcement happens elsewhere)
        break;

      case CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX:
        // Check if cantrips can be changed at all
        const canChange = canCantripsBeLeveledUp(actor);

        // Hide checkbox for existing cantrips that can't be changed
        if (spell.system.preparation?.prepared && !canChange) {
          hideCheckbox = true;
          isCantripLocked = true;
          cantripLockReason = settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LockedDefault' : 'SPELLBOOK.Cantrips.LockedModern';
        }

        // For modern rules, check unlearned limit
        if (canChange && spell.system.preparation?.prepared && settings.rules === CANTRIP_RULES.MODERN) {
          const unlearned = actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
          if (unlearned >= 1) {
            hideCheckbox = true;
            isCantripLocked = true;
            cantripLockReason = 'SPELLBOOK.Cantrips.CannotUnlearnMore';
          }
        }
        break;

      default:
        // Unknown behavior, be safe and lock cantrips
        if (spell.system.preparation?.prepared) {
          hideCheckbox = true;
          isCantripLocked = true;
          cantripLockReason = 'SPELLBOOK.Cantrips.LockedDefault';
        }
    }
  }

  // Return status
  return {
    prepared: isGranted || spell.system.preparation?.prepared || alwaysPrepared,
    isOwned: true,
    preparationMode: preparationMode,
    localizedPreparationMode: localizedPreparationMode,
    disabled: isGranted || alwaysPrepared || ['innate', 'pact', 'atwill', 'ritual'].includes(preparationMode),
    hideCheckbox: hideCheckbox,
    alwaysPrepared: alwaysPrepared,
    sourceItem: sourceInfo,
    isGranted: isGranted,
    isCantripLocked: isCantripLocked,
    cantripLockReason: cantripLockReason
  };
}

/**
 * Check if cantrips can be changed (level-up situation)
 * @param {Actor5e} actor - The actor to check
 * @returns {boolean} - Whether cantrips can be changed
 */
export function canCantripsBeLeveledUp(actor) {
  const previousLevel = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
  const previousMax = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
  const classItem = actor.items.find((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
  const currentLevel = actor.system.details.level;
  const currentMax = getMaxCantripsAllowed(actor, classItem);

  return (currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0;
}

/**
 * Determine the source of a spell on the actor
 * @param {Actor5e} actor - The actor
 * @param {Item5e} spell - The spell item
 * @returns {Object|null} - Source information for the spell
 */
export function determineSpellSource(actor, spell) {
  // Check advancement origin
  const advancementOrigin = spell.flags?.dnd5e?.advancementOrigin;
  if (advancementOrigin) {
    const sourceItemId = advancementOrigin.split('.')[0];
    const sourceItem = actor.items.get(sourceItemId);

    if (sourceItem) {
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
        const item = actor.items.get(itemId);

        if (item) {
          return {
            name: item.name,
            type: item.type,
            id: item.id
          };
        }
      }

      // Try resolving normally
      const activity = fromUuidSync(cachedFor, { relative: actor });
      const item = activity?.item;

      if (item) {
        return {
          name: item.name,
          type: item.type,
          id: item.id
        };
      }
    } catch (error) {
      log(1, `Error resolving cached activity source for ${spell.name}:`, error);
    }
  }

  // Check based on preparation mode
  const preparationMode = spell.system.preparation?.mode;

  if (preparationMode === 'always') {
    const subclass = actor.items.find((i) => i.type === 'subclass');
    if (subclass) {
      return {
        name: subclass.name,
        type: 'subclass',
        id: subclass.id
      };
    }
  } else if (preparationMode === 'pact') {
    const subclass = actor.items.find((i) => i.type === 'subclass');
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
    const classItem = actor.items.find((i) => i.type === 'class');
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
 * Manages cantrip-related functionality including settings, limits, and tracking
 */
export class CantripManager {
  /**
   * Create a new CantripManager for an actor
   * @param {Actor5e} actor - The actor to manage cantrips for
   */
  constructor(actor) {
    this.actor = actor;
    this.classItem = this._findSpellcastingClass();
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
  }

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
   * Save cantrip settings to the actor
   * @param {string} rules - The rules type to use
   * @param {string} behavior - The behavior type to use
   * @returns {Promise<boolean>} Success state
   */
  async saveSettings(rules, behavior) {
    await this.actor.update({
      [`flags.${MODULE.ID}.${FLAGS.CANTRIP_RULES}`]: rules,
      [`flags.${MODULE.ID}.${FLAGS.CANTRIP_CHANGE_BEHAVIOR}`]: behavior
    });
    this.settings = this.getSettings();
    return true;
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

    return 0;
  }

  /**
   * Get the current count of prepared cantrips
   * @returns {number} Currently prepared cantrips count
   */
  getCurrentCount() {
    return this.actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && i.system.preparation?.prepared && !i.system.preparation?.alwaysPrepared).length;
  }

  /**
   * Initialize cantrip flags on the actor
   * @returns {Promise<Object>} Update data applied, if any
   */
  async initializeFlags() {
    const updateData = {};
    const flags = this.actor.flags?.[MODULE.ID] || {};

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
      updateData[`flags.${MODULE.ID}.${FLAGS.CANTRIP_CHANGE_ALLOWED}`] = true;
      updateData[`flags.${MODULE.ID}.${FLAGS.UNLEARNED_CANTRIPS}`] = 0;
    }

    // Apply updates if needed
    if (Object.keys(updateData).length > 0) {
      await this.actor.update(updateData);
    }

    return updateData;
  }

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

    // Block if would exceed max (for checking a cantrip)
    if (!isChecked && currentCount >= this.maxCantrips) {
      return {
        allowed: false,
        message: 'Maximum cantrips reached'
      };
    }

    // If we got here, allow the change
    return { allowed: true };
  }

  /**
   * Check if actor has had a level up that affects cantrips
   * @returns {boolean} Whether a level-up cantrip change is allowed
   */
  checkForLevelUp() {
    // Get previous values
    const previousLevel = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = this.actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;

    // Get current values
    const currentLevel = this.actor.system.details.level;
    const currentMax = this.getMaxAllowed();

    // Update stored values if different
    if (previousLevel !== currentLevel || previousMax !== currentMax) {
      this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
      this.actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);

      // Reset unlearned count if max increased
      if (currentMax > previousMax && previousLevel > 0) {
        this.actor.setFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS, 0);
        return true;
      }
    }

    // Check if this is a level-up situation
    return (currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0;
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

    return (currentLevel > previousLevel || currentMax > previousMax) && previousLevel > 0;
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

    const isAtMax = this.currentCount >= this.maxCantrips;
    const isChecked = spell.system.preparation?.prepared || false;
    const unlearned = this.actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
    const isLevelUp = this.canBeLeveledUp();

    // Handle based on behavior setting
    switch (this.settings.behavior) {
      case CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED:
      case CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM:
        // Never locked
        return { locked: false };

      case CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX:
        // If not during level-up, lock all cantrips
        if (!isLevelUp) {
          return {
            locked: true,
            reason: this.settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LockedDefault' : 'SPELLBOOK.Cantrips.LockedModern'
          };
        }

        // Default rules during level-up
        if (this.settings.rules === CANTRIP_RULES.DEFAULT) {
          // Always lock checked cantrips
          if (isChecked) {
            return {
              locked: true,
              reason: 'SPELLBOOK.Cantrips.LockedDefault'
            };
          }

          // Lock unchecked if at max
          if (!isChecked && isAtMax) {
            return {
              locked: true,
              reason: 'Maximum cantrips reached'
            };
          }

          // Otherwise don't lock
          return { locked: false };
        }

        // Modern rules during level-up
        if (this.settings.rules === CANTRIP_RULES.MODERN) {
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
        break;
    }

    // Default fallback - lock to be safe
    return { locked: true, reason: 'Cantrip changes not allowed' };
  }

  /**
   * Record unlearned cantrip
   * @returns {Promise<void>}
   */
  async recordUnlearnedCantrip() {
    const unlearned = this.actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
    await this.actor.setFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS, unlearned + 1);
  }

  /**
   * Refresh manager state
   */
  refresh() {
    this.classItem = this._findSpellcastingClass();
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
  }
}
