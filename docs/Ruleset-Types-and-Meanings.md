# Ruleset Types and What They Mean

Spell Book supports three enforcement modes and two rule sets. These control how strictly spell preparation rules are applied and which class-specific behaviors are active.

---

## Enforcement Modes

### Unenforced Mode

No restrictions on player actions. Characters can prepare any spell and bypass limits.

- Players have full control over spell preparation, swapping, and casting
- Useful for narrative-driven campaigns, experimental gameplay, or testing homebrew rules

> [!NOTE]
> Unenforced Mode does not notify the GM of potential rule violations.

### Notify GM Mode

**Recommended.** Allows player actions but provides two layers of notification:

1. **During editing** — When a player prepares spells beyond their limit, a `ui.notifications.info` warning appears for the current user showing the over-limit count
2. **On save** — A whispered `ChatMessage` is sent to all GMs with a full spell update report including additions, removals, and over-limit warnings per class

Players retain flexibility while GMs maintain full awareness of all preparation changes.

### Enforced Mode

Strict rule enforcement. The system prevents any action that violates configured rules.

- Players cannot prepare more spells than allowed
- Preparation is restricted to predetermined times (after long rests or on level up)
- Exceeding preparation limits is blocked with locked checkboxes

Best for:

- Rules-heavy campaigns
- Sessions with new players needing preparation guidance
- Campaigns with complex homebrew restrictions

---

## Rule Sets

Spell Book provides two complete rule sets that define class-specific defaults for swapping, ritual casting, and cantrip behavior.

### Legacy (2014)

Traditional D&D 5e rules. Key characteristics:

- **No cantrip swapping** for any class
- Rangers and Paladins have no visible cantrips
- Bard, Sorcerer, and Warlock swap spells on level-up only

### Modern (2024)

Updated rules. Key characteristics:

- **Cantrip swapping** enabled for most classes
- Wizard can swap cantrips on long rest
- Most other casters swap cantrips on level-up
- Cleric and Druid lose ritual casting by default

### Class-Specific Defaults

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

---

## Swap Modes

Three swap modes control when spells or cantrips can be changed:

| Mode | When Swapping Is Allowed |
|---|---|
| **None** | Cannot swap (locked) |
| **Level Up** | Only during level-up |
| **Long Rest** | After completing a long rest |

Spell swapping and cantrip swapping are configured independently per class.

---

## Ritual Casting Modes

Three modes control how ritual spells work per class:

| Mode | Behavior |
|---|---|
| **None** | No ritual casting support |
| **Prepared** | Can only ritual-cast spells that are currently prepared |
| **Always** | Can ritual-cast any ritual spell on the class spell list (e.g., Wizard casting from spellbook) |

---

## Preparation Bonuses

GMs can grant additional preparation slots per class:

- **`spellPreparationBonus`** — Extra leveled spell preparation slots
- **`cantripPreparationBonus`** — Extra cantrip preparation slots

These are set per-actor via the Spell Book Settings dialog (wand icon).

---

## Rule Categories

Spell Book can enforce rules in the following areas:

| Category | What It Validates |
|---|---|
| Spell Preparation | Characters prepare only spells allowed by class, subclass, or modifiers |
| Multiclass Spellcasting | Cross-class preparation and shared resources |
| Class-Specific Restrictions | Spells granted by class or subclass spell lists |

---

## Configuration

### Choosing an Enforcement Level

| Mode | Use Case |
|---|---|
| Unenforced | Sandbox play, testing new features |
| Notify GM | Flexibility with oversight, experimental rules |
| Enforced | Strict D&D 5e adherence, complex mechanics |

### Rule Exceptions

Specific spells, subclasses, or homebrew features can be exempted from enforcement per character via the **Spell Book Settings** dialog (wand icon) in their Spell Book. Custom spell list overrides can be configured with confirmation dialogs and automatic unprepare behavior.
