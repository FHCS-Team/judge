module.exports = {
  type: "object",
  additionalProperties: false,
  properties: {
    submission_id: { type: "string" },
    problem_id: { type: "string" },
    team_id: { type: ["string", "null"] },
    timestamp: { type: ["string", "null"], format: "date-time" },
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
