# Creating New Spell Lists

Custom spell lists allow GMs to define exactly which spells are available to characters in a campaign. They are commonly used to represent class spell lists, subclass expansions, setting-specific restrictions, or homebrew spell access.

This page covers how to create, configure, and integrate custom spell lists using the Spell List Manager.

> For a detailed breakdown of the Spell List Manager interface, see [Spell List Manager - Interface Overview](SpellListManager-Interface-Overview)

## Custom Spell List Creation

### Getting Started
Pefore creating a custom spell list, ensure the following:
- You are logged in as a GM or GM Assistant
- GM Setup Mode is enabled (recommended during configuration)
- Your spell compendiums are properly configured

You should create a custom spell list when:
- You want to modify or restrict spell availability
- You are supporting homebrew classes or subclasses
- You want to avoid altering system-provided spell lists

#### Initializing a New Spell List
1. Open the Spell List Manager from the Compendium tab.
2. In the Spell List Navigation sidebar, click Create.
3. Enter a name for the new spell list.
4. Select the newly created list from the sidebar.
5. Click Edit to begin building the list.

The new list will appear under Custom Spell Lists and is fully editable.

#### Clear naming conventions make long-term management much easier. Recommended patterns include:
- Class-based lists: `Wizard – Core`, `Cleric – Divine`
- Subclass extensions: `Wizard – Bladesinger`, `Cleric – Twilight Domain`
- Setting or theme-based lists: `Low Magic – Restricted`, `Underdark Spell List`
- Iteration or versioning: `Wizard – Core (Homebrew v2)`

### Class Identifier Reference

Class identifiers are used by Spell Book to determine which spell lists apply to a character. These identifiers correspond to the system’s internal class or subclass IDs.

#### Custom spell lists are commonly designed for:
- A single class
- A specific subclass
- A thematic expansion shared by multiple classes

#### Best practice is to keep spell lists modular: 
- One core class list
- Separate subclass or feature-based lists
- Optional setting or narrative lists

This approach allows multiple lists to be assigned to a character without duplication.

#### For multiclass characters:
- Assign all relevant spell lists to the character
- Overlapping spells are handled automatically
- Spell availability is determined by the union of assigned lists

Recommended approach:
Create smaller, focused lists rather than large monolithic ones. This provides flexibility and minimizes maintenance.

### Building Your List

#### Making A New List
1. In Spell List Manager press the plus (+) icon in the upper left
2. In the new dialogue window:
    - Insert a name for the list
    - Select the Class intended to use this list
    - If its a subclass list select the check box to mark it
3. Press the **Create New List** button
Your new spell list will automatically become the currently selected list when created.

#### Adding Spells to Custom Lists
- With your custom spell list selected and Edit Mode enabled:
- Use the right-hand panel to browse and filter spells from your configured compendiums
- Add spells individually by clicking the plus (+) icon
- Use Selection Mode to add multiple spells at once
- This workflow is especially useful when building full class spell lists.

#### Setting Access Permissions

Spell lists determine:
- Which spells are visible to a character
- Which spells can be learned or prepared

Access enforcement depends on your campaign’s settings:
- Notify-only enforcement for narrative flexibility
- GM approval workflows for tighter control

These behaviors are configured globally in Spell Book Settings.

## Advanced Features

### Merged spell lists functionality
Merged spell lists allow you to combine multiple existing lists into a single custom list.

Use merging when:
- Creating a subclass that builds on a base class
- Combining system lists with homebrew additions

To merge spell lists:
1. Click Merge in the Spell List Navigation header
2. Select two or more source spell lists
3. Provide a name for the new merged list

The resulting list is fully editable and independent of its sources.

### Source list management
Custom spell lists do not automatically update when source lists change.

Best practices:
- Revisit custom lists after system or module updates
- Avoid relying on system list changes for balance
- Treat custom lists as authoritative once created

This prevents unexpected changes to player spell access.

### Custom spell list validation
Before starting play, review custom spell lists for common issues:
- Missing compendium references
- Deprecated or removed spells
- Duplicate or unintended spell entries

A quick validation pass before Session 1 helps avoid player-facing issues during play.

## Integration

### Connecting Custom Lists to Characters

To use a custom spell list:
1. Open a character sheet
2. Access the character’s Spell Book via the Book icon on their spell page
3. Access the settings for that character using the Wand icon
4. Assign one or more custom spell lists
5. Review the character’s available spells

Characters can have multiple spell lists assigned simultaneously

#### Player Access and Visibility

Spell lists control:
- Which spells appear in a player’s spell book
- Which spells can be learned, prepared, or cast

Visibility does not always imply permission. Depending on settings:
- Players may see spells they cannot yet learn
- GM approval may be required for learning new spells
 
#### GM Approval Workflows

Spell Book supports several GM oversight styles:

- Automatic approval (rules-light campaigns)
- Notify-only review
- Explicit approval prompts

Common use cases include:
- Learning spells from scrolls
- Gaining spells during downtime
- Unlocking new subclass spells

Choose an approach that fits your table’s pacing and tone.


#### Best Practices

- Use custom lists for balance, flavor, and homebrew
- Favor modular spell lists over large, single lists
- Clearly name lists to reflect purpose and scope
- Disable GM Setup Mode during sessions