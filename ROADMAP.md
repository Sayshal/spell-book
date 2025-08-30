# Spell Book Roadmap

### v1.0.0 - Feature Complete Release

**Priority: Advanced Features & Collaboration**

#### **Sharing & Collaboration [High Priority]**

Enable players to discover and use public spell loadouts from other characters, with intelligent party coordination tools to optimize spell selection across the group.

**Code justification:** The current `SpellLoadoutManager` stores loadouts locally per actor using flags. The `getAvailableLoadouts()` method already filters by class identifier, providing the foundation for cross-player loadout sharing. The existing `saveClassSpecificPreparedSpells()` method in `spell-manager.mjs` tracks preparation data that could be analyzed for party coordination. The system's spell discovery mechanism in `spell-discovery.mjs` shows how to handle spell availability validation.

**Features:**

- **Public Loadout Discovery**: Browse loadouts marked as "public" by other players in the spell loadouts menu, filtered by matching class
- **Graceful Spell Handling**: When applying shared loadouts, silently skip spells not available to the current character and apply only compatible spells
- **Party Coordination Tool**: Integration with group actors to display a comparison matrix showing what spells each party member *knows* versus what they can currently *prepare* (If user viewing does not have observer or greater permission to view a character, show a grayed out/blurred out version with a note that you do not have permission to view)
- **Smart Suggestions**: Highlight spell preparation opportunities where party members could complement each other's spell selections. This should be accomplished by making factual statements (the party has 8 fire-damage spells, 85% of the spells require concentration, etc.)

#### **Post-Encounter Spell Analytics [High Priority]**

Generate comprehensive chat summaries after combat encounters detailing spellcasting activity, resource expenditure, and tactical insights for all participants.

**Code justification:** The existing `SpellUsageTracker` in `spell-usage-tracker.mjs` already detects combat vs exploration context and monitors spell activity via `dnd5e.activityConsumption` hooks. The `sendComprehensiveGMNotification` system in `cantrip-manager.mjs` demonstrates chat message creation with templated content. Combat state detection and participant tracking provide the foundation for encounter-specific analytics.

**Post-encounter features:**

- **Combat Spell Summary**: Automated chat messages after combat ends listing all spells cast by players and NPCs during the encounter
- **Resource Expenditure Report**: Breakdown of spell slots used, cantrips cast, and concentration spell management throughout the fight
- **Tactical Analysis**: Identify spell synergies, counter-spellings, and effectiveness patterns from the encounter
- **NPC Spellcasting Integration**: Track and report enemy spellcaster activity alongside player actions for complete encounter analysis

#### **Cauldron of Plentiful Resources Compatibility [Medium Priority]**

Ensure seamless integration with the Cauldron of Plentiful Resources module, providing automatic spell setup and configuration after spells are added to character sheets.

**Code justification:** The existing spell management system in `spell-manager.mjs` handles spell addition and configuration through `_ensureSpellOnActor()` and related methods. The module's hook system and spell processing pipeline can be extended to detect and properly configure spells added by external modules. The `SpellbookState` management provides the foundation for triggering post-addition setup routines.

**Compatibility features:**

- **Automatic Spell Detection**: Monitor for spells added by Cauldron of Plentiful Resources and trigger appropriate setup procedures
- **Configuration Sync**: Ensure spells added externally receive proper source class attribution, preparation modes, and other module-specific metadata
- **Validation Integration**: Run spell validation and rule checking on externally-added spells to maintain data consistency
- **UI Refresh**: Automatically update spell book interfaces when external modules modify character spell inventories

### v1.1.0+ - Advanced Features

**Priority: Power User & GM Tools**

#### **Custom Spell Creation Wizard [Medium Priority]**

Implement an intuitive spell creation interface with guided templates, balance validation, and automatic integration into custom spell lists.

**Code justification:** The existing spell list management in `compendium-management.mjs` provides the infrastructure for custom content with `duplicateSpellList()`, `findDuplicateSpellList()`, and mapping systems. The comprehensive spell data structures in the module show the required fields and validation patterns. The GM Spell List Manager already handles custom list creation and management workflows.

**Creation wizard features:**

- **Guided Spell Builder**: Step-by-step interface for creating spells with pre-filled templates based on spell level and school
- **Balance Validation**: Real-time analysis comparing damage, utility, and resource costs against existing spells of similar level
- **Component Validation**: Ensure proper spell component combinations and requirements based on D&D5e rules
- **Auto-Integration**: Seamlessly add created spells to custom spell lists and make them available to appropriate character classes

#### **Advanced Wizard Features [Medium Priority]**

Implement spell research mechanics, spell variant management, advanced spellbook customization, and spell component tracking.

**Code justification:** The current `wizard-spellbook-manager.mjs` provides basic spell copying with cost/time tracking, but lacks research mechanics. The `getCopyingCost()` and `getCopyingTime()` methods are simple level-based calculations that could be expanded for research. The ritual system in `ritual-manager.mjs` shows the framework for advanced spell mechanics. The journal-based spellbook system could support variant tracking and custom spell modifications.

**Advanced features:**

- Spell research system with time and resource tracking
- Spell variant creation and management
- Custom spellbook themes and layouts
- Component tracking and management
- Enhanced familiar spell sharing

#### **Non-Standard Spellcasting Classes Support [Low Priority]**

Support homebrew and edge-case spellcasting classes that don't follow standard spell progression patterns, including cantrip-only casters and ritual-only casters.

**Use Cases:**

- **Warmage**: Cantrip-only caster with `cantrips-known` scale but no spell progression
- **Investigator**: Ritual-only caster with no spell progression
- **Other homebrew classes**: Custom spellcasting patterns that don't fit standard progressions

**Code justification:** Currently, `spellbook-state.mjs` and `rule-set-manager.mjs` filter out classes where `spellcasting.progression` is missing or set to `'none'`. The detection logic in `detectSpellcastingClasses()` and `_detectSpellcastingClasses()` excludes these classes entirely:
