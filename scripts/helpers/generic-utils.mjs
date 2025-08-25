import { FLAGS, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Get spellcasting configuration for a class, checking both main class and subclass
 * @param {Actor5e} actor - The actor
 * @param {string} classIdentifier - The class identifier
 * @returns {Object|null} Spellcasting configuration or null
 */
export function getSpellcastingConfigForClass(actor, classIdentifier) {
  const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
  if (!spellcastingData) return null;

  // Check main class first
  const mainClassSpellcasting = spellcastingData.spellcasting;
  if (mainClassSpellcasting?.progression && mainClassSpellcasting.progression !== 'none') {
    return mainClassSpellcasting;
  }

  // Check subclass if main class doesn't have spellcasting
  const subclassSpellcasting = spellcastingData._classLink?.system?.spellcasting;
  if (subclassSpellcasting?.progression && subclassSpellcasting.progression !== 'none') {
    return subclassSpellcasting;
  }

  return null;
}

/**
 * Get scale values for a class, checking both main class and subclass
 * @param {Actor5e} actor - The actor
 * @param {string} classIdentifier - The class identifier
 * @returns {Object|null} Scale values or null
 */
export function getScaleValuesForClass(actor, classIdentifier) {
  const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
  if (!spellcastingData) return null;

  // For subclass-granted spellcasting, scale values are usually on the subclass
  if (spellcastingData._classLink?.scaleValues) {
    return spellcastingData._classLink.scaleValues;
  }

  // Fall back to main class scale values
  const classItem = actor.items.get(spellcastingData.id);
  return classItem?.scaleValues || null;
}

/**
 * Get the item that provides spellcasting for a class (main class or subclass)
 * @param {Actor5e} actor - The actor
 * @param {string} classIdentifier - The class identifier
 * @returns {Item5e|null} The item providing spellcasting or null
 */
export function getSpellcastingSourceItem(actor, classIdentifier) {
  const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
  if (!spellcastingData) return null;

  const mainClass = actor.items.get(spellcastingData.id);
  if (!mainClass) return null;

  // Check if main class has spellcasting
  const mainClassSpellcasting = mainClass.system?.spellcasting;
  if (mainClassSpellcasting?.progression && mainClassSpellcasting.progression !== 'none') {
    return mainClass;
  }

  // Check if subclass provides spellcasting
  const subclassItem = spellcastingData._classLink;
  const subclassSpellcasting = subclassItem?.system?.spellcasting;
  if (subclassSpellcasting?.progression && subclassSpellcasting.progression !== 'none') {
    return subclassItem;
  }

  return mainClass; // Fallback to main class
}

/**
 * Get effective class levels for spellcasting progression
 * @param {Actor5e} actor - The actor
 * @param {string} classIdentifier - The class identifier
 * @returns {number} Class levels for spellcasting calculations
 */
export function getSpellcastingLevelsForClass(actor, classIdentifier) {
  const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
  if (!spellcastingData) return 0;

  const mainClass = actor.items.get(spellcastingData.id);
  if (!mainClass) return 0;

  // Always use main class levels (subclasses don't have separate levels)
  return mainClass.system?.levels || 0;
}

/**
 * Check if an actor is considered a wizard
 * @param {Actor5e} actor - The actor to check
 * @returns {boolean} True if actor has a wizard class or force wizard mode is enabled
 */
export function isWizard(actor) {
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  if (actor.spellcastingClasses) {
    for (const [classId, classData] of Object.entries(actor.spellcastingClasses)) {
      const classItem = actor.items.get(classData.id);
      if (classItem && classItem.name.toLowerCase() === localizedWizardName) return true;
    }
  }
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  const hasForceWizardMode = Object.values(classRules).some((rules) => rules.forceWizardMode === true);
  return hasForceWizardMode;
}

/**
 * Get the canonical UUID for a spell
 * @param {Item5e} spell - The spell item
 * @returns {string} The spell's UUID
 */
export function getSpellUuid(spell) {
  return spell.flags?.core?.sourceId || spell.flags?.dnd5e?.sourceId || spell.system?.parent?._source._stats.compendiumSource || spell.uuid;
}

/**
 * Find the wizard class item for an actor
 * @param {Actor5e} actor - The actor to check
 * @returns {Item5e|null} The wizard class item or null
 */
export function findWizardClass(actor) {
  if (!isWizard(actor)) return null;
  if (actor.spellcastingClasses) {
    const spellcastingClassEntries = Object.entries(actor.spellcastingClasses);
    if (spellcastingClassEntries.length === 1) {
      const [classId, classData] = spellcastingClassEntries[0];
      return actor.items.get(classData.id);
    }
    if (spellcastingClassEntries.length >= 2) {
      const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
      for (const [classId, classData] of spellcastingClassEntries) {
        const classItem = actor.items.get(classData.id);
        if (!classItem) continue;
        const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
        if (classRules[identifier]?.forceWizardMode === true) return classItem;
      }
      for (const [classId, classData] of spellcastingClassEntries) {
        const classItem = actor.items.get(classData.id);
        if (classItem?.system.identifier?.toLowerCase() === 'wizard') return classItem;
      }
      const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
      for (const [classId, classData] of spellcastingClassEntries) {
        const classItem = actor.items.get(classData.id);
        if (classItem?.name.toLowerCase() === localizedWizardName) return classItem;
      }
    }
  }
  return null;
}

/**
 * Get all wizard-enabled classes for an actor (including force wizard mode classes)
 * @param {Actor5e} actor - The actor to check
 * @returns {Array} Array of class identifiers that are wizard-enabled
 */
export function getWizardEnabledClasses(actor) {
  const wizardClasses = [];
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  if (actor.spellcastingClasses) {
    for (const [classId, classData] of Object.entries(actor.spellcastingClasses)) {
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
 * Check if a specific class is wizard-enabled
 * @param {Actor5e} actor - The actor to check
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
}

/**
 * Get the appropriate label/name from a CONFIG object
 * @param {Object} configObject - The CONFIG object (e.g., CONFIG.DND5E.spellSchools)
 * @param {string} key - The key to look up
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
 * Get the target user ID for spell data operations
 * @todo - Should be an easier way within dnd5e/foundry to get this done
 * @returns {string} The user ID to use for spell data
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
 * Check if metric units should be used based on dnd5e system settings
 * @returns {boolean} True if either length or volume units are set to metric
 */
export function shouldUseMetricUnits() {
  const metricLength = game.settings.get('dnd5e', 'metricLengthUnits') ?? false;
  const metricVolume = game.settings.get('dnd5e', 'metricVolumeUnits') ?? false;
  return metricLength || metricVolume;
}
