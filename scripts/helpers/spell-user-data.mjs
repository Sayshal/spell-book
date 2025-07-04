import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Journal-based spell user data storage
 */
class SpellUserDataJournal {
  constructor() {
    this.cache = new Map(); // Cache parsed data for performance
    this.journalName = 'Spell User Data';
  }

  /**
   * Get the user spell data journal
   * @returns {Promise<JournalEntry|null>}
   */
  async _getJournal() {
    const pack = game.packs.get(MODULE.PACK.SPELLS);
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
   * Parse spell data from HTML tables
   * @param {string} htmlContent - The page HTML content
   * @returns {Object} Parsed spell data
   */
  _parseSpellDataFromHTML(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const spellData = {};

    // Parse spell notes table
    const notesTable = doc.querySelector('table[data-table-type="spell-notes"]');
    if (notesTable) {
      const rows = notesTable.querySelectorAll('tbody tr[data-spell-uuid]');
      rows.forEach((row) => {
        const uuid = row.dataset.spellUuid;
        const favorited = row.dataset.favorited === 'true';
        const notesCell = row.querySelector('td:nth-child(3)');
        const notes = notesCell ? notesCell.textContent.trim() : '';

        if (uuid) {
          spellData[uuid] = {
            favorited,
            notes,
            usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
          };
        }
      });
    }

    // Parse usage table
    const usageTable = doc.querySelector('table[data-table-type="spell-usage"]');
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
            spellData[uuid] = { favorited: false, notes: '' };
          }

          spellData[uuid].usageStats = {
            count: total,
            lastUsed: lastUsed ? new Date(lastUsed).getTime() : null,
            contextUsage: { combat, exploration }
          };
        }
      });
    }

    return spellData;
  }

  /**
   * Generate HTML tables from spell data
   * @param {Object} spellData - The spell data object
   * @param {string} userName - User name for header
   * @returns {string} HTML content
   */
  _generateTablesHTML(spellData, userName) {
    let notesRows = '';
    let usageRows = '';

    for (const [uuid, data] of Object.entries(spellData)) {
      const spellName = this._getSpellNameFromUuid(uuid);
      const favoriteIcon = data.favorited ? '★' : '☆';
      const favoriteClass = data.favorited ? 'favorited-true' : 'favorited-false';

      // Notes table row
      notesRows += `
        <tr data-spell-uuid="${uuid}" data-favorited="${data.favorited}">
          <td>@UUID[${uuid}]{${spellName}}</td>
          <td><span class="${favoriteClass}">${favoriteIcon}</span></td>
          <td>${data.notes || ''}</td>
        </tr>
      `;

      // Usage table row (only if there's usage data)
      if (data.usageStats && data.usageStats.count > 0) {
        const lastUsedDate = data.usageStats.lastUsed ? new Date(data.usageStats.lastUsed).toISOString().split('T')[0] : '';

        usageRows += `
          <tr data-spell-uuid="${uuid}" data-total-usage="${data.usageStats.count}">
            <td>@UUID[${uuid}]{${spellName}}</td>
            <td>${data.usageStats.contextUsage.combat}</td>
            <td>${data.usageStats.contextUsage.exploration}</td>
            <td>${data.usageStats.count}</td>
            <td>${lastUsedDate}</td>
          </tr>
        `;
      }
    }

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
      <h1>${userName} - ${game.i18n.localize('SPELLBOOK.UserData.PageTitle')}</h1>
      <p><em>${game.i18n.localize('SPELLBOOK.UserData.PageDescription')}</em></p>

      <h2>${notesTitle}</h2>
      <table class="spell-book-data" data-table-type="spell-notes">
        <thead>
          <tr><th>${spellCol}</th><th>${favoritedCol}</th><th>${notesCol}</th></tr>
        </thead>
        <tbody>${notesRows}</tbody>
      </table>

      <h2>${usageTitle}</h2>
      <table class="spell-book-data" data-table-type="spell-usage">
        <thead>
          <tr><th>${spellCol}</th><th>${combatCol}</th><th>${explorationCol}</th><th>${totalCol}</th><th>${lastUsedCol}</th></tr>
        </thead>
        <tbody>${usageRows}</tbody>
      </table>

      <hr>
      <p><small><em>${game.i18n.localize('SPELLBOOK.UserData.AutoGenerated')}</em></small></p>
    `;
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
   * Get user spell data (public API)
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>}
   */
  async getUserDataForSpell(spellOrUuid, userId = null) {
    try {
      const spellUuid = typeof spellOrUuid === 'string' ? spellOrUuid : spellOrUuid?.uuid || spellOrUuid?.compendiumUuid;

      if (!spellUuid) return null;

      const targetUserId = userId || game.user.id;
      const cacheKey = `${targetUserId}:${spellUuid}`;

      // Check cache first
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const page = await this._getUserPage(targetUserId);
      if (!page) return null;

      const spellData = this._parseSpellDataFromHTML(page.text.content);

      // Cache all data for this user
      for (const [uuid, data] of Object.entries(spellData)) {
        this.cache.set(`${targetUserId}:${uuid}`, data);
      }

      return spellData[spellUuid] || null;
    } catch (error) {
      log(1, 'Error getting user spell data from journal:', error);
      return null;
    }
  }

  /**
   * Set user spell data (public API)
   * @param {string|Object} spellOrUuid - Spell UUID or spell object
   * @param {Object} data - Data to set
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async setUserDataForSpell(spellOrUuid, data, userId = null) {
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

      // Update data
      if (!spellData[spellUuid]) {
        spellData[spellUuid] = {
          favorited: false,
          notes: '',
          usageStats: { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } }
        };
      }

      Object.assign(spellData[spellUuid], data);

      // Generate new HTML
      const newContent = this._generateTablesHTML(spellData, user.name);

      // Update page
      await page.update({
        'text.content': newContent,
        [`flags.${MODULE.ID}.lastUpdated`]: Date.now()
      });

      // Update cache
      this.cache.set(`${targetUserId}:${spellUuid}`, spellData[spellUuid]);

      log(3, `Updated spell data in journal for ${spellUuid}`);
      return true;
    } catch (error) {
      log(1, 'Error setting user spell data in journal:', error);
      return false;
    }
  }
}

// Export singleton instance
const spellUserDataJournal = new SpellUserDataJournal();

// Export API functions that match existing interface
export async function getUserDataForSpell(spellOrUuid, userId = null) {
  return await spellUserDataJournal.getUserDataForSpell(spellOrUuid, userId);
}

export async function setUserDataForSpell(spellOrUuid, data, userId = null) {
  return await spellUserDataJournal.setUserDataForSpell(spellOrUuid, data, userId);
}

export async function setSpellFavorite(spellOrUuid, favorited, userId = null) {
  return await setUserDataForSpell(spellOrUuid, { favorited }, userId);
}

export async function setSpellNotes(spellOrUuid, notes, userId = null) {
  const maxLength = game.settings.get(MODULE.ID, 'spellNotesMaxLength') || 240;
  const trimmedNotes = notes ? notes.substring(0, maxLength) : '';
  return await setUserDataForSpell(spellOrUuid, { notes: trimmedNotes }, userId);
}

export function enhanceSpellWithUserData(spell, userId = null) {
  // This becomes async in the new system, but we'll cache for sync access
  const spellUuid = spell?.uuid || spell?.compendiumUuid;
  if (!spellUuid) return spell;

  const targetUserId = userId || game.user.id;
  const cacheKey = `${targetUserId}:${spellUuid}`;
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
