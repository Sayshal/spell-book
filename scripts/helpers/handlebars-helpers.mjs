import { log } from '../logger.mjs';

/**
 * Register all Handlebars helpers for the module
 */
export function registerHandlebarsHelpers() {
  try {
    Handlebars.registerHelper('add', function (a, b) {
      return Number(a) + Number(b);
    });
    Handlebars.registerHelper('subtract', function (a, b) {
      return Number(a) - Number(b);
    });
    Handlebars.registerHelper('multiply', function (a, b) {
      return Number(a) * Number(b);
    });
    Handlebars.registerHelper('min', function (a, b) {
      return Math.min(Number(a), Number(b));
    });
    Handlebars.registerHelper('max', function (a, b) {
      return Math.max(Number(a), Number(b));
    });

    log(3, 'Handlebars helpers registered');
  } catch (error) {
    log(1, 'Error registering Handlebars helpers:', error);
  }
}
