import { MODULE, SETTINGS } from '../constants.mjs';
import { SpellUserDataJournal } from '../helpers/spell-user-data.mjs';
import { log } from '../logger.mjs';

/**
 * Manager for tracking spell usage from D&D5e activity consumption
 */
export class SpellUsageTracker {
  static _instance = null;
  static _initialized = false;

  constructor() {
    this.activeTracking = new Map();
  }

  /**
   * Get singleton instance of the spell usage tracker
   * @static
   * @returns {SpellUsageTracker} The singleton instance
   */
  static getInstance() {
    if (!this._instance) this._instance = new SpellUsageTracker();
    return this._instance;
  }

  /**
   * Initialize the usage tracking system with D&D5e activity hooks
   * @async
   * @static
   * @returns {Promise<void>}
   */
  static async initialize() {
    if (this._initialized) return;
    const instance = this.getInstance();
    Hooks.on('dnd5e.activityConsumption', instance._handleActivityConsumption.bind(instance));
    this._initialized = true;
    log(3, 'Spell usage tracker initialized');
  }

  /**
   * Handle D&D5e activity consumption events for spell usage tracking
   * @async
   * @private
   * @param {Activity} activity - The activity being consumed
   * @param {Object} usageConfig - Usage configuration data
   * @param {Object} messageConfig - Message configuration data
   * @param {Object} updates - Document updates object
   * @returns {Promise<void>}
   */
  async _handleActivityConsumption(activity, usageConfig, messageConfig, updates) {
    try {
      if (!game.settings.get(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING)) return;
      if (activity.parent?.parent?.type !== 'spell') return;
      const spell = activity.parent.parent;
      const actor = spell.actor;
      if (!actor || actor.type !== 'character') return;
      const canonicalUuid = spell.flags?.core?.sourceId || spell.uuid;
      const trackingKey = `${canonicalUuid}-${Date.now()}`;
      if (this.activeTracking.has(trackingKey)) return;
      this.activeTracking.set(trackingKey, true);
      const context = this._detectUsageContext(actor);
      await this._recordSpellUsage(canonicalUuid, context, actor);
      setTimeout(() => this.activeTracking.delete(trackingKey), 1000);
      log(3, `Tracked spell usage for actor ${actor.name}: ${spell.name} (${context})`);
    } catch (error) {
      log(1, 'Error tracking spell usage:', error);
    }
  }

  /**
   * Detect usage context based on combat state
   * @private
   * @param {Actor} actor - The casting actor
   * @returns {string} Either 'combat' or 'exploration'
   */
  _detectUsageContext(actor) {
    if (!game.combat) return 'exploration';
    const combatants = [...game.combat.combatants.values()];
    const isInCombat = combatants.some((combatant) => combatant.actorId === actor.id);
    return isInCombat ? 'combat' : 'exploration';
  }

  /**
   * Record spell usage in actor data
   * @async
   * @private
   * @param {string} spellUuid - Canonical spell UUID
   * @param {string} context - Either 'combat' or 'exploration'
   * @param {Actor} actor - The casting actor
   * @returns {Promise<void>}
   */
  async _recordSpellUsage(spellUuid, context, actor) {
    try {
      const owningUser = game.users.find((user) => user.character?.id === actor.id);
      const targetUserId = owningUser?.id || game.user.id;
      const userData = (await SpellUserDataJournal.getUserDataForSpell(spellUuid, targetUserId, actor.id)) || {};
      const currentStats = userData.usageStats || { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } };
      const newStats = {
        count: currentStats.count + 1,
        lastUsed: Date.now(),
        contextUsage: {
          combat: currentStats.contextUsage.combat + (context === 'combat' ? 1 : 0),
          exploration: currentStats.contextUsage.exploration + (context === 'exploration' ? 1 : 0)
        }
      };
      await SpellUserDataJournal.setUserDataForSpell(spellUuid, { ...userData, usageStats: newStats }, targetUserId, actor.id);
    } catch (error) {
      log(1, 'Error recording spell usage:', error);
    }
  }

  /**
   * Get usage statistics for a specific spell
   * @async
   * @static
   * @param {string} spellUuid - Spell UUID to get stats for
   * @param {string|null} [userId] - User ID, defaults to current user
   * @returns {Promise<Object|null>} Usage statistics or null if not found
   */
  static async getSpellUsageStats(spellUuid, userId = null) {
    try {
      const userData = await SpellUserDataJournal.getUserDataForSpell(spellUuid, userId, actorId);
      return userData?.usageStats || null;
    } catch (error) {
      log(1, 'Error getting spell usage stats:', error);
      return null;
    }
  }

  /**
   * Set usage statistics for a spell
   * @async
   * @static
   * @param {string} spellUuid - Spell UUID to set stats for
   * @param {Object} usageStats - Usage statistics data
   * @param {string|null} [userId] - User ID, defaults to current user
   * @returns {Promise<boolean>} Success status
   */
  static async setSpellUsageStats(spellUuid, usageStats, userId = null) {
    try {
      const userData = (await SpellUserDataJournal.getUserDataForSpell(spellUuid, userId, actorId)) || {};
      return await SpellUserDataJournal.setUserDataForSpell(spellUuid, { ...userData, usageStats }, userId);
    } catch (error) {
      log(1, 'Error setting spell usage stats:', error);
      return false;
    }
  }
}
