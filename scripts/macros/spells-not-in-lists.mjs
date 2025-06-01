function spellsNotInListsScript() {
  async function findSpellsNotInLists() {
    ui.notifications.info('Scanning for spells not in spell lists...', { permanent: true });
    try {
      const allSpells = new Set();
      const spellPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');
      for (const pack of spellPacks) {
        const packIndex = await pack.getIndex();
        const spells = packIndex.filter((item) => item.type === 'spell');
        spells.forEach((spell) => allSpells.add(spell.uuid));
      }
      SPELLBOOK.log(3, `Found ${allSpells.size} total spells across all packs`);
      const spellLists = await SPELLBOOK.utils.management.findCompendiumSpellLists();
      const spellsInLists = new Set();
      for (const list of spellLists) {
        try {
          const document = await fromUuid(list.uuid);
          if (!document) continue;
          if (document.system?.spells && document.system.spells instanceof Set) {
            document.system.spells.forEach((spellUuid) => {
              spellsInLists.add(spellUuid);
            });
          }
        } catch (error) {
          SPELLBOOK.log(2, `Error processing spell list ${list.name}:`, error);
        }
      }
      SPELLBOOK.log(3, `Found ${spellsInLists.size} spells in spell lists`);
      const spellsNotInLists = [];
      for (const spellUuid of allSpells) {
        if (!spellsInLists.has(spellUuid)) {
          try {
            const spell = await fromUuid(spellUuid);
            if (spell) {
              spellsNotInLists.push({
                name: spell.name,
                uuid: spellUuid,
                source: spell.pack || 'Unknown'
              });
            }
          } catch (error) {
            SPELLBOOK.log(2, `Error loading spell ${spellUuid}:`, error);
          }
        }
      }
      spellsNotInLists.sort((a, b) => a.name.localeCompare(b.name));
      await showSpellsNotInListsDialog(spellsNotInLists);
    } catch (error) {
      SPELLBOOK.log(1, 'Error finding spells not in lists:', error);
      ui.notifications.clear();
      ui.notifications.error(`Error: ${error.message}`);
    }
  }
  async function showSpellsNotInListsDialog(spells) {
    ui.notifications.clear();
    if (spells.length === 0) {
      ui.notifications.info('All spells are included in spell lists!');
      return;
    }
    let content = `
      <div class="spells-not-in-lists">
        <p>Found <strong>${spells.length}</strong> spells not included in any spell list:</p>
        <div>
          <table>
            <thead>
              <tr>
                <th>Spell Name</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
    `;
    spells.forEach((spell) => {
      content += `<tr><td>${spell.name}</td><td>${spell.source}</td></tr>`;
    });
    content += `
            </tbody>
          </table>
        </div>
        <p><em>Copy this list to identify spells that might need to be added to spell lists.</em></p>
      </div>
    `;
    await foundry.applications.api.DialogV2.wait({
      content: content,
      classes: ['dnd5e2'],
      window: { icon: 'fas fa-search', resizable: true, minimizable: false, positioned: true, title: 'Spells Not In Spell Lists' },
      position: { height: '600', width: '800' },
      buttons: [
        { icon: 'fas fa-copy', label: 'Copy to Console', action: 'copy' },
        { icon: 'fas fa-times', label: 'Close', action: 'close' }
      ],
      default: 'close',
      rejectClose: false
    }).then((result) => {
      if (result === 'copy') {
        const spellNames = spells.map((s) => `${s.name} (${s.uuid})`).join('\n');
        SPELLBOOK.log(3, 'Spells not in lists:\n' + spellNames);
        ui.notifications.info('Spell list copied to console (F12)');
      }
    });
  }
  findSpellsNotInLists();
}
export const spellsNotInLists = {
  flagKey: 'spellsNotInLists',
  version: '1.0.0',
  name: 'Spell Book - Spells Not In Lists',
  img: 'icons/tools/scribal/magnifying-glass.webp',
  type: 'script',
  command: `(${spellsNotInListsScript.toString()})()`
};
