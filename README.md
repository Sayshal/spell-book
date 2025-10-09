# Spell Book

![GitHub release](https://img.shields.io/github/v/release/Sayshal/spell-book?style=for-the-badge)
![GitHub Downloads (specific asset, all releases)](<https://img.shields.io/github/downloads/Sayshal/spell-book/module.zip?style=for-the-badge&logo=foundryvirtualtabletop&logoColor=white&logoSize=auto&label=Downloads%20(Total)&color=ff144f>)
![GitHub Downloads (specific asset, latest release)](<https://img.shields.io/github/downloads/Sayshal/spell-book/latest/module.zip?sort=date&style=for-the-badge&logo=foundryvirtualtabletop&logoColor=white&logoSize=auto&label=Downloads%20(Latest)&color=ff144f>)

![Foundry Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fspell-book%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![D&D5E Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fsystem%3FnameType%3Dfoundry%26showVersion%3D1%26style%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fspell-book%2Freleases%2Flatest%2Fdownload%2Fmodule.json)

## Supporting The Module

[![Discord](https://dcbadge.limes.pink/api/server/PzzUwU9gdz)](https://discord.gg/PzzUwU9gdz)

## Introduction

**Spell Book** transforms spell management in FoundryVTT with two powerful tools: the **Spell Book** interface for players and the **Spell List Manager** for GMs. Navigate your magical arsenal through an intuitive interface that fully supports both 2014 and 2024 D&D rules. From preparation to casting, handle everything in one centralized location with full multiclass support and class-specific rule customization.

The module streamlines spell management so you can focus on what matters—playing your game and unleashing arcane power in your adventures.

## Why Spell Book?

Traditional spell management in FoundryVTT requires endless compendium searches and confusing spell tracking across multiple interfaces. Spell Book solves these problems by providing:

- **Unified Interface**: All spell management in one location
- **Rule Automation**: Automatic enforcement of preparation limits and casting rules
- **Smart Organization**: Separate tabs for each class, wizard spellbooks, and spell lists
- **Party Coordination**: See what spells your party has prepared at a glance
- **Flexible Configuration**: Customize rules for each class individually

## Key Features

### Spell Book

The main player interface provides complete spell management with:

- **Multiclass Support**: Each spellcasting class gets its own tab with independent tracking
- **Rule Set Flexibility**: Support for both 2014 Legacy and 2024 Modern D&D rules
- **Preparation Management**: Visual indicators for prepared, always-prepared, and ritual spells
- **Wizard Spellbook**: Dedicated tab for tracking learned spells, copying costs, and ritual access
- **Advanced Filtering**: Customizable filters for school, level, source, components, and more
- **Spell Comparison**: Side-by-side comparison of multiple spells
- **Scroll Scanner**: Automatically detect spell scrolls in inventory for learning
- **Spell Notes**: Personal annotations for each spell that inject into descriptions
- **Spell Loadouts**: Save and restore different spell preparation sets
- **Long Rest Integration**: Optional prompts for spell swapping during rests
- **Smart Cantrip Management**: Automatic cantrip swapping based on rule set

### Spell List Manager

GM tool for complete control over spell lists:

- **List Customization**: Edit any existing spell list from any compendium
- **Custom Creation**: Build new spell lists for homebrew classes or variants
- **Merge Lists**: Combine multiple spell lists into unified collections
- **Player Integration**: Custom lists automatically appear in player spell books
- **Version Tracking**: Monitor when source lists have been updated
- **Bulk Operations**: Add or remove multiple spells at once with multi-select
- **List Organization**: Folder structure with hiding and filtering capabilities
- **Character Access**: View and manage individual player spellbooks

### Misc

Additional tools that enhance the spell management experience:

- **Party Spells Interface**: View all party spells in a unified grid with member indicators
- **Spell Analytics Dashboard**: Track spell usage, favorites, and casting patterns
- **Focus Distribution**: Manage arcane/druidic focus assignments across the party
- **Synergy Analysis**: Strategic recommendations for party spell optimization
- **Troubleshooter**: Diagnostic tool for resolving configuration issues
- **Macro Support**: Extensive macro API for automation and custom workflows
- **UI Customization**: Configure which spell details and metadata to display
- **Rule Enforcement Options**: Choose between unenforced, GM notification, or full enforcement
- **Class-Specific Overrides**: Customize preparation limits, ritual access, and swapping rules per class

## Installation

Get Spell Book through Foundry's Module Manager or The Forge's Bazaar for instant setup.

### Manual Installation

1. Open Foundry's Configuration and Setup screen
2. Click Install Module in the Add-on Modules section
3. Paste this URL in the Manifest URL field: `https://github.com/Sayshal/spell-book/releases/latest/download/module.json`
4. Click Install
5. Enable the module in your world

## Getting Started

### Quick Setup

1. **Configure Compendiums**: Select which compendiums contain your spells
2. **Choose Rule Set**: Select Legacy (2014) or Modern (2024) rules
3. **Set Enforcement**: Decide how strictly to enforce spellcasting limits
4. **Open Spell Book**: Click the book icon in the token controls or use the character sheet button

For detailed setup instructions, see the [Installation and Settings](https://github.com/Sayshal/spell-book/wiki/Installation-and-Settings) wiki page.

### Player Quick Start

1. Open your Spell Book from the token controls or character sheet
2. Navigate to your class tab to see available spells
3. Check spells to prepare them (up to your preparation limit)
4. Use filters to find specific spells quickly
5. Save preparation sets as loadouts for easy swapping

See the [Player Quick Start](https://github.com/Sayshal/spell-book/wiki/Player-Quick-Start) guide for detailed instructions.

### GM Quick Start

1. Open the Spell List Manager from the Settings menu
2. Browse existing spell lists or create custom ones
3. Edit lists by adding or removing spells
4. Custom lists automatically appear in player spell books

Check the [GM Quick Start](https://github.com/Sayshal/spell-book/wiki/DM-Quick-Start) guide for more information.

## Documentation

Complete documentation is available in the [Spell Book Wiki](https://github.com/Sayshal/spell-book/wiki):

- [SpellBook Interface Overview](https://github.com/Sayshal/spell-book/wiki/SpellBook-Interface-Overview)
- [SpellListManager Interface Overview](https://github.com/Sayshal/spell-book/wiki/SpellListManager-Interface-Overview)
- [Spell Preparation System](https://github.com/Sayshal/spell-book/wiki/Spell-Preparation-System)
- [Multiclass Spellcasting](https://github.com/Sayshal/spell-book/wiki/Multiclass-Spellcasting)
- [Wizard Spellbook Management](https://github.com/Sayshal/spell-book/wiki/Wizard-Spellbook-Management)
- [PartySpells Interface Overview](https://github.com/Sayshal/spell-book/wiki/PartySpells-Interface-Overview)
- [Creating New Spell Lists](https://github.com/Sayshal/spell-book/wiki/Creating-New-Spell-Lists)
- [Modifying Existing Spell Lists](https://github.com/Sayshal/spell-book/wiki/Modifying-Existing-Spell-Lists)
- [Macros](https://github.com/Sayshal/spell-book/wiki/Macros)
