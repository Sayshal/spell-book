import { FLAGS, MODULE } from '../constants.mjs';

/**
 * Check if an actor is considered a wizard
 * @param {Actor5e} actor - The actor to check
 * @returns {boolean} True if actor has a wizard class or force wizard mode is enabled
 */
export function isWizard(actor) {
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  const hasWizardClass = !!actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === localizedWizardName);
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  const hasForceWizardMode = Object.values(classRules).some((rules) => rules.forceWizardMode === true);
  return hasWizardClass || hasForceWizardMode;
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
 * Find a spellcasting class for an actor
 * @param {Actor5e} actor - The actor to check
 * @returns {Item5e|null} - The spellcasting class item or null
 */
export function findSpellcastingClass(actor) {
  return actor.items.find((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
}

/**
 * Check if an item is a granted spell (from class features, etc.)
 * @param {Item5e} spell - The spell to check
 * @returns {boolean} Whether the spell is granted
 */
export function isGrantedSpell(spell) {
  return !!spell.flags?.dnd5e?.cachedFor;
}

/**
 * Find the wizard class item for an actor
 * @param {Actor5e} actor - The actor to check
 * @returns {Item5e|null} The wizard class item or null
 */
export function findWizardClass(actor) {
  if (!isWizard(actor)) return null;
  const spellcastingClasses = actor.items.filter((i) => i.type === 'class' && i.system.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
  if (spellcastingClasses.length === 1) return spellcastingClasses[0];
  if (spellcastingClasses.length >= 2) {
    // TODO: Check actor flags for DM-forced wizard class when that feature is re-added
    const wizardByIdentifier = spellcastingClasses.find((i) => i.system.identifier?.toLowerCase() === 'wizard');
    if (wizardByIdentifier) return wizardByIdentifier;
    const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
    const wizardByName = spellcastingClasses.find((i) => i.name.toLowerCase() === localizedWizardName);
    if (wizardByName) return wizardByName;
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
  for (const classItem of actor.items.filter((i) => i.type === 'class')) {
    const identifier = classItem.system.identifier?.toLowerCase() || classItem.name.toLowerCase();
    const isNaturalWizard = classItem.name.toLowerCase() === localizedWizardName;
    const hasForceWizard = classRules[identifier]?.forceWizardMode === true;
    if (isNaturalWizard || hasForceWizard) wizardClasses.push({ identifier, classItem, isNaturalWizard, isForceWizard: hasForceWizard });
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
  const classItem = actor.items.find((i) => i.type === 'class' && (i.system.identifier?.toLowerCase() === classIdentifier || i.name.toLowerCase() === classIdentifier));
  if (!classItem) return false;
  const localizedWizardName = game.i18n.localize('SPELLBOOK.Classes.Wizard').toLowerCase();
  const isNaturalWizard = classItem.name.toLowerCase() === localizedWizardName;
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  const hasForceWizard = classRules[classIdentifier]?.forceWizardMode === true;
  return isNaturalWizard || hasForceWizard;
}
