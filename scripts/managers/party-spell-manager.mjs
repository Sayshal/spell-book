/**
 * Party Spell Coordination and Analysis Management
 *
 * Manages party-wide spell coordination, analysis, and collaboration features for
 * multi-character spellcasting groups. This class provides comprehensive tools for
 * analyzing spell synergies, tracking party spell pools, managing spellcasting focuses,
 * and generating coordination recommendations.
 *
 * Key features:
 * - Party spell pool analysis and comparison matrices
 * - Spell synergy detection and damage type distribution analysis
 * - Spellcasting focus coordination and user selection management
 * - Permission-based spell data access with graceful degradation
 * - Caching system for performance optimization with spell data
 * - Integration with D&D 5e primary party settings and group actors
 * - Comprehensive recommendation system for spell preparation
 * - Multi-class spellcaster support with enhanced class name display
 *
 * The manager supports both primary party integration through D&D 5e settings
 * and manual group actor specification, providing flexible party management
 * options for different campaign styles and group compositions.
 *
 * @module Managers/PartySpellManager
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as UIHelpers from '../ui/_module.mjs';

/**
 * Actor spell data structure for party analysis.
 *
 * @typedef {Object} ActorSpellData
 * @property {string} id - Actor ID
 * @property {string} name - Actor name
 * @property {boolean} hasPermission - Whether current user can view actor details
 * @property {string} token - Actor image/token path
 * @property {string} focus - Actor's spellcasting focus setting
 * @property {SpellcasterData[]} spellcasters - Array of spellcasting class data
 * @property {number} totalSpellsKnown - Total known spells across all classes
 * @property {number} totalSpellsPrepared - Total prepared spells across all classes
 */

/**
 * Spellcasting class data for an actor.
 *
 * @typedef {Object} SpellcasterData
 * @property {string} classId - Class identifier
 * @property {string} className - Display name of the class
 * @property {string} enhancedClassName - Enhanced name including subclass
 * @property {string} icon - Class icon image path
 * @property {SpellData[]} knownSpells - Array of known spell data
 * @property {SpellData[]} preparedSpells - Array of prepared spell data
 * @property {number} totalKnown - Count of known spells
 * @property {number} totalPrepared - Count of prepared spells
 */

/**
 * Individual spell data for party analysis.
 *
 * @typedef {Object} SpellData
 * @property {string} uuid - Spell document UUID
 * @property {string} name - Spell name
 * @property {number} level - Spell level (0-9)
 * @property {string} enrichedIcon - HTML icon link for the spell
 * @property {boolean} prepared - Whether the spell is prepared
 * @property {boolean} [concentration] - Whether the spell requires concentration
 * @property {boolean} [ritual] - Whether the spell can be cast as a ritual
 * @property {string[]} [damageType] - Array of damage types dealt by the spell
 */

/**
 * Party spell comparison data structure.
 *
 * @typedef {Object} PartyComparisonData
 * @property {ActorSpellData[]} actors - Array of actor spell data
 * @property {Object<number, Object<string, SpellComparisonEntry>>} spellsByLevel - Spells organized by level and name
 * @property {SynergyAnalysis} synergy - Spell synergy analysis data
 */

/**
 * Individual spell entry in comparison matrix.
 *
 * @typedef {Object} SpellComparisonEntry
 * @property {string} uuid - Spell document UUID
 * @property {string} name - Spell name
 * @property {string} enrichedIcon - HTML icon link for the spell
 * @property {number} level - Spell level
 * @property {ActorSpellStatus[]} actorStatuses - Status of this spell for each actor
 */

/**
 * Actor status for a specific spell in comparison matrix.
 *
 * @typedef {Object} ActorSpellStatus
 * @property {string} actorId - Actor ID
 * @property {string} name - Actor name
 * @property {string} classId - Class identifier
 * @property {string} className - Class name
 * @property {string} status - Spell status ('prepared' or 'known')
 */

/**
 * Spell synergy analysis data.
 *
 * @typedef {Object} SynergyAnalysis
 * @property {number} totalSpells - Total unique spells in party
 * @property {number} totalPreparedSpells - Total prepared spells in party
 * @property {DamageDistributionEntry[]} damageDistribution - Damage type distribution data
 * @property {number} concentrationSpells - Number of concentration spells
 * @property {number} concentrationPercentage - Percentage of prepared spells requiring concentration
 * @property {number} ritualSpells - Number of ritual spells
 * @property {FocusDistributionEntry[]} focusDistribution - Spellcasting focus distribution
 * @property {string[]} recommendations - Array of recommendation localization keys
 */

/**
 * Damage type distribution entry.
 *
 * @typedef {Object} DamageDistributionEntry
 * @property {string} type - Damage type identifier
 * @property {string} localizedType - Localized damage type name
 * @property {number} count - Number of spells with this damage type
 */

/**
 * Spellcasting focus distribution entry.
 *
 * @typedef {Object} FocusDistributionEntry
 * @property {string} focus - Focus identifier or localization key
 * @property {number} count - Number of actors using this focus
 */

/**
 * Party user information structure.
 *
 * @typedef {Object} PartyUserInfo
 * @property {string} id - User ID
 * @property {string} name - User display name
 * @property {string} actorId - Associated actor ID
 * @property {string} actorName - Associated actor name
 * @property {User} user - Full user object reference
 */

/**
 * Spellcasting focus option configuration.
 *
 * @typedef {Object} FocusOption
 * @property {string} id - Unique focus identifier
 * @property {string} name - Display name of the focus
 * @property {string} [description] - Optional focus description
 */

/**
 * Class spell data cache structure.
 *
 * @typedef {Object} ClassSpellCache
 * @property {SpellData[]} known - Array of known spells for the class
 * @property {SpellData[]} prepared - Array of prepared spells for the class
 */

/**
 * Party Spell Manager - Coordination and analysis for multi-character spellcasting.
 *
 * This class provides comprehensive party spell management capabilities including
 * spell pool analysis, synergy detection, focus coordination, and preparation
 * recommendations. It integrates with Foundry's permission system to provide
 * appropriate data access while maintaining privacy for restricted actors.
 *
 * The manager supports both D&D 5e primary party integration and manual group
 * actor specification, providing flexible party management for different campaign
 * styles. Caching mechanisms ensure optimal performance when analyzing large
 * spell datasets across multiple party members.
 */
export class PartySpellManager {
  /**
   * Create a new Party Spell Manager instance.
   *
   * Initializes the manager with the specified party actors and optional viewing
   * context. Filters the party to include only spellcasting actors and sets up
   * the caching system for optimal performance during analysis operations.
   *
   * @param {Actor[]} [partyActors=[]] - Array of actors in the party
   * @param {Actor} [viewingActor=null] - The actor whose SpellBook opened this manager
   */
  constructor(partyActors = [], viewingActor = null) {
    /** @type {Actor[]} Array of spellcasting actors in the party */
    this.partyActors = partyActors.filter((actor) => this.isSpellcaster(actor));

    /** @type {Actor|null} The actor whose SpellBook opened this manager */
    this.viewingActor = viewingActor;

    /** @type {Map<string, ClassSpellCache>} Cache for spell data by actor-class key */
    this._spellDataCache = new Map();

    /** @type {number} Timestamp of last cache update for invalidation */
    this._lastCacheTime = 0;
  }

  /**
   * Check if an actor is a spellcaster.
   *
   * Determines whether the specified actor has any spellcasting classes
   * configured. This is used to filter party members to only include
   * those relevant for spell coordination analysis.
   *
   * @param {Actor} actor - The actor to check
   * @returns {boolean} True if actor can cast spells
   */
  isSpellcaster(actor) {
    return Object.keys(actor?.spellcastingClasses || {}).length > 0;
  }

  /**
   * Get party spell comparison data.
   *
   * Generates comprehensive comparison data for all party members including
   * individual actor spell data, spells organized by level for matrix display,
   * and synergy analysis. This is the primary method for gathering party-wide
   * spell coordination information.
   *
   * @returns {Promise<PartyComparisonData>} Comparison matrix data
   */
  async getPartySpellComparison() {
    const comparisonData = { actors: [], spellsByLevel: {}, synergy: await this.getSpellSynergyAnalysis() };
    for (const actor of this.partyActors) {
      const actorData = await this.getActorSpellData(actor);
      if (actorData) comparisonData.actors.push(actorData);
    }
    this.organizeSpellsByLevel(comparisonData);
    return comparisonData;
  }

  /**
   * Get spell data for a specific actor.
   *
   * Retrieves comprehensive spell information for the specified actor including
   * all spellcasting classes, known spells, prepared spells, and metadata.
   * Respects Foundry's permission system and provides graceful degradation
   * for actors the current user cannot fully observe.
   *
   * @param {Actor} actor - The actor to analyze
   * @returns {Promise<ActorSpellData|null>} Actor spell data or null if no permission
   */
  async getActorSpellData(actor) {
    if (!this.hasViewPermission(actor)) {
      return {
        id: actor.id,
        name: actor.name,
        hasPermission: false,
        token: actor.img,
        focus: this.getActorSpellcastingFocus(actor),
        spellcasters: [],
        totalSpellsKnown: 0,
        totalSpellsPrepared: 0
      };
    }
    const actorData = {
      id: actor.id,
      name: actor.name,
      hasPermission: true,
      token: actor.img,
      focus: this.getActorSpellcastingFocus(actor),
      spellcasters: [],
      totalSpellsKnown: 0,
      totalSpellsPrepared: 0
    };
    for (const [classId, classData] of Object.entries(actor.spellcastingClasses || {})) {
      const classSpells = await this.getClassSpells(actor, classId);
      if (classSpells) {
        const enhancedClassName = this.getEnhancedClassName(actor, classId, classData);
        actorData.spellcasters.push({
          classId,
          className: classData.name || classId,
          enhancedClassName,
          icon: classData.img,
          knownSpells: classSpells.known,
          preparedSpells: classSpells.prepared,
          totalKnown: classSpells.known.length,
          totalPrepared: classSpells.prepared.length
        });
        actorData.totalSpellsKnown += classSpells.known.length;
        actorData.totalSpellsPrepared += classSpells.prepared.length;
      }
    }
    return actorData;
  }

  /**
   * Get spells for a specific class on an actor.
   *
   * Retrieves and processes all spells associated with the specified class
   * for the given actor. Implements caching to improve performance when
   * repeatedly analyzing the same actor-class combinations. Enriches spell
   * data with UI elements and preparation status.
   *
   * @param {Actor} actor - The actor
   * @param {string} classId - The class identifier
   * @returns {Promise<ClassSpellCache|null>} Class spell data or null on error
   */
  async getClassSpells(actor, classId) {
    const cacheKey = `${actor.id}-${classId}`;
    const now = Date.now();
    if (this._spellDataCache.has(cacheKey) && now - this._lastCacheTime < 30000) return this._spellDataCache.get(cacheKey);
    try {
      const knownSpells = [];
      const preparedSpells = [];
      const classSpells = actor.items.filter((item) => item.type === 'spell' && (item.system.sourceClass === classId || item.sourceClass === classId));
      for (const spell of classSpells) {
        const spellDoc = fromUuidSync(spell.uuid);
        const enrichedIcon = UIHelpers.createSpellIconLink(spellDoc || spell);
        const spellData = { uuid: spell.uuid, name: spell.name, level: spell.system.level, enrichedIcon: enrichedIcon, prepared: spell.system.prepared === 1 };
        knownSpells.push(spellData);
        if (spellData.prepared) preparedSpells.push(spellData);
      }
      const result = { known: knownSpells, prepared: preparedSpells };
      this._spellDataCache.set(cacheKey, result);
      this._lastCacheTime = now;
      return result;
    } catch (error) {
      log(1, `Error getting class spells for ${actor.name}:${classId}:`, error);
      return null;
    }
  }

  /**
   * Get enhanced class name including subclass information.
   *
   * Constructs a display-friendly class name that includes subclass information
   * when available. This provides more detailed identification for multi-class
   * characters and those with meaningful subclass distinctions.
   *
   * @param {Actor} actor - The actor
   * @param {string} classId - The class identifier
   * @param {Object} classData - The class data from spellcastingClasses
   * @returns {string} Enhanced class name with subclass
   */
  getEnhancedClassName(actor, classId, classData) {
    const baseClassName = classData.name || classId;
    if (classData._classLink && classData._classLink.name) return `${classData._classLink.name} ${baseClassName}`;
    const subclassItem = actor.items.find((item) => item.type === 'subclass' && item.system?.classIdentifier === classId);
    if (subclassItem) return `${subclassItem.name} ${baseClassName}`;
    return baseClassName;
  }

  /**
   * Extract damage types from a spell.
   *
   * Analyzes spell activities to determine what damage types the spell can
   * deal. This information is used for party synergy analysis and damage
   * type distribution calculations.
   *
   * @param {Item} spell - The spell item
   * @returns {string[]} Array of damage types
   */
  extractDamageTypes(spell) {
    const damageTypes = new Set();
    for (const activity of spell.system.activities?.values() || []) {
      if (activity.damage?.parts) for (const part of activity.damage.parts) if (part.types && part.types.size > 0) part.types.forEach((type) => damageTypes.add(type));
    }
    return Array.from(damageTypes);
  }

  /**
   * Check if current user has view permission for actor.
   *
   * Determines whether the current user has sufficient permissions to view
   * the actor's spell details. This is used to provide appropriate data
   * access while respecting Foundry's permission system.
   *
   * @param {Actor} actor - The actor to check
   * @returns {boolean} True if user can view actor details
   */
  hasViewPermission(actor) {
    return actor.testUserPermission(game.user, 'OBSERVER');
  }

  /**
   * Get actor's spellcasting focus setting.
   *
   * Retrieves the actor's configured spellcasting focus for party coordination
   * purposes. Returns a default value if no focus is specifically set.
   *
   * @param {Actor} actor - The actor
   * @returns {string} The actor's spellcasting focus
   */
  getActorSpellcastingFocus(actor) {
    return actor.getFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS) || 'SPELLBOOK.Party.Focus.None';
  }

  /**
   * Set actor's spellcasting focus.
   *
   * Updates the actor's spellcasting focus setting for party coordination.
   * This is typically used when actors coordinate their roles within the
   * party's spellcasting strategy.
   *
   * @param {Actor} actor - The actor
   * @param {string} focus - The focus to set
   * @returns {Promise<boolean>} Success status
   */
  async setActorSpellcastingFocus(actor, focus) {
    try {
      await actor.setFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS, focus);
      return true;
    } catch (error) {
      log(1, `Error setting spellcasting focus for ${actor.name}:`, error);
      return false;
    }
  }

  /**
   * Organize spells by level for comparison matrix display.
   *
   * Processes the party comparison data to create a structured matrix of
   * spells organized by level, with each spell entry containing information
   * about which actors know or have prepared the spell. This structure
   * facilitates matrix-style display in the UI.
   *
   * @param {PartyComparisonData} comparisonData - The comparison data to organize
   * @returns {void}
   */
  organizeSpellsByLevel(comparisonData) {
    const spellsByLevel = {};
    for (const actorData of comparisonData.actors) {
      if (!actorData.hasPermission) continue;
      for (const classData of actorData.spellcasters) {
        for (const spell of classData.knownSpells) {
          const level = spell.level;
          const spellKey = spell.name;
          if (!spellsByLevel[level]) spellsByLevel[level] = {};
          if (!spellsByLevel[level][spellKey]) {
            spellsByLevel[level][spellKey] = {
              uuid: spell.uuid,
              name: spell.name,
              enrichedIcon: spell.enrichedIcon,
              level: spell.level,
              actorStatuses: []
            };
          }
          spellsByLevel[level][spellKey].actorStatuses.push({
            actorId: actorData.id,
            name: actorData.name,
            classId: classData.classId,
            className: classData.className,
            status: spell.prepared ? 'prepared' : 'known'
          });
        }
      }
    }
    comparisonData.spellsByLevel = spellsByLevel;
  }

  /**
   * Get spell synergy analysis for the party.
   *
   * Performs comprehensive analysis of the party's spell pool to identify
   * synergies, coverage gaps, and optimization opportunities. Analyzes damage
   * type distribution, concentration spell usage, ritual availability, and
   * focus coordination to generate actionable recommendations.
   *
   * @returns {Promise<SynergyAnalysis>} Synergy analysis data
   */
  async getSpellSynergyAnalysis() {
    const analysis = {
      totalSpells: 0,
      totalPreparedSpells: 0,
      damageDistribution: [],
      concentrationSpells: 0,
      concentrationPercentage: 0,
      ritualSpells: 0,
      focusDistribution: [],
      recommendations: []
    };
    const allSpells = new Set();
    const allPreparedSpells = new Set();
    const damageTypes = {};
    const focusTypes = {};
    let concentrationCount = 0;
    let ritualCount = 0;
    for (const actor of this.partyActors) {
      if (!this.hasViewPermission(actor)) continue;
      const focus = this.getActorSpellcastingFocus(actor);
      focusTypes[focus] = (focusTypes[focus] || 0) + 1;
      for (const [classId] of Object.entries(actor.spellcastingClasses || {})) {
        const classSpells = await this.getClassSpells(actor, classId);
        if (!classSpells) continue;
        for (const spell of classSpells.known) {
          allSpells.add(spell.uuid);
          if (spell.prepared) allPreparedSpells.add(spell.uuid);
          if (spell.concentration) concentrationCount++;
          if (spell.ritual) ritualCount++;
          for (const damageType of spell.damageType || []) damageTypes[damageType] = (damageTypes[damageType] || 0) + 1;
        }
      }
    }
    analysis.totalSpells = allSpells.size;
    analysis.totalPreparedSpells = allPreparedSpells.size;
    analysis.concentrationSpells = concentrationCount;
    analysis.concentrationPercentage = analysis.totalPreparedSpells > 0 ? Math.round((concentrationCount / analysis.totalPreparedSpells) * 100) : 0;
    analysis.ritualSpells = ritualCount;
    analysis.damageDistribution = Object.entries(damageTypes).map(([type, count]) => ({
      type: type,
      localizedType: game.i18n.localize(`DND5E.Damage${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()}`) || type,
      count: count
    }));
    analysis.focusDistribution = Object.entries(focusTypes).map(([focus, count]) => ({ focus: focus, count: count }));
    analysis.recommendations = this.generateRecommendations(analysis);
    return analysis;
  }

  /**
   * Generate spell preparation recommendations based on analysis.
   *
   * Analyzes the party's spell composition to identify potential optimization
   * opportunities and generate actionable recommendations. Considers factors
   * like concentration spell density, ritual utilization, damage type diversity,
   * and focus distribution balance.
   *
   * @param {SynergyAnalysis} analysis - The synergy analysis data
   * @returns {string[]} Array of recommendation localization keys
   */
  generateRecommendations(analysis) {
    const recommendations = [];
    if (analysis.concentrationPercentage > 70) recommendations.push('SPELLBOOK.Party.Recommendations.HighConcentration');
    if (analysis.ritualSpells < 3 && analysis.totalSpells > 20) recommendations.push('SPELLBOOK.Party.Recommendations.LowRituals');
    const damageTypeCount = Object.keys(analysis.damageDistribution).length;
    if (damageTypeCount < 4 && analysis.totalSpells > 15) recommendations.push('SPELLBOOK.Party.Recommendations.LimitedDamageTypes');
    const focusCount = Object.keys(analysis.focusDistribution).length;
    if (focusCount < 3 && this.partyActors.length >= 3) recommendations.push('SPELLBOOK.Party.Recommendations.UnbalancedFocus');
    return recommendations;
  }

  /**
   * Get party actors from the primary party setting or fallback.
   *
   * Retrieves party member actors using D&D 5e's primary party setting when
   * available, or from a specified group actor. Filters to include only
   * spellcasting actors relevant for spell coordination. Provides appropriate
   * warnings when no party is configured.
   *
   * @param {Actor} [groupActor=null] - Optional specific group actor to use instead of primary party
   * @returns {Actor[]} Array of party member actors
   * @static
   */
  static getPartyActors(groupActor = null) {
    if (groupActor && groupActor.type === 'group') {
      const creatures = groupActor.system?.creatures || [];
      return creatures.filter((actor) => actor && Object.keys(actor?.spellcastingClasses || {}).length > 0);
    }
    try {
      const primaryPartyData = game.settings.get('dnd5e', 'primaryParty');
      const primaryPartyActor = primaryPartyData?.actor;
      if (primaryPartyActor && primaryPartyActor.type === 'group') {
        const creatures = primaryPartyActor.system?.creatures || [];
        const spellcasters = creatures.filter((actor) => actor && Object.keys(actor?.spellcastingClasses || {}).length > 0);
        if (spellcasters.length > 0) return spellcasters;
      }
    } catch (error) {
      log(2, 'Error accessing primary party setting:', error);
    }
    if (game.user.isGM) {
      ui.notifications.warn('SPELLBOOK.Party.NoPrimaryPartySet', { localize: true });
      log(2, 'No primary party set in D&D 5e settings. Please configure a primary party group actor.');
    } else {
      ui.notifications.info('SPELLBOOK.Party.AskGMToSetParty', { localize: true });
    }
    return [];
  }

  /**
   * Get users who have actors in the party group.
   *
   * Identifies which users have character actors that are members of the
   * specified party group. This information is useful for coordination
   * features and user-specific party management functionality.
   *
   * @param {Actor} groupActor - The group actor
   * @returns {PartyUserInfo[]} Array of user objects with their actor information
   * @static
   */
  static getPartyUsers(groupActor) {
    if (!groupActor || groupActor.type !== 'group') return [];
    const partyActors = this.getPartyActors(groupActor);
    const partyUsers = [];
    const partyActorIds = new Set(partyActors.map((actor) => actor.id));
    for (const user of game.users) {
      if (user.character && partyActorIds.has(user.character.id)) partyUsers.push({ id: user.id, name: user.name, actorId: user.character.id, actorName: user.character.name, user: user });
    }
    return partyUsers;
  }

  /**
   * Find the group actor(s) that contain the specified actor.
   *
   * Searches through all group actors in the world to find which groups
   * contain the specified actor as a member. An actor can be a member
   * of multiple groups for different campaign contexts.
   *
   * @param {Actor} actor - The actor to find groups for
   * @returns {Actor[]} Array of group actors containing this actor
   * @static
   */
  static findGroupsForActor(actor) {
    if (!actor) return [];
    const groups = [];
    for (const groupActor of game.actors.filter((a) => a.type === 'group')) {
      const creatures = groupActor.system?.creatures || [];
      if (creatures.some((creature) => creature?.id === actor.id)) groups.push(groupActor);
    }
    return groups;
  }

  /**
   * Get the primary group for an actor.
   *
   * Determines the primary group association for an actor, preferring the
   * D&D 5e primary party setting when available, and falling back to the
   * first group found. This provides a consistent primary group reference
   * for coordination features.
   *
   * @param {Actor} actor - The actor to find primary group for
   * @returns {Actor|null} The primary group actor or null if none found
   * @static
   */
  static getPrimaryGroupForActor(actor) {
    if (!actor) return null;
    try {
      const primaryPartyData = game.settings.get('dnd5e', 'primaryParty');
      const primaryPartyActor = primaryPartyData?.actor;
      if (primaryPartyActor && primaryPartyActor.type === 'group') {
        const creatures = primaryPartyActor.system?.creatures || [];
        if (creatures.some((creature) => creature?.id === actor.id)) return primaryPartyActor;
      }
    } catch (error) {
      console.warn('Error accessing primary party setting:', error);
    }
    const groups = this.findGroupsForActor(actor);
    return groups.length > 0 ? groups[0] : null;
  }

  /**
   * Get available spellcasting focuses from world settings.
   *
   * Retrieves the list of available spellcasting focus names from the
   * world settings configuration. This provides the options available
   * for party coordination and role assignment.
   *
   * @returns {string[]} Array of focus names
   * @static
   */
  static getAvailableFocuses() {
    const focusData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    const focuses = focusData?.focuses || [];
    return focuses.map((focus) => focus.name);
  }

  /**
   * Get available focus options with full data.
   *
   * Retrieves the complete focus option configurations from world settings,
   * including all metadata and configuration details for each available
   * spellcasting focus option.
   *
   * @returns {FocusOption[]} Array of focus option objects
   * @static
   */
  static getAvailableFocusOptions() {
    const focusData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    return focusData?.focuses || [];
  }

  /**
   * Get user's selected focus for the specified group.
   *
   * Retrieves the spellcasting focus selection for a specific user within
   * the context of a group actor. This enables user-specific coordination
   * settings within party management.
   *
   * @param {Actor} groupActor - The group actor
   * @param {string} userId - The user ID
   * @returns {FocusOption|null} The selected focus object or null
   */
  getUserSelectedFocus(groupActor, userId) {
    const userSelections = groupActor?.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
    const selectedFocusId = userSelections[userId];
    if (!selectedFocusId) return null;
    const availableFocuses = this.getAvailableFocusOptions();
    return availableFocuses.find((f) => f.id === selectedFocusId) || null;
  }

  /**
   * Set user's selected focus for the specified group.
   *
   * Updates the spellcasting focus selection for a specific user within
   * the context of a group actor. Manages the flag data structure to
   * maintain per-user focus selections.
   *
   * @param {Actor} groupActor - The group actor
   * @param {string} userId - The user ID
   * @param {string} focusId - The focus ID to set
   * @returns {Promise<boolean>} Success status
   */
  async setUserSelectedFocus(groupActor, userId, focusId) {
    try {
      const currentSelections = groupActor.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
      if (focusId) currentSelections[userId] = focusId;
      else delete currentSelections[userId];
      await groupActor.setFlag(MODULE.ID, FLAGS.SELECTED_FOCUS, currentSelections);
      return true;
    } catch (error) {
      log(1, `Error setting focus for user ${userId}:`, error);
      return false;
    }
  }
}
