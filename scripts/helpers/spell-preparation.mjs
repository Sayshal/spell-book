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

  // Find all cantrips on the actor
  const actorCantrips = actor.items.filter((i) => i.type === 'spell' && i.system.level === 0 && !i.system.preparation?.alwaysPrepared);

  // Track cantrips being removed
  for (const cantrip of actorCantrips) {
    const uuid = cantrip.flags?.core?.sourceId || cantrip.uuid;
    if (uuid && spellData[uuid] && !spellData[uuid].isPrepared && spellData[uuid].wasPrepared) {
      changes.removed.push({
        name: cantrip.name,
        uuid: uuid
      });
      changes.hasChanges = true;
    }
  }

  // Track cantrips being added
  for (const [uuid, data] of Object.entries(spellData)) {
    if (!data.wasPrepared && data.isPrepared) {
      // Find the spell to get its level
      const spell = actor.items.find((i) => i.flags?.core?.sourceId === uuid || i.uuid === uuid);
      if (spell && spell.system.level === 0) {
        changes.added.push({
          name: spell.name,
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

  if (changes.removed.length > 0) {
    content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Removed')}:</strong> ${changes.removed.map((c) => c.name).join(', ')}</p>`;
  }

  if (changes.added.length > 0) {
    content += `<p><strong>${game.i18n.localize('SPELLBOOK.Cantrips.Added')}:</strong> ${changes.added.map((c) => c.name).join(', ')}</p>`;
  }

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

  const settings = getCantripSettings(actor);

  // Always allow if unrestricted
  if (settings.behavior === CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED) {
    return { allowed: true };
  }

  // Check for unlock flags
  const changeAllowed = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_ALLOWED);
  if (changeAllowed) {
    // For modern rules, check unlearned count
    if (settings.rules === CANTRIP_RULES.MODERN) {
      const unlearned = actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
      if (unlearned >= 1 && !spell.system.preparation?.prepared) {
        return {
          allowed: false,
          message: 'SPELLBOOK.Cantrips.CannotUnlearnMore'
        };
      }
    }
    return {
      allowed: true,
      willCount: !spell.system.preparation?.prepared
    };
  }

  // Not allowed to change
  return {
    allowed: false,
    message: settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LockedDefault' : 'SPELLBOOK.Cantrips.LockedModern'
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

      // Mark cantrip change allowed if max increased
      if (currentMax > previousMax && previousLevel > 0) {
        actor.setFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_ALLOWED, true);
        actor.setFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS, 0);
        return true;
      }
    }

    return actor.getFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_ALLOWED) || false;
  } catch (error) {
    log(1, 'Error checking for cantrip level up:', error);
    return false;
  }
}

export function getCantripLockStatus(actor, spell) {
  // Only applicable to cantrips
  if (spell.system.level !== 0) {
    return { locked: false };
  }

  const settings = getCantripSettings(actor);

  // If unrestricted, never lock
  if (settings.behavior === CANTRIP_CHANGE_BEHAVIOR.UNRESTRICTED) {
    return { locked: false };
  }

  // If changes allowed, not locked
  const changeAllowed = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_CHANGE_ALLOWED);
  if (changeAllowed) {
    // For modern rules, check if we've already unlearned a cantrip
    if (settings.rules === CANTRIP_RULES.MODERN && !spell.system.preparation?.prepared) {
      const unlearned = actor.getFlag(MODULE.ID, FLAGS.UNLEARNED_CANTRIPS) || 0;
      if (unlearned >= 1) {
        return {
          locked: true,
          reason: 'SPELLBOOK.Cantrips.CannotUnlearnMore'
        };
      }
    }
    return { locked: false };
  }

  // Locked based on settings
  return {
    locked: true,
    reason: settings.rules === CANTRIP_RULES.DEFAULT ? 'SPELLBOOK.Cantrips.LockedDefault' : 'SPELLBOOK.Cantrips.LockedModern'
  };
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
