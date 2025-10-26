module.exports = {
  type: "object",
  additionalProperties: false,
  properties: {
    submission_id: { type: "string" },
    problem_id: { type: "string" },
    team_id: { type: ["string", "null"] },
    timestamp: { type: ["string", "null"], format: "date-time" },
    sha256: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
    archive_url: { type: ["string", "null"] },
    archive_data: { type: ["string", "object", "null"] },
    resources: {
      type: "object",
      additionalProperties: false,
      properties: {
        memory_mb: { type: "number" },
        cpus: { type: "number" },
      },
    },
    files: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
  },
  required: ["submission_id", "problem_id"],
};
