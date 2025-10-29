const { BaseConsumer } = require("./baseConsumer");
const logger = require("../../utils/logger");

/**
 * Consumer for build request events (dmoj.problem.image.build.request)
 * Handles explicit image build requests for problems.
 */
class BuildRequestConsumer extends BaseConsumer {
  constructor(options = {}) {
    super({
      ...options,
      messageType: "build.request",
    });
  }

  validate(envelope) {
    const baseValidation = super.validate(envelope);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    const errors = [];
    const payload = envelope.payload;

    if (!payload.problem_id) {
      errors.push("problem_id is required");
    }

    if (
      !payload.target_stages ||
      !Array.isArray(payload.target_stages) ||
      payload.target_stages.length === 0
    ) {
      errors.push("target_stages is required and must be a non-empty array");
    }

    return { valid: errors.length === 0, errors };
  }

  async process(envelope, context) {
    const { problem_id, package_id, target_stages, build_options } =
      envelope.payload;
    const build_job_id = `build-${problem_id}-${Date.now()}`;

    logger.info(
      { problem_id, package_id, target_stages, build_job_id },
      "Processing build request event",
    );

    if (!this.processor) {
      logger.error("No processor configured for BuildRequestConsumer");
      context.nack(new Error("Processor not configured"));
      return;
    }

    try {
      // Build problem images
      const buildResult = await this.processor.buildProblemImages(problem_id);

      // Extract image references
      const image_refs = {};
      for (const [containerId, stages] of Object.entries(buildResult)) {
        // Include requested stages only
        if (
          target_stages.includes("eval") &&
          stages.eval_stage &&
          stages.eval_stage.tag
        ) {
          image_refs[`${containerId}_eval`] = stages.eval_stage.tag;
        }
        if (
          target_stages.includes("build") &&
          stages.build_stage &&
          stages.build_stage.tag
        ) {
          image_refs[`${containerId}_build`] = stages.build_stage.tag;
        }
      }

      // Publish build completed event
      await this.publish(
        "build.completed",
        {
          problem_id,
          build_job_id,
          status: "completed",
          image_refs,
          logs_url: null,
          artifacts: [],
          errors: [],
        },
        {
          correlationId: envelope.id,
        },
      );

      logger.info(
        {
          problem_id,
          build_job_id,
          image_count: Object.keys(image_refs).length,
        },
        "Build request completed successfully",
      );

      context.ack();
    } catch (error) {
      logger.error(
        { problem_id, build_job_id, error: error.message },
        "Build request failed",
      );

      // Publish build failure event
      await this.publish(
        "build.failed",
        {
          problem_id,
          build_job_id,
          status: "failed",
          image_refs: {},
          logs_url: null,
          artifacts: [],
          errors: [{ message: error.message, stack: error.stack }],
        },
        {
          correlationId: envelope.id,
        },
      );

      context.nack(error);
    }
  }
}

module.exports = { BuildRequestConsumer };
