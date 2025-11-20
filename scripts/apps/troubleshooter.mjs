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
import { log, getSpellBookLogHistory } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
      copy: this.#copy,
      export: this.#export,
      importSettings: this.#importSettings,
      includeActors: this.#includeActors,
      openDiscord: this.#openDiscord,
      openGithub: this.#openGithub
    }
  };

  /** @inheritdoc */
  static PARTS = { main: { template: TEMPLATES.TROUBLESHOOTER.MAIN, classes: ['spell-book-troubleshooter-content'] } };

  /** @inheritdoc */
  get title() {
    return `${MODULE.NAME} | ${game.i18n.localize('SPELLBOOK.Settings.Troubleshooter.Title')}`;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
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
    const addLine = (text) => reportLines.push(text);
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
   * Handle exporting troubleshooter.
   * @this Troubleshooter
   * @param {PointerEvent} event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   * @returns {Promise<Object>} Export result information
   */
  static async #export(event, _target) {
    log(3, 'Handling report export.', { event, _target });
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
   * Handle copying to clipboard.
   * @this Troubleshooter
   * @param {PointerEvent} event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static async #copy(event, _target) {
    log(3, 'Handling clipboard copy.', { event, _target });
    event.preventDefault();
    const text = this.generateTextReport();
    await navigator.clipboard.writeText(text);
  }

  /**
   * Handle opening discord.
   * @this Troubleshooter
   * @param {PointerEvent} event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static #openDiscord(event, _target) {
    log(3, 'Handling open discord.', { event, _target });
    event.preventDefault();
    window.open('https://discord.gg/PzzUwU9gdz');
  }

  /**
   * Handle opening github.
   * @this Troubleshooter
   * @param {PointerEvent} event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static #openGithub(event, _target) {
    log(3, 'Handling open github.', { event, _target });
    event.preventDefault();
    window.open('https://github.com/Sayshal/spell-book/issues');
  }

  /**
   * Handle actor export inclusion.
   * @this Troubleshooter
   * @param {PointerEvent} _event - The originating click event.
   * @param {HTMLElement} target - The capturing HTML element which defined a [data-action].
   */
  static #includeActors(_event, target) {
    log(3, 'Handling actor inclusion.', { _event, target });
    game.settings.set(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS, target.checked);
  }

  /**
   * Handle importing settings.
   * @this Troubleshooter
   * @param {PointerEvent} event - The originating click event.
   * @param {HTMLElement} _target - The capturing HTML element which defined a [data-action].
   */
  static async #importSettings(event, _target) {
    log(3, 'Handling settings import.', { event, _target });
    event.preventDefault();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async (fileEvent) => {
      const file = fileEvent.target.files[0];
      if (!file) return;
      const fileContent = await file.text();
      const settingsData = this._extractSettingsFromTroubleshooter(fileContent);
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
      if (confirmed) await this._importSettings(settingsData);
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
   * Add Spell Book log data to the troubleshooting report.
   * @param {function(string): void} addLine - Function to add a line to the report
   * @param {function(string): void} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addSpellBookLogData(addLine, addHeader) {
    log(3, 'Adding Spell Book log data.');
    const spellBookLogs = getSpellBookLogHistory();
    addHeader('Spell Book Logs');
    const logLevel = MODULE.LOG_LEVEL || 0;
    const logLevelName = logLevel === 0 ? 'Disabled' : logLevel === 1 ? 'Errors' : logLevel === 2 ? 'Warnings' : 'Verbose';
    addLine(`Current Log Level: ${logLevel} (${logLevelName})`);
    addLine('');
    if (spellBookLogs.length > 0) {
      for (const logEntry of spellBookLogs) {
        const formatTimestamp = (isoString) => {
          const date = new Date(isoString);
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
          return `${hours}:${minutes}:${seconds}.${milliseconds}`;
        };
        const timestamp = formatTimestamp(logEntry.timestamp || new Date().toISOString());
        const processedContent = logEntry.content
          .map((item, index) => {
            if (typeof item === 'string') {
              if (index === 0 && item.includes('%c')) return item.replace(/%c/g, '');
              if (item.startsWith('color:') || item.includes('font-weight:') || item.includes('text-transform:') || item.includes('letter-spacing:') || item.includes('text-shadow:')) return null;
              return item;
            }
            if (Array.isArray(item)) return `Array(${item.length})`;
            if (typeof item === 'object' && item !== null) {
              const keys = Object.keys(item);
              return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
            }
            return String(item);
          })
          .filter((item) => item !== null)
          .join(' ');
        addLine(`${timestamp} [${(logEntry.type || 'log').toUpperCase()}] ${processedContent}`);
      }
    } else {
      addLine('No SpellBook logs found.');
    }
  }
}
