# Wizard Spellbook Management

Wizards use a dedicated spellbook system for learning, tracking, and managing known spells. The wizard spellbook is separate from spell preparation — a wizard must first learn a spell into their spellbook before they can prepare it.

---

## Spell Learning

### How to Learn Spells

Wizards learn spells through the **Spellbook tab** in their Spell Book interface. Spells can be learned from:

- **Spell lists** assigned to the character by the GM
- **Spell scrolls** detected in the character's inventory

### Learning Cost

Each spell has a gold cost based on its level:

- **Formula**: Spell level x cost multiplier (default: **50 GP per spell level**)
- **Cantrips**: Always free (0 cost)
- **Free spells**: No gold cost when free spell slots are available

Gold is automatically deducted from the character's currency when the `Deduct Spell Learning Costs` setting is enabled. The module handles multi-currency deduction, drawing from the highest-value denominations first.

### Learning Time

Each spell has a time requirement:

- **Formula**: Spell level x time multiplier (default: **120 minutes per spell level**)
- **Cantrips**: 1 minute

Both the cost and time multipliers are configurable per class via the GM's per-actor settings.

### Spell Level Restriction

A wizard cannot learn spells above their maximum castable spell level. Spells above this threshold do not appear as learnable.

### Scroll Consumption

When learning from spell scrolls, the scroll can optionally be consumed (controlled by the `Consume Scrolls When Learning` world setting). The GM can enable or disable this behavior globally.

---

## Free Spell Tracking

Wizards receive a pool of free spell slots that do not require gold expenditure.

### Capacity Formula

Total free spell capacity is calculated as:

```
startingSpells + max(0, wizardLevel - 1) x spellsPerLevel
```

- **Starting spells**: 6 (default)
- **Spells per level**: 2 (default, granted each level after 1st)

Both values are configurable per class in the rule set.

### How Free Spells Are Counted

- **Used free spells** = Total spells in spellbook minus spells acquired via copying or scrolls
- **Remaining free spells** = max(0, capacity - used)
- **Cantrips are always free** regardless of remaining capacity

The footer displays remaining free spells alongside the total spellbook count.

---

## Spellbook Storage

### Journal-Based System

Learned spells are stored in journal entries within the module's compendium pack (`spell-book.custom-spell-lists`).

Each wizard spellbook journal contains:

- A single "spells" page with a set of spell UUIDs
- Actor ownership matching the character's permissions
- Metadata flags: actor ID, class identifier, creation date

### Per-Class Journals

Multi-class wizards (or characters with wizard mode enabled on multiple classes) get separate journal entries per class. Journal names include the class identifier when it differs from the default `wizard`.

---

## Learning Source Tracking

Every learned spell is tagged with how it was acquired:

| Source | Meaning |
|---|---|
| **Free** | Learned using a free spell slot |
| **Copied** | Learned by paying gold |
| **Scroll** | Learned from a spell scroll |

For copied and scroll-learned spells, the module stores additional metadata:

- Spell UUID
- Date copied (timestamp)
- Gold cost paid
- Time spent
- Whether it came from a scroll

---

## Scroll Scanner

The Scroll Scanner automatically detects spell scrolls in a wizard's inventory.

### How It Works

1. Scans all inventory items of type `consumable` with subtype `scroll`
2. Extracts spell data from item activities
3. Validates that the spell level is within the wizard's castable range
4. Presents eligible scrolls in the Spellbook learning tab

### In the Interface

- Eligible scrolls appear alongside list-based spells in the learning tab
- Scrolls that are incompatible, duplicates, or already known are visually flagged
- Learning from a scroll follows the same cost/time rules, with optional scroll consumption

---

## Multi-Class Wizard

### Class Identifier

All wizard spellbook methods accept a `classIdentifier` parameter (defaults to `wizard`). This allows any class to use the wizard spellbook system when the GM enables **Force Wizard Mode** for that class.

### Priority Resolution

When determining which class to treat as the "wizard" for a character:

1. **Force wizard mode** — Any class with this flag takes priority
2. **Explicit `wizard`** — The standard wizard class
3. **Natural wizard** — Class detected as a wizard by the system
4. **First wizard-enabled** — Fallback to the first class with wizard mode

### Separate State

Each wizard-enabled class maintains its own:

- Spellbook journal with learned spells
- Copied/scroll spell metadata
- Free spell tracking and capacity
