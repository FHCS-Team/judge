const logger = require("#utils/logger.js");
const queue = require("..");

async function publishResult(result) {
  // TODO: Validate
  const payload = result;

  try {
    await queue.publish("result", payload);
    logger.debug("Published result event");
    logger.debug(payload);
  } catch (err) {
    logger.warn(
      "Failed to publish result event",
      err && err.message ? err.message : err,
    );
  }
}

module.exports = publishResult;
