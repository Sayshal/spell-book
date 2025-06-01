function spellBookQuickAccessScript() {
  const selectedToken = canvas.tokens.controlled[0];
  if (!selectedToken) {
    ui.notifications.warn('Please select a token first.');
    return;
  }
  const actor = selectedToken.actor;
  if (!actor) {
    ui.notifications.warn('Selected token has no associated actor.');
    return;
  }
  const hasSpells = actor.items.some((item) => item.type === 'spell');
  if (!hasSpells) {
    ui.notifications.info(`${actor.name} has no spells.`);
    return;
  }
  ui.notifications.info(`Opening spell book for ${actor.name}`);
  SPELLBOOK.openSpellBookForActor(actor);
}
export const spellBookQuickAccess = {
  flagKey: 'spellBookQuickAccess',
  version: '1.0.0',
  name: 'Spell Book - Quick Access',
  img: 'icons/svg/book.svg',
  type: 'script',
  command: `(${spellBookQuickAccessScript.toString()})()`
};
