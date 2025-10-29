/**
 * User Spell Data Storage and Management
 *
 * Provides journal-based storage for user-specific spell data including notes,
 * favorites, and usage statistics. This module handles data persistence, caching,
 * and HTML table generation for user spell analytics and personalization features.
 *
 * @module DataUtils/SpellUserData
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { UserDataSetup } from '../managers/_module.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Journal-based spell user data storage system.
 */
export class UserData {
  /**
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
   * @returns {Promise<JournalEntry|null>} Promise that resolves to the user spell data journal or null if not found
   * @static
   * @private
   */
  static async _getJournal() {
    log(3, 'Getting journal for user spell data.');
    const documents = await game.packs.get(MODULE.PACK.USERDATA).getDocuments();
    return documents.find((doc) => doc.name === this.journalName && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);
  }

  /**
   * Get user page from journal for spell data storage.
   * @param {string} userId - User ID to get page for
   * @returns {Promise<JournalEntryPage|null>} The user's page or null if not found
   * @static
   * @private
   */
  static async _getUserPage(userId) {
    log(3, 'Getting journal page for:', { userId });
    const journal = await this._getJournal();
    return journal.pages.find((page) => page.flags?.[MODULE.ID]?.userId === userId);
  }

  /**
   * Parse spell data from HTML tables with per-actor structure support.
   * @param {string} htmlContent - The page HTML content to parse
   * @returns {Object<string, UserSpellData>} Parsed spell data object keyed by spell UUID
   * @static
   * @private
   */
  static _parseSpellDataFromHTML(htmlContent) {
    log(3, 'Parsing spell data from HTML.');
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
   * @param {Object<string, UserSpellData>} spellData - The spell data to convert to HTML
   * @param {string} userName - Name of the user for display headers
   * @param {string} userId - User ID for the data context
   * @returns {Promise<string>} Generated HTML tables content ready for journal storage
   * @static
   * @private
   */
  static async _generateTablesHTML(spellData, userName, userId) {
    log(3, 'Generating HTML tables.', { spellData, userName, userId });
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
          const spell = fromUuidSync(uuid);
          const spellName = spell?.name || game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
          favoriteSpells.push({ uuid, name: spellName });
        }
        if (actorData?.usageStats && actorData.usageStats.count > 0) {
          const spell = fromUuidSync(uuid);
          const spellName = spell?.name || game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
          const stats = actorData.usageStats;
          const lastUsedDate = stats.lastUsed ? foundry.utils.timeSince(stats.lastUsed) : '-';
          usageSpells.push({ uuid, name: spellName, stats, lastUsedDate });
        }
      }
      return { id: actor.id, name: actor.name, favoriteSpells, usageSpells };
    });
    /** @type {Array<TableRowData>} */
    const notesSpells = [];
    for (const [uuid, data] of Object.entries(spellData)) {
      if (data.notes && data.notes.trim()) {
        const spell = fromUuidSync(uuid);
        const spellName = spell?.name || game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
        notesSpells.push({ uuid, name: spellName, notes: data.notes });
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
   * @param {string|Object} spellOrUuid - Spell UUID or spell object to get data for
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @param {string} [actorId=null] - Actor ID for actor-specific data
   * @returns {Promise<UserSpellData|null>} User data object or null if unavailable
   * @static
   */
  static async getUserDataForSpell(spellOrUuid, userId = null, actorId = null) {
    const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
    if (!spellUuid) return null;
    let canonicalUuid = spellUuid;
    if (foundry.utils.parseUuid(spellUuid).primaryType === 'Actor') {
      const spellDoc = fromUuidSync(spellUuid);
      if (spellDoc?._stats?.compendiumSource) canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
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
  }

  /**
   * Set user data for a spell with automatic infrastructure management.
   * @param {string|Object} spellOrUuid - Spell UUID or spell object to set data for
   * @param {Object} data - Data to set (notes, favorited, usageStats)
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @param {string} [actorId=null] - Actor ID for actor-specific data
   * @returns {Promise<boolean>} Success status of the update operation
   * @static
   */
  static async setUserDataForSpell(spellOrUuid, data, userId = null, actorId = null) {
    log(3, 'Setting user data for spell', { spellOrUuid, data, userId, actorId });
    const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
    if (!spellUuid) return false;
    let canonicalUuid = spellUuid;
    if (foundry.utils.parseUuid(spellUuid).primaryType === 'Actor') {
      const spellDoc = fromUuidSync(spellUuid);
      canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
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
    return true;
  }

  /**
   * Enhance spell with user data for UI display.
   * @param {Object} spell - Spell object to enhance with user data
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @param {string} [actorId=null] - Actor ID for actor-specific data
   * @returns {EnhancedSpellData} Enhanced spell object with user data properties added
   * @static
   */
  static enhanceSpellWithUserData(spell, userId = null, actorId = null) {
    log(3, 'Enhancing spell with user data.', { spell, userId, actorId });
    const spellUuid = spell?.compendiumUuid || spell?.uuid;
    if (!spellUuid) return spell;
    let canonicalUuid = spellUuid;
    if (foundry.utils.parseUuid(spellUuid).primaryType === 'Actor') {
      const spellDoc = fromUuidSync(spellUuid);
      canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
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
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {boolean} favorited - New favorite status to set
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @param {string} [actorId=null] - Actor ID (defaults to user's character)
   * @returns {Promise<boolean>} Success status of the operation
   * @static
   */
  static async setSpellFavorite(spellOrUuid, favorited, userId = null, actorId = null) {
    log(3, 'Setting spell as favorite.', { spellOrUuid, favorited, userId, actorId });
    const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
    if (!spellUuid) return false;
    let canonicalUuid = spellUuid;
    const parsedUuid = foundry.utils.parseUuid(spellUuid);
    if (parsedUuid.documentType === 'Actor' || parsedUuid.primaryType === 'Actor') {
      const spellDoc = fromUuidSync(spellUuid);
      if (spellDoc?._stats?.compendiumSource) canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
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
    return true;
  }

  /**
   * Set spell notes with length validation.
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {string} notes - Notes text to set
   * @param {string} [userId=null] - User ID (defaults to current user)
   * @returns {Promise<boolean>} Success status of the operation
   * @static
   */
  static async setSpellNotes(spellOrUuid, notes, userId = null) {
    log(3, 'Setting spell notes.', { spellOrUuid, notes, userId });
    const maxLength = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH) || 240;
    const trimmedNotes = notes ? foundry.utils.cleanHTML(notes.substring(0, maxLength)) : '';
    const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
    if (!spellUuid) return false;
    let canonicalUuid = spellUuid;
    const parsedUuid = foundry.utils.parseUuid(spellUuid);
    if (parsedUuid.documentType === 'Actor' || parsedUuid.primaryType === 'Actor') {
      const spellDoc = fromUuidSync(spellUuid);
      if (spellDoc?._stats?.compendiumSource) canonicalUuid = spellDoc._stats?.compendiumSource || spellDoc.flags.core.sourceId;
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
    return true;
  }

  /**
   * Ensure user data infrastructure exists (journal, page, etc.).
   * @param {string} userId - User ID to ensure data infrastructure for
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async _ensureUserDataInfrastructure(userId) {
    log(3, 'Ensure user data infrastructure.', { userId });
    let journal = await this._getJournal();
    const manager = new UserDataSetup();
    const existingPage = await this._getUserPage(userId);
    if (!existingPage) {
      const user = game.users.get(userId);
      if (!user) return;
      const pageData = {
        name: user.name,
        type: 'text',
        title: { show: true, level: 1 },
        text: { format: 1, content: await manager._generateEmptyTablesHTML(user.name, userId) },
        ownership: { default: 0, [userId]: 3 },
        flags: { [MODULE.ID]: { userId: userId, userName: user.name, isUserSpellData: true, created: Date.now(), lastUpdated: Date.now(), dataVersion: '2.0' } },
        sort: 99999
      };
      if (game.user.isGM) pageData.ownership[game.user.id] = 3;
      await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
    }
  }
}
