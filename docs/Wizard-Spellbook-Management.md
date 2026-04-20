# Wizard Spellbook Management

Wizards maintain a dedicated spellbook alongside the regular spell-preparation workflow. A spell must first be **learned** into the spellbook before it can be prepared or cast. Wizard handling applies both to the native `wizard` class and to any class with **Force Wizard Mode** enabled in [Class Rules](Ruleset-Types-and-Meanings.md).

Each wizard-enabled class is treated independently: its own Learn tab, its own journal-backed spellbook, its own copied-spell metadata flag, and its own counters.

---

## The Learn Tab

![Wizard Learn tab with spellbook entries and scroll sources](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/psb-wizard-learn.png)

A **Learn** tab is rendered in the Spell Book for every wizard-enabled class on the actor, in addition to that class's regular Prepare tab. The tab's label is the class name, and it is displayed with the module icon so it can be visually distinguished from Prepare tabs.

The tab lists:

- Spells from the class's assigned spell list that are not yet in the spellbook.
- Eligible spell scrolls detected in the actor's inventory (see [Scroll Scanner](#scroll-scanner)).

Spells above the actor's maximum castable level for that class are filtered out.

### Row States

Each spell row on the Learn tab resolves to one of three states:

| State | Control | Behavior |
|---|---|---|
| Available from the spell list | **Learn Spell** button | Free copies are added immediately. Paid copies open a confirmation dialog quoting the gold cost and time from `WizardBook.getCopyingCost()` and `WizardBook.getCopyingTime()`. |
| Available from a scroll | **Learn Spell** button with scroll icon | Calls `learnSpellFromScroll`. If `Consume Scrolls When Learning` (world setting) is enabled, the scroll's `quantity` is decremented; the scroll is deleted when quantity hits zero. |
| Already in the spellbook | **In Spellbook** badge | Shows a source icon (book / scroll / shopping cart / level-up arrow — see [Learning Sources](#learning-sources)). Hovering reveals an eraser-icon unlearn affordance; clicking removes the spell from the spellbook. |

### Footer Counters

The Learn tab footer displays:

- **Cantrip counter** — only when `showCantrips` is true for the class.
- **Known spells** — `current / max`, where max is `getMaxSpellsAllowed()`.
- **Free copies remaining** — from `getRemainingFreeSpells()`. When this reaches zero, any further non-scroll copies require gold and time.

---

## Learning Spells

### From the Class Spell List

Clicking **Learn Spell** queries `WizardBook.getCopyingCost(actor, classId, spell)`:

- If the result is free (initial allotment, level-up grant, cantrip, or free pool not yet depleted), the spell is added directly without a dialog.
- Otherwise a confirmation dialog shows the gold cost and time. On confirm, the spell is added with source `copied`. If the `Deduct Spell Learning Costs` world setting is enabled, the gold is deducted from the actor's currency (base currency first, then other denominations in increasing conversion order). If total wealth is insufficient, the learn is aborted with a warning.

### From Scrolls

Scroll rows route to `learnSpellFromScroll`. The spell is added with source `scroll`; no gold is charged and no free-pool slot is consumed. If `Consume Scrolls When Learning` is on, the scroll item's quantity is decremented (or the item deleted when quantity would drop below 1).

### Unlearning

The in-spellbook eraser-icon action calls `WizardBook.removeSpellFromSpellbook(actor, classId, uuid)`:

- Removes the UUID from the spellbook journal page's `system.spells` Set.
- Removes the matching metadata entry from the `wizardCopiedSpells_<classId>` actor flag.
- If the unlearned spell was the actor's only copy (no other class grants it), it is also cleared from the actor's prepared-spell flag.

---

## Cost and Time

### Gold Cost

```
cost = spellLevel * spellLearningCostMultiplier
```

- Default multiplier: **50 GP per level** (`WIZARD_DEFAULTS.SPELL_LEARNING_COST_MULTIPLIER`).
- Cantrips (`level === 0`): **0 GP**.
- Free copies: **0 GP**.

### Time

```
minutes = spellLevel * spellLearningTimeMultiplier
```

- Default multiplier: **120 minutes per level** (`WIZARD_DEFAULTS.SPELL_LEARNING_TIME_MULTIPLIER`).
- Cantrips: **1 minute**.

Formatted via `dnd5e.utils.formatTime`.

Both multipliers are configurable per class in [Class Rules](Ruleset-Types-and-Meanings.md).

---

## Free Spell Pool

### Capacity

```
max = startingSpells + max(0, classLevel - 1) * spellsPerLevel
```

- `startingSpells` default: **6** (`WIZARD_DEFAULTS.STARTING_SPELLS`) — granted on first processing of the class with source `initial`.
- `spellsPerLevel` default: **2** (`WIZARD_DEFAULTS.SPELLS_PER_LEVEL`) — granted on level-up with source `levelUp`.

Both are configurable per class in Class Rules. Class level reads from `actor.spellcastingClasses[classId].system.levels`.

### Accounting

A spell occupies a free slot unless it was learned via `copied` or `scroll` (recorded in the `wizardCopiedSpells_<classId>` flag). Specifically:

- **Used free** = spellbook entries with no matching entry in the copied-spells flag.
- **Remaining free** = `max(0, capacity − used)`.

Cantrips are always treated as free regardless of remaining pool.

`getMaxSpellsAllowed()` returns the same formula and defines both the free-pool ceiling and the total spellbook capacity shown in the footer.

---

## Spellbook Storage

### Journal Page

Each wizard-enabled class gets a dedicated `JournalEntry` in the `spell-book.custom-spell-lists` compendium pack, placed in the `Actor Spellbooks` folder. Access goes through `WizardBook._getOrCreateSpellbookJournal(actor, classId)`.

The journal has one page of type `spells`; its `system.spells` Set holds the learned UUIDs.

| Location | Value |
|---|---|
| Journal flags (`spell-book`) | `actorId`, `classIdentifier`, `isActorSpellbook: true`, `creationDate` |
| Page `system.identifier` | `<slug(actor.name)>-<classId>-spellbook` |
| Page `system.type` | `'actor-spellbook'` |
| Ownership | Mirrors the actor's owners (everyone with ownership level 3 retains ownership on the journal and page). |

Journal name is the actor's name for the default `wizard` class, or `<actor> (<className>)` for other wizard-enabled classes.

### Copied-Spell Metadata

Spells learned as `copied` or `scroll` append an entry to the `actor.flags.spell-book.wizardCopiedSpells_<classId>` flag:

| Field | Description |
|---|---|
| `spellUuid` | Spell UUID |
| `dateCopied` | `Date.now()` timestamp |
| `cost` | Gold paid (0 for scroll) |
| `timeSpent` | Minutes taken |
| `fromScroll` | `true` for scroll learns, `false` for paid copies |

Unlearning removes the entry. Spells learned via `initial`, `free`, or `levelUp` have no flag entry — absence of an entry is what marks a spell as a free-pool occupant.

---

## Learning Sources

Every spell in the spellbook resolves to one of five sources, defined in `WIZARD_SPELL_SOURCE`:

| Source | Meaning | Icon (in-spellbook badge) |
|---|---|---|
| `initial` | Part of the starting allotment granted by `_initializeFlagsForClass` the first time the class is processed | book |
| `free` | Copied from the class spell list while the free pool still had capacity | book |
| `copied` | Paid gold-copy from the class spell list | shopping cart |
| `scroll` | Learned by consuming/reading a scroll | scroll |
| `levelUp` | Per-level automatic grant (`spellsPerLevel`) | level-up arrow |

`WizardBook.getSpellLearningSource()` currently infers from the `wizardCopiedSpells_<classId>` flag: entries with `fromScroll: true` resolve to `scroll`, other entries to `copied`, and missing entries fall back to `free`. `initial` and `levelUp` are represented by their absence of a flag entry and are differentiated at render time by the Learn tab based on when they were granted.

---

## Scroll Scanner

`scanForScrollSpells(actor, maxSpellLevel)` in `scripts/data/scroll-processor.mjs` builds the scroll section of the Learn tab.

### Detection

1. Filters `actor.items` to entries with `type === 'consumable'` and `system.type.value === 'scroll'`.
2. For each scroll, extracts a spell UUID from (in order):
   - Any activity with `activity.spell.uuid`.
   - Any activity effect reference whose corresponding effect has an `origin` UUID.
   - Fallback: parse the scroll name (`"Spell Scroll: <Name>"`) and search item packs for a spell matching that name, preferring `system.level === scroll.flags.dnd5e.spellLevel.base`.
3. Rejects spells above `maxSpellLevel` (cantrips always pass).

### Filtering

Scrolls whose contained spell UUID is already in the wizard's spellbook are excluded from the Learn tab — the spell is already known.

---

## Ritual Casting Integration

Per-class ritual behavior is set in Class Rules under **Ritual Casting**. Three modes:

| Mode | Behavior |
|---|---|
| `none` | Default. Rituals are prepared like any other spell. |
| `prepared` | Rituals can be cast without consuming a slot, but only while prepared. |
| `always` | On save, spells in the wizard's spellbook that are flagged ritual are auto-injected into the actor as ritual-mode items (`preparation.mode: 'ritual'`), even when not prepared. Lets the wizard cast any spellbook ritual at will. |

In `always` mode, `SpellManager` tracks module-managed ritual items on the `wizardRitualCasting` actor flag. On each save:

- Items flagged from a previous mode that no longer apply are cleaned up.
- Current ritual spells from the spellbook are inserted or refreshed.

Switching a class away from `always` clears the ritual items it generated.

See [Ruleset Types and Meanings](Ruleset-Types-and-Meanings.md) for the full ruleset table.

---

## Initial Spells and Level-Up Grants

The first time a wizard-enabled class is processed for an actor, `WizardBook._initializeFlagsForClass` grants the starting allotment (`WIZARD_DEFAULTS.STARTING_SPELLS`, default **6**) as source `initial`. These occupy the free pool but are counted separately from normal copies.

Each subsequent class level grants `WIZARD_DEFAULTS.SPELLS_PER_LEVEL` (default **2**) spells as source `levelUp`. These are free.

Both grants simply add UUIDs to the spellbook page without creating copied-spell flag entries — they behave identically to `free` adds for accounting purposes.

---

## Chris's Premades Compatibility

When the **Chris's Premades** module is active and the `CPR Compatibility` world setting is enabled, any save that changes the wizard spellbook triggers a CPR actor refresh. This ensures CPR's item replacements are re-evaluated after new wizard spells appear on the actor.

---

## Force Wizard Mode

Class Rules expose a per-class **Force Wizard Mode** toggle. When on, the class is treated as a wizard for all purposes:

- A Learn tab is rendered for it.
- Its spells are managed through a dedicated wizard journal and copied-spells flag.
- Cost, time, free pool, ritual integration, and initial/level-up grants apply using that class's own rules.

Useful for homebrew classes, variant classes, or subclasses that copy spells into a book.

Wizard detection comes from `ClassManager.getWizardEnabledClasses()`, which returns every spellcasting class that is either the native wizard (class identifier `wizard`) or has `forceWizardMode === true`. Each returned class gets independent state; there is no priority between them.

---

## Multi-Class Wizards

A character with multiple wizard-enabled classes (e.g. Wizard multiclassed with a force-wizard Artificer) has:

- One Learn tab per wizard-enabled class.
- One spellbook journal per class in `custom-spell-lists`.
- Independent `wizardCopiedSpells_<classId>` flags.
- Independent free-pool, max-spell, and ritual-mode state driven by each class's own level and rules.

No spells are shared between spellbooks.

---

## API Summary

Key static methods on `WizardBook` (`scripts/managers/wizard-book.mjs`):

| Method | Purpose |
|---|---|
| `getWizardSpellbook(actor, classId)` | Returns the UUID array from the journal page |
| `isSpellInSpellbook(actor, classId, uuid)` | Membership check |
| `addSpellToSpellbook(actor, classId, uuid, source, metadata)` | Add a spell and optionally record copied metadata |
| `removeSpellFromSpellbook(actor, classId, uuid)` | Remove a spell and clean up metadata |
| `copySpell(actor, classId, uuid, cost, time, isFree)` | Add with optional currency deduction |
| `getCopyingCost(actor, classId, spell)` | `{ cost, isFree }` |
| `getCopyingTime(actor, classId, spell)` | Formatted time string |
| `getMaxSpellsAllowed(actor, classId)` | Capacity formula result |
| `getUsedFreeSpells(actor, classId)` | Count of non-paid spells in the spellbook |
| `getRemainingFreeSpells(actor, classId)` | `max − used`, floored at zero |
| `isSpellFree(actor, classId, spell)` | Whether the next copy would be free |
| `getSpellLearningSource(actor, classId, uuid)` | Resolves to `free` / `copied` / `scroll` from the flag |
| `invalidateCache(actor)` | Drop journal and spellbook caches |

Related modules:

- `scripts/apps/player-spell-book.mjs` — Learn tab render (`_buildRenderContext` with `isLearn`), `#onLearnSpell`, `#onLearnSpellFromScroll`, `#onUnlearnSpell`.
- `scripts/managers/spell-manager.mjs` — save flow and ritual auto-injection.
- `scripts/data/scroll-processor.mjs` — `scanForScrollSpells`.
- `scripts/constants.mjs` — `WIZARD_DEFAULTS`, `WIZARD_SPELL_SOURCE`, `FLAGS.WIZARD_COPIED_SPELLS`.
- `templates/apps/player/tab-learn.hbs`, `templates/components/spell-item.hbs` — Learn tab and per-row wizard action block.
