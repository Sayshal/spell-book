import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as ValidationHelpers from '../validation/_module.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for selecting which compendiums to index for spell searching
 */
export class CompendiumSelectionDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `compendium-selection-${MODULE.ID}`,
    tag: 'form',
    window: {
      title: 'SPELLBOOK.Settings.CompendiumSelectionTitle',
      icon: 'fas fa-books',
      resizable: false
    },
    classes: ['spell-book', 'compendium-selection-dialog'],
    form: {
      handler: CompendiumSelectionDialog.formHandler,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.DIALOGS.COMPENDIUM_SELECTION }
  };

  /**
   * Check if a pack is relevant for spell indexing without full document loading
   * @param {CompendiumCollection} pack Pack to check
   * @returns {Promise<boolean>} Whether the pack contains relevant content
   */
  static async _isPackRelevantForSpells(pack) {
    try {
      if (pack.metadata.type === 'Item') {
        const index = await pack.getIndex({ fields: ['type'] });
        return index.some((entry) => entry.type === 'spell');
      } else if (pack.metadata.type === 'JournalEntry') {
        const index = await pack.getIndex({ fields: ['pages'] });
        return index.some((entry) => entry.pages?.some((page) => page.type === 'spells'));
      }
      return false;
    } catch (error) {
      log(1, `Error checking pack relevance for ${pack.title}:`, error);
      return false;
    }
  }

  /**
   * Get all available compendiums organized by top-level folder
   * @returns {Object} Organized compendium data
   */
  async _getAvailableCompendiums() {
    const compendiums = { categories: new Map() };
    for (const pack of game.packs) {
      if (!['JournalEntry', 'Item'].includes(pack.metadata.type)) continue;
      const isRelevant = await CompendiumSelectionDialog._isPackRelevantForSpells(pack);
      if (!isRelevant) continue;
      const packInfo = {
        id: pack.collection,
        label: pack.title || pack.metadata.label,
        type: pack.metadata.type,
        packageName: pack.metadata.packageName,
        packageType: pack.metadata.packageType
      };
      const organizationName = this._determineOrganizationName(pack);
      if (!compendiums.categories.has(organizationName)) {
        compendiums.categories.set(organizationName, { name: organizationName, packs: [] });
      }
      compendiums.categories.get(organizationName).packs.push(packInfo);
    }
    compendiums.categorizedPacks = Array.from(compendiums.categories.values()).sort((a, b) => a.name.localeCompare(b.name));
    return compendiums;
  }

  /**
   * Determines the organization name for a pack based on its folder structure
   * @param {CompendiumCollection} pack Pack to analyze
   * @returns {string} Organization name to use
   */
  _determineOrganizationName(pack) {
    try {
      const packTopLevelFolder = this._getPackTopLevelFolderName(pack);
      if (packTopLevelFolder) return this._translateSystemFolderName(packTopLevelFolder);
      return this._translateSystemFolderName(pack.title || pack.metadata.label, pack.metadata.id);
    } catch (error) {
      log(1, `Error determining organization name for ${pack.title || 'unknown pack'}:`, error);
      return pack.title || pack.metadata.label || 'Unknown Source';
    }
  }

  /**
   * Gets the top-level folder name from a pack's folder hierarchy
   * @param {CompendiumCollection} pack Pack to analyze
   * @returns {string|null} Top-level folder name or null if no folder
   */
  _getPackTopLevelFolderName(pack) {
    if (!pack || !pack.folder) return null;
    let topLevelFolder;
    if (pack.folder.depth !== 1) {
      const parentFolders = pack.folder.getParentFolders();
      topLevelFolder = parentFolders.at(-1)?.name;
    } else {
      topLevelFolder = pack.folder.name;
    }
    return topLevelFolder || null;
  }

  /**
   * Translates system folder names to more user-friendly names
   * @todo - Name translations should be localized, at least the end result.
   * @param {string} name Folder name to translate
   * @param {string} [id] Optional pack ID for additional context
   * @returns {string} Translated name
   */
  _translateSystemFolderName(name, id = null) {
    if (!name || typeof name !== 'string') return id || 'Unknown Source';
    const nameTranslations = { 'D&D Legacy Content': 'SRD 5.1', 'D&D Modern Content': 'SRD 5.2' };
    if (nameTranslations[name]) return nameTranslations[name];
    for (const [key, value] of Object.entries(nameTranslations)) if (name.includes(key)) return value;
    if (/[./_-]home[\s_-]?brew[./_-]/i.test(name)) return game.i18n.localize('SPELLBOOK.Settings.CompendiumSelectionHomebrew') || 'Homebrew';
    return name;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const currentSettings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
    const compendiums = await this._getAvailableCompendiums();
    const enabledCompendiums = new Set();
    for (const pack of game.packs) if (currentSettings[pack.collection] !== false) enabledCompendiums.add(pack.collection);
    context.categories = this._prepareCategories(compendiums.categorizedPacks, enabledCompendiums);
    const summaryData = this._calculateSummaryData(context.categories);
    context.globalSelectAllCheckboxHtml = this._createGlobalSelectAllCheckbox(summaryData.allSelected);
    context.summary = summaryData;
    return context;
  }

  /**
   * Process categories and create form elements for each pack
   * @param {Array} categorizedPacks The categorized pack data
   * @param {Set} enabledCompendiums Set of enabled compendium IDs
   * @returns {Array} Processed categories with form elements
   */
  _prepareCategories(categorizedPacks, enabledCompendiums) {
    return categorizedPacks.map((category) => {
      const packsInCategory = this._preparePacksInCategory(category.packs, enabledCompendiums, category.name);
      const categoryStats = this._calculateCategoryStats(packsInCategory);
      const categorySelectAllCheckbox = this._createCategorySelectAllCheckbox(category.name, categoryStats);
      return {
        ...category,
        packs: packsInCategory,
        enabledCount: categoryStats.enabledCount,
        totalCount: categoryStats.totalCount,
        disabled: categoryStats.allPacksDisabled,
        categorySelectAllCheckboxHtml: ValidationHelpers.elementToHtml(categorySelectAllCheckbox)
      };
    });
  }

  /**
   * Process packs within a category and create their form elements
   * @param {Array} packs The packs in the category
   * @param {Set} enabledCompendiums Set of enabled compendium IDs
   * @param {string} categoryName Name of the category
   * @returns {Array} Processed packs with form elements
   */
  _preparePacksInCategory(packs, enabledCompendiums, categoryName) {
    return packs.map((pack) => {
      const isModulePack = pack.packageName === MODULE.ID;
      const packData = {
        ...pack,
        enabled: enabledCompendiums.has(pack.id) || isModulePack,
        disabled: isModulePack,
        organizationName: categoryName
      };
      const packCheckbox = this._createPackCheckbox(packData);
      return {
        ...packData,
        checkboxHtml: ValidationHelpers.elementToHtml(packCheckbox)
      };
    });
  }

  /**
   * Calculate statistics for a category
   * @param {Array} packsInCategory The packs in the category
   * @returns {Object} Category statistics
   */
  _calculateCategoryStats(packsInCategory) {
    const enabledCount = packsInCategory.filter((p) => p.enabled).length;
    const totalCount = packsInCategory.length;
    const allPacksDisabled = packsInCategory.every((pack) => pack.disabled);
    return { enabledCount, totalCount, allPacksDisabled };
  }

  /**
   * Create a checkbox for an individual pack
   * @param {Object} packData The pack data
   * @returns {HTMLElement} The created checkbox element
   */
  _createPackCheckbox(packData) {
    const packCheckbox = ValidationHelpers.createCheckbox({
      name: 'compendiumMultiSelect',
      checked: packData.enabled,
      disabled: packData.disabled,
      cssClass: 'compendium-item',
      ariaLabel: `${packData.label}${packData.disabled ? ` (${game.i18n.localize('SPELLBOOK.Settings.CompendiumSelectionRequired')})` : ''}`
    });
    packCheckbox.setAttribute('value', packData.id);
    packCheckbox.dataset.organization = packData.organizationName;
    return packCheckbox;
  }

  /**
   * Create a category select all checkbox
   * @param {string} categoryName Name of the category
   * @param {Object} categoryStats Category statistics
   * @returns {HTMLElement} The created checkbox element
   */
  _createCategorySelectAllCheckbox(categoryName, categoryStats) {
    const { enabledCount, totalCount, allPacksDisabled } = categoryStats;
    const categorySelectAllCheckbox = ValidationHelpers.createCheckbox({
      name: `select-all-category-${categoryName}`,
      checked: enabledCount === totalCount,
      disabled: allPacksDisabled,
      cssClass: 'select-all-category',
      ariaLabel: `${game.i18n.localize('SPELLBOOK.Settings.CompendiumSelectionSelectAllIn')} ${categoryName}${allPacksDisabled ? ` (${game.i18n.localize('SPELLBOOK.Settings.CompendiumSelectionRequired')})` : ''}`
    });
    categorySelectAllCheckbox.dataset.organization = categoryName;
    return categorySelectAllCheckbox;
  }

  /**
   * Calculate summary data for all categories
   * @param {Array} categories The processed categories
   * @returns {Object} Summary data including totals and selection state
   */
  _calculateSummaryData(categories) {
    const totalRelevantPacks = categories.reduce((sum, cat) => sum + cat.totalCount, 0);
    const enabledRelevantPacks = categories.reduce((sum, cat) => sum + cat.enabledCount, 0);
    const allSelected = totalRelevantPacks === enabledRelevantPacks;
    return {
      totalPacks: totalRelevantPacks,
      enabledPacks: enabledRelevantPacks,
      allSelected
    };
  }

  /**
   * Create the global select all checkbox
   * @param {boolean} allSelected Whether all packs are selected
   * @returns {string} HTML string for the checkbox
   */
  _createGlobalSelectAllCheckbox(allSelected) {
    const globalSelectAllCheckbox = ValidationHelpers.createCheckbox({
      name: 'select-all-global',
      checked: allSelected,
      cssClass: 'select-all-global',
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.CompendiumSelectionSelectAll')
    });
    return ValidationHelpers.elementToHtml(globalSelectAllCheckbox);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this._setupEventListeners();
  }

  /**
   * Set up event listeners for checkbox interactions
   */
  _setupEventListeners() {
    const form = this.element;
    const allItemCheckboxes = form.querySelectorAll('dnd5e-checkbox[name="compendiumMultiSelect"]');
    const globalSelectAll = form.querySelector('dnd5e-checkbox.select-all-global');
    const categorySelectAlls = form.querySelectorAll('dnd5e-checkbox.select-all-category');
    if (globalSelectAll) {
      globalSelectAll.addEventListener('change', (event) => {
        const isChecked = event.target.checked;
        allItemCheckboxes.forEach((checkbox) => {
          if (!checkbox.disabled) checkbox.checked = isChecked;
        });
        categorySelectAlls.forEach((checkbox) => {
          if (!checkbox.disabled) checkbox.checked = isChecked;
        });
        this._updateAllCategoryCounts(form);
        this._updateSummaryCount(form, allItemCheckboxes);
      });
    }
    categorySelectAlls.forEach((checkbox) => {
      if (checkbox.disabled) return;
      checkbox.addEventListener('change', (event) => {
        const organizationName = event.target.dataset.organization;
        const isChecked = event.target.checked;
        const categoryCheckboxes = form.querySelectorAll(`dnd5e-checkbox[data-organization="${organizationName}"][name="compendiumMultiSelect"]`);
        categoryCheckboxes.forEach((checkbox) => {
          if (!checkbox.disabled) checkbox.checked = isChecked;
        });
        this._updateCategoryCount(form, organizationName);
        this._updateGlobalSelectAll(form, allItemCheckboxes, globalSelectAll);
        this._updateSummaryCount(form, allItemCheckboxes);
      });
    });
    allItemCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const organizationName = event.target.dataset.organization;
        const categoryCheckboxes = form.querySelectorAll(`dnd5e-checkbox[data-organization="${organizationName}"][name="compendiumMultiSelect"]`);
        const selectAllCheckbox = form.querySelector(`dnd5e-checkbox.select-all-category[data-organization="${organizationName}"]`);
        const allChecked = Array.from(categoryCheckboxes).every((checkbox) => checkbox.checked);
        if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
        this._updateCategoryCount(form, organizationName);
        this._updateGlobalSelectAll(form, allItemCheckboxes, globalSelectAll);
        this._updateSummaryCount(form, allItemCheckboxes);
      });
    });
  }

  /**
   * Update the count display for a specific category
   * @param {HTMLElement} form The form element
   * @param {string} organizationName The organization name to update
   */
  _updateCategoryCount(form, organizationName) {
    const categoryCheckboxes = form.querySelectorAll(`dnd5e-checkbox[data-organization="${organizationName}"][name="compendiumMultiSelect"]`);
    const categoryHeader = form.querySelector(`dnd5e-checkbox.select-all-category[data-organization="${organizationName}"]`);
    if (!categoryHeader) return;
    const checkedCount = Array.from(categoryCheckboxes).filter((checkbox) => checkbox.checked).length;
    const totalCount = categoryCheckboxes.length;
    const categorySpan = categoryHeader.closest('label').querySelector('span');
    if (categorySpan) {
      const categoryName = categorySpan.textContent.replace(/\s*\(.*$/, '');
      categorySpan.textContent = `${categoryName} (${checkedCount}/${totalCount})`;
    }
  }

  /**
   * Update all category counts
   * @param {HTMLElement} form The form element
   */
  _updateAllCategoryCounts(form) {
    const categorySelectAlls = form.querySelectorAll('dnd5e-checkbox.select-all-category');
    categorySelectAlls.forEach((checkbox) => {
      const organizationName = checkbox.dataset.organization;
      this._updateCategoryCount(form, organizationName);
    });
  }

  /**
   * Update the summary count at the top
   * @param {HTMLElement} form The form element
   * @param {NodeList} allCheckboxes All individual checkboxes
   */
  _updateSummaryCount(form, allCheckboxes) {
    const enabledCountSpan = form.querySelector('.enabled-count');
    if (enabledCountSpan) {
      const checkedCount = Array.from(allCheckboxes).filter((checkbox) => checkbox.checked).length;
      enabledCountSpan.textContent = checkedCount;
    }
  }

  /**
   * Updates the global "Select All" checkbox state
   * @param {HTMLElement} _form The form element
   * @param {NodeList} allCheckboxes All individual checkboxes
   * @param {HTMLElement} globalSelectAll Global select all checkbox
   */
  _updateGlobalSelectAll(_form, allCheckboxes, globalSelectAll) {
    if (!globalSelectAll) return;
    const allChecked = Array.from(allCheckboxes).every((checkbox) => checkbox.checked);
    globalSelectAll.checked = allChecked;
  }

  /**
   * Form handler for saving compendium selection options
   * @param {Event} _event The form submission event
   * @param {HTMLElement} form The form element
   * @param {Object} _formData The form data
   */
  static async formHandler(_event, form, _formData) {
    const enabledCompendiums = {};
    const originalSettings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
    for (const pack of game.packs) {
      if (pack.metadata.packageName === MODULE.ID && ['JournalEntry', 'Item'].includes(pack.metadata.type)) {
        const isRelevant = await CompendiumSelectionDialog._isPackRelevantForSpells(pack);
        if (isRelevant) {
          enabledCompendiums[pack.collection] = true;
        }
      }
    }
    const relevantCheckboxes = form.querySelectorAll('dnd5e-checkbox[name="compendiumMultiSelect"]:not([disabled])');
    relevantCheckboxes.forEach((checkbox) => {
      const checkboxValue = checkbox.getAttribute('value') || checkbox.value;
      if (checkboxValue) enabledCompendiums[checkboxValue] = checkbox.checked;
    });
    const settingsChanged = JSON.stringify(originalSettings) !== JSON.stringify(enabledCompendiums);
    await game.settings.set(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS, enabledCompendiums);
    const actualPackCount = Object.values(enabledCompendiums).filter((enabled) => enabled === true).length;
    ui.notifications.info(game.i18n.format('SPELLBOOK.Settings.CompendiumSelectionUpdated', { count: actualPackCount }));
    if (settingsChanged) {
      const reload = await DialogV2.confirm({
        id: 'reload-world-confirm',
        modal: true,
        rejectClose: false,
        window: { title: 'SETTINGS.ReloadPromptTitle' },
        position: { width: 400 },
        content: `<p>${game.i18n.localize('SETTINGS.ReloadPromptBody')}</p>`
      });
      if (!reload) return;
      if (game.user.can('SETTINGS_MODIFY')) game.socket.emit('reload');
      foundry.utils.debouncedReload();
    }
  }
}
