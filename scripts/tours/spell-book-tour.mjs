/**
 * SpellBookTour - Custom Tour Implementation for Spell Book Module
 *
 * Extends Foundry's base Tour class to provide specialized functionality for
 * guiding users through Spell Book features. This tour handler manages:
 * - Opening and closing Spell Book applications
 * - Navigating between spell book tabs
 * - Opening Spell List Manager and other dialogs
 * - Ensuring proper UI state for tour steps
 *
 * @extends {foundry.nue.Tour}
 * @module Tours/SpellBookTour
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import { SpellBook } from '../apps/player-spell-book.mjs';
import { log } from '../logger.mjs';

export default class SpellBookTour extends foundry.nue.Tour {
  /**
   * Currently opened application for this tour step.
   * @type {foundry.applications.api.ApplicationV2|null}
   */
  focusedApp = null;

  /**
   * Actor being used for this tour demonstration.
   * @type {Actor|null}
   */
  demoActor = null;

  /**
   * Previous tab before tour started (for restoration).
   * @type {string|null}
   */
  previousTab = null;

  /* -------------------------------------------- */

  /** @override */
  get canStart() {
    // Ensure we're in a world (not setup screen) and have game loaded
    if (game.view !== 'game') return false;
    if (!game.ready) return false;
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  async start() {
    // Find a suitable actor for the demo
    this.demoActor = this.#findDemoActor();

    if (!this.demoActor && this.#requiresActor()) {
      ui.notifications.warn(game.i18n.localize('SPELLBOOK.Tours.NoSuitableActor'));
      return;
    }

    return super.start();
  }

  /* -------------------------------------------- */

  /** @override */
  async _preStep() {
    await super._preStep();
    const step = this.currentStep;

    log(3, `SpellBookTour | Processing pre-step: ${step.id}`, { step });

    // Handle opening SpellBook application
    if (step.openSpellBook) {
      await this.#openSpellBook(step.openSpellBook);
    }

    // Handle opening Spell List Manager
    if (step.openSpellListManager) {
      await this.#openSpellListManager();
    }

    // Handle party spells dialog
    if (step.openPartySpells) {
      await this.#openPartySpells();
    }

    // Handle spell book settings
    if (step.openSpellBookSettings) {
      await this.#openSpellBookSettings();
    }

    // Handle tab activation within SpellBook
    if (step.spellBookTab && this.focusedApp instanceof SpellBook) {
      await this.#activateSpellBookTab(step.spellBookTab);
    }

    // Small delay to ensure UI is ready
    if (step.openSpellBook || step.spellBookTab || step.openSpellListManager) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _postStep() {
    await super._postStep();

    // Optionally close apps when specific steps are complete
    const step = this.currentStep;
    if (step?.closeAfterStep && this.focusedApp) {
      await this.focusedApp.close();
      this.focusedApp = null;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async complete() {
    // Clean up any open applications
    if (this.focusedApp && !this.focusedApp.id.includes('settings')) {
      // Don't auto-close to let users explore
      // await this.focusedApp.close();
    }

    this.focusedApp = null;
    this.demoActor = null;

    return super.complete();
  }

  /* -------------------------------------------- */

  /** @override */
  async exit() {
    // Clean up focused app if needed
    this.focusedApp = null;
    this.demoActor = null;

    return super.exit();
  }

  /* -------------------------------------------- */

  /** @override */
  _getTargetElement(selector) {
    // First try standard DOM query
    let element = document.querySelector(selector);
    if (element) return element;

    // Try within focused application if it exists
    if (this.focusedApp?.element) {
      element = this.focusedApp.element[0]?.querySelector(selector)
                || this.focusedApp.element.querySelector?.(selector);
    }

    return element;
  }

  /* -------------------------------------------- */
  /*  Private Helper Methods                      */
  /* -------------------------------------------- */

  /**
   * Find a suitable actor for tour demonstrations.
   * Prefers player characters that the user owns.
   * @returns {Actor|null} A suitable actor or null
   * @private
   */
  #findDemoActor() {
    // First try user's assigned character
    if (game.user.character) {
      const hasSpells = Object.keys(game.user.character.spellcastingClasses || {}).length > 0;
      if (hasSpells) return game.user.character;
    }

    // Try to find any actor the user owns with spellcasting
    const ownedActors = game.actors.filter(a => a.isOwner && a.type === 'character');
    for (const actor of ownedActors) {
      const hasSpells = Object.keys(actor.spellcastingClasses || {}).length > 0;
      if (hasSpells) return actor;
    }

    // Fallback to any owned actor
    return ownedActors[0] || null;
  }

  /* -------------------------------------------- */

  /**
   * Check if this tour requires an actor to function.
   * @returns {boolean} Whether an actor is required
   * @private
   */
  #requiresActor() {
    // Check if any step requires opening spell book
    return this.config.steps.some(step =>
      step.openSpellBook ||
      step.openSpellBookSettings ||
      step.openPartySpells
    );
  }

  /* -------------------------------------------- */

  /**
   * Open the SpellBook application for demonstration.
   * @param {string|object} config - Actor identifier or configuration
   * @returns {Promise<SpellBook|null>} The opened SpellBook instance
   * @private
   */
  async #openSpellBook(config) {
    let actor = null;

    // Handle different config types
    if (typeof config === 'string') {
      if (config === 'first' || config === 'demo') {
        actor = this.demoActor;
      } else {
        actor = game.actors.get(config);
      }
    } else if (config?.actorId) {
      actor = game.actors.get(config.actorId);
    } else {
      actor = this.demoActor;
    }

    if (!actor) {
      log(2, 'SpellBookTour | Could not find suitable actor for spell book demo');
      return null;
    }

    // Check if SpellBook is already open for this actor
    const existingApp = Object.values(ui.windows).find(app =>
      app instanceof SpellBook && app.actor?.id === actor.id
    );

    if (existingApp) {
      this.focusedApp = existingApp;
      existingApp.bringToFront();
      log(3, 'SpellBookTour | Using existing SpellBook instance');
      return existingApp;
    }

    // Create and render new SpellBook
    try {
      const spellBook = new SpellBook(actor);
      await spellBook.render(true);
      this.focusedApp = spellBook;
      log(3, 'SpellBookTour | Opened new SpellBook instance');
      return spellBook;
    } catch (error) {
      log(1, 'SpellBookTour | Error opening SpellBook:', error);
      return null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Open the Spell List Manager application.
   * @returns {Promise<void>}
   * @private
   */
  async #openSpellListManager() {
    try {
      // Dynamically import to avoid circular dependencies
      const { SpellListManager } = await import('../apps/_module.mjs');

      // Check if already open
      const existingApp = Object.values(ui.windows).find(app =>
        app.constructor.name === 'SpellListManager'
      );

      if (existingApp) {
        existingApp.bringToFront();
        this.focusedApp = existingApp;
        return;
      }

      // Open new instance
      const manager = new SpellListManager();
      await manager.render(true);
      this.focusedApp = manager;
      log(3, 'SpellBookTour | Opened Spell List Manager');
    } catch (error) {
      log(2, 'SpellBookTour | Could not open Spell List Manager:', error);
    }
  }

  /* -------------------------------------------- */

  /**
   * Open the Party Spells coordinator.
   * @returns {Promise<void>}
   * @private
   */
  async #openPartySpells() {
    if (!this.demoActor) return;

    try {
      const { PartyCoordinator } = await import('../apps/_module.mjs');
      const { PartyMode } = await import('../managers/_module.mjs');

      const primaryGroup = PartyMode.getPrimaryGroupForActor(this.demoActor);
      if (!primaryGroup) {
        log(2, 'SpellBookTour | No party group found for actor');
        return;
      }

      const partyActors = PartyMode.getPartyActors(primaryGroup);
      if (partyActors.length === 0) {
        log(2, 'SpellBookTour | No party actors found');
        return;
      }

      const coordinator = new PartyCoordinator(partyActors, this.demoActor, primaryGroup);
      await coordinator.render(true);
      this.focusedApp = coordinator;
      log(3, 'SpellBookTour | Opened Party Coordinator');
    } catch (error) {
      log(2, 'SpellBookTour | Could not open Party Coordinator:', error);
    }
  }

  /* -------------------------------------------- */

  /**
   * Open the SpellBook settings dialog.
   * @returns {Promise<void>}
   * @private
   */
  async #openSpellBookSettings() {
    if (!this.demoActor) return;

    try {
      const { SpellBookSettings } = await import('../dialogs/_module.mjs');

      const settings = new SpellBookSettings(this.demoActor, {
        parentApp: this.focusedApp
      });
      await settings.render(true);
      log(3, 'SpellBookTour | Opened SpellBook Settings');
    } catch (error) {
      log(2, 'SpellBookTour | Could not open SpellBook Settings:', error);
    }
  }

  /* -------------------------------------------- */

  /**
   * Activate a specific tab within the SpellBook application.
   * @param {string} tabId - The tab identifier to activate
   * @private
   */
  async #activateSpellBookTab(tabId) {
    if (!(this.focusedApp instanceof SpellBook)) {
      log(2, 'SpellBookTour | Cannot activate tab - SpellBook not open');
      return;
    }

    try {
      // Store previous tab for potential restoration
      this.previousTab = this.focusedApp.tabGroups?.['spellbook-tabs'];

      // Change to the specified tab
      await this.focusedApp.changeTab(tabId, 'spellbook-tabs');
      log(3, `SpellBookTour | Activated tab: ${tabId}`);
    } catch (error) {
      log(2, 'SpellBookTour | Error activating tab:', error);
    }
  }
}
