# Spell Preparation System

Manages how spellcasting characters prepare and cast spells. Enforces class-specific rules, tracks spell slot usage, and supports multiclass, granted, and always-prepared spells.

---

## Core Mechanics

### Preparation Rules

Each class has unique preparation rules:

- **Clerics and Druids** — Wisdom modifier + class level
- **Paladins** — Charisma modifier + half class level (rounded down)
- **Wizards** — Intelligence modifier + wizard level

The system automatically calculates preparation limits based on class, subclass, and relevant modifiers. Spells that exceed limits are visually indicated and cannot be prepared until other spells are removed.

### Spell Slot Management

The system tracks all available spell slots including levels, usage, and remaining capacity. Prepared spells can only be cast if sufficient slots are available.

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

### Preparation Validation

The system validates prepared spells to prevent errors:

- Checks class-specific limits
- Confirms spell slot sufficiency
- Enforces rules for always-prepared and granted spells

### Enforcement Modes

- **Unenforced** — No restrictions on preparation
- **Notify GM** — Alerts the GM but allows flexibility
- **Enforced** — Prevents invalid preparations entirely

See [Ruleset Types and What They Mean](Ruleset-Types-and-Meanings) for details.
