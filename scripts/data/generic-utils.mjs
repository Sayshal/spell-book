import { FLAGS, MODULE } from '../constants/_module.mjs';
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
 * Prioritizes main class spellcasting configuration but falls back to subclass
 * if the main class doesn't have a valid spellcasting progression.
 *
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
 * Merges scale values from main class, subclass, and spellcasting data
 * to provide a comprehensive set of scaling values.
 *
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
 * Determines which item (main class or subclass) actually provides the
 * spellcasting capabilities for proper progression calculations.
 *
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
 * Retrieves the actual class levels that should be used for
 * spellcasting calculations and progression determination.
 *
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
 * Determines wizard status by checking for wizard class items and
 * force wizard mode settings in the actor's class rules.
 *
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
 * Locates the appropriate wizard class item considering multiple
 * spellcasting classes and force wizard mode settings.
 *
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
 * Returns detailed information about all classes that have wizard functionality
 * enabled either naturally or through force wizard mode settings.
 *
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
 * Determines whether a particular class identifier has wizard functionality
 * enabled either naturally or through configuration settings.
 *
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
 * Safely extracts display labels from D&D 5e configuration objects,
 * handling various label formats and providing fallbacks.
 *
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
 * Determines the appropriate user ID for spell data operations,
 * prioritizing character ownership when the current user is a GM.
 *
 * @todo Consider if there's an easier way within dnd5e/foundry to accomplish this
 * @param {Actor5e} actor - The actor to determine ownership for
 * @returns {string} The user ID to use for spell data operations
 */
export function _getTargetUserId(actor) {
  let targetUserId = game.user.id;
  if (game.user.isActiveGM) {
    const actorOwner = game.users.find((user) => user?.character?.id === actor?.id);
    if (actorOwner) targetUserId = actorOwner.id;
    else log(3, `No owner found for actor ${actor?.name}, using GM`);
  }
  return targetUserId;
}

/**
 * Check if metric units should be used based on dnd5e system settings.
 * Determines whether to use metric measurements by checking both
 * length and volume unit settings in the D&D 5e system.
 *
 * @returns {boolean} True if either length or volume units are set to metric
 */
export function shouldUseMetricUnits() {
  const metricLength = game.settings.get('dnd5e', 'metricLengthUnits') ?? false;
  const metricVolume = game.settings.get('dnd5e', 'metricVolumeUnits') ?? false;
  return metricLength || metricVolume;
}
