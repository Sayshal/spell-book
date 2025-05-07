import { DEFAULT_FILTER_CONFIG, MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for configuring filter settings in the Spell Book
 * Allows users to enable/disable filters and change their display order
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
  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.FILTER_CONFIG }
  };

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
   * @param {PlayerSpellBook} parentApp - The parent application
   * @param {object} options - ApplicationV2 options
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
   * Initialize the filter configuration from settings
   */
  initializeConfig() {
    try {
      log(3, 'Initializing filter configuration');
      let config = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);

      // Validate the configuration
      if (!config || !Array.isArray(config) || config.length === 0) {
        log(2, 'No valid configuration found, using defaults');
        config = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
      } else {
        // Ensure all filters have the sortable property
        config = config.map((filter) => {
          // Check against default configuration
          const defaultFilter = DEFAULT_FILTER_CONFIG.find((df) => df.id === filter.id);

          if (defaultFilter) {
            return {
              ...filter,
              sortable: defaultFilter.sortable !== undefined ? defaultFilter.sortable : true
            };
          }

          // Default to sortable if not found
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
   * Get a validated configuration
   * @returns {Array} The current valid filter configuration
   * @static
   */
  static getValidConfiguration() {
    try {
      const config = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
      if (!config || !Array.isArray(config) || config.length === 0) {
        log(2, 'No valid configuration found in settings, using defaults');
        return foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
      }
      return config;
    } catch (error) {
      log(1, 'Error retrieving configuration, using defaults:', error);
      return foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
    }
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /**
   * Prepare the application context data
   * @override
   */
  _prepareContext(_options) {
    try {
      // Ensure valid configuration
      if (!Array.isArray(this.config) || this.config.length === 0) {
        log(2, 'Invalid configuration in _prepareContext, reinitializing');
        this.initializeConfig();
      }

      // Set sortable property for each filter
      this.config = this.config.map((filter) => {
        // Determine sortable status based on filter type
        const sortable = !(filter.id === 'name' || filter.id === 'prepared' || filter.id === 'ritual' || filter.id === 'sortBy');

        return {
          ...filter,
          sortable: filter.sortable !== undefined ? filter.sortable : sortable
        };
      });

      log(3, 'Prepared context with configuration');

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

  /**
   * Configure render options
   * @override
   */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.modal = true;
    return options;
  }

  /**
   * Setup after rendering
   * @override
   */
  _onRender(_context, _options) {
    try {
      // Set draggable attributes
      this.setDraggableAttributes();

      // Bind drag & drop handlers
      this.setupDragDrop();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
  }

  /**
   * Set up drag and drop handlers
   */
  setupDragDrop() {
    try {
      // Create drag-drop handlers for each configured option
      this.options.dragDrop.forEach((dragDropOptions) => {
        // Set permissions and callbacks
        dragDropOptions.permissions = {
          dragstart: this.canDragStart.bind(this),
          drop: this.canDragDrop.bind(this)
        };

        dragDropOptions.callbacks = {
          dragstart: this.onDragStart.bind(this),
          dragover: this.onDragOver.bind(this),
          drop: this.onDrop.bind(this)
        };

        // Create and bind the handler
        const dragDropHandler = new DragDrop(dragDropOptions);
        dragDropHandler.bind(this.element);
      });

      log(3, 'Drag and drop handlers set up');
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
        log(3, `Set draggable=${isSortable} for ${li.dataset.filterId}`);
      });
    } catch (error) {
      log(1, 'Error setting draggable attributes:', error);
    }
  }

  /**
   * Check if dragging is allowed
   * @param {DragEvent} _event - The drag event
   * @param {string} _selector - The selector being dragged
   * @returns {boolean} Whether dragging is allowed
   */
  canDragStart(_event, _selector) {
    return true;
  }

  /**
   * Check if dropping is allowed
   * @param {DragEvent} _event - The drag event
   * @param {string} _selector - The selector being dropped on
   * @returns {boolean} Whether dropping is allowed
   */
  canDragDrop(_event, _selector) {
    return true;
  }

  /**
   * Handle drag start
   * @param {DragEvent} event - The drag event
   */
  onDragStart(event) {
    try {
      const li = event.currentTarget.closest('li');
      if (!li || li.classList.contains('not-sortable')) return false;

      // Capture current form state
      this._formState = this._captureFormState();

      // Set data transfer
      const filterIndex = li.dataset.index;
      event.dataTransfer.setData(
        'text/plain',
        JSON.stringify({
          type: 'filter-config',
          index: filterIndex
        })
      );

      // Add dragging class
      li.classList.add('dragging');
    } catch (error) {
      log(1, 'Error starting drag:', error);
      return false;
    }
  }

  /**
   * Handle drag over event
   * @param {DragEvent} event - The drag event
   * @param {string} _selector - The target selector
   */
  onDragOver(event, _selector) {
    try {
      event.preventDefault();

      // Find list and dragging element
      const list = this.element.querySelector('.filter-config-list');
      if (!list) return;

      const draggingItem = list.querySelector('.dragging');
      if (!draggingItem) return;

      // Get all items except the one being dragged
      const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
      if (!items.length) return;

      // Find target item
      const targetItem = this.getDragTarget(event, items);
      if (!targetItem) return;

      // Calculate drop position
      const rect = targetItem.getBoundingClientRect();
      const dropAfter = event.clientY > rect.top + rect.height / 2;

      // Remove existing placeholders
      this.removeDropPlaceholders();

      // Create new placeholder
      this.createDropPlaceholder(targetItem, dropAfter);
    } catch (error) {
      log(1, 'Error handling drag over:', error);
    }
  }

  /**
   * Find the target element for dropping
   * @param {DragEvent} event - The drag event
   * @param {HTMLElement[]} items - Available drop targets
   * @returns {HTMLElement|null} The closest drop target
   */
  getDragTarget(event, items) {
    try {
      return (
        items.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = event.clientY - (box.top + box.height / 2);

          if (closest === null || Math.abs(offset) < Math.abs(closest.offset)) {
            return { element: child, offset: offset };
          } else {
            return closest;
          }
        }, null)?.element || null
      );
    } catch (error) {
      log(1, 'Error finding drag target:', error);
      return null;
    }
  }

  /**
   * Handle drop event
   * @param {DragEvent} event - The drop event
   */
  async onDrop(event) {
    try {
      event.preventDefault();

      // Get drag data
      const dataString = event.dataTransfer.getData('text/plain');
      if (!dataString) return;

      const data = JSON.parse(dataString);
      if (!data || data.type !== 'filter-config') return;

      const sourceIndex = parseInt(data.index);
      if (isNaN(sourceIndex)) return;

      // Find drop target
      const list = this.element.querySelector('.filter-config-list');
      const items = Array.from(list.querySelectorAll('li:not(.dragging)'));

      const targetItem = this.getDragTarget(event, items);
      if (!targetItem) return;

      const targetIndex = parseInt(targetItem.dataset.index);
      if (isNaN(targetIndex)) return;

      // Determine drop position
      const rect = targetItem.getBoundingClientRect();
      const dropAfter = event.clientY > rect.top + rect.height / 2;
      let newIndex = dropAfter ? targetIndex + 1 : targetIndex;

      // Adjust for moving down
      if (sourceIndex < newIndex) newIndex--;

      // Reorder the configuration
      const [movedItem] = this.config.splice(sourceIndex, 1);
      this.config.splice(newIndex, 0, movedItem);

      // Update order numbers
      this.updateFilterOrder();

      // Update enabled states from captured form state
      if (this._formState) {
        for (const filter of this.config) {
          if (this._formState.hasOwnProperty(filter.id)) {
            filter.enabled = this._formState[filter.id];
          }
        }
      }

      // Re-render
      this.render(false);

      log(3, `Reordered filter from position ${sourceIndex} to ${newIndex}`);
      return true;
    } catch (error) {
      log(1, 'Error handling drop:', error);
      return false;
    } finally {
      this.cleanupDragElements();
      // Clean up the stored form state
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
   * Create a drop placeholder element
   * @param {HTMLElement} targetItem - The target item
   * @param {boolean} dropAfter - Whether to place after (true) or before (false)
   */
  createDropPlaceholder(targetItem, dropAfter) {
    try {
      // Create a placeholder
      const placeholder = document.createElement('div');
      placeholder.classList.add('drop-placeholder');

      if (dropAfter) {
        targetItem.after(placeholder);
      } else {
        targetItem.before(placeholder);
      }
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
   * Process form data and separate filters by sortable status
   * @param {Array} filterConfig - The filter configuration
   * @param {Object} formData - Form data with enabled states
   * @returns {Object} Object with sortable and non-sortable filter arrays
   * @static
   */
  static processSortableFilters(filterConfig, formData) {
    try {
      const sortableFilters = [];
      const nonSortableFilters = [];

      for (const filter of filterConfig) {
        // Get enabled state from form
        const enabledKey = `enabled-${filter.id}`;
        const enabled = formData[enabledKey] === true;

        // Ensure sortable property is preserved
        const sortable = filter.sortable !== undefined ? filter.sortable : !['name', 'prepared', 'ritual', 'sortBy'].includes(filter.id);

        // Create updated filter
        const updatedFilter = {
          ...filter,
          enabled: enabled,
          sortable: sortable
        };

        // Sort into appropriate group
        if (sortable) {
          sortableFilters.push(updatedFilter);
        } else {
          nonSortableFilters.push(updatedFilter);
        }
      }

      return { sortableFilters, nonSortableFilters };
    } catch (error) {
      log(1, 'Error processing sortable filters:', error);
      return { sortableFilters: [], nonSortableFilters: [] };
    }
  }

  /**
   * Update filter order values
   * @param {Array} sortableFilters - Array of sortable filters
   * @param {HTMLFormElement} form - The form element
   * @returns {Array} Sorted filters with updated order values
   * @static
   */
  static updateFilterOrder(sortableFilters, form) {
    try {
      // Get sortable elements from DOM
      const sortableFilterElements = Array.from(form.querySelectorAll('.filter-item:not(.not-sortable)'));

      // Create a position map
      const orderMap = {};
      sortableFilterElements.forEach((el, idx) => {
        const filterId = el.dataset.filterId;
        if (filterId) orderMap[filterId] = idx;
      });

      // Sort the filters based on DOM position
      sortableFilters.sort((a, b) => {
        const orderA = orderMap[a.id] !== undefined ? orderMap[a.id] : a.order;
        const orderB = orderMap[b.id] !== undefined ? orderMap[b.id] : b.order;
        return orderA - orderB;
      });

      // Update order values
      let nextOrder = 20; // Start after search filter
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
   * Capture the current form state
   * @returns {Object} Object mapping filter IDs to their enabled states
   * @private
   */
  _captureFormState() {
    const state = {};
    try {
      const checkboxes = this.element.querySelectorAll('input[type="checkbox"][name^="enabled-"]');
      checkboxes.forEach((checkbox) => {
        const filterId = checkbox.name.replace('enabled-', '');
        state[filterId] = checkbox.checked;
      });
    } catch (error) {
      log(1, 'Error capturing form state:', error);
    }
    return state;
  }

  /**
   * Handle reset button click (static method for actions system)
   * @param {Event} event - The click event
   * @static
   */
  static handleReset(event, _form) {
    try {
      event.preventDefault();
      log(3, 'Reset button clicked, restoring defaults');
      this.config = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
      this.render(false);
    } catch (error) {
      log(1, 'Error handling reset:', error);
    }
  }

  /**
   * Handle form submission
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<boolean>}
   * @static
   */
  static async formHandler(event, form, formData) {
    // Prevent the event
    event.preventDefault();
    event.stopPropagation();

    try {
      log(3, 'Processing filter configuration form data');

      // Get current configuration
      const currentConfig = PlayerFilterConfiguration.getValidConfiguration();

      // Process filters into sortable groups
      const { sortableFilters, nonSortableFilters } = PlayerFilterConfiguration.processSortableFilters(currentConfig, formData.object);

      // Update filter ordering
      const sortedFilters = PlayerFilterConfiguration.updateFilterOrder(sortableFilters, form);

      // Combine filters with non-sortable ones in the right positions
      const updatedConfig = [
        // Name filter at the top - make sure it has order = 10
        ...nonSortableFilters.filter((f) => f.id === 'name').map((f) => ({ ...f, order: 10 })),
        // Sortable filters in their sorted order
        ...sortedFilters,
        // Controls at the bottom (checkboxes and sort options) - ensure they have higher order values
        ...nonSortableFilters.filter((f) => f.id !== 'name').map((f, idx) => ({ ...f, order: 1000 + idx * 10 }))
      ];

      log(3, 'Saving updated configuration');

      // Save to settings
      await game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, updatedConfig);

      // Refresh parent application if available
      if (this.parentApp) {
        log(3, 'Refreshing parent application');
        this.parentApp.render(false);
      } else {
        log(2, 'No parent application reference found');
      }

      log(3, 'Filter configuration saved successfully');
      return true;
    } catch (error) {
      log(1, 'Error saving filter configuration:', error);
      return false;
    }
  }
}
