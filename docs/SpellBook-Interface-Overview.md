:loudspeaker: NOTE: Under construction - may be incomplete! :loudspeaker:

# SpellBook Interface Overview
The Spell Book interface is the primary tool players use to view, manage, and interact with their character’s spells. It is designed to support multiclass characters, advanced filtering, spell comparison, and personalized spell management.

This page provides an overview of the Spell Book interface components and how they are used during play.

## Interface Components

### Multiclass Tab System and UI Overview

The Spell Book uses a dynamic tab system to represent each spellcasting class a character possesses.
- A separate tab is generated for each spellcasting class
- Tabs appear automatically based on the character’s class data
- Multiclass characters can switch between class tabs without leaving the Spell Book

Each class tab displays, the spells available to prepare and learn for that class.

To improve readability:
- Each class tab is color-coded
- Visual pills, that are color coded, indicate prepared spells


### Filtering System and Filter Configuration
The Spell Book includes a powerful filtering system to help manage large spell lists.

### Available Filters
Some Common filters include:
- Spell level
- Spell school
- Casting time
- Damage type
- Ritual spells
- Prepared status

Filters can be combined to narrow results dynamically.

### Filter Configuration
Players can customize the filter interface to match their play style. Using the Configure display menu under the Paint Pallet icon.
- Filters can be hidden, shown, or rearranged
- Unused filters can be removed to reduce clutter
- Configuration changes are saved per user

This customization allows the Spell Book to scale from simple to advanced usage.

### Footer Icons
The footer of the Spell Book interface holds some important information.
- Prepared Spell Count - Shows how many spells you have prepared, seperated by class, out of your total amount of spells to prepare.
- Save 💾 - Saves all spell preperation changes
- Reset ⟲ - Resets recent changes. (Shift + clicking this icon will clear all prepared spells)
- Analytics 📊 - Opens your statistics page for spell casting
- Manage Load Outs 🧰 - Opens the menu to create, equip, modify, and delete spell load outs (Right clicking offers a quick selection of created loadouts)
- Party Manager 👥- Opens party spell interface. Learn more about that window here: [Party Spells Interface Overview](PartySpells-Interface-Overview)

### Advanced Search Functionality and Complex Queries

The search bar supports:
- Partial name matching
- Combined search and filter usage

Advanced search makes it easy to locate specific spells, even in very large spell books.

### Scroll Scanner
The Scroll Scanner automatically detects spell scrolls in a character’s inventory.

Detected scrolls are listed within the Spell Book
- Scrolls are categorized by spell level and class compatibility
- Detected scrolls can be consumed to learn new spells through the Wizard Spell Learning tab


### Managing Detected Spell Scrolls
Players can:
- Review available scrolls
- Identify which spells can be learned
- Track scrolls available to use directly from the Spell Book

### Integration with Wizard Spell Learning
Wizard characters have an additional UI tab alongside the multiclassing tabs on the right side, where they can learn spells.

Within the Spell Learning tab, wizards can:
- View all spells available to them through their assigned spell lists
- Learn new spells directly from those lists
- Pay the appropriate learning cost when acquiring a spell

Learning costs and enforcement behavior are determined by GM Spell Book settings and may include:
- Gold or resource costs
- GM approval prompts
- Notifications to the GM
Once learned, spells are automatically added to the wizard’s spell book and become available for preparation and casting.

The Spell Learning tab also integrates with the **Scroll Scanner**.

When spell scrolls are detected in a wizard’s inventory:
- Eligible scrolls appear in the Spell Learning tab
- Incompatible, duplicate, or already-known spells are visually flagged
- Scrolls can be consumed to learn spells directly from this interface

Scroll consumption behavior (automatic vs approval-based) is controlled by GM settings.


## Dialog Systems
The Spell Book includes several dialogs that support detailed spell interaction and customization.
#### Spell Comparison Dialog
The Spell Comparison dialog allows players to compare multiple spells side by side.

Features include:
- Simultaneous comparison of multiple spells
- Key information such as damage type, casting level, and school

This dialog is useful when choosing prepared spells or evaluating similar options.


#### Spell Details Customization Dialog

The Spell Details Customization dialog allows players to control how spell information is displayed.

Players can:
- Show or hide specific spell details
- Customize visible fields for clarity
- Manage personal display preferences

These changes affect only the player’s interface and do not modify spell data.

#### Spell Loadout Dialog

The Spell Loadout dialog provides quick management of prepared or equipped spells.
- Save commonly used spell configurations
- Quickly swap between loadouts
- Ideal for prepared casters or situational encounters

Loadouts help reduce repetitive preparation between sessions.

- Saving and loading spell setups

#### Spell Notes Dialog

The Spell Notes dialog allows players to add personal annotations to spells.

Use cases include:
- Tactical reminders
- Roleplay flavor
- Tracking house rules or interpretations

Notes are private to the player and persist across sessions.

#### Settings Dialog (Wand Menu) Overview

The Wand Menu opens the player-specific Spell Book settings.

From this dialog, the DM can:

- Force allow wizard spell learning for any character
- Set rules on when spells can be swapped
- Adjust rules on ritual casting
- Set Custom Spell Lists
- Adjust Player Preperation Bonuses

These settings are character specific.

## Opening SpellBook
The Spell Book can be opened in two ways:
- The book icon on the spell page of a character sheet
- Via a [Macros](Macros)

> Spell Book is fully compatible with Tidy5e