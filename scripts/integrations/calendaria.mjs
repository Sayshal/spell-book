import { FLAGS, HOOKS, MODULE, SETTINGS, WIZARD_SPELL_SOURCE } from '../constants.mjs';
import { WizardBook } from '../managers/_module.mjs';

/** @type {Map<string, string>} Day key -> journal page id of that day's downtime note. */
const dayNotes = new Map();

/** @type {Promise} Serializes appends so two copies on one day cannot both create the note. */
let queue = Promise.resolve();

/**
 * Build the cache key for a calendar date.
 * @param {object} date - { year, month, day }
 * @returns {string} Cache key
 */
function dayKey(date) {
  return `${date.year}:${date.month}:${date.day}`;
}

/**
 * Resolve the current world date in the 1-based form Calendaria's note API expects.
 * @returns {object|null} { year, month, day } or null when no calendar is available
 */
function currentDate() {
  const cal = game.time?.calendar;
  const components = cal?.timeToComponents?.(game.time?.worldTime ?? 0);
  if (!components) return null;
  return { year: components.year + (cal.years?.yearZero ?? 0), month: components.month + 1, day: components.dayOfMonth + 1 };
}

/**
 * Find a journal page by id across all journals.
 * @param {string} id - The page id
 * @returns {object|null} The page document or null
 */
function pageById(id) {
  if (!id) return null;
  for (const journal of game.journal) {
    const page = journal.pages.get(id);
    if (page) return page;
  }
  return null;
}

/**
 * Find the existing downtime note for a date, preferring the cached page id.
 * @param {object} api - The Calendaria API
 * @param {object} date - { year, month, day }
 * @returns {object|null} The note page or null
 */
function dayNotePage(api, date) {
  const cached = pageById(dayNotes.get(dayKey(date)));
  if (cached) return cached;
  for (const note of api.getNotesForDate(date.year, date.month, date.day) ?? []) {
    const page = pageById(note.id);
    if (page?.getFlag(MODULE.ID, FLAGS.DOWNTIME_NOTE)) {
      dayNotes.set(dayKey(date), page.id);
      return page;
    }
  }
  return null;
}

/**
 * Append a line to the day's downtime note, creating the note when it does not exist yet.
 * @param {object} api - The Calendaria API
 * @param {object} date - { year, month, day }
 * @param {string} line - HTML line to append
 * @returns {Promise<void>}
 */
async function appendLine(api, date, line) {
  const page = dayNotePage(api, date);
  if (page) {
    await api.updateNote(page.id, { content: `${page.text?.content ?? ''}${line}` });
    return;
  }
  const created = await api.createNote({ name: _loc('ATLAS.Common.Downtime'), content: line, startDate: date, allDay: true, openSheet: false });
  if (!created) return;
  await created.setFlag(MODULE.ID, FLAGS.DOWNTIME_NOTE, true);
  dayNotes.set(dayKey(date), created.id);
}

/**
 * Write a logged copy into the current day's Calendaria note. Runs on the primary GM only.
 * @param {object} payload - The relayed copy record
 * @param {string} payload.actorName - Name of the copying actor
 * @param {string} payload.spellName - Name of the copied spell
 * @param {number|string} payload.minutes - Copy duration in minutes
 * @returns {void}
 */
function onCopyLogged({ actorName, spellName, minutes }) {
  if (!ATLAS.isPrimaryGM || !game.settings.get(MODULE.ID, SETTINGS.SPELL_COPY_DOWNTIME_NOTE)) return;
  const api = globalThis.CALENDARIA?.api;
  const date = currentDate();
  if (!api?.createNote || !api?.getNotesForDate || !date) return;
  const escape = foundry.utils.escapeHTML;
  const text = _loc('SPELLBOOK.DowntimeNote.Line', { actor: escape(actorName), spell: escape(spellName), time: WizardBook.formatCopyingTime(minutes) });
  queue = queue.then(() => appendLine(api, date, `<p>${text}</p>`)).catch((error) => ATLAS.log(1, 'Downtime note append failed', error));
}

/**
 * Relay a completed copy to the GM for logging; the copying client may be a player without journal permission.
 * @param {object} data - The `spellLearned` hook payload
 * @param {object} data.actor - The actor document
 * @param {string} data.classId - The class identifier
 * @param {string} data.spellUuid - UUID of the learned spell
 * @param {string} data.source - Source type (free, copied, scroll)
 * @param {string} [data.name] - Name of the learned spell
 * @returns {void}
 */
export function onSpellLearned({ actor, classId, spellUuid, source, name }) {
  if (source === WIZARD_SPELL_SOURCE.FREE || !game.settings.get(MODULE.ID, SETTINGS.SPELL_COPY_DOWNTIME_NOTE)) return;
  const records = actor.getFlag(MODULE.ID, `${FLAGS.WIZARD_COPIED_SPELLS}_${classId}`) || [];
  const minutes = records.findLast((record) => record.spellUuid === spellUuid)?.timeSpent ?? 0;
  const payload = { actorName: actor.name, spellName: name ?? spellUuid, minutes };
  Hooks.callAll(HOOKS.SPELL_COPIED, payload);
  game.modules.get(MODULE.ID).atlas?.broadcast(HOOKS.SPELL_COPIED, payload);
}

/** Wire the GM-side note writer for copies relayed from other clients. */
export function registerDowntimeNote() {
  Hooks.on(HOOKS.SPELL_COPIED, onCopyLogged);
}
