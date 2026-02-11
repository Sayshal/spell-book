# Ruleset Types and What They Mean

Spell Book supports three enforcement modes, each providing a different balance between player freedom and rules compliance.

---

## Unenforced Mode

No restrictions on player actions. Characters can prepare any spell and bypass limits.

- Players have full control over spell preparation, swapping, and casting
- Useful for narrative-driven campaigns, experimental gameplay, or testing homebrew rules

> [!NOTE]
> Unenforced Mode does not notify the GM of potential rule violations.

---

## Notify GM Mode

**Recommended.** Allows player actions but alerts the GM to potential rule violations.

- Notifications appear when a player prepares spells outside allowed limits or changes prepared spells
- Notifications include details about the violation
- Players retain flexibility while GMs maintain awareness

---

## Enforced Mode

Strict rule enforcement. The system prevents any action that violates configured rules.

- Players cannot prepare more spells than allowed
- Preparation is restricted to predetermined times (after long rests or on level up)
- Exceeding preparation limits is blocked

Best for:

- Rules-heavy campaigns
- Sessions with new players needing preparation guidance
- Campaigns with complex homebrew restrictions

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

Specific spells, subclasses, or homebrew features can be exempted from enforcement per character via the **Spell Book Settings** dialog (wand icon) in their Spell Book.
