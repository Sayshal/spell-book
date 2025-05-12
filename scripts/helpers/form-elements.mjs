/**
 * Helper functions for creating DnD5e-styled form elements
 */

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
  try {
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
  } catch (error) {
    log(1, `Error creating checkbox: ${error.message}`);
    return document.createElement('dnd5e-checkbox'); // Fallback
  }
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
  try {
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
  } catch (error) {
    log(1, `Error creating number input: ${error.message}`);
    const input = document.createElement('input');
    input.type = 'number';
    input.name = config.name;
    if (config.value !== undefined) input.value = config.value;
    return input; // Fallback
  }
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
  try {
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
  } catch (error) {
    log(1, `Error creating text input: ${error.message}`);
    const input = document.createElement('input');
    input.type = 'text';
    input.name = config.name;
    if (config.value !== undefined) input.value = config.value;
    return input; // Fallback
  }
}

/**
 * Create a select dropdown using DnD5e styling
 * @param {Object} config - Configuration options
 * @param {string} config.name - The name attribute for the select
 * @param {Array} [config.options] - Array of option objects { value, label, selected }
 * @param {string} [config.ariaLabel] - The aria-label attribute
 * @param {boolean} [config.disabled] - Whether the select is disabled
 * @param {string} [config.cssClass] - Additional CSS classes
 * @returns {HTMLElement} The created select element
 */
export function createSelect(config) {
  try {
    const select = document.createElement('select');
    select.name = config.name;

    if (config.ariaLabel) select.setAttribute('aria-label', config.ariaLabel);
    if (config.disabled) select.disabled = true;
    if (config.cssClass) select.className = config.cssClass;

    // Add options
    if (config.options && Array.isArray(config.options)) {
      for (const option of config.options) {
        const optionEl = document.createElement('option');
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        if (option.selected) optionEl.selected = true;
        select.appendChild(optionEl);
      }
    }

    return select;
  } catch (error) {
    log(1, `Error creating select: ${error.message}`);
    return document.createElement('select'); // Fallback
  }
}

/**
 * Convert a DOM element to its HTML string representation
 * @param {HTMLElement|DocumentFragment|string} element - The DOM element to convert
 * @returns {string} HTML string representation
 */
export function elementToHtml(element) {
  try {
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
  } catch (error) {
    log(1, `Error converting element to HTML: ${error.message}`);
    return '';
  }
}
