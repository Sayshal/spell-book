/**
 * Peddler trade integration: offer scroll copying when a purchase delivers a linked spell scroll.
 * @module Integrations/Peddler
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { resolveLinkedScrollSpell } from '../data/scroll-processor.mjs';
import { showLearnFromScrollDialog } from '../dialogs/_module.mjs';
import { ClassManager, WizardBook } from '../managers/_module.mjs';

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** @type {string} Peddler's post-trade hook */
const PEDDLER_TRADE = 'peddler.trade';

/** @type {string} Chat message flag identifying scroll-purchase cards */
const MESSAGE_TYPE = 'scroll-purchase';

/**
 * Whisper a copy offer to the buyer's owners for every linked spell scroll a trade delivered.
 * @param {object} data - The peddler.trade payload
 * @param {object} data.buyerActor - The actor that received the purchased items
 * @param {object} data.summary - Trade summary with `added` rows carrying created item ids
 */
async function onPeddlerTrade({ buyerActor, summary }) {
  if (!buyerActor || !summary?.added?.length) return;
  if (!ClassManager.getWizardEnabledClasses(buyerActor).length) return;
  const recipients = game.users.filter((u) => buyerActor.testUserPermission(u, 'OWNER')).map((u) => u.id);
  if (!recipients.length) return;
  for (const row of summary.added) {
    const scroll = row.itemId ? buyerActor.items.get(row.itemId) : null;
    if (scroll?.type !== 'consumable' || scroll.system?.type?.value !== 'scroll') continue;
    const linked = await resolveLinkedScrollSpell(scroll);
    if (!linked) continue;
    const content = await renderTemplate(TEMPLATES.COMPONENTS.SCROLL_PURCHASE, {
      actorName: buyerActor.name,
      actorUuid: buyerActor.uuid,
      scrollId: scroll.id,
      scrollName: scroll.name,
      spellName: linked.spell.name,
      spellUuid: linked.spellUuid
    });
    await ChatMessage.create({ content, whisper: recipients, flags: { [MODULE.ID]: { messageType: MESSAGE_TYPE } } });
    ATLAS.log(3, `Scroll purchase offer sent for ${buyerActor.name}: ${linked.spell.name}`);
  }
}

/**
 * Ask which wizard-enabled class should learn the spell.
 * @param {object[]} classes - Wizard-enabled class entries
 * @returns {Promise<string|null>} The chosen class identifier, or null if cancelled
 */
async function promptForClass(classes) {
  if (classes.length === 1) return classes[0].identifier;
  const options = classes.map((c) => `<option value="${c.identifier}">${c.classItem.name}</option>`).join('');
  const result = await DialogV2.wait({
    classes: ['spell-book'],
    window: { icon: 'fas fa-book', title: 'SPELLBOOK.ScrollPurchase.ChooseClassTitle' },
    content: `<p>${_loc('SPELLBOOK.ScrollPurchase.ChooseClassBody')}</p><select name="classId">${options}</select>`,
    buttons: [
      { icon: 'fas fa-check', label: 'SPELLBOOK.Wizard.LearnSpellButton', action: 'confirm', className: 'dialog-button', callback: (_e, button) => button.form.elements.classId.value },
      { icon: 'fas fa-times', label: 'COMMON.Cancel', action: 'cancel', className: 'dialog-button' }
    ],
    default: 'confirm',
    rejectClose: false
  });
  return result === 'cancel' ? null : (result ?? null);
}

/**
 * Switch the card button to its spent state.
 * @param {HTMLElement} button - The learn button
 */
function markLearned(button) {
  button.disabled = true;
  const label = button.querySelector('.label');
  const icon = button.querySelector('i');
  if (label) label.textContent = _loc('SPELLBOOK.ScrollPurchase.Learned');
  if (icon) icon.className = 'fas fa-check';
}

/**
 * Whether any of the actor's wizard-enabled classes already holds the spell.
 * @param {object} actor - The actor document
 * @param {string} spellUuid - UUID of the spell
 * @returns {Promise<boolean>} Whether the spell is already known
 */
async function isAlreadyLearned(actor, spellUuid) {
  for (const { identifier } of ClassManager.getWizardEnabledClasses(actor)) {
    if (await WizardBook.isSpellInSpellbook(actor, identifier, spellUuid)) return true;
  }
  return false;
}

/**
 * Refresh any open Spell Book windows for the actor so a card learn shows immediately.
 * @param {object} actor - The actor document
 */
function refreshOpenSpellBooks(actor) {
  for (const app of foundry.applications.instances.values()) {
    if (app.constructor.name === 'SpellBook' && app.actor === actor) app.reloadAllClasses?.();
  }
}

/**
 * Wire the learn button on scroll-purchase whispers.
 * @param {object} message - The chat message document
 * @param {HTMLElement} html - The rendered message element
 */
export function onRenderScrollPurchase(message, html) {
  if (message.flags?.[MODULE.ID]?.messageType !== MESSAGE_TYPE) return;
  const button = html.querySelector('.spellbook-learn-scroll');
  if (!button) return;
  const actor = fromUuidSync(button.dataset.actorUuid);
  if (!actor?.isOwner) {
    button.remove();
    return;
  }
  isAlreadyLearned(actor, button.dataset.spellUuid).then((known) => {
    if (known) markLearned(button);
  });
  button.addEventListener('click', async () => {
    const scroll = actor.items.get(button.dataset.scrollId);
    if (!scroll) {
      ui.notifications.warn('SPELLBOOK.ScrollPurchase.ScrollGone', { localize: true });
      return;
    }
    const linked = await resolveLinkedScrollSpell(scroll);
    if (!linked) return;
    const classId = await promptForClass(ClassManager.getWizardEnabledClasses(actor));
    if (!classId) return;
    const charge = game.settings.get(MODULE.ID, SETTINGS.CHARGE_SCROLL_LEARNING_COST);
    const { cost, isFree } = charge ? await WizardBook.getCopyingCost(actor, classId, linked.spell) : { cost: 0, isFree: true };
    const confirmed = await showLearnFromScrollDialog({
      spell: linked.spell,
      cost,
      time: WizardBook.formatCopyingTime(WizardBook.getCopyingMinutes(actor, classId, linked.spell)),
      isFree,
      isAlreadyInSpellbook: await WizardBook.isSpellInSpellbook(actor, classId, linked.spellUuid)
    });
    if (!confirmed) return;
    const learned = await WizardBook.learnFromScroll(actor, classId, scroll);
    if (!learned) return;
    markLearned(button);
    refreshOpenSpellBooks(actor);
  });
}

/** Register the Peddler trade listener; GM clients only, since Peddler commits trades GM-side. */
export function registerPeddlerIntegration() {
  Hooks.on(PEDDLER_TRADE, (data) => {
    if (ATLAS.isPrimaryGM) onPeddlerTrade(data);
  });
  ATLAS.log(3, 'Peddler integration registered.');
}
