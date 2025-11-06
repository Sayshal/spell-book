/**
 * D&D 5e Styled Form Element Creation Utilities
 *
 * Provides utilities for creating form elements that match the D&D 5e system styling
 * and behavior. This module wraps Foundry's field creation system to provide
 * consistent form controls throughout the Spell Book module interface.
 *
 * @module ValidationUtils/FormElements
 * @author Tyler
 */

/**
 * Create a checkbox input using D&D 5e styling.
 * @param {Object} config - Configuration options for the checkbox
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
 * @param {Object} config - Configuration options for the number input
 * @returns {HTMLElement} The created number input element
 */
export function createNumberInput(config) {
  const field = new foundry.data.fields.NumberField({ min: config.min, max: config.max, step: config.step });
  const fieldConfig = { name: config.name, value: config.value, placeholder: config.placeholder, disabled: config.disabled, ariaLabel: config.ariaLabel, classes: config.cssClass };
  return dnd5e.applications.fields.createNumberInput(field, fieldConfig);
}

/**
 * Create a text input using D&D 5e styling.
 * @param {Object} config - Configuration options for the text input
 * @returns {HTMLElement} The created text input element
 */
export function createTextInput(config) {
  const field = new foundry.data.fields.StringField();
  const fieldConfig = { name: config.name, value: config.value || '', placeholder: config.placeholder, disabled: config.disabled, ariaLabel: config.ariaLabel, classes: config.cssClass };
  return dnd5e.applications.fields.createTextInput(field, fieldConfig);
}

/**
 * Create a select dropdown using D&D 5e styling.
 * @param {Object} config - Configuration options for the select dropdown
 * @returns {HTMLElement} The created select element
 */
export function createSelect(config) {
  const options = [];
  let currentGroup = null;
  for (const option of config.options) {
    if (option.optgroup === 'start') currentGroup = option.label;
    else if (option.optgroup === 'end') currentGroup = null;
    else options.push({ value: option.value, label: option.label, selected: option.selected, disabled: option.disabled, group: currentGroup, rule: option.rule, dataset: option.dataset });
  }
  return foundry.applications.fields.createSelectInput({
    name: config.name,
    options: options,
    aria: config.ariaLabel ? { label: config.ariaLabel } : undefined,
    disabled: config.disabled,
    classes: config.cssClass
  });
}

/**
 * Create a multi-select element using Foundry's native multi-select functionality.
 * @param {Array<Object>} options - Array of option configurations
 * @param {Object} config - Multi-select configuration
 * @returns {HTMLElement} The created multi-select element
 */
export function createMultiSelect(options, config) {
  const multiSelectConfig = {
    name: config.name,
    type: config.type || 'select',
    options: options,
    groups: config.groups || [],
    localize: config.localize !== false,
    sort: config.sort !== false,
    value: config.selectedValues || [],
    disabled: config.disabled || '',
    ariaLabel: config.ariaLabel || '',
    classes: config.cssClass || '',
    blank: config.blank || false
  };
  return foundry.applications.fields.createMultiSelectInput(multiSelectConfig);
}

/**
 * Create a multi-select element with pre-grouped options.
 * @param {Array<Object>} groupedOptions - Options with group properties
 * @param {Array<string>} groups - Ordered array of group labels
 * @param {Object} config - Multi-select configuration
 * @returns {HTMLElement} The created multi-select element
 */
export function createGroupedMultiSelect(groupedOptions, groups, config) {
  return createMultiSelect(groupedOptions, { ...config, groups: groups });
}

/**
 * Create a counter group with increment/decrement buttons and number input.
 * @param {Object} config - Counter group configuration
 * @returns {string} HTML string for the complete counter group
 */
export function createCounterGroup(config) {
  const container = document.createElement('div');
  container.className = 'counter-group';
  const decreaseButton = document.createElement('button');
  decreaseButton.type = 'button';
  decreaseButton.dataset.class = config.identifier;
  decreaseButton.dataset.action = config.decreaseAction;
  decreaseButton.textContent = '−';
  decreaseButton.setAttribute('aria-label', game.i18n.localize(config.decreaseLabel));
  const input = createNumberInput({
    name: config.inputName,
    value: config.currentValue,
    min: config.min,
    max: config.max,
    step: config.step ?? 1,
    cssClass: config.inputCssClass,
    ariaLabel: game.i18n.localize(config.inputLabel)
  });
  input.id = `${config.identifier}-input`;
  const increaseButton = document.createElement('button');
  increaseButton.type = 'button';
  increaseButton.dataset.class = config.identifier;
  increaseButton.dataset.action = config.increaseAction;
  increaseButton.textContent = '+';
  increaseButton.setAttribute('aria-label', game.i18n.localize(config.increaseLabel));
  container.appendChild(decreaseButton);
  container.appendChild(input);
  container.appendChild(increaseButton);
  return elementToHtml(container);
}

/**
 * Create options array with localized labels and automatic selection.
 * @param {Array<Object>} optionConfigs - Array of option configurations
 * @param {string} selectedValue - Currently selected value
 * @returns {Array<Object>} Array of options with localized labels and selected state
 */
export function createLocalizedOptions(optionConfigs, selectedValue) {
  return optionConfigs.map((config) => ({ value: config.value, label: game.i18n.localize(config.labelKey), selected: selectedValue === config.value }));
}

/**
 * Create a select dropdown with localized options.
 * @param {string} name - Name attribute for the select
 * @param {Array<Object>} optionConfigs - Option configurations
 * @param {string} selectedValue - Currently selected value
 * @param {string} ariaLabelKey - Localization key for aria-label
 * @param {string} [id] - Optional ID for the select element
 * @returns {HTMLElement} The created select element
 */
export function createLocalizedSelect(name, optionConfigs, selectedValue, ariaLabelKey, id = null) {
  const options = createLocalizedOptions(optionConfigs, selectedValue);
  const select = createSelect({ name, options, ariaLabel: game.i18n.localize(ariaLabelKey) });
  if (id) select.id = id;
  return select;
}

/**
 * Create a button with optional icon and localized label.
 * @param {Object} config - Button configuration options
 * @returns {HTMLElement} The created button element
 */
export function createButton(config) {
  const button = document.createElement('button');
  button.type = config.type || 'button';
  if (config.name) button.name = config.name;
  button.className = config.cssClass || '';
  button.disabled = config.disabled || false;
  const label = game.i18n.localize(config.labelKey);
  button.setAttribute('aria-label', config.ariaLabel || label);
  if (config.iconClass) {
    const icon = document.createElement('i');
    icon.className = config.iconClass;
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    button.appendChild(document.createTextNode(` ${label}`));
  } else button.textContent = label;
  if (config.dataset) {
    Object.entries(config.dataset).forEach(([key, value]) => {
      button.dataset[key] = value;
    });
  }
  return button;
}

/**
 * Convert a DOM element to its HTML string representation.
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
