/**
 * Helper functions for spell preparation
 * Manages checking and saving prepared spells
 * @module spell-book/helpers/spell-preparation
 */

import { FLAGS, MODULE } from '../constants.mjs';
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
    localizedPreparationMode: ''
  };

  // If it's already an actor item
  if (spell.parent === actor || spell._id) {
    log(3, 'Using actor-owned spell directly');
    return getOwnedSpellPreparationStatus(actor, spell);
  }

  // Look for it on the actor
  const actorSpell = actor.items.find((item) => item.type === 'spell' && (item.name === spell.name || item.flags?.core?.sourceId === spell.compendiumUuid));

  if (!actorSpell) {
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
function getOwnedSpellPreparationStatus(actor, spell) {
  // Get preparation information
  const preparationMode = spell.system.preparation?.mode || 'prepared';
  const alwaysPrepared = preparationMode === 'always';
  const localizedPreparationMode = formattingUtils.getLocalizedPreparationMode(preparationMode);

  // Get source
  const sourceInfo = determineSpellSource(actor, spell);
  const isGranted = !!sourceInfo && spell.flags?.dnd5e?.cachedFor;

  // Return status
  return {
    prepared: isGranted || spell.system.preparation?.prepared || alwaysPrepared,
    isOwned: true,
    preparationMode: preparationMode,
    localizedPreparationMode: localizedPreparationMode,
    disabled: isGranted || alwaysPrepared || ['innate', 'pact', 'atwill', 'ritual'].includes(preparationMode),
    alwaysPrepared: alwaysPrepared,
    sourceItem: sourceInfo,
    isGranted: isGranted
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
