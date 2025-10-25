/**
 * Central export for AJV schemas used across the app.
 */
const resultPayload = require("./result_event");
const problemSchema = require("./problemPackage");
const submissionSchema = require("./submission");

module.exports = {
  resultPayload,
  problemSchema,
  submissionSchema,
};
