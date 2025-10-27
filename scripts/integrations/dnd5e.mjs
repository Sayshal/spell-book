/**
 * D&D 5e System Integration
 *
 * Provides integration with the D&D 5e system including character sheets,
 * group actors, rest mechanics, and journal directory enhancements. This module handles
 * UI button injection, long rest processing, spell swap mechanics, and party spell
 * coordination features.
 *
 * @module Integrations/DnD5e
 * @author Tyler
 */

import { PartyCoordinator, AnalyticsDashboard, SpellBook, SpellListManager } from '../apps/_module.mjs';
import { ASSETS, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { SpellManager } from '../managers/_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Register hooks related to D&D 5e system integration.
 * @returns {void}
 */
export function registerDnD5eIntegration() {
  log(3, 'Registering D&D 5e integration hooks.');
  Hooks.on('renderActorSheetV2', addSpellbookButton);
  Hooks.on('renderGroupActorSheet', onGroupActorRender);
  Hooks.on('activateCompendiumDirectory', addJournalSpellBookButton);
  Hooks.on('dnd5e.restCompleted', handleRestCompleted);
}

/**
 * Add Spell Book button to D&D 5e character sheet.
 * @param {Application} _app - The character sheet application instance
 * @param {HTMLElement} html - The character sheet HTML element
 * @param {SheetData} data - The sheet data object containing actor information
 * @returns {void}
 */
function addSpellbookButton(_app, html, data) {
  log(3, 'Adding spellbook button to character sheet.', { actorId: data.actor?.id });
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
  log(3, 'Spellbook button added successfully.', { actorId: actor.id });
}

/**
 * Check if Spell Book button can be added to character sheet.
 * @param {Actor5e} actor - The actor to check for spellcasting capabilities
 * @param {HTMLElement} html - The character sheet HTML element
 * @returns {boolean} True if the button can be added to this sheet
 */
function canAddSpellbookButton(actor, html) {
  const canCast = Object.keys(actor?.spellcastingClasses || {}).length > 0;
  if (!canCast) {
    log(3, 'Cannot add spellbook button: actor has no spellcasting classes.', { actorId: actor?.id });
    return false;
  }
  const hasSpellsTab = html.querySelector('section.tab[data-tab="spells"]');
  if (!hasSpellsTab) {
    log(3, 'Cannot add spellbook button: no spells tab found.', { actorId: actor?.id });
    return false;
  }
  log(3, 'Can add spellbook button.', { actorId: actor.id });
  return true;
}

/**
 * Create Spell Book button element for character sheets.
 * @param {Actor5e} actor - The actor this button will open a spell book for
 * @returns {HTMLElement} The created button element
 */
function createSpellBookButton(actor) {
  log(3, 'Creating spellbook button.', { actorId: actor.id });
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
 * @param {Actor5e} actor - The actor whose spell book should be opened
 * @param {Event} event - The click event
 * @returns {Promise<void>}
 */
async function onSpellBookButtonClick(actor, event) {
  log(3, 'Spellbook button clicked.', { actorId: actor.id });
  event.preventDefault();
  const button = event.currentTarget;
  const icon = button.querySelector('img.spell-book-icon');
  if (icon) {
    icon.classList.add('fa-spin');
    button.disabled = true;
  }
  try {
    const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
    const hasLongRestSwapping = Object.values(classRules).some((rules) => rules.cantripSwapping === 'longRest' || rules.spellSwapping === 'longRest');
    log(3, 'Checking long rest swapping mechanics.', { actorId: actor.id, hasLongRestSwapping });
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
        log(3, 'Resetting cantrip swap tracking.', { actorId: actor.id });
        const spellManager = new SpellManager(actor);
        await spellManager.cantripManager.resetSwapTracking();
      }
      if (longRestFlagValue === undefined || longRestFlagValue === null) {
        log(3, 'Setting long rest completed flag.', { actorId: actor.id });
        actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
      }
    }
    const spellBook = new SpellBook(actor);
    await spellBook._preInitialize();
    spellBook.render(true);
    log(3, 'Spellbook rendered successfully.', { actorId: actor.id });
  } catch (error) {
    log(1, 'Error opening spellbook.', { actorId: actor.id, error });
  } finally {
    if (icon) {
      icon.classList.remove('fa-spin');
      button.disabled = false;
    }
  }
}

/**
 * Handle group actor sheet rendering for party spell management.
 * @param {Application} _sheet - The group actor sheet
 * @param {HTMLElement} element - The sheet HTML element
 * @param {SheetData} data - The sheet data
 * @returns {void}
 */
function onGroupActorRender(_sheet, element, data) {
  log(3, 'Group actor sheet rendering.', { actorId: data.actor?.id });
  const actor = data.actor;
  if (!canAddPartySpellButton(actor, data)) return;
  const headerButtons = element.querySelector('.sheet-header-buttons');
  if (!headerButtons) {
    log(3, 'No header buttons found in group sheet.', { actorId: actor.id });
    return;
  }
  const longRestButton = headerButtons.querySelector('.long-rest.gold-button');
  if (!longRestButton) {
    log(3, 'No long rest button found in group sheet.', { actorId: actor.id });
    return;
  }
  if (headerButtons.querySelector('.party-spell-button')) {
    log(3, 'Party spell button already exists.', { actorId: actor.id });
    return;
  }
  const button = createPartySpellButton(actor, data);
  longRestButton.insertAdjacentElement('afterend', button);
  log(3, 'Party spell button added to group sheet.', { actorId: actor.id });
}

/**
 * Check if party spell button can be added to group actor sheet.
 * @param {Actor} actor - The group actor
 * @param {SheetData} data - The sheet data
 * @returns {boolean} True if button should be added
 */
function canAddPartySpellButton(actor, data) {
  if (actor.type !== 'group') {
    log(3, 'Cannot add party spell button: actor is not a group.', { actorId: actor?.id, type: actor?.type });
    return false;
  }
  const creatures = data.actor.system?.creatures || [];
  const spellcasters = creatures.filter((memberActor) => memberActor && Object.keys(memberActor?.spellcastingClasses || {}).length > 0);
  const canAdd = spellcasters.length > 0;
  log(3, 'Checking if party spell button can be added.', { actorId: actor.id, spellcasterCount: spellcasters.length, canAdd });
  return canAdd;
}

/**
 * Create party spell button element for group actor sheets.
 * @param {Actor} groupActor - The group actor
 * @param {SheetData} data - The sheet data
 * @returns {HTMLElement} The button element
 */
function createPartySpellButton(groupActor, data) {
  log(3, 'Creating party spell button.', { actorId: groupActor.id });
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
 * @param {Event} event - The click event
 * @param {Actor} groupActor - The group actor
 * @param {SheetData} data - The sheet data
 * @returns {void}
 */
function openPartySpellManager(event, groupActor, data) {
  log(3, 'Opening party spell manager.', { actorId: groupActor.id });
  event.preventDefault();
  const creatures = data.actor.system?.creatures || [];
  const partyActors = creatures.filter((memberActor) => memberActor && Object.keys(memberActor?.spellcastingClasses || {}).length > 0);
  if (partyActors.length === 0) {
    log(3, 'No spellcasters in party.', { actorId: groupActor.id });
    return;
  }
  const manager = new PartyCoordinator(partyActors, null, groupActor);
  manager.render(true);
  log(3, 'Party coordinator rendered.', { actorId: groupActor.id, partyActorCount: partyActors.length });
}

/**
 * Handle long rest completion for spell swap mechanics.
 * @param {Actor5e} actor - The actor who completed the long rest
 * @param {RestResult} result - The rest result data containing completion status
 * @param {Object} _config - The rest configuration options
 * @returns {Promise<void>}
 */
async function handleRestCompleted(actor, result, _config) {
  log(3, 'Rest completed hook triggered.', { actorId: actor.id, isLongRest: result.longRest });
  if (!result.longRest) return;

  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  let hasAnyLongRestMechanics = false;
  const longRestClasses = { cantripSwapping: [], spellSwapping: [] };
  for (const [classIdentifier, rules] of Object.entries(classRules)) {
    const needsSpellSwap = rules.spellSwapping === 'longRest';
    const needsCantripSwap = rules.cantripSwapping === 'longRest';
    if (needsSpellSwap || needsCantripSwap) {
      hasAnyLongRestMechanics = true;

      const spellcastingData = actor.spellcastingClasses?.[classIdentifier];
      const classItem = spellcastingData ? actor.items.get(spellcastingData.id) : null;
      const className = classItem?.name || classIdentifier;
      log(3, 'Class needs long rest mechanics.', { actorId: actor.id, classIdentifier, className, needsCantripSwap, needsSpellSwap });
      if (needsCantripSwap) longRestClasses.cantripSwapping.push({ identifier: classIdentifier, name: className });
      if (needsSpellSwap) {
        longRestClasses.spellSwapping.push({ identifier: classIdentifier, name: className });
        const swapTracking = actor.getFlag(MODULE.ID, FLAGS.SWAP_TRACKING) || {};
        if (!swapTracking[classIdentifier]) swapTracking[classIdentifier] = {};
        swapTracking[classIdentifier].longRest = true;
        actor.setFlag(MODULE.ID, FLAGS.SWAP_TRACKING, swapTracking);
        log(3, 'Updated swap tracking for class.', { actorId: actor.id, classIdentifier });
      }
    }
  }
  if (hasAnyLongRestMechanics) {
    actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
    log(3, 'Long rest mechanics detected, showing prompt.', { actorId: actor.id, longRestClasses });
    await handleLongRestSwapPrompt(actor, longRestClasses);
  } else {
    log(3, 'No long rest mechanics for this actor.', { actorId: actor.id });
  }
}

/**
 * Handle the long rest swap prompt for applicable classes.
 * @param {Actor5e} actor - The actor who completed the long rest
 * @param {LongRestClasses} longRestClasses - Object containing arrays of classes needing swaps
 * @returns {Promise<void>}
 */
async function handleLongRestSwapPrompt(actor, longRestClasses) {
  log(3, 'Handling long rest swap prompt.', { actorId: actor.id, longRestClasses });
  const isPromptDisabled = game.settings.get(MODULE.ID, SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT);
  if (isPromptDisabled) {
    const classNames = [...longRestClasses.cantripSwapping.map((c) => c.name), ...longRestClasses.spellSwapping.map((c) => c.name)];
    const uniqueClassNames = [...new Set(classNames)];
    ui.notifications.info(game.i18n.format('SPELLBOOK.LongRest.SwapAvailableNotification', { name: actor.name, classes: uniqueClassNames.join(', ') }));
    log(3, 'Long rest prompt disabled, showing notification.', { actorId: actor.id, classes: uniqueClassNames });
    return;
  }
  const dialogResult = await showLongRestSwapDialog(longRestClasses);
  log(3, 'Long rest dialog result.', { actorId: actor.id, dialogResult });
  if (dialogResult === 'confirm') {
    const spellBook = new SpellBook(actor);
    spellBook.render(true);
    log(3, 'Spellbook opened from long rest prompt.', { actorId: actor.id });
  }
}

/**
 * Show the long rest swap dialog with dynamic content.
 * @param {LongRestClasses} longRestClasses - Object containing arrays of classes needing swapping mechanics
 * @returns {Promise<string>} The dialog result action ('confirm' or 'cancel')
 */
async function showLongRestSwapDialog(longRestClasses) {
  log(3, 'Showing long rest swap dialog.', { longRestClasses });
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
 * @param {Application} app - The journal sidebar application
 * @returns {void}
 */
function addJournalSpellBookButton(app) {
  log(3, 'Adding journal spell book buttons.');
  if (!game.user.isGM) {
    log(3, 'User is not GM, skipping journal buttons.');
    return;
  }
  const footer = app.element.querySelector('.directory-footer');
  if (!footer) {
    log(3, 'No directory footer found.');
    return;
  }
  if (footer.querySelector('.spell-book-buttons-container')) {
    log(3, 'Spell book buttons already exist.');
    return;
  }
  const container = createJournalButtonsContainer();
  footer.appendChild(container);
  log(3, 'Journal spell book buttons added.');
}

/**
 * Create the container and buttons for journal sidebar.
 * @returns {HTMLElement} Container element with spell book buttons
 */
function createJournalButtonsContainer() {
  log(3, 'Creating journal buttons container.');
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
 * @returns {HTMLElement} Button element for opening spell list manager
 */
function createJournalManagerButton() {
  log(3, 'Creating journal manager button.');
  const managerButton = document.createElement('button');
  managerButton.classList.add('spell-book-journal-button');
  managerButton.innerHTML = `<i class="fas fa-bars-progress"></i> ${game.i18n.localize('SPELLBOOK.UI.JournalButton')}`;
  const manager = new SpellListManager();
  managerButton.addEventListener('click', () => {
    log(3, 'Journal manager button clicked.');
    manager.render(true);
  });
  return managerButton;
}

/**
 * Create the analytics dashboard button for journal sidebar.
 * @returns {HTMLElement} Button element for opening analytics dashboard
 */
function createJournalAnalyticsButton() {
  log(3, 'Creating journal analytics button.');
  const analyticsButton = document.createElement('button');
  analyticsButton.classList.add('spell-book-analytics-button');
  analyticsButton.innerHTML = `<i class="fas fa-chart-bar"></i> ${game.i18n.localize('SPELLBOOK.Analytics.OpenDashboard')}`;
  const dashboard = new AnalyticsDashboard({ viewMode: 'gm', userId: game.user.id });
  analyticsButton.addEventListener('click', () => {
    log(3, 'Analytics button clicked.');
    dashboard.render(true);
  });
  analyticsButton.addEventListener('contextmenu', async (event) => {
    log(3, 'Analytics button right-clicked, toggling tracking.');
    event.preventDefault();
    event.stopPropagation();
    const currentSetting = game.settings.get(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING);
    const newSetting = !currentSetting;
    try {
      await game.settings.set(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING, newSetting);
      analyticsButton.style.opacity = newSetting ? '1' : '0.6';
      analyticsButton.title = newSetting ? game.i18n.localize('SPELLBOOK.Analytics.TrackingEnabled') : game.i18n.localize('SPELLBOOK.Analytics.TrackingDisabled');
      log(3, 'Spell usage tracking toggled.', { newSetting });
    } catch (error) {
      log(1, 'Error toggling spell usage tracking.', { error });
    }
  });
  const trackingEnabled = game.settings.get(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING);
  analyticsButton.style.opacity = trackingEnabled ? '1' : '0.6';
  analyticsButton.title = trackingEnabled ? game.i18n.localize('SPELLBOOK.Analytics.TrackingEnabled') : game.i18n.localize('SPELLBOOK.Analytics.TrackingDisabled');
  return analyticsButton;
}
