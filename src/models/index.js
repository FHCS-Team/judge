/**
 * @file Models index - Central export for all type definitions
 *
 * This module provides JSDoc type definitions used throughout the judgehost system.
 * Import this file to get access to all type definitions for better IDE support.
 *
 * @example
 * // Import types in your file
 * const models = require('./models');
 *
 * // Use JSDoc comments for type hints
 * // @param {import('./models').SubmissionRequest} request
 * function processSubmission(request) {
 *   // IDE will provide autocomplete and type checking
 * }
 */

// Re-export all type definitions
module.exports = {
  // Problem types
  ...require("./Problem"),

  // Submission types
  ...require("./Submission"),

  // Result types
  ...require("./Result"),

  // Job types
  ...require("./Job"),

  // API types
  ...require("./Api"),
};
