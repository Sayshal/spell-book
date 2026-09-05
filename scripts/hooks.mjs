import { SpellBook, SpellListManager } from './apps/_module.mjs';
import { HOOKS, MODULE, PACK, SETTINGS } from './constants.mjs';
import { invalidateTargetUserCache, invalidateUserSpellDataCache } from './data/_module.mjs';
import { initializePeddler, onRenderScrollPurchase, onSpellLearned, onTidy5eGroupSheetRender, onTidy5eQuadroneRender, onTidy5eRender, registerDowntimeNote } from './integrations/_module.mjs';
import { SpellDataManager } from './managers/_module.mjs';
import { onAdvancementComplete, onRenderSpellcastingNotice, onSpellcastingItemCreate } from './managers/spellcasting-notice.mjs';
import { DescriptionInjector } from './ui/_module.mjs';
import { invalidateActorCaches, onActorSheetRender, onCompendiumDirectoryRender, onGroupActorRender, onRestCompleted, onUpdateActor } from './utils/_module.mjs';

/** Register all hooks for the Spell Book module. */
export function registerHooks() {
  Hooks.on('renderActorSheetV2', onActorSheetRender);
  Hooks.on('renderGroupActorSheet', onGroupActorRender);
  Hooks.on('activateCompendiumDirectory', onCompendiumDirectoryRender);
  Hooks.on('dnd5e.restCompleted', onRestCompleted);
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
  Hooks.on('createItem', onSpellcastingItemCreate);
  Hooks.on('updateItem', (item, changes) => {
    if (item.actor && (item.type === 'class' || item.type === 'subclass') && changes.system?.levels !== undefined) invalidateActorCaches(item.actor);
  });
  Hooks.on('createItem', (item) => {
    if (item.actor && item.effects.size) invalidateActorCaches(item.actor);
  });
  Hooks.on('deleteItem', (item) => {
    if (item.actor && (item.type === 'class' || item.type === 'subclass' || item.effects.size)) invalidateActorCaches(item.actor);
  });
  const invalidateFromEffect = (effect) => {
    const actor = effect.parent?.actor ?? effect.parent;
    if (actor?.documentName === 'Actor') invalidateActorCaches(actor);
  };
  Hooks.on('createActiveEffect', invalidateFromEffect);
  Hooks.on('updateActiveEffect', invalidateFromEffect);
  Hooks.on('deleteActiveEffect', invalidateFromEffect);
  Hooks.on('dnd5e.advancementManagerComplete', onAdvancementComplete);
  Hooks.on('renderChatMessageHTML', onRenderSpellcastingNotice);
  Hooks.on('updateActor', onUpdateActor);
  Hooks.on('updateActor', (actor, changes) => {
    if ('ownership' in changes) invalidateTargetUserCache(actor.id);
  });
  Hooks.on('updateUser', (_user, changes) => {
    if ('character' in changes) invalidateTargetUserCache();
  });
  Hooks.on('deleteUser', (user) => {
    invalidateTargetUserCache();
    invalidateUserSpellDataCache(user.id);
  });
  Hooks.on(HOOKS.SPELL_LEARNED, onSpellLearned);
  registerDowntimeNote();
  if (game.modules.get('peddler')?.active) {
    initializePeddler();
    Hooks.on('renderChatMessageHTML', onRenderScrollPurchase);
  }
  Hooks.once('setup', () => {
    SpellBook.DEFAULT_OPTIONS.position = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION) ?? { height: 850, width: 700, left: 300, top: 100 };
    SpellListManager.DEFAULT_OPTIONS.position = game.settings.get(MODULE.ID, SETTINGS.SPELL_LIST_MANAGER_POSITION) ?? { height: 800, width: 1100, left: 200, top: 80 };
  });
  ATLAS.log(3, 'Hooks registered');
}
