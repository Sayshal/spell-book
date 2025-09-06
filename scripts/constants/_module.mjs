/**
 * Constants module exports for the Spell Book module.
 *
 * This module provides centralized access to all constant definitions used
 * throughout the Spell Book module including:
 * - Actor flags for data storage and state tracking
 * - Core module configuration and identifiers
 * - Handlebars template paths for all applications and components
 *
 * Import specific constants as needed:
 * ```javascript
 * import { FLAGS, MODULE, SETTINGS, TEMPLATES } from '../constants/_module.mjs';
 * ```
 *
 * Or import everything:
 * ```javascript
 * import * as Constants from '../constants/_module.mjs';
 * ```
 *
 * @module Constants
 */

export * from './flags.mjs';
export * from './module.mjs';
export * from './templates.mjs';
