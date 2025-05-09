/**
 * Helper functions for creating DnD5e-styled form elements
 */

/**
 * Create a checkbox input using DnD5e styling
 * @param {Object} config - Configuration options
 * @param {string} config.name - Input name
 * @param {boolean} config.checked - Whether checkbox is checked
 * @param {string} config.label - Label text (optional)
 * @param {boolean} config.disabled - Whether checkbox is disabled
 * @param {string} config.ariaLabel - Accessibility label
 * @param {string} config.cssClass - Additional CSS classes
 * @param {Function} config.callback - Change event callback
 * @returns {HTMLElement} The created checkbox element
 */
export function createCheckbox(config) {
  const input = document.createElement('dnd5e-checkbox');
  input.name = config.name;
  if (config.checked) input.checked = true;
  if (config.disabled) input.disabled = true;
  if (config.ariaLabel) input.ariaLabel = config.ariaLabel;
  if (config.cssClass) input.className = config.cssClass;
  if (config.callback) input.addEventListener('change', config.callback);

  // If a label is provided, wrap the checkbox in a label element
  if (config.label) {
    const label = document.createElement('label');
    label.classList.add('checkbox');
    label.appendChild(input);
    const span = document.createElement('span');
    span.textContent = config.label;
    label.appendChild(span);
    return label;
  }

  return input;
}

/**
 * Create a number input using DnD5e styling
 * @param {Object} config - Configuration options
 * @returns {HTMLElement} The created number input
 */
export function createNumberInput(config) {
  // Use DnD5e's NumberField to create the input
  const input = document.createElement('input');
  input.type = 'number';
  input.name = config.name;
  input.value = config.value ?? '';

  if (config.min !== undefined) input.min = config.min;
  if (config.max !== undefined) input.max = config.max;
  if (config.step !== undefined) input.step = config.step;
  if (config.placeholder) input.placeholder = config.placeholder;
  if (config.ariaLabel) input.ariaLabel = config.ariaLabel;
  if (config.disabled) input.disabled = true;
  if (config.cssClass) input.className = config.cssClass;

  // Note: In a real implementation, we would use DnD5e's NumberField.toInput
  return input;
}

/**
 * Create a text input using DnD5e styling
 * @param {Object} config - Configuration options
 * @returns {HTMLElement} The created text input
 */
export function createTextInput(config) {
  // Use DnD5e's StringField to create the input
  const input = document.createElement('input');
  input.type = 'text';
  input.name = config.name;
  input.value = config.value ?? '';

  if (config.placeholder) input.placeholder = config.placeholder;
  if (config.ariaLabel) input.ariaLabel = config.ariaLabel;
  if (config.disabled) input.disabled = true;
  if (config.cssClass) input.className = config.cssClass;

  // Note: In a real implementation, we would use DnD5e's StringField.toInput
  return input;
}

/**
 * Create a select dropdown using DnD5e styling
 * @param {Object} config - Configuration options
 * @returns {HTMLElement} The created select element
 */
export function createSelect(config) {
  const select = document.createElement('select');
  select.name = config.name;

  if (config.ariaLabel) select.ariaLabel = config.ariaLabel;
  if (config.disabled) select.disabled = true;
  if (config.cssClass) select.className = config.cssClass;

  // Add options
  if (config.options) {
    for (const option of config.options) {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      if (option.selected) optionEl.selected = true;
      select.appendChild(optionEl);
    }
  }

  return select;
}

/**
 * Convert a DOM element to its HTML string representation
 * @param {HTMLElement} element - The DOM element to convert
 * @returns {string} HTML string representation
 */
export function elementToHtml(element) {
  if (!element) return '';

  // For single elements
  if (element instanceof HTMLElement) {
    const container = document.createElement('div');
    container.appendChild(element.cloneNode(true));
    return container.innerHTML;
  }

  // For element collections or DocumentFragments
  if (element instanceof DocumentFragment) {
    const container = document.createElement('div');
    container.appendChild(element.cloneNode(true));
    return container.innerHTML;
  }

  // In case it's already a string
  return String(element);
}
