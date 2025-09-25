/**
 * Player Filter Configuration Application
 *
 * A configuration interface for customizing spell browser filters.
 * This application allows users to enable/disable filters, reorder them through
 * drag-and-drop functionality, and reset to default configurations. It provides
 * both visual and programmatic validation to ensure filter configurations remain
 * functional and user-friendly.
 *
 * Key features:
 * - Enable/disable individual spell browser filters
 * - Drag-and-drop reordering for customizable filter sequence
 * - Visual feedback during drag operations with drop placeholders
 * - Form state preservation during drag operations
 * - Automatic validation and error handling
 * - Reset to default configuration capability
 * - Persistent storage of user preferences
 * - Integration with parent spell book applications
 *
 * @module Applications/PlayerFilterConfiguration
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as ValidationHelpers from '../validation/_module.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { DragDrop } = foundry.applications.ux;

/**
 * Filter configuration item structure.
 *
 * @typedef {Object} FilterConfigItem
 * @property {string} id - Unique filter identifier
 * @property {string} type - Filter type ('search', 'dropdown', 'range', 'checkbox')
 * @property {boolean} enabled - Whether the filter is enabled
 * @property {number} order - Display order for the filter
 * @property {string} label - Localization key for the filter label
 * @property {boolean} sortable - Whether the filter can be reordered
 * @property {Array<string>} [searchAliases] - Alternative search terms
 */

/**
 * Form data structure for filter configuration.
 *
 * @typedef {Object} FilterFormData
 * @property {Object} object - Form data object with filter states
 * @property {Array<FilterConfigItem>} filters - Array of filter configurations
 */

/**
 * Drag operation data structure.
 *
 * @typedef {Object} DragData
 * @property {string} type - Type of drag operation ('filter-config')
 * @property {string} index - Index of the dragged filter item
 */

/**
 * Filter group processing result.
 *
 * @typedef {Object} FilterGroups
 * @property {Array<FilterConfigItem>} sortableFilters - Filters that can be reordered
 * @property {Array<FilterConfigItem>} nonSortableFilters - Fixed-position filters
 */

/**
 * Application to configure which filters are displayed in the spell browser.
 *
 * This application provides a user-friendly interface for customizing the spell
 * browser filter configuration. Users can enable/disable individual filters,
 * reorder them through intuitive drag-and-drop operations, and reset to default
 * configurations when needed.
 *
 * The application integrates with the Foundry VTT drag-drop system to provide
 * smooth reordering capabilities while maintaining form state and providing
 * visual feedback during drag operations.
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
   *
   * @type {Array<FilterConfigItem>}
   */
  config = [];

  /**
   * Create a new filter configuration instance.
   *
   * Initializes the configuration dialog with the current filter settings
   * and establishes the connection to the parent application for updates.
   *
   * @param {Application} parentApp - The parent application that opened this configuration
   * @param {Object} [options={}] - Additional application options
   */
  constructor(parentApp, options = {}) {
    super(options);

    /** @type {Application} The parent application instance */
    this.parentApp = parentApp;

    this.initializeConfig();
  }

  /**
   * Initialize the filter configuration from settings or defaults.
   *
   * Loads the current filter configuration from game settings, validates it,
   * and falls back to default configuration if the current settings are
   * invalid or corrupted. Handles version migration and data structure updates.
   *
   * @returns {void}
   */
  initializeConfig() {
    try {
      log(3, 'Initializing filter configuration');
      let configData = game.settings.get(MODULE.ID, SETTINGS.FILTER_CONFIGURATION);
      if (Array.isArray(configData) || (configData && !configData.version)) {
        configData = { version: MODULE.DEFAULT_FILTER_CONFIG_VERSION, filters: foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG) };
        game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, configData);
      }
      let config = configData?.filters || [];
      if (!config || config.length === 0) {
        log(2, 'No valid configuration found, using defaults');
        config = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
      } else {
        config = config.map((filter) => {
          const defaultFilter = MODULE.DEFAULT_FILTER_CONFIG.find((df) => df.id === filter.id);
          if (defaultFilter) return { ...filter, sortable: defaultFilter.sortable !== undefined ? defaultFilter.sortable : true };
          return { ...filter, sortable: filter.sortable !== undefined ? filter.sortable : true };
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
   * Get the current valid filter configuration.
   *
   * Retrieves and validates the current filter configuration from game settings,
   * falling back to default configuration if the current settings are invalid.
   *
   * @returns {Array<FilterConfigItem>} The current filter configuration or default if invalid
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
   * Prepare filter configuration form data with constructed elements.
   *
   * Processes the filter configuration into a format suitable for form rendering,
   * including HTML checkbox generation and sortability determination.
   *
   * @returns {Array<Object>} Array of filter configuration objects with form elements
   * @private
   */
  _prepareFilterConfigFormData() {
    return this.config.map((filter) => {
      const sortable = !(filter.id === 'name' || filter.id === 'prepared' || filter.id === 'ritual');
      const checkbox = ValidationHelpers.createCheckbox({
        name: `enabled-${filter.id}`,
        checked: filter.enabled,
        ariaLabel: game.i18n.format('SPELLBOOK.Settings.EnableFilter', { name: game.i18n.localize(filter.label) })
      });
      checkbox.id = `enabled-${filter.id}`;
      return { ...filter, sortable: filter.sortable !== undefined ? filter.sortable : sortable, checkboxHtml: ValidationHelpers.elementToHtml(checkbox) };
    });
  }

  /**
   * Prepare form buttons configuration.
   *
   * Creates the button configuration for the form including save and reset
   * options with appropriate icons and labels.
   *
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
  _prepareContext(options) {
    const context = super._prepareContext(options);
    if (!Array.isArray(this.config) || this.config.length === 0) this.initializeConfig();
    return { ...context, filterConfig: this._prepareFilterConfigFormData(), buttons: this._prepareFormButtons() };
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.setDraggableAttributes();
    this.setupDragDrop();
  }

  /**
   * Set up drag and drop handlers for filter reordering.
   *
   * Configures the Foundry VTT drag-drop system with appropriate permissions
   * and callbacks for handling filter item reordering operations.
   *
   * @returns {void}
   */
  setupDragDrop() {
    this.options.dragDrop.forEach((dragDropOptions) => {
      dragDropOptions.permissions = { dragstart: true, drop: true };
      dragDropOptions.callbacks = { dragstart: this.onDragStart.bind(this), dragover: this.onDragOver.bind(this), drop: this.onDrop.bind(this) };
      const dragDropHandler = new DragDrop(dragDropOptions);
      dragDropHandler.bind(this.element);
    });
  }

  /**
   * Set draggable attributes on filter items.
   *
   * Configures the draggable attribute for filter items based on their
   * sortability, ensuring only reorderable filters can be dragged.
   *
   * @returns {void}
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
   * Handle drag start event for filter reordering.
   *
   * Initiates a drag operation by capturing the current form state and
   * setting up the drag data transfer. Only allows dragging of sortable items.
   *
   * @param {DragEvent} event - The drag event
   * @returns {boolean} Whether drag start was successful
   */
  onDragStart(event) {
    try {
      const li = event.currentTarget.closest('li');
      if (!li || li.classList.contains('not-sortable')) return false;
      this._formState = this._captureFormState();
      const filterIndex = li.dataset.index;
      const dragData = { type: 'filter-config', index: filterIndex };
      event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
      li.classList.add('dragging');
      return true;
    } catch (error) {
      log(1, 'Error starting drag:', error);
      return false;
    }
  }

  /**
   * Handle drag over event to show drop position.
   *
   * Provides visual feedback during drag operations by creating drop placeholders
   * and highlighting the appropriate drop position based on mouse position.
   *
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
  }

  /**
   * Find the target element for dropping based on mouse position.
   *
   * Determines the most appropriate drop target by calculating distances
   * from the mouse position to potential drop targets.
   *
   * @param {DragEvent} event - The drag event
   * @param {Array<HTMLElement>} items - List of potential drop targets
   * @returns {HTMLElement|null} The target element or null if none found
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
   * Handle drop event to reorder filters.
   *
   * Processes the drop operation by updating the filter configuration order,
   * preserving form state, and re-rendering the interface with the new order.
   *
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
   * Update filter order values after reordering.
   *
   * Recalculates the order property for all filters based on their
   * new positions in the configuration array.
   *
   * @returns {void}
   */
  updateFilterOrder() {
    this.config.forEach((filter, idx) => {
      filter.order = (idx + 1) * 10;
    });
  }

  /**
   * Create a visual placeholder for drop position.
   *
   * Inserts a visual indicator showing where the dragged item would be
   * placed if dropped at the current mouse position.
   *
   * @param {HTMLElement} targetItem - The target element
   * @param {boolean} dropAfter - Whether to drop after the target
   * @returns {void}
   */
  createDropPlaceholder(targetItem, dropAfter) {
    const placeholder = document.createElement('div');
    placeholder.classList.add('drop-placeholder');
    if (dropAfter) targetItem.after(placeholder);
    else targetItem.before(placeholder);
  }

  /**
   * Remove all drop placeholders from the interface.
   *
   * Cleans up visual indicators used during drag operations to maintain
   * a clean interface state.
   *
   * @returns {void}
   */
  removeDropPlaceholders() {
    const placeholders = this.element.querySelectorAll('.drop-placeholder');
    placeholders.forEach((el) => el.remove());
  }

  /**
   * Clean up visual elements after dragging operations.
   *
   * Removes drag-related CSS classes and placeholders to return the
   * interface to its normal state after drag operations complete.
   *
   * @returns {void}
   */
  cleanupDragElements() {
    const draggingItems = this.element.querySelectorAll('.dragging');
    draggingItems.forEach((el) => el.classList.remove('dragging'));
    this.removeDropPlaceholders();
  }

  /**
   * Capture current form state for filter enablement.
   *
   * Preserves the current enabled/disabled state of all filters during
   * drag operations to prevent loss of user input.
   *
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
    return state;
  }

  /**
   * Process sortable and non-sortable filters from form data.
   *
   * Separates filters into sortable and non-sortable groups based on their
   * configuration and form data, preparing them for final ordering operations.
   *
   * @param {Array<FilterConfigItem>} filterConfig - The filter configuration
   * @param {Object} formData - Form data from submission
   * @returns {FilterGroups} Sorted filter groups
   * @static
   */
  static processSortableFilters(filterConfig, formData) {
    try {
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
      return { sortableFilters, nonSortableFilters };
    } catch (error) {
      log(1, 'Error processing sortable filters:', error);
      return { sortableFilters: [], nonSortableFilters: [] };
    }
  }

  /**
   * Update filter ordering based on DOM structure.
   *
   * Analyzes the current DOM order of filter elements and updates the
   * configuration order values accordingly, ensuring the saved configuration
   * matches the visual order.
   *
   * @param {Array<FilterConfigItem>} sortableFilters - Filters that can be sorted
   * @param {HTMLFormElement} form - The form element
   * @returns {Array<FilterConfigItem>} Updated sortable filters with correct order
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
   * Handle form reset action to restore default configuration.
   *
   * Resets the filter configuration to module defaults and re-renders
   * the interface to reflect the restored settings.
   *
   * @param {Event} event - The click event
   * @param {HTMLFormElement} _form - The form element (unused)
   * @static
   */
  static handleReset(event, _form) {
    event.preventDefault();
    this.config = foundry.utils.deepClone(MODULE.DEFAULT_FILTER_CONFIG);
    this.render(false);
  }

  /** @inheritdoc */
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
      const configToSave = { version: MODULE.DEFAULT_FILTER_CONFIG_VERSION, filters: updatedConfig };
      game.settings.set(MODULE.ID, SETTINGS.FILTER_CONFIGURATION, configToSave);
      if (this.parentApp) this.parentApp.render(false);
      return true;
    } catch (error) {
      log(1, 'Error saving filter configuration:', error);
      return false;
    }
  }
}
