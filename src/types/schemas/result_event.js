// Extracted payload schema from docs/schemas/result_event.schema.json
module.exports = {
  type: "object",
  additionalProperties: false,
  properties: {
    submission_id: { type: "string" },
    problem_id: { type: "string" },
    status: {
      type: "string",
      enum: ["completed", "failed", "running", "queued"],
    },
    evaluated_at: { type: ["string", "null"], format: "date-time" },
    execution_status: { type: ["string", "null"] },
    timed_out: { type: ["boolean", "null"] },
    total_score: { type: ["number", "null"] },
    max_score: { type: ["number", "null"] },
    percentage: { type: ["number", "null"] },
    rubrics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          rubric_id: { type: "string" },
          score: { type: "number" },
          max_score: { type: "number" },
          details: { type: ["object", "array", "null"] },
        },
        required: ["rubric_id", "score", "max_score"],
      },
    },
    metadata: {
      type: "object",
      additionalProperties: true,
      properties: {
        execution_time_seconds: { type: "number" },
        memory_peak_mb: { type: "number" },
        cpu_average_percent: { type: "number" },
      },
    },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          filename: { type: "string" },
          size: { type: "integer" },
          modified: { type: "string", format: "date-time" },
          url: { type: "string" },
        },
        required: ["filename", "url"],
      },
    },
  },
  required: ["submission_id", "problem_id", "status"],
};
