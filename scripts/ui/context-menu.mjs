import { FLAGS, MODULE, TEMPLATES } from '../constants.mjs';
import { Loadouts } from '../managers/loadouts.mjs';
import { PartyMode } from '../managers/party-mode.mjs';
import { log } from '../utils/logger.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Context menu manager for the SpellBook application.
 */
export class SpellBookContextMenu {
  /**
   * @param {object} app - The parent SpellBook application
   */
  constructor(app) {
    this.app = app;
    this._clickHandler = null;
  }

  /** @returns {object} The actor from the parent app */
  get actor() {
    return this.app.actor;
  }

  /** @returns {HTMLElement} The app element */
  get element() {
    return this.app.element;
  }

  /**
   * Show context menu with available loadouts.
   * @param {PointerEvent} _event - The contextmenu event
   * @param {HTMLElement} target - The button element
   */
  async showLoadoutMenu(_event, target) {
    log(3, 'Showing loadout context menu.');
    this.hide();
    const activeTab = this.app.tabGroups['spellbook-tabs'];
    const activeTabContent = this.element.querySelector(`.tab[data-tab="${activeTab}"]`);
    const classIdentifier = activeTabContent?.dataset.classIdentifier || this.app._state.activeClass;
    if (!classIdentifier) return;
    const availableLoadouts = Loadouts.getLoadouts(this.actor, classIdentifier);
    if (availableLoadouts.length === 0) return;
    const items = availableLoadouts.map((loadout) => ({
      id: loadout.id,
      icon: 'fas fa-magic',
      label: `${loadout.name} (${loadout.spellConfiguration?.length || 0})`
    }));
    const menu = await this._create('loadout', items);
    menu.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.context-menu-item');
      if (!itemEl) return;
      const loadoutId = itemEl.dataset.itemId;
      if (loadoutId) {
        await Loadouts.applyLoadout(this.actor, classIdentifier, loadoutId);
        this.hide();
      }
    });
    this._position(menu, target, 'left');
    this._setupClickHandler();
  }

  /**
   * Show context menu for party mode toggle.
   * @param {PointerEvent} _event - The contextmenu event
   * @param {HTMLElement} target - The button element
   */
  async showPartyMenu(_event, target) {
    log(3, 'Showing party context menu.');
    this.hide();
    const isPartyMode = this.actor.getFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED) || false;
    const items = [
      {
        id: 'toggle-party-mode',
        icon: `fas ${isPartyMode ? 'fa-eye-slash' : 'fa-users'}`,
        label: _loc(isPartyMode ? 'SPELLBOOK.Party.DisablePartyMode' : 'SPELLBOOK.Party.EnablePartyMode')
      }
    ];
    const menu = await this._create('party', items);
    menu.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.context-menu-item');
      if (!itemEl) return;
      const primaryGroup = PartyMode.getPrimaryGroupForActor(this.actor);
      if (primaryGroup) {
        await this.actor.setFlag(MODULE.ID, FLAGS.PARTY_MODE_ENABLED, !isPartyMode);
        await this.app.render();
      }
      this.hide();
    });
    this._position(menu, target, 'above');
    this._setupClickHandler();
  }

  /**
   * Create a context menu element using the Handlebars partial.
   * @param {string} type - Menu type identifier
   * @param {Array<{id: string, icon: string, label: string}>} items - Menu items
   * @returns {Promise<HTMLElement>} The menu element
   * @private
   */
  async _create(type, items) {
    const html = await renderTemplate(TEMPLATES.COMPONENTS.CONTEXT_MENU, { type, items });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    const menu = wrapper.firstElementChild;
    document.body.appendChild(menu);
    return menu;
  }

  /**
   * Position a context menu relative to a target element.
   * @param {HTMLElement} menu - The menu element
   * @param {HTMLElement} target - The button element
   * @param {'left'|'above'} strategy - Positioning strategy
   * @private
   */
  _position(menu, target, strategy) {
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
    } else {
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
    if (!this._clickHandler) {
      this._clickHandler = (e) => {
        if (!e.target.closest('.spell-book-context-menu')) this.hide();
      };
    }
    setTimeout(() => document.addEventListener('click', this._clickHandler), 0);
  }

  /** Hide any active context menu. */
  hide() {
    const existing = document.querySelector('.spell-book-context-menu');
    if (existing) existing.remove();
    if (this._clickHandler) document.removeEventListener('click', this._clickHandler);
  }
}
