# Spell Book Roadmap

## Current Features (v0.7.0)

### Core Functionality

- Multi-class spell management with separate tabs and preparation tracking
- Advanced filtering system with 13+ filter types and custom configurations
- Wizard spellbook system with spell copying, costs, and ritual casting
- Cantrip management with class-specific rules and swapping modes
- GM Spell List Manager for viewing, editing, and creating spell lists
- Custom and merged spell lists with compendium management
- Ritual casting support with class-specific rules
- Long rest integration with spell/cantrip swapping prompts
- Scroll learning system for wizards
- Rule set system (Legacy vs Modern) with per-class configuration
- Enforcement behaviors (Unenforced, Notify GM, Enforced)

### Technical Features

- API for module integration
- Tidy5e sheet integration
- Utility macros (Flag Purge, Scroll Scanner, etc.)

### Unfinished/Needs Polish

- Error handling in some edge cases
- Scroll scanner functionality is basic
- Complex spell discovery logic with potential edge cases

### Expansion Opportunities

- Enhanced wizard features (spell research, spell variants)
- Advanced ritual casting (ritual components, timing)
- Better visual theming and customization
- Import/export functionality for spell data
- Spell usage analytics and recommendations
- Enhanced API for third-party integrations

## Roadmap

### v0.8.0 - Quality of Life & Bug Fixes (Next Release)

**Priority: Critical Bug Fixes & User Requests**

**Fix Class Rules Bug**

Auto-purge outdated class rules and spell data when switching between classes or if a class is no longer detected on the actor. Improve class detection and cleanup logic.

**Code justification:** In `spellbook-state.mjs`, the `detectSpellcastingClasses()` method detects current classes but doesn't clean up data from removed classes. The `classSpellData` and `spellcastingClasses` objects can retain stale entries. Additionally, in `rule-set-manager.mjs`, the `getClassRules()` method falls back to defaults but doesn't clean up invalid stored rules. The `_stateManager._classesChanged` flag in `player-spell-book.mjs` suggests this is a known issue that needs proper cleanup logic.

**Spell Loadouts System**

Create preset spell configurations for different scenarios (Combat, Utility, Exploration, etc.) with quick-switch functionality and save/load custom loadouts per character.

**Code justification:** Currently, users must manually prepare spells for different situations. The `PlayerSpellBook.formHandler()` in `player-spell-book.mjs` handles individual spell preparation changes, but there's no way to save/restore entire configurations. The complex preparation logic in `spell-manager.mjs` would benefit from being able to apply batch changes from saved loadouts. This would significantly improve user experience for characters with many spells.

**Multi-Select in Spell Manager**

Enable batch operations for spell list management, including selecting multiple spells for deletion/modification and bulk operations with progress indicators.

**Code justification:** In `gm-spell-list-manager.mjs`, all spell operations are individual (`handleAddSpell`, `handleRemoveSpell`). The `_filterAvailableSpells()` method processes hundreds of spells, but users must add/remove them one by one. The `pendingChanges` object tracks individual changes, but there's no mechanism for batch operations. This becomes tedious when managing large spell lists.

**Spell List Hiding**

Hide duplicate/merged spell lists with toggle controls, implement a "Hidden" tab in the spell list manager, and provide optional auto-hide functionality after merging operations.

**Code justification:** In `gm-spell-list-manager.mjs`, the `_prepareContext()` method shows all spell lists (merged, custom, standard, actor-owned) simultaneously. The `mergedLists` and `customLists` arrays can create visual clutter when users have many variations of the same base lists. There's no mechanism to hide lists that are no longer actively needed, leading to overcrowded interfaces.

### v0.9.0 - Enhanced User Experience

**Priority: Usability & Interface Improvements**

**Advanced Search & Discovery**

Implement saved search presets, spell recommendations based on class/level, "similar spells" suggestions, and global search across all spell lists.

**Code justification:** The current filtering system in `spellbook-filters.mjs` is functional but basic. The `_filterAvailableSpells()` method applies filters sequentially, but users must recreate complex filter combinations each time. The `spell-discovery.mjs` file shows there's logic for finding spells by class, but no recommendation engine. The extensive spell metadata in `spell-formatting.mjs` (`extractSpellFilterData`) could power a sophisticated recommendation system.

**Spell Notes & Favorites**

Add personal notes on spells, favorite spell marking system, and spell usage history tracking.

**Code justification:** Currently, spells only display system data from `spell-formatting.mjs` (`formattedDetails`, `enrichedIcon`). There's no way for users to add personal notes or mark favorites. The spell objects in `actor-spells.mjs` could be extended with user metadata. The preparation tracking system in `spell-manager.mjs` shows the infrastructure exists for tracking spell interactions, but it's only used for preparation state.

**Visual Enhancements**

Implement side-by-side spell comparison view for detailed analysis of similar spells.

**Code justification:** The rich spell data structure in `spell-formatting.mjs` includes `formattedDetails`, `filterData`, and `enrichedIcon`, providing all necessary information for comparison. Currently, users must open spells individually to compare them. The UI infrastructure in `spellbook-ui.mjs` could support split-pane or modal comparison views.

### v1.0.0 - Feature Complete Release

**Priority: Advanced Features & Polish**

**Sharing & Collaboration**

Share spell loadouts between players, export/import spell configurations, and provide template loadouts for common builds.

**Code justification:** The current system is entirely local to each actor. The `spell-manager.mjs` `saveClassSpecificPreparedSpells()` method creates complex preparation data that could be exported. The loadout system (v0.8.0) would provide the foundation for sharing configurations. The existing compendium system in `compendium-management.mjs` shows how data can be stored and shared between users.

**Analytics & Insights**

Provide spell usage statistics, preparation pattern analysis, and optimization suggestions for spell selection.

**Code justification:** The system tracks extensive preparation data in `FLAGS.PREPARED_SPELLS_BY_CLASS` and cantrip changes in `cantrip-manager.mjs`, but this data isn't analyzed. The `SpellbookState` class maintains detailed spell data that could be aggregated for insights. The complex rule system in `rule-set-manager.mjs` could suggest optimizations based on class rules and usage patterns.

**Accessibility**

Improve contrast between background and text elements throughout the interface and enhance light mode support.

**Code justification:** The current theming system in `color-utils.mjs` focuses on class-specific colors but doesn't ensure sufficient contrast ratios. The `applyClassColors()` function extracts dominant colors but the contrast adjustment in `A()` function may not meet WCAG guidelines. The UI elements in `spellbook-ui.mjs` don't consistently use accessible markup patterns.

### v1.1.0+ - Advanced Features

**Priority: Power User & GM Tools**

**Advanced Wizard Features**

Implement spell research mechanics, spell variant management, advanced spellbook customization, and spell component tracking.

**Code justification:** The current `wizard-spellbook-manager.mjs` provides basic spell copying with cost/time tracking, but lacks research mechanics. The `getCopyingCost()` and `getCopyingTime()` methods are simple level-based calculations that could be expanded for research. The ritual system in `ritual-manager.mjs` shows the framework for advanced spell mechanics. The journal-based spellbook system could support variant tracking and custom spell modifications.

**GM Enhancement Tools**

Implement encounter-based spell tracking, player spell usage monitoring, advanced spell list analytics, and custom spell creation tools.

**Code justification:** The current `gm-spell-list-manager.mjs` focuses on list management but lacks player monitoring tools. The notification system in `cantrip-manager.mjs` (`sendComprehensiveGMNotification`) shows the foundation for GM alerts, but it's limited to rule violations. The extensive spell data in the system could power usage analytics. The existing custom spell list creation in `compendium-management.mjs` could be expanded to custom spell creation.

## Implementation Priority Matrix

### High Impact, Low Effort

- **Spell Loadouts** - Builds on existing preparation system, high user value
- **Multi-select in Spell Manager** - UI enhancement to existing functionality
- **Class Rules Bug Fix** - Critical stability improvement using existing cleanup patterns

### High Impact, High Effort

- **Advanced Search System** - Requires new recommendation algorithms and UI
- **Analytics Dashboard** - Needs data aggregation system and new UI components

### Low Impact, Low Effort

- **Spell Notes** - Simple data extension to existing spell objects
- **Minor UI Polish** - Incremental improvements to existing interfaces

### Low Impact, High Effort

- **Advanced Wizard Research** - Complex new mechanics with limited user base
