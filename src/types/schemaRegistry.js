const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const schemas = require("./schemas");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validators = new Map();

// Pre-register known schemas from src/types/schemas
Object.entries(schemas).forEach(([key, schema]) => {
  try {
    validators.set(key, ajv.compile(schema));
  } catch (e) {
    // if a schema fails to compile, skip it
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

module.exports = { registerSchema, getValidator };
