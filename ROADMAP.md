# Spell Book Roadmap

### v0.9.0 - Enhanced User Experience & Multi 5e System Support (Next Release)

**Priority: Usability & Interface Improvements**

#### **Advanced Search & Discovery [COMPLETED]**

Implemented advanced Google-style search with syntax support, search history, and intelligent suggestions for enhanced spell discovery.

**Implementation summary:** The advanced search system in `advanced-search-manager.mjs` provides a sophisticated search interface with field-based queries, autocomplete suggestions, and search history. The `QueryParser` and `QueryExecutor` classes enable complex filtering using `^field:value` syntax with AND operations. The system integrates seamlessly with existing filters in `spellbook-filters.mjs` and provides real-time suggestions with accessibility support.

**Features implemented:**

- ✅ Advanced search syntax with `^field:value AND field:value` queries
- ✅ Recent search history with one-click reapplication and management
- ✅ Intelligent autocomplete with field and value suggestions
- ✅ Fuzzy spell name matching with real-time suggestions
- ✅ Global search across all available spell sources
- ✅ Accessibility support with proper ARIA labels and keyboard navigation
- ✅ Integration with existing filter system for seamless user experience
- ✅ Debounced search performance with caching for optimal responsiveness

#### **Spell Notes & Favorites [COMPLETED]**

Implemented comprehensive spell user data system with personal notes, favorites tracking, automatic usage analytics, and data management dashboard.

**Implementation summary:** The spell user data system uses journal-based storage in `spell-user-data.mjs` for persistent per-user spell metadata. The `SpellNotesDialog` ApplicationV2 provides intuitive notes editing, while favorite toggles integrate seamlessly into spell displays. The `SpellUsageTracker` automatically monitors spell casting via the `dnd5e.activityConsumption` hook, detecting combat vs exploration context for detailed analytics. The `SpellAnalyticsDashboard` offers both personal and GM views with comprehensive statistics, export/import functionality, and real-time usage tracking controls.

**Features implemented:**

- ✅ Journal-based user data storage with automatic backup and migration
- ✅ Personal spell notes with rich text editing and character limits
- ✅ Favorite spell marking system with star toggles and filter integration
- ✅ Automatic usage tracking via D&D5e activity consumption hooks
- ✅ Combat vs exploration context detection for detailed analytics
- ✅ Comprehensive analytics dashboard with personal and GM views
- ✅ Most/least used spells analysis and recent activity tracking
- ✅ Data export/import functionality with JSON backup/restore
- ✅ Real-time usage statistics and context breakdown visualization
- ✅ Session state management for immediate UI responsiveness
- ✅ Canonical UUID handling for consistent cross-compendium tracking
- ✅ GM monitoring tools for viewing all player spell usage patterns

#### **Spell List Renaming [COMPLETED]**

Implemented ability to rename custom spell lists after creation, providing better organization and management for users who create multiple lists.

**Implementation summary:** The spell list renaming system in `gm-spell-list-manager.mjs` provides comprehensive rename functionality with validation and error handling. The `_performRename()` method updates both journal entry names and parent compendium metadata, while `_checkDuplicateName()` prevents conflicts. The rename dialog template `rename-spell-list.hbs` offers a user-friendly interface with real-time validation. The system preserves all spell list references and actor associations during rename operations, ensuring data integrity across the module.

**Features implemented:**

- ✅ Rename option in spell list context menus with tooltip guidance
- ✅ Dedicated rename dialog with current name display and validation
- ✅ Duplicate name detection to prevent conflicts with existing lists
- ✅ Real-time validation with user-friendly error messages
- ✅ Comprehensive compendium metadata updates during rename operations
- ✅ Preservation of spell list references and actor associations
- ✅ Success/error notifications with detailed feedback
- ✅ Restriction to renameable list types (custom and merged lists only)
- ✅ Automatic UI refresh and list re-selection after rename completion
- ✅ Integration with existing GM spell list manager workflow

#### **Visual Enhancements [COMPLETED]**

Implemented side-by-side spell comparison view for detailed analysis of similar spells.

**Implementation summary:** The spell comparison system provides a comprehensive side-by-side analysis tool through the `SpellComparisonDialog` ApplicationV2 class. The system integrates seamlessly with the existing PlayerSpellBook via always-visible "Compare" links in spell items, using the established data-action pattern. State management maintains comparison selections across renders until dialog closure. The comparison table displays spell properties as rows with spells as columns, highlighting key differences like maximum damage values. The configurable limit system (2-7 spells, default 3) provides flexibility beyond the original scope, while the separate dialog window allows for independent positioning and usage alongside the main spellbook.

**Features implemented:**

- ✅ Side-by-side spell comparison with structured table layout (properties as rows, spells as columns)
- ✅ Always-visible "Compare" links integrated into spell items with active state indicators
- ✅ Independent ApplicationV2 comparison dialog that can be positioned anywhere
- ✅ Configurable spell comparison limit (2-7 spells, default 3, GM configurable via world settings)
- ✅ State persistence across app renders and tab swaps, cleared only on dialog close
- ✅ Difference highlighting for highest damage/dice values with extensible framework
- ✅ Comprehensive spell property comparison (level, school, casting time, range, duration, components, damage)
- ✅ Error handling and graceful fallbacks for missing spell data
- ✅ Accessibility support with proper ARIA labels and screen reader compatibility
- ✅ Integration with existing spell formatting and data extraction systems
- ✅ Responsive design with proper overflow handling and table layout
- ✅ Localization support with comprehensive language strings

#### **Update Properties for 5.X [COMPLETED]**

Update various `CONFIG.DND5E` references to new 5e standard for full compatibility with dnd5e v5.0+ and Foundry V13.

**Implementation summary:** The V12/V13 compatibility system implements intelligent property detection through the `genericUtils.getConfigLabel()` helper function, which automatically determines whether CONFIG objects use `.label` (V12) or `.name` (V13) properties. The system updates all filter generation, spell formatting, and field validation functions to use this compatibility layer. The `MODULE.ISV13` flag enables version-specific code paths for deprecation warnings like the DragDrop namespace change. All major functions in `compendium-management.mjs`, `filters.mjs`, `spell-formatting.mjs`, `field-definitions.mjs`, `query-parser.mjs`, and `gm-spell-list-manager.mjs` have been updated to use the new dual-compatibility approach. The form elements system has been modernized to use `dnd5e.applications.fields` methods directly, dropping legacy 3.3.1 support.

**Features implemented:**

- ✅ Intelligent CONFIG property detection with automatic `.label` vs `.name` handling
- ✅ Universal compatibility helper `genericUtils.getConfigLabel()` for all CONFIG objects
- ✅ Updated damage type filter generation with dual V12/V13 support
- ✅ Updated condition filter generation with proper property handling
- ✅ Updated spell school formatting and validation across all contexts
- ✅ Updated spell preparation mode localization with version compatibility
- ✅ Updated advanced search field validation and autocomplete systems
- ✅ Fixed DragDrop deprecation warnings with V13 namespace compatibility
- ✅ Modernized form element creation using official dnd5e.applications.fields methods
- ✅ Comprehensive testing and validation across all filter and search functions
- ✅ Backward compatibility maintenance for V12 systems
- ✅ Future-proof architecture supporting potential further CONFIG structure changes

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

#### **Compendium Indexing Performance [High Priority]**

Implement selective compendium indexing and persistent caching to dramatically reduce spell list loading times, especially for users with extensive compendium collections.

**Code justification:** The current `findCompendiumSpellLists()` function in `compendium-management.mjs` processes all available compendiums on every spellbook open, causing significant delays for users with large collections like Bailywiki. The indexing process in `indexSpellCompendiums()` rebuilds the entire spell index each time without persistence. The system lacks both compendium filtering and index caching capabilities.

**Implementation:**

- **Selective Indexing**: Add world settings for GM to pre-select which compendiums to include in spell indexing
- **Persistent Cache**: Store compendium indices in world flags or client storage to eliminate re-indexing on every open
- **Smart Cache Invalidation**: Track compendium modification times and only re-index when content changes
- **Background Indexing**: Move initial indexing to background process with progress indicators
- **Index Management**: Provide tools to manually refresh indices and clear cache when needed
- **Performance Monitoring**: Add metrics to track indexing performance and cache hit rates

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

#### **Performance Improvements [Low Priority]**

- Add lazy loading for spell lists in GMSpellListManager
- Optimize render cycle to reduce redoing the same task

#### **Non-Standard Spellcasting Classes Support [Low Priority]**

Support homebrew and edge-case spellcasting classes that don't follow standard spell progression patterns, including cantrip-only casters and ritual-only casters.

**Use Cases:**

- **Warmage**: Cantrip-only caster with `cantrips-known` scale but no spell progression
- **Investigator**: Ritual-only caster with no spell progression
- **Other homebrew classes**: Custom spellcasting patterns that don't fit standard progressions

**Code justification:** Currently, `spellbook-state.mjs` and `rule-set-manager.mjs` filter out classes where `spellcasting.progression` is missing or set to `'none'`. The detection logic in `detectSpellcastingClasses()` and `_detectSpellcastingClasses()` excludes these classes entirely:

### Development Notes

#### Code Architecture Status

- **Batch operations** in GM Spell List Manager need implementation
- **Data validation and cleanup** for class rule changes could be more robust

#### User Experience Priorities

- **Streamline filter management** - saved filter presets needed
- **Enhance spell discovery** - recommendation system would help new users

#### Technical Debt Analysis

- **Code duplication** in spell processing between different managers
- **Complex interdependencies** between state manager and UI components
- **Legacy compatibility code** for dnd5e version differences
- **Inconsistent async/await patterns** in some older modules
