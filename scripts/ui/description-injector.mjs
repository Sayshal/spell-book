import { MODULE, SETTINGS } from '../constants.mjs';
import { getTargetUserId } from '../data/helpers.mjs';
import { loadUserSpellData } from '../data/user-data.mjs';
import { getCanonicalSpellUuid } from '../managers/spell-manager.mjs';
import { log } from '../utils/logger.mjs';

const NOTES_REGEX = /<div class='spell-book-personal-notes'[^>]*>.*?<\/div>/gs;

/**
 * Static class to handle injecting notes into spell descriptions.
 */
export class DescriptionInjector {
  /** @type {Set<string>} Keys of spells currently being updated (recursion guard) */
  static _updatingSpells = new Set();

  /**
   * Build a consistent recursion-guard key for a spell.
   * @param {object} spellItem - The spell item
   * @returns {string} Key string
   * @private
   */
  static _buildKey(spellItem) {
    const actorId = spellItem.parent?.id || spellItem.actor?.id || 'unknown';
    return `${actorId}-${spellItem.id}`;
  }

  /**
   * Handle setting change for injection mode.
   * @param {string} newValue - The new injection setting value
   * @returns {Promise<void>}
   */
  static async handleSettingChange(newValue) {
    log(3, 'Handling description injection setting change.', { newValue });
    if (newValue === 'off') await this.removeAllNotesFromDescriptions();
    else await this.reapplyAllNotes();
  }

  /**
   * Remove notes from all actor spell descriptions.
   * @returns {Promise<void>}
   */
  static async removeAllNotesFromDescriptions() {
    for (const actor of game.actors) for (const spell of actor.itemTypes.spell) await this.removeNotesFromDescription(spell);
    log(3, 'All notes removed from descriptions.');
  }

  /**
   * Re-apply notes to all actor spell descriptions.
   * @returns {Promise<void>}
   */
  static async reapplyAllNotes() {
    for (const actor of game.actors) for (const spell of actor.itemTypes.spell) await this.updateSpellDescription(spell);
    log(3, 'All notes reapplied to descriptions.');
  }

  /**
   * Handle item creation — inject notes if applicable.
   * @param {object} item - The created item
   * @param {object} _options - Creation options
   * @param {string} _userId - ID of the creating user
   * @returns {Promise<void>}
   */
  static async onCreateItem(item, _options, _userId) {
    if (item.type !== 'spell' || !item.parent || item.parent.documentName !== 'Actor') return;
    log(3, 'Item created, updating spell description.', { item: item.name });
    await this.updateSpellDescription(item);
  }

  /**
   * Handle item updates with recursion prevention.
   * @param {object} item - The updated item
   * @param {object} changes - The changes made
   * @param {object} options - Update options
   * @param {string} _userId - ID of the updating user
   * @returns {Promise<void>}
   */
  static async onUpdateItem(item, changes, options, _userId) {
    if (item.type !== 'spell' || !item.parent || item.parent.documentName !== 'Actor') return;
    if (options.spellBookModuleUpdate) return;
    const spellKey = this._buildKey(item);
    if (this._updatingSpells.has(spellKey)) return;
    if (changes.system?.description) await this.updateSpellDescription(item);
    log(3, 'Item updated.', { item: item.name, hasDescriptionChange: !!changes.system?.description });
  }

  /**
   * Update spell description with notes based on current injection setting.
   * @param {object} spellItem - The spell item to update
   * @returns {Promise<void>}
   */
  static async updateSpellDescription(spellItem) {
    if (!spellItem || spellItem.type !== 'spell') return;
    const injectionMode = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_DESC_INJECTION);
    if (injectionMode === 'off') return;
    const actor = spellItem.parent;
    const targetUserId = getTargetUserId(actor);
    const canonicalUuid = getCanonicalSpellUuid(spellItem.uuid);
    log(3, 'Updating spell description.', { spell: spellItem.name, injectionMode });
    const allData = await loadUserSpellData(targetUserId);
    const userData = allData[canonicalUuid];
    if (!userData?.notes?.trim()) {
      await this.removeNotesFromDescription(spellItem);
      return;
    }
    const spellKey = this._buildKey(spellItem);
    if (this._updatingSpells.has(spellKey)) return;
    this._updatingSpells.add(spellKey);
    try {
      const currentDescription = spellItem.system.description?.value || '';
      const notesHtml = this.formatNotesForDescription(userData.notes);
      if (currentDescription.includes("class='spell-book-personal-notes'")) await this.replaceNotesInDescription(spellItem, notesHtml, injectionMode);
      else await this.addNotesToDescription(spellItem, notesHtml, injectionMode, currentDescription);
    } finally {
      this._updatingSpells.delete(spellKey);
    }
  }

  /**
   * Format notes as HTML for injection.
   * @param {string} notes - Raw notes text
   * @returns {string} HTML formatted notes
   */
  static formatNotesForDescription(notes) {
    const formatted = dnd5e.utils.formatText(notes);
    const sanitized = foundry.utils.cleanHTML(formatted);
    const label = _loc('SPELLBOOK.UI.PersonalNotes');
    return `<div class='spell-book-personal-notes'><strong>${label}:</strong> ${sanitized}</div>`;
  }

  /**
   * Add notes to a spell description.
   * @param {object} spellItem - The spell item
   * @param {string} notesHtml - Formatted notes HTML
   * @param {string} injectionMode - 'before' or 'after'
   * @param {string} currentDescription - Current description content
   * @returns {Promise<void>}
   */
  static async addNotesToDescription(spellItem, notesHtml, injectionMode, currentDescription) {
    const newDescription = injectionMode === 'before' ? notesHtml + currentDescription : currentDescription + notesHtml;
    log(3, 'Adding notes to description.', { spell: spellItem.name, injectionMode });
    await spellItem.update({ 'system.description.value': newDescription }, { spellBookModuleUpdate: true });
  }

  /**
   * Replace existing notes in a spell description.
   * @param {object} spellItem - The spell item
   * @param {string} notesHtml - New formatted notes HTML
   * @param {string} injectionMode - 'before' or 'after'
   * @returns {Promise<void>}
   */
  static async replaceNotesInDescription(spellItem, notesHtml, injectionMode) {
    let stripped = (spellItem.system.description?.value || '').replace(NOTES_REGEX, '');
    const newDescription = injectionMode === 'before' ? notesHtml + stripped : stripped + notesHtml;
    log(3, 'Replacing notes in description.', { spell: spellItem.name, injectionMode });
    await spellItem.update({ 'system.description.value': newDescription }, { spellBookModuleUpdate: true });
  }

  /**
   * Remove notes from a spell description.
   * @param {object} spellItem - The spell item
   * @returns {Promise<void>}
   */
  static async removeNotesFromDescription(spellItem) {
    const currentDescription = spellItem.system.description?.value || '';
    if (!currentDescription.includes("class='spell-book-personal-notes'")) return;
    const newDescription = currentDescription.replace(NOTES_REGEX, '');
    if (newDescription !== currentDescription) {
      log(3, 'Removing notes from description.', { spell: spellItem.name });
      await spellItem.update({ 'system.description.value': newDescription }, { spellBookModuleUpdate: true });
    }
  }

  /**
   * Handle notes changes by updating all matching spell descriptions.
   * @param {string} spellUuid - The UUID of the spell whose notes changed
   * @returns {Promise<void>}
   */
  static async handleNotesChange(spellUuid) {
    const canonicalUuid = getCanonicalSpellUuid(spellUuid);
    log(3, 'Handling notes change for spell.', { spellUuid, canonicalUuid });
    for (const actor of game.actors) {
      const matchingSpells = actor.itemTypes.spell.filter((spell) => getCanonicalSpellUuid(spell.uuid) === canonicalUuid);
      for (const spell of matchingSpells) await this.updateSpellDescription(spell);
    }
  }
}
