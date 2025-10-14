/**
 * User Spell Data Storage and Management
 *
 * Provides journal-based storage for user-specific spell data including notes,
 * favorites, and usage statistics. This module handles data persistence, caching,
 * and HTML table generation for user spell analytics and personalization features.
 *
 * Key features:
 * - User-specific spell notes and favorites
 * - Usage statistics tracking
 * - Journal-based persistent storage
 * - HTML table generation for analytics
 * - Actor-specific data organization
 * - Performance-optimized caching system
 *
 * @module DataHelpers/SpellUserData
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { UserSpellDataManager } from '../managers/_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * @typedef {Object} UserSpellData
 * @property {string} notes - User-written notes for the spell
 * @property {Object<string, ActorSpellData>} actorData - Per-actor spell data keyed by actor ID
 */

/**
 * @typedef {Object} ActorSpellData
 * @property {boolean} favorited - Whether the spell is favorited for this actor
 * @property {SpellUsageStats} usageStats - Usage statistics for this actor
 */

/**
 * @typedef {Object} SpellUsageStats
 * @property {number} count - Total number of times spell has been used
 * @property {number|null} lastUsed - Timestamp of last usage (null if never used)
 * @property {ContextUsageStats} contextUsage - Usage broken down by context
 */

/**
 * @typedef {Object} ContextUsageStats
 * @property {number} combat - Number of times used in combat
 * @property {number} exploration - Number of times used during exploration
 */

/**
 * @typedef {Object} EnhancedSpellData
 * @property {UserSpellData|null} userData - Complete user data for the spell
 * @property {boolean} favorited - Whether the spell is favorited (for convenience)
 * @property {boolean} hasNotes - Whether the spell has user notes
 * @property {number} usageCount - Total usage count (for convenience)
 * @property {number|null} lastUsed - Last usage timestamp (for convenience)
 */

/**
 * @typedef {Object} TableRowData
 * @property {string} uuid - Spell UUID for the table row
 * @property {string} name - Spell name for display
 * @property {string} [notes] - User notes content
 * @property {SpellUsageStats} [stats] - Usage statistics
 * @property {string} [lastUsedDate] - Formatted last used date
 */

/**
 * @typedef {Object} ActorTableData
 * @property {string} id - Actor ID
 * @property {string} name - Actor display name
 * @property {Array<TableRowData>} favoriteSpells - Spells favorited by this actor
 * @property {Array<TableRowData>} usageSpells - Spells with usage data for this actor
 */

/**
 * @typedef {Object} UserPageData
 * @property {boolean} isGM - Whether the user is a GM
 * @property {string} userId - User ID for the page
 * @property {string} userName - User display name
 * @property {Array<ActorTableData>} [userActors] - Actor data for non-GM users
 * @property {Array<TableRowData>} [notesSpells] - Spells with notes
 * @property {string} [notesTitle] - Localized notes section title
 * @property {string} [spellCol] - Localized spell column header
 * @property {string} [notesCol] - Localized notes column header
 * @property {string} [favoritesTitle] - Localized favorites section title
 * @property {string} [usageTitle] - Localized usage section title
 * @property {string} [favoritedCol] - Localized favorited column header
 * @property {string} [combatCol] - Localized combat column header
 * @property {string} [explorationCol] - Localized exploration column header
 * @property {string} [totalCol] - Localized total column header
 * @property {string} [lastUsedCol] - Localized last used column header
 */

/**
 * @typedef {Object} HTMLTableContext
 * @property {string} tableType - Type of table ('spell-notes', 'spell-favorites', 'spell-usage')
 * @property {string} [actorId] - Actor ID for actor-specific tables
 * @property {Array<HTMLTableRowElement>} rows - Table rows containing data
 */

/**
 * Journal-based spell user data storage system.
 * Manages user-specific spell data including notes, favorites, and usage statistics
 * using HTML tables stored in journal pages for persistence and sharing.
 */
export class SpellUserDataJournal {
  /**
   * Cache for user spell data to improve performance.
   * Maps cache keys to user data objects to avoid repeated parsing.
   * @type {Map<string, UserSpellData|null>}
   * @static
   */
  static cache = new Map();

  /**
   * Standard name for the user spell data journal.
   * @type {string}
   * @static
   */
  static journalName = 'User Spell Data';

  /**
   * Get the user spell data journal from the user data pack.
   * Searches for the main journal that contains all user spell data pages.
   *
   * @returns {Promise<JournalEntry|null>} Promise that resolves to the user spell data journal or null if not found
   * @static
   * @private
   */
  static async _getJournal() {
    const pack = game.packs.get(MODULE.PACK.USERDATA);
    if (!pack) return null;
    const documents = await pack.getDocuments();
    return documents.find((doc) => doc.name === this.journalName && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);
  }

  /**
   * Get user page from journal for spell data storage.
   * Finds the specific page within the user data journal that belongs
   * to the specified user for their personal spell data.
   *
   * @param {string} userId - User ID to get page for
   * @returns {Promise<JournalEntryPage|null>} The user's page or null if not found
   * @static
   * @private
   */
  static async _getUserPage(userId) {
    const journal = await this._getJournal();
    if (!journal) return null;
    return journal.pages.find((page) => page.flags?.[MODULE.ID]?.userId === userId);
  }

  /**
   * Parse spell data from HTML tables with per-actor structure support.
   * Extracts user spell data from the structured HTML tables stored in journal pages,
   * handling notes, favorites, and usage statistics across multiple actors.
   *
   * @param {string} htmlContent - The page HTML content to parse
   * @returns {Object<string, UserSpellData>} Parsed spell data object keyed by spell UUID
   * @static
   * @private
   */
  static _parseSpellDataFromHTML(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    /** @type {Object<string, UserSpellData>} */
    const spellData = {};
    const notesTable = doc.querySelector('table[data-table-type="spell-notes"]');
    if (notesTable) {
      const rows = notesTable.querySelectorAll('tbody tr[data-spell-uuid]');
      rows.forEach((row) => {
        const uuid = row.dataset.spellUuid;
        const notesCell = row.querySelector('td:nth-child(2)');
        const notes = notesCell ? notesCell.textContent.trim() : '';
        if (!spellData[uuid]) spellData[uuid] = { notes: '', actorData: {} };
        spellData[uuid].notes = notes;
      });
    }
    const favoriteTables = doc.querySelectorAll('table[data-table-type="spell-favorites"]');
    favoriteTables.forEach((table) => {
      const actorId = table.dataset.actorId;
      if (!actorId) return;
      const rows = table.querySelectorAll('tbody tr[data-spell-uuid]');
      rows.forEach((row) => {
        const uuid = row.dataset.spellUuid;
        const favoritedCell = row.querySelector('td:nth-child(2)');
        const favorited = favoritedCell && favoritedCell.textContent.trim().toLowerCase() === 'yes';
        if (!spellData[uuid]) spellData[uuid] = { notes: '', actorData: {} };
        if (!spellData[uuid].actorData[actorId]) spellData[uuid].actorData[actorId] = { favorited: false, usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } } };
        spellData[uuid].actorData[actorId].favorited = favorited;
      });
    });
    const usageTables = doc.querySelectorAll('table[data-table-type="spell-usage"]');
    usageTables.forEach((table) => {
      const actorId = table.dataset.actorId;
      if (!actorId) return;
      const rows = table.querySelectorAll('tbody tr[data-spell-uuid]');
      rows.forEach((row) => {
        const uuid = row.dataset.spellUuid;
        const combatCell = row.querySelector('td:nth-child(2)');
        const explorationCell = row.querySelector('td:nth-child(3)');
        const totalCell = row.querySelector('td:nth-child(4)');
        const lastUsedCell = row.querySelector('td:nth-child(5)');
        const combatCount = combatCell ? parseInt(combatCell.textContent.trim()) || 0 : 0;
        const explorationCount = explorationCell ? parseInt(explorationCell.textContent.trim()) || 0 : 0;
        const totalCount = totalCell ? parseInt(totalCell.textContent.trim()) || 0 : 0;
        const lastUsedText = lastUsedCell ? lastUsedCell.textContent.trim() : null;
        const lastUsed = lastUsedText && lastUsedText !== '-' ? new Date(lastUsedText).getTime() : null;
        if (!spellData[uuid]) spellData[uuid] = { notes: '', actorData: {} };
        if (!spellData[uuid].actorData[actorId]) spellData[uuid].actorData[actorId] = { favorited: false, usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } } };
        spellData[uuid].actorData[actorId].usageStats = { count: totalCount, lastUsed: lastUsed, contextUsage: { combat: combatCount, exploration: explorationCount } };
      });
    });
    return spellData;
  }

  /**
   * Generate HTML tables from spell data for journal storage.
   * Creates structured HTML tables containing user spell data for persistent
   * storage in journal pages, with separate handling for GM and player data.
   *
   * @param {Object<string, UserSpellData>} spellData - The spell data to convert to HTML
   * @param {string} userName - Name of the user for display headers
   * @param {string} userId - User ID for the data context
   * @returns {Promise<string>} Generated HTML tables content ready for journal storage
   * @static
   * @private
   */
  static async _generateTablesHTML(spellData, userName, userId) {
    const notesTitle = game.i18n.localize('SPELLBOOK.UserData.SpellNotes');
    const spellCol = game.i18n.localize('SPELLBOOK.UserData.SpellColumn');
    const notesCol = game.i18n.localize('SPELLBOOK.UserData.NotesColumn');
    const favoritesTitle = game.i18n.localize('SPELLBOOK.UserData.FavoritesTitle');
    const usageTitle = game.i18n.localize('SPELLBOOK.UserData.UsageTitle');
    const favoritedCol = game.i18n.localize('SPELLBOOK.UserData.FavoritedColumn');
    const combatCol = game.i18n.localize('SPELLBOOK.UserData.CombatColumn');
    const explorationCol = game.i18n.localize('SPELLBOOK.UserData.ExplorationColumn');
    const totalCol = game.i18n.localize('SPELLBOOK.UserData.TotalColumn');
    const lastUsedCol = game.i18n.localize('SPELLBOOK.UserData.LastUsedColumn');
    const user = game.users.get(userId);
    const isGM = user?.isGM;
    if (isGM) return await renderTemplate(TEMPLATES.COMPONENTS.USER_SPELL_DATA_TABLES, { isGM: true, userId, userName });
    const userActors = game.actors.filter((actor) => actor.type === 'character' && (actor.ownership[userId] === 3 || user?.character?.id === actor.id));

    /** @type {Array<ActorTableData>} */
    const processedActors = userActors.map((actor) => {
      /** @type {Array<TableRowData>} */
      const favoriteSpells = [];

      /** @type {Array<TableRowData>} */
      const usageSpells = [];
      for (const [uuid, data] of Object.entries(spellData)) {
        const actorData = data.actorData?.[actor.id];
        if (actorData?.favorited) {
          try {
            const spell = fromUuidSync(uuid);
            const spellName = spell?.name || game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
            favoriteSpells.push({ uuid, name: spellName });
          } catch (error) {
            log(2, `Could not resolve spell UUID ${uuid} for favorites table`, error);
          }
        }
        if (actorData?.usageStats && actorData.usageStats.count > 0) {
          try {
            const spell = fromUuidSync(uuid);
            const spellName = spell?.name || game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
            const stats = actorData.usageStats;
            const lastUsedDate = stats.lastUsed ? new Date(stats.lastUsed).toLocaleDateString() : '-';
            usageSpells.push({ uuid, name: spellName, stats, lastUsedDate });
          } catch (error) {
            log(2, `Could not resolve spell UUID ${uuid} for usage table`, error);
          }
        }
      }
      return { id: actor.id, name: actor.name, favoriteSpells, usageSpells };
    });
    /** @type {Array<TableRowData>} */
    const notesSpells = [];
    for (const [uuid, data] of Object.entries(spellData)) {
      if (data.notes && data.notes.trim()) {
        try {
          const spell = fromUuidSync(uuid);
          const spellName = spell?.name || game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
          notesSpells.push({ uuid, name: spellName, notes: data.notes });
        } catch (error) {
          log(2, `Could not resolve spell UUID ${uuid} for notes table`, error);
        }
      }
    }
    return await renderTemplate(TEMPLATES.COMPONENTS.USER_SPELL_DATA_TABLES, {
      isGM: false,
      userId,
      userName,
      userActors: processedActors,
      notesSpells,
      notesTitle,
      spellCol,
      notesCol,
      favoritesTitle,
      usageTitle,
      favoritedCol,
      combatCol,
      explorationCol,
      totalCol,
      lastUsedCol
    });
  }

  /**
   * Get user data for a specific spell, creating missing infrastructure as needed.
   * Retrieves cached or stored user data for a spell, with automatic infrastructure
   * creation and canonical UUID resolution for consistent data access.
   *
   * @param {string|Object} spellOrUuid - Spell UUID or spell object to get data for
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @param {string} [actorId=null] - Actor ID for actor-specific data
   * @returns {Promise<UserSpellData|null>} User data object or null if unavailable
   * @static
   */
  static async getUserDataForSpell(spellOrUuid, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return null;
      let canonicalUuid = spellUuid;
      if (foundry.utils.parseUuid(spellUuid).primaryType === 'Actor') {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?._stats?.compendiumSource || spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
        } catch (error) {
          log(1, 'Error:', error);
          canonicalUuid = spellUuid;
        }
      }
      const targetUserId = userId || game.user.id;
      const cacheKey = actorId ? `${targetUserId}:${actorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (cached === null) return null;
        return cached;
      }
      await this._ensureUserDataInfrastructure(targetUserId);
      const page = await this._getUserPage(targetUserId);
      if (!page) {
        log(1, `Failed to create or find user page for user ${targetUserId}`);
        this.cache.set(cacheKey, null);
        return null;
      }
      const spellData = this._parseSpellDataFromHTML(page.text.content);
      const userData = spellData[canonicalUuid];
      let result;
      if (!userData) result = { notes: '', favorited: false, usageStats: null };
      else if (actorId && userData.actorData?.[actorId]) result = { ...userData.actorData[actorId], notes: userData.notes };
      else result = { notes: userData.notes || '', favorited: false, usageStats: null };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      log(1, 'Error getting user spell data:', error);
      const cacheKey = actorId ? `${userId || game.user.id}:${actorId}:${spellOrUuid}` : `${userId || game.user.id}:${spellOrUuid}`;
      this.cache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Set user data for a spell with automatic infrastructure management.
   * Updates user spell data in persistent storage, handling both global
   * notes and actor-specific favorites and usage statistics.
   *
   * @param {string|Object} spellOrUuid - Spell UUID or spell object to set data for
   * @param {Object} data - Data to set (notes, favorited, usageStats)
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @param {string} [actorId=null] - Actor ID for actor-specific data
   * @returns {Promise<boolean>} Success status of the update operation
   * @static
   */
  static async setUserDataForSpell(spellOrUuid, data, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return false;
      let canonicalUuid = spellUuid;
      if (foundry.utils.parseUuid(spellUuid).primaryType === 'Actor') {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?._stats?.compendiumSource || spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
        } catch (error) {
          log(1, 'Error:', error);
          canonicalUuid = spellUuid;
        }
      }
      const targetUserId = userId || game.user.id;
      const user = game.users.get(targetUserId);
      if (!user) return false;
      const page = await this._getUserPage(targetUserId);
      if (!page) return false;
      const spellData = this._parseSpellDataFromHTML(page.text.content);
      if (!spellData[canonicalUuid]) spellData[canonicalUuid] = { notes: '', actorData: {} };
      if (actorId) {
        if (!spellData[canonicalUuid].actorData[actorId]) {
          spellData[canonicalUuid].actorData[actorId] = { favorited: false, usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } } };
        }
        if (data.favorited !== undefined) spellData[canonicalUuid].actorData[actorId].favorited = data.favorited;
        if (data.usageStats !== undefined) spellData[canonicalUuid].actorData[actorId].usageStats = data.usageStats;
      } else if (data.notes !== undefined) spellData[canonicalUuid].notes = data.notes;
      const newContent = await this._generateTablesHTML(spellData, user.name, targetUserId);
      await page.update({ 'text.content': newContent, [`flags.${MODULE.ID}.lastUpdated`]: Date.now() });
      const cacheKey = actorId ? `${targetUserId}:${actorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      this.cache.set(cacheKey, spellData[canonicalUuid]);
      log(3, `Updated spell data in journal for ${canonicalUuid}`);
      return true;
    } catch (error) {
      log(1, 'Error setting user spell data in journal:', error);
      return false;
    }
  }

  /**
   * Enhance spell with user data for UI display.
   * Adds user-specific data to spell objects including favorites status,
   * notes indicators, and usage statistics for enhanced UI presentation.
   *
   * @param {Object} spell - Spell object to enhance with user data
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @param {string} [actorId=null] - Actor ID for actor-specific data
   * @returns {EnhancedSpellData} Enhanced spell object with user data properties added
   * @returns {Object} Spell object
   * @static
   */
  static enhanceSpellWithUserData(spell, userId = null, actorId = null) {
    const spellUuid = spell?.compendiumUuid || spell?.uuid;
    if (!spellUuid) return spell;
    let canonicalUuid = spellUuid;
    if (foundry.utils.parseUuid(spellUuid).primaryType === 'Actor') {
      try {
        const spellDoc = fromUuidSync(spellUuid);
        if (spellDoc?._stats?.compendiumSource || spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
      } catch (error) {
        log(1, 'Error:', error);
        canonicalUuid = spellUuid;
      }
    }
    const targetUserId = userId || game.user.id;
    const cacheKey = actorId ? `${targetUserId}:${actorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
    const userData = this.cache.get(cacheKey) || null;
    let favorited = false;
    let usageCount = 0;
    let lastUsed = null;
    if (userData) {
      favorited = userData.favorited;
      usageCount = userData.usageStats?.count || 0;
      lastUsed = userData.usageStats?.lastUsed || null;
    }
    return { ...spell, userData: userData, favorited: favorited, hasNotes: !!(userData?.notes && userData.notes.trim()), usageCount: usageCount, lastUsed: lastUsed };
  }

  /**
   * Set spell favorite status for a specific actor.
   * Updates the favorite status of a spell for a particular actor,
   * managing the underlying data structure and cache updates.
   *
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {boolean} favorited - New favorite status to set
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @param {string} [actorId=null] - Actor ID (defaults to user's character)
   * @returns {Promise<boolean>} Success status of the operation
   * @static
   */
  static async setSpellFavorite(spellOrUuid, favorited, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return false;
      let canonicalUuid = spellUuid;
      const parsedUuid = foundry.utils.parseUuid(spellUuid);
      if (parsedUuid.documentType === 'Actor' || parsedUuid.primaryType === 'Actor') {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?._stats?.compendiumSource || spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
        } catch (error) {
          log(1, 'Error:', error);
          canonicalUuid = spellUuid;
        }
      }
      const targetUserId = userId || game.user.id;
      const targetActorId = actorId || game.user.character?.id;
      const user = game.users.get(targetUserId);
      if (!user) return false;
      const page = await this._getUserPage(targetUserId);
      if (!page) return false;
      const spellData = this._parseSpellDataFromHTML(page.text.content);
      if (!spellData[canonicalUuid]) spellData[canonicalUuid] = { notes: '', actorData: {} };
      if (targetActorId) {
        if (!spellData[canonicalUuid].actorData[targetActorId]) {
          spellData[canonicalUuid].actorData[targetActorId] = { favorited: false, usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } } };
        }
        spellData[canonicalUuid].actorData[targetActorId].favorited = favorited;
      }
      const newContent = await this._generateTablesHTML(spellData, user.name, targetUserId);
      await page.update({ 'text.content': newContent, [`flags.${MODULE.ID}.lastUpdated`]: Date.now() });
      const cacheKey = targetActorId ? `${targetUserId}:${targetActorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      if (targetActorId) this.cache.set(cacheKey, { ...spellData[canonicalUuid].actorData[targetActorId], notes: spellData[canonicalUuid].notes });
      else this.cache.set(cacheKey, { notes: spellData[canonicalUuid].notes || '', favorited: false, usageStats: null });
      log(3, `Updated spell favorite status for ${canonicalUuid}: ${favorited}`);
      return true;
    } catch (error) {
      log(1, 'Error setting spell favorite:', error);
      return false;
    }
  }

  /**
   * Set spell notes with length validation.
   * Updates user notes for a spell with automatic truncation based on
   * module settings and proper cache management.
   *
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {string} notes - Notes text to set
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @returns {Promise<boolean>} Success status of the operation
   * @static
   */
  static async setSpellNotes(spellOrUuid, notes, userId = null) {
    try {
      const maxLength = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH) || 240;
      const trimmedNotes = notes ? notes.substring(0, maxLength) : '';
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return false;
      let canonicalUuid = spellUuid;
      const parsedUuid = foundry.utils.parseUuid(spellUuid);
      if (parsedUuid.documentType === 'Actor' || parsedUuid.primaryType === 'Actor') {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?._stats?.compendiumSource || spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
        } catch (error) {
          log(1, 'Error:', error);
          canonicalUuid = spellUuid;
        }
      }
      const targetUserId = userId || game.user.id;
      const user = game.users.get(targetUserId);
      if (!user) return false;
      const page = await this._getUserPage(targetUserId);
      if (!page) return false;
      const spellData = this._parseSpellDataFromHTML(page.text.content);
      if (!spellData[canonicalUuid]) spellData[canonicalUuid] = { notes: '', actorData: {} };
      spellData[canonicalUuid].notes = trimmedNotes;
      const newContent = await this._generateTablesHTML(spellData, user.name, targetUserId);
      await page.update({ 'text.content': newContent, [`flags.${MODULE.ID}.lastUpdated`]: Date.now() });
      const cacheKey = `${targetUserId}:${canonicalUuid}`;
      this.cache.set(cacheKey, spellData[canonicalUuid]);
      log(3, `Updated spell notes for ${canonicalUuid}`);
      return true;
    } catch (error) {
      log(1, 'Error setting spell notes:', error);
      return false;
    }
  }

  /**
   * Ensure user data infrastructure exists (journal, page, etc.).
   * Creates the necessary journal and page structure for user spell data
   * storage if it doesn't already exist, with proper error handling.
   *
   * @param {string} userId - User ID to ensure data infrastructure for
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async _ensureUserDataInfrastructure(userId) {
    try {
      let journal = await this._getJournal();
      if (!journal) {
        const manager = new UserSpellDataManager();
        await manager._ensureJournalSetup();
        journal = await this._getJournal();
      }
      if (!journal) {
        log(1, 'Failed to create user spell data journal');
        return;
      }
      const existingPage = await this._getUserPage(userId);
      if (!existingPage) {
        const user = game.users.get(userId);
        if (!user) {
          log(2, `User ${userId} not found, cannot create user data page`);
          return;
        }
        const pageData = {
          name: user.name,
          type: 'text',
          title: { show: true, level: 1 },
          text: { format: 1, content: await this._generateEmptyUserDataHTML(user.name, userId) },
          ownership: { default: 0, [userId]: 3 },
          flags: { [MODULE.ID]: { userId: userId, userName: user.name, isUserSpellData: true, created: Date.now(), lastUpdated: Date.now(), dataVersion: '2.0' } },
          sort: 99999
        };
        if (game.user.isGM) pageData.ownership[game.user.id] = 3;
        await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
        log(3, `Created user data page for user: ${user.name}`);
      }
    } catch (error) {
      log(1, 'Error ensuring user data infrastructure:', error);
    }
  }

  /**
   * Generate empty user data HTML structure.
   * Creates the initial HTML structure for a new user's spell data page
   * using the manager's template system.
   *
   * @param {string} userName - User display name for the page
   * @param {string} userId - User ID for the data context
   * @returns {Promise<string>} HTML content for empty user data page
   * @static
   * @private
   */
  static async _generateEmptyUserDataHTML(userName, userId) {
    try {
      const manager = new UserSpellDataManager();
      return await manager._generateEmptyTablesHTML(userName, userId);
    } catch (error) {
      log(1, 'Error generating empty user data HTML:', error);
      return null;
    }
  }
}
