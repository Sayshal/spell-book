import { TEMPLATES } from '../constants/_module.mjs';
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
      refreshData: PartySpells.refreshData
    },
    classes: ['spell-book', 'party-spell-manager'],
    window: {
      icon: 'fas fa-users-magic',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: { height: Math.round(window.innerHeight * 0.9), width: Math.round(window.innerWidth * 0.8) }
  };

  static PARTS = {
    main: { template: TEMPLATES.PARTY_SPELL_MANAGER.MAIN }
  };

  /**
   * Create a new Party Spell Manager application
   * @param {Actor[]} partyActors Array of party member actors
   * @param {Actor} [viewingActor] The actor who opened this view
   * @param {Object} options Additional options
   */
  constructor(partyActors = [], viewingActor = null, options = {}) {
    super(options);
    this.partyManager = new PartySpellManager(partyActors, viewingActor);
    this.viewingActor = viewingActor;
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

    if (!this._comparisonData) {
      this._comparisonData = await this.partyManager.getPartySpellComparison();
    }

    context.comparison = this._comparisonData;
    context.availableFocuses = this.getAvailableFocusOptions(); // Add this back
    context.canEditFocus = game.user.isGM || (this.viewingActor && this.viewingActor.isOwner);
    context.spellLevels = this.getSpellLevelGroups(this._comparisonData.spellsByLevel);

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
}
