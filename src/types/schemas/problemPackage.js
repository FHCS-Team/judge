module.exports = {
  $id: "http://example.com/schemas/problemPackage.json",
  type: "object",
  required: ["problem_id", "containers"],
  properties: {
    problem_id: { type: "string" },
    problem_name: { type: "string" },
    version: { type: "string" },
    containers: {
      type: "array",
      items: {
        type: "object",
        required: ["container_id"],
        properties: {
          container_id: { type: "string" },
          accepts_submission: { type: "boolean" },
        },
      },
    },
  },
};
