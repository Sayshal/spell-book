import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Manager for journal-based user spell data storage
 */
export class UserSpellDataManager {
  constructor() {
    this.journalName = null; // Will be localized
    this.folderName = null; // Will be localized
    this.cache = new Map(); // Cache for performance
  }

  /**
   * Initialize user spell data journal system for all users
   * @returns {Promise<void>}
   */
  static async initializeUserSpellData() {
    if (!game.user.isGM) return;

    log(3, 'Initializing user spell data journal system...');

    const manager = new UserSpellDataManager();
    await manager._ensureJournalSetup();

    // Setup tables for all users
    let setupCount = 0;
    for (const user of game.users) {
      const created = await manager._ensureUserTable(user.id);
      if (created) setupCount++;
    }

    if (setupCount > 0) {
      log(3, `Created spell data tables for ${setupCount} users`);
    } else {
      log(3, 'All user spell data tables already exist');
    }
  }

  /**
   * Ensure journal and folder structure exists
   * @returns {Promise<void>}
   * @private
   */
  async _ensureJournalSetup() {
    this.folderName = game.i18n.localize('SPELLBOOK.UserData.FolderName');
    this.journalName = game.i18n.localize('SPELLBOOK.UserData.FolderName');

    const pack = game.packs.get(MODULE.PACK.USERDATA);
    if (!pack) {
      log(1, 'Spells pack not found for user data setup');
      return;
    }

    // Ensure folder exists
    await this._ensureFolder(pack);

    // Ensure journal exists
    await this._ensureJournal(pack);
  }

  /**
   * Ensure folder exists in the pack
   * @param {CompendiumCollection} pack - The spells pack
   * @returns {Promise<Folder>}
   * @private
   */
  async _ensureFolder(pack) {
    let folder = pack.folders.find((f) => f.name === this.folderName);

    if (!folder) {
      folder = await Folder.create(
        {
          name: this.folderName,
          type: 'JournalEntry',
          color: '#4a90e2', // Blue color for user data
          sorting: 'm' // Manual sorting
        },
        { pack: pack.collection }
      );

      log(3, `Created user data folder: ${this.folderName}`);
    }

    return folder;
  }

  /**
   * Ensure journal exists in the folder
   * @param {CompendiumCollection} pack - The spells pack
   * @returns {Promise<JournalEntry>}
   * @private
   */
  async _ensureJournal(pack) {
    // Find existing journal
    const documents = await pack.getDocuments();
    let journal = documents.find((doc) => doc.name === this.journalName && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);

    if (!journal) {
      const folder = pack.folders.find((f) => f.name === this.folderName);

      journal = await JournalEntry.create(
        {
          name: this.journalName,
          folder: folder?.id || null,
          ownership: {
            default: 0, // No default access
            [game.user.id]: 3 // Owner access for GM
          },
          flags: {
            [MODULE.ID]: {
              isUserSpellDataJournal: true,
              version: '0.9.0',
              created: Date.now()
            }
          }
        },
        { pack: pack.collection }
      );

      log(3, `Created user spell data journal: ${this.journalName}`);
    }

    return journal;
  }

  /**
   * Ensure user table exists
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if created, false if existed
   * @private
   */
  async _ensureUserTable(userId) {
    const user = game.users.get(userId);
    if (!user) return false;

    const pack = game.packs.get(MODULE.PACK.USERDATA);
    if (!pack) return false;

    const documents = await pack.getDocuments();
    const journal = documents.find((doc) => doc.name === this.journalName && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);

    if (!journal) return false;

    // Check if user page already exists
    const existingPage = journal.pages.find((page) => page.flags?.[MODULE.ID]?.userId === userId);

    if (existingPage) return false;

    // Create user page
    const pageData = {
      name: user.name,
      type: 'text',
      title: { show: true, level: 1 },
      text: {
        format: 1,
        content: this._generateEmptyTablesHTML(user.name)
      },
      ownership: {
        default: 0,
        [userId]: 3, // Owner access for the user
        [game.user.id]: 3 // Owner access for GM
      },
      flags: {
        [MODULE.ID]: {
          userId: userId,
          userName: user.name,
          isUserSpellData: true,
          created: Date.now(),
          lastUpdated: Date.now()
        }
      }
    };

    await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
    log(3, `Created spell data table for user: ${user.name}`);
    return true;
  }

  /**
   * Generate empty tables HTML for a user
   * @param {string} userName - User name for display
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
      <h1>${userName} - ${game.i18n.localize('SPELLBOOK.UserData.PageTitle')}</h1>
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
