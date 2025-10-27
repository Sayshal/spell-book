/**
 * Generic Data Utilities and Helper Functions
 *
 * Provides general-purpose utility functions for data manipulation, validation,
 * and processing used throughout the Spell Book module. This module contains
 * reusable functions that don't belong to specific functional areas.
 *
 * @module DataUtils/GenericUtils
 * @author Tyler
 */

import { FLAGS, MODULE, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Get spellcasting configuration for a class, checking both main class and subclass.
 * @param {Actor5e} actor - The actor to check for spellcasting configuration
 * @param {string} classIdentifier - The class identifier to look up
 * @todo Does the return on mainClassSpellcasting mean subclassSpellcasting will never return?
 * @returns {SpellcastingConfiguration|null} Spellcasting configuration or null if none found
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
 * @param {Actor5e} actor - The actor to check for scale values
 * @param {string} classIdentifier - The class identifier to look up
 * @returns {Object<string, ScaleValueEntry>|null} Merged scale values or null if none found
 */
export function getScaleValuesForClass(actor, classIdentifier) {
  log(3, 'Getting scale values for class', { actor, classIdentifier });
  const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
  if (!spellcastingData) return null;

  /** @type {Object<string, ScaleValueEntry>} */
  let mergedScaleValues = {};
  const classItem = actor.items.get(spellcastingData.id);
  if (classItem?.scaleValues) mergedScaleValues = { ...mergedScaleValues, ...classItem.scaleValues };
  if (spellcastingData._classLink?.scaleValues) mergedScaleValues = { ...mergedScaleValues, ...spellcastingData._classLink.scaleValues };
  if (spellcastingData.scaleValues) mergedScaleValues = { ...mergedScaleValues, ...spellcastingData.scaleValues };
  return Object.keys(mergedScaleValues).length > 0 ? mergedScaleValues : null;
}

/**
 * Get the item that provides spellcasting for a class (main class or subclass).
 * @param {Actor5e} actor - The actor to check for spellcasting source
 * @param {string} classIdentifier - The class identifier to look up
 * @returns {Item5e|null} The item providing spellcasting or null if none found
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
 * @param {Actor5e} actor - The actor to check for class levels
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
 * Check if an actor is considered a wizard.
 * @param {Actor5e} actor - The actor to check for wizard status
 * @todo We need to find a way to combine: isWizard, findWizardClass, getWizardEnabledClasses, isClassWizardEnabled
 * @returns {boolean} True if actor has a wizard class or force wizard mode is enabled
 */
export function isWizard(actor) {
  log(3, 'Checking is wizard!', { actor });
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  if (actor.spellcastingClasses) for (const classData of Object.values(actor.spellcastingClasses)) if (classData.name.toLowerCase() === localizedWizardName) return true;
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  const hasForceWizardMode = Object.values(classRules).some((rules) => rules.forceWizardMode === true);
  return hasForceWizardMode;
}

/**
 * Find the wizard class item for an actor.
 * @param {Actor5e} actor - The actor to check for wizard class
 * @returns {Item5e|null} The wizard class item or null if not found
 */
export function findWizardClass(actor) {
  log(3, 'Finding wizard class.', { actor });
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  if (!isWizard(actor)) return null;
  if (actor.spellcastingClasses) {
    const spellcastingClasses = Object.values(actor.spellcastingClasses);
    if (spellcastingClasses.length === 1) return spellcastingClasses[0];
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    for (const classData of spellcastingClasses) if (classRules[classData.system.identifier]?.forceWizardMode === true) return classData;
    for (const classData of spellcastingClasses) if (classData?.system.identifier?.toLowerCase() === 'wizard') return classData;
    for (const classData of spellcastingClasses) if (classData?.name.toLowerCase() === localizedWizardName) return classData;
  }
  return null;
}

/**
 * Get all wizard-enabled classes for an actor (including force wizard mode classes).
 * @param {Actor5e} actor - The actor to check for wizard-enabled classes
 * @returns {Array<WizardClassData>} Array of wizard-enabled class data objects
 */
export function getWizardEnabledClasses(actor) {
  log(3, 'Collecting all wizard classes for actor.', { actor });
  /** @type {Array<WizardClassData>} */
  const wizardClasses = [];
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  if (actor.spellcastingClasses) {
    for (const classData of Object.values(actor.spellcastingClasses)) {
      const classItem = actor.items.get(classData.id);
      if (!classItem) continue;
      const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
      const isNaturalWizard = classItem.name.toLowerCase() === localizedWizardName;
      const hasForceWizard = classRules[identifier]?.forceWizardMode === true;
      if (isNaturalWizard || hasForceWizard) wizardClasses.push({ identifier, classItem, isNaturalWizard, isForceWizard: hasForceWizard });
    }
  }
  return wizardClasses;
}

/**
 * Check if a specific class is wizard-enabled.
 * @param {Actor5e} actor - The actor to check for wizard-enabled class
 * @param {string} classIdentifier - The class identifier to check
 * @returns {boolean} True if the class is wizard-enabled
 */
export function isClassWizardEnabled(actor, classIdentifier) {
  log(3, 'Checking if class wizard enabled.', { actor, classIdentifier });
  if (actor.spellcastingClasses?.[classIdentifier]) {
    const classData = actor.spellcastingClasses[classIdentifier];
    const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
    const isNaturalWizard = classData.name.toLowerCase() === localizedWizardName;
    if (isNaturalWizard) return true;
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    return classRules[classIdentifier]?.forceWizardMode === true;
  }
  return false;
}

/**
 * Get the appropriate label/name from a CONFIG object.
 * @param {Object} configObject - The CONFIG object (e.g., CONFIG.DND5E.spellSchools)
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
 * Get the target user ID for spell data operations.
 * @param {Actor5e} actor - The actor to determine ownership for
 * @returns {string} The user ID to use for spell data operations
 */
export function getTargetUserId(actor) {
  log(3, 'Getting target user ID.', { actor });
  let targetUserId = game.user.id;
  if (game.user.isActiveGM && actor) {
    const characterOwner = game.users.find((user) => user.character?.id === actor.id);
    if (characterOwner) {
      targetUserId = characterOwner.id;
      log(3, `Using character owner: ${characterOwner.name} (${characterOwner.id})`);
      return targetUserId;
    }
    const ownershipOwner = game.users.find((user) => actor.ownership[user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    if (ownershipOwner) {
      targetUserId = ownershipOwner.id;
      log(3, `Using ownership owner: ${ownershipOwner.name} (${ownershipOwner.id})`);
      return targetUserId;
    }
  }
  return targetUserId;
}

/**
 * Unlock module compendium packs and create necessary folder structure.
 * @todo We can just do game.packs.get(MODULE.ETC) here.
 * @returns {Promise<void>}
 */
export async function unlockModuleCompendium() {
  log(3, 'Unlocking module compendiums.');
  const spellsPack = game.packs.find((p) => p.collection === MODULE.PACK.SPELLS);
  if (spellsPack && spellsPack.locked) await spellsPack.configure({ locked: false });
  const macrosPack = game.packs.find((p) => p.collection === MODULE.PACK.MACROS);
  if (macrosPack && macrosPack.locked) await macrosPack.configure({ locked: false });
  const userdataPack = game.packs.find((p) => p.collection === MODULE.PACK.USERDATA);
  if (userdataPack && userdataPack.locked) await userdataPack.configure({ locked: false });
  await createActorSpellbooksFolder(spellsPack);
}

/**
 * Create Actor Spellbooks folder in the module compendium pack.

 * @param {CompendiumCollection} pack - The module's spells compendium pack
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
 * @param obj
 * @param paths
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
