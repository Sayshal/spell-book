/**
 * Party Spell Coordination and Analysis Management
 *
 * Manages party-wide spell coordination, analysis, and collaboration features for
 * spellcasting groups. This class provides tools for analyzing spell synergies,
 * tracking party spell pools, managing spellcasting focuses,
 * and generating coordination recommendations.
 *
 * The manager supports both primary party integration through D&D 5e settings
 * and manual group actor specification, providing flexible party management
 * options for different campaign styles and group compositions.
 *
 * @module Managers/PartyMode
 * @author Tyler
 */

import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from '../ui/_module.mjs';

/**
 * Party Spell Manager - Coordination and analysis for multi-character spellcasting.
 */
export class PartyMode {
  /**
   * Create a new party spell manager instance.
   * @param {Array<Object>} [partyActors=[]] - Array of party member actors
   * @param {Object} [viewingActor=null] - The actor who opened this view
   */
  constructor(partyActors = [], viewingActor = null) {
    log(3, 'Creating PartyMode instance.', { actorCount: partyActors.length, viewingActor: viewingActor?.name });
    this.partyActors = partyActors.filter((actor) => this.isSpellcaster(actor));
    this.viewingActor = viewingActor;
    this._spellDataCache = new foundry.utils.IterableWeakMap();
  }

  /**
   * Check if an actor is a spellcaster.
   * @param {Object} actor - The actor to check
   * @returns {boolean} True if actor can cast spells
   */
  isSpellcaster(actor) {
    return Object.keys(foundry.utils.getProperty(actor, 'spellcastingClasses') || {}).length > 0;
  }

  /**
   * Get party spell comparison data.
   * @returns {Object} Party spell comparison data
   */
  getPartySpellComparison() {
    log(3, 'Getting party spell comparison.');
    const comparisonData = { actors: [], spellsByLevel: {}, synergy: this.getSpellSynergyAnalysis() };
    for (const actor of this.partyActors) {
      const actorData = this.getActorSpellData(actor);
      if (actorData) comparisonData.actors.push(actorData);
    }
    this.organizeSpellsByLevel(comparisonData);
    return comparisonData;
  }

  /**
   * Get spell data for a specific actor.
   * @param {Object} actor - The actor to analyze
   * @returns {{
   *   id: string,
   *   name: string,
   *   hasPermission: boolean,
   *   token: string,
   *   spellcasters: Array<{
   *     classId: string,
   *     className: string,
   *     enhancedClassName: string,
   *     icon: string,
   *     knownSpells: Object[],
   *     preparedSpells: Object[],
   *     totalKnown: number,
   *     totalPrepared: number
   *   }>,
   *   totalSpellsKnown: number,
   *   totalSpellsPrepared: number
   * } | null} Actor spell data or null if no permission
   */
  getActorSpellData(actor) {
    log(3, 'Getting actor spell data.', { actorName: actor.name });
    if (!this.hasViewPermission(actor)) return { id: actor.id, name: actor.name, hasPermission: false, token: actor.img, spellcasters: [], totalSpellsKnown: 0, totalSpellsPrepared: 0 };
    const actorData = { id: actor.id, name: actor.name, hasPermission: true, token: actor.img, spellcasters: [], totalSpellsKnown: 0, totalSpellsPrepared: 0 };
    for (const [classId, classData] of Object.entries(actor.spellcastingClasses || {})) {
      const classSpells = this.getClassSpells(actor, classId);
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
   * @param {Object} actor - The actor
   * @param {string} classId - The class identifier
   * @returns {{
   *   known: Array<{ uuid: string, sourceUuid: string, name: string, level: number, enrichedIcon: HTMLElement, prepared: boolean }>,
   *   prepared: Array<{ uuid: string, sourceUuid: string, name: string, level: number, enrichedIcon: HTMLElement, prepared: boolean }>
   * } | null} Class spell data or null on error
   */
  getClassSpells(actor, classId) {
    log(3, 'Getting class spells.', { actorName: actor.name, classId });
    let actorCache = this._spellDataCache.get(actor);
    if (actorCache?.has(classId)) return actorCache.get(classId);
    try {
      const knownSpells = [];
      const preparedSpells = [];
      const classSpells = actor.items.filter(
        (item) => item.type === 'spell' && (foundry.utils.getProperty(item, 'system.sourceClass') === classId || foundry.utils.getProperty(item, 'sourceClass') === classId)
      );
      for (const spell of classSpells) {
        const sourceUuid = foundry.utils.getProperty(spell, '_stats.compendiumSource') || foundry.utils.getProperty(spell, 'flags.core.sourceId') || spell.uuid;
        const enrichedIcon = UIUtils.createSpellIconLink({ ...spell, compendiumUuid: sourceUuid });
        const spellData = {
          uuid: spell.uuid,
          sourceUuid: sourceUuid,
          name: spell.name,
          level: foundry.utils.getProperty(spell, 'system.level'),
          enrichedIcon: enrichedIcon,
          prepared: foundry.utils.getProperty(spell, 'system.prepared') === 1
        };
        knownSpells.push(spellData);
        if (spellData.prepared) preparedSpells.push(spellData);
      }
      const result = { known: knownSpells, prepared: preparedSpells };
      if (!actorCache) {
        actorCache = new Map();
        this._spellDataCache.set(actor, actorCache);
      }
      actorCache.set(classId, result);
      return result;
    } catch (error) {
      log(1, 'Error getting class spells.', { actorName: actor.name, classId, error });
      return null;
    }
  }

  /**
   * Get enhanced class name including subclass information.
   * @param {Object} actor - The actor
   * @param {string} classId - The class identifier
   * @param {Object} classData - The class data from spellcastingClasses
   * @returns {string} Enhanced class name with subclass
   */
  getEnhancedClassName(actor, classId, classData) {
    const className = foundry.utils.getProperty(classData, 'name') || classId;
    const subClassName = foundry.utils.getProperty(classData, '_classLink.name');
    if (subClassName) return `${subClassName} ${className}`;
    const subclassItem = actor.items.find((item) => item.type === 'subclass' && foundry.utils.getProperty(item, 'system.classIdentifier') === classId);
    if (subclassItem) return `${subclassItem.name} ${className}`;
    return className;
  }

  /**
   * Check if current user has view permission for actor.
   * @param {Object} actor - The actor to check
   * @returns {boolean} True if user can view actor details
   */
  hasViewPermission(actor) {
    return actor.testUserPermission(game.user, 'OBSERVER');
  }

  /**
   * Get actor's spellcasting focus setting from individual actor flags.
   * @param {Object} actor - The actor to check
   * @returns {string} The actor's spellcasting focus name, or fallback localization key
   */
  getActorSpellcastingFocus(actor) {
    return actor.getFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS) || game.i18n.localize('SPELLBOOK.Party.Focus.None');
  }

  /**
   * Organize spells by level for comparison matrix display.
   * @param {Object} comparisonData - The comparison data to organize
   * @returns {void}
   */
  organizeSpellsByLevel(comparisonData) {
    log(3, 'Organizing spells by level.');
    const spellsByLevel = {};
    for (const actorData of comparisonData.actors) {
      if (!actorData.hasPermission) continue;
      for (const classData of actorData.spellcasters) {
        for (const spell of classData.knownSpells) {
          const level = spell.level;
          const spellKey = spell.name;
          if (!spellsByLevel[level]) spellsByLevel[level] = {};
          if (!spellsByLevel[level][spellKey]) {
            spellsByLevel[level][spellKey] = { uuid: spell.sourceUuid, actorUuid: spell.uuid, name: spell.name, enrichedIcon: spell.enrichedIcon, level: spell.level, actorStatuses: [] };
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
   * @returns {Object} Complete synergy analysis data including damage distribution, concentration metrics, and recommendations
   */
  getSpellSynergyAnalysis() {
    log(3, 'Getting spell synergy analysis.');
    const analysis = this._initializeAnalysisStructure();
    const collectors = this._initializeDataCollectors();
    for (const actor of this.partyActors) {
      if (!this.hasViewPermission(actor)) continue;
      this._analyzeActorSpells(actor, analysis, collectors);
    }
    this._processCollectedData(analysis, collectors);
    this.generateEnhancedRecommendations(analysis);
    return analysis;
  }

  /**
   * Initialize the analysis data structure.
   * @returns {Object} Empty analysis structure with all metrics initialized to zero/empty arrays
   * @private
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
   * @returns {Object} Empty data collector structure with Sets, Maps, and counters for tracking spell data during analysis
   * @private
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
   * @param {Object} actor - The actor whose spells are being analyzed
   * @param {Object} analysis - The analysis data structure being populated
   * @param {Object} collectors - The data collection objects tracking counts and sets
   * @returns {void}
   * @private
   */
  _analyzeActorSpells(actor, analysis, collectors) {
    const focus = this.getActorSpellcastingFocus(actor);
    this._trackFocus(focus, actor.name, analysis, collectors);
    const actorStats = { concentrationCount: 0, ritualCount: 0, damageTypes: new Set() };
    for (const [classId] of Object.entries(actor.spellcastingClasses || {})) {
      const classSpells = this.getClassSpells(actor, classId);
      if (!classSpells) continue;
      for (const spell of classSpells.known) {
        collectors.allSpells.add(spell.uuid);
        if (spell.prepared) this._analyzeSpell(spell, actor, analysis, collectors, actorStats);
      }
    }
    this._analyzeActorStats(actor, actorStats, analysis);
  }

  /**
   * Analyze a single prepared spell.
   * @param {Object} spell - The spell data object being analyzed
   * @param {Object} actor - The actor who has this spell prepared
   * @param {Object} analysis - The analysis data structure being populated
   * @param {Object} collectors - The data collection objects tracking counts and sets
   * @param {Object} actorStats - Actor-specific statistics being accumulated
   * @returns {void}
   * @private
   */
  _analyzeSpell(spell, actor, analysis, collectors, actorStats) {
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
    log(3, 'Analyzing spell.', { spell, actor, analysis, collectors, actorStats });
  }

  /**
   * Extract spell data from a spell document.
   * @param {Object} spellDoc - The spell document to extract data from
   * @returns {Object} Extracted spell properties including concentration, ritual, damage types, components, range, and casting time
   * @private
   */
  _extractSpellData(spellDoc) {
    return {
      isConcentration: UIUtils.checkIsConcentration(spellDoc),
      isRitual: UIUtils.checkIsRitual(spellDoc),
      damageTypes: UIUtils.extractDamageTypes(spellDoc),
      materialComponents: UIUtils.extractMaterialComponents(spellDoc),
      rangeData: UIUtils.extractRange(spellDoc),
      castingTime: UIUtils.extractCastingTime(spellDoc)
    };
  }

  /**
   * Track focus distribution.
   * @param {string} focus - The focus identifier or name
   * @param {string} actorName - The name of the actor
   * @param {Object} analysis - The analysis data structure being populated
   * @param {Object} collectors - The data collection objects tracking focus counts
   * @returns {void}
   * @private
   */
  _trackFocus(focus, actorName, analysis, collectors) {
    collectors.focusTypes[focus] = (collectors.focusTypes[focus] || 0) + 1;
    if (!analysis.memberContributions.focuses.has(focus)) analysis.memberContributions.focuses.set(focus, []);
    analysis.memberContributions.focuses.get(focus).push(actorName);
  }

  /**
   * Track duplicate spells across party members.
   * @param {Object} spellDoc - The spell document being tracked
   * @param {string} actorName - The name of the actor who has this spell
   * @param {Object} collectors - The data collection objects tracking spell occurrences
   * @returns {void}
   * @private
   */
  _trackDuplicateSpell(spellDoc, actorName, collectors) {
    const spellName = spellDoc.name;
    if (!collectors.preparedSpellsByName.has(spellName)) collectors.preparedSpellsByName.set(spellName, []);
    collectors.preparedSpellsByName.get(spellName).push(actorName);
  }

  /**
   * Update concentration analysis data.
   * @param {Object} spellData - The extracted spell data from _extractSpellData
   * @param {Object} spellDoc - The spell document
   * @param {string} actorName - The name of the actor
   * @param {Object} analysis - The analysis data structure being populated
   * @param {Object} collectors - The data collection objects tracking concentration counts
   * @param {Object} actorStats - Actor-specific statistics being accumulated
   * @returns {void}
   * @private
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
   * @param {Object} spellData - The extracted spell data from _extractSpellData
   * @param {Object} spellDoc - The spell document
   * @param {string} actorName - The name of the actor
   * @param {Object} analysis - The analysis data structure being populated
   * @param {Object} collectors - The data collection objects tracking ritual counts
   * @param {Object} actorStats - Actor-specific statistics being accumulated
   * @returns {void}
   * @private
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
   * @param {Object} spellData - The extracted spell data from _extractSpellData
   * @param {Object} spellDoc - The spell document
   * @param {string} actorName - The name of the actor
   * @param {Object} analysis - The analysis data structure being populated
   * @param {Object} collectors - The data collection objects tracking damage type counts
   * @param {Object} actorStats - Actor-specific statistics being accumulated
   * @returns {void}
   * @private
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
   * @param {Object} spellDoc - The spell document
   * @param {string} actorName - The name of the actor
   * @param {Object} analysis - The analysis data structure being populated
   * @param {Object} collectors - The data collection objects tracking school counts
   * @returns {void}
   * @private
   */
  _updateSchoolData(spellDoc, actorName, analysis, collectors) {
    const school = foundry.utils.getProperty(spellDoc, 'system.school');
    if (school) {
      collectors.spellSchools[school] = (collectors.spellSchools[school] || 0) + 1;
      if (!analysis.memberContributions.schools.has(school)) analysis.memberContributions.schools.set(school, []);
      analysis.memberContributions.schools.get(school).push(`${actorName}: ${spellDoc.name}`);
    }
  }

  /**
   * Update component analysis data.
   * @param {Object} spellData - The extracted spell data from _extractSpellData
   * @param {Object} spellDoc - The spell document
   * @param {string} actorName - The name of the actor
   * @param {Object} analysis - The analysis data structure being populated
   * @param {Object} collectors - The data collection objects tracking component counts
   * @returns {void}
   * @private
   */
  _updateComponentData(spellData, spellDoc, actorName, analysis, collectors) {
    const comp = foundry.utils.getProperty(spellDoc, 'system.properties');
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
      if (foundry.utils.getProperty(spellData, 'materialComponents.hasConsumedMaterials')) {
        collectors.components.materialCost++;
        analysis.memberContributions.components.materialCost.push(spellRef);
      }
    }
  }

  /**
   * Update miscellaneous analysis data.
   * @param {Object} spellData - The extracted spell data from _extractSpellData
   * @param {Object} spellDoc - The spell document
   * @param {Object} collectors - The data collection objects tracking levels, saves, ranges, and durations
   * @returns {void}
   * @private
   */
  _updateMiscData(spellData, spellDoc, collectors) {
    const level = foundry.utils.getProperty(spellDoc, 'system.level') || 0;
    collectors.spellLevels[level]++;
    const save = foundry.utils.getProperty(spellDoc, 'system.save.ability');
    if (save) collectors.savingThrows[save] = (collectors.savingThrows[save] || 0) + 1;
    if (foundry.utils.getProperty(spellData, 'rangeData.units') === 'self') collectors.ranges.self++;
    else if (foundry.utils.getProperty(spellData, 'rangeData.units') === 'touch') collectors.ranges.touch++;
    else collectors.ranges.ranged++;
    const duration = foundry.utils.getProperty(spellDoc, 'system.duration');
    if (spellData.isConcentration) collectors.durations.concentration++;
    else if (duration?.units === 'inst') collectors.durations.instantaneous++;
    else collectors.durations.timed++;
  }

  /**
   * Analyze actor-specific statistics.
   * @param {Object} actor - The actor being analyzed
   * @param {Object} actorStats - Actor-specific statistics collected during spell analysis
   * @param {Object} analysis - The analysis data structure being populated with actor-specific warnings
   * @returns {void}
   * @private
   */
  _analyzeActorStats(actor, actorStats, analysis) {
    const actorPreparedCount = foundry.utils.getProperty(actor, 'totalSpellsPrepared') || 0;
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
    log(3, 'Analyzed actor stats:', { actor, actorStats, analysis });
  }

  /**
   * Process all collected data into final analysis format.
   * @param {Object} analysis - The analysis data structure to populate with final results
   * @param {Object} collectors - The data collection objects containing raw counts and sets
   * @returns {void}
   * @private
   */
  _processCollectedData(analysis, collectors) {
    log(3, 'Processing data from:', { analysis, collectors });
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
    log(3, 'Processed data:', { analysis, collectors });
  }

  /**
   * Process damage type distribution.
   * @param {Object} analysis - The analysis data structure to populate with damage distribution
   * @param {Object} collectors - The data collection objects containing damage type counts
   * @returns {void}
   * @private
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
   * @param {Object} analysis - The analysis data structure to populate with focus distribution
   * @param {Object} collectors - The data collection objects containing focus type counts
   * @returns {void}
   * @private
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
   * @param {Object} analysis - The analysis data structure to populate with school distribution
   * @param {Object} collectors - The data collection objects containing school counts
   * @returns {void}
   * @private
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
   * @param {Object} analysis - The analysis data structure to populate with level distribution
   * @param {Object} collectors - The data collection objects containing spell level counts
   * @returns {void}
   * @private
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
   * @param {Object} analysis - The analysis data structure to populate with saving throw distribution
   * @param {Object} collectors - The data collection objects containing saving throw counts
   * @returns {void}
   * @private
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
   * @param {Object} analysis - The analysis data structure to populate with duplicate spell information
   * @param {Object} collectors - The data collection objects containing spell occurrence data
   * @returns {void}
   * @private
   */
  _processDuplicateSpells(analysis, collectors) {
    const duplicateSpells = [];
    for (const [spellName, actors] of collectors.preparedSpellsByName) {
      if (actors.length > 1) {
        let spellDoc = null;
        for (const uuid of collectors.allSpells) {
          const testDoc = fromUuidSync(uuid);
          if (testDoc && testDoc.name === spellName) {
            spellDoc = testDoc;
            break;
          }
        }
        const enrichedIcon = spellDoc ? UIUtils.createSpellIconLink(spellDoc) : '';
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
   * @param {Object} analysis - The analysis data structure to populate with unbalanced focus warnings
   * @param {Object} collectors - The data collection objects containing focus distribution data
   * @returns {void}
   * @private
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
   * @param {string} damageType - The damage type identifier to localize
   * @returns {string} Localized damage type name
   * @private
   */
  _localizeDamageType(damageType) {
    if (damageType === 'healing') return game.i18n.localize('DND5E.Healing');
    if (damageType === 'temphp') return game.i18n.localize('SPELLBOOK.Party.Analysis.HealingTemp');
    const standardKey = `DND5E.Damage${damageType.charAt(0).toUpperCase()}${damageType.slice(1).toLowerCase()}`;
    return game.i18n.localize(standardKey) || damageType;
  }

  /**
   * Create member lists for tooltip display.
   * @param {Object} analysis - The analysis data structure to populate with member lists for tooltips
   * @returns {void}
   * @private
   */
  _createMemberLists(analysis) {
    analysis.concentrationMembers = Array.from(analysis.memberContributions.concentration.entries()).map(([name, spells]) => ({ name: name, spells: spells, count: spells.length }));
    analysis.ritualMembers = Array.from(analysis.memberContributions.ritual.entries()).map(([name, spells]) => ({ name: name, spells: spells, count: spells.length }));
  }

  /**
   * Generate enhanced spell preparation recommendations with member tracking.
   * @param {Object} analysis - The synergy analysis data
   * @returns {string[]} Array of recommendation localization keys
   */
  generateEnhancedRecommendations(analysis) {
    log(3, 'Generating enhanced recommendations.');
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
    log(3, 'Recommendations generated:', { recommendations });
    return recommendations;
  }

  /**
   * Get party actors from the primary party setting or fallback.
   * @param {Object} [groupActor=null] - Optional specific group actor to use instead of primary party
   * @returns {Object[]} Array of party member actors
   * @static
   */
  static getPartyActors(groupActor = null) {
    log(3, 'Getting party actors.', { groupActorName: groupActor?.name });
    if (groupActor && groupActor.type === 'group') {
      const creatures = foundry.utils.getProperty(groupActor, 'system.creatures') || [];
      return creatures.filter((actor) => actor && Object.keys(foundry.utils.getProperty(actor, 'spellcastingClasses') || {}).length > 0);
    }
    try {
      const primaryPartyData = game.settings.get('dnd5e', 'primaryParty');
      const primaryPartyActor = foundry.utils.getProperty(primaryPartyData, 'actor');
      if (primaryPartyActor && primaryPartyActor.type === 'group') {
        const creatures = foundry.utils.getProperty(primaryPartyActor, 'system.creatures') || [];
        const spellcasters = creatures.filter((actor) => actor && Object.keys(foundry.utils.getProperty(actor, 'spellcastingClasses') || {}).length > 0);
        if (spellcasters.length > 0) return spellcasters;
      }
    } catch (error) {
      log(1, 'Error getting primary party.', { error });
    }
    if (game.user.isGM) ui.notifications.warn('SPELLBOOK.Party.NoPrimaryPartySet', { localize: true });
    else ui.notifications.info('SPELLBOOK.Party.AskGMToSetParty', { localize: true });
    return [];
  }

  /**
   * Get party users associated with a group actor.
   * @param {Object} groupActor - The group actor to analyze
   * @returns {Array<Object>} Array of user objects with ID, name, and actor information
   * @static
   */
  static getPartyUsers(groupActor) {
    log(3, 'Getting party users.', { groupActorName: groupActor?.name });
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
   * @param {Object} actor - The actor to find groups for
   * @returns {Object[]} Array of group actors containing this actor
   * @static
   */
  static findGroupsForActor(actor) {
    log(3, 'Finding groups for actor.', { actorName: actor?.name });
    if (!actor) return [];
    const groups = [];
    for (const groupActor of game.actors.filter((a) => a.type === 'group')) {
      const creatures = foundry.utils.getProperty(groupActor, 'system.creatures') || [];
      if (creatures.some((creature) => creature?.id === actor.id)) groups.push(groupActor);
    }
    return groups;
  }

  /**
   * Get the primary group for an actor.
   * @param {Object} actor - The actor to find the primary group for
   * @returns {Object|null} The primary group actor or null
   * @static
   */
  static getPrimaryGroupForActor(actor) {
    log(3, 'Getting primary group for actor.', { actorName: actor?.name });
    if (!actor) return null;
    try {
      const primaryPartyData = game.settings.get('dnd5e', 'primaryParty');
      const primaryPartyActor = foundry.utils.getProperty(primaryPartyData, 'actor');
      if (primaryPartyActor && primaryPartyActor.type === 'group') {
        const creatures = foundry.utils.getProperty(primaryPartyActor, 'system.creatures') || [];
        if (creatures.some((creature) => creature?.id === actor.id)) return primaryPartyActor;
      }
    } catch (error) {
      log(1, 'Error getting primary party data.', { error });
    }
    const groups = this.findGroupsForActor(actor);
    return groups[0] || null;
  }

  /**
   * Get available spellcasting focus names from world settings.
   * @returns {string[]} Array of focus names (display names, not IDs)
   * @static
   */
  static getAvailableFocuses() {
    log(3, 'Getting available focuses.');
    const settingData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    const focusData = Array.isArray(settingData) ? settingData[0] : settingData;
    return foundry.utils.getProperty(focusData, 'focuses') || [];
  }

  /**
   * Get available spellcasting focus options with full details.
   * @returns {Array<{ id: string, name: string, icon: string, description: string }>} Array of focus option objects with complete data
   * @static
   */
  static getAvailableFocusOptions() {
    log(3, 'Getting available focus options.');
    const settingData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    const focusData = Array.isArray(settingData) ? settingData[0] : settingData;
    return foundry.utils.getProperty(focusData, 'focuses') || [];
  }

  /**
   * Get user's selected focus for the specified group.
   * @param {Object} groupActor - The group actor storing focus selections
   * @param {string} userId - The user ID to look up
   * @returns {Object|null} The selected focus object with id, name, icon, and description, or null if no focus selected
   */
  getUserSelectedFocus(groupActor, userId) {
    log(3, 'Getting user selected focus.', { userId });
    const userSelections = groupActor?.getFlag(MODULE.ID, FLAGS.SELECTED_FOCUS) || {};
    const selectedFocusId = userSelections[userId];
    if (!selectedFocusId) return null;
    const settingData = game.settings.get(MODULE.ID, SETTINGS.AVAILABLE_FOCUS_OPTIONS);
    const focusData = Array.isArray(settingData) ? settingData[0] : settingData;
    const availableFocuses = foundry.utils.getProperty(focusData, 'focuses') || [];
    return availableFocuses.find((f) => foundry.utils.getProperty(f, 'id') === selectedFocusId) || null;
  }

  /**
   * Set user's selected focus for the specified group.
   * @param {Object} groupActor - The group actor to update
   * @param {string} userId - The user ID to set focus for
   * @param {string|null} focusId - The focus ID to set, or null to clear
   * @returns {Promise<boolean>} Success status of the operation
   */
  async setUserSelectedFocus(groupActor, userId, focusId) {
    log(3, 'Setting user selected focus.', { userId, focusId });
    const socketHandler = game.modules.get(MODULE.ID)?.socketHandler;
    if (!socketHandler) {
      log(1, 'Socket handler not available for setUserSelectedFocus.');
      return false;
    }
    const result = await socketHandler.setUserSelectedFocus(groupActor, userId, focusId);
    if (!result.success) log(2, 'Failed to set user selected focus.', { userId, focusId });
    return result.success;
  }

  /**
   * Check if an actor has a specific spell prepared.
   * @param {Object} actor - The actor to check
   * @param {string} spellUuid - The spell UUID
   * @returns {boolean} True if actor has spell prepared
   * @static
   */
  static actorHasSpell(actor, spellUuid) {
    log(3, 'Confirming if actor has the spell prepared.', { actor, spellUuid });
    if (!actor.testUserPermission(game.user, 'OBSERVER')) return false;
    const preparedSpells = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS) || [];
    if (preparedSpells.includes(spellUuid)) return true;
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    for (const classSpells of Object.values(preparedByClass)) {
      for (const spellKey of classSpells) {
        // eslint-disable-next-line no-unused-vars
        const [classIdentifier, ...uuidParts] = spellKey.split(':');
        const parsedSpellUuid = uuidParts.join(':');
        if (parsedSpellUuid === spellUuid) return true;
      }
    }
    return false;
  }
}
