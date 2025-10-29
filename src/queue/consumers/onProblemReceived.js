const logger = require("#utils/logger.js");
const { JudgeProcessor } = require("../../processor");

// Reuse single processor instance across messages
const processor = new JudgeProcessor();

/**
 * Handle problem/package events from the message queue.
 * Expected header: headers['x-event-type'] === 'judge.problem.created'
 * Expected content (JSON): { package_id, problem_id, package_url, checksum, metadata }
 * @param {import("amqplib").Message} msg
 */
module.exports = async function onProblemReceived(msg) {
  if (!msg || !msg.properties) return false;

  const headers = msg.properties.headers || {};
  const eventType = headers["x-event-type"] || headers["X-Event-Type"] || null;
  if (eventType !== "judge.problem.created") return false;

  let payload;
  try {
    payload = JSON.parse(msg.content && msg.content.toString());
  } catch (err) {
    logger.warn("onProblemReceived: failed to parse message content");
    logger.debug(err && err.message ? err.message : err);
    return false;
  }

  const { package_id, problem_id, package_url, checksum, metadata } =
    payload || {};
  if (!package_id || !problem_id || !package_url) {
    logger.warn("onProblemReceived: missing required fields in payload", {
      package_id,
      problem_id,
      package_url,
    });
    return false;
  }

  logger.info(
    `Problem package received: package=${package_id} problem=${problem_id}`,
  );
  logger.debug({ payload });

  // Map external package event fields to processor submitProblemPackage API
  const packageData = {
    problem_id,
    archive_url: package_url,
    checksum: checksum,
    metadata: metadata,
    package_id,
  };

  // Process asynchronously so the consumer can ack quickly
  (async () => {
    try {
      await processor.submitProblemPackage(packageData);
      logger.info(
        `Problem package processed: package=${package_id} problem=${problem_id}`,
      );
    } catch (err) {
      try {
        logger.error(
          {
            err: err && err.message ? err.message : err,
            package_id,
            problem_id,
          },
          "Error processing problem package",
        );
      } catch (e) {
        // swallow logging errors
      }
    }
  })();

  return true;
};
