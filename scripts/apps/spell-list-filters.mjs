/** @type {object} Default spell filter state. */
export const DEFAULT_FILTER_STATE = Object.freeze({
  name: '',
  level: '',
  school: '',
  source: 'all',
  spellSource: 'all',
  castingTime: '',
  damageType: '',
  condition: '',
  requiresSave: '',
  concentration: '',
  materialComponents: '',
  ritual: false,
  minRange: '',
  maxRange: ''
});

/** @type {Array<{name: string, property: string}>} Dropdown filter metadata for data-driven listener setup (replaces _source:705-780 duplication). */
export const DROPDOWN_FILTERS = Object.freeze([
  { name: 'spell-level', property: 'level' },
  { name: 'spell-school', property: 'school' },
  { name: 'spell-compendium-source', property: 'source' },
  { name: 'spell-source', property: 'spellSource' },
  { name: 'spell-castingTime', property: 'castingTime' },
  { name: 'spell-damageType', property: 'damageType' },
  { name: 'spell-condition', property: 'condition' },
  { name: 'spell-requiresSave', property: 'requiresSave' },
  { name: 'spell-concentration', property: 'concentration' },
  { name: 'spell-materialComponents', property: 'materialComponents' }
]);
