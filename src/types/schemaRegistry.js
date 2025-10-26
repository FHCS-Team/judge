const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const schemas = require("./schemas");

const logger = require("../utils/logger");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validators = new Map();

// Pre-register known schemas from src/types/schemas
Object.entries(schemas).forEach(([key, schema]) => {
  try {
    validators.set(key, ajv.compile(schema));
  } catch (e) {
    // if a schema fails to compile, log it so developers see which schema caused the problem
    // and continue without registering the faulty schema. Silent failures make debugging
    // schema/validation issues difficult during development.
    try {
      logger.error({ err: e, schema: key }, `Failed to compile schema: ${key}`);
    } catch (logErr) {
      // fallback to console if logger itself fails for any reason
      console.error(
        `Failed to compile schema ${key}:`,
        e && e.stack ? e.stack : e,
      );
    }
  }
});

function registerSchema(name, schema) {
  const v = ajv.compile(schema);
  validators.set(name, v);
  return v;
}

function getValidator(name) {
  return validators.get(name) || null;
}

/**
 * Validate a problem configuration against the problem schema
 * @param {Object} config - Problem configuration object
 * @returns {Object} Validation result with valid boolean and errors array
 */
function validateProblemConfig(config) {
  let validator =
    getValidator("problemPackage") || getValidator("problemSchema");
  if (!validator) {
    // Try to load problem schema if not already registered
    try {
      const problemSchema = require("./schemas/problemPackage");
      registerSchema("problemPackage", problemSchema);
      validator = getValidator("problemPackage");
    } catch (error) {
      return {
        valid: false,
        errors: ["Problem schema not available: " + error.message],
      };
    }
  }

  const valid = validator(config);
  return {
    valid,
    errors: valid
      ? []
      : (validator.errors || []).map(
          (err) => `${err.instancePath} ${err.message}`,
        ),
  };
}

module.exports = { registerSchema, getValidator, validateProblemConfig };
