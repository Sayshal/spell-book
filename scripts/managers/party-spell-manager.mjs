/**
 * Party Spell Coordination and Analysis Management
 *
 * Manages party-wide spell coordination, analysis, and collaboration features for
 * spellcasting groups. This class provides tools for analyzing spell synergies,
 * tracking party spell pools, managing spellcasting focuses,
 * and generating coordination recommendations.
 *
 * Key features:
 * - Party spell pool analysis and comparison matrices
 * - Spell synergy detection and damage type distribution analysis
 * - Spellcasting focus coordination and user selection management
 * - Permission-based spell data access with graceful degradation
 * - Caching system for performance optimization with spell data
 * - Integration with D&D 5e primary party settings and group actors
 * - Recommendation system for spell preparation
 * - Multi-class spellcaster support with enhanced class name display
 * - Dual-flag focus system with group and individual actor synchronization
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
 * Spellcasting focus option configuration.
 *
 * @typedef {Object} FocusOption
 * @property {string} id - Unique identifier for the focus option (e.g., 'focus-damage', 'focus-healer')
 * @property {string} name - Display name of the focus option (e.g., 'Offensive Mage', 'Support')
 * @property {string} icon - File path to the focus option icon image
 * @property {string} description - Descriptive text explaining the focus role and strategy
 */

/**
 * Actor spell data structure for party analysis with focus coordination.
 *
 * @typedef {Object} ActorSpellData
 * @property {string} id - Actor ID
 * @property {string} name - Actor name
 * @property {boolean} hasPermission - Whether current user can view actor details
 * @property {string} token - Actor image/token path
 * @property {string} focus - Legacy focus setting (for backward compatibility)
 * @property {string|null} selectedFocus - Selected focus name from group coordination
 * @property {string|null} selectedFocusId - Selected focus ID from group coordination
 * @property {string|null} selectedFocusIcon - Selected focus icon path from group coordination
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
 * This class provides party spell management capabilities including
 * spell pool analysis, synergy detection, focus coordination, and preparation
 * recommendations. It integrates with Foundry's permission system to provide
 * appropriate data access while maintaining privacy for restricted actors.
 *
 * The manager supports both D&D 5e primary party integration and manual group
 * actor specification, providing flexible party management for different campaign
 * styles. Caching mechanisms ensure optimal performance when analyzing large
 * spell datasets across multiple party members.
 * Party spell manager for coordinating spellcasting across multiple characters.
 */
export class PartySpellManager {
  /**
   * Create a new party spell manager instance.
   *
   * @param {Array<Actor>} [partyActors=[]] - Array of party member actors
   * @param {Actor} [viewingActor=null] - The actor who opened this view
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
   * Analyzes all party members' spells and generates a
   * comparison matrix showing spell overlap, preparation status, and
   * coordination opportunities.
   *
   * @returns {Promise<Object>} Party spell comparison data
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
   * Retrieves spell information for the specified actor including
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
        const sourceUuid = spell.flags?.core?.sourceId || spell.uuid;
        const spellDoc = fromUuidSync(spell.uuid);
        const enrichedIcon = UIHelpers.createSpellIconLink({ ...spell, compendiumUuid: sourceUuid });
        const spellData = { uuid: spell.uuid, sourceUuid: sourceUuid, name: spell.name, level: spell.system.level, enrichedIcon: enrichedIcon, prepared: spell.system.prepared === 1 };
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
   * Get actor's spellcasting focus setting from individual actor flags.
   *
   * Retrieves the actor's configured spellcasting focus for party coordination
   * purposes. This reads from individual actor flags (FLAGS.SPELLCASTING_FOCUS)
   * which are synchronized from group selections for backward compatibility.
   *
   * @param {Actor} actor - The actor to check
   * @returns {string} The actor's spellcasting focus name, or fallback localization key
   */
  getActorSpellcastingFocus(actor) {
    return actor.getFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS) || game.i18n.localize('SPELLBOOK.Party.Focus.None');
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
              uuid: spell.sourceUuid,
              actorUuid: spell.uuid,
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
   */
  async getSpellSynergyAnalysis() {
    const analysis = this._initializeAnalysisStructure();
    const collectors = this._initializeDataCollectors();
    for (const actor of this.partyActors) {
      if (!this.hasViewPermission(actor)) continue;
      await this._analyzeActorSpells(actor, analysis, collectors);
    }
    this._processCollectedData(analysis, collectors);
    this.generateEnhancedRecommendations(analysis);
    return analysis;
  }

  /**
   * Initialize the analysis data structure.
   */
  _initializeAnalysisStructure() {
    return {
      totalSpells: 0,
      totalPreparedSpells: 0,
      damageDistribution: [],
      concentrationSpells: 0,
      concentrationPercentage: 0,
      ritualSpells: 0,
      focusDistribution: [],
      spellSchoolDistribution: [],
      spellLevelDistribution: [],
      componentAnalysis: { verbal: 0, somatic: 0, material: 0, materialCost: 0 },
      savingThrowDistribution: [],
      rangeAnalysis: { self: 0, touch: 0, ranged: 0 },
      durationAnalysis: { instantaneous: 0, concentration: 0, timed: 0 },
      duplicateSpells: [],
      recommendations: [],
      memberContributions: {
        concentration: new Map(),
        ritual: new Map(),
        damageTypes: new Map(),
        schools: new Map(),
        focuses: new Map(),
        components: { verbal: [], somatic: [], material: [], materialCost: [] },
        duplicateSpells: new Map(),
        highConcentration: [],
        lowRitual: [],
        limitedDamageTypes: [],
        unbalancedFocus: []
      },
      concentrationMembers: [],
      ritualMembers: []
    };
  }

  /**
   * Initialize data collection objects.
   */
  _initializeDataCollectors() {
    return {
      allSpells: new Set(),
      allPreparedSpells: new Set(),
      damageTypes: {},
      focusTypes: {},
      spellSchools: {},
      spellLevels: Array(10).fill(0),
      savingThrows: {},
      ranges: { self: 0, touch: 0, ranged: 0 },
      durations: { instantaneous: 0, concentration: 0, timed: 0 },
      components: { verbal: 0, somatic: 0, material: 0, materialCost: 0 },
      concentrationCount: 0,
      ritualCount: 0,
      preparedSpellsByName: new Map()
    };
  }

  /**
   * Analyze spells for a single actor.
   */
  async _analyzeActorSpells(actor, analysis, collectors) {
    const focus = this.getActorSpellcastingFocus(actor);
    this._trackFocus(focus, actor.name, analysis, collectors);
    const actorStats = { concentrationCount: 0, ritualCount: 0, damageTypes: new Set() };
    for (const [classId] of Object.entries(actor.spellcastingClasses || {})) {
      const classSpells = await this.getClassSpells(actor, classId);
      if (!classSpells) continue;
      for (const spell of classSpells.known) {
        collectors.allSpells.add(spell.uuid);
        if (spell.prepared) await this._analyzeSpell(spell, actor, analysis, collectors, actorStats);
      }
    }
    this._analyzeActorStats(actor, actorStats, analysis);
  }

  /**
   * Analyze a single prepared spell.
   */
  async _analyzeSpell(spell, actor, analysis, collectors, actorStats) {
    collectors.allPreparedSpells.add(spell.uuid);
    const spellDoc = fromUuidSync(spell.uuid);
    if (!spellDoc) return;
    this._trackDuplicateSpell(spellDoc, actor.name, collectors);
    const spellData = this._extractSpellData(spellDoc);
    this._updateConcentrationData(spellData, spellDoc, actor.name, analysis, collectors, actorStats);
    this._updateRitualData(spellData, spellDoc, actor.name, analysis, collectors, actorStats);
    this._updateDamageTypeData(spellData, spellDoc, actor.name, analysis, collectors, actorStats);
    this._updateSchoolData(spellDoc, actor.name, analysis, collectors);
    this._updateComponentData(spellData, spellDoc, actor.name, analysis, collectors);
    this._updateMiscData(spellData, spellDoc, collectors);
  }

  /**
   * Extract spell data
   */
  _extractSpellData(spellDoc) {
    return {
      isConcentration: UIHelpers.checkIsConcentration(spellDoc),
      isRitual: UIHelpers.checkIsRitual(spellDoc),
      damageTypes: UIHelpers.extractDamageTypes(spellDoc),
      materialComponents: UIHelpers.extractMaterialComponents(spellDoc),
      rangeData: UIHelpers.extractRange(spellDoc),
      castingTime: UIHelpers.extractCastingTime(spellDoc)
    };
  }

  /**
   * Track focus distribution.
   */
  _trackFocus(focus, actorName, analysis, collectors) {
    collectors.focusTypes[focus] = (collectors.focusTypes[focus] || 0) + 1;
    if (!analysis.memberContributions.focuses.has(focus)) analysis.memberContributions.focuses.set(focus, []);
    analysis.memberContributions.focuses.get(focus).push(actorName);
  }

  /**
   * Track duplicate spells.
   */
  _trackDuplicateSpell(spellDoc, actorName, collectors) {
    const spellName = spellDoc.name;
    if (!collectors.preparedSpellsByName.has(spellName)) collectors.preparedSpellsByName.set(spellName, []);
    collectors.preparedSpellsByName.get(spellName).push(actorName);
  }

  /**
   * Update concentration analysis data.
   */
  _updateConcentrationData(spellData, spellDoc, actorName, analysis, collectors, actorStats) {
    if (spellData.isConcentration) {
      collectors.concentrationCount++;
      actorStats.concentrationCount++;
      if (!analysis.memberContributions.concentration.has(actorName)) analysis.memberContributions.concentration.set(actorName, []);
      analysis.memberContributions.concentration.get(actorName).push(spellDoc.name);
    }
  }

  /**
   * Update ritual analysis data.
   */
  _updateRitualData(spellData, spellDoc, actorName, analysis, collectors, actorStats) {
    if (spellData.isRitual) {
      collectors.ritualCount++;
      actorStats.ritualCount++;
      if (!analysis.memberContributions.ritual.has(actorName)) analysis.memberContributions.ritual.set(actorName, []);
      analysis.memberContributions.ritual.get(actorName).push(spellDoc.name);
    }
  }

  /**
   * Update damage type analysis data.
   */
  _updateDamageTypeData(spellData, spellDoc, actorName, analysis, collectors, actorStats) {
    for (const damageType of spellData.damageTypes) {
      collectors.damageTypes[damageType] = (collectors.damageTypes[damageType] || 0) + 1;
      actorStats.damageTypes.add(damageType);
      if (!analysis.memberContributions.damageTypes.has(damageType)) analysis.memberContributions.damageTypes.set(damageType, []);
      analysis.memberContributions.damageTypes.get(damageType).push(`${actorName}: ${spellDoc.name}`);
    }
  }

  /**
   * Update school analysis data.
   */
  _updateSchoolData(spellDoc, actorName, analysis, collectors) {
    const school = spellDoc.system.school;
    if (school) {
      collectors.spellSchools[school] = (collectors.spellSchools[school] || 0) + 1;
      if (!analysis.memberContributions.schools.has(school)) analysis.memberContributions.schools.set(school, []);
      analysis.memberContributions.schools.get(school).push(`${actorName}: ${spellDoc.name}`);
    }
  }

  /**
   * Update component analysis data.
   */
  _updateComponentData(spellData, spellDoc, actorName, analysis, collectors) {
    const comp = spellDoc.system.properties;
    const spellRef = `${actorName}: ${spellDoc.name}`;
    if (comp?.has?.('vocal')) {
      collectors.components.verbal++;
      analysis.memberContributions.components.verbal.push(spellRef);
    }
    if (comp?.has?.('somatic')) {
      collectors.components.somatic++;
      analysis.memberContributions.components.somatic.push(spellRef);
    }
    if (comp?.has?.('material')) {
      collectors.components.material++;
      analysis.memberContributions.components.material.push(spellRef);
      if (spellData.materialComponents.hasConsumedMaterials) {
        collectors.components.materialCost++;
        analysis.memberContributions.components.materialCost.push(spellRef);
      }
    }
  }

  /**
   * Update miscellaneous analysis data.
   */
  _updateMiscData(spellData, spellDoc, collectors) {
    const level = spellDoc.system.level || 0;
    collectors.spellLevels[level]++;
    const save = spellDoc.system.save?.ability;
    if (save) collectors.savingThrows[save] = (collectors.savingThrows[save] || 0) + 1;
    if (spellData.rangeData.units === 'self') collectors.ranges.self++;
    else if (spellData.rangeData.units === 'touch') collectors.ranges.touch++;
    else collectors.ranges.ranged++;
    const duration = spellDoc.system.duration;
    if (spellData.isConcentration) collectors.durations.concentration++;
    else if (duration?.units === 'inst') collectors.durations.instantaneous++;
    else collectors.durations.timed++;
  }

  /**
   * Analyze actor-specific statistics.
   */
  _analyzeActorStats(actor, actorStats, analysis) {
    const actorPreparedCount = actor.totalSpellsPrepared || 0;
    if (actorPreparedCount > 0 && actorStats.concentrationCount / actorPreparedCount > 0.6) {
      analysis.memberContributions.highConcentration.push({
        name: actor.name,
        percentage: Math.round((actorStats.concentrationCount / actorPreparedCount) * 100),
        count: actorStats.concentrationCount
      });
    }
    if (actorPreparedCount > 5 && actorStats.ritualCount < 2) {
      analysis.memberContributions.lowRitual.push({
        name: actor.name,
        ritualCount: actorStats.ritualCount,
        totalPrepared: actorPreparedCount
      });
    }
    if (actorStats.damageTypes.size < 3 && actorPreparedCount > 8) {
      analysis.memberContributions.limitedDamageTypes.push({
        name: actor.name,
        damageTypes: Array.from(actorStats.damageTypes),
        typeCount: actorStats.damageTypes.size
      });
    }
  }

  /**
   * Process all collected data into final analysis format.
   */
  _processCollectedData(analysis, collectors) {
    analysis.totalSpells = collectors.allSpells.size;
    analysis.totalPreparedSpells = collectors.allPreparedSpells.size;
    analysis.concentrationSpells = collectors.concentrationCount;
    analysis.concentrationPercentage = analysis.totalPreparedSpells > 0 ? Math.round((collectors.concentrationCount / analysis.totalPreparedSpells) * 100) : 0;
    analysis.ritualSpells = collectors.ritualCount;
    this._processDamageDistribution(analysis, collectors);
    this._processFocusDistribution(analysis, collectors);
    this._processSchoolDistribution(analysis, collectors);
    this._processLevelDistribution(analysis, collectors);
    this._processSavingThrowDistribution(analysis, collectors);
    this._processDuplicateSpells(analysis, collectors);
    this._processUnbalancedFocus(analysis, collectors);
    analysis.componentAnalysis = collectors.components;
    analysis.rangeAnalysis = collectors.ranges;
    analysis.durationAnalysis = collectors.durations;
    this._createMemberLists(analysis);
  }

  /**
   * Process damage type distribution.
   */
  _processDamageDistribution(analysis, collectors) {
    analysis.damageDistribution = Object.entries(collectors.damageTypes).map(([type, count]) => ({
      type: type,
      localizedType: this._localizeDamageType(type),
      count: count,
      members: analysis.memberContributions.damageTypes.get(type) || []
    }));
    game.i18n.sortObjects(analysis.damageDistribution, 'localizedType');
  }

  /**
   * Process focus distribution.
   */
  _processFocusDistribution(analysis, collectors) {
    analysis.focusDistribution = Object.entries(collectors.focusTypes).map(([focus, count]) => ({
      focus: focus,
      count: count,
      members: analysis.memberContributions.focuses.get(focus) || []
    }));
  }

  /**
   * Process school distribution with pie chart data.
   */
  _processSchoolDistribution(analysis, collectors) {
    analysis.spellSchoolDistribution = Object.entries(collectors.spellSchools).map(([school, count]) => ({
      school: school,
      localizedSchool: game.i18n.localize(`DND5E.School${school.charAt(0).toUpperCase()}${school.slice(1).toLowerCase()}`) || school,
      count: count,
      percentage: Math.round((count / analysis.totalPreparedSpells) * 100),
      members: analysis.memberContributions.schools.get(school) || []
    }));
  }

  /**
   * Process level distribution.
   */
  _processLevelDistribution(analysis, collectors) {
    analysis.spellLevelDistribution = collectors.spellLevels
      .map((count, level) => ({
        level: level,
        count: count,
        percentage: analysis.totalPreparedSpells > 0 ? Math.round((count / analysis.totalPreparedSpells) * 100) : 0,
        localizedLevel: level === 0 ? game.i18n.localize('DND5E.SpellLevel0') : game.i18n.localize(`DND5E.SpellLevel${level}`)
      }))
      .filter((item) => item.count > 0);
  }

  /**
   * Process saving throw distribution.
   */
  _processSavingThrowDistribution(analysis, collectors) {
    analysis.savingThrowDistribution = Object.entries(collectors.savingThrows).map(([save, count]) => ({
      save: save,
      localizedSave: game.i18n.localize(`DND5E.Ability${save.charAt(0).toUpperCase()}${save.slice(1).toLowerCase()}`) || save,
      count: count
    }));
  }

  /**
   * Process duplicate spells.
   */
  _processDuplicateSpells(analysis, collectors) {
    const duplicateSpells = [];
    for (const [spellName, actors] of collectors.preparedSpellsByName) {
      if (actors.length > 1) {
        let spellUuid = null;
        let spellDoc = null;
        for (const uuid of collectors.allSpells) {
          const testDoc = fromUuidSync(uuid);
          if (testDoc && testDoc.name === spellName) {
            spellUuid = uuid;
            spellDoc = testDoc;
            break;
          }
        }
        const enrichedIcon = spellDoc ? UIHelpers.createSpellIconLink(spellDoc) : '';
        duplicateSpells.push({
          name: spellName,
          actors: [...actors],
          enrichedIcon: enrichedIcon,
          spell: spellDoc
        });
        analysis.memberContributions.duplicateSpells.set(spellName, [...actors]);
      }
    }
    analysis.duplicateSpells = duplicateSpells;
  }

  /**
   * Process unbalanced focus analysis.
   */
  _processUnbalancedFocus(analysis, collectors) {
    const focusEntries = Object.entries(collectors.focusTypes);
    if (focusEntries.length < 3 && this.partyActors.length >= 3) {
      analysis.memberContributions.unbalancedFocus = focusEntries.map(([focus, count]) => ({
        focus: focus,
        count: count,
        members: analysis.memberContributions.focuses.get(focus) || []
      }));
    }
  }

  /**
   * Localize damage type with fallbacks for healing/temphp.
   */
  _localizeDamageType(damageType) {
    if (damageType === 'healing') return game.i18n.localize('DND5E.Healing');
    if (damageType === 'temphp') return game.i18n.localize('SPELLBOOK.Party.Analysis.HealingTemp');
    const standardKey = `DND5E.Damage${damageType.charAt(0).toUpperCase()}${damageType.slice(1).toLowerCase()}`;
    return game.i18n.localize(standardKey) || damageType;
  }

  /**
   * Create member lists for tooltip display.
   */
  _createMemberLists(analysis) {
    analysis.concentrationMembers = Array.from(analysis.memberContributions.concentration.entries()).map(([name, spells]) => ({
      name: name,
      spells: spells,
      count: spells.length
    }));

    analysis.ritualMembers = Array.from(analysis.memberContributions.ritual.entries()).map(([name, spells]) => ({
      name: name,
      spells: spells,
      count: spells.length
    }));
  }

  /**
   * Generate enhanced spell preparation recommendations with member tracking.
   *
   * @param {Object} analysis - The synergy analysis data
   * @returns {string[]} Array of recommendation localization keys
   */
  generateEnhancedRecommendations(analysis) {
    const recommendations = [];
    if (analysis.concentrationPercentage > 70) recommendations.push('SPELLBOOK.Party.Recommendations.HighConcentration');
    if (analysis.ritualSpells < 3 && analysis.totalSpells > 20) recommendations.push('SPELLBOOK.Party.Recommendations.LowRituals');
    if (analysis.damageDistribution.length < 4 && analysis.totalSpells > 15) recommendations.push('SPELLBOOK.Party.Recommendations.LimitedDamageTypes');
    if (analysis.memberContributions.unbalancedFocus.length > 0) recommendations.push('SPELLBOOK.Party.Recommendations.UnbalancedFocus');
    if (analysis.duplicateSpells.length > 0) recommendations.push('SPELLBOOK.Party.Recommendations.DuplicateSpells');
    if (analysis.spellLevelDistribution.filter((l) => l.level <= 2).reduce((sum, l) => sum + l.count, 0) / analysis.totalPreparedSpells > 0.7) {
      recommendations.push('SPELLBOOK.Party.Recommendations.LowLevelHeavy');
    }
    if (analysis.savingThrowDistribution.length < 3) recommendations.push('SPELLBOOK.Party.Recommendations.LimitedSavingThrows');
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
   * Get party users associated with a group actor.
   *
   * Retrieves the list of users associated with party members in the
   * specified group actor, enabling user-to-actor mapping for focus
   * assignment and coordination features.
   *
   * @param {Actor} groupActor - The group actor to analyze
   * @returns {Array<Object>} Array of user objects with ID, name, and actor information
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
   * Get available spellcasting focus names from world settings.
   *
   * Retrieves the list of available spellcasting focus names from the
   * world settings configuration. This provides the options available
   * for party coordination and role assignment.
   *
   * @returns {string[]} Array of focus names (display names, not IDs)
   * @static
   */
  static getAvailableFocuses() {
    const focusData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    const focuses = focusData?.focuses || [];
    return focuses.map((focus) => focus.name);
  }

  /**
   * Get available focus options with full data from world settings.
   *
   * Retrieves the complete focus option configurations from world settings,
   * including all metadata (id, name, icon, description) for each available
   * spellcasting focus option. Handles both array and object storage formats.
   *
   * @returns {FocusOption[]} Array of focus option objects with complete data
   * @static
   */
  static getAvailableFocusOptions() {
    const settingData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    const focusData = Array.isArray(settingData) ? settingData[0] : settingData;
    return focusData?.focuses || [];
  }

  /**
   * Get user's selected focus for the specified group.
   *
   * Retrieves the spellcasting focus selection for a specific user within
   * the context of a group actor. This enables user-specific coordination
   * settings within party management through the dual-flag system.
   *
   * @param {Actor} groupActor - The group actor storing focus selections
   * @param {string} userId - The user ID to look up
   * @returns {FocusOption|null} The selected focus object with id, name, icon, and description, or null if no focus selected
   */
  getUserSelectedFocus(groupActor, userId) {
    const userSelections = groupActor?.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
    const selectedFocusId = userSelections[userId];
    if (!selectedFocusId) return null;
    const settingData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    const focusData = Array.isArray(settingData) ? settingData[0] : settingData;
    const availableFocuses = focusData?.focuses || [];
    return availableFocuses.find((f) => f.id === selectedFocusId) || null;
  }

  /**
   * Set user's selected focus for the specified group.
   * Now delegates to socket handler for permission management.
   *
   * @param {Actor} groupActor - The group actor to update
   * @param {string} userId - The user ID to set focus for
   * @param {string|null} focusId - The focus ID to set, or null to clear
   * @returns {Promise<boolean>} Success status of the operation
   */
  async setUserSelectedFocus(groupActor, userId, focusId) {
    const socketHandler = game.modules.get(MODULE.ID)?.socketHandler;

    if (!socketHandler) {
      log(1, 'Socket handler not initialized');
      return false;
    }

    const result = await socketHandler.setUserSelectedFocus(groupActor, userId, focusId);

    if (!result.success) {
      log(1, `Error setting focus for user ${userId}:`, result.error);
    }

    return result.success;
  }
}
