import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import * as formElements from '../helpers/form-elements.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application to configure which filters are displayed in the spell browser
 */
export class PlayerFilterConfiguration extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `filter-config-${MODULE.ID}`,
    tag: 'form',
    window: {
      title: 'SPELLBOOK.Settings.ConfigureFilters',
      width: '',
      height: '',
      resizable: false,
      minimizable: true
    },
    classes: ['filter-configuration'],
    form: {
      handler: PlayerFilterConfiguration.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: {
      top: 75
    },
    actions: {
      reset: PlayerFilterConfiguration.handleReset
    },
    dragDrop: [
      {
        dragSelector: '.filter-config-item',
        dropSelector: '.filter-config-list'
      }
    ]
  };

  /** @override */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.FILTER_CONFIG } };

  parentApp = null;

  config = [];

  /**
   * @param {Application} parentApp - The parent application that opened this configuration
   * @param {Object} [options={}] - Additional application options
   */
  constructor(parentApp, options = {}) {
    super(options);
    this.parentApp = parentApp;
    this.initializeConfig();
  }

  /**
   * Initialize the filter configuration from settings or defaults
   */
  initializeConfig() {
    try {
      log(3, 'Initializing filter configuration');
      let config = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
      if (!config || !Array.isArray(config) || config.length === 0) {
        log(2, 'No valid configuration found, using defaults');
        config = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
      } else {
        config = config.map((filter) => {
          const defaultFilter = MODULE.DEFAULT_FILTER_CONFIG.find((df) => df.id === filter.id);
          if (defaultFilter) {
            return {
              ...filter,
              sortable: defaultFilter.sortable !== undefined ? defaultFilter.sortable : true
            };
          }
          return {
            ...filter,
            sortable: filter.sortable !== undefined ? filter.sortable : true
          };
        });
      }

      this.config = foundry.utils.deepClone(config);
      log(3, 'Configuration initialized successfully');
    } catch (error) {
      log(1, 'Error initializing filter configuration:', error);
      this.config = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
    }
  }

  /**
   * Get the current valid filter configuration
   * @returns {Array} The current filter configuration or default if invalid
   * @static
   */
  static getValidConfiguration() {
    try {
      const config = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
      if (!config || !Array.isArray(config) || config.length === 0) return foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
      return config;
    } catch (error) {
      log(1, 'Error retrieving configuration, using defaults:', error);
      return foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
    }
  }

  /**
   * Prepare filter configuration form data with constructed elements
   * @returns {Array} Array of filter configuration objects with form elements
   * @private
   */
  _prepareFilterConfigFormData() {
    try {
      return this.config.map((filter) => {
        const sortable = !(filter.id === 'name' || filter.id === 'prepared' || filter.id === 'ritual' || filter.id === 'sortBy');
        const checkbox = formElements.createCheckbox({
          name: `enabled-${filter.id}`,
          checked: filter.enabled,
          ariaLabel: game.i18n.format('SPELLBOOK.Settings.EnableFilter', { name: game.i18n.localize(filter.label) })
        });
        checkbox.id = `enabled-${filter.id}`;
        return {
          ...filter,
          sortable: filter.sortable !== undefined ? filter.sortable : sortable,
          checkboxHtml: formElements.elementToHtml(checkbox)
        };
      });
    } catch (error) {
      log(1, 'Error preparing filter config form data:', error);
      return [];
    }
  }

  /**
   * Prepare form buttons configuration
   * @returns {Array} Array of button configurations
   * @private
   */
  _prepareFormButtons() {
    return [
      {
        type: 'submit',
        icon: 'fas fa-save',
        label: 'SPELLBOOK.UI.Save'
      },
      {
        type: 'button',
        action: 'reset',
        icon: 'fas fa-undo',
        label: 'SPELLBOOK.UI.Reset'
      }
    ];
  }

  /** @override */
  _prepareContext(options) {
    const context = super._prepareContext(options);
    try {
      if (!Array.isArray(this.config) || this.config.length === 0) this.initializeConfig();
      return {
        ...context,
        filterConfig: this._prepareFilterConfigFormData(),
        buttons: this._prepareFormButtons()
      };
    } catch (error) {
      log(1, 'Error preparing context:', error);
      return { ...context, filterConfig: [], buttons: [] };
    }
  }

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.modal = true;
    return options;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.setDraggableAttributes();
    this.setupDragDrop();
  }

  /**
   * Set up drag and drop handlers for filter reordering
   */
  setupDragDrop() {
    this.options.dragDrop.forEach((dragDropOptions) => {
      dragDropOptions.permissions = {
        dragstart: this.canDragStart.bind(this),
        drop: this.canDragDrop.bind(this)
      };

      dragDropOptions.callbacks = {
        dragstart: this.onDragStart.bind(this),
        dragover: this.onDragOver.bind(this),
        drop: this.onDrop.bind(this)
      };

      const dragDropHandler = new DragDrop(dragDropOptions);
      dragDropHandler.bind(this.element);
    });
  }

  /**
   * Set draggable attributes on filter items
   */
  setDraggableAttributes() {
    const items = this.element.querySelectorAll('.filter-config-item');
    items.forEach((item) => {
      const li = item.closest('li');
      const isSortable = !li.classList.contains('not-sortable');
      item.setAttribute('draggable', isSortable ? 'true' : 'false');
    });
  }

  /**
   * Check if dragging is allowed
   * @param {DragEvent} _event - The drag event
   * @param {string} _selector - The selector for drag targets
   * @returns {boolean} Whether dragging is allowed
   */
  canDragStart(_event, _selector) {
    return true;
  }

  /**
   * Check if dropping is allowed
   * @param {DragEvent} _event - The drag event
   * @param {string} _selector - The selector for drop targets
   * @returns {boolean} Whether dropping is allowed
   */
  canDragDrop(_event, _selector) {
    return true;
  }

  /**
   * Handle drag start event
   * @param {DragEvent} event - The drag event
   * @returns {boolean} Whether drag start was successful
   */
  onDragStart(event) {
    try {
      const li = event.currentTarget.closest('li');
      if (!li || li.classList.contains('not-sortable')) return false;
      this._formState = this._captureFormState();
      const filterIndex = li.dataset.index;
      event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'filter-config', index: filterIndex }));
      li.classList.add('dragging');
      return true;
    } catch (error) {
      log(1, 'Error starting drag:', error);
      return false;
    }
  }

  /**
   * Handle drag over event to show drop position
   * @param {DragEvent} event - The drag event
   * @param {string} _selector - The selector for drag targets
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
  }

  /**
   * Find the target element for dropping
   * @param {DragEvent} event - The drag event
   * @param {Array<HTMLElement>} items - List of potential drop targets
   * @returns {HTMLElement|null} The target element
   */
  getDragTarget(event, items) {
    try {
      return (
        items.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = event.clientY - (box.top + box.height / 2);
          if (closest === null || Math.abs(offset) < Math.abs(closest.offset)) return { element: child, offset: offset };
          else return closest;
        }, null)?.element || null
      );
    } catch (error) {
      log(1, 'Error finding drag target:', error);
      return null;
    }
  }

  /**
   * Handle drop event to reorder filters
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
      if (this._formState) {
        for (const filter of this.config) {
          if (this._formState.hasOwnProperty(filter.id)) filter.enabled = this._formState[filter.id];
        }
      }
      this.render(false);
      return true;
    } catch (error) {
      log(1, 'Error handling drop:', error);
      return false;
    } finally {
      this.cleanupDragElements();
      delete this._formState;
    }
  }

  /**
   * Update filter order values after reordering
   */
  updateFilterOrder() {
    this.config.forEach((filter, idx) => {
      filter.order = (idx + 1) * 10;
    });
  }

  /**
   * Create a visual placeholder for drop position
   * @param {HTMLElement} targetItem - The target element
   * @param {boolean} dropAfter - Whether to drop after the target
   */
  createDropPlaceholder(targetItem, dropAfter) {
    const placeholder = document.createElement('div');
    placeholder.classList.add('drop-placeholder');
    if (dropAfter) targetItem.after(placeholder);
    else targetItem.before(placeholder);
  }

  /**
   * Remove all drop placeholders
   */
  removeDropPlaceholders() {
    const placeholders = this.element.querySelectorAll('.drop-placeholder');
    placeholders.forEach((el) => el.remove());
  }

  /**
   * Clean up visual elements after dragging
   */
  cleanupDragElements() {
    const draggingItems = this.element.querySelectorAll('.dragging');
    draggingItems.forEach((el) => el.classList.remove('dragging'));
    this.removeDropPlaceholders();
  }

  /**
   * Capture current form state for filter enablement
   * @returns {Object} Map of filter IDs to enabled states
   */
  _captureFormState() {
    const state = {};
    const checkboxes = this.element.querySelectorAll('dnd5e-checkbox[name^="enabled-"]');
    checkboxes.forEach((checkbox) => {
      const filterId = checkbox.name.replace('enabled-', '');
      state[filterId] = checkbox.checked;
    });
    return state;
  }

  /**
   * Process sortable and non-sortable filters
   * @param {Array} filterConfig - The filter configuration
   * @param {Object} formData - Form data from submission
   * @returns {Object} Sorted filter groups
   * @static
   */
  static processSortableFilters(filterConfig, formData) {
    try {
      const sortableFilters = [];
      const nonSortableFilters = [];
      for (const filter of filterConfig) {
        const enabledKey = `enabled-${filter.id}`;
        const enabled = formData[enabledKey] === true;
        const sortable = filter.sortable !== undefined ? filter.sortable : !['name', 'prepared', 'ritual', 'sortBy'].includes(filter.id);

        const updatedFilter = {
          ...filter,
          enabled: enabled,
          sortable: sortable
        };
        if (sortable) sortableFilters.push(updatedFilter);
        else nonSortableFilters.push(updatedFilter);
      }
      return { sortableFilters, nonSortableFilters };
    } catch (error) {
      log(1, 'Error processing sortable filters:', error);
      return { sortableFilters: [], nonSortableFilters: [] };
    }
  }

  /**
   * Update filter ordering based on DOM structure
   * @param {Array} sortableFilters - Filters that can be sorted
   * @param {HTMLFormElement} form - The form element
   * @returns {Array} Updated sortable filters
   * @static
   */
  static updateFilterOrder(sortableFilters, form) {
    try {
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
      return sortableFilters;
    } catch (error) {
      log(1, 'Error updating filter order:', error);
      return sortableFilters;
    }
  }

  /**
   * Handle form reset action
   * @param {Event} event - The click event
   * @param {HTMLFormElement} _form - The form element
   * @static
   */
  static handleReset(event, _form) {
    event.preventDefault();
    this.config = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
    this.render(false);
  }

  /**
   * Process and save filter configuration from form submission
   * @param {Event} event - The submit event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @static
   */
  static formHandler(event, form, formData) {
    event.preventDefault();
    event.stopPropagation();
    try {
      const currentConfig = PlayerFilterConfiguration.getValidConfiguration();
      const { sortableFilters, nonSortableFilters } = PlayerFilterConfiguration.processSortableFilters(currentConfig, formData.object);
      const sortedFilters = PlayerFilterConfiguration.updateFilterOrder(sortableFilters, form);

      const updatedConfig = [
        ...nonSortableFilters.filter((f) => f.id === 'name').map((f) => ({ ...f, order: 10 })),
        ...sortedFilters,
        ...nonSortableFilters.filter((f) => f.id !== 'name').map((f, idx) => ({ ...f, order: 1000 + idx * 10 }))
      ];
      game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, updatedConfig);
      if (this.parentApp) this.parentApp.render(false);
      return true;
    } catch (error) {
      log(1, 'Error saving filter configuration:', error);
      return false;
    }
  }
}
