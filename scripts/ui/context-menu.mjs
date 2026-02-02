/**
 * Context Menu System for SpellBook Application
 *
 * Handles creation, positioning, and lifecycle of context menus
 * for loadouts and party mode features.
 * @module UI/ContextMenu
 * @author Tyler
 */

import { FLAGS, MODULE } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { Loadouts, PartyMode } from '../managers/_module.mjs';

/**
 * Manages context menus for the SpellBook application.
 */
export class SpellBookContextMenu {
  /**
   * Create a new SpellBookContextMenu instance.
   * @param {object} app - The parent SpellBook application
   */
  constructor(app) {
    this.app = app;
    this._contextMenuClickHandler = null;
  }

  /**
   * Get the actor from the parent app.
   * @returns {object} The actor
   */
  get actor() {
    return this.app.actor;
  }

  /**
   * Get the app element.
   * @returns {HTMLElement} The app element
   */
  get element() {
    return this.app.element;
  }

  /**
   * Show context menu with available loadouts.
   * @param {PointerEvent} event - The contextmenu event
   * @param {HTMLElement} target - The button element
   */
  async showLoadoutMenu(event, target) {
    log(3, 'Showing loadout context menu.');
    this.hide();
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this.app._state.activeClass;
    if (!classIdentifier) return;
    const loadoutManager = new Loadouts(this.actor, this.app);
    const availableLoadouts = loadoutManager.getAvailableLoadouts(classIdentifier);
    if (availableLoadouts.length === 0) return;
    const items = availableLoadouts.map((loadout) => ({
      id: loadout.id,
      icon: 'fas fa-magic',
      label: `${loadout.name} (${loadout.spellConfiguration?.length || 0})`,
      action: async () => {
        await loadoutManager.applyLoadout(loadout.id, classIdentifier);
        this.hide();
      }
    }));
    const menu = this._create('loadout', items);
    this._position(menu, event, target, 'left');
    this._setupClickHandler();
  }

  /**
   * Show context menu for party mode toggle.
   * @param {PointerEvent} event - The contextmenu event
   * @param {HTMLElement} target - The button element
   */
  async showPartyMenu(event, target) {
    log(3, 'Showing party context menu.');
    this.hide();
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    const items = [
      {
        id: 'toggle-party-mode',
        icon: `fas ${isPartyMode ? 'fa-eye-slash' : 'fa-users'}`,
        label: game.i18n.localize(isPartyMode ? 'SPELLBOOK.Party.DisablePartyMode' : 'SPELLBOOK.Party.EnablePartyMode'),
        action: async () => {
          const primaryGroup = PartyMode.getPrimaryGroupForActor(this.actor);
          if (primaryGroup) {
            await this.actor.setFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED, !isPartyMode);
            await this.app.render();
          }
          this.hide();
        }
      }
    ];
    const menu = this._create('party', items);
    this._position(menu, event, target, 'above');
    this._setupClickHandler();
  }

  /**
   * Create a context menu element.
   * @param {string} type - Menu type identifier
   * @param {Array<{id: string, icon: string, label: string, action: Function}>} items - Menu items
   * @returns {HTMLElement} The menu element
   * @private
   */
  _create(type, items) {
    const menu = document.createElement('div');
    menu.id = `spell-book-context-menu-${type}`;
    menu.className = 'spell-book-context-menu';
    menu.dataset.menuType = type;
    menu.innerHTML = items
      .map(
        (item) => `
      <div class="context-menu-item" data-item-id="${item.id}">
        <i class="${item.icon} item-icon" aria-hidden="true"></i>
        <span class="item-text">${item.label}</span>
      </div>
    `
      )
      .join('');
    menu.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.context-menu-item');
      if (!itemEl) return;
      const itemId = itemEl.dataset.itemId;
      const item = items.find((i) => i.id === itemId);
      if (item?.action) await item.action();
    });
    document.body.appendChild(menu);
    return menu;
  }

  /**
   * Position a context menu.
   * @param {HTMLElement} menu - The menu element
   * @param {PointerEvent} _event - The triggering event
   * @param {HTMLElement} target - The button element
   * @param {'left'|'above'} strategy - Positioning strategy
   * @private
   */
  _position(menu, _event, target, strategy) {
    const targetRect = target.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const appRect = this.element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    let left, top;
    if (strategy === 'left') {
      left = Math.max(10, appRect.left - menuRect.width);
      top = targetRect.top;
      if (top + menuRect.height > viewportHeight) top = Math.max(10, viewportHeight - menuRect.height - 10);
    } else if (strategy === 'above') {
      left = targetRect.left;
      top = targetRect.top - menuRect.height - 5;
      if (top < 10) top = targetRect.bottom + 5;
      if (left + menuRect.width > viewportWidth - 10) left = targetRect.right - menuRect.width;
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  /**
   * Setup click-outside handler to close menu.
   * @private
   */
  _setupClickHandler() {
    if (!this._contextMenuClickHandler) {
      this._contextMenuClickHandler = (e) => {
        if (!e.target.closest('.spell-book-context-menu')) this.hide();
      };
    }
    setTimeout(() => {
      document.addEventListener('click', this._contextMenuClickHandler);
    }, 0);
  }

  /**
   * Hide any active context menu.
   */
  hide() {
    const existingMenu = document.querySelector('.spell-book-context-menu');
    if (existingMenu) existingMenu.remove();
    if (this._contextMenuClickHandler) document.removeEventListener('click', this._contextMenuClickHandler);
  }
}
