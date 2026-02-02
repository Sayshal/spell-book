/**
 * Macro Management and Compendium Operations
 *
 * Manages versioned compendium macros for the Spell Book module including creation,
 * updates, versioning, and cleanup operations. This class provides a centralized
 * system for maintaining module-specific macros in compendium packs with automatic
 * version management and obsolete macro cleanup.
 *
 * The manager operates on macro configurations defined in the macros module,
 * ensuring all required macros exist in the compendium with current versions
 * and removing any macros that are no longer defined.
 * @module Managers/Macros
 * @author Tyler
 */

import { MODULE } from '../constants/_module.mjs';
import { log } from '../logger.mjs';
import * as m from '../macros/_module.mjs';

const MACROS = Object.values(m);

/**
 * Macro Manager - Centralized macro management and versioning system.
 */
export class Macros {
  /**
   * Initialize and ensure all module macros exist in compendium.
   * @returns {Promise<void>} Promise that resolves when all macros are initialized
   * @static
   */
  static async initializeMacros() {
    log(3, 'Initializing macros.', { macroCount: MACROS.length });
    const pack = game.packs.get(MODULE.PACK.MACROS);
    for (const macro of MACROS) await this.ensureCompendiumMacroExists(pack, macro);
    await this.cleanupObsoleteMacros();
    log(3, 'Macro initialization complete.');
  }

  /**
   * Ensure a specific macro exists in the compendium and is current.
   * @param {object} pack - The macro compendium pack
   * @param {object} macro - Macro configuration object
   * @returns {Promise<object | null>} Promise that resolves to the existing or newly created Macro document, or null if not found/creation failed
   * @static
   */
  static async ensureCompendiumMacroExists(pack, macro) {
    const { flagKey, version, name, command, img = 'icons/svg/dice-target.svg', type = 'script' } = macro;
    log(3, 'Ensuring compendium macro exists.', { name, version, flagKey });
    const packDocuments = await pack.getDocuments();
    const existingMacro = packDocuments.find((macro) => macro.getFlag(MODULE.ID, flagKey) !== undefined);
    if (existingMacro) {
      const currentVersion = existingMacro.getFlag(MODULE.ID, `${flagKey}.version`);
      if (currentVersion === version) return existingMacro;
      else {
        log(3, `Updating compendium macro "${name}" from ${currentVersion} --> ${version}`);
        await existingMacro.update({
          name: name,
          command: command,
          img: img,
          [`flags.${MODULE.ID}.${flagKey}.version`]: version,
          [`flags.${MODULE.ID}.${flagKey}.lastUpdated`]: Date.now()
        });
        log(3, `Compendium macro "${name}" updated successfully.`);
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
      log(3, `Compendium macro "${name}" created successfully.`, { macroId: newMacro?.id });
      return newMacro;
    }
  }

  /**
   * Get all macros managed by this module from the compendium.
   * @returns {Promise<Array<object>>} Promise that resolves to an array of module-managed macros
   * @static
   */
  static async getManagedMacros() {
    log(3, 'Getting managed macros.');
    const pack = game.packs.get(MODULE.PACK.MACROS);
    const packDocuments = await pack.getDocuments();
    const managedMacros = packDocuments.filter((macro) => {
      const moduleFlags = macro.getFlag(MODULE.ID);
      return moduleFlags && Object.values(moduleFlags).some((flag) => typeof flag === 'object' && flag.managedByModule === true);
    });
    log(3, 'Found managed macros.', { count: managedMacros.length });
    return managedMacros;
  }

  /**
   * Clean up obsolete macros that are no longer defined.
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
      if (isObsolete) {
        log(3, 'Deleting obsolete macro.', { macroId: macro.id, name: macro.name });
        await macro.delete();
      }
    }
  }
}
