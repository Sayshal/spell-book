# Player Quick Start

This guide helps players get started with the Spell Book module quickly and efficiently.

## Before You Begin

### Clean Up Your Spell List

For the best experience, **delete all spells from your character sheet that aren't granted by your class, subclass, or items** before opening Spell Book for the first time.

The module will automatically detect and organize spells that belong to your character, but starting with a clean slate prevents any confusion about which spells should be available.

## Opening Your Spell Book

You can open your Spell Book through:

- The **Spell Book button** on your character sheet
- A **macro** from your hotbar
- Token controls (if configured by your GM)

## Basic Spell Preparation

### Understanding the Interface

When you open your Spell Book, you'll see:

- **Class tabs** on the right side showing each of your spellcasting classes
- **Spell levels** organized from cantrips through 9th level
- **Checkboxes** next to each spell for preparation
- **Footer information** showing your preparation limits and current count

![Main interface showing a single-class character](https://raw.githubusercontent.com/Sayshal/spell-book/main/github_media/01_SINGLECLASSCHAR.png)

### Preparing Spells

1. **Select your class tab** — Each class prepares spells independently
2. **Check the boxes** next to spells you want to prepare
3. **Monitor the footer** — It shows your current prepared count vs. your limit
4. **Cantrips are separate** — They have their own selection rules and limits

### Understanding Spell Tags

Spells display various tags to indicate their status:

- **Prepared** — Currently prepared and ready to cast
- **Granted** — Automatically prepared by class feature or item
- **At Will** — Can be cast without using spell slots
- **Pact** — Uses pact magic slots (Warlock)
- **Ritual** — Can be cast as a ritual
- **Innate** — Innate spellcasting ability

### Checkbox States

- ☐ **Empty checkbox** — Spell not prepared, click to prepare
- ☑ **Checked checkbox** — Spell prepared, click to unprepare
- **Disabled checkbox** — Spell always prepared (granted by class/item). Shown as a disabled checkbox with a tooltip explaining why it cannot be changed

## Reading the Footer

The footer provides crucial information about your spell preparation:

- **Preparation Count**: Shows "X / Y Prepared" for each class
- **Cantrip Count**: Displays separately from leveled spells
- **Class-Specific Limits**: Each class shows its own preparation limit
- **Real-Time Updates**: Numbers update as you check/uncheck spells

## Multiclass Characters

If you have multiple spellcasting classes, Spell Book makes management simple:

![Multiclass character with multiple class tabs](https://raw.githubusercontent.com/Sayshal/spell-book/main/github_media/03_MULTICLASS.png)

- **Separate tabs** for each spellcasting class (shown with class icons)
- **Independent preparation** — Each class maintains its own prepared spells
- **Shared spell slots** — The system automatically calculates multiclass slots
- **Clear organization** — Never mix up which spells belong to which class

### Tab Navigation

- Click the **class icon** on the right to switch between classes
- Each tab maintains its own filter and preparation state
- The active tab is highlighted for clarity

## Wizard Spellbook Management

Wizards have a special **Spellbook tab** for managing their learned spells:

![Wizard spellbook tab](https://raw.githubusercontent.com/Sayshal/spell-book/main/github_media/02_WIZARDBOOK.png)

### Learning New Spells

1. **Navigate to your Spellbook tab** (look for the Spell Book icon)
2. **Find spells to learn** — They'll have a "Learn Spell" button
3. **Check the footer** — It shows how many spells you know and if you have free spells remaining
4. **Learn the spell** — Click the button and confirm the cost (if any)
5. **Already Learned** — Once learned, spells show this tag instead of the button

### Free Spells vs. Purchased Spells

- **Free Spells**: Gained when you level up (configurable by your GM)
- **Purchased Spells**: Copied from scrolls or other sources for gold
- The footer tracks how many free spells you have remaining

## Filter and Search

### Quick Filtering

Use the sidebar filters to quickly find spells:

![Filter panel with school, level, and source options](https://raw.githubusercontent.com/Sayshal/spell-book/main/github_media/06_FILTERS.png)

- **School**: Filter by spell school (Evocation, Illusion, etc.)
- **Level**: Show only specific spell levels
- **Source**: Filter by spell source (PHB, XGE, etc.)
- **Prepared**: Show only prepared or unprepared spells
- **Ritual**: Find ritual spells quickly

### Search Function

- Type in the **search box** to find spells by name
- Use **advanced search** by typing the prefix character (default: `^`) followed by field-based queries (e.g., `^level:1 AND school:evocation`). See [SpellBook Interface Overview](SpellBook-Interface-Overview) for full syntax details
- Search works across all spell properties

## Favorites

Mark frequently used spells as favorites for quick access. Toggle a spell's favorite status from the context menu. Use the **Favorited** filter to show only your favorites. Favorites sync with your character's system favorites.

## Resetting the Interface

- **Click Reset** — Clears active filters and collapsed spell levels
- **Shift+Click Reset** — Full reset: clears prepared spells, filters, favorites, and collapsed levels

## Quick Actions

### Right-Click Context Menu

Right-click any spell to access quick actions:

- View spell details
- Add to favorites
- Add personal notes
- Compare with other spells

### Spell Comparison

1. **Select multiple spells** using Ctrl+Click or the compare button
2. **Click Compare** to see them side-by-side
3. **Analyze differences** in range, damage, components, etc.

## Settings and Customization

Access your personal settings through the **wand icon** in the Spell Book:

![Spell settings dialog](https://raw.githubusercontent.com/Sayshal/spell-book/main/github_media/04_SPELLSETTINGS.png)

Key settings to review:

- **UI Customization** — Choose what spell information to display
- **Filter Configuration** — Show/hide specific filters

## Tips for Success

### First Time Setup

1. Open your Spell Book and select your primary class tab
2. Review available spells at each level
3. Prepare spells up to your limit (shown in footer)
4. Save your preparation as a loadout for quick swapping

### Daily Preparation

1. After a long rest, review your prepared spells
2. Swap spells based on your anticipated needs
3. Check if you gained new spells or spell slots
4. Save different loadouts for different scenarios

### Using Loadouts

Save time with spell loadouts:

1. Prepare spells for a specific situation
2. Click the **loadout button** and save with a descriptive name
3. Load saved configurations instantly when needed

## Next Steps

- Review [Spell Preparation System](Spell-Preparation-System) for detailed preparation rules
- Check [SpellBook Interface Overview](SpellBook-Interface-Overview) for advanced features
- Multiclass players should read [Multiclass Spellcasting](Multiclass-Spellcasting)
- Wizards should review [Wizard Spellbook Management](Wizard-Spellbook-Management)
