# Player Quick Start

A minimal walkthrough for using Spell Book as a player. For a full tour of the interface, see [SpellBook Interface Overview](SpellBook-Interface-Overview).

## Opening the Spell Book

![Player Spell Book in dark theme](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/psb-hero.png)

Open your character sheet and click the **Spell Book** button. The button appears on the default dnd5e sheet and on Tidy5e if you have it installed. The window that opens is your personal spell book. You can drag it around by its header.

If you want it out of the way, click the **detach** button (arrow pointing up-right) in the header to pop it into its own browser window. Click attach to bring it back.

## Nothing in a Class Tab?

If a class tab shows **"No spell list assigned"** with a button:

1. Click the button. This opens [Class Rules](Class-Rules) scrolled to that class.
2. Find the **Custom Spell List** dropdown for the class.
3. Pick a spell list (for example, *Wizard* for a wizard).
4. Save.

The tab will populate the next time you view it.

## Preparing Spells

1. Pick a class tab.
2. Click the checkbox on each spell row you want prepared.
3. Click the **Save** button at the bottom of the sidebar.

Each class prepares independently. The footer shows `X/Y Spells` and `X/Y Cantrips` for the active class. When you hit the max, the counter turns green to mean "at capacity".

Exceeding the class max does **not** block saving. If the GM has enabled `Notify GM on Spell Changes`, they will receive a notification. See [Spell Preparation System](Spell-Preparation-System) for the full story.

Pending checkbox changes are remembered across tab switches — you can tweak spells on multiple class tabs, then Save once at the end.

## Spell Row Icons

Each spell row may show:

- **Checkbox** — prepare/unprepare.
- **Star** — toggle favorite (per actor, per user).
- **Sticky note** — open [Spell Notes](Spell-Notes) to add personal notes. Notes can be injected into the spell's description.
- **Balance scale** — add to comparison. Shown when enabled in [Details Customization](Details-Customization). Any number of spells can be compared side by side; the dialog widens as you add more.

Spells granted by class features, items, or always-prepared effects show a disabled checkbox with a tooltip explaining the source.

## Filtering

The sidebar offers:

- **Name** search box (substring, case-insensitive).
- **Spell Level** — min/max number inputs.
- **School, Casting Time, Target, Damage Type, Condition, Save, Source** — dropdowns.
- **Range** — min/max number inputs (unit auto-matches your world setting).
- **Properties** — five tri-state toggles (Verbal, Somatic, Material, Concentration, Ritual). Click to cycle `ignore → include → exclude`; right-click to cycle backwards. Exclude turns the indicator red with an × icon.
- **Costly Material Components** — checkbox; hides spells that don't consume valuable materials.
- **Prepared Only** — show only currently-prepared spells.
- **Favorites Only** — show only starred spells.

### Reset Button

The circular-arrow **Reset** button (sidebar footer, between the action row and Save) clears all filters. **Shift-click** also unchecks every preparation checkbox across every class tab — useful for starting a full re-prep from scratch. The unchecks are staged until you press Save, so you can Shift-click, re-prepare, then Save.

## Loadouts

Save and reload prepared-spell sets per class. Click the **Loadouts** sidebar button (toolbox icon) to open [Spell Loadouts](Spell-Loadouts). Useful for swapping between combat and utility preparations.

**Tip:** right-click the Loadouts button to pop up a quick-select menu of saved loadouts for the active class — click one to apply it immediately.

## Wizard Learn Tab

Wizards (and classes with **Force Wizard Mode** enabled in [Class Rules](Class-Rules)) get an extra **Spellbook** tab per wizard class. Use it to learn spells into your spellbook. See [Wizard Spellbook Management](Wizard-Spellbook-Management) for copying costs, free-at-levelup spells, and learning from scrolls.

![Wizard Learn tab with learnable, scroll-learnable, and in-spellbook rows](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/psb-wizard-learn.png)

## Long Rest Swap Prompt

If your class has a swap mode configured in [Class Rules](Class-Rules), completing a long rest can prompt you to swap cantrips or spells. Disable globally with the `DISABLE_LONG_REST_SWAP_PROMPT` setting.

## Party Mode

If your actor is part of a party group (set by the GM), the sidebar shows a **Party Manager** button:

- Left-click opens the [Party Spell Coordinator](PartySpells-Interface-Overview).
- Right-click toggles party-mode display on your actor. When on, each spell row shows tiny avatar icons for other party members who have the spell prepared.

## Next Steps

- [SpellBook Interface Overview](SpellBook-Interface-Overview)
- [Spell Preparation System](Spell-Preparation-System)
- [Multiclass Spellcasting](Multiclass-Spellcasting)
- [Wizard Spellbook Management](Wizard-Spellbook-Management)
- [Class Rules](Class-Rules)
- [Details Customization](Details-Customization)
