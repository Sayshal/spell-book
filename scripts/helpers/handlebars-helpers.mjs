/**
 * Handlebars helper functions for the Spell Book module
 * @module spell-book/helpers/handlebars-helpers
 */

import { log } from '../logger.mjs';

/**
 * Register all Handlebars helpers for the module
 */
export function registerHandlebarsHelpers() {
  try {
    // Math operation helpers
    registerMathHelpers();

    // Conditional and comparison helpers
    registerComparisonHelpers();

    log(3, 'Handlebars helpers registered');
  } catch (error) {
    log(1, 'Error registering Handlebars helpers:', error);
  }
}

/**
 * Register math operation helpers
 */
function registerMathHelpers() {
  // Addition helper
  Handlebars.registerHelper('add', function (a, b) {
    return Number(a) + Number(b);
  });

  // Subtraction helper
  Handlebars.registerHelper('subtract', function (a, b) {
    return Number(a) - Number(b);
  });

  // Multiplication helper
  Handlebars.registerHelper('multiply', function (a, b) {
    return Number(a) * Number(b);
  });
}

/**
 * Register comparison and conditional helpers
 */
function registerComparisonHelpers() {
  // Minimum value helper
  Handlebars.registerHelper('min', function (a, b) {
    return Math.min(Number(a), Number(b));
  });

  // Maximum value helper
  Handlebars.registerHelper('max', function (a, b) {
    return Math.max(Number(a), Number(b));
  });
}
