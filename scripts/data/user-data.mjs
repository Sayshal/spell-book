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
async function getUserSpellDataJournal() {
  const pack = game.packs.get(PACK.USER_SPELL_DATA);
  if (!pack) {
    ATLAS.log(2, `User spell data pack "${PACK.USER_SPELL_DATA}" not found. Reinstall the module or restart the world to restore it`);
    return null;
  }
  const docs = await pack.getDocuments();
  return docs.find((doc) => doc.name === JOURNAL_NAME && doc.flags?.[MODULE.ID]?.[FLAGS.IS_USER_SPELL_DATA_JOURNAL]) ?? null;
}

/**
 * Get a user's journal page.
 * @param {string} userId - User ID to look up
 * @returns {Promise<object|null>} The user's page or null
 */
async function getUserPage(userId) {
  const journal = await getUserSpellDataJournal();
  return journal?.pages.find((page) => page.flags?.[MODULE.ID]?.userId === userId) ?? null;
}

/**
 * Drop cached user spell data so the next read comes from the journal.
 * @param {string} [userId] - User to forget, or omit to clear every entry
 * @returns {void}
 */
export function invalidateUserSpellDataCache(userId) {
  if (userId) cache.delete(userId);
  else cache.clear();
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
  const spellData = {};
  if (flagData) {
    for (const [encodedKey, value] of Object.entries(flagData)) spellData[decodeUuidKey(encodedKey)] = value;
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
  const displayHtml = await formatUserSpellsHtml(spellData, user.name, userId);
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
export async function formatUserSpellsHtml(spellData, userName, userId) {
  const unknownSpell = _loc('SPELLBOOK.UI.UnknownSpell');
  const spellNameCache = new Map();
  const getSpellName = (uuid) => {
    if (!spellNameCache.has(uuid)) spellNameCache.set(uuid, fromUuidSync(uuid)?.name || unknownSpell);
    return spellNameCache.get(uuid);
  };
  const user = game.users.get(userId);
  const userActors = game.actors.filter((actor) => actor.type === 'character' && (actor.ownership[userId] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER || user?.character?.id === actor.id));
  const processedActors = userActors.map((actor) => {
    const favoriteSpells = [];
    for (const [uuid, data] of Object.entries(spellData)) if (data.actorData?.[actor.id]?.favorited) favoriteSpells.push({ uuid, name: getSpellName(uuid) });
    return { id: actor.id, name: actor.name, favoriteSpells };
  });
  const notesSpells = [];
  for (const [uuid, data] of Object.entries(spellData)) if (data.notes?.trim()) notesSpells.push({ uuid, name: getSpellName(uuid), notes: data.notes });
  return renderTemplate(TEMPLATES.COMPONENTS.USER_SPELL_DATA_TABLES, {
    userId,
    userName,
    userActors: processedActors,
    notesSpells,
    notesTitle: _loc('SPELLBOOK.UserData.SpellNotes'),
    spellCol: _loc('ATLAS.Common.Spell'),
    notesCol: _loc('ATLAS.Common.Notes'),
    favoritesTitle: _loc('SPELLBOOK.UserData.FavoritesTitle'),
    favoritedCol: _loc('SPELLBOOK.UserData.FavoritedColumn')
  });
}
