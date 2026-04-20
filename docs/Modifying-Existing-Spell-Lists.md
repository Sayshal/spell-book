# Modifying Existing Spell Lists

Adjust spell availability without rebuilding lists from scratch. Useful for campaign-specific balance changes, narrative restrictions, subclass expansions, or system tweaks.

> [!TIP]
> For the full interface reference, see [Spell List Manager Interface Overview](SpellListManager-Interface-Overview).

---

## Selecting a List

1. Open the **Spell List Manager** from the **Compendium** tab footer.
2. Locate the list in the sidebar. Hovering a row shows a tooltip with its full name, source pack, and spell count.
3. Click the list to load it.

Every list loads directly into the split view: **Available Spells** on the left, **Current List** on the right. There is no separate edit mode, and there is **no Edit button** — edits are always accepted and held as pending changes until you click **Save**.

Sidebar folders:

| Folder | Description |
|---|---|
| Player Spellbooks | Actor-owned learned-spell journals |
| Custom Lists | GM-created lists (`isCustom` / `isNewList`) |
| Merged Lists | Lists built from two or more sources (`isMerged`) |
| Modified Spell Lists | Auto-created duplicates of standard lists (`isDuplicate`) |
| Spell Lists | System- or module-provided stock lists |
| Hidden Lists | Lists whose UUID is in the `HIDDEN_SPELL_LISTS` setting |

---

## Editing Behavior by List Type

### Standard Lists (the new implicit flow)

Editing a stock list works as follows:

1. Click the stock list in the sidebar.
2. Add or remove spells in the split view. Changes are queued in memory.
3. Click **Save**.

On Save, if the selected list does **not** already carry `isDuplicate`, `isCustom`, `isNewList`, or `actorId` flags, the module automatically:

- Calls `duplicateSpellList`, which creates a copy in the `spell-book.custom-spell-lists` pack under the **Modified Spell Lists** folder. The duplicate is stamped with `{ isDuplicate, originalUuid, originalName, originalModTime, originalVersion }` and mapped through `CUSTOM_SPELL_MAPPINGS`.
- Adds the original UUID to `HIDDEN_SPELL_LISTS` so the stock list stops appearing in the Spell Lists folder. Un-hide it manually from the Hidden Lists folder if you ever need to see it again.
- Writes the pending edits to the duplicate.
- Calls `dnd5e.registry.spellLists.register` on the duplicate via `ensureListRegistered`, so spells you just added start showing the class label on item sheets immediately — no reload needed.

After saving, the sidebar re-selects the duplicate and resets all filter inputs, so the Available Spells panel is not stuck on "no matching spells" from a narrow filter you used earlier.

Subsequent edits of the original UUID transparently route through `CUSTOM_SPELL_MAPPINGS` to the same duplicate.

### Custom, Merged, and Modified Lists

Edits apply directly to the selected document. No duplication step. Save writes the spell set and calls `ensureListRegistered` so new additions are reflected in the registry immediately.

### Actor Spellbooks

Per-actor lists are managed from the actor's sheet and wizard flow, not through the Spell List Manager's editing UI.

---

## Header Buttons

Buttons appear in the selected list's header bar. Visibility depends on list type.

| Icon | Action | Shown When |
|---|---|---|
| Checkbox | **Add to Spell Registry** | Always |
| Pen | **Rename** | List has `isDuplicate`, `isCustom`, `isNewList`, or is merged (not on plain stock lists) |
| User | **Open Actor** | Actor-owned list |
| Scroll | **Open Class** | Class/subclass item is findable in a pack |
| Sync | **Restore** | Modified duplicate whose source has drifted |
| Trash | **Delete** | Always |
| Floppy | **Save** | Always |

Notice: there is no **Edit** button. Editing is always on.

---

## Adding Spells

- Click the **+** icon on an available-spell row.
- Drag a row from **Available Spells** onto **Current List**.

The add guard only rejects the exact same UUID. Two copies of the same spell from different packs will both add — if you want only one, remove the redundant entry manually.

## Removing Spells

- Click the **trash** icon on a current-list row.
- Drag a row from **Current List** onto **Available Spells**.

## Saving

Changes live in memory until you click the **Save** (floppy) icon. Closing the list or switching selection without saving discards pending edits. Stock lists duplicate on save as described above.

---

## Bulk Editing

1. Click the **Selection Mode** toggle (checkmark) in the top-right of the footer.
2. Click spell rows to flag them. Shift-click selects a range.
3. Use **Bulk Save** in the footer to apply every queued add and remove at once.
4. Exit selection mode with **Cancel Selection**.

Selection mode replaces single-row buttons with selection affordances on both panels, and the footer shows a live add/remove counter.

---

## Comparing Spells

When **Compare** is enabled in Details Customization, every spell row shows a balance-scale icon. Clicking it toggles the spell's membership in the comparison set. Once two or more spells are queued, the **Spell Comparison** dialog opens. It has no hard cap and widens as spells are added. If the Spell List Manager is detached, the comparison dialog opens in the same detached window.

---

## Restoring a Modified List

Available only when a modified duplicate has a drifted source (the **Restore** icon only shows in that case).

1. Select the modified list.
2. Click **Restore** (sync).
3. Confirm the prompt.

The duplicate's `system.spells` is overwritten with the source list's current `system.spells`. Any local edits are discarded. `originalModTime` and `originalVersion` are refreshed so Restore only re-appears when the source changes again.

---

## Hiding vs Deleting

### Hide

Every non-actor list row in the sidebar has an **eye** icon. Clicking it adds the list's UUID to `HIDDEN_SPELL_LISTS`, moving the row to the **Hidden Lists** folder. The document is untouched. Click the eye-slash icon in the Hidden Lists folder to restore.

Stock lists are hidden automatically the first time you save edits to them (since the duplicate replaces the original in your workflow).

### Delete

The **Delete** header button removes the list permanently from the custom pack. For modified duplicates, deletion also:

- Removes the entry from `CUSTOM_SPELL_MAPPINGS` so the original UUID no longer redirects.
- Removes the original UUID from `HIDDEN_SPELL_LISTS`, restoring the stock list to the Spell Lists folder.

After deletion the sidebar returns to the list browser (not stuck in filter mode).

Deletion is irreversible. Prefer Hide for temporary removal.

---

## Patterns

### Class-Specific Tweaks

1. Select the stock class list.
2. Add / remove spells, then **Save**. The module duplicates it into Modified Spell Lists, hides the original, and registers the duplicate.
3. Assign the modified list to affected characters in **Spell Book Settings**, or rely on the registry registration.

The system original is preserved. You can always restore it by deleting the duplicate.

### Subclass Additions

Subclass assignment is now explicit. Create a dedicated subclass list (`Subclass Spell List` checkbox in Create), then in each character's **Spell Book Settings** set:

- `Class Spell List` → the base class list.
- `Subclass Spell List` → the new subclass list.

### Conditional Availability

Maintain several lists representing each condition (faction access, story gates, etc.) and swap which is assigned in Spell Book Settings as conditions change. Avoid editing a single live list mid-session.

---

## Testing Changes

1. Assign the modified list to a test character via **Spell Book Settings**.
2. Open the Spell Book on that character.
3. Verify visible, learnable, and prepared spells match expectations.
4. If a spell was added and the class label isn't showing on its item sheet yet, confirm the list appears in the Modified Spell Lists folder and is registry-enabled (the save path registers it automatically).
