/**
 * Spell Book Module API
 *
 * Provides external access to module functionality through a unified API interface.
 * This module creates and registers the global SPELLBOOK API object that allows
 * other modules and macros to interact with Spell Book features programmatically.
 * @module API
 * @author Tyler
 */

import { PlayerFilterConfiguration, AnalyticsDashboard, SpellBook, SpellListManager } from './apps/_module.mjs';
import * as DataUtils from './data/_module.mjs';
import { CompendiumSelection, SpellComparison, DetailsCustomization, LoadoutSelector, SpellNotes, SpellBookSettings } from './dialogs/_module.mjs';
import { log } from './logger.mjs';
import { Cantrips, Macros, Migrations, RuleSet, Loadouts, SpellManager, UsageTracker, UserDataSetup, WizardBook } from './managers/_module.mjs';
import { State } from './state/_module.mjs';
import * as UIUtils from './ui/_module.mjs';
import * as ValidationUtils from './validation/_module.mjs';
import { MODULE } from './constants/_module.mjs';

/**
 * Creates and registers the module's API on the global scope.
 * @returns {object | null} The API object, or null if creation failed
 */
export function createAPI() {
  const api = {
    apps: { PlayerFilterConfiguration, SpellBook, AnalyticsDashboard, SpellListManager },
    dialogs: { CompendiumSelection, SpellComparison, DetailsCustomization, LoadoutSelector, SpellNotes, SpellBookSettings },
    utils: {
      data: DataUtils,
      managers: { Cantrips, Macros, Migrations, RuleSet, Loadouts, SpellManager, UsageTracker, UserDataSetup, WizardBook },
      state: State,
      ui: UIUtils,
      validation: ValidationUtils
    },
    migrations: { forceMigration: Migrations.forceMigration },
    preloadedData: null,
    openSpellBookForActor: async (actor) => {
      if (!actor) return null;
      const spellbook = new SpellBook(actor);
      await spellbook._preInitialize();
      spellbook.render({ force: true });
    },
    openSpellListManager: async () => {
      const manager = new SpellListManager();
      await manager._preInitialize();
      manager.render({ force: true });
    },
    openAnalytics: (options = {}) => {
      const viewMode = options.viewMode || (game.user.isGM ? 'gm' : 'personal');
      const userId = options.userId || game.user.id;
      new AnalyticsDashboard({ viewMode: viewMode, userId: userId }).render({ force: true });
    },
    openSpellNotesDialog: (spellUuid) => {
      if (!spellUuid) return null;
      new SpellNotes({ spellUuid }).render({ force: true });
    },
    openSpellLoadoutDialog: (actor, spellbook, classIdentifier) => {
      if (!actor || !spellbook || !classIdentifier) return null;
      new LoadoutSelector(actor, spellbook, classIdentifier).render({ force: true });
    },
    openSpellbookSettingsDialog: (actor) => {
      if (!actor) return null;
      new SpellBookSettings(actor).render({ force: true });
    },
    log
  };
  globalThis.SPELLBOOK = api;
  game.modules.get(MODULE.ID).api = api;
  log(3, 'Module API registered:', { globalAPI: SPELLBOOK, localAPI: game.modules.get(MODULE.ID).api });
  return api;
}
