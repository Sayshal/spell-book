/**
 * Integration with the D&D5e system
 * Adds rest features and system-specific interactions
 * @module spell-book/integrations/dnd5e
 */

import { MODULE, SETTINGS } from '../constants.mjs';
import * as discoveryUtils from '../helpers/spell-discovery.mjs';
import { log } from '../logger.mjs';

/**
 * Register hooks related to DnD5e system integration
 * This function handles all system-specific hooks and integration points
 */
export function registerDnD5eIntegration() {
  try {
    log(3, 'Registering DnD5e system integration');

    // Register rest completion hook if enabled
    if (game.settings.get(MODULE.ID, SETTINGS.ENABLE_REST_PROMPT)) {
      Hooks.on('dnd5e.restCompleted', onRestCompleted);
      log(3, 'Registered rest completion hook');
    }

    // Register item creation hooks for spell acquisition
    Hooks.on('createItem', onItemCreated);
  } catch (error) {
    log(1, 'Error registering DnD5e integration:', error);
  }
}

/**
 * Handler for rest completion
 * Prompts player to prepare spells after a long rest if appropriate
 * @param {Actor5e} actor - The actor completing a rest
 * @param {Object} restData - Rest result data
 */
function onRestCompleted(actor, restData) {
  try {
    // Only proceed if this is a long rest and the actor can cast spells
    if (!restData.longRest || !discoveryUtils.canCastSpells(actor)) return;

    // Check if the actor has class levels with prepared casting
    const hasPreparedCasting = actor.items.some((item) => item.type === 'class' && item.system?.spellcasting?.preparation?.mode === 'prepared');

    if (!hasPreparedCasting) return;

    log(3, `Prompting ${actor.name} to update prepared spells after long rest`);

    // Show dialog to prompt for spell preparation
    showPrepareSpellsDialog(actor);
  } catch (error) {
    log(1, 'Error processing rest completion:', error);
  }
}

/**
 * Shows an improved dialog for preparing spells after rest
 * @param {Actor5e} actor - The actor who completed the rest
 */
function showPrepareSpellsDialog(actor) {
  try {
    // Calculate spell preparation stats
    const spellcastingClass = discoveryUtils.findSpellcastingClass(actor);
    let maxPrepared = 0;
    let className = 'spellcasting class';

    if (spellcastingClass) {
      const spellcastingAbility = spellcastingClass.system?.spellcasting?.ability;
      if (spellcastingAbility) {
        const abilityMod = actor.system.abilities[spellcastingAbility]?.mod || 0;
        const classLevel = spellcastingClass.system.levels || actor.system.details.level;
        maxPrepared = Math.max(1, classLevel + abilityMod);
        className = spellcastingClass.name;
      }
    }

    // Build enhanced dialog content with helpful information
    const dialogContent = `
      <h2>${game.i18n.localize('SPELLBOOK.Rest.DialogTitle')}</h2>
      <p>${game.i18n.format('SPELLBOOK.Rest.UpdateSpells', { name: actor.name })}</p>
      <p>As a ${className}, you can prepare up to <strong>${maxPrepared}</strong> spells.</p>
      <hr>
      <div class="dialog-buttons">
        <button class="open-spellbook"><i class="fas fa-book-open"></i> ${game.i18n.localize('SPELLBOOK.Rest.OpenSpellbook')}</button>
        <button class="keep-spells"><i class="fas fa-times"></i> ${game.i18n.localize('SPELLBOOK.Rest.KeepSpells')}</button>
      </div>
    `;

    new Dialog(
      {
        title: game.i18n.localize('SPELLBOOK.Rest.DialogTitle'),
        content: dialogContent,
        buttons: {
          yes: {
            icon: '<i class="fas fa-book-open"></i>',
            label: game.i18n.localize('SPELLBOOK.Rest.OpenSpellbook'),
            callback: () => openSpellBookForActor(actor)
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize('SPELLBOOK.Rest.KeepSpells')
          }
        },
        default: 'yes'
      },
      {
        classes: ['dialog', 'spell-preparation-dialog']
      }
    ).render(true);
  } catch (error) {
    log(1, 'Error showing spell preparation dialog:', error);
  }
}

/**
 * Opens the spell book application for an actor
 * @param {Actor5e} actor - The actor to show the spell book for
 */
function openSpellBookForActor(actor) {
  try {
    // Get the PlayerSpellBook class
    const PlayerSpellBook = game.modules.get(MODULE.ID)?.api?.PlayerSpellBook;

    if (PlayerSpellBook) {
      new PlayerSpellBook(actor).render(true);
    } else {
      // Fallback to module-scoped class
      if (MODULE.PlayerSpellBook) {
        new MODULE.PlayerSpellBook(actor).render(true);
      } else {
        throw new Error('PlayerSpellBook class not found');
      }
    }
  } catch (error) {
    log(1, 'Failed to open spell book:', error);
  }
}

/**
 * Handler for item creation
 * @param {Item5e} item - The item that was created
 * @param {Object} options - Creation options
 * @param {string} userId - The ID of the user who created the item
 */
function onItemCreated(item, options, userId) {
  try {
    // Only process if this is our user and it's a spell
    if (game.user.id !== userId || item.type !== 'spell') return;

    // Only process if the item has a parent actor that's a character
    const actor = item.parent;
    if (!actor || actor.type !== 'character') return;

    log(3, `New spell "${item.name}" added to ${actor.name}`);
  } catch (error) {
    log(1, 'Error handling item creation:', error);
  }
}
