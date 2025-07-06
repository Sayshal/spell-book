export const spellAnalyticsDashboard = {
  flagKey: 'spellAnalyticsDashboard',
  version: '1.0.0',
  name: 'Open Spell Analytics Dashboard',
  img: 'icons/svg/book.svg',
  command: `
// Open Spell Analytics Dashboard
try {
  const spellBookModule = game.modules.get('spell-book');
  if (!spellBookModule?.active) {
    ui.notifications.warn('Spell Book module is not active');
    return;
  }

  if (!globalThis.SPELLBOOK) {
    ui.notifications.error('Spell Book API not available');
    return;
  }

  const viewMode = game.user.isGM ? 'gm' : 'personal';
  SPELLBOOK.openAnalyticsDashboard({
    viewMode: viewMode,
    userId: game.user.id
  });
} catch (error) {
  console.error('Error opening spell analytics dashboard:', error);
  ui.notifications.error('Failed to open analytics dashboard');
}
`
};
