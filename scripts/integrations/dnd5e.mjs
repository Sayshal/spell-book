import { GMSpellListManager } from '../apps/gm-spell-list-manager.mjs';
import { PlayerSpellBook } from '../apps/player-spell-book.mjs';
import { FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import { log } from '../logger.mjs';
import { SpellManager } from '../managers/spell-manager.mjs';

/**
 * Register hooks related to DnD5e system integration
 */
export function registerDnD5eIntegration() {
  try {
    Hooks.on('renderActorSheet5e', addSpellbookButton);
    Hooks.on('dnd5e.restCompleted', handleRestCompleted);
    Hooks.on('renderSidebarTab', addJournalSpellBookButton);
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
  const spellsTab = html[0].querySelector('.tab.spells');
  const controlsList = spellsTab.querySelector('ul.controls');
  if (!controlsList) return;
  const button = createSpellBookButton(actor);
  const listItem = document.createElement('li');
  listItem.appendChild(button);
  controlsList.appendChild(listItem);
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
        await actor.setFlag(MODULE.ID, FLAGS.SWAP_TRACKING, swapTracking);
        log(3, `Set spell swap flag for class ${classIdentifier}`);
      }
    }
  }
  if (hasAnyLongRestMechanics) {
    await actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
    log(3, `Set long rest completion flag for ${actor.name} - available for all classes that need it`);
    await handleLongRestSwapPrompt(actor, longRestClasses);
  }
  if (!hasAnyLongRestMechanics) log(3, `No classes on ${actor.name} require long rest mechanics, skipping`);
}

/**
 * Add spellbook button to journal sidebar footer
 */
function addJournalSpellBookButton(app, html, data) {
  if (app.tabName !== 'journal') return;
  if (!game.settings.get(MODULE.ID, SETTINGS.ENABLE_JOURNAL_BUTTON)) return;
  if (!game.user.isGM) return;
  const footer = html.find('.directory-footer');
  if (!footer.length) return;
  if (footer.find('.spell-book-journal-button').length) return;
  const button = document.createElement('button');
  button.classList.add('spell-book-journal-button');
  button.innerHTML = `<i class="fas fa-bars-progress"></i> ${game.i18n.localize('SPELLBOOK.UI.JournalButton')}`;
  button.addEventListener('click', () => {
    const manager = new GMSpellListManager();
    manager.render(true);
  });
  footer[0].appendChild(button);
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
  let content = `<div class="long-rest-swap-info">`;
  content += `<p>${game.i18n.localize('SPELLBOOK.LongRest.SwapPromptIntro')}</p>`;
  if (longRestClasses.cantripSwapping.length > 0) {
    content += `<div class="swap-category">`;
    content += `<ul>`;
    for (const classInfo of longRestClasses.cantripSwapping) {
      content += `<li>${game.i18n.format('SPELLBOOK.LongRest.CantripSwappingClass', { className: classInfo.name })}</li>`;
    }
    content += `</ul>`;
    content += `</div>`;
  }
  if (longRestClasses.spellSwapping.length > 0) {
    content += `<div class="swap-category">`;
    content += `<ul>`;
    for (const classInfo of longRestClasses.spellSwapping) {
      content += `<li>${game.i18n.format('SPELLBOOK.LongRest.SpellSwappingClass', { className: classInfo.name })}</li>`;
    }
    content += `</ul>`;
    content += `</div>`;
  }
  content += `</div>`;
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
  return discoveryUtils.canCastSpells(actor) && html[0].querySelector('.tab.spells');
}

/**
 * Create spellbook button element
 */
function createSpellBookButton(actor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'unbutton spell-book-button interface-only';
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
    if (longRestFlagValue === undefined || longRestFlagValue === null) await actor.setFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED, true);
  }
  const spellBook = new PlayerSpellBook(actor);
  spellBook.render(true);
}
