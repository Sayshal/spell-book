# Installation and Setup

> **Status:** 🔄 Review Needed

## Overview

The Spell Book module for FoundryVTT provides spellcasting management with advanced preparation, analytics, and party coordination features. This guide covers installation, initial configuration, and an overview of all available settings.

## Table of Contents

- [Installation](#installation)
- [Initial Setup](#initial-setup)
- [World-Level Settings](#world-level-settings)
- [Client-Level Settings](#client-level-settings)
- [SpellBook-Specific Configuration](#spellbook-specific-configuration)
- [Post-Installation Steps](#post-installation-steps)
- [Common Issues](#common-issues)

## Installation

### Method 1: Foundry Module Browser

1. Open FoundryVTT and navigate to **Add-on Modules**
2. Click **Install Module**
3. Search for "Spell Book" by Tyler (Sayshal)
4. Click **Install** and wait for completion
5. **Enable** the module in your world

### Method 2: Manual Installation

1. Download the latest release from the [GitHub repository](https://github.com/Sayshal/spell-book)
2. Extract to your `Data/modules/` directory
3. Restart FoundryVTT
4. Enable the module in your world's **Manage Modules** section

## Initial Setup

After installation, configure these essential settings:

1. **Enable GM Setup Mode** (temporary): Helps with initial building of spell lists, remember to disable once done
2. **Select Compendiums**: Choose which spell compendiums to index
3. **Configure Rule Set**: Choose between Legacy or Modern spellcasting rules
4. **Set Enforcement Behavior**: Decide how strictly rules are enforced

## World-Level Settings

*These settings affect all users in the world and require GM permissions.*

### **Analytics & Data**

- **Enable Spell Usage Tracking**: Tracks spell casting for analytics dashboard
    - *Default: Enabled*
    - *Impact: Enables personal and party analytics features*

- **GM Setup Mode**: Load all spell(list) data for building spell lists
    - *Default: Disabled*
    - *Impact: Increases load times to make building spell lists with the Spell List Manager easier*

### **Rule Enforcement**

- **Spellcasting Rule Set**: Choose between Legacy or Modern rule interpretations
    - *Options: Legacy (2014) | Modern (2024)*
    - *Default: Legacy*
    - *Impact: Affects cantrip swapping, ritual casting, and spell preparation rules*

- **Default Enforcement Behavior**: How strictly spell preparation rules are enforced
    - *Options: Unenforced | Notify GM | Enforced*
    - *Default: Notify GM*
    - *Impact: Controls whether rule violations are allowed, warned, or blocked*

### **Spell Management**

- **Consume Scrolls When Learning**: Whether scrolls are consumed when copying spells
    - *Default: Enabled*
    - *Impact: Affects wizard spell learning mechanics*

- **Cantrip Scale Values**: Defines which actor properties scale cantrip damage
    - *Default: "cantrips-known, cantrips"*
    - *Impact: Affects cantrip damage calculations*

- **Spell Notes Maximum Length**: Character limit for personal spell notes
    - *Default: 240 characters*
    - *Range: 10-1000 characters*

### **Interface Features**

- **Enable Journal Button**: Adds Spell List Manager button to journal directory
    - *Default: Enabled*
    - *Impact: Provides quick access to spell list management*

- **Spell Comparison Maximum**: Maximum spells that can be compared simultaneously
    - *Default: 3 spells*
    - *Range: 2-7 spells*

### **Module Compatibility**

- **Cauldron of Plentiful Resources (CPR) Compatibility**: Enhanced integration with CPR module
    - *Default: Disabled*
    - *Availability: Only shown when CPR module is active*

## Client-Level Settings

*These settings are per-user and don't require GM permissions.*

### **User Experience**

- **Advanced Search Prefix**: Character used to trigger advanced spell search syntax
    - *Default: "^" (caret)*
    - *Usage: Type ^DMG:fire to search for fire-related spells*

- **Disable Long Rest Swap Prompt**: Skip spell swap dialogs during long rests
    - *Default: Disabled*
    - *Impact: Streamlines rest process for users who don't swap spells*

- **Party Mode Token Limit**: Maximum tokens displayed in party coordination view
    - *Default: 4 tokens*
    - *Range: 2-8 tokens*

### **Personal Notes**

- **Spell Notes Description Injection**: Where personal notes appear in spell descriptions
    - *Options: Off | Before Description | After Description*
    - *Default: Off*
    - *Impact: Integrates personal notes into spell item descriptions*

## SpellBook-Specific Configuration

*See [SpellBook Settings Reference](SpellBook-Settings-Reference) for detailed configuration of these specialized interfaces.*

## Post-Installation Steps

1. **Configure Compendiums**: Use the Compendium Selection dialog to choose spell sources
2. **Set World Rules**: Configure the global rule set and enforcement behavior
3. **Test with a Character**: Open a spellcaster's character sheet and verify the module works
4. **Customize Interface**: Adjust spell details display through the customization menu
5. **Review Analytics**: Enable usage tracking if desired for gameplay insights

## Common Issues

### Module Not Appearing

- Verify the module is enabled in **Manage Modules**
- Check that you're using a supported game system (D&D 5e)
- Refresh the browser and reload the world

### No Spells Loading

- Ensure compendiums are properly selected via **Compendium Selection**
- Check that indexed compendiums contain spell data
- Try toggling **Setup Mode** for guided configuration

### Interface Issues

- Check for conflicts with other UI modules
- Verify client-specific settings are properly configured

### Performance Problems

- Reduce **Party Mode Token Limit** if experiencing lag
- Disable **Spell Usage Tracking** for large worlds
- Disable **GM Setup Mode** when not building spell lists
- Consider limiting indexed compendiums to essential content
