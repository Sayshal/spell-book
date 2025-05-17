import { GMSpellListManager } from '../apps/gm-spell-list-manager.mjs';
import { PlayerSpellBook } from '../apps/player-spell-book.mjs';
import { CANTRIP_RULES, FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import * as genericUtils from '../helpers/generic-utils.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import { SpellManager } from '../helpers/spell-preparation.mjs';
import { log } from '../logger.mjs';

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
  try {
    const actor = data.actor;
    if (!canAddSpellbookButton(actor, html)) return;

    const spellsTab = html[0].querySelector('.tab.spells');
    const controlsList = spellsTab.querySelector('ul.controls');
    if (!controlsList) return;

    const button = createSpellBookButton(actor);
    const listItem = document.createElement('li');
    listItem.appendChild(button);
    controlsList.appendChild(listItem);

    log(3, `Added spell book button to ${actor.name}'s character sheet`);
  } catch (error) {
    log(1, `Error adding spell book button:`, error);
  }
}

/**
 * Handle long rest completion for wizard cantrip swapping
 */
async function handleRestCompleted(actor, result, config) {
  try {
    if (!result.longRest) return;
    if (!genericUtils.isWizard(actor)) return;

    log(3, `Long rest completed for wizard ${actor.name}, checking cantrip rules`);
    const spellManager = new SpellManager(actor);
    const rulesVersion = spellManager.getSettings().rules;

    if (rulesVersion !== CANTRIP_RULES.MODERN_LONG_REST) {
      log(3, `Wizard ${actor.name} uses ${rulesVersion} rules, skipping cantrip swap prompt`);
      return;
    }

    await spellManager.resetSwapTracking();
    await handleCantripSwapPrompt(actor);
  } catch (error) {
    log(1, `Error in long rest completed hook:`, error);
  }
}

/**
 * Add spellbook button to journal sidebar footer
 */
function addJournalSpellBookButton(app, html, data) {
  try {
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
  } catch (error) {
    log(1, 'Error adding Spell Book button to Journal sidebar:', error);
  }
}

/**
 * Handle the cantrip swap prompt after a long rest
 */
async function handleCantripSwapPrompt(actor) {
  const isPromptDisabled = game.settings.get(MODULE.ID, SETTINGS.DISABLE_CANTRIP_SWAP_PROMPT);

  if (isPromptDisabled) {
    log(3, `Cantrip swap prompt disabled by user preference, setting flag silently`);
    await actor.setFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING, true);
    ui.notifications.info(game.i18n.format('SPELLBOOK.Cantrips.SwapAvailableNotification', { name: actor.name }));
    return;
  }

  const dialogResult = await showCantripSwapDialog();
  if (dialogResult === 'confirm') {
    await actor.setFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING, true);
    const spellBook = new PlayerSpellBook(actor);
    spellBook.render(true);
  }
}

/**
 * Show the cantrip swap dialog
 */
async function showCantripSwapDialog() {
  return foundry.applications.api.DialogV2.wait({
    title: game.i18n.localize('SPELLBOOK.Wizard.SwapCantripTitle'),
    content: `<p>${game.i18n.localize('SPELLBOOK.Wizard.SwapCantripPrompt')}</p>`,
    buttons: [
      {
        icon: 'fas fa-book-spells',
        label: game.i18n.localize('SPELLBOOK.Wizard.SwapCantripConfirm'),
        action: 'confirm',
        className: 'dialog-button'
      },
      {
        icon: 'fas fa-times',
        label: game.i18n.localize('SPELLBOOK.Wizard.SwapCantripCancel'),
        action: 'cancel',
        className: 'dialog-button'
      }
    ],
    default: 'cancel'
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
async function onSpellBookButtonClick(actor, ev) {
  ev.preventDefault();
  try {
    if (genericUtils.isWizard(actor)) {
      const spellManager = new SpellManager(actor);
      const rulesVersion = spellManager.getSettings().rules;

      if (rulesVersion === CANTRIP_RULES.MODERN_LONG_REST) {
        const longRestFlagValue = actor.getFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING);
        const swapData = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING)?.longRest;
        const hasCompletedSwap = swapData && swapData.hasLearned && swapData.hasUnlearned;

        if (hasCompletedSwap) {
          await spellManager.resetSwapTracking();
        }

        if (longRestFlagValue === undefined || longRestFlagValue === null) {
          await actor.setFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING, true);
        }
      }
    }

    const spellBook = new PlayerSpellBook(actor);
    spellBook.render(true);
  } catch (error) {
    log(1, `Error opening spell book:`, error);
  }
}
