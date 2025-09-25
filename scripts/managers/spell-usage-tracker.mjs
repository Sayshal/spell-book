/**
 * Spell Usage Tracking and Analytics System
 *
 * Manages tracking of spell usage from D&D 5e activity consumption events, providing
 * analytics data for spell usage patterns, frequency analysis, and context-aware
 * statistics. This singleton class integrates with Foundry's hook system to
 * automatically capture spell usage events and store detailed usage statistics.
 *
 * Key features:
 * - Automatic spell usage detection through D&D 5e activity consumption hooks
 * - Context-aware tracking distinguishing between combat and exploration usage
 * - Singleton pattern ensuring unified tracking across the entire game session
 * - Integration with user data journal system for persistent storage
 * - Duplicate event prevention through active tracking mechanisms
 * - Character actor filtering to focus on player character spell usage
 * - Error handling and logging for reliability
 * - User-specific data storage associating usage with character owners
 *
 * The tracker operates transparently in the background, requiring no direct user
 * interaction while providing valuable analytics data for the spell analytics
 * dashboard and other reporting features.
 *
 * @module Managers/SpellUsageTracker
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Spell usage statistics data structure for analytics.
 *
 * @typedef {Object} SpellUsageStats
 * @property {number} count - Total number of times the spell has been used
 * @property {number|null} lastUsed - Timestamp of most recent usage
 * @property {ContextUsageBreakdown} contextUsage - Usage breakdown by context
 */

/**
 * Context-specific usage breakdown for analytics.
 *
 * @typedef {Object} ContextUsageBreakdown
 * @property {number} combat - Number of times used in combat
 * @property {number} exploration - Number of times used outside combat
 */

/**
 * Spell user data structure containing usage statistics.
 *
 * @typedef {Object} SpellUserData
 * @property {SpellUsageStats} [usageStats] - Usage statistics for this spell
 * @property {Object} [otherData] - Other user-specific spell data
 */

/**
 * Spell Usage Tracker - Singleton analytics and tracking system.
 *
 * This class provides spell usage tracking by hooking into D&D 5e's
 * activity consumption system. It operates as a singleton to ensure unified tracking
 * across the entire game session and integrates with the user data storage system
 * to provide persistent analytics data.
 *
 * The tracker automatically detects spell usage events, determines the context
 * (combat vs exploration), and stores detailed statistics that can be used for
 * analytics dashboards, usage reports, and spell optimization recommendations.
 */
export class SpellUsageTracker {
  /**
   * Singleton instance storage.
   * @type {SpellUsageTracker|null}
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
   *
   * Initializes the tracking system with an active tracking map for preventing
   * duplicate event processing. This constructor is private as part of the
   * singleton pattern - use getInstance() to access the tracker.
   *
   * @private
   */
  constructor() {
    /**
     * Map for tracking active spell usage events to prevent duplicates.
     * Keys are unique tracking identifiers, values are boolean flags.
     * @type {Map<string, boolean>}
     */
    this.activeTracking = new Map();
  }

  /**
   * Get singleton instance of the spell usage tracker.
   *
   * Implements the singleton pattern to ensure only one tracker instance
   * exists throughout the game session. Creates the instance on first
   * access and returns the same instance for all subsequent calls.
   *
   * @returns {SpellUsageTracker} The singleton instance
   * @static
   */
  static getInstance() {
    if (!this._instance) this._instance = new SpellUsageTracker();
    return this._instance;
  }

  /**
   * Initialize the usage tracking system with D&D 5e activity hooks.
   *
   * Sets up the hook system to monitor D&D 5e activity consumption events
   * and begins automatic spell usage tracking. This method is idempotent -
   * it can be called multiple times but will only initialize once to prevent
   * duplicate hook registration.
   *
   * @returns {Promise<void>}
   * @static
   */
  static async initialize() {
    if (this._initialized) return;
    const instance = this.getInstance();
    Hooks.on('dnd5e.activityConsumption', instance._handleActivityConsumption.bind(instance));
    this._initialized = true;
    log(3, 'Spell usage tracker initialized');
  }

  /**
   * Handle D&D 5e activity consumption events for spell usage tracking.
   *
   * Processes activity consumption events from the D&D 5e system to detect
   * spell usage and record analytics data. Filters for spell activities,
   * validates character actors, prevents duplicate tracking, and determines
   * usage context before recording the event.
   *
   * @private
   * @param {Activity} activity - The activity being consumed
   * @param {Object} _usageConfig - Usage configuration data (unused)
   * @param {Object} _messageConfig - Message configuration data (unused)
   * @param {Object} _updates - Document updates object (unused)
   * @returns {Promise<void>}
   */
  async _handleActivityConsumption(activity, _usageConfig, _messageConfig, _updates) {
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
   * Detect usage context based on combat state.
   *
   * Analyzes the current game state to determine whether a spell was used
   * in combat or during exploration. Checks if there is an active combat
   * and whether the casting actor is a participant in that combat.
   *
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
   * Record spell usage in actor data.
   *
   * Stores spell usage statistics in the user data system, updating counters
   * and context-specific usage breakdowns. Determines the appropriate user
   * for data storage (character owner or current user) and integrates with
   * the SpellUserDataJournal system for persistent storage.
   *
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
      const userData = (await DataHelpers.SpellUserDataJournal.getUserDataForSpell(spellUuid, targetUserId, actor.id)) || {};
      const currentStats = userData.usageStats || { count: 0, lastUsed: null, contextUsage: { combat: 0, exploration: 0 } };
      const newStats = {
        count: currentStats.count + 1,
        lastUsed: Date.now(),
        contextUsage: {
          combat: currentStats.contextUsage.combat + (context === 'combat' ? 1 : 0),
          exploration: currentStats.contextUsage.exploration + (context === 'exploration' ? 1 : 0)
        }
      };
      await DataHelpers.SpellUserDataJournal.setUserDataForSpell(spellUuid, { ...userData, usageStats: newStats }, targetUserId, actor.id);
    } catch (error) {
      log(1, 'Error recording spell usage:', error);
    }
  }
}
