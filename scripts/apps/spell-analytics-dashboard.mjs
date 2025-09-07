/**
 * Spell Analytics Dashboard Application
 *
 * A comprehensive analytics interface for viewing spell usage statistics, data management,
 * and user behavior analysis. This application provides both personal and GM-level views
 * of spell usage patterns, favorites, notes, and contextual usage breakdowns across
 * combat and exploration scenarios.
 *
 * Key features:
 * - Personal and GM analytics views with user switching
 * - Spell usage statistics and trends analysis
 * - Context-based usage breakdowns (combat vs exploration)
 * - Data export/import functionality with JSON format support
 * - User data management with clear and reset capabilities
 * - Visual progress bars and statistical representations
 * - Real-time data refresh and cache management
 * - Integration with spell user data journaling system
 *
 * @module Applications/SpellAnalyticsDashboard
 * @author Tyler
 */

import { MODULE, TEMPLATES } from '../constants/_module.mjs';
import { SpellUserDataJournal } from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { UserSpellDataManager } from '../managers/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/**
 * Spell usage statistics for analytics processing.
 *
 * @typedef {Object} UsageStats
 * @property {number} count - Total number of times the spell was cast
 * @property {number} lastUsed - Timestamp of last usage
 * @property {Object} contextUsage - Usage breakdown by context
 * @property {number} contextUsage.combat - Number of uses in combat
 * @property {number} contextUsage.exploration - Number of uses in exploration
 */

/**
 * Aggregated spell data for analytics calculations.
 *
 * @typedef {Object} SpellData
 * @property {string} notes - User notes for the spell
 * @property {boolean} favorited - Whether the spell is marked as favorite
 * @property {UsageStats} usageStats - Usage statistics for the spell
 * @property {Object} [actorData] - Per-actor spell data
 */

/**
 * Context usage breakdown with percentages.
 *
 * @typedef {Object} ContextBreakdown
 * @property {number} combat - Total combat usage count
 * @property {number} exploration - Total exploration usage count
 * @property {number} combatPercent - Percentage of combat usage
 * @property {number} explorationPercent - Percentage of exploration usage
 */

/**
 * Spell usage entry for most/least used and recent activity lists.
 *
 * @typedef {Object} SpellUsageEntry
 * @property {string} uuid - Spell UUID
 * @property {string} name - Spell name
 * @property {number} count - Usage count
 * @property {number} lastUsed - Timestamp of last usage
 */

/**
 * User breakdown data for GM analytics view.
 *
 * @typedef {Object} UserBreakdown
 * @property {string} name - User display name
 * @property {number} totalSpells - Total spells with data for this user
 * @property {number} totalCasts - Total spell casts for this user
 * @property {number} totalFavorites - Total favorited spells for this user
 * @property {number} totalNotes - Total spells with notes for this user
 */

/**
 * Complete analytics data structure.
 *
 * @typedef {Object} AnalyticsData
 * @property {number} totalSpells - Total number of spells with data
 * @property {number} totalCasts - Total number of spell casts
 * @property {number} totalFavorites - Total number of favorited spells
 * @property {number} totalNotes - Total number of spells with notes
 * @property {Array<SpellUsageEntry>} mostUsedSpells - Most frequently used spells
 * @property {Array<SpellUsageEntry>} leastUsedSpells - Least frequently used spells
 * @property {Array<SpellUsageEntry>} recentActivity - Recently used spells
 * @property {ContextBreakdown} contextBreakdown - Usage breakdown by context
 * @property {Map<string, number>} spellsBySchool - Usage counts by spell school
 * @property {Map<string, number>} spellsByLevel - Usage counts by spell level
 * @property {Map<string, UserBreakdown>} userBreakdown - Per-user statistics for GM view
 */

/**
 * Export data structure for analytics data persistence.
 *
 * @typedef {Object} ExportData
 * @property {string} version - Module version at export time
 * @property {number} timestamp - Export timestamp
 * @property {string} exportedAt - ISO string of export date
 * @property {string} exportedBy - Name of user who exported
 * @property {string} viewMode - Analytics view mode ('personal' or 'gm')
 * @property {Object<string, Object>} userData - User data by user ID
 */

/**
 * User data export entry for individual users.
 *
 * @typedef {Object} UserDataExport
 * @property {string} userId - User ID
 * @property {string} userName - User display name
 * @property {string} htmlContent - HTML content from user data page
 * @property {number} [lastUpdated] - Timestamp of last update
 */

/**
 * Analytics Dashboard for viewing spell usage statistics and data management.
 *
 * This application provides comprehensive analytics and data management capabilities
 * for the Spell Book module. It supports both personal analytics for individual users
 * and GM-level analytics for viewing usage patterns across all players.
 *
 * The dashboard includes interactive features for data export/import, user data
 * management, and real-time statistics calculation with visual representations
 * including progress bars and contextual breakdowns.
 */
export class SpellAnalyticsDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'spell-analytics-dashboard',
    tag: 'div',
    window: { resizable: true, minimizable: true, positioned: true, title: 'SPELLBOOK.Analytics.DashboardTitle', icon: 'fas fa-chart-bar' },
    position: { width: 800, height: 'auto' },
    classes: ['spell-book', 'analytics-dashboard'],
    actions: {
      switchView: SpellAnalyticsDashboard.handleSwitchView,
      exportData: SpellAnalyticsDashboard.handleExportData,
      importData: SpellAnalyticsDashboard.handleImportData,
      clearData: SpellAnalyticsDashboard.handleClearData,
      refreshStats: SpellAnalyticsDashboard.handleRefreshStats,
      viewUserData: SpellAnalyticsDashboard.handleViewUserData
    }
  };

  /** @inheritdoc */
  static PARTS = { dashboard: { template: TEMPLATES.ANALYTICS.DASHBOARD } };

  /**
   * Create a new Analytics Dashboard application.
   *
   * Initializes the analytics dashboard with the specified view mode and user context.
   * Supports both personal analytics for individual users and GM analytics for
   * viewing aggregate statistics across all players.
   *
   * @param {Object} [options={}] - Application options
   * @param {string} [options.viewMode] - View mode ('personal' or 'gm')
   * @param {string} [options.userId] - User ID for personal view
   */
  constructor(options = {}) {
    super(options);

    /** @type {string} Current view mode ('personal' or 'gm') */
    this.viewMode = options.viewMode || 'personal';

    /** @type {string} Selected user ID for analytics */
    this.selectedUserId = options.userId || game.user.id;

    /** @type {AnalyticsData|null} Cached analytics data */
    this.analytics = null;

    /** @type {number|null} Timestamp of last data refresh */
    this.lastRefresh = null;
  }

  /** @inheritdoc */
  get title() {
    if (this.viewMode === 'gm') return game.i18n.localize('SPELLBOOK.Analytics.GMDashboardTitle');
    return game.i18n.localize('SPELLBOOK.Analytics.PersonalDashboardTitle');
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.analytics = await this._computeAnalytics();
    const analyticsForTemplate = { ...this.analytics, userBreakdown: this.analytics.userBreakdown instanceof Map ? Object.fromEntries(this.analytics.userBreakdown) : this.analytics.userBreakdown };
    return {
      ...context,
      viewMode: this.viewMode,
      isGM: game.user.isGM,
      analytics: analyticsForTemplate,
      users: game.users.filter((u) => !u.isGM),
      selectedUserId: this.selectedUserId,
      selectedUser: game.users.get(this.selectedUserId),
      lastRefresh: this.lastRefresh ? foundry.utils.timeSince(this.lastRefresh) : null
    };
  }

  /** @inheritdoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const combatElement = this.element.querySelector('.context-combat');
    const explorationElement = this.element.querySelector('.context-exploration');
    if (combatElement && explorationElement) {
      const combatPercent = this.analytics.contextBreakdown.combatPercent || 0;
      const explorationPercent = this.analytics.contextBreakdown.explorationPercent || 0;
      combatElement.style.width = `${combatPercent}%`;
      explorationElement.style.width = `${explorationPercent}%`;
      this._adjustContextBarFontSizes(combatElement, combatPercent);
      this._adjustContextBarFontSizes(explorationElement, explorationPercent);
    }
  }

  /**
   * Adjust font size of context bar labels based on available width.
   *
   * Implements responsive typography for progress bar labels to ensure
   * readability across different percentage widths and screen sizes.
   *
   * @param {HTMLElement} element - The context bar element
   * @param {number} percent - The percentage width of the bar
   * @private
   */
  _adjustContextBarFontSizes(element, percent) {
    const label = element.querySelector('.context-label');
    if (!label) return;
    let fontSize;
    if (percent <= 5) fontSize = '0.65rem';
    else if (percent <= 10) fontSize = '0.7rem';
    else if (percent <= 20) fontSize = '0.75rem';
    else if (percent <= 30) fontSize = '0.8rem';
    else fontSize = '0.875rem';
    label.style.fontSize = fontSize;
  }

  /**
   * Compute analytics data for the current view mode.
   *
   * Orchestrates the analytics computation process, routing to either personal
   * or GM analytics based on the current view mode and user permissions.
   *
   * @returns {Promise<AnalyticsData>} Complete analytics data structure
   * @private
   */
  async _computeAnalytics() {
    try {
      log(3, 'Computing analytics data...');
      const analytics = {
        totalSpells: 0,
        totalCasts: 0,
        totalFavorites: 0,
        totalNotes: 0,
        mostUsedSpells: [],
        leastUsedSpells: [],
        recentActivity: [],
        contextBreakdown: { combat: 0, exploration: 0 },
        spellsBySchool: new Map(),
        spellsByLevel: new Map(),
        userBreakdown: new Map()
      };
      if (this.viewMode === 'gm' && game.user.isGM) await this._computeGMAnalytics(analytics);
      else await this._computePersonalAnalytics(analytics, this.selectedUserId);
      this.lastRefresh = Date.now();
      return analytics;
    } catch (error) {
      log(1, 'Error computing analytics:', error);
      return this._getEmptyAnalytics();
    }
  }

  /**
   * Compute personal analytics for a specific user.
   *
   * Processes all spell data for an individual user, calculating usage statistics,
   * favorites, notes, and contextual breakdowns. Includes spell categorization
   * by school and level with usage aggregation.
   *
   * @param {AnalyticsData} analytics - Analytics object to populate
   * @param {string} userId - User ID to compute analytics for
   * @returns {Promise<void>}
   * @private
   */
  async _computePersonalAnalytics(analytics, userId) {
    const userSpells = await this._getAllUserSpellData(userId);
    for (const [spellUuid, userData] of Object.entries(userSpells)) {
      analytics.totalSpells++;
      if (userData.favorited) analytics.totalFavorites++;
      if (userData.notes?.trim()) analytics.totalNotes++;
      if (userData.usageStats?.count > 0) {
        analytics.totalCasts += userData.usageStats.count;
        analytics.contextBreakdown.combat += userData.usageStats.contextUsage?.combat || 0;
        analytics.contextBreakdown.exploration += userData.usageStats.contextUsage?.exploration || 0;
        const spellName = this._getSpellNameFromUuid(spellUuid);
        const usageData = { uuid: spellUuid, name: spellName, count: userData.usageStats.count, lastUsed: userData.usageStats.lastUsed };
        analytics.mostUsedSpells.push(usageData);
        if (userData.usageStats.lastUsed && Date.now() - userData.usageStats.lastUsed < 30 * 24 * 60 * 60 * 1000) analytics.recentActivity.push(usageData);
      }
      const spell = fromUuidSync(spellUuid);
      if (spell) {
        const school = spell.system?.school || 'unknown';
        const level = spell.system?.level || 0;
        analytics.spellsBySchool.set(school, (analytics.spellsBySchool.get(school) || 0) + (userData.usageStats?.count || 0));
        analytics.spellsByLevel.set(level, (analytics.spellsByLevel.get(level) || 0) + (userData.usageStats?.count || 0));
      }
    }
    const totalContextUsage = analytics.contextBreakdown.combat + analytics.contextBreakdown.exploration;
    if (totalContextUsage > 0) {
      analytics.contextBreakdown.combatPercent = Math.round((analytics.contextBreakdown.combat / totalContextUsage) * 100);
      analytics.contextBreakdown.explorationPercent = Math.round((analytics.contextBreakdown.exploration / totalContextUsage) * 100);
    } else {
      analytics.contextBreakdown.combatPercent = 0;
      analytics.contextBreakdown.explorationPercent = 0;
    }
    analytics.mostUsedSpells.sort((a, b) => b.count - a.count).splice(10);
    analytics.recentActivity.sort((a, b) => b.lastUsed - a.lastUsed).splice(10);
  }

  /**
   * Compute GM analytics across all users.
   *
   * Aggregates analytics data from all non-GM users to provide a comprehensive
   * view of spell usage patterns across the entire game. Includes per-user
   * breakdowns and combined statistics.
   *
   * @param {AnalyticsData} analytics - Analytics object to populate
   * @returns {Promise<void>}
   * @private
   */
  async _computeGMAnalytics(analytics) {
    const users = game.users.filter((u) => !u.isGM);
    for (const user of users) {
      const userAnalytics = this._getEmptyAnalytics();
      await this._computePersonalAnalytics(userAnalytics, user.id);
      analytics.totalSpells += userAnalytics.totalSpells;
      analytics.totalCasts += userAnalytics.totalCasts;
      analytics.totalFavorites += userAnalytics.totalFavorites;
      analytics.totalNotes += userAnalytics.totalNotes;
      analytics.contextBreakdown.combat += userAnalytics.contextBreakdown.combat;
      analytics.contextBreakdown.exploration += userAnalytics.contextBreakdown.exploration;
      analytics.userBreakdown.set(user.id, {
        name: user.name,
        totalSpells: userAnalytics.totalSpells || 0,
        totalCasts: userAnalytics.totalCasts || 0,
        totalFavorites: userAnalytics.totalFavorites || 0,
        totalNotes: userAnalytics.totalNotes || 0
      });
      analytics.mostUsedSpells = analytics.mostUsedSpells.concat(userAnalytics.mostUsedSpells);
      analytics.recentActivity = analytics.recentActivity.concat(userAnalytics.recentActivity);
    }
    const totalContextUsage = analytics.contextBreakdown.combat + analytics.contextBreakdown.exploration;
    if (totalContextUsage > 0) {
      analytics.contextBreakdown.combatPercent = Math.round((analytics.contextBreakdown.combat / totalContextUsage) * 100);
      analytics.contextBreakdown.explorationPercent = Math.round((analytics.contextBreakdown.exploration / totalContextUsage) * 100);
    } else {
      analytics.contextBreakdown.combatPercent = 0;
      analytics.contextBreakdown.explorationPercent = 0;
    }
    analytics.mostUsedSpells.sort((a, b) => b.count - a.count).splice(20);
    analytics.recentActivity.sort((a, b) => b.lastUsed - a.lastUsed).splice(20);
  }

  /**
   * Get all spell data for a user with per-actor aggregation.
   *
   * Retrieves and processes all spell data for a specific user, aggregating
   * data across multiple actors to provide a unified view of the user's
   * spell usage patterns, favorites, and notes.
   *
   * @param {string} userId - User ID to retrieve data for
   * @returns {Promise<Object<string, SpellData>>} Aggregated user spell data by spell UUID
   * @private
   */
  async _getAllUserSpellData(userId) {
    try {
      const page = await SpellUserDataJournal._getUserPage(userId);
      if (!page) return {};
      const spellData = SpellUserDataJournal._parseSpellDataFromHTML(page.text.content);
      const aggregatedData = {};
      for (const [spellUuid, data] of Object.entries(spellData)) {
        aggregatedData[spellUuid] = {
          notes: data.notes || '',
          favorited: false,
          usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
        };
        if (data.actorData) {
          for (const [actorData] of Object.entries(data.actorData)) {
            if (actorData.favorited) aggregatedData[spellUuid].favorited = true;
            if (actorData.usageStats) {
              aggregatedData[spellUuid].usageStats.count += actorData.usageStats.count || 0;
              aggregatedData[spellUuid].usageStats.contextUsage.combat += actorData.usageStats.contextUsage?.combat || 0;
              aggregatedData[spellUuid].usageStats.contextUsage.exploration += actorData.usageStats.contextUsage?.exploration || 0;
              if (actorData.usageStats.lastUsed) {
                if (!aggregatedData[spellUuid].usageStats.lastUsed || actorData.usageStats.lastUsed > aggregatedData[spellUuid].usageStats.lastUsed) {
                  aggregatedData[spellUuid].usageStats.lastUsed = actorData.usageStats.lastUsed;
                }
              }
            }
          }
        }
      }
      return aggregatedData;
    } catch (error) {
      log(1, 'Error fetching user spell data:', error);
      return {};
    }
  }

  /**
   * Get spell name from UUID for display purposes.
   *
   * @param {string} uuid - Spell UUID to resolve
   * @returns {string} Spell name or undefined if not found
   * @private
   */
  _getSpellNameFromUuid(uuid) {
    const spell = fromUuidSync(uuid);
    return spell?.name;
  }

  /**
   * Get empty analytics structure for initialization.
   *
   * @returns {AnalyticsData} Empty analytics data structure
   * @private
   */
  _getEmptyAnalytics() {
    return {
      totalSpells: 0,
      totalCasts: 0,
      totalFavorites: 0,
      totalNotes: 0,
      mostUsedSpells: [],
      leastUsedSpells: [],
      recentActivity: [],
      contextBreakdown: { combat: 0, exploration: 0 },
      spellsBySchool: new Map(),
      spellsByLevel: new Map(),
      userBreakdown: new Map()
    };
  }

  /**
   * Handle switching between view modes in the analytics dashboard.
   *
   * @param {Event} _event - The click event
   * @param {HTMLElement} target - The target element containing view mode data
   * @returns {Promise<void>}
   * @static
   */
  static async handleSwitchView(_event, target) {
    const viewMode = target.dataset.viewMode;
    this.viewMode = viewMode;
    this.render();
  }

  /**
   * Handle exporting user spell data to JSON format.
   *
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the export
   * @returns {Promise<void>}
   * @static
   */
  static async handleExportData(_event, _target) {
    await this._exportUserData();
  }

  /**
   * Handle importing user spell data from JSON files.
   *
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the import
   * @returns {Promise<void>}
   * @static
   */
  static async handleImportData(_event, _target) {
    await this._importUserData();
  }

  /**
   * Handle clearing user spell data with confirmation.
   *
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the clear operation
   * @returns {Promise<void>}
   * @static
   */
  static async handleClearData(_event, _target) {
    await this._clearUserData();
  }

  /**
   * Handle refreshing analytics statistics by clearing cache and re-rendering.
   *
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the refresh
   * @returns {Promise<void>}
   * @static
   */
  static async handleRefreshStats(_event, _target) {
    this.analytics = null;
    this.render();
  }

  /**
   * Handle viewing data for a specific user in personal mode.
   *
   * @param {Event} _event - The click event
   * @param {HTMLElement} target - The target element containing user ID data
   * @returns {Promise<void>}
   * @static
   */
  static async handleViewUserData(_event, target) {
    const userId = target.dataset.userId;
    this.selectedUserId = userId;
    this.render();
  }

  /**
   * Export user data to JSON with embedded HTML content.
   *
   * Creates a comprehensive export of user spell data including HTML content,
   * metadata, and user information. Supports both individual user export
   * and bulk export for GM users.
   *
   * @returns {Promise<void>}
   * @private
   */
  async _exportUserData() {
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

      /** @type {ExportData} */
      const exportData = {
        version: game.modules.get(MODULE.ID).version,
        timestamp: Date.now(),
        exportedAt: new Date().toISOString(),
        exportedBy: game.user.name,
        viewMode: this.viewMode,
        userData: {}
      };
      if (this.viewMode === 'gm' && game.user.isGM) {
        const users = game.users.filter((u) => !u.isGM);
        for (const user of users) {
          const page = await SpellUserDataJournal._getUserPage(user.id);
          if (page) {
            exportData.userData[user.id] = {
              userId: user.id,
              userName: user.name,
              htmlContent: page.text.content,
              lastUpdated: page.flags?.[MODULE.ID]?.lastUpdated || null
            };
          }
        }
        const filename = `all-users-spell-data-${timestamp}.json`;
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        foundry.utils.saveDataToFile(blob, { type: 'application/json' }, filename);
      } else {
        const user = game.users.get(this.selectedUserId);
        const page = await SpellUserDataJournal._getUserPage(this.selectedUserId);
        if (page && user) {
          exportData.userData[user.id] = {
            userId: user.id,
            userName: user.name,
            htmlContent: page.text.content,
            lastUpdated: page.flags?.[MODULE.ID]?.lastUpdated || null
          };
          const filename = `${user.name.replace(/[^\da-z]/gi, '_').toLowerCase()}-spell-data-${timestamp}.json`;
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          foundry.utils.saveDataToFile(blob, { type: 'application/json' }, filename);
        } else {
          throw new Error('No data found for selected user');
        }
      }
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Analytics.ExportSuccess'));
    } catch (error) {
      log(1, 'Error exporting data:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Analytics.ExportError'));
    }
  }

  /**
   * Import user data from JSON with embedded HTML content.
   *
   * Handles file selection, validation, and import of previously exported
   * user spell data. Includes confirmation dialog with import summary
   * and error handling for invalid or corrupted data.
   *
   * @returns {Promise<void>}
   * @private
   */
  async _importUserData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        let importData;
        try {
          importData = JSON.parse(text);
        } catch (parseError) {
          throw new Error('Invalid JSON format', parseError);
        }
        if (!importData.version || !importData.userData || typeof importData.userData !== 'object') throw new Error('Invalid spell data format');
        const userCount = Object.keys(importData.userData).length;
        const userNames = Object.values(importData.userData)
          .map((u) => u.userName)
          .join(', ');
        const exportDate = importData.exportedAt ? new Date(importData.exportedAt).toLocaleDateString() : game.i18n.localize('SPELLBOOK.Analytics.ImportSummaryUnknown');
        const exportedBy = importData.exportedBy || game.i18n.localize('SPELLBOOK.Analytics.ImportSummaryUnknown');
        const summaryContent = await renderTemplate(TEMPLATES.DIALOGS.ANALYTICS_IMPORT_SUMMARY, { exportDate, exportedBy, userCount, userNames });
        const confirmed = await foundry.applications.api.DialogV2.wait({
          window: { title: game.i18n.localize('SPELLBOOK.Analytics.ImportConfirmTitle') },
          content: summaryContent,
          buttons: [
            { icon: 'fas fa-check', label: game.i18n.localize('SPELLBOOK.UI.Confirm'), action: 'confirm', className: 'dialog-button' },
            { icon: 'fas fa-times', label: game.i18n.localize('SPELLBOOK.UI.Cancel'), action: 'cancel', className: 'dialog-button' }
          ],
          default: 'cancel',
          rejectClose: false
        });
        if (confirmed !== 'confirm') return;
        let importedCount = 0;
        let skippedCount = 0;
        for (const [userId, userData] of Object.entries(importData.userData)) {
          const user = game.users.get(userId);
          if (!user) {
            log(2, `Skipping import for non-existent user: ${userData.userName} (${userId})`);
            skippedCount++;
            continue;
          }
          let page = await SpellUserDataJournal._getUserPage(userId);
          if (!page) {
            log(2, `No existing page found for user ${user.name}, skipping import`);
            skippedCount++;
            continue;
          }
          await page.update({
            'text.content': userData.htmlContent,
            [`flags.${MODULE.ID}.lastUpdated`]: Date.now(),
            [`flags.${MODULE.ID}.importedAt`]: Date.now(),
            [`flags.${MODULE.ID}.importedFrom`]: file.name
          });
          importedCount++;
        }
        SpellUserDataJournal.cache.clear();
        const message =
          importedCount > 0
            ? game.i18n.format('SPELLBOOK.Analytics.ImportSuccessWithCount', {
                imported: importedCount,
                skipped: skippedCount
              })
            : game.i18n.localize('SPELLBOOK.Analytics.ImportSuccess');
        ui.notifications.info(message);
        this.render();
      } catch (error) {
        log(1, 'Error importing data:', error);
        ui.notifications.error(game.i18n.format('SPELLBOOK.Analytics.ImportErrorWithDetail', { error: error.message }));
      }
    };
    input.click();
  }

  /**
   * Clear user data with confirmation using UserSpellDataManager.
   *
   * Provides a confirmation dialog and clears spell data for either the
   * selected user (personal mode) or all users (GM mode). Uses the
   * UserSpellDataManager to generate proper empty table structures.
   *
   * @returns {Promise<void>}
   * @private
   */
  async _clearUserData() {
    const confirmed = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize('SPELLBOOK.Analytics.ClearDataTitle') },
      content: `<p>${game.i18n.localize('SPELLBOOK.Analytics.ClearDataContent')}</p>`,
      buttons: [
        { icon: 'fas fa-trash', label: game.i18n.localize('SPELLBOOK.Analytics.ClearData'), action: 'confirm', className: 'dialog-button danger' },
        { icon: 'fas fa-times', label: game.i18n.localize('SPELLBOOK.UI.Cancel'), action: 'cancel', className: 'dialog-button' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    if (confirmed !== 'confirm') return;
    try {
      const manager = new UserSpellDataManager();
      let clearedCount = 0;
      if (this.viewMode === 'gm' && game.user.isGM) {
        const users = game.users.filter((u) => !u.isGM);
        for (const user of users) {
          const page = await SpellUserDataJournal._getUserPage(user.id);
          if (page) {
            const emptyContent = await manager._generateEmptyTablesHTML(user.name, user.id);
            await page.update({
              'text.content': emptyContent,
              [`flags.${MODULE.ID}.lastUpdated`]: Date.now(),
              [`flags.${MODULE.ID}.clearedAt`]: Date.now()
            });
            clearedCount++;
          }
        }
      } else {
        const user = game.users.get(this.selectedUserId);
        if (user && !user.isGM) {
          const page = await SpellUserDataJournal._getUserPage(this.selectedUserId);
          if (page) {
            const emptyContent = await manager._generateEmptyTablesHTML(user.name, user.id);
            await page.update({
              'text.content': emptyContent,
              [`flags.${MODULE.ID}.lastUpdated`]: Date.now(),
              [`flags.${MODULE.ID}.clearedAt`]: Date.now()
            });
            clearedCount = 1;
          }
        }
      }
      SpellUserDataJournal.cache.clear();
      const message = clearedCount > 0 ? game.i18n.format('SPELLBOOK.Analytics.ClearDataSuccessWithCount', { count: clearedCount }) : game.i18n.localize('SPELLBOOK.Analytics.ClearDataSuccess');
      ui.notifications.info(message);
      this.render();
    } catch (error) {
      log(1, 'Error clearing data:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Analytics.ClearDataError'));
    }
  }
}
