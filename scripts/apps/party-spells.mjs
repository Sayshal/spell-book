import { MODULE, TEMPLATES } from '../constants/_module.mjs';
import { PartySpellManager } from '../managers/_module.mjs';

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
      toggleSpellLevel: PartySpells.toggleSpellLevel
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
            spellItem.setAttribute('data-focused-actor', actorId);
          }
        });

        card.classList.add('focused');
      });

      card.addEventListener('mouseleave', () => {
        this.element.querySelectorAll('.spell-comparison-item.member-focused').forEach((item) => {
          item.classList.remove('member-focused');
          item.removeAttribute('data-focused-actor');
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
}
