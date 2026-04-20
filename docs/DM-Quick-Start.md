# DM Quick Start

Get from install to "spells appear in a player's Spell Book" in five steps.

**Requirements:** Foundry VTT 13.351+, dnd5e 5.3.0+.

---

## 1. Install

Install the module through the Foundry setup screen or via manifest URL. See [Installation and Settings](Installation-and-Settings) for details.

Once enabled in your world, Spell Book adds:

- A **Spell Book** button on each actor sheet.
- A **Spell List Manager** button in the footer of the Compendium sidebar tab (GM only).

---

## 2. Open the Spell List Manager

![Spell List Manager in dark theme](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/slm-hero.png)

Open the **Compendium** sidebar tab and click **Spell List Manager** in the footer.

The manager is a draggable window with a detach button in its header (pops the manager out into a standalone OS window; dialogs opened from the manager follow along).

On first open the module indexes every compendium spell. A progress toast ticks as the fetch completes — this is a one-time cost per session.

Full walkthrough: [Spell List Manager Interface Overview](SpellListManager-Interface-Overview).

---

## 3. Make Lists Available to Players

> [!IMPORTANT]
> Spells do **not** auto-populate on character sheets. You must make a list available to each spellcasting class using one of the two options below, or player spell books will appear empty.

### Option A: Add to Spell Registry (recommended for stock lists)

In the Spell List Manager header, tick **Add to Spell Registry** on each list you want to act as the global default for its class or subclass. This:

- Adds the list's UUID to the `REGISTRY_ENABLED_LISTS` world setting.
- Calls `dnd5e.registry.spellLists.register(uuid)` immediately, so newly added spells show their class label on item sheets right away — no reload needed.

Disabling the toggle removes the UUID from the setting but cannot undo contributions already pushed to the registry; a world reload is required to clear those. A notification explains this when you disable a list.

Use this path when you want one list per class or subclass applied globally.

### Option B: Assign Per Class via Spell Book Settings

For campaign-specific or per-character lists, have each player open **Spell Book Settings** (the cog icon in their Spell Book header) and select the list for each class:

- `Class Spell List` — the class's primary list.
- `Subclass Spell List` — the subclass list. This is now explicit; the module no longer tries to infer a subclass list from the registry.

Per-actor Spell Book Settings overrides the registry, so you can combine both: the registry provides the default, Spell Book Settings overrides per actor.

- Create lists: [Creating New Spell Lists](Creating-New-Spell-Lists)
- Modify existing lists: [Modifying Existing Spell Lists](Modifying-Existing-Spell-Lists)
- Assign lists to classes: [Class Rules](Class-Rules)

![Merge Lists dialog](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/slm-merge-dialog.png)

---

## 4. Review Global Settings (Optional)

Open **Game Settings > Configure Settings > Spell Book**. You do not need to change anything to get started. A few worth knowing:

- **Notify GM on Spell Changes** (`NOTIFY_GM_ON_SPELL_CHANGES`, default **on**) — whispers the GM when a player prepares more cantrips or spells than their class allows. This does **not** block preparation; it is a soft notification only. Exposed as a boolean checkbox in per-actor Spell Book Settings as well.
- **Spellcasting Rule Set** — Legacy (2014) or Modern (2024).
- **Consume Scrolls When Learning** — default on.
- **Deduct Spell Learning Costs** — default off.

Full reference: [Installation and Settings](Installation-and-Settings).

---

## 5. Players Open Their Spell Book

Players click the **Spell Book** button on their character sheet. Their spells come from:

1. The class / subclass list registered in step 3A, or
2. The list they assigned in **Spell Book Settings** (step 3B), which takes precedence.

If a player's book is empty, confirm one of the two options above is set for their class, and that the class has a `customSpellList` assigned (the subclass list is optional).

---

## Troubleshooting

If something looks wrong, use the [SpellBook Troubleshooter](SpellBook-Troubleshooter) to generate a diagnostic report.

Programmatic access to spell data, list registration, and actor Spell Book state is documented in the [API Reference](API-Reference).
