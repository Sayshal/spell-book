import { MODULE, TEMPLATES } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Manager for journal-based user spell data storage
 */
export class UserSpellDataManager {
  constructor() {
    this.journalName = null;
    this.folderName = null;
    this.cache = new Map();
  }

  /**
   * Initialize user spell data management system
   * @async
   * @static
   * @returns {Promise<void>}
   */
  static async initializeUserSpellData() {
    if (!game.user.isGM) return;
    log(3, 'Initializing user spell data journal system...');
    const manager = new UserSpellDataManager();
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
    await this._ensureFolder(pack);
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
      folder = await Folder.create({ name: this.folderName, type: 'JournalEntry', color: '#4a90e2', sorting: 'm' }, { pack: pack.collection });
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
   * Generate empty tables HTML for a user (updated structure with proper heading hierarchy)
   * @param {string} userName - User name for display
   * @param {string} userId - User ID for finding actors
   * @returns {Promise<string>} HTML content
   * @private
   */
  async _generateEmptyTablesHTML(userName, userId) {
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
   * Ensure user table exists (updated to pass userId and set sort order)
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if created, false if existed
   * @private
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
    const pageData = {
      name: user.name,
      type: 'text',
      title: { show: true, level: 1 },
      text: { format: 1, content: await this._generateEmptyTablesHTML(user.name, userId) },
      ownership: { default: 0, [userId]: 3, [game.user.id]: 3 },
      flags: { [MODULE.ID]: { userId: userId, userName: user.name, isUserSpellData: true, created: Date.now(), lastUpdated: Date.now(), dataVersion: '2.0' } },
      sort: 99999
    };
    await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
    log(3, `Created spell data table for user: ${user.name} with per-actor structure`);
    return true;
  }

  /**
   * Create introductory title page for user data journal
   * @param {JournalEntry} journal - The user data journal
   * @returns {Promise<void>}
   * @private
   */
  async _createIntroductoryPage(journal) {
    const existingIntro = journal.pages.find((page) => page.flags?.[MODULE.ID]?.isIntroPage);
    if (existingIntro) return;
    const pageData = {
      name: game.i18n.localize('SPELLBOOK.UserData.IntroPageTitle'),
      type: 'text',
      title: { show: true, level: 1 },
      text: { format: 1, content: this._generateIntroPageHTML() },
      ownership: { default: 0, [game.user.id]: 3 },
      flags: { [MODULE.ID]: { isIntroPage: true, created: Date.now() } },
      sort: 10
    };
    await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
    log(3, 'Created introductory page for user spell data');
  }

  /**
   * Generate introductory page HTML content
   * @returns {string} HTML content
   * @private
   */
  async _generateIntroPageHTML() {
    const renderTemplate = MODULE.ISV13 ? foundry?.applications?.handlebars?.renderTemplate : globalThis.renderTemplate;
    return await renderTemplate(TEMPLATES.COMPONENTS.USER_DATA_INTRO);
  }
}
