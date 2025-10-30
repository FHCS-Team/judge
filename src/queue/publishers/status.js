/**
 * Heartbeat publisher.
 */
const logger = require("#utils/logger.js");
const queue = require("..");

async function publishStatus(when = new Date()) {
  // TODO: Update & add fields
  const payload = {
    type: "status",
    service: "judgehost",
    status: "online",
    timestamp: when.toISOString
      ? when.toISOString()
      : new Date(when).toISOString(),
  };

  try {
    // await queue.publish("status", payload);
    // logger.debug("Published status event");
    // logger.debug(payload);
    // do nothing for now
  } catch (err) {
    logger.warn(
      "Failed to publish status event",
      err && err.message ? err.message : err,
    );
  }
}

module.exports = publishStatus;
