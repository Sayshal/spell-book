# FAQ

Frequently asked questions about Spell Book.

---

## General

### What is Spell Book?

Spell Book is a FoundryVTT module that replaces the default spell management experience with an organized, rule-aware interface. It handles spell preparation, multiclass spellcasting, wizard spellbook management, party coordination, loadouts, and more.

### What systems does Spell Book support?

Spell Book is built exclusively for the **dnd5e** system (5.3.0 or later). It is not compatible with other game systems.

### How do I open Spell Book?

- Click the **Spell Book** button on a character sheet.
- Run `SPELLBOOK.api.spellBookQuickAccess()` from a hotbar macro with a token selected (this is the recommended way to launch Spell Book from outside the sheet).
- Through token HUD controls, if configured by your GM.

### Does Spell Book ship with macros?

No. Packaged macros were replaced with a public [API](API-Reference). Create your own hotbar macro that calls one of:

- `SPELLBOOK.api.spellBookQuickAccess()` — open the Spell Book for the selected token
- `SPELLBOOK.api.spellSlotTracker()` — post a chat card listing slot usage
- `SPELLBOOK.api.scrollScanner()` — scan every Item compendium for spell scrolls
- `SPELLBOOK.api.spellsNotInLists()` — GM-only: find spells not referenced by any spell list
- `SPELLBOOK.api.debugSpell('name')` — dump index entries for spells matching a name
- `SPELLBOOK.api.flagPurge()` — GM-only: purge Spell Book flags from an actor

---

## Spell Lists and Class Configuration

### My class tab is empty — what do I do?

Open **Spell Book Settings** on the actor and pick a **Class Spell List** for that class. Without a list assigned, the class has no spell source and the tab will be empty.

### Subclass spells aren't showing up.

Open **Spell Book Settings** and set a **Subclass Spell List** explicitly. The automatic subclass fallback was removed — a subclass list only appears if you point at one directly.

### How do I get bonus domain / oath / patron spells?

In **Spell Book Settings**, pick the subclass journal in the **Subclass Spell List** field. That journal holds the expanded list (domain spells for Clerics, oath spells for Paladins, patron spells for Warlocks, etc.) and its spells are granted and always prepared.

### I edited a stock spell list — where did the original go?

When you modify a bundled list, the original is moved into the **Hidden Spell Lists** folder automatically so it doesn't shadow your edits. To restore it:

- Open the Spell List Manager, find the entry in the Hidden folder, and toggle its visibility via the eye icon, **or**
- Delete your modified version — the original becomes visible again.

### After modifying a list, the "Classes" label on a spell isn't right.

- Spells **added** to a list update their class label immediately.
- Spells **removed** from a list keep their old class label until a world reload. The dnd5e system registry has no `unregister` API, so stale entries persist until the registry is rebuilt on startup. This is an upstream limitation.

### Why do some spells (Fire Bolt, Shield, etc.) appear multiple times?

Multiple source packs ship the same spell — SRD 5.1, SRD 5.2, and PHB 2024 all include many overlapping entries. All copies are legitimate; Spell Book no longer dedupes them because doing so silently hid content from some packs. Use [`debugSpell('spell name')`](API-Reference#debugspellname) to see which packs a given spell name comes from, and pick the copy you prefer in the Spell List Manager.

### How do I find spells that aren't in any list?

Run `SPELLBOOK.api.spellsNotInLists()` (GM) to audit every Item compendium against every discoverable spell list. The Troubleshooter report includes the same audit.

---

## Spell Preparation

### Why can't I prepare more spells?

You've reached your preparation limit for that class. The footer shows your current count vs. maximum (e.g., "5 / 8 Prepared"). The limit is derived from your class level and spellcasting ability modifier. If the number looks wrong, check your ability scores and class levels on the character sheet.

### Can a player exceed their spell or cantrip maximum?

Yes. Preparation is not hard-blocked. If **Notify GM on Spell Changes** is enabled, the GM receives a whispered notification when a player prepares past their limit, and the player sees an over-limit warning. The preparation still goes through.

### "Notify GM" doesn't fire for some players.

There are two controls:

- A **world setting** (`notifyGmOnSpellChanges`) that enables the feature globally.
- A **per-actor override** exposed in that actor's Spell Book Settings.

Both must be enabled for notifications to fire for a given actor.

### What does a locked/disabled spell checkbox mean?

Locked spells are **always prepared**. They're granted by your class, subclass, or an item (e.g., domain spells for Clerics, oath spells for Paladins). They're excluded from the preparation system entirely: you cannot unprepare them, and they do not count against your preparation limit.

### How does multiclass preparation work?

Each spellcasting class has its own tab and its own preparation limit. You prepare spells for each class independently. Spell slots are shared across classes using standard 5e multiclass slot calculations.

### What do the spell tags mean?

| Tag | Meaning |
|---|---|
| Prepared | Currently prepared, ready to cast |
| Granted | Always prepared via class feature or item |
| At Will | Castable without spell slots |
| Pact | Uses Warlock pact magic slots |
| Ritual | Can be cast as a ritual |
| Innate | Innate spellcasting ability |

---

## Loadouts

### Can I save a loadout without saving spell preparation first?

Yes. Loadouts capture the live checkbox state of the preparation grid, so there's no need to commit preparation before saving a loadout. Apply a loadout and then save preparation as normal.

### Can loadouts be class-specific?

Yes. Loadouts can be saved and applied per class, which is useful for multiclass characters.

---

## Wizard Features

### How do free spells work?

Wizards have a total free spell capacity calculated from their class level: `startingSpells + max(0, wizardLevel - 1) x spellsPerLevel` (defaults: 6 starting + 2 per level after 1st). Cantrips are always free regardless of capacity. The footer tracks how many free spells remain. Once free spells are used, learning additional spells costs gold.

### Can Wizards learn spells from scrolls?

Yes. When a Wizard learns a spell that exists as a scroll item, the gold cost is applied based on the spell's level. The GM configures the gold cost formula and whether scrolls are consumed in module settings.

### What are Legacy and Modern rule sets?

- **Legacy (2014):** Traditional D&D 5e rules with no cantrip swapping.
- **Modern (2024):** Updated rules allowing cantrip swapping on level-up or long rest (class-dependent).

See [Ruleset Types and What They Mean](Ruleset-Types-and-Meanings) for the full class-specific defaults table.

---

## Compatibility and Integration

### Chris's Premades (CPR) integration?

When the `chris-premades` module is active, enable the world setting **CPR Compatibility** (`cprCompatibility`) in Spell Book Settings. With it enabled, Spell Book hands off to CPR for spell resolution so that CPR-enhanced versions are used instead of the stock compendium copies.

### Does Spell Book work with Tidy 5e Sheet?

Yes, Tidy 5e Sheet is listed as an optional relationship and the Spell Book button is wired into its character sheet header the same way it is for the default dnd5e sheet.

---

## Interface

### What happened to advanced search?

Advanced search (the `^`-prefix syntax) was removed. Use the plain **Name** filter in the sidebar. Other filters (level, school, components, damage type, etc.) remain available as dropdowns.

### Where does the light theme's parchment background come from?

It reuses the `parchment.jpg` asset shipped with the dnd5e system, so the Spell Book's light theme matches the native sheet styling without duplicating assets.

### I moved the Spell Book to a second monitor and child dialogs open on the primary monitor.

Foundry v14's detach-window feature is supported. When the Spell Book is detached, child dialogs (spell notes, loadout selector, party coordinator, spell comparison, learn-from-scroll, etc.) are routed to the same detached window automatically. If a dialog still opens on the wrong monitor, make sure the parent Spell Book window is the one you detached.

---

## Troubleshooting

### My spells aren't showing up

1. Check that your character has the correct spellcasting class(es) configured on their sheet.
2. Open **Spell Book Settings** and confirm a **Class Spell List** (and **Subclass Spell List**, if applicable) is assigned.
3. Ask your GM to verify spell lists exist in the **Spell List Manager**.
4. If spells were recently added to a compendium, reload Foundry.

### Something broke after an update

1. Reload Foundry (`F5` or **Settings > Return to Setup**).
2. Clear your browser cache.
3. If the issue persists, generate a [Troubleshooter](SpellBook-Troubleshooter) report and share it on [Discord](https://discord.gg/PzzUwU9gdz) or [GitHub Issues](https://github.com/Sayshal/spell-book/issues).

### How do I report a bug?

1. Open the [Troubleshooter](SpellBook-Troubleshooter) and export a report.
2. Open a new issue on [GitHub](https://github.com/Sayshal/spell-book/issues) or post in the [Discord](https://discord.gg/PzzUwU9gdz) support channel.
3. Attach the Troubleshooter report and describe the steps to reproduce the issue.

---

## Data and Storage

### Where is Spell Book data stored?

Spell lists are stored as journal pages in Spell Book's compendium packs. Per-actor data (preparation state, wizard spellbook, notes, loadouts) is stored as module flags on each actor document.

### Can I back up my spell configurations?

Yes. Use the **Loadout** feature to save and restore named spell preparation configurations. Loadouts are stored per-actor and can be swapped instantly. For a full world snapshot, the [Troubleshooter](SpellBook-Troubleshooter) exports every module setting as a JSON blob that can be imported elsewhere.

### What happens if I uninstall Spell Book?

Module flags remain on actor documents but are inert, so they won't affect gameplay. Custom spell lists in the module's compendium packs will be removed with the module. If you plan to reinstall later, your per-actor data will still be there. GMs who want a clean slate can run `SPELLBOOK.api.flagPurge()` before uninstalling.
