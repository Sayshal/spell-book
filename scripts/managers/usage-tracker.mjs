/**
 * Spell Usage Tracking and Analytics System
 *
 * Manages tracking of spell usage from D&D 5e activity consumption events, providing
 * analytics data for spell usage patterns, frequency analysis, and context-aware
 * statistics. This singleton class integrates with Foundry's hook system to
 * automatically capture spell usage events and store detailed usage statistics.
 * @module Managers/UsageTracker
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Spell Usage Tracker - Singleton analytics and tracking system.
 */
export class UsageTracker {
  /**
   * Singleton instance storage.
   * @type {UsageTracker|null}
   * @private
   * @static
   */
  static _instance = null;

  /**
   * Initialization state flag to prevent duplicate hook registration.
   * @type {boolean}
   * @private
   * @static
   */
  static _initialized = false;

  /**
   * Create a new Spell Usage Tracker instance.
   * @private
   */
  constructor() {
    /**
     * Map for tracking active spell usage events to prevent duplicates.
     * @type {Map<string, boolean>}
     */
    this.activeTracking = new Map();
    log(3, `UsageTracker instance created.`);
  }

  /**
   * Get singleton instance of the spell usage tracker.
   * @returns {object} The singleton instance
   * @static
   */
  static getInstance() {
    if (!this._instance) this._instance = new UsageTracker();
    return this._instance;
  }

  /**
   * Initialize the usage tracking system with D&D 5e activity hooks.
   * @returns {Promise<void>}
   * @static
   */
  static async initialize() {
    if (this._initialized) return;
    const instance = this.getInstance();
    Hooks.on('dnd5e.activityConsumption', instance._handleActivityConsumption.bind(instance));
    this._initialized = true;
    log(3, `UsageTracker initialized and hook registered.`);
  }

  /**
   * Handle activity consumption events for spell usage tracking.
   * @private
   * @param {object} activity - The activity being consumed
   * @param {object} _usageConfig - Usage configuration data (unused)
   * @param {object} _messageConfig - Message configuration data (unused)
   * @param {object} _updates - Document updates object (unused)
   * @returns {Promise<void>}
   */
  async _handleActivityConsumption(activity, _usageConfig, _messageConfig, _updates) {
    log(3, `Handling activity consumption event.`, { activityType: activity?.type });
    const trackingEnabled = game.settings.get(MODULE.ID, SETTINGS.ENABLE_SPELL_USAGE_TRACKING);
    if (!trackingEnabled) return;
    const parentType = foundry.utils.getProperty(activity, 'parent.parent.type');
    if (parentType !== 'spell') return;
    const spell = activity.parent.parent;
    const actor = spell.actor;
    if (!actor) return;
    if (actor.type !== 'character') return;
    log(3, `Processing spell usage for tracking.`, { actorName: actor.name, spellName: spell.name });
    const canonicalUuid = DataUtils.getCanonicalSpellUuid(spell);
    const trackingKey = `${canonicalUuid}-${Date.now()}`;
    if (this.activeTracking.has(trackingKey)) return;
    this.activeTracking.set(trackingKey, true);
    log(3, `Tracking event registered.`, { trackingKey, activeTrackingSize: this.activeTracking.size });
    const context = this._detectUsageContext(actor);
    await this._recordSpellUsage(canonicalUuid, context, actor);
    setTimeout(() => {
      this.activeTracking.delete(trackingKey);
      log(3, `Tracking event cleanup completed.`, { trackingKey });
    }, 1000);
    log(3, `Tracked spell usage for actor ${actor.name}: ${spell.name} (${context})`);
  }

  /**
   * Detect usage context based on combat state.
   * @private
   * @param {object} actor - The casting actor
   * @returns {string} Either 'combat' or 'exploration'
   */
  _detectUsageContext(actor) {
    log(3, `Detecting usage context.`, { actorName: actor.name, actorId: actor.id, hasCombat: !!game.combat });
    if (!game.combat) return 'exploration';
    const combatants = [...game.combat.combatants.values()];
    const isInCombat = combatants.some((combatant) => combatant.actorId === actor.id);
    const context = isInCombat ? 'combat' : 'exploration';
    log(3, `Usage context determined.`, { actorName: actor.name, context, combatantCount: combatants.length });
    return context;
  }

  /**
   * Record spell usage in actor data.
   * @private
   * @param {string} spellUuid - Canonical spell UUID
   * @param {string} context - Either 'combat' or 'exploration'
   * @param {object} actor - The casting actor
   * @returns {Promise<void>}
   */
  async _recordSpellUsage(spellUuid, context, actor) {
    try {
      log(3, `Recording spell usage.`, { spellUuid, context, actorName: actor.name, actorId: actor.id });
      const owningUser = game.users.find((user) => user.character?.id === actor.id);
      const targetUserId = owningUser?.id || game.user.id;
      const userData = (await DataUtils.UserData.getUserDataForSpell(spellUuid, targetUserId, actor.id)) || {};
      const currentStats = userData.usageStats || { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } };
      const newStats = {
        count: currentStats.count + 1,
        lastUsed: Date.now(),
        contextUsage: {
          combat: currentStats.contextUsage.combat + (context === 'combat' ? 1 : 0),
          exploration: currentStats.contextUsage.exploration + (context === 'exploration' ? 1 : 0)
        }
      };
      log(3, `New usage stats calculated.`, { spellUuid, count: newStats.count, combatCount: newStats.contextUsage.combat, explorationCount: newStats.contextUsage.exploration });
      const updatedData = foundry.utils.mergeObject(userData, { usageStats: newStats }, { inplace: false });
      await DataUtils.UserData.setUserDataForSpell(spellUuid, updatedData, targetUserId, actor.id);
    } catch (error) {
      log(1, `Error recording spell usage:`, error, { spellUuid, context, actorName: actor.name });
    }
  }
}
