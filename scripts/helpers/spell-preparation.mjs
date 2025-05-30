import { ENFORCEMENT_BEHAVIOR, FLAGS, MODULE, SETTINGS } from '../constants.mjs';
import { log } from '../logger.mjs';
import { CantripManager } from './cantrip-manager.mjs';
import * as genericUtils from './generic-utils.mjs';
import { RitualManager } from './ritual-manager.mjs';
import { RuleSetManager } from './rule-set-manager.mjs';
import * as formattingUtils from './spell-formatting.mjs';
import { WizardSpellbookManager } from './wizard-spellbook.mjs';
/**
 * Manages spell preparation and related functionality
 */
export class SpellManager {
  /**
   * Create a new SpellManager for an actor
   * @param {Actor5e} actor - The actor to manage spells for
   */
  constructor(actor) {
    this.actor = actor;
    this.classItem = genericUtils.findSpellcastingClass(actor);
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
    this.isWizard = genericUtils.isWizard(actor);
    this._wizardSpellbookCache = null;
    this._wizardManager = null;

    // Initialize sub-managers
    this.cantripManager = new CantripManager(actor, this);
  }

  /**
   * Get cantrip and spell settings for the actor
   * @param {string} classIdentifier - Class identifier for class-specific rules (required)
   * @returns {Object} Actor's spell settings
   */
  getSettings(classIdentifier) {
    if (!classIdentifier) {
      return {
        cantripSwapping: 'none',
        spellSwapping: 'none',
        ritualCasting: 'none',
        showCantrips: true,
        behavior: this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || ENFORCEMENT_BEHAVIOR.NOTIFY_GM
      };
    }

    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
    return {
      cantripSwapping: classRules.cantripSwapping || 'none',
      spellSwapping: classRules.spellSwapping || 'none',
      ritualCasting: classRules.ritualCasting || 'none',
      showCantrips: classRules.showCantrips !== false,
      behavior: this.actor.getFlag(MODULE.ID, FLAGS.ENFORCEMENT_BEHAVIOR) || game.settings.get(MODULE.ID, SETTINGS.DEFAULT_ENFORCEMENT_BEHAVIOR) || ENFORCEMENT_BEHAVIOR.NOTIFY_GM
    };
  }

  /**
   * Get maximum allowed cantrips for the actor
   * @param {string} classIdentifier - The class identifier to check
   * @returns {number} Maximum allowed cantrips for this class
   */
  getMaxAllowed(classIdentifier) {
    if (!classIdentifier) return 0;

    // Find the specific class item
    const classItem = this.actor.items.find((i) => i.type === 'class' && (i.system.identifier?.toLowerCase() === classIdentifier || i.name.toLowerCase() === classIdentifier));

    if (!classItem) return 0;

    // Get cantrip scale value keys from settings
    const cantripScaleValuesSetting = game.settings.get(MODULE.ID, SETTINGS.CANTRIP_SCALE_VALUES);
    const cantripScaleKeys = cantripScaleValuesSetting
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    // Get base cantrips from scale values
    let baseCantrips = 0;

    try {
      // Safely access scaleValues
      if (typeof classItem.scaleValues === 'function') {
        try {
          const scaleValues = classItem.scaleValues;
          if (scaleValues) {
            // Check all configured cantrip scale value keys
            for (const key of cantripScaleKeys) {
              if (scaleValues[key] && scaleValues[key].value !== undefined) {
                baseCantrips = scaleValues[key].value;
                log(3, `Found cantrip scale value '${key}' = ${baseCantrips} for class ${classIdentifier}`);
                break; // Use the first match found
              }
            }
          }
        } catch (err) {
          log(2, `Error accessing scaleValues for ${classIdentifier}, using fallback calculation`, err);
        }
      } else if (classItem.scaleValues && typeof classItem.scaleValues === 'object') {
        // Check all configured cantrip scale value keys
        for (const key of cantripScaleKeys) {
          const cantripValue = classItem.scaleValues[key]?.value;
          if (cantripValue !== undefined) {
            baseCantrips = cantripValue;
            log(3, `Found cantrip scale value '${key}' = ${baseCantrips} for class ${classIdentifier}`);
            break; // Use the first match found
          }
        }
      }
    } catch (err) {
      log(2, `Error accessing scaleValues for ${classIdentifier}, using fallback calculation`, err);
    }

    // If no scale values found, automatically disable cantrips for this class
    if (baseCantrips === 0) {
      log(2, `No cantrip scale value found for class ${classIdentifier} (checked: ${cantripScaleKeys.join(', ')}), disabling cantrips`);

      // Automatically set showCantrips to false in class rules
      const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);
      if (classRules.showCantrips !== false) {
        // Update the class rules to hide cantrips
        RuleSetManager.updateClassRules(this.actor, classIdentifier, {
          showCantrips: false,
          _noScaleValue: true // Flag to show notice in settings
        }).catch((error) => {
          log(1, `Error auto-updating class rules for ${classIdentifier}:`, error);
        });
      }

      return 0;
    }

    // Apply class-specific rules and bonuses
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);

    // If cantrips should be hidden for this class, return 0
    if (classRules && classRules.showCantrips === false) {
      return 0;
    }

    // Apply any cantrip bonus (if we add this setting later)
    const cantripBonus = classRules?.cantripBonus || 0;

    return Math.max(0, baseCantrips + cantripBonus);
  }

  /**
   * Calculate maximum prepared spells for the actor - REMOVED FALLBACK LOGIC
   * @returns {number} Maximum allowed prepared spells
   */
  getMaxPrepared() {
    // ONLY use the system spellcasting preparation max - no fallbacks
    if (!this.classItem?.system?.spellcasting?.preparation?.max) return 0;
    return this.classItem.system.spellcasting.preparation.max;
  }

  /**
   * Get the current count of prepared cantrips for a specific class
   * @param {string} classIdentifier - The class identifier
   * @returns {number} Currently prepared cantrips count for this class
   */
  getCurrentCount(classIdentifier) {
    if (!classIdentifier) return 0;
    return this.actor.items.filter(
      (i) =>
        i.type === 'spell' &&
        i.system.level === 0 &&
        i.system.preparation?.prepared &&
        !i.system.preparation?.alwaysPrepared &&
        (i.system.sourceClass === classIdentifier || i.sourceClass === classIdentifier)
    ).length;
  }

  /**
   * Determine if a cantrip can be changed
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {number} uiCantripCount - Number of checked cantrip boxes in the ui currently
   * @param {string} classIdentifier - The current class identifier
   * @returns {Object} Status object with allowed and message properties
   */
  canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount, classIdentifier) {
    return this.cantripManager.canChangeCantripStatus(spell, isChecked, isLevelUp, isLongRest, uiCantripCount, classIdentifier);
  }

  /**
   * Track changes to cantrips for swap management
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {string} classIdentifier - The current class identifier
   */
  trackCantripChange(spell, isChecked, isLevelUp, isLongRest, classIdentifier) {
    this.cantripManager.trackCantripChange(spell, isChecked, isLevelUp, isLongRest, classIdentifier);
  }

  /**
   * Lock cantrip checkboxes based on current rules and state
   * @param {NodeList} cantripItems - DOM elements for cantrip items
   * @param {boolean} isLevelUp - Whether this is during level-up
   * @param {boolean} isLongRest - Whether this is during a long rest
   * @param {number} currentCount - Current count of prepared cantrips
   */
  lockCantripCheckboxes(cantripItems, isLevelUp, isLongRest, currentCount) {
    this.cantripManager.lockCantripCheckboxes(cantripItems, isLevelUp, isLongRest, currentCount);
  }

  /**
   * Save settings to the actor
   * @param {string} rules - The rules type to use
   * @param {string} behavior - The enforcement behavior to use
   * @returns {Promise<boolean>} Success state
   */
  async saveSettings(rules, behavior) {
    await this.actor.update({
      [`flags.${MODULE.ID}.${FLAGS.CANTRIP_RULES}`]: rules,
      [`flags.${MODULE.ID}.${FLAGS.ENFORCEMENT_BEHAVIOR}`]: behavior
    });
    this.settings = this.getSettings();
    return true;
  }

  /**
   * Check if actor has had a level up that affects cantrips
   * @returns {boolean} Whether a level-up cantrip change is detected
   */
  checkForLevelUp() {
    return this.cantripManager.checkForLevelUp();
  }

  /**
   * Check if cantrips can currently be changed (level-up situation)
   * @returns {boolean} Whether cantrips can be changed
   */
  canBeLeveledUp() {
    return this.cantripManager.canBeLeveledUp();
  }

  /**
   * Refresh manager state with latest actor data
   */
  refresh() {
    this.classItem = genericUtils.findSpellcastingClass(this.actor);
    this.settings = this.getSettings();
    this.maxCantrips = this.getMaxAllowed();
    this.currentCount = this.getCurrentCount();
    this.isWizard = genericUtils.isWizard(this.actor);
    this._wizardSpellbookCache = null;
    this._wizardManager = null;

    // Refresh sub-managers
    this.cantripManager = new CantripManager(this.actor, this);
    this.ritualManager = new RitualManager(this.actor);
  }

  /**
   * Get preparation status for a spell with class-specific awareness
   * @param {Item5e} spell - The spell to check
   * @param {string} classIdentifier - The specific class context
   * @returns {Object} Preparation status information
   */
  getSpellPreparationStatus(spell, classIdentifier = null) {
    const defaultStatus = {
      prepared: false,
      isOwned: false,
      preparationMode: null,
      disabled: false,
      alwaysPrepared: false,
      sourceItem: null,
      isGranted: false,
      localizedPreparationMode: '',
      isCantripLocked: false
    };

    // If no class identifier provided, try to get it from the spell
    if (!classIdentifier) {
      classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    }

    const spellUuid = spell.compendiumUuid || spell.uuid;

    // PRIORITY 1: Check if there's an actual spell on the actor that matches this UUID and class
    const actualSpell = this.actor.items.find(
      (item) =>
        item.type === 'spell' &&
        (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) &&
        (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier)
    );

    if (actualSpell) {
      // Use the actual spell's state - this is the source of truth
      return this._getOwnedSpellPreparationStatus(actualSpell, classIdentifier);
    }

    // PRIORITY 2: Check for any spell on actor with this UUID (might need sourceClass assignment)
    const unassignedSpell = this.actor.items.find(
      (item) => item.type === 'spell' && (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) && !item.system?.sourceClass && !item.sourceClass
    );

    if (unassignedSpell && classIdentifier) {
      // Don't auto-assign sourceClass to always prepared spells (they come from subclasses/items/features)
      const isAlwaysPrepared = unassignedSpell.system.preparation?.mode === 'always';
      const isGranted = !!unassignedSpell.flags?.dnd5e?.cachedFor;
      const isSpecialMode = ['innate', 'pact', 'atwill', 'ritual'].includes(unassignedSpell.system.preparation?.mode);

      if (!isAlwaysPrepared && !isGranted && !isSpecialMode) {
        // Only auto-assign sourceClass to regular prepared spells
        unassignedSpell.sourceClass = classIdentifier;
        if (unassignedSpell.system) {
          unassignedSpell.system.sourceClass = classIdentifier;
        }
      }

      return this._getOwnedSpellPreparationStatus(unassignedSpell, classIdentifier);
    }

    // PRIORITY 3: For spells that exist on actor but belong to other classes
    const otherClassSpell = this.actor.items.find(
      (item) =>
        item.type === 'spell' && (item.flags?.core?.sourceId === spellUuid || item.uuid === spellUuid) && item.system?.sourceClass && item.system.sourceClass !== classIdentifier
    );

    if (otherClassSpell) {
      // This spell belongs to a different class, so it's not prepared for this class
      return defaultStatus;
    }

    // PRIORITY 4: Fall back to flag-based checking for compendium spells not on actor
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const classPreparedSpells = preparedByClass[classIdentifier] || [];

    // Check if this specific spell is prepared for this specific class
    const spellKey = this._createClassSpellKey(spellUuid, classIdentifier);
    const isPreparedForClass = classPreparedSpells.includes(spellKey);

    defaultStatus.prepared = isPreparedForClass;

    // Handle cantrip limits per class
    if (spell.system.level === 0 && classIdentifier) {
      const maxCantrips = this.getMaxAllowed(classIdentifier);
      const currentCount = this.getCurrentCount(classIdentifier);
      const isAtMax = currentCount >= maxCantrips;

      if (isAtMax && !isPreparedForClass) {
        const settings = this.getSettings(classIdentifier);
        const { behavior } = settings;
        defaultStatus.isCantripLocked = behavior === ENFORCEMENT_BEHAVIOR.ENFORCED;
        defaultStatus.cantripLockReason = 'SPELLBOOK.Cantrips.MaximumReached';
      }
    }

    return defaultStatus;
  }

  /**
   * Create a unique key for class-spell combinations
   * @param {string} spellUuid - The spell UUID
   * @param {string} classIdentifier - The class identifier
   * @returns {string} Unique key for this class-spell combination
   * @private
   */
  _createClassSpellKey(spellUuid, classIdentifier) {
    return `${classIdentifier}:${spellUuid}`;
  }

  /**
   * Parse a class-spell key back into components
   * @param {string} key - The class-spell key
   * @returns {Object} Object with classIdentifier and spellUuid
   * @private
   */
  _parseClassSpellKey(key) {
    const [classIdentifier, ...uuidParts] = key.split(':');
    return {
      classIdentifier,
      spellUuid: uuidParts.join(':') // Handle UUIDs that contain colons
    };
  }

  /**
   * Get preparation status for a spell that's on the actor
   * @param {Item5e} spell - The spell item
   * @param {string} classIdentifier - The class identifier for context
   * @returns {Object} - Preparation status information
   * @private
   */
  _getOwnedSpellPreparationStatus(spell, classIdentifier) {
    const preparationMode = spell.system.preparation?.mode;
    const alwaysPrepared = preparationMode === 'always';
    const isInnateCasting = preparationMode === 'innate';
    const isAtWill = preparationMode === 'atwill';
    const localizedPreparationMode = formattingUtils.getLocalizedPreparationMode(preparationMode);
    const sourceInfo = this._determineSpellSource(spell);
    const isGranted = !!sourceInfo && !!spell.flags?.dnd5e?.cachedFor;
    const isCantrip = spell.system.level === 0;

    // For innate spells, FORCE them to be prepared regardless of the prepared flag
    const actuallyPrepared = !!(isGranted || alwaysPrepared || isInnateCasting || isAtWill || spell.system.preparation?.prepared);

    // Force disable for special preparation modes
    let isDisabled = isGranted || alwaysPrepared || isInnateCasting || isAtWill;

    let disabledReason = '';

    if (isGranted) {
      disabledReason = 'SPELLBOOK.SpellSource.GrantedTooltip';
    } else if (alwaysPrepared) {
      disabledReason = 'SPELLBOOK.Preparation.AlwaysTooltip';
    } else if (isInnateCasting) {
      disabledReason = 'SPELLBOOK.Preparation.InnateTooltip';
    } else if (isAtWill) {
      disabledReason = 'SPELLBOOK.Preparation.AtWillTooltip';
    }

    const result = {
      prepared: actuallyPrepared,
      isOwned: true,
      preparationMode: preparationMode,
      localizedPreparationMode: localizedPreparationMode,
      disabled: !!isDisabled,
      disabledReason: disabledReason,
      alwaysPrepared: !!alwaysPrepared,
      sourceItem: sourceInfo,
      isGranted: !!isGranted,
      isCantripLocked: false,
      cantripLockReason: ''
    };
    return result;
  }

  /**
   * Apply rule-based cantrip locks to preparation status
   * @param {Object} result - The preparation status result to modify
   * @param {boolean} isPrepared - Whether the cantrip is currently prepared
   * @param {string} classIdentifier - The class identifier
   * @param {Object} settings - The class settings
   * @private
   */
  _applyRuleBasedCantripLocks(result, isPrepared, classIdentifier, settings) {
    const isLevelUp = this.canBeLeveledUp();
    const isLongRest = this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED) || false;

    switch (settings.cantripSwapping) {
      case 'none': // Legacy behavior - can't change once set
        if (isPrepared) {
          result.disabled = true;
          result.isCantripLocked = true;
          result.cantripLockReason = 'SPELLBOOK.Cantrips.LockedLegacy';
          result.disabledReason = 'SPELLBOOK.Cantrips.LockedLegacy';
        }
        break;

      case 'levelUp': // Modern level-up rules
        if (!isLevelUp && isPrepared) {
          result.disabled = true;
          result.isCantripLocked = true;
          result.cantripLockReason = 'SPELLBOOK.Cantrips.LockedOutsideLevelUp';
          result.disabledReason = 'SPELLBOOK.Cantrips.LockedOutsideLevelUp';
        }
        break;

      case 'longRest': // Modern long-rest rules (wizard only)
        if (classIdentifier === 'wizard' && !isLongRest && isPrepared) {
          result.disabled = true;
          result.isCantripLocked = true;
          result.cantripLockReason = 'SPELLBOOK.Cantrips.LockedOutsideLongRest';
          result.disabledReason = 'SPELLBOOK.Cantrips.LockedOutsideLongRest';
        }
        break;
    }
  }

  /**
   * Determine the source of a spell on the actor
   * @param {Item5e} spell - The spell item
   * @returns {Object|null} - Source information for the spell
   * @private
   */
  _determineSpellSource(spell) {
    const advancementOrigin = spell.flags?.dnd5e?.advancementOrigin;
    if (advancementOrigin) {
      const sourceItemId = advancementOrigin.split('.')[0];
      const sourceItem = this.actor.items.get(sourceItemId);
      if (sourceItem) {
        return {
          name: sourceItem.name,
          type: sourceItem.type,
          id: sourceItem.id
        };
      }
    }

    const cachedFor = spell.flags?.dnd5e?.cachedFor;
    if (cachedFor && typeof cachedFor === 'string') {
      try {
        const pathParts = cachedFor.split('.');
        if (pathParts.length >= 3 && pathParts[1] === 'Item') {
          const itemId = pathParts[2];
          const item = this.actor.items.get(itemId);
          if (item) {
            return {
              name: item.name,
              type: item.type,
              id: item.id
            };
          }
        }

        const activity = fromUuidSync(cachedFor, { relative: this.actor });
        const item = activity?.item;
        if (item) {
          return {
            name: item.name,
            type: item.type,
            id: item.id
          };
        }
      } catch (error) {
        log(1, `Error resolving cached activity source:`, error);
      }
    }

    const preparationMode = spell.system.preparation?.mode;
    if (preparationMode === 'always') {
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) {
        return {
          name: subclass.name,
          type: 'subclass',
          id: subclass.id
        };
      }
    } else if (preparationMode === 'pact') {
      const subclass = this.actor.items.find((i) => i.type === 'subclass');
      if (subclass) {
        return {
          name: subclass.name,
          type: 'subclass',
          id: subclass.id
        };
      }
      return {
        name: 'Pact Magic',
        type: 'class'
      };
    } else {
      const classItem = this.actor.items.find((i) => i.type === 'class');
      if (classItem) {
        return {
          name: classItem.name,
          type: 'class',
          id: classItem.id
        };
      }
    }
    return null;
  }

  /**
   * Save prepared spells to the actor
   * @param {Object} spellData - Object mapping spell UUIDs to preparation data
   * @returns {Promise<Object>} Object containing cantrip changes and save results
   */
  async saveActorPreparedSpells(spellData) {
    try {
      log(3, `Saving prepared spells for ${this.actor.name}`);
      const cantripChanges = { added: [], removed: [], hasChanges: false };

      // Group prepared spells by class
      const preparedByClass = {};
      Object.entries(spellData).forEach(([uuid, data]) => {
        if (data.isPrepared) {
          const sourceClass = data.sourceClass || 'unknown';
          if (!preparedByClass[sourceClass]) preparedByClass[sourceClass] = [];
          preparedByClass[sourceClass].push(uuid);
        }
      });

      // Save class-specific prepared spells
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);

      // Flatten for compatibility with older code
      const allPreparedUuids = Object.values(preparedByClass).flat();
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);

      log(3, `Saved prepared spells to actor flags by class`);

      const spellIdsToRemove = [];
      const spellsToUpdate = [];
      const spellsToCreate = [];

      for (const [uuid, data] of Object.entries(spellData)) {
        if (data.isAlwaysPrepared) continue;
        const isRitual = data.isRitual || false;
        const existingSpell = this.actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid));
        const spellSourceClass = data.sourceClass || '';

        if (!data.isPrepared) {
          if (data.wasPrepared && existingSpell) {
            if (existingSpell.system.preparation?.mode === 'prepared' && !existingSpell.system.preparation?.alwaysPrepared) {
              spellIdsToRemove.push(existingSpell.id);
              if (existingSpell.system.level === 0) {
                cantripChanges.removed.push({ name: existingSpell.name, uuid: uuid });
                cantripChanges.hasChanges = true;
              }
            }
          }
        } else {
          if (existingSpell) {
            // Update existing spell with sourceClass
            const updateData = {
              '_id': existingSpell.id,
              'system.preparation.mode': 'prepared',
              'system.preparation.prepared': true
            };

            // Update sourceClass if provided
            if (spellSourceClass && existingSpell.system.sourceClass !== spellSourceClass) {
              updateData['system.sourceClass'] = spellSourceClass;
            }

            spellsToUpdate.push(updateData);
          } else {
            try {
              const sourceSpell = await fromUuid(uuid);
              if (sourceSpell) {
                const newSpellData = sourceSpell.toObject();
                if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
                newSpellData.system.preparation.mode = 'prepared';
                newSpellData.system.preparation.prepared = true;
                newSpellData.flags = newSpellData.flags || {};
                newSpellData.flags.core = newSpellData.flags.core || {};
                newSpellData.flags.core.sourceId = uuid;

                // Add sourceClass if provided
                if (spellSourceClass) {
                  newSpellData.system.sourceClass = spellSourceClass;
                }

                spellsToCreate.push(newSpellData);

                if (sourceSpell.system.level === 0) {
                  cantripChanges.added.push({ name: sourceSpell.name, uuid });
                  cantripChanges.hasChanges = true;
                }
              }
            } catch (error) {
              log(1, `Error fetching spell ${uuid}:`, error);
            }
          }
        }
      }

      if (spellIdsToRemove.length > 0) {
        log(3, `Removing ${spellIdsToRemove.length} spells from actor`);
        await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
      }

      if (spellsToUpdate.length > 0) {
        log(3, `Updating ${spellsToUpdate.length} spells on actor`);
        await this.actor.updateEmbeddedDocuments('Item', spellsToUpdate);
      }

      if (spellsToCreate.length > 0) {
        log(3, `Creating ${spellsToCreate.length} spells on actor`);
        await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
      }

      // Return cantrip changes instead of notifying directly
      return { cantripChanges };
    } catch (error) {
      log(1, `Error saving prepared spells for ${this.actor?.name || 'unknown actor'}:`, error);
      return { cantripChanges: { added: [], removed: [], hasChanges: false } };
    }
  }

  /**
   * Complete the cantrip level-up process
   * @returns {Promise<boolean>} Success status
   */
  async completeCantripsLevelUp() {
    return this.cantripManager.completeCantripsLevelUp();
  }

  /**
   * Get the wizard spellbook manager if the actor is a wizard
   * @returns {WizardSpellbookManager|null} The wizard spellbook manager or null
   */
  getWizardManager() {
    if (!this._wizardManager && this.isWizard) {
      this._wizardManager = new WizardSpellbookManager(this.actor);
    }
    return this._wizardManager;
  }

  /**
   * Check if a spell is in the wizard's spellbook
   * @param {string} uuid - UUID of the spell to check
   * @returns {Promise<boolean>} Whether the spell is in the spellbook
   */
  async isSpellInWizardBook(uuid) {
    const wizardManager = this.getWizardManager();
    if (!wizardManager) return false;

    if (!this._wizardSpellbookCache) {
      this._wizardSpellbookCache = await wizardManager.getSpellbookSpells();
    }

    return this._wizardSpellbookCache.includes(uuid);
  }

  /**
   * Reset all cantrip swap tracking data
   * @returns {Promise<void>}
   */
  async resetSwapTracking() {
    return this.cantripManager.resetSwapTracking();
  }

  /**
   * Save prepared spells for a specific class
   * @param {string} classIdentifier - The class identifier
   * @param {Object} classSpellData - Object mapping class-spell keys to preparation data
   * @returns {Promise<Object>} Object containing cantrip changes and save results
   */
  async saveClassSpecificPreparedSpells(classIdentifier, classSpellData) {
    try {
      log(3, `Saving prepared spells for class ${classIdentifier}`);

      // Get current class-specific preparation data
      const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
      const currentClassPrepared = preparedByClass[classIdentifier] || [];

      // Determine preparation mode for this class
      const preparationMode = this._getClassPreparationMode(classIdentifier);

      // Build new prepared list for this class
      const newClassPrepared = [];
      const spellsToUpdate = [];
      const spellsToCreate = [];
      const spellIdsToRemove = [];

      const cantripChanges = { added: [], removed: [], hasChanges: false };

      for (const [classSpellKey, data] of Object.entries(classSpellData)) {
        const { uuid, isPrepared, wasPrepared, isRitual, sourceClass, name } = data;

        if (isPrepared) {
          newClassPrepared.push(classSpellKey);

          // Track cantrip additions
          if (!wasPrepared && data.spellLevel === 0) {
            cantripChanges.added.push({ name, uuid });
            cantripChanges.hasChanges = true;
          }

          // Find or create the spell on the actor
          await this._ensureSpellOnActor(uuid, sourceClass, preparationMode, spellsToCreate, spellsToUpdate);
        } else if (!isPrepared && isRitual && genericUtils.isWizard(this.actor)) {
          await this._ensureRitualSpellOnActor(uuid, sourceClass, spellsToCreate, spellsToUpdate);
        } else if (wasPrepared && !isRitual) {
          if (data.spellLevel === 0) {
            cantripChanges.removed.push({ name, uuid });
            cantripChanges.hasChanges = true;
          }

          await this._handleUnpreparingSpell(uuid, sourceClass, spellIdsToRemove, spellsToUpdate);
        }
      }

      // Update the class-specific prepared spells flag
      preparedByClass[classIdentifier] = newClassPrepared;
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);

      // Apply changes to actor spells
      if (spellIdsToRemove.length > 0) {
        log(3, `Removing ${spellIdsToRemove.length} spells from actor`);
        await this.actor.deleteEmbeddedDocuments('Item', spellIdsToRemove);
      }

      if (spellsToUpdate.length > 0) {
        log(3, `Updating ${spellsToUpdate.length} spells on actor`);
        await this.actor.updateEmbeddedDocuments('Item', spellsToUpdate);
      }

      if (spellsToCreate.length > 0) {
        log(3, `Creating ${spellsToCreate.length} spells on actor`);
        await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
      }

      // Update global prepared spells flag for compatibility
      await this._updateGlobalPreparedSpellsFlag();

      // Return cantrip changes instead of notifying directly
      return { cantripChanges };
    } catch (error) {
      log(1, `Error saving prepared spells for class ${classIdentifier}:`, error);
      return { cantripChanges: { added: [], removed: [], hasChanges: false } };
    }
  }

  /**
   * Ensure a ritual spell exists on the actor in ritual mode
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {Array} spellsToCreate - Array to add creation data to
   * @param {Array} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   * @private
   */
  async _ensureRitualSpellOnActor(uuid, sourceClass, spellsToCreate, spellsToUpdate) {
    // Look for existing spell
    const existingSpell = this.actor.items.find(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );

    if (existingSpell) {
      // Update existing spell to ritual mode if it's not already
      if (existingSpell.system.preparation?.mode !== 'ritual') {
        const updateData = {
          '_id': existingSpell.id,
          'system.preparation.mode': 'ritual',
          'system.preparation.prepared': false,
          'system.sourceClass': sourceClass
        };
        spellsToUpdate.push(updateData);
      }
    } else {
      // Create new ritual spell
      try {
        const sourceSpell = await fromUuid(uuid);
        if (sourceSpell) {
          const newSpellData = sourceSpell.toObject();

          // Set ritual preparation data
          if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
          newSpellData.system.preparation.mode = 'ritual';
          newSpellData.system.preparation.prepared = false;

          // Set source information
          newSpellData.flags = newSpellData.flags || {};
          newSpellData.flags.core = newSpellData.flags.core || {};
          newSpellData.flags.core.sourceId = uuid;

          // Set class association
          newSpellData.system.sourceClass = sourceClass;

          spellsToCreate.push(newSpellData);
          log(1, `Creating new ritual spell: ${sourceSpell.name}`);
        }
      } catch (error) {
        log(1, `Error fetching ritual spell ${uuid}:`, error);
      }
    }
  }

  /**
   * Get the preparation mode for a specific class
   * @param {string} classIdentifier - The class identifier
   * @returns {string} The preparation mode (prepared, pact, etc.)
   * @private
   */
  _getClassPreparationMode(classIdentifier) {
    // Get the class item
    const classItem = this.actor.items.find((i) => i.type === 'class' && (i.system.identifier?.toLowerCase() === classIdentifier || i.name.toLowerCase() === classIdentifier));

    if (!classItem) return 'prepared';

    // Check if this is a pact magic caster
    if (classItem.system.spellcasting?.type === 'pact') {
      return 'pact';
    }

    // Default to prepared for most classes
    return 'prepared';
  }

  /**
   * Ensure a spell exists on the actor with proper class attribution
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {string} preparationMode - Preparation mode for this class
   * @param {Array} spellsToCreate - Array to add creation data to
   * @param {Array} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   * @private
   */
  async _ensureSpellOnActor(uuid, sourceClass, preparationMode, spellsToCreate, spellsToUpdate) {
    // Look for existing spell that matches both UUID and class
    const existingSpell = this.actor.items.find(
      (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
    );

    if (existingSpell) {
      // For existing spells, determine the right preparation mode
      let targetMode = preparationMode;
      let targetPrepared = true;

      // Special case: if this is a ritual spell in ritual mode, transition to prepared
      if (existingSpell.system.preparation?.mode === 'ritual') {
        targetMode = 'prepared';
        targetPrepared = true;
      }

      const updateData = {
        '_id': existingSpell.id,
        'system.preparation.mode': targetMode,
        'system.preparation.prepared': targetPrepared
      };

      // Ensure sourceClass is set
      if (existingSpell.system.sourceClass !== sourceClass) {
        updateData['system.sourceClass'] = sourceClass;
      }

      spellsToUpdate.push(updateData);
    } else {
      // Create new spell instance for this class
      try {
        const sourceSpell = await fromUuid(uuid);
        if (sourceSpell) {
          const newSpellData = sourceSpell.toObject();

          // Set preparation data
          if (!newSpellData.system.preparation) newSpellData.system.preparation = {};
          newSpellData.system.preparation.mode = preparationMode;
          newSpellData.system.preparation.prepared = true;

          // Set source information
          newSpellData.flags = newSpellData.flags || {};
          newSpellData.flags.core = newSpellData.flags.core || {};
          newSpellData.flags.core.sourceId = uuid;

          // Set class association
          newSpellData.system.sourceClass = sourceClass;

          spellsToCreate.push(newSpellData);
        }
      } catch (error) {
        log(1, `Error fetching spell ${uuid}:`, error);
      }
    }
  }

  /**
   * Update the global prepared spells flag for backward compatibility
   * @returns {Promise<void>}
   * @private
   */
  async _updateGlobalPreparedSpellsFlag() {
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    const allPreparedKeys = Object.values(preparedByClass).flat();

    // Extract UUIDs from class-spell keys for compatibility
    const allPreparedUuids = allPreparedKeys.map((key) => {
      const parsed = this._parseClassSpellKey(key);
      return parsed.spellUuid;
    });

    await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS, allPreparedUuids);
  }

  /**
   * Handle unpreparing a spell for a specific class
   * @param {string} uuid - Spell UUID
   * @param {string} sourceClass - Source class identifier
   * @param {Array} spellIdsToRemove - Array to add removal IDs to
   * @param {Array} spellsToUpdate - Array to add update data to
   * @returns {Promise<void>}
   * @private
   */
  async _handleUnpreparingSpell(uuid, sourceClass, spellIdsToRemove, spellsToUpdate) {
    try {
      // Find the SPECIFIC spell instance for this exact class
      const targetSpell = this.actor.items.find(
        (i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid) && (i.system.sourceClass === sourceClass || i.sourceClass === sourceClass)
      );

      if (!targetSpell) {
        log(3, `No class-specific spell instance found to unprepare: ${uuid} for class ${sourceClass}`);
        return;
      }

      // Check if this is a spell we should never remove
      const isAlwaysPrepared = targetSpell.system.preparation?.alwaysPrepared;
      const isGranted = !!targetSpell.flags?.dnd5e?.cachedFor;
      const isFromClassFeature = targetSpell.system.preparation?.mode === 'always';

      // Never remove always prepared, granted, or class feature spells
      if (isAlwaysPrepared || isGranted || isFromClassFeature) {
        log(3, `Skipping unprepare of protected spell: ${targetSpell.name} (${targetSpell.system.preparation?.mode})`);
        return;
      }

      // Special case: ritual spells should revert to ritual mode, not be removed
      const isRitualSpell = targetSpell.system.components?.ritual;
      const isWizard = genericUtils.isWizard(this.actor);
      const ritualCastingEnabled = this.ritualManager?.isRitualCastingEnabled();

      if (isRitualSpell && isWizard && ritualCastingEnabled && targetSpell.system.level > 0) {
        // Convert back to ritual mode instead of removing
        spellsToUpdate.push({
          '_id': targetSpell.id,
          'system.preparation.mode': 'ritual',
          'system.preparation.prepared': false
        });
        log(3, `Converting wizard spell back to ritual mode: ${targetSpell.name}`);
        return;
      }

      // For all other cases, remove the spell entirely
      spellIdsToRemove.push(targetSpell.id);
      log(3, `Marking spell for removal: ${targetSpell.name} (${sourceClass})`);
    } catch (error) {
      log(1, `Error handling unpreparing spell ${uuid} for class ${sourceClass}:`, error);
    }
  }

  /**
   * Find other classes that have this spell prepared
   * @param {string} uuid - Spell UUID to check
   * @param {string} excludeClass - Class to exclude from search
   * @returns {Promise<Array<string>>} Array of class identifiers using this spell
   * @private
   */
  async _findOtherClassesUsingSpell(uuid, excludeClass) {
    try {
      const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
      const usingClasses = [];

      for (const [classIdentifier, preparedSpells] of Object.entries(preparedByClass)) {
        if (classIdentifier === excludeClass) continue;

        // Check if this class has the spell prepared
        const hasSpellPrepared = preparedSpells.some((key) => {
          const parsed = this._parseClassSpellKey(key);
          return parsed.spellUuid === uuid;
        });

        if (hasSpellPrepared) {
          usingClasses.push(classIdentifier);
        }
      }

      return usingClasses;
    } catch (error) {
      log(1, `Error finding other classes using spell ${uuid}:`, error);
      return [];
    }
  }

  /**
   * Clean up cantrip entries from class-specific prepared spells
   * @param {string} classIdentifier - The class identifier
   * @returns {Promise<void>}
   */
  async cleanupCantripsForClass(classIdentifier) {
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};

    if (!preparedByClass[classIdentifier]) return;

    const cleanedSpells = [];

    for (const classSpellKey of preparedByClass[classIdentifier]) {
      const parsed = this._parseClassSpellKey(classSpellKey);

      try {
        const spell = await fromUuid(parsed.spellUuid);

        // Only keep non-cantrips
        if (spell && spell.system.level !== 0) {
          cleanedSpells.push(classSpellKey);
        }
      } catch (error) {
        // If we can't load the spell, keep it (safer)
        cleanedSpells.push(classSpellKey);
      }
    }

    if (cleanedSpells.length !== preparedByClass[classIdentifier].length) {
      preparedByClass[classIdentifier] = cleanedSpells;
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
      await this._updateGlobalPreparedSpellsFlag();
    }
  }

  /**
   * Clean up stale preparation flags that don't correspond to actual spells
   * @returns {Promise<void>}
   */
  async cleanupStalePreparationFlags() {
    const preparedByClass = this.actor.getFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS) || {};
    let hasChanges = false;

    for (const [classIdentifier, spellKeys] of Object.entries(preparedByClass)) {
      const cleanedKeys = [];

      for (const spellKey of spellKeys) {
        const parsed = this._parseClassSpellKey(spellKey);

        // Check if there's actually a spell on the actor for this UUID and class
        const actualSpell = this.actor.items.find(
          (item) =>
            item.type === 'spell' &&
            (item.flags?.core?.sourceId === parsed.spellUuid || item.uuid === parsed.spellUuid) &&
            (item.system?.sourceClass === classIdentifier || item.sourceClass === classIdentifier)
        );

        if (actualSpell) {
          cleanedKeys.push(spellKey);
        } else {
          log(3, `Cleaning up stale flag for ${parsed.spellUuid} in class ${classIdentifier}`);
          hasChanges = true;
        }
      }

      preparedByClass[classIdentifier] = cleanedKeys;
    }

    if (hasChanges) {
      await this.actor.setFlag(MODULE.ID, FLAGS.PREPARED_SPELLS_BY_CLASS, preparedByClass);
      await this._updateGlobalPreparedSpellsFlag();
      log(2, 'Cleaned up stale preparation flags');
    }
  }

  /**
   * Determine if a spell can be swapped based on class rules
   * @param {Item5e} spell - The spell being modified
   * @param {boolean} isChecked - Whether the spell is being checked (true) or unchecked (false)
   * @param {boolean} wasPrepared - Whether the spell was previously prepared
   * @param {string} classIdentifier - The class identifier
   * @returns {Object} Status object with allowed and message properties
   */
  canChangeSpellStatus(spell, isChecked, wasPrepared, classIdentifier) {
    // Skip cantrips - they have their own enforcement
    if (spell.system.level === 0) return { allowed: true };

    // If no class identifier provided, use spell's source class
    if (!classIdentifier) {
      classIdentifier = spell.sourceClass || spell.system?.sourceClass;
    }

    if (!classIdentifier) {
      log(2, `No class identifier for spell ${spell.name}, allowing change but may cause issues`);
      return { allowed: true };
    }

    // Get class-specific settings
    const settings = this.getSettings(classIdentifier);
    const classRules = RuleSetManager.getClassRules(this.actor, classIdentifier);

    // Only enforce for "enforced" behavior - allow free changes for notifyGM/unenforced
    if (settings.behavior !== ENFORCEMENT_BEHAVIOR.ENFORCED) {
      return { allowed: true };
    }

    // If unchecking a spell, check if swapping is allowed
    if (!isChecked && wasPrepared) {
      const spellSwapping = classRules.spellSwapping || 'none';
      const isLevelUp = this.canBeLeveledUp();
      const isLongRest = this.actor.getFlag(MODULE.ID, FLAGS.LONG_REST_COMPLETED) || false;

      switch (spellSwapping) {
        case 'levelUp': // Can only swap on level up (Bard, Sorcerer, Warlock)
          if (!isLevelUp) {
            return { allowed: false, message: 'SPELLBOOK.Spells.LockedOutsideLevelUp' };
          }
          break;

        case 'longRest': // Can swap on long rest (Cleric, Druid, Wizard, Paladin)
          if (!isLongRest) {
            return { allowed: false, message: 'SPELLBOOK.Spells.LockedOutsideLongRest' };
          }
          break;

        case 'none': // Can't swap at all
          return { allowed: false, message: 'SPELLBOOK.Spells.LockedNoSwapping' };
      }
    }

    return { allowed: true };
  }
}
