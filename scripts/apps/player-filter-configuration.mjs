import { DEFAULT_FILTER_CONFIG, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application to configure which filters are displayed in the spell browser
 */
export class PlayerFilterConfiguration extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
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

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** The parent application */
  parentApp = null;

  /** Configuration being edited */
  config = [];

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Application} parentApp - The parent application that opened this configuration
   * @param {Object} [options={}] - Additional application options
   */
  constructor(parentApp, options = {}) {
    super(options);
    this.parentApp = parentApp;
    this.initializeConfig();
  }

  /* -------------------------------------------- */
  /*  Configuration Methods                       */
  /* -------------------------------------------- */

  /**
   * Initialize the filter configuration from settings or defaults
   */
  initializeConfig() {
    try {
      log(3, 'Initializing filter configuration');
      let config = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);

      if (!config || !Array.isArray(config) || config.length === 0) {
        log(2, 'No valid configuration found, using defaults');
        config = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
      } else {
        config = config.map((filter) => {
          const defaultFilter = DEFAULT_FILTER_CONFIG.find((df) => df.id === filter.id);
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
      this.config = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
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
      if (!config || !Array.isArray(config) || config.length === 0) return foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
      return config;
    } catch (error) {
      log(1, 'Error retrieving configuration, using defaults:', error);
      return foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
    }
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /** @override */
  _prepareContext(_options) {
    try {
      if (!Array.isArray(this.config) || this.config.length === 0) {
        log(2, 'Invalid configuration in _prepareContext, reinitializing');
        this.initializeConfig();
      }

      this.config = this.config.map((filter) => {
        const sortable = !(filter.id === 'name' || filter.id === 'prepared' || filter.id === 'ritual' || filter.id === 'sortBy');

        const checkbox = document.createElement('dnd5e-checkbox');
        checkbox.name = `enabled-${filter.id}`;
        checkbox.id = `enabled-${filter.id}`;
        if (filter.enabled) checkbox.checked = true;
        checkbox.setAttribute(
          'aria-label',
          game.i18n.format('SPELLBOOK.Settings.EnableFilter', {
            name: game.i18n.localize(filter.label)
          })
        );

        const container = document.createElement('div');
        container.appendChild(checkbox);

        return {
          ...filter,
          sortable: filter.sortable !== undefined ? filter.sortable : sortable,
          checkboxHtml: container.innerHTML
        };
      });

      log(3, 'Prepared context with configuration and DnD5e checkboxes');

      return {
        filterConfig: this.config,
        buttons: [
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
        ]
      };
    } catch (error) {
      log(1, 'Error preparing context:', error);
      return { filterConfig: [], buttons: [] };
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
    try {
      this.setDraggableAttributes();
      this.setupDragDrop();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
  }

  /**
   * Set up drag and drop handlers for filter reordering
   */
  setupDragDrop() {
    try {
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
    } catch (error) {
      log(1, 'Error setting up drag and drop:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Drag & Drop Handlers                        */
  /* -------------------------------------------- */

  /**
   * Set draggable attributes on filter items
   */
  setDraggableAttributes() {
    try {
      const items = this.element.querySelectorAll('.filter-config-item');
      items.forEach((item) => {
        const li = item.closest('li');
        const isSortable = !li.classList.contains('not-sortable');
        item.setAttribute('draggable', isSortable ? 'true' : 'false');
      });
    } catch (error) {
      log(1, 'Error setting draggable attributes:', error);
    }
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
    try {
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
    } catch (error) {
      log(1, 'Error handling drag over:', error);
    }
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
          if (this._formState.hasOwnProperty(filter.id)) {
            filter.enabled = this._formState[filter.id];
          }
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
    try {
      const placeholder = document.createElement('div');
      placeholder.classList.add('drop-placeholder');

      if (dropAfter) targetItem.after(placeholder);
      else targetItem.before(placeholder);
    } catch (error) {
      log(1, 'Error creating drop placeholder:', error);
    }
  }

  /**
   * Remove all drop placeholders
   */
  removeDropPlaceholders() {
    try {
      const placeholders = this.element.querySelectorAll('.drop-placeholder');
      placeholders.forEach((el) => el.remove());
    } catch (error) {
      log(1, 'Error removing drop placeholders:', error);
    }
  }

  /**
   * Clean up visual elements after dragging
   */
  cleanupDragElements() {
    try {
      const draggingItems = this.element.querySelectorAll('.dragging');
      draggingItems.forEach((el) => el.classList.remove('dragging'));
      this.removeDropPlaceholders();
    } catch (error) {
      log(1, 'Error cleaning up drag elements:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Form Handling                               */
  /* -------------------------------------------- */

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
    try {
      event.preventDefault();
      this.config = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
      this.render(false);
    } catch (error) {
      log(1, 'Error handling reset:', error);
    }
  }

  /**
   * Process and save filter configuration from form submission
   * @param {Event} event - The submit event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<boolean>} Success status
   * @static
   */
  static async formHandler(event, form, formData) {
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

      await game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, updatedConfig);

      if (this.parentApp) {
        this.parentApp.render(false);
      }

      return true;
    } catch (error) {
      log(1, 'Error saving filter configuration:', error);
      return false;
    }
  }
}
