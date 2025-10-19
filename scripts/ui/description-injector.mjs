/**
 * Spell Description Injection Enhancement System
 *
 * This module provides automatic injection of user notes into spell descriptions
 * on actor items within Foundry VTT. It handles dynamic insertion, removal, and
 * updating of personal notes based on user preferences and spell data changes.
 *
 * The injection system supports multiple modes:
 * - Off: No notes injection
 * - Before: Notes appear before the spell description
 * - After: Notes appear after the spell description
 *
 * Key features include:
 * - Automatic notes injection on spell creation and updates
 * - Recursion prevention for update loops
 * - User ownership detection for proper notes retrieval
 * - HTML formatting with proper styling and localization
 * - Cross-actor spell synchronization for note changes
 * - Setting-based injection mode switching with bulk operations
 *
 * The system integrates with the spell user data journal to retrieve notes
 * and ensures proper ownership handling for GM-managed actors.
 *
 * @module UIHelpers/DescriptionInjector
 * @author Tyler
 */

import { MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as UIHelpers from './_module.mjs';

/**
 * Notes injection mode configuration options.
 *
 * @typedef {'off'|'before'|'after'} InjectionMode
 * @description Defines where notes should be injected relative to spell descriptions
 * - off: No injection of notes into descriptions
 * - before: Notes appear before the original spell description
 * - after: Notes appear after the original spell description
 */

/**
 * Spell user data structure containing notes and other user-specific information.
 *
 * @typedef {Object} SpellUserData
 * @property {string} [notes] - User's personal notes for the spell
 * @property {boolean} [favorited] - Whether the spell is marked as favorite
 * @property {Object} [customizations] - User-specific spell customizations
 */

/**
 * Spell update tracking key structure for recursion prevention.
 *
 * @typedef {string} SpellUpdateKey
 * @description Formatted as "actorId-spellUuid" to uniquely identify spell update operations
 */

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
   * @param {InjectionMode} newValue - The new injection setting value
   * @returns {Promise<void>}
   * @static
   */
  static async handleSettingChange(newValue) {
    log(3, `Notes injection setting changed to: ${newValue}`);
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
    log(3, 'Removed all notes from spell descriptions');
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
    log(3, 'Re-applied all notes to spell descriptions');
  }

  /**
   * Handle item creation and inject notes if applicable.
   * @param {Item5e} item - The created item
   * @param {Object} _options - Creation options (unused)
   * @param {string} _userId - ID of the user who created the item (unused)
   * @returns {Promise<void>}
   * @static
   */
  static async onCreateItem(item, _options, _userId) {
    if (item.type !== 'spell' || !item.parent || item.parent.documentName !== 'Actor') return;
    await this.updateSpellDescription(item);
  }

  /**
   * Handle item updates with recursion prevention for spell description changes.
   * @param {Item5e} item - The updated item
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
  }

  /**
   * Update spell description with notes injection based on current settings.
   * @param {Item5e} spellItem - The spell item to update
   * @returns {Promise<void>}
   * @static
   */
  static async updateSpellDescription(spellItem) {
    if (!spellItem || spellItem.type !== 'spell') return;
    const canonicalUuid = UIHelpers.getCanonicalSpellUuid(spellItem.uuid);
    const actor = spellItem.parent;
    const targetUserId = DataHelpers.getTargetUserId(actor);
    const injectionMode = game.settings.get(MODULE.ID, 'injectNotesIntoDescriptions');
    if (injectionMode === 'off') return;
    const userData = await DataHelpers.UserData.getUserDataForSpell(canonicalUuid, targetUserId, actor?.id);
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
    const escapedNotes = notes.replace(/\n/g, '<br>');
    const personalNotesLabel = game.i18n.localize('SPELLBOOK.UI.PersonalNotes');
    return `<div class='spell-book-personal-notes'><strong>${personalNotesLabel}:</strong> ${escapedNotes}</div>`;
  }

  /**
   * Add notes to spell description based on injection mode.
   * @param {Item5e} spellItem - The spell item to update
   * @param {string} notesHtml - The formatted HTML notes to inject
   * @param {InjectionMode} injectionMode - Where to inject notes ('before' or 'after')
   * @param {string} currentDescription - The current spell description content
   * @returns {Promise<void>}
   * @static
   */
  static async addNotesToDescription(spellItem, notesHtml, injectionMode, currentDescription) {
    let newDescription;
    if (injectionMode === 'before') newDescription = notesHtml + currentDescription;
    else newDescription = currentDescription + notesHtml;
    await spellItem.update({ 'system.description.value': newDescription }, { ['spellBookModuleUpdate']: true });
    log(3, `Added notes to spell description: ${spellItem.name}`);
  }

  /**
   * Replace existing notes in spell description with updated content.
   * @param {Item5e} spellItem - The spell item to update
   * @param {string} notesHtml - The new formatted HTML notes
   * @param {InjectionMode} injectionMode - Where to place notes ('before' or 'after')
   * @returns {Promise<void>}
   * @static
   */
  static async replaceNotesInDescription(spellItem, notesHtml, injectionMode) {
    const currentDescription = spellItem.system.description?.value || '';
    const notesRegex = /<div class='spell-book-personal-notes'[^>]*>.*?<\/div>/gs;
    let newDescription = currentDescription.replace(notesRegex, '');
    if (injectionMode === 'before') newDescription = notesHtml + newDescription;
    else newDescription = newDescription + notesHtml;
    await spellItem.update({ 'system.description.value': newDescription }, { ['spellBookModuleUpdate']: true });
    log(3, `Updated notes in spell description: ${spellItem.name}`);
  }

  /**
   * Remove notes from spell description completely.
   * @param {Item5e} spellItem - The spell item to clean up
   * @returns {Promise<void>}
   * @static
   */
  static async removeNotesFromDescription(spellItem) {
    const currentDescription = spellItem.system.description?.value || '';
    if (!currentDescription.includes("class='spell-book-personal-notes'")) return;
    const notesRegex = /<div class='spell-book-personal-notes'[^>]*>.*?<\/div>/gs;
    const newDescription = currentDescription.replace(notesRegex, '');
    if (newDescription !== currentDescription) {
      await spellItem.update({ 'system.description.value': newDescription }, { ['spellBookModuleUpdate']: true });
      log(3, `Removed notes from spell description: ${spellItem.name}`);
    }
  }

  /**
   * Handle notes changes by updating all matching spell descriptions across actors.
   * @param {string} spellUuid - The UUID of the spell whose notes changed
   * @returns {Promise<void>}
   * @static
   */
  static async handleNotesChange(spellUuid) {
    const canonicalUuid = UIHelpers.getCanonicalSpellUuid(spellUuid);
    for (const actor of game.actors) {
      const matchingSpells = actor.items.filter((item) => {
        if (item.type !== 'spell') return false;
        const itemCanonicalUuid = UIHelpers.getCanonicalSpellUuid(item.uuid);
        return itemCanonicalUuid === canonicalUuid;
      });
      for (const spell of matchingSpells) await this.updateSpellDescription(spell);
    }
  }
}
