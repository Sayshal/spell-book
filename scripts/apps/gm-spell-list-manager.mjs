import { MODULE } from '../constants.mjs';
import * as actorSpellUtils from '../helpers/actor-spells.mjs';
import * as managerHelpers from '../helpers/spell-management.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for GM management of spell lists
 * Allows browsing, duplicating, and customizing spell lists from compendiums
 */
export class GMSpellListManager extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `gm-spell-list-manager-${MODULE.ID}`,
    tag: 'form',
    form: {
      handler: GMSpellListManager.formHandler,
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      selectSpellList: GMSpellListManager.handleSelectSpellList,
      closeSpellManager: GMSpellListManager.handleClose,
      editSpellList: GMSpellListManager.handleEditSpellList,
      removeSpell: GMSpellListManager.handleRemoveSpell,
      addSpell: GMSpellListManager.handleAddSpell,
      filterSpells: GMSpellListManager.handleFilterSpells,
      saveCustomList: GMSpellListManager.handleSaveCustomList,
      deleteCustomList: GMSpellListManager.handleDeleteCustomList,
      restoreOriginal: GMSpellListManager.handleRestoreOriginal,
      showDocumentation: GMSpellListManager.handleShowDocumentation
    },
    classes: ['gm-spell-list-manager'],
    window: {
      title: 'GM Spell List Manager',
      width: 1200,
      height: 800,
      resizable: true,
      minimizable: true
    },
    position: {
      height: 800,
      width: 1200
    }
  };

  /** @override */
  static PARTS = {
    form: { template: 'modules/spell-book/templates/gm-spell-list-manager.hbs' }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * Loading state for the spell manager
   * @type {boolean}
   */
  isLoading = true;

  /**
   * Error state tracking
   * @type {boolean}
   */
  hasError = false;

  /**
   * Error message if loading failed
   * @type {string}
   */
  errorMessage = '';

  /**
   * Available spell lists
   * @type {Array}
   */
  availableSpellLists = [];

  /**
   * Currently selected spell list
   * @type {Object|null}
   */
  selectedSpellList = null;

  /**
   * Available spells for adding
   * @type {Array}
   */
  availableSpells = [];

  /**
   * Current filter state for available spells
   * @type {Object}
   */
  filterState = {
    name: '',
    level: '',
    school: ''
  };

  /**
   * Editing state
   * @type {boolean}
   */
  isEditing = false;

  /**
   * Pagination state for available spells
   * @type {Object}
   */
  paginationState = {
    currentPage: 0,
    pageSize: 100,
    totalPages: 1
  };

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {object} options - ApplicationV2 options
   */
  constructor(options = {}) {
    super(options);
  }

  /**
   * Initialize the application and set up pagination
   * @override
   */
  _initialize() {
    super._initialize();

    // Get page size from settings
    this.paginationState.pageSize = game.settings.get(MODULE.ID, 'spellManagerPageSize');
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /**
   * @override
   */
  async _prepareContext(options) {
    // Get basic context
    const context = {
      isLoading: this.isLoading,
      hasError: this.hasError,
      errorMessage: this.errorMessage,
      availableSpellLists: this.availableSpellLists,
      selectedSpellList: this.selectedSpellList,
      spellSchools: CONFIG.DND5E.spellSchools,
      spellLevels: CONFIG.DND5E.spellLevels,
      isEditing: this.isEditing,
      availableSpells: this.availableSpells,
      filterState: this.filterState,
      paginationState: this.paginationState
    };

    if (this.isLoading) {
      return context;
    }

    // If we have available spells, apply filters and pagination
    if (this.availableSpells.length > 0) {
      context.filteredSpells = this._filterAvailableSpells();
    }

    // Add additional context for editing state
    if (this.isEditing && this.selectedSpellList) {
      context.isCustomList = !!this.selectedSpellList.document.flags?.[MODULE.ID]?.isDuplicate;

      // If this is a custom list, get compare info for original
      if (context.isCustomList) {
        const originalUuid = this.selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid;
        if (originalUuid) {
          context.originalUuid = originalUuid;
          try {
            const compareResult = await managerHelpers.compareListVersions(originalUuid, this.selectedSpellList.document.uuid);
            context.compareInfo = compareResult;
          } catch (error) {
            log(2, 'Error comparing versions:', error);
          }
        }
      }
    }

    return context;
  }

  /**
   * @override
   */
  _onRender(context, options) {
    super._onRender?.(context, options);

    // If we're loading, start the loading process
    if (this.isLoading) {
      this._loadData();
      return;
    }

    // Set up event listeners for spell filter inputs
    this._setupFilterListeners();
  }

  /* -------------------------------------------- */
  /*  Data Loading                                */
  /* -------------------------------------------- */

  /**
   * Load all required data
   * @private
   */
  async _loadData() {
    try {
      log(3, 'Loading spell lists for GM manager');

      // Get all available spell lists from compendiums
      this.availableSpellLists = await managerHelpers.findCompendiumSpellLists();

      // Sort by name for better usability
      this.availableSpellLists.sort((a, b) => a.name.localeCompare(b.name));

      // Pre-fetch all available spells as well for column 3
      this.availableSpells = await managerHelpers.fetchAllCompendiumSpells();

      this.isLoading = false;
      this.render(false);
    } catch (error) {
      log(1, 'Error loading spell lists:', error);
      this.hasError = true;
      this.errorMessage = 'Failed to load spell lists.';
      this.isLoading = false;
      this.render(false);
    }
  }

  /**
   * Apply filters and pagination to available spells
   * @returns {Array} Filtered and paginated array of spells
   * @private
   */
  _filterAvailableSpells() {
    const { name, level, school } = this.filterState;

    // First, filter the entire list
    const filteredSpells = this.availableSpells.filter((spell) => {
      // Filter by name
      if (name && !spell.name.toLowerCase().includes(name.toLowerCase())) {
        return false;
      }

      // Filter by level
      if (level && spell.level !== parseInt(level)) {
        return false;
      }

      // Filter by school
      if (school && spell.school !== school) {
        return false;
      }

      // Check if spell is already in the list
      if (this.selectedSpellList?.spells) {
        const isInList = this.selectedSpellList.spells.some((s) => s.uuid === spell.uuid);
        if (isInList) return false;
      }

      return true;
    });

    // Calculate pagination
    const pageSize = this.paginationState.pageSize;
    const totalItems = filteredSpells.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    // Update pagination state
    this.paginationState.totalPages = totalPages;

    // Ensure current page is valid
    if (this.paginationState.currentPage >= totalPages) {
      this.paginationState.currentPage = Math.max(0, totalPages - 1);
    }

    // Calculate start and end indices for the current page
    const startIndex = this.paginationState.currentPage * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);

    // Return the paginated subset of the filtered spells
    return {
      spells: filteredSpells.slice(startIndex, endIndex),
      totalItems,
      totalFiltered: filteredSpells.length
    };
  }

  /**
   * Handle changing the page
   * @param {number} page - The page to change to
   * @private
   */
  _changePage(page) {
    if (page < 0 || page >= this.paginationState.totalPages) return;

    this.paginationState.currentPage = page;
    this.render(false);
  }

  /* Add static method to class */
  /**
   * Handle page navigation
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handlePageNavigation(event, _form) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    const page = parseInt(button.dataset.page, 10);

    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    switch (action) {
      case 'first-page':
        instance._changePage(0);
        break;
      case 'prev-page':
        instance._changePage(instance.paginationState.currentPage - 1);
        break;
      case 'next-page':
        instance._changePage(instance.paginationState.currentPage + 1);
        break;
      case 'last-page':
        instance._changePage(instance.paginationState.totalPages - 1);
        break;
      case 'specific-page':
        instance._changePage(page);
        break;
    }
  }

  /**
   * Handle showing documentation
   * @static
   */
  static handleShowDocumentation(_event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    instance.showDocumentation();
  }

  /**
   * Set up listeners for filter inputs
   * @private
   */
  _setupFilterListeners() {
    // Only set up listeners if we're in the editing state
    if (!this.isEditing) return;

    const nameInput = this.element.querySelector('input[name="spell-search"]');
    const levelSelect = this.element.querySelector('select[name="spell-level"]');
    const schoolSelect = this.element.querySelector('select[name="spell-school"]');

    if (nameInput) {
      nameInput.addEventListener('input', (evt) => {
        this.filterState.name = evt.target.value;
        this.render(false);
      });
    }

    if (levelSelect) {
      levelSelect.addEventListener('change', (evt) => {
        this.filterState.level = evt.target.value;
        this.render(false);
      });
    }

    if (schoolSelect) {
      schoolSelect.addEventListener('change', (evt) => {
        this.filterState.school = evt.target.value;
        this.render(false);
      });
    }
  }

  /**
   * Load spell details for the selected spell list
   * @param {Array} spellUuids - Array of spell UUIDs
   * @private
   */
  async _loadSpellDetails(spellUuids) {
    if (!this.selectedSpellList) return;

    try {
      // Update UI to show loading state
      this.selectedSpellList.isLoadingSpells = true;
      this.render(false);

      // Use the fetchSpellDocuments helper from actor-spells
      const spellDocs = await actorSpellUtils.fetchSpellDocuments(new Set(spellUuids), 9); // Get all levels

      // Format the spell documents into a simpler structure
      const spells = spellDocs.map((spell) => {
        return {
          uuid: spell.compendiumUuid || spell.uuid,
          name: spell.name,
          img: spell.img,
          level: spell.system.level,
          school: spell.system.school
        };
      });

      // Sort by level and then name
      spells.sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
      });

      // Update the selected spell list
      this.selectedSpellList.spells = spells;
      this.selectedSpellList.isLoadingSpells = false;

      // Render the updated view
      this.render(false);

      log(3, `Loaded ${spells.length} spells for selected spell list`);
    } catch (error) {
      log(1, 'Error loading spell details:', error);
      this.selectedSpellList.isLoadingSpells = false;
      this.selectedSpellList.hasError = true;
      this.render(false);
    }
  }

  /**
   * Create a confirmation dialog with standardized template
   * @param {Object} options - Dialog options
   * @param {string} options.title - Dialog title
   * @param {string} options.content - Dialog content
   * @param {string} options.confirmLabel - Confirm button label
   * @param {string} options.confirmIcon - Confirm button icon
   * @param {string} options.cancelLabel - Cancel button label
   * @param {string} options.cancelIcon - Cancel button icon
   * @param {string} options.confirmCssClass - CSS class for confirm button
   * @returns {Promise<boolean>} True if confirmed, false otherwise
   */
  async _confirmDialog({
    title = 'Confirm Action',
    content = 'Are you sure you want to proceed?',
    confirmLabel = 'Confirm',
    confirmIcon = 'fas fa-check',
    cancelLabel = 'Cancel',
    cancelIcon = 'fas fa-times',
    confirmCssClass = ''
  }) {
    return new Promise((resolve) => {
      new foundry.applications.DialogV2({
        title,
        content: `<p>${content}</p>`,
        buttons: {
          confirm: {
            icon: `<i class="${confirmIcon}"></i>`,
            label: confirmLabel,
            className: `dialog-button ${confirmCssClass}`,
            callback: () => resolve(true)
          },
          cancel: {
            icon: `<i class="${cancelIcon}"></i>`,
            label: cancelLabel,
            className: 'dialog-button',
            callback: () => resolve(false)
          }
        },
        default: 'cancel'
      }).render(true);
    });
  }

  /* -------------------------------------------- */
  /*  Event Handler Helper Methods                */
  /* -------------------------------------------- */

  /**
   * Select a spell list
   * @param {string} uuid - UUID of the spell list
   * @returns {Promise<void>}
   */
  async selectSpellList(uuid) {
    try {
      log(3, `Selecting spell list: ${uuid}`);

      // First check if we have a custom version of this spell list
      const duplicate = await managerHelpers.findDuplicateSpellList(uuid);

      // If a duplicate exists and we're not the duplicate, select the duplicate instead
      if (duplicate && duplicate.uuid !== uuid) {
        log(3, `Found custom version of spell list, selecting that instead: ${duplicate.uuid}`);
        return this.selectSpellList(duplicate.uuid);
      }

      // Get the spell list
      const spellList = await fromUuid(uuid);
      if (!spellList) {
        ui.notifications.error('Spell list not found.');
        return;
      }

      // Reset editing state when selecting a new spell list
      this.isEditing = false;

      // Extract the spell UUIDs
      const spellUuids = Array.from(spellList.system.spells || []);

      // Set up the selected spell list with loading state
      this.selectedSpellList = {
        document: spellList,
        uuid: spellList.uuid,
        name: spellList.name,
        spellUuids: spellUuids,
        spells: [],
        isLoadingSpells: true
      };

      // Render to show loading state
      this.render(false);

      // Load the spell details
      await this._loadSpellDetails(spellUuids);
    } catch (error) {
      log(1, 'Error selecting spell list:', error);
      ui.notifications.error('Failed to load spell list.');
    }
  }

  /**
   * Enter edit mode for a spell list
   * @param {string} uuid - UUID of the spell list
   * @returns {Promise<void>}
   */
  async editSpellList(uuid) {
    if (!this.selectedSpellList) return;

    try {
      log(3, `Editing spell list: ${uuid}`);

      // Check if this is already a custom list
      const isCustom = !!this.selectedSpellList.document.flags?.[MODULE.ID]?.isDuplicate;

      if (!isCustom) {
        // This is an original list, so we need to duplicate it first
        ui.notifications.info('Creating a custom copy of this spell list...');

        // Duplicate the spell list
        const duplicateList = await managerHelpers.duplicateSpellList(this.selectedSpellList.document);

        // Switch to the duplicate
        this.selectedSpellList = {
          document: duplicateList,
          uuid: duplicateList.uuid,
          name: duplicateList.name,
          spellUuids: Array.from(duplicateList.system.spells || []),
          spells: this.selectedSpellList.spells, // Keep the loaded spells
          isLoadingSpells: false
        };

        ui.notifications.info('Custom copy created. You are now editing your custom version.');
      }

      // Enter editing mode
      this.isEditing = true;
      this.render(false);
    } catch (error) {
      log(1, 'Error entering edit mode:', error);
      ui.notifications.error('Failed to enter edit mode.');
    }
  }

  /**
   * Remove a spell from the selected spell list
   * @param {string} spellUuid - UUID of the spell to remove
   * @returns {Promise<void>}
   */
  async removeSpell(spellUuid) {
    if (!this.selectedSpellList || !this.isEditing) return;

    try {
      log(3, `Removing spell: ${spellUuid}`);

      // Remove the spell from the list
      await managerHelpers.removeSpellFromList(this.selectedSpellList.document, spellUuid);

      // Update our data
      this.selectedSpellList.spells = this.selectedSpellList.spells.filter((s) => s.uuid !== spellUuid);
      this.selectedSpellList.spellUuids = this.selectedSpellList.spellUuids.filter((u) => u !== spellUuid);

      // Re-render
      this.render(false);

      ui.notifications.info('Spell removed from list.');
    } catch (error) {
      log(1, 'Error removing spell:', error);
      ui.notifications.error('Failed to remove spell from list.');
    }
  }

  /**
   * Add a spell to the selected spell list
   * @param {string} spellUuid - UUID of the spell to add
   * @returns {Promise<void>}
   */
  async addSpell(spellUuid) {
    if (!this.selectedSpellList || !this.isEditing) return;

    try {
      log(3, `Adding spell: ${spellUuid}`);

      // Add the spell to the list
      await managerHelpers.addSpellToList(this.selectedSpellList.document, spellUuid);

      // Get the spell details
      const spell = this.availableSpells.find((s) => s.uuid === spellUuid);

      if (spell) {
        // Add to our data
        this.selectedSpellList.spells.push(spell);
        this.selectedSpellList.spellUuids.push(spellUuid);

        // Sort the spells
        this.selectedSpellList.spells.sort((a, b) => {
          if (a.level !== b.level) return a.level - b.level;
          return a.name.localeCompare(b.name);
        });
      }

      // Re-render
      this.render(false);

      ui.notifications.info('Spell added to list.');
    } catch (error) {
      log(1, 'Error adding spell:', error);
      ui.notifications.error('Failed to add spell to list.');
    }
  }

  /**
   * Update a filter state
   * @param {string} filterType - Type of filter to update
   * @param {string} value - New filter value
   */
  updateFilter(filterType, value) {
    this.filterState[filterType] = value;
    this.render(false);
  }

  /**
   * Save the custom spell list
   * @returns {Promise<void>}
   */
  async saveCustomList() {
    if (!this.selectedSpellList || !this.isEditing) return;

    // Just exit edit mode - changes are saved automatically
    this.isEditing = false;
    this.render(false);

    ui.notifications.info('Custom spell list saved.');
  }

  /**
   * Delete the current custom spell list
   * @returns {Promise<void>}
   */
  async deleteCustomList() {
    if (!this.selectedSpellList) return;

    const uuid = this.selectedSpellList.uuid;
    const listName = this.selectedSpellList.name;

    // Confirm deletion with our enhanced dialog
    const confirmed = await this._confirmDialog({
      title: 'Delete Custom Spell List',
      content: `Are you sure you want to delete the custom version of <strong>${listName}</strong>? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmIcon: 'fas fa-trash',
      confirmCssClass: 'dialog-button-danger'
    });

    if (!confirmed) return;

    try {
      // Remove the custom spell list
      await managerHelpers.removeCustomSpellList(uuid);

      // Clear selection
      this.selectedSpellList = null;
      this.isEditing = false;

      // Re-render
      this.render(false);

      ui.notifications.info(`Custom spell list "${listName}" deleted.`);
    } catch (error) {
      log(1, 'Error deleting custom spell list:', error);
      ui.notifications.error('Failed to delete custom spell list.');
    }
  }

  /**
   * Restore a custom spell list from its original
   * @returns {Promise<void>}
   */
  async restoreOriginal() {
    if (!this.selectedSpellList) return;

    const originalUuid = this.selectedSpellList.document.flags?.[MODULE.ID]?.originalUuid;
    if (!originalUuid) return;

    const listName = this.selectedSpellList.name;

    // Confirm restoration with our enhanced dialog
    const confirmed = await this._confirmDialog({
      title: 'Restore from Original',
      content: `Are you sure you want to restore <strong>${listName}</strong> from the original source? Your customizations will be lost.`,
      confirmLabel: 'Restore',
      confirmIcon: 'fas fa-sync',
      confirmCssClass: 'dialog-button-warning'
    });

    if (!confirmed) return;

    try {
      // Get the original spell list
      const originalList = await fromUuid(originalUuid);
      if (!originalList) {
        ui.notifications.error('Original spell list not found.');
        return;
      }

      // Get original spells
      const originalSpells = Array.from(originalList.system.spells || []);

      // Update the custom list with original spells
      await this.selectedSpellList.document.update({
        'system.spells': originalSpells,
        [`flags.${MODULE.ID}.originalModTime`]: originalList._stats?.modifiedTime || 0,
        [`flags.${MODULE.ID}.originalVersion`]: originalList._stats?.systemVersion || game.system.version
      });

      // Update our data and reload spell details
      this.selectedSpellList.spellUuids = originalSpells;
      await this._loadSpellDetails(originalSpells);

      // Exit edit mode
      this.isEditing = false;

      // Re-render
      this.render(false);

      ui.notifications.info(`Spell list "${listName}" restored from original.`);
    } catch (error) {
      log(1, 'Error restoring from original:', error);
      ui.notifications.error('Failed to restore from original.');
    }
  }

  // Add a new method for removing multiple spells
  /**
   * Remove multiple spells from the selected spell list
   * @param {string[]} spellUuids - Array of spell UUIDs to remove
   * @returns {Promise<void>}
   */
  async removeMultipleSpells(spellUuids) {
    if (!this.selectedSpellList || !this.isEditing || !spellUuids.length) return;

    // Confirm multi-removal
    const confirmed = await this._confirmDialog({
      title: 'Remove Multiple Spells',
      content: `Are you sure you want to remove ${spellUuids.length} spells from this list?`,
      confirmLabel: 'Remove',
      confirmIcon: 'fas fa-trash',
      confirmCssClass: 'dialog-button-danger'
    });

    if (!confirmed) return;

    try {
      // Get current spells
      let spells = new Set(this.selectedSpellList.document.system.spells || []);

      // Remove the specified spells
      for (const uuid of spellUuids) {
        spells.delete(uuid);
      }

      // Update the spell list
      await this.selectedSpellList.document.update({
        'system.spells': Array.from(spells)
      });

      // Update our data
      this.selectedSpellList.spells = this.selectedSpellList.spells.filter((s) => !spellUuids.includes(s.uuid));
      this.selectedSpellList.spellUuids = Array.from(spells);

      // Re-render
      this.render(false);

      ui.notifications.info(`Removed ${spellUuids.length} spells from list.`);
    } catch (error) {
      log(1, 'Error removing multiple spells:', error);
      ui.notifications.error('Failed to remove spells from list.');
    }
  }

  /**
   * Show the documentation dialog
   * @returns {Promise<void>}
   */
  async showDocumentation() {
    const content = `
    <h2>GM Spell List Manager Documentation</h2>

    <h3>Overview</h3>
    <p>The GM Spell List Manager allows you to browse, duplicate, and customize spell lists from compendiums.
    These customized lists can then be used by players in their Spell Book.</p>

    <h3>Creating Custom Spell Lists</h3>
    <ol>
      <li>Select a spell list from the left column.</li>
      <li>Click the "Edit" button to create a custom copy.</li>
      <li>Add or remove spells using the right panel.</li>
      <li>Click "Save" when you're done.</li>
    </ol>

    <h3>Modifying Existing Lists</h3>
    <p>Custom lists will show additional controls:</p>
    <ul>
      <li><strong>Restore from Source</strong>: Reset the list to match the original.</li>
      <li><strong>Delete Custom Version</strong>: Remove your custom version.</li>
    </ul>
    <p>If the original list has been updated since your customization, you'll see a notification.</p>

    <h3>Integration with Player Spell Books</h3>
    <p>When a player opens their Spell Book, the system will:</p>
    <ol>
      <li>Check if a custom version of their class spell list exists.</li>
      <li>Use your custom version if available.</li>
      <li>Fall back to the original list if no custom version exists.</li>
    </ol>

    <h3>Best Practices</h3>
    <ul>
      <li>Create custom lists before your players create characters.</li>
      <li>Test custom lists with dummy characters before using them in your game.</li>
      <li>Keep a backup of important custom lists by exporting them.</li>
      <li>Consider communicating list changes to players before making major modifications.</li>
    </ul>
  `;

    // Use a larger dialog for documentation
    new Dialog({
      title: 'GM Spell List Manager Documentation',
      content,
      buttons: {
        close: {
          icon: '<i class="fas fa-check"></i>',
          label: 'Close'
        }
      },
      default: 'close',
      width: 600,
      height: 700
    }).render(true);
  }

  /* -------------------------------------------- */
  /*  Static Handler Methods                      */
  /* -------------------------------------------- */

  /**
   * Handle selecting a spell list (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleSelectSpellList(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;

    const uuid = element.dataset.uuid;

    // Get the application instance directly from foundry
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.selectSpellList(uuid);
  }

  /**
   * Handle clicking the edit button (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleEditSpellList(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;

    const uuid = element.dataset.uuid;

    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.editSpellList(uuid);
  }

  /**
   * Handle removing a spell (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleRemoveSpell(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;

    const uuid = element.dataset.uuid;

    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.removeSpell(uuid);
  }

  /**
   * Handle adding a spell (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleAddSpell(event, _form) {
    const element = event.target.closest('[data-uuid]');
    if (!element) return;

    const uuid = element.dataset.uuid;

    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.addSpell(uuid);
  }

  /**
   * Handle filtering spells (static entry point)
   * @param {Event} event - The change event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleFilterSpells(event, _form) {
    const input = event.target;
    const filterType = input.name.replace('spell-', '');
    const value = input.value;

    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    instance.updateFilter(filterType, value);
  }

  /**
   * Handle saving a custom list (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleSaveCustomList(event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.saveCustomList();
  }

  /**
   * Handle deleting a custom list (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleDeleteCustomList(event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.deleteCustomList();
  }

  /**
   * Handle restoring from original (static entry point)
   * @param {Event} event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static async handleRestoreOriginal(event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    await instance.restoreOriginal();
  }

  /**
   * Handle closing the manager (static entry point)
   * @param {Event} _event - The click event
   * @param {HTMLElement} _form - The form element
   * @static
   */
  static handleClose(_event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    instance.close();
  }

  /**
   * Form handler (static entry point)
   * @param {Event} event - The submit event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The form data
   * @static
   */
  static async formHandler(event, form, formData) {
    event.preventDefault();
    // This will be used for saving customized spell lists
  }
}
