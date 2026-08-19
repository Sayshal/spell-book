import { FLAGS, MODULE, TEMPLATES } from '../constants.mjs';
import { WizardBook } from '../managers/wizard-book.mjs';

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** @type {Set<string>} Actor ids whose approval dialog is already open on this client. */
const openDialogs = new Set();

/**
 * Refresh any open Spell Book windows for the actor so an approved copy shows immediately.
 * @param {object} actor - The actor document
 */
function refreshOpenSpellBooks(actor) {
  for (const app of foundry.applications.instances.values()) {
    if (app.constructor.name === 'SpellBook' && app.actor === actor) app.reloadAllClasses?.();
  }
}

/**
 * Queue a spell copy for GM approval. The request lives on the actor, so it survives until a GM logs in.
 * @param {object} actor - The actor document
 * @param {string} classId - The class identifier
 * @param {string} spellUuid - UUID of the spell to copy
 * @param {number} cost - Cost in base currency
 * @param {number} minutes - Copy duration in minutes
 * @returns {Promise<boolean>} Whether the request was queued
 */
export async function requestCopyApproval(actor, classId, spellUuid, cost, minutes) {
  if (actor.getFlag(MODULE.ID, FLAGS.PENDING_SPELL_COPY)) {
    ui.notifications.warn('SPELLBOOK.Approval.AlreadyPending', { localize: true });
    return false;
  }
  await actor.setFlag(MODULE.ID, FLAGS.PENDING_SPELL_COPY, { classId, spellUuid, cost, minutes, userId: game.user.id });
  ui.notifications.info(ATLAS.primaryGM ? 'SPELLBOOK.Approval.Sent' : 'SPELLBOOK.Approval.Queued', { localize: true });
  return true;
}

/**
 * Whisper the requesting player the outcome of their request.
 * @param {object} request - The stored request
 * @param {string} spellName - Name of the requested spell
 * @param {boolean} approved - Whether the copy was approved
 * @returns {Promise<void>}
 */
async function notifyRequester(request, spellName, approved) {
  const content = `<p>${_loc(approved ? 'SPELLBOOK.Approval.Approved' : 'SPELLBOOK.Approval.Denied', { spell: spellName })}</p>`;
  await ChatMessage.create({ content, whisper: [request.userId], flags: { [MODULE.ID]: { messageType: 'copy-approval' } } });
}

/**
 * Show the approval dialog for an actor's pending request and apply the outcome.
 * @param {object} actor - The actor document holding the request
 * @returns {Promise<void>}
 */
async function resolveRequest(actor) {
  const request = actor.getFlag(MODULE.ID, FLAGS.PENDING_SPELL_COPY);
  if (!request || openDialogs.has(actor.id)) return;
  openDialogs.add(actor.id);
  try {
    const spell = await fromUuid(request.spellUuid);
    if (!spell) {
      await actor.unsetFlag(MODULE.ID, FLAGS.PENDING_SPELL_COPY);
      return;
    }
    const content = await renderTemplate(TEMPLATES.DIALOGS.COPY_APPROVAL, {
      actorName: actor.name,
      spell,
      costText: _loc('SPELLBOOK.Wizard.SpellCopyCost', { cost: request.cost }),
      time: WizardBook.formatCopyingTime(request.minutes)
    });
    const result = await DialogV2.wait({
      classes: ['spell-book'],
      window: { icon: 'fas fa-hourglass-half', title: _loc('SPELLBOOK.Approval.Title', { name: actor.name }) },
      content,
      buttons: [
        { icon: 'fas fa-check', label: 'SPELLBOOK.Approval.Approve', action: 'approve', callback: (_event, button) => (new FormData(button.form).get('skipTime') ? 'skip' : 'approve') },
        { icon: 'fas fa-times', label: 'SPELLBOOK.Approval.Deny', action: 'deny' }
      ],
      default: 'approve',
      rejectClose: false
    });
    if (result !== 'approve' && result !== 'skip') {
      await actor.unsetFlag(MODULE.ID, FLAGS.PENDING_SPELL_COPY);
      await notifyRequester(request, spell.name, false);
      return;
    }
    const learned = await WizardBook.copySpell(actor, request.classId, request.spellUuid, request.cost, request.minutes);
    if (learned && result === 'approve' && request.minutes > 0) await game.time.advance(request.minutes * 60);
    await actor.unsetFlag(MODULE.ID, FLAGS.PENDING_SPELL_COPY);
    await notifyRequester(request, spell.name, learned);
  } finally {
    openDialogs.delete(actor.id);
  }
}

/**
 * Prompt the GM when a request lands, and reload the owner's Spell Book when someone else records a copy for them.
 * @param {object} actor - The updated actor document
 * @param {object} changes - The update diff
 * @param {object} _options - Update options
 * @param {string} userId - Id of the user who made the update
 */
export function onUpdateActor(actor, changes, _options, userId) {
  const flagChanges = changes.flags?.[MODULE.ID];
  if (!flagChanges) return;
  if (FLAGS.PENDING_SPELL_COPY in flagChanges) {
    if (ATLAS.isPrimaryGM) resolveRequest(actor);
    return;
  }
  if (userId === game.userId || !actor.isOwner) return;
  if (!Object.keys(flagChanges).some((key) => key.startsWith(FLAGS.WIZARD_COPIED_SPELLS))) return;
  WizardBook.invalidateCache(actor);
  refreshOpenSpellBooks(actor);
}

/** Surface requests that were queued while no GM was connected. */
export function sweepPendingRequests() {
  if (!ATLAS.isPrimaryGM) return;
  for (const actor of game.actors) if (actor.getFlag(MODULE.ID, FLAGS.PENDING_SPELL_COPY)) resolveRequest(actor);
}
