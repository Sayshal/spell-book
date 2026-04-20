import { SpellBook } from './apps/_module.mjs';
import { MODULE, PACK, SETTINGS } from './constants.mjs';
import { SpellDataManager } from './managers/_module.mjs';
import { DescriptionInjector } from './ui/description-injector.mjs';
import { log } from './utils/logger.mjs';
import { addJournalSpellBookButton, addSpellbookButton, handleRestCompleted, onGroupActorRender, onTidy5eGroupSheetRender, onTidy5eQuadroneRender, onTidy5eRender } from './utils/sheets.mjs';

/** Register all hooks for the Spell Book module. */
export function registerAllHooks() {
  Hooks.on('renderActorSheetV2', addSpellbookButton);
  Hooks.on('renderGroupActorSheet', onGroupActorRender);
  Hooks.on('activateCompendiumDirectory', addJournalSpellBookButton);
  Hooks.on('dnd5e.restCompleted', handleRestCompleted);
  if (game.modules.get('tidy5e-sheet')?.active) {
    Hooks.on('tidy5e-sheet.renderActorSheet', onTidy5eRender);
    Hooks.on('renderTidy5eCharacterSheet', onTidy5eRender);
    Hooks.on('renderTidy5eCharacterSheetQuadrone', onTidy5eQuadroneRender);
    Hooks.on('renderTidy5eGroupSheetQuadrone', onTidy5eGroupSheetRender);
  }
  const isSpellListPage = (page) => page.type === 'spells' && page.parent?.pack === PACK.SPELLS;
  Hooks.on('createJournalEntryPage', (page) => {
    if (isSpellListPage(page)) SpellDataManager.invalidateAllCaches();
  });
  Hooks.on('updateJournalEntryPage', (page, changes) => {
    if (isSpellListPage(page) && (changes.system?.spells || changes.system?.identifier || changes.flags)) SpellDataManager.invalidateAllCaches();
  });
  Hooks.on('deleteJournalEntryPage', (page) => {
    if (isSpellListPage(page)) SpellDataManager.invalidateAllCaches();
  });
  Hooks.on('updateItem', DescriptionInjector.onUpdateItem.bind(DescriptionInjector));
  Hooks.on('createItem', DescriptionInjector.onCreateItem.bind(DescriptionInjector));
  Hooks.once('setup', () => {
    let position = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION);
    if (!position || (typeof position === 'object' && Object.keys(position).length === 0)) position = { height: 850, width: 700, left: 300, top: 100 };
    SpellBook.DEFAULT_OPTIONS.position = position;
  });
  log(3, 'Hooks registered.');
}
