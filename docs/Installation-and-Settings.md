# Installation and Settings

This guide covers installing the Spell Book module and configuring its settings for optimal use with your game.

## Installation Methods

### Via Foundry VTT Module Browser (Recommended)

1. Open Foundry VTT and navigate to the **Setup** screen
2. Click **Add-on Modules** in the sidebar
3. Click **Install Module** at the bottom of the module list
4. In the **Package Browser**, search for **"Spell Book"** by **Tyler**
5. Click **Install** next to the Spell Book module
6. Return to your world and enable the module in **Manage Modules**

### Via Module JSON URL

1. Open Foundry VTT and navigate to the **Setup** screen
2. Click **Add-on Modules** in the sidebar
3. Click **Install Module** at the bottom
4. Paste this Manifest URL: `https://github.com/Sayshal/spell-book/releases/latest/download/module.json`
5. Click **Install** and wait for download to complete
6. Enable the module in your world's **Manage Modules** menu

## Initial Setup

### First Time Configuration

After enabling the module, GMs should complete these essential setup steps:

1. **Configure Compendium Indexing** (Required)
   - Navigate to **Game Settings** → **Configure Settings** → **Spell Book**
   - Click **"Configure Compendium Indexing"**
   - Select which compendiums contain spells and spell lists
   - Module-specific compendiums are automatically selected
   - Click **Save Selection** (world will reload to index compendiums)

[https://github.com/Sayshal/spell-book/blob/main/github_media/CompendiumSelectionDialog.png]

2. **Review Module Settings**
   - Choose your **Spellcasting Rule Set** (Legacy 2014 or Modern 2024)
   - Set **Default Enforcement Behavior** for spell preparation limits
   - Configure other world-level preferences

3. **Configure Individual Spellcasters**
   - Open each player character sheet
   - Click the **Spell Book** button
   - Access the **Settings** (wand icon) for character-specific configuration

## World Settings (GM Only)

These settings affect all players in your world and can only be modified by GMs.

### Core Settings

**Spellcasting Rule Set**

- **Legacy (2014)**: Traditional D&D 5e rules with no cantrip swapping
- **Modern (2024)**: Updated rules allowing cantrip swapping on level-up
- Default: Legacy

**Default Enforcement Behavior**

- **Unenforced**: Players can prepare unlimited spells
- **Notify GM**: No limits enforced, but GM receives whispered notifications
- **Enforced**: Strict preparation limits with locked checkboxes
- Default: Notify GM

**Setup Mode**

- Enables preloading of all spell data for GM configuration
- Turn on when creating/modifying spell lists
- Turn off during regular play for better performance
- Requires world reload when changed

### Spell Management

**Consume Scrolls When Learning**

- Whether spell scrolls are consumed when wizards learn from them
- Default: Enabled

**Deduct Spell Learning Costs**

- Automatically deduct gold when wizards copy spells
- Cost per level configurable per class
- Default: Disabled

**Enable Spell Usage Analytics**

- Track spell casting frequency and patterns
- Powers the Analytics Dashboard
- Default: Enabled

### Interface Options

**Enable Journal Button**

- Adds Spell List Manager button to journal directory
- Default: Enabled

**Spell Comparison Maximum**

- Maximum spells allowed in side-by-side comparison (2-7)
- Default: 3

**Cantrip Scale Values**

- Which attributes determine cantrip damage scaling
- Default: "cantrips-known, cantrips"

### Advanced Settings

**Suppress Migration Warnings**

- Hide warnings about data migrations
- Default: Disabled

**Registry Enabled Lists** (Hidden)

- Managed automatically by the module
- Controls D&D 5e SpellListRegistry integration

## Client Settings (Per User)

These settings are personal preferences that each user can configure individually.

### User Interface

**Logging Level**

- Controls debug output verbosity
- Options: Off, Errors Only, Warnings, Verbose
- Default: Warnings

**Disable Long Rest Swap Prompt**

- Skip spell preparation dialog during long rests
- Default: Disabled

**Auto-Delete Unprepared Spells**

- Automatically remove unprepared spells from character sheets
- Useful for VTTs with limited item storage
- Default: Disabled

**Spell Notes Injection**

- Where to display personal spell notes:
    - **Off**: Notes only visible in Spell Book
    - **Before**: Insert notes before spell description
    - **After**: Insert notes after spell description
- Default: Off

**Advanced Search Prefix**

- Character that triggers advanced search mode
- Default: ^ (caret)
- Cannot be a letter or number

**Party Mode Token Limit**

- Maximum tokens to display in party spell view (2-8)
- Default: 4

### UI Customization

Access detailed display settings via **Game Settings** → **Spell Details Customization**

[https://github.com/Sayshal/spell-book/blob/main/github_media/UICustomization.png]

This dialog allows you to control which spell information appears in:

- Player Spell Book interface
- GM Spell List Manager
- Spell comparison dialogs

Customizable elements include:

- **UI Elements**: Favorites, Compare button, Notes, Sidebar position
- **Metadata**: Spell level, Components, School, Casting time, Range, Damage types, Conditions, Save requirements, Concentration, Material components

## Long Rest Integration

When enabled, the module integrates with D&D 5e's long rest system:

1. **During Long Rest**: Players receive a prompt to swap prepared spells
2. **Rule-Based Swapping**:
   - Legacy rules: Change any prepared spells
   - Modern rules: Swap one spell per long rest
3. **Class-Specific**: Each class follows its own swapping rules
4. **Optional**: Can be disabled in client settings

The prompt only appears for characters with:

- Spell preparation capability
- Available spells to swap
- Permission to modify their character

## Performance Considerations

### Compendium Indexing

- Only select compendiums you actively use
- Large compendium collections increase initial load time
- Module compendiums are always indexed

### Setup Mode

- Enable only when configuring spell lists
- Disable during regular gameplay
- Significantly impacts memory usage when active

## Troubleshooting

### Module Not Working

1. Verify at least one spell compendium is selected
2. Check that the module is enabled in Manage Modules
3. Ensure you're using compatible D&D 5e system version (3.0.0+)

### Missing Spells

1. Open **Configure Compendium Indexing**
2. Verify the compendium containing your spells is selected
3. Save and reload the world

### Performance Issues

1. Reduce number of indexed compendiums
2. Disable Setup Mode if not actively configuring
3. Check logging level (set to Warnings or Off)

### Generate Diagnostic Report

- Navigate to **Game Settings** → **Spell Book** → **Generate Troubleshooter Report**
- Creates detailed system analysis for support

## Next Steps

- **Players**: See [Player Quick Start](Player-Quick-Start) for using the Spell Book
- **GMs**: Review [DM Quick Start](DM-Quick-Start) for spell list management
- **Configuration**: Learn about [Creating New Spell Lists](Creating-New-Spell-Lists) and [Modifying Existing Spell Lists](Modifying-Existing-Spell-Lists)
