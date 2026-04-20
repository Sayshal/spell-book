# Installation and Settings

This guide covers installing the Spell Book module and configuring its world and client settings.

## Requirements

- **Foundry VTT**: 13.351 or newer
- **D&D 5e System**: 5.3.0 or newer
- **Optional**: `tidy5e-sheet`, `chris-premades` (extra compatibility settings appear when active)

## Installation

### Foundry Module Browser

1. Launch Foundry VTT and open the **Setup** screen.
2. Open **Add-on Modules** and click **Install Module**.
3. Search for **Spell Book** by **Tyler**.
4. Click **Install**.
5. Enable the module in your world's **Manage Modules** menu.

### Manifest URL

1. Open **Add-on Modules** and click **Install Module**.
2. Paste the following Manifest URL:

   ```
   https://github.com/Sayshal/spell-book/releases/latest/download/module.json
   ```

3. Click **Install** and wait for the download to finish.
4. Enable the module in your world's **Manage Modules** menu.

## First-Time Setup

After enabling the module:

1. Open **Game Settings** -> **Configure Settings** -> **Spell Book**.
2. Choose your **Default Spellcasting Rules** (Legacy 2014 or Modern 2024).
3. Decide whether the GM should be notified when players overprepare via **Notify GM on Spell Changes**.
4. Open **Spell Details Customization** to choose which UI elements and metadata appear in spell rows.
5. Each player can open their Spell Book and use the **Spell Book Settings** dialog (gear icon in the sidebar) to override world defaults where allowed. See [Class Rules](Class-Rules).

## Settings Reference

All settings live under **Game Settings** -> **Configure Settings** -> **Spell Book**. Scope: **World** = GM-only, shared by everyone; **Client** = per user, stored locally; **User** = per user, synced with the server.

### Core Rule Settings

| Setting | Key | Scope | Default | Description |
|---|---|---|---|---|
| Default Spellcasting Rules | `spellcastingRuleSet` | World | `legacy` | Default rule set for spellcasting behavior. Choose **Legacy Rules** (2014) or **Modern Rules** (2024). Per-actor override available in [Class Rules](Class-Rules). |
| Notify GM on Spell Changes | `notifyGmOnSpellChanges` | World | `true` | When a player prepares more cantrips or spells than their class allows, the GM receives a whispered report. Does **not** block preparation. Per-actor override available in [Class Rules](Class-Rules). |

### Spell Preparation and Learning

| Setting | Key | Scope | Default | Description |
|---|---|---|---|---|
| Consume Scrolls When Learning | `consumeScrollsWhenLearning` | World | `true` | Whether spell scrolls are consumed when a wizard learns a spell from them. |
| Deduct Spell Learning Costs | `deductSpellLearningCost` | World | `false` | Automatically deduct gold from the character when learning spells. Cost per spell level is configurable per class. |
| Cantrip Scale Value Keys | `cantripScaleValues` | World | `cantrips-known, cantrips` | Comma-separated scale value keys the module checks to find a class's cantrip limit. First resolving key wins; add keys here for homebrew classes. |
| Auto-Delete Unprepared Spells | `autoDeleteUnpreparedSpells` | User | `false` | Automatically removes unprepared prepared-casting spells from the character sheet after saving. Cleans up spells unprepared through the system UI. |
| Disable Long Rest Swap Prompt | `disableLongRestSwapPrompt` | Client | `false` | Disables the dialog that appears after a long rest for swapping spells or cantrips. The Spell Book remains available for swaps. |

### UI and Display

| Setting | Key | Scope | Default | Description |
|---|---|---|---|---|
| Maximum Note Length | `spellNotesMaxLength` | World | `240` | Maximum characters allowed in a personal spell note (range 10-1000, step 10). |
| Inject Notes into Spell Descriptions | `injectNotesIntoDescriptions` | Client | `off` | Inserts your personal spell notes into the spell description on the character sheet. Options: **Off**, **Before description**, **After description**. |
| Party Mode Token Limit | `partyModeTokenLimit` | Client | `4` | Maximum number of party member tokens displayed per spell in Party Mode (range 2-8). |

### Logging

| Setting | Key | Scope | Default | Description |
|---|---|---|---|---|
| Logging Level | `loggingLevel` | Client | `2` (Warnings) | Console verbosity: **0 Off**, **1 Errors**, **2 Warnings**, **3 Verbose**. The Troubleshooter captures all events regardless of this setting. |

### Compatibility (Conditional)

| Setting | Key | Scope | Default | Description |
|---|---|---|---|---|
| Cauldron of Plentiful Resources Compatibility | `cprCompatibility` | World | `false` | Only appears when the **chris-premades** module is active. When enabled, automatically runs CPR automation setup after spells are added to character sheets. |

### Display Toggles (via Details Customization)

The per-element UI toggles do not have individual entries in the main settings panel. They are configured through the **Spell Details Customization** menu and stored as **client-scope** booleans, one per toggle. The full list:

- Player Spell Book UI: Favorites, Compare, Notes, Position Controls at Bottom (`sidebarControlsBottom`)
- Player metadata: Spell Level, Components, School, Casting Time, Range, Damage Types, Conditions, Save, Concentration, Material Components
- Spell List Manager UI (GM): Compare
- Spell List Manager metadata (GM): same list as player metadata, stored under `gmUI*` keys

The **Wizard Book Icon Color** (`wizardBookIconColor`, client scope, `ColorField`, default `null`) is also configured here.

Full reference: [Details Customization](Details-Customization).

### Hidden Internal Settings

These are registered with `config: false` and are not visible in the settings panel. They persist module state or internal bookkeeping:

| Key | Scope | Purpose |
|---|---|---|
| `customSpellListMappings` | World | Compendium-to-custom-list mappings maintained by the SLM. |
| `registryEnabledLists` | World | IDs of dnd5e registry lists enabled for display. |
| `hiddenSpellLists` | World | UUIDs excluded from the Class Rules spell-list pickers and other consumers. |
| `spellBookPositionn` | Client | Last window position of the Player Spell Book. |
| `sidebarControlsBottom` | Client | Layout flag (exposed through Details Customization). |
| `troubleshooterIncludeActors` | Client | Remembered Troubleshooter checkbox. |

## Setting Menus

The settings panel exposes two dialog menus alongside the standard settings.

### Spell Details Customization

Opens a dialog where each user toggles UI elements and metadata fields on spell rows in the Player Spell Book and Spell List Manager, sets the wizard book icon color, and positions sidebar controls.

- **Menu label**: *Configure Display*
- **Icon**: paint palette
- **Restricted**: No (players and GMs)

Full reference: [Details Customization](Details-Customization).

### Troubleshooter

- **Menu label**: *Open Troubleshooter*
- **Icon**: bug
- **Restricted**: World / GM only
- **Purpose**: Generates a diagnostic report of environment, settings, and (optionally) actor data for bug reports. Supports copying to clipboard, exporting to file, import/export of Spell Book settings, and quick links to the issue tracker and Discord.

## Per-Actor Overrides

The **Spell Book Settings** dialog (gear icon in the Player Spell Book sidebar, or right-click the Spell Book button on the sheet) provides per-actor and per-class overrides:

![Spell Book button injected into the D&D 5e character sheet](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/sheet-button-dnd5e.png)

- **Rule Set Override** — Use Global / Legacy / Modern (per actor)
- **Notify on Spell Changes** — boolean (per actor)
- **Cantrip / Spell Swapping** — none / level-up / long-rest (per class)
- **Ritual Casting** — none / prepared / always (per class)
- **Class Spell List** / **Subclass Spell List** — multi-select (per class, required for spells to show)
- **Show Cantrips**, **Force Wizard Mode**, preparation bonuses, wizard learning cost/time, starting spells, spells per level

These overrides take precedence over the world-level defaults. See [Class Rules](Class-Rules).

## Troubleshooting

### Module Not Working

1. Confirm the module is enabled in **Manage Modules**.
2. Confirm Foundry is on **13.351** or newer and dnd5e is on **5.3.0** or newer.
3. Open the **Troubleshooter** menu, generate a report, and share it on Discord or the issue tracker.

### Performance

- Lower **Logging Level** to **Warnings** or **Errors**.
- Disable optional integrations you do not use.

### Diagnostic Report

Navigate to **Game Settings** -> **Configure Settings** -> **Spell Book** -> **Open Troubleshooter** to generate a system report for support.

## Next Steps

- **Players**: see [Player Quick Start](Player-Quick-Start)
- **GMs**: see [DM Quick Start](DM-Quick-Start)
- **Customizing spell lists**: see [Creating New Spell Lists](Creating-New-Spell-Lists) and [Modifying Existing Spell Lists](Modifying-Existing-Spell-Lists)
