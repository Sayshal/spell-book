# Spell Book Roadmap

### v0.8.0 - Quality of Life & Bug Fixes (Next Release)

**Priority: Critical Bug Fixes & User Requests**

#### **Fix Class Rules Bug [Critical]**

Auto-purge outdated class rules and spell data when switching between classes or if a class is no longer detected on the actor. Improve class detection and cleanup logic.

**Code justification:** In `spellbook-state.mjs`, the `detectSpellcastingClasses()` method detects current classes but doesn't clean up data from removed classes. The `classSpellData` and `spellcastingClasses` objects can retain stale entries. Additionally, in `rule-set-manager.mjs`, the `getClassRules()` method falls back to defaults but doesn't clean up invalid stored rules. The `_stateManager._classesChanged` flag in `player-spell-book.mjs` suggests this is a known issue that needs proper cleanup logic.

**Implementation approach:**

- Add cleanup callbacks to `detectSpellcastingClasses()`
- Implement data validation on actor updates
- Create migration utility for existing corrupted saves

#### **Spell Loadouts System [High Priority]**

Create preset spell configurations for different scenarios (Combat, Utility, Exploration, etc.) with quick-switch functionality and save/load custom loadouts per character.

**Code justification:** Currently, users must manually prepare spells for different situations. The `PlayerSpellBook.formHandler()` in `player-spell-book.mjs` handles individual spell preparation changes, but there's no way to save/restore entire configurations. The complex preparation logic in `spell-manager.mjs` would benefit from being able to apply batch changes from saved loadouts. This would significantly improve user experience for characters with many spells.

**Features to include:**

- Preset templates for common scenarios (Combat, Utility, Exploration, Social)
- Custom loadout creation with names and descriptions
- Quick-switch buttons in the spell book interface
- Validation when switching loadouts (available slots, spell access)
- Loadout conflict resolution prompts

#### **Multi-Select in Spell Manager [High Priority]**

Enable batch operations for spell list management, including selecting multiple spells for deletion/modification and bulk operations with progress indicators.

**Code justification:** In `gm-spell-list-manager.mjs`, all spell operations are individual (`handleAddSpell`, `handleRemoveSpell`). The `_filterAvailableSpells()` method processes hundreds of spells, but users must add/remove them one by one. The `pendingChanges` object tracks individual changes, but there's no mechanism for batch operations. This becomes tedious when managing large spell lists.

**Implementation details:**

- Add checkbox selection for multiple spells
- Implement Ctrl+Click and Shift+Click selection patterns
- Create bulk operation dialogs with confirmation
- Add progress bars for large batch operations
- Include undo functionality for batch changes

#### **Spell List Hiding [Medium Priority]**

Hide duplicate/merged spell lists with toggle controls, implement a "Hidden" tab in the spell list manager, and provide optional auto-hide functionality after merging operations.

**Code justification:** In `gm-spell-list-manager.mjs`, the `_prepareContext()` method shows all spell lists (merged, custom, standard, actor-owned) simultaneously. The `mergedLists` and `customLists` arrays can create visual clutter when users have many variations of the same base lists. There's no mechanism to hide lists that are no longer actively needed, leading to overcrowded interfaces.

**Features:**

- Toggle visibility controls for each spell list
- "Hidden" tab to manage archived lists
- Auto-hide suggestions after merge operations
- Restore hidden lists functionality

#### **Performance Improvements [Medium Priority]**

- Implement virtual scrolling for large spell lists (1000+ spells)
- Add lazy loading for spell details and icons
- Optimize re-render cycles in frequently updated components
- Cache frequently accessed spell data

## **Non-Standard Spellcasting Classes Support [High Priority]**

Support homebrew and edge-case spellcasting classes that don't follow standard spell progression patterns, including cantrip-only casters and ritual-only casters.

**Use Cases:**

- **Warmage**: Cantrip-only caster with `cantrips-known` scale but no spell progression
- **Investigator**: Ritual-only caster with no spell progression
- **Other homebrew classes**: Custom spellcasting patterns that don't fit standard progressions

**Code justification:** Currently, `spellbook-state.mjs` and `rule-set-manager.mjs` filter out classes where `spellcasting.progression` is missing or set to `'none'`. The detection logic in `detectSpellcastingClasses()` and `_detectSpellcastingClasses()` excludes these classes entirely:

### v0.9.0 - Enhanced User Experience & Multi 5e System Support

**Priority: Usability & Interface Improvements**

#### **Advanced Search & Discovery [High Priority]**

Implement saved search presets, spell recommendations based on class/level, "similar spells" suggestions, and global search across all spell lists.

**Code justification:** The current filtering system in `spellbook-filters.mjs` is functional but basic. The `_filterAvailableSpells()` method applies filters sequentially, but users must recreate complex filter combinations each time. The `spell-discovery.mjs` file shows there's logic for finding spells by class, but no recommendation engine. The extensive spell metadata in `spell-formatting.mjs` (`extractSpellFilterData`) could power a sophisticated recommendation system.

**Features to add:**

- Save frequently used filter combinations with custom names
- Spell recommendations based on character level and class
- "Find similar spells" feature using spell tags and properties
- Global search that works across all available spell sources
- Search history with one-click reapplication

#### **Spell Notes & Favorites [High Priority]**

Add personal notes on spells, favorite spell marking system, and spell usage history tracking.

**Code justification:** Currently, spells only display system data from `spell-formatting.mjs` (`formattedDetails`, `enrichedIcon`). There's no way for users to add personal notes or mark favorites. The spell objects in `actor-spells.mjs` could be extended with user metadata. The preparation tracking system in `spell-manager.mjs` shows the infrastructure exists for tracking spell interactions, but it's only used for preparation state.

**Implementation:**

- Add notes field to spell data structure
- Implement star/favorite toggle in spell lists
- Track spell usage frequency and last used dates
- Create "Favorites" filter option
- Add notes display in spell tooltips and details

#### **Visual Enhancements [Medium Priority]**

Implement side-by-side spell comparison view for detailed analysis of similar spells.

**Code justification:** The rich spell data structure in `spell-formatting.mjs` includes `formattedDetails`, `filterData`, and `enrichedIcon`, providing all necessary information for comparison. Currently, users must open spells individually to compare them. The UI infrastructure in `spellbook-ui.mjs` could support split-pane or modal comparison views.

**Features:**

- Compare up to 3 spells side-by-side
- Highlight differences between compared spells
- Quick comparison from search results
- Save comparison configurations

#### **Update Properties for 5.X [Critical]**

Update various `CONFIG.DND5E` references to new 5e standard for full compatibility with dnd5e v4.0+.

**Code justification:** Many instances of `label` → `name`, and `icon` → `img`, etc. need updating throughout the codebase.

**Required changes:**

- Update all property references to new naming conventions
- Maintain backwards compatibility with legacy systems
- Update compendium integration patterns
- Test thoroughly with both old and new dnd5e versions

### v1.0.0 - Feature Complete Release

**Priority: Advanced Features & Polish**

#### **Sharing & Collaboration [High Priority]**

Share spell loadouts between players, export/import spell configurations, and provide template loadouts for common builds.

**Code justification:** The current system is entirely local to each actor. The `spell-manager.mjs` `saveClassSpecificPreparedSpells()` method creates complex preparation data that could be exported. The loadout system (v0.8.0) would provide the foundation for sharing configurations. The existing compendium system in `compendium-management.mjs` shows how data can be stored and shared between users.

**Features:**

- Export loadouts to JSON files for sharing
- Import shared loadouts with validation
- Community loadout templates for popular builds
- Party coordination features (avoid spell overlap)

#### **Analytics & Insights [Medium Priority]**

Provide spell usage statistics, preparation pattern analysis, and optimization suggestions for spell selection.

**Code justification:** The system tracks extensive preparation data in `FLAGS.PREPARED_SPELLS_BY_CLASS` and cantrip changes in `cantrip-manager.mjs`, but this data isn't analyzed. The `SpellbookState` class maintains detailed spell data that could be aggregated for insights. The complex rule system in `rule-set-manager.mjs` could suggest optimizations based on class rules and usage patterns.

**Analytics to include:**

- Most/least used spells over time
- Spell slot efficiency analysis
- Preparation pattern insights
- Spell selection optimization suggestions based on actual usage

#### **Accessibility [Medium Priority]**

Improve contrast between background and text elements throughout the interface and enhance light mode support.

**Code justification:** The current theming system in `color-utils.mjs` focuses on class-specific colors but doesn't ensure sufficient contrast ratios. The `applyClassColors()` function extracts dominant colors but the contrast adjustment in `A()` function may not meet WCAG guidelines. The UI elements in `spellbook-ui.mjs` don't consistently use accessible markup patterns.

**Improvements:**

- Ensure WCAG 2.1 AA compliance for contrast ratios

#### **Styling [Medium Priority]**

Convert to using `dnd5e2` base styling everywhere for seamless integration.

**Code justification:** 5e styling will make Spell Book feel like part of the system itself, which is appealing for various reasons.

### v1.1.0+ - Advanced Features

**Priority: Power User & GM Tools**

#### **Advanced Wizard Features [Medium Priority]**

Implement spell research mechanics, spell variant management, advanced spellbook customization, and spell component tracking.

**Code justification:** The current `wizard-spellbook-manager.mjs` provides basic spell copying with cost/time tracking, but lacks research mechanics. The `getCopyingCost()` and `getCopyingTime()` methods are simple level-based calculations that could be expanded for research. The ritual system in `ritual-manager.mjs` shows the framework for advanced spell mechanics. The journal-based spellbook system could support variant tracking and custom spell modifications.

**Advanced features:**

- Spell research system with time and resource tracking
- Spell variant creation and management
- Custom spellbook themes and layouts
- Component tracking and management
- Enhanced familiar spell sharing

#### **GM Enhancement Tools [High Priority]**

Implement encounter-based spell tracking, player spell usage monitoring, advanced spell list analytics, and custom spell creation tools.

**Code justification:** The current `gm-spell-list-manager.mjs` focuses on list management but lacks player monitoring tools. The notification system in `cantrip-manager.mjs` (`sendComprehensiveGMNotification`) shows the foundation for GM alerts, but it's limited to rule violations. The extensive spell data in the system could power usage analytics. The existing custom spell list creation in `compendium-management.mjs` could be expanded to custom spell creation.

**GM tools to add:**

- Real-time party spell slot tracking dashboard
- Player spell usage monitoring and analytics
- Encounter balancing based on available party spells
- Custom spell creation wizard with balance validation
- Campaign-specific spell availability rules

## Implementation Priority Matrix

### High Impact, Low Effort

- **Spell Loadouts** - Builds on existing preparation system, high user value
- **Multi-select in Spell Manager** - UI enhancement to existing functionality
- **Class Rules Bug Fix** - Critical stability improvement using existing cleanup patterns
- **Spell Notes & Favorites** - Simple data extension to existing spell objects

### High Impact, High Effort

- **Advanced Search System** - Requires new recommendation algorithms and enhanced UI
- **Analytics Dashboard** - Needs data aggregation system and new UI components
- **GM Enhancement Tools** - Complex new monitoring and analysis systems

### Medium Impact, Low Effort

- **Spell List Hiding** - Simple visibility controls for existing lists
- **Visual Enhancements** - Incremental improvements to existing interfaces
- **5e Property Updates** - Critical for compatibility but straightforward changes

### Low Impact, High Effort

- **Advanced Wizard Research** - Complex new mechanics with limited user base
- **Comprehensive Analytics** - Extensive data processing with uncertain user adoption

## Development Notes

### Code Architecture Status

**Already Implemented Well:**

- **Sophisticated state management system** (`spellbook-state.mjs`) with caching, preservation, and restoration
- **Comprehensive logging system** (`logger.mjs`) with levels, caller context, and in-memory storage
- **Modular manager architecture** (CantripManager, SpellManager, RitualManager, etc.) with clear separation of concerns
- **Extensive caching strategies** throughout managers for performance optimization
- **Structured API system** (`api.mjs`) for third-party integration

**Areas for Improvement:**

- **Virtual scrolling/lazy loading** for large spell collections not yet implemented
- **Batch operations** in GM Spell List Manager need implementation
- **Data validation and cleanup** for class rule changes could be more robust
- **Mobile/tablet UI optimization** needs attention
- **Automated testing framework** completely missing

### User Experience Priorities

**Current Strengths:**

- **Rich UI state management** with tab preservation and filter caching
- **Class-specific color theming** and visual feedback systems
- **Comprehensive error handling** with user-friendly notifications
- **Sophisticated preparation enforcement** with multiple behavior modes

**Improvement Opportunities:**

- **Reduce clicks for common operations** - loadout system would address this
- **Streamline filter management** - saved filter presets needed
- **Enhance spell discovery** - recommendation system would help new users
- **Improve loading performance** - virtual scrolling for 1000+ spell lists

### Technical Debt Analysis

**Well-Maintained Areas:**

- **Consistent error handling patterns** with try-catch blocks and logging throughout
- **Modern ES6+ patterns** used consistently across modules
- **Effective memory management** with cache invalidation and cleanup methods
- **Good separation of concerns** between UI, state, and business logic

**Technical Debt to Address:**

- **Code duplication** in spell processing between different managers
- **Complex interdependencies** between state manager and UI components
- **Legacy compatibility code** for dnd5e version differences
- **Inconsistent async/await patterns** in some older modules

### Performance Optimization Status

**Current Optimizations:**

- **Extensive caching systems** in CantripManager, WizardSpellbookManager, and SpellbookState
- **Lazy initialization** of managers and expensive operations
- **Efficient DOM manipulation** with minimal re-renders
- **Debounced filter application** to reduce unnecessary processing

**Needed Optimizations:**

- **Virtual scrolling** for spell lists with 500+ items
- **Web Workers** for heavy spell processing operations
- **IndexedDB integration** for offline spell data caching
- **Bundle splitting** for faster initial load times

### Integration Patterns

**Current Integrations:**

- **Native dnd5e integration** with proper hooks and system compatibility
- **Tidy5e sheet integration** with seamless UI embedding
- **Compendium management** with proper pack handling and indexing

**Integration Improvements Needed:**

- **Better module conflict detection** and resolution
- **Enhanced API documentation** for third-party developers
- **Standardized event system** for module communication
- **Plugin architecture** for custom spell sources
