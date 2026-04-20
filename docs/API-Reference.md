# Spell Book API Reference

Spell Book exposes its public functionality through a programmatic API so that macros, scripts, and other modules can invoke the same operations the UI does. No helper macros are bundled with the module.

---

## Accessing the API

The API is registered at Foundry `ready` and is available on both the module entry and a global convenience alias:

```js
const api = game.modules.get('spell-book').api;
// or
SPELLBOOK.api.spellBookQuickAccess();
```

Both references point at the same object. All methods are asynchronous and return a `Promise`.

---

## Compatibility

| Surface | Minimum | Verified |
|---|---|---|
| Foundry VTT | 13.351 | 13.351 |
| dnd5e system | 5.3.0 | 5.3.0 |

See [`module.json`](https://github.com/Sayshal/spell-book/blob/main/module.json) for the authoritative compatibility block.

---

## Method Summary

| Method | Audience | Purpose |
|---|---|---|
| [`spellBookQuickAccess()`](#spellbookquickaccess) | All | Open Spell Book for the selected token. |
| [`spellSlotTracker()`](#spellslottracker) | All | Post slot usage summary to chat. |
| [`scrollScanner()`](#scrollscanner) | All | List all spell scrolls in item compendiums. |
| [`spellsNotInLists()`](#spellsnotinlists) | GM | Find spells not referenced by any spell list. |
| [`debugSpell(name)`](#debugspellname) | All | Dump index entries for spells matching a name. |
| [`flagPurge()`](#flagpurge) | GM | Remove all Spell Book flags from actor(s). |

---

## Actor Operations

### `spellBookQuickAccess()`

Opens the Spell Book interface for the currently selected token's actor. Warns if no token is selected, the token has no actor, or the actor has no spell items. This is the recommended way to launch the Spell Book from a hotbar macro or an external trigger outside the character sheet.

**Parameters:** none

**Returns:** `Promise<void>`

**Example:**

```js
// Hotbar macro
game.modules.get('spell-book').api.spellBookQuickAccess();
```

---

### `spellSlotTracker()`

Posts a public chat card summarizing the selected token actor's spell slot usage. The table lists **Level**, **Used**, and **Remaining** for every spell level that has at least one slot. The actor is set as the speaker.

**Parameters:** none

**Returns:** `Promise<void>`

**Example:**

```js
game.modules.get('spell-book').api.spellSlotTracker();
```

---

## Compendium Scanning

### `scrollScanner()`

Scans every `Item` compendium for consumables of subtype `scroll` and presents the results in a resizable dialog. Each row shows the scroll's name and UUID. A **Copy to Console** button dumps the full list (including source pack) to the developer console.

**Parameters:** none

**Returns:** `Promise<void>`

**Example:**

```js
await game.modules.get('spell-book').api.scrollScanner();
```

---

### `spellsNotInLists()`

GM-only. Cross-references every spell across all `Item` compendiums against the spells referenced by every discoverable spell list, then opens a dialog listing spells that appear in no list. Useful for auditing homebrew or third-party spells that need to be added to a custom list.

A **Copy to Console** button logs the full list of `name (uuid)` entries. The Troubleshooter embeds the same audit result in its report.

**Parameters:** none

**Returns:** `Promise<void>`

**Example:**

```js
await game.modules.get('spell-book').api.spellsNotInLists();
```

---

### `debugSpell(name)`

Returns and logs every spell-index entry whose name contains the provided substring (case-insensitive). Intended for diagnosing pack provenance and data-shape issues — for example, determining which compendium a duplicate "Fire Bolt" comes from.

Each result entry contains:

- `name`
- `uuid`
- `compendiumSource` (from `_stats.compendiumSource`)
- `sourceBook` (`system.source.book`)
- `sourceCustom` (`system.source.custom`)
- `level`
- `school`
- `properties` (array)
- `materials`
- `filterData` (the object returned by the internal `extractSpellFilterData` helper, matching the shape used by Spell Book filters)

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `name` | `string` | Substring to match against spell names (case-insensitive). |

**Returns:** `Promise<object[]>` — the same array of summary objects that is logged.

**Example:**

```js
const hits = await game.modules.get('spell-book').api.debugSpell('Fire Bolt');
console.table(hits);
```

---

## GM Maintenance

### `flagPurge()`

GM-only. Prompts for a single eligible actor (or **All Eligible Actors**) and purges every Spell Book module flag from the chosen actor(s), as well as every embedded item that carries a Spell Book flag.

Eligible actors are those with a player owner and at least one spellcasting class. The dialog is destructive and irreversible; a warning is displayed before confirmation.

**Parameters:** none

**Returns:** `Promise<void>`

**Example:**

```js
await game.modules.get('spell-book').api.flagPurge();
```

> [!CAUTION]
> This operation cannot be undone. All Spell Book flags and module-flagged items will be permanently deleted from the selected actor(s).

---

## Hooks

Spell Book emits the following hooks. Register handlers with `Hooks.on` / `Hooks.once`.

| Hook | Payload | When |
|---|---|---|
| `spellBookOpened` | `{ actor, app }` | First render of the Player Spell Book for a given actor. |
| `spellBookClosed` | `{ actor }` | Close of the Player Spell Book. |

**Example:**

```js
Hooks.on('spellBookOpened', ({ actor, app }) => {
  console.log(`Spell Book opened for ${actor.name}`, app);
});
```

Spell Book also listens to `dnd5e.restCompleted` from the dnd5e system to drive rest-based behavior (cantrip/spell swap, swap-tracking cleanup, etc.). It does **not** emit that hook.

---

## Migrating from Macros

Earlier versions of Spell Book installed helper macros into a `spell-book.spell-book-macros` compendium. Those macros have been removed; the equivalent functionality is now invoked through the API.

| Old Macro | API Replacement |
|---|---|
| Quick Access | `api.spellBookQuickAccess()` |
| Slot Tracker | `api.spellSlotTracker()` |
| Scroll Scanner | `api.scrollScanner()` |
| Spells Not In Lists | `api.spellsNotInLists()` |
| Flag Purge | `api.flagPurge()` |
| UUID Cleanup | No direct replacement. |

To recreate a former macro, create a new script macro with a single line such as:

```js
game.modules.get('spell-book').api.spellBookQuickAccess();
```
