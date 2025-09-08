/**
 * Party Spell Coordination Application
 *
 * A comprehensive party management interface for coordinating spells across multiple
 * party members. This application provides spell comparison, focus assignment, synergy
 * analysis, and collaborative spell planning capabilities for groups of spellcasters.
 *
 * Key features:
 * - Cross-party spell comparison and visualization
 * - Individual spellcasting focus assignment and management
 * - Member-based spell filtering and highlighting
 * - Collapsible spell level organization with state persistence
 * - Spell synergy analysis for optimization
 * - Real-time data refresh and cache management
 * - Drag-and-drop spell level reordering
 * - Hover-based spell highlighting for party coordination
 * - Dual-flag focus system integration with group and individual actor flags
 *
 * @module Applications/PartySpells
 * @author Tyler
 */

import { MODULE, TEMPLATES } from '../constants/_module.mjs';
import { PartySpellManager } from '../managers/_module.mjs';
import { FocusSettingsDialog } from '../dialogs/_module.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Spellcasting focus option for party coordination.
 *
 * @typedef {Object} FocusOption
 * @property {string} id - Unique identifier for the focus option (e.g., 'focus-damage', 'focus-healer')
 * @property {string} name - Display name of the focus option (e.g., 'Offensive Mage', 'Support')
 * @property {string} icon - File path to the focus option icon image
 * @property {string} description - Descriptive text explaining the focus role and strategy
 */

/**
 * Party spell comparison data structure with focus integration.
 *
 * @typedef {Object} PartySpellComparison
 * @property {Object<string, Object>} spellsByLevel - Spells organized by level
 * @property {ActorSpellData[]} actors - Array of party member data with spell information and focus assignments
 * @property {Object} synergy - Spell synergy analysis data
 * @property {string[]} availableFocuses - Available spellcasting focus options
 */

/**
 * Actor spell data structure for party analysis with focus coordination.
 *
 * @typedef {Object} ActorSpellData
 * @property {string} id - Actor ID
 * @property {string} name - Actor name
 * @property {boolean} hasPermission - Whether current user can view actor details
 * @property {string} token - Actor image/token path
 * @property {string} focus - Legacy focus setting (for backward compatibility)
 * @property {string|null} selectedFocus - Selected focus name from group coordination
 * @property {string|null} selectedFocusId - Selected focus ID from group coordination
 * @property {string|null} selectedFocusIcon - Selected focus icon path from group coordination
 * @property {SpellcasterData[]} spellcasters - Array of spellcasting class data
 * @property {number} totalSpellsKnown - Total known spells across all classes
 * @property {number} totalSpellsPrepared - Total prepared spells across all classes
 */

/**
 * Spell level group structure for UI display.
 *
 * @typedef {Object} SpellLevelGroup
 * @property {number} level - The spell level (0-9)
 * @property {string} levelName - Display name for the spell level
 * @property {Array<Object>} spells - Array of spells at this level
 */

/**
 * Party Spell Manager application for viewing party spell coordination.
 *
 * This application provides a comprehensive interface for managing spells across
 * multiple party members, enabling spell coordination, focus assignment, and
 * strategic planning. It integrates with the PartySpellManager for data processing
 * and provides advanced filtering, visualization, and interaction capabilities.
 *
 * The interface supports real-time updates, persistent user preferences, and
 * provides both overview and detailed views of party spellcasting capabilities.
 */
export class PartySpells extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
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
    window: { icon: 'spell-book-module-icon', resizable: true, minimizable: true, positioned: true },
    position: { height: 1200, width: 750 }
  };

  /** @inheritdoc */
  static PARTS = { main: { template: TEMPLATES.PARTY_SPELL_MANAGER.MAIN } };

  /**
   * Create a new Party Spell Manager application.
   *
   * Initializes the party spell coordination interface with the provided actors
   * and optional viewing context. Sets up data management and filtering state.
   *
   * @param {Array<Actor>} [partyActors=[]] - Array of party member actors
   * @param {Actor} [viewingActor=null] - The actor who opened this view
   * @param {Actor} [groupActor=null] - The group actor if opened from group sheet
   * @param {Object} [options={}] - Additional application options
   */
  constructor(partyActors = [], viewingActor = null, groupActor = null, options = {}) {
    super(options);

    /** @type {PartySpellManager} Manager for party spell data processing */
    this.partyManager = new PartySpellManager(partyActors, viewingActor);

    /** @type {Actor|null} The actor who opened this view */
    this.viewingActor = viewingActor;

    /** @type {Actor|null} The group actor if opened from group sheet */
    this.groupActor = groupActor;

    /** @type {PartySpellComparison|null} Cached spell comparison data */
    this._comparisonData = null;

    /** @type {string|null} Currently filtered actor ID for spell display */
    this._filteredActorId = null;
  }

  /** @inheritdoc */
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
      const partyUsers = PartySpellManager.getPartyUsers(this.groupActor);
      context.comparison.actors.forEach((actorData) => {
        if (actorData.hasPermission) {
          const associatedUser = partyUsers.find((user) => {
            return user.actorId === actorData.id;
          });
          if (associatedUser) {
            const focusObject = this.partyManager.getUserSelectedFocus(this.groupActor, associatedUser.id);
            actorData.selectedFocus = focusObject?.name || null;
            actorData.selectedFocusId = focusObject?.id || null;
            actorData.selectedFocusIcon = focusObject?.icon || null;
          } else {
            actorData.selectedFocus = null;
            actorData.selectedFocusId = null;
            actorData.selectedFocusIcon = null;
          }
        }
      });
    }
    return context;
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    const focusSelects = this.element.querySelectorAll('select[data-actor-id]');
    focusSelects.forEach((select) => {
      select.addEventListener('change', async (event) => {
        const actorId = event.target.dataset.actorId;
        const focus = event.target.value;
        if (!actorId || !focus) return;
        const actor = game.actors.get(actorId);
        if (!actor) return;
        if (!game.user.isGM && !actor.isOwner) {
          ui.notifications.warn('SPELLBOOK.Party.NoPermissionToSetFocus', { localize: true });
          return;
        }
        const success = await this.partyManager.setActorSpellcastingFocus(actor, focus);
        if (success) {
          ui.notifications.clear();
          ui.notifications.info('SPELLBOOK.Party.FocusUpdated', { localize: true });
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
        if (!clickedMemberCard) this._clearSpellFilter();
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
   * Get available focus options for dropdown selection.
   *
   * Retrieves and formats focus options for UI dropdown controls,
   * providing both value and label for proper form handling.
   *
   * @returns {FocusOption[]} Array of formatted focus options
   */
  getAvailableFocusOptions() {
    const focuses = PartySpellManager.getAvailableFocuses();
    return focuses.map((focus) => ({ value: focus, label: focus }));
  }

  /**
   * Get spell level groups for display organization.
   *
   * Converts the spell data organized by level into a format suitable for
   * template rendering with proper sorting and localized level names.
   *
   * @param {Object<string, Object>} spellsByLevel - Spells organized by level
   * @returns {Array<SpellLevelGroup>} Array of spell level group objects
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
   * Show synergy analysis dialog for party spell optimization.
   *
   * Opens the party spell analysis dialog with comprehensive statistics,
   * damage type distribution, focus distribution, and strategic recommendations
   * for optimizing party spell preparation and coordination.
   *
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static async showSynergyAnalysis(_event, _target) {
    const analysisDialog = new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize('SPELLBOOK.Party.SynergyAnalysisTitle') },
      content: await foundry.applications.handlebars.renderTemplate(TEMPLATES.PARTY_SPELL_MANAGER.SYNERGY_ANALYSIS, this._comparisonData?.synergy || {}),
      buttons: [{ action: 'close', label: game.i18n.localize('SPELLBOOK.UI.Close'), default: true }],
      modal: true,
      position: { width: 600, height: 'auto' }
    });
    analysisDialog.render(true);
  }

  /**
   * Refresh party spell data and clear caches.
   *
   * Forces a refresh of all cached party spell data, including spell lists,
   * focus assignments, and comparison matrices. Updates the UI to reflect
   * any changes in spell preparation or party composition.
   *
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static async refreshData(_event, _target) {
    this._comparisonData = null;
    this.partyManager._spellDataCache.clear();
    await this.render();
    ui.notifications.info('SPELLBOOK.Party.DataRefreshed', { localize: true });
  }

  /**
   * Toggle spell level section visibility.
   *
   * Collapses or expands a spell level section and persists the state
   * to user flags for consistent UI behavior across sessions.
   *
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The clicked element with data-level attribute
   * @static
   */
  static toggleSpellLevel(event, target) {
    const levelContainer = target.closest('.spell-level-group');
    if (!levelContainer) return;
    const levelId = levelContainer.dataset.spellLevel;
    const isCollapsed = levelContainer.classList.toggle('collapsed');
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'partyCollapsedLevels') || [];
    if (isCollapsed && !collapsedLevels.includes(levelId)) collapsedLevels.push(levelId);
    else if (!isCollapsed && collapsedLevels.includes(levelId)) collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
    game.user.setFlag(MODULE.ID, 'partyCollapsedLevels', collapsedLevels);
    const header = levelContainer.querySelector('.level-header');
    const spellList = levelContainer.querySelector('.spells-grid');
    const collapseIcon = header?.querySelector('.collapse-indicator');
    if (header) header.setAttribute('aria-expanded', !isCollapsed);
    if (spellList) spellList.style.display = isCollapsed ? 'none' : '';
    if (collapseIcon) collapseIcon.className = `fas fa-caret-${isCollapsed ? 'right' : 'down'} collapse-indicator`;
  }

  /**
   * Filter spells to show only those known/prepared by a specific member.
   *
   * Applies visual filtering to highlight spells associated with a specific
   * party member, providing focused view of individual contributions.
   *
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The clicked element with data-actor-id attribute
   * @static
   */
  static async filterMemberSpells(event, target) {
    event.stopPropagation();
    const actorId = target.dataset.actorId;
    if (!actorId) return;
    if (this._filteredActorId === actorId) {
      this._clearSpellFilter();
      return;
    }
    this._applySpellFilter(actorId);
  }

  /**
   * Open focus settings dialog for party coordination.
   *
   * Opens the FocusSettingsDialog in appropriate mode (GM management or
   * player selection) based on user permissions and target context.
   *
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The clicked element with optional data-actor-id
   * @static
   */
  static async openFocusSettings(event, target) {
    event.stopPropagation();
    const actorId = target.dataset.actorId;
    const actor = actorId ? game.actors.get(actorId) : null;
    if (game.user.isGM) new FocusSettingsDialog(this.groupActor, null, this).render(true);
    else new FocusSettingsDialog(this.groupActor, actor, this).render(true);
  }

  /**
   * Set up hover functionality to highlight party member spells.
   *
   * Configures mouse enter/leave event handlers on party member cards to
   * provide visual feedback by highlighting corresponding spells in the
   * spell list when hovering over member cards.
   *
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
   * Restore collapsed level states from user flags.
   *
   * Applies previously saved collapse states to spell level sections to
   * maintain consistent user interface preferences across application sessions.
   *
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
        if (collapseIcon) collapseIcon.className = 'fas fa-caret-right collapse-indicator';
      }
    });
  }

  /**
   * Apply spell filter to show only spells for a specific actor.
   *
   * Modifies the display to highlight spells for the selected actor while
   * dimming or hiding spells for other party members. Updates visual states
   * and spell counts accordingly.
   *
   * @param {string} actorId - The actor ID to filter by
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
   * Clear the spell filter and show all spells.
   *
   * Removes all filtering effects and returns the interface to its default
   * state showing all party member spells with normal visibility and styling.
   *
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
   * Update member card visual states based on current filter.
   *
   * Applies appropriate CSS classes to member cards to indicate which
   * member is currently being filtered and which members are inactive.
   *
   * @param {string|null} filteredActorId - The currently filtered actor ID
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
   * Update level headers to reflect filtered spell counts.
   *
   * Modifies spell count displays in level headers to show both visible
   * and total spell counts when filtering is active, and hides empty
   * spell level sections.
   *
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
        if (this._filteredActorId) spellCountElement.textContent = `(${visibleCount}/${totalCount} ${game.i18n.localize('SPELLBOOK.Party.Spells')})`;
        else spellCountElement.textContent = `(${totalCount} ${game.i18n.localize('SPELLBOOK.Party.Spells')})`;
      }
      if (visibleSpells.length === 0) levelGroup.style.display = 'none';
      else levelGroup.style.display = '';
    });
  }
}
