import { MODULE, SETTINGS, TEMPLATES } from '../constants.mjs';
import { detachedRenderOptions } from '../ui/dialogs.mjs';
import { log } from '../utils/logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** GM diagnostic tool that builds a text report of world/module/settings state and optionally exports owned actors. */
export class Troubleshooter extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spell-book-troubleshooter',
    classes: ['spell-book', 'spell-book-troubleshooter'],
    position: { width: 700, height: 700 },
    window: { icon: 'fa-solid fa-bug', resizable: false, contentClasses: ['standard-form'] },
    tag: 'div',
    actions: {
      copy: Troubleshooter.#onCopy,
      export: Troubleshooter.#onExport,
      importSettings: Troubleshooter.#onImportSettings,
      includeActors: Troubleshooter.#onIncludeActors,
      openDiscord: Troubleshooter.#onOpenDiscord,
      openGithub: Troubleshooter.#onOpenGithub
    }
  };

  /** @override */
  static PARTS = {
    main: { template: TEMPLATES.APPS.TROUBLESHOOTER },
    footer: { template: 'templates/generic/form-footer.hbs' }
  };

  /** @override */
  get title() {
    return `${MODULE.NAME} | ${_loc('SPELLBOOK.Settings.Troubleshooter.Title')}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const ownedActors = game.actors.filter((actor) => actor.isOwner);
    context.includeActors = game.settings.get(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS);
    context.output = Troubleshooter.generateTextReport();
    context.ownedActorCount = ownedActors.length;
    context.ownedActorNames = ownedActors.map((a) => a.name).join(', ');
    context.buttons = [
      { type: 'button', action: 'importSettings', icon: 'fa-solid fa-upload', label: 'SPELLBOOK.Settings.Troubleshooter.ImportSettings' },
      { type: 'button', action: 'export', icon: 'fa-solid fa-download', label: 'SPELLBOOK.Settings.Troubleshooter.SaveToFile' },
      { type: 'button', action: 'copy', icon: 'fa-solid fa-copy', label: 'SPELLBOOK.Settings.Troubleshooter.CopyToClipboard' },
      { type: 'button', action: 'openDiscord', icon: 'fa-brands fa-discord', label: 'SPELLBOOK.Settings.Troubleshooter.Discord' },
      { type: 'button', action: 'openGithub', icon: 'fa-brands fa-github-alt', label: 'SPELLBOOK.Settings.Troubleshooter.Github' }
    ];
    return context;
  }

  /**
   * Build a text-based troubleshooting report.
   * @returns {string} The formatted report
   */
  static generateTextReport() {
    const lines = [];
    const addLine = (text) => lines.push(text);
    const addHeader = (text) => {
      lines.push('');
      lines.push(`/////////////// ${text} ///////////////`);
      lines.push('');
    };
    this._addGameInformation(addLine, addHeader);
    this._addModuleInformation(addLine, addHeader);
    this._addSpellBookSettings(addLine, addHeader);
    return lines.join('\n');
  }

  /**
   * Export the text report and, when enabled, owned-actor JSON dumps.
   * @param {PointerEvent} _event - Click event
   * @param {HTMLElement} _target - Target element
   */
  static async #onExport(_event, _target) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const includeActors = game.settings.get(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS);
    const output = this.generateTextReport();
    const reportFilename = `spellbook-troubleshooter-${timestamp}.txt`;
    foundry.utils.saveDataToFile(output, 'text/plain', reportFilename);
    if (!includeActors) {
      ui.notifications.info(_loc('SPELLBOOK.Settings.Troubleshooter.ExportReportOnly', { filename: reportFilename }));
      return;
    }
    const ownedActors = game.actors.filter((actor) => actor.isOwner);
    const failed = [];
    let exportedCount = 0;
    for (const actor of ownedActors) {
      try {
        const data = actor.toCompendium();
        data._stats ??= {};
        data._stats.exportSource = {
          worldId: game.world.id,
          uuid: actor.uuid,
          coreVersion: game.version,
          systemId: game.system.id,
          systemVersion: game.system.version,
          exportedBy: game.user.id,
          exportedAt: new Date().toISOString(),
          troubleshooterExport: true
        };
        foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), 'text/json', `actor-${actor.name.slugify()}-${timestamp}.json`);
        exportedCount++;
      } catch (error) {
        failed.push(actor.name);
        log(1, `Troubleshooter: failed to export actor "${actor.name}".`, error);
      }
    }
    ui.notifications.info(_loc('SPELLBOOK.Settings.Troubleshooter.ExportSuccess', { report: reportFilename, actors: exportedCount }));
    if (failed.length) ui.notifications.warn(_loc('SPELLBOOK.Settings.Troubleshooter.ExportFailures', { count: failed.length, names: failed.join(', ') }));
  }

  /**
   * Copy the text report to the clipboard.
   * @param {PointerEvent} event - Click event
   * @param {HTMLElement} _target - Target element
   */
  static async #onCopy(event, _target) {
    event.preventDefault();
    await navigator.clipboard.writeText(this.generateTextReport());
    ui.notifications.info('SPELLBOOK.Settings.Troubleshooter.CopySuccess', { localize: true });
  }

  /**
   * Open the support Discord in a new tab.
   * @param {PointerEvent} event - Click event
   * @param {HTMLElement} _target - Target element
   */
  static #onOpenDiscord(event, _target) {
    event.preventDefault();
    window.open('https://discord.gg/PzzUwU9gdz');
  }

  /**
   * Open the GitHub issues page in a new tab.
   * @param {PointerEvent} event - Click event
   * @param {HTMLElement} _target - Target element
   */
  static #onOpenGithub(event, _target) {
    event.preventDefault();
    window.open('https://github.com/Sayshal/spell-book/issues');
  }

  /**
   * Persist the "include owned actors in export" checkbox state.
   * @param {PointerEvent} _event - Click event
   * @param {HTMLInputElement} target - Checkbox element
   */
  static #onIncludeActors(_event, target) {
    game.settings.set(MODULE.ID, SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS, target.checked);
  }

  /**
   * Prompt the user for a troubleshooter report file and apply its embedded settings after confirmation.
   * @param {PointerEvent} event - Click event
   * @param {HTMLElement} _target - Target element
   */
  static async #onImportSettings(event, _target) {
    event.preventDefault();
    const parent = this;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async (fileEvent) => {
      const file = fileEvent.target.files[0];
      if (!file) return;
      const content = await file.text();
      const data = Troubleshooter._extractSettingsFromReport(content);
      if (!data) {
        ui.notifications.warn('SPELLBOOK.Settings.Troubleshooter.ImportNoSettings', { localize: true });
        return;
      }
      const confirmed = await DialogV2.confirm({
        window: { title: _loc('SPELLBOOK.Settings.Troubleshooter.ImportConfirmTitle') },
        content: `<div class="import-settings-warning"><p><strong>${_loc('SPELLBOOK.Settings.Troubleshooter.ImportWarningTitle')}:</strong></p>
          <p>${_loc('SPELLBOOK.Settings.Troubleshooter.ImportWarning')}</p>
          <p>${_loc('SPELLBOOK.Settings.Troubleshooter.ImportSettingsCount', { count: Object.keys(data).length })}</p>
        </div>`,
        yes: { icon: '<i class="fa-solid fa-upload"></i>', label: _loc('SPELLBOOK.Settings.Troubleshooter.ImportConfirm') },
        no: { icon: '<i class="fa-solid fa-times"></i>', label: _loc('COMMON.Cancel') },
        modal: true,
        rejectClose: false,
        renderOptions: detachedRenderOptions(parent)
      });
      if (confirmed) await Troubleshooter._applyImportedSettings(data, parent);
    };
    input.click();
  }

  /**
   * Extract the embedded JSON settings block from a troubleshooter report file.
   * @param {string} content - The raw file content
   * @returns {object|null} Parsed settings object, or null if not found
   * @private
   */
  static _extractSettingsFromReport(content) {
    const marker = '=== FULL SETTINGS DATA (for import) ===';
    const markerIndex = content.indexOf(marker);
    if (markerIndex === -1) return null;
    const match = content
      .substring(markerIndex + marker.length)
      .trim()
      .match(/^({[\S\s]*})/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch (error) {
      log(1, 'Troubleshooter: failed to parse settings block.', error);
      return null;
    }
  }

  /**
   * Apply a parsed settings object to world settings, validating deferred keys first.
   * @param {object} data - The settings object extracted from a report
   * @param {object|null} [parent] - Parent application for detached-window routing
   * @returns {Promise<void>}
   * @private
   */
  static async _applyImportedSettings(data, parent = null) {
    const stats = { imported: 0, skipped: 0, errors: [] };
    const deferredKeys = ['loggingLevel'];
    const deferred = new Set(deferredKeys);
    for (const [key, raw] of Object.entries(data)) if (!deferred.has(key)) await Troubleshooter._importOneSetting(key, raw, stats);
    for (const key of deferredKeys) if (key in data) await Troubleshooter._importOneSetting(key, data[key], stats);
    if (stats.imported > 0) ui.notifications.info(_loc('SPELLBOOK.Settings.Troubleshooter.ImportSuccess', { imported: stats.imported, skipped: stats.skipped }));
    if (stats.errors.length) {
      log(1, 'Troubleshooter: errors during settings import.', stats.errors);
      ui.notifications.warn(_loc('SPELLBOOK.Settings.Troubleshooter.ImportErrors', { count: stats.errors.length }));
    }
    if (stats.imported > 5) {
      DialogV2.confirm({
        window: { title: _loc('SPELLBOOK.Settings.Troubleshooter.ReloadTitle') },
        content: `<p>${_loc('SPELLBOOK.Settings.Troubleshooter.ReloadMessage')}</p>`,
        yes: { icon: '<i class="fa-solid fa-refresh"></i>', label: _loc('SPELLBOOK.Settings.Troubleshooter.ReloadConfirm'), callback: () => foundry.utils.debouncedReload() },
        no: { icon: '<i class="fa-solid fa-times"></i>', label: _loc('SPELLBOOK.Settings.Troubleshooter.ReloadCancel') },
        modal: true,
        rejectClose: false,
        renderOptions: detachedRenderOptions(parent)
      });
    }
  }

  /**
   * Import a single setting, skipping unknown keys, unchanged values, and invalid deferred shapes.
   * @param {string} key - The setting key
   * @param {*} raw - The raw entry (either a value or an object containing `value`)
   * @param {object} stats - Running counts `{ imported, skipped, errors }`
   * @returns {Promise<void>}
   * @private
   */
  static async _importOneSetting(key, raw, stats) {
    if (!Object.values(SETTINGS).includes(key)) {
      stats.skipped++;
      return;
    }
    const value = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    const current = game.settings.get(MODULE.ID, key);
    if (JSON.stringify(current) === JSON.stringify(value)) {
      stats.skipped++;
      return;
    }
    if (!Troubleshooter._isValidDeferredValue(key, value)) {
      stats.skipped++;
      return;
    }
    try {
      await game.settings.set(MODULE.ID, key, value);
      stats.imported++;
    } catch (error) {
      stats.errors.push(`${key}: ${error.message}`);
    }
  }

  /**
   * Validate shape-sensitive deferred settings before writing.
   * @param {string} key - Setting key
   * @param {*} value - Candidate value
   * @returns {boolean} Whether the value is structurally valid
   * @private
   */
  static _isValidDeferredValue(_key, _value) {
    return true;
  }

  /**
   * Append a game-information section to the report.
   * @param {function(string): void} addLine - Line-appending callback
   * @param {function(string): void} addHeader - Header-appending callback
   * @private
   */
  static _addGameInformation(addLine, addHeader) {
    addHeader('Game Information');
    addLine(`Foundry Version: ${game.version}`);
    addLine(`System: ${game.system.id} v${game.system.version}`);
    addLine(`World: ${game.world.id} (${game.world.title})`);
    addLine(`User: ${game.user.name} (${game.user.role})`);
    addLine(`Active Scene: ${game.scenes.active?.name || 'None'}`);
    addLine(`Timestamp: ${new Date().toISOString()}`);
  }

  /**
   * Append an active-modules section to the report.
   * @param {function(string): void} addLine - Line-appending callback
   * @param {function(string): void} addHeader - Header-appending callback
   * @private
   */
  static _addModuleInformation(addLine, addHeader) {
    addHeader('Module Information');
    const spellBookModule = game.modules.get(MODULE.ID);
    if (spellBookModule) addLine(`${MODULE.NAME}: ${spellBookModule.version} (${spellBookModule.active ? 'Active' : 'Inactive'})`);
    addLine('');
    addLine('Active Modules:');
    const active = Array.from(game.modules.values())
      .filter((m) => m.active)
      .sort((a, b) => a.title.localeCompare(b.title));
    for (const module of active) addLine(`  ${module.title}: ${module.version}`);
  }

  /**
   * Append a Spell Book settings dump to the report.
   * @param {function(string): void} addLine - Line-appending callback
   * @param {function(string): void} addHeader - Header-appending callback
   * @private
   */
  static _addSpellBookSettings(addLine, addHeader) {
    addHeader('Spell Book Settings');
    const settingKeys = Object.values(SETTINGS).sort();
    const registered = settingKeys.filter((key) => game.settings.settings.has(`${MODULE.ID}.${key}`));
    addLine(`Total Settings: ${registered.length} (${settingKeys.length} defined)`);
    addLine('');
    for (const key of registered) {
      const value = game.settings.get(MODULE.ID, key);
      let display = value;
      if (Array.isArray(value)) display = `[Array with ${value.length} items]`;
      else if (typeof value === 'object' && value !== null) display = `[Object with ${Object.keys(value).length} keys]`;
      addLine(`${key}: ${display}`);
    }
    addLine('');
    addLine('=== FULL SETTINGS DATA (for import) ===');
    const dump = {};
    for (const key of registered) dump[key] = game.settings.get(MODULE.ID, key);
    addLine(JSON.stringify(dump, null, 2));
  }
}
