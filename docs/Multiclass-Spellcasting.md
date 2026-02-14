# Multiclass Spellcasting

---

## Tab Management

The Spell Book dynamically generates tabs for each spellcasting class a character has.

- A separate tab is created for each spellcasting class, updating automatically when a new class is added
- Each tab displays available spells, preparation rules, spell slots, and always-prepared/granted spells
- Tabs are color-coded and labeled with class icons for quick identification

---

## Spell Slot Calculation

Multiclass spellcasters combine spell slots according to D&D 5e rules.

- The system automatically calculates combined spell slots based on class levels and casting type
- Shared spell slots are available to all spellcasting classes, while class-specific lists determine which spells can be cast with those slots
- **Warlock pact magic** slots are tracked separately but integrated into the interface. Pact magic and multiclass spell slots do not interfere with one another

---

## Preparation Management

Each spellcasting class maintains its own preparation rules and limits.

- Spells must be prepared in the appropriate class tab — a wizard cannot prepare a cleric spell unless it appears on a list assigned to their wizard spellbook
- Preparation limits are enforced per class
- Always-prepared and granted spells are accounted for separately

---

## Class-Specific Restrictions

Spell Book only allows preparation of spells assigned to a specific class. A wizard/cleric multiclass character can only use their wizard preparation slots for wizard spells and cleric slots for cleric spells.

---

## Subclass Spell Integration

- Subclass-granted spells are displayed alongside base class spell lists
- The system handles always-prepared, granted, and optional subclass spells
- Domain spells, Circle spells, and similar features are automatically included in preparation calculations

---

## Cantrip Handling

### Preparation Limits

Each class has its own cantrip limit derived from system scale values. Cantrip counters appear in the spell level headings showing current count vs. limit.

### Cantrip Swapping

- Cantrip swapping rules are configured per class
- One-for-one swap restriction: only one cantrip can be swapped per event
- Wizard-only long rest cantrip swapping (Modern rules)
- Enforcement modes (Unenforced, Notify GM, Enforced) apply to cantrips independently

---

## Ritual Casting

Ritual casting rules vary by class:

- **Wizard** — Can ritual-cast any ritual spell from spellbook without preparation
- **Cleric, Druid, Bard** — Must have the ritual spell prepared
- **Other classes** — No ritual casting support by default

Ritual casting mode is configurable per class via the per-actor settings.

---

## Wizard Two-Tab System

Wizard characters (or any class with wizard mode enabled) receive two tabs:

1. **Preparation tab** — Standard spell preparation with checkboxes
2. **Spellbook learning tab** — Browse and learn new spells, manage scroll learning

Each tab maintains its own separate state tracking.

---

## Granted and Always-Prepared Spells

- Spells granted by class features, subclass, or items are detected via `flags.dnd5e.cachedFor` and `system.prepared === 2`
- These spells are marked with an **A** pill and cannot be unprepared
- Granted spells do not count against preparation limits

---

## Stale Data Cleanup

When a spellcasting class is removed from a character, the module automatically cleans up:

- Prepared spell lists for the removed class
- Module flags associated with that class
- Wizard spellbook data (if the removed class had wizard mode)
