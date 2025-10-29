const { BaseConsumer } = require("./baseConsumer");
const logger = require("../../utils/logger");

/**
 * Consumer for status/heartbeat events (judge.status, dmoj.heartbeat)
 * Handles service health and capacity reporting requests.
 */
class StatusConsumer extends BaseConsumer {
  constructor(options = {}) {
    super({
      ...options,
      messageType: "status",
    });
    this.queue = options.queue || null;
  }

  validate(envelope) {
    const baseValidation = super.validate(envelope);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // Status events are informational, minimal validation needed
    return { valid: true, errors: [] };
  }

  async process(envelope, context) {
    logger.debug({ messageType: envelope.type }, "Processing status event");

    try {
      // Respond with current service status
      const queueStats = this.queue
        ? this.queue.stats()
        : { queued: 0, processing: 0, concurrency: 1 };

      await this.publish(
        "judge.status",
        {
          service: "judge.evaluator",
          status: "ok",
          workers_free: queueStats.concurrency - queueStats.processing,
          version: process.env.npm_package_version || "1.0.0",
          features: ["docker", "multi-container", "rubrics"],
          timestamp: new Date().toISOString(),
        },
        {
          correlationId: envelope.id,
        },
      );

      logger.debug("Status event processed and response sent");
      context.ack();
    } catch (error) {
      logger.error({ error: error.message }, "Status event processing failed");
      // Status events should not be retried, just ack
      context.ack();
    }
  }
}

module.exports = { StatusConsumer };
