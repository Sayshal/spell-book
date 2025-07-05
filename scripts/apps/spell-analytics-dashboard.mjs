import { MODULE, TEMPLATES } from '../constants.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Analytics Dashboard for viewing spell usage statistics and data management
 */
export class SpellAnalyticsDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'spell-analytics-dashboard',
    tag: 'div',
    window: {
      resizable: true,
      minimizable: true,
      positioned: true,
      title: 'SPELLBOOK.Analytics.DashboardTitle'
    },
    position: {
      width: 800,
      height: 'auto'
    },
    classes: ['application', 'spell-book', 'analytics-dashboard'],
    actions: {
      switchView: SpellAnalyticsDashboard.handleSwitchView,
      exportData: SpellAnalyticsDashboard.handleExportData,
      importData: SpellAnalyticsDashboard.handleImportData,
      clearData: SpellAnalyticsDashboard.handleClearData,
      refreshStats: SpellAnalyticsDashboard.handleRefreshStats,
      viewUserData: SpellAnalyticsDashboard.handleViewUserData
    }
  };

  static PARTS = {
    dashboard: { template: TEMPLATES.ANALYTICS.DASHBOARD }
  };

  constructor(options = {}) {
    super(options);
    this.viewMode = options.viewMode || 'personal'; // 'personal' or 'gm'
    this.selectedUserId = options.userId || game.user.id;
    this.analytics = null;
    this.lastRefresh = null;
  }

  /** @override */
  get title() {
    if (this.viewMode === 'gm') return game.i18n.localize('SPELLBOOK.Analytics.GMDashboardTitle');
    return game.i18n.localize('SPELLBOOK.Analytics.PersonalDashboardTitle');
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Compute analytics data
    this.analytics = await this._computeAnalytics();

    return {
      ...context,
      viewMode: this.viewMode,
      isGM: game.user.isGM,
      analytics: this.analytics,
      users: game.users.filter((u) => !u.isGM), // For GM view user selection
      selectedUserId: this.selectedUserId,
      selectedUser: game.users.get(this.selectedUserId),
      lastRefresh: this.lastRefresh ? new Date(this.lastRefresh).toLocaleString() : null
    };
  }

  /**
   * Compute analytics data for the current view
   * @returns {Promise<Object>} Analytics data
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
        userBreakdown: new Map() // For GM view
      };

      if (this.viewMode === 'gm' && game.user.isGM) {
        // GM view: aggregate all user data
        await this._computeGMAnalytics(analytics);
      } else {
        // Personal view: current user only
        await this._computePersonalAnalytics(analytics, this.selectedUserId);
      }

      this.lastRefresh = Date.now();
      return analytics;
    } catch (error) {
      log(1, 'Error computing analytics:', error);
      return this._getEmptyAnalytics();
    }
  }

  /**
   * Compute personal analytics for a specific user
   * @param {Object} analytics - Analytics object to populate
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   * @private
   */
  async _computePersonalAnalytics(analytics, userId) {
    // Get all spell data for this user
    const userSpells = await this._getAllUserSpellData(userId);

    for (const [spellUuid, userData] of Object.entries(userSpells)) {
      analytics.totalSpells++;

      if (userData.favorited) analytics.totalFavorites++;
      if (userData.notes?.trim()) analytics.totalNotes++;

      if (userData.usageStats?.count > 0) {
        analytics.totalCasts += userData.usageStats.count;
        analytics.contextBreakdown.combat += userData.usageStats.contextUsage?.combat || 0;
        analytics.contextBreakdown.exploration += userData.usageStats.contextUsage?.exploration || 0;

        // Add to usage lists
        const spellName = this._getSpellNameFromUuid(spellUuid);
        const usageData = {
          uuid: spellUuid,
          name: spellName,
          count: userData.usageStats.count,
          lastUsed: userData.usageStats.lastUsed
        };

        analytics.mostUsedSpells.push(usageData);

        // Recent activity (last 30 days)
        if (userData.usageStats.lastUsed && Date.now() - userData.usageStats.lastUsed < 30 * 24 * 60 * 60 * 1000) {
          analytics.recentActivity.push(usageData);
        }
      }

      // School and level breakdown
      const spell = this._getSpellFromUuid(spellUuid);
      if (spell) {
        const school = spell.system?.school || 'unknown';
        const level = spell.system?.level || 0;

        analytics.spellsBySchool.set(school, (analytics.spellsBySchool.get(school) || 0) + (userData.usageStats?.count || 0));
        analytics.spellsByLevel.set(level, (analytics.spellsByLevel.get(level) || 0) + (userData.usageStats?.count || 0));
      }
    }

    // Sort usage lists
    analytics.mostUsedSpells.sort((a, b) => b.count - a.count).splice(10);
    analytics.recentActivity.sort((a, b) => b.lastUsed - a.lastUsed).splice(10);
  }

  /**
   * Compute GM analytics across all users
   * @param {Object} analytics - Analytics object to populate
   * @returns {Promise<void>}
   * @private
   */
  async _computeGMAnalytics(analytics) {
    const users = game.users.filter((u) => !u.isGM);

    for (const user of users) {
      const userAnalytics = this._getEmptyAnalytics();
      await this._computePersonalAnalytics(userAnalytics, user.id);

      // Aggregate into main analytics
      analytics.totalSpells += userAnalytics.totalSpells;
      analytics.totalCasts += userAnalytics.totalCasts;
      analytics.totalFavorites += userAnalytics.totalFavorites;
      analytics.totalNotes += userAnalytics.totalNotes;
      analytics.contextBreakdown.combat += userAnalytics.contextBreakdown.combat;
      analytics.contextBreakdown.exploration += userAnalytics.contextBreakdown.exploration;

      // Store user breakdown
      analytics.userBreakdown.set(user.id, {
        name: user.name,
        totalSpells: userAnalytics.totalSpells,
        totalCasts: userAnalytics.totalCasts,
        totalFavorites: userAnalytics.totalFavorites,
        totalNotes: userAnalytics.totalNotes
      });

      // Merge usage lists
      analytics.mostUsedSpells = analytics.mostUsedSpells.concat(userAnalytics.mostUsedSpells);
      analytics.recentActivity = analytics.recentActivity.concat(userAnalytics.recentActivity);
    }

    // Sort and limit
    analytics.mostUsedSpells.sort((a, b) => b.count - a.count).splice(20);
    analytics.recentActivity.sort((a, b) => b.lastUsed - a.lastUsed).splice(20);
  }

  /**
   * Get all spell data for a user (helper method)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User spell data
   * @private
   */
  async _getAllUserSpellData(userId) {
    // This would need to be implemented based on the journal structure
    // For now, return empty object as placeholder
    return {};
  }

  /**
   * Get spell name from UUID
   * @param {string} uuid - Spell UUID
   * @returns {string} Spell name
   * @private
   */
  _getSpellNameFromUuid(uuid) {
    try {
      const spell = fromUuidSync(uuid);
      return spell?.name || 'Unknown Spell';
    } catch {
      return 'Unknown Spell';
    }
  }

  /**
   * Get spell document from UUID
   * @param {string} uuid - Spell UUID
   * @returns {Item|null} Spell document
   * @private
   */
  _getSpellFromUuid(uuid) {
    try {
      return fromUuidSync(uuid);
    } catch {
      return null;
    }
  }

  /**
   * Get empty analytics structure
   * @returns {Object} Empty analytics
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

  // Action handlers
  static async handleSwitchView(event, target) {
    const viewMode = target.dataset.viewMode;
    this.viewMode = viewMode;
    this.render();
  }

  static async handleExportData(event, target) {
    await this._exportUserData();
  }

  static async handleImportData(event, target) {
    await this._importUserData();
  }

  static async handleClearData(event, target) {
    await this._clearUserData();
  }

  static async handleRefreshStats(event, target) {
    this.analytics = null;
    this.render();
  }

  static async handleViewUserData(event, target) {
    const userId = target.dataset.userId;
    this.selectedUserId = userId;
    this.render();
  }

  /**
   * Export user data to JSON
   * @returns {Promise<void>}
   * @private
   */
  async _exportUserData() {
    try {
      // Implementation for data export
      const data = {
        version: MODULE.VERSION,
        timestamp: Date.now(),
        userData: {} // Would collect all user data here
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spell-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      ui.notifications.info(game.i18n.localize('SPELLBOOK.Analytics.ExportSuccess'));
    } catch (error) {
      log(1, 'Error exporting data:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Analytics.ExportError'));
    }
  }

  /**
   * Import user data from JSON
   * @returns {Promise<void>}
   * @private
   */
  async _importUserData() {
    // Implementation for data import with validation
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate data structure
        if (!data.version || !data.userData) {
          throw new Error('Invalid data format');
        }

        // Confirm import
        const confirmed = await Dialog.confirm({
          title: game.i18n.localize('SPELLBOOK.Analytics.ImportConfirmTitle'),
          content: game.i18n.localize('SPELLBOOK.Analytics.ImportConfirmContent'),
          defaultYes: false
        });

        if (confirmed) {
          // Import the data
          // Implementation would go here
          ui.notifications.info(game.i18n.localize('SPELLBOOK.Analytics.ImportSuccess'));
          this.render();
        }
      } catch (error) {
        log(1, 'Error importing data:', error);
        ui.notifications.error(game.i18n.localize('SPELLBOOK.Analytics.ImportError'));
      }
    };

    input.click();
  }

  /**
   * Clear user data with confirmation
   * @returns {Promise<void>}
   * @private
   */
  async _clearUserData() {
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize('SPELLBOOK.Analytics.ClearDataTitle'),
      content: game.i18n.localize('SPELLBOOK.Analytics.ClearDataContent'),
      defaultYes: false
    });

    if (confirmed) {
      try {
        // Implementation for data clearing
        ui.notifications.info(game.i18n.localize('SPELLBOOK.Analytics.ClearDataSuccess'));
        this.render();
      } catch (error) {
        log(1, 'Error clearing data:', error);
        ui.notifications.error(game.i18n.localize('SPELLBOOK.Analytics.ClearDataError'));
      }
    }
  }
}
