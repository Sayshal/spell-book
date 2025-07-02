import { FLAGS, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Get user data for a specific spell
 * @param {string} spellUuid - The spell UUID
 * @param {string} userId - The user ID (defaults to current user)
 * @returns {Object|null} User data for the spell or null if none exists
 */
export function getUserDataForSpell(spellUuid, userId = null) {
  try {
    if (!spellUuid) return null;
    const targetUserId = userId || game.user.id;
    const user = game.users.get(targetUserId);
    if (!user) return null;
    const userData = user.getFlag(MODULE.ID, FLAGS.SPELL_USER_DATA) || {};
    return userData[spellUuid] || null;
  } catch (error) {
    log(1, 'Error getting user data for spell:', error);
    return null;
  }
}

/**
 * Set user data for a specific spell
 * @param {string} spellUuid - The spell UUID
 * @param {Object} data - The user data to set
 * @param {string} userId - The user ID (defaults to current user)
 * @returns {Promise<boolean>} Success status
 */
export async function setUserDataForSpell(spellUuid, data, userId = null) {
  try {
    if (!spellUuid) return false;
    const targetUserId = userId || game.user.id;
    const user = game.users.get(targetUserId);
    if (!user) return false;
    const userData = user.getFlag(MODULE.ID, FLAGS.SPELL_USER_DATA) || {};
    userData[spellUuid] = { ...userData[spellUuid], ...data };
    await user.setFlag(MODULE.ID, FLAGS.SPELL_USER_DATA, userData);
    return true;
  } catch (error) {
    log(1, 'Error setting user data for spell:', error);
    return false;
  }
}

/**
 * Update spell notes
 * @param {string} spellUuid - The spell UUID
 * @param {string} notes - The notes text (max 240 chars by default)
 * @param {string} userId - The user ID (defaults to current user)
 * @returns {Promise<boolean>} Success status
 */
export async function setSpellNotes(spellUuid, notes, userId = null) {
  try {
    const maxLength = game.settings.get(MODULE.ID, 'spellNotesMaxLength') || 240;
    const trimmedNotes = notes ? notes.substring(0, maxLength) : '';
    return await setUserDataForSpell(spellUuid, { notes: trimmedNotes }, userId);
  } catch (error) {
    log(1, 'Error setting spell notes:', error);
    return false;
  }
}

/**
 * Toggle favorite status for a spell
 * @param {string} spellUuid - The spell UUID
 * @param {boolean} favorited - The favorite status
 * @param {string} userId - The user ID (defaults to current user)
 * @returns {Promise<boolean>} Success status
 */
export async function setSpellFavorite(spellUuid, favorited, userId = null) {
  try {
    return await setUserDataForSpell(spellUuid, { favorited: !!favorited }, userId);
  } catch (error) {
    log(1, 'Error setting spell favorite:', error);
    return false;
  }
}

/**
 * Record spell usage
 * @param {string} spellUuid - The spell UUID
 * @param {string} context - Usage context ('combat' or 'exploration')
 * @param {string} userId - The user ID (defaults to current user)
 * @returns {Promise<boolean>} Success status
 */
export async function recordSpellUsage(spellUuid, context = 'exploration', userId = null) {
  try {
    const userData = getUserDataForSpell(spellUuid, userId) || {};
    const usageStats = userData.usageStats || { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } };
    usageStats.count++;
    usageStats.lastUsed = Date.now();
    if (context === 'combat' || context === 'exploration') usageStats.contextUsage[context]++;
    return await setUserDataForSpell(spellUuid, { usageStats }, userId);
  } catch (error) {
    log(1, 'Error recording spell usage:', error);
    return false;
  }
}

/**
 * Get all user spell data for backup/export
 * @param {string} userId - The user ID (defaults to current user)
 * @returns {Object} All user spell data
 */
export function getAllUserSpellData(userId = null) {
  try {
    const targetUserId = userId || game.user.id;
    const user = game.users.get(targetUserId);
    if (!user) return {};
    return user.getFlag(MODULE.ID, FLAGS.SPELL_USER_DATA) || {};
  } catch (error) {
    log(1, 'Error getting all user spell data:', error);
    return {};
  }
}

/**
 * Import user spell data from backup
 * @param {Object} data - The data to import
 * @param {string} userId - The user ID (defaults to current user)
 * @param {boolean} merge - Whether to merge with existing data or replace
 * @returns {Promise<boolean>} Success status
 */
export async function importUserSpellData(data, userId = null, merge = true) {
  try {
    if (!data || typeof data !== 'object') return false;
    const targetUserId = userId || game.user.id;
    const user = game.users.get(targetUserId);
    if (!user) return false;
    let finalData = data;
    if (merge) {
      const existingData = user.getFlag(MODULE.ID, FLAGS.SPELL_USER_DATA) || {};
      finalData = { ...existingData, ...data };
    }
    await user.setFlag(MODULE.ID, FLAGS.SPELL_USER_DATA, finalData);
    return true;
  } catch (error) {
    log(1, 'Error importing user spell data:', error);
    return false;
  }
}

/**
 * Get spell data with user metadata for processing pipeline
 * @param {Object} spell - The spell object
 * @param {string} userId - The user ID (defaults to current user)
 * @returns {Object} Enhanced spell data with user metadata
 */
export function enhanceSpellWithUserData(spell, userId = null) {
  try {
    if (!spell) return spell;
    const spellUuid = spell.uuid || spell.compendiumUuid;
    if (!spellUuid) return spell;
    const userData = getUserDataForSpell(spellUuid, userId);
    return {
      ...spell,
      userData: userData,
      favorited: userData?.favorited || false,
      hasNotes: !!(userData?.notes && userData.notes.trim()),
      usageCount: userData?.usageStats?.count || 0,
      lastUsed: userData?.usageStats?.lastUsed || null
    };
  } catch (error) {
    log(1, 'Error enhancing spell with user data:', error);
    return spell;
  }
}

/**
 * Validate user data structure for migration/import
 * @param {Object} data - The data to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateUserData(data) {
  const result = { isValid: true, errors: [] };
  try {
    if (!data || typeof data !== 'object') {
      result.isValid = false;
      result.errors.push('Data must be an object');
      return result;
    }
    for (const [uuid, spellData] of Object.entries(data)) {
      if (typeof spellData !== 'object') {
        result.errors.push(`Invalid data type for spell ${uuid}`);
        continue;
      }
      if (spellData.notes && typeof spellData.notes === 'string') {
        const maxLength = game.settings.get(MODULE.ID, 'spellNotesMaxLength') || 240;
        if (spellData.notes.length > maxLength) result.errors.push(`Notes too long for spell ${uuid}`);
      }
      if (spellData.favorited !== undefined && typeof spellData.favorited !== 'boolean') result.errors.push(`Invalid favorited value for spell ${uuid}`);
      if (spellData.usageStats) {
        const stats = spellData.usageStats;
        if (typeof stats.count !== 'number' || stats.count < 0) result.errors.push(`Invalid usage count for spell ${uuid}`);
        if (stats.contextUsage) if (typeof stats.contextUsage.combat !== 'number' || typeof stats.contextUsage.exploration !== 'number') result.errors.push(`Invalid context usage for spell ${uuid}`);
      }
    }
    result.isValid = result.errors.length === 0;
  } catch (error) {
    result.isValid = false;
    result.errors.push(`Validation error: ${error.message}`);
  }
  return result;
}
