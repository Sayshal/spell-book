/**
 * Party Spell Coordination and Analysis
 * @module Managers/PartyMode
 * @author Tyler
 */

import { FLAGS, MODULE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';
import { ClassManager } from './class-manager.mjs';

/** Party Mode Manager — analysis-only, no UI helpers. */
export class PartyMode {
  /**
   * Full party spell analysis: actor breakdowns, level matrix, synergy, duplicates.
   * @param {object[]} partyActors - Array of spellcaster actor documents
   * @returns {object} { actors, spellsByLevel, synergy }
   */
  static analyzePartySpells(partyActors) {
    log(3, 'Analyzing party spells.', { count: partyActors.length });
    const actors = [];
    for (const actor of partyActors) actors.push(this._getActorSpellData(actor));
    const spellsByLevel = this._organizeByLevel(actors);
    const synergy = this.getSpellSynergyAnalysis(partyActors);
    return { actors, spellsByLevel, synergy };
  }

  /**
   * Comprehensive synergy analysis: damage distribution, concentration, rituals, recommendations.
   * @param {object[]} partyActors - Array of spellcaster actor documents
   * @returns {object} Full analysis data structure
   */
  static getSpellSynergyAnalysis(partyActors) {
    log(3, 'Getting spell synergy analysis.');
    const analysis = this._initializeAnalysis();
    const collectors = this._initializeCollectors();
    for (const actor of partyActors) {
      if (!actor.testUserPermission(game.user, 'OBSERVER')) continue;
      this._analyzeActorSpells(actor, analysis, collectors);
    }
    this._processCollectedData(analysis, collectors, partyActors.length);
    this._generateRecommendations(analysis);
    return analysis;
  }

  /**
   * Find spells prepared by multiple party members.
   * @param {object[]} partyActors - Array of spellcaster actor documents
   * @returns {object[]} Array of { name, actors, count }
   */
  static findDuplicateSpells(partyActors) {
    const spellActors = new Map();
    for (const actor of partyActors) {
      if (!actor.testUserPermission(game.user, 'OBSERVER')) continue;
      for (const classId of Object.keys(actor.spellcastingClasses || {})) {
        const spells = this._getClassSpells(actor, classId);
        for (const spell of spells.prepared) {
          const doc = fromUuidSync(spell.uuid);
          if (!doc) continue;
          if (!spellActors.has(doc.name)) spellActors.set(doc.name, []);
          spellActors.get(doc.name).push(actor.name);
        }
      }
    }
    const duplicates = [];
    for (const [name, actors] of spellActors) if (actors.length > 1) duplicates.push({ name, actors: [...actors], count: actors.length });
    return duplicates;
  }

  /**
   * Get party actors from a group or the primary party setting.
   * @param {object} [groupActor] - Specific group actor, or null for primary party
   * @returns {object[]} Array of spellcaster actors
   */
  static getPartyActors(groupActor = null) {
    if (groupActor?.type === 'group') {
      const creatures = foundry.utils.getProperty(groupActor, 'system.creatures') || [];
      return creatures.filter((a) => this.isSpellcaster(a));
    }
    try {
      const primaryPartyData = game.settings.get('dnd5e', 'primaryParty');
      const primaryPartyActor = foundry.utils.getProperty(primaryPartyData, 'actor');
      if (primaryPartyActor?.type === 'group') {
        const creatures = foundry.utils.getProperty(primaryPartyActor, 'system.creatures') || [];
        const casters = creatures.filter((a) => this.isSpellcaster(a));
        if (casters.length > 0) return casters;
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
   * @param {object} groupActor - The group actor
   * @returns {object[]} Array of { id, name, actorId, actorName, user }
   */
  static getPartyUsers(groupActor) {
    if (!groupActor || groupActor.type !== 'group') return [];
    const partyActors = this.getPartyActors(groupActor);
    const actorIds = new Set(partyActors.map((a) => a.id));
    const users = [];
    for (const user of game.users) {
      if (user.character && actorIds.has(user.character.id)) users.push({ id: user.id, name: user.name, actorId: user.character.id, actorName: user.character.name, user });
    }
    return users;
  }

  /**
   * Find all group actors containing the specified actor.
   * @param {object} actor - The actor to search for
   * @returns {object[]} Array of group actors
   */
  static findGroupsForActor(actor) {
    if (!actor) return [];
    return game.actors.filter((a) => {
      if (a.type !== 'group') return false;
      const creatures = foundry.utils.getProperty(a, 'system.creatures') || [];
      return creatures.some((c) => c?.id === actor.id);
    });
  }

  /**
   * Get the primary group for an actor.
   * @param {object} actor - The actor
   * @returns {object|null} The primary group actor or null
   */
  static getPrimaryGroupForActor(actor) {
    if (!actor) return null;
    try {
      const primaryPartyData = game.settings.get('dnd5e', 'primaryParty');
      const primaryPartyActor = foundry.utils.getProperty(primaryPartyData, 'actor');
      if (primaryPartyActor?.type === 'group') {
        const creatures = foundry.utils.getProperty(primaryPartyActor, 'system.creatures') || [];
        if (creatures.some((c) => c?.id === actor.id)) return primaryPartyActor;
      }
    } catch (error) {
      log(1, 'Error getting primary party data.', { error });
    }
    return this.findGroupsForActor(actor)[0] || null;
  }

  /**
   * @param {object} actor - The actor to check
   * @todo this seems unnecessary?
   * @returns {boolean} Whether the actor has spellcasting classes
   */
  static isSpellcaster(actor) {
    return Object.keys(actor.spellcastingClasses || {}).length > 0;
  }

  /**
   * Check if an actor has a specific spell prepared (via flags).
   * @param {object} actor - The actor to check
   * @param {string} spellUuid - The spell UUID
   * @returns {boolean} Whether the spell is prepared
   */
  static actorHasSpell(actor, spellUuid) {
    if (!actor.testUserPermission(game.user, 'OBSERVER')) return false;
    const preparedSpells = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS) || [];
    if (preparedSpells.includes(spellUuid)) return true;
    const preparedByClass = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    for (const classSpells of Object.values(preparedByClass)) {
      for (const spellKey of classSpells) {
        const [, ...uuidParts] = spellKey.split(':');
        if (uuidParts.join(':') === spellUuid) return true;
      }
    }
    return false;
  }

  /**
   * Build actor spell data for the comparison view.
   * @param {object} actor - The actor document
   * @returns {object} Actor spell data
   * @private
   */
  static _getActorSpellData(actor) {
    const hasPermission = actor.testUserPermission(game.user, 'OBSERVER');
    const data = { id: actor.id, name: actor.name, hasPermission, token: actor.img, spellcasters: [], totalSpellsKnown: 0, totalSpellsPrepared: 0 };
    if (!hasPermission) return data;
    for (const [classId, classData] of Object.entries(actor.spellcastingClasses || {})) {
      const spells = this._getClassSpells(actor, classId);
      const subclass = classData._classLink?.name;
      const className = classData.name || classId;
      data.spellcasters.push({
        classId,
        className,
        enhancedClassName: subclass ? `${subclass} ${className}` : className,
        icon: classData.img,
        knownSpells: spells.known,
        preparedSpells: spells.prepared,
        totalKnown: spells.known.length,
        totalPrepared: spells.prepared.length
      });
      data.totalSpellsKnown += spells.known.length;
      data.totalSpellsPrepared += spells.prepared.length;
    }
    return data;
  }

  /**
   * Get known and prepared spells for a class on an actor.
   * @param {object} actor - The actor document
   * @param {string} classId - The class identifier
   * @returns {object} { known, prepared } arrays of spell data
   * @private
   */
  static _getClassSpells(actor, classId) {
    const known = [];
    const prepared = [];
    const classSpells = actor.itemTypes.spell.filter((s) => ClassManager.getSpellClassIdentifier(s) === classId);
    for (const spell of classSpells) {
      const sourceUuid = spell._stats?.compendiumSource || spell.flags?.core?.sourceId || spell.uuid;
      const entry = { uuid: spell.uuid, sourceUuid, name: spell.name, level: spell.system?.level, prepared: spell.system?.prepared === 1 };
      known.push(entry);
      if (entry.prepared) prepared.push(entry);
    }
    return { known, prepared };
  }

  /**
   * Organize actor spell data into a level-keyed comparison matrix.
   * @param {object[]} actorDataList - Array of actor spell data objects
   * @returns {object} Spells keyed by level, then by spell name
   * @private
   */
  static _organizeByLevel(actorDataList) {
    const byLevel = {};
    for (const actorData of actorDataList) {
      if (!actorData.hasPermission) continue;
      for (const classData of actorData.spellcasters) {
        for (const spell of classData.knownSpells) {
          if (!byLevel[spell.level]) byLevel[spell.level] = {};
          if (!byLevel[spell.level][spell.name]) {
            byLevel[spell.level][spell.name] = { name: spell.name, level: spell.level, sourceUuid: spell.sourceUuid, actorStatuses: [] };
          }
          byLevel[spell.level][spell.name].actorStatuses.push({
            actorId: actorData.id,
            name: actorData.name,
            classId: classData.classId,
            className: classData.className,
            status: spell.prepared ? 'prepared' : 'known'
          });
        }
      }
    }
    return byLevel;
  }

  /**
   * @returns {object} Empty analysis structure
   * @private
   */
  static _initializeAnalysis() {
    return {
      totalSpells: 0,
      totalPreparedSpells: 0,
      damageDistribution: [],
      concentrationSpells: 0,
      concentrationPercentage: 0,
      ritualSpells: 0,
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
        components: { verbal: [], somatic: [], material: [], materialCost: [] },
        duplicateSpells: new Map(),
        highConcentration: [],
        lowRitual: [],
        limitedDamageTypes: [],
      },
      concentrationMembers: [],
      ritualMembers: []
    };
  }

  /**
   * @returns {object} Empty data collectors
   * @private
   */
  static _initializeCollectors() {
    return {
      allSpells: new Set(),
      allPreparedSpells: new Set(),
      damageTypes: {},
      spellSchools: {},
      spellLevels: Array(10).fill(0),
      savingThrows: {},
      ranges: { self: 0, touch: 0, ranged: 0 },
      durations: { instantaneous: 0, concentration: 0, timed: 0 },
      components: { verbal: 0, somatic: 0, material: 0, materialCost: 0 },
      concentrationCount: 0,
      ritualCount: 0,
      preparedSpellsByName: new Map(),
      spellNameToUuid: new Map()
    };
  }

  /**
   * Analyze all spells for a single actor.
   * @param {object} actor - The actor
   * @param {object} analysis - Analysis structure
   * @param {object} collectors - Data collectors
   * @private
   */
  static _analyzeActorSpells(actor, analysis, collectors) {
    const actorStats = { concentrationCount: 0, ritualCount: 0, damageTypes: new Set(), preparedCount: 0 };
    for (const classId of Object.keys(actor.spellcastingClasses || {})) {
      const spells = this._getClassSpells(actor, classId);
      for (const spell of spells.known) {
        collectors.allSpells.add(spell.uuid);
        if (spell.prepared) {
          actorStats.preparedCount++;
          this._analyzeSpell(spell, actor.name, analysis, collectors, actorStats);
        }
      }
    }
    if (actorStats.preparedCount > 0 && actorStats.concentrationCount / actorStats.preparedCount > 0.6) {
      analysis.memberContributions.highConcentration.push({
        name: actor.name,
        percentage: Math.round((actorStats.concentrationCount / actorStats.preparedCount) * 100),
        count: actorStats.concentrationCount
      });
    }
    if (actorStats.preparedCount > 5 && actorStats.ritualCount < 2) {
      analysis.memberContributions.lowRitual.push({ name: actor.name, ritualCount: actorStats.ritualCount, totalPrepared: actorStats.preparedCount });
    }
    if (actorStats.damageTypes.size < 3 && actorStats.preparedCount > 8) {
      analysis.memberContributions.limitedDamageTypes.push({ name: actor.name, damageTypes: Array.from(actorStats.damageTypes), typeCount: actorStats.damageTypes.size });
    }
  }

  /**
   * Analyze a single prepared spell.
   * @param {object} spell - The spell data { uuid, name, level }
   * @param {string} actorName - Actor name for attribution
   * @param {object} analysis - Analysis structure
   * @param {object} collectors - Data collectors
   * @param {object} actorStats - Per-actor accumulators
   * @private
   */
  static _analyzeSpell(spell, actorName, analysis, collectors, actorStats) {
    collectors.allPreparedSpells.add(spell.uuid);
    const doc = fromUuidSync(spell.uuid);
    if (!doc) return;
    const props = this._extractSpellProperties(doc);
    const spellRef = `${actorName}: ${doc.name}`;
    if (!collectors.preparedSpellsByName.has(doc.name)) collectors.preparedSpellsByName.set(doc.name, []);
    collectors.preparedSpellsByName.get(doc.name).push(actorName);
    if (props.isConcentration) {
      collectors.concentrationCount++;
      actorStats.concentrationCount++;
      if (!analysis.memberContributions.concentration.has(actorName)) analysis.memberContributions.concentration.set(actorName, []);
      analysis.memberContributions.concentration.get(actorName).push(doc.name);
    }
    if (props.isRitual) {
      collectors.ritualCount++;
      actorStats.ritualCount++;
      if (!analysis.memberContributions.ritual.has(actorName)) analysis.memberContributions.ritual.set(actorName, []);
      analysis.memberContributions.ritual.get(actorName).push(doc.name);
    }
    for (const type of props.damageTypes) {
      collectors.damageTypes[type] = (collectors.damageTypes[type] || 0) + 1;
      actorStats.damageTypes.add(type);
      if (!analysis.memberContributions.damageTypes.has(type)) analysis.memberContributions.damageTypes.set(type, []);
      analysis.memberContributions.damageTypes.get(type).push(spellRef);
    }
    if (props.school) {
      collectors.spellSchools[props.school] = (collectors.spellSchools[props.school] || 0) + 1;
      if (!analysis.memberContributions.schools.has(props.school)) analysis.memberContributions.schools.set(props.school, []);
      analysis.memberContributions.schools.get(props.school).push(spellRef);
    }
    if (props.hasVerbal) {
      collectors.components.verbal++;
      analysis.memberContributions.components.verbal.push(spellRef);
    }
    if (props.hasSomatic) {
      collectors.components.somatic++;
      analysis.memberContributions.components.somatic.push(spellRef);
    }
    if (props.hasMaterial) {
      collectors.components.material++;
      analysis.memberContributions.components.material.push(spellRef);
      if (props.hasConsumedMaterial) {
        collectors.components.materialCost++;
        analysis.memberContributions.components.materialCost.push(spellRef);
      }
    }
    collectors.spellLevels[props.level]++;
    if (props.save) collectors.savingThrows[props.save] = (collectors.savingThrows[props.save] || 0) + 1;
    const rangeUnits = props.range?.units;
    if (rangeUnits === 'self') collectors.ranges.self++;
    else if (rangeUnits === 'touch') collectors.ranges.touch++;
    else collectors.ranges.ranged++;
    if (props.isConcentration) collectors.durations.concentration++;
    else if (props.duration?.units === 'inst') collectors.durations.instantaneous++;
    else collectors.durations.timed++;
  }

  /**
   * Extract spell properties directly from a spell document (no UI helpers).
   * @param {object} doc - The spell document
   * @returns {object} Extracted properties
   * @private
   */
  static _extractSpellProperties(doc) {
    const props = doc.system?.properties;
    const has = (p) => props?.has?.(p) || (Array.isArray(props) && props.includes(p));
    const damageTypes = new Set();
    for (const activity of Object.values(doc.system?.activities || {})) {
      for (const part of Object.values(activity.damage?.parts || {})) for (const t of part.types || []) damageTypes.add(t);
      for (const part of Object.values(activity.healing?.parts || {})) for (const t of part.types || []) damageTypes.add(t);
    }
    return {
      isConcentration: has('concentration'),
      isRitual: has('ritual'),
      damageTypes,
      hasVerbal: has('vocal'),
      hasSomatic: has('somatic'),
      hasMaterial: has('material'),
      hasConsumedMaterial: !!doc.system?.materials?.consumed,
      school: doc.system?.school || '',
      level: doc.system?.level || 0,
      save: doc.system?.save?.ability || '',
      range: doc.system?.range || {},
      duration: doc.system?.duration || {}
    };
  }

  /**
   * Aggregate raw collector data into the final analysis structure.
   * @param {object} analysis - Analysis structure
   * @param {object} collectors - Data collectors
   * @param {number} partySize - Number of party members
   * @private
   */
  static _processCollectedData(analysis, collectors, partySize) {
    analysis.totalSpells = collectors.allSpells.size;
    analysis.totalPreparedSpells = collectors.allPreparedSpells.size;
    analysis.concentrationSpells = collectors.concentrationCount;
    analysis.concentrationPercentage = analysis.totalPreparedSpells > 0 ? Math.round((collectors.concentrationCount / analysis.totalPreparedSpells) * 100) : 0;
    analysis.ritualSpells = collectors.ritualCount;
    analysis.damageDistribution = Object.entries(collectors.damageTypes).map(([type, count]) => ({
      type,
      localizedType: this._localizeDamageType(type),
      count,
      members: analysis.memberContributions.damageTypes.get(type) || []
    }));
    game.i18n.sortObjects(analysis.damageDistribution, 'localizedType');
    analysis.spellSchoolDistribution = Object.entries(collectors.spellSchools).map(([school, count]) => ({
      school,
      localizedSchool: _loc(`DND5E.School${school.charAt(0).toUpperCase()}${school.slice(1).toLowerCase()}`) || school,
      count,
      percentage: Math.round((count / analysis.totalPreparedSpells) * 100),
      members: analysis.memberContributions.schools.get(school) || []
    }));
    analysis.spellLevelDistribution = collectors.spellLevels
      .map((count, level) => ({
        level,
        count,
        percentage: analysis.totalPreparedSpells > 0 ? Math.round((count / analysis.totalPreparedSpells) * 100) : 0,
        localizedLevel: level === 0 ? _loc('DND5E.SpellLevel0') : _loc(`DND5E.SpellLevel${level}`)
      }))
      .filter((l) => l.count > 0);
    analysis.savingThrowDistribution = Object.entries(collectors.savingThrows).map(([save, count]) => ({
      save,
      localizedSave: _loc(`DND5E.Ability${save.charAt(0).toUpperCase()}${save.slice(1).toLowerCase()}`) || save,
      count
    }));
    for (const [name, actors] of collectors.preparedSpellsByName) {
      if (actors.length > 1) {
        analysis.duplicateSpells.push({ name, actors: [...actors] });
        analysis.memberContributions.duplicateSpells.set(name, [...actors]);
      }
    }
    analysis.componentAnalysis = collectors.components;
    analysis.rangeAnalysis = collectors.ranges;
    analysis.durationAnalysis = collectors.durations;
    analysis.concentrationMembers = Array.from(analysis.memberContributions.concentration.entries()).map(([name, spells]) => ({ name, spells, count: spells.length }));
    analysis.ritualMembers = Array.from(analysis.memberContributions.ritual.entries()).map(([name, spells]) => ({ name, spells, count: spells.length }));
  }

  /**
   * Generate recommendation keys based on analysis thresholds.
   * @param {object} analysis - The synergy analysis data
   * @private
   */
  static _generateRecommendations(analysis) {
    const recs = [];
    if (analysis.concentrationPercentage > 70) recs.push('SPELLBOOK.Party.Recommendations.HighConcentration');
    if (analysis.ritualSpells < 3 && analysis.totalSpells > 20) recs.push('SPELLBOOK.Party.Recommendations.LowRituals');
    if (analysis.damageDistribution.length < 4 && analysis.totalSpells > 15) recs.push('SPELLBOOK.Party.Recommendations.LimitedDamageTypes');
    if (analysis.duplicateSpells.length > 0) recs.push('SPELLBOOK.Party.Recommendations.DuplicateSpells');
    const lowLevelCount = analysis.spellLevelDistribution.filter((l) => l.level <= 2).reduce((sum, l) => sum + l.count, 0);
    if (analysis.totalPreparedSpells > 0 && lowLevelCount / analysis.totalPreparedSpells > 0.7) recs.push('SPELLBOOK.Party.Recommendations.LowLevelHeavy');
    if (analysis.savingThrowDistribution.length < 3) recs.push('SPELLBOOK.Party.Recommendations.LimitedSavingThrows');
    analysis.recommendations = recs;
  }

  /**
   * Localize a damage type with fallbacks for healing/temphp.
   * @param {string} type - The damage type identifier
   * @returns {string} Localized name
   * @private
   */
  static _localizeDamageType(type) {
    if (type === 'healing') return _loc('DND5E.Healing');
    if (type === 'temphp') return _loc('SPELLBOOK.Party.Analysis.HealingTemp');
    return _loc(`DND5E.Damage${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()}`) || type;
  }
}
