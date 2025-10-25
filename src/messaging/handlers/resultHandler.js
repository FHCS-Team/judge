const logger = require("../../utils/logger");

function registerResultHandler(queue) {
  if (!queue || typeof queue.registerHandler !== "function") {
    throw new Error("queue must support registerHandler");
  }

  queue.registerHandler("result.evaluation.completed", async (msg, { ack }) => {
    // For now just log the result; in a complete system this would persist or notify subscribers
    logger.info("Result received", {
      submission_id: msg.payload.submission_id,
      status: msg.payload.status,
    });
    ack();
  });
}

module.exports = { registerResultHandler };
