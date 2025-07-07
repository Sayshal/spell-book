import { MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Journal-based spell user data storage
 */
class SpellUserDataJournal {
  constructor() {
    this.cache = new Map(); // Cache parsed data for performance
    this.journalName = 'User Spell Data';
  }

  /**
   * Get the user spell data journal
   * @returns {Promise<JournalEntry|null>}
   */
  async _getJournal() {
    const pack = game.packs.get(MODULE.PACK.USERDATA);
    if (!pack) return null;

    const documents = await pack.getDocuments();
    return documents.find((doc) => doc.name === this.journalName && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);
  }

  /**
   * Get user page from journal
   * @param {string} userId - User ID
   * @returns {Promise<JournalEntryPage|null>}
   */
  async _getUserPage(userId) {
    const journal = await this._getJournal();
    if (!journal) return null;

    return journal.pages.find((page) => page.flags?.[MODULE.ID]?.userId === userId);
  }

  /**
   * Parse spell data from HTML tables (updated for per-actor structure)
   * @param {string} htmlContent - The page HTML content
   * @returns {Object} Parsed spell data
   */
  _parseSpellDataFromHTML(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const spellData = {};

    // Parse user-level notes table (applies to all actors)
    const notesTable = doc.querySelector('table[data-table-type="spell-notes"]');
    if (notesTable) {
      const rows = notesTable.querySelectorAll('tbody tr[data-spell-uuid]');
      rows.forEach((row) => {
        const uuid = row.dataset.spellUuid;
        const notesCell = row.querySelector('td:nth-child(2)');
        const notes = notesCell ? notesCell.textContent.trim() : '';

        if (uuid) {
          spellData[uuid] = {
            notes,
            actorData: {}
          };
        }
      });
    }

    // Parse actor-specific usage and favorites tables
    const actorSections = doc.querySelectorAll('.actor-spell-data[data-actor-id]');
    actorSections.forEach((section) => {
      const actorId = section.dataset.actorId;

      // Parse favorites table for this actor
      const favoritesTable = section.querySelector('table[data-table-type="spell-favorites"]');
      if (favoritesTable) {
        const rows = favoritesTable.querySelectorAll('tbody tr[data-spell-uuid]');
        rows.forEach((row) => {
          const uuid = row.dataset.spellUuid;
          const favorited = row.dataset.favorited === 'true';

          if (uuid) {
            if (!spellData[uuid]) {
              spellData[uuid] = { notes: '', actorData: {} };
            }
            if (!spellData[uuid].actorData[actorId]) {
              spellData[uuid].actorData[actorId] = {
                favorited: false,
                usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
              };
            }
            spellData[uuid].actorData[actorId].favorited = favorited;
          }
        });
      }

      // Parse usage table for this actor
      const usageTable = section.querySelector('table[data-table-type="spell-usage"]');
      if (usageTable) {
        const rows = usageTable.querySelectorAll('tbody tr[data-spell-uuid]');
        rows.forEach((row) => {
          const uuid = row.dataset.spellUuid;
          const cells = row.querySelectorAll('td');

          if (uuid && cells.length >= 5) {
            const combat = parseInt(cells[1].textContent) || 0;
            const exploration = parseInt(cells[2].textContent) || 0;
            const total = parseInt(cells[3].textContent) || 0;
            const lastUsed = cells[4].textContent.trim() || null;

            if (!spellData[uuid]) {
              spellData[uuid] = { notes: '', actorData: {} };
            }
            if (!spellData[uuid].actorData[actorId]) {
              spellData[uuid].actorData[actorId] = {
                favorited: false,
                usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
              };
            }

            spellData[uuid].actorData[actorId].usageStats = {
              count: total,
              lastUsed: lastUsed ? new Date(lastUsed).getTime() : null,
              contextUsage: { combat, exploration }
            };
          }
        });
      }
    });

    return spellData;
  }

  /**
   * Generate HTML tables from spell data (updated structure with proper heading hierarchy)
   * @param {Object} spellData - The spell data object
   * @param {string} userName - User name for header
   * @param {string} userId - User ID for finding actors
   * @returns {string} HTML content
   */
  _generateTablesHTML(spellData, userName, userId) {
    const notesTitle = game.i18n.localize('SPELLBOOK.UserData.SpellNotes');
    const favoritesTitle = game.i18n.localize('SPELLBOOK.UserData.FavoritesTitle');
    const usageTitle = game.i18n.localize('SPELLBOOK.UserData.UsageTitle');
    const spellCol = game.i18n.localize('SPELLBOOK.UserData.SpellColumn');
    const notesCol = game.i18n.localize('SPELLBOOK.UserData.NotesColumn');
    const favoritedCol = game.i18n.localize('SPELLBOOK.UserData.FavoritedColumn');
    const combatCol = game.i18n.localize('SPELLBOOK.UserData.CombatColumn');
    const explorationCol = game.i18n.localize('SPELLBOOK.UserData.ExplorationColumn');
    const totalCol = game.i18n.localize('SPELLBOOK.UserData.TotalColumn');
    const lastUsedCol = game.i18n.localize('SPELLBOOK.UserData.LastUsedColumn');

    let content = `
    <hr>
    <p><em>${game.i18n.localize('SPELLBOOK.UserData.PageDescription')}</em></p>
  `;

    // Get user's actors (exclude if user is gamemaster)
    const user = game.users.get(userId);
    if (user?.isGM) {
      content += `<p><small><em>${game.i18n.localize('SPELLBOOK.UserData.AutoGenerated')}</em></small></p>`;
      return content;
    }

    const userActors = game.actors.filter((actor) => actor.type === 'character' && (actor.ownership[userId] === 3 || user?.character?.id === actor.id));

    // Generate actor sections first
    for (const actor of userActors) {
      const actorSpellData = Object.entries(spellData).filter(([_, data]) => data.actorData && data.actorData[actor.id]);

      content += `
      <hr>
      <div class="actor-spell-data" data-actor-id="${actor.id}">
        <h1>${actor.name}</h1>

        <h2>${favoritesTitle}</h2>
        <table class="spell-book-data" data-table-type="spell-favorites" data-actor-id="${actor.id}">
          <thead>
            <tr>
              <th>${spellCol}</th>
              <th>${favoritedCol}</th>
            </tr>
          </thead>
          <tbody>
    `;

      // Generate favorites rows for this actor
      for (const [uuid, data] of actorSpellData) {
        const actorData = data.actorData[actor.id];
        if (!actorData) continue;

        const spellName = this._getSpellNameFromUuid(uuid);
        const favoriteIcon = actorData.favorited ? '★' : '☆';
        const favoriteClass = actorData.favorited ? 'favorited-true' : 'favorited-false';

        content += `
        <tr data-spell-uuid="${uuid}" data-favorited="${actorData.favorited}">
          <td>@UUID[${uuid}]{${spellName}}</td>
          <td><span class="${favoriteClass}">${favoriteIcon}</span></td>
        </tr>
      `;
      }

      content += `
          </tbody>
        </table>

        <h2>${usageTitle}</h2>
        <table class="spell-book-data" data-table-type="spell-usage" data-actor-id="${actor.id}">
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
    `;

      // Generate usage rows for this actor (only if there's usage data)
      for (const [uuid, data] of actorSpellData) {
        const actorData = data.actorData[actor.id];
        if (!actorData?.usageStats || actorData.usageStats.count <= 0) continue;

        const spellName = this._getSpellNameFromUuid(uuid);
        const lastUsedDate = actorData.usageStats.lastUsed ? new Date(actorData.usageStats.lastUsed).toLocaleString() : '';

        content += `
        <tr data-spell-uuid="${uuid}">
          <td>@UUID[${uuid}]{${spellName}}</td>
          <td>${actorData.usageStats.contextUsage.combat}</td>
          <td>${actorData.usageStats.contextUsage.exploration}</td>
          <td>${actorData.usageStats.count}</td>
          <td>${lastUsedDate}</td>
        </tr>
      `;
      }

      content += `
          </tbody>
        </table>
      </div>
    `;
    }

    // Now add the notes section at the end
    content += `
    <hr>
    <h1>${notesTitle}</h1>
    <p><em>${game.i18n.localize('SPELLBOOK.UserData.NotesDescription')}</em></p>
    <table class="spell-book-data" data-table-type="spell-notes" data-user-id="${userId}">
      <thead>
        <tr>
          <th>${spellCol}</th>
          <th>${notesCol}</th>
        </tr>
      </thead>
      <tbody>
  `;

    // Generate notes rows (user-level, applies to all actors)
    const notesEntries = Object.entries(spellData).filter(([_, data]) => data.notes?.trim());
    for (const [uuid, data] of notesEntries) {
      const spellName = this._getSpellNameFromUuid(uuid);
      content += `
      <tr data-spell-uuid="${uuid}">
        <td>@UUID[${uuid}]{${spellName}}</td>
        <td>${data.notes || ''}</td>
      </tr>
    `;
    }

    content += `
      </tbody>
    </table>

    <hr>
    <p><small><em>${game.i18n.localize('SPELLBOOK.UserData.AutoGenerated')}</em></small></p>
  `;

    return content;
  }

  /**
   * Get spell name from UUID
   * @param {string} uuid - Spell UUID
   * @returns {string} Spell name
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
   * Get user spell data (now supports actor-specific data)
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {string} userId - User ID
   * @param {string} actorId - Actor ID (optional, for usage stats and favorites)
   * @returns {Promise<Object|null>}
   */
  async getUserDataForSpell(spellOrUuid, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;

      if (!spellUuid) return null;

      const targetUserId = userId || game.user.id;
      const cacheKey = actorId ? `${targetUserId}:${actorId}:${spellUuid}` : `${targetUserId}:${spellUuid}`;

      // Check cache first
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const page = await this._getUserPage(targetUserId);
      if (!page) return null;

      const spellData = this._parseSpellDataFromHTML(page.text.content);

      // Cache all data for this user
      for (const [uuid, data] of Object.entries(spellData)) {
        // Cache both user-level data (notes) and actor-level data (usage/favorites)
        this.cache.set(`${targetUserId}:${uuid}`, data);
        if (data.actorData) {
          for (const [actId, actorSpecificData] of Object.entries(data.actorData)) {
            this.cache.set(`${targetUserId}:${actId}:${uuid}`, {
              ...data,
              usageStats: actorSpecificData.usageStats,
              favorited: actorSpecificData.favorited
            });
          }
        }
      }

      // Return actor-specific data if actorId provided
      if (actorId && spellData[spellUuid]?.actorData?.[actorId]) {
        return {
          notes: spellData[spellUuid].notes,
          favorited: spellData[spellUuid].actorData[actorId].favorited,
          usageStats: spellData[spellUuid].actorData[actorId].usageStats
        };
      }

      return spellData[spellUuid] || null;
    } catch (error) {
      log(1, 'Error getting user spell data from journal:', error);
      return null;
    }
  }

  /**
   * Set user spell data (now supports actor-specific data)
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {Object} data - Data to set
   * @param {string} userId - User ID
   * @param {string} actorId - Actor ID (optional, for usage stats and favorites)
   * @returns {Promise<boolean>}
   */
  async setUserDataForSpell(spellOrUuid, data, userId = null, actorId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;

      if (!spellUuid) return false;

      const targetUserId = userId || game.user.id;
      const user = game.users.get(targetUserId);
      if (!user) return false;

      const page = await this._getUserPage(targetUserId);
      if (!page) return false;

      // Parse existing data
      const spellData = this._parseSpellDataFromHTML(page.text.content);

      // Initialize spell data if it doesn't exist
      if (!spellData[spellUuid]) {
        spellData[spellUuid] = {
          notes: '',
          actorData: {}
        };
      }

      // Update data based on what's being set
      if (actorId) {
        // Actor-specific data (usage stats, favorites)
        if (!spellData[spellUuid].actorData[actorId]) {
          spellData[spellUuid].actorData[actorId] = {
            favorited: false,
            usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
          };
        }

        if (data.favorited !== undefined) {
          spellData[spellUuid].actorData[actorId].favorited = data.favorited;
        }
        if (data.usageStats !== undefined) {
          spellData[spellUuid].actorData[actorId].usageStats = data.usageStats;
        }
      } else {
        // User-specific data (notes)
        if (data.notes !== undefined) {
          spellData[spellUuid].notes = data.notes;
        }
      }

      // Generate new HTML
      const newContent = this._generateTablesHTML(spellData, user.name, targetUserId);

      // Update page
      await page.update({
        'text.content': newContent,
        [`flags.${MODULE.ID}.lastUpdated`]: Date.now()
      });

      // Update cache
      const cacheKey = actorId ? `${targetUserId}:${actorId}:${spellUuid}` : `${targetUserId}:${spellUuid}`;
      this.cache.set(cacheKey, spellData[spellUuid]);

      log(3, `Updated spell data in journal for ${spellUuid}`);
      return true;
    } catch (error) {
      log(1, 'Error setting user spell data in journal:', error);
      return false;
    }
  }

  /**
   * Set usage statistics for a spell
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {Object} usageStats - Usage statistics object
   * @param {string} userId - User ID (optional)
   * @returns {Promise<boolean>} Success status
   */
  async setSpellUsageStats(spellOrUuid, usageStats, userId = null) {
    return await this.setUserDataForSpell(spellOrUuid, { usageStats }, userId);
  }

  /**
   * Get usage statistics for a spell
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object|null>} Usage statistics
   */
  async getSpellUsageStats(spellOrUuid, userId = null) {
    const userData = await this.getUserDataForSpell(spellOrUuid, userId);
    return userData?.usageStats || null;
  }
}

export async function getUserDataForSpell(spellOrUuid, userId = null, actorId = null) {
  return await spellUserDataJournal.getUserDataForSpell(spellOrUuid, userId, actorId);
}

export async function setUserDataForSpell(spellOrUuid, data, userId = null, actorId = null) {
  return await spellUserDataJournal.setUserDataForSpell(spellOrUuid, data, userId, actorId);
}

export async function setSpellFavorite(spellOrUuid, favorited, userId = null, actorId = null) {
  return await setUserDataForSpell(spellOrUuid, { favorited }, userId, actorId);
}

export async function setSpellNotes(spellOrUuid, notes, userId = null) {
  const maxLength = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_LENGTH) || 240;
  const trimmedNotes = notes ? notes.substring(0, maxLength) : '';
  return await setUserDataForSpell(spellOrUuid, { notes: trimmedNotes }, userId);
}

export async function setSpellUsageStats(spellOrUuid, usageStats, userId = null, actorId = null) {
  return await spellUserDataJournal.setSpellUsageStats(spellOrUuid, usageStats, userId, actorId);
}

export async function getSpellUsageStats(spellOrUuid, userId = null, actorId = null) {
  return await spellUserDataJournal.getSpellUsageStats(spellOrUuid, userId, actorId);
}

export function enhanceSpellWithUserData(spell, userId = null, actorId = null) {
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
  const userData = spellUserDataJournal.cache.get(cacheKey) || null;

  return {
    ...spell,
    userData: userData,
    favorited: userData?.favorited || false,
    hasNotes: !!(userData?.notes && userData.notes.trim()),
    usageCount: userData?.usageStats?.count || 0,
    lastUsed: userData?.usageStats?.lastUsed || null
  };
}

export const spellUserDataJournal = new SpellUserDataJournal();
