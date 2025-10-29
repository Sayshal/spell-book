/**
 * Spell Analytics Dashboard Application
 *
 * An analytics interface for viewing spell usage statistics, data management,
 * and user behavior analysis. This application provides both personal and GM-level views
 * of spell usage patterns, favorites, notes, and contextual usage breakdowns across
 * combat and exploration scenarios.
 *
 * @module Applications/AnalyticsDashboard
 * @author Tyler
 */

import { MODULE, TEMPLATES } from '../constants/_module.mjs';
import { UserData } from '../data/_module.mjs';
import { log } from '../logger.mjs';
import { UserDataSetup } from '../managers/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/**
 * Analytics Dashboard for viewing spell usage statistics and data management.
 */
export class AnalyticsDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'spell-analytics-dashboard',
    tag: 'div',
    window: { resizable: true, minimizable: true, positioned: true, title: 'SPELLBOOK.Analytics.DashboardTitle', icon: 'fas fa-chart-bar' },
    position: { width: 800, height: 'auto' },
    classes: ['spell-book', 'analytics-dashboard'],
    actions: {
      switchView: AnalyticsDashboard.handleSwitchView,
      exportData: AnalyticsDashboard.handleExportData,
      importData: AnalyticsDashboard.handleImportData,
      clearData: AnalyticsDashboard.handleClearData,
      refreshStats: AnalyticsDashboard.handleRefreshStats,
      viewUserData: AnalyticsDashboard.handleViewUserData
    }
  };

  /** @inheritdoc */
  static PARTS = { dashboard: { template: TEMPLATES.ANALYTICS.DASHBOARD } };

  /**
   * Create a new Analytics Dashboard application.
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

    /** @type {Object|null} Cached analytics data */
    this.analytics = null;

    /** @type {number|null} Timestamp of last data refresh */
    this.lastRefresh = null;

    log(1, 'AnalyticsDashboard constructed.');
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
    context.viewMode = this.viewMode;
    context.isGM = game.user.isGM;
    context.analytics = { ...this.analytics, userBreakdown: this.analytics.userBreakdown instanceof Map ? Object.fromEntries(this.analytics.userBreakdown) : this.analytics.userBreakdown };
    context.users = game.users.filter((u) => !u.isGM);
    context.selectedUserId = this.selectedUserId;
    context.selectedUser = game.users.get(this.selectedUserId);
    context.lastRefresh = this.lastRefresh ? foundry.utils.timeSince(this.lastRefresh) : null;
    log(3, 'Analytics Context:', { context });
    return context;
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
    log(3, 'Rendering');
  }

  /**
   * Adjust font size of context bar labels based on available width.
   * @param {HTMLElement} element - The context bar element
   * @param {number} percent - The percentage width of the bar
   * @todo This seems excessive?
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
    log(3, 'Adjusting context bar font size(s).');
  }

  /**
   * Compute analytics data for the current view mode.
   * @returns {Promise<AnalyticsData>} Complete analytics data structure
   * @private
   */
  async _computeAnalytics() {
    try {
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
    } finally {
      log(3, 'Computed analytics.');
    }
  }

  /**
   * Compute personal analytics for a specific user.
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
        const spellName = fromUuidSync(spellUuid).name;
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
    log(3, 'Computed personal analytics.');
  }

  /**
   * Compute GM analytics across all users.
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
    log(3, 'Computed GM analytics.');
  }

  /**
   * Get all spell data for a user with per-actor aggregation.
   * @param {string} userId - User ID to retrieve data for
   * @returns {Promise<Object<string, SpellData>>} Aggregated user spell data by spell UUID
   * @private
   */
  async _getAllUserSpellData(userId) {
    try {
      const page = await UserData._getUserPage(userId);
      if (!page) return {};
      const spellData = UserData._parseSpellDataFromHTML(page.text.content);
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
      log(3, 'All user spell data aggregated:', { aggregatedData });
      return aggregatedData;
    } catch (error) {
      log(1, 'Error getting all user spelldata:', error);
      return {};
    }
  }

  /**
   * Get empty analytics structure for initialization.
   * @returns {AnalyticsData} Empty analytics data structure
   * @private
   */
  _getEmptyAnalytics() {
    log(3, 'Empty Analytics fetched.');
    return {
      totalSpells: 0,
      totalCasts: 0,
      totalFavorites: 0,
      totalNotes: 0,
      mostUsedSpells: [],
      recentActivity: [],
      contextBreakdown: { combat: 0, exploration: 0 },
      spellsBySchool: new Map(),
      spellsByLevel: new Map(),
      userBreakdown: new Map()
    };
  }

  /**
   * Handle switching between view modes in the analytics dashboard.
   * @param {Event} _event - The click event
   * @param {HTMLElement} target - The target element containing view mode data
   * @returns {Promise<void>}
   * @static
   */
  static async handleSwitchView(_event, target) {
    log(3, 'Switch View called.');
    const viewMode = target.dataset.viewMode;
    this.viewMode = viewMode;
    this.render();
  }

  /**
   * Handle exporting user spell data to JSON format.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the export
   * @returns {Promise<void>}
   * @static
   */
  static async handleExportData(_event, _target) {
    log(3, 'Export Data called.');
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
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
          const page = await UserData._getUserPage(user.id);
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
        const page = await UserData._getUserPage(this.selectedUserId);
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
    } catch (error) {
      log(1, 'Error Exporting Data:', error);
    }
  }

  /**
   * Handle importing user spell data from JSON files.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the import
   * @returns {Promise<void>}
   * @static
   */
  static async handleImportData(_event, _target) {
    log(3, 'Import Data called.');
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
        for (const [userId, userData] of Object.entries(importData.userData)) {
          const user = game.users.get(userId);
          if (!user) continue;
          let page = await UserData._getUserPage(userId);
          if (!page) continue;
          await page.update({
            'text.content': userData.htmlContent,
            [`flags.${MODULE.ID}.lastUpdated`]: Date.now(),
            [`flags.${MODULE.ID}.importedAt`]: Date.now(),
            [`flags.${MODULE.ID}.importedFrom`]: file.name
          });
        }
        UserData.cache.clear();
        this.render();
      } catch (error) {
        log(1, 'Error Importing Data:', error);
      }
    };
    input.click();
  }

  /**
   * Handle clearing user spell data with confirmation.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the clear operation
   * @returns {Promise<void>}
   * @static
   */
  static async handleClearData(_event, _target) {
    log(3, 'Clear Data called.');
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
      const manager = new UserDataSetup();
      let clearedCount = 0;
      if (this.viewMode === 'gm' && game.user.isGM) {
        const users = game.users.filter((u) => !u.isGM);
        for (const user of users) {
          const page = await UserData._getUserPage(user.id);
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
          const page = await UserData._getUserPage(this.selectedUserId);
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
      UserData.cache.clear();
      const message = clearedCount > 0 ? game.i18n.format('SPELLBOOK.Analytics.ClearDataSuccessWithCount', { count: clearedCount }) : game.i18n.localize('SPELLBOOK.Analytics.ClearDataSuccess');
      ui.notifications.info(message);
      this.render();
    } catch (error) {
      log(1, 'Error Clearing Data:', error);
    }
  }

  /**
   * Handle refreshing analytics statistics by clearing cache and re-rendering.
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The target element that triggered the refresh
   * @returns {Promise<void>}
   * @static
   */
  static async handleRefreshStats(_event, _target) {
    log(3, 'Refresh Stats called.');
    this.analytics = null;
    this.render();
  }

  /**
   * Handle viewing data for a specific user in personal mode.
   * @param {Event} _event - The click event
   * @param {HTMLElement} target - The target element containing user ID data
   * @returns {Promise<void>}
   * @static
   */
  static async handleViewUserData(_event, target) {
    log(3, 'View User Data called.');
    const userId = target.dataset.userId;
    this.selectedUserId = userId;
    this.render();
  }
}
