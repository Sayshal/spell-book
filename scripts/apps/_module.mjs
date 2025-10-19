/**
 * Applications Module Exports
 *
 * Central export point for all application classes used by the Spell Book module.
 * This module provides unified access to the complete suite of user interface
 * applications including spell management, analytics, configuration, and
 * party coordination features.
 *
 * Available applications:
 * - PartyCoordinator: Multi-character spell coordination and management
 * - PlayerFilterConfiguration: Spell browser filter customization
 * - AnalyticsDashboard: Spell usage analytics and reporting
 * - SpellBook: Main spell book interface for individual characters
 * - Troubleshooter: Diagnostic and troubleshooting tools
 * - SpellListManager: Spell list creation and management interface
 *
 * @module Applications
 * @author Tyler
 */

export { AnalyticsDashboard } from './analytics-dashboard.mjs';
export { PartyCoordinator } from './party-coordinator.mjs';
export { PlayerFilterConfiguration } from './player-filter-configuration.mjs';
export { SpellBook } from './player-spell-book.mjs';
export { SpellListManager } from './spell-list-manager.mjs';
export { Troubleshooter } from './troubleshooter.mjs';
