/**
 * Generic Data Utilities and Helper Functions
 *
 * Provides general-purpose utility functions for data manipulation, validation,
 * and processing used throughout the Spell Book module. This module contains
 * reusable functions that don't belong to specific functional areas.
 * @module DataUtils/GenericUtils
 * @author Tyler
 */

import { FLAGS, MODULE, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Get spellcasting configuration for a class, checking both main class and subclass.
 * @param {object} actor - The actor to check for spellcasting configuration
 * @param {string} classIdentifier - The class identifier to look up
 * @returns {object | null} Spellcasting configuration or null if none found
 */
export function getSpellcastingConfigForClass(actor, classIdentifier) {
  log(3, 'Getting spellcasting config for class.', { actor, classIdentifier });
  const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
  if (!spellcastingData) return null;
  const mainClassSpellcasting = spellcastingData.spellcasting;
  if (mainClassSpellcasting?.progression && mainClassSpellcasting.progression !== 'none') return mainClassSpellcasting;
  const subclassSpellcasting = spellcastingData._classLink?.system?.spellcasting;
  if (subclassSpellcasting?.progression && subclassSpellcasting.progression !== 'none') return subclassSpellcasting;
  return null;
}

/**
 * Get scale values for a class, checking both main class and subclass.
 * @param {object} actor - The actor to check for scale values
 * @param {string} classIdentifier - The class identifier to look up
 * @returns {Object<string, string>|null} Merged scale values or null if none found
 */
export function getScaleValuesForClass(actor, classIdentifier) {
  log(3, 'Getting scale values for class', { actor, classIdentifier });
  const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
  if (!spellcastingData) return null;
  let mergedScaleValues = {};
  const classItem = actor.items.get(spellcastingData.id);
  if (classItem?.scaleValues) mergedScaleValues = { ...mergedScaleValues, ...classItem.scaleValues };
  if (spellcastingData._classLink?.scaleValues) mergedScaleValues = { ...mergedScaleValues, ...spellcastingData._classLink.scaleValues };
  if (spellcastingData.scaleValues) mergedScaleValues = { ...mergedScaleValues, ...spellcastingData.scaleValues };
  return Object.keys(mergedScaleValues).length > 0 ? mergedScaleValues : null;
}

/**
 * Get the item that provides spellcasting for a class (main class or subclass).
 * @param {object} actor - The actor to check for spellcasting source
 * @param {string} classIdentifier - The class identifier to look up
 * @returns {object | null} The item providing spellcasting or null if none found
 */
export function getSpellcastingSourceItem(actor, classIdentifier) {
  log(3, 'Getting spellcasting source items.', { actor, classIdentifier });
  const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
  if (!spellcastingData) return null;
  const mainClass = actor.items.get(spellcastingData.id);
  if (!mainClass) return null;
  const mainClassSpellcasting = mainClass.system?.spellcasting;
  if (mainClassSpellcasting?.progression && mainClassSpellcasting.progression !== 'none') return mainClass;
  const subclassItem = spellcastingData._classLink;
  const subclassSpellcasting = subclassItem?.system?.spellcasting;
  if (subclassSpellcasting?.progression && subclassSpellcasting.progression !== 'none') return subclassItem;
  return mainClass;
}

/**
 * Get effective class levels for spellcasting progression.
 * @param {object} actor - The actor to check for class levels
 * @param {string} classIdentifier - The class identifier to look up
 * @returns {number} Class levels for spellcasting calculations
 */
export function getSpellcastingLevelsForClass(actor, classIdentifier) {
  log(3, 'Getting spellcasting levels for class', { actor, classIdentifier });
  const mainClass = actor.spellcastingClasses?.[classIdentifier];
  if (!mainClass) return 0;
  return mainClass.system?.levels;
}

/**
 * Get wizard status data for all wizard-enabled spellcasting classes on an actor.
 * @param {object} actor - The actor to analyze
 * @returns {Object<string, {isNaturalWizard: boolean, isForceWizard: boolean, classData: object}>} Wizard Data Object
 */
export function getWizardData(actor) {
  const wizardData = {};
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  if (actor.spellcastingClasses) {
    for (const [identifier, classData] of Object.entries(actor.spellcastingClasses)) {
      const isNaturalWizard = classData.name.toLowerCase() === localizedWizardName;
      const isForceWizard = classRules[identifier]?.forceWizardMode === true;
      if (isNaturalWizard || isForceWizard) wizardData[identifier] = { isNaturalWizard, isForceWizard, classData };
    }
  }
  return wizardData;
}

/**
 * Get the appropriate label/name from a CONFIG object.
 * @param {object} configObject - The CONFIG object (e.g., CONFIG.DND5E.spellSchools)
 * @param {string} key - The key to look up in the configuration object
 * @returns {string} The label/name or empty string if not found
 */
export function getConfigLabel(configObject, key) {
  if (!configObject || !configObject[key]) return '';
  const item = configObject[key];
  if (item.label) return item.label;
  if (item.name) return item.name;
  if (typeof item === 'string') return item;
  return '';
}

/**
 * Cache for target user ID lookups, keyed by actor ID.
 * @type {Map<string, string>}
 */
const targetUserIdCache = new Map();

/**
 * Get the target user ID for spell data operations (cached).
 * @param {object} actor - The actor to determine ownership for
 * @returns {string} The user ID to use for spell data operations
 */
export function getTargetUserId(actor) {
  if (actor?.id && targetUserIdCache.has(actor.id)) return targetUserIdCache.get(actor.id);
  log(3, 'Getting target user ID.', { actor });
  let targetUserId = game.user.id;
  if (game.user.isActiveGM && actor) {
    const characterOwner = game.users.find((user) => user.character?.id === actor.id);
    if (characterOwner) {
      targetUserId = characterOwner.id;
      log(3, `Using character owner: ${characterOwner.name} (${characterOwner.id})`);
      if (actor.id) targetUserIdCache.set(actor.id, targetUserId);
      return targetUserId;
    }
    const ownershipOwner = game.users.find((user) => actor.ownership[user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    if (ownershipOwner) {
      targetUserId = ownershipOwner.id;
      log(3, `Using ownership owner: ${ownershipOwner.name} (${ownershipOwner.id})`);
      if (actor.id) targetUserIdCache.set(actor.id, targetUserId);
      return targetUserId;
    }
  }
  if (actor?.id) targetUserIdCache.set(actor.id, targetUserId);
  return targetUserId;
}

/**
 * Unlock module compendium packs and create necessary folder structure.
 * @returns {Promise<void>}
 */
export async function unlockModuleCompendium() {
  log(3, 'Unlocking module compendiums.');
  const spellsPack = game.packs.get(MODULE.PACK.SPELLS);
  if (spellsPack?.locked) await spellsPack.configure({ locked: false });
  const macrosPack = game.packs.get(MODULE.PACK.MACROS);
  if (macrosPack?.locked) await macrosPack.configure({ locked: false });
  const userdataPack = game.packs.get(MODULE.PACK.USERDATA);
  if (userdataPack?.locked) await userdataPack.configure({ locked: false });
  await createActorSpellbooksFolder(spellsPack);
}

/**
 * Create Actor Spellbooks folder in the module compendium pack.
 * @param {object} pack - The module's spells compendium pack
 * @returns {Promise<void>}
 */
export async function createActorSpellbooksFolder(pack) {
  log(3, 'Validating folder structure exists.');
  const folder = pack.folders.find((f) => f.name === game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks'));
  if (!folder) await Folder.create({ name: game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks'), type: 'JournalEntry' }, { pack: pack.collection });
}

/**
 * Preload all Handlebars templates used by the module.
 * Recursively walks the TEMPLATES object to collect all .hbs paths and load them.
 * @param {object} obj - TEMPLATES object for iteration
 * @param {Array<string>} paths - Paths to run through loadTemplates for registration
 * @returns {Promise<void>} Promise that resolves when all templates are loaded
 */
export async function preloadTemplates(obj = TEMPLATES, paths = []) {
  for (const key in obj) {
    const value = obj[key];
    if (typeof value === 'string') paths.push(value);
    else if (typeof value === 'object') await preloadTemplates(value, paths);
  }
  if (obj === TEMPLATES) return foundry?.applications?.handlebars?.loadTemplates(paths);
}

/**
 * Check if an item that grants spells is actually active (equipped and attuned if needed).
 * @param {object} item - The item to check
 * @returns {boolean} True if the item is equipped and attuned (if attunement required), false otherwise
 */
export function isGrantingItemActive(item) {
  if (!item) return false;
  const isEquipped = item.system?.equipped ?? false;
  if (!isEquipped) {
    log(3, `Granting item ${item.name} is not equipped.`, { item });
    return false;
  }
  const requiresAttunement = item.system?.attunement === 'required';
  const isAttuned = item.system?.attuned ?? false;
  if (requiresAttunement && !isAttuned) {
    log(3, `Granting item ${item.name} requires attunement but is not attuned.`, { item });
    return false;
  }
  return true;
}

/**
 * Check if a spell is stored in a Ring of Spell Storing (CPR compatibility).
 * These spells should not be treated as at-will/innate for preparation counting purposes.
 * @param {object} spell - The spell to check
 * @returns {boolean} True if the spell is stored in a Ring of Spell Storing
 */
export function isCPRROSS(spell) {
  return spell?.flags?.['chris-premades']?.ross?.isStored === true;
}

/**
 * Get the canonical UUID for a spell (prefers compendium source).
 * Resolves actor-embedded spells to their compendium source when available.
 * @param {string | object} spellOrUuid - Spell document or UUID string
 * @returns {string|null} Canonical UUID or null if invalid input
 */
export function getCanonicalSpellUuid(spellOrUuid) {
  if (!spellOrUuid) return null;
  const uuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid;
  if (!uuid) return null;
  if (typeof spellOrUuid === 'object') {
    if (spellOrUuid.compendiumUuid) return spellOrUuid.compendiumUuid;
    if (spellOrUuid._stats?.compendiumSource) return spellOrUuid._stats.compendiumSource;
    if (spellOrUuid.flags?.core?.sourceId) return spellOrUuid.flags.core.sourceId;
    return spellOrUuid.uuid || null;
  }
  const parsed = foundry.utils.parseUuid(uuid);
  if (parsed.collection?.collection) return uuid;
  const doc = fromUuidSync(uuid);
  return doc?._stats?.compendiumSource || doc?.flags?.core?.sourceId || uuid;
}

/**
 * Get all possible UUIDs associated with a spell for matching purposes.
 * @param {object} spell - Spell document or spell-like object
 * @returns {string[]} Array of unique UUIDs (normalized)
 */
export function getAllSpellUuids(spell) {
  if (!spell) return [];
  const uuids = new Set();
  if (spell.compendiumUuid) uuids.add(spell.compendiumUuid);
  if (spell.spellUuid) uuids.add(spell.spellUuid);
  if (spell.uuid) uuids.add(spell.uuid);
  if (spell._stats?.compendiumSource) uuids.add(spell._stats.compendiumSource);
  if (spell.flags?.core?.sourceId) uuids.add(spell.flags.core.sourceId);
  return [...uuids].filter(Boolean).map((u) => foundry.utils.parseUuid(u).uuid);
}

/**
 * Migrate filter configuration from old version to new version.
 * @param {Array} oldConfig - The old filter configuration
 * @returns {Array} The migrated configuration
 */
export function migrateFilterData(oldConfig) {
  log(3, 'Migrating filter config.');
  const userPreferences = new Map(oldConfig.map((f) => [f.id, { enabled: f.enabled, order: f.order }]));
  return MODULE.DEFAULT_FILTER_CONFIG.map((defaultFilter) => {
    const userPref = userPreferences.get(defaultFilter.id);
    return userPref ? { ...defaultFilter, enabled: userPref.enabled, order: userPref.order ?? defaultFilter.order } : foundry.utils.deepClone(defaultFilter);
  });
}

/**
 * Create a shallow clone of a spell suitable for modification without affecting the original.
 * More efficient than deepClone for render-path operations where only top-level properties
 * and immediate system/flags properties are modified.
 * @param {object} spell - The spell object to clone
 * @returns {object} A shallow clone with separately cloned system and flags
 */
export function shallowCloneSpell(spell) {
  if (!spell) return spell;
  const clone = { ...spell };
  if (spell.system) clone.system = { ...spell.system };
  if (spell.flags) clone.flags = foundry.utils.deepClone(spell.flags);
  return clone;
}

/**
 * Utility class for managing collapsed state stored in user flags.
 * Provides consistent get/toggle/clear operations for collapsible UI elements.
 */
export class CollapsedStateManager {
  /**
   * Get the array of collapsed identifiers from user flags.
   * @param {string} flagName - The flag name (e.g., FLAGS.COLLAPSED_LEVELS)
   * @returns {string[]} Array of collapsed identifiers
   */
  static get(flagName) {
    return game.user.getFlag(MODULE.ID, flagName) || [];
  }

  /**
   * Check if a specific identifier is in the collapsed state.
   * @param {string} flagName - The flag name
   * @param {string} identifier - The identifier to check
   * @returns {boolean} True if the identifier is collapsed
   */
  static isCollapsed(flagName, identifier) {
    return this.get(flagName).includes(identifier);
  }

  /**
   * Toggle the collapsed state for an identifier.
   * @param {string} flagName - The flag name
   * @param {string} identifier - The identifier to toggle
   * @returns {Promise<boolean>} Resolves to true if now collapsed, false if expanded
   */
  static async toggle(flagName, identifier) {
    const current = this.get(flagName);
    const index = current.indexOf(identifier);
    const isCollapsing = index === -1;
    const updated = isCollapsing ? [...current, identifier] : current.filter((id) => id !== identifier);
    await game.user.setFlag(MODULE.ID, flagName, updated);
    return isCollapsing;
  }

  /**
   * Clear all collapsed states (reset to empty array).
   * @param {string} flagName - The flag name
   * @returns {Promise<void>}
   */
  static async clear(flagName) {
    await game.user.setFlag(MODULE.ID, flagName, []);
  }
}
