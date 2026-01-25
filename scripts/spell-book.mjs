/**
 * Spell Book Module Main Entry Point
 *
 * Primary initialization file for the Spell Book module. This module orchestrates
 * the complete startup sequence through three Foundry lifecycle hooks.
 *
 * @module SpellBook
 * @author Tyler
 */

import { createAPI } from './api.mjs';
import { SpellBook } from './apps/_module.mjs';
import { MODULE, SETTINGS } from './constants/_module.mjs';
import * as DataUtils from './data/_module.mjs';
import { unlockModuleCompendium, preloadTemplates } from './data/generic-utils.mjs';
import { registerDnD5eIntegration, registerTidy5eIntegration } from './integrations/_module.mjs';
import { initializeLogger, log } from './logger.mjs';
import { Macros, Migrations, UsageTracker, UserDataSetup } from './managers/_module.mjs';
import { registerSettings } from './settings.mjs';
import { registerSpellBookTours } from './tours/_module.mjs';
import * as UIUtils from './ui/_module.mjs';
import { createChatMessage } from './ui/_module.mjs';
import { SocketHandler } from './sockets.mjs';

Hooks.once('init', async function () {
  CONFIG.DND5E.spellListTypes['actor-spellbook'] = game.i18n.localize('SPELLBOOK.Registry.ActorSpellBooksGroup');
  registerSettings();
  initializeLogger();
  registerDnD5eIntegration();
  if (game.modules.get('tidy5e-sheet')?.active) registerTidy5eIntegration();
  await preloadTemplates();
  createAPI();
  const module = game.modules.get(MODULE.ID);
  module.socketHandler = new SocketHandler();
  log(3, 'Module initialized.');
});

Hooks.on('setup', () => {
  let position = game.settings.get(MODULE.ID, SETTINGS.SPELL_BOOK_POSITION);
  if (!position || (typeof position === 'object' && Object.keys(position).length === 0)) position = { height: 875, width: 600 };
  SpellBook.DEFAULT_OPTIONS.position = position;
  log(3, 'Spell Book position restored.');
});

Hooks.once('ready', async function () {
  const suppressWarnings = game.settings.get(MODULE.ID, SETTINGS.SUPPRESS_MIGRATION_WARNINGS);
  if (!suppressWarnings) Hooks.on('createChatMessage', createChatMessage);
  DataUtils.initializePackIndexCache();
  Migrations.runAllMigrations();
  UIUtils.DescriptionInjector.initialize();
  await unlockModuleCompendium();
  await Macros.initializeMacros();
  await UserDataSetup.initializeUserSpellData();
  await UsageTracker.initialize();
  const suppressPreload = game.settings.get(MODULE.ID, SETTINGS.SUPPRESS_PRELOAD_NOTIFICATION);
  await DataUtils.preloadData(!suppressPreload);
  if (game.user.isGM) await DataUtils.registerCustomSpellLists();
  await registerSpellBookTours();
  log(3, 'Module ready.');
});

Hooks.on('createJournalEntryPage', (page, _options, _userId) => {
  if (DataUtils.shouldInvalidateCacheForPage(page)) DataUtils.invalidateSpellListCache();
});

Hooks.on('updateJournalEntryPage', (page, changes, _options, _userId) => {
  if (DataUtils.shouldInvalidateCacheForPage(page)) if (changes.system?.spells || changes.system?.identifier || changes.flags) DataUtils.invalidateSpellListCache();
});

Hooks.on('deleteJournalEntryPage', (page, _options, _userId) => {
  if (DataUtils.shouldInvalidateCacheForPage(page)) DataUtils.invalidateSpellListCache();
});
