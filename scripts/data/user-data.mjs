/**
 * User Spell Data Storage and Management
 *
 * Provides journal-based storage for user-specific spell data including notes,
 * favorites, and usage statistics. This module handles data persistence, caching,
 * and HTML table generation for user spell analytics and personalization features.
 * @module DataUtils/SpellUserData
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import { UserDataSetup } from '../managers/_module.mjs';
import * as DataUtils from './_module.mjs';
import { getCanonicalSpellUuid } from './generic-utils.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/** Current data version for migration tracking. */
const DATA_VERSION = '3.1';

/** Cache TTL in milliseconds (5 seconds). */
const CACHE_TTL = 5000;

/**
 * Encode a UUID for use as an object key (dots cause issues with Foundry flag storage).
 * @param {string} uuid - The UUID to encode
 * @returns {string} Encoded UUID safe for use as object key
 */
function encodeUuidKey(uuid) {
  return uuid.replace(/\./g, '~');
}

/**
 * Decode a UUID key back to standard UUID format.
 * @param {string} key - The encoded key
 * @returns {string} Original UUID
 */
function decodeUuidKey(key) {
  return key.replace(/~/g, '.');
}

/**
 * Default empty spell data structure for a single spell.
 * @returns {object} Empty spell data object
 */
function createEmptySpellData() {
  return { notes: '', actorData: {} };
}

/**
 * Default empty actor data structure for a spell.
 * @returns {object} Empty actor data object
 */
function createEmptyActorData() {
  return { favorited: false, usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } } };
}

/**
 * Journal-based spell user data storage system.
 */
export class UserData {
  /**
   * Maps cache keys to user data objects with TTL tracking.
   * @type {Map<string, {data: object|null, timestamp: number}>}
   * @static
   */
  static cache = new Map();

  /**
   * Maps user IDs to their full spell data for batch operations.
   * @type {Map<string, {data: object, timestamp: number}>}
   * @static
   */
  static _spellDataCache = new Map();

  /**
   * Standard name for the user spell data journal.
   * @type {string}
   * @static
   */
  static journalName = 'User Spell Data';

  /**
   * Get the user spell data journal from the user data pack.
   * @returns {Promise<object | null>} Promise that resolves to the user spell data journal or null if not found
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
   * @returns {Promise<object | null>} The user's page or null if not found
   * @static
   * @private
   */
  static async _getUserPage(userId) {
    log(3, 'Getting journal page for:', { userId });
    const journal = await this._getJournal();
    if (!journal) return null;
    return journal.pages.find((page) => page.flags?.[MODULE.ID]?.userId === userId);
  }

  /**
   * Get spell data from page flags with caching and auto-migration.
   * @param {string} userId - User ID to get data for
   * @returns {Promise<object>} Spell data object keyed by spell UUID (decoded)
   * @static
   * @private
   */
  static async _getSpellData(userId) {
    // Check cache first
    const cached = this._spellDataCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const page = await this._getUserPage(userId);
    if (!page) return {};

    const dataVersion = page.flags?.[MODULE.ID]?.dataVersion;

    // Check if data exists in flags (v3.1+ with encoded keys)
    const flagData = page.flags?.[MODULE.ID]?.[FLAGS.USER_SPELL_DATA];
    if (flagData && dataVersion === DATA_VERSION) {
      // Decode keys from storage format
      const decodedData = {};
      for (const [encodedKey, value] of Object.entries(flagData)) {
        decodedData[decodeUuidKey(encodedKey)] = value;
      }
      this._spellDataCache.set(userId, { data: decodedData, timestamp: Date.now() });
      return decodedData;
    }

    // Migrate from HTML if needed (v2.0 or v3.0 with corrupted nested structure)
    const htmlContent = page.text?.content;
    if (htmlContent) {
      const parsedData = this._parseSpellDataFromHTML(htmlContent);
      await this._migrateToFlags(page, parsedData, userId);
      this._spellDataCache.set(userId, { data: parsedData, timestamp: Date.now() });
      return parsedData;
    }

    return {};
  }

  /**
   * Save spell data to page flags and regenerate display HTML.
   * @param {string} userId - User ID to save data for
   * @param {object} spellData - Complete spell data object (with decoded UUID keys)
   * @returns {Promise<boolean>} Success status
   * @static
   * @private
   */
  static async _setSpellData(userId, spellData) {
    const page = await this._getUserPage(userId);
    if (!page) return false;

    const user = game.users.get(userId);
    if (!user) return false;

    // Generate display HTML for journal viewing
    const displayHtml = await this._generateTablesHTML(spellData, user.name, userId);

    // Encode UUID keys for storage (dots in keys cause Foundry to create nested objects)
    const encodedData = {};
    for (const [uuid, value] of Object.entries(spellData)) {
      encodedData[encodeUuidKey(uuid)] = value;
    }

    // Update both flags (data) and content (display)
    await page.update({
      'text.content': displayHtml,
      [`flags.${MODULE.ID}.${FLAGS.USER_SPELL_DATA}`]: encodedData,
      [`flags.${MODULE.ID}.lastUpdated`]: Date.now(),
      [`flags.${MODULE.ID}.dataVersion`]: DATA_VERSION
    });

    // Update cache with decoded data
    this._spellDataCache.set(userId, { data: spellData, timestamp: Date.now() });

    return true;
  }

  /**
   * Migrate HTML-based data to flag storage.
   * @param {object} page - Journal page document
   * @param {object} spellData - Parsed spell data from HTML
   * @param {string} userId - User ID for the page
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async _migrateToFlags(page, spellData, userId) {
    log(2, 'Migrating user spell data from HTML to flags', { userId });
    await page.update({
      [`flags.${MODULE.ID}.${FLAGS.USER_SPELL_DATA}`]: spellData,
      [`flags.${MODULE.ID}.dataVersion`]: DATA_VERSION,
      [`flags.${MODULE.ID}.migratedAt`]: Date.now()
    });
  }

  /**
   * Invalidate cache for a user (call after external changes).
   * @param {string} userId - User ID to invalidate cache for
   * @static
   */
  static invalidateCache(userId) {
    this._spellDataCache.delete(userId);
    // Clear all per-spell cache entries for this user
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Parse spell data from HTML tables with per-actor structure support.
   * @param {string} htmlContent - The page HTML content to parse
   * @returns {Object<string, Object>} Parsed spell data object keyed by spell UUID
   * @static
   * @private
   */
  static _parseSpellDataFromHTML(htmlContent) {
    log(3, 'Parsing spell data from HTML.');
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
   * @param {Object<string, Object>} spellData - The spell data to convert to HTML
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
    const unknownSpell = game.i18n.localize('SPELLBOOK.UI.UnknownSpell');
    const spellNameCache = new Map();
    const getSpellName = (uuid) => {
      if (!spellNameCache.has(uuid)) {
        const spell = fromUuidSync(uuid);
        spellNameCache.set(uuid, spell?.name || unknownSpell);
      }
      return spellNameCache.get(uuid);
    };
    const user = game.users.get(userId);
    const userActors = game.actors.filter((actor) => actor.type === 'character' && (actor.ownership[userId] === 3 || user?.character?.id === actor.id));
    const processedActors = userActors.map((actor) => {
      const favoriteSpells = [];
      const usageSpells = [];
      for (const [uuid, data] of Object.entries(spellData)) {
        const actorData = data.actorData?.[actor.id];
        if (actorData?.favorited) favoriteSpells.push({ uuid, name: getSpellName(uuid) });
        if (actorData?.usageStats && actorData.usageStats.count > 0) {
          const stats = actorData.usageStats;
          const lastUsedDate = stats.lastUsed ? foundry.utils.timeSince(stats.lastUsed) : '-';
          usageSpells.push({ uuid, name: getSpellName(uuid), stats, lastUsedDate });
        }
      }
      return { id: actor.id, name: actor.name, favoriteSpells, usageSpells };
    });
    const notesSpells = [];
    for (const [uuid, data] of Object.entries(spellData)) if (data.notes && data.notes.trim()) notesSpells.push({ uuid, name: getSpellName(uuid), notes: data.notes });
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
   * @param {string | object} spellOrUuid - Spell UUID or spell object to get data for
   * @param {string} [userId] - User ID (defaults to current user)
   * @param {string} [actorId] - Actor ID for actor-specific data
   * @returns {Promise<object | null>} User data object or null if unavailable
   * @static
   */
  static async getUserDataForSpell(spellOrUuid, userId = null, actorId = null) {
    const canonicalUuid = getCanonicalSpellUuid(spellOrUuid);
    if (!canonicalUuid) return null;
    const targetUserId = userId || game.user.id;
    const cacheKey = actorId ? `${targetUserId}:${actorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;

    // Check per-spell cache with TTL
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    await this._ensureUserDataInfrastructure(targetUserId);
    const spellData = await this._getSpellData(targetUserId);
    const userData = spellData[canonicalUuid];

    let result;
    if (!userData) result = { notes: '', favorited: false, usageStats: null };
    else if (actorId && userData.actorData?.[actorId]) result = { ...userData.actorData[actorId], notes: userData.notes };
    else result = { notes: userData.notes || '', favorited: false, usageStats: null };

    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  /**
   * Set user data for a spell with automatic infrastructure management.
   * @param {string | object} spellOrUuid - Spell UUID or spell object to set data for
   * @param {object} data - Data to set (notes, favorited, usageStats)
   * @param {string} [userId] - User ID (defaults to current user)
   * @param {string} [actorId] - Actor ID for actor-specific data
   * @returns {Promise<boolean>} Success status of the update operation
   * @static
   */
  static async setUserDataForSpell(spellOrUuid, data, userId = null, actorId = null) {
    log(3, 'Setting user data for spell', { spellOrUuid, data, userId, actorId });
    const canonicalUuid = getCanonicalSpellUuid(spellOrUuid);
    if (!canonicalUuid) return false;
    const targetUserId = userId || game.user.id;
    const user = game.users.get(targetUserId);
    if (!user) return false;

    await this._ensureUserDataInfrastructure(targetUserId);
    const spellData = await this._getSpellData(targetUserId);

    if (!spellData[canonicalUuid]) spellData[canonicalUuid] = createEmptySpellData();
    if (actorId) {
      if (!spellData[canonicalUuid].actorData[actorId]) {
        spellData[canonicalUuid].actorData[actorId] = createEmptyActorData();
      }
      if (data.favorited !== undefined) spellData[canonicalUuid].actorData[actorId].favorited = data.favorited;
      if (data.usageStats !== undefined) spellData[canonicalUuid].actorData[actorId].usageStats = data.usageStats;
    } else if (data.notes !== undefined) {
      spellData[canonicalUuid].notes = data.notes;
    }

    const success = await this._setSpellData(targetUserId, spellData);
    if (success) {
      // Update per-spell cache
      const cacheKey = actorId ? `${targetUserId}:${actorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      const result =
        actorId && spellData[canonicalUuid].actorData[actorId]
          ? { ...spellData[canonicalUuid].actorData[actorId], notes: spellData[canonicalUuid].notes }
          : { notes: spellData[canonicalUuid].notes || '', favorited: false, usageStats: null };
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    }
    return success;
  }

  /**
   * Enhance spell with user data for UI display.
   * @param {object} spell - Spell object to enhance with user data
   * @param {string} [userId] - User ID (defaults to current user)
   * @param {string} [actorId] - Actor ID for actor-specific data
   * @returns {object} Enhanced spell object with user data properties added
   * @static
   */
  static enhanceSpellWithUserData(spell, userId = null, actorId = null) {
    const canonicalUuid = getCanonicalSpellUuid(spell);
    if (!canonicalUuid) return spell;
    const targetUserId = userId || game.user.id;
    const actorCacheKey = actorId ? `${targetUserId}:${actorId}:${canonicalUuid}` : null;
    const globalCacheKey = `${targetUserId}:${canonicalUuid}`;

    // Get cached data, checking TTL
    let userData = null;
    if (actorCacheKey) {
      const cached = this.cache.get(actorCacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) userData = cached.data;
    }
    if (!userData) {
      const cached = this.cache.get(globalCacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) userData = cached.data;
    }

    // Fallback: check _spellDataCache directly if per-spell cache missed
    if (!userData) {
      const spellDataCached = this._spellDataCache.get(targetUserId);
      if (spellDataCached && Date.now() - spellDataCached.timestamp < CACHE_TTL) {
        const spellEntry = spellDataCached.data[canonicalUuid];
        if (spellEntry) {
          // Build flattened userData from spellEntry
          if (actorId && spellEntry.actorData?.[actorId]) {
            userData = { ...spellEntry.actorData[actorId], notes: spellEntry.notes };
          } else {
            userData = { notes: spellEntry.notes || '', favorited: false, usageStats: null };
          }
        }
      }
    }

    let favorited = false;
    let usageCount = 0;
    let lastUsed = null;
    if (userData) {
      favorited = userData.favorited;
      usageCount = userData.usageStats?.count || 0;
      lastUsed = userData.usageStats?.lastUsed || null;
    }
    return { ...spell, userData, favorited, hasNotes: !!(userData?.notes && userData.notes.trim()), usageCount, lastUsed };
  }

  /**
   * Set spell favorite status for a specific actor.
   * @param {string | object} spellOrUuid - Spell UUID or spell object
   * @param {boolean} favorited - New favorite status to set
   * @param {string} [userId] - User ID (defaults to current user)
   * @param {string} [actorId] - Actor ID (defaults to user's character)
   * @returns {Promise<boolean>} Success status of the operation
   * @static
   */
  static async setSpellFavorite(spellOrUuid, favorited, userId = null, actorId = null) {
    log(3, 'Setting spell as favorite.', { spellOrUuid, favorited, userId, actorId });
    const canonicalUuid = getCanonicalSpellUuid(spellOrUuid);
    if (!canonicalUuid) return false;
    const targetUserId = userId || game.user.id;
    const targetActorId = actorId || game.user.character?.id;
    const user = game.users.get(targetUserId);
    if (!user) return false;

    await this._ensureUserDataInfrastructure(targetUserId);
    const spellData = await this._getSpellData(targetUserId);

    if (!spellData[canonicalUuid]) spellData[canonicalUuid] = createEmptySpellData();
    if (targetActorId) {
      if (!spellData[canonicalUuid].actorData[targetActorId]) {
        spellData[canonicalUuid].actorData[targetActorId] = createEmptyActorData();
      }
      spellData[canonicalUuid].actorData[targetActorId].favorited = favorited;
    }

    const success = await this._setSpellData(targetUserId, spellData);
    if (success) {
      const cacheKey = targetActorId ? `${targetUserId}:${targetActorId}:${canonicalUuid}` : `${targetUserId}:${canonicalUuid}`;
      const result = targetActorId
        ? { ...spellData[canonicalUuid].actorData[targetActorId], notes: spellData[canonicalUuid].notes }
        : { notes: spellData[canonicalUuid].notes || '', favorited: false, usageStats: null };
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    }
    return success;
  }

  /**
   * Set spell notes with length validation.
   * @param {string | object} spellOrUuid - Spell UUID or spell object
   * @param {string} notes - Notes text to set
   * @param {string} [userId] - User ID (defaults to current user)
   * @returns {Promise<boolean>} Success status of the operation
   * @static
   */
  static async setSpellNotes(spellOrUuid, notes, userId = null) {
    log(3, 'Setting spell notes.', { spellOrUuid, notes, userId });
    const maxLength = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH) || 240;
    const trimmedNotes = notes ? foundry.utils.cleanHTML(notes.substring(0, maxLength)) : '';
    const canonicalUuid = getCanonicalSpellUuid(spellOrUuid);
    if (!canonicalUuid) return false;
    const targetUserId = userId || game.user.id;
    const user = game.users.get(targetUserId);
    if (!user) return false;

    await this._ensureUserDataInfrastructure(targetUserId);
    const spellData = await this._getSpellData(targetUserId);

    if (!spellData[canonicalUuid]) spellData[canonicalUuid] = createEmptySpellData();
    spellData[canonicalUuid].notes = trimmedNotes;

    const success = await this._setSpellData(targetUserId, spellData);
    if (success) {
      // Store flattened format to match what getUserDataForSpell/enhanceSpellWithUserData expects
      const cacheKey = `${targetUserId}:${canonicalUuid}`;
      this.cache.set(cacheKey, {
        data: { notes: spellData[canonicalUuid].notes, favorited: false, usageStats: null },
        timestamp: Date.now()
      });
    }
    return success;
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
    if (!journal) {
      log(2, 'User data journal not found. GM must initialize spell book first.');
      return;
    }
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

  /**
   * Sync actor favorites to journal storage (batched operation).
   * Compares actor favorite spells with journal favorites and updates journal to match actor.
   * @param {object} actor - The actor to sync favorites for
   * @returns {Promise<Array<{uuid: string, newState: boolean}>>} Array of changed spells with their new favorite states
   * @static
   */
  static async syncActorFavoritesToJournal(actor) {
    log(3, 'Syncing journal to actor state.');
    const targetUserId = DataUtils.getTargetUserId(actor);

    // Get actor's current favorite spell IDs
    const actorFavorites = actor.system.favorites || [];
    const actorFavoriteSpellIds = new Set(actorFavorites.filter((fav) => fav.type === 'item' && fav.id.startsWith('.Item.')).map((fav) => fav.id.replace('.Item.', '')));

    // Get all spell data once (batch read)
    await this._ensureUserDataInfrastructure(targetUserId);
    const spellData = await this._getSpellData(targetUserId);
    const actorSpells = actor.itemTypes.spell;

    // Collect all changes without writing
    const changedSpells = [];
    let hasChanges = false;

    for (const spell of actorSpells) {
      const spellUuid = getCanonicalSpellUuid(spell);
      if (!spellUuid) continue;

      const isFavoritedInActor = actorFavoriteSpellIds.has(spell.id);
      const journalData = spellData[spellUuid]?.actorData?.[actor.id];
      const isFavoritedInJournal = journalData?.favorited || false;

      if (isFavoritedInJournal !== isFavoritedInActor) {
        // Initialize spell data if needed
        if (!spellData[spellUuid]) spellData[spellUuid] = createEmptySpellData();
        if (!spellData[spellUuid].actorData[actor.id]) {
          spellData[spellUuid].actorData[actor.id] = createEmptyActorData();
        }
        spellData[spellUuid].actorData[actor.id].favorited = isFavoritedInActor;
        changedSpells.push({ uuid: spellUuid, newState: isFavoritedInActor });
        hasChanges = true;
      }
    }

    // Single batch write if there were changes
    if (hasChanges) {
      await this._setSpellData(targetUserId, spellData);

      // Update per-spell caches for changed spells
      for (const change of changedSpells) {
        const cacheKey = `${targetUserId}:${actor.id}:${change.uuid}`;
        const result = {
          ...spellData[change.uuid].actorData[actor.id],
          notes: spellData[change.uuid].notes
        };
        this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      }
    }

    return changedSpells;
  }
}
