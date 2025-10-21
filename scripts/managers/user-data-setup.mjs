/**
 * Journal-Based User Spell Data Storage Management
 *
 * Manages the creation and maintenance of journal-based storage for user-specific
 * spell data including notes, favorites, and usage statistics. This class provides
 * a persistent storage solution using Foundry's compendium system to store user
 * data that persists across game sessions and world migrations.
 *
 * Key features:
 * - Automatic journal and folder structure creation in compendium packs
 * - Per-user data table generation with appropriate permissions
 * - HTML template rendering for structured data display
 * - Multi-actor support for users with multiple characters
 * - GM-specific handling and player data segregation
 * - Introductory documentation page creation
 * - Localized content generation for internationalization support
 * - Version tracking for data migration and compatibility
 *
 * The system creates a hierarchical structure within the user data compendium:
 * - Main folder for organization
 * - Master journal entry containing all user data
 * - Individual pages for each user with structured HTML tables
 * - Introductory page with usage instructions
 *
 * Data is stored as HTML tables within journal pages, providing a human-readable
 * format that can be easily viewed and edited within Foundry's journal system
 * while maintaining programmatic access for module functionality.
 *
 * @module Managers/UserDataSetup
 * @author Tyler
 */

import { MODULE, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/**
 * User actor information for data table generation.
 *
 * @typedef {Object} UserActorInfo
 * @property {string} id - Actor ID
 * @property {string} name - Actor display name
 */

/**
 * Journal page data structure for user spell data storage.
 *
 * @typedef {Object} UserSpellDataPageData
 * @property {string} name - Page name (user name)
 * @property {string} type - Page type (always 'text')
 * @property {Object} title - Title configuration object
 * @property {boolean} title.show - Whether to show the title
 * @property {number} title.level - Heading level for the title
 * @property {Object} text - Text content configuration
 * @property {number} text.format - Text format (1 for HTML)
 * @property {string} text.content - HTML content of the page
 * @property {Object} ownership - Permission configuration
 * @property {Object} flags - Module-specific flags and metadata
 * @property {number} sort - Sort order for page display
 */

/**
 * User Spell Data Manager - Journal-based persistent storage system.
 */
export class UserDataSetup {
  /**
   * Create a new User Spell Data Manager instance.
   */
  constructor() {
    /** @type {string|null} Localized name for the main journal entry */
    this.journalName = null;

    /** @type {string|null} Localized name for the organization folder */
    this.folderName = null;
  }

  /**
   * Initialize user spell data management system.
   * @returns {Promise<void>}
   * @static
   */
  static async initializeUserSpellData() {
    if (!game.user.isGM) return;
    log(3, 'Initializing user spell data journal system...');
    const manager = new UserDataSetup();
    await manager._ensureJournalSetup();
    let setupCount = 0;
    for (const user of game.users) {
      if (user.isGM) continue;
      const created = await manager._ensureUserTable(user.id);
      if (created) setupCount++;
    }
    if (setupCount > 0) log(3, `Created spell data tables for ${setupCount} users`);
    else log(3, 'All user spell data tables already exist');
  }

  /**
   * Ensure journal and folder structure exists.
   * @private
   * @returns {Promise<void>}
   */
  async _ensureJournalSetup() {
    this.folderName = game.i18n.localize('SPELLBOOK.UserData.FolderName');
    this.journalName = game.i18n.localize('SPELLBOOK.UserData.FolderName');
    const pack = game.packs.get(MODULE.PACK.USERDATA);
    if (!pack) {
      log(1, 'Spells pack not found for user data setup');
      return;
    }
    await this._ensureFolder(pack);
    await this._ensureJournal(pack);
  }

  /**
   * Ensure folder exists in the pack.
   * @private
   * @param {CompendiumCollection} pack - The spells pack
   * @returns {Promise<Folder>} Promise that resolves to the existing or newly created folder
   */
  async _ensureFolder(pack) {
    let folder = pack.folders.find((f) => f.name === this.folderName);
    if (!folder) {
      folder = await Folder.create({ name: this.folderName, type: 'JournalEntry', color: '#4a90e2', sorting: 'm' }, { pack: pack.collection });
      log(3, `Created user data folder: ${this.folderName}`);
    }
    return folder;
  }

  /**
   * Ensure journal exists in the folder.
   * @private
   * @param {CompendiumCollection} pack - The spells pack
   * @returns {Promise<JournalEntry>} Promise that resolves to the existing or newly created journal entry
   */
  async _ensureJournal(pack) {
    const documents = await pack.getDocuments();
    let journal = documents.find((doc) => doc.name === this.journalName && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);
    if (!journal) {
      const folder = pack.folders.find((f) => f.name === this.folderName);
      journal = await JournalEntry.create(
        {
          name: this.journalName,
          folder: folder?.id || null,
          ownership: { default: 0, [game.user.id]: 3 },
          flags: { [MODULE.ID]: { isUserSpellDataJournal: true, version: '0.9.0', created: Date.now() } }
        },
        { pack: pack.collection }
      );
      log(3, `Created user spell data journal: ${this.journalName}`);
    }
    await this._createIntroductoryPage(journal);
    return journal;
  }

  /**
   * Generate empty tables HTML for a user.
   * @private
   * @param {string} userName - User name for display
   * @param {string} userId - User ID for finding actors
   * @returns {Promise<string>} HTML content
   */
  async _generateEmptyTablesHTML(userName, userId) {
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
    if (isGM) return await renderTemplate(TEMPLATES.COMPONENTS.USER_SPELL_DATA_EMPTY, { isGM: true, userId, userName });
    const userActors = game.actors.filter((actor) => actor.type === 'character' && (actor.ownership[userId] === 3 || user?.character?.id === actor.id));
    const processedActors = userActors.map((actor) => ({ id: actor.id, name: actor.name }));
    return await renderTemplate(TEMPLATES.COMPONENTS.USER_SPELL_DATA_EMPTY, {
      isGM: false,
      userId,
      userName,
      userActors: processedActors,
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
   * Ensure user table exists.
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if created, false if existed
   */
  async _ensureUserTable(userId) {
    const user = game.users.get(userId);
    if (!user) return false;
    if (user.isGM) return false;
    const pack = game.packs.get(MODULE.PACK.USERDATA);
    if (!pack) return false;
    const documents = await pack.getDocuments();
    const journal = documents.find((doc) => doc.name === this.journalName && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal);
    if (!journal) return false;
    const existingPage = journal.pages.find((page) => page.flags?.[MODULE.ID]?.userId === userId);
    if (existingPage) return false;
    const basePageData = { type: 'text', title: { show: true, level: 1 }, text: { format: 1 }, ownership: { default: 0 }, flags: { [MODULE.ID]: { isUserSpellData: true } }, sort: 99999 };
    const pageData = foundry.utils.mergeObject(basePageData, {
      name: user.name,
      text: { content: await this._generateEmptyTablesHTML(user.name, userId) },
      ownership: { [userId]: 3, [game.user.id]: 3 },
      flags: { [MODULE.ID]: { userId: userId, userName: user.name, created: Date.now(), lastUpdated: Date.now(), dataVersion: '2.0' } }
    });
    await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
    log(3, `Created spell data table for user: ${user.name} with per-actor structure`);
    return true;
  }

  /**
   * Create introductory title page for user data journal.
   * @private
   * @param {JournalEntry} journal - The user data journal
   * @returns {Promise<void>}
   */
  async _createIntroductoryPage(journal) {
    const existingIntro = journal.pages.find((page) => page.flags?.[MODULE.ID]?.isIntroPage);
    if (existingIntro) return;
    const content = await renderTemplate(TEMPLATES.COMPONENTS.USER_DATA_INTRO);
    const basePageData = { type: 'text', title: { show: true, level: 1 }, text: { format: 1 }, ownership: { default: 0 }, flags: { [MODULE.ID]: { isIntroPage: true } }, sort: 10 };
    const pageData = foundry.utils.mergeObject(basePageData, {
      name: game.i18n.localize('SPELLBOOK.UserData.IntroPageTitle'),
      text: { content: content },
      ownership: { [game.user.id]: 3 },
      flags: { [MODULE.ID]: { created: Date.now() } }
    });
    await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
    log(3, 'Created introductory page for user spell data');
  }
}
