# Spell Preparation System

Manages how spellcasting characters prepare and cast spells. Enforces class-specific rules, tracks preparation limits, and supports multiclass, granted, and always-prepared spells.

---

## Core Mechanics

### Preparation Limits

Preparation limits are determined by the **dnd5e system** based on each class's spellcasting ability modifier and class level. Spell Book reads and enforces these limits — it does not calculate them independently.

### Rule Sets

Spell Book supports two rule sets that control swapping and cantrip behavior:

| Rule Set | Description |
|---|---|
| **Legacy (2014)** | Traditional D&D 5e rules. No cantrip swapping. |
| **Modern (2024)** | Updated rules allowing cantrip swapping on level-up or long rest (class-dependent). |

Each class can have its own default rule set. See [Ruleset Types and What They Mean](Ruleset-Types-and-Meanings) for the full class-specific defaults table.

---

## Preparation Process

### Preparing Spells

1. Open the character's Spell Book
2. Navigate to the class-specific preparation tab (if multiclass)
3. Select spells using checkboxes
4. Press **Save** in the footer to save your prepared spells

### Changing Prepared Spells

1. Uncheck the spells you want to remove
2. Check the new spells to add
3. Save your changes

### Long Rest Swapping

After a long rest, characters may swap prepared spells according to class rules. A prompt appears offering the player to open Spell Book to manage spell changes.

---

## Cantrip Rules

### Cantrip Limits

Each class has a cantrip preparation limit derived from system scale values. Cantrip counts are displayed in the level heading alongside the limit.

### Cantrip Swapping

Cantrip swapping rules depend on the rule set and class configuration:

- **One-for-one swapping** — Only one cantrip can be swapped per event (level-up or long rest)
- **Wizard-only long rest swap** — Only Wizards can swap cantrips on long rest (Modern rules)
- Swap behavior is configurable per class via the per-actor settings

### Preparation Bonuses

GMs can set per-class `spellPreparationBonus` and `cantripPreparationBonus` values to grant additional preparation slots beyond the system calculation.

---

## Ritual Casting

Three ritual casting modes are available per class:

| Mode | Behavior |
|---|---|
| **None** | No ritual casting support |
| **Prepared** | Can only ritual-cast spells that are currently prepared |
| **Always** | Can ritual-cast any ritual spell on the class spell list (e.g., Wizard) |

---

## Always-Prepared Spells

Some spells are always prepared due to class features, subclass grants, or racial traits:

- Displayed with a pill labeled **A**
- Cannot be removed from prepared spells
- Do not count against preparation limits

---

## Multiclass Preparation

Multiclass characters maintain separate preparation tabs per class. Preparation limits are calculated independently for each class.

---

## Rule Enforcement

### Enforcement Modes

- **Unenforced** — No restrictions on preparation
- **Notify GM** — Two layers of notification:
  1. **During editing**: `ui.notifications.info` warns the current user when they exceed their preparation limit
  2. **On save**: A whispered `ChatMessage` is sent to all GMs with a full spell update report — additions, removals, and over-limit warnings per class
- **Enforced** — Prevents invalid preparations entirely with locked checkboxes

See [Ruleset Types and What They Mean](Ruleset-Types-and-Meanings) for details.
