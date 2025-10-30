const logger = require("#utils/logger.js");
const queue = require("..");

/**
 * Publish evaluation result in the envelope expected by judge-site.
 * Expected envelope shape:
 * {
 *   channel: "judge.result.evaluation",
 *   id: "eval-...",
 *   message: { ...evaluation result... }
 * }
 */
async function publishResult(result) {
  const routingKey =
    process.env.RESULT_ROUTING_KEY || "judge.result.evaluation";

  // Build the envelope expected by judge-site
  const envelope = {
    channel: routingKey,
    id: result && result.evaluation_id ? result.evaluation_id : null,
    message: result || {},
  };

  try {
    await queue.publish(routingKey, envelope);
    logger.debug("Published result event");
  } catch (err) {
    logger.warn(
      "Failed to publish result event",
      err && err.message ? err.message : err,
    );
  }
}

module.exports = publishResult;
