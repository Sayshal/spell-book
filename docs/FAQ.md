# FAQ

Frequently asked questions about Spell Book.

---

## General

### What is Spell Book?

Spell Book is a FoundryVTT module that replaces the default spell management experience with an organized, rule-enforced interface. It handles spell preparation, multiclass spellcasting, wizard spellbook management, party coordination, and more.

### What systems does Spell Book support?

Spell Book is built exclusively for the **dnd5e** system. It is not compatible with other game systems.

### How do I open Spell Book?

There are several ways:
- Click the **Spell Book button** on a character sheet
- Use the **Quick Access** macro from the hotbar (select a token first)
- Through token controls, if configured by your GM

---

## Spell Preparation

### Why can't I prepare more spells?

You've reached your preparation limit for that class. The footer shows your current count vs. maximum (e.g., "5 / 8 Prepared"). Your limit is calculated from your class level and spellcasting ability modifier. If the number seems wrong, check that your ability scores and class levels are set correctly on your character sheet.

### What does the lock icon on a spell mean?

Locked spells are **always prepared** — they're granted by your class, subclass, or an item (e.g., domain spells for Clerics, oath spells for Paladins). You cannot unprepare them, and they don't count against your preparation limit.

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

## Spell Lists

### Where do spell lists come from?

Spell Book ships with built-in spell lists for all official D&D 5e classes. These are stored as journal pages in the module's compendium packs. GMs can also create custom lists. See [Creating New Spell Lists](Creating-New-Spell-Lists) for details.

### How do I add homebrew spells to a list?

Use the [Spell List Manager](SpellListManager-Interface-Overview) to add spells to existing lists, or create a new custom list. See [Modifying Existing Spell Lists](Modifying-Existing-Spell-Lists) for step-by-step instructions.

### Why is a spell missing from a class list?

The spell may not be in the module's bundled list, or it may come from a third-party compendium that needs to be added manually. Run the **Spells Not In Lists** macro to identify spells missing from all lists, then add them via the Spell List Manager.

---

## Wizard Features

### How do free spells work?

Wizards receive free spells when leveling up (the exact number is configurable by the GM). The footer tracks how many free spells remain. Once free spells are used, learning additional spells costs gold.

### Can Wizards learn spells from scrolls?

Yes. When a Wizard learns a spell that exists as a scroll item, the gold cost is applied based on the spell's level. The GM configures the gold cost formula in module settings.

---

## Troubleshooting

### My spells aren't showing up

1. Check that your character has the correct spellcasting class(es) configured on their sheet
2. Verify spell lists exist for your class — ask your GM to check the Spell List Manager
3. If spells were recently added to a compendium, try reloading Foundry

### Something broke after an update

1. Reload Foundry (`F5` or **Settings > Return to Setup**)
2. Clear your browser cache
3. If the issue persists, generate a [Troubleshooter](SpellBook-Troubleshooter) report and share it on [Discord](https://discord.gg/PzzUwU9gdz) or [GitHub Issues](https://github.com/Sayshal/spell-book/issues)

### How do I report a bug?

1. Open the [Troubleshooter](SpellBook-Troubleshooter) and export a report
2. Open a new issue on [GitHub](https://github.com/Sayshal/spell-book/issues) or post in the [Discord](https://discord.gg/PzzUwU9gdz) support channel
3. Attach the Troubleshooter report and describe the steps to reproduce the issue

---

## Data and Storage

### Where is Spell Book data stored?

Spell lists are stored as journal pages in Spell Book's compendium packs. Per-actor data (preparation state, wizard spellbook, notes) is stored as module flags on each actor document.

### Can I back up my spell configurations?

Yes. Use the **Loadout** feature to save and restore named spell preparation configurations. Loadouts are stored per-actor and can be swapped instantly.

### What happens if I uninstall Spell Book?

Module flags remain on actor documents but are inert — they won't affect gameplay. Custom spell lists in the module's compendium packs will be removed with the module. If you plan to reinstall later, your per-actor data will still be there.
