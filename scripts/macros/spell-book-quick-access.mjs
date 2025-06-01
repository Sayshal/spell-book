export const spellBookQuickAccess = {
  flagKey: 'spellBookQuickAccess',
  version: '1.0.0',
  name: 'Spell Book - Quick Access',
  img: 'icons/svg/book.svg',
  type: 'script',
  command: `
// Quick access macro for Spell Book module
const selectedToken = canvas.tokens.controlled[0];
if (!selectedToken) {
  ui.notifications.warn("Please select a token first.");
  return;
}

const actor = selectedToken.actor;
if (!actor) {
  ui.notifications.warn("Selected token has no associated actor.");
  return;
}

// Check if actor has spellcasting
const hasSpells = actor.items.some(item => item.type === "spell");
if (!hasSpells) {
  ui.notifications.info(\`\${actor.name} has no spells.\`);
  return;
}

ui.notifications.info(\`Opening spell book for \${actor.name}\`);
// This would integrate with your existing spell book opening logic
console.log("Spell Book Quick Access executed for:", actor.name);

// Example: If you have an API to open the spell book
// game.modules.get('spell-book')?.api?.openSpellBook?.(actor);
  `
};
