function spellsNotInListsScript() {
  // Spells Not In Lists macro for Spell Book module

  async function findSpellsNotInLists() {
    ui.notifications.info('Scanning for spells not in spell lists...');

    try {
      // Get all spells from all packs
      const allSpells = new Set();
      const spellPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

      for (const pack of spellPacks) {
        const packIndex = await pack.getIndex();
        const spells = packIndex.filter((item) => item.type === 'spell');
        spells.forEach((spell) => allSpells.add(spell.uuid));
      }

      console.log(`Found ${allSpells.size} total spells across all packs`);

      // Get all spells from spell lists using the global API
      if (!SPELLBOOK?.utils?.management?.findCompendiumSpellLists) {
        ui.notifications.error('Spell Book API not available. Make sure the module is properly loaded.');
        return;
      }

      const spellLists = await SPELLBOOK.utils.management.findCompendiumSpellLists();
      const spellsInLists = new Set();

      // Extract spells from all spell lists
      for (const list of spellLists) {
        try {
          const document = await fromUuid(list.uuid);
          if (!document) continue;

          // Check if the document has system.spells as a Set of UUIDs
          if (document.system?.spells && document.system.spells instanceof Set) {
            document.system.spells.forEach((spellUuid) => {
              spellsInLists.add(spellUuid);
            });
          }
        } catch (error) {
          console.warn(`Error processing spell list ${list.name}:`, error);
        }
      }

      console.log(`Found ${spellsInLists.size} spells in spell lists`);

      // Find spells not in any list
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
            console.warn(`Error loading spell ${spellUuid}:`, error);
          }
        }
      }

      // Sort by name
      spellsNotInLists.sort((a, b) => a.name.localeCompare(b.name));

      // Display results
      await showSpellsNotInListsDialog(spellsNotInLists);
    } catch (error) {
      console.error('Error finding spells not in lists:', error);
      ui.notifications.error(`Error: ${error.message}`);
    }
  }

  async function showSpellsNotInListsDialog(spells) {
    if (spells.length === 0) {
      ui.notifications.info('All spells are included in spell lists!');
      return;
    }

    // Build the content
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
      content += `
        <tr>
          <td>${spell.name}</td>
          <td>${spell.source}</td>
        </tr>
      `;
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
      window: {
        icon: 'fas fa-search',
        resizable: true,
        minimizable: false,
        positioned: true,
        title: 'Spells Not In Spell Lists'
      },
      position: { height: '600', width: '800' },
      buttons: [
        {
          icon: 'fas fa-copy',
          label: 'Copy to Console',
          action: 'copy'
        },
        {
          icon: 'fas fa-times',
          label: 'Close',
          action: 'close'
        }
      ],
      default: 'close',
      rejectClose: false
    }).then((result) => {
      if (result === 'copy') {
        const spellNames = spells.map((s) => `${s.name} (${s.uuid})`).join('\n');
        console.log('Spells not in lists:\n' + spellNames);
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
