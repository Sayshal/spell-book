import { FLAGS, MODULE, TEMPLATES } from '../constants.mjs';
import { SynergyAnalysis } from '../dialogs/_module.mjs';
import { PartyMode } from '../managers/party-mode.mjs';
import { log } from '../utils/logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Party spell coordination App — displays the shared spell matrix and per-member filters. */
export class PartyCoordinator extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'party-spell-manager',
    tag: 'div',
    classes: ['spell-book', 'party-spell-manager'],
    window: { icon: 'spell-book-module-icon', resizable: true, minimizable: true, positioned: true },
    position: { height: 1200, width: 750 },
    actions: {
      openSynergy: PartyCoordinator.#onOpenSynergy,
      refreshData: PartyCoordinator.#onRefreshData,
      toggleSpellHeader: PartyCoordinator.#onToggleSpellHeader,
      filterMemberSpells: PartyCoordinator.#onFilterMemberSpells,
    }
  };

  /** @override */
  static PARTS = { main: { template: TEMPLATES.APPS.PARTY.MAIN } };

  /**
   * @param {object} [opts] - Constructor options
   * @param {object} [opts.actor] - The viewing actor (falls back to resolving group/party from this)
   * @param {object} [opts.groupActor] - Group actor that owns the party (auto-resolved from `actor` if omitted)
   * @param {object[]} [opts.partyActors] - Party spellcasters (auto-resolved from `groupActor` if omitted)
   * @param {object} [opts.options] - Additional AppV2 options
   */
  constructor({ actor = null, groupActor = null, partyActors = null, ...options } = {}) {
    super(options);
    this.viewingActor = actor;
    this.groupActor = groupActor || (actor ? PartyMode.getPrimaryGroupForActor(actor) : null);
    this.partyActors = partyActors || (this.groupActor ? PartyMode.getPartyActors(this.groupActor) : []);
    this._comparisonData = null;
    this._filteredActorId = null;
    this._contextMenu = null;
    this._onDocumentClick = null;
    this._onActorUpdate = null;
    this._onItemChange = null;
  }

  /** @override */
  get title() {
    return _loc('SPELLBOOK.Party.ManagerTitle');
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!this._comparisonData) this._comparisonData = PartyMode.analyzePartySpells(this.partyActors);
    context.comparison = this._comparisonData;
    context.isGM = game.user.isGM;
    context.spellLevels = this._buildSpellLevelGroups(this._comparisonData.spellsByLevel);
    context.groupName = this.groupActor?.name || _loc('SPELLBOOK.Party.DefaultGroupName');
    this._decorateActors(context.comparison?.actors);
    return context;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this._onActorUpdate = (actor) => {
      if (!this._isRelevantActor(actor)) return;
      this._invalidateAndRender();
    };
    this._onItemChange = (item) => {
      if (item?.type !== 'spell') return;
      if (!this._isRelevantActor(item.parent)) return;
      this._invalidateAndRender();
    };
    Hooks.on('updateActor', this._onActorUpdate);
    Hooks.on('updateItem', this._onItemChange);
    Hooks.on('createItem', this._onItemChange);
    Hooks.on('deleteItem', this._onItemChange);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this._setupMemberHover();
    this._setupMemberContextMenu();
    this._restoreCollapsedLevels();
    this._onDocumentClick = (event) => {
      if (this._filteredActorId && this.element.contains(event.target) && !event.target.closest('.member-card')) this._clearSpellFilter();
      if (this._contextMenu && !event.target.closest('.party-member-context-menu')) this._hideContextMenu();
    };
    document.addEventListener('click', this._onDocumentClick);
  }

  /** @override */
  _onClose(options) {
    if (this._onDocumentClick) document.removeEventListener('click', this._onDocumentClick);
    this._hideContextMenu();
    if (this._onActorUpdate) Hooks.off('updateActor', this._onActorUpdate);
    if (this._onItemChange) {
      Hooks.off('updateItem', this._onItemChange);
      Hooks.off('createItem', this._onItemChange);
      Hooks.off('deleteItem', this._onItemChange);
    }
    return super._onClose(options);
  }

  /**
   * Check whether a changed actor is part of this coordinator's scope.
   * @param {object|null} actor - The actor that changed
   * @returns {boolean} Whether the change is relevant
   * @private
   */
  _isRelevantActor(actor) {
    if (!actor) return false;
    if (actor.id === this.groupActor?.id) return true;
    return this.partyActors.some((a) => a.id === actor.id);
  }

  /**
   * Drop cached comparison data and re-render.
   * @private
   */
  _invalidateAndRender() {
    this._comparisonData = null;
    this.render();
  }

  /**
   * Decorate actor rows with ownership metadata for the template.
   * @param {object[]|undefined} actors - Actor data from analyzePartySpells
   * @private
   */
  _decorateActors(actors) {
    if (!actors) return;
    for (const actorData of actors) {
      const actor = game.actors.get(actorData.id);
      actorData.isOwner = actor ? actor.isOwner : false;
    }
  }

  /**
   * Sort the level-keyed spell map into an array suitable for template rendering.
   * @param {Object<string, Object>} spellsByLevel - Level-keyed spell data
   * @returns {Array<{level:number, levelName:string, spells:object[]}>} Spell level groups
   * @private
   */
  _buildSpellLevelGroups(spellsByLevel) {
    return Object.keys(spellsByLevel)
      .map((l) => parseInt(l))
      .sort((a, b) => a - b)
      .map((level) => ({
        level,
        levelName: level === 0 ? _loc('DND5E.SpellLevel0') : _loc('SPELLBOOK.SpellLevel.Numbered', { level }),
        spells: Object.values(spellsByLevel[level]).sort((a, b) => a.name.localeCompare(b.name))
      }));
  }

  /**
   * Toggle a value in a user-flag array.
   * @param {string} flagKey - Flag key
   * @param {string} id - Value to toggle
   * @returns {Promise<boolean>} Whether the value is now present
   * @private
   */
  async _toggleUserFlagArray(flagKey, id) {
    const current = game.user.getFlag(MODULE.ID, flagKey) || [];
    const exists = current.includes(id);
    const next = exists ? current.filter((x) => x !== id) : [...current, id];
    await game.user.setFlag(MODULE.ID, flagKey, next);
    return !exists;
  }

  /** Open the synergy analysis dialog. */
  static #onOpenSynergy() {
    if (!this._comparisonData?.synergy) return;
    new SynergyAnalysis(this._comparisonData.synergy).render({ force: true });
  }

  /** Drop cached analysis and re-render. */
  static #onRefreshData() {
    this._invalidateAndRender();
  }

  /**
   * Toggle collapsed state for a spell-level group.
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The clicked header element
   */
  static async #onToggleSpellHeader(_event, target) {
    const levelContainer = target.closest('.spell-level-group');
    const levelId = levelContainer?.dataset?.spellLevel;
    if (!levelId) return;
    const isCollapsed = await this._toggleUserFlagArray(FLAGS.PARTY_COLLAPSED_LEVELS, levelId);
    levelContainer.classList.toggle('collapsed', isCollapsed);
    const header = levelContainer.querySelector('.level-header');
    const spellList = levelContainer.querySelector('.spells-grid');
    const icon = header?.querySelector('.collapse-indicator');
    if (header) header.setAttribute('aria-expanded', String(!isCollapsed));
    if (spellList) spellList.style.display = isCollapsed ? 'none' : '';
    if (icon) icon.className = `fas fa-caret-${isCollapsed ? 'right' : 'down'} collapse-indicator`;
  }

  /**
   * Toggle the per-member spell filter.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The clicked member card
   */
  static #onFilterMemberSpells(event, target) {
    event.stopPropagation();
    const actorId = target.dataset.actorId;
    if (!actorId) return;
    if (this._filteredActorId === actorId) this._clearSpellFilter();
    else this._applySpellFilter(actorId);
  }


  /**
   * Highlight a member's prepared spells on card hover.
   * @private
   */
  _setupMemberHover() {
    for (const card of this.element.querySelectorAll('.member-card')) {
      const actorId = card.dataset.actorId;
      if (!actorId) continue;
      card.addEventListener('mouseenter', () => {
        for (const spell of this.element.querySelectorAll(`.actor-spell-status[data-actor-id="${actorId}"].prepared`)) {
          const item = spell.closest('.spell-comparison-item');
          if (item) item.classList.add('member-focused');
          spell.classList.add('highlighted-actor');
        }
        card.classList.add('focused');
      });
      card.addEventListener('mouseleave', () => {
        for (const item of this.element.querySelectorAll('.spell-comparison-item.member-focused')) item.classList.remove('member-focused');
        for (const spell of this.element.querySelectorAll('.actor-spell-status.highlighted-actor')) spell.classList.remove('highlighted-actor');
        card.classList.remove('focused');
      });
    }
  }

  /**
   * Bind right-click context menus on member cards.
   * @private
   */
  _setupMemberContextMenu() {
    for (const card of this.element.querySelectorAll('.member-card')) {
      const actorId = card.dataset.actorId;
      if (!actorId) continue;
      const actor = game.actors.get(actorId);
      if (!actor?.testUserPermission(game.user, 'LIMITED')) continue;
      card.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._showContextMenu(event, actor);
      });
    }
  }

  /**
   * Build and show the member-card context menu.
   * @param {PointerEvent} event - The triggering event
   * @param {object} actor - The actor for the clicked card
   * @private
   */
  _showContextMenu(event, actor) {
    this._hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'party-member-context-menu';
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    const icon = document.createElement('i');
    icon.className = 'fas fa-user';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = _loc('SPELLBOOK.Party.OpenActor');
    item.append(icon, label);
    item.addEventListener('click', async () => {
      if (actor.testUserPermission(game.user, 'LIMITED')) await actor.sheet.render(true);
      this._hideContextMenu();
    });
    menu.appendChild(item);
    document.body.appendChild(menu);
    this._positionContextMenu(event, menu);
    this._contextMenu = menu;
  }

  /**
   * Clamp the context menu into the viewport.
   * @param {PointerEvent} event - The triggering event
   * @param {HTMLElement} menu - The menu element
   * @private
   */
  _positionContextMenu(event, menu) {
    const rect = menu.getBoundingClientRect();
    let x = event.clientX + 5;
    let y = event.clientY + 5;
    if (x + rect.width > window.innerWidth - 10) x = event.clientX - rect.width - 5;
    if (y + rect.height > window.innerHeight - 10) y = event.clientY - rect.height - 5;
    menu.style.left = `${Math.max(10, x)}px`;
    menu.style.top = `${Math.max(10, y)}px`;
  }

  /**
   * Remove the active context menu, if any.
   * @private
   */
  _hideContextMenu() {
    if (!this._contextMenu) return;
    this._contextMenu.remove();
    this._contextMenu = null;
  }

  /**
   * Restore collapsed spell-level headers from user flags.
   * @private
   */
  _restoreCollapsedLevels() {
    const collapsed = game.user.getFlag(MODULE.ID, FLAGS.PARTY_COLLAPSED_LEVELS) || [];
    for (const levelId of collapsed) {
      const container = this.element.querySelector(`.spell-level-group[data-spell-level="${levelId}"]`);
      if (!container) continue;
      container.classList.add('collapsed');
      const header = container.querySelector('.level-header');
      const spellList = container.querySelector('.spells-grid');
      const icon = header?.querySelector('.collapse-indicator');
      if (header) header.setAttribute('aria-expanded', 'false');
      if (spellList) spellList.style.display = 'none';
      if (icon) icon.className = 'fas fa-caret-right collapse-indicator';
    }
  }

  /**
   * Show only spells for the given actor.
   * @param {string} actorId - Actor ID to filter by
   * @private
   */
  _applySpellFilter(actorId) {
    this._filteredActorId = actorId;
    for (const spellItem of this.element.querySelectorAll('.spell-comparison-item')) {
      const status = spellItem.querySelector(`.actor-spell-status[data-actor-id="${actorId}"]`);
      if (!status) {
        spellItem.style.display = 'none';
        continue;
      }
      spellItem.style.display = '';
      spellItem.classList.add('member-filtered');
      status.classList.add('filtered-actor');
      for (const other of spellItem.querySelectorAll(`.actor-spell-status:not([data-actor-id="${actorId}"])`)) other.classList.add('dimmed');
    }
    this._updateLevelHeadersForFilter();
    this._updateMemberCardStates(actorId);
    this.element.classList.add('member-filter-active');
  }

  /**
   * Restore full spell visibility.
   * @private
   */
  _clearSpellFilter() {
    this._filteredActorId = null;
    for (const spellItem of this.element.querySelectorAll('.spell-comparison-item')) {
      spellItem.style.display = '';
      spellItem.classList.remove('member-filtered');
      for (const status of spellItem.querySelectorAll('.actor-spell-status')) status.classList.remove('filtered-actor', 'dimmed');
    }
    this._updateLevelHeadersForFilter();
    this._updateMemberCardStates(null);
    this.element.classList.remove('member-filter-active');
  }

  /**
   * Update member-card active/inactive classes to reflect the current filter.
   * @param {string|null} filteredActorId - The currently filtered actor
   * @private
   */
  _updateMemberCardStates(filteredActorId) {
    for (const card of this.element.querySelectorAll('.member-card')) {
      const actorId = card.dataset.actorId;
      card.classList.remove('filter-active', 'filter-inactive');
      if (!filteredActorId) continue;
      if (filteredActorId === actorId) card.classList.add('filter-active');
      else card.classList.add('filter-inactive');
    }
  }

  /**
   * Recompute level-header spell counts to reflect filtering.
   * @private
   */
  _updateLevelHeadersForFilter() {
    const spellsLabel = _loc('SPELLBOOK.Party.Spells');
    for (const group of this.element.querySelectorAll('.spell-level-group')) {
      const spellItems = group.querySelectorAll('.spell-comparison-item');
      const visible = Array.from(spellItems).filter((item) => item.style.display !== 'none');
      const count = group.querySelector('.spell-count');
      if (count) count.textContent = this._filteredActorId ? `(${visible.length}/${spellItems.length} ${spellsLabel})` : `(${spellItems.length} ${spellsLabel})`;
      group.style.display = visible.length === 0 ? 'none' : '';
    }
    log(3, 'Party coordinator: level headers updated.');
  }
}
