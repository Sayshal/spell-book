import * as spellUserData from '../helpers/spell-user-data.mjs';
import { log } from '../logger.mjs';

/**
 * Manager for tracking spell usage from D&D5e activity consumption
 */
export class SpellUsageTracker {
  constructor() {
    this.initialized = false;
    this.activeTracking = new Map(); // Track concurrent usage to prevent duplicates
  }

  /**
   * Initialize the usage tracking system
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    // Hook into D&D5e activity consumption
    Hooks.on('dnd5e.activityConsumption', this._handleActivityConsumption.bind(this));

    this.initialized = true;
    log(3, 'Spell usage tracker initialized');
  }

  /**
   * Handle D&D5e activity consumption events
   * @param {Activity} activity - The activity being consumed
   * @param {Object} usageConfig - Usage configuration
   * @param {Object} messageConfig - Message configuration
   * @param {Object} updates - Document updates
   * @private
   */
  async _handleActivityConsumption(activity, usageConfig, messageConfig, updates) {
    try {
      // Check if tracking is enabled
      if (!game.settings.get(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING)) {
        return;
      }

      // Only track spell activities
      if (activity.parent?.parent?.type !== 'spell') return;

      const spell = activity.parent.parent;
      const actor = spell.actor;

      if (!actor || actor.type !== 'character') return;

      // Get canonical UUID from source flag
      const canonicalUuid = spell.flags?.core?.sourceId || spell.uuid;

      // Prevent duplicate tracking for the same usage
      const trackingKey = `${canonicalUuid}-${Date.now()}`;
      if (this.activeTracking.has(trackingKey)) return;

      this.activeTracking.set(trackingKey, true);

      // Detect usage context
      const context = this._detectUsageContext(actor);

      // Record the usage for the actor (not user)
      await this._recordSpellUsage(canonicalUuid, context, actor);

      // Clean up tracking after a short delay
      setTimeout(() => this.activeTracking.delete(trackingKey), 1000);

      log(3, `Tracked spell usage for actor ${actor.name}: ${spell.name} (${context})`);
    } catch (error) {
      log(1, 'Error tracking spell usage:', error);
    }
  }

  /**
   * Detect usage context (combat vs exploration)
   * @param {Actor} actor - The casting actor
   * @returns {string} 'combat' or 'exploration'
   * @private
   */
  _detectUsageContext(actor) {
    // Check if there's an active combat
    if (!game.combat) return 'exploration';

    // Check if the actor is participating in the current combat
    const combatants = [...game.combat.combatants.values()];
    const isInCombat = combatants.some((combatant) => combatant.actorId === actor.id);

    return isInCombat ? 'combat' : 'exploration';
  }

  /**
   * Record spell usage in actor data
   * @param {string} spellUuid - Canonical spell UUID
   * @param {string} context - 'combat' or 'exploration'
   * @param {Actor} actor - The casting actor
   * @returns {Promise<void>}
   * @private
   */
  async _recordSpellUsage(spellUuid, context, actor) {
    try {
      // Find the user who owns this actor
      const owningUser = game.users.find((user) => user.character?.id === actor.id);
      const targetUserId = owningUser?.id || game.user.id; // Fallback to current user if no owner found

      // Get current usage stats for this actor
      const userData = (await spellUserData.getUserDataForSpell(spellUuid, targetUserId, actor.id)) || {};
      const currentStats = userData.usageStats || {
        count: 0,
        lastUsed: null,
        contextUsage: { combat: 0, exploration: 0 }
      };

      // Update usage statistics
      const newStats = {
        count: currentStats.count + 1,
        lastUsed: Date.now(),
        contextUsage: {
          combat: currentStats.contextUsage.combat + (context === 'combat' ? 1 : 0),
          exploration: currentStats.contextUsage.exploration + (context === 'exploration' ? 1 : 0)
        }
      };

      // Save updated data
      await spellUserData.setUserDataForSpell(
        spellUuid,
        {
          ...userData,
          usageStats: newStats
        },
        targetUserId,
        actor.id
      );
    } catch (error) {
      log(1, 'Error recording spell usage:', error);
    }
  }

  /**
   * Get usage statistics for a spell
   * @param {string} spellUuid - Spell UUID
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object|null>} Usage statistics
   */
  async getSpellUsageStats(spellUuid, userId = null) {
    try {
      const userData = await spellUserData.getUserDataForSpell(spellUuid, userId);
      return userData?.usageStats || null;
    } catch (error) {
      log(1, 'Error getting spell usage stats:', error);
      return null;
    }
  }

  /**
   * Set usage statistics for a spell (for data management)
   * @param {string} spellUuid - Spell UUID
   * @param {Object} usageStats - Usage statistics
   * @param {string} userId - User ID (optional)
   * @returns {Promise<boolean>} Success status
   */
  async setSpellUsageStats(spellUuid, usageStats, userId = null) {
    try {
      const userData = (await spellUserData.getUserDataForSpell(spellUuid, userId)) || {};
      return await spellUserData.setUserDataForSpell(
        spellUuid,
        {
          ...userData,
          usageStats
        },
        userId
      );
    } catch (error) {
      log(1, 'Error setting spell usage stats:', error);
      return false;
    }
  }
}

// Export singleton instance
export const spellUsageTracker = new SpellUsageTracker();
