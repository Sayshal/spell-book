/**
 * Field Definitions for Advanced Search Syntax
 *
 * Provides field mapping, validation, and autocomplete support for the advanced search
 * system. This module manages the relationship between search aliases and internal field
 * identifiers, validates search values against field constraints, and provides
 * autocomplete suggestions for search terms.
 *
 * The field definition system supports:
 * - Field alias to ID mapping for flexible search syntax
 * - Value validation based on D&D 5e configuration data
 * - Boolean value normalization for consistent filtering
 * - Autocomplete suggestions for valid field values
 *
 * @module ValidationHelpers/FieldDefinitions
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import * as DataHelpers from '../data/_module.mjs';
import { log } from '../logger.mjs';

/**
 * Field validation function that checks if a value is valid for a specific field.
 *
 * @typedef {function} FieldValidator
 * @param {string} value - The value to validate
 * @returns {boolean} Whether the value is valid for the field
 */

/**
 * Field definitions for advanced search syntax.
 * Manages field mappings, validation, and autocomplete functionality for the search system.
 */
export class FieldDefinitions {
  /**
   * Create a new FieldDefinitions instance and initialize field mappings and validators.
   * Automatically sets up field aliases and validation rules based on module configuration.
   */
  constructor() {
    /** @type {Map<string, string>} Map of uppercase field aliases to field IDs */
    this.fieldMap = new Map();

    /** @type {Map<string, FieldValidator>} Map of field IDs to validation functions */
    this.valueValidators = new Map();

    this._initializeFields();
  }

  /**
   * Initialize field mappings from module configuration.
   * Sets up field aliases and validation rules for all configured search fields.
   *
   * @private
   */
  _initializeFields() {
    for (const filter of MODULE.DEFAULT_FILTER_CONFIG) {
      if (filter.searchAliases) {
        for (const alias of filter.searchAliases) this.fieldMap.set(alias.toUpperCase(), filter.id);
        this._setupValueValidator(filter.id);
      }
    }
    log(3, 'Field definitions initialized:', this.fieldMap);
  }

  /**
   * Setup value validators for different field types.
   * Creates appropriate validation functions based on field type and D&D 5e configuration.
   *
   * @private
   * @param {string} fieldId - The field ID to setup validation for
   */
  _setupValueValidator(fieldId) {
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
                  const label = DataHelpers.getConfigLabel(
                    CONFIG.DND5E.spellSchools,
                    Object.keys(CONFIG.DND5E.spellSchools).find((k) => CONFIG.DND5E.spellSchools[k] === school)
                  )?.toUpperCase();
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
   * Get field ID from alias.
   * Converts search aliases to internal field identifiers for query processing.
   *
   * @param {string} alias - The field alias to look up
   * @returns {string|null} The field ID or null if not found
   */
  getFieldId(alias) {
    return this.fieldMap.get(alias.toUpperCase()) || null;
  }

  /**
   * Validate field value against field-specific constraints.
   * Uses the appropriate validator function for the field type.
   *
   * @param {string} fieldId - The field ID to validate against
   * @param {string} value - The value to validate
   * @returns {boolean} Whether the value is valid for the field
   */
  validateValue(fieldId, value) {
    const validator = this.valueValidators.get(fieldId);
    return validator ? validator(value) : true;
  }

  /**
   * Normalize boolean values to consistent string representations.
   * Converts various boolean representations to 'true' or 'false' strings.
   *
   * @param {string} value - The value to normalize
   * @returns {string} Normalized boolean value ('true', 'false', or original value)
   */
  normalizeBooleanValue(value) {
    const val = value.toUpperCase();
    if (['TRUE', 'YES'].includes(val)) return 'true';
    if (['FALSE', 'NO'].includes(val)) return 'false';
    return value;
  }

  /**
   * Get all field aliases for autocomplete functionality.
   * Returns all available field aliases that can be used in search queries.
   *
   * @returns {Array<string>} Array of field aliases in uppercase
   */
  getAllFieldAliases() {
    return Array.from(this.fieldMap.keys());
  }

  /**
   * Get valid values for a field for autocomplete suggestions.
   * Returns an array of valid values that can be used with the specified field.
   *
   * @param {string} fieldId - The field ID to get valid values for
   * @returns {Array<string>} Array of valid values for the field
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
              const labelA = a[0] === 'healing' ? damageTypesWithHealing.healing.label : DataHelpers.getConfigLabel(CONFIG.DND5E.damageTypes, a[0]);
              const labelB = b[0] === 'healing' ? damageTypesWithHealing.healing.label : DataHelpers.getConfigLabel(CONFIG.DND5E.damageTypes, b[0]);
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
