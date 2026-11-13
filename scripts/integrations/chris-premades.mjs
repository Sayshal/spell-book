import { MODULE, SETTINGS } from '../constants.mjs';

/**
 * Apply missing or outdated CAT automations to an actor's spells. Mirrors CAT's Medkit mass apply without its prompt.
 * @param {object} actor - The actor whose prepared spells just changed
 * @returns {Promise<void>}
 */
export async function refreshChrisPremades(actor) {
  if (!game.modules.get('chris-premades')?.active || !game.modules.get('cat')?.active) return;
  if (!game.settings.get(MODULE.ID, SETTINGS.CPR_COMPATIBILITY)) return;
  const automationUtils = cat.utils.automationUtils;
  for (const spell of actor.itemTypes.spell) {
    if (spell.flags.cat?.ignoreItem) continue;
    const applied = automationUtils.getCurrentAutomation(spell);
    if (applied) {
      if (automationUtils.isSelfAutomation(spell, { automation: applied })) continue;
      if (automationUtils.isMassApplyBlocked(spell, applied.source)) continue;
      if (!automationUtils.isUpToDate(spell, { automation: applied })) await automationUtils.updateItem(spell, { source: applied.source });
      continue;
    }
    const available = automationUtils.getMassApplyAutomations(spell).filter((automation) => automation.uuid !== spell.uuid);
    if (available.length) await automationUtils.updateItem(spell, { source: automationUtils.sortByPriority(available)[0].source });
  }
}
