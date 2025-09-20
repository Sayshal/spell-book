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

### **Subclass Spell List Management [COMPLETED]**

**Milestone Summary:** Successfully implemented comprehensive subclass spell list management system with visual distinction, manual assignment capabilities, and intelligent spell merging to provide enhanced customization for subclass-specific magical traditions through player-controlled configuration.

**Implementation Highlights:**

- **Visual Subclass Distinction**: Implemented shield icons for subclass spell lists vs. book icons for standard class lists in the Spell List Manager, providing clear visual differentiation
- **Subclass List Creation**: Enhanced spell list creation workflow with dedicated subclass checkbox and type tracking in the list management system
- **Multi-Select Custom Spell Lists**: Upgraded character settings to support multiple custom spell list assignments with automatic merging capabilities
- **Intelligent Spell Integration**: Built robust spell merging system that combines base class spells with additional subclass-specific spells while preventing duplicates
- **Manual Assignment Control**: Provided player-controlled configuration system for assigning secondary spell lists to specific classes without complex automation

**Key Technical Achievements:**

- Enhanced `loadData()` function with proper subclass type detection and icon assignment
- Updated spell list templates to use dynamic icon system (`{{list.icon}}`) for consistent visual representation
- Implemented multi-select spell list configuration in character settings with grouped organization (Class/Subclass/Other)
- Built spell set merging infrastructure in `spell-discovery.mjs` for combining multiple spell sources
- Created subclass-aware spell list creation workflow with appropriate metadata tracking

**Features Delivered:**

- ✅ **Subclass List Creation**: GMs can create spell lists marked as "subclass" type with appropriate visual indicators
- ✅ **Manual Assignment Interface**: Players can assign multiple custom/subclass spell lists through character settings
- ✅ **Additive Spell Integration**: System automatically combines base class spells with assigned secondary spell lists
- ✅ **Duplicate Resolution**: Intelligent merging prevents spell duplication while preserving access to all available options
- ✅ **Visual Distinction**: Shield icons clearly identify subclass spell lists throughout the management interface
- ✅ **Flexible Configuration**: Support for homebrew subclasses and custom magical traditions through manual assignment system

**Code justification:** The implementation leverages existing spell source detection in `spell-manager.mjs` and spell list management infrastructure in `compendium-management.mjs`. The manual assignment approach through character settings provides maximum flexibility while maintaining system simplicity and avoiding complex automation dependencies.

### **Cauldron of Plentiful Resources Compatibility [COMPLETED]**

Seamless integration with the Cauldron of Plentiful Resources module, providing automatic spell setup and configuration after spells are added to character sheets.

**Implementation:** Integrated CPR automation trigger at the end of spell preparation workflow in `player-spell-book.mjs` formHandler. Added world-level setting for opt-in compatibility and module detection to ensure safe operation.

**Completed features:**

- **Automatic Spell Detection**: ✅ CPR automation runs automatically after all spell preparation changes are saved via `chrisPremades.utils.actorUtils.updateAll(actor)`
- **Compatibility Setting**: ✅ World-level setting `CPR_COMPATIBILITY` registered with default value `false` for opt-in behavior
- **Module Detection**: ✅ Safety checks verify both setting enabled AND CPR module is active before running automation
- **Error Handling**: ✅ Non-breaking implementation - CPR failures are logged but don't interrupt spell book functionality
- **User Feedback**: ✅ Setting changes provide notification feedback to users

**Integration points:**

- Setting registration in `settings.mjs` with validation and change notifications
- Constants added to `module.mjs` for the new `CPR_COMPATIBILITY` setting key
- Trigger point at end of `SpellBook.formHandler()` after all spell data is processed and saved
- Debug logging for troubleshooting CPR automation issues

**Technical details:** The integration runs after all spell preparation changes are committed to actor flags, ensuring CPR receives the most up-to-date spell configuration. The implementation includes comprehensive error handling to prevent CPR issues from affecting core spell book functionality.

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
