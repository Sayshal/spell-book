# Modifying Existing Spell Lists

Adjust spell availability without rebuilding lists from scratch. Useful for campaign-specific balance changes, narrative restrictions, subclass expansions, or system tweaks.

> [!TIP]
> For a detailed breakdown of the interface, see [Spell List Manager Interface Overview](SpellListManager-Interface-Overview).

---

## Accessing Existing Lists

1. Open the **Spell List Manager** from the **Compendium** tab
2. Locate the spell list in the left sidebar
3. Left-click the list to load it into the center panel

Lists are grouped into three categories:

| Category | Description | Editable |
|---|---|---|
| Player Spell Book | Lists tied to individual characters (learned spells) | Generally not |
| Custom Spell Lists | GM-created lists | Yes |
| Spell Lists | System-provided or module-added lists | Read-only (auto-copied) |

> [!NOTE]
> When modifying a system-provided list, Spell Book automatically creates a custom copy. Module updates will not reset your changes.

---

## Making Modifications

1. Select a spell list and click **Edit** in the center panel
2. Use the right panel to browse and filter spells

### Adding Spells

- Click the **+** icon next to a spell to add it
- Enable **Selection Mode** to add multiple spells at once
- Newly added spells appear immediately in the center panel

### Removing Spells

- Remove spells directly from the list in the center panel
- Changes take effect immediately in edit mode

Removing a spell from a list does not delete it from the system or player inventories — it only restricts availability through that list.

### Bulk Editing

Use **Selection Mode** and filtering together for large-scale changes:

- Adding all spells of a specific level
- Removing a group of spells based on school or theme
- Rebuilding a list after system updates

---

## Advanced Modifications

### Conditional Spell Additions

For campaigns requiring conditional spell availability (narrative, faction, or progression-based):

- Maintain multiple spell lists representing different conditions
- Assign or remove lists as conditions are met
- Avoid toggling individual spells mid-session

### Class-Specific Modifications

When modifying a class spell list:

1. Create a custom version of the base list
2. Apply additions or removals to the custom list
3. Assign the modified list to affected characters

This avoids unintended side effects for other classes or NPCs.

### Subclass Integration

Handle subclass spell access with additive lists:

1. Keep the base class spell list unchanged
2. Create a subclass-specific spell list
3. Assign both lists to the character

This provides clean separation of features and easy reassignment if subclasses change.

---

## Before Modifying

- Duplicate or merge the original list into a new custom list before making significant changes
- Use naming conventions to preserve version history (e.g., `Wizard - Core v2`)

### Testing

After modification:

1. Assign the list to a test character
2. Verify visible, learnable, and prepared spells
3. Confirm Spell Book behavior matches expectations
