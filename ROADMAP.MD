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

🐛 **Fix Class Rules Bug**

- Auto-purge class rules and spell data when switching between classes or if a class is no longer detected
- Improve class detection and cleanup logic

✨ **Spell Loadouts System**

- Create preset spell configurations ("Combat", "Utility", "Exploration")
- Quick-switch between loadouts
- Save/load custom loadouts per character

🔧 **Multi-Select in Spell Manager**

- Batch operations for spell list management
- Select multiple spells for deletion/modification
- Bulk spell operations with progress indicators

👁️ **Spell List Hiding**

- Hide duplicate/merged spell lists with toggle
- "Hidden" tab in spell list manager
- Optional auto-hide after merge

### v0.9.0 - Enhanced User Experience

**Priority: Usability & Interface Improvements**

🔍 **Advanced Search & Discovery**

- Saved search presets
- Spell recommendations based on class/level
- "Similar spells" suggestions
- Global search across all spell lists

📝 **Spell Notes & Favorites**

- Personal notes on spells
- Favorite spell marking
- Spell usage history tracking

🎨 **Visual Enhancements**

- Spell comparison side-by-side view

### v1.0.0 - Feature Complete Release

**Priority: Advanced Features & Polish**

🤝 **Sharing & Collaboration**

- Share spell loadouts between players
- Export/import spell configurations
- Template loadouts for common builds

📊 **Analytics & Insights**

- Spell usage statistics
- Preparation pattern analysis
- Optimization suggestions

♿ **Accessibility**

- Improve contrast between background and text everywhere
- Improve light mode support

### v1.1.0+ - Advanced Features

**Priority: Power User & GM Tools**

🧙‍♂️ **Advanced Wizard Features**

- Spell research mechanics
- Spell variant management
- Advanced spellbook customization
- Spell component tracking

🛠️ **GM Enhancement Tools**

- Encounter-based spell tracking
- Player spell usage monitoring
- Advanced spell list analytics
- Custom spell creation tools

## Implementation Priority Matrix

### High Impact, Low Effort

- Spell Loadouts
- Multi-select in Spell Manager
- Class Rules Bug Fix

### High Impact, High Effort

- Advanced Search System
- Analytics Dashboard

### Low Impact, Low Effort

- Spell Notes
- Minor UI Polish

### Low Impact, High Effort

- Advanced Wizard Research

This roadmap balances user requests, technical debt, and strategic feature development while maintaining backwards compatibility and module stability.
