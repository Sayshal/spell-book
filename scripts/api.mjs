/**
 * Spell Book Module API
 *
 * Provides external access to module functionality through a unified API interface.
 * This module creates and registers the global SPELLBOOK API object that allows
 * other modules and macros to interact with Spell Book features programmatically.
 *
 * The API exposes applications, dialogs, utility functions, and convenience methods
 * for opening various UI components and accessing module state.
 *
 * @module API
 * @author Tyler
 */

import { PlayerFilterConfiguration, AnalyticsDashboard, SpellBook, SpellListManager } from './apps/_module.mjs';
import * as DataHelpers from './data/_module.mjs';
import { CompendiumSelection, SpellComparison, DetailsCustomization, LoadoutSelector, SpellNotes, SpellBookSettings } from './dialogs/_module.mjs';
import { log } from './logger.mjs';
import { Cantrips, Macros, Migrations, RuleSet, Loadouts, SpellManager, UsageTracker, UserDataSetup, WizardBook } from './managers/_module.mjs';
import { State } from './state/_module.mjs';
import * as UIHelpers from './ui/_module.mjs';
import * as ValidationHelpers from './validation/_module.mjs';
import { MODULE } from './constants/_module.mjs';

/**
 * Creates and registers the module's API on the global scope.
 * @returns {SpellBookAPI|null} The API object, or null if creation failed
 */
export function createAPI() {
  try {
    const api = {
      apps: { PlayerFilterConfiguration, SpellBook, AnalyticsDashboard, SpellListManager },
      dialogs: { CompendiumSelection, SpellComparison, DetailsCustomization, LoadoutSelector, SpellNotes, SpellBookSettings },
      utils: {
        data: DataHelpers,
        managers: { Cantrips, Macros, Migrations, RuleSet, Loadouts, SpellManager, UsageTracker, UserDataSetup, WizardBook },
        state: State,
        ui: UIHelpers,
        validation: ValidationHelpers
      },
      migrations: { forceMigration: Migrations.forceMigration },
      preloadedData: null,
      openSpellBookForActor: (actor) => {
        if (!actor) {
          log(1, 'No actor provided');
          return null;
        }
        const spellBook = new SpellBook(actor);
        spellBook.render(true);
        return spellBook;
      },
      openSpellListManager: () => {
        const manager = new SpellListManager();
        manager.render(true);
        return manager;
      },
      openAnalyticsDashboard: (options = {}) => {
        const viewMode = options.viewMode || (game.user.isGM ? 'gm' : 'personal');
        const userId = options.userId || game.user.id;
        const dashboard = new AnalyticsDashboard({ viewMode: viewMode, userId: userId });
        dashboard.render(true);
        return dashboard;
      },
      openSpellNotesDialog: (spellUuid) => {
        if (!spellUuid) {
          log(1, 'No spell UUID provided');
          return null;
        }
        const dialog = new SpellNotes({ spellUuid });
        dialog.render(true);
        return dialog;
      },
      openSpellLoadoutDialog: (actor, spellbook, classIdentifier) => {
        if (!actor || !spellbook || !classIdentifier) {
          log(1, 'Missing required parameters for loadout dialog');
          return null;
        }
        const dialog = new LoadoutSelector(actor, spellbook, classIdentifier);
        dialog.render(true);
        return dialog;
      },
      openSpellbookSettingsDialog: (actor) => {
        if (!actor) {
          log(1, 'No actor provided');
          return null;
        }
        const dialog = new SpellBookSettings(actor);
        dialog.render(true);
        return dialog;
      },
      log
    };
    globalThis.SPELLBOOK = api;
    game.modules.get(MODULE.ID).api = api;
    log(3, 'Module API registered with all components');
    return api;
  } catch (error) {
    log(1, 'Error creating API:', error);
    return null;
  }
}
