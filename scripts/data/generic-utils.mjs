/**
 * Generic Data Utilities and Helper Functions
 *
 * Provides general-purpose utility functions for data manipulation, validation,
 * and processing used throughout the Spell Book module. This module contains
 * reusable functions that don't belong to specific functional areas.
 *
 * Key features:
 * - Data validation and sanitization
 * - Object manipulation utilities
 * - String processing and formatting
 * - Array and collection operations
 * - Configuration data helpers
 * - General-purpose data transformations
 *
 * @module DataUtils/GenericUtils
 * @author Tyler
 */

import { FLAGS, MODULE, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

/**
 * @typedef {Object} SpellcastingConfiguration
 * @property {string} progression - Spellcasting progression type ('none', 'full', 'half', 'third', 'pact', 'artificer')
 * @property {string} type - Type of spellcasting ('spell', 'pact', 'leveled')
 * @property {string} [ability] - Primary spellcasting ability score
 * @property {Object} [preparation] - Spell preparation configuration
 * @property {number} [levels] - Number of class levels for spellcasting
 */

/**
 * @typedef {Object} ClassSpellcastingData
 * @property {string} id - Item ID of the class
 * @property {SpellcastingConfiguration} spellcasting - Main class spellcasting configuration
 * @property {Item5e} _classLink - Reference to the subclass item if applicable
 * @property {Object} [scaleValues] - Class-specific scale values
 */

/**
 * @typedef {Object} ScaleValueEntry
 * @property {string} identifier - Unique identifier for the scale value
 * @property {string} type - Type of scale value ('number', 'string', 'die')
 * @property {*} value - Current value at actor's level
 * @property {string} [label] - Display label for the scale value
 */

/**
 * @typedef {Object} WizardClassData
 * @property {string} identifier - Class identifier (e.g., 'wizard')
 * @property {Item5e} classItem - The class item document
 * @property {boolean} isNaturalWizard - Whether this is a natural wizard class
 * @property {boolean} isForceWizard - Whether wizard mode is forced via settings
 */

/**
 * @typedef {Object} ClassRulesConfiguration
 * @property {boolean} [forceWizardMode] - Whether to force wizard mode for this class
 * @property {string} [customSpellList] - UUID of custom spell list to use
 * @property {Object} [additionalSettings] - Additional class-specific settings
 */

/**
 * Get spellcasting configuration for a class, checking both main class and subclass.
 * @param {Actor5e} actor - The actor to check for spellcasting configuration
 * @param {string} classIdentifier - The class identifier to look up
 * @returns {SpellcastingConfiguration|null} Spellcasting configuration or null if none found
 */
export function getSpellcastingConfigForClass(actor, classIdentifier) {
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
 * @returns {number} Class levels for spellcasting calculations (0 if not found)
 */
export function getSpellcastingLevelsForClass(actor, classIdentifier) {
  const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
  if (!spellcastingData) return 0;
  const mainClass = actor.items.get(spellcastingData.id);
  if (!mainClass) return 0;
  return mainClass.system?.levels || 0;
}

/**
 * Check if an actor is considered a wizard.
 * @param {Actor5e} actor - The actor to check for wizard status
 * @returns {boolean} True if actor has a wizard class or force wizard mode is enabled
 */
export function isWizard(actor) {
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  if (actor.spellcastingClasses) {
    for (const classData of Object.values(actor.spellcastingClasses)) {
      const classItem = actor.items.get(classData.id);
      if (classItem && classItem.name.toLowerCase() === localizedWizardName) return true;
    }
  }
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
  if (!isWizard(actor)) return null;
  if (actor.spellcastingClasses) {
    const spellcastingClasses = Object.values(actor.spellcastingClasses);
    if (spellcastingClasses.length === 1) {
      const classData = spellcastingClasses[0];
      return actor.items.get(classData.id);
    }
    if (spellcastingClasses.length >= 2) {
      const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
      for (const classData of spellcastingClasses) {
        const classItem = actor.items.get(classData.id);
        if (!classItem) continue;
        const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
        if (classRules[identifier]?.forceWizardMode === true) return classItem;
      }
      for (const classData of spellcastingClasses) {
        const classItem = actor.items.get(classData.id);
        if (classItem?.system.identifier?.toLowerCase() === 'wizard') return classItem;
      }
      const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
      for (const classData of spellcastingClasses) {
        const classItem = actor.items.get(classData.id);
        if (classItem?.name.toLowerCase() === localizedWizardName) return classItem;
      }
    }
  }
  return null;
}

/**
 * Get all wizard-enabled classes for an actor (including force wizard mode classes).
 * @param {Actor5e} actor - The actor to check for wizard-enabled classes
 * @returns {Array<WizardClassData>} Array of wizard-enabled class data objects
 */
export function getWizardEnabledClasses(actor) {
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
  if (actor.spellcastingClasses?.[classIdentifier]) {
    const classData = actor.spellcastingClasses[classIdentifier];
    const classItem = actor.items.get(classData.id);
    if (!classItem) return false;
    const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
    const isNaturalWizard = classItem.name.toLowerCase() === localizedWizardName;
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
  let targetUserId = game.user.id;
  if (game.user.isActiveGM && actor) {
    log(3, `GM determining ownership for actor: ${actor.name}`);
    const characterOwner = game.users.find((user) => user.character?.id === actor.id);
    if (characterOwner) {
      targetUserId = characterOwner.id;
      log(3, `Using character owner: ${characterOwner.name} (${characterOwner.id})`);
      return targetUserId;
    }
    log(3, 'No character owner found, checking ownership levels...');
    const ownershipOwner = game.users.find((user) => actor.ownership[user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    if (ownershipOwner) {
      targetUserId = ownershipOwner.id;
      log(3, `Using ownership owner: ${ownershipOwner.name} (${ownershipOwner.id})`);
      return targetUserId;
    }
    log(3, `No owner found for actor ${actor.name}, using GM`);
  }
  return targetUserId;
}

/**
 * Check if metric units should be used based on dnd5e system settings.
 * @returns {boolean} True if either length or volume units are set to metric
 */
export function shouldUseMetric() {
  const metricLength = game.settings.get('dnd5e', 'metricLengthUnits') ?? false;
  const metricVolume = game.settings.get('dnd5e', 'metricVolumeUnits') ?? false;
  return metricLength || metricVolume;
}

/**
 * Unlock module compendium packs and create necessary folder structure.
 * @returns {Promise<void>}
 */
export async function unlockModuleCompendium() {
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
  if (!pack) return;
  const folder = pack.folders.find((f) => f.name === game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks'));
  if (!folder) {
    await Folder.create({ name: game.i18n.localize('SPELLBOOK.Folders.ActorSpellbooks'), type: 'JournalEntry' }, { pack: pack.collection });
    log(3, 'Created Actor Spellbooks folder');
  }
}

/**
 * Preload all Handlebars templates used by the module.
 * @returns {Promise<void>} Promise that resolves when all templates are loaded
 */
export async function preloadTemplates() {
  /**
   * Recursively flatten a nested template object into an array of template paths.
   * @param {Object} obj - The template object to flatten
   * @param {Array<string>} [result=[]] - The accumulator array for template paths
   * @returns {Array<string>} Array of flattened template paths
   */
  function flattenTemplateObject(obj, result = []) {
    for (const key in obj) {
      if (typeof obj[key] === 'string') result.push(obj[key]);
      else if (typeof obj[key] === 'object') flattenTemplateObject(obj[key], result);
    }
    return result;
  }
  const templatePaths = flattenTemplateObject(TEMPLATES);
  return foundry?.applications?.handlebars?.loadTemplates(templatePaths);
}
