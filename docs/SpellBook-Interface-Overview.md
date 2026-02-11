# SpellBook Interface Overview

The main player interface for viewing, managing, and interacting with spells. Supports multiclass characters, advanced filtering, spell comparison, and personalized spell management.

---

## Multiclass Tab System

The Spell Book uses a dynamic tab system for each spellcasting class a character has.

- A separate tab is generated for each spellcasting class
- Tabs appear automatically based on the character's class data
- Multiclass characters switch between class tabs without leaving the interface
- Each tab displays spells available to prepare and learn for that class
- Tabs are color-coded with matching preparation pills for readability

---

## Filtering System

### Available Filters

- Spell level
- Spell school
- Casting time
- Damage type
- Ritual spells
- Prepared status

Filters can be combined to narrow results dynamically.

### Filter Configuration

Players can customize the filter interface via the **Configure Display** menu (paint palette icon):

- Show, hide, or rearrange filters
- Remove unused filters to reduce clutter
- Configuration is saved per user

---

## Footer

The Spell Book footer displays:

- **Prepared Spell Count** — How many spells you have prepared per class out of your total
- **Save** — Saves all spell preparation changes
- **Reset** — Resets recent changes (Shift+click clears all prepared spells)
- **Manage Loadouts** — Opens the menu to create, equip, modify, and delete spell loadouts (right-click for quick selection)
- **Party Manager** — Opens the [Party Spells Interface](PartySpells-Interface-Overview)

---

## Advanced Search

The search bar supports:

- Partial name matching
- Combined search and filter usage

The prefix character for advanced search mode is configurable in client settings (default: `^`).

---

## Scroll Scanner

The Scroll Scanner detects spell scrolls in a character's inventory.

- Scrolls are categorized by spell level and class compatibility
- Detected scrolls can be consumed to learn new spells through the Wizard Spell Learning tab

Players can review available scrolls, identify learnable spells, and track scroll inventory directly from the Spell Book.

### Wizard Integration

Wizard characters have an additional tab alongside multiclass tabs for learning spells.

Within the Spell Learning tab, wizards can:

- View all spells available through their assigned spell lists
- Learn new spells directly from those lists
- Pay the appropriate learning cost when acquiring a spell

Learning costs and enforcement behavior are determined by GM settings and may include gold costs, GM approval prompts, or GM notifications.

When spell scrolls are detected in a wizard's inventory:

- Eligible scrolls appear in the Spell Learning tab
- Incompatible, duplicate, or already-known spells are visually flagged
- Scrolls can be consumed to learn spells directly from this interface

Scroll consumption behavior (automatic vs. approval-based) is controlled by GM settings.

---

## Dialogs

### Spell Comparison

Compare multiple spells side by side. Key information displayed includes damage type, casting level, and spell school. Useful when choosing prepared spells or evaluating similar options.

### Spell Details Customization

Control how spell information is displayed. Show or hide specific spell details and customize visible fields. Changes affect only the player's interface and do not modify spell data.

### Spell Loadouts

Save and swap prepared spell configurations:

- Save commonly used spell setups
- Quickly swap between loadouts
- Useful for prepared casters or situational encounters

### Spell Notes

Add personal annotations to spells. Notes are private to the player and persist across sessions.

### Settings Dialog (Wand Menu)

The Wand Menu opens character-specific Spell Book settings. From this dialog, the GM can:

- Force-enable wizard spell learning for any character
- Set rules on when spells can be swapped
- Adjust ritual casting rules
- Set custom spell lists
- Adjust player preparation bonuses

These settings are per-character.

---

## Opening SpellBook

The Spell Book can be opened via:

- The book icon on the spell page of a character sheet
- A [Macro](Macros) from the hotbar

> [!TIP]
> Spell Book is fully compatible with Tidy5e.
