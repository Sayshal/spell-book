import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as spellFavorites from './spell-favorites.mjs';
import * as spellUserData from './spell-user-data.mjs';

/**
 * Class to handle injecting notes into spell descriptions on actor items
 */
export class SpellDescriptionInjection {
  static NOTES_WRAPPER_CLASS = 'spell-book-personal-notes';

  /**
   * Initialize hooks for spell description injection
   */
  static initialize() {
    Hooks.on('updateItem', this.onUpdateItem.bind(this));
    Hooks.on('createItem', this.onCreateItem.bind(this));
  }

  /**
   * Handle setting change
   */
  static async handleSettingChange(newValue) {
    log(3, `Notes injection setting changed to: ${newValue}`);
    if (newValue === 'off') await this.removeAllNotesFromDescriptions();
    else await this.reapplyAllNotes();
  }

  /**
   * Remove all notes from all actor spell descriptions
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
   */
  static async reapplyAllNotes() {
    for (const actor of game.actors) {
      const spellItems = actor.items.filter((item) => item.type === 'spell');
      for (const spell of spellItems) await this.updateSpellDescription(spell);
    }
    log(3, 'Re-applied all notes to spell descriptions');
  }

  /**
   * Handle item creation
   */
  static async onCreateItem(item, options, userId) {
    if (item.type !== 'spell' || !item.parent || item.parent.documentName !== 'Actor') return;
    await this.updateSpellDescription(item);
  }

  /**
   * Handle item updates
   */
  static async onUpdateItem(item, changes, options, userId) {
    if (item.type !== 'spell' || !item.parent || item.parent.documentName !== 'Actor') return;
    if (changes.system?.description) await this.updateSpellDescription(item);
  }

  /**
   * Update spell description with notes injection
   */
  static async updateSpellDescription(spellItem) {
    const injectionMode = game.settings.get(MODULE.ID, 'injectNotesIntoDescriptions');
    if (injectionMode === 'off') return;
    const canonicalUuid = spellFavorites.getCanonicalSpellUuid(spellItem.uuid);
    const userData = await spellUserData.getUserDataForSpell(canonicalUuid);
    if (!userData?.notes || !userData.notes.trim()) {
      await this.removeNotesFromDescription(spellItem);
      return;
    }
    const currentDescription = spellItem.system.description?.value || '';
    const notesHtml = this.formatNotesForDescription(userData.notes);
    if (currentDescription.includes(`class="${this.NOTES_WRAPPER_CLASS}"`)) await this.replaceNotesInDescription(spellItem, notesHtml, injectionMode);
    else await this.addNotesToDescription(spellItem, notesHtml, injectionMode, currentDescription);
  }

  /**
   * Format notes for HTML injection
   */
  static formatNotesForDescription(notes) {
    const escapedNotes = notes.replace(/\n/g, '<br>');
    const personalNotesLabel = game.i18n.localize('SPELLBOOK.UI.PersonalNotes');
    return `<div class="${this.NOTES_WRAPPER_CLASS}"><strong>${personalNotesLabel}:</strong>${escapedNotes}</div>`;
  }

  /**
   * Add notes to description
   */
  static async addNotesToDescription(spellItem, notesHtml, injectionMode, currentDescription) {
    let newDescription;
    if (injectionMode === 'before') newDescription = notesHtml + currentDescription;
    else newDescription = currentDescription + notesHtml;
    await spellItem.update({ 'system.description.value': newDescription });
    log(3, `Added notes to spell description: ${spellItem.name}`);
  }

  /**
   * Replace existing notes in description
   */
  static async replaceNotesInDescription(spellItem, notesHtml, injectionMode) {
    const currentDescription = spellItem.system.description?.value || '';
    const notesRegex = new RegExp(`<div class="${this.NOTES_WRAPPER_CLASS}"[^>]*>.*?</div>`, 'gs');
    let newDescription = currentDescription.replace(notesRegex, '');
    if (injectionMode === 'before') newDescription = notesHtml + newDescription;
    else newDescription = newDescription + notesHtml;
    await spellItem.update({ 'system.description.value': newDescription });
    log(3, `Updated notes in spell description: ${spellItem.name}`);
  }

  /**
   * Remove notes from description
   */
  static async removeNotesFromDescription(spellItem) {
    const currentDescription = spellItem.system.description?.value || '';
    if (!currentDescription.includes(`class="${this.NOTES_WRAPPER_CLASS}"`)) return;
    const notesRegex = new RegExp(`<div class="${this.NOTES_WRAPPER_CLASS}"[^>]*>.*?</div>`, 'gs');
    const newDescription = currentDescription.replace(notesRegex, '');
    await spellItem.update({ 'system.description.value': newDescription });
    log(3, `Removed notes from spell description: ${spellItem.name}`);
  }

  /**
   * Handle notes changes - call this when notes are updated
   */
  static async handleNotesChange(spellUuid) {
    const canonicalUuid = spellFavorites.getCanonicalSpellUuid(spellUuid);
    for (const actor of game.actors) {
      const matchingSpells = actor.items.filter((item) => {
        if (item.type !== 'spell') return false;
        const itemCanonicalUuid = spellFavorites.getCanonicalSpellUuid(item.uuid);
        return itemCanonicalUuid === canonicalUuid;
      });
      for (const spell of matchingSpells) await this.updateSpellDescription(spell);
    }
  }
}
