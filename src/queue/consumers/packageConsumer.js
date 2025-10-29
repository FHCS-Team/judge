const { BaseConsumer } = require("./baseConsumer");
const logger = require("../../utils/logger");

/**
 * Consumer for problem package events (dmoj.problem.package.submitted)
 * Handles problem package submission and validation.
 */
class PackageConsumer extends BaseConsumer {
  constructor(options = {}) {
    super({
      ...options,
      messageType: "package",
    });
  }

  validate(envelope) {
    const baseValidation = super.validate(envelope);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    const errors = [];
    const payload = envelope.payload;

    if (!payload.package_id) {
      errors.push("package_id is required");
    }

    if (!payload.package_url) {
      errors.push("package_url is required");
    }

    return { valid: errors.length === 0, errors };
  }

  async process(envelope, context) {
    const { package_id, problem_id, package_url, checksum, build_immediately } =
      envelope.payload;

    logger.info(
      { package_id, problem_id, package_url },
      "Processing package event",
    );

    if (!this.processor) {
      logger.error("No processor configured for PackageConsumer");
      context.nack(new Error("Processor not configured"));
      return;
    }

    try {
      // Submit problem package
      const packageData = {
        problem_id: problem_id || package_id,
        archive_url: package_url,
      };

      const result = await this.processor.submitProblemPackage(packageData);

      // Publish validation success event
      await this.publish(
        "package.validated",
        {
          package_id,
          problem_id: result.problem_id,
          status: "accepted",
          errors: [],
          build_job_id: build_immediately
            ? `build-${package_id}-${Date.now()}`
            : null,
          details: {
            problem_dir: result.problemDir,
          },
        },
        {
          correlationId: envelope.id,
        },
      );

      // If build_immediately is true, trigger image build
      if (build_immediately) {
        try {
          const buildResult = await this.processor.buildProblemImages(
            result.problem_id,
          );

          // Publish build completed event
          await this.publish(
            "build.completed",
            {
              problem_id: result.problem_id,
              build_job_id: `build-${package_id}-${Date.now()}`,
              status: "completed",
              image_refs: this.extractImageRefs(buildResult),
              logs_url: null,
              artifacts: [],
              errors: [],
            },
            {
              correlationId: envelope.id,
            },
          );

          logger.info(
            { package_id, problem_id: result.problem_id },
            "Problem images built successfully",
          );
        } catch (buildError) {
          logger.error(
            {
              package_id,
              problem_id: result.problem_id,
              error: buildError.message,
            },
            "Problem image build failed",
          );

          // Publish build failure event
          await this.publish(
            "build.failed",
            {
              problem_id: result.problem_id,
              build_job_id: `build-${package_id}-${Date.now()}`,
              status: "failed",
              image_refs: {},
              logs_url: null,
              artifacts: [],
              errors: [
                { message: buildError.message, stack: buildError.stack },
              ],
            },
            {
              correlationId: envelope.id,
            },
          );
        }
      }

      logger.info(
        { package_id, problem_id: result.problem_id },
        "Package processed successfully",
      );

      context.ack();
    } catch (error) {
      logger.error(
        { package_id, problem_id, error: error.message },
        "Package processing failed",
      );

      // Publish validation failure event
      await this.publish(
        "package.validated",
        {
          package_id,
          problem_id: problem_id || null,
          status: "rejected",
          errors: [{ message: error.message, stack: error.stack }],
          build_job_id: null,
          details: {},
        },
        {
          correlationId: envelope.id,
        },
      );

      context.nack(error);
    }
  }

  /**
   * Extract image references from build result
   */
  extractImageRefs(buildResult) {
    const refs = {};
    for (const [containerId, stages] of Object.entries(buildResult)) {
      if (stages.eval_stage && stages.eval_stage.tag) {
        refs[`${containerId}_eval`] = stages.eval_stage.tag;
      }
      if (stages.build_stage && stages.build_stage.tag) {
        refs[`${containerId}_build`] = stages.build_stage.tag;
      }
    }
    return refs;
  }
}

module.exports = { PackageConsumer };
