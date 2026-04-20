# Ruleset Types and What They Mean

Spell Book ships with two rule sets that define class-specific defaults for spell swapping, cantrip swapping, and ritual casting. The active rule set is selected globally and can be overridden per actor through [Spell Book Settings](Class-Rules).

Spell Book does not block spell preparation. Players always retain full control over what they prepare. The **Notify GM on Spell Changes** setting controls whether the GM is alerted when a player exceeds their cantrip or spell preparation limit.

---

## Rule Sets

The global rule set is controlled by the **Default Spellcasting Rules** setting (`spellcastingRuleSet`).

| Value | Label |
|---|---|
| `legacy` | Legacy Rules |
| `modern` | Modern Rules |

The effective rule set determines which class defaults `_getClassDefaults` applies (`_applyLegacyDefaults` or `_applyModernDefaults`) when a new spellcasting class is first initialized on an actor. Existing per-class overrides stored on the actor are preserved — changing the setting does not rewrite them.

### Legacy (2014)

Traditional D&D 5e rules. Key characteristics:

- No cantrip swapping for any class (`cantripSwapping = none`)
- Paladins and Rangers do not display cantrips (`showCantrips = false`)
- Wizard retains ritual casting from spellbook (`ritualCasting = always`)
- Cleric, Druid, and Bard have prepared-only ritual casting
- Bard, Sorcerer, Warlock, and Ranger swap spells on level up

### Modern (2024)

Updated rules. Key characteristics:

- Cantrip swapping enabled for most classes on level up (`cantripSwapping = levelUp`)
- Wizard can swap cantrips on long rest (`cantripSwapping = longRest`)
- Paladin and Ranger still do not display cantrips and cannot swap cantrips
- Ritual casting is removed by default for Cleric, Druid, and Bard (`ritualCasting = none`)
- Wizard retains ritual casting from spellbook (`ritualCasting = always`)
- Ranger switches to long-rest spell swapping

### Class Defaults by Rule Set

| Class | Rule Set | Spell Swap | Cantrip Swap | Ritual Casting | Show Cantrips |
|---|---|---|---|---|---|
| Wizard | Legacy | Long Rest | None | Always | Yes |
| Wizard | Modern | Long Rest | Long Rest | Always | Yes |
| Cleric | Legacy | Long Rest | None | Prepared | Yes |
| Cleric | Modern | Long Rest | Level Up | None | Yes |
| Druid | Legacy | Long Rest | None | Prepared | Yes |
| Druid | Modern | Long Rest | Level Up | None | Yes |
| Paladin | Legacy | Long Rest | None | None | No |
| Paladin | Modern | Long Rest | None | None | No |
| Ranger | Legacy | Level Up | None | None | No |
| Ranger | Modern | Long Rest | None | None | No |
| Bard | Legacy | Level Up | None | Prepared | Yes |
| Bard | Modern | Level Up | Level Up | None | Yes |
| Sorcerer | Legacy | Level Up | None | None | Yes |
| Sorcerer | Modern | Level Up | Level Up | None | Yes |
| Warlock | Legacy | Level Up | None | None | Yes |
| Warlock | Modern | Level Up | Level Up | None | Yes |
| Artificer | Legacy | Long Rest | None | None | Yes |
| Artificer | Modern | Long Rest | Level Up | None | Yes |

### Per-Actor Rule Set Override

![Spell Book Settings dialog showing per-actor and per-class rule overrides](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/spell-book-settings.png)

Each character can override the global rule set through [Spell Book Settings](Class-Rules) using the **Rule Set Override** dropdown:

| Value | Effect |
|---|---|
| Use Global | Follow the world-level `spellcastingRuleSet` value |
| Legacy | Apply Legacy defaults for this actor's class initialization |
| Modern | Apply Modern defaults for this actor's class initialization |

The override is stored as the `ruleSetOverride` actor flag (`null`, `"legacy"`, or `"modern"`). Individual per-class rule fields saved in Spell Book Settings still take precedence over the rule set defaults.

---

## Notify GM on Spell Changes

The world setting `notifyGmOnSpellChanges` (default **on**) controls whether GMs receive a whispered chat report when a player exceeds their cantrip or spell preparation maximum.

- When **on**: exceeding a max sends a GM notification. Preparation is **not** blocked.
- When **off**: no notification is sent. Preparation is still not blocked.

### Per-Actor Override

The **Notify on Spell Changes** checkbox in [Spell Book Settings](Class-Rules) is a plain boolean. It defaults to the current value of the world setting, and saving always writes an explicit `true` or `false` to the `notifyGm` actor flag — there is no "Use Global" third state.

---

## Swap Modes

Spell swapping and cantrip swapping are configured independently per class. Both use the same three modes:

| Mode | Value | When Swapping Is Allowed |
|---|---|---|
| None | `none` | Cannot swap |
| Level Up | `levelUp` | Only when the class gains a level |
| Long Rest | `longRest` | After completing a long rest |

---

## Ritual Casting Modes

Per-class setting controlling how rituals work:

| Mode | Value | Behavior |
|---|---|---|
| None | `none` | No ritual casting support |
| Prepared | `prepared` | Can ritual-cast only currently prepared ritual spells |
| Always | `always` | Can ritual-cast any ritual spell available to the class |

### Wizard-Specific Ritual Behavior

When a wizard class has `ritualCasting = always`, ritual spells in the wizard's spellbook are castable as rituals without being prepared, matching standard wizard ritual rules. The wizard ritual pool is tracked on the `wizardRitualCasting` actor flag.

---

## Wizard Defaults

Wizard-specific values are seeded from `WIZARD_DEFAULTS`:

| Field | Default | Meaning |
|---|---|---|
| `startingSpells` | 6 | Free spells added to the spellbook at character creation |
| `spellsPerLevel` | 2 | Free spells added to the spellbook on level up |
| `spellLearningCostMultiplier` | 50 | GP per spell level to copy a spell into the spellbook |
| `spellLearningTimeMultiplier` | 120 | Minutes per spell level to copy a spell into the spellbook |
| `ritualCasting` | Always | Wizards can ritual-cast from their spellbook |

All five values can be customized per-wizard-class through [Spell Book Settings](Class-Rules).

---

## Preparation Bonuses

GMs can grant extra preparation slots per class through [Spell Book Settings](Class-Rules):

- `spellPreparationBonus` — Extra leveled spell preparation slots
- `cantripPreparationBonus` — Extra cantrip preparation slots

Both default to `0` and stack additively on top of the class's calculated maximum. Both clamp to the range `-20..20`.

---

## Configuration Summary

| Setting | Scope | Where |
|---|---|---|
| Default Spellcasting Rules | World | Module settings |
| Notify GM on Spell Changes | World | Module settings |
| Rule Set Override | Actor | [Spell Book Settings](Class-Rules) |
| Notify on Spell Changes | Actor | [Spell Book Settings](Class-Rules) |
| Cantrip Swapping | Per-class | [Spell Book Settings](Class-Rules) |
| Spell Swapping | Per-class | [Spell Book Settings](Class-Rules) |
| Ritual Casting | Per-class | [Spell Book Settings](Class-Rules) |
| Show Cantrips | Per-class | [Spell Book Settings](Class-Rules) |
| Force Wizard Mode | Per-class | [Spell Book Settings](Class-Rules) |
| Class Spell List | Per-class | [Spell Book Settings](Class-Rules) |
| Subclass Spell List | Per-class | [Spell Book Settings](Class-Rules) |
| Preparation Bonuses | Per-class | [Spell Book Settings](Class-Rules) |
| Wizard Defaults | Per-class | [Spell Book Settings](Class-Rules) |
