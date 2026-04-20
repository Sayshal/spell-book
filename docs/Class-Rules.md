# Spell Book Settings (Class Rules)

The **Spell Book Settings** dialog is the central per-actor configuration point for Spell Book. It controls which spell lists each spellcasting class draws from, how cantrips and spells can be swapped, ritual casting behavior, preparation bonuses, wizard mechanics, and per-actor overrides for global rule settings.

The dialog is internally still referred to as `ClassRules` (file: `scripts/dialogs/class-rules.mjs`); the window title shown to users is `Spell Book Settings - {actor name}` and the window icon is `fa-cog`.

![Spell Book Settings dialog](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/spell-book-settings.png)

> [!IMPORTANT]
> Spells do **not** auto-load. Every spellcasting class on a character must have a **Class Spell List** assigned here before its tab in the Spell Book displays any spells. If the list is empty, the tab shows a "no spell list assigned" notice instead of spells.

---

## Opening the Dialog

The dialog can be opened from several entry points:

- **Spell Book sidebar** — Click the gear (cog) button in the Player Spell Book sidebar.
- **Character sheet** — Right-click (context) the Spell Book button on the actor sheet.
- **No spell list assigned notice** — When a class tab has no spell list, click the notice button to jump straight into the dialog (auto-scrolls to that class's section).

---

## Global Fieldset

The top fieldset contains per-actor overrides and a shortcut. These apply to the entire actor, not a specific class.

| Field | Type | Behavior |
|---|---|---|
| **Rule Set Override** | Select: Use Global / Legacy / Modern | Overrides the world-level **Default Spellcasting Rules** setting. `Use Global` inherits whatever is set on the world. See [Ruleset Types and Meanings](Ruleset-Types-and-Meanings) for what Legacy vs Modern changes. Affects the class defaults applied by `_getClassDefaults` when a new class is first initialized on the actor. |
| **Notify on Spell Changes** | Checkbox | When on, GMs receive a whispered chat report whenever this actor prepares more cantrips or spells than their class allows. Defaults to the current value of the world-level `Notify GM on Spell Changes` setting. Saving always writes an explicit boolean to the actor flag. This does **not** block preparation — it is an awareness signal only. |
| **Open Details Customization** | Button | Opens the [Details Customization](Details-Customization) dialog directly. If this Spell Book Settings dialog has been detached, the palette dialog opens routed into the same detached window. |

Stored on the actor as:

- `flags.spell-book.ruleSetOverride` (`null` = use global, `"legacy"`, or `"modern"`)
- `flags.spell-book.notifyGm` (always an explicit `true` or `false` after save)

> [!NOTE]
> Changing the Rule Set Override does **not** retroactively rewrite per-class rules that have already been customized. It only affects new classes added afterward and serves as the default source for any class rule that is still at its default value.

---

## Per-Class Sections

One fieldset renders per spellcasting class detected on the actor, sorted alphabetically. Each fieldset is headed by the class icon and name. If the actor has no spellcasting classes, a placeholder message is shown instead.

### Core Fields (all classes)

| Field | Type | Default | Behavior |
|---|---|---|---|
| **Show Cantrips** | Checkbox | `true` for most classes, `false` for **Paladin** and **Ranger** | When off, the cantrip group is hidden in the Spell Book and any non-granted, non-always-prepared cantrips for this class are removed on save. Disabled automatically when the class has no cantrip scale value. |
| **Force Wizard Mode** | Checkbox | `false` | Shown only for wizard-eligible classes. When on, this class is treated as a wizard: spellbook tab, free starting spells, level-up free spells, scroll-learn, and GP-based copying. Useful for homebrew classes with wizard-like mechanics. |
| **Cantrip Swapping** | Select: none / level-up / long-rest | Varies by rule set and class | Controls when cantrips may be changed. Disabled when Show Cantrips is off. |
| **Spell Swapping** | Select: none / level-up / long-rest | Varies by rule set and class | Controls when prepared spells may be changed. |
| **Ritual Casting** | Select: none / prepared / always | Varies by rule set and class | `prepared` = only currently prepared rituals, `always` = wizard-style cast from list. |
| **Class Spell List** | Multi-select journal picker (`customSpellList`) | `[]` | **Required.** UUIDs of journal spell-list pages this class pulls spells from. If empty, the tab renders the "no spell list assigned" notice and no spells are available. |
| **Subclass Spell List** | Multi-select journal picker (`customSubclassSpellList`) | `[]` | **Optional.** UUIDs of journal pages that overlay the class list with subclass-specific spells (domain, oath, circle, patron, etc.). Leaving empty means no subclass overlay. |
| **Spell Preparation Bonus** | Number `-20..20` | `0` | Added to the class's calculated maximum prepared spells. Negative values reduce the cap. |
| **Cantrip Preparation Bonus** | Number `-20..20` | `0` | Added to the class's calculated maximum prepared cantrips. Disabled when Show Cantrips is off. |

### Class and Subclass Spell Lists

Both multi-selects are populated from the same pool of journal pages:

- The module's built-in custom spell lists pack
- Every other JournalEntry compendium whose pages are of type `spells` (excluding `other` type)
- Excluding any list UUIDs in the world-level **Hidden Spell Lists** setting

Options are grouped by Class / Subclass / Other. Multiple selections on either field are merged at read time (duplicates de-duplicated by UUID). Lists are created, duplicated, merged, and renamed through the [Spell List Manager](SpellListManager-Interface-Overview). See [Creating New Spell Lists](Creating-New-Spell-Lists) and [Modifying Existing Spell Lists](Modifying-Existing-Spell-Lists).

> [!NOTE]
> The Subclass Spell List is fully explicit. There is no automatic lookup of domain, oath, or patron spells from the dnd5e subclass registry. If you want these spells available, you must pick the matching journal page yourself.

> [!WARNING]
> If changing the class or subclass spell list would orphan spells the character has already prepared, a confirmation dialog appears listing the affected spells. Confirming the change unprepares and removes those spells from the actor.

### Wizard-Only Fields

Shown only when the class is detected as a wizard **or** `Force Wizard Mode` is enabled.

| Field | Type | Default | Behavior |
|---|---|---|---|
| **Starting Spells** | Number `>= 0` | `6` | Number of free spells the wizard begins with at level 1. |
| **Spells Per Level** | Number `>= 0` | `2` | Number of free spells granted on each wizard level-up. |
| **Spell Learning Cost Multiplier** | Number `>= 0` | `50` | Gold pieces per spell level charged when copying a spell into the spellbook. Cantrips are always free. |
| **Spell Learning Time Multiplier** | Number `>= 0` | `120` | Minutes per spell level required to copy a spell. Cantrips take 1 minute. |

See [Wizard Spellbook Management](Wizard-Spellbook-Management) for how these values feed into the Spellbook tab.

---

## Rule Set Defaults

The defaults applied when a class is first detected depend on the effective rule set (world setting or actor override). See [Ruleset Types and Meanings](Ruleset-Types-and-Meanings) for the full per-class defaults table.

---

## Saving

The **Save** button in the footer writes all changes as a single actor update:

- Global overrides are written to `flags.spell-book.ruleSetOverride` and `flags.spell-book.notifyGm`.
- Per-class rules are merged into `flags.spell-book.classRules[<classIdentifier>]`.
- Turning off **Show Cantrips** deletes non-granted, non-always-prepared cantrips for that class.
- The per-actor rule cache is cleared and `SpellDataManager.invalidateCache(actor)` is called.
- Any open Spell Book window for this actor reloads all class tabs immediately.

The dialog closes on submit.

---

## Related Pages

- [SpellBook Interface Overview](SpellBook-Interface-Overview)
- [Ruleset Types and Meanings](Ruleset-Types-and-Meanings)
- [Details Customization](Details-Customization)
- [Creating New Spell Lists](Creating-New-Spell-Lists)
- [Wizard Spellbook Management](Wizard-Spellbook-Management)
- [Spell List Manager Interface Overview](SpellListManager-Interface-Overview)
