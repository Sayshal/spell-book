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

- Name (text search)
- Spell level
- Spell school
- Casting time
- Range
- Damage type
- Condition
- Requires save
- Concentration
- Material components
- Ritual
- Prepared status
- Favorited
- Prepared by party
- Source

Filters can be combined to narrow results dynamically.

### Filter Configuration

Players can customize the filter interface via the **Configure Display** menu (paint palette icon):

- Show, hide, or rearrange filters
- Remove unused filters to reduce clutter
- Configuration is saved per user

---

## Favorites

Toggle any spell as a favorite via the context menu or the favorite action. Favorites sync with `actor.system.favorites` and persist in journal storage. Use the **Favorited** filter to view only favorited spells.

---

## Sidebar

The sidebar can be collapsed to maximize spell list space. Collapse state is persisted per user via flags.

---

## Footer

The Spell Book footer displays:

- **Prepared Spell Count** — How many spells you have prepared per class out of your total
- **Save** — Saves all spell preparation changes
- **Reset** — Clears active filters and collapsed levels. **Shift+click** performs a full reset (prepared spells, filters, favorites, collapsed levels)
- **Manage Loadouts** — Opens the menu to create, equip, modify, and delete spell loadouts (right-click for quick selection)
- **Party Manager** — Opens the [Party Spells Interface](PartySpells-Interface-Overview)

---

## Advanced Search

The search bar supports partial name matching and combined search and filter usage.

### Field-Based Search

Type the prefix character (default: `^`) to enter advanced search mode. Field-based syntax allows targeted queries:

- `^level:1` — All 1st-level spells
- `^school:evocation` — All evocation spells
- `^level:1 AND school:evocation` — 1st-level evocation spells
- `^concentration:true` — All concentration spells
- `^ritual:true AND level:1` — 1st-level ritual spells

The prefix character is configurable in client settings.

### Cantrip Counter

Each spell level heading displays the count of prepared spells at that level. For cantrips, the counter also shows the class-specific cantrip limit when applicable.

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

Compare multiple spells side by side. Attributes compared include: UUID, name, image, level, school, casting time, range, duration, components, and damage formulas (with max dice calculations). Useful when choosing prepared spells or evaluating similar options.

### Spell Details Customization

Control how spell information is displayed. Show or hide specific spell details and customize visible fields. Changes affect only the player's interface and do not modify spell data.

### Spell Loadouts

Save and swap prepared spell configurations:

- Save commonly used spell setups with descriptive names
- Quickly swap between loadouts via the footer button
- Right-click the loadout button for quick selection context menu
- Loadouts can be class-specific
- Useful for prepared casters or situational encounters

### Spell Notes

Add personal annotations to spells:

- Notes are private to the player and persist across sessions
- Maximum length is configurable by the GM (default: 240 characters)
- Notes can optionally be injected into spell descriptions (before or after) via the Spell Notes Injection setting

### Settings Dialog (Wand Menu)

GM-only access — opens per-actor spell settings (enforcement, cantrip rules, spell lists, preparation bonuses, wizard mode, etc.). The wand icon is only visible to GMs.

From this dialog, the GM can:

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
