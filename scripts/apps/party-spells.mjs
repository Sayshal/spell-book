import { MODULE, TEMPLATES } from '../constants/_module.mjs';
import { PartySpellManager } from '../managers/_module.mjs';
import { FocusSettingsDialog } from '../dialogs/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Party Spell Manager application for viewing party spell coordination
 */
export class PartySpells extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'party-spell-manager',
    tag: 'div',
    actions: {
      showSynergyAnalysis: PartySpells.showSynergyAnalysis,
      refreshData: PartySpells.refreshData,
      toggleSpellLevel: PartySpells.toggleSpellLevel,
      filterMemberSpells: PartySpells.filterMemberSpells,
      openFocusSettings: PartySpells.openFocusSettings
    },
    classes: ['spell-book', 'party-spell-manager'],
    window: {
      icon: 'spell-book-module-icon',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: { height: 1200, width: 750 }
  };

  static PARTS = {
    main: { template: TEMPLATES.PARTY_SPELL_MANAGER.MAIN }
  };

  /**
   * Create a new Party Spell Manager application
   * @param {Actor[]} partyActors Array of party member actors
   * @param {Actor} [viewingActor] The actor who opened this view
   * @param {Actor} [groupActor] The group actor if opened from group sheet
   * @param {Object} options Additional options
   */
  constructor(partyActors = [], viewingActor = null, groupActor = null, options = {}) {
    super(options);
    this.partyManager = new PartySpellManager(partyActors, viewingActor);
    this.viewingActor = viewingActor;
    this.groupActor = groupActor;
    this._comparisonData = null;
    this._filteredActorId = null;
  }

  /**
   * Get the window title
   * @returns {string} The application title
   */
  get title() {
    return game.i18n.localize('SPELLBOOK.Party.ManagerTitle');
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!this._comparisonData) this._comparisonData = await this.partyManager.getPartySpellComparison();
    context.comparison = this._comparisonData;
    context.availableFocuses = this.getAvailableFocusOptions();
    context.canEditFocus = game.user.isGM || (this.viewingActor && this.viewingActor.isOwner);
    context.spellLevels = this.getSpellLevelGroups(this._comparisonData.spellsByLevel);
    context.groupName = this.groupActor?.name || game.i18n.localize('SPELLBOOK.Party.DefaultGroupName');
    if (context.comparison?.actors) {
      context.comparison.actors.forEach((actorData) => {
        if (actorData.hasPermission) actorData.selectedFocus = this.partyManager.getUserSelectedFocus(this.groupActor, game.user.id);
      });
    }
    return context;
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);

    // Set up change event handling for focus dropdowns
    const focusSelects = this.element.querySelectorAll('select[data-actor-id]');
    focusSelects.forEach((select) => {
      select.addEventListener('change', async (event) => {
        const actorId = event.target.dataset.actorId;
        const focus = event.target.value;

        if (!actorId || !focus) return;

        const actor = game.actors.get(actorId);
        if (!actor) return;

        // Check permissions
        if (!game.user.isGM && !actor.isOwner) {
          ui.notifications.warn('SPELLBOOK.Party.NoPermissionToSetFocus', { localize: true });
          return;
        }

        const success = await this.partyManager.setActorSpellcastingFocus(actor, focus);
        if (success) {
          ui.notifications.clear();
          ui.notifications.info('SPELLBOOK.Party.FocusUpdated', { localize: true });
          // Clear cache so next manual refresh gets new data
          this._comparisonData = null;
        } else {
          ui.notifications.clear();
          ui.notifications.error('SPELLBOOK.Party.FocusUpdateError', { localize: true });
        }
      });
    });
    this._setupPartyMemberHover();
    this._restoreCollapsedLevels();
    this._globalClickHandler = (event) => {
      if (!this._filteredActorId) return;

      if (this.element && this.element.contains(event.target)) {
        const clickedMemberCard = event.target.closest('.member-card');
        if (!clickedMemberCard) {
          this._clearSpellFilter();
        }
      }
    };

    document.addEventListener('click', this._globalClickHandler);
  }

  /** @inheritdoc */
  async _onClose(options = {}) {
    if (this._globalClickHandler) document.removeEventListener('click', this._globalClickHandler);

    return super._onClose(options);
  }

  /**
   * Get available focus options for dropdowns
   * @returns {Object[]} Array of focus option objects
   */
  getAvailableFocusOptions() {
    const focuses = PartySpellManager.getAvailableFocuses();
    return focuses.map((focus) => ({
      value: focus,
      label: focus
    }));
  }

  /**
   * Get spell level groups for display
   * @param {Object} spellsByLevel Spells organized by level
   * @returns {Object[]} Array of spell level group objects
   */
  getSpellLevelGroups(spellsByLevel) {
    const levels = Object.keys(spellsByLevel)
      .map((l) => parseInt(l))
      .sort((a, b) => a - b);

    return levels.map((level) => ({
      level,
      levelName: level === 0 ? game.i18n.localize('SPELLBOOK.SpellLevel.Cantrip') : game.i18n.format('SPELLBOOK.SpellLevel.Numbered', { level }),
      spells: Object.values(spellsByLevel[level]).sort((a, b) => a.name.localeCompare(b.name))
    }));
  }

  /**
   * Show synergy analysis dialog
   * @param {Event} _event The triggering event
   * @param {HTMLElement} _target The event target
   */
  static async showSynergyAnalysis(_event, _target) {
    const analysisDialog = new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize('SPELLBOOK.Party.SynergyAnalysisTitle') },
      content: await foundry.applications.handlebars.renderTemplate(TEMPLATES.PARTY_SPELL_MANAGER.SYNERGY_ANALYSIS, this._comparisonData?.synergy || {}),
      buttons: [
        {
          action: 'close',
          label: game.i18n.localize('SPELLBOOK.UI.Close'),
          default: true
        }
      ],
      modal: true,
      position: { width: 600, height: 'auto' }
    });

    analysisDialog.render(true);
  }

  /**
   * Refresh party spell data
   * @param {Event} _event The triggering event
   * @param {HTMLElement} _target The event target
   */
  static async refreshData(_event, _target) {
    this._comparisonData = null;
    this.partyManager._spellDataCache.clear();
    await this.render();
    ui.notifications.info('SPELLBOOK.Party.DataRefreshed', { localize: true });
  }

  /**
   * Toggle spell level expansion/collapse
   * @param {Event} event The click event
   * @param {HTMLElement} target The clicked element
   */
  static toggleSpellLevel(event, target) {
    const levelContainer = target.closest('.spell-level-group');
    if (!levelContainer) return;

    const levelId = levelContainer.dataset.spellLevel;
    const isCollapsed = levelContainer.classList.toggle('collapsed');

    // Save state to user flags
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'partyCollapsedLevels') || [];
    if (isCollapsed && !collapsedLevels.includes(levelId)) {
      collapsedLevels.push(levelId);
    } else if (!isCollapsed && collapsedLevels.includes(levelId)) {
      collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
    }
    game.user.setFlag(MODULE.ID, 'partyCollapsedLevels', collapsedLevels);

    // Update UI elements
    const header = levelContainer.querySelector('.level-header');
    const spellList = levelContainer.querySelector('.spells-grid');
    const collapseIcon = header?.querySelector('.collapse-indicator');

    if (header) header.setAttribute('aria-expanded', !isCollapsed);
    if (spellList) spellList.style.display = isCollapsed ? 'none' : '';
    if (collapseIcon) {
      collapseIcon.className = `fas fa-caret-${isCollapsed ? 'right' : 'down'} collapse-indicator`;
    }
  }

  /**
   * Handle member card click for spell filtering
   * @param {Event} event The click event
   * @param {HTMLElement} target The clicked element
   */
  static async filterMemberSpells(event, target) {
    event.stopPropagation();

    const actorId = target.dataset.actorId;
    if (!actorId) return;

    // Case 1: Clicking the same card again - unfilter
    if (this._filteredActorId === actorId) {
      this._clearSpellFilter();
      return;
    }

    // Case 2: Clicking a different card - change filter
    this._applySpellFilter(actorId);
  }

  /**
   * Open focus settings dialog
   * @param {Event} event The click event
   * @param {HTMLElement} target The clicked element
   */
  static async openFocusSettings(event, target) {
    event.stopPropagation();
    const actorId = target.dataset.actorId;
    const actor = actorId ? game.actors.get(actorId) : null;
    if (game.user.isGM) new FocusSettingsDialog(this.groupActor, null).render(true);
    else new FocusSettingsDialog(this.groupActor, actor).render(true);
  }

  /**
   * Set up hover functionality to highlight party member spells
   * @private
   */
  _setupPartyMemberHover() {
    const memberCards = this.element.querySelectorAll('.member-card');

    memberCards.forEach((card) => {
      const actorId = card.dataset.actorId;

      if (!actorId) return;

      card.addEventListener('mouseenter', () => {
        const memberSpells = this.element.querySelectorAll(`.actor-spell-status[data-actor-id="${actorId}"].prepared`);

        memberSpells.forEach((spell) => {
          const spellItem = spell.closest('.spell-comparison-item');
          if (spellItem) {
            spellItem.classList.add('member-focused');
            spell.classList.add('highlighted-actor');
          }
        });

        card.classList.add('focused');
      });

      card.addEventListener('mouseleave', () => {
        this.element.querySelectorAll('.spell-comparison-item.member-focused').forEach((item) => {
          item.classList.remove('member-focused');
        });
        this.element.querySelectorAll('.actor-spell-status.highlighted-actor').forEach((actor) => {
          actor.classList.remove('highlighted-actor');
        });
        card.classList.remove('focused');
      });
    });
  }

  /**
   * Restore collapsed level states from user flags
   * @private
   */
  _restoreCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'partyCollapsedLevels') || [];

    collapsedLevels.forEach((levelId) => {
      const levelContainer = this.element.querySelector(`.spell-level-group[data-spell-level="${levelId}"]`);

      if (levelContainer) {
        levelContainer.classList.add('collapsed');
        const header = levelContainer.querySelector('.level-header');
        const spellList = levelContainer.querySelector('.spells-grid');
        const collapseIcon = header?.querySelector('.collapse-indicator');

        if (header) header.setAttribute('aria-expanded', 'false');
        if (spellList) spellList.style.display = 'none';
        if (collapseIcon) {
          collapseIcon.className = 'fas fa-caret-right collapse-indicator';
        }
      }
    });
  }

  /**
   * Apply spell filter to show only spells for a specific actor
   * @param {string} actorId The actor ID to filter by
   * @private
   */
  _applySpellFilter(actorId) {
    this._filteredActorId = actorId;

    const spellItems = this.element.querySelectorAll('.spell-comparison-item');

    spellItems.forEach((spellItem) => {
      const actorSpellStatus = spellItem.querySelector(`.actor-spell-status[data-actor-id="${actorId}"]`);

      if (actorSpellStatus) {
        spellItem.style.display = '';
        spellItem.classList.add('member-filtered');
        actorSpellStatus.classList.add('filtered-actor');

        const otherStatuses = spellItem.querySelectorAll(`.actor-spell-status:not([data-actor-id="${actorId}"])`);
        otherStatuses.forEach((status) => status.classList.add('dimmed'));
      } else {
        spellItem.style.display = 'none';
      }
    });

    this._updateLevelHeadersForFilter();
    this._updateMemberCardStates(actorId);
    this.element.classList.add('member-filter-active');
  }

  /**
   * Clear the spell filter and show all spells
   * @private
   */
  _clearSpellFilter() {
    this._filteredActorId = null;

    const spellItems = this.element.querySelectorAll('.spell-comparison-item');

    spellItems.forEach((spellItem) => {
      spellItem.style.display = '';
      spellItem.classList.remove('member-filtered');

      const actorStatuses = spellItem.querySelectorAll('.actor-spell-status');
      actorStatuses.forEach((status) => {
        status.classList.remove('filtered-actor', 'dimmed');
      });
    });

    this._updateLevelHeadersForFilter();
    this._updateMemberCardStates(null);
    this.element.classList.remove('member-filter-active');
  }

  /**
   * Update member card visual states based on current filter
   * @param {string|null} filteredActorId The currently filtered actor ID
   * @private
   */
  _updateMemberCardStates(filteredActorId) {
    const memberCards = this.element.querySelectorAll('.member-card');

    memberCards.forEach((card) => {
      const actorId = card.dataset.actorId;

      if (filteredActorId === actorId) {
        card.classList.add('filter-active');
        card.classList.remove('filter-inactive');
      } else if (filteredActorId) {
        card.classList.remove('filter-active');
        card.classList.add('filter-inactive');
      } else {
        card.classList.remove('filter-active', 'filter-inactive');
      }
    });
  }

  /**
   * Update level headers to reflect filtered spell counts
   * @private
   */
  _updateLevelHeadersForFilter() {
    const levelGroups = this.element.querySelectorAll('.spell-level-group');

    levelGroups.forEach((levelGroup) => {
      const spellItems = levelGroup.querySelectorAll('.spell-comparison-item');
      const visibleSpells = Array.from(spellItems).filter((item) => item.style.display !== 'none');

      const spellCountElement = levelGroup.querySelector('.spell-count');
      if (spellCountElement) {
        const totalCount = spellItems.length;
        const visibleCount = visibleSpells.length;

        if (this._filteredActorId) {
          spellCountElement.textContent = `(${visibleCount}/${totalCount} ${game.i18n.localize('SPELLBOOK.Party.Spells')})`;
        } else {
          spellCountElement.textContent = `(${totalCount} ${game.i18n.localize('SPELLBOOK.Party.Spells')})`;
        }
      }

      if (visibleSpells.length === 0) {
        levelGroup.style.display = 'none';
      } else {
        levelGroup.style.display = '';
      }
    });
  }
}
