/**
 * Applications Module Exports
 *
 * Central export point for all application classes used by the Spell Book module.
 * This module provides unified access to the complete suite of user interface
 * applications including spell management, analytics, configuration, and
 * party coordination features.
 *
 * Available applications:
 * - PartySpells: Multi-character spell coordination and management
 * - PlayerFilterConfiguration: Spell browser filter customization
 * - SpellAnalyticsDashboard: Spell usage analytics and reporting
 * - SpellBook: Main spell book interface for individual characters
 * - SpellBookTroubleshooter: Diagnostic and troubleshooting tools
 * - SpellListManager: Spell list creation and management interface
 *
 * @module Applications
 * @author Tyler
 */

export { PartySpells } from './party-spells.mjs';
export { PlayerFilterConfiguration } from './player-filter-configuration.mjs';
export { SpellAnalyticsDashboard } from './spell-analytics-dashboard.mjs';
export { SpellBook } from './player-spell-book.mjs';
export { SpellBookTroubleshooter } from './spell-book-troubleshooter.mjs';
export { SpellListManager } from './spell-list-manager.mjs';
