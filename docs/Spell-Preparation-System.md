# Spell Preparation System
The Spell Preparation System manages how spellcasting characters prepare and cast spells. This system ensures that characters follow class-specific rules, maintains accurate spell slot usage, and supports multiclass, granted, and always-prepared spells.

This page covers both core mechanics and advanced features, including GM oversight and validation.

## Core Mechanics

### Preparation Rules

The Spell Preparation system enforces the rules for each class:

- Class-Specific Mechanics:
    Each class has unique preparation rules. For example:
    - Clerics & Druids: Prepare a number of spells equal to `Wisdom modifier + class level`
    - Paladins: Prepare a number of spells equal to`Charisma modifier + half class level (rounded down)`
    - Wizards: Prepare a number of spells equal to `Intelligence modifier + wizard level`

- Spell Slot Management:
    The system tracks all available spell slots, including levels, usage, and remaining capacity. Prepared spells can only be cast if sufficient slots are available.

- Preparation Limits and Calculations:
    The system automatically calculates preparation limits based on class, subclass, and relevant modifiers. Spells that exceed limits are visually indicated and cannot be prepared until other spells are removed.

### Preparation Process

#### How to prepare spells
1. Open the character’s Spell Book.
2. Navigate to the class-specific preparation tab (if needed).
3. Select the spells you wish to prepare using checkboxes.
4. Press the save icon in the bottom right to save your new prepared spells.

####  Changing prepared spells
To swap prepared spells:
1. Uncheck the spells you wish to remove
2. Check the new spell to add
3. Save your changes

#### Long rest spell swapping
After a long rest, characters may swap prepared spells according to class rules.

A Visual prompts will appear to offer the player to open spell book, to manage spell changes.

## Advanced Features

### Multiclass Preparation Rules
Multiclass characters maintain separate preparation tabs per class.

Preparation limits are calculated independently for each class unless specified by rules.

### Always-prepared Spells
Some spells are always prepared due to class features, subclass grants, or racial traits:
- Displayed with a pill labled 'A'
- Cannot be removed from prepared spells

## Rule Enforcement

### Preparation validation
The system validates prepared spells to prevent errors:
- Checks class-specific limits
- Confirms spell slot sufficiency
- Enforces special rules for always-prepared and granted spells

### Error handling and notifications
- Exceeding preparation limits triggers visual alerts
- DM can configure notify-only or preventive enforcement

### DM Oversight Options
DMs can control how preparation rules are enforced:
- Enable full enforcement (prevents invalid preparations)
- Enable notify-only mode (alerts players and DM but allows flexibility)
- Review and approve player preparations before session start
