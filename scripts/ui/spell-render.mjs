import { FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import { ClassManager } from '../managers/class-manager.mjs';
import { PartyMode } from '../managers/party-mode.mjs';
import { WizardBook } from '../managers/wizard-book.mjs';
import { buildPlayerMetadata } from './custom-ui.mjs';
import { getSpellDataAttributes, getSpellPreparationTags } from './formatting.mjs';

/**
 * Enrich an array of spells with all data needed for template rendering.
 * @param {Array<object>} spells - Raw spell objects
 * @param {object} actor - The owning actor
 * @param {Set<string>} enabledElements - Which UI elements are enabled
 * @param {object} [appState] - Application state (wizardbookCache, comparisonSpells, etc.)
 * @returns {Array<object>} Enriched spell objects ready for Handlebars
 */
export function enrichSpellsForTemplate(spells, actor, enabledElements, appState = {}) {
  return spells.map((spell) => enrichSingleSpell(spell, actor, enabledElements, appState));
}

/**
 * Enrich a single spell with display data.
 * @param {object} spell - Raw spell object
 * @param {object} actor - The owning actor
 * @param {Set<string>} enabledElements - Which UI elements are enabled
 * @param {object} [appState] - Application state
 * @returns {object} Enriched spell object
 */
export function enrichSingleSpell(spell, actor, enabledElements, appState = {}) {
  const classIdentifier = ClassManager.getSpellClassIdentifier(spell);
  if (!spell.compendiumUuid) spell.compendiumUuid = spell.uuid;
  const spellUuid = spell.uuid || spell.compendiumUuid;

  const classes = ['spell-item'];
  if (spell.preparation?.prepared) classes.push('prepared-spell');
  if (appState.wizardbookCache && classIdentifier) {
    const classSpellbook = appState.wizardbookCache.get(classIdentifier);
    if (classSpellbook?.includes(spell.compendiumUuid)) classes.push('in-wizard-spellbook');
  }
  const inWizardSpellbook = appState.wizardbookCache?.get(classIdentifier)?.includes(spell.compendiumUuid) ?? false;
  return {
    ...spell,
    cssClasses: classes.join(' '),
    dataAttributes: getSpellDataAttributes(spell),
    tags: spell.tags || getSpellPreparationTags(spell, actor),
    comparisonIcon: buildComparisonIcon(spell, enabledElements, appState),
    favoriteButton: buildFavoriteButton(spell, enabledElements, spellUuid),
    notesIcon: buildNotesIcon(spell, enabledElements, spellUuid),
    wizardAction: buildWizardAction(spell, classIdentifier, inWizardSpellbook, appState),
    partyIcons: buildPartyIcons(spell, actor),
    formattedDetails: buildPlayerMetadata(spell, enabledElements, actor),
    inWizardSpellbook
  };
}

/**
 * Build comparison icon config.
 * @param {object} spell - The spell
 * @param {Set<string>} enabledElements - Enabled elements
 * @param {object} appState - App state with comparisonSpells
 * @returns {object} Icon config
 */
export function buildComparisonIcon(spell, enabledElements, appState) {
  const comparisonSpells = appState.comparisonSpells || new Set();
  return {
    enabled: enabledElements.has('compare'),
    active: comparisonSpells.has(spell.compendiumUuid),
    uuid: spell.compendiumUuid,
    tooltip: _loc('SPELLBOOK.Comparison.Compare'),
    ariaLabel: _loc('SPELLBOOK.Comparison.CompareSpell', { name: spell.name })
  };
}

/**
 * Build favorite button config.
 * @param {object} spell - The spell
 * @param {Set<string>} enabledElements - Enabled elements
 * @param {string} spellUuid - Spell UUID
 * @returns {object} Button config
 */
export function buildFavoriteButton(spell, enabledElements, spellUuid) {
  return {
    enabled: enabledElements.has('favorites') && !!spellUuid,
    favorited: spell.favorited,
    uuid: spellUuid,
    tooltip: spell.favorited ? _loc('SPELLBOOK.UI.RemoveFromFavorites') : _loc('SPELLBOOK.UI.AddToFavorites'),
    iconClass: spell.favorited ? 'fas' : 'far'
  };
}

/**
 * Build notes icon config.
 * @param {object} spell - The spell
 * @param {Set<string>} enabledElements - Enabled elements
 * @param {string} spellUuid - Spell UUID
 * @returns {object} Icon config
 */
export function buildNotesIcon(spell, enabledElements, spellUuid) {
  return {
    enabled: enabledElements.has('notes') && !!spellUuid,
    hasNotes: spell.hasNotes,
    uuid: spellUuid,
    tooltip: spell.hasNotes ? _loc('SPELLBOOK.UI.HasNotes') : _loc('SPELLBOOK.UI.AddNotes'),
    iconClass: spell.hasNotes ? 'fas fa-sticky-note' : 'far fa-sticky-note'
  };
}

/**
 * Build wizard action config.
 * @param {object} spell - The spell
 * @param {string} classIdentifier - Class identifier for the spell
 * @param {boolean} inWizardSpellbook - Whether spell is in the wizard spellbook
 * @param {object} appState - App state with wizardManagers
 * @returns {object} Action config
 */
export function buildWizardAction(spell, classIdentifier, inWizardSpellbook, appState) {
  let learningSource = null;
  let learningSourceLabel = null;
  if (inWizardSpellbook && classIdentifier && appState.wizardManagers) {
    const wizardManager = appState.wizardManagers.get(classIdentifier);
    if (wizardManager) {
      const uuid = spell.spellUuid || spell.compendiumUuid;
      learningSource = wizardManager.getSpellLearningSource(uuid);
      learningSourceLabel = _loc(WizardBook.getLearnedLabelKey(learningSource));
    }
  }
  return {
    isFromScroll: spell.isFromScroll,
    inSpellbook: inWizardSpellbook,
    canLearn: spell.system?.level > 0 && !inWizardSpellbook && !spell.isFromScroll,
    uuid: spell.spellUuid || spell.compendiumUuid,
    scrollId: spell.scrollId,
    ariaLabel: _loc('SPELLBOOK.Scrolls.LearnFromScroll', { name: spell.name }),
    learningSource,
    learningSourceLabel
  };
}

/**
 * Build party indicator icons for a spell.
 * @param {object} spell - The spell
 * @param {object} actor - The owning actor
 * @returns {object} Party icons config with enabled flag and icon array
 */
export function buildPartyIcons(spell, actor) {
  const isPartyMode = actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
  if (!isPartyMode) return { enabled: false, icons: [] };
  const partyActors = PartyMode.getPartyActors();
  const tokenLimit = game.settings.get(MODULE.ID, SETTINGS.PARTY_MODE_TOKEN_LIMIT);
  const spellUuid = spell.sourceUuid || spell.compendiumUuid || spell.uuid;
  const icons = [];
  for (const partyActor of partyActors) {
    if (icons.length >= tokenLimit) break;
    if (partyActor.id === actor.id) continue;
    if (PartyMode.actorHasSpell(partyActor, spellUuid)) {
      const associatedUser = game.users.find((user) => user.character?.id === partyActor.id);
      icons.push({ src: partyActor.img, name: partyActor.name, actorId: partyActor.id, userColor: associatedUser?.color?.css || 'transparent' });
    }
  }
  return { enabled: icons.length > 0, icons };
}
