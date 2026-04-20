import { log } from '../utils/logger.mjs';
import { RuleSet } from '../managers/_module.mjs';

/** @type {object} dnd5e SpellListRegistry reference */
const spellLists = dnd5e.registry.spellLists;

/**
 * Get the full spell UUID set for a class, pulling from the user-selected class and subclass lists.
 * No registry fallback: both lists are explicit per-actor config.
 * @param {string} classIdentifier - Class identifier (e.g. 'wizard')
 * @param {object} actor - The actor to resolve rules for
 * @returns {Promise<Set<string>>} Set of spell UUIDs available to the class
 */
export async function getClassSpellList(classIdentifier, actor) {
  const classRules = RuleSet.getClassRules(actor, classIdentifier);
  const classUuids = await resolveCustomSpellLists(classRules.customSpellList);
  if (!classUuids.size) {
    log(3, `No spell list assigned for class: ${classIdentifier}`);
    return new Set();
  }
  const subclassUuids = await resolveCustomSpellLists(classRules.customSubclassSpellList);
  for (const uuid of subclassUuids) classUuids.add(uuid);
  log(3, `Resolved spell list for ${classIdentifier} (${classUuids.size} spells).`);
  return classUuids;
}

/**
 * Find all registered spell lists matching a type.
 * @param {string} type - List type (e.g. 'class', 'subclass')
 * @returns {object[]} Matching list options from the registry
 */
export function findSpellListsByType(type) {
  return spellLists.options.filter((opt) => opt.type === type);
}

/**
 * Resolve a UUID or array of UUIDs referring to spell list journal pages into a merged Set of spell UUIDs.
 * @param {string|string[]|null|undefined} customSpellList - UUID or array of UUIDs
 * @returns {Promise<Set<string>>} Merged spell UUIDs from all valid referenced lists
 */
async function resolveCustomSpellLists(customSpellList) {
  const uuids = Array.isArray(customSpellList) ? customSpellList : customSpellList ? [customSpellList] : [];
  const merged = new Set();
  for (const uuid of uuids) {
    if (!uuid || typeof uuid !== 'string') continue;
    const doc = await fromUuid(uuid);
    if (!(doc?.system?.spells?.size > 0)) continue;
    for (const spell of doc.system.spells) merged.add(spell);
  }
  return merged;
}
