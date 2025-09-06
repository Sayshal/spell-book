/**
 * D&D 5e System Integration
 *
 * Provides comprehensive integration with the D&D 5e system including character sheets,
 * group actors, rest mechanics, and journal directory enhancements. This module handles
 * UI button injection, long rest processing, spell swap mechanics, and party spell
 * coordination features.
 *
 * Integration features:
 * - Character sheet spell book button injection
 * - Group actor party spell management
 * - Long rest spell/cantrip swap processing
 * - Journal directory spell management buttons
 * - Analytics dashboard integration
 * - Rest completion event handling
 *
 * @module Integrations/DnD5e
 * @author Tyler
 */

import { PartySpells, SpellAnalyticsDashboard, SpellBook, SpellListManager } from '../apps/_module.mjs';
import { ASSETS, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { PartySpellManager, SpellManager } from '../managers/_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Long rest class configuration for swap mechanics.
 *
 * @typedef {Object} LongRestClasses
 * @property {Array<ClassSwapInfo>} cantripSwapping - Classes that can swap cantrips on long rest
 * @property {Array<ClassSwapInfo>} spellSwapping - Classes that can swap spells on long rest
 */

/**
 * Class swap information for long rest mechanics.
 *
 * @typedef {Object} ClassSwapInfo
 * @property {string} identifier - The class identifier
 * @property {string} name - The display name of the class
 */

/**
 * Sheet data object passed to render hooks.
 *
 * @typedef {Object} SheetData
 * @property {Actor5e} actor - The actor being rendered
 * @property {Object} system - The actor's system data
 * @property {Array} [creatures] - Group actor members (for group actors)
 */

/**
 * Rest result data from D&D 5e rest completion.
 *
 * @typedef {Object} RestResult
 * @property {boolean} longRest - Whether this was a long rest
 * @property {boolean} shortRest - Whether this was a short rest
 * @property {Object} [updates] - Updates applied during rest
 */

/**
 * Register hooks related to D&D 5e system integration.
 *
 * Initializes all integration hooks for character sheets, group actors,
 * journal directory, and rest mechanics. This function sets up the
 * complete D&D 5e integration suite for the Spell Book module.
 *
 * @returns {void}
 */
export function registerDnD5eIntegration() {
  try {
    Hooks.on('renderActorSheetV2', addSpellbookButton);
    Hooks.on('renderGroupActorSheet', onGroupActorRender);
    Hooks.on('activateJournalDirectory', addJournalSpellBookButton);
    Hooks.on('dnd5e.restCompleted', handleRestCompleted);
    log(3, 'Registering DnD5e system integration');
  } catch (error) {
    log(1, 'Error registering DnD5e integration:', error);
  }
}

/**
 * Add Spell Book button to D&D 5e character sheet.
 *
 * Injects a spell book button into the character sheet's spells tab for actors
 * with spellcasting capabilities. The button provides quick access to the
 * Spell Book application directly from the character sheet interface.
 *
 * @param {Application} _app - The character sheet application instance
 * @param {HTMLElement} html - The character sheet HTML element
 * @param {SheetData} data - The sheet data object containing actor information
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
 * Check if Spell Book button can be added to character sheet.
 *
 * Validates that the actor has spellcasting capabilities and the sheet
 * has the appropriate structure for button injection.
 *
 * @param {Actor5e} actor - The actor to check for spellcasting capabilities
 * @param {HTMLElement} html - The character sheet HTML element
 * @returns {boolean} True if the button can be added to this sheet
 */
function canAddSpellbookButton(actor, html) {
  const canCast = Object.keys(actor?.spellcastingClasses || {}).length > 0;
  if (!canCast) return false;
  const hasSpellsTab = html.querySelector('section.tab[data-tab="spells"]');
  if (!hasSpellsTab) return false;
  return true;
}

/**
 * Create Spell Book button element for character sheets.
 *
 * Constructs a properly styled and configured button element that opens
 * the Spell Book application when clicked. Includes appropriate tooltips
 * and accessibility attributes.
 *
 * @param {Actor5e} actor - The actor this button will open a spell book for
 * @returns {HTMLElement} The created button element
 */
function createSpellBookButton(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'unbutton filter-control always-interactive spell-book-button';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = `<img src="${ASSETS.MODULE_ICON}" alt=${game.i18n.localize('SPELLBOOK.LongRest.SwapConfirm')} class="spell-book-icon">`;
  button.addEventListener('click', onSpellBookButtonClick.bind(null, actor));
  return button;
}

/**
 * Handle Spell Book button click event.
 *
 * Processes button clicks to open the Spell Book application, handling
 * long rest swap mechanics and cantrip swap tracking. Ensures proper
 * flag management for spell swapping features.
 *
 * @param {Actor5e} actor - The actor whose spell book should be opened
 * @param {Event} event - The click event
 * @returns {Promise<void>}
 */
async function onSpellBookButtonClick(actor, event) {
  event.preventDefault();
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  const hasLongRestSwapping = Object.values(classRules).some((rules) => rules.cantripSwapping === 'longRest' || rules.spellSwapping === 'longRest');
  if (hasLongRestSwapping) {
    const longRestFlagValue = actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
    const cantripSwapTracking = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};
    let hasCompletedSwaps = false;
    for (const tracking of Object.values(cantripSwapTracking)) {
      if (tracking.longRest?.hasLearned && tracking.longRest?.hasUnlearned) {
        hasCompletedSwaps = true;
        break;
      }
    }
    if (hasCompletedSwaps) {
      const spellManager = new SpellManager(actor);
      await spellManager.cantripManager.resetSwapTracking();
    }
    if (longRestFlagValue === undefined || longRestFlagValue === null) actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
  }
  const spellBook = new SpellBook(actor);
  spellBook.render(true);
}

/**
 * Handle group actor sheet rendering for party spell management.
 *
 * Injects a party spell button into group actor sheets when the group
 * contains members with spellcasting capabilities. Enables coordinated
 * spell management across party members.
 *
 * @param {Application} sheet - The group actor sheet
 * @param {HTMLElement} element - The sheet HTML element
 * @param {SheetData} data - The sheet data
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
 * Check if party spell button can be added to group actor sheet.
 *
 * Validates that the actor is a group type and contains members with
 * spellcasting capabilities that would benefit from party spell coordination.
 *
 * @param {Actor} actor - The group actor
 * @param {SheetData} data - The sheet data
 * @returns {boolean} True if button should be added
 */
function canAddPartySpellButton(actor, data) {
  if (actor.type !== 'group') return false;
  const creatures = data.actor.system?.creatures || [];
  const spellcasters = creatures.filter((memberActor) => memberActor && Object.keys(memberActor?.spellcastingClasses || {}).length > 0);
  return spellcasters.length > 0;
}

/**
 * Create party spell button element for group actor sheets.
 *
 * Constructs a button element that opens the party spell management
 * interface when clicked. Matches the styling of other group actor
 * sheet buttons for visual consistency.
 *
 * @param {Actor} groupActor - The group actor
 * @param {SheetData} data - The sheet data
 * @returns {HTMLElement} The button element
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
 * Open party spell manager for group coordination.
 *
 * Launches the party spell management interface with all spellcasting
 * members of the group. Provides centralized spell coordination and
 * planning capabilities for the entire party.
 *
 * @param {Event} event - The click event
 * @param {Actor} groupActor - The group actor
 * @param {SheetData} data - The sheet data
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

/**
 * Handle long rest completion for spell swap mechanics.
 *
 * Processes long rest completion events to enable spell and cantrip swapping
 * for applicable classes. Sets appropriate flags and triggers user prompts
 * for available swap mechanics.
 *
 * @param {Actor5e} actor - The actor who completed the long rest
 * @param {RestResult} result - The rest result data containing completion status
 * @param {Object} _config - The rest configuration options
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
      const className = classItem?.name || classIdentifier;
      if (needsCantripSwap) longRestClasses.cantripSwapping.push({ identifier: classIdentifier, name: className });
      if (needsSpellSwap) {
        longRestClasses.spellSwapping.push({ identifier: classIdentifier, name: className });
        const swapTracking = actor.getFlag(MODULE.ID, FLAGS.SWAP_TRACKING) || {};
        if (!swapTracking[classIdentifier]) swapTracking[classIdentifier] = {};
        swapTracking[classIdentifier].longRest = true;
        actor.setFlag(MODULE.ID, FLAGS.SWAP_TRACKING, swapTracking);
        log(3, `Set spell swap flag for class ${classIdentifier}`);
      }
    }
  }
  if (hasAnyLongRestMechanics) {
    actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
    log(3, `Set long rest completion flag for ${actor.name} - available for all classes that need it`);
    await handleLongRestSwapPrompt(actor, longRestClasses);
  } else {
    log(3, `No classes on ${actor.name} require long rest mechanics, skipping`);
  }
}

/**
 * Handle the long rest swap prompt for applicable classes.
 *
 * Displays a user prompt for available spell and cantrip swap options
 * after a long rest, or shows a notification if prompts are disabled.
 * Provides options to open the Spell Book for swap management.
 *
 * @param {Actor5e} actor - The actor who completed the long rest
 * @param {LongRestClasses} longRestClasses - Object containing arrays of classes needing swaps
 * @returns {Promise<void>}
 */
async function handleLongRestSwapPrompt(actor, longRestClasses) {
  const isPromptDisabled = game.settings.get(MODULE.ID, SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT);
  if (isPromptDisabled) {
    log(3, 'Long rest swap prompt disabled by user preference, flag already set');
    const classNames = [...longRestClasses.cantripSwapping.map((c) => c.name), ...longRestClasses.spellSwapping.map((c) => c.name)];
    const uniqueClassNames = [...new Set(classNames)];
    ui.notifications.info(game.i18n.format('SPELLBOOK.LongRest.SwapAvailableNotification', { name: actor.name, classes: uniqueClassNames.join(', ') }));
    return;
  }
  const dialogResult = await showLongRestSwapDialog(longRestClasses);
  if (dialogResult === 'confirm') {
    const spellBook = new SpellBook(actor);
    spellBook.render(true);
  }
}

/**
 * Show the long rest swap dialog with dynamic content.
 *
 * Displays a modal dialog presenting available swap options for the
 * completed long rest. Allows users to choose whether to open the
 * Spell Book for swap management or cancel.
 *
 * @param {LongRestClasses} longRestClasses - Object containing arrays of classes needing swapping mechanics
 * @returns {Promise<string>} The dialog result action ('confirm' or 'cancel')
 */
async function showLongRestSwapDialog(longRestClasses) {
  const content = await renderTemplate(TEMPLATES.DIALOGS.LONG_REST_SWAP, { longRestClasses });
  return foundry.applications.api.DialogV2.wait({
    content: content,
    window: { icon: 'fas fa-bed', resizable: false, minimizable: false, positioned: true, title: game.i18n.localize('SPELLBOOK.LongRest.SwapTitle') },
    position: { height: 'auto', width: '450' },
    buttons: [
      { icon: 'fas fa-book', label: game.i18n.localize('SPELLBOOK.LongRest.SwapConfirm'), action: 'confirm', className: 'dialog-button' },
      { icon: 'fas fa-times', label: game.i18n.localize('SPELLBOOK.LongRest.SwapCancel'), action: 'cancel', className: 'dialog-button' }
    ],
    default: 'cancel',
    rejectClose: false
  });
}

/**
 * Add Spell Book management buttons to journal sidebar footer.
 *
 * Injects spell list manager and analytics dashboard buttons into the
 * journal directory sidebar for GM users. Provides quick access to
 * spell management tools directly from the journal interface.
 *
 * @param {Application} app - The journal sidebar application
 * @returns {void}
 */
function addJournalSpellBookButton(app) {
  if (!game.settings.get(MODULE.ID, SETTINGS.ENABLE_JOURNAL_BUTTON)) return;
  if (!game.user.isGM) return;
  const footer = app.element.querySelector('.directory-footer');
  if (!footer) return;
  if (footer.querySelector('.spell-book-buttons-container')) return;
  const container = createJournalButtonsContainer();
  footer.appendChild(container);
}

/**
 * Create the container and buttons for journal sidebar.
 *
 * Constructs a styled container with spell list manager and analytics
 * dashboard buttons. Provides consistent layout and spacing for the
 * journal directory integration.
 *
 * @returns {HTMLElement} Container element with spell book buttons
 */
function createJournalButtonsContainer() {
  const container = document.createElement('div');
  container.classList.add('spell-book-buttons-container');
  container.style.display = 'flex';
  container.style.gap = '0.5rem';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';
  const managerButton = createJournalManagerButton();
  const analyticsButton = createJournalAnalyticsButton();
  container.appendChild(managerButton);
  container.appendChild(analyticsButton);
  return container;
}

/**
 * Create the spell list manager button for journal sidebar.
 *
 * Constructs a button that opens the spell list manager application
 * when clicked. Provides quick access to spell list management from
 * the journal directory.
 *
 * @returns {HTMLElement} Button element for opening spell list manager
 */
function createJournalManagerButton() {
  const managerButton = document.createElement('button');
  managerButton.classList.add('spell-book-journal-button');
  managerButton.innerHTML = `<i class="fas fa-bars-progress"></i> ${game.i18n.localize('SPELLBOOK.UI.JournalButton')}`;
  const manager = new SpellListManager();
  managerButton.addEventListener('click', () => {
    manager.render(true);
  });
  return managerButton;
}

/**
 * Create the analytics dashboard button for journal sidebar.
 *
 * Constructs a button that opens the analytics dashboard and supports
 * right-click to toggle spell usage tracking. Provides visual feedback
 * for tracking state and quick access to analytics features.
 *
 * @returns {HTMLElement} Button element for opening analytics dashboard
 */
function createJournalAnalyticsButton() {
  const analyticsButton = document.createElement('button');
  analyticsButton.classList.add('spell-book-analytics-button');
  analyticsButton.innerHTML = `<i class="fas fa-chart-bar"></i> ${game.i18n.localize('SPELLBOOK.Analytics.OpenDashboard')}`;
  const dashboard = new SpellAnalyticsDashboard({ viewMode: 'gm', userId: game.user.id });
  analyticsButton.addEventListener('click', () => {
    dashboard.render(true);
  });
  analyticsButton.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const currentSetting = game.settings.get(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING);
    const newSetting = !currentSetting;
    try {
      await game.settings.set(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING, newSetting);
      analyticsButton.style.opacity = newSetting ? '1' : '0.6';
      analyticsButton.title = newSetting ? game.i18n.localize('SPELLBOOK.Analytics.TrackingEnabled') : game.i18n.localize('SPELLBOOK.Analytics.TrackingDisabled');
    } catch (error) {
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Analytics.TrackingToggleError'));
      log(1, 'Error:', error);
    }
  });
  const trackingEnabled = game.settings.get(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING);
  analyticsButton.style.opacity = trackingEnabled ? '1' : '0.6';
  analyticsButton.title = trackingEnabled ? game.i18n.localize('SPELLBOOK.Analytics.TrackingEnabled') : game.i18n.localize('SPELLBOOK.Analytics.TrackingDisabled');
  return analyticsButton;
}
