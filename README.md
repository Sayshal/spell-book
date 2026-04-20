# Spell Book

Because preparing your spells shouldn't feel like an IRS audit.

![Player Spell Book hero view](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/psb-hero.png)

![GitHub release](https://img.shields.io/github/v/release/Sayshal/spell-book?style=for-the-badge)
![GitHub Downloads (specific asset, all releases)](<https://img.shields.io/github/downloads/Sayshal/spell-book/module.zip?style=for-the-badge&logo=foundryvirtualtabletop&logoColor=white&logoSize=auto&label=Downloads%20(Total)&color=ff144f>)

![Foundry Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fspell-book%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![D&D5E Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fsystem%3FnameType%3Dfoundry%26showVersion%3D1%26style%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fspell-book%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
[![Discord](https://dcbadge.limes.pink/api/server/PzzUwU9gdz)](https://discord.gg/PzzUwU9gdz)

**[Read the Wiki](https://github.com/Sayshal/spell-book/wiki)** for the full walkthrough.

---

## What You Get

**Player Spell Book.** A separate window for managing a character's spellcasting, opened from a button the module adds to the dnd5e sheet's Spells tab. One tab per spellcasting class, plus a Learn tab for wizard-enabled classes. Preparation checkboxes, filters, favorites, personal notes, comparison, loadouts, party-mode indicators. Draggable detachable into its own browser window, supports 2014 and 2024 rules.

![Spell List Manager hero view](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/slm-hero.png)

**Spell List Manager.** GM tool for authoring class spell lists. Create new lists, merge existing ones, or edit any stock list from a locked pack. Edits to locked packs auto-clone into your world on save and hide the original. Split-panel view with drag-and-drop between Available Spells and the current list, bulk-select mode for large edits, and a per-list registry toggle that surfaces the list's spells in class labels across Foundry.

**Filters.** Substring search on name. Level and range as min/max inputs. Dropdowns for school, casting time, target, damage type, condition, save, and source. A five-checkbox Properties group (Verbal, Somatic, Material, Concentration, Ritual) with tri-state click cycling: include, exclude, or ignore. Flat toggles for Costly Material Components, Prepared Only, and Favorites Only. Shift-clicking the reset button also unchecks every prepared spell on every tab.

**Wizard Spellbook.** Per-class journal-backed spellbook for wizards and wizard-enabled classes. Gold and time copying (50 gp and 2 hours per spell level by default). Scroll learning with optional scroll consumption. Free spells on character creation (6 by default) and on level-up (2 per level). Ritual casting modes: none, prepared, or always-from-book (the last auto-injects ritual-mode items on save). Unlearn support.

![Wizard Learn tab](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/psb-wizard-learn.png)

**Spell Loadouts.** Per-class named preparation sets. Capture whatever's currently checked (no need to save first). Apply from the dialog, or right-click the Loadouts sidebar button for a quick-apply context menu. Hovering a loadout shows every spell in it, sorted by level, with inline icons.

![Spell Loadouts dialog](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/loadout-selector.png)

**Spell Comparison.** Side-by-side table for any number of spells. Columns: level, school, casting time, range, duration, components, damage. The damage cell highlights whichever spell rolls the most dice.

**Party Coordination.** Every party caster's prepared set on one screen. Per-level spell chips with actor tags, click a member card to filter to that caster, and a Synergy Analysis panel that flags low ritual count, damage-type overlap, duplicated prep, and save diversity.

![Party Spell Coordination](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/party-coordinator.png)

![Synergy Analysis](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/synergy-analysis.png)

**Details Customization.** Turn specific metadata pieces on and off per spell row: level, components, school, casting time, range, damage type, condition, save, concentration, material components. Player and GM configurations are independent. Changes apply to open windows live.

![Details Customization dialog](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/details-customization.png)

---

## Also Included

- **Spell Notes.** Per-user personal annotations on any spell. Optional injection into the dnd5e sheet's spell description (before or after).
- **Subclass Spell Lists.** Pick the Life Domain or Oath of Devotion list directly instead of relying on dnd5e's registry to auto-merge.
- **Swap Timing.** Per-class cantrip and spell swapping: level-up, long-rest, or never. Long-rest completion prompts when the window opens.
- **GM Notifications.** Optional chat message when a player prepares past their class limit. World toggle with per-actor override.
- **Troubleshooter.** GM diagnostic that generates a JSON report to paste into a GitHub issue or Discord.
- **Light and dark themes.** Light uses the dnd5e parchment texture with copper accents.

---

## For the Tinkerers

Public API at `SPELLBOOK.api` (also at `game.modules.get('spell-book').api`):

```javascript
// Launch the Spell Book for the current actor
SPELLBOOK.api.spellBookQuickAccess();

// Find spells not covered by any class list
await SPELLBOOK.api.spellsNotInLists();

// Scroll scan for a wizard
const scrolls = await SPELLBOOK.api.scrollScanner(actor);

// Dump everything about a spell (pack, source book, filter data)
SPELLBOOK.api.debugSpell('Revivify');
```

Hooks: `spellBookOpened { actor, app }`, `spellBookClosed { actor }`.

---

## Installation

Find **Spell Book** in Foundry's Module Browser, or paste this manifest URL:

```
https://github.com/Sayshal/spell-book/releases/latest/download/module.json
```

Compatible with Foundry v14+ and dnd5e 5.3+.

Questions? Ideas? Ping us on [Discord](https://discord.gg/PzzUwU9gdz) or check the [Wiki](https://github.com/Sayshal/spell-book/wiki).
