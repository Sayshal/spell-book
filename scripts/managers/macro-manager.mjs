/**
 * Macro Management and Compendium Operations
 *
 * Manages versioned compendium macros for the Spell Book module including creation,
 * updates, versioning, and cleanup operations. This class provides a centralized
 * system for maintaining module-specific macros in compendium packs with automatic
 * version management and obsolete macro cleanup.
 *
 * Key features:
 * - Automatic macro initialization and version management
 * - Compendium-based macro storage for cross-world compatibility
 * - Version tracking with automatic updates when definitions change
 * - Obsolete macro detection and cleanup
 * - Flag-based macro identification and management
 * - Comprehensive error handling and logging
 *
 * The manager operates on macro configurations defined in the macros module,
 * ensuring all required macros exist in the compendium with current versions
 * and removing any macros that are no longer defined.
 *
 * @module Managers/MacroManager
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as m from '../macros/_module.mjs';

/** @type {MacroConfiguration[]} Array of all module macro configurations */
const MACROS = Object.values(m);

/**
 * Macro configuration object defining macro properties and metadata.
 *
 * @typedef {Object} MacroConfiguration
 * @property {string} flagKey - Unique flag identifier for the macro
 * @property {string} version - Version string for update tracking
 * @property {string} name - Display name of the macro
 * @property {string} command - JavaScript command or script content
 * @property {string} [img] - Icon image path for the macro
 * @property {string} [type] - Macro type (typically 'script')
 */

/**
 * Macro flag data structure for version and management tracking.
 *
 * @typedef {Object} MacroFlagData
 * @property {string} version - Current version of the macro
 * @property {number} created - Timestamp when macro was first created
 * @property {number} lastUpdated - Timestamp of last update
 * @property {boolean} managedByModule - Whether this macro is managed by the module
 */

/**
 * Module flag structure containing macro management data.
 *
 * @typedef {Object} ModuleFlagStructure
 * @property {Object<string, MacroFlagData>} [flagKey] - Flag data indexed by flag key
 */

/**
 * Macro Manager - Centralized macro management and versioning system.
 *
 * This static class provides comprehensive macro management capabilities for the
 * Spell Book module. It handles automatic macro initialization, version tracking,
 * updates, and cleanup operations to ensure all required macros are available
 * and current in the module's compendium pack.
 *
 * All operations are performed against the module's macro compendium pack,
 * providing cross-world compatibility and centralized macro storage. The manager
 * uses flag-based identification to track module-managed macros and distinguish
 * them from user-created content.
 */
export class MacroManager {
  /**
   * Initialize and ensure all module macros exist in compendium.
   *
   * Performs a complete initialization of all module-defined macros, ensuring
   * they exist in the compendium pack with current versions. This method is
   * typically called during module initialization to set up required macros.
   *
   * The process includes:
   * - Validating compendium pack availability
   * - Processing each macro configuration for creation or updates
   * - Cleaning up obsolete macros no longer defined
   * - Comprehensive logging for troubleshooting
   *
   * @returns {Promise<void>} Promise that resolves when all macros are initialized
   * @static
   */
  static async initializeMacros() {
    log(3, 'Initializing compendium macros...');
    const pack = game.packs.get(MODULE.PACK.MACROS);
    if (!pack) return;
    for (const macro of MACROS) await this.ensureCompendiumMacroExists(pack, macro);
    await this.cleanupObsoleteMacros();
    log(3, 'All compendium macros initialized successfully');
  }

  /**
   * Ensure a specific macro exists in the compendium and is current.
   *
   * Checks if a macro exists in the compendium pack and creates or updates it
   * as necessary based on version comparison. This method handles both creation
   * of new macros and updating existing macros when version changes are detected.
   *
   * The process includes:
   * - Searching for existing macros by flag identifier
   * - Version comparison for update determination
   * - Creating new macros with proper flag structure
   * - Updating existing macros with new content and metadata
   * - Comprehensive error handling and logging
   *
   * @param {CompendiumCollection} pack - The macro compendium pack
   * @param {MacroConfiguration} macroConfig - Macro configuration object
   * @returns {Promise<Macro|null>} Promise that resolves to the existing or newly created macro, or null if creation failed
   * @static
   */
  static async ensureCompendiumMacroExists(pack, macroConfig) {
    const { flagKey, version, name, command, img = 'icons/svg/dice-target.svg', type = 'script' } = macroConfig;
    const packDocuments = await pack.getDocuments();
    const existingMacro = packDocuments.find((macro) => macro.getFlag(MODULE.ID, flagKey) !== undefined);
    if (existingMacro) {
      const currentVersion = existingMacro.getFlag(MODULE.ID, `${flagKey}.version`);
      if (currentVersion === version) {
        log(3, `Compendium macro "${name}" is up to date (v${version})`);
        return existingMacro;
      } else {
        log(3, `Updating compendium macro "${name}" from v${currentVersion || 'unknown'} to v${version}`);
        await existingMacro.update({
          name: name,
          command: command,
          img: img,
          [`flags.${MODULE.ID}.${flagKey}.version`]: version,
          [`flags.${MODULE.ID}.${flagKey}.lastUpdated`]: Date.now()
        });
        return existingMacro;
      }
    } else {
      log(3, `Creating new compendium macro "${name}" (v${version})`);
      const newMacro = await Macro.create(
        {
          name: name,
          type: type,
          command: command,
          img: img,
          scope: 'global',
          flags: { [MODULE.ID]: { [flagKey]: { version: version, created: Date.now(), lastUpdated: Date.now(), managedByModule: true } } }
        },
        { pack: pack.collection }
      );
      return newMacro;
    }
  }

  /**
   * Get all macros managed by this module from the compendium.
   *
   * Retrieves all macros in the compendium pack that are managed by this module,
   * identified by the presence of module flags with the managedByModule property.
   * This method is useful for bulk operations and cleanup procedures.
   *
   * The identification process:
   * - Checks for module-specific flags on each macro
   * - Validates the managedByModule flag is present and true
   * - Filters out user-created or other module macros
   * - Returns only macros owned by this module
   *
   * @returns {Promise<Array<Macro>>} Promise that resolves to an array of module-managed macros
   * @static
   */
  static async getManagedMacros() {
    const pack = game.packs.get(MODULE.PACK.MACROS);
    if (!pack) return [];
    const packDocuments = await pack.getDocuments();
    return packDocuments.filter((macro) => {
      const moduleFlags = macro.getFlag(MODULE.ID);
      return moduleFlags && Object.values(moduleFlags).some((flag) => typeof flag === 'object' && flag.managedByModule === true);
    });
  }

  /**
   * Clean up obsolete macros that are no longer defined.
   *
   * Removes macros from the compendium pack that are managed by this module
   * but are no longer defined in the current macro configurations. This prevents
   * accumulation of outdated macros when macro definitions are removed or renamed.
   *
   * The cleanup process:
   * - Compares existing macro flags with current configuration flag keys
   * - Identifies macros with flags not present in current definitions
   * - Safely removes obsolete macros from the compendium
   * - Preserves user-created macros and other module content
   *
   * @returns {Promise<void>} Promise that resolves when cleanup is complete
   * @static
   */
  static async cleanupObsoleteMacros() {
    const currentFlagKeys = MACROS.map((def) => def.flagKey);
    const managedMacros = await this.getManagedMacros();
    for (const macro of managedMacros) {
      const moduleFlags = macro.getFlag(MODULE.ID);
      const macroFlagKeys = Object.keys(moduleFlags || {});
      const isObsolete = macroFlagKeys.every((flagKey) => !currentFlagKeys.includes(flagKey));
      if (isObsolete) await macro.delete();
    }
  }
}
