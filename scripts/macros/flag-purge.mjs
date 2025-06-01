function flagPurgeScript() {
  const MODULE_ID = 'spell-book';
  async function showFlagPurgeDialog() {
    const eligibleActors = game.actors
      .filter((actor) => {
        if (!actor.hasPlayerOwner) return false;
        const spellcastingClasses = actor.items.filter((item) => item.type === 'class' && item.system.spellcasting?.progression !== 'none');
        return spellcastingClasses.length > 0;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    if (eligibleActors.length === 0) {
      ui.notifications.warn('No eligible actors found with player ownership and spellcasting classes.');
      return;
    }
    let actorOptions = '<option value="all">All Eligible Actors</option>';
    eligibleActors.forEach((actor) => {
      actorOptions += `<option value="${actor.id}">${actor.name}</option>`;
    });
    const content = `
      <div class="flag-purge-dialog">
        <p><strong>Warning:</strong> This will permanently delete all Spell Book module flags and items from the selected actor(s).</p>
        <div class="form-group">
          <label for="actor-select">Select Actor:</label>
          <select id="actor-select" name="actorId">${actorOptions}</select>
        </div>
        <p class="warning-text" style="color: #ff6b6b; font-weight: bold;">This action cannot be undone!</p>
      </div>
    `;
    const result = await foundry.applications.api.DialogV2.wait({
      content: content,
      classes: ['dnd5e2'],
      window: { icon: 'fas fa-trash', resizable: false, minimizable: false, positioned: true, title: 'Spell Book - Flag Purge' },
      position: { height: 'auto', width: 'auto' },
      buttons: [
        { icon: 'fas fa-trash', label: 'Purge Flags', action: 'confirm', className: 'dialog-button' },
        { icon: 'fas fa-times', label: 'Cancel', action: 'cancel', className: 'dialog-button' }
      ],
      default: 'cancel',
      rejectClose: false
    });
    if (result !== 'confirm') return;
    const form = document.querySelector('.flag-purge-dialog');
    const selectedActorId = form.querySelector('#actor-select').value;
    let actorsToPurge = [];
    if (selectedActorId === 'all') {
      actorsToPurge = eligibleActors;
    } else {
      const selectedActor = game.actors.get(selectedActorId);
      if (selectedActor) actorsToPurge = [selectedActor];
    }
    let purgedCount = 0;
    for (const actor of actorsToPurge) {
      try {
        const flags = actor.flags[MODULE_ID];
        if (flags) {
          const flagKeys = Object.keys(flags);
          for (const flagKey of flagKeys) {
            await actor.unsetFlag(MODULE_ID, flagKey);
          }
        }
        const itemIds = actor.items.map((item) => item.id);
        if (itemIds.length > 0) await actor.deleteEmbeddedDocuments('Item', itemIds);
        purgedCount++;
        SPELLBOOK.log(3, `Purged flags and items for actor: ${actor.name}`);
      } catch (error) {
        SPELLBOOK.log(1, `Error purging actor ${actor.name}:`, error);
      }
    }
    ui.notifications.info(`Successfully purged ${purgedCount} actor(s).`);
  }
  showFlagPurgeDialog();
}
export const flagPurge = {
  flagKey: 'flagPurge',
  version: '1.0.0',
  name: 'Spell Book - Flag Purge',
  img: 'icons/svg/biohazard.svg',
  type: 'script',
  command: `(${flagPurgeScript.toString()})()`
};
