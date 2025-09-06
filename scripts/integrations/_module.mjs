/**
 * Integration module exports for the Spell Book module.
 *
 * This module provides centralized access to all external system integrations:
 * - D&D 5e system integration (includes group actor support)
 * - Tidy5e sheet integration for enhanced character sheets
 *
 * The integrations handle:
 * - Adding spell book buttons to character sheets
 * - Rest completion handling for spell/cantrip swapping
 * - Group actor party spell management
 * - Journal directory spell list manager access
 *
 * Import specific integrations as needed:
 * ```javascript
 * import { registerDnD5eIntegration, registerTidy5eIntegration } from '../integrations/_module.mjs';
 * ```
 *
 * Or import everything:
 * ```javascript
 * import * as Integrations from '../integrations/_module.mjs';
 * ```
 *
 * @module Integrations
 */

export * from './dnd5e.mjs';
export * from './tidy5e.mjs';
