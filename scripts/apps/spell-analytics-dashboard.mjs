import { MODULE, TEMPLATES } from '../constants.mjs';
import { spellUserDataJournal } from '../helpers/spell-user-data.mjs';
import { log } from '../logger.mjs';
import { UserSpellDataManager } from '../managers/user-spell-data-manager.mjs';
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
      title: 'SPELLBOOK.Analytics.DashboardTitle',
      icon: 'fas fa-chart-bar'
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
    this.analytics = await this._computeAnalytics();
    const analyticsForTemplate = {
      ...this.analytics,
      userBreakdown: this.analytics.userBreakdown instanceof Map ? Object.fromEntries(this.analytics.userBreakdown) : this.analytics.userBreakdown
    };
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

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Set CSS custom properties for context bar percentages
    const combatElement = this.element.querySelector('.context-combat');
    const explorationElement = this.element.querySelector('.context-exploration');

    if (combatElement && explorationElement) {
      const combatPercent = this.analytics.contextBreakdown.combatPercent || 0;
      const explorationPercent = this.analytics.contextBreakdown.explorationPercent || 0;

      combatElement.style.width = `${combatPercent}%`;
      explorationElement.style.width = `${explorationPercent}%`;

      // Dynamically adjust font sizes based on width
      this._adjustContextBarFontSizes(combatElement, combatPercent);
      this._adjustContextBarFontSizes(explorationElement, explorationPercent);
    }
  }

  /**
   * Adjust font size of context bar labels based on available width
   * @param {HTMLElement} element - The context bar element
   * @param {number} percent - The percentage width
   * @private
   */
  _adjustContextBarFontSizes(element, percent) {
    const label = element.querySelector('.context-label');
    if (!label) return;

    let fontSize;
    if (percent <= 5) {
      fontSize = '0.65rem';
    } else if (percent <= 10) {
      fontSize = '0.7rem';
    } else if (percent <= 20) {
      fontSize = '0.75rem';
    } else if (percent <= 30) {
      fontSize = '0.8rem';
    } else {
      fontSize = '0.875rem';
    }

    label.style.fontSize = fontSize;
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
   * Get all spell data for a user (updated for per-actor aggregation)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Aggregated user spell data
   * @private
   */
  async _getAllUserSpellData(userId) {
    try {
      // Get the user page from journal
      const page = await spellUserDataJournal._getUserPage(userId);
      if (!page) return {};

      // Parse the HTML content using existing pattern
      const spellData = spellUserDataJournal._parseSpellDataFromHTML(page.text.content);

      // Aggregate actor data into user-level data for analytics
      const aggregatedData = {};

      for (const [spellUuid, data] of Object.entries(spellData)) {
        aggregatedData[spellUuid] = {
          notes: data.notes || '',
          favorited: false, // Will be true if ANY actor has it favorited
          usageStats: {
            count: 0,
            lastUsed: null,
            contextUsage: { combat: 0, exploration: 0 }
          }
        };

        // Aggregate across all actors for this user
        if (data.actorData) {
          for (const [actorId, actorData] of Object.entries(data.actorData)) {
            // If any actor has it favorited, consider it favorited for the user
            if (actorData.favorited) {
              aggregatedData[spellUuid].favorited = true;
            }

            // Aggregate usage stats across actors
            if (actorData.usageStats) {
              aggregatedData[spellUuid].usageStats.count += actorData.usageStats.count || 0;
              aggregatedData[spellUuid].usageStats.contextUsage.combat += actorData.usageStats.contextUsage?.combat || 0;
              aggregatedData[spellUuid].usageStats.contextUsage.exploration += actorData.usageStats.contextUsage?.exploration || 0;

              // Use the most recent lastUsed across all actors
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
   * Export user data to JSON with embedded HTML
   * @returns {Promise<void>}
   * @private
   */
  async _exportUserData() {
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

      const exportData = {
        version: MODULE.VERSION || '1.0.0',
        timestamp: Date.now(),
        exportedAt: new Date().toISOString(),
        exportedBy: game.user.name,
        viewMode: this.viewMode,
        userData: {}
      };

      if (this.viewMode === 'gm' && game.user.isGM) {
        // GM View: Export all users' data
        const users = game.users.filter((u) => !u.isGM);

        for (const user of users) {
          const page = await spellUserDataJournal._getUserPage(user.id);
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
        saveDataToFile(blob, { type: 'application/json' }, filename);
      } else {
        // Personal View: Export current user's data
        const user = game.users.get(this.selectedUserId);
        const page = await spellUserDataJournal._getUserPage(this.selectedUserId);

        if (page && user) {
          exportData.userData[user.id] = {
            userId: user.id,
            userName: user.name,
            htmlContent: page.text.content,
            lastUpdated: page.flags?.[MODULE.ID]?.lastUpdated || null
          };

          const filename = `${user.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-spell-data-${timestamp}.json`;
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          saveDataToFile(blob, { type: 'application/json' }, filename);
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
   * Import user data from JSON with embedded HTML
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
          throw new Error('Invalid JSON format');
        }

        // Validate data structure
        if (!importData.version || !importData.userData || typeof importData.userData !== 'object') {
          throw new Error('Invalid spell data format');
        }

        // Show import summary
        const userCount = Object.keys(importData.userData).length;
        const userNames = Object.values(importData.userData)
          .map((u) => u.userName)
          .join(', ');
        const exportDate = importData.exportedAt ? new Date(importData.exportedAt).toLocaleDateString() : 'Unknown';

        const summaryContent = `
        <div class="import-summary">
          <p><strong>Export Date:</strong> ${exportDate}</p>
          <p><strong>Exported By:</strong> ${importData.exportedBy || 'Unknown'}</p>
          <p><strong>Users:</strong> ${userCount}</p>
          <p><strong>Names:</strong> ${userNames}</p>
        </div>
        <p class="warning"><strong>Warning:</strong> This will overwrite existing spell data for these users.</p>
      `;

        // Confirm import using DialogV2
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
          // Verify user exists
          const user = game.users.get(userId);
          if (!user) {
            log(2, `Skipping import for non-existent user: ${userData.userName} (${userId})`);
            skippedCount++;
            continue;
          }

          // Get or create user page
          let page = await spellUserDataJournal._getUserPage(userId);
          if (!page) {
            log(2, `No existing page found for user ${user.name}, skipping import`);
            skippedCount++;
            continue;
          }

          // Update page with imported HTML content
          await page.update({
            'text.content': userData.htmlContent,
            [`flags.${MODULE.ID}.lastUpdated`]: Date.now(),
            [`flags.${MODULE.ID}.importedAt`]: Date.now(),
            [`flags.${MODULE.ID}.importedFrom`]: file.name
          });

          importedCount++;
        }

        // Clear cache
        spellUserDataJournal.cache.clear();

        const message =
          importedCount > 0 ?
            game.i18n.format('SPELLBOOK.Analytics.ImportSuccessWithCount', {
              imported: importedCount,
              skipped: skippedCount
            })
          : game.i18n.localize('SPELLBOOK.Analytics.ImportSuccess');

        ui.notifications.info(message);
        this.render();
      } catch (error) {
        log(1, 'Error importing data:', error);
        ui.notifications.error(
          game.i18n.format('SPELLBOOK.Analytics.ImportErrorWithDetail', {
            error: error.message
          })
        );
      }
    };

    input.click();
  }

  /**
   * Clear user data with confirmation (updated to use manager's function)
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
        // Clear all users' data (excluding gamemaster)
        const users = game.users.filter((u) => !u.isGM);
        for (const user of users) {
          const page = await spellUserDataJournal._getUserPage(user.id);
          if (page) {
            const emptyContent = manager._generateEmptyTablesHTML(user.name, user.id);
            await page.update({
              'text.content': emptyContent,
              [`flags.${MODULE.ID}.lastUpdated`]: Date.now(),
              [`flags.${MODULE.ID}.clearedAt`]: Date.now()
            });
            clearedCount++;
          }
        }
      } else {
        // Clear current user's data (only if not gamemaster)
        const user = game.users.get(this.selectedUserId);
        if (user && !user.isGM) {
          const page = await spellUserDataJournal._getUserPage(this.selectedUserId);
          if (page) {
            const emptyContent = manager._generateEmptyTablesHTML(user.name, user.id);
            await page.update({
              'text.content': emptyContent,
              [`flags.${MODULE.ID}.lastUpdated`]: Date.now(),
              [`flags.${MODULE.ID}.clearedAt`]: Date.now()
            });
            clearedCount = 1;
          }
        }
      }
      spellUserDataJournal.cache.clear();
      const message = clearedCount > 0 ? game.i18n.format('SPELLBOOK.Analytics.ClearDataSuccessWithCount', { count: clearedCount }) : game.i18n.localize('SPELLBOOK.Analytics.ClearDataSuccess');
      ui.notifications.info(message);
      this.render();
    } catch (error) {
      log(1, 'Error clearing data:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Analytics.ClearDataError'));
    }
  }
}
