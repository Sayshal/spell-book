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
  log(3, 'Saving prepared spells');

  // Check for cantrip changes
  const cantripChanges = trackCantripChanges(actor, spellData);

  // Extract prepared spell UUIDs
  const preparedUuids = Object.entries(spellData)
    .filter(([_uuid, data]) => data.isPrepared)
    .map(([uuid]) => uuid);

  // Save to actor flags
  await actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, preparedUuids);

  // Process each spell
  for (const [uuid, data] of Object.entries(spellData)) {
    // Skip always prepared spells
    if (data.isAlwaysPrepared) continue;

    // Check if on actor
    const existingSpell = actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid));

    if (data.isPrepared) {
      // Spell should be prepared
      if (existingSpell) {
        // Update if needed
        if (!existingSpell.system.preparation?.prepared) {
          await actor.updateEmbeddedDocuments('Item', [
            {
              '_id': existingSpell.id,
              'system.preparation.prepared': true
            }
          ]);
        }
      } else {
        // Create the spell
        try {
          const sourceSpell = await fromUuid(uuid);
          if (sourceSpell) {
            const spellData = sourceSpell.toObject();
            if (!spellData.system.preparation) {
              spellData.system.preparation = {};
            }
            spellData.system.preparation.prepared = true;
            spellData.flags = spellData.flags || {};
            spellData.flags.core = spellData.flags.core || {};
            spellData.flags.core.sourceId = uuid;

            await actor.createEmbeddedDocuments('Item', [spellData]);
          }
        } catch (error) {
          log(1, `Error fetching spell ${uuid}:`, error);
        }
      }
    } else if (data.wasPrepared) {
      // Remove spell that was prepared but now isn't
      if (existingSpell && existingSpell.system.preparation?.mode === 'prepared' && !existingSpell.system.preparation?.alwaysPrepared) {
        await actor.deleteEmbeddedDocuments('Item', [existingSpell.id]);
      }
    }
  }

  // Notify GM of cantrip changes if needed
  if (cantripChanges.hasChanges) {
    await processCantripChanges(actor, cantripChanges);
  }
}

/**
 * Track changes in cantrip preparation
 * @param {Actor5e} actor - The actor
 * @param {Object} spellData - Object of spell data with preparation info
 * @returns {Object} Information about cantrip changes
 */
function trackCantripChanges(actor, spellData) {
  const changes = {
    added: [],
    removed: [],
    hasChanges: false
  };

  // Get cantrip settings
  const settings = getCantripSettings(actor);

  // Skip tracking if unrestricted
  if (settings.behavior === CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED) {
    return changes;
  }

  // Get the actor's current cantrips
  const actorCantrips = actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && !i.system.preparation?.alwaysPrepared);
  const currentCantrips = new Set(actorCantrips.map((c) => c.flags?.core?.sourceId || c.uuid));

  // Build set of cantrips being prepared
  const newCantrips = new Set();
  for (const [uuid, data] of Object.entries(spellData)) {
    if (data.isPrepared) {
      // Check if it's a cantrip
      const spell = actor.items.find((i) => i.flags?.core?.sourceId === uuid || i.uuid === uuid);
      if (spell && spell.system.level === 0) {
        newCantrips.add(uuid);
      } else if (!spell) {
        // It might be a new cantrip not yet on the actor - check from source
        try {
          fromUuid(uuid).then((sourceSpell) => {
            if (sourceSpell && sourceSpell.system.level === 0) {
              newCantrips.add(uuid);
            }
          });
        } catch (e) {
          log(1, `Error checking new spell ${uuid}:`, e);
        }
      }
    }
  }

  // Find cantrips being added (in new set but not in current set)
  for (const uuid of newCantrips) {
    if (!currentCantrips.has(uuid)) {
      // Find name from spell data
      let name = 'Unknown Cantrip';
      for (const [dataUuid, data] of Object.entries(spellData)) {
        if (dataUuid === uuid) {
          name = data.name;
          break;
        }
      }

      changes.added.push({
        name: name,
        uuid: uuid
      });
      changes.hasChanges = true;
    }
  }

  // Find cantrips being removed (in current set but not in new set)
  for (const uuid of currentCantrips) {
    if (!newCantrips.has(uuid)) {
      const cantrip = actorCantrips.find((c) => c.flags?.core?.sourceId === uuid || c.uuid === uuid);
      if (cantrip) {
        changes.removed.push({
          name: cantrip.name,
          uuid: uuid
        });
        changes.hasChanges = true;
      }
    }
  }

  return changes;
}

/**
 * Process cantrip changes based on actor settings
 * @param {Actor5e} actor - The actor
 * @param {Object} changes - Cantrip changes information
 */
async function processCantripChanges(actor, changes) {
  const settings = getCantripSettings(actor);

  // Send notification to GM if appropriate
  if (settings.behavior === CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM) {
    notifyGMOfCantripChanges(actor, changes);
  }

  // Update unlearned cantrips counter for modern rules
  if (settings.rules === CANTRIP_RULES.MODERN) {
    const unlearned = actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
    await actor.setFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS, unlearned + changes.removed.length);
  }
}

/**
 * Notify GM about cantrip changes
 * @param {Actor5e} actor - The actor
 * @param {Object} changes - Information about changes
 */
function notifyGMOfCantripChanges(actor, changes) {
  let content = `<h3>${game.i18n.format('SPELLBOOK.Cantrips.ChangeNotification', { name: actor.name })}</h3>`;

  // Display original cantrips
  const originalCantrips = actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && !i.system.preparation?.alwaysPrepared).map((i) => i.name);

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
  const newList = originalCantrips.filter((name) => !changes.removed.some((c) => c.name === name)).concat(changes.added.map((c) => c.name));

  if (newList.length > 0) {
    content += `<p><strong>New Cantrips:</strong> ${newList.join(', ')}</p>`;
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
 * @returns {Object} Status information about cantrip change
 */
export function canChangeCantrip(actor, spell) {
  // Skip non-cantrips
  if (spell.system.level !== 0) return { allowed: true };

  // Get settings and current state
  const settings = getCantripSettings(actor);
  const classItem = actor.items.find((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
  const currentCount = getCurrentCantripsCount(actor);
  const maxCantrips = getMaxCantripsAllowed(actor, classItem);
  const isAtMax = currentCount >= maxCantrips;
  const isChecked = spell.system.preparation?.prepared || false;
  const unlearned = actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;

  // Check for level-up situation
  const previousLevel = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
  const previousMax = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
  const currentLevel = actor.system.details.level;
  const isLevelUp = (currentLevel > previousLevel || maxCantrips > previousMax) && previousLevel > 0;

  // Handle based on behavior
  switch (settings.behavior) {
    case CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED:
      // Always allow changes
      return { allowed: true };

    case CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM:
      // Always allow changes (notification happens during save)
      return { allowed: true };

    case CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX:
      // If not during level-up, don't allow changes
      if (!isLevelUp) {
        return {
          allowed: false,
          message: settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LockedDefault' : 'SPELLBOOK.Cantrips.LockedModern'
        };
      }

      // Default rules during level-up
      if (settings.rules === CANTRIP_RULES.DEFAULT) {
        // Never allow unchecking
        if (isChecked) {
          return {
            allowed: false,
            message: 'SPELLBOOK.Cantrips.LockedDefault'
          };
        }

        // Don't allow checking if at max
        if (!isChecked && isAtMax) {
          return {
            allowed: false,
            message: 'Maximum cantrips reached'
          };
        }

        // Allow checking new cantrips
        return { allowed: true };
      }

      // Modern rules during level-up
      if (settings.rules === CANTRIP_RULES.MODERN) {
        // If trying to uncheck and already unlearned max amount
        if (isChecked && unlearned >= 1) {
          return {
            allowed: false,
            message: 'SPELLBOOK.Cantrips.CannotUnlearnMore'
          };
        }

        // If trying to check and already at max
        if (!isChecked && isAtMax) {
          return {
            allowed: false,
            message: 'Maximum cantrips reached'
          };
        }

        // Otherwise allow the change
        return {
          allowed: true,
          willCount: isChecked // Will count as unlearning if unchecking
        };
      }
      break;
  }

  // Default fallback - don't allow
  return {
    allowed: false,
    message: 'Cantrip changes not allowed'
  };
}

/**
 * Get cantrip lock status
 * @param {Actor5e} actor - The actor
 * @param {Item5e} spell - The spell item
 * @returns {Object} Lock status
 */
export function getCantripLockStatus(actor, spell) {
  // Only applicable to cantrips
  if (spell.system.level !== 0) {
    return { locked: false };
  }

  // Get settings and current state
  const settings = getCantripSettings(actor);
  const classItem = actor.items.find((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
  const currentCount = getCurrentCantripsCount(actor);
  const maxCantrips = getMaxCantripsAllowed(actor, classItem);
  const isAtMax = currentCount >= maxCantrips;
  const isChecked = spell.system.preparation?.prepared || false;
  const unlearned = actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;

  // Check for level-up situation
  const previousLevel = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
  const previousMax = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;
  const currentLevel = actor.system.details.level;
  const isLevelUp = (currentLevel > previousLevel || maxCantrips > previousMax) && previousLevel > 0;

  // Handle based on behavior
  switch (settings.behavior) {
    case CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED:
      // Never locked
      return { locked: false };

    case CANTRIP_CHANGE_BEHAVIOR.NOTIFY_GM:
      // Never locked
      return { locked: false };

    case CANTRIP_CHANGE_BEHAVIOR.LOCK_AFTER_MAX:
      // If not during level-up, lock all cantrips
      if (!isLevelUp) {
        return {
          locked: true,
          reason: settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LockedDefault' : 'SPELLBOOK.Cantrips.LockedModern'
        };
      }

      // Default rules during level-up
      if (settings.rules === CANTRIP_RULES.DEFAULT) {
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
      if (settings.rules === CANTRIP_RULES.MODERN) {
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
  return {
    locked: true,
    reason: 'Cantrip changes not allowed'
  };
}

/**
 * Calculate the maximum number of cantrips allowed for an actor
 * @param {Actor5e} actor - The actor
 * @param {Item5e} classItem - The spellcasting class item
 * @returns {number} Maximum allowed cantrips
 */
export function getMaxCantripsAllowed(actor, classItem) {
  log(3, `Calculating max cantrips for ${actor.name}`);

  if (!classItem) {
    log(2, 'No class item provided for cantrip calculation');
    return 0;
  }

  // Log class details
  log(3, `Using class: ${classItem.name} (level: ${classItem.system.levels || actor.system.details.level})`);

  // Check for scaleValues directly on the classItem (derived data)
  if (classItem.scaleValues) {
    log(3, `Class has scaleValues, checking for cantrips-known`);

    // Look for cantrips-known in the scaleValues
    const cantripsKnown = classItem.scaleValues['cantrips-known']?.value;
    log(3, `cantrips-known value from scaleValues: ${cantripsKnown}`);

    if (cantripsKnown !== undefined) {
      log(3, `Found cantrips-known in scaleValues: ${cantripsKnown}`);
      return cantripsKnown;
    }
  }

  // If nothing works, default to 0
  log(2, 'No cantrips-known value found, returning 0');
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
    // Get previous values
    const previousLevel = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL) || 0;
    const previousMax = actor.getFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX) || 0;

    // Get current values
    const currentLevel = actor.system.details.level;
    const currentMax = getMaxCantripsAllowed(actor, classItem);

    // Update stored values if different
    if (previousLevel !== currentLevel || previousMax !== currentMax) {
      actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_LEVEL, currentLevel);
      actor.setFlag(MODULE.ID, FLAGS.PREVIOUS_CANTRIP_MAX, currentMax);

      // Reset unlearned count if max increased
      if (currentMax > previousMax && previousLevel > 0) {
        actor.setFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS, 0);
        return true;
      }
    }

    // Check if this is a level-up situation
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

  // Check if cantrip is locked
  let isCantripLocked = false;
  let cantripLockReason = '';

  if (spell.system.level === 0 && !alwaysPrepared && !isGranted) {
    const lockStatus = getCantripLockStatus(actor, spell);
    isCantripLocked = lockStatus.locked;
    cantripLockReason = lockStatus.reason;
  }

  // Return status
  return {
    prepared: isGranted || spell.system.preparation?.prepared || alwaysPrepared,
    isOwned: true,
    preparationMode: preparationMode,
    localizedPreparationMode: localizedPreparationMode,
    disabled: isGranted || alwaysPrepared || ['innate', 'pact', 'atwill', 'ritual'].includes(preparationMode) || isCantripLocked,
    alwaysPrepared: alwaysPrepared,
    sourceItem: sourceInfo,
    isGranted: isGranted,
    isCantripLocked: isCantripLocked,
    cantripLockReason: cantripLockReason
  };
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
