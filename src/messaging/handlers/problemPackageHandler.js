const logger = require("../../utils/logger");
const { JudgeProcessor } = require("../../processor");

/**
 * Register problem package handler on a queue instance.
 * The handler processes problem package submissions and builds the necessary Docker images.
 * @param {InMemoryQueue} queue
 */
function registerProblemPackageHandler(queue) {
  if (!queue || typeof queue.registerHandler !== "function") {
    throw new Error("queue must support registerHandler");
  }

  // Reuse a single processor instance for the handler to avoid repeated initialization
  const processor = new JudgeProcessor();

  queue.registerHandler("problem_package", async (msg, { ack, nack }) => {
    logger.info("Received problem package", {
      problem_id: msg.payload && msg.payload.problem_id,
      archive_url: !!(msg.payload && msg.payload.archive_url),
      archive_data: !!(msg.payload && msg.payload.archive_data),
    });

    try {
      // processor is reused from module scope

      // Extract problem package data from message payload
      const packageData = {
        problem_id: msg.payload.problem_id,
        archive_url: msg.payload.archive_url,
        archive_data: msg.payload.archive_data,
      };

      if (!packageData.problem_id) {
        throw new Error("problem_id is required in message payload");
      }

      // Step 1 & 2: Submit and validate problem package
      const submitResult = await processor.submitProblemPackage(packageData);
      logger.info(
        { problem_id: packageData.problem_id },
        "Problem package submitted and validated",
      );

      // Step 3: Build problem images
      const buildResults = await processor.buildProblemImages(
        packageData.problem_id,
      );
      logger.info(
        { problem_id: packageData.problem_id, buildResults },
        "Problem images built",
      );

      // Send success notification
      const resultPayload = {
        problem_id: packageData.problem_id,
        status: "ready",
        processed_at: new Date().toISOString(),
        build_results: buildResults,
        problem_dir: submitResult.problemDir,
      };

      queue.enqueue({
        type: "problem_package.processed",
        payload: resultPayload,
        max_retries: 0,
        _internal: true,
      });

      ack();
    } catch (err) {
      // Log error with structured logger
      logger.error("Problem package handler error (caught)", {
        problem_id: msg.payload && msg.payload.problem_id,
        message: err && err.message,
        stack: err && err.stack,
      });

      // Send error notification
      const errorPayload = {
        problem_id: (msg.payload && msg.payload.problem_id) || "unknown",
        status: "failed",
        processed_at: new Date().toISOString(),
        error: err.message,
      };

      queue.enqueue({
        type: "problem_package.failed",
        payload: errorPayload,
        max_retries: 0,
        _internal: true,
      });

      nack(err);
    }
  });
}

module.exports = { registerProblemPackageHandler };
