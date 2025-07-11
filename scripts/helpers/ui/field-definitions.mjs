import { MODULE } from '../../constants.mjs';
import { log } from '../../logger.mjs';
import * as genericUtils from '../generic-utils.mjs';

/**
 * Field definitions for advanced search syntax
 */
export class FieldDefinitions {
  constructor() {
    this.fieldMap = new Map();
    this.valueValidators = new Map();
    this._initializeFields();
  }

  /**
   * Initialize field mappings from module config
   * @private
   */
  _initializeFields() {
    for (const filter of MODULE.DEFAULT_FILTER_CONFIG) {
      if (filter.searchAliases) {
        for (const alias of filter.searchAliases) this.fieldMap.set(alias.toUpperCase(), filter.id);
        this._setupValueValidator(filter.id, filter.type);
      }
    }
    log(3, 'Field definitions initialized:', this.fieldMap);
  }

  /**
   * Setup value validators for different field types
   * @param {string} fieldId - The field ID
   * @param {string} fieldType - The field type
   * @private
   */
  _setupValueValidator(fieldId, fieldType) {
    switch (fieldId) {
      case 'level':
        this.valueValidators.set(fieldId, (value) => {
          const validLevels = Object.keys(CONFIG.DND5E.spellLevels);
          return validLevels.includes(String(value));
        });
        break;
      case 'school':
        this.valueValidators.set(fieldId, (value) => {
          const schools = Object.keys(CONFIG.DND5E.spellSchools)
            .map((key) => key.toUpperCase())
            .concat(
              Object.values(CONFIG.DND5E.spellSchools)
                .map((school) => {
                  const fullKey = school.fullKey?.toUpperCase();
                  const label = genericUtils
                    .getConfigLabel(
                      CONFIG.DND5E.spellSchools,
                      Object.keys(CONFIG.DND5E.spellSchools).find((k) => CONFIG.DND5E.spellSchools[k] === school)
                    )
                    ?.toUpperCase();
                  return fullKey || label;
                })
                .filter(Boolean)
            );
          return schools.includes(value.toUpperCase());
        });
        break;
      case 'castingTime':
        this.valueValidators.set(fieldId, (value) => {
          const parts = value.split(':');
          const validTypes = Object.keys(CONFIG.DND5E.abilityActivationTypes).map((key) => key.toUpperCase());
          return parts.length >= 1 && validTypes.includes(parts[0].toUpperCase());
        });
        break;
      case 'damageType':
        this.valueValidators.set(fieldId, (value) => {
          const damageTypesWithHealing = {
            ...CONFIG.DND5E.damageTypes,
            healing: {
              label: game.i18n.localize('DND5E.Healing'),
              name: game.i18n.localize('DND5E.Healing')
            }
          };
          const validTypes = Object.keys(damageTypesWithHealing).map((key) => key.toUpperCase());
          return value.split(',').every((v) => validTypes.includes(v.trim().toUpperCase()));
        });
        break;
      case 'condition':
        this.valueValidators.set(fieldId, (value) => {
          const conditions = Object.entries(CONFIG.DND5E.conditionTypes)
            .filter(([_key, condition]) => !condition.pseudo)
            .map(([key]) => key.toUpperCase());
          return value.split(',').every((v) => conditions.includes(v.trim().toUpperCase()));
        });
        break;
      case 'requiresSave':
      case 'concentration':
      case 'prepared':
      case 'favorited':
      case 'ritual':
        this.valueValidators.set(fieldId, (value) => {
          const val = value.toUpperCase();
          return ['TRUE', 'FALSE', 'YES', 'NO'].includes(val);
        });
        break;
      case 'materialComponents':
        this.valueValidators.set(fieldId, (value) => {
          const val = value.toUpperCase();
          return ['CONSUMED', 'NOTCONSUMED'].includes(val);
        });
        break;
      case 'range':
        this.valueValidators.set(fieldId, (value) => {
          if (value.includes('-')) {
            const parts = value.split('-');
            if (parts.length === 2) {
              const min = parts[0].trim();
              const max = parts[1].trim();
              return (min === '' || !isNaN(parseInt(min))) && (max === '' || !isNaN(parseInt(max)));
            }
          }
          if (!isNaN(parseInt(value))) return true;
          const rangeTypes = Object.keys(CONFIG.DND5E.rangeTypes).map((key) => key.toUpperCase());
          return rangeTypes.includes(value.toUpperCase()) || ['UNLIMITED', 'SIGHT'].includes(value.toUpperCase());
        });
        break;
      default:
        this.valueValidators.set(fieldId, () => true);
    }
  }

  /**
   * Get field ID from alias
   * @param {string} alias - The field alias
   * @returns {string|null} The field ID or null if not found
   */
  getFieldId(alias) {
    return this.fieldMap.get(alias.toUpperCase()) || null;
  }

  /**
   * Validate field value
   * @param {string} fieldId - The field ID
   * @param {string} value - The value to validate
   * @returns {boolean} Whether the value is valid
   */
  validateValue(fieldId, value) {
    const validator = this.valueValidators.get(fieldId);
    return validator ? validator(value) : true;
  }

  /**
   * Normalize boolean values
   * @param {string} value - The value to normalize
   * @returns {string} Normalized boolean value
   */
  normalizeBooleanValue(value) {
    const val = value.toUpperCase();
    if (['TRUE', 'YES'].includes(val)) return 'true';
    if (['FALSE', 'NO'].includes(val)) return 'false';
    return value;
  }

  /**
   * Get all field aliases for autocomplete
   * @returns {Array<string>} Array of field aliases
   */
  getAllFieldAliases() {
    return Array.from(this.fieldMap.keys());
  }

  /**
   * Get valid values for a field (for autocomplete suggestions)
   * @param {string} fieldId - The field ID
   * @returns {Array<string>} Array of valid values
   */
  getValidValuesForField(fieldId) {
    if (fieldId === 'range') return [];
    const baseValues = (() => {
      switch (fieldId) {
        case 'level':
          return Object.keys(CONFIG.DND5E.spellLevels || {});
        case 'school':
          return Object.keys(CONFIG.DND5E.spellSchools || {})
            .map((key) => key.toUpperCase())
            .concat(
              Object.values(CONFIG.DND5E.spellSchools || {})
                .map((school) => school.fullKey?.toUpperCase())
                .filter(Boolean)
            );
        case 'castingTime':
          const commonCastingTimes = ['ACTION:1', 'BONUS:1', 'REACTION:1', 'MINUTE:1', 'MINUTE:10', 'HOUR:1', 'HOUR:8', 'HOUR:24', 'SPECIAL:1'];
          return [...commonCastingTimes];
        case 'damageType':
          const damageTypesWithHealing = {
            ...CONFIG.DND5E.damageTypes,
            healing: {
              label: game.i18n.localize('DND5E.Healing'),
              name: game.i18n.localize('DND5E.Healing')
            }
          };
          return Object.entries(damageTypesWithHealing)
            .sort((a, b) => {
              const labelA = a[0] === 'healing' ? damageTypesWithHealing.healing.label : genericUtils.getConfigLabel(CONFIG.DND5E.damageTypes, a[0]);
              const labelB = b[0] === 'healing' ? damageTypesWithHealing.healing.label : genericUtils.getConfigLabel(CONFIG.DND5E.damageTypes, b[0]);
              return labelA.localeCompare(labelB);
            })
            .map(([key]) => key.toUpperCase());
        case 'condition':
          return Object.entries(CONFIG.DND5E.conditionTypes || {})
            .filter(([_key, condition]) => !condition.pseudo)
            .map(([key]) => key.toUpperCase());
        case 'requiresSave':
        case 'concentration':
        case 'prepared':
        case 'favorited':
        case 'ritual':
          return ['TRUE', 'FALSE', 'YES', 'NO'];
        case 'materialComponents':
          return ['CONSUMED', 'NOTCONSUMED'];
        default:
          return [];
      }
    })();
    if (['level', 'school', 'castingTime', 'damageType', 'condition', 'range'].includes(fieldId)) return ['ALL', ...baseValues];
    return baseValues;
  }
}
