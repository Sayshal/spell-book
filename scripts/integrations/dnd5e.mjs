import { SpellAnalyticsDashboard, SpellBook, SpellListManager, PartySpells } from '../apps/_module.mjs';
import { ASSETS, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { SpellManager, PartySpellManager } from '../managers/_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * D&D 5e Actor object from the dnd5e system
 * @typedef {Object} Actor5e
 * @property {string} type Actor type (character, npc, etc.)
 * @property {string} name Actor's display name
 * @property {Object} spellcastingClasses Spellcasting class configuration data
 * @property {ActorSystemData} system Actor's system data
 * @property {Function} getFlag Get actor flag value
 * @property {Function} setFlag Set actor flag value
 * @property {Collection} items Actor's items collection
 */

/**
 * D&D 5e rest completion result data
 * @typedef {Object} RestResult
 * @property {boolean} longRest Whether this was a long rest
 * @property {boolean} shortRest Whether this was a short rest
 * @property {Object} [updates] Document updates applied during rest
 */

/**
 * Rest configuration options passed to rest handlers
 * @typedef {Object} RestConfig
 * @property {boolean} dialog Whether to show rest dialog
 * @property {boolean} chat Whether to create chat message
 * @property {Object} [newDay] New day configuration
 */

/**
 * Foundry VTT Application instance for sheet rendering
 * @typedef {Object} FoundryApplication
 * @property {string} id Application ID
 * @property {Object} options Application options
 * @property {HTMLElement} element Application HTML element
 * @property {Actor5e} actor Associated actor (for actor sheets)
 */

/**
 * Sheet rendering data passed to hook handlers
 * @typedef {Object} SheetRenderData
 * @property {Actor5e} actor The actor being rendered
 * @property {Object} [system] Actor system data
 * @property {boolean} [editable] Whether sheet is editable
 * @property {Object} [options] Sheet options
 */

/**
 * Group actor system data for party management
 * @typedef {Object} GroupActorSystemData
 * @property {Actor5e[]} creatures Array of party member actors
 * @property {Object} [details] Group details like name, description
 */

/**
 * Spell book button configuration for different sheet types
 * @typedef {Object} SpellBookButtonConfig
 * @property {string} className CSS classes for the button
 * @property {string} title Button tooltip text
 * @property {string} innerHTML Button HTML content
 * @property {Object} [attributes] Additional HTML attributes
 */

/**
 * Long rest class processing data
 * @typedef {Object} LongRestClassData
 * @property {string} classIdentifier Class identifier string
 * @property {Object} rules Class-specific rules configuration
 * @property {boolean} needsSpellSwap Whether class needs spell swapping
 * @property {boolean} needsCantripSwap Whether class needs cantrip swapping
 * @property {Item5e|null} classItem The class item from actor
 */

// ========== D&D 5E CORE INTEGRATION ==========

/**
 * Register hooks related to D&D 5e system integration.
 * Handles spell book buttons, rest completion, and journal integration.
 * @returns {void}
 */
export function registerDnD5eIntegration() {
  try {
    Hooks.on('renderActorSheetV2', addSpellbookButton);
    Hooks.on('activateJournalDirectory', addJournalSpellBookButton);
    Hooks.on('dnd5e.restCompleted', handleRestCompleted);
    log(3, 'Registering D&D 5e system integration');
  } catch (error) {
    log(1, 'Error registering D&D 5e integration:', error);
  }
}

/**
 * Add Spell Book button to D&D 5e character sheet V2.
 * Integrates with the native spell controls in the spells tab.
 * @param {FoundryApplication} _app The character sheet application instance
 * @param {HTMLElement} html The character sheet HTML element
 * @param {SheetRenderData} data The sheet data object containing actor information
 * @returns {void}
 */
function addSpellbookButton(_app, html, data) {
  const actor = data.actor;
  if (!canAddSpellbookButton(actor, html)) return;
  const spellsTab = html.querySelector('section.tab[data-tab="spells"]');
  if (!spellsTab) return;
  const controlsList = spellsTab.querySelector('item-list-controls search ul.controls');
  if (!controlsList) return;
  const filterButton = controlsList.querySelector('button[data-action="filter"]');
  if (!filterButton) return;
  const button = createSpellBookButton(actor);
  const listItem = document.createElement('li');
  listItem.appendChild(button);
  filterButton.parentElement.insertAdjacentElement('afterend', listItem);
}

/**
 * Add Spell Book button to journal directory for GM access.
 * Provides quick access to Spell List Manager from the journal tab.
 * @param {FoundryApplication} _app The journal directory application
 * @param {HTMLElement} html The journal directory HTML element
 * @returns {void}
 */
function addJournalSpellBookButton(_app, html) {
  if (!game.user.isGM) return;
  if (!game.settings.get(MODULE.ID, SETTINGS.ENABLE_JOURNAL_BUTTON)) return;
  const header = html.querySelector('.directory-header');
  if (!header) return;
  const searchContainer = header.querySelector('.header-search');
  if (!searchContainer) return;
  if (header.querySelector('.spell-list-manager-button')) return;
  const button = createJournalSpellBookButton();
  searchContainer.insertAdjacentElement('afterend', button);
}

/**
 * Handle long rest completion for all spellcasting classes.
 * Processes spell and cantrip swapping based on class rules.
 * @param {Actor5e} actor The actor who completed the long rest
 * @param {RestResult} result The rest result data containing completion status
 * @param {RestConfig} _config The rest configuration options
 * @returns {Promise<void>}
 */
async function handleRestCompleted(actor, result, _config) {
  if (!result.longRest) return;
  log(3, `Long rest completed for ${actor.name}, processing all spellcasting classes`);
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  let hasAnyLongRestMechanics = false;
  const longRestClasses = { cantripSwapping: [], spellSwapping: [] };
  for (const [classIdentifier, rules] of Object.entries(classRules)) {
    const needsSpellSwap = rules.spellSwapping === 'longRest';
    const needsCantripSwap = rules.cantripSwapping === 'longRest';
    if (needsSpellSwap || needsCantripSwap) {
      hasAnyLongRestMechanics = true;
      log(3, `Class ${classIdentifier} needs long rest mechanics: spell swap=${needsSpellSwap}, cantrip swap=${needsCantripSwap}`);
      const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
      const classItem = spellcastingData ? actor.items.get(spellcastingData.id) : null;
      if (classItem) {
        const classData = { classIdentifier, rules, needsSpellSwap, needsCantripSwap, classItem };
        if (needsCantripSwap) longRestClasses.cantripSwapping.push(classData);
        if (needsSpellSwap) longRestClasses.spellSwapping.push(classData);
      }
    }
  }
  if (!hasAnyLongRestMechanics) {
    log(3, `No long rest mechanics needed for ${actor.name}`);
    return;
  }
  const disablePrompt = game.settings.get(MODULE.ID, SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT);
  if (disablePrompt) {
    log(3, `Long rest swap prompt disabled for ${actor.name}`);
    return;
  }
  try {
    await _showLongRestSwapDialog(actor, longRestClasses);
  } catch (error) {
    log(1, `Error showing long rest swap dialog for ${actor.name}:`, error);
  }
}

/**
 * Check if spell book button can be added to this actor sheet.
 * Verifies the actor has spellcasting capabilities and appropriate UI elements.
 * @param {Actor5e} actor The actor to check for spellcasting capabilities
 * @param {HTMLElement} html The sheet HTML element
 * @returns {boolean} True if the button can be added to this actor sheet
 */
function canAddSpellbookButton(actor, html) {
  const canCast = Object.keys(actor?.spellcastingClasses || {}).length > 0;
  if (!canCast) return false;
  const hasSpellsTab = html.querySelector('section.tab[data-tab="spells"]');
  if (!hasSpellsTab) return false;
  return true;
}

/**
 * Create standard Spell Book button element for D&D 5e sheets.
 * @param {Actor5e} actor The actor this button will open a spell book for
 * @returns {HTMLElement} The created button element
 */
function createSpellBookButton(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'spell-book-button';
  button.title = game.i18n.localize('SPELLBOOK.UI.OpenSpellBook');
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt="${game.i18n.localize('SPELLBOOK.UI.OpenSpellBook')}" class="spell-book-icon">`;
  button.addEventListener('click', (event) => openSpellbook(event, actor));
  return button;
}

/**
 * Create Spell List Manager button for journal directory.
 * @returns {HTMLElement} The created button element
 */
function createJournalSpellBookButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'spell-list-manager-button';
  button.title = game.i18n.localize('SPELLMANAGER.UI.OpenSpellListManager');
  button.setAttribute('aria-label', game.i18n.localize('SPELLMANAGER.UI.OpenSpellListManager'));
  button.innerHTML = `<i class="fas fa-book-open"></i>`;
  button.addEventListener('click', (event) => openSpellListManager(event));
  return button;
}

/**
 * Open Spell Book application for specified actor.
 * @param {Event} event The click event that triggered this action
 * @param {Actor5e} actor The actor whose spell book should be opened
 * @returns {void}
 */
function openSpellbook(event, actor) {
  event.preventDefault();
  const spellBook = new SpellBook(actor);
  spellBook.render(true);
}

/**
 * Open Spell List Manager application.
 * @param {Event} event The click event that triggered this action
 * @returns {void}
 */
function openSpellListManager(event) {
  event.preventDefault();
  const manager = new SpellListManager();
  manager.render(true);
}

/**
 * Show long rest spell/cantrip swap dialog to the user.
 * @param {Actor5e} actor The actor who completed the long rest
 * @param {Object} longRestClasses Classes that need long rest processing
 * @returns {Promise<void>}
 * @private
 */
async function _showLongRestSwapDialog(actor, longRestClasses) {
  const content = await renderTemplate(TEMPLATES.DIALOGS.LONG_REST_SWAP, {
    actorName: actor.name,
    cantripClasses: longRestClasses.cantripSwapping,
    spellClasses: longRestClasses.spellSwapping
  });

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: game.i18n.localize('SPELLBOOK.LongRest.Title') },
    content,
    buttons: [
      {
        action: 'open',
        icon: '<i class="fa-solid fa-book-open"></i>',
        label: game.i18n.localize('SPELLBOOK.LongRest.OpenSpellBook'),
        callback: () => openSpellbook(new Event('click'), actor)
      },
      {
        action: 'later',
        icon: '<i class="fa-solid fa-clock"></i>',
        label: game.i18n.localize('SPELLBOOK.LongRest.Later')
      }
    ],
    modal: true,
    rejectClose: false
  });

  await dialog.render(true);
}

/**
 * Register hooks for group actor sheet integration.
 * Enables party spell coordination through group actor sheets.
 * @returns {void}
 */
export function registerGroupActorIntegration() {
  Hooks.on('renderGroupActorSheet', onGroupActorRender);
  log(3, 'Registered Group Actor sheet integration');
}

/**
 * Handle group actor sheet rendering to add party spell management button.
 * Integrates with the Group Actor module's sheet header.
 * @param {FoundryApplication} sheet The group actor sheet application
 * @param {HTMLElement} element The sheet HTML element
 * @param {Object} data The sheet data containing group actor information
 * @returns {void}
 */
function onGroupActorRender(sheet, element, data) {
  const actor = data.actor;
  if (!canAddPartySpellButton(actor, data)) return;
  const headerButtons = element.querySelector('.sheet-header-buttons');
  if (!headerButtons) {
    log(2, 'Could not find .sheet-header-buttons in group actor sheet');
    return;
  }
  const longRestButton = headerButtons.querySelector('.long-rest.gold-button');
  if (!longRestButton) {
    log(2, 'Could not find long rest button in group actor sheet');
    return;
  }
  if (headerButtons.querySelector('.party-spell-button')) return;
  const button = createPartySpellButton(actor, data);
  longRestButton.insertAdjacentElement('afterend', button);
  log(3, 'Added party spell button to group actor sheet');
}

/**
 * Check if party spell button can be added to this group actor.
 * Verifies the group has members with spellcasting capabilities.
 * @param {Actor5e} actor The group actor to check
 * @param {Object} data The sheet data containing group information
 * @returns {boolean} True if button should be added
 */
function canAddPartySpellButton(actor, data) {
  if (actor.type !== 'group') return false;
  const creatures = data.actor.system?.creatures || [];
  const spellcasters = creatures.filter((memberActor) => memberActor && Object.keys(memberActor?.spellcastingClasses || {}).length > 0);
  return spellcasters.length > 0;
}

/**
 * Create party spell management button element for group actor sheets.
 * @param {Actor5e} groupActor The group actor this button represents
 * @param {Object} data The sheet data containing group information
 * @returns {HTMLElement} The created button element
 */
function createPartySpellButton(groupActor, data) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'party-spell-button gold-button';
  button.setAttribute('data-action', 'openPartySpells');
  button.setAttribute('data-tooltip', '');
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.Party.OpenPartySpellPool'));
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt="${game.i18n.localize('SPELLBOOK.Party.OpenPartySpellPool')}" class="spell-book-icon">`;
  button.addEventListener('click', (event) => openPartySpellManager(event, groupActor, data));
  return button;
}

/**
 * Open party spell manager application for group coordination.
 * Filters group members to include only spellcasters.
 * @param {Event} event The click event that triggered this action
 * @param {Actor5e} groupActor The group actor containing party members
 * @param {Object} data The sheet data containing group information
 * @returns {void}
 */
function openPartySpellManager(event, groupActor, data) {
  event.preventDefault();
  const creatures = data.actor.system?.creatures || [];
  const partyActors = creatures.filter((memberActor) => memberActor && Object.keys(memberActor?.spellcastingClasses || {}).length > 0);
  if (partyActors.length === 0) {
    ui.notifications.warn('SPELLBOOK.Party.NoSpellcasters', { localize: true });
    return;
  }
  const manager = new PartySpells(partyActors, null, groupActor);
  manager.render(true);
}
