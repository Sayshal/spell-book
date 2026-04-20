# Spell Book Troubleshooter

GM-only diagnostic tool for generating and sharing support reports, and for transferring Spell Book settings between worlds.

![Spell Book Troubleshooter window with diagnostic output and footer actions](https://raw.githubusercontent.com/Sayshal/spell-book/main/docs/images/troubleshooter.png)

---

## Opening the Troubleshooter

The Troubleshooter is registered as a world-scoped settings menu (`troubleshooterMenu`, bug icon) restricted to GMs.

1. Open **Configure Settings** from the Game Settings sidebar.
2. Select the **Spell Book** tab.
3. Click **Open Troubleshooter** (bug icon) next to the Troubleshooter entry.

---

## Window Layout

- **Intro hint** describing the purpose of the report.
- **Include Actor Data** checkbox (only shown when the current user owns one or more actors). Persists to the per-user client setting `troubleshooterIncludeActors` and carries a warning that enabling it increases report size and may expose personal character data.
- **Output log** — a read-only monospace panel containing the full generated report, themed to match the rest of Spell Book (no default browser styling).
- **Footer buttons**, in order:
  - **Import Settings**
  - **Download**
  - **Copy to Clipboard**
  - **Join Discord**
  - **Report Issue**

---

## Report Contents

The report is plain text with sections delimited by `/////////////// Section ///////////////` headers.

| Section | Contents |
|---|---|
| Game Information | Foundry version, system id and version, world id and title, user name and role, active scene name, ISO timestamp |
| Module Information | Spell Book version and active/inactive state, followed by every active module sorted by title with its version |
| Spell Book Settings | Registered setting count vs defined count, each registered setting with a value summary (arrays and objects are summarized for readability), then a `=== FULL SETTINGS DATA (for import) ===` marker followed by a pretty-printed JSON dump of every registered Spell Book setting |

Only module-scoped settings are exported. Settings owned by other modules are never included.

The report also incorporates the spell-list mapping snapshot and the spells-not-in-lists audit (the same result produced by [`spellsNotInLists`](API-Reference#spellsnotinlists)) so that cross-pack duplicate and coverage issues can be diagnosed from the report alone.

---

## Include Actor Data

When the **Include Actor Data** checkbox is enabled, the Download action writes one JSON file per owned actor alongside the report, containing each actor's full Spell Book flag state (via `Actor#toCompendium()`).

Each actor file is augmented with an `_stats.exportSource` block containing:

- `worldId`
- `uuid`
- `coreVersion`
- `systemId`
- `systemVersion`
- `exportedBy` (user id)
- `exportedAt` (ISO timestamp)
- `troubleshooterExport: true`

Failed actor exports are reported via a warning notification listing the affected names.

> [!WARNING]
> Enabling this option can dramatically increase report size and may include personal character data. Keep it **off** unless a support request specifically calls for actor dumps.

---

## Actions

### Import Settings

Reads a previously downloaded Troubleshooter `.txt` report and applies the embedded settings block.

1. Click **Import Settings** and select a report file.
2. The embedded JSON block after `=== FULL SETTINGS DATA (for import) ===` is extracted and parsed. Files without that marker are rejected with a notification.
3. A confirmation dialog shows the number of settings contained in the file.
4. On confirm, each setting is applied with the following rules:
   - Unknown keys (not defined in `SETTINGS`) are dropped.
   - Values that match the current value are skipped.
   - Deferred keys (currently only `loggingLevel`) are applied after all other settings.
   - Values that fail deferred validation are skipped.
   - Write failures are collected and surfaced as a warning notification.
5. If more than 5 settings were imported, a **Reload Recommended** dialog offers to reload Foundry immediately.

### Download

Saves the report as `spellbook-troubleshooter-{timestamp}.txt`. When **Include Actor Data** is enabled, each owned actor is also written as `actor-{slug}-{timestamp}.json`.

### Copy to Clipboard

Copies the current report text to the system clipboard.

### Join Discord

Opens `https://discord.gg/PzzUwU9gdz` in a new tab.

### Report Issue

Opens `https://github.com/Sayshal/spell-book/issues` in a new tab.

---

## Settings Transfer Workflow

The settings block at the end of every report is a self-contained snapshot that can replicate a configuration in another world.

1. Open the Troubleshooter in the source world and click **Download**.
2. In the target world, open the Troubleshooter and click **Import Settings**.
3. Select the downloaded `.txt` file.
4. Confirm the count in the dialog.
5. If prompted, reload Foundry to let all settings take effect.

> [!NOTE]
> Import only touches keys registered by Spell Book. Any foreign keys (from other modules or from older Spell Book versions that no longer exist) are silently dropped.

---

## When to Use

- **Bug reports** — attach the downloaded `.txt` (and actor JSON files, if relevant) to a GitHub issue.
- **Discord support** — use **Copy to Clipboard** and paste the report into a support thread.
- **Configuration transfer** — share a report between GMs or worlds to reproduce an exact Spell Book configuration.
- **Spell-list audit** — inspect the spells-not-in-lists section of the report to find orphan or third-party spells that still need to be added to a class list.
