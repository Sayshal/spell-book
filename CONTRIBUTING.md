# Contributing to Spell Book

Thanks for your interest in contributing to Spell Book. This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Foundry VTT core version v13 or higher
- D&D5e system version 5.1.10 or higher
- A code editor (VS Code recommended)

### Development Setup

1. Clone the repository:

```bash
git clone https://github.com/Sayshal/spell-book.git
cd spell-book
```

2. Create a symbolic link to your Foundry modules directory:

```bash
# Windows (PowerShell as Admin)
New-Item -ItemType SymbolicLink -Path "C:\Users\YourName\AppData\Local\FoundryVTT\Data\modules\spell-book" -Target "path\to\cloned\repo"

# macOS/Linux
ln -s /path/to/cloned/repo ~/Library/Application\ Support/FoundryVTT/Data/modules/spell-book
```

3. Enable Hot Reload module in Foundry (optional but recommended) for instant CSS/HTML updates

4. Launch Foundry and enable Spell Book in a test world

## Project Structure

```text
spell-book/
├── scripts/           # JavaScript modules (.mjs)
├── styles/            # CSS stylesheets
├── templates/         # Handlebars templates (.hbs)
├── lang/              # Localization files (JSON)
├── assets/            # Images and media
├── storage/           # Compendium data (not tracked)
├── .github/workflows/ # CI/CD automation
└── module.json        # Module manifest
```

## Making Changes

### Code Style

- Use ES6+ features and module syntax (.mjs)
- Follow existing code patterns and naming conventions
- Add JSDoc comments for functions and classes
- Keep functions focused and single-purpose
- Use meaningful variable and function names

### Testing

Before submitting changes:

1. Test in a clean Foundry world with only required modules
2. Verify compatibility with both dnd5e Legacy (2014) and Modern (2024) rules
3. Test with multiclass characters if touching preparation logic
4. Check console for errors or warnings
5. Test both player and GM perspectives

### Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Commit with clear messages: `git commit -m "Add feature: brief description"`
5. Push to your fork: `git push origin feature/your-feature-name`
6. Open a Pull Request against the `main` branch

### Commit Messages

Keep commit messages clear and descriptive:

- Use present tense: "Add feature" not "Added feature"
- Reference issues when applicable: "Fix #123: Resolve preparation limit bug"
- For releases, use semantic versioning in commit title: `1.2.3`

### Pull Requests

- Provide a clear description of changes
- Link related issues
- Include screenshots for UI changes
- Ensure all tests pass
- Be responsive to feedback

## Areas for Contribution

### Bug Fixes

Check the Issues tab for reported bugs. Include steps to reproduce when reporting new bugs.

### Features

Discuss major features in an issue before implementing to ensure alignment with project goals.

### Documentation

Help improve wiki pages, code comments, or user guides.

### Localization

Contribute translations for the module. Language files are in `/lang`.

## Building and Releases

Releases are automated via GitHub Actions when version commits are pushed to `main`:

- Commit message must include version number: `1.2.3`
- Workflow updates `module.json`, creates zip, publishes release
- Notifies Foundry package API and Discord webhook

Do not manually edit version numbers in `module.json` - the workflow handles this.

## Questions?

Open an issue for questions about contributing or development setup.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
