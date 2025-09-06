import { SpellAnalyticsDashboard, SpellBook, SpellListManager } from '../apps/_module.mjs';
import { ASSETS, FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { SpellManager } from '../managers/_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Register hooks related to DnD5e system integration
 */
export function registerDnD5eIntegration() {
  try {
    Hooks.on('renderActorSheetV2', addSpellbookButton);
    Hooks.on('activateJournalDirectory', addJournalSpellBookButton);
    Hooks.on('dnd5e.restCompleted', handleRestCompleted);
    log(3, 'Registering DnD5e system integration');
  } catch (error) {
    log(1, 'Error registering DnD5e integration:', error);
  }
}

/**
 * Add Spell Book button to character sheet
 * @param {Application} _app The character sheet application instance
 * @param {HTMLElement} html The character sheet HTML element
 * @param {Object} data The sheet data object containing actor information
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
 * Handle long rest completion for all spellcasting classes
 * @param {Actor5e} actor The actor who completed the long rest
 * @param {Object} result The rest result data containing completion status
 * @param {Object} _config The rest configuration options
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
 * Add Spell Book button to journal sidebar footer
 * @param {Application} app The journal sidebar application
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
 * Create the container and buttons for journal sidebar
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
 * Create the spell list manager button
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
 * Create the analytics button
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

/**
 * Handle the long rest swap prompt for all applicable classes
 * @param {Actor5e} actor The actor who completed the long rest
 * @param {Object} longRestClasses Object containing arrays of classes needing cantrip or spell swapping
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
 * Show the long rest swap dialog with dynamic content
 * @param {Object} longRestClasses Object containing arrays of classes needing swapping mechanics
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
 * Check if Spell Book button can be added
 * @param {Actor5e} actor The actor to check for spellcasting capabilities
 * @param {HTMLElement} html The character sheet HTML element
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
 * Create Spell Book button element
 * @param {Actor5e} actor The actor this button will open a spell book for
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
 * Handle Spell Book button click
 * @param {Actor5e} actor The actor whose spell book should be opened
 * @param {Event} event The click event
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
