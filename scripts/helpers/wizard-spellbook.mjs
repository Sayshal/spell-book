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

  // Static locks to prevent duplicate creation
  static _folderCreationLock = false;
  static _journalCreationLocks = new Map();

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
    // Get spells from flags
    const flagSpells = this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_SPELLBOOK) || [];

    // Trigger journal synchronization in the background without awaiting it
    this._syncSpellsWithJournal().catch((err) => {
      log(1, `Background journal sync error: ${err.message}`);
    });

    return flagSpells;
  }

  /**
   * Background process to sync journal and flags
   * @private
   */
  async _syncSpellsWithJournal() {
    try {
      // Try to get spells from the journal
      const page = await this.getSpellbookPage();
      if (page && page.system?.spells?.size > 0) {
        const spellsFromJournal = Array.from(page.system.spells);
        log(3, `Found ${spellsFromJournal.length} spells in journal`);

        // Get current flags
        const flagSpells = this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_SPELLBOOK) || [];

        // If journal has spells that aren't in flags, update flags
        if (!this._arraysEqual(spellsFromJournal, flagSpells)) {
          log(3, `Updating flags with ${spellsFromJournal.length} journal spells`);
          await this.actor.setFlag(MODULE.ID, FLAGS.WIZARD_SPELLBOOK, spellsFromJournal);
        }
      } else {
        // If journal doesn't have spells but flags do, update journal
        const flagSpells = this.actor.getFlag(MODULE.ID, FLAGS.WIZARD_SPELLBOOK) || [];
        if (flagSpells.length > 0 && page) {
          log(3, `Updating journal with ${flagSpells.length} flag spells`);
          await page.update({
            'system.spells': new Set(flagSpells)
          });
        }
      }
    } catch (error) {
      log(1, `Error syncing journal/flags: ${error.message}`);
    }
  }

  /**
   * Helper method to compare arrays for equality
   * @param {Array} a - First array
   * @param {Array} b - Second array
   * @returns {boolean} Whether arrays are equal
   * @private
   */
  _arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    for (let i = 0; i < sortedA.length; i++) {
      if (sortedA[i] !== sortedB[i]) return false;
    }
    return true;
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

      // Sync with journal
      await this.syncJournalWithFlags();

      log(3, `Added spell ${spellUuid} to wizard spellbook`);
      return true;
    } catch (error) {
      log(1, `Error adding spell to spellbook: ${error.message}`);
      return false;
    }
  }

  /**
   * Get the spellbook journal page
   * @returns {Promise<JournalEntryPage|null>} The spellbook journal page
   */
  async getSpellbookPage() {
    try {
      const journal = await this.getOrCreateSpellbookJournal();
      if (!journal) return null;

      // Get the spellbook page
      const page = journal.pages.find((p) => p.type === 'spells');
      return page || null;
    } catch (error) {
      log(1, `Error getting spellbook page: ${error.message}`);
      return null;
    }
  }

  /**
   * Synchronize the actor's flags with the journal
   * @returns {Promise<boolean>} Success state
   */
  async syncJournalWithFlags() {
    try {
      // Get current flags
      const spellbookSpells = this.getSpellbookSpells();

      // Get or create the journal
      const page = await this.getSpellbookPage();
      if (!page) {
        log(2, 'Failed to get spellbook page');
        return false;
      }

      // Update the journal with the current spells
      await page.update({
        'system.spells': new Set(spellbookSpells)
      });

      log(3, `Synchronized ${spellbookSpells.length} spells to journal for ${this.actor.name}`);
      return true;
    } catch (error) {
      log(1, `Error syncing journal with flags: ${error.message}`);
      return false;
    }
  }

  /**
   * Find the actor's spellbook journal
   * @returns {Promise<JournalEntry|null>} The actor's spellbook journal or null if not found
   */
  async findSpellbookJournal() {
    try {
      const customPack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);
      if (!customPack) return null;

      // Get all journals
      const journals = await customPack.getDocuments();

      // Find journal with matching actor ID
      return journals.find((j) => j.flags?.[MODULE.ID]?.actorId === this.actor.id);
    } catch (error) {
      log(1, `Error finding spellbook journal: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a new spellbook journal for the actor
   * @returns {Promise<JournalEntry>} The created journal
   */
  async createSpellbookJournal() {
    try {
      const customPack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);
      if (!customPack) {
        throw new Error('Custom spell lists pack not found');
      }

      // Get the folder
      const folder = await this.getSpellbooksFolder();

      // Create journal data
      const journalData = {
        name: this.actor.name,
        folder: folder ? folder.id : null,
        flags: {
          [MODULE.ID]: {
            actorId: this.actor.id,
            isActorSpellbook: true,
            creationDate: Date.now()
          }
        },
        pages: [
          {
            name: `${this.actor.name}'s Spell Book`,
            type: 'spells',
            flags: {
              [MODULE.ID]: {
                isActorSpellbook: true,
                actorId: this.actor.id
              }
            },
            system: {
              identifier: `${this.actor.id}-${MODULE.ID}`,
              description: `Spellbook for ${this.actor.name}`,
              spells: new Set(this.getSpellbookSpells())
            }
          }
        ]
      };

      // Create the journal in the pack
      const journal = await JournalEntry.create(journalData, { pack: customPack.collection });
      log(3, `Created new spellbook journal for ${this.actor.name}: ${journal.uuid}`);
      return journal;
    } catch (error) {
      log(1, `Error creating spellbook journal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create the actor's spellbook journal
   * @returns {Promise<JournalEntry>} The actor's spellbook journal
   */
  async getOrCreateSpellbookJournal() {
    try {
      // Simple semaphore for this actor
      if (this._journalOperation) {
        log(3, 'Journal operation in progress, skipping');
        return null;
      }

      this._journalOperation = true;

      try {
        // Check if the actor already has a spellbook journal
        const existingJournal = await this.findSpellbookJournal();
        if (existingJournal) {
          log(3, `Found existing spellbook journal for ${this.actor.name}`);
          return existingJournal;
        }

        // If not, create a new one
        log(3, `Creating new spellbook journal for ${this.actor.name}`);
        return await this.createSpellbookJournal();
      } finally {
        this._journalOperation = false;
      }
    } catch (error) {
      this._journalOperation = false;
      log(1, `Error getting or creating spellbook journal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the Actor Spellbooks folder from the custom spellbooks pack
   * @returns {Promise<Folder|null>} The folder or null if not found
   */
  async getSpellbooksFolder() {
    try {
      const customPack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);
      if (!customPack) {
        log(2, 'Custom spell lists pack not found');
        return null;
      }

      // Get folder - it should already exist from module initialization
      const folders = await customPack.folders;
      const folder = folders.find((f) => f.name === 'Actor Spellbooks');

      if (folder) {
        return folder;
      }

      log(2, 'Actor Spellbooks folder not found, it should have been created at module initialization');
      return null;
    } catch (error) {
      log(1, 'Error getting Actor Spellbooks folder:', error);
      return null;
    }
  }
}
