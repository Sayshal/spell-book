/**
 * D&D 5e Styled Form Element Creation Utilities
 *
 * Provides utilities for creating form elements that match the D&D 5e system styling
 * and behavior. This module wraps Foundry's field creation system to provide
 * consistent form controls throughout the Spell Book module interface.
 *
 * Key Features:
 * - D&D 5e system styling consistency
 * - Comprehensive configuration options for all form elements
 * - Accessibility support with ARIA labels
 * - Flexible styling and layout options
 *
 * @module ValidationHelpers/FormElements
 * @author Tyler
 */

/**
 * Configuration options for checkbox creation.
 *
 * @typedef {Object} CheckboxConfig
 * @property {string} name - The name attribute for the checkbox input
 * @property {boolean} [checked=false] - Whether the checkbox is initially checked
 * @property {boolean} [disabled] - Whether the checkbox is disabled
 * @property {string} [ariaLabel] - The aria-label attribute for accessibility
 * @property {string} [cssClass] - Additional CSS classes to apply
 * @property {string} [label] - Label text to display next to the checkbox
 */

/**
 * Configuration options for number input creation.
 *
 * @typedef {Object} NumberInputConfig
 * @property {string} name - The name attribute for the input
 * @property {number|string} [value] - The initial input value
 * @property {number} [min] - Minimum allowed value
 * @property {number} [max] - Maximum allowed value
 * @property {number} [step] - Step increment value for the input
 * @property {string} [placeholder] - Placeholder text to display
 * @property {boolean} [disabled] - Whether the input is disabled
 * @property {string} [ariaLabel] - The aria-label attribute for accessibility
 * @property {string} [cssClass] - Additional CSS classes to apply
 */

/**
 * Configuration options for text input creation.
 *
 * @typedef {Object} TextInputConfig
 * @property {string} name - The name attribute for the input
 * @property {string} [value] - The initial input value
 * @property {string} [placeholder] - Placeholder text to display
 * @property {boolean} [disabled] - Whether the input is disabled
 * @property {string} [ariaLabel] - The aria-label attribute for accessibility
 * @property {string} [cssClass] - Additional CSS classes to apply
 */

/**
 * Configuration options for select dropdown creation.
 *
 * @typedef {Object} SelectConfig
 * @property {string} name - The name attribute for the select element
 * @property {Array<SelectOption>} [options] - Array of option configurations
 * @property {string} [ariaLabel] - The aria-label attribute for accessibility
 * @property {boolean} [disabled] - Whether the select is disabled
 * @property {string} [cssClass] - Additional CSS classes to apply
 */

/**
 * Option configuration for select dropdowns.
 *
 * @typedef {Object} SelectOption
 * @property {string} value - The option value
 * @property {string} label - The option display text
 * @property {boolean} [selected] - Whether this option is selected
 * @property {boolean} [disabled] - Whether this option is disabled
 * @property {string} [optgroup] - Optgroup control ('start', 'end', or undefined)
 */

/**
 * Create a checkbox input using D&D 5e styling.
 * Generates a checkbox that matches the D&D 5e system's visual style and behavior.
 *
 * @param {CheckboxConfig} config - Configuration options for the checkbox
 * @returns {HTMLElement} The created checkbox element (or label wrapper if label provided)
 */
export function createCheckbox(config) {
  const field = new foundry.data.fields.BooleanField();
  const fieldConfig = { name: config.name, value: config.checked || false, disabled: config.disabled, ariaLabel: config.ariaLabel, classes: config.cssClass || '' };
  const checkbox = dnd5e.applications.fields.createCheckboxInput(field, fieldConfig);
  if (config.label) {
    const label = document.createElement('label');
    label.classList.add('checkbox');
    label.appendChild(checkbox);
    const span = document.createElement('span');
    span.textContent = config.label;
    label.appendChild(span);
    return label;
  }
  return checkbox;
}

/**
 * Create a number input using D&D 5e styling.
 * Generates a number input that matches the D&D 5e system's visual style and behavior.
 *
 * @param {NumberInputConfig} config - Configuration options for the number input
 * @returns {HTMLElement} The created number input element
 */
export function createNumberInput(config) {
  const field = new foundry.data.fields.NumberField({ min: config.min, max: config.max, step: config.step });
  const fieldConfig = { name: config.name, value: config.value, placeholder: config.placeholder, disabled: config.disabled, ariaLabel: config.ariaLabel, classes: config.cssClass };
  return dnd5e.applications.fields.createNumberInput(field, fieldConfig);
}

/**
 * Create a text input using D&D 5e styling.
 * Generates a text input that matches the D&D 5e system's visual style and behavior.
 *
 * @param {TextInputConfig} config - Configuration options for the text input
 * @returns {HTMLElement} The created text input element
 */
export function createTextInput(config) {
  const field = new foundry.data.fields.StringField();
  const fieldConfig = { name: config.name, value: config.value || '', placeholder: config.placeholder, disabled: config.disabled, ariaLabel: config.ariaLabel, classes: config.cssClass };
  return dnd5e.applications.fields.createTextInput(field, fieldConfig);
}

/**
 * Create a select dropdown using D&D 5e styling.
 * Generates a select element with support for option groups and D&D 5e styling.
 *
 * @param {SelectConfig} config - Configuration options for the select dropdown
 * @returns {HTMLElement} The created select element
 */
export function createSelect(config) {
  const select = document.createElement('select');
  select.name = config.name;
  if (config.ariaLabel) select.setAttribute('aria-label', config.ariaLabel);
  if (config.disabled) select.disabled = true;
  if (config.cssClass) select.className = config.cssClass;
  if (config.options && Array.isArray(config.options)) {
    let currentOptgroup = null;
    for (const option of config.options) {
      if (option.optgroup === 'start') {
        currentOptgroup = document.createElement('optgroup');
        currentOptgroup.label = option.label;
        select.appendChild(currentOptgroup);
      } else if (option.optgroup === 'end') {
        currentOptgroup = null;
      } else {
        const optionEl = document.createElement('option');
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        if (option.selected) {
          optionEl.selected = true;
          optionEl.setAttribute('selected', 'selected');
        }
        if (option.disabled) optionEl.disabled = true;
        if (currentOptgroup) currentOptgroup.appendChild(optionEl);
        else select.appendChild(optionEl);
      }
    }
  }
  return select;
}

/**
 * Convert a DOM element to its HTML string representation.
 * Utility function for converting DOM elements to HTML strings for template rendering.
 *
 * @param {HTMLElement|DocumentFragment|string} element - The DOM element to convert
 * @returns {string} HTML string representation of the element
 */
export function elementToHtml(element) {
  if (!element) return '';
  if (element instanceof HTMLElement) {
    const container = document.createElement('div');
    container.appendChild(element.cloneNode(true));
    return container.innerHTML;
  }
  if (element instanceof DocumentFragment) {
    const container = document.createElement('div');
    container.appendChild(element.cloneNode(true));
    return container.innerHTML;
  }
  return String(element);
}
