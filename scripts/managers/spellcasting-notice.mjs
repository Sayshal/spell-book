import { SpellBook } from '../apps/_module.mjs';
import { FLAGS, MODULE, TEMPLATES } from '../constants.mjs';
import { getClassSpellList } from '../data/spell-list-resolver.mjs';
import { ClassRules } from '../dialogs/_module.mjs';
import { ClassManager } from './class-manager.mjs';

const { renderTemplate } = foundry.applications.handlebars;

/** @type {WeakMap<object, Function>} Per-actor debounced check to coalesce createItem + advancement triggers. */
const _debouncers = new WeakMap();

/**
 * Debounce a spellcasting-list check for an actor so multiple triggers from one operation fire once.
 * @param {object} actor - The actor document
 */
function scheduleCheck(actor) {
  if (game.user !== game.users.activeGM) return;
  let debounced = _debouncers.get(actor);
  if (!debounced) {
    debounced = foundry.utils.debounce(() => checkSpellcastingLists(actor), 500);
    _debouncers.set(actor, debounced);
  }
  debounced();
}

/**
 * Whisper the GM and actor owners when a spellcasting class resolves to no spell list.
 * @param {object} actor - The actor document
 */
async function checkSpellcastingLists(actor) {
  ClassManager.invalidateCache(actor);
  const classes = ClassManager.detectSpellcastingClasses(actor);
  const missing = [];
  for (const [identifier, data] of Object.entries(classes)) {
    const list = await getClassSpellList(identifier, actor);
    if (!list?.size) missing.push({ identifier, name: data.name || identifier });
  }
  const notified = new Set(actor.getFlag(MODULE.ID, FLAGS.SPELLCASTING_NOTIFIED) || []);
  const nextFlag = missing.map((c) => c.identifier);
  const unchanged = nextFlag.length === notified.size && nextFlag.every((id) => notified.has(id));
  if (!unchanged) await actor.setFlag(MODULE.ID, FLAGS.SPELLCASTING_NOTIFIED, nextFlag);
  const fresh = missing.filter((c) => !notified.has(c.identifier));
  if (!fresh.length) return;
  const recipients = game.users.filter((u) => u.isGM || actor.testUserPermission(u, 'OWNER')).map((u) => u.id);
  const content = await renderTemplate(TEMPLATES.COMPONENTS.SPELLCASTING_NOTICE, { actorName: actor.name, actorUuid: actor.uuid, classes: fresh });
  await ChatMessage.create({ content, whisper: recipients, flags: { [MODULE.ID]: { messageType: 'spellcasting-notice' } } });
  ATLAS.log(3, `Spellcasting list notice sent for ${actor.name}: ${fresh.map((c) => c.identifier).join(', ')}`);
}

/**
 * Check the parent actor when a class or subclass is added.
 * @param {object} item - The created item document
 */
export function onSpellcastingItemCreate(item) {
  if (item.actor && (item.type === 'class' || item.type === 'subclass')) scheduleCheck(item.actor);
}

/**
 * Re-check the actor after advancements apply.
 * @param {object} manager - The dnd5e advancement manager
 */
export function onAdvancementComplete(manager) {
  if (manager?.actor) scheduleCheck(manager.actor);
}

/**
 * Wire the role-aware button on spellcasting-notice whispers.
 * @param {object} message - The chat message document
 * @param {HTMLElement} html - The rendered message element
 */
export function onRenderSpellcastingNotice(message, html) {
  if (message.flags?.[MODULE.ID]?.messageType !== 'spellcasting-notice') return;
  const button = html.querySelector('.spellbook-configure');
  if (!button) return;
  const label = button.querySelector('.label');
  if (label && !game.user.isGM) label.textContent = _loc('SPELLBOOK.SpellcastingNotice.OpenButton');
  button.addEventListener('click', async () => {
    const actor = await fromUuid(button.dataset.actorUuid);
    if (!actor) return;
    if (game.user.isGM) new ClassRules({ actor }).render(true);
    else new SpellBook({ actor }).render(true);
  });
}
