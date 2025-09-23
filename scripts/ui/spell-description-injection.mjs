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
 * @module UIHelpers/SpellDescriptionInjection
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
 *
 * This static class manages the automatic injection of user notes into spell descriptions
 * based on user preferences. It provides comprehensive handling of note insertion, updates,
 * and removal while preventing infinite update loops and ensuring proper user ownership.
 *
 * The class hooks into Foundry VTT's item update and creation events to automatically
 * maintain note synchronization across all actor spell items. It supports different
 * injection modes and handles bulk operations for setting changes.
 */
export class SpellDescriptionInjection {
  /**
   * Set of spell update keys currently being processed to prevent recursion.
   *
   * @type {Set<SpellUpdateKey>}
   * @static
   * @private
   */
  static _updatingSpells = new Set();

  /**
   * Initialize hooks for spell description injection.
   *
   * Sets up the necessary Foundry VTT hooks to monitor item updates and creations,
   * enabling automatic notes injection when spells are modified or added to actors.
   *
   * @returns {void}
   * @static
   */
  static initialize() {
    Hooks.on('updateItem', this.onUpdateItem.bind(this));
    Hooks.on('createItem', this.onCreateItem.bind(this));
  }

  /**
   * Handle setting change for spell description injection mode.
   *
   * Responds to changes in the notes injection setting by either removing all
   * existing notes (when set to 'off') or reapplying all notes with the new
   * injection mode. This enables users to switch injection modes seamlessly.
   *
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
   *
   * Performs a bulk operation to clean all injected notes from spell descriptions
   * across all actors in the game. Used when the injection mode is set to 'off'
   * or when performing system-wide cleanup operations.
   *
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
   *
   * Performs a bulk operation to update all spell descriptions with current notes
   * using the active injection mode. Used when changing injection modes or when
   * performing system-wide note synchronization.
   *
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
   *
   * Responds to new item creation events by checking if the item is a spell
   * on an actor and automatically injecting any existing notes according to
   * the current injection mode settings.
   *
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
   *
   * Responds to item update events by checking if notes need to be updated in
   * the spell description. Includes comprehensive recursion prevention to avoid
   * infinite update loops when the system modifies descriptions.
   *
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
   *
   * The core method for managing notes injection. Handles user ownership detection,
   * notes retrieval, and appropriate injection based on the current mode. Includes
   * comprehensive error handling and recursion prevention.
   *
   * For GM users, this method attempts to identify the proper spell owner by:
   * 1. Finding the character owner if the actor is a player character
   * 2. Finding ownership-level owners if no character owner exists
   * 3. Falling back to GM data if no owner is found
   *
   * @param {Item5e} spellItem - The spell item to update
   * @returns {Promise<void>}
   * @static
   */
  static async updateSpellDescription(spellItem) {
    if (!spellItem || spellItem.type !== 'spell') return;
    const canonicalUuid = UIHelpers.getCanonicalSpellUuid(spellItem.uuid);
    const actor = spellItem.parent;
    const targetUserId = DataHelpers._getTargetUserId(actor);
    const injectionMode = game.settings.get(MODULE.ID, 'injectNotesIntoDescriptions');
    if (injectionMode === 'off') return;
    const userData = await DataHelpers.SpellUserDataJournal.getUserDataForSpell(canonicalUuid, targetUserId, actor?.id);
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
   *
   * Converts raw note text into properly formatted HTML with styling and
   * localization. Handles line breaks and escaping while maintaining
   * readability and consistent presentation across all spell descriptions.
   *
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
   *
   * Inserts formatted notes into a spell description that doesn't currently
   * contain notes. Respects the injection mode setting to place notes either
   * before or after the existing description content.
   *
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
   *
   * Updates the notes section of a spell description that already contains
   * injected notes. Removes the old notes and inserts the new ones in the
   * appropriate location based on the injection mode.
   *
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
   *
   * Cleans up injected notes from a spell description, restoring it to its
   * original state without any personal notes. Used when notes are deleted
   * or when injection mode is set to 'off'.
   *
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
   *
   * Responds to changes in spell notes by finding all actor items that represent
   * the same spell and updating their descriptions accordingly. This ensures
   * that notes changes are reflected across all instances of a spell in the game.
   *
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
