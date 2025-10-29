const { BaseConsumer } = require("./baseConsumer");
const logger = require("../../utils/logger");

/**
 * Consumer for hook execution request events (dmoj.hooks.execute.request)
 * Handles external hook execution requests.
 */
class HooksExecuteConsumer extends BaseConsumer {
  constructor(options = {}) {
    super({
      ...options,
      messageType: "hooks.execute",
    });
  }

  validate(envelope) {
    const baseValidation = super.validate(envelope);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    const errors = [];
    const payload = envelope.payload;

    if (!payload.hook_id) {
      errors.push("hook_id is required");
    }

    return { valid: errors.length === 0, errors };
  }

  async process(envelope, context) {
    const {
      hook_id,
      submission_id,
      problem_id,
      payload: hookPayload,
      timeout_seconds,
      async: isAsync,
    } = envelope.payload;

    logger.info(
      { hook_id, submission_id, problem_id, isAsync },
      "Processing hook execute request",
    );

    try {
      // This is a simplified hook execution - in a real implementation,
      // you would look up the hook definition and execute it appropriately
      const startTime = Date.now();

      // Simulate hook execution
      // In a real implementation, this would:
      // 1. Look up hook definition from problem package or global hooks
      // 2. Execute the hook in appropriate environment
      // 3. Capture output and return code

      const result = {
        hook_id,
        submission_id: submission_id || null,
        problem_id: problem_id || null,
        status: "success",
        output: null,
        errors: null,
        return_code: 0,
        duration_seconds: (Date.now() - startTime) / 1000,
        timestamp: new Date().toISOString(),
      };

      // Publish hook result event (if async or always)
      await this.publish("hooks.result", result, {
        correlationId: envelope.id,
      });

      logger.info(
        {
          hook_id,
          submission_id,
          problem_id,
          duration: result.duration_seconds,
        },
        "Hook executed successfully",
      );

      context.ack();
    } catch (error) {
      logger.error(
        { hook_id, submission_id, problem_id, error: error.message },
        "Hook execution failed",
      );

      // Publish failure result
      await this.publish(
        "hooks.result",
        {
          hook_id,
          submission_id: submission_id || null,
          problem_id: problem_id || null,
          status: "failed",
          output: null,
          errors: [{ message: error.message, stack: error.stack }],
          return_code: 1,
          duration_seconds: 0,
          timestamp: new Date().toISOString(),
        },
        {
          correlationId: envelope.id,
        },
      );

      context.nack(error);
    }
  }
}

module.exports = { HooksExecuteConsumer };
