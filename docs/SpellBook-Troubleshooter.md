# SpellBook Troubleshooter

GM-only diagnostic tool for generating and sharing support reports.

---

## Opening the Troubleshooter

1. Open **Module Settings** (gear icon)
2. Find **Spell Book** in the module list
3. Click the **Troubleshooter** button

---

## Report Contents

The generated report contains four sections:

| Section | What It Captures |
|---|---|
| Game Information | Foundry version, system version, world ID, user, active scene, timestamp |
| Module Information | Spell Book version + full list of active modules with versions |
| Spell Book Settings | All registered settings with values + full JSON export block |
| Spell Book Logs | Current log level + filtered console log history (color codes stripped, CSS strings filtered, timestamps as HH:MM:SS.mmm) |

---

## Actions

The Troubleshooter provides the following buttons:

- **Copy to Clipboard** — Copies the full text report for pasting into Discord or a bug report
- **Export to File** — Saves the report as a timestamped `.txt` file
- **Import Settings** — Imports settings from a previously exported Troubleshooter report
- **Open Discord** — Opens the Spell Book community Discord server
- **Open GitHub Issues** — Opens the GitHub issue tracker

---

## Include Actors

Toggle the **Include Actors** checkbox to export owned actor data alongside the report. When enabled, each owned actor is saved as a separate `.json` file containing the full actor compendium export with source metadata (world ID, UUID, core version, system ID, system version, exporter, timestamp, and troubleshooter export flag).

---

## Settings Transfer

Every report includes a `=== FULL SETTINGS DATA (for import) ===` JSON block at the end of the Spell Book Settings section. Another GM can import this data to replicate your exact module configuration:

1. Obtain a Troubleshooter `.txt` export from the source world
2. Open the Troubleshooter in the target world
3. Click **Import Settings**
4. Select the `.txt` file
5. Review the confirmation dialog showing the count of settings to import
6. Click **Import** to apply

> [!NOTE]
> Settings that already match are skipped. Certain settings (`advancedSearchPrefix`, `filterConfiguration`, `loggingLevel`) are validated before import — `advancedSearchPrefix` must be a single character, and `filterConfiguration` must be a valid object with version and filters array. If more than 5 settings change, you'll be prompted to reload Foundry.

---

## When to Use

- **Bug reports** — Attach the exported `.txt` file to GitHub issues or Discord messages
- **Discord support** — Copy the report to clipboard and paste it in a support thread
- **Reproducing settings** — Transfer settings between worlds or share with another GM for debugging
