/**
 * Helper functions for creating DnD5e-styled form elements
 * These thin wrappers call the dnd5e form field creation methods directly
 */

/**
 * Create a checkbox input using DnD5e styling
 * @param {Object} config - Configuration options
 * @returns {HTMLElement} The created checkbox element
 */
export function createCheckbox(config) {
  const field = new foundry.data.fields.BooleanField();
  const fieldConfig = {
    name: config.name,
    value: config.checked || false,
    disabled: config.disabled,
    ariaLabel: config.ariaLabel,
    classes: config.cssClass
  };

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
 * @returns {HTMLElement} The created number input
 */
export function createNumberInput(config) {
  const field = new foundry.data.fields.NumberField({
    min: config.min,
    max: config.max,
    step: config.step
  });

  const fieldConfig = {
    name: config.name,
    value: config.value,
    placeholder: config.placeholder,
    disabled: config.disabled,
    ariaLabel: config.ariaLabel,
    classes: config.cssClass
  };

  return dnd5e.applications.fields.createNumberInput(field, fieldConfig);
}

/**
 * Create a text input using DnD5e styling
 * @param {Object} config - Configuration options
 * @returns {HTMLElement} The created text input
 */
export function createTextInput(config) {
  const field = new foundry.data.fields.StringField();

  const fieldConfig = {
    name: config.name,
    value: config.value || '',
    placeholder: config.placeholder,
    disabled: config.disabled,
    ariaLabel: config.ariaLabel,
    classes: config.cssClass
  };

  return dnd5e.applications.fields.createTextInput(field, fieldConfig);
}

/**
 * Create a select dropdown using DnD5e styling
 * @param {Object} config - Configuration options
 * @returns {HTMLElement} The created select element
 */
export function createSelect(config) {
  const select = document.createElement('select');
  select.name = config.name;

  if (config.ariaLabel) select.setAttribute('aria-label', config.ariaLabel);
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
