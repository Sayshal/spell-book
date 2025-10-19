/**
 * D&D 5e Styled Form Element Creation Utilities
 *
 * Provides utilities for creating form elements that match the D&D 5e system styling
 * and behavior. This module wraps Foundry's field creation system to provide
 * consistent form controls throughout the Spell Book module interface.
 *
 * Key Features:
 * - D&D 5e system styling consistency
 * - Configuration options for all form elements
 * - Accessibility support with ARIA labels
 * - Flexible styling and layout options
 * - Generic multi-select wrapper with optgroup support
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
 * Configuration options for multi-select creation.
 *
 * @typedef {Object} MultiSelectConfig
 * @property {string} name - The name attribute for the multi-select element
 * @property {string} [type="select"] - Multi-select type ("select" or "checkboxes")
 * @property {Array<string>} [selectedValues=[]] - Array of currently selected values
 * @property {Array<string>} [groups] - Array of group labels in desired order
 * @property {boolean} [disabled] - Whether the multi-select is disabled
 * @property {string} [ariaLabel] - The aria-label attribute for accessibility
 * @property {string} [cssClass] - Additional CSS classes to apply
 * @property {boolean} [localize=true] - Whether to localize labels and groups
 * @property {boolean} [sort=true] - Whether to sort options within groups
 * @property {string} [blank] - Blank option text (if desired)
 */

/**
 * Multi-select option configuration.
 *
 * @typedef {Object} MultiSelectOption
 * @property {string} value - The option value
 * @property {string} label - The option display text
 * @property {boolean} [selected] - Whether this option is selected (auto-determined from selectedValues if not provided)
 * @property {boolean} [disabled] - Whether this option is disabled
 * @property {string} [group] - Group label this option belongs to
 * @property {string} [rule] - CSS rule for styling (optional)
 * @property {Object} [dataset] - Dataset attributes for the option
 */

/**
 * Configuration options for counter group creation.
 *
 * @typedef {Object} CounterGroupConfig
 * @property {string} identifier - Unique identifier for the control
 * @property {string} decreaseAction - Action name for decrease button (data-action attribute)
 * @property {string} increaseAction - Action name for increase button (data-action attribute)
 * @property {string} inputName - Name attribute for the input
 * @property {number} currentValue - Current value
 * @property {number} [min] - Minimum allowed value
 * @property {number} [max] - Maximum allowed value
 * @property {number} [step=1] - Step increment value
 * @property {string} decreaseLabel - Localization key for decrease button aria-label
 * @property {string} increaseLabel - Localization key for increase button aria-label
 * @property {string} inputLabel - Localization key for input aria-label
 * @property {string} [inputCssClass] - Additional CSS class for input element
 */

/**
 * Configuration for localized option creation.
 *
 * @typedef {Object} LocalizedOptionConfig
 * @property {string} value - The option value
 * @property {string} labelKey - Localization key for the label
 */

/**
 * Configuration options for button creation.
 *
 * @typedef {Object} ButtonConfig
 * @property {string} [type='button'] - Button type ('submit', 'button', 'reset')
 * @property {string} [name] - Name attribute for the button
 * @property {string} labelKey - Localization key for button label
 * @property {string} [iconClass] - Font Awesome icon class (e.g., 'fas fa-save')
 * @property {string} [cssClass=''] - CSS class for the button
 * @property {boolean} [disabled=false] - Whether button is disabled
 * @property {Object} [dataset] - Dataset attributes to apply to the button
 * @property {string} [ariaLabel] - Optional aria-label override (defaults to labelKey localization)
 */

/**
 * Create a checkbox input using D&D 5e styling.
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
 * Create a multi-select element using Foundry's native multi-select functionality.
 * @param {Array<MultiSelectOption>} options - Array of option configurations
 * @param {MultiSelectConfig} config - Multi-select configuration
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
 * @param {Array<MultiSelectOption>} groupedOptions - Options with group properties
 * @param {Array<string>} groups - Ordered array of group labels
 * @param {MultiSelectConfig} config - Multi-select configuration
 * @returns {HTMLElement} The created multi-select element
 */
export function createGroupedMultiSelect(groupedOptions, groups, config) {
  return createMultiSelect(groupedOptions, {
    ...config,
    groups: groups
  });
}

/**
 * Create a counter group with increment/decrement buttons and number input.
 * @param {CounterGroupConfig} config - Counter group configuration
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
 * @param {Array<LocalizedOptionConfig>} optionConfigs - Array of option configurations
 * @param {string} selectedValue - Currently selected value
 * @returns {Array<SelectOption>} Array of options with localized labels and selected state
 */
export function createLocalizedOptions(optionConfigs, selectedValue) {
  return optionConfigs.map((config) => ({ value: config.value, label: game.i18n.localize(config.labelKey), selected: selectedValue === config.value }));
}

/**
 * Create a select dropdown with localized options.
 * @param {string} name - Name attribute for the select
 * @param {Array<LocalizedOptionConfig>} optionConfigs - Option configurations
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
 * @param {ButtonConfig} config - Button configuration options
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
