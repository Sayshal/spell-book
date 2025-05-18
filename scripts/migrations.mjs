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
  const migrationResults = { actors: [], processed: 0 };
  log(3, 'Migrating world actors');
  for (const actor of game.actors) {
    const wasUpdated = await migrateDocument(actor, validFlags);
    if (wasUpdated) {
      migrationResults.actors.push({
        name: actor.name,
        id: actor.id
      });
      migrationResults.processed++;
    }
  }
  const modulePack = game.packs.get(MODULE.PACK);
  if (modulePack) {
    log(3, `Migrating module compendium: ${modulePack.metadata.label}`);
    const documents = await modulePack.getDocuments();
    for (const doc of documents) {
      const wasUpdated = await migrateDocument(doc, validFlags);
      if (wasUpdated) {
        migrationResults.actors.push({
          name: doc.name,
          id: doc.id,
          pack: modulePack.collection
        });
        migrationResults.processed++;
      }
    }
  }
  logMigrationResults(migrationResults);
}

/**
 * Migrate a single document
 * @returns {Boolean} Whether the document was updated
 */
async function migrateDocument(doc, validFlags) {
  const flags = doc.flags?.[MODULE.ID];
  if (!flags) return false;

  let updated = false;
  const updates = {};

  // Check each flag
  for (const [key, value] of Object.entries(flags)) {
    if (!validFlags.includes(key) || value === null || value === undefined || (typeof value === 'object' && Object.keys(value).length === 0)) {
      updates[`flags.${MODULE.ID}.-=${key}`] = null;
      updated = true;
      log(3, `Removing invalid flag "${key}" from ${doc.documentName} "${doc.name}"`);
    }
  }

  if (updated) {
    try {
      await doc.update(updates);
      log(3, `Updated ${doc.documentName} "${doc.name}"`);
      return true;
    } catch (error) {
      log(1, `Error updating ${doc.documentName} "${doc.name}":`, error);
      return false;
    }
  }

  return false;
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

  if (actorCount > 0) {
    content += `<h3>${game.i18n.format('SPELLBOOK.Migrations.UpdatedActors', { count: actorCount })}</h3><ul>`;
    results.actors.slice(0, 10).forEach((actor) => {
      if (actor.pack) {
        content += `<li>${actor.name} (${game.i18n.format('SPELLBOOK.Migrations.Compendium', { name: actor.pack })})</li>`;
      } else {
        content += `<li>${actor.name}</li>`;
      }
    });
    if (actorCount > 10) {
      content += `<li>${game.i18n.format('SPELLBOOK.Migrations.AndMore', { count: actorCount - 10 })}</li>`;
    }
    content += `</ul>`;
  }
  content += `<p>${game.i18n.localize('SPELLBOOK.Migrations.Apology')}</p>`;
  ChatMessage.create({
    content: content,
    whisper: [game.user.id],
    user: game.user.id
  });
  log(2, game.i18n.format('SPELLBOOK.Migrations.LogComplete', { count: results.processed }));
}
