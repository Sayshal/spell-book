# Macros

Spell Book installs 6 macros to the `spell-book.spell-book-macros` compendium. Drag any macro to your hotbar to use it. Obsolete macros are automatically cleaned up on startup.

---

## Available Macros

| Macro | Description | Access |
|---|---|---|
| Quick Access | Opens Spell Book for selected token | All |
| Slot Tracker | Posts spell slot usage to chat | All |
| Scroll Scanner | Lists all spell scrolls from compendiums | All |
| Spells Not In Lists | Finds spells missing from all spell lists | All |
| Flag Purge | Removes all Spell Book data from actor(s) | GM Only |
| UUID Cleanup | Validates/removes broken spell UUIDs from lists | GM Only |

---

## Quick Access

Opens the Spell Book interface for the currently selected token.

**How to use:**
1. Select a token on the canvas
2. Run the macro from your hotbar

The macro checks that the token has an associated actor with spells before opening. If no token is selected, a warning notification is shown.

---

## Slot Tracker

Posts the selected token's spell slot usage to chat as a formatted table.

**How to use:**
1. Select a token on the canvas
2. Run the macro from your hotbar

The chat message displays each spell level's used and remaining slots. Only levels with at least one slot are shown.

---

## Scroll Scanner

Scans all item compendiums and lists every spell scroll found.

**How to use:**
1. Run the macro from your hotbar
2. Wait for the scan to complete (may take a moment with many packs)
3. Review the results dialog showing scroll names and UUIDs
4. Optionally click **Copy to Console** to log the full list

---

## Spells Not In Lists

Identifies spells across all compendiums that are not included in any spell list. Useful for finding homebrew or third-party spells that need to be added to custom lists.

**How to use:**
1. Run the macro from your hotbar
2. Wait for the scan to complete
3. Review the results dialog showing spell names and sources
4. Optionally click **Copy to Console** to log the full list

---

## Flag Purge

Removes all Spell Book module flags and items from selected actor(s).

> [!CAUTION]
> This is a destructive operation that cannot be undone. All Spell Book data (flags and items) will be permanently deleted from the selected actor(s).

**How to use:**
1. Run the macro from your hotbar (GM only)
2. Select a specific actor or **All Eligible Actors** from the dropdown
3. Click **Purge Flags** to confirm

Only actors with player ownership and spellcasting classes appear in the list.

---

## UUID Cleanup

Validates all spell UUIDs in custom spell lists and removes entries that fail to resolve.

> [!IMPORTANT]
> Enable all modules containing spells you use before running this macro. Spells from disabled packs will fail UUID resolution and be removed from your lists.

**How to use:**
1. Ensure all relevant spell packs are enabled
2. Run the macro from your hotbar (GM only)
3. Read the warning dialog carefully
4. Click **Proceed with Cleanup** to confirm

The macro processes all journal packs owned by Spell Book, checks every spell UUID, and removes invalid entries. Results are logged to the console with detailed per-list breakdowns.
