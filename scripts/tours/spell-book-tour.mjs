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
import { SpellBook, SpellListManager, SpellBookSettings, PartyCoordinator, PartyMode } from '../apps/_module.mjs';
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

  /** @override */
  get canStart() {
    if (game.view !== 'game') return false;
    if (!game.ready) return false;
    return true;
  }

  /** @override */
  async start() {
    this.demoActor = await this.#findDemoActor();
    if (!this.demoActor && this.#requiresActor()) {
      ui.notifications.warn(game.i18n.localize('SPELLBOOK.Tours.NoSuitableActor'));
      return;
    }
    return super.start();
  }

  /** @override */
  async _preStep() {
    const step = this.currentStep;
    log(3, `SpellBookTour | Processing pre-step: ${step.id}`, { step });
    if (step.openSpellBook) await this.#openSpellBook(step.openSpellBook);
    if (step.openSpellListManager) await this.#openSpellListManager();
    if (step.openPartySpells) await this.#openPartySpells();
    if (step.openSpellBookSettings) await this.#openSpellBookSettings();
    if (step.spellBookTab && this.focusedApp instanceof SpellBook) await this.#activateSpellBookTab(step.spellBookTab);
    if (step.openSpellBook || step.spellBookTab || step.openSpellListManager) await new Promise((resolve) => setTimeout(resolve, 300));
    await super._preStep();
  }

  /** @override */
  async _postStep() {
    await super._postStep();
    const step = this.currentStep;
    if (step?.closeAfterStep && this.focusedApp) {
      await this.focusedApp.close();
      this.focusedApp = null;
    }
  }

  /** @override */
  async complete() {
    this.focusedApp = null;
    this.demoActor = null;
    return super.complete();
  }

  /** @override */
  async exit() {
    this.focusedApp = null;
    this.demoActor = null;
    return super.exit();
  }

  /** @override */
  _getTargetElement(selector) {
    let element = document.querySelector(selector);
    if (element) return element;
    if (this.focusedApp?.element) element = this.focusedApp.element[0]?.querySelector(selector) || this.focusedApp.element.querySelector?.(selector);
    return element;
  }

  /* -------------------------------------------- */
  /*  Private Helper Methods                      */
  /* -------------------------------------------- */

  /**
   * Find a suitable actor for tour demonstrations.
   * Prefers user's owned actors with spells, falls back to importing Akra.
   * @returns {Promise<Actor|null>} A suitable actor or null
   * @private
   */
  async #findDemoActor() {
    if (game.user.character) {
      const hasSpells = Object.keys(game.user.character.spellcastingClasses || {}).length > 0;
      if (hasSpells) {
        log(3, 'SpellBookTour | Using user assigned character');
        return game.user.character;
      }
    }
    const ownedActors = game.actors.filter((a) => a.isOwner && a.type === 'character');
    for (const actor of ownedActors) {
      const hasSpells = Object.keys(actor.spellcastingClasses || {}).length > 0;
      if (hasSpells) {
        log(3, `SpellBookTour | Using owned actor: ${actor.name}`);
        return actor;
      }
    }
    return await this.#importAkraFallback();
  }

  /**
   * Import Akra from the dnd5e.heroes compendium as a fallback demo actor.
   * @returns {Promise<Actor|null>} Akra the demo actor or null
   * @private
   */
  async #importAkraFallback() {
    let akra = game.actors.find((a) => a.name === 'Akra' && a.type === 'character');
    if (akra) {
      log(3, 'SpellBookTour | Found existing Akra actor');
      return akra;
    }
    try {
      const pack = game.packs.get('dnd5e.heroes');
      if (!pack) {
        log(2, 'SpellBookTour | dnd5e.heroes compendium not found');
        return null;
      }
      const index = await pack.getIndex();
      const akraEntry = index.find((e) => e.name === 'Akra (Dragonborn Cleric)');
      if (!akraEntry) {
        log(2, 'SpellBookTour | Akra not found in dnd5e.heroes compendium');
        return null;
      }
      log(3, 'SpellBookTour | Importing Akra from compendium as fallback');
      akra = await game.actors.importFromCompendium(pack, akraEntry._id, { name: 'Akra' });
      const unpreparedSpells = akra.items.filter((item) => item.type === 'spell' && item.system.prepared === 0);
      if (unpreparedSpells.length > 0) {
        const idsToDelete = unpreparedSpells.map((s) => s.id);
        await akra.deleteEmbeddedDocuments('Item', idsToDelete);
        log(3, `SpellBookTour | Deleted ${unpreparedSpells.length} unprepared spells from Akra`);
      }
      log(2, 'SpellBookTour | Successfully imported and prepared Akra for tour');
      return akra;
    } catch (error) {
      log(1, 'SpellBookTour | Error importing Akra:', error);
      return null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Check if this tour requires an actor to function.
   * @returns {boolean} Whether an actor is required
   * @private
   */
  #requiresActor() {
    return this.config.steps.some((step) => step.openSpellBook || step.openSpellBookSettings || step.openPartySpells);
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
    if (typeof config === 'string') {
      if (config === 'first' || config === 'demo') actor = this.demoActor;
      else actor = game.actors.get(config);
    } else if (config?.actorId) {
      actor = game.actors.get(config.actorId);
    } else actor = this.demoActor;
    if (!actor) {
      log(2, 'SpellBookTour | Could not find suitable actor for spell book demo');
      return null;
    }
    log(3, `SpellBookTour | Opening SpellBook for actor: ${actor.name} (${actor.id})`);
    const existingApp = Array.from(foundry.applications.instances.values()).find((app) => app instanceof SpellBook && app.actor?.id === actor.id);
    if (existingApp) {
      this.focusedApp = existingApp;
      existingApp.bringToFront();
      log(3, 'SpellBookTour | Using existing SpellBook instance');
      return existingApp;
    }
    try {
      log(3, 'SpellBookTour | Creating new SpellBook instance');
      const spellBook = new SpellBook(actor);
      log(3, 'SpellBookTour | Pre-initializing SpellBook');
      await spellBook._preInitialize();
      log(3, 'SpellBookTour | Rendering SpellBook');
      spellBook.render(true);
      this.focusedApp = spellBook;
      log(3, 'SpellBookTour | Successfully opened new SpellBook instance');
      return spellBook;
    } catch (error) {
      log(1, 'SpellBookTour | Error opening SpellBook:', error);
      console.error(error);
      return null;
    }
  }

  /**
   * Open the Spell List Manager application.
   * @returns {Promise<void>}
   * @private
   */
  async #openSpellListManager() {
    try {
      const existingApp = Array.from(foundry.applications.instances.values()).find((app) => app instanceof SpellListManager);
      if (existingApp) {
        existingApp.bringToFront();
        this.focusedApp = existingApp;
        return;
      }
      const manager = new SpellListManager();
      manager.render(true);
      this.focusedApp = manager;
      log(3, 'SpellBookTour | Opened Spell List Manager');
    } catch (error) {
      log(2, 'SpellBookTour | Could not open Spell List Manager:', error);
    }
  }

  /**
   * Open the Party Spells coordinator.
   * @returns {Promise<void>}
   * @private
   */
  async #openPartySpells() {
    if (!this.demoActor) return;
    try {
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
      coordinator.render(true);
      this.focusedApp = coordinator;
      log(3, 'SpellBookTour | Opened Party Coordinator');
    } catch (error) {
      log(2, 'SpellBookTour | Could not open Party Coordinator:', error);
    }
  }

  /**
   * Open the SpellBook settings dialog.
   * @returns {Promise<void>}
   * @private
   */
  async #openSpellBookSettings() {
    if (!this.demoActor) return;
    try {
      const settings = new SpellBookSettings(this.demoActor, { parentApp: this.focusedApp });
      settings.render(true);
      log(3, 'SpellBookTour | Opened SpellBook Settings');
    } catch (error) {
      log(2, 'SpellBookTour | Could not open SpellBook Settings:', error);
    }
  }

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
      this.previousTab = this.focusedApp.tabGroups?.['spellbook-tabs'];
      await this.focusedApp.changeTab(tabId, 'spellbook-tabs');
      log(3, `SpellBookTour | Activated tab: ${tabId}`);
    } catch (error) {
      log(2, 'SpellBookTour | Error activating tab:', error);
    }
  }
}
