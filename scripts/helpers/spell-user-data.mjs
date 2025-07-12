import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Journal-based spell user data storage
 */
export class SpellUserDataJournal {
  static cache = new Map();
  static journalName = 'User Spell Data';

  /**
   * Get the user spell data journal
   * @returns {Promise<JournalEntry|null>}
   */
  static async _getJournal() {
    const pack = game.packs.get(MODULE.PACK.USERDATA);
    if (!pack) return null;
    const documents = await pack.getDocuments();
    return documents.find((doc) => doc.name === this.journalName && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);
  }

  /**
   * Get user page from journal for spell data storage
   * @async
   * @static
   * @private
   * @param {string} userId - User ID to get page for
   * @returns {Promise<JournalEntryPage|null>} The user's page or null if not found
   */
  static async _getUserPage(userId) {
    const journal = await this._getJournal();
    if (!journal) return null;
    return journal.pages.find((page) => page.flags?.[MODULE.ID]?.userId === userId);
  }

  /**
   * Parse spell data from HTML tables with per-actor structure support
   * @static
   * @private
   * @param {string} htmlContent - The page HTML content to parse
   * @returns {Object} Parsed spell data object
   */
  static _parseSpellDataFromHTML(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
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
        if (!spellData[uuid].actorData[actorId]) {
          spellData[uuid].actorData[actorId] = {
            favorited: false,
            usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
          };
        }
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
        if (!spellData[uuid].actorData[actorId]) {
          spellData[uuid].actorData[actorId] = {
            favorited: false,
            usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
          };
        }
        spellData[uuid].actorData[actorId].usageStats = {
          count: totalCount,
          lastUsed: lastUsed,
          contextUsage: { combat: combatCount, exploration: explorationCount }
        };
      });
    });
    return spellData;
  }

  /**
   * Generate HTML tables from spell data for journal storage
   * @static
   * @private
   * @param {Object} spellData - The spell data to convert to HTML
   * @param {string} userName - Name of the user for display
   * @param {string} userId - User ID for the data
   * @returns {string} Generated HTML tables content
   */
  static async _generateTablesHTML(spellData, userName, userId) {
    const renderTemplate = MODULE.ISV13 ? foundry?.applications?.handlebars?.renderTemplate : globalThis.renderTemplate;
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
    const processedActors = userActors.map((actor) => {
      const favoriteSpells = [];
      const usageSpells = [];
      for (const [uuid, data] of Object.entries(spellData)) {
        const actorData = data.actorData?.[actor.id];
        if (actorData?.favorited) {
          try {
            const spell = fromUuidSync(uuid);
            const spellName = spell?.name || 'Unknown Spell';
            favoriteSpells.push({ uuid, name: spellName });
          } catch (error) {
            log(2, `Could not resolve spell UUID ${uuid} for favorites table`);
          }
        }
        if (actorData?.usageStats && actorData.usageStats.count > 0) {
          try {
            const spell = fromUuidSync(uuid);
            const spellName = spell?.name || 'Unknown Spell';
            const stats = actorData.usageStats;
            const lastUsedDate = stats.lastUsed ? new Date(stats.lastUsed).toLocaleDateString() : '-';
            usageSpells.push({ uuid, name: spellName, stats, lastUsedDate });
          } catch (error) {
            log(2, `Could not resolve spell UUID ${uuid} for usage table`);
          }
        }
      }
      return { id: actor.id, name: actor.name, favoriteSpells, usageSpells };
    });
    const notesSpells = [];
    for (const [uuid, data] of Object.entries(spellData)) {
      if (data.notes && data.notes.trim()) {
        try {
          const spell = fromUuidSync(uuid);
          const spellName = spell?.name || 'Unknown Spell';
          notesSpells.push({ uuid, name: spellName, notes: data.notes });
        } catch (error) {
          log(2, `Could not resolve spell UUID ${uuid} for notes table`);
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
   * Get user data for a spell
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {string} userId - User ID (optional)
   * @param {string} actorId - Actor ID (optional)
   * @returns {Promise<Object|null>} User data object
   */
  static async getUserDataForSpell(spellOrUuid, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return null;
      let canonicalUuid = spellUuid;
      if (spellUuid.startsWith('Actor.')) {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc.flags.core.sourceId;
        } catch (error) {
          canonicalUuid = spellUuid;
        }
      }
      const targetUserId = userId || game.user.id;
      const cacheKey = actorId ? `${targetUserId}:${actorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const page = await this._getUserPage(targetUserId);
      if (!page) return null;
      const spellData = this._parseSpellDataFromHTML(page.text.content);
      const userData = spellData[canonicalUuid];
      if (!userData) return null;
      let result;
      if (actorId && userData.actorData?.[actorId]) result = { ...userData.actorData[actorId], notes: userData.notes };
      else result = { notes: userData.notes || '', favorited: false, usageStats: null };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      log(1, 'Error getting user spell data:', error);
      return null;
    }
  }

  /**
   * Set user data for a spell
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {Object} data - Data to set
   * @param {string} userId - User ID (optional)
   * @param {string} actorId - Actor ID (optional)
   * @returns {Promise<boolean>} Success status
   */
  static async setUserDataForSpell(spellOrUuid, data, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return false;
      let canonicalUuid = spellUuid;
      if (spellUuid.startsWith('Actor.')) {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc.flags.core.sourceId;
        } catch (error) {
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
          spellData[canonicalUuid].actorData[actorId] = {
            favorited: false,
            usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
          };
        }
        if (data.favorited !== undefined) spellData[canonicalUuid].actorData[actorId].favorited = data.favorited;
        if (data.usageStats !== undefined) spellData[canonicalUuid].actorData[actorId].usageStats = data.usageStats;
      } else {
        if (data.notes !== undefined) spellData[canonicalUuid].notes = data.notes;
      }
      const newContent = this._generateTablesHTML(spellData, user.name, targetUserId);
      await page.update({
        'text.content': newContent,
        [`flags.${MODULE.ID}.lastUpdated`]: Date.now()
      });
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
   * Enhance spell with user data
   * @param {Object} spell - Spell object to enhance
   * @param {string} userId - User ID (optional)
   * @param {string} actorId - Actor ID (optional)
   * @returns {Object} Enhanced spell object
   */
  static enhanceSpellWithUserData(spell, userId = null, actorId = null) {
    const spellUuid = spell?.compendiumUuid || spell?.uuid;
    if (!spellUuid) return spell;
    let canonicalUuid = spellUuid;
    if (spellUuid.startsWith('Actor.')) {
      try {
        const spellDoc = fromUuidSync(spellUuid);
        if (spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc.flags.core.sourceId;
      } catch (error) {
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
    return {
      ...spell,
      userData: userData,
      favorited: favorited,
      hasNotes: !!(userData?.notes && userData.notes.trim()),
      usageCount: usageCount,
      lastUsed: lastUsed
    };
  }

  /**
   * Set spell favorite status
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {boolean} favorited - Favorite status
   * @param {string} userId - User ID (optional)
   * @param {string} actorId - Actor ID (optional)
   * @returns {Promise<boolean>} Success status
   */
  static async setSpellFavorite(spellOrUuid, favorited, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return false;
      let canonicalUuid = spellUuid;
      if (spellUuid.startsWith('Actor.')) {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc.flags.core.sourceId;
        } catch (error) {
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
          spellData[canonicalUuid].actorData[targetActorId] = {
            favorited: false,
            usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
          };
        }
        spellData[canonicalUuid].actorData[targetActorId].favorited = favorited;
      }
      const newContent = this._generateTablesHTML(spellData, user.name, targetUserId);
      await page.update({ 'text.content': newContent, [`flags.${MODULE.ID}.lastUpdated`]: Date.now() });
      const cacheKey = targetActorId ? `${targetUserId}:${targetActorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      if (targetActorId) {
        const result = {
          ...spellData[canonicalUuid].actorData[targetActorId],
          notes: spellData[canonicalUuid].notes
        };
        this.cache.set(cacheKey, result);
      } else {
        this.cache.set(cacheKey, {
          notes: spellData[canonicalUuid].notes || '',
          favorited: false,
          usageStats: null
        });
      }
      log(3, `Updated spell favorite status for ${canonicalUuid}: ${favorited}`);
      return true;
    } catch (error) {
      log(1, 'Error setting spell favorite:', error);
      return false;
    }
  }

  /**
   * Set spell notes
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {string} notes - Notes text
   * @param {string} userId - User ID (optional)
   * @returns {Promise<boolean>} Success status
   */
  static async setSpellNotes(spellOrUuid, notes, userId = null) {
    try {
      const maxLength = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH) || 240;
      const trimmedNotes = notes ? notes.substring(0, maxLength) : '';
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return false;
      let canonicalUuid = spellUuid;
      if (spellUuid.startsWith('Actor.')) {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc.flags.core.sourceId;
        } catch (error) {
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
      const newContent = this._generateTablesHTML(spellData, user.name, targetUserId);
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
   * Set usage statistics for a spell
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {Object} usageStats - Usage statistics object
   * @param {string} userId - User ID (optional)
   * @param {string} actorId - Actor ID (optional)
   * @returns {Promise<boolean>} Success status
   */
  static async setSpellUsageStats(spellOrUuid, usageStats, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return false;
      let canonicalUuid = spellUuid;
      if (spellUuid.startsWith('Actor.')) {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc.flags.core.sourceId;
        } catch (error) {
          canonicalUuid = spellUuid;
        }
      }
      const targetUserId = userId || game.user.id;
      const targetActorId = actorId || game.user.character?.id;
      const user = game.users.get(targetUserId);
      if (!user || !targetActorId) return false;
      const page = await this._getUserPage(targetUserId);
      if (!page) return false;
      const spellData = this._parseSpellDataFromHTML(page.text.content);
      if (!spellData[canonicalUuid]) spellData[canonicalUuid] = { notes: '', actorData: {} };
      if (!spellData[canonicalUuid].actorData[targetActorId]) {
        spellData[canonicalUuid].actorData[targetActorId] = {
          favorited: false,
          usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
        };
      }
      spellData[canonicalUuid].actorData[targetActorId].usageStats = usageStats;
      const newContent = this._generateTablesHTML(spellData, user.name, targetUserId);
      await page.update({ 'text.content': newContent, [`flags.${MODULE.ID}.lastUpdated`]: Date.now() });
      const cacheKey = `${targetUserId}:${targetActorId}:${canonicalUuid}`;
      this.cache.set(cacheKey, spellData[canonicalUuid]);
      log(3, `Updated spell usage stats for ${canonicalUuid}`);
      return true;
    } catch (error) {
      log(1, 'Error setting spell usage stats:', error);
      return false;
    }
  }

  /**
   * Get usage statistics for a spell
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {string} userId - User ID (optional)
   * @param {string} actorId - Actor ID (optional)
   * @returns {Promise<Object|null>} Usage statistics
   */
  static async getSpellUsageStats(spellOrUuid, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;
      if (!spellUuid) return null;
      let canonicalUuid = spellUuid;
      if (spellUuid.startsWith('Actor.')) {
        try {
          const spellDoc = fromUuidSync(spellUuid);
          if (spellDoc?.flags?.core?.sourceId) canonicalUuid = spellDoc.flags.core.sourceId;
        } catch (error) {
          canonicalUuid = spellUuid;
        }
      }
      const targetUserId = userId || game.user.id;
      const targetActorId = actorId || game.user.character?.id;
      const cacheKey = targetActorId ? `${targetUserId}:${targetActorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        return cached.usageStats || null;
      }
      const page = await this._getUserPage(targetUserId);
      if (!page) return null;
      const spellData = this._parseSpellDataFromHTML(page.text.content);
      const userData = spellData[canonicalUuid];
      if (!userData) return null;
      let result = null;
      if (targetActorId && userData.actorData?.[targetActorId]) {
        result = userData.actorData[targetActorId].usageStats || null;
        this.cache.set(cacheKey, { ...userData.actorData[targetActorId], notes: userData.notes });
      }
      return result;
    } catch (error) {
      log(1, 'Error getting spell usage stats:', error);
      return null;
    }
  }
}
