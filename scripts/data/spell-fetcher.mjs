import { getEligibleSpellPacks } from './compendium-packs.mjs';

/** @type {object} dnd5e CompendiumBrowser class reference */
const CompendiumBrowser = dnd5e.applications.CompendiumBrowser;

/** @type {object} dnd5e SourceField class reference */
const SourceField = dnd5e.dataModels.shared.SourceField;

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
  'system.source',
  'system.target'
]);

/**
 * Fetch all spells from visible compendiums up to a maximum level.
 * @param {object} [options] - Fetch options
 * @param {number} [options.maxLevel] - Maximum spell level to include
 * @param {Function} [options.onProgress] - Invoked after each pack's spells are indexed.
 * @returns {Promise<object[]>} Spell views built from index entries
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
    ATLAS.log(3, `Fetched ${results.length} spells`);
    return results.map(createSpellView);
  }
  const Filter = dnd5e?.Filter;
  const fields = Array.from(new Set([...DEFAULT_INDEX_FIELDS, ...Filter.uniqueKeys(filters)])).filter((f) => !f.startsWith('system.source.'));
  const eligiblePacks = getEligibleSpellPacks();
  const results = [];
  for (const pack of eligiblePacks) {
    const index = await pack.getIndex({ fields });
    for (const entry of index) {
      if (entry.type !== 'spell') continue;
      if (pack.metadata.flags.dnd5e?.types && !pack.metadata.flags.dnd5e.types.includes('spell')) continue;
      if (!Filter.performCheck(entry, filters)) continue;
      results.push(createSpellView(entry));
    }
    onProgress(pack.collection, results.length);
  }
  results.sort(sort);
  ATLAS.log(3, `Fetched ${results.length} spells across ${eligiblePacks.length} packs`);
  return results;
}

/**
 * Fetch spells from compendiums matching a set of UUIDs, filtered by max level.
 * @param {Set<string>} uuids - Spell UUIDs to match
 * @param {number} maxLevel - Maximum spell level to include
 * @returns {Promise<object[]>} Spell views built from matching index entries
 */
export async function fetchSpellsByUuids(uuids, maxLevel) {
  if (!uuids?.size) return [];
  const fields = Array.from(DEFAULT_INDEX_FIELDS);
  const byPack = new Map();
  let unresolved = 0;
  for (const uuid of uuids) {
    const { collection, documentId } = foundry.utils.parseUuid(uuid) ?? {};
    if (!collection?.getIndex || !documentId) {
      unresolved++;
      continue;
    }
    if (!byPack.has(collection)) byPack.set(collection, []);
    byPack.get(collection).push(documentId);
  }
  const results = [];
  for (const [pack, ids] of byPack) {
    const index = await pack.getIndex({ fields });
    for (const id of ids) {
      const entry = index.get(id);
      if (!entry) {
        unresolved++;
        continue;
      }
      if ((entry.system?.level ?? 0) > maxLevel) continue;
      results.push(createSpellView(entry));
    }
  }
  results.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  if (unresolved) ATLAS.log(2, `${unresolved} spell list entries could not be resolved from their compendiums`);
  return results;
}

/**
 * Copy an index entry so derived and view data never mutate the shared compendium index.
 * @param {object} entry - Compendium index entry
 * @returns {object} Spell view with prepared source data and labels
 */
function createSpellView(entry) {
  const system = { ...entry.system };
  if (foundry.utils.getType(system.source) === 'Object' && entry.uuid) {
    system.source = { ...system.source };
    SourceField.prepareData.call(system.source, entry.uuid);
  }
  return { ...entry, system, labels: entry.labels ?? buildFallbackLabels(system) };
}

/**
 * Build labels for entries from older third-party packs that lack computed labels.
 * @param {object} system - Spell system data
 * @returns {object} Spell labels
 */
function buildFallbackLabels(system) {
  const labels = {};
  if (system.level !== undefined) labels.level = CONFIG.DND5E.spellLevels[system.level];
  if (system.school) {
    const school = CONFIG.DND5E.spellSchools[system.school];
    labels.school = school?.label ?? school?.name ?? school ?? '';
  }
  if (system.activation?.type) labels.activation = formatActivationLabel(system.activation.type, system.activation.value);
  const range = system.range;
  if (range?.units === 'self') labels.range = _loc('DND5E.DistSelf');
  else if (range?.units === 'touch') labels.range = _loc('DND5E.DistTouch');
  else if (range?.units === 'spec') labels.range = _loc('DND5E.Special');
  else if (range?.value && range.units) labels.range = `${range.value} ${CONFIG.DND5E?.movementUnits?.[range.units]?.label ?? range.units}`;
  if (system.properties?.length) {
    const vsm = system.properties
      .map((p) => CONFIG.DND5E.itemProperties[p]?.abbreviation)
      .filter(Boolean)
      .join(', ');
    if (vsm) labels.components = { vsm };
  }
  if (system.materials?.consumed) {
    const { cost, value } = system.materials;
    if (cost > 0) labels.materials = _loc('SPELLBOOK.MaterialComponents.Cost', { cost });
    else if (value) labels.materials = value;
    else labels.materials = _loc('SPELLBOOK.MaterialComponents.UnknownCost');
  }
  return labels;
}

/**
 * Build a spell activation label, leaving word order and pluralisation to the lang files.
 * @param {string} type - Activation type key
 * @param {number} [value] - Activation count
 * @returns {string} Localized activation label
 */
export function formatActivationLabel(type, value) {
  const typeLabel = CONFIG.DND5E.abilityActivationTypes[type] || type;
  const count = value || 1;
  if (count === 1) return typeLabel;
  const plural = game.i18n.pluralRules.select(count);
  const counted = CONFIG.DND5E.activityActivationTypes?.[type]?.counted;
  if (counted) return _loc(`${counted}.${plural}`, { number: count });
  return _loc(`SPELLBOOK.Formatting.ActivationCounted.${plural}`, { number: count, type: typeLabel });
}
