import { GMSpellListManager } from '../apps/gm-spell-list-manager.mjs';
import { PlayerSpellBook } from '../apps/player-spell-book.mjs';
import { SpellAnalyticsDashboard } from '../apps/spell-analytics-dashboard.mjs';
import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
import { preloadSpellDataForActor } from '../helpers/spell-cache.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import { log } from '../logger.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';

/**
 * Register hooks related to DnD5e system integration
 */
export function registerDnD5eIntegration() {
  try {
    if (!MODULE.ISV13) {
      Hooks.on('renderActorSheet5e', addSpellbookButton);
      Hooks.on('renderSidebarTab', addJournalSpellBookButton);
    } else {
      Hooks.on('renderActorSheetV2', addSpellbookButton);
      Hooks.on('activateJournalDirectory', addJournalSpellBookButtonV13);
    }
    Hooks.on('dnd5e.restCompleted', handleRestCompleted);
    log(3, 'Registering DnD5e system integration');
  } catch (error) {
    log(1, 'Error registering DnD5e integration:', error);
  }
}

/**
 * Add spellbook button to character sheet
 */
function addSpellbookButton(app, html, data) {
  const actor = data.actor;
  if (!canAddSpellbookButton(actor, html)) return;
  preloadSpellDataForActor(actor).catch((error) => {
    log(1, `Failed to preload spell data for ${actor.name}:`, error);
  });
  const htmlElement = genericUtils.getHtmlElement(html);
  let spellsTab, controlsList;
  if (MODULE.ISV13) {
    spellsTab = htmlElement.querySelector('section.tab[data-tab="spells"]');
    if (!spellsTab) return;
    controlsList = spellsTab.querySelector('item-list-controls search ul.controls');
  } else {
    spellsTab = htmlElement.querySelector('.tab.spells');
    if (!spellsTab) return;
    controlsList = spellsTab.querySelector('ul.controls');
  }
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
 */
async function handleRestCompleted(actor, result, config) {
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
      if (needsCantripSwap) {
        const spellcastingClasses = actor.items.filter((i) => i.type === 'class' && i.system.spellcasting?.progression !== 'none');
        const classItem = spellcastingClasses.find((c) => c.system.identifier?.toLowerCase() === classIdentifier || c.name.toLowerCase() === classIdentifier);
        const className = classItem?.name || classIdentifier;
        longRestClasses.cantripSwapping.push({ identifier: classIdentifier, name: className });
      }
      if (needsSpellSwap) {
        const spellcastingClasses = actor.items.filter((i) => i.type === 'class' && i.system.spellcasting?.progression !== 'none');
        const classItem = spellcastingClasses.find((c) => c.system.identifier?.toLowerCase() === classIdentifier || c.name.toLowerCase() === classIdentifier);
        const className = classItem?.name || classIdentifier;
        longRestClasses.spellSwapping.push({ identifier: classIdentifier, name: className });
      }
      if (needsSpellSwap) {
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
  }
  if (!hasAnyLongRestMechanics) log(3, `No classes on ${actor.name} require long rest mechanics, skipping`);
}

/**
 * Add spellbook button to journal sidebar footer (v12)
 */
function addJournalSpellBookButton(app, html, data) {
  if (app.tabName !== 'journal') return;
  if (!game.settings.get(MODULE.ID, SETTINGS.ENABLE_JOURNAL_BUTTON)) return;
  if (!game.user.isGM) return;
  const footer = html.find('.directory-footer');
  if (!footer.length) return;
  if (footer.find('.spell-book-buttons-container').length) return;
  const container = createJournalButtonsContainer();
  footer[0].appendChild(container);
}

/**
 * Add spellbook button to journal sidebar footer (v13)
 */
function addJournalSpellBookButtonV13(app) {
  if (!game.settings.get(MODULE.ID, SETTINGS.ENABLE_JOURNAL_BUTTON)) return;
  if (!game.user.isGM) return;
  const htmlElement = genericUtils.getHtmlElement(app.element);
  const footer = htmlElement.querySelector('.directory-footer');
  if (!footer) return;
  if (footer.querySelector('.spell-book-buttons-container')) return;
  const container = createJournalButtonsContainer();
  footer.appendChild(container);
}

/**
 * Create the container and buttons for journal sidebar
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
 */
function createJournalManagerButton() {
  const managerButton = document.createElement('button');
  managerButton.classList.add('spell-book-journal-button');
  managerButton.innerHTML = `<i class="fas fa-bars-progress"></i> ${game.i18n.localize('SPELLBOOK.UI.JournalButton')}`;
  const manager = new GMSpellListManager();
  managerButton.addEventListener('click', () => {
    manager.render(true);
  });
  return managerButton;
}

/**
 * Create the analytics button
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
    }
  });
  const trackingEnabled = game.settings.get(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING);
  analyticsButton.style.opacity = trackingEnabled ? '1' : '0.6';
  analyticsButton.title = trackingEnabled ? game.i18n.localize('SPELLBOOK.Analytics.TrackingEnabled') : game.i18n.localize('SPELLBOOK.Analytics.TrackingDisabled');
  return analyticsButton;
}

/**
 * Handle the long rest swap prompt for all applicable classes
 */
async function handleLongRestSwapPrompt(actor, longRestClasses) {
  const isPromptDisabled = game.settings.get(MODULE.ID, SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT);
  if (isPromptDisabled) {
    log(3, `Long rest swap prompt disabled by user preference, flag already set`);
    const classNames = [...longRestClasses.cantripSwapping.map((c) => c.name), ...longRestClasses.spellSwapping.map((c) => c.name)];
    const uniqueClassNames = [...new Set(classNames)];
    ui.notifications.info(game.i18n.format('SPELLBOOK.LongRest.SwapAvailableNotification', { name: actor.name, classes: uniqueClassNames.join(', ') }));
    return;
  }
  const dialogResult = await showLongRestSwapDialog(longRestClasses);
  if (dialogResult === 'confirm') {
    const spellBook = new PlayerSpellBook(actor);
    spellBook.render(true);
  }
}

/**
 * Show the long rest swap dialog with dynamic content
 */
async function showLongRestSwapDialog(longRestClasses) {
  const renderTemplate = MODULE.ISV13 ? foundry?.applications?.handlebars?.renderTemplate : globalThis.renderTemplate;
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
 * Check if spellbook button can be added
 */
function canAddSpellbookButton(actor, html) {
  const canCast = discoveryUtils.canCastSpells(actor);
  if (!canCast) return false;
  const htmlElement = genericUtils.getHtmlElement(html);
  let hasSpellsTab;
  if (MODULE.ISV13) hasSpellsTab = htmlElement.querySelector('section.tab[data-tab="spells"]');
  else hasSpellsTab = htmlElement.querySelector('.tab.spells');
  if (!hasSpellsTab) return false;
  return true;
}

/**
 * Create spellbook button element
 */
function createSpellBookButton(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'unbutton filter-control always-interactive spell-book-button';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = '<i class="fas fa-book-open"></i>';
  button.addEventListener('click', onSpellBookButtonClick.bind(null, actor));
  return button;
}

/**
 * Handle spellbook button click
 */
async function onSpellBookButtonClick(actor, event) {
  event.preventDefault();
  const classRules = actor.getFlag(MODULE.ID, FLAGS.CLASS_RULES) || {};
  const hasLongRestSwapping = Object.values(classRules).some((rules) => rules.cantripSwapping === 'longRest' || rules.spellSwapping === 'longRest');
  if (hasLongRestSwapping) {
    const longRestFlagValue = actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED);
    const swapTracking = actor.getFlag(MODULE.ID, FLAGS.SWAP_TRACKING) || {};
    const cantripSwapTracking = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING) || {};
    let hasCompletedSwaps = false;
    for (const [classId, tracking] of Object.entries(cantripSwapTracking)) {
      if (tracking.longRest?.hasLearned && tracking.longRest?.hasUnlearned) {
        hasCompletedSwaps = true;
        break;
      }
    }
    if (hasCompletedSwaps) {
      const spellManager = new SpellManager(actor);
      await spellManager.resetSwapTracking();
    }
    if (longRestFlagValue === undefined || longRestFlagValue === null) actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
  }
  const spellBook = new PlayerSpellBook(actor);
  spellBook.render(true);
}
