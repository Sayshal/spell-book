# Contributing to Spell Book

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Foundry VTT](https://foundryvtt.com/) v14 or higher
- [D&D5e](https://github.com/foundryvtt/dnd5e) system 5.3.0 or higher
- [3DS-ATLAS](https://github.com/Sayshal/3ds-atlas), which provides the logger, theming and every localized string
- A code editor (VS Code recommended)

## Getting Started

```bash
git clone https://github.com/Sayshal/spell-book.git
cd spell-book
npm install
npm run build
```

`npm run build` writes the module to `dist/`. Point a symlink from your Foundry `Data/modules/spell-book`
at that folder, then enable Spell Book in a world. Use `npm run build:watch` while developing for
incremental rebuilds.

For intellisense, the repo expects `foundry/` and `dnd5e/` alongside the source as sibling checkouts.
Both are reference only — never edit them.

## Commands

| Command                 | Description                         |
| ----------------------- | ----------------------------------- |
| `npm run build`         | Production build to `dist/`         |
| `npm run build:watch`   | Watch mode rebuild                  |
| `npm run dev`           | Development build (no minification) |
| `npm run clean`         | Remove `dist/` except packs/storage |
| `npm run lint`          | Run ESLint                          |
| `npm run lint:fix`      | Run ESLint with auto-fix            |
| `npm run format`        | Format with Prettier                |
| `npm run format:check`  | Check formatting                    |
| `npm run stylelint`     | Lint CSS                            |
| `npm run stylelint:fix` | Lint CSS with auto-fix              |
| `npm run validate`      | Run lint + format check + stylelint |

## Project Structure

```text
spell-book/
├── scripts/
│   ├── apps/          # ApplicationV2 windows
│   ├── data/          # Compendium and journal access
│   ├── dialogs/       # DialogV2 and small ApplicationV2 dialogs
│   ├── integrations/  # Optional third-party modules
│   ├── managers/      # Domain logic
│   ├── ui/            # Rendering and formatting helpers
│   └── utils/         # Sheet buttons and cross-cutting helpers
├── styles/            # CSS
├── templates/         # Handlebars templates (.hbs)
├── assets/            # Images and media
├── storage/           # Compendium data (not tracked)
├── .github/workflows/ # CI/CD automation
└── module.json        # Module manifest
```

Each `scripts/` subdirectory has a `_module.mjs` barrel. Import through the barrel unless doing so
would create an import cycle.

## Code Style

ESLint, Prettier and Stylelint configs live in the repo root and are authoritative. Run
`npm run validate` before opening a pull request.

- ES modules (`.mjs`) only
- ApplicationV2 and DialogV2; no legacy Application or Dialog
- Use meaningful names; no abbreviations that need a lookup
- Module-invented class members are `#private`; a leading underscore means a Foundry hook

## Localization

Spell Book has no `lang/` directory. Every user-facing string lives in
[3DS-ATLAS](https://github.com/Sayshal/3ds-atlas) under `lang/`, keyed `SPELLBOOK.*`, with shared
strings under `ATLAS.Common.*`.

- Add or change **English** keys in `3ds-atlas/lang/en.json` only; translations are handled separately
- Removing a key means removing it from every language file in the same change
- Run `npm run build` in `3ds-atlas` after editing — Foundry loads `dist/lang/en.json`, not the source

## Testing

There is no automated test suite. Before submitting changes:

1. Test in a clean Foundry world with only the required modules
2. Verify both dnd5e Legacy (2014) and Modern (2024) rule sets
3. Test with multiclass characters if touching preparation logic
4. Check the console for errors or warnings
5. Test from both player and GM perspectives

## Submitting Changes

All pull requests **must** reference an open issue. Open one first if none exists.

1. Fork the repository and create a branch from `main`.
2. Make your changes in focused, logical commits.
3. Run `npm run validate`.
4. Open a pull request against `main` and reference the issue (e.g. `Closes #123`).

## Reporting Issues

Use [GitHub Issues](../../issues) with the appropriate template:

- **Bug Report** — defects or unexpected behavior
- **Feature Request** — new functionality or enhancements

Include steps to reproduce, expected vs actual behavior, and your Foundry VTT and dnd5e versions.

## Releases

Releases are cut by pushing a `release-*` tag; `.github/workflows/release.yml` triggers on that tag,
not on commits to `main`.

- Tag format is `release-X.Y.Z`, and the version must match `module.json`
- The workflow builds, zips, publishes the GitHub release, notifies the Foundry package API and posts to Discord

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
