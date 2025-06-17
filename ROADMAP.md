# Spell Book Roadmap

### v0.8.0 - Quality of Life & Bug Fixes (Next Release)

**Priority: Critical Bug Fixes & User Requests**

#### **Fixed: Class Rules Cleanup Bug [Critical]**

Resolved an issue where outdated class rules and spell data were not purged when switching classes or when a class was removed from an actor. Improved detection and cleanup logic to ensure data consistency.

**Fix details:**
Previously, `detectSpellcastingClasses()` in `spellbook-state.mjs` failed to remove stale entries from `classSpellData` and `spellcastingClasses`. Likewise, `getClassRules()` in `rule-set-manager.mjs` would fall back to defaults but retained invalid rules. The `_stateManager._classesChanged` flag in `player-spell-book.mjs` indicated awareness of the issue but lacked proper cleanup logic.

**Fix summary:**

- Added cleanup logic to `detectSpellcastingClasses()`
- Validated class data on actor updates

#### **Completed: Spell Loadouts System [High Priority]**

Implemented preset spell configurations for different scenarios with quick-switch functionality and save/load custom loadouts per character. Users can now save their current spell preparation state and quickly apply different loadouts for various situations.

**Implementation details:**
Built a comprehensive loadout management system using `SpellLoadoutManager` in `spell-loadout-manager.mjs` and `SpellLoadoutDialog` in `spell-loadout-dialog.mjs`. The system integrates with the existing `PlayerSpellBook.formHandler()` in `player-spell-book.mjs` to capture and apply spell preparation states. Added proper flag management using `actor.update()` instead of the problematic `unsetFlag`/`setFlag` pattern to prevent data corruption during save/delete operations.

**Implementation summary:**

- Custom loadout creation with names, descriptions, and spell configuration storage
- Spell preview tooltips displaying spell icons, names, and levels on hover
- Right-click context menu on the "Spell Loadouts" button for quick loadout access
- Loadout management dialog with apply, overwrite, and delete functionality
- Proper data persistence using actor flags with conflict-free update operations
- UI integration with existing spell preparation tracking and validation systems

#### **Completed: Multi-Select in Spell Manager [High Priority]**

Implemented comprehensive batch operations for spell list management, enabling efficient multi-spell selection and bulk operations with visual feedback and confirmation dialogs.

**Implementation details:**
Enhanced the `GMSpellListManager` class in `gm-spell-list-manager.mjs` with a complete multi-select system. Added selection state management through `selectedSpellsToAdd` and `selectedSpellsToRemove` Set objects, along with `selectionMode` boolean to control UI behavior. Implemented checkbox-based selection for both available spells (to add) and current spells (to remove) with proper ARIA labeling and accessibility support.

**Implementation summary:**

- **Selection Modes**: Toggle between normal and selection mode via footer button
- **Multiple Selection Patterns**: Individual checkbox clicks, Shift+click for range selection, and select-all functionality
- **Visual Feedback**: Checkboxes with indeterminate states, selected item highlighting, and real-time selection count displays
- **Bulk Operations**: Confirmation dialogs with detailed counts, batch processing with error handling, and success/failure reporting
- **Keyboard Support**: Escape to cancel selection, Enter to execute bulk save operations
- **Template Integration**: Updated Handlebars templates with conditional checkbox rendering and selection UI elements
- **Error Handling**: Graceful handling of partial failures with detailed user feedback

#### **Completed: Spell List Hiding [Medium Priority]**

Implemented comprehensive spell list visibility management with toggle controls, dedicated hidden lists folder, and optional auto-hide functionality after merge operations to reduce interface clutter and improve organization.

**Implementation details:**
Added a new world setting `HIDDEN_SPELL_LISTS` for storing hidden list UUIDs and enhanced `findCompendiumSpellLists()` in `compendium-management.mjs` to filter hidden lists for non-GM users. Updated `GMSpellListManager` in `gm-spell-list-manager.mjs` with visibility toggle handlers and reorganized context preparation to separate hidden lists into their own folder. Enhanced form elements helper with optgroup support for cleaner dropdown organization in merge dialogs and spellbook settings.

**Implementation summary:**

- **Visibility Controls**: Eye/eye-slash icons on each spell list (except actor spellbooks) for instant hide/unhide functionality
- **Hidden Lists Folder**: Dedicated collapsible folder in GM interface for managing archived spell lists
- **Merge Integration**: Optional checkbox in merge dialog to automatically hide source lists after successful merge
- **Player Filtering**: Hidden lists automatically excluded from player spell list selections and custom spell list dropdowns
- **Organized Dropdowns**: Implemented optgroup support with proper semantic grouping in merge dialogs and character settings
- **GM Override**: GMs retain full visibility of hidden lists while maintaining clean player interfaces
- **Persistent State**: Hidden status preserved across sessions with proper world-level settings storage

#### **Fixed: Wizard Scroll Learning Sequence Break [Critical Priority]**

Resolved an issue where learning spells from spell scrolls before selecting a wizard's free spells causes the spellbook to display only scroll-learned spells, hiding all other available spells from both the main spell list and learning interface.

**Fix details:**
The root cause was identified in `getClassSpellList()` in `spell-discovery.mjs`, which incorrectly returned the wizard's personal spellbook instead of the full class spell list when called for wizard classes. This caused the wizard learning tab to show only spells the wizard already knew (typically 2-6 spells) rather than the complete class spell list (hundreds of spells). The problematic logic `if (actor && genericUtils.isWizard(actor)) { return manager.getSpellbookSpells(); }` was confusing "spells the wizard knows" with "spells the wizard can learn."

**Fix summary:**

- **Corrected spell list retrieval**: Removed wizard personal spellbook logic from `getClassSpellList()` function
- **Restored full spell availability**: Wizard learning tab now displays complete class spell list regardless of learning sequence
- **Preserved scroll integration**: Scroll spells continue to appear in dedicated "Scrolls" section with functional "Learn from Scroll" buttons
- **Eliminated sequence dependency**: Learning order (scrolls → free → paid spells) no longer affects spell list display
- **Enhanced debugging**: Added comprehensive logging to detect and prevent similar spell list corruption issues

#### **Completed: Lazy Loading for PlayerSpellBook [Medium Priority]**

Implemented lazy loading functionality for the PlayerSpellBook to improve performance and reduce initial load times, especially for characters with access to large spell lists.

**Implementation details:**
Enhanced the `PlayerSpellBook` class in `player-spell-book.mjs` with lazy loading capabilities that defer expensive spell list processing until actually needed. The system intelligently loads spell data on-demand when users switch tabs or apply filters, rather than processing all available spells during initial render. This significantly improves performance for characters with access to extensive spell libraries while maintaining full functionality once data is loaded.

**Implementation summary:**

- **On-demand loading**: Spell lists load only when accessed, reducing initial render time
- **Progressive enhancement**: Core UI renders immediately while spell data loads in background
- **Caching strategy**: Loaded spell data cached for subsequent access with proper invalidation
- **Loading indicators**: Visual feedback during spell list loading operations

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

#### User Experience Priorities

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

#### Technical Debt Analysis

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

#### Performance Optimization Status

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

#### Integration Patterns

**Current Integrations:**

- **Native dnd5e integration** with proper hooks and system compatibility
- **Tidy5e sheet integration** with seamless UI embedding
- **Compendium management** with proper pack handling and indexing

**Integration Improvements Needed:**

- **Better module conflict detection** and resolution
- **Enhanced API documentation** for third-party developers
- **Standardized event system** for module communication
- **Plugin architecture** for custom spell sources
