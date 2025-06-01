import { MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';
import * as macros from '../macros/index.mjs';

const MACROS = Object.values(macros);

/**
 * Macro Manager class for handling versioned compendium macros
 */
export class MacroManager {
  /**
   * Initialize and ensure all module macros exist in compendium
   * @returns {Promise<void>}
   */
  static async initializeMacros() {
    log(3, `Initializing compendium macros...`);
    const pack = game.packs.get(MODULE.PACK.MACROS);
    if (!pack) return;
    for (const macro of MACROS) await this.ensureCompendiumMacroExists(pack, macro);
    await this.cleanupObsoleteMacros(pack);
    log(3, `All compendium macros initialized successfully`);
  }

  /**
   * Ensure a specific macro exists in the compendium and is current
   * @param {CompendiumCollection} pack - The macro compendium
   * @param {Object} macroConfig - Macro configuration object
   * @returns {Promise<Macro|null>}
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
          flags: {
            [MODULE.ID]: {
              [flagKey]: {
                version: version,
                created: Date.now(),
                lastUpdated: Date.now(),
                managedByModule: true
              }
            }
          }
        },
        { pack: pack.collection }
      );
      return newMacro;
    }
  }

  /**
   * Get all macros managed by this module from the compendium
   * @returns {Promise<Array<Macro>>}
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
   * Clean up obsolete macros that are no longer defined
   * @param {CompendiumCollection} pack - The macro compendium
   * @returns {Promise<void>}
   */
  static async cleanupObsoleteMacros(pack) {
    const currentFlagKeys = MACROS.map((def) => def.flagKey);
    const managedMacros = await this.getManagedMacros();
    for (const macro of managedMacros) {
      const moduleFlags = macro.getFlag(MODULE.ID);
      const macroFlagKeys = Object.keys(moduleFlags || {});
      const isObsolete = macroFlagKeys.every((flagKey) => !currentFlagKeys.includes(flagKey));
      if (isObsolete) await macro.delete();
    }
  }

  /**
   * Get version information for all managed macros
   * @returns {Promise<Object>}
   */
  static async getMacroVersions() {
    const versions = {};
    const managedMacros = await this.getManagedMacros();
    for (const macro of managedMacros) {
      const moduleFlags = macro.getFlag(MODULE.ID);
      for (const [flagKey, flagData] of Object.entries(moduleFlags || {})) {
        if (flagData.managedByModule) {
          versions[flagKey] = {
            name: macro.name,
            version: flagData.version,
            created: flagData.created,
            lastUpdated: flagData.lastUpdated
          };
        }
      }
    }
    return versions;
  }
}
