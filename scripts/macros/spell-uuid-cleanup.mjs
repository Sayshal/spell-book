function spellUuidCleanupScript() {
  async function cleanupInvalidSpellUuids() {
    if (!game.user.isGM) {
      ui.notifications.warn('This macro can only be run by a GM.');
      return;
    }
    const content = `
      <div class="spell-uuid-cleanup-warning">
        <p><strong>⚠️ Important Warning</strong></p>
        <p>If you have packs disabled that you used to create spell lists, those spell lists will be purged as the spell UUIDs won't find the spell item.</p>
        <p><strong>Please enable all modules with spells you use before running this macro.</strong></p>
        <hr>
        <p>This macro will:</p>
        <ul>
          <li>Check all spell UUIDs in your custom spell lists</li>
          <li>Remove any UUIDs that fail to load</li>
          <li>Log all changes to the console</li>
        </ul>
        <p class="warning-text" style="color: #ff6b6b; font-weight: bold;">This action cannot be undone!</p>
      </div>
    `;

    const result = await foundry.applications.api.DialogV2.wait({
      content: content,
      window: { icon: 'fas fa-exclamation-triangle', title: 'Spell UUID Cleanup - Warning' },
      position: { height: 'auto', width: 'auto' },
      buttons: [
        { icon: 'fas fa-broom', label: 'Proceed with Cleanup', action: 'confirm', className: 'dialog-button' },
        { icon: 'fas fa-times', label: 'Cancel', action: 'cancel', className: 'dialog-button' }
      ],
      default: 'cancel',
      rejectClose: false,
      modal: true
    });
    if (result !== 'confirm') return;
    SPELLBOOK.
    const results = { listsProcessed: 0, listsUpdated: 0, totalSpellsChecked: 0, totalSpellsRemoved: 0, errors: [], details: [] };
    const modulePacks = Array.from(game.packs).filter((pack) => pack.metadata.type === 'JournalEntry' && pack.metadata.packageName === 'spell-book');
    SPELLBOOK.log(3, `Found ${modulePacks.length} journal pack(s) to process`);
    for (const pack of modulePacks) {
      SPELLBOOK.log(3, `Processing pack: ${pack.metadata.label} (${pack.metadata.id})`);
      const journals = await pack.getDocuments();
      for (const journal of journals) {
        for (const page of journal.pages) {
          if (page.type !== 'spells' || !page.system?.spells) continue;
          results.listsProcessed++;
          const originalSpells = Array.from(page.system.spells);
          const originalCount = originalSpells.length;
          results.totalSpellsChecked += originalCount;
          if (originalCount === 0) {
            SPELLBOOK.
            continue;
          }
          SPELLBOOK.log(3, `Checking spell list: "${page.name}" (${originalCount} spells)`);
          const validSpells = [];
          const invalidSpells = [];
          for (const uuid of originalSpells) {
            const spell = await fromUuid(uuid);
            if (spell && spell.type === 'spell') validSpells.push(uuid);
            else invalidSpells.push({ uuid, reason: spell ? `Not a spell (type: ${spell.type})` : 'Document not found' });
          }
          if (invalidSpells.length > 0) {
            await page.update({ 'system.spells': validSpells });
            results.listsUpdated++;
            results.totalSpellsRemoved += invalidSpells.length;
            const listDetail = {
              journal: journal.name,
              page: page.name,
              uuid: page.uuid,
              originalCount: originalCount,
              validCount: validSpells.length,
              removedCount: invalidSpells.length,
              removedSpells: invalidSpells
            };
            results.details.push(listDetail);
            SPELLBOOK.
            for (const invalid of invalidSpells) SPELLBOOK.log(3, `  Removed: ${invalid.uuid} (${invalid.reason})`);
          } else SPELLBOOK.
        }
      }
    }
    SPELLBOOK.log(3, '='.repeat(60));
    SPELLBOOK.
    SPELLBOOK.log(3, '='.repeat(60));
    SPELLBOOK.
    SPELLBOOK.
    SPELLBOOK.
    SPELLBOOK.
    SPELLBOOK.
    if (results.details.length > 0) {
      SPELLBOOK.
      for (const detail of results.details) {
        SPELLBOOK.log(3, `\n"${detail.page}" (${detail.journal})`);
        SPELLBOOK.
        SPELLBOOK.
        SPELLBOOK.
        SPELLBOOK.
      }
    }
    if (results.errors.length > 0) {
      SPELLBOOK.
      for (const error of results.errors) SPELLBOOK.
    }
    if (results.totalSpellsRemoved > 0) {
      ui.notifications.info(`Cleanup complete: Removed ${results.totalSpellsRemoved} invalid spells from ${results.listsUpdated} spell list(s). Check console for details.`);
    } else {
      ui.notifications.info(`Cleanup complete: No invalid spells found in ${results.listsProcessed} spell list(s).`);
    }
  }
  cleanupInvalidSpellUuids();
}

export const spellUuidCleanup = {
  flagKey: 'spellUuidCleanup',
  version: '1.0.0',
  name: 'Spell Book - UUID Cleanup',
  img: 'icons/tools/laboratory/alembic-glass-ball-blue.webp',
  type: 'script',
  command: `(${spellUuidCleanupScript.toString()})()`
};
