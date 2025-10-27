/**
 * Player Filter Configuration Application
 *
 * A configuration interface for customizing spell browser filters.
 * This application allows users to enable/disable filters, reorder them through
 * drag-and-drop functionality, and reset to default configurations. It provides
 * both visual and programmatic validation to ensure filter configurations remain
 * functional and user-friendly.
 *
 * @module Applications/PlayerFilterConfiguration
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as ValidationUtils from '../validation/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { DragDrop } = foundry.applications.ux;

/**
 * Application to configure which filters are displayed in the spell browser.
 */
export class PlayerFilterConfiguration extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: `filter-config-${MODULE.ID}`,
    tag: 'form',
    window: { title: 'SPELLBOOK.Settings.ConfigureFilters' },
    modal: true,
    classes: ['spell-book', 'filter-configuration'],
    form: {
      handler: PlayerFilterConfiguration.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: { top: 75 },
    actions: { reset: PlayerFilterConfiguration.handleReset },
    dragDrop: [{ dragSelector: '.filter-config-item', dropSelector: '.filter-config-list' }]
  };

  /** @inheritdoc */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.FILTER_CONFIG } };

  /**
   * Current filter configuration array.
   * @type {Array<FilterConfigItem>}
   */
  config = [];

  /**
   * Create a new filter configuration instance.
   * @param {Application} parentApp - The parent application that opened this configuration
   * @param {Object} [options={}] - Additional application options
   */
  constructor(parentApp, options = {}) {
    super(options);

    /** @type {Application} The parent application instance */
    this.parentApp = parentApp;

    this.initializeConfig();

    log(3, 'PlayerFilterConfiguration constructed.');
  }

  /**
   * Initialize the filter configuration from settings or defaults.
   * @returns {void}
   */
  initializeConfig() {
    try {
      let configData = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
      if (Array.isArray(configData) || (configData && !configData.version)) {
        configData = { version: MODULE.DEFAULT_FILTER_CONFIG_VERSION, filters: foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG) };
        game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, configData);
      }
      let config = configData?.filters || [];
      if (!config || config.length === 0) {
        config = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
      } else {
        config = config.map((filter) => {
          const defaultFilter = MODULE.DEFAULT_FILTER_CONFIG.find((df) => df.id === filter.id);
          if (defaultFilter) return { ...filter, sortable: defaultFilter.sortable !== undefined ? defaultFilter.sortable : true };
          return { ...filter, sortable: filter.sortable !== undefined ? filter.sortable : true };
        });
      }
      this.config = foundry.utils.deepClone(config);
    } catch (error) {
      log(2, 'No config object found, restoring to default.', error);
      this.config = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
    }
  }

  /** @inheritdoc */
  _prepareContext(options) {
    const context = super._prepareContext(options);
    if (!Array.isArray(this.config) || this.config.length === 0) this.initializeConfig();
    context.filterConfig = this._prepareFilterConfigFormData();
    context.buttons = this._prepareFormButtons();
    log(3, 'Filter Configuration Context:', { context });
    return context;
  }

  /**
   * Get the current valid filter configuration.
   * @returns {Array<FilterConfigItem>} The current filter configuration or default if invalid
   * @static
   */
  static getValidConfiguration() {
    const config = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
    if (!config || !Array.isArray(config) || config.length === 0) return foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
    log(3, 'Valid Config:', { config });
    return config;
  }

  /**
   * Prepare filter configuration form data with constructed elements.
   * @returns {Array<Object>} Array of filter configuration objects with form elements
   * @private
   */
  _prepareFilterConfigFormData() {
    log(3, 'Preparing filter config formdata.');
    return this.config.map((filter) => {
      const sortable = !(filter.id === 'name' || filter.id === 'prepared' || filter.id === 'ritual');
      const checkbox = ValidationUtils.createCheckbox({
        name: `enabled-${filter.id}`,
        checked: filter.enabled,
        ariaLabel: game.i18n.format('SPELLBOOK.Settings.EnableFilter', { name: game.i18n.localize(filter.label) })
      });
      checkbox.id = `enabled-${filter.id}`;
      return { ...filter, sortable: filter.sortable !== undefined ? filter.sortable : sortable, checkboxHtml: ValidationUtils.elementToHtml(checkbox) };
    });
  }

  /**
   * Prepare form buttons configuration.
   * @returns {Array<Object>} Array of button configurations
   * @private
   */
  _prepareFormButtons() {
    return [
      { type: 'submit', icon: 'fas fa-save', label: 'SPELLBOOK.UI.Save' },
      { type: 'button', action: 'reset', icon: 'fas fa-undo', label: 'SPELLBOOK.UI.Reset' }
    ];
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.setDraggableAttributes();
    this.setupDragDrop();
    log(3, 'Rendering');
  }

  /**
   * Set up drag and drop handlers for filter reordering.
   * @returns {void}
   */
  setupDragDrop() {
    this.options.dragDrop.forEach((dragDropOptions) => {
      dragDropOptions.permissions = { dragstart: true, drop: true };
      dragDropOptions.callbacks = { dragstart: this.onDragStart.bind(this), dragover: this.onDragOver.bind(this), drop: this.onDrop.bind(this) };
      const dragDropHandler = new DragDrop(dragDropOptions);
      dragDropHandler.bind(this.element);
    });
    log(3, 'Setup DragDrop');
  }

  /**
   * Set draggable attributes on filter items.
   * @returns {void}
   */
  setDraggableAttributes() {
    const items = this.element.querySelectorAll('.filter-config-item');
    items.forEach((item) => {
      const li = item.closest('li');
      const isSortable = !li.classList.contains('not-sortable');
      item.setAttribute('draggable', isSortable ? 'true' : 'false');
    });
    log(3, 'Setup Draggable Attributes');
  }

  /**
   * Handle drag start event for filter reordering.
   * @param {DragEvent} event - The drag event
   * @returns {boolean} Whether drag start was successful
   */
  onDragStart(event) {
    const li = event.currentTarget.closest('li');
    if (!li || li.classList.contains('not-sortable')) return false;
    this._formState = this._captureFormState();
    const filterIndex = li.dataset.index;
    const dragData = { type: 'filter-config', index: filterIndex };
    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    li.classList.add('dragging');
    log(3, 'Drag started!');
    return true;
  }

  /**
   * Handle drag over event to show drop position.
   * @param {DragEvent} event - The drag event
   * @param {string} _selector - The selector for drag targets (unused)
   * @returns {void}
   */
  onDragOver(event, _selector) {
    event.preventDefault();
    const list = this.element.querySelector('.filter-config-list');
    if (!list) return;
    const draggingItem = list.querySelector('.dragging');
    if (!draggingItem) return;
    const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
    if (!items.length) return;
    const targetItem = this.getDragTarget(event, items);
    if (!targetItem) return;
    const rect = targetItem.getBoundingClientRect();
    const dropAfter = event.clientY > rect.top + rect.height / 2;
    this.removeDropPlaceholders();
    this.createDropPlaceholder(targetItem, dropAfter);
    log(3, 'Dragged over!');
  }

  /**
   * Find the target element for dropping based on mouse position.
   * @param {DragEvent} event - The drag event
   * @param {Array<HTMLElement>} items - List of potential drop targets
   * @returns {HTMLElement|null} The target element or null if none found
   */
  getDragTarget(event, items) {
    log(3, 'Getting drag target!');
    return (
      items.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = event.clientY - (box.top + box.height / 2);
        if (closest === null || Math.abs(offset) < Math.abs(closest.offset)) return { element: child, offset: offset };
        else return closest;
      }, null)?.element || null
    );
  }

  /**
   * Handle drop event to reorder filters.
   * @param {DragEvent} event - The drop event
   * @returns {Promise<boolean>} Whether drop was successful
   */
  async onDrop(event) {
    try {
      event.preventDefault();
      const dataString = event.dataTransfer.getData('text/plain');
      if (!dataString) return false;
      const data = JSON.parse(dataString);
      if (!data || data.type !== 'filter-config') return false;
      const sourceIndex = parseInt(data.index);
      if (isNaN(sourceIndex)) return false;
      const list = this.element.querySelector('.filter-config-list');
      const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
      const targetItem = this.getDragTarget(event, items);
      if (!targetItem) return false;
      const targetIndex = parseInt(targetItem.dataset.index);
      if (isNaN(targetIndex)) return false;
      const rect = targetItem.getBoundingClientRect();
      const dropAfter = event.clientY > rect.top + rect.height / 2;
      let newIndex = dropAfter ? targetIndex + 1 : targetIndex;
      if (sourceIndex < newIndex) newIndex--;
      const [movedItem] = this.config.splice(sourceIndex, 1);
      this.config.splice(newIndex, 0, movedItem);
      this.updateFilterOrder();
      if (this._formState) for (const filter of this.config) if (filter.id in this._formState) filter.enabled = this._formState[filter.id];
      this.render(false);
      log(3, 'Dropped!');
      return true;
    } catch (error) {
      log(1, 'Error dropping draggable element:', error);
      return false;
    } finally {
      this.cleanupDragElements();
      delete this._formState;
    }
  }

  /**
   * Update filter order values after reordering.
   * @todo: Two methods same name?
   * @returns {void}
   */
  updateFilterOrder() {
    this.config.forEach((filter, idx) => {
      filter.order = (idx + 1) * 10;
    });
    log(3, 'Updating filter order!');
  }

  /**
   * Create a visual placeholder for drop position.
   * @param {HTMLElement} targetItem - The target element
   * @param {boolean} dropAfter - Whether to drop after the target
   * @returns {void}
   */
  createDropPlaceholder(targetItem, dropAfter) {
    const placeholder = document.createElement('div');
    placeholder.classList.add('drop-placeholder');
    if (dropAfter) targetItem.after(placeholder);
    else targetItem.before(placeholder);
    log(3, 'Drop placeholder created');
  }

  /**
   * Remove all drop placeholders from the interface.
   * @returns {void}
   */
  removeDropPlaceholders() {
    const placeholders = this.element.querySelectorAll('.drop-placeholder');
    placeholders.forEach((el) => el.remove());
    log(3, 'Drop placeholder removed');
  }

  /**
   * Clean up visual elements after dragging operations.
   * @returns {void}
   */
  cleanupDragElements() {
    const draggingItems = this.element.querySelectorAll('.dragging');
    draggingItems.forEach((el) => el.classList.remove('dragging'));
    this.removeDropPlaceholders();
    log(3, 'Drop elements cleaned up.');
  }

  /**
   * Capture current form state for filter enablement.
   * @returns {Object<string, boolean>} Map of filter IDs to enabled states
   * @private
   */
  _captureFormState() {
    const state = {};
    const checkboxes = this.element.querySelectorAll('dnd5e-checkbox[name^="enabled-"]');
    checkboxes.forEach((checkbox) => {
      const filterId = checkbox.name.replace('enabled-', '');
      state[filterId] = checkbox.checked;
    });
    log(3, 'Form state captured:', { state });
    return state;
  }

  /**
   * Process sortable and non-sortable filters from form data.
   * @param {Array<FilterConfigItem>} filterConfig - The filter configuration
   * @param {Object} formData - Form data from submission
   * @returns {FilterGroups} Sorted filter groups
   * @static
   */
  static processSortableFilters(filterConfig, formData) {
    const sortableFilters = [];
    const nonSortableFilters = [];
    for (const filter of filterConfig) {
      const enabledKey = `enabled-${filter.id}`;
      const enabled = formData[enabledKey] === true;
      const sortable = filter.sortable !== undefined ? filter.sortable : !['name', 'prepared', 'ritual'].includes(filter.id);
      const updatedFilter = { ...filter, enabled: enabled, sortable: sortable };
      if (sortable) sortableFilters.push(updatedFilter);
      else nonSortableFilters.push(updatedFilter);
    }
    log(3, 'Processing sortable filters:', { filterConfig, formData, sortableFilters, nonSortableFilters });
    return { sortableFilters, nonSortableFilters };
  }

  /**
   * Update filter ordering based on DOM structure.
   * @param {Array<FilterConfigItem>} sortableFilters - Filters that can be sorted
   * @param {HTMLFormElement} form - The form element
   * @returns {Array<FilterConfigItem>} Updated sortable filters with correct order
   * @static
   */
  static updateFilterOrder(sortableFilters, form) {
    const sortableFilterElements = Array.from(form.querySelectorAll('.filter-item:not(.not-sortable)'));
    const orderMap = {};
    sortableFilterElements.forEach((el, idx) => {
      const filterId = el.dataset.filterId;
      if (filterId) orderMap[filterId] = idx;
    });
    sortableFilters.sort((a, b) => {
      const orderA = orderMap[a.id] !== undefined ? orderMap[a.id] : a.order;
      const orderB = orderMap[b.id] !== undefined ? orderMap[b.id] : b.order;
      return orderA - orderB;
    });
    let nextOrder = 20;
    sortableFilters.forEach((filter) => {
      filter.order = nextOrder;
      nextOrder += 10;
    });
    log(3, 'Updating filter order:', { sortableFilters, form });
    return sortableFilters;
  }

  /**
   * Handle form reset action to restore default configuration.
   * @param {Event} event - The click event
   * @param {HTMLFormElement} _form - The form element (unused)
   * @static
   */
  static handleReset(event, _form) {
    event.preventDefault();
    this.config = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
    this.render(false);
    log(3, 'Resetting.');
  }

  /** @inheritdoc */
  static formHandler(event, form, formData) {
    event.preventDefault();
    event.stopPropagation();
    log(3, 'Form submitted', { event, form, formData });
    const currentConfig = PlayerFilterConfiguration.getValidConfiguration();
    const { sortableFilters, nonSortableFilters } = PlayerFilterConfiguration.processSortableFilters(currentConfig, formData.object);
    const sortedFilters = PlayerFilterConfiguration.updateFilterOrder(sortableFilters, form);
    const updatedConfig = [
      ...nonSortableFilters.filter((f) => f.id === 'name').map((f) => ({ ...f, order: 10 })),
      ...sortedFilters,
      ...nonSortableFilters.filter((f) => f.id !== 'name').map((f, idx) => ({ ...f, order: 1000 + idx * 10 }))
    ];
    const configToSave = { version: MODULE.DEFAULT_FILTER_CONFIG_VERSION, filters: updatedConfig };
    game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, configToSave);
    if (this.parentApp) this.parentApp.render(false);
    return true;
  }
}
