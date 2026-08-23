import { MODULE, RULE_SETS, SETTINGS, UI_ELEMENTS } from './constants.mjs';
import { DetailsCustomization } from './dialogs/_module.mjs';
import { RuleSet, SpellManager } from './managers/_module.mjs';

const { ArrayField, BooleanField, NumberField, ObjectField, StringField } = foundry.data.fields;

/** Register all module settings. */
export function registerSettings() {
  const register = (key, opts) => game.settings.register(MODULE.ID, key, opts);

  register(SETTINGS.CUSTOM_SPELL_LIST_MAPPINGS, { scope: 'world', config: false, type: new ObjectField({ initial: {} }) });
  register(SETTINGS.AUTO_DELETE_UNPREPARED_SPELLS, {
    name: 'SPELLBOOK.Settings.AutoDeleteUnpreparedSpells.Name',
    hint: 'SPELLBOOK.Settings.AutoDeleteUnpreparedSpells.Hint',
    scope: 'user',
    config: true,
    type: new BooleanField({ initial: false })
  });
  register(SETTINGS.CPR_COMPATIBILITY, {
    name: 'SPELLBOOK.Settings.CPRCompatibility.Name',
    hint: 'SPELLBOOK.Settings.CPRCompatibility.Hint',
    scope: 'world',
    config: !!game.modules.get('chris-premades')?.active,
    type: new BooleanField({ initial: false })
  });
  register(SETTINGS.SPELLCASTING_RULE_SET, {
    name: 'SPELLBOOK.Settings.SpellcastingRuleSet.Name',
    hint: 'SPELLBOOK.Settings.SpellcastingRuleSet.Hint',
    scope: 'world',
    config: true,
    type: new StringField({
      required: true,
      blank: false,
      choices: { [RULE_SETS.LEGACY]: 'SPELLBOOK.Settings.SpellcastingRuleSet.Legacy', [RULE_SETS.MODERN]: 'SPELLBOOK.Settings.SpellcastingRuleSet.Modern' },
      initial: RULE_SETS.LEGACY
    }),
    onChange: () => RuleSet.invalidateAllCaches()
  });
  register(SETTINGS.NOTIFY_GM_ON_SPELL_CHANGES, {
    name: 'SPELLBOOK.Settings.NotifyGmOnSpellChanges.Name',
    hint: 'SPELLBOOK.Settings.NotifyGmOnSpellChanges.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: true }),
    onChange: () => SpellManager.invalidateAllCaches()
  });
  register(SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING, {
    name: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Name',
    hint: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: true })
  });
  register(SETTINGS.CHARGE_SCROLL_LEARNING_COST, {
    name: 'SPELLBOOK.Settings.ChargeScrollLearningCost.Name',
    hint: 'SPELLBOOK.Settings.ChargeScrollLearningCost.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: false })
  });
  register(SETTINGS.DEDUCT_SPELL_LEARNING_COST, {
    name: 'SPELLBOOK.Settings.DeductSpellLearningCost.Name',
    hint: 'SPELLBOOK.Settings.DeductSpellLearningCost.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: false })
  });
  register(SETTINGS.GM_APPROVE_SPELL_COPY, {
    name: 'SPELLBOOK.Settings.GmApproveSpellCopy.Name',
    hint: 'SPELLBOOK.Settings.GmApproveSpellCopy.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: false })
  });
  register(SETTINGS.SPELL_COPY_DOWNTIME_NOTE, {
    name: 'SPELLBOOK.Settings.SpellCopyDowntimeNote.Name',
    hint: 'SPELLBOOK.Settings.SpellCopyDowntimeNote.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: false })
  });
  register(SETTINGS.DISABLE_LONG_REST_SWAP_PROMPT, {
    name: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Name',
    hint: 'SPELLBOOK.Settings.DisableLongRestSwapPrompt.Hint',
    scope: 'client',
    config: true,
    type: new BooleanField({ initial: false })
  });
  register(SETTINGS.CANTRIP_SCALE_VALUES, {
    name: 'SPELLBOOK.Settings.CantripScaleValues.Name',
    hint: 'SPELLBOOK.Settings.CantripScaleValues.Hint',
    scope: 'world',
    config: true,
    type: new StringField({ initial: 'cantrips-known, cantrips' })
  });
  register(SETTINGS.REGISTRY_ENABLED_LISTS, { scope: 'world', config: false, type: new ArrayField(new StringField()) });
  register(SETTINGS.CLASS_RULE_LISTS_MIGRATION_COMPLETE, { scope: 'world', config: false, type: new BooleanField({ initial: false }) });
  register(SETTINGS.SPELL_LIST_KINDS_MIGRATION_COMPLETE, { scope: 'world', config: false, type: new BooleanField({ initial: false }) });
  register(SETTINGS.SPELL_BOOK_POSITION, { scope: 'client', config: false, type: new ObjectField({ nullable: true, initial: null }) });
  register(SETTINGS.SPELL_LIST_MANAGER_POSITION, { scope: 'client', config: false, type: new ObjectField({ nullable: true, initial: null }) });
  register(SETTINGS.INJECT_NOTES_INTO_DESCRIPTIONS, {
    name: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Name',
    hint: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Hint',
    scope: 'client',
    config: true,
    type: new StringField({
      required: true,
      blank: false,
      choices: {
        off: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Off',
        before: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.Before',
        after: 'SPELLBOOK.Settings.InjectNotesIntoDescriptions.After'
      },
      initial: 'off'
    })
  });
  register(SETTINGS.SPELL_NOTES_MAX_LENGTH, {
    name: 'SPELLBOOK.Settings.NotesMaxLength.Name',
    hint: 'SPELLBOOK.Settings.NotesMaxLength.Hint',
    scope: 'world',
    config: true,
    type: new NumberField({ min: 10, max: 1000, step: 10, initial: 240, nullable: false, integer: true })
  });
  for (const element of UI_ELEMENTS) {
    const toggle = { name: element.label, hint: element.description, scope: 'client', config: false, type: new BooleanField({ initial: true }) };
    register(element.player, toggle);
    if (element.gm) register(element.gm, toggle);
  }
  register(SETTINGS.PARTY_MODE_TOKEN_LIMIT, {
    name: 'SPELLBOOK.Settings.PartyModeTokenLimit.Name',
    hint: 'SPELLBOOK.Settings.PartyModeTokenLimit.Hint',
    scope: 'client',
    config: true,
    type: new NumberField({ min: 2, max: 8, step: 1, initial: 4, nullable: false, integer: true })
  });
  register(SETTINGS.HIDDEN_SPELL_LISTS, { scope: 'world', config: false, type: new ArrayField(new StringField()) });
  game.settings.registerMenu(MODULE.ID, 'spellDetailsCustomization', {
    name: 'SPELLBOOK.Settings.DetailsCustomization.MenuName',
    hint: 'SPELLBOOK.Settings.DetailsCustomization.MenuHint',
    label: 'SPELLBOOK.Settings.DetailsCustomization.MenuLabel',
    icon: 'fas fa-palette',
    type: DetailsCustomization,
    restricted: false
  });
}
