import { SpellBook } from './apps/_module.mjs';
import { MODULE } from './constants.mjs';
import { findAllSpellLists } from './data/custom-lists.mjs';
import { fetchAllSpells } from './data/spell-fetcher.mjs';
import { SpellManager } from './managers/spell-manager.mjs';
import { extractSpellFilterData } from './ui/formatting.mjs';
import { log } from './utils/logger.mjs';

const { DialogV2 } = foundry.applications.api;

/**
 * Prompt the GM to purge all Spell Book flags and module-flagged items from one or all eligible actors.
 * @returns {Promise<void>}
 */
export async function flagPurge() {
  const eligible = game.actors.filter((a) => a.hasPlayerOwner && Object.keys(a.spellcastingClasses || {}).length > 0).sort((a, b) => a.name.localeCompare(b.name));
  if (!eligible.length) {
    ui.notifications.warn('SPELLBOOK.API.FlagPurge.NoEligible', { localize: true });
    return;
  }
  const options = ['<option value="all">All Eligible Actors</option>', ...eligible.map((a) => `<option value="${a.id}">${a.name}</option>`)].join('');
  const content = `<form class="flag-purge-dialog"><p><strong>${_loc('SPELLBOOK.API.FlagPurge.Warning')}</strong></p><div class="form-group"><label for="flag-purge-actor">${_loc('SPELLBOOK.API.FlagPurge.SelectActor')}</label><select id="flag-purge-actor" name="actorId">${options}</select></div><p class="warning-text">${_loc('SPELLBOOK.API.FlagPurge.Irreversible')}</p></form>`;
  const actorId = await DialogV2.wait({
    classes: ['dnd5e2'],
    window: { icon: 'fas fa-trash', title: _loc('SPELLBOOK.API.FlagPurge.Title'), resizable: false },
    position: { width: 'auto', height: 'auto' },
    content,
    buttons: [
      { icon: 'fas fa-trash', label: _loc('COMMON.Confirm'), action: 'confirm', callback: (_event, button) => new FormData(button.form).get('actorId') },
      { icon: 'fas fa-times', label: _loc('COMMON.Cancel'), action: 'cancel' }
    ],
    default: 'cancel',
    rejectClose: false
  });
  if (!actorId || actorId === 'cancel') return;
  const targets = actorId === 'all' ? eligible : [game.actors.get(actorId)].filter(Boolean);
  let purged = 0;
  for (const actor of targets) {
    try {
      const flags = actor.flags[MODULE.ID] || {};
      for (const key of Object.keys(flags)) await actor.unsetFlag(MODULE.ID, key);
      const itemIds = actor.items.filter((item) => item.flags?.[MODULE.ID]).map((item) => item.id);
      if (itemIds.length) await actor.deleteEmbeddedDocuments('Item', itemIds);
      purged++;
    } catch (error) {
      log(1, `Flag purge failed for actor "${actor.name}".`, error);
    }
  }
  ui.notifications.info(_loc('SPELLBOOK.API.FlagPurge.Success', { count: purged }));
}

/**
 * Open the Spell Book for the currently selected token's actor.
 * @returns {Promise<void>}
 */
export async function spellBookQuickAccess() {
  const token = canvas.tokens?.controlled[0];
  if (!token) {
    ui.notifications.warn('SPELLBOOK.API.QuickAccess.NoToken', { localize: true });
    return;
  }
  const actor = token.actor;
  if (!actor) {
    ui.notifications.warn('SPELLBOOK.API.QuickAccess.NoActor', { localize: true });
    return;
  }
  if (!actor.items.some((item) => item.type === 'spell')) {
    ui.notifications.info(_loc('SPELLBOOK.API.QuickAccess.NoSpells', { name: actor.name }));
    return;
  }
  await SpellManager.handleSpellbookOpen(actor);
  new SpellBook({ actor }).render({ force: true });
}

/**
 * Post a chat card summarizing spell-slot usage for the selected token's actor.
 * @returns {Promise<void>}
 */
export async function spellSlotTracker() {
  const token = canvas.tokens?.controlled[0];
  if (!token) {
    ui.notifications.warn('SPELLBOOK.API.SlotTracker.NoToken', { localize: true });
    return;
  }
  const actor = token.actor;
  if (!actor) {
    ui.notifications.warn('SPELLBOOK.API.SlotTracker.NoActor', { localize: true });
    return;
  }
  const spellcasting = actor.system.spells;
  if (!spellcasting) {
    ui.notifications.info(_loc('SPELLBOOK.API.SlotTracker.NoSpellcasting', { name: actor.name }));
    return;
  }
  const rows = [];
  for (let level = 1; level <= 9; level++) {
    const slot = spellcasting[`spell${level}`];
    if (!slot || slot.max <= 0) continue;
    const used = slot.max - slot.value;
    rows.push(`<tr><td>${level}</td><td>${used}/${slot.max}</td><td>${slot.value}</td></tr>`);
  }
  if (!rows.length) {
    ui.notifications.info(_loc('SPELLBOOK.API.SlotTracker.NoSlots', { name: actor.name }));
    return;
  }
  const header = _loc('SPELLBOOK.API.SlotTracker.ChatTitle');
  const lvl = _loc('DND5E.Level');
  const usedLabel = _loc('SPELLBOOK.API.SlotTracker.Used');
  const remaining = _loc('SPELLBOOK.API.SlotTracker.Remaining');
  const content = `<h3>${actor.name} — ${header}</h3><table><tr><th>${lvl}</th><th>${usedLabel}</th><th>${remaining}</th></tr>${rows.join('')}</table>`;
  ChatMessage.create({ user: game.user.id, speaker: ChatMessage.getSpeaker({ actor }), content });
}

/**
 * Scan every item compendium for spell-scroll consumables and display the results in a dialog.
 * @returns {Promise<void>}
 */
export async function scrollScanner() {
  ui.notifications.info('SPELLBOOK.API.ScrollScanner.Scanning', { localize: true, permanent: true });
  const scrolls = [];
  const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');
  for (const pack of itemPacks) {
    try {
      const index = await pack.getIndex();
      const consumables = index.filter((item) => item.type === 'consumable');
      for (const consumable of consumables) {
        try {
          const doc = await fromUuid(consumable.uuid);
          if (doc?.system?.type?.value === 'scroll') scrolls.push({ name: doc.name, uuid: consumable.uuid, source: pack.metadata.label || pack.collection });
        } catch (error) {
          log(2, `Scroll scanner: failed to load consumable ${consumable.uuid}.`, error);
        }
      }
    } catch (error) {
      log(2, `Scroll scanner: failed to process pack ${pack.collection}.`, error);
    }
  }
  scrolls.sort((a, b) => a.name.localeCompare(b.name));
  ui.notifications.clear();
  if (!scrolls.length) {
    ui.notifications.info('SPELLBOOK.API.ScrollScanner.None', { localize: true });
    return;
  }
  const rows = scrolls.map((s) => `<tr><td>${s.name}</td><td>${s.uuid}</td></tr>`).join('');
  const header = _loc('SPELLBOOK.API.ScrollScanner.Found', { count: scrolls.length });
  const nameCol = _loc('SPELLBOOK.API.ScrollScanner.NameColumn');
  const uuidCol = _loc('SPELLBOOK.API.ScrollScanner.UuidColumn');
  const content = `<div class="scroll-scanner"><p>${header}</p><table><thead><tr><th>${nameCol}</th><th>${uuidCol}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const result = await DialogV2.wait({
    classes: ['dnd5e2'],
    window: { icon: 'fas fa-scroll', title: _loc('SPELLBOOK.API.ScrollScanner.Title'), resizable: true },
    position: { width: 800, height: 600 },
    content,
    buttons: [
      { icon: 'fas fa-copy', label: _loc('SPELLBOOK.API.ScrollScanner.CopyToConsole'), action: 'copy' },
      { icon: 'fas fa-times', label: _loc('APPLICATION.ACTIONS.Close'), action: 'close' }
    ],
    default: 'close',
    rejectClose: false
  });
  if (result === 'copy') {
    console.log(scrolls.map((s) => `${s.name} (${s.uuid}) - ${s.source}`).join('\n'));
    ui.notifications.info('SPELLBOOK.API.ScrollScanner.CopiedToConsole', { localize: true });
  }
}

/**
 * Find all spells across item compendiums that aren't referenced by any discoverable spell list.
 * @returns {Promise<void>}
 */
export async function spellsNotInLists() {
  ui.notifications.info('SPELLBOOK.API.SpellsNotInLists.Scanning', { localize: true, permanent: true });
  const allSpells = new Set();
  for (const pack of Array.from(game.packs).filter((p) => p.metadata.type === 'Item')) {
    const index = await pack.getIndex();
    for (const entry of index.filter((item) => item.type === 'spell')) allSpells.add(entry.uuid);
  }
  const spellLists = await findAllSpellLists();
  const inLists = new Set();
  for (const list of spellLists) {
    try {
      const doc = list.document ?? (await fromUuid(list.uuid));
      if (!doc?.system?.spells) continue;
      const spells = doc.system.spells;
      if (spells instanceof Set) for (const uuid of spells) inLists.add(uuid);
      else if (Array.isArray(spells)) for (const uuid of spells) inLists.add(uuid);
    } catch (error) {
      log(2, `Spells-not-in-lists: failed to process spell list ${list.name}.`, error);
    }
  }
  const missing = [];
  for (const uuid of allSpells) {
    if (inLists.has(uuid)) continue;
    try {
      const spell = await fromUuid(uuid);
      if (spell) missing.push({ name: spell.name, uuid, source: spell.pack || _loc('SPELLBOOK.API.SpellsNotInLists.UnknownSource') });
    } catch (error) {
      log(2, `Spells-not-in-lists: failed to load spell ${uuid}.`, error);
    }
  }
  missing.sort((a, b) => a.name.localeCompare(b.name));
  ui.notifications.clear();
  if (!missing.length) {
    ui.notifications.info('SPELLBOOK.API.SpellsNotInLists.AllCovered', { localize: true });
    return;
  }
  const rows = missing.map((s) => `<tr><td>${s.name}</td><td>${s.source}</td></tr>`).join('');
  const header = _loc('SPELLBOOK.API.SpellsNotInLists.Found', { count: missing.length });
  const nameCol = _loc('SPELLBOOK.API.SpellsNotInLists.NameColumn');
  const sourceCol = _loc('SPELLBOOK.API.SpellsNotInLists.SourceColumn');
  const content = `<div class="spells-not-in-lists"><p>${header}</p><table><thead><tr><th>${nameCol}</th><th>${sourceCol}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const result = await DialogV2.wait({
    classes: ['dnd5e2'],
    window: { icon: 'fas fa-search', title: _loc('SPELLBOOK.API.SpellsNotInLists.Title'), resizable: true },
    position: { width: 800, height: 600 },
    content,
    buttons: [
      { icon: 'fas fa-copy', label: _loc('SPELLBOOK.API.SpellsNotInLists.CopyToConsole'), action: 'copy' },
      { icon: 'fas fa-times', label: _loc('APPLICATION.ACTIONS.Close'), action: 'close' }
    ],
    default: 'close',
    rejectClose: false
  });
  if (result === 'copy') {
    console.log(missing.map((s) => `${s.name} (${s.uuid})`).join('\n'));
    ui.notifications.info('SPELLBOOK.API.SpellsNotInLists.CopiedToConsole', { localize: true });
  }
}

/**
 * Dump spell index entries matching a name into the console with key fields for diagnosis.
 * Usage: `game.modules.get('spell-book').api.debugSpell('Revivify')`.
 * @param {string} name - Spell name (case-insensitive, substring match)
 * @returns {Promise<object[]>} Matching entries (also logged)
 */
export async function debugSpell(name) {
  const all = await fetchAllSpells();
  const needle = String(name || '').toLowerCase();
  const matches = all.filter((s) => s.name?.toLowerCase().includes(needle));
  const summary = matches.map((s) => ({
    name: s.name,
    uuid: s.uuid,
    compendiumSource: s._stats?.compendiumSource,
    sourceBook: s.system?.source?.book,
    sourceCustom: s.system?.source?.custom,
    level: s.system?.level,
    school: s.system?.school,
    properties: Array.from(s.system?.properties ?? []),
    materials: s.system?.materials,
    filterData: extractSpellFilterData(s)
  }));
  console.log(`[Spell Book] Matches for "${name}":`, summary);
  return summary;
}

/** Wire up the public API surface and expose it on the SPELLBOOK global. */
export function createAPI() {
  const api = { flagPurge, spellBookQuickAccess, spellSlotTracker, scrollScanner, spellsNotInLists, debugSpell };
  globalThis.SPELLBOOK = { api };
  game.modules.get(MODULE.ID).api = api;
  log(3, 'Module API registered.');
}
