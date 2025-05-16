import { PlayerSpellBook } from '../apps/player-spell-book.mjs';
import { CANTRIP_RULES, FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import { SpellManager } from '../helpers/spell-preparation.mjs';
import { log } from '../logger.mjs';

/**
 * Register hooks related to DnD5e system integration
 * This function handles all system-specific hooks and integration points
 */
export function registerDnD5eIntegration() {
  try {
    // Set up character sheet button integration for standard 5e sheets
    Hooks.on('renderActorSheet5e', addSpellbookButton);

    // Add long rest integration for wizard cantrip swapping
    Hooks.on('dnd5e.restCompleted', handleRestCompleted);

    log(3, 'Registering DnD5e system integration');
  } catch (error) {
    log(1, 'Error registering DnD5e integration:', error);
  }
}

async function handleRestCompleted(actor, result, config) {
  try {
    // Only proceed if this was a long rest
    if (!result.longRest) return;

    // Check if the actor is a wizard
    const wizardClass = actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === 'wizard');
    if (!wizardClass) return;

    log(3, `Long rest completed for wizard ${actor.name}, checking cantrip rules`);

    // Create spell manager to check rules
    const spellManager = new SpellManager(actor);

    // Get the rules version
    const rulesVersion = spellManager.getSettings().rules;

    // If not using long rest swap rules, skip prompt
    if (rulesVersion !== CANTRIP_RULES.MODERN_LONG_REST) {
      log(3, `Wizard ${actor.name} uses ${rulesVersion} rules, skipping cantrip swap prompt`);
      return;
    }

    // Reset any previous cantrip swap tracking data
    await spellManager.resetSwapTracking();
    log(3, 'Reset swap tracking data before prompting for new swap');

    // Check if the swap prompt is disabled by user preference
    const isPromptDisabled = game.settings.get(MODULE.ID, SETTINGS.DISABLE_CANTRIP_SWAP_PROMPT);

    // If prompt is disabled, silently set the flag and exit
    if (isPromptDisabled) {
      log(3, `Cantrip swap prompt disabled by user preference for ${actor.name}, setting flag silently`);
      await actor.setFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING, true);

      // Optionally show a brief notification that swap is available
      ui.notifications.info(game.i18n.format('SPELLBOOK.Cantrips.SwapAvailableNotification', { name: actor.name }));
      return;
    }

    const dialogResult = await foundry.applications.api.DialogV2.wait({
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

    if (dialogResult === 'confirm') {
      // Set flag to indicate long rest state for cantrip swapping
      await actor.setFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING, true);

      // Open spellbook (it will detect the flag)
      const spellBook = new PlayerSpellBook(actor);
      spellBook.render(true);
    }
  } catch (error) {
    log(1, `Error in long rest completed hook: ${error.message}`);
  }
}

function addSpellbookButton(app, html, data) {
  try {
    const actor = data.actor;

    // Only add button for characters that can cast spells
    if (!canAddSpellbookButton(actor, html)) {
      return;
    }

    // Find the spells tab and controls list
    const spellsTab = html[0].querySelector('.tab.spells');
    const controlsList = spellsTab.querySelector('ul.controls');
    if (!controlsList) {
      log(2, `No controls list found in ${actor.name}'s character sheet`);
      return;
    }

    // Create button element
    const button = createSpellBookButton(actor);

    // Create list item and add button
    const listItem = document.createElement('li');
    listItem.appendChild(button);

    // Append to the sheet controls
    controlsList.appendChild(listItem);

    log(3, `Added spell book button to ${actor.name}'s character sheet`);
  } catch (error) {
    log(1, `Error adding spell book button to character sheet: ${error.message}`);
  }
}

function canAddSpellbookButton(actor, html) {
  // Only add button for characters that can cast spells
  if (!discoveryUtils.canCastSpells(actor)) {
    return false;
  }

  // Only target sheets with a spells tab
  const spellsTab = html[0].querySelector('.tab.spells');
  if (!spellsTab) {
    return false;
  }

  return true;
}

function createSpellBookButton(actor) {
  // Create the button
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'unbutton spell-book-button interface-only';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = '<i class="fas fa-book-open"></i>';

  // Add click event listener
  button.addEventListener('click', onSpellBookButtonClick.bind(null, actor));

  return button;
}

async function onSpellBookButtonClick(actor, ev) {
  ev.preventDefault();
  try {
    // Check if actor is a wizard with the longRest rule and can swap cantrips
    const wizardClass = actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === 'wizard');

    if (wizardClass) {
      // Create a spell manager to check if this is a wizard using longRest rules
      const spellManager = new SpellManager(actor);
      const rulesVersion = spellManager.getSettings().rules;

      // If using long rest rules, check if we need to set the swap flag
      if (rulesVersion === CANTRIP_RULES.MODERN_LONG_REST) {
        // Check the exact value of the long rest flag
        const longRestFlagValue = actor.getFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING);

        // Check if there's existing swap data that might block a new swap
        const swapData = actor.getFlag(MODULE.ID, FLAGS.CANTRIP_SWAP_TRACKING)?.longRest;
        const hasCompletedSwap = swapData && swapData.hasLearned && swapData.hasUnlearned;

        // If there's swap data but it represents a completed swap, clear it
        if (hasCompletedSwap) {
          await spellManager.resetSwapTracking();
          log(3, `Cleared completed swap data for ${actor.name}`);
        }

        // ONLY set the flag if it's undefined or null, NOT if it's explicitly false
        if (longRestFlagValue === undefined || longRestFlagValue === null) {
          await actor.setFlag(MODULE.ID, FLAGS.WIZARD_LONG_REST_TRACKING, true);
          log(3, `Setting long rest flag for ${actor.name} when opening spellbook`);
        } else {
          // Log the current value for debugging
          log(3, `Not changing long rest flag for ${actor.name}, current value: ${longRestFlagValue}`);
        }
      }
    }

    // Open the spellbook
    const spellBook = new PlayerSpellBook(actor);
    spellBook.render(true);
  } catch (error) {
    log(1, `Error opening spell book: ${error.message}`);
  }
}
