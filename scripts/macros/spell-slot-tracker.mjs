function spellSlotTrackerScript() {
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
  const spellcasting = actor.system.spells;
  if (!spellcasting) {
    ui.notifications.info(`${actor.name} has no spellcasting ability.`);
    return;
  }
  let message = `<h3>${actor.name} - Spell Slots</h3><table><tr><th>Level</th><th>Used</th><th>Max</th></tr>`;
  for (let i = 1; i <= 9; i++) {
    const slot = spellcasting[`spell${i}`];
    if (slot && slot.max > 0) {
      message += `<tr><td>${i}</td><td>${slot.value}</td><td>${slot.max}</td></tr>`;
    }
  }
  message += `</table>`;
  ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: message
  });
}
export const spellSlotTracker = {
  flagKey: 'spellSlotTracker',
  version: '1.0.0',
  name: 'Spell Book - Slot Tracker',
  img: 'icons/svg/circle.svg',
  type: 'script',
  command: `(${spellSlotTrackerScript.toString()})()`
};
