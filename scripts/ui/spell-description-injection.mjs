import { MODULE, SETTINGS } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';
import * as UIHelpers from './_module.mjs';

/**
 * Class to handle injecting notes into spell descriptions on actor items
 */
export class SpellDescriptionInjection {
  static _updatingSpells = new Set();

  /**
   * Initialize hooks for spell description injection
   * @returns {void}
   */
  static initialize() {
    Hooks.on('updateItem', this.onUpdateItem.bind(this));
    Hooks.on('createItem', this.onCreateItem.bind(this));
  }

  /**
   * Handle setting change for spell description injection mode
   * @param {string} newValue The new injection setting value ('off', 'before', 'after')
   * @returns {Promise<void>}
   */
  static async handleSettingChange(newValue) {
    log(3, `Notes injection setting changed to: ${newValue}`);
    if (newValue === 'off') await this.removeAllNotesFromDescriptions();
    else await this.reapplyAllNotes();
  }

  /**
   * Remove all notes from all actor spell descriptions
   * @returns {Promise<void>}
   */
  static async removeAllNotesFromDescriptions() {
    for (const actor of game.actors) {
      const spellItems = actor.items.filter((item) => item.type === 'spell');
      for (const spell of spellItems) await this.removeNotesFromDescription(spell);
    }
    log(3, 'Removed all notes from spell descriptions');
  }

  /**
   * Re-apply all notes to all actor spell descriptions
   * @returns {Promise<void>}
   */
  static async reapplyAllNotes() {
    for (const actor of game.actors) {
      const spellItems = actor.items.filter((item) => item.type === 'spell');
      for (const spell of spellItems) await this.updateSpellDescription(spell);
    }
    log(3, 'Re-applied all notes to spell descriptions');
  }

  /**
   * Handle item creation and inject notes if applicable
   * @param {Item5e} item The created item
   * @param {Object} options Creation options
   * @param {string} userId ID of the user who created the item
   * @returns {Promise<void>}
   */
  static async onCreateItem(item, options, userId) {
    if (item.type !== 'spell' || !item.parent || item.parent.documentName !== 'Actor') return;
    await this.updateSpellDescription(item);
  }

  /**
   * Handle item updates with recursion prevention for spell description changes
   * @param {Item5e} item The updated item
   * @param {Object} changes The changes made to the item
   * @param {Object} options Update options
   * @param {string} userId ID of the user who updated the item
   * @returns {Promise<void>}
   */
  static async onUpdateItem(item, changes, options, userId) {
    if (item.type !== 'spell' || !item.parent || item.parent.documentName !== 'Actor') return;
    if (options.spellBookModuleUpdate) return;
    const spellKey = `${item.parent.id}-${item.id}`;
    if (this._updatingSpells.has(spellKey)) return;
    if (changes.system?.description) await this.updateSpellDescription(item);
  }

  /**
   * Update spell description with notes injection based on current settings
   * @param {Item5e} spellItem The spell item to update
   * @returns {Promise<void>}
   */
  static async updateSpellDescription(spellItem) {
    if (!spellItem || spellItem.type !== 'spell') return;
    const canonicalUuid = UIHelpers.getCanonicalSpellUuid(spellItem.uuid);
    let targetUserId = game.user.id;
    const actor = spellItem.parent;
    if (actor && game.user.isActiveGM) {
      log(3, `GM updating spell description, finding owner for actor: ${actor.name}`);
      const characterOwner = game.users.find((user) => user.character?.id === actor.id);
      if (characterOwner) {
        targetUserId = characterOwner.id;
        log(3, `Using character owner for description: ${characterOwner.name} (${characterOwner.id})`);
      } else {
        log(3, 'No character owner found, checking ownership levels...');
        const ownershipOwner = game.users.find((user) => actor.ownership[user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
        if (ownershipOwner) {
          targetUserId = ownershipOwner.id;
          log(3, `Using ownership owner for description: ${ownershipOwner.name} (${ownershipOwner.id})`);
        } else {
          log(3, `No owner found for actor ${actor.name}, using GM data for description`);
        }
      }
    }
    const injectionMode = game.settings.get(MODULE.ID, 'injectNotesIntoDescriptions');
    if (injectionMode === 'off') return;
    const userData = await DataHelpers.SpellUserDataJournal.getUserDataForSpell(canonicalUuid, targetUserId, actor?.id);
    if (!userData?.notes || !userData.notes.trim()) await this.removeNotesFromDescription(spellItem);
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
   * Format notes for HTML injection into spell descriptions
   * @param {string} notes The raw notes text to format
   * @returns {string} HTML formatted notes with styling and labels
   */
  static formatNotesForDescription(notes) {
    const escapedNotes = notes.replace(/\n/g, '<br>');
    const personalNotesLabel = game.i18n.localize('SPELLBOOK.UI.PersonalNotes');
    return `<div class='spell-book-personal-notes'><strong>${personalNotesLabel}:</strong> ${escapedNotes}</div>`;
  }

  /**
   * Add notes to spell description based on injection mode
   * @param {Item5e} spellItem The spell item to update
   * @param {string} notesHtml The formatted HTML notes to inject
   * @param {string} injectionMode Where to inject notes ('before' or 'after')
   * @param {string} currentDescription The current spell description content
   * @returns {Promise<void>}
   */
  static async addNotesToDescription(spellItem, notesHtml, injectionMode, currentDescription) {
    let newDescription;
    if (injectionMode === 'before') newDescription = notesHtml + currentDescription;
    else newDescription = currentDescription + notesHtml;
    await spellItem.update({ 'system.description.value': newDescription }, { ['spellBookModuleUpdate']: true });
    log(3, `Added notes to spell description: ${spellItem.name}`);
  }

  /**
   * Replace existing notes in spell description with updated content
   * @param {Item5e} spellItem The spell item to update
   * @param {string} notesHtml The new formatted HTML notes
   * @param {string} injectionMode Where to place notes ('before' or 'after')
   * @returns {Promise<void>}
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
   * Remove notes from spell description completely
   * @param {Item5e} spellItem The spell item to clean up
   * @returns {Promise<void>}
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
   * Handle notes changes by updating all matching spell descriptions across actors
   * @param {string} spellUuid The UUID of the spell whose notes changed
   * @returns {Promise<void>}
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
