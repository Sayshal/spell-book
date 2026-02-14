# Creating New Spell Lists

Custom spell lists let GMs define exactly which spells are available to characters. Commonly used for class spell lists, subclass expansions, setting-specific restrictions, or homebrew spell access.

> [!TIP]
> For a detailed breakdown of the interface, see [Spell List Manager Interface Overview](SpellListManager-Interface-Overview).

---

## Prerequisites

Before creating a custom spell list, ensure:

- You are logged in as a GM or GM Assistant
- **GM Setup Mode** is enabled (recommended during configuration)
- Your spell compendiums are properly configured

Create a custom spell list when:

- You want to modify or restrict spell availability
- You are supporting homebrew classes or subclasses
- You want to avoid altering system-provided spell lists

---

## Creating a New Spell List

1. Open the **Spell List Manager** from the **Compendium** tab
2. Click the **+** icon in the upper left
3. In the dialog:
   - Enter a name for the list
   - Select the class intended to use this list
   - Check the subclass box if applicable
4. Click **Create New List**

The new list becomes the active selection automatically and appears under **Custom Spell Lists**.

### Naming Conventions

Clear naming makes long-term management easier:

- Class-based: `Wizard - Core`, `Cleric - Divine`
- Subclass: `Wizard - Bladesinger`, `Cleric - Twilight Domain`
- Setting/theme: `Low Magic - Restricted`, `Underdark Spell List`
- Versioned: `Wizard - Core (Homebrew v2)`

---

## Adding Spells

With your custom list selected and **Edit** mode enabled:

1. Use the right panel to browse and filter spells from configured compendiums
2. Add spells individually by clicking the **+** icon
3. Enable **Selection Mode** to add multiple spells at once

---

## Class Identifier Reference

Class identifiers determine which spell lists apply to a character. These correspond to the system's internal class or subclass IDs.

Best practice is to keep lists modular:

- One core class list
- Separate subclass or feature-based lists
- Optional setting or narrative lists

This allows multiple lists to be assigned to a character without duplication.

For multiclass characters:

- Assign all relevant spell lists
- Overlapping spells are handled automatically
- Spell availability is the union of all assigned lists

---

## Access Permissions

Spell lists determine which spells are visible and which can be learned or prepared. Enforcement depends on campaign settings:

- **Unenforced** — No restrictions
- **Notify GM** — Alerts but allows flexibility
- **Enforced** — Strict rule adherence

Configured globally in Spell Book settings.

---

## Merging Spell Lists

Merge multiple existing lists into a single custom list:

1. Click **Merge** in the Spell List Navigation header
2. Select two or more source lists
3. Provide a name for the merged list

The resulting list is fully editable and independent of its sources.

The merge dialog includes a **Hide Source Lists** option that automatically hides the source lists after the merge is created, keeping the navigation sidebar clean.

> [!NOTE]
> Custom spell lists do not automatically update when source lists change. Revisit custom lists after system or module updates.

---

## Connecting Lists to Characters

1. Open a character sheet
2. Open their Spell Book (book icon on the spell page)
3. Open settings (wand icon)
4. Assign one or more custom spell lists
5. Review available spells

Characters can have multiple spell lists assigned simultaneously.

### Player Visibility

Spell lists control which spells appear in a player's Spell Book and which can be learned, prepared, or cast. Depending on settings, players may see spells they cannot yet learn, or GM approval may be required.

### GM Approval Workflows

Spell Book supports several oversight styles:

- Automatic approval (rules-light campaigns)
- Notify-only review
- Explicit approval prompts

Common use cases: learning from scrolls, gaining spells during downtime, unlocking subclass spells.

---

## Registry Integration

Custom spell lists can integrate with the D&D 5e `SpellListRegistry` system. When enabled, custom lists are registered via `registerCustomSpellLists()` so they participate in the system's native spell list resolution. This is managed automatically by the module's `Registry Enabled Lists` setting.

---

## Validation

Before starting play, review custom lists for:

- Missing compendium references
- Deprecated or removed spells
- Duplicate or unintended entries
