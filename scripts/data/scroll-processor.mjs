/**
 * Spell scroll detection and extraction from actor inventories.
 * @module Data/ScrollProcessor
 * @author Tyler
 */

import { log } from '../utils/logger.mjs';

/**
 * Scan an actor's inventory for spell scrolls and extract learnable spell data.
 * @param {object} actor - The actor to scan
 * @param {number} maxSpellLevel - Maximum spell level the actor can learn
 * @returns {Promise<object[]>} Array of scroll spell entries
 */
export async function scanForScrollSpells(actor, maxSpellLevel) {
  const scrollItems = actor.items.filter((item) => item.type === 'consumable' && item.system?.type?.value === 'scroll');
  const results = [];
  for (const scroll of scrollItems) {
    const spellData = await extractSpellFromScroll(scroll, maxSpellLevel);
    if (spellData) results.push(spellData);
  }
  log(3, `Found ${results.length} scroll spells on ${actor.name}.`);
  return results;
}

/**
 * Extract spell data from a scroll item.
 * @param {object} scroll - The scroll item
 * @param {number} maxSpellLevel - Maximum learnable spell level
 * @returns {Promise<object|null>} Spell data or null if no valid spell found
 */
async function extractSpellFromScroll(scroll, maxSpellLevel) {
  if (scroll.system?.activities) {
    const activities = Array.from(scroll.system.activities.values());
    for (const activity of activities) {
      if (activity?.spell?.uuid) {
        const result = await processScrollSpell(scroll, activity.spell.uuid, maxSpellLevel);
        if (result) return result;
      }
      if (activity?.effects && Array.isArray(activity.effects)) {
        for (const effectRef of activity.effects) {
          if (effectRef._id && scroll.effects) {
            const match = scroll.effects.find((e) => e._id === effectRef._id);
            if (match?.origin) {
              const result = await processScrollSpell(scroll, match.origin, maxSpellLevel);
              if (result) return result;
            }
          }
        }
      }
    }
  }
  const spellLevel = scroll.flags?.dnd5e?.spellLevel;
  if (spellLevel) {
    const spellUuid = await findSpellByScrollName(scroll.name, spellLevel.base);
    if (spellUuid) return processScrollSpell(scroll, spellUuid, maxSpellLevel);
  }
  return null;
}

/**
 * Validate a spell UUID from a scroll and build basic spell data.
 * @param {object} scroll - The scroll item
 * @param {string} spellUuid - UUID of the spell
 * @param {number} maxSpellLevel - Maximum learnable spell level
 * @returns {Promise<object|null>} Spell data or null if invalid
 */
async function processScrollSpell(scroll, spellUuid, maxSpellLevel) {
  const spell = await fromUuid(spellUuid);
  if (!spell || spell.type !== 'spell') return null;
  if (spell.system.level > maxSpellLevel && spell.system.level > 0) return null;
  return { scrollItem: scroll, scrollId: scroll.id, scrollName: scroll.name, spell, spellUuid, name: spell.name, level: spell.system.level, img: spell.img, system: spell.system, isFromScroll: true };
}

/**
 * Find a spell UUID by parsing the scroll name and searching compendiums.
 * @param {string} scrollName - Scroll item name (e.g. "Spell Scroll: Fireball")
 * @param {number} baseLevel - Expected spell level from scroll flags
 * @returns {Promise<string|null>} Spell UUID or null
 */
async function findSpellByScrollName(scrollName, baseLevel) {
  const separatorIndex = scrollName.indexOf(': ');
  if (separatorIndex === -1) return null;
  const spellName = scrollName.slice(separatorIndex + 2).trim();
  if (!spellName) return null;
  let nameOnlyMatch = null;
  for (const pack of game.packs.filter((p) => p.metadata.type === 'Item')) {
    const index = await pack.getIndex({ fields: ['system.level'] });
    for (const entry of index) {
      if (entry.type !== 'spell' || entry.name !== spellName) continue;
      if (entry.system?.level === baseLevel) return entry.uuid;
      nameOnlyMatch ??= entry.uuid;
    }
  }
  return nameOnlyMatch;
}
