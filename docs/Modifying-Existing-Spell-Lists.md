# Modifying Existing Spell Lists

Modifying existing spell lists allows GMs to adjust spell availability without rebuilding lists from the ground up. This is useful for campaign-specific balance changes, narrative restrictions, subclass expansions, or system tweaks.

This page explains how to safely modify system, custom, and merged spell lists using the Spell List Manager.

> For a detailed breakdown of the Spell List Manager interface, see [Spell List Manager - Interface Overview](SpellListManager-Interface-Overview)

## Step-by-Step Spell List Editing

### Accessing Existing Lists
To begin modifying a spell list:

1. Open the Spell List Manager from the Compendium tab.
2. Locate the desired spell list in the Spell List Navigation sidebar.
3. Left-click the list to load it into the center panel.

Spell lists are grouped into three categories:
1. Player Spell Book - Lists tied directly to individual characters. These reflect learned spells rather than class availability and should generally not be edited directly.
2. Custom Spell Lists- Fully editable spell lists created by the GM. These are the safest and most common targets for modification.
3. Spell Lists - System-provided spell lists or lists added by modules. These may be read-only or intended as reference sources.

> Note: When modifying a system provided list, Spell Book will automatically make a custom copy for you to edit. Ensuing module updates don't reset your work.

### Making Modifications

Once a spell list is selected:
1. Click Edit in the center panel to enable editing.
2. Use the right-hand panel to browse and filter spells.

#### Adding Spells
- Click the plus (+) icon next to a spell to add it to the list.
- Enable Selection Mode to add multiple spells at once.
- Newly added spells appear immediately in the center panel.

#### Removing Spells
- Remove spells directly from the spell list in the center panel.
- Changes take effect immediately once edit mode is active.

Removing a spell from a spell list does not delete the spell from the system or player inventories; it only restricts availability through that list.

#### Bulk edit operations
Bulk editing is recommended when making large-scale changes.

Common workflows include:
- Adding all spells of a specific level
- Removing a group of spells based on school or theme
- Rebuilding a list after system updates

Use Selection Mode and filtering tools together to efficiently manage large spell sets.

### Advanced Modifications

#### Conditional Spell Additions
Some campaigns require spells to be conditionally available based on narrative, faction, or progression milestones.

Recommended approaches:
- Maintain multiple spell lists representing different conditions
- Assign or remove lists as conditions are met
- Avoid toggling individual spells mid-session

This keeps spell access predictable and auditable.

#### Class-Specific Modifications

When modifying a class spell list:
- Create a custom version of the base list
- Apply additions or removals to the custom list
- Assign the modified list to affected characters

This avoids unintended side effects for other classes or NPCs.

#### Subclass integration
Subclass spell access is best handled using additive spell lists.

Example workflow:
- Keep the base class spell list unchanged
- Create a subclass-specific spell list
- Assign both lists to the character

This approach allows:
- Clean separation of features
- Easy reassignment if subclasses change
- Clear documentation for players

## Best Practices

### Backup Considerations
Before making significant changes:
- Duplicate or merge the original spell list into a new custom list
- Use naming conventions to preserve version history

This allows easy rollback if issues arise.

### Testing modified lists
After modification:
- Assign the list to a test character
- Verify visible, learnable, and prepared spells
- Confirm spell book behavior matches expectations

Testing before a session prevents player disruption.

### Documenting changes for players
When modifying spell lists:
- Clearly communicate changes to affected players
- Document restrictions, additions, or removals
- Consider listing changes in session notes or campaign documentation

Transparent documentation reduces confusion and reinforces trust.