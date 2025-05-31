import { FLAGS, MODULE, SETTINGS } from './constants.mjs';
import { log } from './logger.mjs';

/**
 * Register migration setting and hook
 */
export function registerMigration() {
  game.settings.register(MODULE.ID, SETTINGS.RUN_MIGRATIONS, {
    name: 'SPELLBOOK.Settings.Migration.Name',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true
  });
  Hooks.once('ready', checkAndRunMigration);
}

/**
 * Check if migration is needed and run if necessary
 */
async function checkAndRunMigration() {
  if (game.user.isGM && game.settings.get(MODULE.ID, SETTINGS.RUN_MIGRATIONS)) {
    log(2, 'Running data migration...');
    ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.StartNotification'));
    await runMigration();
    await game.settings.set(MODULE.ID, SETTINGS.RUN_MIGRATIONS, false);
    ui.notifications.info(game.i18n.localize('SPELLBOOK.Migrations.CompleteNotification'));
  }
}

/**
 * Run the migration process
 */
async function runMigration() {
  const validFlags = Object.values(FLAGS);
  const migrationResults = {
    actors: [],
    processed: 0,
    cantripMigrations: 0,
    invalidFlagRemovals: 0
  };

  log(3, 'Migrating world actors');
  for (const actor of game.actors) {
    const result = await migrateDocument(actor, validFlags);
    if (result.wasUpdated) {
      migrationResults.actors.push({ name: actor.name, id: actor.id, hadCantripMigration: result.cantripMigration, hadInvalidFlags: result.invalidFlags });
      migrationResults.processed++;
      if (result.cantripMigration) migrationResults.cantripMigrations++;
      if (result.invalidFlags) migrationResults.invalidFlagRemovals++;
    }
  }
  const modulePack = game.packs.get(MODULE.PACK);
  if (modulePack) {
    log(3, `Migrating module compendium: ${modulePack.metadata.label}`);
    const documents = await modulePack.getDocuments();
    for (const doc of documents) {
      const result = await migrateDocument(doc, validFlags);
      if (result.wasUpdated) {
        migrationResults.actors.push({
          name: doc.name,
          id: doc.id,
          pack: modulePack.collection,
          hadCantripMigration: result.cantripMigration,
          hadInvalidFlags: result.invalidFlags
        });
        migrationResults.processed++;
        if (result.cantripMigration) migrationResults.cantripMigrations++;
        if (result.invalidFlags) migrationResults.invalidFlagRemovals++;
      }
    }
  }
  logMigrationResults(migrationResults);
}

/**
 * Migrate a single document
 * @param {Document} doc - The document to migrate
 * @param {Array} validFlags - Array of valid flag names
 * @returns {Object} Migration result with wasUpdated, cantripMigration, and invalidFlags flags
 */
async function migrateDocument(doc, validFlags) {
  const flags = doc.flags?.[MODULE.ID];
  if (!flags) return { wasUpdated: false, cantripMigration: false, invalidFlags: false };
  let wasUpdated = false;
  let cantripMigration = false;
  let invalidFlags = false;
  const updates = {};
  for (const [key, value] of Object.entries(flags)) {
    if (!validFlags.includes(key) || value === null || value === undefined || (typeof value === 'object' && Object.keys(value).length === 0)) {
      updates[`flags.${MODULE.ID}.-=${key}`] = null;
      invalidFlags = true;
      wasUpdated = true;
      log(3, `Removing invalid flag "${key}" from ${doc.documentName} "${doc.name}"`);
    }
  }
  if (wasUpdated) {
    await doc.update(updates);
    log(3, `Updated ${doc.documentName} "${doc.name}"`);
  }
  return { wasUpdated, cantripMigration, invalidFlags };
}

/**
 * Log migration results to chat
 */
function logMigrationResults(results) {
  const actorCount = results.actors.length;
  if (results.processed === 0) {
    log(2, game.i18n.localize('SPELLBOOK.Migrations.NoUpdatesNeeded'));
    return;
  }
  let content = `
  <h2>${game.i18n.localize('SPELLBOOK.Migrations.ChatTitle')}</h2>
  <p>${game.i18n.localize('SPELLBOOK.Migrations.ChatDescription')}</p>
  <p>${game.i18n.format('SPELLBOOK.Migrations.TotalUpdated', { count: results.processed })}</p>`;
  if (results.cantripMigrations > 0)
    content += `<p><strong>Cantrip Rules Migration:</strong> ${results.cantripMigrations} actors migrated from legacy cantrip system to per-class rules</p>`;
  if (results.invalidFlagRemovals > 0) content += `<p><strong>Invalid Flags Removed:</strong> ${results.invalidFlagRemovals} actors had invalid flags cleaned up</p>`;
  if (actorCount > 0) {
    content += `<h3>${game.i18n.format('SPELLBOOK.Migrations.UpdatedActors', { count: actorCount })}</h3><ul>`;
    results.actors.slice(0, 10).forEach((actor) => {
      let actorLine = actor.name;
      let details = [];
      if (actor.hadCantripMigration) details.push('cantrip rules');
      if (actor.hadInvalidFlags) details.push('invalid flags');
      if (details.length > 0) actorLine += ` (${details.join(', ')})`;
      if (actor.pack) actorLine += ` - ${game.i18n.format('SPELLBOOK.Migrations.Compendium', { name: actor.pack })}`;
      content += `<li>${actorLine}</li>`;
    });
    if (actorCount > 10) content += `<li>${game.i18n.format('SPELLBOOK.Migrations.AndMore', { count: actorCount - 10 })}</li>`;
    content += `</ul>`;
  }
  content += `<p>${game.i18n.localize('SPELLBOOK.Migrations.Apology')}</p>`;
  ChatMessage.create({ content: content, whisper: [game.user.id], user: game.user.id });
  log(2, game.i18n.format('SPELLBOOK.Migrations.LogComplete', { count: results.processed }));
}

/**
 * Force run migration for testing - remove this after testing
 * Call this from the browser console: game.modules.get('spell-book').api.forceMigration()
 */
export async function forceMigration() {
  log(2, 'Force running migration for testing...');
  await runMigration();
  log(2, 'Migration test complete.');
}
