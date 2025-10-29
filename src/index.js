const logger = require("./utils/logger");

logger.info("FHCS - JUDGE started!");

/**
 * Start the main JUDGE process. This function is intentionally light-weight
 * so `src/processor.js` can remain a pure module. Callers can require this
 * module and invoke `start()` to begin the main flow. Options may include
 * { demo: true } to run the demo pipeline or { useInMemoryQueue: true } to
 * start with an in-memory queue (useful for local development).
 */
async function start(options = {}) {
  logger.info({ options }, "starting main flow");

  if (options.demo) {
    // require demo lazily so importing `src/index.js` doesn't pull demo code
    try {
      const demo = require("../demo/run-demo-processor");
      await demo.runDemo();
    } catch (err) {
      logger.error({ err }, "failed to run demo from start()");
      throw err;
    }
  }

  // Start message consumers / queue depending on configuration.
  // Prefer RabbitMQ in production, but allow an in-memory queue for dev/tests.
  const useInMemory =
    options.useInMemoryQueue || process.env.USE_INMEMORY_QUEUE === "1";

  if (useInMemory) {
    // Lightweight in-memory queue for local development
    const { InMemoryQueue } = require("./queue");
    const {
      registerSubmissionHandler,
    } = require("./messaging/handlers/submissionHandler");
    const {
      registerResultHandler,
    } = require("./messaging/handlers/resultHandler");

    const queue = new InMemoryQueue();
    registerSubmissionHandler(queue);
    registerResultHandler(queue);
    queue.start();
    logger.info(
      { queued: queue.stats() },
      "In-memory message consumers started",
    );
    return { queue };
  }

  // Default: start RabbitMQ-backed consumers
  try {
    const { startConsumers } = require("./messaging/consumer");
    const queue = await startConsumers({
      rabbitUrl: process.env.RABBITMQ_URL,
      queueName: process.env.JUDGE_QUEUE_NAME,
      prefetch: process.env.JUDGE_CONSUMER_PREFETCH,
    });
    return { queue };
  } catch (err) {
    logger.error({ err }, "Failed to start RabbitMQ consumers");
    throw err;
  }
}

module.exports = {
  start,
};

// If invoked directly (node src/index.js), start the worker using sensible
// defaults for local development. This keeps the process alive until a
// termination signal is received so `npm run dev` doesn't exit immediately.
if (require.main === module) {
  (async () => {
    try {
      const useInMemory =
        process.env.USE_INMEMORY_QUEUE === "1" ||
        process.env.NODE_ENV === "development";
      const { queue } = await start({ useInMemoryQueue: useInMemory });

      // Wait for termination signals and close the queue gracefully
      const shutdown = async (signal) => {
        try {
          logger.info({ signal }, "Shutdown requested, closing queue");
          if (queue && typeof queue.close === "function") {
            await queue.close(5000);
          }
          logger.info("Shutdown complete");
          process.exit(0);
        } catch (err) {
          logger.error({ err }, "Error during shutdown");
          process.exit(1);
        }
      };

      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));

      // keep process alive
      /* eslint-disable no-empty */
      await new Promise(() => {});
    } catch (err) {
      logger.error({ err }, "Failed to start JUDGE process");
      process.exit(1);
    }
  })();
}
