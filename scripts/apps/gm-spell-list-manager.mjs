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
      showDocumentation: GMSpellListManager.handleShowDocumentation,
      toggleSidebar: GMSpellListManager.handleToggleSidebar,
      toggleSpellLevel: GMSpellListManager.handleToggleSpellLevel,
      pageNavigation: GMSpellListManager.handlePageNavigation
    },
    classes: ['gm-spell-list-manager'],
    window: {
      title: 'GM Spell List Manager',
      resizable: true,
      minimizable: true
    },
    position: {
      top: 150,
      left: 150,
      width: 1000,
      height: Math.max(600, window.innerHeight - 300)
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER,
      templates: [MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER_LEFT, MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER_MIDDLE, MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER_RIGHT]
    },
    footer: { template: MODULE.TEMPLATES.GM_SPELL_LIST_MANAGER_FOOTER }
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
    school: '',
    source: ''
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

    // Set position to fill most of the screen
    this.position.width = Math.max(800, window.innerWidth - 300);
    this.position.height = Math.max(600, window.innerHeight - 300);
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

    // Get mappings to determine which lists have custom versions
    const customMappings = game.settings.get(MODULE.ID, 'customSpellListMappings') || {};
    context.customListMap = customMappings;

    // If we have available spells, apply filters and pagination
    if (this.availableSpells.length > 0) {
      const sourceMap = new Map();
      this.availableSpells.forEach((spell) => {
        if (spell.packName && !sourceMap.has(spell.sourceId)) {
          sourceMap.set(spell.sourceId, {
            id: spell.sourceId,
            label: spell.packName
          });
        }
      });
      context.spellSources = Array.from(sourceMap.values()).sort((a, b) => a.label.localeCompare(b.label));
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
    log(1, 'Render Called');
    super._onRender?.(context, options);

    // If we're loading, start the loading process
    if (this.isLoading) {
      this._loadData();
      return;
    }

    // Set up event listeners for spell filter inputs
    this._setupFilterListeners();

    // Apply saved collapsed states
    this._applyCollapsedLevels();
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
    const { name, level, school, source } = this.filterState;

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

      // Filter by source - only apply if source is not empty
      if (source && source.trim() !== '') {
        // Extract just the package and pack name for comparison
        const spellSourceParts = spell.sourceId?.split('.') || [];
        if (spellSourceParts.length >= 2) {
          const spellSource = `${spellSourceParts[0]}.${spellSourceParts[1]}`;
          if (spellSource !== source) {
            return false;
          }
        } else if (spell.sourceId !== source) {
          return false;
        }
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
   * @param {HTMLElement} form - The form element
   * @static
   */
  static handlePageNavigation(event, form) {
    log(1, { event, form });
    const button = event.target.closest('[data-page-action]'); // Get the button or closest ancestor with the attribute
    if (!button) return;

    const action = button.dataset.pageAction;

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
    const sourceSelect = this.element.querySelector('select[name="spell-source"]');

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

    if (sourceSelect) {
      sourceSelect.addEventListener('change', (evt) => {
        this.filterState.source = evt.target.value;
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
      const spellDocs = await actorSpellUtils.fetchSpellDocuments(new Set(spellUuids), 9);

      // Organize spells by level using the modified helper (passing null for actor)
      const spellLevels = await actorSpellUtils.organizeSpellsByLevel(spellDocs, null);

      // Store both the flat list and the organized levels
      this.selectedSpellList.spells = spellDocs;
      this.selectedSpellList.spellsByLevel = spellLevels;
      this.selectedSpellList.isLoadingSpells = false;

      // Render the updated view
      this.render(false);

      log(3, `Loaded ${spellDocs.length} spells for selected spell list`);
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
    title = game.i18n.localize('SPELLMANAGER.Confirm.Title'),
    content = game.i18n.localize('SPELLMANAGER.Confirm.Content'),
    confirmLabel = game.i18n.localize('SPELLMANAGER.Confirm.Confirm'),
    confirmIcon = 'fas fa-check',
    cancelLabel = game.i18n.localize('SPELLMANAGER.Confirm.Cancel'),
    cancelIcon = 'fas fa-times',
    confirmCssClass = ''
  }) {
    const result = await foundry.applications.api.DialogV2.wait({
      title,
      content: `<p>${content}</p>`,
      buttons: [
        {
          icon: `<i class="${confirmIcon}"></i>`,
          label: confirmLabel,
          action: 'confirm',
          className: `dialog-button ${confirmCssClass}`
        },
        {
          icon: `<i class="${cancelIcon}"></i>`,
          label: cancelLabel,
          action: 'cancel',
          className: 'dialog-button'
        }
      ],
      default: 'cancel'
    });

    return result === 'confirm';
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

      // Try to determine the appropriate source filter
      log(3, 'Determining source filter for spell list');
      let sourceFilter = '';

      // Check if this is a custom spell list
      const isCustomList = !!spellList.flags?.[MODULE.ID]?.isDuplicate;
      if (isCustomList) {
        // Get the original UUID and extract the pack
        const originalUuid = spellList.flags?.[MODULE.ID]?.originalUuid;
        if (originalUuid) {
          try {
            const parsedUuid = foundry.utils.parseUuid(originalUuid);
            sourceFilter = parsedUuid.collection.metadata.packageName;
            log(3, `Using original source from flag: ${sourceFilter}`, { originalUuid, parsedUuid, sourceFilter });
          } catch (e) {
            log(2, `Error parsing original UUID: ${e.message}`);
          }
        }
      } else if (spellList.pack) {
        // Use the current pack
        const [packageName, packName] = spellList.pack.split('.');
        sourceFilter = `${packageName}.${packName}`;
        log(3, `Using current pack source: ${sourceFilter}`);
      }

      // Only set the filter if we found a valid source
      if (sourceFilter) {
        this.filterState.source = sourceFilter;
      } else {
        // Clear the source filter if we couldn't determine a valid source
        this.filterState.source = '';
        log(3, 'No valid source found, clearing source filter');
      }

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

        // Store the original source before duplicating
        let originalSource = '';
        if (this.selectedSpellList.document.pack) {
          const [packageName, packName] = this.selectedSpellList.document.pack.split('.');
          originalSource = `${packageName}.${packName}`;
          log(3, `Stored original source: ${originalSource}`);
        }

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

        // Preserve the original source for filtering
        if (originalSource) {
          this.filterState.source = originalSource;
          log(3, `Preserved original source for filtering: ${originalSource}`);
        }

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
      title: game.i18n.localize('SPELLMANAGER.Confirm.DeleteTitle'),
      content: game.i18n.format('SPELLMANAGER.Confirm.DeleteContent', { name: listName }),
      confirmLabel: game.i18n.localize('SPELLMANAGER.Confirm.DeleteButton'),
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

      ui.notifications.info(game.i18n.format('SPELLMANAGER.Notifications.ListDeleted', { name: listName }));
    } catch (error) {
      log(1, 'Error deleting custom spell list:', error);
      ui.notifications.error(game.i18n.localize('SPELLMANAGER.Notifications.ListDeleteError'));
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
    <h2>${game.i18n.localize('SPELLMANAGER.Documentation.Title')}</h2>

    <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Overview.Title')}</h3>
    <p>${game.i18n.localize('SPELLMANAGER.Documentation.Overview.Content')}</p>

    <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Title')}</h3>
    <ol>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Step1')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Step2')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Step3')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Creation.Step4')}</li>
    </ol>

    <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Title')}</h3>
    <p>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Content')}</p>
    <ul>
      <li><strong>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Control1')}</strong></li>
      <li><strong>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Control2')}</strong></li>
    </ul>
    <p>${game.i18n.localize('SPELLMANAGER.Documentation.Modifying.Note')}</p>

    <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Title')}</h3>
    <p>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Intro')}</p>
    <ol>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Step1')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Step2')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Integration.Step3')}</li>
    </ol>

    <h3>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Title')}</h3>
    <ul>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Item1')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Item2')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Item3')}</li>
      <li>${game.i18n.localize('SPELLMANAGER.Documentation.Practices.Item4')}</li>
    </ul>
  `;

    const dialog = await foundry.applications.api.DialogV2.wait({
      title: game.i18n.localize('SPELLMANAGER.Documentation.Title'),
      content: content,
      classes: ['gm-spell-list-manager-helper'],
      buttons: [
        {
          icon: 'fas fa-check',
          label: game.i18n.localize('SPELLMANAGER.Buttons.Close'),
          action: 'close'
        }
      ],
      position: {
        top: 150,
        left: 150,
        width: 600,
        height: 800
      },
      default: 'close'
    });

    return dialog;
  }

  /**
   * Apply saved collapsed states after rendering
   * @private
   */
  _applyCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'gmCollapsedSpellLevels') || [];

    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) {
        levelContainer.classList.add('collapsed');
      }
    }
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
   * Handle toggling the sidebar
   * @static
   */
  static handleToggleSidebar(event, _form) {
    const appId = `gm-spell-list-manager-${MODULE.ID}`;
    const instance = foundry.applications.instances.get(appId);

    if (!instance) {
      log(1, 'Could not find GMSpellListManager instance');
      return;
    }

    // Toggle the sidebar-collapsed class
    instance.element.classList.toggle('sidebar-collapsed');
  }

  /**
   * Handle spell level toggle action
   * @param {Event} event - The click event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static handleToggleSpellLevel(event, form) {
    // Find the parent spell-level container
    const levelContainer = form.parentElement;

    if (!levelContainer || !levelContainer.classList.contains('spell-level')) {
      return;
    }

    const levelId = levelContainer.dataset.level;

    // Toggle collapsed state
    levelContainer.classList.toggle('collapsed');

    // Save state to user flags
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'gmCollapsedSpellLevels') || [];
    const isCollapsed = levelContainer.classList.contains('collapsed');
    if (isCollapsed && !collapsedLevels.includes(levelId)) {
      collapsedLevels.push(levelId);
    } else if (!isCollapsed && collapsedLevels.includes(levelId)) {
      collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
    }

    game.user.setFlag(MODULE.ID, 'gmCollapsedSpellLevels', collapsedLevels);
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
