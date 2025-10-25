const logger = require("../../utils/logger");

/**
 * Register submission handler on a queue instance.
 * The handler simulates evaluation work and publishes a result message back to the same queue.
 * @param {InMemoryQueue} queue
 */
function registerSubmissionHandler(queue) {
  if (!queue || typeof queue.registerHandler !== "function") {
    throw new Error("queue must support registerHandler");
  }

  queue.registerHandler("submission", async (msg, { ack, nack }) => {
    logger.info("Received submission", {
      id: msg.payload && msg.payload.submission_id,
    });
    try {
      // Simulate async evaluation (short sleep)
      await new Promise((r) => setTimeout(r, 50));

      // Create a result event payload (basic)
      const metadata = {};
      metadata.execution_time_seconds = 0.05;
      const memPeak = msg.payload.resources && msg.payload.resources.memory_mb;
      if (typeof memPeak === "number") metadata.memory_peak_mb = memPeak;

      const payload = {
        submission_id: msg.payload.submission_id || "unknown",
        problem_id: msg.payload.problem_id || "unknown",
        status: "completed",
        evaluated_at: new Date().toISOString(),
        execution_status: "success",
        timed_out: false,
        total_score: 100,
        max_score: 100,
        percentage: 100,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      };

      // Enqueue result event back onto the queue (mark as internal so it can be enqueued during shutdown)
      queue.enqueue({
        type: "result.evaluation.completed",
        payload,
        max_retries: 0,
        _internal: true,
      });

      ack();
    } catch (err) {
      // log error with structured logger (include stack when available)
      logger.error("Submission handler error (caught)", {
        message: err && err.message,
        stack: err && err.stack,
      });
      nack(err);
    }
  });
}

module.exports = { registerSubmissionHandler };
