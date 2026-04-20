/**
 * Thin wrapper on dnd5e CompendiumBrowser.fetch for spell retrieval.
 * @module Data/SpellFetcher
 * @author Tyler
 */

import { log } from '../utils/logger.mjs';

/** @type {object} dnd5e CompendiumBrowser class reference */
const CompendiumBrowser = dnd5e.applications.CompendiumBrowser;

/** @type {Set<string>} System fields required for spell filtering and display */
const DEFAULT_INDEX_FIELDS = new Set([
  'system.activation.type',
  'system.activation.value',
  'system.activities',
  'system.components.ritual',
  'system.description.value',
  'system.duration.concentration',
  'system.level',
  'system.materials.consumed',
  'system.materials.cost',
  'system.materials.value',
  'system.properties',
  'system.range.units',
  'system.range.value',
  'system.school',
  'system.source.book',
  'system.source.bookPlaceholder',
  'system.source.custom',
  'system.target'
]);

/**
 * Fetch all spells from visible compendiums up to a maximum level.
 * @param {object} [options] - Fetch options
 * @param {number} [options.maxLevel] - Maximum spell level to include
 * @param {Function} [options.onProgress]
 *   Invoked after each pack's spells are indexed. Receives the pack collection ID
 *   and cumulative spell count. When provided, packs are iterated serially.
 * @returns {Promise<object[]>} Array of spell index entries
 */
export async function fetchAllSpells({ maxLevel, onProgress } = {}) {
  const filters = [
    { k: 'type', o: 'exact', v: 'spell' },
    { k: 'system.container', o: 'in', v: [null, undefined] }
  ];
  if (maxLevel != null) filters.push({ k: 'system.level', o: 'lte', v: maxLevel });
  const sort = (a, b) => (a.system?.level ?? 0) - (b.system?.level ?? 0) || a.name.localeCompare(b.name, game.i18n.lang);
  if (!onProgress) {
    const results = await CompendiumBrowser.fetch(Item, {
      types: new Set(['spell']),
      filters,
      indexFields: new Set(DEFAULT_INDEX_FIELDS),
      sort
    });
    applyLabelsFallback(results);
    log(3, `Fetched ${results.length} spells.`);
    return results;
  }
  const Filter = dnd5e?.Filter;
  const SourceField = dnd5e?.dataModels?.shared?.SourceField;
  const fields = Array.from(new Set([...DEFAULT_INDEX_FIELDS, ...Filter.uniqueKeys(filters)])).filter((f) => f !== 'system.source.slug');
  const packSourceConfig = game.settings.get('dnd5e', 'packSourceConfiguration') ?? {};
  const eligiblePacks = game.packs.filter(
    (p) => p.metadata.type === 'Item' && p.visible && packSourceConfig[p.collection] !== false && (!p.metadata.flags.dnd5e?.types || new Set(p.metadata.flags.dnd5e.types).has('spell'))
  );
  const results = [];
  for (const pack of eligiblePacks) {
    const index = await pack.getIndex({ fields });
    const art = game.dnd5e.moduleArt.apply(index);
    for (const entry of art) {
      const src = foundry.utils.getProperty(entry, 'system.source');
      if (foundry.utils.getType(src) === 'Object' && entry.uuid) SourceField.prepareData.call(src, entry.uuid);
      if (entry.type !== 'spell') continue;
      if (pack.metadata.flags.dnd5e?.types && !pack.metadata.flags.dnd5e.types.includes('spell')) continue;
      if (!Filter.performCheck(entry, filters)) continue;
      results.push(entry);
    }
    onProgress(pack.collection, results.length);
  }
  results.sort(sort);
  applyLabelsFallback(results);
  log(3, `Fetched ${results.length} spells across ${eligiblePacks.length} packs.`);
  return results;
}

/**
 * Fetch spells matching specific filter criteria.
 * @param {object} [options] - Fetch options
 * @param {object[]} [options.filters] - Filter descriptors for CompendiumBrowser.fetch
 * @param {Set<string>} [options.indexFields] - Additional index fields to request
 * @returns {Promise<object[]>} Array of matching spell index entries
 */
export async function fetchSpellsForFilters({ filters = [], indexFields } = {}) {
  const mergedFields = indexFields ? new Set([...DEFAULT_INDEX_FIELDS, ...indexFields]) : new Set(DEFAULT_INDEX_FIELDS);
  const results = await CompendiumBrowser.fetch(Item, { types: new Set(['spell']), filters, indexFields: mergedFields });
  applyLabelsFallback(results);
  return results;
}

/**
 * Fetch spells from compendiums matching a set of UUIDs, filtered by max level.
 * Uses CompendiumBrowser.fetch for instant index retrieval instead of individual fromUuid calls.
 * @param {Set<string>} uuids - Spell UUIDs to match
 * @param {number} maxLevel - Maximum spell level to include
 * @returns {Promise<object[]>} Matching spell index entries
 */
export async function fetchSpellsByUuids(uuids, maxLevel) {
  if (!uuids?.size) return [];
  const allSpells = await CompendiumBrowser.fetch(Item, {
    types: new Set(['spell']),
    filters: [{ k: 'system.level', o: 'lte', v: maxLevel }],
    indexFields: new Set(DEFAULT_INDEX_FIELDS)
  });
  applyLabelsFallback(allSpells);
  return allSpells.filter((spell) => uuids.has(spell.uuid));
}

/**
 * Patch entries from older third-party packs that lack computed labels.
 * @param {object[]} entries - Spell index entries to patch in place
 */
function applyLabelsFallback(entries) {
  for (const entry of entries) {
    if (entry.labels) continue;
    entry.labels = {};
    if (entry.system?.level !== undefined) entry.labels.level = CONFIG.DND5E.spellLevels[entry.system.level];
    if (entry.system?.school) {
      const school = CONFIG.DND5E.spellSchools[entry.system.school];
      entry.labels.school = school?.label ?? school?.name ?? school ?? '';
    }
    if (entry.system?.activation?.type) {
      const type = entry.system.activation.type;
      const value = entry.system.activation.value || 1;
      const typeLabel = CONFIG.DND5E.abilityActivationTypes[type];
      entry.labels.activation = value === 1 || value === null ? typeLabel : `${value} ${typeLabel}s`;
    }
    if (entry.system?.range) {
      const range = entry.system.range;
      if (range.units === 'self') entry.labels.range = _loc('DND5E.DistSelf');
      else if (range.units === 'touch') entry.labels.range = _loc('DND5E.DistTouch');
      else if (range.units === 'spec') entry.labels.range = _loc('DND5E.Special');
      else if (range.value && range.units) {
        const unitLabel = CONFIG.DND5E?.movementUnits?.[range.units]?.label ?? range.units;
        entry.labels.range = `${range.value} ${unitLabel}`;
      }
    }
    if (entry.system?.properties?.length) {
      const componentMap = { vocal: 'V', somatic: 'S', material: 'M', concentration: 'C', ritual: 'R' };
      const vsm = entry.system.properties
        .filter((p) => componentMap[p])
        .map((p) => componentMap[p])
        .join(', ');
      if (vsm) entry.labels.components = { vsm };
    }
    if (entry.system?.materials?.consumed) {
      const { cost, value } = entry.system.materials;
      if (cost > 0) entry.labels.materials = _loc('SPELLBOOK.MaterialComponents.Cost', { cost });
      else if (value) entry.labels.materials = value;
      else entry.labels.materials = _loc('SPELLBOOK.MaterialComponents.UnknownCost');
    }
  }
}
