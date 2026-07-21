/**
 * Party Spell Coordination and Analysis
 * @module Managers/PartyMode
 * @author Tyler
 */

import { FLAGS, MODULE, SPELL_MODE } from '../constants.mjs';
import { extractDamageTypes, extractSaveAbilities } from '../ui/formatting.mjs';
import { ClassManager } from './class-manager.mjs';

/**
 * Non-class spell sources surfaced in the party view.
 * @type {Array<{id: string, prefix: string, labelKey: string}>}
 */
const NON_CLASS_SOURCES = [
  { id: 'feat', prefix: 'feat:', labelKey: 'SPELLBOOK.SpellSource.Feat' },
  { id: 'race', prefix: 'race:', labelKey: 'SPELLBOOK.SpellSource.Species' }
];

/** @type {string[]} Casting methods that make a spell available without preparation. */
const ALWAYS_AVAILABLE_METHODS = [SPELL_MODE.ALWAYS, SPELL_MODE.INNATE, SPELL_MODE.AT_WILL];

/** Party Mode Manager — analysis-only, no UI helpers. */
export class PartyMode {
  /**
   * Full party spell analysis: actor breakdowns, level matrix, synergy, duplicates.
   * @param {object[]} partyActors - Array of spellcaster actor documents
   * @returns {object} { actors, spellsByLevel, synergy }
   */
  static analyzePartySpells(partyActors) {
    ATLAS.log(3, 'Analyzing party spells.', { count: partyActors.length });
    const actors = [];
    for (const actor of partyActors) actors.push(this._getActorSpellData(actor));
    actors.sort((a, b) => a.name.localeCompare(b.name));
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
    ATLAS.log(3, 'Getting spell synergy analysis.');
    const analysis = this._initializeAnalysis();
    const collectors = this._initializeCollectors();
    for (const actor of partyActors) {
      if (!actor.testUserPermission(game.user, 'OBSERVER')) continue;
      this._analyzeActorSpells(actor, analysis, collectors);
    }
    this._processCollectedData(analysis, collectors);
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
      for (const bucket of this._getSpellBuckets(actor)) {
        for (const spell of bucket.spells.prepared) {
          const doc = fromUuidSync(spell.uuid);
          if (!doc) continue;
          if (!spellActors.has(doc.name)) spellActors.set(doc.name, []);
          spellActors.get(doc.name).push(actor.name);
        }
      }
    }
    const duplicates = [];
    for (const [name, actors] of spellActors) if (actors.length > 1) duplicates.push({ name, actors: [...actors].sort((a, b) => a.localeCompare(b)), count: actors.length });
    duplicates.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
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
      ATLAS.log(1, 'Error getting primary party.', { error });
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
      ATLAS.log(1, 'Error getting primary party data.', { error });
    }
    return this.findGroupsForActor(actor)[0] || null;
  }

  /**
   * Whether an actor belongs in the party view.
   * @param {object} actor - The actor to check
   * @returns {boolean} Whether the actor contributes spells to the party
   */
  static isSpellcaster(actor) {
    if (Object.keys(actor?.spellcastingClasses || {}).length > 0) return true;
    return !!actor?.itemTypes?.spell?.some((s) => NON_CLASS_SOURCES.some((src) => s.system?.sourceItem?.startsWith(src.prefix)));
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
    for (const bucket of this._getSpellBuckets(actor)) {
      const { known, prepared } = bucket.spells;
      data.spellcasters.push({
        classId: bucket.id,
        className: bucket.name,
        enhancedClassName: bucket.enhancedName,
        icon: bucket.icon,
        knownSpells: known,
        preparedSpells: prepared,
        totalKnown: known.length,
        totalPrepared: prepared.length
      });
      data.totalSpellsKnown += known.length;
      data.totalSpellsPrepared += prepared.length;
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
    return this._collectSpells(actor, (s) => ClassManager.getSpellClassIdentifier(s) === classId);
  }

  /**
   * Get known and prepared spells granted by a non-class source (feat, species).
   * @param {object} actor - The actor document
   * @param {string} prefix - The `system.sourceItem` prefix, e.g. `'feat:'`
   * @returns {object} { known, prepared } arrays of spell data
   * @private
   */
  static _getSourceSpells(actor, prefix) {
    return this._collectSpells(actor, (s) => !!s.system?.sourceItem?.startsWith(prefix), true);
  }

  /**
   * Build known/prepared spell entries for the actor spells matching a filter.
   * @param {object} actor - The actor document
   * @param {Function} filter - Predicate applied to each spell item
   * @param {boolean} [alwaysAvailable] - Also count always/innate/at-will methods as prepared
   * @returns {object} { known, prepared } arrays of spell data
   * @private
   */
  static _collectSpells(actor, filter, alwaysAvailable = false) {
    const known = [];
    const prepared = [];
    for (const spell of actor.itemTypes.spell.filter(filter)) {
      const sourceUuid = spell._stats?.compendiumSource || spell.flags?.core?.sourceId || spell.uuid;
      const isPrepared = spell.system?.prepared === 1 || (alwaysAvailable && ALWAYS_AVAILABLE_METHODS.includes(spell.system?.method));
      const entry = { uuid: spell.uuid, sourceUuid, name: spell.name, level: spell.system?.level, prepared: isPrepared };
      known.push(entry);
      if (isPrepared) prepared.push(entry);
    }
    return { known, prepared };
  }

  /**
   * Build every spell bucket for an actor.
   * @param {object} actor - The actor document
   * @returns {object[]} Array of { id, name, enhancedName, icon, spells }
   * @private
   */
  static _getSpellBuckets(actor) {
    const buckets = [];
    for (const [classId, classData] of Object.entries(actor.spellcastingClasses || {})) {
      const subclass = classData._classLink?.name;
      const className = classData.name || classId;
      buckets.push({
        id: classId,
        name: className,
        enhancedName: subclass ? `${subclass} ${className}` : className,
        icon: classData.img,
        spells: this._getClassSpells(actor, classId)
      });
    }
    for (const source of NON_CLASS_SOURCES) {
      const spells = this._getSourceSpells(actor, source.prefix);
      if (!spells.known.length) continue;
      const label = _loc(source.labelKey);
      buckets.push({ id: source.id, name: label, enhancedName: label, icon: null, spells });
    }
    return buckets;
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
    for (const spells of Object.values(byLevel)) for (const spell of Object.values(spells)) spell.actorStatuses.sort((a, b) => a.name.localeCompare(b.name));
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
        spellLevels: new Map(),
        savingThrows: new Map(),
        duplicateSpells: new Map(),
        highConcentration: [],
        lowRitual: [],
        limitedDamageTypes: []
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
    for (const bucket of this._getSpellBuckets(actor)) {
      for (const spell of bucket.spells.known) {
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
    if (!analysis.memberContributions.spellLevels.has(props.level)) analysis.memberContributions.spellLevels.set(props.level, []);
    analysis.memberContributions.spellLevels.get(props.level).push(spellRef);
    for (const save of props.saves) {
      collectors.savingThrows[save] = (collectors.savingThrows[save] || 0) + 1;
      if (!analysis.memberContributions.savingThrows.has(save)) analysis.memberContributions.savingThrows.set(save, []);
      analysis.memberContributions.savingThrows.get(save).push(spellRef);
    }
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
    return {
      isConcentration: has('concentration'),
      isRitual: has('ritual'),
      damageTypes: new Set(extractDamageTypes(doc)),
      saves: new Set(extractSaveAbilities(doc)),
      hasVerbal: has('vocal'),
      hasSomatic: has('somatic'),
      hasMaterial: has('material'),
      hasConsumedMaterial: !!doc.system?.materials?.consumed,
      school: doc.system?.school || '',
      level: doc.system?.level || 0,
      range: doc.system?.range || {},
      duration: doc.system?.duration || {}
    };
  }

  /**
   * Aggregate raw collector data into the final analysis structure.
   * @param {object} analysis - Analysis structure
   * @param {object} collectors - Data collectors
   * @private
   */
  static _processCollectedData(analysis, collectors) {
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
    game.i18n.sortObjects(analysis.spellSchoolDistribution, 'localizedSchool');
    analysis.spellLevelDistribution = collectors.spellLevels
      .map((count, level) => ({
        level,
        count,
        percentage: analysis.totalPreparedSpells > 0 ? Math.round((count / analysis.totalPreparedSpells) * 100) : 0,
        localizedLevel: level === 0 ? _loc('DND5E.SpellLevel0') : _loc(`DND5E.SpellLevel${level}`),
        members: analysis.memberContributions.spellLevels.get(level) || []
      }))
      .filter((l) => l.count > 0);
    analysis.savingThrowDistribution = Object.entries(collectors.savingThrows).map(([save, count]) => ({
      save,
      localizedSave: _loc(`DND5E.Ability${save.charAt(0).toUpperCase()}${save.slice(1).toLowerCase()}`) || save,
      count,
      members: analysis.memberContributions.savingThrows.get(save) || []
    }));
    game.i18n.sortObjects(analysis.savingThrowDistribution, 'localizedSave');
    for (const [name, actors] of collectors.preparedSpellsByName) {
      if (actors.length > 1) {
        const sortedActors = [...actors].sort((a, b) => a.localeCompare(b));
        analysis.duplicateSpells.push({ name, actors: sortedActors });
        analysis.memberContributions.duplicateSpells.set(name, sortedActors);
      }
    }
    analysis.duplicateSpells.sort((a, b) => b.actors.length - a.actors.length || a.name.localeCompare(b.name));
    analysis.componentAnalysis = collectors.components;
    analysis.rangeAnalysis = collectors.ranges;
    analysis.durationAnalysis = collectors.durations;
    const toSortedMembers = (map) =>
      Array.from(map.entries())
        .map(([name, spells]) => ({ name, spells: [...spells].sort((a, b) => a.localeCompare(b)), count: spells.length }))
        .sort((a, b) => a.name.localeCompare(b.name));
    analysis.concentrationMembers = toSortedMembers(analysis.memberContributions.concentration);
    analysis.ritualMembers = toSortedMembers(analysis.memberContributions.ritual);
  }

  /**
   * Generate recommendation keys based on analysis thresholds.
   * @param {object} analysis - The synergy analysis data
   * @private
   */
  static _generateRecommendations(analysis) {
    const recs = [];
    const totalPrepared = analysis.totalPreparedSpells || 0;
    if (analysis.concentrationPercentage > 70) recs.push('SPELLBOOK.Party.Recommendations.HighConcentration');
    if (analysis.ritualSpells < 3 && analysis.totalSpells > 20) recs.push('SPELLBOOK.Party.Recommendations.LowRituals');
    if (analysis.duplicateSpells.length > 0) recs.push('SPELLBOOK.Party.Recommendations.DuplicateSpells');
    const lowLevelCount = analysis.spellLevelDistribution.filter((l) => l.level <= 2).reduce((sum, l) => sum + l.count, 0);
    if (totalPrepared > 0 && lowLevelCount / totalPrepared > 0.7) recs.push('SPELLBOOK.Party.Recommendations.LowLevelHeavy');
    const damageTypes = analysis.damageDistribution.filter((d) => d.type !== 'healing' && d.type !== 'temphp');
    const damageTotal = damageTypes.reduce((sum, d) => sum + d.count, 0);
    if (damageTypes.length < 4 && analysis.totalSpells > 15) recs.push('SPELLBOOK.Party.Recommendations.LimitedDamageTypes');
    if (damageTotal > 0 && Math.max(...damageTypes.map((d) => d.count)) / damageTotal > 0.5) recs.push('SPELLBOOK.Party.Recommendations.DamageTypeConcentration');
    if (analysis.totalSpells > 10 && !analysis.damageDistribution.some((d) => d.type === 'healing' || d.type === 'temphp')) recs.push('SPELLBOOK.Party.Recommendations.NoHealing');
    if (analysis.savingThrowDistribution.length < 3) recs.push('SPELLBOOK.Party.Recommendations.LimitedSavingThrows');
    const saveTotal = analysis.savingThrowDistribution.reduce((sum, s) => sum + s.count, 0);
    if (saveTotal > 3 && Math.max(...analysis.savingThrowDistribution.map((s) => s.count)) / saveTotal > 0.6) recs.push('SPELLBOOK.Party.Recommendations.SaveConcentration');
    const ranges = analysis.rangeAnalysis || {};
    const rangeTotal = (ranges.self || 0) + (ranges.touch || 0) + (ranges.ranged || 0);
    if (rangeTotal > 10 && ((ranges.self || 0) + (ranges.touch || 0)) / rangeTotal > 0.5) recs.push('SPELLBOOK.Party.Recommendations.ShortRangeHeavy');
    if ((analysis.componentAnalysis?.materialCost || 0) >= 5) recs.push('SPELLBOOK.Party.Recommendations.HighMaterialCost');
    analysis.recommendations = recs;
  }

  /**
   * Localize a damage or healing type from CONFIG.DND5E, with a short label for temp HP.
   * @param {string} type - The damage/healing type identifier
   * @returns {string} Localized name
   * @private
   */
  static _localizeDamageType(type) {
    if (type === 'temphp') return _loc('SPELLBOOK.Party.Analysis.HealingTemp');
    const config = CONFIG.DND5E.damageTypes?.[type] || CONFIG.DND5E.healingTypes?.[type];
    return config?.label ? _loc(config.label) : type;
  }
}
