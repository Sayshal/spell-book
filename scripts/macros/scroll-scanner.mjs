/**
 * Scroll scanner macro script - finds all scrolls across compendiums.
 */
function scrollScannerScript() {
  /** Scans all compendiums for scroll items. */
  async function findScrollsInCompendiums() {
    ui.notifications.info('Scanning for scrolls in compendiums...', { permanent: true });

    try {
      const scrolls = [];
      const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

      for (const pack of itemPacks) {
        try {
          const packIndex = await pack.getIndex();
          const consumables = packIndex.filter((item) => item.type === 'consumable');

          for (const consumable of consumables) {
            try {
              const document = await fromUuid(consumable.uuid);
              if (document && document.system?.type?.value === 'scroll') {
                scrolls.push({
                  name: document.name,
                  uuid: consumable.uuid,
                  source: pack.metadata.label || pack.collection,
                  packId: pack.collection
                });
              }
            } catch (error) {
              SPELLBOOK.log(2, `Error loading consumable ${consumable.uuid}:`, error);
            }
          }
        } catch (error) {
          SPELLBOOK.log(2, `Error processing pack ${pack.collection}:`, error);
        }
      }

      scrolls.sort((a, b) => a.name.localeCompare(b.name));
      SPELLBOOK.log(3, `Found ${scrolls.length} scrolls across all compendiums`);

      await showScrollsDialog(scrolls);
    } catch (error) {
      SPELLBOOK.ui.notifications.clear();
      ui.notifications.error(`Error: ${error.message}`);
    }
  }

  /**
   * Shows a dialog with found scrolls.
   * @param {Array<object>} scrolls - Array of scroll objects
   */
  async function showScrollsDialog(scrolls) {
    ui.notifications.clear();

    if (scrolls.length === 0) {
      ui.notifications.info('No scrolls found in any compendiums!');
      return;
    }

    let content = `
      <div class="scroll-scanner">
        <p>Found <strong>${scrolls.length}</strong> scrolls across all compendiums:</p>
        <div>
          <table>
            <thead>
              <tr>
                <th>Scroll Name</th>
                <th>UUID</th>
              </tr>
            </thead>
            <tbody>
    `;

    scrolls.forEach((scroll) => {
      content += `<tr><td>${scroll.name}</td><td>${scroll.uuid}</td></tr>`;
    });

    content += `
            </tbody>
          </table>
        </div>
        <p><em>All scrolls found in compendiums are listed above.</em></p>
      </div>
    `;

    await foundry.applications.api.DialogV2.wait({
      content: content,
      classes: ['dnd5e2'],
      window: {
        icon: 'fas fa-scroll',
        resizable: true,
        minimizable: false,
        positioned: true,
        title: 'Compendium Scroll Scanner'
      },
      position: { height: '600', width: '800' },
      buttons: [
        { icon: 'fas fa-copy', label: 'Copy to Console', action: 'copy' },
        { icon: 'fas fa-times', label: 'Close', action: 'close' }
      ],
      default: 'close',
      rejectClose: false
    }).then((result) => {
      if (result === 'copy') {
        const scrollList = scrolls.map((s) => `${s.name} (${s.uuid}) - ${s.source}`).join('\n');
        console.log(scrollList);
        SPELLBOOK.ui.notifications.info('Scroll list copied to console (F12)');
      }
    });
  }

  findScrollsInCompendiums();
}

export const scrollScanner = {
  flagKey: 'scrollScanner',
  version: '1.0.0',
  name: 'Spell Book - Scroll Scanner',
  img: 'icons/sundries/scrolls/scroll-bound-red.webp',
  type: 'script',
  command: `(${scrollScannerScript.toString()})()`
};
