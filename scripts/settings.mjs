import { Troubleshooter } from './apps/_module.mjs';
import { MODULE, RULE_SETS, SETTINGS } from './constants.mjs';
import { DetailsCustomization } from './dialogs/_module.mjs';

const { ArrayField, BooleanField, ColorField, NumberField, ObjectField, StringField } = foundry.data.fields;

const UI_TOGGLES = [
  [SETTINGS.PLAYER_UI_FAVORITES, 'Favorites'],
  [SETTINGS.PLAYER_UI_COMPARE, 'Compare'],
  [SETTINGS.PLAYER_UI_NOTES, 'Notes'],
  [SETTINGS.PLAYER_UI_SPELL_LEVEL, 'SpellLevel'],
  [SETTINGS.PLAYER_UI_COMPONENTS, 'Components'],
  [SETTINGS.PLAYER_UI_SCHOOL, 'School'],
  [SETTINGS.PLAYER_UI_CASTING_TIME, 'CastingTime'],
  [SETTINGS.PLAYER_UI_RANGE, 'Range'],
  [SETTINGS.PLAYER_UI_DAMAGE_TYPES, 'DamageTypes'],
  [SETTINGS.PLAYER_UI_CONDITIONS, 'Conditions'],
  [SETTINGS.PLAYER_UI_SAVE, 'Save'],
  [SETTINGS.PLAYER_UI_CONCENTRATION, 'Concentration'],
  [SETTINGS.PLAYER_UI_MATERIAL_COMPONENTS, 'MaterialComponents'],
  [SETTINGS.GM_UI_COMPARE, 'Compare'],
  [SETTINGS.GM_UI_SPELL_LEVEL, 'SpellLevel'],
  [SETTINGS.GM_UI_COMPONENTS, 'Components'],
  [SETTINGS.GM_UI_SCHOOL, 'School'],
  [SETTINGS.GM_UI_CASTING_TIME, 'CastingTime'],
  [SETTINGS.GM_UI_RANGE, 'Range'],
  [SETTINGS.GM_UI_DAMAGE_TYPES, 'DamageTypes'],
  [SETTINGS.GM_UI_CONDITIONS, 'Conditions'],
  [SETTINGS.GM_UI_SAVE, 'Save'],
  [SETTINGS.GM_UI_CONCENTRATION, 'Concentration'],
  [SETTINGS.GM_UI_MATERIAL_COMPONENTS, 'MaterialComponents']
];

/** Register all module settings. */
export function registerSettings() {
  const register = (key, opts) => game.settings.register(MODULE.ID, key, opts);

  register(SETTINGS.CUSTOM_SPELL_MAPPINGS, { scope: 'world', config: false, type: new ObjectField() });
  register(SETTINGS.AUTO_DELETE_UNPREPARED_SPELLS, {
    name: 'SPELLBOOK.Settings.AutoDeleteUnpreparedSpells.Name',
    hint: 'SPELLBOOK.Settings.AutoDeleteUnpreparedSpells.Hint',
    scope: 'user',
    config: true,
    type: new BooleanField({ initial: false })
  });
  if (game.modules.get('chris-premades')?.active) {
    register(SETTINGS.CPR_COMPATIBILITY, {
      name: 'SPELLBOOK.Settings.CPRCompatibility.Name',
      hint: 'SPELLBOOK.Settings.CPRCompatibility.Hint',
      scope: 'world',
      config: true,
      type: new BooleanField({ initial: false })
    });
  }
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
    })
  });
  register(SETTINGS.NOTIFY_GM_ON_SPELL_CHANGES, {
    name: 'SPELLBOOK.Settings.NotifyGmOnSpellChanges.Name',
    hint: 'SPELLBOOK.Settings.NotifyGmOnSpellChanges.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: true })
  });
  register(SETTINGS.CONSUME_SCROLLS_WHEN_LEARNING, {
    name: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Name',
    hint: 'SPELLBOOK.Settings.ConsumeScrollsWhenLearning.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: true })
  });
  register(SETTINGS.DEDUCT_SPELL_LEARNING_COST, {
    name: 'SPELLBOOK.Settings.DeductSpellLearningCost.Name',
    hint: 'SPELLBOOK.Settings.DeductSpellLearningCost.Hint',
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
  register(SETTINGS.SPELL_BOOK_POSITION, { scope: 'client', config: false, type: new ObjectField() });
  register(SETTINGS.SIDEBAR_CONTROLS_BOTTOM, { scope: 'client', config: false, type: new BooleanField({ initial: false }) });
  register(SETTINGS.WIZARD_BOOK_ICON_COLOR, { scope: 'client', config: false, type: new ColorField({ required: false, nullable: true, blank: true, initial: null }) });
  register(SETTINGS.SPELL_NOTES_DESC_INJECTION, {
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
  register(SETTINGS.SPELL_NOTES_LENGTH, {
    name: 'SPELLBOOK.Settings.NotesMaxLength.Name',
    hint: 'SPELLBOOK.Settings.NotesMaxLength.Hint',
    scope: 'world',
    config: true,
    type: new NumberField({ min: 10, max: 1000, step: 10, initial: 240, nullable: false })
  });
  for (const [key, label] of UI_TOGGLES) register(key, { name: `SPELLBOOK.Settings.DetailsCustomization.${label}`, scope: 'client', config: false, type: new BooleanField({ initial: true }) });
  register(SETTINGS.PARTY_MODE_TOKEN_LIMIT, {
    name: 'SPELLBOOK.Settings.PartyModeTokenLimit.Name',
    hint: 'SPELLBOOK.Settings.PartyModeTokenLimit.Hint',
    scope: 'client',
    config: true,
    type: new NumberField({ min: 2, max: 8, step: 1, initial: 4, nullable: false })
  });
  register(SETTINGS.HIDDEN_SPELL_LISTS, { scope: 'world', config: false, type: new ArrayField(new StringField()) });
  register(SETTINGS.TROUBLESHOOTER_INCLUDE_ACTORS, { scope: 'client', config: false, type: new BooleanField({ initial: false }) });
  register(SETTINGS.LOGGING_LEVEL, {
    name: 'SPELLBOOK.Settings.Logger.Name',
    hint: 'SPELLBOOK.Settings.Logger.Hint',
    scope: 'client',
    config: true,
    type: new StringField({
      required: true,
      blank: false,
      choices: {
        0: 'SPELLBOOK.Settings.Logger.Choices.Off',
        1: 'SPELLBOOK.Settings.Logger.Choices.Errors',
        2: 'SPELLBOOK.Settings.Logger.Choices.Warnings',
        3: 'SPELLBOOK.Settings.Logger.Choices.Verbose'
      },
      initial: 2
    }),
    onChange: (value) => {
      MODULE.LOG_LEVEL = parseInt(value);
    }
  });
  game.settings.registerMenu(MODULE.ID, 'spellDetailsCustomization', {
    name: 'SPELLBOOK.Settings.DetailsCustomization.MenuName',
    hint: 'SPELLBOOK.Settings.DetailsCustomization.MenuHint',
    label: 'SPELLBOOK.Settings.DetailsCustomization.MenuLabel',
    icon: 'fa-solid fa-palette',
    type: DetailsCustomization,
    restricted: false
  });
  game.settings.registerMenu(MODULE.ID, 'troubleshooterMenu', {
    name: 'SPELLBOOK.Settings.Troubleshooter.Menu.Name',
    hint: 'SPELLBOOK.Settings.Troubleshooter.Menu.Hint',
    label: 'SPELLBOOK.Settings.Troubleshooter.GenerateReport',
    icon: 'fas fa-bug',
    scope: 'world',
    type: Troubleshooter,
    restricted: true
  });
}
