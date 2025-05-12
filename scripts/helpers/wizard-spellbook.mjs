import { FLAGS, MODULE, WIZARD_RULES, WIZARD_SPELL_SOURCE } from '../constants.mjs';
import { log } from '../logger.mjs';

/**
 * Manages wizard-specific spellbook functionality
 */
export class WizardSpellbookManager {
  /**
   * Create a new WizardSpellbookManager for an actor
   * @param {Actor5e} actor - The actor to manage wizard spellbook for
   */
  constructor(actor) {
    this.actor = actor;
    log(3, `Creating WizardSpellbookManager for ${actor.name}`);
    this.classItem = this._findWizardClass();
    this.isWizard = this.classItem !== null;

    if (this.isWizard) {
      log(3, `${actor.name} is a wizard`);
      this._initializeFlags();
    }
  }

  /**
   * Find the actor's wizard class
   * @returns {Item5e|null} - The wizard class item or null
   * @private
   */
  _findWizardClass() {
    const wizardClass = this.actor.items.find((i) => i.type === 'class' && i.name.toLowerCase() === 'wizard');

    return wizardClass || null;
  }

  /**
   * Get the rules version for this wizard
   * @returns {string} The rules version ('modern' or 'legacy')
   */
  getRulesVersion() {
    return this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_RULES_VERSION) || game.settings.get('dnd5e', 'rulesVersion') === 'modern' ? WIZARD_RULES.MODERN : WIZARD_RULES.LEGACY;
  }

  /**
   * Initialize wizard flags on the actor
   * @returns {Promise<Object>} Update data applied, if any
   * @private
   */
  async _initializeFlags() {
    try {
      const updateData = {};
      const flags = this.actor.flags?.[MODULE.ID] || {};

      // Initialize wizard-specific flags if they don't exist
      if (!flags[FLAGS.WIZARD_SPELLBOOK]) {
        updateData[`flags.${MODULE.ID}.${FLAGS.WIZARD_SPELLBOOK}`] = [];
      }

      if (!flags[FLAGS.WIZARD_LEARNED_SPELLS]) {
        updateData[`flags.${MODULE.ID}.${FLAGS.WIZARD_LEARNED_SPELLS}`] = {};
      }

      if (!flags[FLAGS.WIZARD_COPIED_SPELLS]) {
        updateData[`flags.${MODULE.ID}.${FLAGS.WIZARD_COPIED_SPELLS}`] = [];
      }

      if (!flags[FLAGS.WIZARD_RULES_VERSION]) {
        updateData[`flags.${MODULE.ID}.${FLAGS.WIZARD_RULES_VERSION}`] = game.settings.get('dnd5e', 'rulesVersion') === 'modern' ? WIZARD_RULES.MODERN : WIZARD_RULES.LEGACY;
      }

      // Apply updates if needed
      if (Object.keys(updateData).length > 0) {
        log(3, 'Initializing wizard flags', updateData);
        await this.actor.update(updateData);
      }

      return updateData;
    } catch (error) {
      log(1, 'Error initializing wizard flags:', error);
      return {};
    }
  }

  /**
   * Get all spells in the wizard's spellbook
   * @returns {Array<string>} Array of spell UUIDs
   */
  getSpellbookSpells() {
    return this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_SPELLBOOK) || [];
  }

  /**
   * Add a spell to the wizard's spellbook
   * @param {string} spellUuid - UUID of the spell to add
   * @param {string} source - Source of the spell (levelUp, copied, initial)
   * @param {Object} metadata - Additional metadata for the spell
   * @returns {Promise<boolean>} Success state
   */
  async addSpellToSpellbook(spellUuid, source, metadata = {}) {
    try {
      // Get current spellbook
      const spellbook = this.getSpellbookSpells();

      // Check if spell is already in spellbook
      if (spellbook.includes(spellUuid)) {
        log(3, `Spell ${spellUuid} already in spellbook`);
        return false;
      }

      // Add spell to spellbook
      const updatedSpellbook = [...spellbook, spellUuid];

      // Add to learned spells with source
      const learnedSpells = this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_LEARNED_SPELLS) || {};
      learnedSpells[spellUuid] = {
        source: source || WIZARD_SPELL_SOURCE.COPIED,
        dateAdded: Date.now(),
        ...metadata
      };

      // If this is a copied spell, add detailed metadata
      if (source === WIZARD_SPELL_SOURCE.COPIED && metadata.cost && metadata.timeSpent) {
        const copiedSpells = this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_COPIED_SPELLS) || [];
        copiedSpells.push({
          spellUuid,
          dateCopied: Date.now(),
          cost: metadata.cost,
          timeSpent: metadata.timeSpent
        });

        await this.actor.setFlag(MODULE.ID, FLAGS.WIZARD_COPIED_SPELLS, copiedSpells);
      }

      // Update flags
      await this.actor.setFlag(MODULE.ID, FLAGS.WIZARD_SPELLBOOK, updatedSpellbook);
      await this.actor.setFlag(MODULE.ID, FLAGS.WIZARD_LEARNED_SPELLS, learnedSpells);

      log(3, `Added spell ${spellUuid} to wizard spellbook`);
      return true;
    } catch (error) {
      log(1, `Error adding spell to spellbook: ${error.message}`);
      return false;
    }
  }

  /**
   * Copy a spell to the wizard's spellbook with associated cost and time
   * @param {string} spellUuid - UUID of the spell to copy
   * @param {number} cost - Cost in gold to copy the spell
   * @param {number} time - Time in hours to copy the spell
   * @returns {Promise<boolean>} Success state
   */
  async copySpell(spellUuid, cost, time) {
    return this.addSpellToSpellbook(spellUuid, WIZARD_SPELL_SOURCE.COPIED, {
      cost,
      timeSpent: time
    });
  }

  /**
   * Check if a spell can be prepared by the wizard
   * @param {string} spellUuid - UUID of the spell
   * @returns {boolean} Whether the spell can be prepared
   */
  canPrepareSpell(spellUuid) {
    // Wizard can only prepare spells in their spellbook
    const spellbook = this.getSpellbookSpells();
    return spellbook.includes(spellUuid);
  }

  /**
   * Get all ritual spells that can be cast from the spellbook
   * @returns {Promise<Array<Item5e>>} Array of ritual spell items
   */
  async getRitualSpells() {
    try {
      const spellbook = this.getSpellbookSpells();
      const ritualSpells = [];

      for (const uuid of spellbook) {
        try {
          const spell = await fromUuid(uuid);
          if (spell && spell.system.components?.ritual) {
            ritualSpells.push(spell);
          }
        } catch (error) {
          log(1, `Error loading ritual spell ${uuid}: ${error.message}`);
        }
      }

      return ritualSpells;
    } catch (error) {
      log(1, `Error getting ritual spells: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate cost to copy a spell
   * @param {Item5e} spell - The spell to copy
   * @returns {number} Cost in gold pieces
   */
  getCopyingCost(spell) {
    const level = spell.system.level || 0;
    // 50 gp per spell level
    return level === 0 ? 0 : level * 50;
  }

  /**
   * Calculate time to copy a spell
   * @param {Item5e} spell - The spell to copy
   * @returns {number} Time in hours
   */
  getCopyingTime(spell) {
    const level = spell.system.level || 0;
    // 2 hours per spell level
    return level === 0 ? 1 : level * 2;
  }
}
