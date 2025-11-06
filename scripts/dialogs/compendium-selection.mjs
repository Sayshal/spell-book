/**
 * Compendium Selection Dialog
 *
 * Configuration dialog for selecting which compendium packs should be included
 * in spell indexing and searching operations. Organizes compendiums by source
 * and provides bulk selection controls for easier management with performance
 * optimization through selective loading.
 *
 * @module Dialogs/CompendiumSelection
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as ValidationUtils from '../validation/_module.mjs';

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
    form: { handler: CompendiumSelection.formHandler, submitOnChange: false, closeOnSubmit: true }
  };

  /** @inheritdoc */
  static PARTS = { form: { template: TEMPLATES.DIALOGS.COMPENDIUM_SELECTION } };

  /**
   * Check if a compendium pack contains content relevant for spell indexing.
   * @param {Collection<string, Object>} pack - The compendium pack to analyze
   * @returns {Promise<boolean>} Whether the pack contains spell-relevant content
   * @static
   */
  static async _isPackRelevantForSpells(pack) {
    log(3, `Checking if ${pack.name} is relevant for SpellBook.`);
    if (pack.metadata.type === 'Item') {
      const index = await pack.getIndex({ fields: ['type'] });
      return index.some((entry) => entry.type === 'spell');
    } else if (pack.metadata.type === 'JournalEntry') {
      const index = await pack.getIndex({ fields: ['pages'] });
      return index.some((entry) => entry.pages?.some((page) => page.type === 'spells'));
    }
    return false;
  }

  /**
   * Retrieve and organize all available compendiums by their top-level folder structure.
   * @returns {Promise<Object>} Organized compendium data structure
   * @private
   */
  async _getAvailableCompendiums() {
    log(3, 'Getting available compendiums.');
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
    log(3, 'Found compendiums for selection:', { compendiums });
    return compendiums;
  }

  /**
   * Determine the appropriate organization name for a compendium pack.
   * @param {Collection<string, Object>} pack - The compendium pack to analyze
   * @returns {string} The organization name to display
   * @private
   */
  _determineOrganizationName(pack) {
    log(3, 'Determining organization name for pack.', { packName: pack.title || pack.metadata.label });
    const packTopLevelFolder = this._getPackTopLevelFolderName(pack);
    if (packTopLevelFolder) return this._translateSystemFolderName(packTopLevelFolder);
    return this._translateSystemFolderName(pack.title || pack.metadata.label, pack.metadata.id);
  }

  /**
   * Extract the top-level folder name from a pack's folder hierarchy.
   * @param {Collection<string, Object>} pack - The pack to analyze
   * @returns {string|null} Top-level folder name or null if no folder structure
   * @private
   */
  _getPackTopLevelFolderName(pack) {
    log(3, 'Getting pack top level folder name.', { packName: pack.title || pack.metadata.label });
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
    log(3, 'Translating system folder name.', { name, id });
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
    log(3, 'Preparing context for compendium selection.', { options });
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
   * @param {Array<Object>} categorizedPacks - The raw categorized pack data
   * @param {Set<string>} enabledCompendiums - Set of currently enabled compendium IDs
   * @returns {Array<{
   *   name: string,
   *   packs: Array<Object>,
   *   enabledCount: number,
   *   totalCount: number,
   *   disabled: boolean,
   *   categorySelectAllCheckboxHtml: string
   * }>} Array of processed categories with form elements
   * @private
   */
  _prepareCategories(categorizedPacks, enabledCompendiums) {
    log(3, 'Preparing categories.', { categoryCount: categorizedPacks.length, enabledCount: enabledCompendiums.size });
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
   * @param {Array<{ id: string, packageName: string, [key: string]: any }>} packs - Array of packs in the category
   * @param {Set<string>} enabledCompendiums - Set of enabled compendium IDs
   * @param {string} categoryName - Name of the parent category
   * @returns {Array<{
   *   id: string,
   *   packageName: string,
   *   enabled: boolean,
   *   disabled: boolean,
   *   organizationName: string,
   *   checkboxHtml: string,
   *   [key: string]: any
   * }>} Array of processed packs with form elements
   * @private
   */
  _preparePacksInCategory(packs, enabledCompendiums, categoryName) {
    log(3, 'Preparing packs in category.', { categoryName, packCount: packs.length });
    return packs.map((pack) => {
      const isModulePack = pack.packageName === MODULE.ID;
      const packData = { ...pack, enabled: enabledCompendiums.has(pack.id) || isModulePack, disabled: isModulePack, organizationName: categoryName };
      const packCheckbox = this._createPackCheckbox(packData);
      return { ...packData, checkboxHtml: ValidationUtils.elementToHtml(packCheckbox) };
    });
  }

  /**
   * Calculate statistics for a category of packs.
   * @param {Array<{ enabled: boolean, disabled: boolean, [key: string]: any }>} packsInCategory - The processed packs in the category
   * @returns {{ enabledCount: number, totalCount: number, allPacksDisabled: boolean }} Statistics about the category
   * @private
   */
  _calculateCategoryStats(packsInCategory) {
    log(3, 'Calculating category stats.', { packCount: packsInCategory.length });
    const enabledCount = packsInCategory.filter((p) => p.enabled).length;
    const totalCount = packsInCategory.length;
    const allPacksDisabled = packsInCategory.every((pack) => pack.disabled);
    return { enabledCount, totalCount, allPacksDisabled };
  }

  /**
   * Create a checkbox form element for an individual compendium pack.
   * @param {{ id: string, enabled: boolean, disabled: boolean, organizationName: string, label?: string, [key: string]: any }} packData - The processed pack data
   * @returns {HTMLElement} The created checkbox element
   * @private
   */
  _createPackCheckbox(packData) {
    log(3, 'Creating pack checkbox.', { packId: packData.id, enabled: packData.enabled, disabled: packData.disabled });
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
   * @param {{ enabledCount: number, totalCount: number, allPacksDisabled: boolean }} categoryStats - Statistics about the category
   * @returns {HTMLElement} The created select-all checkbox element
   * @private
   */
  _createCategorySelectAllCheckbox(categoryName, categoryStats) {
    log(3, 'Creating category select-all checkbox.', { categoryName, ...categoryStats });
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
   * @param {Array<{ totalCount: number, enabledCount: number, [key: string]: any }>} categories - Array of processed categories
   * @returns {{ totalPacks: number, enabledPacks: number, allSelected: boolean }} Summary statistics for all categories
   * @private
   */
  _calculateSummaryData(categories) {
    log(3, 'Calculating summary data.', { categoryCount: categories.length });
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
    log(3, 'Creating global select-all checkbox.', { allSelected });
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
    log(3, 'Rendering compendium selection dialog.', { context, options });
    super._onRender(context, options);
    this._setupEventListeners();
  }

  /**
   * Set up event listeners for checkbox interactions and bulk selection controls.
   * @private
   */
  _setupEventListeners() {
    log(3, 'Setting up event listeners for compendium selection.');
    const form = this.element;
    const allItemCheckboxes = form.querySelectorAll('dnd5e-checkbox[name="compendiumMultiSelect"]');
    const globalSelectAll = form.querySelector('dnd5e-checkbox.select-all-global');
    const categorySelectAlls = form.querySelectorAll('dnd5e-checkbox.select-all-category');
    if (globalSelectAll) {
      globalSelectAll.addEventListener('change', (event) => {
        log(3, 'Global select-all changed.', { checked: event.target.checked });
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
        log(3, 'Category select-all changed.', { organization: event.target.dataset.organization, checked: event.target.checked });
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
        log(3, 'Individual pack checkbox changed.', { organization: event.target.dataset.organization });
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
    log(3, 'Updating category count.', { organizationName });
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
    log(3, 'Updating all category counts.');
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
    log(3, 'Updating summary count.');
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
    log(3, 'Updating global select-all state.');
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
    log(3, 'Handling form submission for compendium selection.');
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
    log(3, 'Saving compendium selection settings.', { settingsChanged, enabledCount: Object.keys(enabledCompendiums).length });
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
