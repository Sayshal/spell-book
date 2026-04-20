import { MODULE, TEMPLATES } from '../constants.mjs';

/**
 * Post the release announcement chat message once per version per user.
 * Whispers to self only — won't spam other players or GMs.
 */
export async function checkReleaseMessage() {
  const version = game.modules.get(MODULE.ID)?.version;
  if (!version) return;
  const lastSeen = game.user.getFlag(MODULE.ID, 'lastSeenVersion');
  if (lastSeen === version) return;
  const repoUrl = `https://github.com/Sayshal/spell-book/releases/tag/release-${version}`;
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATES.CHAT.RELEASE_MESSAGE, { version, repoUrl });
  await ChatMessage.create({ content, whisper: [game.user.id], speaker: { alias: MODULE.NAME } });
  await game.user.setFlag(MODULE.ID, 'lastSeenVersion', version);
}
