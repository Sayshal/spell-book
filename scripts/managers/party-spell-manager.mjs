import { FLAGS, MODULE, SETTINGS } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as UIHelpers from '../ui/_module.mjs';

/**
 * Manages party spell coordination and analysis
 * Handles spell pool analysis, synergy detection, and collaboration features
 */
export class PartySpellManager {
  /**
   * Create a new Party Spell Manager
   * @param {Actor[]} partyActors Array of actors in the party
   * @param {Actor} [viewingActor] The actor whose SpellBook opened this manager
   */
  constructor(partyActors = [], viewingActor = null) {
    this.partyActors = partyActors.filter((actor) => this.isSpellcaster(actor));
    this.viewingActor = viewingActor;
    this._spellDataCache = new Map();
    this._lastCacheTime = 0;
  }

  /**
   * Check if an actor is a spellcaster
   * @param {Actor} actor The actor to check
   * @returns {boolean} True if actor can cast spells
   */
  isSpellcaster(actor) {
    return Object.keys(actor?.spellcastingClasses || {}).length > 0;
  }

  /**
   * Get party spell comparison data
   * @returns {Promise<Object>} Comparison matrix data
   */
  async getPartySpellComparison() {
    const comparisonData = {
      actors: [],
      spellsByLevel: {},
      synergy: await this.getSpellSynergyAnalysis()
    };

    for (const actor of this.partyActors) {
      const actorData = await this.getActorSpellData(actor);
      if (actorData) {
        comparisonData.actors.push(actorData);
      }
    }

    // Organize spells by level for comparison matrix
    this.organizeSpellsByLevel(comparisonData);

    return comparisonData;
  }

  /**
   * Get spell data for a specific actor
   * @param {Actor} actor The actor to analyze
   * @returns {Promise<Object|null>} Actor spell data or null if no permission
   */
  async getActorSpellData(actor) {
    // Check permissions
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

    // Get spellcasting classes
    for (const [classId, classData] of Object.entries(actor.spellcastingClasses || {})) {
      const classSpells = await this.getClassSpells(actor, classId);
      if (classSpells) {
        actorData.spellcasters.push({
          classId,
          className: classData.name || classId,
          icon: classData.img,
          knownSpells: classSpells.known,
          preparedSpells: classSpells.prepared,
          totalKnown: classSpells.known.length,
          totalPrepared: classSpells.prepared.length
        });

        // Add to actor totals
        actorData.totalSpellsKnown += classSpells.known.length;
        actorData.totalSpellsPrepared += classSpells.prepared.length;
      }
    }

    return actorData;
  }

  /**
   * Get spells for a specific class on an actor
   * @param {Actor} actor The actor
   * @param {string} classId The class identifier
   * @returns {Promise<Object|null>} Class spell data
   */
  async getClassSpells(actor, classId) {
    const cacheKey = `${actor.id}-${classId}`;
    const now = Date.now();

    if (this._spellDataCache.has(cacheKey) && now - this._lastCacheTime < 30000) {
      return this._spellDataCache.get(cacheKey);
    }

    try {
      const knownSpells = [];
      const preparedSpells = [];

      // Get all spells for this class
      const classSpells = actor.items.filter((item) => item.type === 'spell' && (item.system.sourceClass === classId || item.sourceClass === classId));

      for (const spell of classSpells) {
        // Get enriched spell data using fromUuidSync (no DB hit for actor items)
        const spellDoc = fromUuidSync(spell.uuid);

        const enrichedIcon = UIHelpers.createSpellIconLink(spellDoc || spell);

        // Get component abbreviations from labels
        const componentAbbrs = spellDoc?.labels?.components?.all?.map((comp) => comp.abbr).join(', ') || '';

        const spellData = {
          uuid: spell.uuid,
          name: spell.name,
          level: spell.system.level,
          school: spell.system.school,
          enrichedIcon: enrichedIcon, // Full HTML with metadata
          components: componentAbbrs,
          concentration: spell.system.properties?.has('concentration'),
          ritual: spell.system.properties?.has('ritual'),
          damageType: this.extractDamageTypes(spell),
          prepared: spell.system.prepared === 1
        };

        knownSpells.push(spellData);

        if (spellData.prepared) {
          preparedSpells.push(spellData);
        }
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
   * Extract damage types from a spell
   * @param {Item} spell The spell item
   * @returns {string[]} Array of damage types
   */
  extractDamageTypes(spell) {
    const damageTypes = new Set();

    // Check activities for damage
    for (const activity of spell.system.activities?.values() || []) {
      if (activity.damage?.parts) {
        for (const part of activity.damage.parts) {
          if (part.types && part.types.size > 0) {
            part.types.forEach((type) => damageTypes.add(type));
          }
        }
      }
    }

    return Array.from(damageTypes);
  }

  /**
   * Check if current user has view permission for actor
   * @param {Actor} actor The actor to check
   * @returns {boolean} True if user can view actor details
   */
  hasViewPermission(actor) {
    return actor.testUserPermission(game.user, 'OBSERVER');
  }

  /**
   * Get actor's spellcasting focus
   * @param {Actor} actor The actor
   * @returns {string} The actor's spellcasting focus
   */
  getActorSpellcastingFocus(actor) {
    return actor.getFlag(MODULE.ID, FLAGS.SPELLCASTING_FOCUS) || 'SPELLBOOK.Party.Focus.None';
  }

  /**
   * Set actor's spellcasting focus
   * @param {Actor} actor The actor
   * @param {string} focus The focus to set
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
   * Organize spells by level for comparison matrix
   * @param {Object} comparisonData The comparison data to organize
   */
  organizeSpellsByLevel(comparisonData) {
    const spellsByLevel = {};

    for (const actorData of comparisonData.actors) {
      if (!actorData.hasPermission) continue;

      for (const classData of actorData.spellcasters) {
        for (const spell of classData.knownSpells) {
          const level = spell.level;
          if (!spellsByLevel[level]) {
            spellsByLevel[level] = {};
          }

          const spellKey = spell.name;
          if (!spellsByLevel[level][spellKey]) {
            spellsByLevel[level][spellKey] = {
              uuid: spell.uuid,
              name: spell.name,
              enrichedIcon: spell.enrichedIcon,
              components: spell.components,
              level: spell.level,
              school: spell.school,
              actorStatuses: []
            };
          }

          spellsByLevel[level][spellKey].actorStatuses.push({
            actorId: actorData.id,
            name: actorData.name,
            token: actorData.token,
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
   * Get spell synergy analysis for the party
   * @returns {Promise<Object>} Synergy analysis data
   */
  async getSpellSynergyAnalysis() {
    const analysis = {
      totalSpells: 0,
      totalPreparedSpells: 0,
      damageDistribution: [], // Change to array of objects
      concentrationSpells: 0,
      concentrationPercentage: 0,
      ritualSpells: 0,
      focusDistribution: [], // Change to array of objects
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

          if (spell.prepared) {
            allPreparedSpells.add(spell.uuid);
          }

          if (spell.concentration) {
            concentrationCount++;
          }

          if (spell.ritual) {
            ritualCount++;
          }

          // Count damage types
          for (const damageType of spell.damageType || []) {
            damageTypes[damageType] = (damageTypes[damageType] || 0) + 1;
          }
        }
      }
    }

    analysis.totalSpells = allSpells.size;
    analysis.totalPreparedSpells = allPreparedSpells.size;
    analysis.concentrationSpells = concentrationCount;
    analysis.concentrationPercentage = analysis.totalPreparedSpells > 0 ? Math.round((concentrationCount / analysis.totalPreparedSpells) * 100) : 0;
    analysis.ritualSpells = ritualCount;

    // Format damage types for template
    analysis.damageDistribution = Object.entries(damageTypes).map(([type, count]) => ({
      type: type,
      localizedType: game.i18n.localize(`DND5E.Damage${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()}`) || type,
      count: count
    }));

    // Format focus distribution for template
    analysis.focusDistribution = Object.entries(focusTypes).map(([focus, count]) => ({
      focus: focus,
      count: count
    }));

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  /**
   * Generate spell preparation recommendations
   * @param {Object} analysis The synergy analysis data
   * @returns {string[]} Array of recommendation messages
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    // High concentration warning
    if (analysis.concentrationPercentage > 70) {
      recommendations.push('SPELLBOOK.Party.Recommendations.HighConcentration');
    }

    // Low ritual utilization
    if (analysis.ritualSpells < 3 && analysis.totalSpells > 20) {
      recommendations.push('SPELLBOOK.Party.Recommendations.LowRituals');
    }

    // Damage type diversity
    const damageTypeCount = Object.keys(analysis.damageDistribution).length;
    if (damageTypeCount < 4 && analysis.totalSpells > 15) {
      recommendations.push('SPELLBOOK.Party.Recommendations.LimitedDamageTypes');
    }

    // Focus balance
    const focusCount = Object.keys(analysis.focusDistribution).length;
    if (focusCount < 3 && this.partyActors.length >= 3) {
      recommendations.push('SPELLBOOK.Party.Recommendations.UnbalancedFocus');
    }

    return recommendations;
  }

  /**
   * Get available spellcasting focuses from world settings
   * @returns {string[]} Array of focus names
   */
  static getAvailableFocuses() {
    const focusString = game.settings.get(MODULE.ID, SETTINGS.SPELLCASTING_FOCUSES);
    return focusString
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  }

  /**
   * Get party actors from the primary party setting or fallback
   * @param {Actor} [groupActor] Optional specific group actor to use instead of primary party
   * @returns {Actor[]} Array of party member actors
   */
  static getPartyActors(groupActor = null) {
    // If a specific group actor is provided, use it
    if (groupActor && groupActor.type === 'group') {
      const creatures = groupActor.system?.creatures || [];
      return creatures.filter((actor) => actor && Object.keys(actor?.spellcastingClasses || {}).length > 0);
    }

    // Check for D&D 5e primary party setting
    try {
      const primaryPartyData = game.settings.get('dnd5e', 'primaryParty');
      const primaryPartyActor = primaryPartyData?.actor;

      if (primaryPartyActor && primaryPartyActor.type === 'group') {
        const creatures = primaryPartyActor.system?.creatures || [];
        const spellcasters = creatures.filter((actor) => actor && Object.keys(actor?.spellcastingClasses || {}).length > 0);

        if (spellcasters.length > 0) {
          return spellcasters;
        }
      }
    } catch (error) {
      log(2, 'Error accessing primary party setting:', error);
    }

    // Warn GM that primary party is not set
    if (game.user.isGM) {
      ui.notifications.warn('SPELLBOOK.Party.NoPrimaryPartySet', { localize: true });
      log(2, 'No primary party set in D&D 5e settings. Please configure a primary party group actor.');
    } else {
      ui.notifications.info('SPELLBOOK.Party.AskGMToSetParty', { localize: true });
    }

    return [];
  }
}
