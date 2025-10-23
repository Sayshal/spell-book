/**
 * Compendium Selection Dialog
 *
 * Configuration dialog for selecting which compendium packs should be included
 * in spell indexing and searching operations. Organizes compendiums by source
 * and provides bulk selection controls for easier management with performance
 * optimization through selective loading.
 *
 * Key features:
 * - Hierarchical compendium organization by source
 * - Bulk selection controls (global and category-level)
 * - Performance-aware pack filtering
 * - Spell-relevant content detection
 * - Required pack handling and validation
 * - User-friendly configuration interface
 *
 * @module Dialogs/CompendiumSelection
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as ValidationUtils from '../validation/_module.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef {Object} PackInfo
 * @property {string} id - The pack collection ID
 * @property {string} label - Display label for the pack
 * @property {string} type - Pack metadata type ('Item' or 'JournalEntry')
 * @property {string} packageName - Name of the package containing this pack
 * @property {string} packageType - Type of package ('world', 'system', 'module')
 */

/**
 * @typedef {Object} OrganizedCompendiums
 * @property {Map<string, CategoryData>} categories - Map of category names to category data
 * @property {CategoryData[]} categorizedPacks - Array of categorized pack data sorted by name
 */

/**
 * @typedef {Object} CategoryData
 * @property {string} name - The category/organization name
 * @property {PackInfo[]} packs - Array of packs in this category
 */

/**
 * @typedef {Object} ProcessedCategory
 * @property {string} name - The category name
 * @property {ProcessedPack[]} packs - Array of processed packs with form elements
 * @property {number} enabledCount - Number of enabled packs in category
 * @property {number} totalCount - Total number of packs in category
 * @property {boolean} disabled - Whether all packs in category are disabled
 * @property {string} categorySelectAllCheckboxHtml - HTML for category select-all checkbox
 */

/**
 * @typedef {Object} ProcessedPack
 * @property {string} id - The pack ID
 * @property {string} label - Pack display label
 * @property {string} type - Pack type
 * @property {string} packageName - Package name
 * @property {string} packageType - Package type
 * @property {boolean} enabled - Whether pack is currently enabled
 * @property {boolean} disabled - Whether pack selection is disabled
 * @property {string} organizationName - Name of organization/category
 * @property {string} checkboxHtml - HTML for pack checkbox element
 */

/**
 * @typedef {Object} CategoryStats
 * @property {number} enabledCount - Number of enabled packs
 * @property {number} totalCount - Total number of packs
 * @property {boolean} allPacksDisabled - Whether all packs are disabled
 */

/**
 * @typedef {Object} SummaryData
 * @property {number} totalPacks - Total number of relevant packs
 * @property {number} enabledPacks - Number of enabled packs
 * @property {boolean} allSelected - Whether all packs are selected
 */

/**
 * Dialog application for selecting which compendiums to index for spell searching.
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class CompendiumSelection extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: `compendium-selection-${MODULE.ID}`,
    tag: 'form',
    window: { title: 'SPELLBOOK.Settings.CompendiumSelectionTitle', icon: 'fas fa-books', resizable: false },
    classes: ['spell-book', 'compendium-selection-dialog'],
    form: {
      handler: CompendiumSelection.formHandler,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  /** @inheritdoc */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.COMPENDIUM_SELECTION } };

  /**
   * Check if a compendium pack contains content relevant for spell indexing.
   * @param {CompendiumCollection} pack - The compendium pack to analyze
   * @returns {Promise<boolean>} Whether the pack contains spell-relevant content
   * @static
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
      return false;
    }
  }

  /**
   * Retrieve and organize all available compendiums by their top-level folder structure.
   * @returns {Promise<OrganizedCompendiums>} Organized compendium data structure
   * @private
   */
  async _getAvailableCompendiums() {
    const compendiums = { categories: new Map() };
    for (const pack of game.packs) {
      if (!['JournalEntry', 'Item'].includes(pack.metadata.type)) continue;
      const isRelevant = await CompendiumSelection._isPackRelevantForSpells(pack);
      if (!isRelevant) continue;
      const packInfo = { id: pack.collection, label: pack.title || pack.metadata.label, type: pack.metadata.type, packageName: pack.metadata.packageName, packageType: pack.metadata.packageType };
      const organizationName = this._determineOrganizationName(pack);
      if (!compendiums.categories.has(organizationName)) compendiums.categories.set(organizationName, { name: organizationName, packs: [] });
      compendiums.categories.get(organizationName).packs.push(packInfo);
    }
    compendiums.categorizedPacks = Array.from(compendiums.categories.values()).sort((a, b) => a.name.localeCompare(b.name));
    return compendiums;
  }

  /**
   * Determine the appropriate organization name for a compendium pack.
   * @param {CompendiumCollection} pack - The compendium pack to analyze
   * @returns {string} The organization name to display
   * @private
   */
  _determineOrganizationName(pack) {
    try {
      const packTopLevelFolder = this._getPackTopLevelFolderName(pack);
      if (packTopLevelFolder) return this._translateSystemFolderName(packTopLevelFolder);
      return this._translateSystemFolderName(pack.title || pack.metadata.label, pack.metadata.id);
    } catch (error) {
      return pack.title || pack.metadata.label || 'Unknown Source';
    }
  }

  /**
   * Extract the top-level folder name from a pack's folder hierarchy.
   * @param {CompendiumCollection} pack - The pack to analyze
   * @returns {string|null} Top-level folder name or null if no folder structure
   * @private
   */
  _getPackTopLevelFolderName(pack) {
    if (!pack || !pack.folder) return null;
    let topLevelFolder;
    if (pack.folder.depth !== 1) {
      const parentFolders = pack.folder.getParentFolders();
      topLevelFolder = parentFolders.at(-1)?.name;
    } else topLevelFolder = pack.folder.name;
    return topLevelFolder || null;
  }

  /**
   * Translate system-specific folder names to more user-friendly display names.
   * @param {string} name - The raw folder name to translate
   * @param {string} [id] - Optional pack ID for additional context
   * @returns {string} The translated, user-friendly name
   * @private
   */
  _translateSystemFolderName(name, id = null) {
    if (!name || typeof name !== 'string') return id || game.i18n.localize('SPELLBOOK.Settings.CompendiumSelectionUnknown');
    if (/[./_-]home[\s_-]?brew[./_-]/i.test(name)) return game.i18n.localize('SPELLBOOK.Settings.CompendiumSelectionHomebrew');
    const translations = new Map([
      ['D&D Legacy Content', CONFIG.DND5E?.sourceBooks?.['SRD 5.1']],
      ['D&D Modern Content', CONFIG.DND5E?.sourceBooks?.['SRD 5.2']],
      ['Free Rules', CONFIG.DND5E?.sourceBooks?.['Free Rules']]
    ]);
    if (translations.has(name)) return game.i18n.localize(translations.get(name));
    for (const [key, localizationKey] of translations) if (name.includes(key)) return game.i18n.localize(localizationKey);
    return name;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const currentSettings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
    const compendiums = await this._getAvailableCompendiums();
    const enabledCompendiums = new Set();
    for (const [packId, isEnabled] of Object.entries(currentSettings)) if (isEnabled === true) enabledCompendiums.add(packId);
    context.categories = this._prepareCategories(compendiums.categorizedPacks, enabledCompendiums);
    const summaryData = this._calculateSummaryData(context.categories);
    context.globalSelectAllCheckboxHtml = this._createGlobalSelectAllCheckbox(summaryData.allSelected);
    context.summary = summaryData;
    return context;
  }

  /**
   * Process categorized packs and create form elements for each category.
   * @param {CategoryData[]} categorizedPacks - The raw categorized pack data
   * @param {Set<string>} enabledCompendiums - Set of currently enabled compendium IDs
   * @returns {ProcessedCategory[]} Array of processed categories with form elements
   * @private
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
        categorySelectAllCheckboxHtml: ValidationUtils.elementToHtml(categorySelectAllCheckbox)
      };
    });
  }

  /**
   * Process individual packs within a category and create their form elements.
   * @param {PackInfo[]} packs - Array of packs in the category
   * @param {Set<string>} enabledCompendiums - Set of enabled compendium IDs
   * @param {string} categoryName - Name of the parent category
   * @returns {ProcessedPack[]} Array of processed packs with form elements
   * @private
   */
  _preparePacksInCategory(packs, enabledCompendiums, categoryName) {
    return packs.map((pack) => {
      const isModulePack = pack.packageName === MODULE.ID;
      const packData = { ...pack, enabled: enabledCompendiums.has(pack.id) || isModulePack, disabled: isModulePack, organizationName: categoryName };
      const packCheckbox = this._createPackCheckbox(packData);
      return { ...packData, checkboxHtml: ValidationUtils.elementToHtml(packCheckbox) };
    });
  }

  /**
   * Calculate statistics for a category of packs.
   * @param {ProcessedPack[]} packsInCategory - The processed packs in the category
   * @returns {CategoryStats} Statistics about the category
   * @private
   */
  _calculateCategoryStats(packsInCategory) {
    const enabledCount = packsInCategory.filter((p) => p.enabled).length;
    const totalCount = packsInCategory.length;
    const allPacksDisabled = packsInCategory.every((pack) => pack.disabled);
    return { enabledCount, totalCount, allPacksDisabled };
  }

  /**
   * Create a checkbox form element for an individual compendium pack.
   * @param {ProcessedPack} packData - The processed pack data
   * @returns {HTMLElement} The created checkbox element
   * @private
   */
  _createPackCheckbox(packData) {
    const packCheckbox = ValidationUtils.createCheckbox({
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
   * Create a select-all checkbox for a category of compendiums.
   * @param {string} categoryName - Name of the category
   * @param {CategoryStats} categoryStats - Statistics about the category
   * @returns {HTMLElement} The created select-all checkbox element
   * @private
   */
  _createCategorySelectAllCheckbox(categoryName, categoryStats) {
    const { enabledCount, totalCount, allPacksDisabled } = categoryStats;
    const categorySelectAllCheckbox = ValidationUtils.createCheckbox({
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
   * Calculate summary statistics across all categories.
   * @param {ProcessedCategory[]} categories - Array of processed categories
   * @returns {SummaryData} Summary statistics for all categories
   * @private
   */
  _calculateSummaryData(categories) {
    const totalRelevantPacks = categories.reduce((sum, cat) => sum + cat.totalCount, 0);
    const enabledRelevantPacks = categories.reduce((sum, cat) => sum + cat.enabledCount, 0);
    const allSelected = totalRelevantPacks === enabledRelevantPacks;
    return { totalPacks: totalRelevantPacks, enabledPacks: enabledRelevantPacks, allSelected };
  }

  /**
   * Create the global select-all checkbox for all compendiums.
   * @param {boolean} allSelected - Whether all packs are currently selected
   * @returns {string} HTML string for the global select-all checkbox
   * @private
   */
  _createGlobalSelectAllCheckbox(allSelected) {
    const globalSelectAllCheckbox = ValidationUtils.createCheckbox({
      name: 'select-all-global',
      checked: allSelected,
      cssClass: 'select-all-global',
      ariaLabel: game.i18n.localize('SPELLBOOK.Settings.CompendiumSelectionSelectAll')
    });
    return ValidationUtils.elementToHtml(globalSelectAllCheckbox);
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this._setupEventListeners();
  }

  /**
   * Set up event listeners for checkbox interactions and bulk selection controls.
   * @private
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
   * Update the count display for a specific category.
   * @param {HTMLElement} form - The form element containing the checkboxes
   * @param {string} organizationName - The organization name to update
   * @private
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
   * Update count displays for all categories.
   * @param {HTMLElement} form - The form element containing the checkboxes
   * @private
   */
  _updateAllCategoryCounts(form) {
    const categorySelectAlls = form.querySelectorAll('dnd5e-checkbox.select-all-category');
    categorySelectAlls.forEach((checkbox) => {
      const organizationName = checkbox.dataset.organization;
      this._updateCategoryCount(form, organizationName);
    });
  }

  /**
   * Update the summary count display at the top of the dialog.
   * @param {HTMLElement} form - The form element containing the checkboxes
   * @param {NodeList} allCheckboxes - All individual pack checkboxes
   * @private
   */
  _updateSummaryCount(form, allCheckboxes) {
    const enabledCountSpan = form.querySelector('.enabled-count');
    if (enabledCountSpan) {
      const checkedCount = Array.from(allCheckboxes).filter((checkbox) => checkbox.checked).length;
      enabledCountSpan.textContent = checkedCount;
    }
  }

  /**
   * Update the global "Select All" checkbox state based on individual selections.
   * @param {HTMLElement} _form - The form element (unused but maintained for consistency)
   * @param {NodeList} allCheckboxes - All individual pack checkboxes
   * @param {HTMLElement} globalSelectAll - The global select-all checkbox
   * @private
   */
  _updateGlobalSelectAll(_form, allCheckboxes, globalSelectAll) {
    if (!globalSelectAll) return;
    const allChecked = Array.from(allCheckboxes).every((checkbox) => checkbox.checked);
    globalSelectAll.checked = allChecked;
  }

  /**
   * Form submission handler for saving compendium selection configuration.
   * @param {Event} _event - The form submission event (unused)
   * @param {HTMLElement} form - The form element containing selection data
   * @param {Object} _formData - The form data object (unused)
   * @returns {Promise<void>}
   * @static
   */
  static async formHandler(_event, form, _formData) {
    const enabledCompendiums = {};
    const originalSettings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
    for (const pack of game.packs) {
      if (pack.metadata.packageName === MODULE.ID && ['JournalEntry', 'Item'].includes(pack.metadata.type)) {
        const isRelevant = await CompendiumSelection._isPackRelevantForSpells(pack);
        if (isRelevant) enabledCompendiums[pack.collection] = true;
      }
    }
    const relevantCheckboxes = form.querySelectorAll('dnd5e-checkbox[name="compendiumMultiSelect"]:not([disabled])');
    relevantCheckboxes.forEach((checkbox) => {
      const checkboxValue = checkbox.getAttribute('value') || checkbox.value;
      if (checkboxValue) enabledCompendiums[checkboxValue] = checkbox.checked;
    });
    const settingsChanged = JSON.stringify(originalSettings) !== JSON.stringify(enabledCompendiums);
    await game.settings.set(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS, enabledCompendiums);
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
