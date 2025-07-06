import { MODULE, TEMPLATES } from '../constants.mjs';
import { spellUserDataJournal } from '../helpers/spell-user-data.mjs';
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
        const usageData = {
          uuid: spellUuid,
          name: spellName,
          count: userData.usageStats.count,
          lastUsed: userData.usageStats.lastUsed
        };
        analytics.mostUsedSpells.push(usageData);
        if (userData.usageStats.lastUsed && Date.now() - userData.usageStats.lastUsed < 30 * 24 * 60 * 60 * 1000) {
          analytics.recentActivity.push(usageData);
        }
      }
      const spell = this._getSpellFromUuid(spellUuid);
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
   * Get all spell data for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User spell data
   * @private
   */
  async _getAllUserSpellData(userId) {
    try {
      const page = await spellUserDataJournal._getUserPage(userId);
      if (!page) return {};
      const spellData = spellUserDataJournal._parseSpellDataFromHTML(page.text.content);
      return spellData;
    } catch (error) {
      log(1, 'Error fetching user spell data:', error);
      return {};
    }
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
   * Export user data to HTML files
   * @returns {Promise<void>}
   * @private
   */
  async _exportUserData() {
    try {
      const { spellUserDataJournal } = await import('../helpers/spell-user-data.mjs');

      if (this.viewMode === 'gm' && game.user.isGM) {
        // GM View: Export all users' data
        const zip = new JSZip();
        const users = game.users.filter((u) => !u.isGM);

        for (const user of users) {
          const page = await spellUserDataJournal._getUserPage(user.id);
          if (page) {
            zip.file(`${user.name}-spell-data.html`, page.text.content);
          }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `all-users-spell-data-${new Date().toISOString().split('T')[0]}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Personal View: Export current user's data
        const page = await spellUserDataJournal._getUserPage(this.selectedUserId);
        if (page) {
          const blob = new Blob([page.text.content], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${game.users.get(this.selectedUserId)?.name || 'user'}-spell-data-${new Date().toISOString().split('T')[0]}.html`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }

      ui.notifications.info(game.i18n.localize('SPELLBOOK.Analytics.ExportSuccess'));
    } catch (error) {
      log(1, 'Error exporting data:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Analytics.ExportError'));
    }
  }

  /**
   * Import user data from HTML files
   * @returns {Promise<void>}
   * @private
   */
  async _importUserData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html';
    input.multiple = this.viewMode === 'gm';
    input.onchange = async (event) => {
      const files = Array.from(event.target.files);
      if (!files.length) return;
      try {
        const confirmed = await Dialog.confirm({
          title: game.i18n.localize('SPELLBOOK.Analytics.ImportConfirmTitle'),
          content: game.i18n.localize('SPELLBOOK.Analytics.ImportConfirmContent'),
          defaultYes: false
        });
        if (!confirmed) return;
        const { spellUserDataJournal } = await import('../helpers/spell-user-data.mjs');
        for (const file of files) {
          const htmlContent = await file.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, 'text/html');
          const table = doc.querySelector('table[data-user-id]');
          const userId = table?.dataset.userId;
          if (userId) {
            const page = await spellUserDataJournal._getUserPage(userId);
            if (page) {
              await page.update({
                'text.content': htmlContent,
                [`flags.${MODULE.ID}.lastUpdated`]: Date.now()
              });
            }
          }
        }
        ui.notifications.info(game.i18n.localize('SPELLBOOK.Analytics.ImportSuccess'));
        this.render();
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
    if (!confirmed) return;
    try {
      const { spellUserDataJournal } = await import('../helpers/spell-user-data.mjs');
      if (this.viewMode === 'gm' && game.user.isGM) {
        const users = game.users.filter((u) => !u.isGM);
        for (const user of users) {
          const page = await spellUserDataJournal._getUserPage(user.id);
          if (page) {
            const emptyContent = this._generateEmptyTablesHTML(user.name);
            await page.update({
              'text.content': emptyContent,
              [`flags.${MODULE.ID}.lastUpdated`]: Date.now()
            });
          }
        }
      } else {
        const page = await spellUserDataJournal._getUserPage(this.selectedUserId);
        if (page) {
          const user = game.users.get(this.selectedUserId);
          const emptyContent = this._generateEmptyTablesHTML(user.name);
          await page.update({
            'text.content': emptyContent,
            [`flags.${MODULE.ID}.lastUpdated`]: Date.now()
          });
        }
      }
      spellUserDataJournal.cache.clear();
      ui.notifications.info(game.i18n.localize('SPELLBOOK.Analytics.ClearDataSuccess'));
      this.render();
    } catch (error) {
      log(1, 'Error clearing data:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Analytics.ClearDataError'));
    }
  }

  /**
   * Generate empty tables HTML for clearing data
   * @param {string} userName - User name
   * @returns {string} HTML content
   * @private
   */
  _generateEmptyTablesHTML(userName) {
    const notesTitle = game.i18n.localize('SPELLBOOK.UserData.NotesTitle');
    const usageTitle = game.i18n.localize('SPELLBOOK.UserData.UsageTitle');
    const spellCol = game.i18n.localize('SPELLBOOK.UserData.SpellColumn');
    const favoritedCol = game.i18n.localize('SPELLBOOK.UserData.FavoritedColumn');
    const notesCol = game.i18n.localize('SPELLBOOK.UserData.NotesColumn');
    const combatCol = game.i18n.localize('SPELLBOOK.UserData.CombatColumn');
    const explorationCol = game.i18n.localize('SPELLBOOK.UserData.ExplorationColumn');
    const totalCol = game.i18n.localize('SPELLBOOK.UserData.TotalColumn');
    const lastUsedCol = game.i18n.localize('SPELLBOOK.UserData.LastUsedColumn');
    return `
    <p><em>${game.i18n.localize('SPELLBOOK.UserData.PageDescription')}</em></p>
    <h2>${notesTitle}</h2>
    <table class="spell-book-data" data-table-type="spell-notes" data-user-id="${game.users.find((u) => u.name === userName)?.id}">
      <thead>
        <tr>
          <th>${spellCol}</th>
          <th>${favoritedCol}</th>
          <th>${notesCol}</th>
        </tr>
      </thead>
      <tbody>
        <!-- Spell notes will be populated automatically -->
      </tbody>
    </table>
    <h2>${usageTitle}</h2>
    <table class="spell-book-data" data-table-type="spell-usage" data-user-id="${game.users.find((u) => u.name === userName)?.id}">
      <thead>
        <tr>
          <th>${spellCol}</th>
          <th>${combatCol}</th>
          <th>${explorationCol}</th>
          <th>${totalCol}</th>
          <th>${lastUsedCol}</th>
        </tr>
      </thead>
      <tbody>
        <!-- Spell usage will be populated automatically -->
      </tbody>
    </table>
    <hr>
    <p><small><em>${game.i18n.localize('SPELLBOOK.UserData.AutoGenerated')}</em></small></p>
  `;
  }
}
