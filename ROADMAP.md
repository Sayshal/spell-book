# Spell Book Roadmap

## v1.0.0 - Feature Complete Release

**Priority: Advanced Features & Collaboration**

### **Sharing & Collaboration [COMPLETED]**

**Milestone Summary:** Successfully implemented comprehensive party spell coordination system with full group actor integration, visual spell pool management, preparation optimization tools, and collaborative spellcasting focus assignment to maximize party effectiveness.

**Implementation Highlights:**

- **Complete Party Spell Management System**: Built comprehensive `PartySpells` application with `PartySpellManager` class for coordinated spell planning across multiple party members
- **Advanced Permission Integration**: Implemented robust permission-based access control with graceful degradation for restricted character visibility
- **Intelligent Synergy Analysis**: Created automated spell optimization recommendations with factual analysis (damage type distribution, concentration conflicts, etc.)
- **Customizable Focus Coordination**: Developed dual-flag focus system with GM-customizable world settings and full localization support
- **Visual Party Mode**: Added right-click context menu system with party member spell visualization to prevent preparation duplicates

**Key Technical Achievements:**

- Group Actor Sheet integration with seamless party spell pool access buttons
- Multi-class spellcaster support with enhanced class name display and individual spell tracking
- Performance-optimized caching system for large party spell data management
- Context menu systems for both party coordination and member-specific actions
- Real-time data refresh capabilities with persistent UI state management

**Features Delivered:**

- ✅ **Group Actor Integration**: Button integration on Group Actor Sheets with corresponding SpellBook footer access
- ✅ **Party Spell Comparison Matrix**: Complete spell known vs. prepared visualization with permission-based display controls
- ✅ **Spell Synergy Analysis**: Automated preparation opportunity detection with factual party composition statements
- ✅ **Spellcasting Focus Assignment**: GM-customizable focus options with individual player selection and group synchronization
- ✅ **Party Mode Visualization**: Right-click context menu with party member token display for prepared spell coordination

### **Subclass Spell List Management [Medium Priority]**

Allow GMs to manually set a subclass spell list or 'secondary' spell list that is additive to the available spells, providing enhanced customization for subclass-specific magical traditions.

**Code justification:** The existing spell source detection in `spell-manager.mjs` already identifies subclass sources through `_determineSpellSource()` and handles subclass spellcasting via `getSpellcastingSourceItem()`. The spell list management infrastructure in `compendium-management.mjs` provides custom list creation with `duplicateSpellList()` and `findDuplicateSpellList()` methods. The Spell List Manager already supports custom identifiers and spell list modification workflows, providing the foundation for subclass-specific spell expansions.

**Subclass spell list features:**

- **Secondary Spell List Assignment**: Interface for GMs to assign additional spell lists to specific subclasses, expanding their available spell repertoire beyond the base class list
- **Additive Spell Integration**: Automatically combine base class spells with subclass-specific spells, ensuring all spells are available for preparation without replacing existing options
- **Duplicate Resolution**: Intelligent merging system that removes duplicate spells when combining base and subclass lists, preventing redundancy while preserving spell access
- **Subclass Detection**: Automatic recognition of character subclasses to apply appropriate secondary spell lists when players open their spell books
- **GM Override Controls**: Manual assignment options for homebrew subclasses or custom magical traditions that don't follow standard spell list patterns

### **Cauldron of Plentiful Resources Compatibility [Medium Priority]**

Ensure seamless integration with the Cauldron of Plentiful Resources module, providing automatic spell setup and configuration after spells are added to character sheets.

**Code justification:** The existing spell management system in `spell-manager.mjs` handles spell addition and configuration through `_ensureSpellOnActor()` and related methods. The module's hook system and spell processing pipeline can be extended to detect and properly configure spells added by external modules. The `SpellbookState` management provides the foundation for triggering post-addition setup routines.

**Compatibility features:**

- **Automatic Spell Detection**: Monitor for spells added by Cauldron of Plentiful Resources and trigger appropriate setup procedures
- **Configuration Sync**: Ensure spells added externally receive proper source class attribution, preparation modes, and other module-specific metadata
- **Validation Integration**: Run spell validation and rule checking on externally-added spells to maintain data consistency
- **UI Refresh**: Automatically update spell book interfaces when external modules modify character spell inventories

## v1.1.0+ - Advanced Features

**Priority: Power User & GM Tools**

### **Custom Spell Creation Wizard [Medium Priority]**

Implement an intuitive spell creation interface with guided templates, balance validation, and automatic integration into custom spell lists.

**Code justification:** The existing spell list management in `compendium-management.mjs` provides the infrastructure for custom content with `duplicateSpellList()`, `findDuplicateSpellList()`, and mapping systems. The comprehensive spell data structures in the module show the required fields and validation patterns. The Spell List Manager already handles custom list creation and management workflows.

**Creation wizard features:**

- **Guided Spell Builder**: Step-by-step interface for creating spells with pre-filled templates based on spell level and school
- **Balance Validation**: Real-time analysis comparing damage, utility, and resource costs against existing spells of similar level
- **Component Validation**: Ensure proper spell component combinations and requirements based on D&D5e rules
- **Auto-Integration**: Seamlessly add created spells to custom spell lists and make them available to appropriate character classes

### **Advanced Wizard Features [Medium Priority]**

Implement spell research mechanics, spell variant management, advanced spellbook customization, and spell component tracking.

**Code justification:** The current `wizard-spellbook-manager.mjs` provides basic spell copying with cost/time tracking, but lacks research mechanics. The `getCopyingCost()` and `getCopyingTime()` methods are simple level-based calculations that could be expanded for research. The ritual system in `ritual-manager.mjs` shows the framework for advanced spell mechanics. The journal-based spellbook system could support variant tracking and custom spell modifications.

**Advanced features:**

- Spell research system with time and resource tracking
- Spell variant creation and management
- Custom spellbook themes and layouts
- Component tracking and management
- Enhanced familiar spell sharing

### **Non-Standard Spellcasting Classes Support [Low Priority]**

Support homebrew and edge-case spellcasting classes that don't follow standard spell progression patterns, including cantrip-only casters and ritual-only casters.

**Use Cases:**

- **Warmage**: Cantrip-only caster with `cantrips-known` scale but no spell progression
- **Investigator**: Ritual-only caster with no spell progression
- **Other homebrew classes**: Custom spellcasting patterns that don't fit standard progressions

**Code justification:** Currently, `spellbook-state.mjs` and `rule-set-manager.mjs` filter out classes where `spellcasting.progression` is missing or set to `'none'`. The detection logic in `detectSpellcastingClasses()` and `_detectSpellcastingClasses()` excludes these classes entirely.
