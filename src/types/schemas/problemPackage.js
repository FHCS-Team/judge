module.exports = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://github.com/FHCS-Team/judge/",
  title: "Problem Configuration Schema",
  description:
    "Configuration schema for judge problems supporting multi-container environments with build/evaluation stage separation",
  type: "object",
  required: ["problem_id", "containers"],
  additionalProperties: true,
  properties: {
    problem_id: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]{2,63}$",
      description:
        "Unique identifier for the problem (lowercase, alphanumeric with hyphens)",
    },
    problem_name: { type: "string", minLength: 1 },
    version: {
      type: "string",
      pattern: "^\\d+\\.\\d+\\.\\d+$",
      default: "1.0.0",
    },
    description: { type: "string" },
    project_type: {
      type: "string",
      enum: [
        "algorithm",
        "web_api",
        "full_stack_web",
        "database_design",
        "cli_tool",
        "data_processing",
      ],
    },
    containers: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          container_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{1,31}$" },
          build_stage: {
            type: "object",
            additionalProperties: false,
            properties: {
              dockerfile: {
                type: "string",
                default: "containers/{container_id}/Dockerfile.build",
              },
              context: {
                type: "string",
                default: "containers/{container_id}/build",
              },
              environment: {
                type: "object",
                additionalProperties: { type: "string" },
              },
              resource_limits: { $ref: "#/definitions/resource_limits" },
              network_mode: {
                type: "string",
                enum: ["bridge", "host", "none", "isolated"],
                default: "bridge",
              },
            },
          },
          eval_stage: {
            type: "object",
            additionalProperties: false,
            properties: {
              dockerfile: {
                type: "string",
                default: "containers/{container_id}/Dockerfile.eval",
              },
              context: {
                type: "string",
                default: "containers/{container_id}/build",
              },
              resource_limits: { $ref: "#/definitions/resource_limits" },
              environment: {
                type: "object",
                additionalProperties: { type: "string" },
              },
              network_mode: {
                type: "string",
                enum: ["isolated", "bridge", "none", "host"],
                default: "isolated",
              },
            },
          },
          accepts_submission: { type: "boolean", default: false },
          submission_package_id: { type: "string" },
          mount_submission_at: { type: "string", default: "/workspace" },
          port: { type: "integer" },
          depends_on: { type: "array", items: { type: "string" } },
          health_check: {
            type: "object",
            additionalProperties: false,
            properties: {
              command: {
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                ],
              },
              interval: { type: "integer" },
              timeout: { type: "integer", minimum: 1, default: 60 },
              retries: { type: "integer", minimum: 1, default: 3 },
              start_period: { type: "integer", minimum: 0, default: 0 },
            },
          },
        },
      },
    },
    submission_packages: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["package_id"],
        additionalProperties: false,
        properties: {
          package_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{1,31}$" },
          package_name: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    rubrics: {
      type: "array",
      items: {
        type: "object",
        required: ["rubric_id", "rubric_type", "max_score", "container_id"],
        additionalProperties: false,
        properties: {
          rubric_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{1,31}$" },
          container_id: {
            type: "string",
            pattern: "^[a-z][a-z0-9_-]{1,31}$",
            description: "Identifier of the container this rubric applies to",
          },
          rubric_name: { type: "string" },
          rubric_type: {
            type: "string",
            enum: [
              "test_cases",
              "performance_benchmark",
              "code_quality",
              "security_scan",
              "api_endpoints",
              "database_integrity",
              "ui_tests",
              "custom",
            ],
          },
          description: { type: "string" },
          max_score: { type: "number", minimum: 0 },
          output_file: { type: "string", default: "rubric_{rubric_id}.json" },
          timeout: { type: "integer" },
        },
      },
    },
    hooks_config: {
      type: "object",
      additionalProperties: false,
      properties: {
        timeout_seconds: { type: "integer", default: 30 },
        parallel_execution: { type: "boolean", default: false },
        retries: { type: "integer", default: 3 },
        retry_delay_seconds: { type: "integer", default: 15 },
        continue_on_error: { type: "boolean", default: false },
      },
    },
  },
  definitions: {
    resource_limits: {
      type: "object",
      additionalProperties: false,
      properties: {
        memory: {
          type: "string",
          pattern: "^\\d+[KMGTkmgt]?[Bb]?$",
          description:
            "Memory limit (e.g., '512m', '2g'). Units may be upper- or lower-case (k, m, g, t).",
        },
        cpus: { type: "number", minimum: 0.1, maximum: 32.0 },
        timeout: { type: "integer", minimum: 1 },
        disk_space: {
          type: "string",
          pattern: "^\\d+[KMGTkmgt]?[Bb]?$",
          description:
            "Disk space limit (e.g., '1g', '500m'). Units may be upper- or lower-case (k, m, g, t).",
        },
        network_bandwidth: {
          type: "string",
          pattern: "^\\d+[KMGkmg]?[Bb]ps$",
          description:
            "Network bandwidth limit (e.g., '10mbps'). Units may be upper- or lower-case (k, m, g).",
        },
      },
    },
  },
};
