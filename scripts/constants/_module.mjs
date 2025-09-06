/**
 * Constants module exports for the Spell Book module.
 *
 * This module provides centralized access to all constant definitions used
 * throughout the Spell Book module. It serves as the single entry point for
 * importing any constants needed by other modules.
 *
 * @module Constants
 * @author Tyler
 */

/**
 * Re-export all actor flag definitions and deprecated flag tracking.
 * Includes flag keys, data structures, and migration utilities.
 */
export * from './flags.mjs';

/**
 * Re-export core module configuration and identifiers.
 * Includes module settings, enums, asset paths, and default configurations.
 */
export * from './module.mjs';

/**
 * Re-export Handlebars template path definitions.
 * Includes all template paths for applications, dialogs, and components.
 */
export * from './templates.mjs';

/**
 * @example
 * // Import specific constants as needed:
 * import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
 *
 * // Use individual constants:
 * const actorFlags = actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS);
 * const templatePath = TEMPLATES.PLAYER_SPELL_BOOK.MAIN;
 *
 * @example
 * // Import everything with namespace:
 * import * as Constants from '../constants/_module.mjs';
 *
 * // Use namespaced constants:
 * const flagValue = actor.getFlag(Constants.MODULE.ID, Constants.FLAGS.CLASS_RULES);
 * await renderTemplate(Constants.TEMPLATES.DIALOGS.SPELL_NOTES, templateData);
 */
