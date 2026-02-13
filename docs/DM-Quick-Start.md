# DM Quick Start

---

## Spell List Manager

Access the **Spell List Manager** via the button at the bottom of the **Compendium** tab. This is where you create, modify, and delete spell lists.

- Full reference: [Spell List Manager Interface Overview](SpellListManager-Interface-Overview)

---

## Module Settings

In **Game Settings**, Spell Book adds several GM-facing settings. You do not need to configure everything immediately.

### Core Settings

- **Spellcasting Rule Set** — Legacy (2014) or Modern (2024). Default: Legacy
- **Enforcement Behavior** — Unenforced, Notify GM, or Enforced. Default: Notify GM
- **Setup Mode** — Preloads all spells and compendiums to reduce loading time during configuration. Disable during sessions.

> [!IMPORTANT]
> GM Setup Mode significantly impacts memory usage. Always disable it once setup is complete.

### Spell Management

- **Consume Scrolls When Learning** — Default: Enabled
- **Deduct Spell Learning Costs** — Default: Disabled

### Interface Options

- **Spell Comparison Maximum** — Default: 3
- **Cantrip Scale Values** — Default: `cantrips-known, cantrips`
- **Advanced Search Prefix** — Character that triggers advanced search mode. Default: `^`
- **Party Mode Token Limit** — Maximum tokens displayed in party spell view (2-8). Default: 4

### Advanced Settings

- **Suppress Migration Warnings** — Default: Disabled
- **Cauldron of Plentiful Resources Compatibility** — Default: Disabled (only enable if using CPR)
- **Auto-Delete Unprepared Spells** — Default: Disabled
- **Spell Notes Length** — Maximum character limit for player spell notes (10-1000). Default: 240

Full settings reference: [Installation and Settings](Installation-and-Settings)

---

## Common GM Workflow

1. Enable **GM Setup Mode** in settings
2. Create or modify spell lists for your campaign classes/subclasses in the **Spell List Manager**
3. Open each player's character sheet and configure their spell lists via the **Wand** icon in Spell Book
4. Disable **GM Setup Mode** when finished

---

## Recommended Initial Configuration

- **Configure Compendiums** — Select only the compendiums you use to reduce loading time
- **Auto-Delete Unprepared Spells** — Off
- **Consume Scrolls When Learning** — On
- **Deduct Spell Learning Costs** — Off
- **Disable Long Rest Swap Prompt** — Off
- **Suppress Migration Warnings** — Off

---

## See Also

- [SpellBook Troubleshooter](SpellBook-Troubleshooter) — Generate diagnostic reports for support
- [Spell Details Customization](Installation-and-Settings#ui-customization) — Configure which spell details display for players and GMs
- [Hidden Spell Lists](SpellListManager-Interface-Overview) — Manage hidden lists in the Spell List Manager
