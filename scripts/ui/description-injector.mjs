/**
 * Spell Description Injection Enhancement System
 *
 * This module provides automatic injection of user notes into spell descriptions
 * on actor items within Foundry VTT. It handles dynamic insertion, removal, and
 * updating of personal notes based on user preferences and spell data changes.
 *
 * @module UIUtils/DescriptionInjector
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataUtils from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as UIUtils from './_module.mjs';

/**
 * Class to handle injecting notes into spell descriptions on actor items.
 */
export class DescriptionInjector {
  /**
   * Set of spell update keys currently being processed to prevent recursion.
   * @type {Set<SpellUpdateKey>}
   * @static
   * @private
   */
  static _updatingSpells = new Set();

  /**
   * Initialize hooks for spell description injection.
   * @returns {void}
   * @static
   */
  static initialize() {
    Hooks.on('updateItem', this.onUpdateItem.bind(this));
    Hooks.on('createItem', this.onCreateItem.bind(this));
  }

  /**
   * Handle setting change for spell description injection mode.
   * @param {Object} newValue - The new injection setting value
   * @returns {Promise<void>}
   * @static
   */
  static async handleSettingChange(newValue) {
    log(3, 'Handling description injection setting change.', { newValue });
    if (newValue === 'off') await this.removeAllNotesFromDescriptions();
    else await this.reapplyAllNotes();
  }

  /**
   * Remove all notes from all actor spell descriptions.
   * @returns {Promise<void>}
   * @static
   */
  static async removeAllNotesFromDescriptions() {
    for (const actor of game.actors) {
      const spellItems = actor.items.filter((item) => item.type === 'spell');
      for (const spell of spellItems) await this.removeNotesFromDescription(spell);
    }
    log(3, 'All notes removed from descriptions.');
  }

  /**
   * Re-apply all notes to all actor spell descriptions.
   * @returns {Promise<void>}
   * @static
   */
  static async reapplyAllNotes() {
    for (const actor of game.actors) {
      const spellItems = actor.items.filter((item) => item.type === 'spell');
      for (const spell of spellItems) await this.updateSpellDescription(spell);
    }
    log(3, 'All notes reapplied to descriptions.');
  }

  /**
   * Handle item creation and inject notes if applicable.
   * @param {Object} item - The created item
   * @param {Object} _options - Creation options (unused)
   * @param {string} _userId - ID of the user who created the item (unused)
   * @returns {Promise<void>}
   * @static
   */
  static async onCreateItem(item, _options, _userId) {
    if (item.type !== 'spell' || !item.parent || item.parent.documentName !== 'Actor') return;
    log(3, 'Item created, updating spell description.', { item: item.name });
    await this.updateSpellDescription(item);
  }

  /**
   * Handle item updates with recursion prevention for spell description changes.
   * @param {Object} item - The updated item
   * @param {Object} changes - The changes made to the item
   * @param {Object} options - Update options, may contain spellBookModuleUpdate flag
   * @param {string} _userId - ID of the user who updated the item (unused)
   * @returns {Promise<void>}
   * @static
   */
  static async onUpdateItem(item, changes, options, _userId) {
    if (item.type !== 'spell' || !item.parent || item.parent.documentName !== 'Actor') return;
    if (options.spellBookModuleUpdate) return;
    const spellKey = `${item.parent.id}-${item.id}`;
    if (this._updatingSpells.has(spellKey)) return;
    if (changes.system?.description) await this.updateSpellDescription(item);
    log(3, 'Item updated, updating spell description.', { item: item.name, hasDescriptionChange: !!changes.system?.description });
  }

  /**
   * Update spell description with notes injection based on current settings.
   * @param {Object} spellItem - The spell item to update
   * @returns {Promise<void>}
   * @static
   */
  static async updateSpellDescription(spellItem) {
    if (!spellItem || spellItem.type !== 'spell') return;
    const canonicalUuid = DataUtils.getCanonicalSpellUuid(spellItem.uuid);
    const actor = spellItem.parent;
    const targetUserId = DataUtils.getTargetUserId(actor);
    const injectionMode = game.settings.get(MODULE.ID, 'injectNotesIntoDescriptions');
    log(3, 'Updating spell description.', { spell: spellItem.name, injectionMode });
    if (injectionMode === 'off') return;
    const userData = await DataUtils.UserData.getUserDataForSpell(canonicalUuid, targetUserId, actor?.id);
    if (!userData?.notes || !userData.notes.trim()) {
      await this.removeNotesFromDescription(spellItem);
      return;
    }
    const spellKey = `${spellItem.actor?.id || 'unknown'}-${canonicalUuid}`;
    if (this._updatingSpells.has(spellKey)) return;
    this._updatingSpells.add(spellKey);
    try {
      const injectionMode = game.settings.get(MODULE.ID, SETTINGS.SPELL_NOTES_DESC_INJECTION);
      if (injectionMode === 'off') return;
      const currentDescription = spellItem.system.description?.value || '';
      const notesHtml = this.formatNotesForDescription(userData.notes);
      if (currentDescription.includes("class='spell-book-personal-notes'")) await this.replaceNotesInDescription(spellItem, notesHtml, injectionMode);
      else await this.addNotesToDescription(spellItem, notesHtml, injectionMode, currentDescription);
    } finally {
      this._updatingSpells.delete(spellKey);
    }
  }

  /**
   * Format notes for HTML injection into spell descriptions.
   * @param {string} notes - The raw notes text to format
   * @returns {string} HTML formatted notes with styling and labels
   * @static
   */
  static formatNotesForDescription(notes) {
    const formattedNotes = dnd5e.utils.formatText(notes);
    const sanitizedNotes = foundry.utils.cleanHTML(formattedNotes);
    const personalNotesLabel = game.i18n.localize('SPELLBOOK.UI.PersonalNotes');
    log(3, 'Formatted notes for description.', { notesLength: notes?.length });
    return `<div class='spell-book-personal-notes'><strong>${personalNotesLabel}:</strong> ${sanitizedNotes}</div>`;
  }

  /**
   * Add notes to spell description based on injection mode.
   * @param {Object} spellItem - The spell item to update
   * @param {string} notesHtml - The formatted HTML notes to inject
   * @param {Object} injectionMode - Where to inject notes ('before' or 'after')
   * @param {string} currentDescription - The current spell description content
   * @returns {Promise<void>}
   * @static
   */
  static async addNotesToDescription(spellItem, notesHtml, injectionMode, currentDescription) {
    let newDescription;
    if (injectionMode === 'before') newDescription = notesHtml + currentDescription;
    else newDescription = currentDescription + notesHtml;
    log(3, 'Adding notes to description.', { spell: spellItem.name, injectionMode });
    await spellItem.update({ 'system.description.value': newDescription }, { ['spellBookModuleUpdate']: true });
  }

  /**
   * Replace existing notes in spell description with updated content.
   * @param {Object} spellItem - The spell item to update
   * @param {string} notesHtml - The new formatted HTML notes
   * @param {Object} injectionMode - Where to place notes ('before' or 'after')
   * @returns {Promise<void>}
   * @static
   */
  static async replaceNotesInDescription(spellItem, notesHtml, injectionMode) {
    const currentDescription = spellItem.system.description?.value || '';
    const notesRegex = /<div class='spell-book-personal-notes'[^>]*>.*?<\/div>/gs;
    let newDescription = currentDescription.replace(notesRegex, '');
    if (injectionMode === 'before') newDescription = notesHtml + newDescription;
    else newDescription = newDescription + notesHtml;
    log(3, 'Replacing notes in description.', { spell: spellItem.name, injectionMode });
    await spellItem.update({ 'system.description.value': newDescription }, { ['spellBookModuleUpdate']: true });
  }

  /**
   * Remove notes from spell description completely.
   * @param {Object} spellItem - The spell item to clean up
   * @returns {Promise<void>}
   * @static
   */
  static async removeNotesFromDescription(spellItem) {
    const currentDescription = spellItem.system.description?.value || '';
    if (!currentDescription.includes("class='spell-book-personal-notes'")) return;
    const notesRegex = /<div class='spell-book-personal-notes'[^>]*>.*?<\/div>/gs;
    const newDescription = currentDescription.replace(notesRegex, '');
    if (newDescription !== currentDescription) {
      log(3, 'Removing notes from description.', { spell: spellItem.name });
      await spellItem.update({ 'system.description.value': newDescription }, { ['spellBookModuleUpdate']: true });
    }
  }

  /**
   * Handle notes changes by updating all matching spell descriptions across actors.
   * @param {string} spellUuid - The UUID of the spell whose notes changed
   * @returns {Promise<void>}
   * @static
   */
  static async handleNotesChange(spellUuid) {
    const canonicalUuid = DataUtils.getCanonicalSpellUuid(spellUuid);
    log(3, 'Handling notes change for spell.', { spellUuid, canonicalUuid });
    for (const actor of game.actors) {
      const matchingSpells = actor.items.filter((item) => {
        if (item.type !== 'spell') return false;
        const itemCanonicalUuid = DataUtils.getCanonicalSpellUuid(item.uuid);
        return itemCanonicalUuid === canonicalUuid;
      });
      for (const spell of matchingSpells) await this.updateSpellDescription(spell);
    }
  }
}
