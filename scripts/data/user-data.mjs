/**
 * Journal-based user spell data storage (notes and favorites).
 * @module Data/UserData
 * @author Tyler
 */

import { FLAGS, MODULE, PACK, TEMPLATES } from '../constants.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/** @type {string} Current data version for migration tracking */
const DATA_VERSION = '3.1';

/** @type {string} Standard journal name for user spell data */
const JOURNAL_NAME = 'User Spell Data';

/** @type {Map<string, object>} Session-scoped cache of loaded user spell data */
const cache = new Map();

/**
 * Encode a UUID for use as a Foundry flag key (dots create nested objects).
 * @param {string} uuid - The UUID to encode
 * @returns {string} Encoded UUID
 */
function encodeUuidKey(uuid) {
  return uuid.replace(/\./g, '~');
}

/**
 * Decode an encoded flag key back to a UUID.
 * @param {string} key - The encoded key
 * @returns {string} Original UUID
 */
function decodeUuidKey(key) {
  return key.replace(/~/g, '.');
}

/**
 * Get the user spell data journal from the module pack.
 * @returns {Promise<object|null>} The journal document or null
 */
async function getJournal() {
  const docs = await game.packs.get(PACK.USERDATA).getDocuments();
  return docs.find((doc) => doc.name === JOURNAL_NAME && doc.flags?.[MODULE.ID]?.isUserSpellDataJournal) ?? null;
}

/**
 * Get a user's journal page.
 * @param {string} userId - User ID to look up
 * @returns {Promise<object|null>} The user's page or null
 */
async function getUserPage(userId) {
  const journal = await getJournal();
  return journal?.pages.find((page) => page.flags?.[MODULE.ID]?.userId === userId) ?? null;
}

/**
 * Load spell data for a user from journal page flags.
 * Returns cached data if available; otherwise reads from the journal.
 * @param {string} userId - User ID to load data for
 * @returns {Promise<object>} Spell data object keyed by spell UUID
 */
export async function loadUserSpellData(userId) {
  if (cache.has(userId)) return cache.get(userId);
  const page = await getUserPage(userId);
  if (!page) return {};
  const flagData = page.flags?.[MODULE.ID]?.[FLAGS.USER_SPELL_DATA];
  const dataVersion = page.flags?.[MODULE.ID]?.dataVersion;
  let spellData = {};
  if (flagData && dataVersion === DATA_VERSION) {
    for (const [encodedKey, value] of Object.entries(flagData)) spellData[decodeUuidKey(encodedKey)] = value;
  } else if (page.text?.content) {
    spellData = parseSpellDataFromHTML(page.text.content);
    await page.update({
      [`flags.${MODULE.ID}.${FLAGS.USER_SPELL_DATA}`]: spellData,
      [`flags.${MODULE.ID}.dataVersion`]: DATA_VERSION,
      [`flags.${MODULE.ID}.migratedAt`]: Date.now()
    });
  }
  cache.set(userId, spellData);
  return spellData;
}

/**
 * Save spell data for a user to journal page flags and regenerate display HTML.
 * @param {string} userId - User ID to save data for
 * @param {object} spellData - Complete spell data object keyed by UUID
 * @returns {Promise<boolean>} Whether the save succeeded
 */
export async function saveUserSpellData(userId, spellData) {
  const page = await getUserPage(userId);
  if (!page) return false;
  const user = game.users.get(userId);
  if (!user) return false;
  const encodedData = {};
  for (const [uuid, value] of Object.entries(spellData)) encodedData[encodeUuidKey(uuid)] = value;
  const displayHtml = await formatUserSpellsHTML(spellData, user.name, userId);
  await page.update({
    'text.content': displayHtml,
    [`flags.${MODULE.ID}.${FLAGS.USER_SPELL_DATA}`]: encodedData,
    [`flags.${MODULE.ID}.lastUpdated`]: Date.now(),
    [`flags.${MODULE.ID}.dataVersion`]: DATA_VERSION
  });
  cache.set(userId, spellData);
  return true;
}

/**
 * Generate display HTML tables from spell data for journal viewing.
 * @param {object} spellData - Spell data object keyed by UUID
 * @param {string} userName - Display name for the user
 * @param {string} userId - User ID for actor ownership lookup
 * @returns {Promise<string>} Rendered HTML string
 */
export async function formatUserSpellsHTML(spellData, userName, userId) {
  const unknownSpell = _loc('SPELLBOOK.UI.UnknownSpell');
  const spellNameCache = new Map();
  const getSpellName = (uuid) => {
    if (!spellNameCache.has(uuid)) spellNameCache.set(uuid, fromUuidSync(uuid)?.name || unknownSpell);
    return spellNameCache.get(uuid);
  };
  const user = game.users.get(userId);
  const userActors = game.actors.filter((actor) => actor.type === 'character' && (actor.ownership[userId] === 3 || user?.character?.id === actor.id));
  const processedActors = userActors.map((actor) => {
    const favoriteSpells = [];
    for (const [uuid, data] of Object.entries(spellData)) if (data.actorData?.[actor.id]?.favorited) favoriteSpells.push({ uuid, name: getSpellName(uuid) });
    return { id: actor.id, name: actor.name, favoriteSpells };
  });
  const notesSpells = [];
  for (const [uuid, data] of Object.entries(spellData)) if (data.notes?.trim()) notesSpells.push({ uuid, name: getSpellName(uuid), notes: data.notes });
  return renderTemplate(TEMPLATES.COMPONENTS.USER_SPELL_DATA_TABLES, {
    isGM: false,
    userId,
    userName,
    userActors: processedActors,
    notesSpells,
    notesTitle: _loc('SPELLBOOK.UserData.SpellNotes'),
    spellCol: _loc('SPELLBOOK.UserData.SpellColumn'),
    notesCol: _loc('SPELLBOOK.UserData.NotesColumn'),
    favoritesTitle: _loc('SPELLBOOK.UserData.FavoritesTitle'),
    favoritedCol: _loc('SPELLBOOK.UserData.FavoritedColumn')
  });
}

/** Clear the session cache. Call on relevant hooks (updateJournalEntryPage, etc.). */
export function clearCache() {
  cache.clear();
}

/**
 * Parse spell data from legacy HTML tables (pre-3.1 migration path).
 * @param {string} htmlContent - Journal page HTML content
 * @returns {object} Parsed spell data object keyed by UUID
 */
function parseSpellDataFromHTML(htmlContent) {
  const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
  const spellData = {};
  const notesRows = doc.querySelectorAll('table[data-table-type="spell-notes"] tbody tr[data-spell-uuid]');
  for (const row of notesRows) {
    const uuid = row.dataset.spellUuid;
    const notes = row.querySelector('td:nth-child(2)')?.textContent.trim() || '';
    if (!spellData[uuid]) spellData[uuid] = { notes: '', actorData: {} };
    spellData[uuid].notes = notes;
  }
  const favTables = doc.querySelectorAll('table[data-table-type="spell-favorites"]');
  for (const table of favTables) {
    const actorId = table.dataset.actorId;
    if (!actorId) continue;
    for (const row of table.querySelectorAll('tbody tr[data-spell-uuid]')) {
      const uuid = row.dataset.spellUuid;
      const favorited = row.querySelector('td:nth-child(2)')?.textContent.trim().toLowerCase() === 'yes';
      if (!spellData[uuid]) spellData[uuid] = { notes: '', actorData: {} };
      if (!spellData[uuid].actorData[actorId]) spellData[uuid].actorData[actorId] = { favorited: false };
      spellData[uuid].actorData[actorId].favorited = favorited;
    }
  }
  return spellData;
}
