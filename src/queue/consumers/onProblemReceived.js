const logger = require("#utils/logger.js");

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

  const { package_id, problem_id, package_url } = payload || {};
  if (!package_id || !problem_id || !package_url) {
    logger.warn("onProblemReceived: missing required fields in payload", {
      package_id,
      problem_id,
      package_url,
    });
    return false;
  }

  // Minimal handling: log and return handled. Integrations (download, unpack)
  // should be implemented in a seperate service and called from here.
  logger.info(
    `Problem package received: package=${package_id} problem=${problem_id}`,
  );
  logger.debug({ payload });

  return true;
};
