/**
 * Create a checkbox input using DnD5e styling
 * @param {Object} config - Configuration options
 * @param {string} config.name - The name attribute for the checkbox
 * @param {boolean} [config.checked=false] - Whether the checkbox is checked
 * @param {boolean} [config.disabled] - Whether the checkbox is disabled
 * @param {string} [config.ariaLabel] - The aria-label attribute
 * @param {string} [config.cssClass] - Additional CSS classes
 * @param {string} [config.label] - Label text to display next to the checkbox
 * @returns {HTMLElement} The created checkbox element
 */
export function createCheckbox(config) {
  const field = new foundry.data.fields.BooleanField();
  const fieldConfig = { name: config.name, value: config.checked || false, disabled: config.disabled, ariaLabel: config.ariaLabel, classes: config.cssClass };
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
 * Create a number input using DnD5e styling
 * @param {Object} config - Configuration options
 * @param {string} config.name - The name attribute for the input
 * @param {number|string} [config.value] - The input value
 * @param {number} [config.min] - Minimum allowed value
 * @param {number} [config.max] - Maximum allowed value
 * @param {number} [config.step] - Step increment value
 * @param {string} [config.placeholder] - Placeholder text
 * @param {boolean} [config.disabled] - Whether the input is disabled
 * @param {string} [config.ariaLabel] - The aria-label attribute
 * @param {string} [config.cssClass] - Additional CSS classes
 * @returns {HTMLElement} The created number input
 */
export function createNumberInput(config) {
  const field = new foundry.data.fields.NumberField({ min: config.min, max: config.max, step: config.step });
  const fieldConfig = { name: config.name, value: config.value, placeholder: config.placeholder, disabled: config.disabled, ariaLabel: config.ariaLabel, classes: config.cssClass };
  return dnd5e.applications.fields.createNumberInput(field, fieldConfig);
}

/**
 * Create a text input using DnD5e styling
 * @param {Object} config - Configuration options
 * @param {string} config.name - The name attribute for the input
 * @param {string} [config.value] - The input value
 * @param {string} [config.placeholder] - Placeholder text
 * @param {boolean} [config.disabled] - Whether the input is disabled
 * @param {string} [config.ariaLabel] - The aria-label attribute
 * @param {string} [config.cssClass] - Additional CSS classes
 * @returns {HTMLElement} The created text input
 */
export function createTextInput(config) {
  const field = new foundry.data.fields.StringField();
  const fieldConfig = { name: config.name, value: config.value || '', placeholder: config.placeholder, disabled: config.disabled, ariaLabel: config.ariaLabel, classes: config.cssClass };
  return dnd5e.applications.fields.createTextInput(field, fieldConfig);
}

/**
 * Create a select dropdown using DnD5e styling
 * @param {Object} config - Configuration options
 * @param {string} config.name - The name attribute for the select
 * @param {Array} [config.options] - Array of option objects { value, label, selected, disabled, optgroup }
 * @param {string} [config.ariaLabel] - The aria-label attribute
 * @param {boolean} [config.disabled] - Whether the select is disabled
 * @param {string} [config.cssClass] - Additional CSS classes
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
 * Convert a DOM element to its HTML string representation
 * @param {HTMLElement|DocumentFragment|string} element - The DOM element to convert
 * @returns {string} HTML string representation
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
