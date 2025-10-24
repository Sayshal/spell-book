/**
 * Spell Book Troubleshooter Application
 *
 * A diagnostic tool for generating troubleshooting reports to assist
 * with Spell Book module issues. This GM-only application captures relevant system
 * information, module settings, filtered console logs, and optionally exports owned
 * actor data for debugging support.
 *
 * @module Applications/Troubleshooter
 * @author Tyler
 */

import { MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Troubleshooter export result information.
 *
 * @typedef {Object} ExportResult
 * @property {string} filename - The primary troubleshooting report filename
 * @property {number} exportedCount - Total number of files exported
 * @property {boolean} includeActors - Whether actor data was included
 */

/**
 * Settings import validation result.
 *
 * @typedef {Object} ImportResult
 * @property {number} imported - Number of settings successfully imported
 * @property {number} skipped - Number of settings skipped
 * @property {Array<string>} errors - Array of error messages
 */

/**
 * Actor export metadata for troubleshooting context.
 *
 * @typedef {Object} ActorExportMetadata
 * @property {string} worldId - Current world ID
 * @property {string} uuid - Actor UUID
 * @property {string} coreVersion - Foundry VTT core version
 * @property {string} systemId - Game system ID
 * @property {string} systemVersion - Game system version
 * @property {string} exportedBy - User ID of exporter
 * @property {string} exportedAt - ISO timestamp of export
 * @property {boolean} troubleshooterExport - Flag indicating troubleshooter export
 */

/**
 * Spell Book Troubleshooter Application.
 */
export class Troubleshooter extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'spell-book-troubleshooter',
    classes: ['spell-book', 'spell-book-troubleshooter'],
    position: { width: 750, height: 'auto' },
    window: { icon: 'fa-solid fa-bug', resizable: false },
    tag: 'div',
    actions: {
      copyToClipboard: Troubleshooter.handleClipboardCopy,
      exportReport: Troubleshooter.handleReportExport,
      importSettings: Troubleshooter.handleSettingsImport,
      openDiscord: Troubleshooter.handleDiscord,
      openGithub: Troubleshooter.handleGithub,
      toggleIncludeActors: Troubleshooter.handleActorInclusion
    }
  };

  /** @inheritdoc */
  static PARTS = { main: { template: TEMPLATES.TROUBLESHOOTER.MAIN, classes: ['spell-book-troubleshooter-content'] } };

  /** @inheritdoc */
  get title() {
    return `${MODULE.NAME} | ${game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.Title')}`;
  }

  /** @inheritdoc */
  _prepareContext(options) {
    const context = super._prepareContext(options);
    const ownedActors = game.actors.filter((actor) => actor.isOwner);
    context.includeActors = game.settings.get(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS);
    context.output = Troubleshooter.generateTextReport();
    context.ownedActorCount = ownedActors.length;
    context.ownedActorNames = ownedActors.map((a) => a.name).join(', ');
    log(3, 'Preparing Troubleshooter context:', { options, context });
    return context;
  }

  /**
   * Generate a text-based troubleshooting report.
   * @returns {string} The formatted troubleshooting report
   * @static
   */
  static generateTextReport() {
    log(3, 'Generating text report.');
    const reportLines = [];

    /** @type {function(string): void} Function to add a line to the report */
    const addLine = (text) => reportLines.push(text);

    /** @type {function(string): void} Function to add a section header */
    const addHeader = (text) => {
      addLine('');
      addLine(`/////////////// ${text} ///////////////`);
      addLine('');
    };
    this._addGameInformation(addLine, addHeader);
    this._addModuleInformation(addLine, addHeader);
    this._addSpellBookSettings(addLine, addHeader);
    this._addSpellBookLogData(addLine, addHeader);
    return reportLines.join('\n');
  }

  /**
   * Export the troubleshooting report and optionally actor data.
   * @returns {Promise<ExportResult>} Export result information
   * @static
   */
  static async exportTroubleshooterData() {
    log(3, 'Exporting troubleshooter data.');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const includeActors = game.settings.get(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS);
    const output = this.generateTextReport();
    const filename = `spellbook-troubleshooter-${timestamp}.txt`;
    foundry.utils.saveDataToFile(output, 'text/plain', filename);
    let exportedCount = 1;
    if (includeActors) {
      const ownedActors = game.actors.filter((actor) => actor.isOwner);
      for (const actor of ownedActors) {
        try {
          const actorData = actor.toCompendium();
          actorData._stats ??= {};
          actorData._stats.exportSource = {
            worldId: game.world.id,
            uuid: actor.uuid,
            coreVersion: game.version,
            systemId: game.system.id,
            systemVersion: game.system.version,
            exportedBy: game.user.id,
            exportedAt: new Date().toISOString(),
            troubleshooterExport: true
          };
          const actorFilename = `actor-${actor.name.slugify()}-${timestamp}.json`;
          foundry.utils.saveDataToFile(JSON.stringify(actorData, null, 2), 'text/json', actorFilename);
          exportedCount++;
        } catch (error) {
          log(1, 'Error exporting troubleshooter data:', error);
        }
      }
    }
    return { filename, exportedCount, includeActors };
  }

  /**
   * Handle the export report button click event.
   * @param {Event} event - The triggering event
   * @returns {Promise<void>}
   * @todo Do we need to prevent default? Also, missing target parameter.
   * @static
   */
  static async handleReportExport(event) {
    log(3, 'Handling report export.', { event });
    event.preventDefault();
    await Troubleshooter.exportTroubleshooterData();
  }

  /**
   * Handle the copy to clipboard button click event.
   * @param {Event} event - The triggering event
   * @returns {Promise<void>}
   * @todo Do we need to prevent default? Also, missing target parameter.
   * @static
   */
  static async handleClipboardCopy(event) {
    log(3, 'Handling clipboard copy.', { event });
    event.preventDefault();
    const text = Troubleshooter.generateTextReport();
    await navigator.clipboard.writeText(text);
  }

  /**
   * Handle the open Discord button click event.
   * @param {Event} event - The triggering event
   * @todo Do we need to prevent default? Also, missing target parameter.
   * @static
   */
  static handleDiscord(event) {
    log(3, 'Handling open discord.', { event });
    event.preventDefault();
    window.open('https://discord.gg/PzzUwU9gdz');
  }

  /**
   * Handle the open GitHub button click event.
   * @param {Event} event - The triggering event
   * @todo Do we need to prevent default? Also, missing target parameter.
   * @static
   */
  static handleGithub(event) {
    log(3, 'Handling open github.', { event });
    event.preventDefault();
    window.open('https://github.com/Sayshal/spell-book/issues');
  }

  /**
   * Handle the include actors checkbox toggle event.
   * @param {Event} event - The triggering event
   * @todo Missing target parameter.
   * @static
   */
  static handleActorInclusion(event) {
    log(3, 'Handling actor inclusion.', { event });
    game.settings.set(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS, event.target.checked);
  }

  /**
   * Handle the import settings button click event.
   * @param {Event} event - The triggering event
   * @returns {Promise<void>}
   * @todo Do we need to prevent default? Also, missing target parameter.
   * @static
   */
  static async handleSettingsImport(event) {
    log(3, 'Handling settings import.', { event });
    event.preventDefault();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async (fileEvent) => {
      const file = fileEvent.target.files[0];
      if (!file) return;
      const fileContent = await file.text();
      const settingsData = Troubleshooter._extractSettingsFromTroubleshooter(fileContent);
      if (!settingsData) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.ImportConfirmTitle') },
        content: `
            <div class="import-settings-warning">
              <p><strong>${game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.ImportWarningTitle')}:</strong></p>
              <p>${game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.ImportWarning')}</p>
              <p>${game.i18n.format('SPELLBOOK.Settings.Troubleshooter.ImportSettingsCount', { count: Object.keys(settingsData).length })}</p>
            </div>
          `,
        yes: { icon: '<i class="fa-solid fa-upload"></i>', label: game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.ImportConfirm') },
        no: { icon: '<i class="fa-solid fa-times"></i>', label: game.i18n.localize('SPELLBOOK.UI.Cancel') },
        modal: true,
        rejectClose: false
      });
      if (confirmed) await Troubleshooter._importSettings(settingsData);
    };
    input.click();
  }

  /**
   * Extract settings data from troubleshooter file content.
   * @param {string} fileContent - The troubleshooter file content
   * @returns {Object|null} The settings data or null if not found
   * @static
   * @private
   */
  static _extractSettingsFromTroubleshooter(fileContent) {
    const marker = '=== FULL SETTINGS DATA (for import) ===';
    const markerIndex = fileContent.indexOf(marker);
    if (markerIndex === -1) return null;
    const jsonStart = markerIndex + marker.length;
    const jsonContent = fileContent.substring(jsonStart).trim();
    const jsonMatch = jsonContent.match(/^({[\S\s]*})/);
    if (!jsonMatch) return null;
    const settingsData = JSON.parse(jsonMatch[1]);
    log(3, 'Extracted settings from troubleshooter!', { fileContent, settingsData });
    return settingsData;
  }

  /**
   * Import settings data into the game with validation and error handling.
   * @param {Object} settingsData - The settings data to import
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async _importSettings(settingsData) {
    let importedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const deferredSettings = ['advancedSearchPrefix', 'filterConfiguration', 'loggingLevel'];
    for (const [settingKey, settingData] of Object.entries(settingsData)) {
      if (deferredSettings.includes(settingKey)) continue;
      try {
        const validSettingKeys = Object.values(SETTINGS);
        if (!validSettingKeys.includes(settingKey)) {
          skippedCount++;
          continue;
        }
        const settingValue = settingData && typeof settingData === 'object' && 'value' in settingData ? settingData.value : settingData;
        const currentValue = game.settings.get(MODULE.ID, settingKey);
        if (JSON.stringify(currentValue) === JSON.stringify(settingValue)) {
          skippedCount++;
          continue;
        }
        await game.settings.set(MODULE.ID, settingKey, settingValue);
        importedCount++;
        log(3, `Imported setting ${settingKey}: ${JSON.stringify(currentValue)} -> ${JSON.stringify(settingValue)}`);
      } catch (settingError) {
        errors.push(`${settingKey}: ${settingError.message}`);
      }
    }
    for (const settingKey of deferredSettings) {
      if (!(settingKey in settingsData)) continue;
      const settingData = settingsData[settingKey];
      try {
        const validSettingKeys = Object.values(SETTINGS);
        if (!validSettingKeys.includes(settingKey)) {
          skippedCount++;
          continue;
        }
        const settingValue = settingData && typeof settingData === 'object' && 'value' in settingData ? settingData.value : settingData;
        const currentValue = game.settings.get(MODULE.ID, settingKey);
        if (JSON.stringify(currentValue) === JSON.stringify(settingValue)) {
          skippedCount++;
          continue;
        }
        if (settingKey === 'advancedSearchPrefix') {
          if (typeof settingValue === 'string' && settingValue.length === 1) {
            await game.settings.set(MODULE.ID, settingKey, settingValue);
            importedCount++;
            log(3, `Imported deferred setting ${settingKey}: ${JSON.stringify(currentValue)} -> ${JSON.stringify(settingValue)}`);
          } else {
            log(2, `Skipping invalid advancedSearchPrefix: ${JSON.stringify(settingValue)}`);
            skippedCount++;
          }
        } else if (settingKey === 'filterConfiguration') {
          if (settingValue && typeof settingValue === 'object' && settingValue.version && Array.isArray(settingValue.filters)) {
            await game.settings.set(MODULE.ID, settingKey, settingValue);
            importedCount++;
            log(3, `Imported deferred setting ${settingKey}: ${JSON.stringify(currentValue)} -> ${JSON.stringify(settingValue)}`);
          } else {
            log(2, `Skipping invalid filterConfiguration structure: ${JSON.stringify(settingValue)}`);
            skippedCount++;
          }
        } else {
          await game.settings.set(MODULE.ID, settingKey, settingValue);
          importedCount++;
          log(3, `Imported deferred setting ${settingKey}: ${JSON.stringify(currentValue)} -> ${JSON.stringify(settingValue)}`);
        }
      } catch (settingError) {
        errors.push(`${settingKey}: ${settingError.message}`);
      }
    }
    if (importedCount > 0) ui.notifications.info(game.i18n.format('SPELLBOOK.Settings.Troubleshooter.ImportSuccess', { imported: importedCount, skipped: skippedCount }));
    if (errors.length > 0) log(1, 'Errors encountered during settings import:', { errors });
    if (importedCount > 5) {
      foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.ReloadTitle') },
        content: `<p>${game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.ReloadMessage')}</p>`,
        yes: { icon: '<i class="fa-solid fa-refresh"></i>', label: game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.ReloadConfirm'), callback: () => foundry.utils.debouncedReload() },
        no: { icon: '<i class="fa-solid fa-times"></i>', label: game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.ReloadCancel') },
        modal: true,
        rejectClose: false
      });
    }
  }

  /**
   * Add game information section to the troubleshooting report.
   * @param {function(string): void} addLine - Function to add a line to the report
   * @param {function(string): void} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addGameInformation(addLine, addHeader) {
    log(3, 'Adding game information.');
    addHeader('Game Information');
    addLine(`Foundry Version: ${game.version}`);
    addLine(`System: ${game.system.id} v${game.system.version}`);
    addLine(`World: ${game.world.id} (${game.world.title})`);
    addLine(`User: ${game.user.name} (${game.user.role})`);
    addLine(`Active Scene: ${game.scenes.active?.name || 'None'}`);
    addLine(`Timestamp: ${new Date().toISOString()}`);
  }

  /**
   * Add module information section to the troubleshooting report.
   * @param {function(string): void} addLine - Function to add a line to the report
   * @param {function(string): void} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addModuleInformation(addLine, addHeader) {
    log(3, 'Adding module information.');
    addHeader('Module Information');
    const spellBookModule = game.modules.get(MODULE.ID);
    if (spellBookModule) addLine(`${MODULE.NAME}: ${spellBookModule.version} (${spellBookModule.active ? 'Active' : 'Inactive'})`);
    addLine('');
    addLine('Active Modules:');
    const activeModules = Array.from(game.modules.values())
      .filter((m) => m.active)
      .sort((a, b) => a.title.localeCompare(b.title));
    for (const module of activeModules) addLine(`  ${module.title}: ${module.version}`);
  }

  /**
   * Add all Spell Book settings to the troubleshooting report.
   * @param {function(string): void} addLine - Function to add a line to the report
   * @param {function(string): void} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addSpellBookSettings(addLine, addHeader) {
    log(3, 'Adding SpellBook settings.');
    addHeader('Spell Book Settings');
    const settingKeys = Object.values(SETTINGS).sort();
    const registeredSettings = settingKeys.filter((key) => game.settings.settings.has(`${MODULE.ID}.${key}`));
    addLine(`Total Settings: ${registeredSettings.length} (${settingKeys.length} defined)`);
    addLine('');
    for (const settingKey of registeredSettings) {
      const value = game.settings.get(MODULE.ID, settingKey);
      let displayValue = value;
      if (typeof value === 'object' && value !== null) displayValue = `[Object with ${Object.keys(value).length} keys]`;
      else if (Array.isArray(value)) displayValue = `[Array with ${value.length} items]`;
      addLine(`${settingKey}: ${displayValue}`);
    }
    addLine('');
    addLine('=== FULL SETTINGS DATA (for import) ===');
    const fullSettingsData = {};
    for (const settingKey of registeredSettings) fullSettingsData[settingKey] = game.settings.get(MODULE.ID, settingKey);
    addLine(JSON.stringify(fullSettingsData, null, 2));
  }

  /**
   * Add filtered Spell Book log data to the troubleshooting report.
   * @param {function(string): void} addLine - Function to add a line to the report
   * @param {function(string): void} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addSpellBookLogData(addLine, addHeader) {
    log(3, 'Adding SpellBook log data.');
    const allLogs = window.console_logs || [];
    const spellBookLogs = allLogs.filter((log) => {
      if (!log.content || !Array.isArray(log.content)) return false;
      return log.content.some((item) => {
        /** @todo This is too restrictive as well. */
        if (typeof item === 'string') return item.includes(MODULE.ID);
        return false;
      });
    });
    if (spellBookLogs.length) {
      addHeader('Spell Book Log Data');
      const logLevel = MODULE.LOG_LEVEL || 0;
      const logLevelName = logLevel === 0 ? 'Disabled' : logLevel === 1 ? 'Errors' : logLevel === 2 ? 'Warnings' : 'Verbose';
      addLine(`Log Level: ${logLevel} (${logLevelName})`);
      addLine(`Total Spell Book logs: ${spellBookLogs.length}`);
      addLine('Recent Spell Book logs:');
      const recentLogs = spellBookLogs.slice(-50); /** @todo This is not enough logs. */
      for (const logEntry of recentLogs) {
        const processedContent = logEntry.content
          .map((item) => {
            if (typeof item === 'string') return item;
            if (Array.isArray(item)) return `Array(${item.length})`;
            if (typeof item === 'object' && item !== null) {
              const keys = Object.keys(item);
              return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
            }
            return String(item);
          })
          .join(' ');
        addLine(`${logEntry.timestamp || 'unknown'} [${(logEntry.type || 'log').toUpperCase()}] ${processedContent}`);
      }
    } else {
      addHeader('Spell Book Log Data');
      addLine('No Spell Book logs found.');
    }
  }
}
