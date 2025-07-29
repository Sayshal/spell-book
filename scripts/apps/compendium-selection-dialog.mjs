import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { log } from '../logger.mjs';

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
    position: {
      width: 'auto',
      height: 'auto'
    },
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
   * @param {CompendiumCollection} pack - Pack to check
   * @returns {Promise<boolean>} Whether the pack contains relevant content
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
   * @param {CompendiumCollection} pack - Pack to analyze
   * @returns {string} Organization name to use
   * @private
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
   * @param {CompendiumCollection} pack - Pack to analyze
   * @returns {string|null} Top-level folder name or null if no folder
   * @private
   */
  _getPackTopLevelFolderName(pack) {
    if (!pack || !pack.folder) return null;
    try {
      let topLevelFolder;
      if (pack.folder.depth !== 1) {
        const parentFolders = pack.folder.getParentFolders();
        topLevelFolder = parentFolders.at(-1)?.name;
      } else {
        topLevelFolder = pack.folder.name;
      }
      return topLevelFolder || null;
    } catch (error) {
      log(2, `Error getting pack top-level folder for ${pack.metadata.label}:`, error);
      return null;
    }
  }

  /**
   * Translates system folder names to more user-friendly names
   * @param {string} name - Folder name to translate
   * @param {string} [id] - Optional pack ID for additional context
   * @returns {string} Translated name
   * @private
   */
  _translateSystemFolderName(name, id = null) {
    if (!name || typeof name !== 'string') return id || 'Unknown Source';
    //LOCALIZE
    const nameTranslations = {
      'D&D Legacy Content': 'SRD 5.1',
      'D&D Modern Content': 'SRD 5.2'
    };
    if (nameTranslations[name]) return nameTranslations[name];
    for (const [key, value] of Object.entries(nameTranslations)) {
      if (name.includes(key)) return value;
    }
    if (/[./_-]home[\s_-]?brew[./_-]/i.test(name)) return game.i18n.localize('SPELLBOOK.Settings.CompendiumSelectionHomebrew') || 'Homebrew';
    return name;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const currentSettings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
    const compendiums = await this._getAvailableCompendiums();
    const enabledCompendiums = Object.keys(currentSettings).length > 0 ? new Set(Object.keys(currentSettings)) : new Set(Array.from(game.packs).map((p) => p.collection));
    context.categories = compendiums.categorizedPacks.map((category) => {
      const packsInCategory = category.packs.map((pack) => {
        const isModulePack = pack.packageName === MODULE.ID;
        return {
          ...pack,
          enabled: enabledCompendiums.has(pack.id) || isModulePack,
          disabled: isModulePack,
          organizationName: category.name
        };
      });
      const allPacksDisabled = packsInCategory.every((pack) => pack.disabled);
      return {
        ...category,
        packs: packsInCategory,
        enabledCount: packsInCategory.filter((p) => p.enabled).length,
        totalCount: packsInCategory.length,
        disabled: allPacksDisabled
      };
    });
    const totalRelevantPacks = compendiums.categorizedPacks.reduce((sum, cat) => sum + cat.packs.length, 0);
    const enabledRelevantPacks = context.categories.reduce((sum, cat) => sum + cat.enabledCount, 0);
    const allSelected = totalRelevantPacks === enabledRelevantPacks;
    context.summary = { totalPacks: totalRelevantPacks, enabledPacks: enabledRelevantPacks, allSelected };
    return context;
  }

  get template() {
    return TEMPLATES.DIALOGS.COMPENDIUM_SELECTION;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this._setupEventListeners();
  }

  /**
   * Set up event listeners for checkbox interactions
   * @private
   */
  _setupEventListeners() {
    const form = this.element;
    const allItemCheckboxes = form.querySelectorAll('input[name="compendiumMultiSelect"]');
    const globalSelectAll = form.querySelector('.select-all-global');
    const categorySelectAlls = form.querySelectorAll('.select-all-category');
    if (globalSelectAll) {
      globalSelectAll.addEventListener('change', (event) => {
        const isChecked = event.target.checked;
        allItemCheckboxes.forEach((input) => {
          if (!input.disabled) input.checked = isChecked;
        });
        categorySelectAlls.forEach((input) => {
          if (!input.disabled) input.checked = isChecked;
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
        const categoryCheckboxes = form.querySelectorAll(`input[data-organization="${organizationName}"][name="compendiumMultiSelect"]`);
        categoryCheckboxes.forEach((input) => {
          if (!input.disabled) input.checked = isChecked;
        });
        this._updateCategoryCount(form, organizationName);
        this._updateGlobalSelectAll(form, allItemCheckboxes, globalSelectAll);
        this._updateSummaryCount(form, allItemCheckboxes);
      });
    });
    allItemCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const organizationName = event.target.dataset.organization;
        const categoryCheckboxes = form.querySelectorAll(`input[data-organization="${organizationName}"][name="compendiumMultiSelect"]`);
        const selectAllCheckbox = form.querySelector(`.select-all-category[data-organization="${organizationName}"]`);
        const allChecked = Array.from(categoryCheckboxes).every((input) => input.checked);
        if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
        this._updateCategoryCount(form, organizationName);
        this._updateGlobalSelectAll(form, allItemCheckboxes, globalSelectAll);
        this._updateSummaryCount(form, allItemCheckboxes);
      });
    });
  }

  /**
   * Update the count display for a specific category
   * @param {HTMLElement} form - The form element
   * @param {string} organizationName - The organization name to update
   * @private
   */
  _updateCategoryCount(form, organizationName) {
    const categoryCheckboxes = form.querySelectorAll(`input[data-organization="${organizationName}"][name="compendiumMultiSelect"]`);
    const categoryHeader = form.querySelector(`.select-all-category[data-organization="${organizationName}"]`);
    if (!categoryHeader) return;
    const checkedCount = Array.from(categoryCheckboxes).filter((input) => input.checked).length;
    const totalCount = categoryCheckboxes.length;
    const categorySpan = categoryHeader.closest('label').querySelector('span');
    if (categorySpan) {
      const categoryName = categorySpan.textContent.replace(/\s*\(.*$/, '');
      categorySpan.textContent = `${categoryName} (${checkedCount}/${totalCount})`;
    }
  }

  /**
   * Update all category counts
   * @param {HTMLElement} form - The form element
   * @private
   */
  _updateAllCategoryCounts(form) {
    const categorySelectAlls = form.querySelectorAll('.select-all-category');
    categorySelectAlls.forEach((checkbox) => {
      const organizationName = checkbox.dataset.organization;
      this._updateCategoryCount(form, organizationName);
    });
  }

  /**
   * Update the summary count at the top
   * @param {HTMLElement} form - The form element
   * @param {NodeList} allCheckboxes - All individual checkboxes
   * @private
   */
  _updateSummaryCount(form, allCheckboxes) {
    const enabledCountSpan = form.querySelector('.enabled-count');
    if (enabledCountSpan) {
      const checkedCount = Array.from(allCheckboxes).filter((input) => input.checked).length;
      enabledCountSpan.textContent = checkedCount;
    }
  }

  /**
   * Updates the global "Select All" checkbox state
   * @param {HTMLElement} form - The form element
   * @param {NodeList} allCheckboxes - All individual checkboxes
   * @param {HTMLElement} globalSelectAll - Global select all checkbox
   * @private
   */
  _updateGlobalSelectAll(form, allCheckboxes, globalSelectAll) {
    if (!globalSelectAll) return;
    const allChecked = Array.from(allCheckboxes).every((input) => input.checked);
    globalSelectAll.checked = allChecked;
  }

  /**
   * Handle form submission
   */
  static async formHandler(event, form, formData) {
    const enabledCompendiums = {};
    const originalSettings = game.settings.get(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS);
    let modulePackCount = 0;
    for (const pack of game.packs) {
      if (pack.metadata.packageName === MODULE.ID && ['JournalEntry', 'Item'].includes(pack.metadata.type)) {
        const isRelevant = await CompendiumSelectionDialog._isPackRelevantForSpells(pack);
        if (isRelevant) {
          enabledCompendiums[pack.collection] = true;
          modulePackCount++;
        }
      }
    }
    const enabledCheckboxes = form.querySelectorAll('input[name="compendiumMultiSelect"]:checked:not(:disabled)');
    let userSelectedCount = 0;
    enabledCheckboxes.forEach((checkbox) => {
      if (!enabledCompendiums.hasOwnProperty(checkbox.value)) userSelectedCount++;
      enabledCompendiums[checkbox.value] = true;
    });
    const settingsChanged = JSON.stringify(originalSettings) !== JSON.stringify(enabledCompendiums);
    await game.settings.set(MODULE.ID, SETTINGS.INDEXED_COMPENDIUMS, enabledCompendiums);
    const actualPackCount = userSelectedCount + modulePackCount;
    ui.notifications.info(
      game.i18n.format('SPELLBOOK.Settings.CompendiumSelectionUpdated', {
        count: actualPackCount
      })
    );
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
      if (true && game.user.can('SETTINGS_MODIFY')) game.socket.emit('reload');
      foundry.utils.debouncedReload();
    }
  }
}
