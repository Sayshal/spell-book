# Spell Book

Because preparing your spells shouldn't feel like an IRS audit.

![Player Spell Book hero view](https://wiki.3deathsaves.com/spell-book/psb-hero.png)

![GitHub release](https://img.shields.io/github/v/release/Sayshal/spell-book?style=for-the-badge)
![GitHub Downloads (specific asset, all releases)](<https://img.shields.io/github/downloads/Sayshal/spell-book/module.zip?style=for-the-badge&logo=foundryvirtualtabletop&logoColor=white&logoSize=auto&label=Downloads%20(Total)&color=ff144f>)

![Foundry Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fspell-book%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![D&D5E Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fsystem%3FnameType%3Dfoundry%26showVersion%3D1%26style%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fspell-book%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
[![Discord](https://dcbadge.limes.pink/api/server/PzzUwU9gdz)](https://discord.gg/PzzUwU9gdz)

**[Read the Wiki](https://wiki.3deathsaves.com/spell-book/)** for the full walkthrough.

---

## What You Get

**Player Spell Book:** A separate window for managing a character's spellcasting, opened from a button the module adds to the dnd5e sheet's Spells tab. One tab per spellcasting class, plus a Learn tab for wizard-enabled classes. Preparation checkboxes, filters, favorites, personal notes, comparison, loadouts, party-mode indicators. Draggable detachable into its own browser window, supports 2014 and 2024 rules.

![Spell List Manager hero view](https://wiki.3deathsaves.com/spell-book/slm-hero.png)

**Spell List Manager:** GM tool for authoring class spell lists. Create new lists, merge existing ones, or edit any stock list from a locked pack. Editing a stock list clones it into the module's own Custom Spell Lists pack and hides the original; the branch is on the module's own flags, not the source pack's lock state. Split-panel view with drag-and-drop between Available Spells and the current list, bulk-select mode for large edits, and a per-list registry toggle that surfaces the list's spells in class labels across Foundry.

**Filters:** Substring search on name. Level and range as min/max inputs. Dropdowns for school, casting time, target, damage type, condition, save, and source. A Properties group of five buttons (Verbal, Somatic, Material, Concentration, Ritual), each cycling include, exclude, or ignore. Flat toggles for Costly Material Components, Prepared Only, Favorites Only, and Affordable Only. Shift-clicking the reset button also unchecks every prepared spell on every tab.

**Wizard Spell Book:** Per-class journal-backed spellbook for wizards and wizard-enabled classes. Gold and time copying, scaled per spell level. Scroll learning with optional scroll consumption. Free spells on character creation and on level-up. Ritual casting modes: none, prepared, or always-from-book (the last auto-injects ritual-mode items on save). Unlearn support.

![Wizard Learn tab](https://wiki.3deathsaves.com/spell-book/psb-wizard-learn.png)

**Spell Loadouts:** Per-class named preparation sets. Capture whatever's currently checked (no need to save first). Apply from the dialog, or right-click the Loadouts sidebar button for a quick-apply context menu. Hovering a loadout shows every spell in it, sorted by level, with inline icons.

![Spell Loadouts dialog](https://wiki.3deathsaves.com/spell-book/loadout-selector.png)

**Spell Comparison:** Side-by-side table for any number of spells. Columns: level, school, casting time, range, duration, components, damage. The damage cell highlights whichever spell rolls the most dice.

**Party Coordination:** Every party caster's spells on one screen, prepared and known alike. Per-level spell chips with actor tags, click a member card to filter to that caster, and a Synergy Analysis panel that flags low ritual count, damage-type overlap, duplicated prep, and save diversity.

![Party Spell Coordination](https://wiki.3deathsaves.com/spell-book/party-coordinator.png)

![Synergy Analysis](https://wiki.3deathsaves.com/spell-book/synergy-analysis.png)

**Details Customization:** Turn specific metadata pieces on and off per spell row: level, components, school, casting time, range, damage type, condition, save, concentration, material components. Player and GM configurations are independent. Changes apply to open windows live.

![Details Customization dialog](https://wiki.3deathsaves.com/spell-book/details-customization.png)

---

## Also Included

- **Spell Notes:** Per-user personal annotations on any spell. Optional injection into the dnd5e sheet's spell description (before or after).
- **Subclass Spell Lists:** Pick the Life Domain or Oath of Devotion list directly instead of relying on dnd5e's registry to auto-merge.
- **Swap Timing:** Per-class cantrip and spell swapping: level-up, long-rest, or never. The long-rest swap prompt fires on rest completion, not when the window opens.
- **GM Notifications:** Optional chat message when a player adds or removes any prepared spell, flagging over-limit changes. World toggle with per-actor override.
- **Troubleshooter:** GM diagnostic that generates a JSON report to paste into a GitHub issue or Discord.
- **Light and dark themes:** Light uses the dnd5e parchment texture with copper accents.
- **Macro pack:** Five ready-made macros ship in the module's compendium — quick access, slot tracker, scroll scanner, spells-not-in-lists, and flag purge.
- **Spellcasting list notice:** Whispers the GM and the actor's owners when a spellcasting class resolves to no spell list.
- **Sheet buttons:** Spell Book is added to the character sheet's spells tab, and Party Coordination to group sheets. Tidy5e sheets are supported where active.

---

## For the Tinkerers

Public API at `SPELLBOOK.api` (also at `game.modules.get('spell-book').api`):

```javascript
SPELLBOOK.api.spellBookQuickAccess();
await SPELLBOOK.api.spellsNotInLists();
await SPELLBOOK.api.scrollScanner();
SPELLBOOK.api.debugSpell('Revivify');
```

Hooks, all namespaced with the module id:

| Hook                          | Payload                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| `spell-book.spellBookOpened`  | `{ actor, app }`                                                          |
| `spell-book.spellBookClosed`  | `{ actor }`                                                               |
| `spell-book.preLearnSpell`    | `{ actor, classId, spellUuid, source, costs }` - return `false` to cancel |
| `spell-book.spellLearned`     | `{ actor, classId, spellUuid, source, name, school, level }`              |
| `spell-book.spellCopied`      | `{ actorName, spellName, minutes }`                                       |
| `spell-book.preparationSaved` | `{ actor, classIdentifier, changes }`                                     |
| `spell-book.loadoutApplied`   | `{ actor, classIdentifier, spellUuids, loadoutId, loadoutName }`          |

---

## Installation

Find **Spell Book** in Foundry's Module Browser, or paste this manifest URL:

```
https://github.com/Sayshal/spell-book/releases/latest/download/module.json
```

Questions? Ideas? Ping us on [Discord](https://discord.gg/PzzUwU9gdz) or check the [Wiki](https://wiki.3deathsaves.com/spell-book/).
